package async

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// WaitForConfig defines configuration for generic wait operations
type WaitForConfig struct {
	Type        string            `yaml:"type" json:"type"` // "http", "tcp", "file", "condition"
	Timeout     string            `yaml:"timeout" json:"timeout"`
	Interval    string            `yaml:"interval" json:"interval"`
	MaxAttempts int               `yaml:"max_attempts" json:"max_attempts"`

	// HTTP-specific
	URL         string            `yaml:"url,omitempty" json:"url,omitempty"`
	Method      string            `yaml:"method,omitempty" json:"method,omitempty"`
	Headers     map[string]string `yaml:"headers,omitempty" json:"headers,omitempty"`
	StatusCode  int               `yaml:"status_code,omitempty" json:"status_code,omitempty"`
	BodyContains string           `yaml:"body_contains,omitempty" json:"body_contains,omitempty"`
	JSONPath    string            `yaml:"json_path,omitempty" json:"json_path,omitempty"`
	JSONValue   interface{}       `yaml:"json_value,omitempty" json:"json_value,omitempty"`

	// TCP-specific
	Host        string            `yaml:"host,omitempty" json:"host,omitempty"`
	Port        int               `yaml:"port,omitempty" json:"port,omitempty"`

	// Condition-specific
	Expression  string            `yaml:"expression,omitempty" json:"expression,omitempty"`
	Variables   map[string]interface{} `yaml:"variables,omitempty" json:"variables,omitempty"`
}

// WaitForResult holds the result of a wait operation
type WaitForResult struct {
	Success     bool                   `json:"success"`
	Attempts    int                    `json:"attempts"`
	Duration    int64                  `json:"duration_ms"`
	LastResult  map[string]interface{} `json:"last_result,omitempty"`
	Error       string                 `json:"error,omitempty"`
}

// WaitFor handles generic wait operations
type WaitFor struct {
	config *WaitForConfig
	client *http.Client
}

