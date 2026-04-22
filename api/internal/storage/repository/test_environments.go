package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"gorm.io/gorm"
)

// TestEnvironmentRepository handles test_environments database operations.
type TestEnvironmentRepository struct {
	db *gorm.DB
}

// NewTestEnvironmentRepository creates a new TestEnvironmentRepository.
func NewTestEnvironmentRepository(db *gorm.DB) *TestEnvironmentRepository {
	return &TestEnvironmentRepository{db: db}
}

// Create inserts a new TestEnvironment record.
func (r *TestEnvironmentRepository) Create(ctx context.Context, env *models.TestEnvironment) error {
	return r.db.WithContext(ctx).Create(env).Error
}

// Get retrieves a TestEnvironment by primary key.
// Returns gorm.ErrRecordNotFound if not found.
func (r *TestEnvironmentRepository) Get(ctx context.Context, id uuid.UUID) (*models.TestEnvironment, error) {
	var env models.TestEnvironment
	err := r.db.WithContext(ctx).First(&env, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &env, nil
}

// FindWarm finds a warm, running, or cooling environment for the given
// workspace + context key. Returns gorm.ErrRecordNotFound if none exists.
// Results are ordered by last_used_at DESC so the most recently used
// environment is preferred.
func (r *TestEnvironmentRepository) FindWarm(ctx context.Context, workspaceID uuid.UUID, envContext string) (*models.TestEnvironment, error) {
	var env models.TestEnvironment
	err := r.db.WithContext(ctx).
		Where("state IN ? AND workspace_id = ? AND context = ?",
			[]string{
				string(models.TestEnvWarm),
				string(models.TestEnvRunning),
				string(models.TestEnvCooling),
			},
			workspaceID,
			envContext,
		).
		Order("last_used_at DESC").
		First(&env).Error
	if err != nil {
		return nil, err
	}
	return &env, nil
}

// ListExpired returns environments whose TTL has elapsed and need teardown.
// Only warm or cooling environments are considered; cold/provisioning/running
// environments are managed by other lifecycle transitions.
func (r *TestEnvironmentRepository) ListExpired(ctx context.Context) ([]models.TestEnvironment, error) {
	var envs []models.TestEnvironment
	err := r.db.WithContext(ctx).
		Where(
			"state IN ? AND last_used_at + (ttl_minutes * interval '1 minute') < NOW()",
			[]string{
				string(models.TestEnvWarm),
				string(models.TestEnvCooling),
			},
		).
		Find(&envs).Error
	if err != nil {
		return nil, err
	}
	return envs, nil
}

// UpdateState transitions an environment to the given state.
// last_used_at is also set to NOW() when the new state is warm or running,
// since those states imply active use.
func (r *TestEnvironmentRepository) UpdateState(ctx context.Context, id uuid.UUID, state models.TestEnvState) error {
	updates := map[string]interface{}{
		"state":      state,
		"updated_at": time.Now(),
	}
	if state == models.TestEnvWarm || state == models.TestEnvRunning {
		now := time.Now()
		updates["last_used_at"] = now
	}
	return r.db.WithContext(ctx).
		Model(&models.TestEnvironment{}).
		Where("id = ?", id).
		Updates(updates).Error
}

// TouchLastUsed updates last_used_at to NOW() without changing state.
func (r *TestEnvironmentRepository) TouchLastUsed(ctx context.Context, id uuid.UUID) error {
	now := time.Now()
	return r.db.WithContext(ctx).
		Model(&models.TestEnvironment{}).
		Where("id = ?", id).
		Updates(map[string]interface{}{
			"last_used_at": now,
			"updated_at":   now,
		}).Error
}

// Update saves all fields of the given TestEnvironment (full save).
func (r *TestEnvironmentRepository) Update(ctx context.Context, env *models.TestEnvironment) error {
	return r.db.WithContext(ctx).Save(env).Error
}

// List returns all non-destroyed environments for a workspace, ordered by
// created_at DESC.
func (r *TestEnvironmentRepository) List(ctx context.Context, workspaceID uuid.UUID) ([]models.TestEnvironment, error) {
	var envs []models.TestEnvironment
	err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND state != ?", workspaceID, models.TestEnvDestroyed).
		Order("created_at DESC").
		Find(&envs).Error
	if err != nil {
		return nil, err
	}
	return envs, nil
}
