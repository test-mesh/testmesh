package debugger

import (
	"sync"

	"github.com/google/uuid"
)

// BreakpointType defines the type of breakpoint
type BreakpointType string

const (
	// BreakpointStep pauses before executing a specific step
	BreakpointStep BreakpointType = "step"
	// BreakpointConditional pauses when a condition is met
	BreakpointConditional BreakpointType = "conditional"
	// BreakpointError pauses when any step fails
	BreakpointError BreakpointType = "error"
	// BreakpointAssertion pauses when an assertion fails
	BreakpointAssertion BreakpointType = "assertion"
)

// Breakpoint represents a point where execution should pause
type Breakpoint struct {
	ID        string         `json:"id"`
	Type      BreakpointType `json:"type"`
	StepID    string         `json:"step_id,omitempty"`
	Condition string         `json:"condition,omitempty"`
	Enabled   bool           `json:"enabled"`
	HitCount  int            `json:"hit_count"`
	LogPoint  string         `json:"log_point,omitempty"` // Log message instead of pausing
}

// NewBreakpoint creates a new breakpoint at a step
func NewBreakpoint(stepID string) *Breakpoint {
	return &Breakpoint{
		ID:      uuid.New().String(),
		Type:    BreakpointStep,
		StepID:  stepID,
		Enabled: true,
	}
}

// NewConditionalBreakpoint creates a breakpoint with a condition
func NewConditionalBreakpoint(stepID, condition string) *Breakpoint {
	return &Breakpoint{
		ID:        uuid.New().String(),
		Type:      BreakpointConditional,
		StepID:    stepID,
		Condition: condition,
		Enabled:   true,
	}
}

// NewErrorBreakpoint creates a breakpoint that triggers on errors
func NewErrorBreakpoint() *Breakpoint {
	return &Breakpoint{
		ID:      uuid.New().String(),
		Type:    BreakpointError,
		Enabled: true,
	}
}

// NewAssertionBreakpoint creates a breakpoint for assertion failures
func NewAssertionBreakpoint() *Breakpoint {
	return &Breakpoint{
		ID:      uuid.New().String(),
		Type:    BreakpointAssertion,
		Enabled: true,
	}
}

// Hit increments the hit count and returns whether to pause
func (b *Breakpoint) Hit() bool {
	if !b.Enabled {
		return false
	}
	b.HitCount++
	// If it's a logpoint, we don't pause
	return b.LogPoint == ""
}

// Toggle enables/disables the breakpoint
func (b *Breakpoint) Toggle() {
	b.Enabled = !b.Enabled
}

// SetLogPoint converts this to a logpoint that logs instead of pausing
func (b *Breakpoint) SetLogPoint(message string) {
	b.LogPoint = message
}

// ToJSON returns a JSON-serializable representation
func (b *Breakpoint) ToJSON() map[string]interface{} {
	return map[string]interface{}{
		"id":        b.ID,
		"type":      string(b.Type),
		"step_id":   b.StepID,
		"condition": b.Condition,
		"enabled":   b.Enabled,
		"hit_count": b.HitCount,
		"log_point": b.LogPoint,
	}
}

// BreakpointManager manages breakpoints for a debug session
type BreakpointManager struct {
	breakpoints map[string]*Breakpoint // keyed by breakpoint ID
	stepIndex   map[string][]string    // step_id -> breakpoint IDs
	mu          sync.RWMutex
}

// NewBreakpointManager creates a new breakpoint manager
func NewBreakpointManager() *BreakpointManager {
	return &BreakpointManager{
		breakpoints: make(map[string]*Breakpoint),
		stepIndex:   make(map[string][]string),
	}
}

// Add adds a breakpoint
func (m *BreakpointManager) Add(bp *Breakpoint) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.breakpoints[bp.ID] = bp

	// Index by step ID for fast lookup
	if bp.StepID != "" {
		m.stepIndex[bp.StepID] = append(m.stepIndex[bp.StepID], bp.ID)
	}
}

// Remove removes a breakpoint by ID
func (m *BreakpointManager) Remove(id string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	bp, exists := m.breakpoints[id]
	if !exists {
		return false
	}

	// Remove from step index
	if bp.StepID != "" {
		ids := m.stepIndex[bp.StepID]
		for i, bpID := range ids {
			if bpID == id {
				m.stepIndex[bp.StepID] = append(ids[:i], ids[i+1:]...)
				break
			}
		}
	}

	delete(m.breakpoints, id)
	return true
}

// Get returns a breakpoint by ID
func (m *BreakpointManager) Get(id string) (*Breakpoint, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	bp, ok := m.breakpoints[id]
	return bp, ok
}

// GetForStep returns all breakpoints for a step
func (m *BreakpointManager) GetForStep(stepID string) []*Breakpoint {
	m.mu.RLock()
	defer m.mu.RUnlock()

	ids, exists := m.stepIndex[stepID]
	if !exists {
		return nil
	}

	result := make([]*Breakpoint, 0, len(ids))
	for _, id := range ids {
		if bp, ok := m.breakpoints[id]; ok {
			result = append(result, bp)
		}
	}
	return result
}

// GetErrorBreakpoints returns all error-type breakpoints
func (m *BreakpointManager) GetErrorBreakpoints() []*Breakpoint {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*Breakpoint, 0)
	for _, bp := range m.breakpoints {
		if bp.Type == BreakpointError && bp.Enabled {
			result = append(result, bp)
		}
	}
	return result
}

// GetAssertionBreakpoints returns all assertion-type breakpoints
func (m *BreakpointManager) GetAssertionBreakpoints() []*Breakpoint {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*Breakpoint, 0)
	for _, bp := range m.breakpoints {
		if bp.Type == BreakpointAssertion && bp.Enabled {
			result = append(result, bp)
		}
	}
	return result
}

// List returns all breakpoints
func (m *BreakpointManager) List() []*Breakpoint {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*Breakpoint, 0, len(m.breakpoints))
	for _, bp := range m.breakpoints {
		result = append(result, bp)
	}
	return result
}

// Toggle toggles a breakpoint's enabled state
func (m *BreakpointManager) Toggle(id string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	bp, exists := m.breakpoints[id]
	if !exists {
		return false
	}
	bp.Toggle()
	return true
}

// Clear removes all breakpoints
func (m *BreakpointManager) Clear() {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.breakpoints = make(map[string]*Breakpoint)
	m.stepIndex = make(map[string][]string)
}

// EnableAll enables all breakpoints
func (m *BreakpointManager) EnableAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, bp := range m.breakpoints {
		bp.Enabled = true
	}
}

// DisableAll disables all breakpoints
func (m *BreakpointManager) DisableAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, bp := range m.breakpoints {
		bp.Enabled = false
	}
}
