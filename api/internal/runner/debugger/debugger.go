package debugger

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

// DebugCommand represents a command sent to the debugger
type DebugCommand string

const (
	CommandPause    DebugCommand = "pause"
	CommandResume   DebugCommand = "resume"
	CommandStepOver DebugCommand = "step_over"
	CommandStepInto DebugCommand = "step_into"
	CommandStepOut  DebugCommand = "step_out"
	CommandStop     DebugCommand = "stop"
)

// DebugEvent represents an event emitted by the debugger
type DebugEvent struct {
	Type      string                 `json:"type"`
	SessionID uuid.UUID              `json:"session_id"`
	StepID    string                 `json:"step_id,omitempty"`
	Data      map[string]interface{} `json:"data,omitempty"`
	Timestamp time.Time              `json:"timestamp"`
}

// DebugEventHandler handles debug events (typically WebSocket broadcasting)
type DebugEventHandler interface {
	BroadcastDebugEvent(executionID uuid.UUID, event *DebugEvent)
}

// Controller manages debug sessions and coordinates with the executor
type Controller struct {
	sessions     map[uuid.UUID]*DebugSession
	breakpoints  map[uuid.UUID]*BreakpointManager
	commands     map[uuid.UUID]chan DebugCommand
	pauseSignals map[uuid.UUID]chan struct{}
	eventHandler DebugEventHandler
	logger       *zap.Logger
	mu           sync.RWMutex
}

// NewController creates a new debug controller
func NewController(logger *zap.Logger) *Controller {
	return &Controller{
		sessions:     make(map[uuid.UUID]*DebugSession),
		breakpoints:  make(map[uuid.UUID]*BreakpointManager),
		commands:     make(map[uuid.UUID]chan DebugCommand),
		pauseSignals: make(map[uuid.UUID]chan struct{}),
		logger:       logger,
	}
}

// SetEventHandler sets the handler for debug events
func (c *Controller) SetEventHandler(handler DebugEventHandler) {
	c.eventHandler = handler
}

// StartSession creates a new debug session for an execution
func (c *Controller) StartSession(executionID, flowID uuid.UUID) (*DebugSession, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Check if session already exists
	if _, exists := c.sessions[executionID]; exists {
		return nil, fmt.Errorf("debug session already exists for execution %s", executionID)
	}

	session := NewSession(executionID, flowID)
	c.sessions[executionID] = session
	c.breakpoints[executionID] = NewBreakpointManager()
	c.commands[executionID] = make(chan DebugCommand, 10)
	c.pauseSignals[executionID] = make(chan struct{}, 1)

	c.logger.Info("Debug session started",
		zap.String("session_id", session.ID.String()),
		zap.String("execution_id", executionID.String()),
	)

	return session, nil
}

// EndSession terminates a debug session
func (c *Controller) EndSession(executionID uuid.UUID) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	session, exists := c.sessions[executionID]
	if !exists {
		return fmt.Errorf("no debug session found for execution %s", executionID)
	}

	session.SetState(StateTerminated)

	// Close channels
	if cmd, ok := c.commands[executionID]; ok {
		close(cmd)
		delete(c.commands, executionID)
	}
	if pause, ok := c.pauseSignals[executionID]; ok {
		close(pause)
		delete(c.pauseSignals, executionID)
	}

	delete(c.sessions, executionID)
	delete(c.breakpoints, executionID)

	c.logger.Info("Debug session ended",
		zap.String("session_id", session.ID.String()),
		zap.String("execution_id", executionID.String()),
	)

	return nil
}

// GetSession returns a debug session by execution ID
func (c *Controller) GetSession(executionID uuid.UUID) (*DebugSession, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	session, ok := c.sessions[executionID]
	return session, ok
}

// GetBreakpointManager returns the breakpoint manager for an execution
func (c *Controller) GetBreakpointManager(executionID uuid.UUID) (*BreakpointManager, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	bm, ok := c.breakpoints[executionID]
	return bm, ok
}

// AddBreakpoint adds a breakpoint to an execution's session
func (c *Controller) AddBreakpoint(executionID uuid.UUID, bp *Breakpoint) error {
	bm, ok := c.GetBreakpointManager(executionID)
	if !ok {
		return fmt.Errorf("no debug session found for execution %s", executionID)
	}

	bm.Add(bp)

	session, _ := c.GetSession(executionID)
	session.mu.Lock()
	session.Breakpoints[bp.ID] = bp
	session.mu.Unlock()

	c.logger.Debug("Breakpoint added",
		zap.String("execution_id", executionID.String()),
		zap.String("breakpoint_id", bp.ID),
		zap.String("step_id", bp.StepID),
	)

	return nil
}

