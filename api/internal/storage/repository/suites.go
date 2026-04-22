package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"gorm.io/gorm"
)

// SuiteRepository handles suite database operations
type SuiteRepository struct {
	db *gorm.DB
}

// NewSuiteRepository creates a new suite repository
func NewSuiteRepository(db *gorm.DB) *SuiteRepository {
	return &SuiteRepository{db: db}
}

// Create creates a new suite
func (r *SuiteRepository) Create(ctx context.Context, suite *models.Suite) error {
	return r.db.WithContext(ctx).Create(suite).Error
}

// Get retrieves a suite by ID, preloading SuiteFlows and their Flow
func (r *SuiteRepository) Get(ctx context.Context, id uuid.UUID) (*models.Suite, error) {
	var suite models.Suite
	err := r.db.WithContext(ctx).
		Preload("SuiteFlows.Flow").
		Where("deleted_at IS NULL").
		First(&suite, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &suite, nil
}

// SuiteListParams holds filtering and pagination parameters for listing suites
type SuiteListParams struct {
	WorkspaceID uuid.UUID
	Search      string
	Tags        []string
	Limit       int
	Offset      int
}

// List returns suites matching the given parameters along with the total count
func (r *SuiteRepository) List(ctx context.Context, p SuiteListParams) ([]models.Suite, int64, error) {
	query := r.db.WithContext(ctx).Model(&models.Suite{}).
		Where("workspace_id = ? AND deleted_at IS NULL", p.WorkspaceID)

	if p.Search != "" {
		query = query.Where("name ILIKE ? OR description ILIKE ?",
			"%"+p.Search+"%", "%"+p.Search+"%")
	}

	if len(p.Tags) > 0 {
		query = query.Where("tags @> ?", models.StringArray(p.Tags))
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if p.Limit > 0 {
		query = query.Limit(p.Limit)
	}
	if p.Offset > 0 {
		query = query.Offset(p.Offset)
	}

	var suites []models.Suite
	err := query.Preload("SuiteFlows.Flow").Order("created_at DESC").Find(&suites).Error
	if err != nil {
		return nil, 0, err
	}

	return suites, total, nil
}

// Update saves a suite
func (r *SuiteRepository) Update(ctx context.Context, suite *models.Suite) error {
	return r.db.WithContext(ctx).Save(suite).Error
}

// Delete soft-deletes a suite by ID
func (r *SuiteRepository) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&models.Suite{}, "id = ?", id).Error
}

// ReplaceSuiteFlows atomically replaces all SuiteFlow rows for a suite
func (r *SuiteRepository) ReplaceSuiteFlows(ctx context.Context, suiteID uuid.UUID, flows []models.SuiteFlow) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("suite_id = ?", suiteID).Delete(&models.SuiteFlow{}).Error; err != nil {
			return err
		}
		if len(flows) == 0 {
			return nil
		}
		return tx.Create(&flows).Error
	})
}

// CreateRun creates a new suite run record
func (r *SuiteRepository) CreateRun(ctx context.Context, run *models.SuiteRun) error {
	return r.db.WithContext(ctx).Create(run).Error
}

// GetRun retrieves a suite run by ID, preloading SuiteRunExecutions and their Execution
func (r *SuiteRepository) GetRun(ctx context.Context, id uuid.UUID) (*models.SuiteRun, error) {
	var run models.SuiteRun
	err := r.db.WithContext(ctx).
		Preload("SuiteRunExecutions.Execution").
		First(&run, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &run, nil
}

// UpdateRun saves a suite run
func (r *SuiteRepository) UpdateRun(ctx context.Context, run *models.SuiteRun) error {
	return r.db.WithContext(ctx).Save(run).Error
}

// ListRuns returns runs for a suite ordered by created_at DESC with pagination
func (r *SuiteRepository) ListRuns(ctx context.Context, suiteID uuid.UUID, limit, offset int) ([]models.SuiteRun, int64, error) {
	query := r.db.WithContext(ctx).Model(&models.SuiteRun{}).Where("suite_id = ?", suiteID)

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if limit > 0 {
		query = query.Limit(limit)
	}
	if offset > 0 {
		query = query.Offset(offset)
	}

	var runs []models.SuiteRun
	err := query.Order("created_at DESC").Find(&runs).Error
	if err != nil {
		return nil, 0, err
	}

	return runs, total, nil
}

// CreateRunExecution creates a new suite run execution link record
func (r *SuiteRepository) CreateRunExecution(ctx context.Context, sre *models.SuiteRunExecution) error {
	return r.db.WithContext(ctx).Create(sre).Error
}
