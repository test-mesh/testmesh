package actions

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/test-mesh/testmesh/internal/storage/models"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	grpc_reflection_v1alpha "google.golang.org/grpc/reflection/grpc_reflection_v1alpha"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/reflect/protoregistry"
	"google.golang.org/protobuf/types/descriptorpb"
	"google.golang.org/protobuf/types/dynamicpb"
)

// GRPCHandler handles gRPC calls in test flows
type GRPCHandler struct {
	logger *zap.Logger
	// Cache for connections
	connections map[string]*grpc.ClientConn
}

// NewGRPCHandler creates a new gRPC handler
func NewGRPCHandler(logger *zap.Logger) *GRPCHandler {
	return &GRPCHandler{
		logger:      logger,
		connections: make(map[string]*grpc.ClientConn),
	}
}

// GRPCConfig represents gRPC action configuration
type GRPCConfig struct {
	Address       string                 `json:"address" yaml:"address"`                             // host:port
	Service       string                 `json:"service" yaml:"service"`                             // service name
	Method        string                 `json:"method" yaml:"method"`                               // method name
	Request       map[string]interface{} `json:"request,omitempty" yaml:"request,omitempty"`
	Metadata      map[string]string      `json:"metadata,omitempty" yaml:"metadata,omitempty"`       // gRPC metadata
	ProtoFile     string                 `json:"proto_file,omitempty" yaml:"proto_file,omitempty"`   // Path to .proto file
	Timeout       string                 `json:"timeout,omitempty" yaml:"timeout,omitempty"`
	UseTLS        bool                   `json:"use_tls,omitempty" yaml:"use_tls,omitempty"`
	UseReflection bool                   `json:"use_reflection,omitempty" yaml:"use_reflection,omitempty"`
	Streaming     bool                   `json:"streaming,omitempty" yaml:"streaming,omitempty"`     // true for grpc_stream
}

// GRPCResult represents the result of a gRPC call
type GRPCResult struct {
	Response     map[string]interface{} `json:"response,omitempty"`
	StatusCode   string                 `json:"status_code"`
	ErrorMessage string                 `json:"error_message,omitempty"`
	Latency      int64                  `json:"latency_ms"`
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
}

