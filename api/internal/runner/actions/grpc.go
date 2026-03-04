package actions

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/reflect/protoreflect"
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
	Address      string                 `json:"address" yaml:"address"`               // host:port
	Service      string                 `json:"service" yaml:"service"`               // service name
	Method       string                 `json:"method" yaml:"method"`                 // method name
	Request      map[string]interface{} `json:"request,omitempty" yaml:"request,omitempty"`
	Metadata     map[string]string      `json:"metadata,omitempty" yaml:"metadata,omitempty"` // gRPC metadata
	ProtoFile    string                 `json:"proto_file,omitempty" yaml:"proto_file,omitempty"` // Path to .proto file
	Timeout      string                 `json:"timeout,omitempty" yaml:"timeout,omitempty"`
	UseTLS       bool                   `json:"use_tls,omitempty" yaml:"use_tls,omitempty"`
	UseReflection bool                  `json:"use_reflection,omitempty" yaml:"use_reflection,omitempty"`
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

	// Add metadata to context
	if len(config.Metadata) > 0 {
		md := metadata.New(config.Metadata)
		ctx = metadata.NewOutgoingContext(ctx, md)
	}

	// Build full method path
	fullMethod := fmt.Sprintf("/%s/%s", config.Service, config.Method)

	// Marshal request
	requestJSON, err := json.Marshal(config.Request)
	if err != nil {
		result.StatusCode = "INVALID_ARGUMENT"
		result.ErrorMessage = err.Error()
		return h.resultToOutputData(result), err
	}

	// Use generic unary call with JSON
	// In a full implementation, we'd use reflection or proto descriptors
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
		// In a real implementation, would configure TLS credentials
		opts = append(opts, grpc.WithTransportCredentials(insecure.NewCredentials()))
	} else {
		opts = append(opts, grpc.WithTransportCredentials(insecure.NewCredentials()))
	}

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
