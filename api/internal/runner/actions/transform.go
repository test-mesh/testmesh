package actions

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/tidwall/gjson"
	"go.uber.org/zap"
)

// TransformHandler handles data transformation actions
type TransformHandler struct {
	logger *zap.Logger
}

// NewTransformHandler creates a new transform handler
func NewTransformHandler(logger *zap.Logger) *TransformHandler {
	return &TransformHandler{
		logger: logger,
	}
}

// Execute transforms data using JSONPath extraction and manipulation
func (h *TransformHandler) Execute(ctx context.Context, config map[string]interface{}) (models.OutputData, error) {
	// Get input data
	input, ok := config["input"]
	if !ok {
		return nil, fmt.Errorf("input is required")
	}

	// Get transformations map
	transforms, ok := config["transforms"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("transforms is required and must be a map")
	}

	// Convert input to a map for easier access
	var inputMap map[string]interface{}
	switch v := input.(type) {
	case map[string]interface{}:
		inputMap = v
	case models.OutputData:
		inputMap = map[string]interface{}(v)
	default:
		// Try to marshal and unmarshal to get a map
		inputJSON, err := json.Marshal(input)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal input: %w", err)
		}
		if err := json.Unmarshal(inputJSON, &inputMap); err != nil {
			return nil, fmt.Errorf("failed to unmarshal input: %w", err)
		}
	}

	// Convert to JSON for JSONPath processing
	inputJSON, err := json.Marshal(inputMap)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal input map: %w", err)
	}

	result := make(models.OutputData)

	// Apply each transformation
	for key, pathOrValue := range transforms {
		switch v := pathOrValue.(type) {
		case string:
			// If it starts with $., treat as JSONPath
			if len(v) > 1 && v[0] == '$' && v[1] == '.' {
				// Use gjson with the path after $.
				path := v[2:] // Remove $. prefix
				extracted := gjson.GetBytes(inputJSON, path)
				if !extracted.Exists() {
					h.logger.Warn("JSONPath did not match",
						zap.String("path", v),
						zap.String("key", key),
						zap.String("input_keys", fmt.Sprintf("%v", getKeys(inputMap))),
					)
					result[key] = nil
					continue
				}
				result[key] = extracted.Value()
			} else if len(v) > 0 && v[0] == '$' {
				// Just $something - treat as direct field access
				fieldName := v[1:]
				if val, ok := inputMap[fieldName]; ok {
					result[key] = val
				} else {
					h.logger.Warn("Field not found",
						zap.String("field", fieldName),
						zap.String("key", key),
					)
					result[key] = nil
				}
			} else {
				// Static string value
				result[key] = v
			}
		default:
			// Static value
			result[key] = v
		}
	}

	h.logger.Info("Data transformed",
		zap.Int("input_fields", len(inputMap)),
		zap.Int("output_fields", len(result)),
	)

	return result, nil
}

// getKeys returns the keys of a map for debugging
func getKeys(m map[string]interface{}) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}
