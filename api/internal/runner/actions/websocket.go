package actions

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/gorilla/websocket"
	"go.uber.org/zap"
)

// WebSocketHandler handles WebSocket connections in test flows
type WebSocketHandler struct {
	logger *zap.Logger
}

// NewWebSocketHandler creates a new WebSocket handler
func NewWebSocketHandler(logger *zap.Logger) *WebSocketHandler {
	return &WebSocketHandler{logger: logger}
}

// WebSocketConfig represents WebSocket action configuration
type WebSocketConfig struct {
	URL             string            `json:"url" yaml:"url"`
	Headers         map[string]string `json:"headers,omitempty" yaml:"headers,omitempty"`
	Action          string            `json:"action" yaml:"action"` // "connect", "send", "receive", "close"
	Message         interface{}       `json:"message,omitempty" yaml:"message,omitempty"`
	MessageType     string            `json:"message_type,omitempty" yaml:"message_type,omitempty"` // "text", "binary"
	Timeout         string            `json:"timeout,omitempty" yaml:"timeout,omitempty"`
	ExpectedMessage interface{}       `json:"expected,omitempty" yaml:"expected,omitempty"`
	ConnectionID    string            `json:"connection_id,omitempty" yaml:"connection_id,omitempty"` // For reusing connections
}

// WebSocketResult represents the result of a WebSocket action
type WebSocketResult struct {
	Connected       bool                   `json:"connected"`
	ReceivedMessage interface{}            `json:"received_message,omitempty"`
	MessageType     int                    `json:"message_type,omitempty"`
	Error           string                 `json:"error,omitempty"`
	Latency         int64                  `json:"latency_ms"`
	Metadata        map[string]interface{} `json:"metadata,omitempty"`
}

// Active WebSocket connections (keyed by connection ID)
var activeConnections = make(map[string]*websocket.Conn)

// Execute runs the WebSocket action (implements Handler interface)
func (h *WebSocketHandler) Execute(ctx context.Context, rawConfig map[string]interface{}) (models.OutputData, error) {
	// Parse config from map
	config, err := h.parseConfig(rawConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to parse WebSocket config: %w", err)
	}

	result := &WebSocketResult{
		Metadata: make(map[string]interface{}),
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

	switch config.Action {
	case "connect":
		err := h.connect(ctx, config, result)
		if err != nil {
			return h.resultToOutputData(result), err
		}

	case "send":
		err := h.send(ctx, config, result)
		if err != nil {
			return h.resultToOutputData(result), err
		}

	case "receive":
		err := h.receive(ctx, config, result)
		if err != nil {
			return h.resultToOutputData(result), err
		}

	case "close":
		err := h.close(config, result)
		if err != nil {
			return h.resultToOutputData(result), err
		}

	default:
		return nil, fmt.Errorf("unknown WebSocket action: %s", config.Action)
	}

	result.Latency = time.Since(startTime).Milliseconds()
	return h.resultToOutputData(result), nil
}

// parseConfig converts map to WebSocketConfig
func (h *WebSocketHandler) parseConfig(rawConfig map[string]interface{}) (*WebSocketConfig, error) {
	configBytes, err := json.Marshal(rawConfig)
	if err != nil {
		return nil, err
	}

	var config WebSocketConfig
	if err := json.Unmarshal(configBytes, &config); err != nil {
		return nil, err
	}

	return &config, nil
}

// resultToOutputData converts WebSocketResult to OutputData
func (h *WebSocketHandler) resultToOutputData(result *WebSocketResult) models.OutputData {
	output := models.OutputData{
		"connected":  result.Connected,
		"latency_ms": result.Latency,
	}

	if result.ReceivedMessage != nil {
		output["received_message"] = result.ReceivedMessage
	}
	if result.MessageType != 0 {
		output["message_type"] = result.MessageType
	}
	if result.Error != "" {
		output["error"] = result.Error
	}
	if len(result.Metadata) > 0 {
		output["metadata"] = result.Metadata
	}

	return output
}

// connect establishes a WebSocket connection
func (h *WebSocketHandler) connect(ctx context.Context, config *WebSocketConfig, result *WebSocketResult) error {
	// Build request headers
	header := http.Header{}
	for k, v := range config.Headers {
		header.Set(k, v)
	}

	// Connect
	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}

	conn, resp, err := dialer.DialContext(ctx, config.URL, header)
	if err != nil {
		result.Error = err.Error()
		return fmt.Errorf("failed to connect: %w", err)
	}

	result.Connected = true
	result.Metadata["status_code"] = resp.StatusCode
	result.Metadata["protocol"] = resp.Header.Get("Sec-WebSocket-Protocol")

	// Store connection for reuse
	connID := config.ConnectionID
	if connID == "" {
		connID = fmt.Sprintf("ws_%d", time.Now().UnixNano())
	}
	activeConnections[connID] = conn
	result.Metadata["connection_id"] = connID

	h.logger.Info("WebSocket connected",
		zap.String("url", config.URL),
		zap.String("connection_id", connID))

	return nil
}

