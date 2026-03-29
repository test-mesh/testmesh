package repository

import (
	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"gorm.io/gorm"
)

// DatasetRepository handles CRUD for datasets.
type DatasetRepository struct {
	db *gorm.DB
}

func NewDatasetRepository(db *gorm.DB) *DatasetRepository {
	return &DatasetRepository{db: db}
}

func (r *DatasetRepository) Create(ds *models.Dataset) error {
	return r.db.Create(ds).Error
}

func (r *DatasetRepository) GetByID(id, workspaceID uuid.UUID) (*models.Dataset, error) {
	var ds models.Dataset
	if err := r.db.Where("id = ? AND workspace_id = ?", id, workspaceID).First(&ds).Error; err != nil {
		return nil, err
	}
	return &ds, nil
}

func (r *DatasetRepository) List(workspaceID uuid.UUID, limit, offset int) ([]models.Dataset, int64, error) {
	var datasets []models.Dataset
	var total int64

	q := r.db.Where("workspace_id = ?", workspaceID)
	if err := q.Model(&models.Dataset{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if limit <= 0 {
		limit = 50
	}
	if err := q.Order("created_at DESC").Limit(limit).Offset(offset).Find(&datasets).Error; err != nil {
		return nil, 0, err
	}
	return datasets, total, nil
}

func (r *DatasetRepository) Update(ds *models.Dataset) error {
	return r.db.Save(ds).Error
}

func (r *DatasetRepository) Delete(id, workspaceID uuid.UUID) error {
	result := r.db.Where("id = ? AND workspace_id = ?", id, workspaceID).Delete(&models.Dataset{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}