// Execute runs the gRPC action (implements Handler interface)
func (h *GRPCHandler) Execute(ctx context.Context, rawConfig map[string]interface{}) (models.OutputData, error) {
	// Parse config from map
	config, err := h.parseConfig(rawConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to parse gRPC config: %w", err)
	}

	result := &GRPCResult{
		StatusCode: "OK",
		Metadata:   make(map[string]interface{}),
	}

	startTime := time.Now()

	// Parse timeout
	timeout := 30 * time.Second
	if config.Timeout != "" {
		if d, err := time.ParseDuration(config.Timeout); err == nil {
			timeout = d
		}
	}

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// Get or create connection
	conn, err := h.getConnection(config.Address, config.UseTLS)
	if err != nil {
		result.StatusCode = "UNAVAILABLE"
		result.ErrorMessage = err.Error()
		return h.resultToOutputData(result), err
	}

	// Inject trace context into gRPC metadata for distributed tracing
	traceHeaders := make(map[string]string)
	otel.GetTextMapPropagator().Inject(ctx, propagation.MapCarrier(traceHeaders))

	// Add metadata to context (merge trace headers with user-provided metadata)
	md := metadata.New(config.Metadata)
	for k, v := range traceHeaders {
		md.Set(k, v)
	}
	ctx = metadata.NewOutgoingContext(ctx, md)

	// Build full method path
	fullMethod := fmt.Sprintf("/%s/%s", config.Service, config.Method)

	// Marshal request
	requestJSON, err := json.Marshal(config.Request)
	if err != nil {
		result.StatusCode = "INVALID_ARGUMENT"
		result.ErrorMessage = err.Error()
		return h.resultToOutputData(result), err
	}

	if config.Streaming {
		// Streaming call: collect all server-sent messages into a slice
		var messages []map[string]interface{}
		collectMsg := func(msgJSON []byte) {
			var msg map[string]interface{}
			if err := json.Unmarshal(msgJSON, &msg); err == nil {
				messages = append(messages, msg)
			} else {
				messages = append(messages, map[string]interface{}{"raw": string(msgJSON)})
			}
		}

		err = h.invokeServerStream(ctx, conn, fullMethod, requestJSON, collectMsg)
		if err != nil {
			result.StatusCode = "INTERNAL"
			result.ErrorMessage = err.Error()
			return h.resultToOutputData(result), err
		}

		if len(messages) > 0 {
			result.Response = map[string]interface{}{"messages": messages}
		}
	} else {
		if config.UseReflection {
			response, err := h.invokeUnaryWithReflection(ctx, conn, config)
			if err != nil {
				result.StatusCode = "INTERNAL"
				result.ErrorMessage = err.Error()
				return h.resultToOutputData(result), err
			}
			result.Response = response
		} else {
			// Use generic unary call with JSON
			var responseJSON []byte
			err = h.invokeUnary(ctx, conn, fullMethod, requestJSON, &responseJSON)
			if err != nil {
				result.StatusCode = "INTERNAL"
				result.ErrorMessage = err.Error()
				return h.resultToOutputData(result), err
			}

			// Parse response
			if len(responseJSON) > 0 {
				var response map[string]interface{}
				if err := json.Unmarshal(responseJSON, &response); err != nil {
					result.Response = map[string]interface{}{"raw": string(responseJSON)}
				} else {
					result.Response = response
				}
			}
		}
	}

	result.Latency = time.Since(startTime).Milliseconds()

	h.logger.Info("gRPC call completed",
		zap.String("address", config.Address),
		zap.String("method", fullMethod),
		zap.Int64("latency_ms", result.Latency))

	return h.resultToOutputData(result), nil
}

// parseConfig converts map to GRPCConfig
func (h *GRPCHandler) parseConfig(rawConfig map[string]interface{}) (*GRPCConfig, error) {
	configBytes, err := json.Marshal(rawConfig)
	if err != nil {
		return nil, err
	}

	var config GRPCConfig
	if err := json.Unmarshal(configBytes, &config); err != nil {
		return nil, err
	}

	return &config, nil
}

// resultToOutputData converts GRPCResult to OutputData
func (h *GRPCHandler) resultToOutputData(result *GRPCResult) models.OutputData {
	output := models.OutputData{
		"status_code": result.StatusCode,
		"latency_ms":  result.Latency,
	}

	if result.Response != nil {
		output["response"] = result.Response
		output["body"] = result.Response
	}
	if result.ErrorMessage != "" {
		output["error_message"] = result.ErrorMessage
	}
	if len(result.Metadata) > 0 {
		output["metadata"] = result.Metadata
	}

	return output
}

// getConnection gets or creates a gRPC connection
func (h *GRPCHandler) getConnection(address string, useTLS bool) (*grpc.ClientConn, error) {
	if conn, ok := h.connections[address]; ok {
		return conn, nil
	}

	opts := []grpc.DialOption{
		grpc.WithDefaultCallOptions(grpc.MaxCallRecvMsgSize(16 * 1024 * 1024)),
	}

	if useTLS {
		return nil, fmt.Errorf("grpc: TLS not yet implemented; set use_tls to false or contribute a TLS implementation")
	}
	opts = append(opts, grpc.WithTransportCredentials(insecure.NewCredentials()))

	conn, err := grpc.Dial(address, opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to %s: %w", address, err)
	}

	h.connections[address] = conn
	return conn, nil
}

// invokeUnary performs a unary gRPC call
// This is a simplified implementation - a full one would use proto reflection
func (h *GRPCHandler) invokeUnary(ctx context.Context, conn *grpc.ClientConn, method string, request []byte, response *[]byte) error {
	// Create a generic codec that handles JSON
	codec := &jsonCodec{}

	// Make the call
	err := conn.Invoke(ctx, method, request, response, grpc.ForceCodec(codec))
	if err != nil {
		return err
	}

	return nil
}

