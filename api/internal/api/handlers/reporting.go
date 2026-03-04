package handlers

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/georgi-georgiev/testmesh/internal/reporting"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// ReportingHandler handles reporting-related requests
type ReportingHandler struct {
	repo       *repository.ReportingRepository
	aggregator *reporting.Aggregator
	generator  *reporting.Generator
	logger     *zap.Logger
}

// NewReportingHandler creates a new reporting handler
func NewReportingHandler(
	repo *repository.ReportingRepository,
	aggregator *reporting.Aggregator,
	generator *reporting.Generator,
	logger *zap.Logger,
) *ReportingHandler {
	return &ReportingHandler{
		repo:       repo,
		aggregator: aggregator,
		generator:  generator,
		logger:     logger,
	}
}

// GenerateReport handles POST /api/v1/reports/generate
func (h *ReportingHandler) GenerateReport(c *gin.Context) {
	var req struct {
		Name      string               `json:"name" binding:"required"`
		Format    string               `json:"format" binding:"required,oneof=html json junit"`
		StartDate string               `json:"start_date" binding:"required"`
		EndDate   string               `json:"end_date" binding:"required"`
		Filters   models.ReportFilters `json:"filters"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	startDate, err := time.Parse("2006-01-02", req.StartDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid start_date format, use YYYY-MM-DD"})
		return
	}

	endDate, err := time.Parse("2006-01-02", req.EndDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid end_date format, use YYYY-MM-DD"})
		return
	}

	if endDate.Before(startDate) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "end_date must be after start_date"})
		return
	}

	report := &models.Report{
		Name:      req.Name,
		Format:    models.ReportFormat(req.Format),
		Status:    models.ReportStatusPending,
		StartDate: startDate,
		EndDate:   endDate,
		Filters:   req.Filters,
	}

	if err := h.repo.CreateReport(report); err != nil {
		h.logger.Error("Failed to create report", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create report"})
		return
	}

	// Generate report asynchronously
	go func() {
		ctx := context.Background()
		if err := h.generator.GenerateReport(ctx, report); err != nil {
			h.logger.Error("Failed to generate report", zap.String("id", report.ID.String()), zap.Error(err))
		}
	}()

	c.JSON(http.StatusAccepted, report)
}

// ListReports handles GET /api/v1/reports
func (h *ReportingHandler) ListReports(c *gin.Context) {
	format := models.ReportFormat(c.Query("format"))
	status := models.ReportStatus(c.Query("status"))
	limit := parseIntQuery(c, "limit", 20)
	offset := parseIntQuery(c, "offset", 0)

	reports, total, err := h.repo.ListReports(format, status, limit, offset)
	if err != nil {
		h.logger.Error("Failed to list reports", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list reports"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"reports": reports,
		"total":   total,
		"limit":   limit,
		"offset":  offset,
	})
}

// GetReport handles GET /api/v1/reports/:id
func (h *ReportingHandler) GetReport(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid report ID"})
		return
	}

	report, err := h.repo.GetReportByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "report not found"})
		return
	}

	c.JSON(http.StatusOK, report)
}

// DownloadReport handles GET /api/v1/reports/:id/download
func (h *ReportingHandler) DownloadReport(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid report ID"})
		return
	}

	content, contentType, err := h.generator.GetReportFile(id)
	if err != nil {
		h.logger.Error("Failed to get report file", zap.String("id", id.String()), zap.Error(err))
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	report, _ := h.repo.GetReportByID(id)
	filename := report.Name
	switch report.Format {
	case models.ReportFormatHTML:
		filename += ".html"
	case models.ReportFormatJSON:
		filename += ".json"
	case models.ReportFormatJUnit:
		filename += ".xml"
	}

	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.Data(http.StatusOK, contentType, content)
}

// DeleteReport handles DELETE /api/v1/reports/:id
func (h *ReportingHandler) DeleteReport(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid report ID"})
		return
	}

	if err := h.repo.DeleteReport(id); err != nil {
		h.logger.Error("Failed to delete report", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete report"})
		return
	}

	c.JSON(http.StatusNoContent, nil)
}

// GetMetrics handles GET /api/v1/analytics/metrics
func (h *ReportingHandler) GetMetrics(c *gin.Context) {
	startDateStr := c.Query("start_date")
	endDateStr := c.Query("end_date")
	environment := c.Query("environment")

	// Default to last 30 days
	endDate := time.Now().UTC().Truncate(24 * time.Hour)
	startDate := endDate.AddDate(0, 0, -30)

	if startDateStr != "" {
		if parsed, err := time.Parse("2006-01-02", startDateStr); err == nil {
			startDate = parsed
		}
	}
	if endDateStr != "" {
		if parsed, err := time.Parse("2006-01-02", endDateStr); err == nil {
			endDate = parsed
		}
	}

	metrics, err := h.repo.GetDailyMetrics(startDate, endDate, environment)
	if err != nil {
		h.logger.Error("Failed to get metrics", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get metrics"})
		return
	}

	// Calculate summary
	var totalExecs, passedExecs, failedExecs, totalSteps, passedSteps, failedSteps int
	var totalDuration int64
	for _, m := range metrics {
		totalExecs += m.TotalExecs
		passedExecs += m.PassedExecs
		failedExecs += m.FailedExecs
		totalSteps += m.TotalSteps
		passedSteps += m.PassedSteps
		failedSteps += m.FailedSteps
		totalDuration += m.AvgDurationMs * int64(m.TotalExecs)
	}

	var passRate float64
	var avgDuration int64
	if totalExecs > 0 {
		passRate = float64(passedExecs) / float64(totalExecs) * 100
		avgDuration = totalDuration / int64(totalExecs)
	}

	c.JSON(http.StatusOK, gin.H{
		"metrics":    metrics,
		"start_date": startDate.Format("2006-01-02"),
		"end_date":   endDate.Format("2006-01-02"),
		"summary": gin.H{
			"total_executions":  totalExecs,
			"passed_executions": passedExecs,
			"failed_executions": failedExecs,
			"pass_rate":         passRate,
			"avg_duration_ms":   avgDuration,
			"total_steps":       totalSteps,
			"passed_steps":      passedSteps,
			"failed_steps":      failedSteps,
		},
	})
}

// GetFlakiness handles GET /api/v1/analytics/flakiness
func (h *ReportingHandler) GetFlakiness(c *gin.Context) {
	flowIDStr := c.Query("flow_id")
	limit := parseIntQuery(c, "limit", 20)
	offset := parseIntQuery(c, "offset", 0)

	// If a specific flow is requested, get its history
	if flowIDStr != "" {
		flowID, err := uuid.Parse(flowIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid flow_id"})
			return
		}

		history, err := h.repo.GetFlakinessHistory(flowID, limit)
		if err != nil {
			h.logger.Error("Failed to get flakiness history", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get flakiness history"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"flow_id": flowIDStr,
			"history": history,
		})
		return
	}

	// Otherwise, list all flaky flows
	flakyFlows, total, err := h.repo.GetFlakyFlows(limit, offset)
	if err != nil {
		h.logger.Error("Failed to get flaky flows", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get flaky flows"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"flaky_flows": flakyFlows,
		"total":       total,
		"limit":       limit,
		"offset":      offset,
	})
}

// GetTrends handles GET /api/v1/analytics/trends
func (h *ReportingHandler) GetTrends(c *gin.Context) {
	startDateStr := c.Query("start_date")
	endDateStr := c.Query("end_date")
	environment := c.Query("environment")
	groupBy := c.Query("group_by") // "day", "week", "month"

	// Default to last 30 days
	endDate := time.Now().UTC().Truncate(24 * time.Hour)
	startDate := endDate.AddDate(0, 0, -30)

	if startDateStr != "" {
		if parsed, err := time.Parse("2006-01-02", startDateStr); err == nil {
			startDate = parsed
		}
	}
	if endDateStr != "" {
		if parsed, err := time.Parse("2006-01-02", endDateStr); err == nil {
			endDate = parsed
		}
	}

	metrics, err := h.repo.GetDailyMetrics(startDate, endDate, environment)
	if err != nil {
		h.logger.Error("Failed to get metrics for trends", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get trends"})
		return
	}

	// Build trend data points
	type TrendPoint struct {
		Date          string  `json:"date"`
		Executions    int     `json:"executions"`
		PassRate      float64 `json:"pass_rate"`
		AvgDurationMs int64   `json:"avg_duration_ms"`
	}

	var trends []TrendPoint

	if groupBy == "week" || groupBy == "month" {
		// Aggregate by week or month
		grouped := make(map[string]*TrendPoint)
		for _, m := range metrics {
			var key string
			if groupBy == "week" {
				year, week := m.Date.ISOWeek()
				key = time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC).AddDate(0, 0, (week-1)*7).Format("2006-01-02")
			} else {
				key = m.Date.Format("2006-01")
			}

			if _, exists := grouped[key]; !exists {
				grouped[key] = &TrendPoint{Date: key}
			}
			grouped[key].Executions += m.TotalExecs
			// Weighted average for duration
			totalDuration := grouped[key].AvgDurationMs*int64(grouped[key].Executions-m.TotalExecs) + m.AvgDurationMs*int64(m.TotalExecs)
			if grouped[key].Executions > 0 {
				grouped[key].AvgDurationMs = totalDuration / int64(grouped[key].Executions)
			}
		}

		// Calculate pass rates
		for _, m := range metrics {
			var key string
			if groupBy == "week" {
				year, week := m.Date.ISOWeek()
				key = time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC).AddDate(0, 0, (week-1)*7).Format("2006-01-02")
			} else {
				key = m.Date.Format("2006-01")
			}
			if grouped[key].Executions > 0 {
				grouped[key].PassRate = float64(m.PassedExecs) / float64(m.TotalExecs) * 100
			}
		}

		for _, v := range grouped {
			trends = append(trends, *v)
		}
	} else {
		// Daily granularity
		for _, m := range metrics {
			trends = append(trends, TrendPoint{
				Date:          m.Date.Format("2006-01-02"),
				Executions:    m.TotalExecs,
				PassRate:      m.PassRate,
				AvgDurationMs: m.AvgDurationMs,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"trends":     trends,
		"start_date": startDate.Format("2006-01-02"),
		"end_date":   endDate.Format("2006-01-02"),
		"group_by":   groupBy,
	})
}

// TriggerAggregation handles POST /api/v1/analytics/aggregate (manual trigger)
func (h *ReportingHandler) TriggerAggregation(c *gin.Context) {
	var req struct {
		StartDate string `json:"start_date"`
		EndDate   string `json:"end_date"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		// Default to yesterday
		yesterday := time.Now().UTC().AddDate(0, 0, -1).Truncate(24 * time.Hour)
		req.StartDate = yesterday.Format("2006-01-02")
		req.EndDate = yesterday.Format("2006-01-02")
	}

	startDate, err := time.Parse("2006-01-02", req.StartDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid start_date format"})
		return
	}

	endDate, err := time.Parse("2006-01-02", req.EndDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid end_date format"})
		return
	}

	// Run aggregation asynchronously
	go func() {
		ctx := context.Background()
		if err := h.aggregator.RunManualAggregation(ctx, startDate, endDate); err != nil {
			h.logger.Error("Failed to run manual aggregation", zap.Error(err))
		}
	}()

	c.JSON(http.StatusAccepted, gin.H{
		"message":    "Aggregation started",
		"start_date": req.StartDate,
		"end_date":   req.EndDate,
	})
}

