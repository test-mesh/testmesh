package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// HistoryHandler handles request history related requests
type HistoryHandler struct {
	repo   *repository.HistoryRepository
	logger *zap.Logger
}

// NewHistoryHandler creates a new history handler
func NewHistoryHandler(repo *repository.HistoryRepository, logger *zap.Logger) *HistoryHandler {
	return &HistoryHandler{
		repo:   repo,
		logger: logger,
	}
}

// CreateHistoryRequest represents a request to create a history entry
type CreateHistoryRequest struct {
	Method       string                    `json:"method" binding:"required"`
	URL          string                    `json:"url" binding:"required"`
	Request      models.RequestHistoryData  `json:"request" binding:"required"`
	Response     models.ResponseHistoryData `json:"response"`
	StatusCode   int                       `json:"status_code"`
	DurationMs   int64                     `json:"duration_ms"`
	SizeBytes    int64                     `json:"size_bytes"`
	Error        string                    `json:"error"`
	Tags         []string                  `json:"tags"`
	FlowID       *uuid.UUID                `json:"flow_id"`
	CollectionID *uuid.UUID                `json:"collection_id"`
}

// Create handles POST /api/v1/history
func (h *HistoryHandler) Create(c *gin.Context) {
	var req CreateHistoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	history := &models.RequestHistory{
		Method:       req.Method,
		URL:          req.URL,
		Request:      req.Request,
		Response:     req.Response,
		StatusCode:   req.StatusCode,
		DurationMs:   req.DurationMs,
		SizeBytes:    req.SizeBytes,
		Error:        req.Error,
		Tags:         req.Tags,
		FlowID:       req.FlowID,
		CollectionID: req.CollectionID,
	}

	if err := h.repo.Create(history); err != nil {
		h.logger.Error("Failed to create history entry", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create history entry"})
		return
	}

	c.JSON(http.StatusCreated, history)
}

// List handles GET /api/v1/history
func (h *HistoryHandler) List(c *gin.Context) {
	// Parse pagination
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	// Parse filters
	filter := &models.HistoryFilter{
		Method:    c.Query("method"),
		URL:       c.Query("url"),
		SavedOnly: c.Query("saved") == "true",
	}

	if statusStr := c.Query("status"); statusStr != "" {
		status, _ := strconv.Atoi(statusStr)
		filter.StatusCode = &status
	}

	if flowIDStr := c.Query("flow_id"); flowIDStr != "" {
		if flowID, err := uuid.Parse(flowIDStr); err == nil {
			filter.FlowID = &flowID
		}
	}

	if collectionIDStr := c.Query("collection_id"); collectionIDStr != "" {
		if collectionID, err := uuid.Parse(collectionIDStr); err == nil {
			filter.CollectionID = &collectionID
		}
	}

	if startDateStr := c.Query("start_date"); startDateStr != "" {
		if startDate, err := time.Parse(time.RFC3339, startDateStr); err == nil {
			filter.StartDate = &startDate
		}
	}

	if endDateStr := c.Query("end_date"); endDateStr != "" {
		if endDate, err := time.Parse(time.RFC3339, endDateStr); err == nil {
			filter.EndDate = &endDate
		}
	}

	if tagsStr := c.QueryArray("tags"); len(tagsStr) > 0 {
		filter.Tags = tagsStr
	}

	histories, total, err := h.repo.List(filter, limit, offset)
	if err != nil {
		h.logger.Error("Failed to list history", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list history"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"history": histories,
		"total":   total,
		"limit":   limit,
		"offset":  offset,
	})
}

// Get handles GET /api/v1/history/:id
func (h *HistoryHandler) Get(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid history ID"})
		return
	}

	history, err := h.repo.GetByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "history entry not found"})
		return
	}

	c.JSON(http.StatusOK, history)
}

// Save handles POST /api/v1/history/:id/save
func (h *HistoryHandler) Save(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid history ID"})
		return
	}

	if err := h.repo.Save(id); err != nil {
		h.logger.Error("Failed to save history entry", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save history entry"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "history entry saved"})
}

// Unsave handles POST /api/v1/history/:id/unsave
func (h *HistoryHandler) Unsave(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid history ID"})
		return
	}

	if err := h.repo.Unsave(id); err != nil {
		h.logger.Error("Failed to unsave history entry", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to unsave history entry"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "history entry unsaved"})
}

// Delete handles DELETE /api/v1/history/:id
func (h *HistoryHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid history ID"})
		return
	}

	if err := h.repo.Delete(id); err != nil {
		h.logger.Error("Failed to delete history entry", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete history entry"})
		return
	}

	c.JSON(http.StatusNoContent, nil)
}

// Clear handles DELETE /api/v1/history
func (h *HistoryHandler) Clear(c *gin.Context) {
	keepSaved := c.Query("keep_saved") != "false"

	count, err := h.repo.ClearAll(keepSaved)
	if err != nil {
		h.logger.Error("Failed to clear history", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to clear history"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "history cleared",
		"deleted": count,
	})
}

// GetStats handles GET /api/v1/history/stats
func (h *HistoryHandler) GetStats(c *gin.Context) {
	stats, err := h.repo.GetStats()
	if err != nil {
		h.logger.Error("Failed to get history stats", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get history stats"})
		return
	}

	c.JSON(http.StatusOK, stats)
}

// AddTag handles POST /api/v1/history/:id/tags
func (h *HistoryHandler) AddTag(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid history ID"})
		return
	}

	var req struct {
		Tag string `json:"tag" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.repo.AddTag(id, req.Tag); err != nil {
		h.logger.Error("Failed to add tag", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add tag"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "tag added"})
}

// RemoveTag handles DELETE /api/v1/history/:id/tags/:tag
func (h *HistoryHandler) RemoveTag(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid history ID"})
		return
	}

	tag := c.Param("tag")
	if tag == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tag is required"})
		return
	}

	if err := h.repo.RemoveTag(id, tag); err != nil {
		h.logger.Error("Failed to remove tag", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to remove tag"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "tag removed"})
}
