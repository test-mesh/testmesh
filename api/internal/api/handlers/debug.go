package handlers

import (
	"net/http"

	"github.com/georgi-georgiev/testmesh/internal/runner/debugger"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// DebugHandler handles debug-related HTTP requests
type DebugHandler struct {
	controller *debugger.Controller
	logger     *zap.Logger
}

// NewDebugHandler creates a new debug handler
func NewDebugHandler(controller *debugger.Controller, logger *zap.Logger) *DebugHandler {
	return &DebugHandler{
		controller: controller,
		logger:     logger,
	}
}

// StartSessionRequest is the request body for starting a debug session
type StartSessionRequest struct {
	ExecutionID string `json:"execution_id" binding:"required"`
	FlowID      string `json:"flow_id" binding:"required"`
}

// StartSession creates a new debug session
// POST /api/v1/debug/sessions
func (h *DebugHandler) StartSession(c *gin.Context) {
	var req StartSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	executionID, err := uuid.Parse(req.ExecutionID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid execution_id"})
		return
	}

	flowID, err := uuid.Parse(req.FlowID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid flow_id"})
		return
	}

	session, err := h.controller.StartSession(executionID, flowID)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"session": session.ToJSON(),
	})
}

// EndSession terminates a debug session
// DELETE /api/v1/debug/sessions/:id
func (h *DebugHandler) EndSession(c *gin.Context) {
	executionID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid execution id"})
		return
	}

	if err := h.controller.EndSession(executionID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "session ended"})
}

// GetSession returns the current state of a debug session
// GET /api/v1/debug/sessions/:id
func (h *DebugHandler) GetSession(c *gin.Context) {
	executionID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid execution id"})
		return
	}

	session, ok := h.controller.GetSession(executionID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"session": session.ToJSON(),
	})
}

// ListSessions returns all active debug sessions
// GET /api/v1/debug/sessions
func (h *DebugHandler) ListSessions(c *gin.Context) {
	sessions := h.controller.ListSessions()
	result := make([]map[string]interface{}, len(sessions))
	for i, s := range sessions {
		result[i] = s.ToJSON()
	}

	c.JSON(http.StatusOK, gin.H{
		"sessions": result,
	})
}

// AddBreakpointRequest is the request body for adding a breakpoint
type AddBreakpointRequest struct {
	StepID    string `json:"step_id"`
	Type      string `json:"type"` // "step", "conditional", "error", "assertion"
	Condition string `json:"condition,omitempty"`
	LogPoint  string `json:"log_point,omitempty"`
}

// AddBreakpoint adds a breakpoint to a debug session
// POST /api/v1/debug/sessions/:id/breakpoints
func (h *DebugHandler) AddBreakpoint(c *gin.Context) {
	executionID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid execution id"})
		return
	}

	var req AddBreakpointRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var bp *debugger.Breakpoint
	switch req.Type {
	case "conditional":
		bp = debugger.NewConditionalBreakpoint(req.StepID, req.Condition)
	case "error":
		bp = debugger.NewErrorBreakpoint()
	case "assertion":
		bp = debugger.NewAssertionBreakpoint()
	default:
		bp = debugger.NewBreakpoint(req.StepID)
	}

	if req.LogPoint != "" {
		bp.SetLogPoint(req.LogPoint)
	}

	if err := h.controller.AddBreakpoint(executionID, bp); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"breakpoint": bp.ToJSON(),
	})
}

// RemoveBreakpoint removes a breakpoint from a debug session
// DELETE /api/v1/debug/sessions/:id/breakpoints/:breakpoint_id
func (h *DebugHandler) RemoveBreakpoint(c *gin.Context) {
	executionID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid execution id"})
		return
	}

	breakpointID := c.Param("breakpoint_id")
	if err := h.controller.RemoveBreakpoint(executionID, breakpointID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "breakpoint removed"})
}

// ListBreakpoints returns all breakpoints for a debug session
// GET /api/v1/debug/sessions/:id/breakpoints
func (h *DebugHandler) ListBreakpoints(c *gin.Context) {
	executionID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid execution id"})
		return
	}

	bm, ok := h.controller.GetBreakpointManager(executionID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}

	breakpoints := bm.List()
	result := make([]map[string]interface{}, len(breakpoints))
	for i, bp := range breakpoints {
		result[i] = bp.ToJSON()
	}

	c.JSON(http.StatusOK, gin.H{
		"breakpoints": result,
	})
}

// ToggleBreakpoint toggles a breakpoint's enabled state
// POST /api/v1/debug/sessions/:id/breakpoints/:breakpoint_id/toggle
func (h *DebugHandler) ToggleBreakpoint(c *gin.Context) {
	executionID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid execution id"})
		return
	}

	breakpointID := c.Param("breakpoint_id")

	bm, ok := h.controller.GetBreakpointManager(executionID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}

	if !bm.Toggle(breakpointID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "breakpoint not found"})
		return
	}

	bp, _ := bm.Get(breakpointID)
	c.JSON(http.StatusOK, gin.H{
		"breakpoint": bp.ToJSON(),
	})
}

// Pause pauses execution
// POST /api/v1/debug/sessions/:id/pause
func (h *DebugHandler) Pause(c *gin.Context) {
	executionID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid execution id"})
		return
	}

	if err := h.controller.Pause(executionID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "paused"})
}

// Resume resumes a paused execution
// POST /api/v1/debug/sessions/:id/resume
func (h *DebugHandler) Resume(c *gin.Context) {
	executionID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid execution id"})
		return
	}

	if err := h.controller.Resume(executionID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "resumed"})
}

// StepOver advances to the next step
// POST /api/v1/debug/sessions/:id/step-over
func (h *DebugHandler) StepOver(c *gin.Context) {
	executionID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid execution id"})
		return
	}

	if err := h.controller.StepOver(executionID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "stepping"})
}

// Stop terminates execution
// POST /api/v1/debug/sessions/:id/stop
func (h *DebugHandler) Stop(c *gin.Context) {
	executionID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid execution id"})
		return
	}

	if err := h.controller.Stop(executionID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "stopped"})
}

// GetState returns the current execution state including variables
// GET /api/v1/debug/sessions/:id/state
func (h *DebugHandler) GetState(c *gin.Context) {
	executionID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid execution id"})
		return
	}

	session, ok := h.controller.GetSession(executionID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"state":        string(session.GetState()),
		"current_step": session.GetCurrentStep(),
		"variables":    session.GetVariables(),
		"step_outputs": session.StepOutputs,
	})
}

// GetHistory returns the step execution history
// GET /api/v1/debug/sessions/:id/history
func (h *DebugHandler) GetHistory(c *gin.Context) {
	executionID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid execution id"})
		return
	}

	session, ok := h.controller.GetSession(executionID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}

	history := session.GetHistory()
	c.JSON(http.StatusOK, gin.H{
		"history": history,
	})
}
