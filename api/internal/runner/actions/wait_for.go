package actions

import (
	"context"
	"fmt"

	"github.com/georgi-georgiev/testmesh/internal/runner/actions/async"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// WaitForHandler handles the wait_for action type.
type WaitForHandler struct {
	logger *zap.Logger
}

// NewWaitForHandler creates a new WaitForHandler.
func NewWaitForHandler(logger *zap.Logger) *WaitForHandler {
	return &WaitForHandler{logger: logger}
}

// Execute polls until a condition is satisfied or timeout is reached.
func (h *WaitForHandler) Execute(ctx context.Context, config map[string]interface{}) (models.OutputData, error) {
	cfg := &async.WaitForConfig{}

	if v, ok := config["type"].(string); ok {
		cfg.Type = v
	} else {
		return nil, fmt.Errorf("type is required (http, tcp)")
	}

	if v, ok := config["timeout"].(string); ok {
		cfg.Timeout = v
	}
	if v, ok := config["interval"].(string); ok {
		cfg.Interval = v
	}
	if v, ok := config["max_attempts"]; ok {
		switch n := v.(type) {
		case int:
			cfg.MaxAttempts = n
		case float64:
			cfg.MaxAttempts = int(n)
		}
	}

	// HTTP-specific
	if v, ok := config["url"].(string); ok {
		cfg.URL = v
	}
	if v, ok := config["method"].(string); ok {
		cfg.Method = v
	}
	if v, ok := config["status_code"]; ok {
		switch n := v.(type) {
		case int:
			cfg.StatusCode = n
		case float64:
			cfg.StatusCode = int(n)
		}
	}
	if v, ok := config["body_contains"].(string); ok {
		cfg.BodyContains = v
	}
	if v, ok := config["json_path"].(string); ok {
		cfg.JSONPath = v
	}
	if v, ok := config["json_value"]; ok {
		cfg.JSONValue = v
	}
	if v, ok := config["headers"]; ok {
		if m, ok := v.(map[string]interface{}); ok {
			cfg.Headers = make(map[string]string, len(m))
			for k, val := range m {
				cfg.Headers[k] = fmt.Sprintf("%v", val)
			}
		}
	}

	// TCP-specific
	if v, ok := config["host"].(string); ok {
		cfg.Host = v
	}
	if v, ok := config["port"]; ok {
		switch n := v.(type) {
		case int:
			cfg.Port = n
		case float64:
			cfg.Port = int(n)
		}
	}

	h.logger.Info("Starting wait_for",
		zap.String("type", cfg.Type),
		zap.String("timeout", cfg.Timeout),
		zap.String("interval", cfg.Interval),
	)

	wf := async.NewWaitFor(cfg)
	result, err := wf.Wait(ctx)
	if err != nil {
		return nil, err
	}

	if !result.Success {
		return nil, fmt.Errorf("wait_for failed after %d attempts: %s", result.Attempts, result.Error)
	}

	h.logger.Info("wait_for condition satisfied",
		zap.Int("attempts", result.Attempts),
		zap.Int64("duration_ms", result.Duration),
	)

	return models.OutputData{
		"success":     result.Success,
		"attempts":    result.Attempts,
		"duration_ms": result.Duration,
		"last_result": result.LastResult,
	}, nil
}
