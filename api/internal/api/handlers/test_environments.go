package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/gitops"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"github.com/test-mesh/testmesh/internal/storage/repository"
	"go.uber.org/zap"
)

// TestEnvironmentHandler handles test environment lifecycle requests.
type TestEnvironmentHandler struct {
	repo    *repository.TestEnvironmentRepository
	service *gitops.EnvironmentService
	logger  *zap.Logger
}

// NewTestEnvironmentHandler creates a new TestEnvironmentHandler.
func NewTestEnvironmentHandler(repo *repository.TestEnvironmentRepository, service *gitops.EnvironmentService, logger *zap.Logger) *TestEnvironmentHandler {
	return &TestEnvironmentHandler{
		repo:    repo,
		service: service,
		logger:  logger,
	}
}

// CreateTestEnvRequest is the body for POST /test-environments.
type CreateTestEnvRequest struct {
	Name            string                    `json:"name"             binding:"required"`
	Context         string                    `json:"context"          binding:"required"`
	Namespace       string                    `json:"namespace"`
	Provider        models.GitOpsProviderType `json:"provider"`
	ProviderAppName string                    `json:"provider_app_name"`
	TTLMinutes      int                       `json:"ttl_minutes"`
}

// Create handles POST /api/v1/workspaces/:workspace_id/test-environments
func (h *TestEnvironmentHandler) Create(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid workspace ID"})
		return
	}

	var req CreateTestEnvRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ttl := req.TTLMinutes
	if ttl == 0 {
		ttl = 120
	}

	env := &models.TestEnvironment{
		WorkspaceID:     workspaceID,
		Name:            req.Name,
		Context:         req.Context,
		Namespace:       req.Namespace,
		Provider:        req.Provider,
		ProviderAppName: req.ProviderAppName,
		State:           models.TestEnvCold,
		TTLMinutes:      ttl,
	}

	if err := h.repo.Create(c.Request.Context(), env); err != nil {
		h.logger.Error("Failed to create test environment", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, env)
}

// List handles GET /api/v1/workspaces/:workspace_id/test-environments
func (h *TestEnvironmentHandler) List(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid workspace ID"})
		return
	}

	envs, err := h.repo.List(c.Request.Context(), workspaceID)
	if err != nil {
		h.logger.Error("Failed to list test environments", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": envs})
}

// Get handles GET /api/v1/workspaces/:workspace_id/test-environments/:env_id
func (h *TestEnvironmentHandler) Get(c *gin.Context) {
	envID, err := uuid.Parse(c.Param("env_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid environment ID"})
		return
	}

	env, err := h.repo.Get(c.Request.Context(), envID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Test environment not found"})
		return
	}

	workspaceID, _ := uuid.Parse(c.Param("workspace_id"))
	if env.WorkspaceID != workspaceID {
		c.JSON(http.StatusNotFound, gin.H{"error": "Test environment not found"})
		return
	}

	c.JSON(http.StatusOK, env)
}

// Destroy handles DELETE /api/v1/workspaces/:workspace_id/test-environments/:env_id
// Sets TTLMinutes=0 to make the environment immediately eligible for cleanup,
// then triggers CleanupExpired in a goroutine.
func (h *TestEnvironmentHandler) Destroy(c *gin.Context) {
	envID, err := uuid.Parse(c.Param("env_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid environment ID"})
		return
	}

	env, err := h.repo.Get(c.Request.Context(), envID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Test environment not found"})
		return
	}

	workspaceID, _ := uuid.Parse(c.Param("workspace_id"))
	if env.WorkspaceID != workspaceID {
		c.JSON(http.StatusNotFound, gin.H{"error": "Test environment not found"})
		return
	}

	// Mark TTL as 0 so CleanupExpired considers it expired immediately
	env.TTLMinutes = 0
	if err := h.repo.Update(c.Request.Context(), env); err != nil {
		h.logger.Error("Failed to update test environment TTL for teardown", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Trigger cleanup asynchronously
	go h.service.CleanupExpired(c.Request.Context())

	c.JSON(http.StatusAccepted, gin.H{"message": "teardown initiated"})
}
