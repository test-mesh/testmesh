package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/georgi-georgiev/testmesh/internal/scheduler"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// ScheduleHandler handles schedule-related requests
type ScheduleHandler struct {
	repo      *repository.ScheduleRepository
	scheduler *scheduler.Scheduler
	logger    *zap.Logger
}

// NewScheduleHandler creates a new schedule handler
func NewScheduleHandler(repo *repository.ScheduleRepository, sched *scheduler.Scheduler, logger *zap.Logger) *ScheduleHandler {
	return &ScheduleHandler{
		repo:      repo,
		scheduler: sched,
		logger:    logger,
	}
}

// CreateScheduleRequest represents a request to create a schedule
type CreateScheduleRequest struct {
	Name            string                 `json:"name" binding:"required"`
	Description     string                 `json:"description"`
	FlowID          string                 `json:"flow_id" binding:"required"`
	CronExpr        string                 `json:"cron_expr" binding:"required"`
	Timezone        string                 `json:"timezone"`
	Environment     map[string]interface{} `json:"environment"`
	NotifyOnFailure bool                   `json:"notify_on_failure"`
	NotifyOnSuccess bool                   `json:"notify_on_success"`
	NotifyEmails    []string               `json:"notify_emails"`
	MaxRetries      int                    `json:"max_retries"`
	RetryDelay      string                 `json:"retry_delay"`
	AllowOverlap    bool                   `json:"allow_overlap"`
	Tags            []string               `json:"tags"`
}

// Create handles POST /api/v1/schedules
func (h *ScheduleHandler) Create(c *gin.Context) {
	var req CreateScheduleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate cron expression
	if err := scheduler.ValidateCronExpression(req.CronExpr); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid cron expression: " + err.Error()})
		return
	}

	// Parse flow ID
	flowID, err := uuid.Parse(req.FlowID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid flow ID"})
		return
	}

	// Set default timezone
	timezone := req.Timezone
	if timezone == "" {
		timezone = "UTC"
	}

	// Create schedule
	schedule := &models.Schedule{
		Name:            req.Name,
		Description:     req.Description,
		FlowID:          flowID,
		CronExpr:        req.CronExpr,
		Timezone:        timezone,
		Status:          models.ScheduleStatusActive,
		Environment:     req.Environment,
		NotifyOnFailure: req.NotifyOnFailure,
		NotifyOnSuccess: req.NotifyOnSuccess,
		NotifyEmails:    req.NotifyEmails,
		MaxRetries:      req.MaxRetries,
		RetryDelay:      req.RetryDelay,
		AllowOverlap:    req.AllowOverlap,
		Tags:            req.Tags,
	}

	if err := h.scheduler.AddSchedule(schedule); err != nil {
		h.logger.Error("Failed to create schedule", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, schedule)
}

// List handles GET /api/v1/schedules
func (h *ScheduleHandler) List(c *gin.Context) {
	params := models.ScheduleListParams{
		Search: c.Query("search"),
	}

	// Parse status filter
	if status := c.Query("status"); status != "" {
		params.Status = models.ScheduleStatus(status)
	}

	// Parse flow ID filter
	if flowIDStr := c.Query("flow_id"); flowIDStr != "" {
		if flowID, err := uuid.Parse(flowIDStr); err == nil {
			params.FlowID = flowID
		}
	}

	// Parse pagination
	if page, err := strconv.Atoi(c.DefaultQuery("page", "1")); err == nil {
		params.Page = page
	}
	if pageSize, err := strconv.Atoi(c.DefaultQuery("page_size", "20")); err == nil {
		params.PageSize = pageSize
	}

	schedules, total, err := h.repo.List(params)
	if err != nil {
		h.logger.Error("Failed to list schedules", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"schedules": schedules,
		"total":     total,
		"page":      params.Page,
		"page_size": params.PageSize,
	})
}

// Get handles GET /api/v1/schedules/:id
func (h *ScheduleHandler) Get(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid schedule ID"})
		return
	}

	schedule, err := h.repo.Get(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Schedule not found"})
		return
	}

	c.JSON(http.StatusOK, schedule)
}

// Update handles PUT /api/v1/schedules/:id
func (h *ScheduleHandler) Update(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid schedule ID"})
		return
	}

	schedule, err := h.repo.Get(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Schedule not found"})
		return
	}

	var req CreateScheduleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate cron expression if changed
	if req.CronExpr != schedule.CronExpr {
		if err := scheduler.ValidateCronExpression(req.CronExpr); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid cron expression: " + err.Error()})
			return
		}
	}

	// Parse flow ID if changed
	if req.FlowID != "" {
		flowID, err := uuid.Parse(req.FlowID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid flow ID"})
			return
		}
		schedule.FlowID = flowID
	}

	// Update fields
	schedule.Name = req.Name
	schedule.Description = req.Description
	schedule.CronExpr = req.CronExpr
	if req.Timezone != "" {
		schedule.Timezone = req.Timezone
	}
	schedule.Environment = req.Environment
	schedule.NotifyOnFailure = req.NotifyOnFailure
	schedule.NotifyOnSuccess = req.NotifyOnSuccess
	schedule.NotifyEmails = req.NotifyEmails
	schedule.MaxRetries = req.MaxRetries
	schedule.RetryDelay = req.RetryDelay
	schedule.AllowOverlap = req.AllowOverlap
	schedule.Tags = req.Tags

	if err := h.scheduler.UpdateSchedule(schedule); err != nil {
		h.logger.Error("Failed to update schedule", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, schedule)
}

