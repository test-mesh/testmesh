package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/runner"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"github.com/test-mesh/testmesh/internal/storage/repository"
	"go.uber.org/zap"
)

// SuiteHandler handles suite-related requests
type SuiteHandler struct {
	repo        *repository.SuiteRepository
	suiteRunner *runner.SuiteRunner
	logger      *zap.Logger
}

// NewSuiteHandler creates a new suite handler
func NewSuiteHandler(repo *repository.SuiteRepository, suiteRunner *runner.SuiteRunner, logger *zap.Logger) *SuiteHandler {
	return &SuiteHandler{
		repo:        repo,
		suiteRunner: suiteRunner,
		logger:      logger,
	}
}

// SuiteFlowInput represents a flow entry in a suite create/update request
type SuiteFlowInput struct {
	FlowID   string `json:"flow_id" binding:"required"`
	Order    int    `json:"order"`
	Parallel bool   `json:"parallel"`
}

// CreateSuiteRequest represents a request to create or update a suite
type CreateSuiteRequest struct {
	Name        string           `json:"name" binding:"required"`
	Description string           `json:"description"`
	Tags        []string         `json:"tags"`
	Flows       []SuiteFlowInput `json:"flows"`
}

// RunSuiteHTTPRequest represents a request to run a suite
type RunSuiteHTTPRequest struct {
	Environment string                 `json:"environment"`
	Variables   map[string]interface{} `json:"variables"`
}

// Create handles POST /api/v1/workspaces/:workspace_id/suites
func (h *SuiteHandler) Create(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid workspace ID"})
		return
	}

	var req CreateSuiteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	suite := &models.Suite{
		WorkspaceID: workspaceID,
		Name:        req.Name,
		Description: req.Description,
		Tags:        models.StringArray(req.Tags),
	}

	if err := h.repo.Create(c.Request.Context(), suite); err != nil {
		h.logger.Error("Failed to create suite", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Build SuiteFlows from request
	suiteFlows := make([]models.SuiteFlow, 0, len(req.Flows))
	for _, f := range req.Flows {
		flowID, err := uuid.Parse(f.FlowID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid flow ID: " + f.FlowID})
			return
		}
		suiteFlows = append(suiteFlows, models.SuiteFlow{
			SuiteID:  suite.ID,
			FlowID:   flowID,
			Order:    f.Order,
			Parallel: f.Parallel,
		})
	}

	if err := h.repo.ReplaceSuiteFlows(c.Request.Context(), suite.ID, suiteFlows); err != nil {
		h.logger.Error("Failed to set suite flows", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Return full suite with flows
	full, err := h.repo.Get(c.Request.Context(), suite.ID)
	if err != nil {
		h.logger.Error("Failed to fetch created suite", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, full)
}

// List handles GET /api/v1/workspaces/:workspace_id/suites
func (h *SuiteHandler) List(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid workspace ID"})
		return
	}

	params := repository.SuiteListParams{
		WorkspaceID: workspaceID,
		Search:      c.Query("search"),
		Limit:       20,
		Offset:      0,
	}

	if limitStr := c.Query("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			params.Limit = l
		}
	}
	if offsetStr := c.Query("offset"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil {
			params.Offset = o
		}
	}

	suites, total, err := h.repo.List(c.Request.Context(), params)
	if err != nil {
		h.logger.Error("Failed to list suites", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"suites": suites,
		"total":  total,
		"limit":  params.Limit,
		"offset": params.Offset,
	})
}

// Get handles GET /api/v1/workspaces/:workspace_id/suites/:suite_id
func (h *SuiteHandler) Get(c *gin.Context) {
	suiteID, err := uuid.Parse(c.Param("suite_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid suite ID"})
		return
	}

	suite, err := h.repo.Get(c.Request.Context(), suiteID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Suite not found"})
		return
	}

	c.JSON(http.StatusOK, suite)
}

// Update handles PUT /api/v1/workspaces/:workspace_id/suites/:suite_id
func (h *SuiteHandler) Update(c *gin.Context) {
	suiteID, err := uuid.Parse(c.Param("suite_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid suite ID"})
		return
	}

	suite, err := h.repo.Get(c.Request.Context(), suiteID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Suite not found"})
		return
	}

	var req CreateSuiteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	suite.Name = req.Name
	suite.Description = req.Description
	suite.Tags = models.StringArray(req.Tags)

	if err := h.repo.Update(c.Request.Context(), suite); err != nil {
		h.logger.Error("Failed to update suite", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Replace flows
	suiteFlows := make([]models.SuiteFlow, 0, len(req.Flows))
	for _, f := range req.Flows {
		flowID, err := uuid.Parse(f.FlowID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid flow ID: " + f.FlowID})
			return
		}
		suiteFlows = append(suiteFlows, models.SuiteFlow{
			SuiteID:  suiteID,
			FlowID:   flowID,
			Order:    f.Order,
			Parallel: f.Parallel,
		})
	}

	if err := h.repo.ReplaceSuiteFlows(c.Request.Context(), suiteID, suiteFlows); err != nil {
		h.logger.Error("Failed to replace suite flows", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Return full suite with flows
	full, err := h.repo.Get(c.Request.Context(), suiteID)
	if err != nil {
		h.logger.Error("Failed to fetch updated suite", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, full)
}

// Delete handles DELETE /api/v1/workspaces/:workspace_id/suites/:suite_id
func (h *SuiteHandler) Delete(c *gin.Context) {
	suiteID, err := uuid.Parse(c.Param("suite_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid suite ID"})
		return
	}

	if err := h.repo.Delete(c.Request.Context(), suiteID); err != nil {
		h.logger.Error("Failed to delete suite", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Status(http.StatusNoContent)
}

// Run handles POST /api/v1/workspaces/:workspace_id/suites/:suite_id/run
func (h *SuiteHandler) Run(c *gin.Context) {
	suiteID, err := uuid.Parse(c.Param("suite_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid suite ID"})
		return
	}

	var req RunSuiteHTTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	runReq := runner.RunSuiteRequest{
		SuiteID:     suiteID,
		Environment: req.Environment,
		Variables:   req.Variables,
		TriggerType: models.TriggerTypeManual,
	}

	run, err := h.suiteRunner.Run(c.Request.Context(), runReq)
	if err != nil {
		h.logger.Error("Failed to start suite run", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusAccepted, run)
}

// ListRuns handles GET /api/v1/workspaces/:workspace_id/suites/:suite_id/runs
func (h *SuiteHandler) ListRuns(c *gin.Context) {
	suiteID, err := uuid.Parse(c.Param("suite_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid suite ID"})
		return
	}

	limit := 20
	offset := 0

	if limitStr := c.Query("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			limit = l
		}
	}
	if offsetStr := c.Query("offset"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil {
			offset = o
		}
	}

	runs, total, err := h.repo.ListRuns(c.Request.Context(), suiteID, limit, offset)
	if err != nil {
		h.logger.Error("Failed to list suite runs", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"runs":   runs,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// GetRun handles GET /api/v1/workspaces/:workspace_id/suites/:suite_id/runs/:run_id
func (h *SuiteHandler) GetRun(c *gin.Context) {
	suiteID, err := uuid.Parse(c.Param("suite_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid suite ID"})
		return
	}

	runID, err := uuid.Parse(c.Param("run_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid run ID"})
		return
	}

	run, err := h.repo.GetRun(c.Request.Context(), suiteID, runID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Suite run not found"})
		return
	}

	c.JSON(http.StatusOK, run)
}
