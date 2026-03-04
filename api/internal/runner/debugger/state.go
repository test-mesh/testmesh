package debugger

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

// SessionState represents the current state of a debug session
type SessionState string

const (
	StateIdle       SessionState = "idle"
	StateRunning    SessionState = "running"
	StatePaused     SessionState = "paused"
	StateStepping   SessionState = "stepping"
	StateTerminated SessionState = "terminated"
)

// DebugSession represents an active debugging session
type DebugSession struct {
	ID          uuid.UUID              `json:"id"`
	ExecutionID uuid.UUID              `json:"execution_id"`
	FlowID      uuid.UUID              `json:"flow_id"`
	State       SessionState           `json:"state"`
	CurrentStep string                 `json:"current_step,omitempty"`
	Breakpoints map[string]*Breakpoint `json:"breakpoints"`
	Variables   map[string]interface{} `json:"variables"`
	StepOutputs map[string]interface{} `json:"step_outputs"`
	StartedAt   time.Time              `json:"started_at"`
	PausedAt    *time.Time             `json:"paused_at,omitempty"`
	StepHistory []StepSnapshot         `json:"step_history"`
	mu          sync.RWMutex
}

// StepSnapshot captures the state at a particular step
type StepSnapshot struct {
	StepID      string                 `json:"step_id"`
	StepName    string                 `json:"step_name"`
	Action      string                 `json:"action"`
	Config      map[string]interface{} `json:"config"`
	Input       map[string]interface{} `json:"input"`
	Output      map[string]interface{} `json:"output,omitempty"`
	Error       string                 `json:"error,omitempty"`
	Duration    time.Duration          `json:"duration"`
	CapturedAt  time.Time              `json:"captured_at"`
	Variables   map[string]interface{} `json:"variables"`
}

// VariableWatch represents a watched variable expression
type VariableWatch struct {
	ID         string      `json:"id"`
	Expression string      `json:"expression"`
	Value      interface{} `json:"value,omitempty"`
	Error      string      `json:"error,omitempty"`
}

// NewSession creates a new debug session
func NewSession(executionID, flowID uuid.UUID) *DebugSession {
	return &DebugSession{
		ID:          uuid.New(),
		ExecutionID: executionID,
		FlowID:      flowID,
		State:       StateIdle,
		Breakpoints: make(map[string]*Breakpoint),
		Variables:   make(map[string]interface{}),
		StepOutputs: make(map[string]interface{}),
		StartedAt:   time.Now(),
		StepHistory: make([]StepSnapshot, 0),
	}
}

// SetState updates the session state thread-safely
func (s *DebugSession) SetState(state SessionState) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.State = state
	if state == StatePaused {
		now := time.Now()
		s.PausedAt = &now
	} else {
		s.PausedAt = nil
	}
}

// GetState returns the current session state
func (s *DebugSession) GetState() SessionState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.State
}

// SetCurrentStep updates the current step being executed
func (s *DebugSession) SetCurrentStep(stepID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.CurrentStep = stepID
}

// GetCurrentStep returns the current step ID
func (s *DebugSession) GetCurrentStep() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.CurrentStep
}

// UpdateVariables updates the execution context variables
func (s *DebugSession) UpdateVariables(vars map[string]interface{}) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for k, v := range vars {
		s.Variables[k] = v
	}
}

// GetVariables returns a copy of the current variables
func (s *DebugSession) GetVariables() map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()
	copy := make(map[string]interface{})
	for k, v := range s.Variables {
		copy[k] = v
	}
	return copy
}

// SetStepOutput stores the output of a step
func (s *DebugSession) SetStepOutput(stepID string, output interface{}) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.StepOutputs[stepID] = output
}

// GetStepOutput retrieves the output of a step
func (s *DebugSession) GetStepOutput(stepID string) (interface{}, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	output, ok := s.StepOutputs[stepID]
	return output, ok
}

// AddSnapshot adds a step snapshot to history
func (s *DebugSession) AddSnapshot(snapshot StepSnapshot) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.StepHistory = append(s.StepHistory, snapshot)
}

// GetHistory returns the step execution history
func (s *DebugSession) GetHistory() []StepSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	copy := make([]StepSnapshot, len(s.StepHistory))
	for i, snap := range s.StepHistory {
		copy[i] = snap
	}
	return copy
}

// ToJSON returns a JSON-serializable representation
func (s *DebugSession) ToJSON() map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()

	breakpoints := make([]map[string]interface{}, 0, len(s.Breakpoints))
	for _, bp := range s.Breakpoints {
		breakpoints = append(breakpoints, bp.ToJSON())
	}

	return map[string]interface{}{
		"id":           s.ID.String(),
		"execution_id": s.ExecutionID.String(),
		"flow_id":      s.FlowID.String(),
		"state":        string(s.State),
		"current_step": s.CurrentStep,
		"breakpoints":  breakpoints,
		"variables":    s.Variables,
		"step_outputs": s.StepOutputs,
		"started_at":   s.StartedAt,
		"paused_at":    s.PausedAt,
		"step_count":   len(s.StepHistory),
	}
}