// invokeUnaryWithReflection performs a unary gRPC call using server reflection to fetch the
// protobuf descriptor and encode the request/response with proper protobuf encoding.
func (h *GRPCHandler) invokeUnaryWithReflection(ctx context.Context, conn *grpc.ClientConn, config *GRPCConfig) (map[string]interface{}, error) {
	// 1. Fetch method descriptor via server reflection
	methodDesc, err := h.fetchMethodDescriptor(ctx, conn, config.Service, config.Method)
	if err != nil {
		return nil, fmt.Errorf("reflection: %w", err)
	}

	// 2. Build dynamic request message from JSON config
	reqMsg := dynamicpb.NewMessage(methodDesc.Input())
	reqJSON, err := json.Marshal(config.Request)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}
	if err := protojson.Unmarshal(reqJSON, reqMsg); err != nil {
		return nil, fmt.Errorf("unmarshal request into proto: %w", err)
	}

	// 3. Create dynamic response message
	respMsg := dynamicpb.NewMessage(methodDesc.Output())

	// 4. Make the actual gRPC call (no ForceCodec — standard protobuf)
	fullMethod := fmt.Sprintf("/%s/%s", config.Service, config.Method)
	if err := conn.Invoke(ctx, fullMethod, reqMsg, respMsg); err != nil {
		return nil, err
	}

	// 5. Marshal response to JSON map
	// UseProtoNames: keep snake_case field names matching the .proto definition
	// EmitUnpopulated: include empty/zero fields (e.g. empty repeated) so assertions like body.field != nil work
	respJSON, err := protojson.MarshalOptions{UseProtoNames: true, EmitUnpopulated: true}.Marshal(respMsg)
	if err != nil {
		return nil, fmt.Errorf("marshal response: %w", err)
	}
	var result map[string]interface{}
	if err := json.Unmarshal(respJSON, &result); err != nil {
		return nil, fmt.Errorf("unmarshal response JSON: %w", err)
	}
	return result, nil
}

// fetchMethodDescriptor uses the gRPC Server Reflection protocol to retrieve the
// MethodDescriptor for the given service and method names.
func (h *GRPCHandler) fetchMethodDescriptor(ctx context.Context, conn *grpc.ClientConn, serviceName, methodName string) (protoreflect.MethodDescriptor, error) {
	rc := grpc_reflection_v1alpha.NewServerReflectionClient(conn)
	stream, err := rc.ServerReflectionInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("open reflection stream: %w", err)
	}
	defer stream.CloseSend()

	// Request the file descriptor containing this service
	if err := stream.Send(&grpc_reflection_v1alpha.ServerReflectionRequest{
		MessageRequest: &grpc_reflection_v1alpha.ServerReflectionRequest_FileContainingSymbol{
			FileContainingSymbol: serviceName,
		},
	}); err != nil {
		return nil, fmt.Errorf("reflection send: %w", err)
	}

	resp, err := stream.Recv()
	if err != nil {
		return nil, fmt.Errorf("reflection recv: %w", err)
	}

	fdResp, ok := resp.MessageResponse.(*grpc_reflection_v1alpha.ServerReflectionResponse_FileDescriptorResponse)
	if !ok {
		if errResp, ok2 := resp.MessageResponse.(*grpc_reflection_v1alpha.ServerReflectionResponse_ErrorResponse); ok2 {
			return nil, fmt.Errorf("reflection error: %s", errResp.ErrorResponse.ErrorMessage)
		}
		return nil, fmt.Errorf("unexpected reflection response type: %T", resp.MessageResponse)
	}

	// Parse file descriptors and register them (multi-pass for dependency ordering)
	var fdProtos []*descriptorpb.FileDescriptorProto
	for _, fdBytes := range fdResp.FileDescriptorResponse.FileDescriptorProto {
		fdp := &descriptorpb.FileDescriptorProto{}
		if err := proto.Unmarshal(fdBytes, fdp); err != nil {
			return nil, fmt.Errorf("unmarshal file descriptor: %w", err)
		}
		fdProtos = append(fdProtos, fdp)
	}

	files := &protoregistry.Files{}
	// Multiple passes to handle dependency ordering
	remaining := fdProtos
	for pass := len(fdProtos) + 1; pass > 0 && len(remaining) > 0; pass-- {
		var next []*descriptorpb.FileDescriptorProto
		for _, fdp := range remaining {
			fd, err := protodesc.NewFile(fdp, files)
			if err != nil {
				next = append(next, fdp)
				continue
			}
			if regErr := files.RegisterFile(fd); regErr != nil {
				// Ignore "already registered" — treat as success
				if !strings.Contains(regErr.Error(), "already registered") {
					next = append(next, fdp)
				}
			}
		}
		remaining = next
	}
	if len(remaining) > 0 {
		return nil, fmt.Errorf("failed to register %d file descriptor(s)", len(remaining))
	}

	// Look up the service descriptor
	desc, err := files.FindDescriptorByName(protoreflect.FullName(serviceName))
	if err != nil {
		return nil, fmt.Errorf("service %q not found: %w", serviceName, err)
	}
	svc, ok := desc.(protoreflect.ServiceDescriptor)
	if !ok {
		return nil, fmt.Errorf("%q is not a service descriptor", serviceName)
	}

	// Look up the method
	md := svc.Methods().ByName(protoreflect.Name(methodName))
	if md == nil {
		return nil, fmt.Errorf("method %q not found in service %q", methodName, serviceName)
	}
	return md, nil
}

