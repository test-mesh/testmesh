package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/georgi-georgiev/testmesh/internal/api/middleware"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// GitTriggerRuleHandler handles git trigger rule requests
type GitTriggerRuleHandler struct {
	repo   *repository.GitTriggerRuleRepository
	logger *zap.Logger
}

// NewGitTriggerRuleHandler creates a new git trigger rule handler
func NewGitTriggerRuleHandler(repo *repository.GitTriggerRuleRepository, logger *zap.Logger) *GitTriggerRuleHandler {
	return &GitTriggerRuleHandler{
		repo:   repo,
		logger: logger,
	}
}

// CreateGitTriggerRuleRequest represents a request to create a git trigger rule
type CreateGitTriggerRuleRequest struct {
	IntegrationID string   `json:"integration_id" binding:"required"`
	Name          string   `json:"name" binding:"required"`
	Repository    string   `json:"repository" binding:"required"` // "owner/repo"
	BranchFilter  string   `json:"branch_filter"`
	EventTypes    []string `json:"event_types"`
	TriggerMode   string   `json:"trigger_mode" binding:"required"` // "schedule" or "direct"
	ScheduleID    string   `json:"schedule_id"`
	FlowID        string   `json:"flow_id"`
	Enabled       bool     `json:"enabled"`
}

// UpdateGitTriggerRuleRequest represents a request to update a git trigger rule
type UpdateGitTriggerRuleRequest struct {
	Name         string   `json:"name"`
	BranchFilter string   `json:"branch_filter"`
	EventTypes   []string `json:"event_types"`
	TriggerMode  string   `json:"trigger_mode"`
	ScheduleID   string   `json:"schedule_id"`
	FlowID       string   `json:"flow_id"`
	Enabled      *bool    `json:"enabled"`
}

// List handles GET /api/v1/workspaces/:workspace_id/git-trigger-rules
func (h *GitTriggerRuleHandler) List(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace_id is required"})
		return
	}

	rules, err := h.repo.List(workspaceID)
	if err != nil {
		h.logger.Error("Failed to list git trigger rules", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list git trigger rules"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"rules": rules,
		"total": len(rules),
	})
}

// Create handles POST /api/v1/workspaces/:workspace_id/git-trigger-rules
func (h *GitTriggerRuleHandler) Create(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace_id is required"})
		return
	}

	var req CreateGitTriggerRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Parse integration ID
	integrationID, err := uuid.Parse(req.IntegrationID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid integration_id"})
		return
	}

	// Validate trigger mode
	triggerMode := models.TriggerMode(req.TriggerMode)
	if triggerMode != models.TriggerModeSchedule && triggerMode != models.TriggerModeDirect {
		c.JSON(http.StatusBadRequest, gin.H{"error": "trigger_mode must be 'schedule' or 'direct'"})
		return
	}

	// Create rule
	rule := &models.GitTriggerRule{
		WorkspaceID:   workspaceID,
		IntegrationID: integrationID,
		Name:          req.Name,
		Repository:    req.Repository,
		BranchFilter:  req.BranchFilter,
		TriggerMode:   triggerMode,
		Enabled:       req.Enabled,
	}

	// Set default branch filter
	if rule.BranchFilter == "" {
		rule.BranchFilter = "*"
	}

	// Set event types
	if len(req.EventTypes) > 0 {
		rule.EventTypes = req.EventTypes
	}

	// Validate and set target (schedule or flow)
	if triggerMode == models.TriggerModeSchedule {
		if req.ScheduleID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "schedule_id is required for schedule trigger mode"})
			return
		}
		scheduleID, err := uuid.Parse(req.ScheduleID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid schedule_id"})
			return
		}
		rule.ScheduleID = &scheduleID
	} else if triggerMode == models.TriggerModeDirect {
		if req.FlowID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "flow_id is required for direct trigger mode"})
			return
		}
		flowID, err := uuid.Parse(req.FlowID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid flow_id"})
			return
		}
		rule.FlowID = &flowID
	}

	if err := h.repo.Create(rule); err != nil {
		h.logger.Error("Failed to create git trigger rule", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create git trigger rule"})
		return
	}

	// Load rule with relations
	rule, _ = h.repo.Get(rule.ID)

	c.JSON(http.StatusCreated, rule)
}

// Get handles GET /api/v1/workspaces/:workspace_id/git-trigger-rules/:id
func (h *GitTriggerRuleHandler) Get(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid rule ID"})
		return
	}

	rule, err := h.repo.Get(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Git trigger rule not found"})
		return
	}

	// Verify workspace access
	workspaceID := middleware.GetWorkspaceID(c)
	if rule.WorkspaceID != workspaceID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		return
	}

	c.JSON(http.StatusOK, rule)
}

// Update handles PUT /api/v1/workspaces/:workspace_id/git-trigger-rules/:id
func (h *GitTriggerRuleHandler) Update(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid rule ID"})
		return
	}

	var req UpdateGitTriggerRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Load existing rule
	rule, err := h.repo.Get(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Git trigger rule not found"})
		return
	}

	// Verify workspace access
	workspaceID := middleware.GetWorkspaceID(c)
	if rule.WorkspaceID != workspaceID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		return
	}

	// Update fields
	if req.Name != "" {
		rule.Name = req.Name
	}
	if req.BranchFilter != "" {
		rule.BranchFilter = req.BranchFilter
	}
	if len(req.EventTypes) > 0 {
		rule.EventTypes = req.EventTypes
	}
	if req.Enabled != nil {
		rule.Enabled = *req.Enabled
	}

	// Update trigger mode and target if provided
	if req.TriggerMode != "" {
		triggerMode := models.TriggerMode(req.TriggerMode)
		if triggerMode != models.TriggerModeSchedule && triggerMode != models.TriggerModeDirect {
			c.JSON(http.StatusBadRequest, gin.H{"error": "trigger_mode must be 'schedule' or 'direct'"})
			return
		}
		rule.TriggerMode = triggerMode

		// Update target based on mode
		if triggerMode == models.TriggerModeSchedule {
			if req.ScheduleID == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "schedule_id is required for schedule trigger mode"})
				return
			}
			scheduleID, err := uuid.Parse(req.ScheduleID)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid schedule_id"})
				return
			}
			rule.ScheduleID = &scheduleID
			rule.FlowID = nil
		} else {
			if req.FlowID == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "flow_id is required for direct trigger mode"})
				return
			}
			flowID, err := uuid.Parse(req.FlowID)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid flow_id"})
				return
			}
			rule.FlowID = &flowID
			rule.ScheduleID = nil
		}
	}

	if err := h.repo.Update(rule); err != nil {
		h.logger.Error("Failed to update git trigger rule", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update git trigger rule"})
		return
	}

	// Reload rule with relations
	rule, _ = h.repo.Get(rule.ID)

	c.JSON(http.StatusOK, rule)
}

// Delete handles DELETE /api/v1/workspaces/:workspace_id/git-trigger-rules/:id
func (h *GitTriggerRuleHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid rule ID"})
		return
	}

	// Load rule to verify workspace access
	rule, err := h.repo.Get(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Git trigger rule not found"})
		return
	}

	// Verify workspace access
	workspaceID := middleware.GetWorkspaceID(c)
	if rule.WorkspaceID != workspaceID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		return
	}

	if err := h.repo.Delete(id); err != nil {
		h.logger.Error("Failed to delete git trigger rule", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete git trigger rule"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Git trigger rule deleted successfully"})
}