// RemoveBreakpoint removes a breakpoint from an execution's session
func (c *Controller) RemoveBreakpoint(executionID uuid.UUID, breakpointID string) error {
	bm, ok := c.GetBreakpointManager(executionID)
	if !ok {
		return fmt.Errorf("no debug session found for execution %s", executionID)
	}

	if !bm.Remove(breakpointID) {
		return fmt.Errorf("breakpoint %s not found", breakpointID)
	}

	session, _ := c.GetSession(executionID)
	session.mu.Lock()
	delete(session.Breakpoints, breakpointID)
	session.mu.Unlock()

	return nil
}

// SendCommand sends a command to a debug session
func (c *Controller) SendCommand(executionID uuid.UUID, cmd DebugCommand) error {
	c.mu.RLock()
	cmdChan, ok := c.commands[executionID]
	c.mu.RUnlock()

	if !ok {
		return fmt.Errorf("no debug session found for execution %s", executionID)
	}

	select {
	case cmdChan <- cmd:
		c.logger.Debug("Debug command sent",
			zap.String("execution_id", executionID.String()),
			zap.String("command", string(cmd)),
		)
		return nil
	default:
		return fmt.Errorf("command channel full for execution %s", executionID)
	}
}

// Pause pauses the execution
func (c *Controller) Pause(executionID uuid.UUID) error {
	session, ok := c.GetSession(executionID)
	if !ok {
		return fmt.Errorf("no debug session found for execution %s", executionID)
	}

	if session.GetState() != StateRunning {
		return fmt.Errorf("execution is not running")
	}

	return c.SendCommand(executionID, CommandPause)
}

// Resume resumes a paused execution
func (c *Controller) Resume(executionID uuid.UUID) error {
	session, ok := c.GetSession(executionID)
	if !ok {
		return fmt.Errorf("no debug session found for execution %s", executionID)
	}

	if session.GetState() != StatePaused {
		return fmt.Errorf("execution is not paused")
	}

	// Signal resume
	c.mu.RLock()
	pauseChan, ok := c.pauseSignals[executionID]
	c.mu.RUnlock()

	if ok {
		select {
		case pauseChan <- struct{}{}:
		default:
		}
	}

	session.SetState(StateRunning)
	c.emitEvent(executionID, "debug.resumed", nil)

	return nil
}

// StepOver advances to the next step
func (c *Controller) StepOver(executionID uuid.UUID) error {
	session, ok := c.GetSession(executionID)
	if !ok {
		return fmt.Errorf("no debug session found for execution %s", executionID)
	}

	if session.GetState() != StatePaused {
		return fmt.Errorf("execution is not paused")
	}

	session.SetState(StateStepping)

	// Signal to continue to next step
	c.mu.RLock()
	pauseChan, ok := c.pauseSignals[executionID]
	c.mu.RUnlock()

	if ok {
		select {
		case pauseChan <- struct{}{}:
		default:
		}
	}

	return nil
}

// Stop terminates the execution
func (c *Controller) Stop(executionID uuid.UUID) error {
	return c.SendCommand(executionID, CommandStop)
}

// OnBeforeStep is called by the executor before each step
// Returns true if execution should continue, false if stopped
func (c *Controller) OnBeforeStep(ctx context.Context, executionID uuid.UUID, stepID, stepName, action string, config map[string]interface{}) (bool, error) {
	session, ok := c.GetSession(executionID)
	if !ok {
		// No debug session, continue normally
		return true, nil
	}

	session.SetCurrentStep(stepID)
	session.SetState(StateRunning)

	// Check for breakpoints
	bm, _ := c.GetBreakpointManager(executionID)
	breakpoints := bm.GetForStep(stepID)

	shouldPause := false
	for _, bp := range breakpoints {
		if bp.Hit() {
			shouldPause = true
			c.emitEvent(executionID, "debug.breakpoint.hit", map[string]interface{}{
				"breakpoint_id": bp.ID,
				"step_id":       stepID,
				"step_name":     stepName,
			})
		}
		// Handle logpoints
		if bp.LogPoint != "" {
			c.logger.Info("Logpoint",
				zap.String("step_id", stepID),
				zap.String("message", bp.LogPoint),
			)
		}
	}

	// Check for pause command
	select {
	case cmd := <-c.commands[executionID]:
		switch cmd {
		case CommandPause:
			shouldPause = true
		case CommandStop:
			return false, fmt.Errorf("execution stopped by user")
		}
	default:
	}

	// If stepping mode, always pause before step
	if session.GetState() == StateStepping {
		shouldPause = true
	}

	if shouldPause {
		return c.waitForResume(ctx, executionID, stepID, stepName, action, config)
	}

	return true, nil
}

