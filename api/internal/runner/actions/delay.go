package actions

import (
	"context"
	"fmt"
	"time"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// DelayHandler handles delay/wait actions
type DelayHandler struct {
	logger *zap.Logger
}

// NewDelayHandler creates a new delay handler
func NewDelayHandler(logger *zap.Logger) *DelayHandler {
	return &DelayHandler{
		logger: logger,
	}
}

// Execute waits for the specified duration
func (h *DelayHandler) Execute(ctx context.Context, config map[string]interface{}) (models.OutputData, error) {
	durationStr, ok := config["duration"].(string)
	if !ok {
		return nil, fmt.Errorf("duration is required and must be a string (e.g., '2s', '100ms', '1m')")
	}

	duration, err := time.ParseDuration(durationStr)
	if err != nil {
		return nil, fmt.Errorf("invalid duration format: %w", err)
	}

	h.logger.Info("Delaying execution", zap.Duration("duration", duration))

	// Wait for the duration or until context is cancelled
	select {
	case <-time.After(duration):
		// Duration elapsed
	case <-ctx.Done():
		// Context cancelled
		return nil, ctx.Err()
	}

	return models.OutputData{
		"duration":    durationStr,
		"duration_ms": duration.Milliseconds(),
		"completed":   true,
	}, nil
}
