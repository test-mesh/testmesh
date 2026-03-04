package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/georgi-georgiev/testmesh/internal/api/middleware"
	"github.com/georgi-georgiev/testmesh/internal/runner"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// RunnerHandler handles collection runner requests
type RunnerHandler struct {
	collectionRunner *runner.CollectionRunner
	flowRepo         *repository.FlowRepository
	envRepo          *repository.EnvironmentRepository
	logger           *zap.Logger
}

// NewRunnerHandler creates a new runner handler
func NewRunnerHandler(collectionRunner *runner.CollectionRunner, flowRepo *repository.FlowRepository, envRepo *repository.EnvironmentRepository, logger *zap.Logger) *RunnerHandler {
	return &RunnerHandler{
		collectionRunner: collectionRunner,
		flowRepo:         flowRepo,
		envRepo:          envRepo,
		logger:           logger,
	}
}

// RunCollectionRequest represents a request to run a collection
type RunCollectionRequest struct {
	FlowIDs         []string               `json:"flow_ids" binding:"required"`
	DataSource      *runner.DataSource     `json:"data_source"`
	Iterations      int                    `json:"iterations"`
	DelayMs         int64                  `json:"delay_ms"`
	StopOnError     bool                   `json:"stop_on_error"`
	Parallel        int                    `json:"parallel"`
	Variables       map[string]string      `json:"variables"`
	VariableMapping map[string]string      `json:"variable_mapping"`
	Environment     string                 `json:"environment"`
}

// ParseDataRequest represents a request to parse a data file
type ParseDataRequest struct {
	Type    string `json:"type" binding:"required"`
	Content string `json:"content" binding:"required"`
}

// Run handles POST /api/v1/runner/run
func (h *RunnerHandler) Run(c *gin.Context) {
	var req RunCollectionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Parse flow IDs
	flowIDs := make([]uuid.UUID, 0, len(req.FlowIDs))
	for _, idStr := range req.FlowIDs {
		id, err := uuid.Parse(idStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid flow ID: " + idStr})
			return
		}
		flowIDs = append(flowIDs, id)
	}

	// Get workspace ID from context
	workspaceID := middleware.GetWorkspaceID(c)

	// Fetch flows
	var flows []*models.Flow
	for _, flowID := range flowIDs {
		flow, err := h.flowRepo.GetByID(flowID, workspaceID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "flow not found: " + flowID.String()})
			return
		}
		flows = append(flows, flow)
	}

	// Merge environment variables with runtime variables
	mergedVars := h.mergeEnvironmentVariables(req.Environment, workspaceID, req.Variables)

	// Build config
	config := &runner.CollectionRunConfig{
		FlowIDs:         flowIDs,
		DataSource:      req.DataSource,
		Iterations:      req.Iterations,
		DelayMs:         req.DelayMs,
		StopOnError:     req.StopOnError,
		Parallel:        req.Parallel,
		Variables:       mergedVars,
		VariableMapping: req.VariableMapping,
		Environment:     req.Environment,
	}

	// Run collection
	ctx := c.Request.Context()
	result, err := h.collectionRunner.Run(ctx, config, flows, nil)
	if err != nil {
		h.logger.Error("Failed to run collection", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

// ParseData handles POST /api/v1/runner/parse-data
func (h *RunnerHandler) ParseData(c *gin.Context) {
	var req ParseDataRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	source := &runner.DataSource{
		Type:    req.Type,
		Content: req.Content,
	}

	// Validate and get preview
	rows, columns, err := runner.GetDataPreview(source, 10)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Count total rows
	var totalRows int
	switch req.Type {
	case "csv":
		allRows, _ := runner.ParseCSV(req.Content)
		totalRows = len(allRows)
	case "json":
		allRows, _ := runner.ParseJSON(req.Content)
		totalRows = len(allRows)
	}

	c.JSON(http.StatusOK, gin.H{
		"columns":    columns,
		"preview":    rows,
		"total_rows": totalRows,
	})
}

// mergeEnvironmentVariables fetches environment variables and merges them with runtime variables.
// Priority order (later overrides earlier):
//   1. Environment variables (from selected environment)
//   2. Runtime variables (passed at execution time)
func (h *RunnerHandler) mergeEnvironmentVariables(environmentRef string, workspaceID uuid.UUID, runtimeVars map[string]string) map[string]string {
	merged := make(map[string]string)

	// Fetch environment if specified
	if environmentRef != "" {
		var env *models.Environment
		var err error

		// Try parsing as UUID first
		if envID, parseErr := uuid.Parse(environmentRef); parseErr == nil {
			env, err = h.envRepo.GetByID(envID, workspaceID)
		} else {
			// Fall back to name lookup
			env, err = h.envRepo.GetByName(environmentRef, workspaceID)
		}

		if err != nil {
			h.logger.Warn("Failed to fetch environment",
				zap.String("environment", environmentRef),
				zap.Error(err))
		} else if env != nil {
			// Add enabled environment variables
			for _, v := range env.Variables {
				if v.Enabled {
					merged[v.Key] = v.Value
				}
			}
			h.logger.Debug("Loaded environment variables",
				zap.String("environment", env.Name),
				zap.Int("variable_count", len(env.Variables)))
		}
	}

	// Override with runtime variables (higher priority)
	for k, v := range runtimeVars {
		merged[k] = v
	}

	return merged
}
