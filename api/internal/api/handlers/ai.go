package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/georgi-georgiev/testmesh/internal/ai"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// AIHandler handles AI-related requests
type AIHandler struct {
	db          *gorm.DB
	repo        *repository.AIRepository
	generator   *ai.Generator
	analyzer    *ai.Analyzer
	selfHealing *ai.SelfHealingEngine
	providers   *ai.ProviderManager
	logger      *zap.Logger
}

// NewAIHandler creates a new AI handler
func NewAIHandler(
	db *gorm.DB,
	repo *repository.AIRepository,
	generator *ai.Generator,
	analyzer *ai.Analyzer,
	selfHealing *ai.SelfHealingEngine,
	providers *ai.ProviderManager,
	logger *zap.Logger,
) *AIHandler {
	return &AIHandler{
		db:          db,
		repo:        repo,
		generator:   generator,
		analyzer:    analyzer,
		selfHealing: selfHealing,
		providers:   providers,
		logger:      logger,
	}
}

// Generate handles POST /api/v1/ai/generate
func (h *AIHandler) Generate(c *gin.Context) {
	var req struct {
		Prompt      string `json:"prompt" binding:"required"`
		Provider    string `json:"provider"`
		Model       string `json:"model"`
		Temperature float64 `json:"temperature"`
		MaxTokens   int    `json:"max_tokens"`
		CreateFlow  bool   `json:"create_flow"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	opts := ai.GenerateOptions{
		Provider:    models.AIProviderType(req.Provider),
		Model:       req.Model,
		Temperature: req.Temperature,
		MaxTokens:   req.MaxTokens,
	}

	result, err := h.generator.GenerateFromPrompt(c.Request.Context(), req.Prompt, opts)
	if err != nil {
		h.logger.Error("Failed to generate flow", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"history_id":  result.HistoryID,
		"yaml":        result.YAML,
		"flow":        result.FlowDef,
		"tokens_used": result.TokensUsed,
		"latency_ms":  result.LatencyMs,
		"provider":    result.Provider,
		"model":       result.Model,
	})
}

// ImportOpenAPI handles POST /api/v1/ai/import/openapi
func (h *AIHandler) ImportOpenAPI(c *gin.Context) {
	var req struct {
		Spec        string `json:"spec" binding:"required"`
		Provider    string `json:"provider"`
		Model       string `json:"model"`
		CreateFlows bool   `json:"create_flows"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	opts := ai.ImportOptions{
		Provider:    models.AIProviderType(req.Provider),
		Model:       req.Model,
		CreateFlows: req.CreateFlows,
	}

	result, err := h.generator.ImportFromOpenAPI(c.Request.Context(), req.Spec, opts)
	if err != nil {
		h.logger.Error("Failed to import OpenAPI", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"import_id":       result.ImportID,
		"flows_generated": result.FlowsGenerated,
		"flow_ids":        result.FlowIDs,
		"flows":           result.Flows,
	})
}

// ImportPostman handles POST /api/v1/ai/import/postman
func (h *AIHandler) ImportPostman(c *gin.Context) {
	var req struct {
		Collection  string `json:"collection" binding:"required"`
		Provider    string `json:"provider"`
		Model       string `json:"model"`
		CreateFlows bool   `json:"create_flows"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	opts := ai.ImportOptions{
		Provider:    models.AIProviderType(req.Provider),
		Model:       req.Model,
		CreateFlows: req.CreateFlows,
	}

	result, err := h.generator.ImportFromPostman(c.Request.Context(), req.Collection, opts)
	if err != nil {
		h.logger.Error("Failed to import Postman collection", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"import_id":       result.ImportID,
		"flows_generated": result.FlowsGenerated,
		"flow_ids":        result.FlowIDs,
		"flows":           result.Flows,
	})
}

// ImportPact handles POST /api/v1/ai/import/pact
func (h *AIHandler) ImportPact(c *gin.Context) {
	var req struct {
		Contract    string `json:"contract" binding:"required"`
		Provider    string `json:"provider"`
		Model       string `json:"model"`
		CreateFlows bool   `json:"create_flows"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	opts := ai.ImportOptions{
		Provider:    models.AIProviderType(req.Provider),
		Model:       req.Model,
		CreateFlows: req.CreateFlows,
	}

	result, err := h.generator.ImportFromPact(c.Request.Context(), req.Contract, opts)
	if err != nil {
		h.logger.Error("Failed to import Pact contract", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"import_id":       result.ImportID,
		"flows_generated": result.FlowsGenerated,
		"flow_ids":        result.FlowIDs,
		"flows":           result.Flows,
	})
}

// AnalyzeCoverage handles POST /api/v1/ai/coverage/analyze
func (h *AIHandler) AnalyzeCoverage(c *gin.Context) {
	var req struct {
		Spec    string `json:"spec" binding:"required"`
		BaseURL string `json:"base_url"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	opts := ai.AnalysisOptions{
		BaseURL: req.BaseURL,
	}

	result, err := h.analyzer.AnalyzeOpenAPICoverage(c.Request.Context(), req.Spec, opts)
	if err != nil {
		h.logger.Error("Failed to analyze coverage", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"analysis_id":       result.AnalysisID,
		"spec_name":         result.SpecName,
		"total_endpoints":   result.TotalEndpoints,
		"covered_endpoints": result.CoveredEndpoints,
		"coverage_percent":  result.CoveragePercent,
		"covered":           result.Covered,
		"uncovered":         result.Uncovered,
		"partial":           result.Partial,
	})
}

// AnalyzeFailure handles POST /api/v1/ai/analyze/:execution_id
func (h *AIHandler) AnalyzeFailure(c *gin.Context) {
	id, err := uuid.Parse(c.Param("execution_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid execution ID"})
		return
	}

	// Get workspace_id from request body or query
	workspaceIDStr := c.Query("workspace_id")
	if workspaceIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace_id is required"})
		return
	}
	workspaceID, err := uuid.Parse(workspaceIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workspace_id"})
		return
	}

	result, err := h.selfHealing.AnalyzeFailure(c.Request.Context(), id, workspaceID)
	if err != nil {
		h.logger.Error("Failed to analyze failure", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"execution_id":   result.ExecutionID,
		"flow_id":        result.FlowID,
		"suggestions":    result.Suggestions,
		"analysis_notes": result.AnalysisNotes,
	})
}

// ListSuggestions handles GET /api/v1/ai/suggestions
func (h *AIHandler) ListSuggestions(c *gin.Context) {
	flowIDStr := c.Query("flow_id")
	statusStr := c.Query("status")

	if flowIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "flow_id is required"})
		return
	}

	flowID, err := uuid.Parse(flowIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid flow_id"})
		return
	}

	status := models.SuggestionStatus(statusStr)
	suggestions, err := h.selfHealing.GetSuggestions(flowID, status)
	if err != nil {
		h.logger.Error("Failed to get suggestions", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"suggestions": suggestions,
		"total":       len(suggestions),
	})
}

// GetSuggestion handles GET /api/v1/ai/suggestions/:id
func (h *AIHandler) GetSuggestion(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid suggestion ID"})
		return
	}

	suggestion, err := h.selfHealing.GetSuggestion(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "suggestion not found"})
		return
	}

	c.JSON(http.StatusOK, suggestion)
}

// ApplySuggestion handles POST /api/v1/ai/suggestions/:id/apply
func (h *AIHandler) ApplySuggestion(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid suggestion ID"})
		return
	}

	// Get workspace_id from request body or query
	workspaceIDStr := c.Query("workspace_id")
	if workspaceIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace_id is required"})
		return
	}
	workspaceID, err := uuid.Parse(workspaceIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workspace_id"})
		return
	}

	result, err := h.selfHealing.ApplySuggestion(c.Request.Context(), id, workspaceID)
	if err != nil {
		h.logger.Error("Failed to apply suggestion", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"suggestion_id": result.SuggestionID,
		"flow_id":       result.FlowID,
		"success":       result.Success,
		"applied_yaml":  result.AppliedYAML,
	})
}

// AcceptSuggestion handles POST /api/v1/ai/suggestions/:id/accept
func (h *AIHandler) AcceptSuggestion(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid suggestion ID"})
		return
	}

	if err := h.selfHealing.AcceptSuggestion(id); err != nil {
		h.logger.Error("Failed to accept suggestion", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "accepted"})
}

// RejectSuggestion handles POST /api/v1/ai/suggestions/:id/reject
func (h *AIHandler) RejectSuggestion(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid suggestion ID"})
		return
	}

	if err := h.selfHealing.RejectSuggestion(id); err != nil {
		h.logger.Error("Failed to reject suggestion", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "rejected"})
}

// GetUsage handles GET /api/v1/ai/usage
func (h *AIHandler) GetUsage(c *gin.Context) {
	// Get AI usage statistics
	var stats []models.AIUsageStats
	h.db.Order("date DESC").Limit(30).Find(&stats)

	// Get available providers
	providers := h.providers.ListProviders()

	c.JSON(http.StatusOK, gin.H{
		"stats":     stats,
		"providers": providers,
	})
}

// GetProviders handles GET /api/v1/ai/providers
func (h *AIHandler) GetProviders(c *gin.Context) {
	providers := h.providers.ListProviders()

	c.JSON(http.StatusOK, gin.H{
		"providers": providers,
	})
}

// ListGenerationHistory handles GET /api/v1/ai/generation-history
func (h *AIHandler) ListGenerationHistory(c *gin.Context) {
	status := models.GenerationStatus(c.Query("status"))
	provider := models.AIProviderType(c.Query("provider"))

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

	history, total, err := h.repo.ListGenerationHistory(status, provider, limit, offset)
	if err != nil {
		h.logger.Error("Failed to list generation history", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list generation history"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"history": history,
		"total":   total,
		"limit":   limit,
		"offset":  offset,
	})
}

// GetGenerationHistory handles GET /api/v1/ai/generation-history/:id
func (h *AIHandler) GetGenerationHistory(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid history ID"})
		return
	}

	history, err := h.repo.GetGenerationHistoryByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "generation history not found"})
		return
	}

	c.JSON(http.StatusOK, history)
}

// ListImportHistory handles GET /api/v1/ai/import-history
func (h *AIHandler) ListImportHistory(c *gin.Context) {
	sourceType := models.ImportSourceType(c.Query("source_type"))
	status := models.ImportStatus(c.Query("status"))

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

	history, total, err := h.repo.ListImportHistory(sourceType, status, limit, offset)
	if err != nil {
		h.logger.Error("Failed to list import history", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list import history"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"history": history,
		"total":   total,
		"limit":   limit,
		"offset":  offset,
	})
}

// GetImportHistory handles GET /api/v1/ai/import-history/:id
func (h *AIHandler) GetImportHistory(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid import ID"})
		return
	}

	history, err := h.repo.GetImportHistoryByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "import history not found"})
		return
	}

	c.JSON(http.StatusOK, history)
}

// ListCoverageAnalyses handles GET /api/v1/ai/coverage-analysis
func (h *AIHandler) ListCoverageAnalyses(c *gin.Context) {
	status := models.CoverageStatus(c.Query("status"))

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

	analyses, total, err := h.repo.ListCoverageAnalyses(status, limit, offset)
	if err != nil {
		h.logger.Error("Failed to list coverage analyses", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list coverage analyses"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"analyses": analyses,
		"total":    total,
		"limit":    limit,
		"offset":   offset,
	})
}

// GetCoverageAnalysis handles GET /api/v1/ai/coverage-analysis/:id
func (h *AIHandler) GetCoverageAnalysis(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid analysis ID"})
		return
	}

	analysis, err := h.repo.GetCoverageAnalysisByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "coverage analysis not found"})
		return
	}

	c.JSON(http.StatusOK, analysis)
}

// DeleteSuggestion handles DELETE /api/v1/ai/suggestions/:id
func (h *AIHandler) DeleteSuggestion(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid suggestion ID"})
		return
	}

	if err := h.repo.DeleteSuggestion(id); err != nil {
		h.logger.Error("Failed to delete suggestion", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete suggestion"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "suggestion deleted"})
}
