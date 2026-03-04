package actions

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// HTTPHandler handles HTTP request actions
type HTTPHandler struct {
	client *http.Client
	logger *zap.Logger
}

// NewHTTPHandler creates a new HTTP action handler
func NewHTTPHandler(logger *zap.Logger) *HTTPHandler {
	return &HTTPHandler{
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
		logger: logger,
	}
}

// Execute executes an HTTP request action
func (h *HTTPHandler) Execute(ctx context.Context, config map[string]interface{}) (models.OutputData, error) {
	// Extract configuration
	method, ok := config["method"].(string)
	if !ok {
		return nil, fmt.Errorf("method is required")
	}

	url, ok := config["url"].(string)
	if !ok {
		return nil, fmt.Errorf("url is required")
	}

	// Prepare request body
	var bodyReader io.Reader
	if body, exists := config["body"]; exists {
		bodyBytes, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal body: %w", err)
		}
		bodyReader = bytes.NewReader(bodyBytes)
	}

	// Create HTTP request
	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	if headers, ok := config["headers"].(map[string]interface{}); ok {
		for key, value := range headers {
			req.Header.Set(key, fmt.Sprintf("%v", value))
		}
	}

	// Set default Content-Type if body exists
	if bodyReader != nil && req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json")
	}

	// Execute request
	h.logger.Info("Executing HTTP request",
		zap.String("method", method),
		zap.String("url", url),
	)

	start := time.Now()
	resp, err := h.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	duration := time.Since(start)

	// Read response body
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Parse response body as JSON if possible
	var parsedBody interface{}
	if err := json.Unmarshal(respBody, &parsedBody); err != nil {
		// If not JSON, store as string
		parsedBody = string(respBody)
	}

	// Build output
	output := models.OutputData{
		"status":       resp.StatusCode,
		"body":         parsedBody,
		"headers":      resp.Header,
		"duration_ms":  duration.Milliseconds(),
		"content_type": resp.Header.Get("Content-Type"),
	}

	h.logger.Info("HTTP request completed",
		zap.String("method", method),
		zap.String("url", url),
		zap.Int("status", resp.StatusCode),
		zap.Int64("duration_ms", duration.Milliseconds()),
	)

	return output, nil
}