// invokeServerStream performs a server-streaming gRPC call and calls cb for each received message.
func (h *GRPCHandler) invokeServerStream(ctx context.Context, conn *grpc.ClientConn, method string, request []byte, cb func([]byte)) error {
	codec := &jsonCodec{}
	desc := &grpc.StreamDesc{
		StreamName:    method,
		ServerStreams: true,
	}
	stream, err := conn.NewStream(ctx, desc, method, grpc.ForceCodec(codec))
	if err != nil {
		return fmt.Errorf("failed to open stream: %w", err)
	}

	// Send the single request message
	if err := stream.SendMsg(request); err != nil {
		return fmt.Errorf("failed to send stream request: %w", err)
	}
	if err := stream.CloseSend(); err != nil {
		return fmt.Errorf("failed to close send: %w", err)
	}

	// Receive all messages
	for {
		var msgJSON []byte
		err := stream.RecvMsg(&msgJSON)
		if err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			return fmt.Errorf("stream receive error: %w", err)
		}
		cb(msgJSON)
	}
	return nil
}

// Close closes all connections
func (h *GRPCHandler) Close() {
	for _, conn := range h.connections {
		conn.Close()
	}
	h.connections = make(map[string]*grpc.ClientConn)
}

// Name returns the handler name
func (h *GRPCHandler) Name() string {
	return "grpc"
}

// jsonCodec is a simple JSON codec for gRPC
type jsonCodec struct{}

func (c *jsonCodec) Marshal(v interface{}) ([]byte, error) {
	switch msg := v.(type) {
	case []byte:
		return msg, nil
	case protoreflect.ProtoMessage:
		return protojson.Marshal(msg)
	default:
		return json.Marshal(v)
	}
}

func (c *jsonCodec) Unmarshal(data []byte, v interface{}) error {
	switch msg := v.(type) {
	case *[]byte:
		*msg = data
		return nil
	case protoreflect.ProtoMessage:
		return protojson.Unmarshal(data, msg)
	case *dynamicpb.Message:
		return protojson.Unmarshal(data, msg)
	default:
		return json.Unmarshal(data, v)
	}
}

func (c *jsonCodec) Name() string {
	return "json"
}
