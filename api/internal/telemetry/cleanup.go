package telemetry

import (
	"context"
	"sync"
	"time"

	"go.uber.org/zap"
)

// CleanupJob periodically deletes old spans based on workspace retention settings.
type CleanupJob struct {
	repo   *TelemetryRepository
	logger *zap.Logger
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// NewCleanupJob creates a new CleanupJob.
func NewCleanupJob(repo *TelemetryRepository, logger *zap.Logger) *CleanupJob {
	return &CleanupJob{
		repo:   repo,
		logger: logger,
	}
}

// Start begins the hourly cleanup ticker.
func (j *CleanupJob) Start(ctx context.Context) {
	ctx, j.cancel = context.WithCancel(ctx)
	j.wg.Add(1)
	go j.run(ctx)
}

// Stop stops the cleanup job.
func (j *CleanupJob) Stop() {
	if j.cancel != nil {
		j.cancel()
	}
	j.wg.Wait()
}

func (j *CleanupJob) run(ctx context.Context) {
	defer j.wg.Done()
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			j.cleanup(ctx)
		}
	}
}

func (j *CleanupJob) cleanup(ctx context.Context) {
	workspaceIDs, err := j.repo.GetAllWorkspaceIDs(ctx)
	if err != nil {
		j.logger.Error("cleanup: failed to list workspace IDs", zap.Error(err))
		return
	}

	for _, wsID := range workspaceIDs {
		settings, err := j.repo.GetTraceSettings(ctx, wsID)
		if err != nil {
			j.logger.Warn("cleanup: failed to get settings",
				zap.String("workspace_id", wsID.String()),
				zap.Error(err))
			continue
		}

		if settings.RetentionDays <= 0 {
			continue
		}

		deleted, err := j.repo.DeleteOldSpans(ctx, wsID, settings.RetentionDays)
		if err != nil {
			j.logger.Error("cleanup: failed to delete old spans",
				zap.String("workspace_id", wsID.String()),
				zap.Error(err))
			continue
		}

		if deleted > 0 {
			j.logger.Info("cleanup: deleted old spans",
				zap.String("workspace_id", wsID.String()),
				zap.Int64("deleted", deleted),
				zap.Int("retention_days", settings.RetentionDays))
		}
	}
}
