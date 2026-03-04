package plugins

import (
	"encoding/json"
	"time"
)

// PluginExecuteRequest is sent to a plugin's /execute endpoint
type PluginExecuteRequest struct {
	// Action is the action type being executed (matches the plugin's action ID)
	Action string `json:"action"`

	// Config contains the step configuration from the flow definition
	Config map[string]interface{} `json:"config"`

	// Context provides execution context to the plugin
	Context *PluginContext `json:"context"`
}

// PluginContext provides execution context information to plugins
type PluginContext struct {
	// ExecutionID is the unique identifier for this flow execution
	ExecutionID string `json:"execution_id"`

	// FlowID is the identifier of the flow being executed
	FlowID string `json:"flow_id"`

	// StepID is the identifier of the current step
	StepID string `json:"step_id"`

	// Variables contains the current execution variables
	Variables map[string]string `json:"variables"`

	// StepOutputs contains outputs from previous steps
	StepOutputs map[string]map[string]interface{} `json:"step_outputs"`
}

// PluginExecuteResponse is returned from a plugin's /execute endpoint
type PluginExecuteResponse struct {
	// Success indicates whether the action completed successfully
	Success bool `json:"success"`

	// Output contains the action result data
	Output map[string]interface{} `json:"output"`

	// Error contains error details if Success is false
	Error *PluginError `json:"error,omitempty"`

	// Logs contains any log messages from the plugin
	Logs []PluginLog `json:"logs,omitempty"`

	// Metrics contains timing/performance data
	Metrics *PluginMetrics `json:"metrics,omitempty"`
}

// PluginError represents an error from a plugin
type PluginError struct {
	// Code is a machine-readable error code
	Code string `json:"code"`

	// Message is a human-readable error description
	Message string `json:"message"`

	// Details contains additional error context
	Details map[string]interface{} `json:"details,omitempty"`
}

func (e *PluginError) Error() string {
	return e.Message
}

// PluginLog represents a log entry from a plugin
type PluginLog struct {
	Level     string    `json:"level"` // debug, info, warn, error
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
}

// PluginMetrics contains performance metrics from plugin execution
type PluginMetrics struct {
	// DurationMs is the total execution time in milliseconds
	DurationMs int64 `json:"duration_ms"`

	// Custom metrics can be added here
	Custom map[string]interface{} `json:"custom,omitempty"`
}

// PluginHealthResponse is returned from a plugin's /health endpoint
type PluginHealthResponse struct {
	Status  string `json:"status"` // healthy, unhealthy, starting
	Version string `json:"version"`
	Uptime  int64  `json:"uptime_seconds"`
}

// PluginInfoResponse is returned from a plugin's /info endpoint
type PluginInfoResponse struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Version     string            `json:"version"`
	Description string            `json:"description"`
	Actions     []PluginActionDef `json:"actions"`
}

// PluginActionDef describes an action provided by a plugin
type PluginActionDef struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Schema      map[string]interface{} `json:"schema"` // JSON Schema for config validation
}

// MarshalJSON for PluginExecuteRequest
func (r *PluginExecuteRequest) ToJSON() ([]byte, error) {
	return json.Marshal(r)
}

// ParsePluginResponse parses a plugin response from JSON
func ParsePluginResponse(data []byte) (*PluginExecuteResponse, error) {
	var resp PluginExecuteResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}
