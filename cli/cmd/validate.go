package cmd

import (
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

var validateCmd = &cobra.Command{
	Use:   "validate <flow.yaml>",
	Short: "Validate a flow YAML file",
	Long: `Validate a test flow definition without executing it.

Checks for:
- Valid YAML syntax
- Required fields (name, steps)
- Valid action types
- Step structure`,
	Args: cobra.ExactArgs(1),
	RunE: validateFlow,
}

func init() {
	rootCmd.AddCommand(validateCmd)
}

var validActions = map[string]bool{
	"http_request":          true,
	"database_query":        true,
	"log":                   true,
	"delay":                 true,
	"assert":                true,
	"transform":             true,
	"condition":             true,
	"for_each":              true,
	"mock_server_start":     true,
	"mock_server_stop":      true,
	"mock_server_configure": true,
	"contract_generate":     true,
	"contract_verify":       true,
	"websocket":             true,
	"grpc":                  true,
	"kafka":                 true,
	"kafka.produce":         true,
	"kafka.consume":         true,
}

func validateFlow(cmd *cobra.Command, args []string) error {
	filePath := args[0]

	// Read flow file
	data, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("failed to read file: %w", err)
	}

	// Parse YAML
	var flowWrapper struct {
		Flow struct {
			Name        string                   `yaml:"name"`
			Description string                   `yaml:"description"`
			Suite       string                   `yaml:"suite"`
			Setup       []map[string]interface{} `yaml:"setup"`
			Steps       []map[string]interface{} `yaml:"steps"`
			Teardown    []map[string]interface{} `yaml:"teardown"`
		} `yaml:"flow"`
	}

	if err := yaml.Unmarshal(data, &flowWrapper); err != nil {
		return fmt.Errorf("invalid YAML: %w", err)
	}

	flow := flowWrapper.Flow
	errors := []string{}

	// Check required fields
	if flow.Name == "" {
		errors = append(errors, "flow.name is required")
	}

	if len(flow.Steps) == 0 {
		errors = append(errors, "flow.steps must have at least one step")
	}

	// Validate steps
	validateSteps := func(steps []map[string]interface{}, phase string) {
		for i, step := range steps {
			// Check for action
			action, ok := step["action"].(string)
			if !ok || action == "" {
				errors = append(errors, fmt.Sprintf("%s step %d: action is required", phase, i+1))
				continue
			}

			// Check valid action type (allow plugin actions with dots)
			isValid := validActions[action]
			if !isValid && strings.Contains(action, ".") {
				prefix := action[:strings.Index(action, ".")]
				isValid = validActions[prefix]
			}
			if !isValid {
				errors = append(errors, fmt.Sprintf("%s step %d: unknown action type '%s'", phase, i+1, action))
			}

			// Check for id or name
			_, hasID := step["id"]
			_, hasName := step["name"]
			if !hasID && !hasName {
				errors = append(errors, fmt.Sprintf("%s step %d: step should have 'id' or 'name'", phase, i+1))
			}
		}
	}

	validateSteps(flow.Setup, "setup")
	validateSteps(flow.Steps, "steps")
	validateSteps(flow.Teardown, "teardown")

	// Print results
	fmt.Println()
	if len(errors) > 0 {
		fmt.Printf("❌ Validation failed with %d error(s):\n\n", len(errors))
		for _, err := range errors {
			fmt.Printf("   • %s\n", err)
		}
		fmt.Println()
		return fmt.Errorf("validation failed")
	}

	fmt.Println("✅ Flow is valid")
	fmt.Println()
	fmt.Printf("   Name: %s\n", flow.Name)
	if flow.Description != "" {
		fmt.Printf("   Description: %s\n", flow.Description)
	}
	if flow.Suite != "" {
		fmt.Printf("   Suite: %s\n", flow.Suite)
	}
	fmt.Printf("   Setup steps: %d\n", len(flow.Setup))
	fmt.Printf("   Main steps: %d\n", len(flow.Steps))
	fmt.Printf("   Teardown steps: %d\n", len(flow.Teardown))
	fmt.Println()

	// List steps
	if verbose {
		fmt.Println("   Steps:")
		for i, step := range flow.Steps {
			action, _ := step["action"].(string)
			id, _ := step["id"].(string)
			name, _ := step["name"].(string)
			stepLabel := id
			if stepLabel == "" {
				stepLabel = name
			}
			if stepLabel == "" {
				stepLabel = fmt.Sprintf("step_%d", i+1)
			}
			fmt.Printf("   %d. %s (%s)\n", i+1, stepLabel, action)
		}
		fmt.Println()
	}

	return nil
}