// GetStepPerformance handles GET /api/v1/analytics/steps
func (h *ReportingHandler) GetStepPerformance(c *gin.Context) {
	flowIDStr := c.Query("flow_id")
	action := c.Query("action")
	startDateStr := c.Query("start_date")
	endDateStr := c.Query("end_date")

	// Default to last 7 days
	endDate := time.Now().UTC().Truncate(24 * time.Hour)
	startDate := endDate.AddDate(0, 0, -7)

	if startDateStr != "" {
		if parsed, err := time.Parse("2006-01-02", startDateStr); err == nil {
			startDate = parsed
		}
	}
	if endDateStr != "" {
		if parsed, err := time.Parse("2006-01-02", endDateStr); err == nil {
			endDate = parsed
		}
	}

	if flowIDStr != "" {
		flowID, err := uuid.Parse(flowIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid flow_id"})
			return
		}

		perf, err := h.repo.GetStepPerformance(flowID, startDate, endDate)
		if err != nil {
			h.logger.Error("Failed to get step performance", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get step performance"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"flow_id":          flowIDStr,
			"step_performance": perf,
			"start_date":       startDate.Format("2006-01-02"),
			"end_date":         endDate.Format("2006-01-02"),
		})
		return
	}

	if action != "" {
		perf, err := h.repo.GetStepPerformanceByAction(action, startDate, endDate)
		if err != nil {
			h.logger.Error("Failed to get step performance by action", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get step performance"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"action":           action,
			"step_performance": perf,
			"start_date":       startDate.Format("2006-01-02"),
			"end_date":         endDate.Format("2006-01-02"),
		})
		return
	}

	// Return slowest steps by default
	slowest, err := h.repo.GetSlowestSteps(20, startDate, endDate)
	if err != nil {
		h.logger.Error("Failed to get slowest steps", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get slowest steps"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"slowest_steps": slowest,
		"start_date":    startDate.Format("2006-01-02"),
		"end_date":      endDate.Format("2006-01-02"),
	})
}

func parseIntQuery(c *gin.Context, key string, defaultVal int) int {
	if val := c.Query(key); val != "" {
		if parsed, err := strconv.Atoi(val); err == nil {
			return parsed
		}
	}
	return defaultVal
}
