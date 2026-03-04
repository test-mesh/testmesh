package actions

import (
	"context"
	"fmt"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// ForEachHandler handles loop/iteration actions
type ForEachHandler struct {
	logger   *zap.Logger
	executor StepExecutor
}

// NewForEachHandler creates a new for_each handler
func NewForEachHandler(logger *zap.Logger, executor StepExecutor) *ForEachHandler {
	return &ForEachHandler{
		logger:   logger,
		executor: executor,
	}
}

// Execute iterates over items and executes nested steps for each
func (h *ForEachHandler) Execute(ctx context.Context, config map[string]interface{}) (models.OutputData, error) {
	// Get items to iterate over
	items, ok := config["items"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("items is required and must be an array")
	}

	// Get item variable name (default: "item")
	itemName := "item"
	if name, ok := config["item_name"].(string); ok {
		itemName = name
	}

	h.logger.Info("Starting for_each loop",
		zap.Int("items", len(items)),
		zap.String("item_name", itemName),
	)

	results := make([]interface{}, 0, len(items))

	// Iterate over items
	for i, item := range items {
		h.logger.Debug("Processing item",
			zap.Int("index", i),
			zap.Any("item", item),
		)

		// For now, just collect the items
		// In full implementation, this would execute nested steps with the item in context
		results = append(results, map[string]interface{}{
			"index": i,
			"item":  item,
		})

		// Check for context cancellation
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
			// Continue
		}
	}

	h.logger.Info("Completed for_each loop", zap.Int("processed", len(results)))

	return models.OutputData{
		"items_processed": len(results),
		"results":         results,
		"completed":       true,
	}, nil
}
