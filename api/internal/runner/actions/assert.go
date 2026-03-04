package actions

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/georgi-georgiev/testmesh/internal/runner/assertions"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// AssertHandler handles standalone assertion actions
type AssertHandler struct {
	logger *zap.Logger
}

// NewAssertHandler creates a new assert handler
func NewAssertHandler(logger *zap.Logger) *AssertHandler {
	return &AssertHandler{
		logger: logger,
	}
}

// Execute runs assertions against provided data
func (h *AssertHandler) Execute(ctx context.Context, config map[string]interface{}) (models.OutputData, error) {
	// Get data to assert against
	data, ok := config["data"]
	if !ok {
		return nil, fmt.Errorf("data is required")
	}

	// Convert to OutputData with robust type handling
	var outputData models.OutputData
	switch v := data.(type) {
	case models.OutputData:
		outputData = v
	case map[string]interface{}:
		outputData = models.OutputData(v)
	case string:
		// If it's a string, try to unmarshal as JSON
		var temp map[string]interface{}
		if err := json.Unmarshal([]byte(v), &temp); err == nil {
			outputData = models.OutputData(temp)
		} else {
			// Not JSON, wrap as value
			outputData = models.OutputData{"value": v}
		}
	default:
		// For any other type, try to marshal and unmarshal to get a map
		dataJSON, err := json.Marshal(data)
		if err != nil {
			// If marshaling fails, just wrap it
			outputData = models.OutputData{"value": data}
		} else {
			var temp map[string]interface{}
			if err := json.Unmarshal(dataJSON, &temp); err == nil {
				outputData = models.OutputData(temp)
			} else {
				outputData = models.OutputData{"value": data}
			}
		}
	}

	// Log the data structure for debugging
	keys := make([]string, 0, len(outputData))
	for k := range outputData {
		keys = append(keys, k)
	}
	h.logger.Debug("Assert action received data",
		zap.Strings("available_fields", keys),
		zap.Int("field_count", len(outputData)),
	)

	// Get assertions
	assertionsRaw, ok := config["assertions"]
	if !ok {
		return nil, fmt.Errorf("assertions is required")
	}

	var assertionList []string
	switch v := assertionsRaw.(type) {
	case []string:
		assertionList = v
	case []interface{}:
		for _, a := range v {
			if s, ok := a.(string); ok {
				assertionList = append(assertionList, s)
			}
		}
	default:
		return nil, fmt.Errorf("assertions must be an array of strings")
	}

	if len(assertionList) == 0 {
		return nil, fmt.Errorf("at least one assertion is required")
	}

	// Run assertions
	evaluator := assertions.NewEvaluator(outputData)
	if err := evaluator.Evaluate(assertionList); err != nil {
		// Include available fields in error message for better debugging
		return nil, fmt.Errorf("assertion failed: %w (available fields: %v)", err, keys)
	}

	h.logger.Info("All assertions passed", zap.Int("count", len(assertionList)))

	return models.OutputData{
		"assertions_count": len(assertionList),
		"passed":           true,
		"data":             outputData,
	}, nil
}
