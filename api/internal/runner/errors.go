package runner

import (
	"fmt"
)

// ExecutionError represents an error during flow execution
type ExecutionError struct {
	Phase      string // "setup", "main", "teardown"
	StepID     string
	StepName   string
	Action     string
	Message    string
	Underlying error
}

// Error implements the error interface
func (e *ExecutionError) Error() string {
	if e.StepID != "" {
		return fmt.Sprintf("[%s] step '%s' (%s): %s", e.Phase, e.StepID, e.Action, e.Message)
	}
	return fmt.Sprintf("[%s]: %s", e.Phase, e.Message)
}

// Unwrap returns the underlying error
func (e *ExecutionError) Unwrap() error {
	return e.Underlying
}

// NewExecutionError creates a new execution error
func NewExecutionError(phase, stepID, stepName, action, message string, underlying error) *ExecutionError {
	return &ExecutionError{
		Phase:      phase,
		StepID:     stepID,
		StepName:   stepName,
		Action:     action,
		Message:    message,
		Underlying: underlying,
	}
}

// ActionError represents an error from an action handler
type ActionError struct {
	Action     string
	Message    string
	Underlying error
	Context    map[string]interface{}
}

// Error implements the error interface
func (e *ActionError) Error() string {
	if e.Context != nil && len(e.Context) > 0 {
		return fmt.Sprintf("%s action failed: %s (context: %v)", e.Action, e.Message, e.Context)
	}
	return fmt.Sprintf("%s action failed: %s", e.Action, e.Message)
}

// Unwrap returns the underlying error
func (e *ActionError) Unwrap() error {
	return e.Underlying
}

// NewActionError creates a new action error
func NewActionError(action, message string, underlying error, context map[string]interface{}) *ActionError {
	return &ActionError{
		Action:     action,
		Message:    message,
		Underlying: underlying,
		Context:    context,
	}
}

// AssertionError represents an assertion failure
type AssertionError struct {
	Expression string
	Message    string
	Expected   interface{}
	Actual     interface{}
}

// Error implements the error interface
func (e *AssertionError) Error() string {
	if e.Expected != nil && e.Actual != nil {
		return fmt.Sprintf("assertion '%s' failed: expected %v, got %v", e.Expression, e.Expected, e.Actual)
	}
	return fmt.Sprintf("assertion '%s' failed: %s", e.Expression, e.Message)
}

// NewAssertionError creates a new assertion error
func NewAssertionError(expression, message string, expected, actual interface{}) *AssertionError {
	return &AssertionError{
		Expression: expression,
		Message:    message,
		Expected:   expected,
		Actual:     actual,
	}
}
