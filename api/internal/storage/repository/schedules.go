package repository

import (
	"time"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ScheduleRepository handles schedule database operations
type ScheduleRepository struct {
	db *gorm.DB
}

// NewScheduleRepository creates a new schedule repository
func NewScheduleRepository(db *gorm.DB) *ScheduleRepository {
	return &ScheduleRepository{db: db}
}

// Create creates a new schedule
func (r *ScheduleRepository) Create(schedule *models.Schedule) error {
	return r.db.Create(schedule).Error
}

// Get retrieves a schedule by ID
func (r *ScheduleRepository) Get(id uuid.UUID) (*models.Schedule, error) {
	var schedule models.Schedule
	err := r.db.Preload("Flow").First(&schedule, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &schedule, nil
}

// Update updates a schedule
func (r *ScheduleRepository) Update(schedule *models.Schedule) error {
	return r.db.Save(schedule).Error
}

// Delete deletes a schedule
func (r *ScheduleRepository) Delete(id uuid.UUID) error {
	return r.db.Delete(&models.Schedule{}, "id = ?", id).Error
}

// List lists schedules with optional filtering
func (r *ScheduleRepository) List(params models.ScheduleListParams) ([]*models.Schedule, int64, error) {
	query := r.db.Model(&models.Schedule{})

	// Apply filters
	if params.Status != "" {
		query = query.Where("status = ?", params.Status)
	}
	if params.FlowID != uuid.Nil {
		query = query.Where("flow_id = ?", params.FlowID)
	}
	if params.Search != "" {
		query = query.Where("name ILIKE ? OR description ILIKE ?",
			"%"+params.Search+"%", "%"+params.Search+"%")
	}
	if len(params.Tags) > 0 {
		query = query.Where("tags @> ?", params.Tags)
	}

	// Count total
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Apply pagination
	if params.PageSize > 0 {
		query = query.Limit(params.PageSize)
		if params.Page > 0 {
			query = query.Offset((params.Page - 1) * params.PageSize)
		}
	}

	// Execute query
	var schedules []*models.Schedule
	err := query.Preload("Flow").Order("created_at DESC").Find(&schedules).Error
	if err != nil {
		return nil, 0, err
	}

	return schedules, total, nil
}

// ListActive returns all active schedules
func (r *ScheduleRepository) ListActive() ([]*models.Schedule, error) {
	var schedules []*models.Schedule
	err := r.db.Where("status = ?", models.ScheduleStatusActive).
		Preload("Flow").
		Find(&schedules).Error
	return schedules, err
}

// ListDueSchedules returns schedules that are due to run
func (r *ScheduleRepository) ListDueSchedules(before time.Time) ([]*models.Schedule, error) {
	var schedules []*models.Schedule
	err := r.db.Where("status = ? AND next_run_at <= ?", models.ScheduleStatusActive, before).
		Preload("Flow").
		Find(&schedules).Error
	return schedules, err
}

// UpdateNextRunTime updates the next run time for a schedule
func (r *ScheduleRepository) UpdateNextRunTime(id uuid.UUID, nextRunAt time.Time) error {
	return r.db.Model(&models.Schedule{}).
		Where("id = ?", id).
		Update("next_run_at", nextRunAt).Error
}

// UpdateLastRun updates the last run information for a schedule
func (r *ScheduleRepository) UpdateLastRun(id uuid.UUID, runID uuid.UUID, result string) error {
	now := time.Now()
	return r.db.Model(&models.Schedule{}).
		Where("id = ?", id).
		Updates(map[string]interface{}{
			"last_run_at":     now,
			"last_run_id":     runID,
			"last_run_result": result,
		}).Error
}

// SetStatus updates the status of a schedule
func (r *ScheduleRepository) SetStatus(id uuid.UUID, status models.ScheduleStatus) error {
	return r.db.Model(&models.Schedule{}).
		Where("id = ?", id).
		Update("status", status).Error
}

// Schedule Run operations

// CreateRun creates a new schedule run record
func (r *ScheduleRepository) CreateRun(run *models.ScheduleRun) error {
	return r.db.Create(run).Error
}

// GetRun retrieves a schedule run by ID
func (r *ScheduleRepository) GetRun(id uuid.UUID) (*models.ScheduleRun, error) {
	var run models.ScheduleRun
	err := r.db.Preload("Schedule").First(&run, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &run, nil
}

// UpdateRun updates a schedule run
func (r *ScheduleRepository) UpdateRun(run *models.ScheduleRun) error {
	return r.db.Save(run).Error
}

// ListRuns lists runs for a schedule
func (r *ScheduleRepository) ListRuns(scheduleID uuid.UUID, limit int) ([]*models.ScheduleRun, error) {
	var runs []*models.ScheduleRun
	query := r.db.Where("schedule_id = ?", scheduleID).Order("scheduled_at DESC")
	if limit > 0 {
		query = query.Limit(limit)
	}
	err := query.Find(&runs).Error
	return runs, err
}

// GetRunningRun returns the currently running execution for a schedule (if any)
func (r *ScheduleRepository) GetRunningRun(scheduleID uuid.UUID) (*models.ScheduleRun, error) {
	var run models.ScheduleRun
	err := r.db.Where("schedule_id = ? AND status = ?", scheduleID, "running").
		First(&run).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &run, nil
}

// MarkRunStarted marks a run as started
func (r *ScheduleRepository) MarkRunStarted(runID uuid.UUID, executionID uuid.UUID) error {
	now := time.Now()
	return r.db.Model(&models.ScheduleRun{}).
		Where("id = ?", runID).
		Updates(map[string]interface{}{
			"status":       "running",
			"started_at":   now,
			"execution_id": executionID,
		}).Error
}

// MarkRunCompleted marks a run as completed
func (r *ScheduleRepository) MarkRunCompleted(runID uuid.UUID, result string, errorMsg string) error {
	now := time.Now()
	updates := map[string]interface{}{
		"status":       "completed",
		"result":       result,
		"completed_at": now,
	}
	if errorMsg != "" {
		updates["error"] = errorMsg
	}
	return r.db.Model(&models.ScheduleRun{}).
		Where("id = ?", runID).
		Updates(updates).Error
}

// MarkRunSkipped marks a run as skipped (due to overlap prevention)
func (r *ScheduleRepository) MarkRunSkipped(runID uuid.UUID, reason string) error {
	now := time.Now()
	return r.db.Model(&models.ScheduleRun{}).
		Where("id = ?", runID).
		Updates(map[string]interface{}{
			"status":       "skipped",
			"completed_at": now,
			"error":        reason,
		}).Error
}

// GetScheduleStats returns statistics for a schedule
func (r *ScheduleRepository) GetScheduleStats(scheduleID uuid.UUID, days int) (*ScheduleStats, error) {
	since := time.Now().AddDate(0, 0, -days)

	stats := &ScheduleStats{}

	// Total runs
	r.db.Model(&models.ScheduleRun{}).
		Where("schedule_id = ? AND created_at >= ?", scheduleID, since).
		Count(&stats.TotalRuns)

	// Successful runs
	r.db.Model(&models.ScheduleRun{}).
		Where("schedule_id = ? AND result = ? AND created_at >= ?", scheduleID, "success", since).
		Count(&stats.SuccessfulRuns)

	// Failed runs
	r.db.Model(&models.ScheduleRun{}).
		Where("schedule_id = ? AND result = ? AND created_at >= ?", scheduleID, "failure", since).
		Count(&stats.FailedRuns)

	// Skipped runs
	r.db.Model(&models.ScheduleRun{}).
		Where("schedule_id = ? AND status = ? AND created_at >= ?", scheduleID, "skipped", since).
		Count(&stats.SkippedRuns)

	// Average duration
	r.db.Model(&models.ScheduleRun{}).
		Where("schedule_id = ? AND duration > 0 AND created_at >= ?", scheduleID, since).
		Select("COALESCE(AVG(duration), 0)").
		Scan(&stats.AvgDurationMs)

	return stats, nil
}

// ScheduleStats represents statistics for a schedule
type ScheduleStats struct {
	TotalRuns      int64   `json:"total_runs"`
	SuccessfulRuns int64   `json:"successful_runs"`
	FailedRuns     int64   `json:"failed_runs"`
	SkippedRuns    int64   `json:"skipped_runs"`
	AvgDurationMs  float64 `json:"avg_duration_ms"`
}