// waitForResume pauses execution and waits for resume signal
func (c *Controller) waitForResume(ctx context.Context, executionID uuid.UUID, stepID, stepName, action string, config map[string]interface{}) (bool, error) {
	session, _ := c.GetSession(executionID)
	session.SetState(StatePaused)

	c.emitEvent(executionID, "debug.paused", map[string]interface{}{
		"step_id":   stepID,
		"step_name": stepName,
		"action":    action,
		"config":    config,
		"variables": session.GetVariables(),
	})

	c.logger.Info("Execution paused",
		zap.String("execution_id", executionID.String()),
		zap.String("step_id", stepID),
	)

	c.mu.RLock()
	pauseChan := c.pauseSignals[executionID]
	cmdChan := c.commands[executionID]
	c.mu.RUnlock()

	// Wait for resume signal or context cancellation
	for {
		select {
		case <-ctx.Done():
			return false, ctx.Err()
		case <-pauseChan:
			// Check if we should step or continue
			state := session.GetState()
			if state == StateStepping {
				// After stepping, pause again at next step
				session.SetState(StateRunning)
			}
			c.emitEvent(executionID, "debug.step", map[string]interface{}{
				"step_id":   stepID,
				"step_name": stepName,
			})
			return true, nil
		case cmd := <-cmdChan:
			switch cmd {
			case CommandStop:
				return false, fmt.Errorf("execution stopped by user")
			case CommandResume:
				session.SetState(StateRunning)
				return true, nil
			}
		}
	}
}

// OnAfterStep is called by the executor after each step completes
func (c *Controller) OnAfterStep(executionID uuid.UUID, stepID string, output map[string]interface{}, err error, duration time.Duration) {
	session, ok := c.GetSession(executionID)
	if !ok {
		return
	}

	// Update step output
	session.SetStepOutput(stepID, output)

	// Create snapshot
	snapshot := StepSnapshot{
		StepID:     stepID,
		Output:     output,
		Duration:   duration,
		CapturedAt: time.Now(),
		Variables:  session.GetVariables(),
	}
	if err != nil {
		snapshot.Error = err.Error()
	}
	session.AddSnapshot(snapshot)

	// Check for error breakpoints
	if err != nil {
		bm, _ := c.GetBreakpointManager(executionID)
		for _, bp := range bm.GetErrorBreakpoints() {
			bp.Hit()
			c.emitEvent(executionID, "debug.error", map[string]interface{}{
				"step_id": stepID,
				"error":   err.Error(),
			})
		}
	}

	c.emitEvent(executionID, "debug.variables", map[string]interface{}{
		"step_id":      stepID,
		"step_outputs": session.StepOutputs,
		"variables":    session.GetVariables(),
	})
}

// UpdateVariables updates the session variables from the executor context
func (c *Controller) UpdateVariables(executionID uuid.UUID, vars map[string]interface{}) {
	session, ok := c.GetSession(executionID)
	if !ok {
		return
	}
	session.UpdateVariables(vars)
}

// emitEvent broadcasts a debug event
func (c *Controller) emitEvent(executionID uuid.UUID, eventType string, data map[string]interface{}) {
	session, ok := c.GetSession(executionID)
	if !ok {
		return
	}

	event := &DebugEvent{
		Type:      eventType,
		SessionID: session.ID,
		Timestamp: time.Now(),
		Data:      data,
	}

	if stepID, ok := data["step_id"].(string); ok {
		event.StepID = stepID
	}

	if c.eventHandler != nil {
		c.eventHandler.BroadcastDebugEvent(executionID, event)
	}
}

// ListSessions returns all active debug sessions
func (c *Controller) ListSessions() []*DebugSession {
	c.mu.RLock()
	defer c.mu.RUnlock()

	sessions := make([]*DebugSession, 0, len(c.sessions))
	for _, s := range c.sessions {
		sessions = append(sessions, s)
	}
	return sessions
}
