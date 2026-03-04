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

// EnvironmentHandler handles environment-related requests
type EnvironmentHandler struct {
	repo   *repository.EnvironmentRepository
	logger *zap.Logger
}

// NewEnvironmentHandler creates a new environment handler
func NewEnvironmentHandler(repo *repository.EnvironmentRepository, logger *zap.Logger) *EnvironmentHandler {
	return &EnvironmentHandler{
		repo:   repo,
		logger: logger,
	}
}

// CreateEnvironmentRequest represents a request to create an environment
type CreateEnvironmentRequest struct {
	Name        string                       `json:"name" binding:"required"`
	Description string                       `json:"description"`
	Color       string                       `json:"color"`
	IsDefault   bool                         `json:"is_default"`
	Variables   []models.EnvironmentVariable `json:"variables"`
}

// UpdateEnvironmentRequest represents a request to update an environment
type UpdateEnvironmentRequest struct {
	Name        *string                       `json:"name"`
	Description *string                       `json:"description"`
	Color       *string                       `json:"color"`
	IsDefault   *bool                         `json:"is_default"`
	Variables   *[]models.EnvironmentVariable `json:"variables"`
}

// List handles GET /api/v1/workspaces/:workspace_id/environments
func (h *EnvironmentHandler) List(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	params := &repository.ListEnvironmentsParams{
		Search: c.Query("search"),
		Limit:  50, // Default limit
	}

	environments, total, err := h.repo.List(workspaceID, params)
	if err != nil {
		h.logger.Error("Failed to list environments", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list environments"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"environments": environments,
		"total":        total,
	})
}

// Get handles GET /api/v1/workspaces/:workspace_id/environments/:id
func (h *EnvironmentHandler) Get(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid environment ID"})
		return
	}

	env, err := h.repo.GetByID(id, workspaceID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Environment not found"})
		return
	}

	c.JSON(http.StatusOK, env)
}

// GetDefault handles GET /api/v1/workspaces/:workspace_id/environments/default
func (h *EnvironmentHandler) GetDefault(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	env, err := h.repo.GetDefault(workspaceID)
	if err != nil {
		// Return empty default if none exists
		c.JSON(http.StatusOK, gin.H{
			"id":        nil,
			"name":      "No Environment",
			"variables": []models.EnvironmentVariable{},
		})
		return
	}

	c.JSON(http.StatusOK, env)
}

// Create handles POST /api/v1/workspaces/:workspace_id/environments
func (h *EnvironmentHandler) Create(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	var req CreateEnvironmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Default color if not provided
	if req.Color == "" {
		req.Color = "#6B7280" // Gray
	}

	env := &models.Environment{
		Name:        req.Name,
		Description: req.Description,
		Color:       req.Color,
		IsDefault:   req.IsDefault,
		Variables:   req.Variables,
	}

	if err := h.repo.Create(env, workspaceID); err != nil {
		h.logger.Error("Failed to create environment", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create environment"})
		return
	}

	h.logger.Info("Created environment",
		zap.String("id", env.ID.String()),
		zap.String("name", env.Name),
		zap.String("workspace_id", workspaceID.String()))

	c.JSON(http.StatusCreated, env)
}

// Update handles PUT /api/v1/workspaces/:workspace_id/environments/:id
func (h *EnvironmentHandler) Update(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid environment ID"})
		return
	}

	env, err := h.repo.GetByID(id, workspaceID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Environment not found"})
		return
	}

	var req UpdateEnvironmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Apply updates
	if req.Name != nil {
		env.Name = *req.Name
	}
	if req.Description != nil {
		env.Description = *req.Description
	}
	if req.Color != nil {
		env.Color = *req.Color
	}
	if req.IsDefault != nil {
		env.IsDefault = *req.IsDefault
	}
	if req.Variables != nil {
		env.Variables = *req.Variables
	}

	if err := h.repo.Update(env, workspaceID); err != nil {
		h.logger.Error("Failed to update environment", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update environment"})
		return
	}

	c.JSON(http.StatusOK, env)
}

// Delete handles DELETE /api/v1/workspaces/:workspace_id/environments/:id
func (h *EnvironmentHandler) Delete(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid environment ID"})
		return
	}

	if err := h.repo.Delete(id, workspaceID); err != nil {
		if err.Error() == "cannot delete the default environment" {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		h.logger.Error("Failed to delete environment", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete environment"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Environment deleted"})
}

// SetDefault handles POST /api/v1/workspaces/:workspace_id/environments/:id/default
func (h *EnvironmentHandler) SetDefault(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid environment ID"})
		return
	}

	if err := h.repo.SetDefault(id, workspaceID); err != nil {
		h.logger.Error("Failed to set default environment", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to set default environment"})
		return
	}

	env, _ := h.repo.GetByID(id, workspaceID)
	c.JSON(http.StatusOK, env)
}

// Duplicate handles POST /api/v1/workspaces/:workspace_id/environments/:id/duplicate
func (h *EnvironmentHandler) Duplicate(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid environment ID"})
		return
	}

	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	newEnv, err := h.repo.Duplicate(id, req.Name, workspaceID)
	if err != nil {
		h.logger.Error("Failed to duplicate environment", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to duplicate environment"})
		return
	}

	c.JSON(http.StatusCreated, newEnv)
}

// Export handles GET /api/v1/workspaces/:workspace_id/environments/:id/export
func (h *EnvironmentHandler) Export(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid environment ID"})
		return
	}

	env, err := h.repo.GetByID(id, workspaceID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Environment not found"})
		return
	}

	// Check if secrets should be included
	includeSecrets := c.Query("include_secrets") == "true"

	export := env.Export(includeSecrets)
	c.JSON(http.StatusOK, export)
}

// Import handles POST /api/v1/workspaces/:workspace_id/environments/import
func (h *EnvironmentHandler) Import(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	if workspaceID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace context required"})
		return
	}

	var req models.EnvironmentExport
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	env := &models.Environment{
		Name:        req.Name,
		Description: req.Description,
		Variables:   req.Variables,
		Color:       "#6B7280", // Default gray
	}

	if err := h.repo.Create(env, workspaceID); err != nil {
		h.logger.Error("Failed to import environment", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to import environment"})
		return
	}

	c.JSON(http.StatusCreated, env)
}
