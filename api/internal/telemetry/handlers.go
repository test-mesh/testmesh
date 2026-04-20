package telemetry

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// TelemetryHandler handles HTTP requests for telemetry endpoints.
type TelemetryHandler struct {
	repo      *TelemetryRepository
	discovery *FlowDiscovery
	validator *TraceValidator
	rootcause *RootCauseAnalyzer
	insights  *TraceInsightCache
	coverage  *CoverageIndexer
	logger    *zap.Logger
}

// NewTelemetryHandler creates a new TelemetryHandler.
func NewTelemetryHandler(
	repo *TelemetryRepository,
	discovery *FlowDiscovery,
	validator *TraceValidator,
	rootcause *RootCauseAnalyzer,
	insights *TraceInsightCache,
	coverage *CoverageIndexer,
	logger *zap.Logger,
) *TelemetryHandler {
	return &TelemetryHandler{
		repo:      repo,
		discovery: discovery,
		validator: validator,
		rootcause: rootcause,
		insights:  insights,
		coverage:  coverage,
		logger:    logger,
	}
}

// ListDiscoveredFlows handles GET /telemetry/flows
func (h *TelemetryHandler) ListDiscoveredFlows(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workspace_id"})
		return
	}

	sortBy := c.DefaultQuery("sort", "risk_score")
	driftedOnly := c.Query("drifted") == "true"

	flows, err := h.repo.ListDiscoveredFlows(c.Request.Context(), workspaceID, sortBy, driftedOnly)
	if err != nil {
		h.logger.Error("failed to list discovered flows", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list flows"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"flows": flows, "total": len(flows)})
}

// GetDiscoveredFlow handles GET /telemetry/flows/:flow_id
func (h *TelemetryHandler) GetDiscoveredFlow(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workspace_id"})
		return
	}
	flowID, err := uuid.Parse(c.Param("flow_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid flow_id"})
		return
	}

	flow, err := h.repo.GetFlowByID(c.Request.Context(), workspaceID, flowID)
	if err != nil {
		h.logger.Error("failed to get discovered flow", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get flow"})
		return
	}
	if flow == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "flow not found"})
		return
	}

	c.JSON(http.StatusOK, flow)
}

// ExportFlowYAML handles POST /telemetry/flows/:flow_id/export
func (h *TelemetryHandler) ExportFlowYAML(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workspace_id"})
		return
	}
	flowID, err := uuid.Parse(c.Param("flow_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid flow_id"})
		return
	}

	yamlContent, err := h.discovery.ExportFlowYAML(c.Request.Context(), workspaceID, flowID)
	if err != nil {
		h.logger.Error("failed to export flow YAML", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"yaml": yamlContent})
}

// QuerySpans handles GET /telemetry/spans
func (h *TelemetryHandler) QuerySpans(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workspace_id"})
		return
	}

	filter := SpanFilter{
		WorkspaceID: workspaceID,
		TraceID:     c.Query("trace_id"),
		Service:     c.Query("service"),
		Operation:   c.Query("operation"),
		StatusCode:  c.Query("status"),
	}

	spans, err := h.repo.QuerySpans(c.Request.Context(), filter)
	if err != nil {
		h.logger.Error("failed to query spans", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query spans"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"spans": spans, "total": len(spans)})
}

// GetTraceValidation handles GET /executions/:id/trace-validation
func (h *TelemetryHandler) GetTraceValidation(c *gin.Context) {
	execID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid execution_id"})
		return
	}

	result, err := h.repo.GetValidationByExecutionID(c.Request.Context(), execID)
	if err != nil {
		h.logger.Error("failed to get trace validation", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get validation"})
		return
	}
	if result == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no validation result found"})
		return
	}

	c.JSON(http.StatusOK, result)
}

// ListDriftAlerts handles GET /telemetry/drift
func (h *TelemetryHandler) ListDriftAlerts(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workspace_id"})
		return
	}

	flows, err := h.repo.ListDiscoveredFlows(c.Request.Context(), workspaceID, "last_seen_at", true)
	if err != nil {
		h.logger.Error("failed to list drift alerts", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list drift alerts"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"alerts": flows, "total": len(flows)})
}

// GetTraceSettings handles GET /settings/telemetry
func (h *TelemetryHandler) GetTraceSettings(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workspace_id"})
		return
	}

	settings, err := h.repo.GetTraceSettings(c.Request.Context(), workspaceID)
	if err != nil {
		h.logger.Error("failed to get trace settings", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get settings"})
		return
	}

	c.JSON(http.StatusOK, settings)
}

// UpdateTraceSettings handles PUT /settings/telemetry
func (h *TelemetryHandler) UpdateTraceSettings(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workspace_id"})
		return
	}

	var settings TraceSettings
	if err := c.ShouldBindJSON(&settings); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	settings.WorkspaceID = workspaceID

	if err := h.repo.UpdateTraceSettings(c.Request.Context(), &settings); err != nil {
		h.logger.Error("failed to update trace settings", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update settings"})
		return
	}

	c.JSON(http.StatusOK, settings)
}

// GenerateFlow handles POST /workspaces/:workspace_id/telemetry/traces/:trace_id/generate-flow
func (h *TelemetryHandler) GenerateFlow(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workspace_id"})
		return
	}
	traceID := c.Param("trace_id")
	if traceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "trace_id required"})
		return
	}

	// Fast path: return cached insight
	insight, err := h.insights.GetInsight(c.Request.Context(), traceID)
	if err == nil && insight.GeneratedYAML != "" {
		c.JSON(http.StatusOK, gin.H{
			"yaml":       insight.GeneratedYAML,
			"confidence": insight.Confidence,
			"intent":     insight.InferredIntent,
			"coverage":   insight.Coverage,
			"cached":     true,
		})
		return
	}

	// Slow path: compute now
	if err := h.insights.Summarize(c.Request.Context(), workspaceID, traceID); err != nil {
		h.logger.Error("failed to generate trace insight", zap.String("trace_id", traceID), zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate flow"})
		return
	}

	insight, err = h.insights.GetInsight(c.Request.Context(), traceID)
	if err != nil || insight.GeneratedYAML == "" {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "could not generate YAML — ensure AI provider is configured"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"yaml":       insight.GeneratedYAML,
		"confidence": insight.Confidence,
		"intent":     insight.InferredIntent,
		"coverage":   insight.Coverage,
		"cached":     false,
	})
}

// ListCoverageGaps handles GET /workspaces/:workspace_id/telemetry/coverage-gaps
func (h *TelemetryHandler) ListCoverageGaps(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workspace_id"})
		return
	}

	uncoveredOnly := c.DefaultQuery("uncovered", "true") == "true"
	sort := c.DefaultQuery("sort", "risk_score")
	limit := 50
	offset := 0
	if v, err := strconv.Atoi(c.Query("limit")); err == nil && v > 0 {
		limit = v
	}
	if v, err := strconv.Atoi(c.Query("offset")); err == nil && v >= 0 {
		offset = v
	}

	gaps, err := h.repo.ListCoverageGaps(c.Request.Context(), workspaceID, uncoveredOnly, sort, limit, offset)
	if err != nil {
		h.logger.Error("failed to list coverage gaps", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list gaps"})
		return
	}
	total, _ := h.repo.CountCoverageGaps(c.Request.Context(), workspaceID, false)
	uncovTotal, _ := h.repo.CountCoverageGaps(c.Request.Context(), workspaceID, true)

	c.JSON(http.StatusOK, gin.H{
		"gaps":            gaps,
		"total":           total,
		"uncovered_count": uncovTotal,
	})
}
