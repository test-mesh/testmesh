package parser

import (
	"fmt"
	"os"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"gopkg.in/yaml.v3"
)

// ParseYAML parses a YAML string into a FlowDefinition
func ParseYAML(yamlContent string) (*models.FlowDefinition, error) {
	var definition models.FlowDefinition

	if err := yaml.Unmarshal([]byte(yamlContent), &definition); err != nil {
		return nil, fmt.Errorf("failed to parse YAML: %w", err)
	}

	// Validate required fields
	if err := validateDefinition(&definition); err != nil {
		return nil, err
	}

	return &definition, nil
}

// ParseYAMLFile parses a YAML file into a FlowDefinition
func ParseYAMLFile(filePath string) (*models.FlowDefinition, error) {
	content, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}

	return ParseYAML(string(content))
}

// validateDefinition validates the flow definition
func validateDefinition(def *models.FlowDefinition) error {
	if def.Name == "" {
		return fmt.Errorf("flow name is required")
	}

	if len(def.Steps) == 0 {
		return fmt.Errorf("flow must have at least one step")
	}

	// Validate each step
	for i, step := range def.Steps {
		if step.Action == "" {
			return fmt.Errorf("step %d: action is required", i)
		}

		// Validate action-specific config
		switch step.Action {
		case "http_request":
			if err := validateHTTPConfig(step.Config); err != nil {
				return fmt.Errorf("step %d (%s): %w", i, step.ID, err)
			}
		case "database_query":
			if err := validateDatabaseConfig(step.Config); err != nil {
				return fmt.Errorf("step %d (%s): %w", i, step.ID, err)
			}
		}
	}

	return nil
}

// validateHTTPConfig validates HTTP request configuration
func validateHTTPConfig(config map[string]interface{}) error {
	method, ok := config["method"]
	if !ok || method == "" {
		return fmt.Errorf("http_request requires 'method' field")
	}

	url, ok := config["url"]
	if !ok || url == "" {
		return fmt.Errorf("http_request requires 'url' field")
	}

	return nil
}

// validateDatabaseConfig validates database query configuration
func validateDatabaseConfig(config map[string]interface{}) error {
	query, ok := config["query"]
	if !ok || query == "" {
		return fmt.Errorf("database_query requires 'query' field")
	}

	return nil
}

// ToYAML converts a FlowDefinition to YAML string
func ToYAML(definition *models.FlowDefinition) (string, error) {
	bytes, err := yaml.Marshal(definition)
	if err != nil {
		return "", fmt.Errorf("failed to marshal to YAML: %w", err)
	}

	return string(bytes), nil
}
