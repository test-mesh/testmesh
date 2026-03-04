package runner

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Interpolator handles variable interpolation in strings
type Interpolator struct {
	context *Context
}

// NewInterpolator creates a new interpolator
func NewInterpolator(ctx *Context) *Interpolator {
	return &Interpolator{context: ctx}
}

// Interpolate replaces all variables in a string
// Supports both ${VAR} and {{VAR}} formats:
//   - ${VAR} or {{VAR}} - environment/context variables
//   - ${RANDOM_ID} or {{RANDOM_ID}} - random UUID v4
//   - ${UUID} or {{UUID}} - random UUID v4 (alias)
//   - ${TIMESTAMP} or {{TIMESTAMP}} - Unix timestamp
//   - ${ISO_TIMESTAMP} or {{ISO_TIMESTAMP}} - ISO 8601 timestamp
//   - ${DATE} or {{DATE}} - Current date (YYYY-MM-DD)
//   - ${TIME} or {{TIME}} - Current time (HH:MM:SS)
//   - ${DATETIME} or {{DATETIME}} - Current datetime (YYYY-MM-DD HH:MM:SS)
//   - ${step_id.output_key} or {{step_id.output_key}} - step output reference
func (i *Interpolator) Interpolate(input string) string {
	if !strings.Contains(input, "${") && !strings.Contains(input, "{{") {
		return input
	}

	result := input

	// Replace built-in functions
	result = i.replaceBuiltInVariables(result)

	// Replace step outputs
	result = i.replaceStepOutputs(result)

	// Replace context variables
	result = i.replaceContextVariables(result)

	return result
}

// replaceBuiltInVariables replaces built-in variable functions
// Supports both ${VAR} and {{VAR}} formats
func (i *Interpolator) replaceBuiltInVariables(input string) string {
	now := time.Now()

	// Generate values once
	randomID := uuid.New().String()
	timestamp := fmt.Sprintf("%d", now.Unix())
	isoTimestamp := now.Format(time.RFC3339)
	date := now.Format("2006-01-02")
	timeStr := now.Format("15:04:05")
	datetime := now.Format("2006-01-02 15:04:05")
	year := fmt.Sprintf("%d", now.Year())
	month := fmt.Sprintf("%02d", now.Month())
	day := fmt.Sprintf("%02d", now.Day())
	hour := fmt.Sprintf("%02d", now.Hour())
	minute := fmt.Sprintf("%02d", now.Minute())
	second := fmt.Sprintf("%02d", now.Second())

	replacements := map[string]string{
		"${RANDOM_ID}":     randomID,
		"{{RANDOM_ID}}":    randomID,
		"${UUID}":          randomID,
		"{{UUID}}":         randomID,
		"${TIMESTAMP}":     timestamp,
		"{{TIMESTAMP}}":    timestamp,
		"${ISO_TIMESTAMP}": isoTimestamp,
		"{{ISO_TIMESTAMP}}": isoTimestamp,
		"${DATE}":          date,
		"{{DATE}}":         date,
		"${TIME}":          timeStr,
		"{{TIME}}":         timeStr,
		"${DATETIME}":      datetime,
		"{{DATETIME}}":     datetime,
		"${YEAR}":          year,
		"{{YEAR}}":         year,
		"${MONTH}":         month,
		"{{MONTH}}":        month,
		"${DAY}":           day,
		"{{DAY}}":          day,
		"${HOUR}":          hour,
		"{{HOUR}}":         hour,
		"${MINUTE}":        minute,
		"{{MINUTE}}":       minute,
		"${SECOND}":        second,
		"{{SECOND}}":       second,
	}

	result := input
	for placeholder, value := range replacements {
		result = strings.ReplaceAll(result, placeholder, value)
	}

	return result
}

