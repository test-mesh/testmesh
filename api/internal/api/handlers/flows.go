package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/georgi-georgiev/testmesh/internal/api/middleware"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gopkg.in/yaml.v3"
)

// FlowHandler handles flow-related requests
type FlowHandler struct {
	repo   *repository.FlowRepository
	logger *zap.Logger
}

// NewFlowHandler creates a new flow handler
func NewFlowHandler(repo *repository.FlowRepository, logger *zap.Logger) *FlowHandler {
	return &FlowHandler{
		repo:   repo,
		logger: logger,
	}
}

// Create handles POST /api/v1/workspaces/:workspace_id/flows
func (h *FlowHandler) Create(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	var req struct {
		YAML string `json:"yaml" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Parse YAML - supports both wrapped (flow:) and unwrapped formats
	definition, err := parseFlowYAML(req.YAML)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid YAML: " + err.Error()})
		return
	}

	// Create flow model
	flow := &models.Flow{
		Name:        definition.Name,
		Description: definition.Description,
		Suite:       definition.Suite,
		Tags:        definition.Tags,
		Definition:  definition,
		Environment: "default",
	}

	if err := h.repo.Create(flow, workspaceID); err != nil {
		h.logger.Error("Failed to create flow", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create flow"})
		return
	}

	c.JSON(http.StatusCreated, flow)
}

// List handles GET /api/v1/workspaces/:workspace_id/flows
func (h *FlowHandler) List(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	suite := c.Query("suite")
	tags := c.QueryArray("tags")
	limit := 20
	offset := 0
	if v, err := strconv.Atoi(c.Query("limit")); err == nil && v > 0 {
		limit = v
	}
	if v, err := strconv.Atoi(c.Query("offset")); err == nil && v >= 0 {
		offset = v
	}

	flows, total, err := h.repo.List(workspaceID, suite, tags, limit, offset)
	if err != nil {
		h.logger.Error("Failed to list flows", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list flows"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"flows":  flows,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// Get handles GET /api/v1/workspaces/:workspace_id/flows/:id
func (h *FlowHandler) Get(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid flow ID"})
		return
	}

	flow, err := h.repo.GetByID(id, workspaceID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "flow not found"})
		return
	}

	c.JSON(http.StatusOK, flow)
}

// Update handles PUT /api/v1/workspaces/:workspace_id/flows/:id
func (h *FlowHandler) Update(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid flow ID"})
		return
	}

	flow, err := h.repo.GetByID(id, workspaceID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "flow not found"})
		return
	}

	var req struct {
		YAML string `json:"yaml" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Parse YAML - supports both wrapped (flow:) and unwrapped formats
	definition, err := parseFlowYAML(req.YAML)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid YAML: " + err.Error()})
		return
	}

	// Update flow
	flow.Name = definition.Name
	flow.Description = definition.Description
	flow.Suite = definition.Suite
	flow.Tags = definition.Tags
	flow.Definition = definition

	if err := h.repo.Update(flow, workspaceID); err != nil {
		h.logger.Error("Failed to update flow", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update flow"})
		return
	}

	c.JSON(http.StatusOK, flow)
}

// Delete handles DELETE /api/v1/workspaces/:workspace_id/flows/:id
func (h *FlowHandler) Delete(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid flow ID"})
		return
	}

	if err := h.repo.Delete(id, workspaceID); err != nil {
		h.logger.Error("Failed to delete flow", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete flow"})
		return
	}

	c.JSON(http.StatusNoContent, nil)
}

// parseFlowYAML parses YAML supporting both wrapped (flow:) and unwrapped formats
func parseFlowYAML(yamlContent string) (models.FlowDefinition, error) {
	// First try wrapped format: flow: { name: ..., steps: ... }
	var wrapped struct {
		Flow models.FlowDefinition `yaml:"flow"`
	}
	if err := yaml.Unmarshal([]byte(yamlContent), &wrapped); err != nil {
		return models.FlowDefinition{}, err
	}

	// If wrapped format worked (has name or steps), use it
	if wrapped.Flow.Name != "" || len(wrapped.Flow.Steps) > 0 {
		return wrapped.Flow, nil
	}

	// Otherwise try unwrapped format: name: ..., steps: ...
	var definition models.FlowDefinition
	if err := yaml.Unmarshal([]byte(yamlContent), &definition); err != nil {
		return models.FlowDefinition{}, err
	}

	return definition, nil
}
