package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/georgi-georgiev/testmesh/internal/api/middleware"
	"github.com/georgi-georgiev/testmesh/internal/loadtest"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// LoadTestHandler handles load test requests
type LoadTestHandler struct {
	loadTester *loadtest.LoadTester
	flowRepo   *repository.FlowRepository
	envRepo    *repository.EnvironmentRepository
	logger     *zap.Logger
	// Store running tests
	runningTests map[uuid.UUID]*loadtest.LoadTestResult
}

// NewLoadTestHandler creates a new load test handler
func NewLoadTestHandler(loadTester *loadtest.LoadTester, flowRepo *repository.FlowRepository, envRepo *repository.EnvironmentRepository, logger *zap.Logger) *LoadTestHandler {
	return &LoadTestHandler{
		loadTester:   loadTester,
		flowRepo:     flowRepo,
		envRepo:      envRepo,
		logger:       logger,
		runningTests: make(map[uuid.UUID]*loadtest.LoadTestResult),
	}
}

// StartLoadTestRequest represents a request to start a load test
type StartLoadTestRequest struct {
	FlowIDs       []string          `json:"flow_ids" binding:"required"`
	VirtualUsers  int               `json:"virtual_users" binding:"required,min=1,max=1000"`
	DurationSec   int               `json:"duration_sec" binding:"required,min=1,max=3600"`
	RampUpSec     int               `json:"ramp_up_sec"`
	RampDownSec   int               `json:"ramp_down_sec"`
	ThinkTimeMs   int               `json:"think_time_ms"`
	Variables     map[string]string `json:"variables"`
	Environment   string            `json:"environment"`
}

// Start handles POST /api/v1/load-tests
func (h *LoadTestHandler) Start(c *gin.Context) {
	var req StartLoadTestRequest
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
	config := &loadtest.LoadTestConfig{
		FlowIDs:      flowIDs,
		VirtualUsers: req.VirtualUsers,
		Duration:     time.Duration(req.DurationSec) * time.Second,
		RampUpTime:   time.Duration(req.RampUpSec) * time.Second,
		RampDownTime: time.Duration(req.RampDownSec) * time.Second,
		ThinkTime:    time.Duration(req.ThinkTimeMs) * time.Millisecond,
		Variables:    mergedVars,
		Environment:  req.Environment,
	}

	// Default ramp up time
	if config.RampUpTime == 0 {
		config.RampUpTime = 10 * time.Second
	}

	// Create test ID upfront so we can return it immediately
	testID := uuid.New()

	// Create initial result entry so the client can query it immediately
	initialResult := &loadtest.LoadTestResult{
		ID:        testID,
		Status:    "starting",
		StartedAt: time.Now(),
		Metrics:   loadtest.LoadTestMetrics{},
		Timeline:  make([]loadtest.TimelinePoint, 0),
	}
	h.runningTests[testID] = initialResult

	// Start load test in background
	go func() {
		ctx := context.Background() // Use background context since request context may be cancelled
		result, err := h.loadTester.RunWithID(ctx, testID, config, flows, func(progress *loadtest.LoadTestResult) {
			h.runningTests[testID] = progress
		})
		if err != nil {
			h.logger.Error("Load test failed", zap.Error(err))
			// Update status to failed
			if r, ok := h.runningTests[testID]; ok {
				r.Status = "failed"
			}
		}
		if result != nil {
			h.runningTests[testID] = result
		}
	}()

	// Return immediately with test ID
	c.JSON(http.StatusAccepted, gin.H{
		"id":      testID,
		"status":  "starting",
		"message": "Load test started. Use GET /api/v1/load-tests/{id} to check status.",
	})
}

// Get handles GET /api/v1/load-tests/:id
func (h *LoadTestHandler) Get(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid test ID"})
		return
	}

	result, ok := h.runningTests[id]
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "load test not found"})
		return
	}

	c.JSON(http.StatusOK, result)
}

// List handles GET /api/v1/load-tests
func (h *LoadTestHandler) List(c *gin.Context) {
	tests := make([]*loadtest.LoadTestResult, 0)
	for _, test := range h.runningTests {
		tests = append(tests, test)
	}

	c.JSON(http.StatusOK, gin.H{
		"tests": tests,
		"total": len(tests),
	})
}

// Stop handles POST /api/v1/load-tests/:id/stop
func (h *LoadTestHandler) Stop(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid test ID"})
		return
	}

	result, ok := h.runningTests[id]
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "load test not found"})
		return
	}

	// Mark as cancelled (actual cancellation would need context management)
	result.Status = "cancelled"
	finishedAt := time.Now()
	result.FinishedAt = &finishedAt

	c.JSON(http.StatusOK, gin.H{
		"message": "Load test stop requested",
		"status":  result.Status,
	})
}

// GetMetrics handles GET /api/v1/load-tests/:id/metrics
func (h *LoadTestHandler) GetMetrics(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid test ID"})
		return
	}

	result, ok := h.runningTests[id]
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "load test not found"})
		return
	}

	c.JSON(http.StatusOK, result.Metrics)
}

// GetTimeline handles GET /api/v1/load-tests/:id/timeline
func (h *LoadTestHandler) GetTimeline(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid test ID"})
		return
	}

	result, ok := h.runningTests[id]
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "load test not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"timeline": result.Timeline,
	})
}

// mergeEnvironmentVariables fetches environment variables and merges them with runtime variables.
// Priority order (later overrides earlier):
//   1. Environment variables (from selected environment)
//   2. Runtime variables (passed at execution time)
func (h *LoadTestHandler) mergeEnvironmentVariables(environmentRef string, workspaceID uuid.UUID, runtimeVars map[string]string) map[string]string {
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
