package assertions

import (
	"fmt"
	"strings"

	"github.com/expr-lang/expr"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/tidwall/gjson"
)

// Evaluator evaluates assertions against step output
type Evaluator struct {
	output models.OutputData
}

// NewEvaluator creates a new assertion evaluator
func NewEvaluator(output models.OutputData) *Evaluator {
	return &Evaluator{output: output}
}

// Evaluate evaluates a list of assertion expressions
// Returns error if any assertion fails
func (e *Evaluator) Evaluate(assertions []string) error {
	if len(assertions) == 0 {
		return nil
	}

	var failedAssertions []string

	for _, assertion := range assertions {
		if err := e.evaluateOne(assertion); err != nil {
			failedAssertions = append(failedAssertions, fmt.Sprintf("%s: %v", assertion, err))
		}
	}

	if len(failedAssertions) > 0 {
		return fmt.Errorf("assertion failed:\n  - %s", strings.Join(failedAssertions, "\n  - "))
	}

	return nil
}

// evaluateOne evaluates a single assertion expression
func (e *Evaluator) evaluateOne(assertion string) error {
	// Prepare environment for expression evaluation
	env := e.prepareEnvironment()

	// Compile and evaluate expression
	program, err := expr.Compile(assertion, expr.Env(env), expr.AsBool())
	if err != nil {
		return fmt.Errorf("invalid expression: %w", err)
	}

	result, err := expr.Run(program, env)
	if err != nil {
		return fmt.Errorf("evaluation error: %w", err)
	}

	// Check if assertion passed
	passed, ok := result.(bool)
	if !ok {
		return fmt.Errorf("expression did not return boolean")
	}

	if !passed {
		return fmt.Errorf("assertion failed")
	}

	return nil
}

// prepareEnvironment creates the evaluation environment from output
func (e *Evaluator) prepareEnvironment() map[string]interface{} {
	env := make(map[string]interface{})

	// Add all output fields directly
	for key, value := range e.output {
		env[key] = value
	}

	// Add convenience accessors
	if status, ok := e.output["status"]; ok {
		env["status"] = status
	}

	if body, ok := e.output["body"]; ok {
		env["body"] = body

		// If body is a map, add response.body alias
		if bodyMap, ok := body.(map[string]interface{}); ok {
			env["response"] = map[string]interface{}{
				"body": bodyMap,
			}
		}
	}

	if headers, ok := e.output["headers"]; ok {
		env["headers"] = headers
	}

	if durationMs, ok := e.output["duration_ms"]; ok {
		env["duration_ms"] = durationMs
	}

	return env
}

// EvaluateJSONPath evaluates a JSONPath expression against output
// Returns the extracted value or error
func (e *Evaluator) EvaluateJSONPath(path string) (interface{}, error) {
	// Convert output to JSON string
	bodyInterface, ok := e.output["body"]
	if !ok {
		return nil, fmt.Errorf("no body in output")
	}

	// If body is already a string, use it directly
	var jsonStr string
	switch v := bodyInterface.(type) {
	case string:
		jsonStr = v
	case map[string]interface{}, []interface{}:
		// Convert to JSON for gjson
		// We'll use a simple approach - gjson can work with the interface directly
		// by converting internally, but we need to handle it properly
		return extractFromInterface(bodyInterface, path), nil
	default:
		return nil, fmt.Errorf("unsupported body type: %T", bodyInterface)
	}

	// Use gjson to extract value
	result := gjson.Get(jsonStr, path)
	if !result.Exists() {
		return nil, fmt.Errorf("path not found: %s", path)
	}

	return result.Value(), nil
}

// extractFromInterface extracts value from interface using simplified path
func extractFromInterface(data interface{}, path string) interface{} {
	// Remove leading $. if present
	path = strings.TrimPrefix(path, "$.")
	path = strings.TrimPrefix(path, "$")

	if path == "" {
		return data
	}

	parts := strings.Split(path, ".")
	current := data

	for _, part := range parts {
		if part == "" {
			continue
		}

		switch v := current.(type) {
		case map[string]interface{}:
			current = v[part]
		case map[interface{}]interface{}:
			current = v[part]
		default:
			return nil
		}

		if current == nil {
			return nil
		}
	}

	return current
}

// Helper functions for common assertions

// AssertEqual checks if two values are equal
func AssertEqual(actual, expected interface{}) error {
	if actual != expected {
		return fmt.Errorf("expected %v, got %v", expected, actual)
	}
	return nil
}

// AssertNotEqual checks if two values are not equal
func AssertNotEqual(actual, expected interface{}) error {
	if actual == expected {
		return fmt.Errorf("expected value to not equal %v", expected)
	}
	return nil
}

// AssertContains checks if a string contains a substring
func AssertContains(str, substr string) error {
	if !strings.Contains(str, substr) {
		return fmt.Errorf("expected %q to contain %q", str, substr)
	}
	return nil
}

// AssertStatusCode checks if HTTP status code matches expected
func AssertStatusCode(output models.OutputData, expected int) error {
	status, ok := output["status"].(int)
	if !ok {
		// Try float64 (JSON unmarshaling)
		if statusFloat, ok := output["status"].(float64); ok {
			status = int(statusFloat)
		} else {
			return fmt.Errorf("status not found in output")
		}
	}

	if status != expected {
		return fmt.Errorf("expected status %d, got %d", expected, status)
	}
	return nil
}
