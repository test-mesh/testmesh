package ai

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/api/middleware"
	"github.com/test-mesh/testmesh/internal/graph"
	"github.com/test-mesh/testmesh/internal/graph/cloud"
	"go.uber.org/zap"
)

// AgentHandler serves cloud AI agent endpoints.
type AgentHandler struct {
	agents         map[string]Agent
	engine         graph.Engine
	runtimeScanner *cloud.RuntimeScanner
	historyScanner *cloud.HistoryScanner
	logger         *zap.Logger
}

// NewAgentHandler creates a handler with all registered agents.
func NewAgentHandler(engine graph.Engine, runtime *cloud.RuntimeScanner, history *cloud.HistoryScanner, logger *zap.Logger) *AgentHandler {
	h := &AgentHandler{
		agents:         make(map[string]Agent),
		engine:         engine,
		runtimeScanner: runtime,
		historyScanner: history,
		logger:         logger,
	}

	// Register all agents
	for _, a := range []Agent{
		NewCoverageAgent(),
		NewDiagnosisAgent(),
		NewFlakinessAgent(),
		NewGenerationAgent(),
		NewImpactAgent(),
		NewRepairAgent(),
		NewWatchAgent(),
		NewSchedulerOptimizerAgent(),
	} {
		h.agents[a.Name()] = a
	}

	return h
}

// RunAgent handles POST /graph/cloud/agents/:agent_name
func (h *AgentHandler) RunAgent(c *gin.Context) {
	agentName := c.Param("agent_name")
	agent, ok := h.agents[agentName]
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "unknown agent: " + agentName})
		return
	}

	var params map[string]any
	if err := c.ShouldBindJSON(&params); err != nil {
		// Allow empty body
		params = make(map[string]any)
	}

	workspaceID := middleware.GetWorkspaceID(c)
	ac := NewAgentContext(h.engine, h.runtimeScanner, h.historyScanner, workspaceID, h.logger)

	result, err := agent.Run(c.Request.Context(), ac, params)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

// ListAgents handles GET /graph/cloud/agents
func (h *AgentHandler) ListAgents(c *gin.Context) {
	names := make([]string, 0, len(h.agents))
	for name := range h.agents {
		names = append(names, name)
	}
	c.JSON(http.StatusOK, gin.H{"agents": names})
}

// RunOrchestrator handles POST /graph/cloud/agents/orchestrate
func (h *AgentHandler) RunOrchestrator(c *gin.Context) {
	var req struct {
		Event  string         `json:"event" binding:"required"`
		Params map[string]any `json:"params"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	workspaceID := middleware.GetWorkspaceID(c)
	ac := NewAgentContext(h.engine, h.runtimeScanner, h.historyScanner, workspaceID, h.logger)

	orchestrator := NewOrchestratorAgent()
	result, err := orchestrator.Run(c.Request.Context(), ac, map[string]any{
		"event":  req.Event,
		"params": req.Params,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

// ScoreConfidence handles POST /graph/cloud/confidence
func (h *AgentHandler) ScoreConfidence(c *gin.Context) {
	var req struct {
		NodeIDs []string `json:"node_ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	scorer := NewConfidenceScorer()
	results := make(map[string]any)

	for _, idStr := range req.NodeIDs {
		nodeID, err := uuid.Parse(idStr)
		if err != nil {
			continue
		}
		node, err := h.engine.GetNode(c.Request.Context(), nodeID)
		if err != nil {
			continue
		}
		score := scorer.ScoreNode(*node, nil)
		results[idStr] = map[string]any{
			"score":          score,
			"classification": ClassifyConfidence(score),
		}
	}

	c.JSON(http.StatusOK, gin.H{"scores": results})
}
