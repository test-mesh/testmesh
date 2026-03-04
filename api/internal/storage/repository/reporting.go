package repository

import (
	"time"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ReportingRepository handles reporting database operations
type ReportingRepository struct {
	db *gorm.DB
}

// NewReportingRepository creates a new reporting repository
func NewReportingRepository(db *gorm.DB) *ReportingRepository {
	return &ReportingRepository{db: db}
}

// ----- Daily Metrics -----

// CreateDailyMetric creates a new daily metric record
func (r *ReportingRepository) CreateDailyMetric(metric *models.DailyMetric) error {
	return r.db.Create(metric).Error
}

// UpsertDailyMetric creates or updates a daily metric for a given date and environment
func (r *ReportingRepository) UpsertDailyMetric(metric *models.DailyMetric) error {
	return r.db.Where("date = ? AND environment = ?", metric.Date, metric.Environment).
		Assign(metric).
		FirstOrCreate(metric).Error
}

// GetDailyMetrics retrieves daily metrics within a date range
func (r *ReportingRepository) GetDailyMetrics(startDate, endDate time.Time, environment string) ([]models.DailyMetric, error) {
	var metrics []models.DailyMetric
	query := r.db.Model(&models.DailyMetric{}).
		Where("date >= ? AND date <= ?", startDate, endDate)

	if environment != "" {
		query = query.Where("environment = ?", environment)
	}

	if err := query.Order("date ASC").Find(&metrics).Error; err != nil {
		return nil, err
	}
	return metrics, nil
}

// GetLatestDailyMetric retrieves the most recent daily metric
func (r *ReportingRepository) GetLatestDailyMetric(environment string) (*models.DailyMetric, error) {
	var metric models.DailyMetric
	query := r.db.Model(&models.DailyMetric{})
	if environment != "" {
		query = query.Where("environment = ?", environment)
	}
	if err := query.Order("date DESC").First(&metric).Error; err != nil {
		return nil, err
	}
	return &metric, nil
}

// ----- Flakiness Metrics -----

// CreateFlakinessMetric creates a new flakiness metric record
func (r *ReportingRepository) CreateFlakinessMetric(metric *models.FlakinessMetric) error {
	return r.db.Create(metric).Error
}

// UpsertFlakinessMetric creates or updates a flakiness metric for a given flow and window
func (r *ReportingRepository) UpsertFlakinessMetric(metric *models.FlakinessMetric) error {
	return r.db.Where("flow_id = ? AND window_start_date = ? AND window_end_date = ?",
		metric.FlowID, metric.WindowStartDate, metric.WindowEndDate).
		Assign(metric).
		FirstOrCreate(metric).Error
}

// GetFlakyFlows retrieves flows marked as flaky
func (r *ReportingRepository) GetFlakyFlows(limit, offset int) ([]models.FlakinessMetric, int64, error) {
	var metrics []models.FlakinessMetric
	var total int64

	query := r.db.Model(&models.FlakinessMetric{}).
		Preload("Flow").
		Where("is_flaky = ?", true)

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if err := query.Limit(limit).Offset(offset).
		Order("flakiness_score DESC").
		Find(&metrics).Error; err != nil {
		return nil, 0, err
	}

	return metrics, total, nil
}

// GetFlakinessHistory retrieves flakiness history for a specific flow
func (r *ReportingRepository) GetFlakinessHistory(flowID uuid.UUID, limit int) ([]models.FlakinessMetric, error) {
	var metrics []models.FlakinessMetric
	if err := r.db.Where("flow_id = ?", flowID).
		Order("window_end_date DESC").
		Limit(limit).
		Find(&metrics).Error; err != nil {
		return nil, err
	}
	return metrics, nil
}

// GetLatestFlakinessForFlow retrieves the most recent flakiness metric for a flow
func (r *ReportingRepository) GetLatestFlakinessForFlow(flowID uuid.UUID) (*models.FlakinessMetric, error) {
	var metric models.FlakinessMetric
	if err := r.db.Preload("Flow").
		Where("flow_id = ?", flowID).
		Order("window_end_date DESC").
		First(&metric).Error; err != nil {
		return nil, err
	}
	return &metric, nil
}

// ----- Reports -----

// CreateReport creates a new report record
func (r *ReportingRepository) CreateReport(report *models.Report) error {
	return r.db.Create(report).Error
}

// GetReportByID retrieves a report by ID
func (r *ReportingRepository) GetReportByID(id uuid.UUID) (*models.Report, error) {
	var report models.Report
	if err := r.db.First(&report, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &report, nil
}

// UpdateReport updates a report record
func (r *ReportingRepository) UpdateReport(report *models.Report) error {
	return r.db.Save(report).Error
}

// ListReports retrieves reports with optional filters
func (r *ReportingRepository) ListReports(format models.ReportFormat, status models.ReportStatus, limit, offset int) ([]models.Report, int64, error) {
	var reports []models.Report
	var total int64

	query := r.db.Model(&models.Report{})

	if format != "" {
		query = query.Where("format = ?", format)
	}
	if status != "" {
		query = query.Where("status = ?", status)
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if err := query.Limit(limit).Offset(offset).
		Order("created_at DESC").
		Find(&reports).Error; err != nil {
		return nil, 0, err
	}

	return reports, total, nil
}

// DeleteExpiredReports deletes reports that have passed their expiration date
func (r *ReportingRepository) DeleteExpiredReports() (int64, error) {
	result := r.db.Where("expires_at IS NOT NULL AND expires_at < ?", time.Now()).
		Delete(&models.Report{})
	return result.RowsAffected, result.Error
}

// DeleteReport deletes a report by ID
func (r *ReportingRepository) DeleteReport(id uuid.UUID) error {
	return r.db.Delete(&models.Report{}, "id = ?", id).Error
}

// ----- Step Performance -----

// CreateStepPerformance creates a new step performance record
func (r *ReportingRepository) CreateStepPerformance(perf *models.StepPerformance) error {
	return r.db.Create(perf).Error
}

// UpsertStepPerformance creates or updates step performance for a given flow, step, and date
func (r *ReportingRepository) UpsertStepPerformance(perf *models.StepPerformance) error {
	return r.db.Where("flow_id = ? AND step_id = ? AND date = ?",
		perf.FlowID, perf.StepID, perf.Date).
		Assign(perf).
		FirstOrCreate(perf).Error
}

// GetStepPerformance retrieves step performance metrics for a flow
func (r *ReportingRepository) GetStepPerformance(flowID uuid.UUID, startDate, endDate time.Time) ([]models.StepPerformance, error) {
	var metrics []models.StepPerformance
	if err := r.db.Where("flow_id = ? AND date >= ? AND date <= ?", flowID, startDate, endDate).
		Order("date ASC, step_id ASC").
		Find(&metrics).Error; err != nil {
		return nil, err
	}
	return metrics, nil
}

// GetStepPerformanceByAction retrieves step performance grouped by action type
func (r *ReportingRepository) GetStepPerformanceByAction(action string, startDate, endDate time.Time) ([]models.StepPerformance, error) {
	var metrics []models.StepPerformance
	if err := r.db.Where("action = ? AND date >= ? AND date <= ?", action, startDate, endDate).
		Preload("Flow").
		Order("date ASC").
		Find(&metrics).Error; err != nil {
		return nil, err
	}
	return metrics, nil
}

// GetSlowestSteps retrieves the slowest steps across all flows
func (r *ReportingRepository) GetSlowestSteps(limit int, startDate, endDate time.Time) ([]models.StepPerformance, error) {
	var metrics []models.StepPerformance
	if err := r.db.Where("date >= ? AND date <= ?", startDate, endDate).
		Preload("Flow").
		Order("avg_duration_ms DESC").
		Limit(limit).
		Find(&metrics).Error; err != nil {
		return nil, err
	}
	return metrics, nil
}

// GetMostFailingSteps retrieves steps with the highest failure rates
func (r *ReportingRepository) GetMostFailingSteps(limit int, startDate, endDate time.Time) ([]models.StepPerformance, error) {
	var metrics []models.StepPerformance
	if err := r.db.Where("date >= ? AND date <= ? AND execution_count > 0", startDate, endDate).
		Preload("Flow").
		Order("(failed_count::float / execution_count) DESC").
		Limit(limit).
		Find(&metrics).Error; err != nil {
		return nil, err
	}
	return metrics, nil
}
