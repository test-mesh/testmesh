package repository

import (
	"fmt"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// EnvironmentRepository handles environment database operations
type EnvironmentRepository struct {
	db *gorm.DB
}

// NewEnvironmentRepository creates a new environment repository
func NewEnvironmentRepository(db *gorm.DB) *EnvironmentRepository {
	return &EnvironmentRepository{db: db}
}

// Create creates a new environment in the specified workspace
func (r *EnvironmentRepository) Create(env *models.Environment, workspaceID uuid.UUID) error {
	env.WorkspaceID = workspaceID
	// If this is set as default, unset other defaults in the same workspace
	if env.IsDefault {
		if err := r.db.Model(&models.Environment{}).
			Where("workspace_id = ? AND is_default = ?", workspaceID, true).
			Update("is_default", false).Error; err != nil {
			return err
		}
	}
	return r.db.Create(env).Error
}

// GetByID retrieves an environment by ID, verifying workspace ownership
func (r *EnvironmentRepository) GetByID(id uuid.UUID, workspaceID uuid.UUID) (*models.Environment, error) {
	var env models.Environment
	if err := r.db.First(&env, "id = ? AND workspace_id = ?", id, workspaceID).Error; err != nil {
		return nil, err
	}
	return &env, nil
}

// GetByName retrieves an environment by name within a workspace (case-insensitive)
func (r *EnvironmentRepository) GetByName(name string, workspaceID uuid.UUID) (*models.Environment, error) {
	var env models.Environment
	if err := r.db.First(&env, "LOWER(name) = LOWER(?) AND workspace_id = ?", name, workspaceID).Error; err != nil {
		return nil, err
	}
	return &env, nil
}

// GetDefault retrieves the default environment for a workspace
func (r *EnvironmentRepository) GetDefault(workspaceID uuid.UUID) (*models.Environment, error) {
	var env models.Environment
	if err := r.db.First(&env, "is_default = ? AND workspace_id = ?", true, workspaceID).Error; err != nil {
		return nil, err
	}
	return &env, nil
}

// Update updates an environment, verifying workspace ownership
func (r *EnvironmentRepository) Update(env *models.Environment, workspaceID uuid.UUID) error {
	// Verify the environment belongs to the workspace before updating
	var existing models.Environment
	if err := r.db.First(&existing, "id = ? AND workspace_id = ?", env.ID, workspaceID).Error; err != nil {
		return err
	}

	// If setting as default, unset other defaults in the same workspace
	if env.IsDefault {
		if err := r.db.Model(&models.Environment{}).
			Where("workspace_id = ? AND is_default = ? AND id != ?", workspaceID, true, env.ID).
			Update("is_default", false).Error; err != nil {
			return err
		}
	}
	// Ensure workspace_id cannot be changed
	env.WorkspaceID = workspaceID
	return r.db.Save(env).Error
}

// Delete soft-deletes an environment, verifying workspace ownership
func (r *EnvironmentRepository) Delete(id uuid.UUID, workspaceID uuid.UUID) error {
	// Check if this is the default environment
	env, err := r.GetByID(id, workspaceID)
	if err != nil {
		return err
	}
	if env.IsDefault {
		return fmt.Errorf("cannot delete the default environment")
	}

	result := r.db.Where("id = ? AND workspace_id = ?", id, workspaceID).Delete(&models.Environment{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// List retrieves all environments in a workspace with optional filtering
func (r *EnvironmentRepository) List(workspaceID uuid.UUID, params *ListEnvironmentsParams) ([]*models.Environment, int64, error) {
	var environments []*models.Environment
	var total int64

	query := r.db.Model(&models.Environment{}).Where("workspace_id = ?", workspaceID)

	if params.Search != "" {
		search := "%" + params.Search + "%"
		query = query.Where("name ILIKE ? OR description ILIKE ?", search, search)
	}

	// Count total
	query.Count(&total)

	// Apply sorting
	if params.SortBy != "" {
		order := "ASC"
		if params.SortDesc {
			order = "DESC"
		}
		query = query.Order(fmt.Sprintf("%s %s", params.SortBy, order))
	} else {
		// Default: show default env first, then by name
		query = query.Order("is_default DESC, name ASC")
	}

	// Apply pagination
	if params.Limit > 0 {
		query = query.Limit(params.Limit)
	}
	if params.Offset > 0 {
		query = query.Offset(params.Offset)
	}

	if err := query.Find(&environments).Error; err != nil {
		return nil, 0, err
	}

	return environments, total, nil
}

// ListEnvironmentsParams contains parameters for listing environments
type ListEnvironmentsParams struct {
	Search   string
	SortBy   string
	SortDesc bool
	Limit    int
	Offset   int
}

// SetDefault sets an environment as the default within a workspace
func (r *EnvironmentRepository) SetDefault(id uuid.UUID, workspaceID uuid.UUID) error {
	// Verify the environment belongs to the workspace
	if _, err := r.GetByID(id, workspaceID); err != nil {
		return err
	}

	// Unset current default in the workspace
	if err := r.db.Model(&models.Environment{}).
		Where("workspace_id = ? AND is_default = ?", workspaceID, true).
		Update("is_default", false).Error; err != nil {
		return err
	}
	// Set new default
	return r.db.Model(&models.Environment{}).
		Where("id = ? AND workspace_id = ?", id, workspaceID).
		Update("is_default", true).Error
}

// Duplicate creates a copy of an environment with a new name within the same workspace
func (r *EnvironmentRepository) Duplicate(id uuid.UUID, newName string, workspaceID uuid.UUID) (*models.Environment, error) {
	original, err := r.GetByID(id, workspaceID)
	if err != nil {
		return nil, err
	}

	// Copy variables
	varsCopy := make(models.EnvironmentVariables, len(original.Variables))
	copy(varsCopy, original.Variables)

	newEnv := &models.Environment{
		WorkspaceID: workspaceID,
		Name:        newName,
		Description: original.Description + " (copy)",
		Color:       original.Color,
		IsDefault:   false,
		Variables:   varsCopy,
	}

	if err := r.db.Create(newEnv).Error; err != nil {
		return nil, err
	}

	return newEnv, nil
}

// EnsureDefaultExists creates a default environment for a workspace if none exists
func (r *EnvironmentRepository) EnsureDefaultExists(workspaceID uuid.UUID) error {
	var count int64
	r.db.Model(&models.Environment{}).Where("workspace_id = ?", workspaceID).Count(&count)

	if count == 0 {
		defaultEnv := &models.Environment{
			WorkspaceID: workspaceID,
			Name:        "Default",
			Description: "Default environment",
			Color:       "#3B82F6",
			IsDefault:   true,
			Variables:   models.EnvironmentVariables{},
		}
		return r.db.Create(defaultEnv).Error
	}
	return nil
}

// CountByWorkspace returns the total number of environments in a workspace
func (r *EnvironmentRepository) CountByWorkspace(workspaceID uuid.UUID) (int64, error) {
	var count int64
	if err := r.db.Model(&models.Environment{}).Where("workspace_id = ?", workspaceID).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}
