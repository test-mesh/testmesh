package repository

import (
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// FlowRepository handles flow database operations
type FlowRepository struct {
	db *gorm.DB
}

// NewFlowRepository creates a new flow repository
func NewFlowRepository(db *gorm.DB) *FlowRepository {
	return &FlowRepository{db: db}
}

// Create creates a new flow in the specified workspace
func (r *FlowRepository) Create(flow *models.Flow, workspaceID uuid.UUID) error {
	flow.WorkspaceID = workspaceID
	return r.db.Create(flow).Error
}

// GetByID retrieves a flow by ID, verifying workspace ownership
func (r *FlowRepository) GetByID(id uuid.UUID, workspaceID uuid.UUID) (*models.Flow, error) {
	var flow models.Flow
	if err := r.db.First(&flow, "id = ? AND workspace_id = ?", id, workspaceID).Error; err != nil {
		return nil, err
	}
	return &flow, nil
}

// List retrieves flows with optional filters, scoped to workspace
func (r *FlowRepository) List(workspaceID uuid.UUID, suite string, tags []string, limit, offset int) ([]models.Flow, int64, error) {
	var flows []models.Flow
	var total int64

	query := r.db.Model(&models.Flow{}).Where("workspace_id = ?", workspaceID)

	// Apply filters
	if suite != "" {
		query = query.Where("suite = ?", suite)
	}
	if len(tags) > 0 {
		query = query.Where("tags && ?", tags)
	}

	// Get total count
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Get paginated results
	if err := query.Limit(limit).Offset(offset).Order("created_at DESC").Find(&flows).Error; err != nil {
		return nil, 0, err
	}

	return flows, total, nil
}

// Update updates a flow, verifying workspace ownership
func (r *FlowRepository) Update(flow *models.Flow, workspaceID uuid.UUID) error {
	// Verify the flow belongs to the workspace before updating
	var existing models.Flow
	if err := r.db.First(&existing, "id = ? AND workspace_id = ?", flow.ID, workspaceID).Error; err != nil {
		return err
	}
	// Ensure workspace_id cannot be changed
	flow.WorkspaceID = workspaceID
	return r.db.Save(flow).Error
}

// Delete deletes a flow (soft delete), verifying workspace ownership
func (r *FlowRepository) Delete(id uuid.UUID, workspaceID uuid.UUID) error {
	result := r.db.Where("id = ? AND workspace_id = ?", id, workspaceID).Delete(&models.Flow{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// Search searches flows by name within a workspace
func (r *FlowRepository) Search(workspaceID uuid.UUID, query string, limit int) ([]models.Flow, error) {
	var flows []models.Flow
	if err := r.db.Where("workspace_id = ? AND name ILIKE ?", workspaceID, "%"+query+"%").Limit(limit).Find(&flows).Error; err != nil {
		return nil, err
	}
	return flows, nil
}

// ListByCollection retrieves all flows in a collection within the workspace
func (r *FlowRepository) ListByCollection(workspaceID uuid.UUID, collectionID uuid.UUID) ([]models.Flow, error) {
	var flows []models.Flow
	if err := r.db.Where("workspace_id = ? AND collection_id = ?", workspaceID, collectionID).Order("sort_order ASC").Find(&flows).Error; err != nil {
		return nil, err
	}
	return flows, nil
}

// CountByWorkspace returns the total number of flows in a workspace
func (r *FlowRepository) CountByWorkspace(workspaceID uuid.UUID) (int64, error) {
	var count int64
	if err := r.db.Model(&models.Flow{}).Where("workspace_id = ?", workspaceID).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}