// NewWaitFor creates a new wait handler
func NewWaitFor(config *WaitForConfig) *WaitFor {
	return &WaitFor{
		config: config,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

// Wait waits for the condition to be met
func (w *WaitFor) Wait(ctx context.Context) (*WaitForResult, error) {
	start := time.Now()
	result := &WaitForResult{
		LastResult: make(map[string]interface{}),
	}

	// Parse timeout
	timeout := 60 * time.Second
	if w.config.Timeout != "" {
		if parsed, err := time.ParseDuration(w.config.Timeout); err == nil {
			timeout = parsed
		}
	}

	// Parse interval
	interval := 1 * time.Second
	if w.config.Interval != "" {
		if parsed, err := time.ParseDuration(w.config.Interval); err == nil {
			interval = parsed
		}
	}

	// Create context with timeout
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// Polling loop
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	maxAttempts := w.config.MaxAttempts
	if maxAttempts == 0 {
		maxAttempts = 100
	}

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		result.Attempts = attempt

		satisfied, lastResult, err := w.checkCondition(ctx)
		result.LastResult = lastResult

		if err == nil && satisfied {
			result.Success = true
			result.Duration = time.Since(start).Milliseconds()
			return result, nil
		}

		// Wait for next attempt or timeout
		select {
		case <-ctx.Done():
			result.Duration = time.Since(start).Milliseconds()
			if err != nil {
				result.Error = err.Error()
			} else {
				result.Error = "timeout waiting for condition"
			}
			return result, nil
		case <-ticker.C:
			// Continue to next attempt
		}
	}

	result.Duration = time.Since(start).Milliseconds()
	result.Error = "max attempts reached"
	return result, nil
}

func (w *WaitFor) checkCondition(ctx context.Context) (bool, map[string]interface{}, error) {
	switch w.config.Type {
	case "http":
		return w.checkHTTP(ctx)
	case "tcp":
		return w.checkTCP(ctx)
	default:
		return false, nil, fmt.Errorf("unsupported wait type: %s", w.config.Type)
	}
}

func (w *WaitFor) checkHTTP(ctx context.Context) (bool, map[string]interface{}, error) {
	result := make(map[string]interface{})

	method := w.config.Method
	if method == "" {
		method = "GET"
	}

	req, err := http.NewRequestWithContext(ctx, method, w.config.URL, nil)
	if err != nil {
		return false, result, err
	}

	for key, value := range w.config.Headers {
		req.Header.Set(key, value)
	}

	resp, err := w.client.Do(req)
	if err != nil {
		result["error"] = err.Error()
		return false, result, err
	}
	defer resp.Body.Close()

	result["status_code"] = resp.StatusCode

	body, _ := io.ReadAll(resp.Body)
	result["body"] = string(body)

	// Check status code
	expectedStatus := w.config.StatusCode
	if expectedStatus == 0 {
		expectedStatus = 200
	}
	if resp.StatusCode != expectedStatus {
		return false, result, nil
	}

	// Check body contains
	if w.config.BodyContains != "" {
		if !strings.Contains(string(body), w.config.BodyContains) {
			return false, result, nil
		}
	}

	// Check JSON path
	if w.config.JSONPath != "" && w.config.JSONValue != nil {
		var jsonBody interface{}
		if err := json.Unmarshal(body, &jsonBody); err != nil {
			return false, result, nil
		}

		value := extractJSONPath(jsonBody, w.config.JSONPath)
		result["json_value"] = value

		if fmt.Sprintf("%v", value) != fmt.Sprintf("%v", w.config.JSONValue) {
			return false, result, nil
		}
	}

	return true, result, nil
}

func (w *WaitFor) checkTCP(ctx context.Context) (bool, map[string]interface{}, error) {
	result := make(map[string]interface{})

	address := fmt.Sprintf("%s:%d", w.config.Host, w.config.Port)
	result["address"] = address

	conn, err := (&net.Dialer{Timeout: 5 * time.Second}).DialContext(ctx, "tcp", address)
	if err != nil {
		result["error"] = err.Error()
		return false, result, nil
	}
	conn.Close()

	result["connected"] = true
	return true, result, nil
}

// extractJSONPath extracts a value from JSON using a simple path notation
func extractJSONPath(data interface{}, path string) interface{} {
	parts := strings.Split(path, ".")
	current := data

	for _, part := range parts {
		if part == "" {
			continue
		}

		switch v := current.(type) {
		case map[string]interface{}:
			current = v[part]
		case []interface{}:
			var index int
			if _, err := fmt.Sscanf(part, "%d", &index); err == nil && index < len(v) {
				current = v[index]
			} else {
				return nil
			}
		default:
			return nil
		}
	}

	return current
}

// WaitForHTTPReady waits for an HTTP endpoint to become ready
func WaitForHTTPReady(ctx context.Context, url string, timeout time.Duration) error {
	config := &WaitForConfig{
		Type:       "http",
		URL:        url,
		StatusCode: 200,
		Timeout:    timeout.String(),
		Interval:   "1s",
	}

	wf := NewWaitFor(config)
	result, err := wf.Wait(ctx)
	if err != nil {
		return err
	}
	if !result.Success {
		return fmt.Errorf("endpoint not ready: %s", result.Error)
	}
	return nil
}

// WaitForTCPReady waits for a TCP port to become available
func WaitForTCPReady(ctx context.Context, host string, port int, timeout time.Duration) error {
	config := &WaitForConfig{
		Type:    "tcp",
		Host:    host,
		Port:    port,
		Timeout: timeout.String(),
		Interval: "1s",
	}

	wf := NewWaitFor(config)
	result, err := wf.Wait(ctx)
	if err != nil {
		return err
	}
	if !result.Success {
		return fmt.Errorf("port not available: %s", result.Error)
	}
	return nil
}

// compile check
var _ = regexp.MustCompile
