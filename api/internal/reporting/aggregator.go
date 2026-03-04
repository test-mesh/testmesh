package reporting

import (
	"context"
	"sort"
	"time"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"github.com/robfig/cron/v3"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// Aggregator handles metrics aggregation and scheduled jobs
type Aggregator struct {
	db           *gorm.DB
	reportRepo   *repository.ReportingRepository
	execRepo     *repository.ExecutionRepository
	flowRepo     *repository.FlowRepository
	logger       *zap.Logger
	cron         *cron.Cron
	flakyThreshold float64 // Threshold for marking a flow as flaky (e.g., 0.1 = 10% flakiness)
}

// NewAggregator creates a new metrics aggregator
func NewAggregator(
	db *gorm.DB,
	reportRepo *repository.ReportingRepository,
	execRepo *repository.ExecutionRepository,
	flowRepo *repository.FlowRepository,
	logger *zap.Logger,
) *Aggregator {
	return &Aggregator{
		db:             db,
		reportRepo:     reportRepo,
		execRepo:       execRepo,
		flowRepo:       flowRepo,
		logger:         logger,
		flakyThreshold: 0.1,
	}
}

// ScheduleAggregation starts the scheduled aggregation job (runs at 2 AM daily)
func (a *Aggregator) ScheduleAggregation() error {
	a.cron = cron.New(cron.WithLocation(time.UTC))

	// Run daily at 2 AM UTC
	_, err := a.cron.AddFunc("0 2 * * *", func() {
		ctx := context.Background()
		yesterday := time.Now().UTC().AddDate(0, 0, -1).Truncate(24 * time.Hour)

		a.logger.Info("Starting scheduled metrics aggregation", zap.Time("date", yesterday))

		if err := a.AggregateDailyMetrics(ctx, yesterday); err != nil {
			a.logger.Error("Failed to aggregate daily metrics", zap.Error(err))
		}

		if err := a.CalculateFlakiness(ctx, 7); err != nil {
			a.logger.Error("Failed to calculate flakiness", zap.Error(err))
		}

		if err := a.AggregateStepPerformance(ctx, yesterday); err != nil {
			a.logger.Error("Failed to aggregate step performance", zap.Error(err))
		}

		// Clean up expired reports
		deleted, err := a.reportRepo.DeleteExpiredReports()
		if err != nil {
			a.logger.Error("Failed to delete expired reports", zap.Error(err))
		} else if deleted > 0 {
			a.logger.Info("Deleted expired reports", zap.Int64("count", deleted))
		}

		a.logger.Info("Completed scheduled metrics aggregation")
	})
	if err != nil {
		return err
	}

	a.cron.Start()
	a.logger.Info("Scheduled metrics aggregation job started (runs daily at 2 AM UTC)")
	return nil
}

// Stop stops the scheduled aggregation
func (a *Aggregator) Stop() {
	if a.cron != nil {
		a.cron.Stop()
	}
}

// AggregateDailyMetrics aggregates execution metrics for a specific date
func (a *Aggregator) AggregateDailyMetrics(ctx context.Context, date time.Time) error {
	date = date.Truncate(24 * time.Hour)
	nextDay := date.Add(24 * time.Hour)

	// Query aggregated data from executions
	var results []struct {
		Environment   string
		TotalExecs    int
		PassedExecs   int
		FailedExecs   int
		AvgDurationMs float64
		TotalSteps    int
		PassedSteps   int
		FailedSteps   int
	}

	err := a.db.Table("executions.executions").
		Select(`
			environment,
			COUNT(*) as total_execs,
			SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as passed_execs,
			SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_execs,
			AVG(duration_ms) as avg_duration_ms,
			SUM(total_steps) as total_steps,
			SUM(passed_steps) as passed_steps,
			SUM(failed_steps) as failed_steps
		`).
		Where("created_at >= ? AND created_at < ?", date, nextDay).
		Where("status IN ?", []string{"completed", "failed"}).
		Group("environment").
		Scan(&results).Error
	if err != nil {
		return err
	}

	for _, r := range results {
		// Calculate percentiles for duration
		var durations []int64
		a.db.Table("executions.executions").
			Where("created_at >= ? AND created_at < ? AND environment = ? AND status IN ?",
				date, nextDay, r.Environment, []string{"completed", "failed"}).
			Pluck("duration_ms", &durations)

		p50, p95, p99 := calculatePercentiles(durations)

		// Get unique flow count
		var totalFlows int64
		a.db.Table("executions.executions").
			Where("created_at >= ? AND created_at < ? AND environment = ?", date, nextDay, r.Environment).
			Distinct("flow_id").
			Count(&totalFlows)

		// Calculate pass rate
		var passRate float64
		if r.TotalExecs > 0 {
			passRate = float64(r.PassedExecs) / float64(r.TotalExecs) * 100
		}

		// Build per-flow metrics
		flowMetrics := a.buildFlowMetrics(date, nextDay, r.Environment)
		suiteMetrics := a.buildSuiteMetrics(date, nextDay, r.Environment)

		metric := &models.DailyMetric{
			Date:           date,
			Environment:    r.Environment,
			TotalFlows:     int(totalFlows),
			TotalExecs:     r.TotalExecs,
			PassedExecs:    r.PassedExecs,
			FailedExecs:    r.FailedExecs,
			PassRate:       passRate,
			AvgDurationMs:  int64(r.AvgDurationMs),
			P50DurationMs:  p50,
			P95DurationMs:  p95,
			P99DurationMs:  p99,
			TotalSteps:     r.TotalSteps,
			PassedSteps:    r.PassedSteps,
			FailedSteps:    r.FailedSteps,
			ByFlowMetrics:  flowMetrics,
			BySuiteMetrics: suiteMetrics,
		}

		if err := a.reportRepo.UpsertDailyMetric(metric); err != nil {
			a.logger.Error("Failed to upsert daily metric",
				zap.Time("date", date),
				zap.String("environment", r.Environment),
				zap.Error(err))
		}
	}

	a.logger.Info("Aggregated daily metrics", zap.Time("date", date), zap.Int("environments", len(results)))
	return nil
}

func (a *Aggregator) buildFlowMetrics(start, end time.Time, env string) models.FlowMetricsMap {
	var results []struct {
		FlowID        uuid.UUID
		FlowName      string
		TotalExecs    int
		PassedExecs   int
		FailedExecs   int
		AvgDurationMs float64
	}

	a.db.Table("executions.executions e").
		Select(`
			e.flow_id,
			f.name as flow_name,
			COUNT(*) as total_execs,
			SUM(CASE WHEN e.status = 'completed' THEN 1 ELSE 0 END) as passed_execs,
			SUM(CASE WHEN e.status = 'failed' THEN 1 ELSE 0 END) as failed_execs,
			AVG(e.duration_ms) as avg_duration_ms
		`).
		Joins("JOIN flows.flows f ON e.flow_id = f.id").
		Where("e.created_at >= ? AND e.created_at < ? AND e.environment = ? AND e.status IN ?",
			start, end, env, []string{"completed", "failed"}).
		Group("e.flow_id, f.name").
		Scan(&results)

	metrics := make(models.FlowMetricsMap)
	for _, r := range results {
		var passRate float64
		if r.TotalExecs > 0 {
			passRate = float64(r.PassedExecs) / float64(r.TotalExecs) * 100
		}
		metrics[r.FlowID.String()] = models.FlowMetricEntry{
			FlowID:        r.FlowID.String(),
			FlowName:      r.FlowName,
			Executions:    r.TotalExecs,
			Passed:        r.PassedExecs,
			Failed:        r.FailedExecs,
			PassRate:      passRate,
			AvgDurationMs: int64(r.AvgDurationMs),
		}
	}
	return metrics
}

func (a *Aggregator) buildSuiteMetrics(start, end time.Time, env string) models.SuiteMetricsMap {
	var results []struct {
		Suite         string
		FlowCount     int
		TotalExecs    int
		PassedExecs   int
		FailedExecs   int
		AvgDurationMs float64
	}

	a.db.Table("executions.executions e").
		Select(`
			COALESCE(f.suite, 'default') as suite,
			COUNT(DISTINCT e.flow_id) as flow_count,
			COUNT(*) as total_execs,
			SUM(CASE WHEN e.status = 'completed' THEN 1 ELSE 0 END) as passed_execs,
			SUM(CASE WHEN e.status = 'failed' THEN 1 ELSE 0 END) as failed_execs,
			AVG(e.duration_ms) as avg_duration_ms
		`).
		Joins("JOIN flows.flows f ON e.flow_id = f.id").
		Where("e.created_at >= ? AND e.created_at < ? AND e.environment = ? AND e.status IN ?",
			start, end, env, []string{"completed", "failed"}).
		Group("COALESCE(f.suite, 'default')").
		Scan(&results)

	metrics := make(models.SuiteMetricsMap)
	for _, r := range results {
		var passRate float64
		if r.TotalExecs > 0 {
			passRate = float64(r.PassedExecs) / float64(r.TotalExecs) * 100
		}
		metrics[r.Suite] = models.SuiteMetricEntry{
			Suite:         r.Suite,
			Flows:         r.FlowCount,
			Executions:    r.TotalExecs,
			Passed:        r.PassedExecs,
			Failed:        r.FailedExecs,
			PassRate:      passRate,
			AvgDurationMs: int64(r.AvgDurationMs),
		}
	}
	return metrics
}

// CalculateFlakiness analyzes execution patterns to detect flaky tests
func (a *Aggregator) CalculateFlakiness(ctx context.Context, windowDays int) error {
	endDate := time.Now().UTC().Truncate(24 * time.Hour)
	startDate := endDate.AddDate(0, 0, -windowDays)

	// Get all flows that have executions in the window
	var flowIDs []uuid.UUID
	a.db.Table("executions.executions").
		Where("created_at >= ? AND created_at <= ?", startDate, endDate).
		Distinct("flow_id").
		Pluck("flow_id", &flowIDs)

	for _, flowID := range flowIDs {
		if err := a.calculateFlowFlakiness(flowID, startDate, endDate, windowDays); err != nil {
			a.logger.Error("Failed to calculate flakiness for flow",
				zap.String("flow_id", flowID.String()),
				zap.Error(err))
		}
	}

	a.logger.Info("Calculated flakiness metrics",
		zap.Int("flows", len(flowIDs)),
		zap.Int("window_days", windowDays))
	return nil
}

func (a *Aggregator) calculateFlowFlakiness(flowID uuid.UUID, startDate, endDate time.Time, windowDays int) error {
	// Get execution results in order
	var executions []struct {
		Status    string
		CreatedAt time.Time
		Error     string
	}

	err := a.db.Table("executions.executions").
		Select("status, created_at, error").
		Where("flow_id = ? AND created_at >= ? AND created_at <= ? AND status IN ?",
			flowID, startDate, endDate, []string{"completed", "failed"}).
		Order("created_at ASC").
		Scan(&executions).Error
	if err != nil {
		return err
	}

	if len(executions) < 2 {
		return nil // Not enough data to determine flakiness
	}

	var passed, failed, transitions int
	var lastStatus string
	errorPatterns := make(map[string]int)

	for i, exec := range executions {
		if exec.Status == "completed" {
			passed++
		} else {
			failed++
			if exec.Error != "" {
				// Extract error pattern (first 100 chars)
				pattern := exec.Error
				if len(pattern) > 100 {
					pattern = pattern[:100]
				}
				errorPatterns[pattern]++
			}
		}

		if i > 0 && exec.Status != lastStatus {
			transitions++
		}
		lastStatus = exec.Status
	}

	total := passed + failed

	// Flakiness score: weighted combination of pass/fail ratio and transitions
	// Higher score = more flaky
	// Formula: (transitions / (total-1)) * (1 - abs(pass_rate - 0.5) * 2)
	// This gives higher scores when there are many transitions and pass rate is near 50%
	var flakinessScore float64
	if total > 1 {
		transitionRate := float64(transitions) / float64(total-1)
		passRate := float64(passed) / float64(total)
		// Score is higher when pass rate is close to 50% (inconsistent)
		consistency := 1.0 - abs(passRate-0.5)*2
		flakinessScore = transitionRate * consistency
	}

	// Get top failure patterns
	var failurePatterns []string
	type patternCount struct {
		pattern string
		count   int
	}
	var patterns []patternCount
	for p, c := range errorPatterns {
		patterns = append(patterns, patternCount{p, c})
	}
	sort.Slice(patterns, func(i, j int) bool {
		return patterns[i].count > patterns[j].count
	})
	for i := 0; i < min(3, len(patterns)); i++ {
		failurePatterns = append(failurePatterns, patterns[i].pattern)
	}

	metric := &models.FlakinessMetric{
		FlowID:          flowID,
		WindowStartDate: startDate,
		WindowEndDate:   endDate,
		WindowDays:      windowDays,
		TotalExecs:      total,
		PassedExecs:     passed,
		FailedExecs:     failed,
		Transitions:     transitions,
		FlakinessScore:  flakinessScore,
		IsFlaky:         flakinessScore >= a.flakyThreshold,
		FailurePatterns: failurePatterns,
	}

	return a.reportRepo.UpsertFlakinessMetric(metric)
}

// AggregateStepPerformance aggregates step-level performance metrics
func (a *Aggregator) AggregateStepPerformance(ctx context.Context, date time.Time) error {
	date = date.Truncate(24 * time.Hour)
	nextDay := date.Add(24 * time.Hour)

	// Query step performance data grouped by flow and step
	var results []struct {
		FlowID        uuid.UUID
		StepID        string
		StepName      string
		Action        string
		ExecCount     int
		PassedCount   int
		FailedCount   int
		AvgDurationMs float64
		MinDurationMs int64
		MaxDurationMs int64
	}

	err := a.db.Table("executions.execution_steps es").
		Select(`
			e.flow_id,
			es.step_id,
			es.step_name,
			es.action,
			COUNT(*) as exec_count,
			SUM(CASE WHEN es.status = 'completed' THEN 1 ELSE 0 END) as passed_count,
			SUM(CASE WHEN es.status = 'failed' THEN 1 ELSE 0 END) as failed_count,
			AVG(es.duration_ms) as avg_duration_ms,
			MIN(es.duration_ms) as min_duration_ms,
			MAX(es.duration_ms) as max_duration_ms
		`).
		Joins("JOIN executions.executions e ON es.execution_id = e.id").
		Where("es.created_at >= ? AND es.created_at < ? AND es.status IN ?",
			date, nextDay, []string{"completed", "failed"}).
		Group("e.flow_id, es.step_id, es.step_name, es.action").
		Scan(&results).Error
	if err != nil {
		return err
	}

	for _, r := range results {
		// Get duration percentiles for this step
		var durations []int64
		a.db.Table("executions.execution_steps es").
			Joins("JOIN executions.executions e ON es.execution_id = e.id").
			Where("e.flow_id = ? AND es.step_id = ? AND es.created_at >= ? AND es.created_at < ?",
				r.FlowID, r.StepID, date, nextDay).
			Pluck("es.duration_ms", &durations)

		p50, p95, p99 := calculatePercentiles(durations)

		// Get common errors
		var errors []string
		a.db.Table("executions.execution_steps es").
			Joins("JOIN executions.executions e ON es.execution_id = e.id").
			Where("e.flow_id = ? AND es.step_id = ? AND es.created_at >= ? AND es.created_at < ? AND es.error_message != ''",
				r.FlowID, r.StepID, date, nextDay).
			Distinct("es.error_message").
			Limit(5).
			Pluck("es.error_message", &errors)

		var passRate float64
		if r.ExecCount > 0 {
			passRate = float64(r.PassedCount) / float64(r.ExecCount) * 100
		}

		perf := &models.StepPerformance{
			FlowID:         r.FlowID,
			StepID:         r.StepID,
			StepName:       r.StepName,
			Action:         r.Action,
			Date:           date,
			ExecutionCount: r.ExecCount,
			PassedCount:    r.PassedCount,
			FailedCount:    r.FailedCount,
			PassRate:       passRate,
			AvgDurationMs:  int64(r.AvgDurationMs),
			MinDurationMs:  r.MinDurationMs,
			MaxDurationMs:  r.MaxDurationMs,
			P50DurationMs:  p50,
			P95DurationMs:  p95,
			P99DurationMs:  p99,
			CommonErrors:   errors,
		}

		if err := a.reportRepo.UpsertStepPerformance(perf); err != nil {
			a.logger.Error("Failed to upsert step performance",
				zap.String("flow_id", r.FlowID.String()),
				zap.String("step_id", r.StepID),
				zap.Error(err))
		}
	}

	a.logger.Info("Aggregated step performance", zap.Time("date", date), zap.Int("steps", len(results)))
	return nil
}

// RunManualAggregation runs aggregation for a specific date range (for backfilling)
func (a *Aggregator) RunManualAggregation(ctx context.Context, startDate, endDate time.Time) error {
	current := startDate.Truncate(24 * time.Hour)
	end := endDate.Truncate(24 * time.Hour)

	for !current.After(end) {
		a.logger.Info("Running manual aggregation", zap.Time("date", current))

		if err := a.AggregateDailyMetrics(ctx, current); err != nil {
			a.logger.Error("Failed to aggregate daily metrics", zap.Time("date", current), zap.Error(err))
		}

		if err := a.AggregateStepPerformance(ctx, current); err != nil {
			a.logger.Error("Failed to aggregate step performance", zap.Time("date", current), zap.Error(err))
		}

		current = current.Add(24 * time.Hour)
	}

	// Calculate flakiness for the entire period
	windowDays := int(endDate.Sub(startDate).Hours() / 24)
	if windowDays < 1 {
		windowDays = 7
	}
	return a.CalculateFlakiness(ctx, windowDays)
}

// Helper functions

func calculatePercentiles(values []int64) (p50, p95, p99 int64) {
	if len(values) == 0 {
		return 0, 0, 0
	}

	sorted := make([]int64, len(values))
	copy(sorted, values)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })

	p50 = sorted[percentileIndex(len(sorted), 50)]
	p95 = sorted[percentileIndex(len(sorted), 95)]
	p99 = sorted[percentileIndex(len(sorted), 99)]

	return
}

func percentileIndex(length, percentile int) int {
	idx := (length * percentile) / 100
	if idx >= length {
		idx = length - 1
	}
	return idx
}

func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