// Delete handles DELETE /api/v1/schedules/:id
func (h *ScheduleHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid schedule ID"})
		return
	}

	if err := h.scheduler.RemoveSchedule(id); err != nil {
		h.logger.Error("Failed to delete schedule", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Schedule deleted"})
}

// Pause handles POST /api/v1/schedules/:id/pause
func (h *ScheduleHandler) Pause(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid schedule ID"})
		return
	}

	if err := h.scheduler.PauseSchedule(id); err != nil {
		h.logger.Error("Failed to pause schedule", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Schedule paused"})
}

// Resume handles POST /api/v1/schedules/:id/resume
func (h *ScheduleHandler) Resume(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid schedule ID"})
		return
	}

	if err := h.scheduler.ResumeSchedule(id); err != nil {
		h.logger.Error("Failed to resume schedule", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Schedule resumed"})
}

// Trigger handles POST /api/v1/schedules/:id/trigger
func (h *ScheduleHandler) Trigger(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid schedule ID"})
		return
	}

	run, err := h.scheduler.TriggerSchedule(id)
	if err != nil {
		h.logger.Error("Failed to trigger schedule", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Schedule triggered",
		"run":     run,
	})
}

// GetRuns handles GET /api/v1/schedules/:id/runs
func (h *ScheduleHandler) GetRuns(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid schedule ID"})
		return
	}

	limit := 50
	if limitStr := c.Query("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			limit = l
		}
	}

	runs, err := h.repo.ListRuns(id, limit)
	if err != nil {
		h.logger.Error("Failed to get schedule runs", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"runs":  runs,
		"total": len(runs),
	})
}

// GetStats handles GET /api/v1/schedules/:id/stats
func (h *ScheduleHandler) GetStats(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid schedule ID"})
		return
	}

	days := 30
	if daysStr := c.Query("days"); daysStr != "" {
		if d, err := strconv.Atoi(daysStr); err == nil {
			days = d
		}
	}

	stats, err := h.repo.GetScheduleStats(id, days)
	if err != nil {
		h.logger.Error("Failed to get schedule stats", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, stats)
}

// ValidateCronRequest represents a request to validate a cron expression
type ValidateCronRequest struct {
	CronExpr string `json:"cron_expr" binding:"required"`
	Timezone string `json:"timezone"`
	Count    int    `json:"count"`
}

// ValidateCron handles POST /api/v1/schedules/validate-cron
func (h *ScheduleHandler) ValidateCron(c *gin.Context) {
	var req ValidateCronRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate expression
	if err := scheduler.ValidateCronExpression(req.CronExpr); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"valid": false,
			"error": err.Error(),
		})
		return
	}

	// Get next run times
	count := req.Count
	if count <= 0 || count > 10 {
		count = 5
	}

	timezone := req.Timezone
	if timezone == "" {
		timezone = "UTC"
	}

	nextTimes, err := scheduler.GetNextRunTimes(req.CronExpr, timezone, count)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"valid": false,
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"valid":          true,
		"next_run_times": nextTimes,
	})
}

// GetPresets handles GET /api/v1/schedules/presets
func (h *ScheduleHandler) GetPresets(c *gin.Context) {
	presets := make([]map[string]string, 0)
	for name, expr := range scheduler.CommonCronPresets {
		presets = append(presets, map[string]string{
			"name": name,
			"expr": expr,
		})
	}

	c.JSON(http.StatusOK, gin.H{"presets": presets})
}

// GetTimezones handles GET /api/v1/schedules/timezones
func (h *ScheduleHandler) GetTimezones(c *gin.Context) {
	// Common timezones
	timezones := []map[string]string{
		{"id": "UTC", "name": "UTC (Coordinated Universal Time)"},
		{"id": "America/New_York", "name": "Eastern Time (US & Canada)"},
		{"id": "America/Chicago", "name": "Central Time (US & Canada)"},
		{"id": "America/Denver", "name": "Mountain Time (US & Canada)"},
		{"id": "America/Los_Angeles", "name": "Pacific Time (US & Canada)"},
		{"id": "Europe/London", "name": "London"},
		{"id": "Europe/Paris", "name": "Paris"},
		{"id": "Europe/Berlin", "name": "Berlin"},
		{"id": "Asia/Tokyo", "name": "Tokyo"},
		{"id": "Asia/Shanghai", "name": "Shanghai"},
		{"id": "Asia/Singapore", "name": "Singapore"},
		{"id": "Australia/Sydney", "name": "Sydney"},
	}

	c.JSON(http.StatusOK, gin.H{"timezones": timezones})
}
