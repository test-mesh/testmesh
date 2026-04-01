package actions

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/test-mesh/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// ContractGenerateHandler creates a Pact-compatible contract JSON file from an
// inline interaction specification.
type ContractGenerateHandler struct {
	logger *zap.Logger
}

// NewContractGenerateHandler creates a new contract_generate handler.
func NewContractGenerateHandler(logger *zap.Logger) *ContractGenerateHandler {
	return &ContractGenerateHandler{logger: logger}
}

// contractInteraction represents a single request/response pair in a contract.
type contractInteraction struct {
	Description string                 `json:"description"`
	Request     map[string]interface{} `json:"request"`
	Response    map[string]interface{} `json:"response"`
}

// contractDoc is the top-level Pact 2.0 contract document.
type contractDoc struct {
	Consumer     map[string]string     `json:"consumer"`
	Provider     map[string]string     `json:"provider"`
	Interactions []contractInteraction `json:"interactions"`
	Metadata     map[string]interface{} `json:"metadata"`
}

// Execute builds and writes a contract JSON file.
//
// Config keys:
//
//	consumer      string  – consumer name (required)
//	provider      string  – provider name (required)
//	interactions  []any   – list of interaction maps (required)
//	output_path   string  – directory or file path (default: "pacts/")
func (h *ContractGenerateHandler) Execute(_ context.Context, config map[string]interface{}) (models.OutputData, error) {
	consumer, ok := config["consumer"].(string)
	if !ok || consumer == "" {
		return nil, fmt.Errorf("contract_generate: 'consumer' is required")
	}

	provider, ok := config["provider"].(string)
	if !ok || provider == "" {
		return nil, fmt.Errorf("contract_generate: 'provider' is required")
	}

	rawInteractions, ok := config["interactions"]
	if !ok {
		return nil, fmt.Errorf("contract_generate: 'interactions' is required")
	}

	interactionSlice, err := toSliceOfMaps(rawInteractions)
	if err != nil {
		return nil, fmt.Errorf("contract_generate: 'interactions' must be a list of objects: %w", err)
	}

	outputPath := "pacts/"
	if v, ok := config["output_path"].(string); ok && v != "" {
		outputPath = v
	}

	// Build the interactions list.
	interactions := make([]contractInteraction, 0, len(interactionSlice))
	for i, raw := range interactionSlice {
		desc, _ := raw["description"].(string)
		if desc == "" {
			desc = fmt.Sprintf("interaction_%d", i+1)
		}

		req, _ := raw["request"].(map[string]interface{})
		if req == nil {
			req = make(map[string]interface{})
		}
		resp, _ := raw["response"].(map[string]interface{})
		if resp == nil {
			resp = make(map[string]interface{})
		}

		interactions = append(interactions, contractInteraction{
			Description: desc,
			Request:     req,
			Response:    resp,
		})
	}

	doc := contractDoc{
		Consumer:     map[string]string{"name": consumer},
		Provider:     map[string]string{"name": provider},
		Interactions: interactions,
		Metadata: map[string]interface{}{
			"pactSpecification": map[string]string{"version": "2.0.0"},
		},
	}

	// Determine final file path.
	var filePath string
	if filepath.Ext(outputPath) == ".json" {
		filePath = outputPath
	} else {
		// Treat outputPath as a directory.
		fileName := fmt.Sprintf("%s-%s.json", consumer, provider)
		filePath = filepath.Join(outputPath, fileName)
	}

	// Ensure the directory exists.
	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("contract_generate: failed to create directory %q: %w", dir, err)
	}

	// Marshal and write.
	data, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("contract_generate: failed to marshal contract: %w", err)
	}

	if err := os.WriteFile(filePath, data, 0o644); err != nil {
		return nil, fmt.Errorf("contract_generate: failed to write contract file %q: %w", filePath, err)
	}

	h.logger.Info("Contract written",
		zap.String("consumer", consumer),
		zap.String("provider", provider),
		zap.String("path", filePath),
		zap.Int("interactions", len(interactions)),
	)

	return models.OutputData{
		"contract_id":   filePath,
		"contract_path": filePath,
		"consumer":      consumer,
		"provider":      provider,
		"interactions":  len(interactions),
	}, nil
}

// toSliceOfMaps coerces the various types YAML/JSON unmarshalling may produce
// into []map[string]interface{}.
func toSliceOfMaps(v interface{}) ([]map[string]interface{}, error) {
	switch t := v.(type) {
	case []map[string]interface{}:
		return t, nil
	case []interface{}:
		result := make([]map[string]interface{}, 0, len(t))
		for i, item := range t {
			m, ok := item.(map[string]interface{})
			if !ok {
				return nil, fmt.Errorf("item %d is not an object (got %T)", i, item)
			}
			result = append(result, m)
		}
		return result, nil
	default:
		return nil, fmt.Errorf("expected a list, got %T", v)
	}
}