// replaceStepOutputs replaces step output references
// Supports both ${step_id.output_key} and {{step_id.output_key}} formats
func (i *Interpolator) replaceStepOutputs(input string) string {
	result := input

	// Pattern to match ${step.output} or ${step.nested.path}
	dollarPattern := regexp.MustCompile(`\$\{([a-zA-Z_][a-zA-Z0-9_]*)\.([\w.]+)\}`)
	result = i.replaceWithPattern(result, dollarPattern)

	// Pattern to match {{step.output}} or {{step.nested.path}}
	bracePattern := regexp.MustCompile(`\{\{([a-zA-Z_][a-zA-Z0-9_]*)\.([\w.]+)\}\}`)
	result = i.replaceWithPattern(result, bracePattern)

	return result
}

// replaceWithPattern is a helper function that replaces matches using a regex pattern
func (i *Interpolator) replaceWithPattern(input string, pattern *regexp.Regexp) string {
	return pattern.ReplaceAllStringFunc(input, func(match string) string {
		// Extract step_id and path
		parts := pattern.FindStringSubmatch(match)
		if len(parts) != 3 {
			return match // Return original if pattern doesn't match
		}

		stepID := parts[1]
		path := parts[2]

		// Get step output
		if value, exists := i.context.GetStepOutput(stepID, path); exists {
			return fmt.Sprintf("%v", value)
		}

		// If not found, try nested path
		pathParts := strings.Split(path, ".")
		if len(pathParts) > 1 {
			// Try getting the first part
			if value, exists := i.context.GetStepOutput(stepID, pathParts[0]); exists {
				// Try to navigate nested structure
				if nestedValue := i.navigateNestedValue(value, pathParts[1:]); nestedValue != nil {
					return fmt.Sprintf("%v", nestedValue)
				}
			}
		}

		// Return original if not found
		return match
	})
}

// navigateNestedValue navigates through nested map/slice structures
func (i *Interpolator) navigateNestedValue(value interface{}, path []string) interface{} {
	current := value

	for _, key := range path {
		switch v := current.(type) {
		case map[string]interface{}:
			current = v[key]
		case map[interface{}]interface{}:
			current = v[key]
		default:
			return nil
		}

		if current == nil {
			return nil
		}
	}

	return current
}

// replaceContextVariables replaces context/environment variables
// Supports both ${VAR_NAME} and {{VAR_NAME}} formats
func (i *Interpolator) replaceContextVariables(input string) string {
	result := input

	// Pattern to match ${VAR_NAME}
	dollarPattern := regexp.MustCompile(`\$\{([A-Z_][A-Z0-9_]*)\}`)
	result = i.replaceVarWithPattern(result, dollarPattern)

	// Pattern to match {{VAR_NAME}}
	bracePattern := regexp.MustCompile(`\{\{([A-Z_][A-Z0-9_]*)\}\}`)
	result = i.replaceVarWithPattern(result, bracePattern)

	return result
}

// replaceVarWithPattern is a helper that replaces variable matches using a regex pattern
func (i *Interpolator) replaceVarWithPattern(input string, pattern *regexp.Regexp) string {
	return pattern.ReplaceAllStringFunc(input, func(match string) string {
		// Extract variable name
		parts := pattern.FindStringSubmatch(match)
		if len(parts) != 2 {
			return match
		}

		varName := parts[1]

		// Get from context
		if value, exists := i.context.Get(varName); exists {
			return value
		}

		// Return original if not found
		return match
	})
}

// InterpolateMap recursively interpolates all string values in a map
func (i *Interpolator) InterpolateMap(input map[string]interface{}) map[string]interface{} {
	result := make(map[string]interface{})

	for key, value := range input {
		result[key] = i.InterpolateValue(value)
	}

	return result
}

// InterpolateValue interpolates a single value (handles strings, maps, slices)
func (i *Interpolator) InterpolateValue(value interface{}) interface{} {
	switch v := value.(type) {
	case string:
		return i.Interpolate(v)
	case map[string]interface{}:
		return i.InterpolateMap(v)
	case []interface{}:
		result := make([]interface{}, len(v))
		for idx, item := range v {
			result[idx] = i.InterpolateValue(item)
		}
		return result
	default:
		return value
	}
}
