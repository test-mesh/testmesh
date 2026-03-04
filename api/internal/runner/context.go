package runner

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Context holds execution context with variables and step outputs
type Context struct {
	variables   map[string]string
	stepOutputs map[string]map[string]interface{}
}

// NewContext creates a new execution context
func NewContext(variables map[string]string, envVars map[string]interface{}) *Context {
	ctx := &Context{
		variables:   make(map[string]string),
		stepOutputs: make(map[string]map[string]interface{}),
	}

	// Add user-provided variables
	for k, v := range variables {
		ctx.variables[k] = v
	}

	// Add environment variables
	for k, v := range envVars {
		ctx.variables[k] = fmt.Sprintf("%v", v)
	}

	return ctx
}

// Get retrieves a variable value
func (c *Context) Get(key string) (string, bool) {
	value, ok := c.variables[key]
	return value, ok
}

// Set sets a variable value
func (c *Context) Set(key, value string) {
	c.variables[key] = value
}

// SetStepOutput stores output from a step
func (c *Context) SetStepOutput(stepID, key string, value interface{}) {
	if c.stepOutputs[stepID] == nil {
		c.stepOutputs[stepID] = make(map[string]interface{})
	}
	c.stepOutputs[stepID][key] = value
}

// GetStepOutput retrieves output from a step
func (c *Context) GetStepOutput(stepID, key string) (interface{}, bool) {
	if outputs, ok := c.stepOutputs[stepID]; ok {
		value, exists := outputs[key]
		return value, exists
	}
	return nil, false
}

// Interpolate replaces variables in a string
// Supports: ${VAR}, ${RANDOM_ID}, ${TIMESTAMP}, ${step.output.field}
func (c *Context) Interpolate(input string) string {
	result := input

	// Replace built-in functions
	result = strings.ReplaceAll(result, "${RANDOM_ID}", uuid.New().String())
	result = strings.ReplaceAll(result, "${TIMESTAMP}", fmt.Sprintf("%d", time.Now().Unix()))
	result = strings.ReplaceAll(result, "${ISO_TIMESTAMP}", time.Now().Format(time.RFC3339))

	// Replace step outputs (format: ${stepId.outputKey})
	// Simple implementation for now - we'll enhance in Phase 3
	for stepID, outputs := range c.stepOutputs {
		for key, value := range outputs {
			placeholder := fmt.Sprintf("${%s.%s}", stepID, key)
			result = strings.ReplaceAll(result, placeholder, fmt.Sprintf("%v", value))
		}
	}

	// Replace regular variables
	for key, value := range c.variables {
		placeholder := fmt.Sprintf("${%s}", key)
		result = strings.ReplaceAll(result, placeholder, value)
	}

	return result
}
