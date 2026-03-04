package scheduler

import (
	"context"
	"sync"
	"time"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"github.com/robfig/cron/v3"
	"go.uber.org/zap"
)

// ExecutionFunc is a function that executes a flow and returns the execution ID and result
type ExecutionFunc func(ctx context.Context, flowID uuid.UUID, env map[string]interface{}) (uuid.UUID, string, error)

// Scheduler manages scheduled test executions
type Scheduler struct {
	mu           sync.RWMutex
	scheduleRepo *repository.ScheduleRepository
	logger       *zap.Logger
	cron         *cron.Cron
	jobs         map[uuid.UUID]cron.EntryID
	executeFunc  ExecutionFunc
	running      bool
	ctx          context.Context
	cancel       context.CancelFunc
}

// NewScheduler creates a new scheduler
func NewScheduler(scheduleRepo *repository.ScheduleRepository, logger *zap.Logger) *Scheduler {
	// Create cron with second-level precision and location support
	c := cron.New(cron.WithParser(cron.NewParser(
		cron.SecondOptional | cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor,
	)))

	ctx, cancel := context.WithCancel(context.Background())

	return &Scheduler{
		scheduleRepo: scheduleRepo,
		logger:       logger,
		cron:         c,
		jobs:         make(map[uuid.UUID]cron.EntryID),
		ctx:          ctx,
		cancel:       cancel,
	}
}

// SetExecutionFunc sets the function used to execute flows
func (s *Scheduler) SetExecutionFunc(fn ExecutionFunc) {
	s.executeFunc = fn
}

// Start starts the scheduler
func (s *Scheduler) Start() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.running {
		return nil
	}

	// Load all active schedules
	schedules, err := s.scheduleRepo.ListActive()
	if err != nil {
		return err
	}

	// Register each schedule
	for _, schedule := range schedules {
		if err := s.registerSchedule(schedule); err != nil {
			s.logger.Error("Failed to register schedule",
				zap.String("schedule_id", schedule.ID.String()),
				zap.Error(err))
		}
	}

	// Start cron
	s.cron.Start()
	s.running = true

	s.logger.Info("Scheduler started", zap.Int("schedules", len(schedules)))
	return nil
}

// Stop stops the scheduler
func (s *Scheduler) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running {
		return
	}

	s.cancel()
	s.cron.Stop()
	s.running = false
	s.logger.Info("Scheduler stopped")
}

// AddSchedule adds a new schedule to the scheduler
func (s *Scheduler) AddSchedule(schedule *models.Schedule) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Calculate next run time
	nextRun, err := s.calculateNextRun(schedule.CronExpr, schedule.Timezone)
	if err != nil {
		return err
	}
	schedule.NextRunAt = &nextRun

	// Save to database
	if err := s.scheduleRepo.Create(schedule); err != nil {
		return err
	}

	// Register with cron if active
	if schedule.Status == models.ScheduleStatusActive && s.running {
		if err := s.registerSchedule(schedule); err != nil {
			return err
		}
	}

	s.logger.Info("Schedule added",
		zap.String("schedule_id", schedule.ID.String()),
		zap.String("name", schedule.Name),
		zap.Time("next_run", nextRun))

	return nil
}

// UpdateSchedule updates an existing schedule
func (s *Scheduler) UpdateSchedule(schedule *models.Schedule) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Recalculate next run time if cron expression changed
	nextRun, err := s.calculateNextRun(schedule.CronExpr, schedule.Timezone)
	if err != nil {
		return err
	}
	schedule.NextRunAt = &nextRun

	// Update in database
	if err := s.scheduleRepo.Update(schedule); err != nil {
		return err
	}

	// Re-register with cron
	s.unregisterSchedule(schedule.ID)
	if schedule.Status == models.ScheduleStatusActive && s.running {
		if err := s.registerSchedule(schedule); err != nil {
			return err
		}
	}

	return nil
}

// RemoveSchedule removes a schedule from the scheduler
func (s *Scheduler) RemoveSchedule(id uuid.UUID) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.unregisterSchedule(id)
	return s.scheduleRepo.Delete(id)
}

// PauseSchedule pauses a schedule
func (s *Scheduler) PauseSchedule(id uuid.UUID) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.unregisterSchedule(id)
	return s.scheduleRepo.SetStatus(id, models.ScheduleStatusPaused)
}

// ResumeSchedule resumes a paused schedule
func (s *Scheduler) ResumeSchedule(id uuid.UUID) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	schedule, err := s.scheduleRepo.Get(id)
	if err != nil {
		return err
	}

	if err := s.scheduleRepo.SetStatus(id, models.ScheduleStatusActive); err != nil {
		return err
	}

	schedule.Status = models.ScheduleStatusActive
	if s.running {
		return s.registerSchedule(schedule)
	}

	return nil
}

// TriggerSchedule manually triggers a schedule execution
func (s *Scheduler) TriggerSchedule(id uuid.UUID) (*models.ScheduleRun, error) {
	schedule, err := s.scheduleRepo.Get(id)
	if err != nil {
		return nil, err
	}

	return s.executeSchedule(schedule)
}

