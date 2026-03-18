package runner

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Context holds execution context with variables and step outputs
type Context struct {
	variables       map[string]string
	stepOutputs     map[string]map[string]interface{}
	routingHeaders  map[string]string            // auto-injected into all http_request steps
	routingOverrides map[string]map[string]string // per-action-type config defaults
}

// NewContext creates a new execution context.
// Variables prefixed with "__rthr__" are extracted as routing headers and not
// exposed as regular template variables.
func NewContext(variables map[string]string, envVars map[string]interface{}) *Context {
	ctx := &Context{
		variables:        make(map[string]string),
		stepOutputs:      make(map[string]map[string]interface{}),
		routingHeaders:   make(map[string]string),
		routingOverrides: make(map[string]map[string]string),
	}

	// Add user-provided variables, extracting routing metadata.
	// __rthr__<header>              → routing header injected into http_request steps
	// __rtov__<actionType>__<field> → routing override for a specific action type's config field
	for k, v := range variables {
		if after, ok := strings.CutPrefix(k, "__rthr__"); ok {
			ctx.routingHeaders[after] = v
		} else if after, ok := strings.CutPrefix(k, "__rtov__"); ok {
			// format: __rtov__<actionType>__<field>
			parts := strings.SplitN(after, "__", 2)
			if len(parts) == 2 {
				actionType, field := parts[0], parts[1]
				if ctx.routingOverrides[actionType] == nil {
					ctx.routingOverrides[actionType] = make(map[string]string)
				}
				ctx.routingOverrides[actionType][field] = v
			}
		} else {
			ctx.variables[k] = v
		}
	}

	// Add flow-level env vars
	for k, v := range envVars {
		ctx.variables[k] = fmt.Sprintf("%v", v)
	}

	return ctx
}

// GetRoutingHeaders returns the environment-level headers to inject into HTTP requests.
func (c *Context) GetRoutingHeaders() map[string]string {
	return c.routingHeaders
}

// GetRoutingOverrides returns the config defaults for a given action type.
// Step-level config takes precedence over these defaults.
func (c *Context) GetRoutingOverrides(actionType string) map[string]string {
	return c.routingOverrides[actionType]
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
