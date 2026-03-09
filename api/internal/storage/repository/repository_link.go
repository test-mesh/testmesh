package repository

import (
	"github.com/test-mesh/testmesh/internal/storage/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// RepositoryLinkRepository handles RepositoryLink database operations
type RepositoryLinkRepository struct {
	db *gorm.DB
}

// NewRepositoryLinkRepository creates a new repository link repository
func NewRepositoryLinkRepository(db *gorm.DB) *RepositoryLinkRepository {
	return &RepositoryLinkRepository{db: db}
}

// Create creates a new repository link
func (r *RepositoryLinkRepository) Create(link *models.RepositoryLink) error {
	return r.db.Create(link).Error
}

// GetByID retrieves a repository link by ID
func (r *RepositoryLinkRepository) GetByID(id uuid.UUID) (*models.RepositoryLink, error) {
	var link models.RepositoryLink
	err := r.db.Preload("Integration").First(&link, "id = ? AND deleted_at IS NULL", id).Error
	if err != nil {
		return nil, err
	}
	return &link, nil
}

// ListByWorkspace retrieves all repository links for a workspace
func (r *RepositoryLinkRepository) ListByWorkspace(workspaceID uuid.UUID) ([]*models.RepositoryLink, error) {
	var links []*models.RepositoryLink
	err := r.db.Preload("Integration").
		Where("workspace_id = ? AND deleted_at IS NULL", workspaceID).
		Order("created_at DESC").
		Find(&links).Error
	return links, err
}

// FindByRepository retrieves all repository links matching a repository name
func (r *RepositoryLinkRepository) FindByRepository(repo string) ([]*models.RepositoryLink, error) {
	var links []*models.RepositoryLink
	err := r.db.Preload("Integration").
		Where("repository = ? AND deleted_at IS NULL", repo).
		Find(&links).Error
	return links, err
}

// Update updates a repository link
func (r *RepositoryLinkRepository) Update(link *models.RepositoryLink) error {
	return r.db.Save(link).Error
}

// Delete soft-deletes a repository link
func (r *RepositoryLinkRepository) Delete(id uuid.UUID) error {
	return r.db.Delete(&models.RepositoryLink{}, "id = ?", id).Error
}
