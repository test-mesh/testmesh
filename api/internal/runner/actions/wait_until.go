package actions

import (
	"context"
	"fmt"
	"time"

	"github.com/expr-lang/expr"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// WaitUntilHandler polls a condition expression until it is true or a timeout is reached.
type WaitUntilHandler struct {
	logger *zap.Logger
}

// NewWaitUntilHandler creates a new wait_until handler.
func NewWaitUntilHandler(logger *zap.Logger) *WaitUntilHandler {
	return &WaitUntilHandler{logger: logger}
}

// Execute waits until the condition evaluates to true or the timeout expires.
func (h *WaitUntilHandler) Execute(ctx context.Context, config map[string]interface{}) (models.OutputData, error) {
	// Required: condition expression
	conditionStr, ok := config["condition"].(string)
	if !ok || conditionStr == "" {
		return nil, fmt.Errorf("condition is required and must be a non-empty string")
	}

	// Optional: max_duration (default: 30s)
	maxDurationStr := "30s"
	if v, ok := config["max_duration"].(string); ok && v != "" {
		maxDurationStr = v
	}
	maxDuration, err := time.ParseDuration(maxDurationStr)
	if err != nil {
		return nil, fmt.Errorf("invalid max_duration %q: %w", maxDurationStr, err)
	}

	// Optional: interval (default: 1s)
	intervalStr := "1s"
	if v, ok := config["interval"].(string); ok && v != "" {
		intervalStr = v
	}
	interval, err := time.ParseDuration(intervalStr)
	if err != nil {
		return nil, fmt.Errorf("invalid interval %q: %w", intervalStr, err)
	}

	// Optional: on_timeout (default: "fail")
	onTimeout := "fail"
	if v, ok := config["on_timeout"].(string); ok && v != "" {
		onTimeout = v
	}

	// Build expression environment from any extra context vars passed in config
	env := make(map[string]interface{})
	for k, v := range config {
		// Skip handler-specific keys
		switch k {
		case "condition", "max_duration", "interval", "on_timeout", "_vars", "_context":
			continue
		}
		env[k] = v
	}
	// Merge explicit _context if provided
	if ctxVars, ok := config["_context"]; ok {
		if m, ok := ctxVars.(map[string]interface{}); ok {
			for k, v := range m {
				env[k] = v
			}
		}
	}
	// Merge string variables from _vars
	if varsRaw, ok := config["_vars"]; ok {
		if m, ok := varsRaw.(map[string]string); ok {
			for k, v := range m {
				if _, exists := env[k]; !exists {
					env[k] = v
				}
			}
		}
	}

	h.logger.Info("Starting wait_until",
		zap.String("condition", conditionStr),
		zap.Duration("max_duration", maxDuration),
		zap.Duration("interval", interval),
	)

	deadline := time.Now().Add(maxDuration)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	attempts := 0
	for {
		attempts++

		// Evaluate condition
		met, evalErr := evalCondition(conditionStr, env)
		if evalErr != nil {
			// Non-fatal eval error: log and keep waiting
			h.logger.Warn("Condition evaluation error", zap.Error(evalErr), zap.Int("attempt", attempts))
		} else if met {
			h.logger.Info("Condition met", zap.Int("attempts", attempts))
			return models.OutputData{
				"condition":  conditionStr,
				"met":        true,
				"attempts":   attempts,
				"timed_out":  false,
			}, nil
		}

		// Check timeout
		if time.Now().After(deadline) {
			h.logger.Info("wait_until timed out",
				zap.String("condition", conditionStr),
				zap.Int("attempts", attempts),
			)
			if onTimeout == "continue" {
				return models.OutputData{
					"condition": conditionStr,
					"met":       false,
					"attempts":  attempts,
					"timed_out": true,
				}, nil
			}
			return models.OutputData{
				"condition": conditionStr,
				"met":       false,
				"attempts":  attempts,
				"timed_out": true,
			}, fmt.Errorf("wait_until timed out after %s: condition %q was never true", maxDurationStr, conditionStr)
		}

		// Wait for next tick or context cancellation
		select {
		case <-ticker.C:
			// continue
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
}

// evalCondition compiles and evaluates a boolean expression against env.
func evalCondition(conditionStr string, env map[string]interface{}) (bool, error) {
	program, err := expr.Compile(conditionStr, expr.Env(env), expr.AsBool())
	if err != nil {
		// Try without strict env typing (allows dynamic keys)
		program, err = expr.Compile(conditionStr)
		if err != nil {
			return false, fmt.Errorf("failed to compile condition: %w", err)
		}
	}

	result, err := expr.Run(program, env)
	if err != nil {
		return false, fmt.Errorf("failed to evaluate condition: %w", err)
	}

	b, ok := result.(bool)
	if !ok {
		return false, fmt.Errorf("condition must evaluate to bool, got %T", result)
	}
	return b, nil
}
