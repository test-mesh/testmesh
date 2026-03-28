package cloud

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/api/middleware"
	"github.com/test-mesh/testmesh/internal/graph"
	"go.uber.org/zap"
)

// CloudGraphHandler extends OSS graph handlers with cloud-specific endpoints.
type CloudGraphHandler struct {
	engine         graph.Engine
	runtimeScanner *RuntimeScanner
	historyScanner *HistoryScanner
	logger         *zap.Logger
}

// NewCloudGraphHandler creates a cloud graph handler.
func NewCloudGraphHandler(engine graph.Engine, runtime *RuntimeScanner, history *HistoryScanner, logger *zap.Logger) *CloudGraphHandler {
	return &CloudGraphHandler{
		engine:         engine,
		runtimeScanner: runtime,
		historyScanner: history,
		logger:         logger,
	}
}

// IngestExecution handles POST /graph/cloud/executions
// Receives execution events and feeds them to the runtime scanner.
func (h *CloudGraphHandler) IngestExecution(c *gin.Context) {
	var req struct {
		Events []ExecutionEvent `json:"events" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	workspaceID := middleware.GetWorkspaceID(c)
	for i := range req.Events {
		req.Events[i].WorkspaceID = workspaceID
	}

	if err := h.runtimeScanner.ProcessExecution(c.Request.Context(), req.Events); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ingested", "events": len(req.Events)})
}

// TakeSnapshot handles POST /graph/cloud/snapshots
func (h *CloudGraphHandler) TakeSnapshot(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)

	var req struct {
		CommitSHA string `json:"commit_sha" binding:"required"`
		Branch    string `json:"branch"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	snapshot, err := h.historyScanner.TakeSnapshot(c.Request.Context(), workspaceID, req.CommitSHA, req.Branch)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, snapshot)
}

// GetHistory handles GET /graph/cloud/history
func (h *CloudGraphHandler) GetHistory(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)

	snapshots, err := h.historyScanner.GetHistory(c.Request.Context(), workspaceID, 50)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"snapshots": snapshots, "total": len(snapshots)})
}

// GetDiff handles GET /graph/cloud/diff?from=<sha>&to=<sha>
func (h *CloudGraphHandler) GetDiff(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)
	fromCommit := c.Query("from")
	toCommit := c.Query("to")

	if fromCommit == "" || toCommit == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "from and to commit SHAs required"})
		return
	}

	diff, err := h.historyScanner.GetDiffBetween(c.Request.Context(), workspaceID, fromCommit, toCommit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, diff)
}

// GetImpact handles POST /graph/cloud/impact
// Advanced impact analysis for PRs — what flows are affected by changed nodes.
func (h *CloudGraphHandler) GetImpact(c *gin.Context) {
	var req struct {
		NodeIDs []string `json:"node_ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var nodeIDs []uuid.UUID
	for _, idStr := range req.NodeIDs {
		id, err := uuid.Parse(idStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid node_id: " + idStr})
			return
		}
		nodeIDs = append(nodeIDs, id)
	}

	report, err := h.engine.GetImpact(c.Request.Context(), nodeIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, report)
}

// GetContractEvolution handles GET /graph/cloud/contracts/:id/evolution
// Shows how a contract has changed over time using the history layer.
func (h *CloudGraphHandler) GetContractEvolution(c *gin.Context) {
	workspaceID := middleware.GetWorkspaceID(c)

	contracts, err := h.engine.GetContracts(c.Request.Context(), workspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Enrich contracts with history data
	snapshots, _ := h.historyScanner.GetHistory(c.Request.Context(), workspaceID, 10)

	c.JSON(http.StatusOK, gin.H{
		"contracts":        contracts,
		"recent_snapshots": snapshots,
	})
}
