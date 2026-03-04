package actions

import (
	"context"
	"fmt"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// LogHandler handles log actions
type LogHandler struct {
	logger *zap.Logger
}

// NewLogHandler creates a new log handler
func NewLogHandler(logger *zap.Logger) *LogHandler {
	return &LogHandler{
		logger: logger,
	}
}

// Execute logs a message
func (h *LogHandler) Execute(ctx context.Context, config map[string]interface{}) (models.OutputData, error) {
	message, ok := config["message"].(string)
	if !ok {
		return nil, fmt.Errorf("message is required and must be a string")
	}

	// Get log level (default: info)
	level := "info"
	if l, ok := config["level"].(string); ok {
		level = l
	}

	// Log based on level
	switch level {
	case "debug":
		h.logger.Debug(message)
	case "info":
		h.logger.Info(message)
	case "warn":
		h.logger.Warn(message)
	case "error":
		h.logger.Error(message)
	default:
		h.logger.Info(message)
	}

	return models.OutputData{
		"message": message,
		"level":   level,
		"logged":  true,
	}, nil
}