// send sends a message over an existing connection
func (h *WebSocketHandler) send(ctx context.Context, config *WebSocketConfig, result *WebSocketResult) error {
	conn := activeConnections[config.ConnectionID]
	if conn == nil {
		return fmt.Errorf("no active connection with ID: %s", config.ConnectionID)
	}

	// Determine message type
	msgType := websocket.TextMessage
	if config.MessageType == "binary" {
		msgType = websocket.BinaryMessage
	}

	// Marshal message
	var msgBytes []byte
	switch m := config.Message.(type) {
	case string:
		msgBytes = []byte(m)
	case []byte:
		msgBytes = m
	default:
		var err error
		msgBytes, err = json.Marshal(m)
		if err != nil {
			return fmt.Errorf("failed to marshal message: %w", err)
		}
	}

	// Send
	if err := conn.WriteMessage(msgType, msgBytes); err != nil {
		result.Error = err.Error()
		return fmt.Errorf("failed to send message: %w", err)
	}

	result.Metadata["bytes_sent"] = len(msgBytes)
	h.logger.Debug("WebSocket message sent",
		zap.String("connection_id", config.ConnectionID),
		zap.Int("bytes", len(msgBytes)))

	return nil
}

// receive waits for and receives a message
func (h *WebSocketHandler) receive(ctx context.Context, config *WebSocketConfig, result *WebSocketResult) error {
	conn := activeConnections[config.ConnectionID]
	if conn == nil {
		return fmt.Errorf("no active connection with ID: %s", config.ConnectionID)
	}

	// Set deadline based on context
	deadline, ok := ctx.Deadline()
	if ok {
		conn.SetReadDeadline(deadline)
	}

	// Read message
	msgType, msg, err := conn.ReadMessage()
	if err != nil {
		result.Error = err.Error()
		return fmt.Errorf("failed to receive message: %w", err)
	}

	result.MessageType = msgType
	result.Metadata["bytes_received"] = len(msg)

	// Parse message based on type
	if msgType == websocket.TextMessage {
		// Try to parse as JSON
		var jsonMsg interface{}
		if err := json.Unmarshal(msg, &jsonMsg); err == nil {
			result.ReceivedMessage = jsonMsg
		} else {
			result.ReceivedMessage = string(msg)
		}
	} else {
		result.ReceivedMessage = msg
	}

	h.logger.Debug("WebSocket message received",
		zap.String("connection_id", config.ConnectionID),
		zap.Int("bytes", len(msg)))

	return nil
}

// close closes a WebSocket connection
func (h *WebSocketHandler) close(config *WebSocketConfig, result *WebSocketResult) error {
	conn := activeConnections[config.ConnectionID]
	if conn == nil {
		return nil // Already closed or never opened
	}

	// Send close message
	err := conn.WriteMessage(
		websocket.CloseMessage,
		websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""),
	)
	if err != nil {
		h.logger.Warn("Failed to send close message", zap.Error(err))
	}

	// Close the connection
	if err := conn.Close(); err != nil {
		result.Error = err.Error()
		return fmt.Errorf("failed to close connection: %w", err)
	}

	delete(activeConnections, config.ConnectionID)
	result.Metadata["closed"] = true

	h.logger.Info("WebSocket connection closed",
		zap.String("connection_id", config.ConnectionID))

	return nil
}

// Name returns the handler name
func (h *WebSocketHandler) Name() string {
	return "websocket"
}