// registerSchedule registers a schedule with cron
func (s *Scheduler) registerSchedule(schedule *models.Schedule) error {
	// Parse timezone
	loc, err := time.LoadLocation(schedule.Timezone)
	if err != nil {
		loc = time.UTC
	}

	// Create job function
	jobFunc := func() {
		if _, err := s.executeSchedule(schedule); err != nil {
			s.logger.Error("Schedule execution failed",
				zap.String("schedule_id", schedule.ID.String()),
				zap.Error(err))
		}
	}

	// Add to cron with timezone
	entryID, err := s.cron.AddFunc(schedule.CronExpr, cron.FuncJob(jobFunc).Run)
	if err != nil {
		return err
	}

	s.jobs[schedule.ID] = entryID

	s.logger.Debug("Registered schedule",
		zap.String("schedule_id", schedule.ID.String()),
		zap.String("cron", schedule.CronExpr),
		zap.String("timezone", loc.String()))

	return nil
}

// unregisterSchedule removes a schedule from cron
func (s *Scheduler) unregisterSchedule(id uuid.UUID) {
	if entryID, ok := s.jobs[id]; ok {
		s.cron.Remove(entryID)
		delete(s.jobs, id)
	}
}

// executeSchedule executes a scheduled flow
func (s *Scheduler) executeSchedule(schedule *models.Schedule) (*models.ScheduleRun, error) {
	// Check for overlapping execution
	if !schedule.AllowOverlap {
		runningRun, err := s.scheduleRepo.GetRunningRun(schedule.ID)
		if err != nil {
			return nil, err
		}
		if runningRun != nil {
			// Skip this execution
			run := &models.ScheduleRun{
				ScheduleID:  schedule.ID,
				Status:      "skipped",
				ScheduledAt: time.Now(),
			}
			if err := s.scheduleRepo.CreateRun(run); err != nil {
				return nil, err
			}
			s.scheduleRepo.MarkRunSkipped(run.ID, "Previous execution still running")
			s.logger.Info("Schedule execution skipped due to overlap",
				zap.String("schedule_id", schedule.ID.String()))
			return run, nil
		}
	}

	// Create run record
	run := &models.ScheduleRun{
		ScheduleID:  schedule.ID,
		Status:      "pending",
		ScheduledAt: time.Now(),
	}
	if err := s.scheduleRepo.CreateRun(run); err != nil {
		return nil, err
	}

	// Execute the flow
	if s.executeFunc == nil {
		s.scheduleRepo.MarkRunCompleted(run.ID, "failure", "No execution function configured")
		return run, nil
	}

	// Execute asynchronously
	go func() {
		startTime := time.Now()

		execID, result, err := s.executeFunc(s.ctx, schedule.FlowID, schedule.Environment)

		duration := time.Since(startTime).Milliseconds()

		if err != nil {
			s.scheduleRepo.MarkRunCompleted(run.ID, "failure", err.Error())
			s.scheduleRepo.UpdateLastRun(schedule.ID, run.ID, "failure")
			s.logger.Error("Schedule execution failed",
				zap.String("schedule_id", schedule.ID.String()),
				zap.Error(err))
		} else {
			s.scheduleRepo.MarkRunStarted(run.ID, execID)
			s.scheduleRepo.MarkRunCompleted(run.ID, result, "")
			s.scheduleRepo.UpdateLastRun(schedule.ID, run.ID, result)
			s.logger.Info("Schedule execution completed",
				zap.String("schedule_id", schedule.ID.String()),
				zap.String("result", result),
				zap.Int64("duration_ms", duration))
		}

		// Update next run time
		nextRun, _ := s.calculateNextRun(schedule.CronExpr, schedule.Timezone)
		s.scheduleRepo.UpdateNextRunTime(schedule.ID, nextRun)
	}()

	return run, nil
}

// calculateNextRun calculates the next run time for a cron expression
func (s *Scheduler) calculateNextRun(cronExpr string, timezone string) (time.Time, error) {
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		loc = time.UTC
	}

	parser := cron.NewParser(cron.SecondOptional | cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor)
	sched, err := parser.Parse(cronExpr)
	if err != nil {
		return time.Time{}, err
	}

	return sched.Next(time.Now().In(loc)), nil
}

// ValidateCronExpression validates a cron expression
func ValidateCronExpression(expr string) error {
	parser := cron.NewParser(cron.SecondOptional | cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor)
	_, err := parser.Parse(expr)
	return err
}

// GetNextRunTimes returns the next N run times for a cron expression
func GetNextRunTimes(expr string, timezone string, count int) ([]time.Time, error) {
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		loc = time.UTC
	}

	parser := cron.NewParser(cron.SecondOptional | cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor)
	sched, err := parser.Parse(expr)
	if err != nil {
		return nil, err
	}

	times := make([]time.Time, count)
	t := time.Now().In(loc)
	for i := 0; i < count; i++ {
		t = sched.Next(t)
		times[i] = t
	}

	return times, nil
}

// CommonCronPresets provides common cron expression presets
var CommonCronPresets = map[string]string{
	"every_minute":     "* * * * *",
	"every_5_minutes":  "*/5 * * * *",
	"every_15_minutes": "*/15 * * * *",
	"every_30_minutes": "*/30 * * * *",
	"every_hour":       "0 * * * *",
	"every_6_hours":    "0 */6 * * *",
	"every_12_hours":   "0 */12 * * *",
	"daily_midnight":   "0 0 * * *",
	"daily_noon":       "0 12 * * *",
	"weekdays_9am":     "0 9 * * 1-5",
	"weekly_monday":    "0 0 * * 1",
	"monthly_first":    "0 0 1 * *",
}
