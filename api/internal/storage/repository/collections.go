package repository

import (
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// CollectionRepository handles collection database operations
type CollectionRepository struct {
	db *gorm.DB
}

// NewCollectionRepository creates a new collection repository
func NewCollectionRepository(db *gorm.DB) *CollectionRepository {
	return &CollectionRepository{db: db}
}

// Create creates a new collection in the specified workspace
func (r *CollectionRepository) Create(collection *models.Collection, workspaceID uuid.UUID) error {
	collection.WorkspaceID = workspaceID
	return r.db.Create(collection).Error
}

// GetByID retrieves a collection by ID, verifying workspace ownership
func (r *CollectionRepository) GetByID(id uuid.UUID, workspaceID uuid.UUID) (*models.Collection, error) {
	var collection models.Collection
	if err := r.db.First(&collection, "id = ? AND workspace_id = ?", id, workspaceID).Error; err != nil {
		return nil, err
	}
	return &collection, nil
}

// GetByIDWithFlows retrieves a collection with its flows, scoped to workspace
func (r *CollectionRepository) GetByIDWithFlows(id uuid.UUID, workspaceID uuid.UUID) (*models.Collection, error) {
	var collection models.Collection
	if err := r.db.Preload("Flows", func(db *gorm.DB) *gorm.DB {
		return db.Where("workspace_id = ?", workspaceID).Order("sort_order ASC")
	}).First(&collection, "id = ? AND workspace_id = ?", id, workspaceID).Error; err != nil {
		return nil, err
	}
	return &collection, nil
}

// GetByIDWithChildren retrieves a collection with its children, scoped to workspace
func (r *CollectionRepository) GetByIDWithChildren(id uuid.UUID, workspaceID uuid.UUID) (*models.Collection, error) {
	var collection models.Collection
	if err := r.db.Preload("Children", func(db *gorm.DB) *gorm.DB {
		return db.Where("workspace_id = ?", workspaceID).Order("sort_order ASC")
	}).First(&collection, "id = ? AND workspace_id = ?", id, workspaceID).Error; err != nil {
		return nil, err
	}
	return &collection, nil
}

// List retrieves all root collections (no parent) in a workspace
func (r *CollectionRepository) List(workspaceID uuid.UUID, limit, offset int) ([]models.Collection, int64, error) {
	var collections []models.Collection
	var total int64

	query := r.db.Model(&models.Collection{}).Where("workspace_id = ? AND parent_id IS NULL", workspaceID)

	// Get total count
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Get paginated results
	if err := query.Limit(limit).Offset(offset).Order("sort_order ASC, created_at DESC").Find(&collections).Error; err != nil {
		return nil, 0, err
	}

	return collections, total, nil
}

// ListAll retrieves all collections (including nested) in a workspace
func (r *CollectionRepository) ListAll(workspaceID uuid.UUID) ([]models.Collection, error) {
	var collections []models.Collection
	if err := r.db.Where("workspace_id = ?", workspaceID).Order("sort_order ASC, created_at DESC").Find(&collections).Error; err != nil {
		return nil, err
	}
	return collections, nil
}

// ListChildren retrieves children of a collection within the workspace
func (r *CollectionRepository) ListChildren(parentID uuid.UUID, workspaceID uuid.UUID) ([]models.Collection, error) {
	var collections []models.Collection
	if err := r.db.Where("parent_id = ? AND workspace_id = ?", parentID, workspaceID).Order("sort_order ASC").Find(&collections).Error; err != nil {
		return nil, err
	}
	return collections, nil
}

// Update updates a collection, verifying workspace ownership
func (r *CollectionRepository) Update(collection *models.Collection, workspaceID uuid.UUID) error {
	// Verify the collection belongs to the workspace before updating
	var existing models.Collection
	if err := r.db.First(&existing, "id = ? AND workspace_id = ?", collection.ID, workspaceID).Error; err != nil {
		return err
	}
	// Ensure workspace_id cannot be changed
	collection.WorkspaceID = workspaceID
	return r.db.Save(collection).Error
}

// Delete deletes a collection (soft delete), verifying workspace ownership
func (r *CollectionRepository) Delete(id uuid.UUID, workspaceID uuid.UUID) error {
	result := r.db.Where("id = ? AND workspace_id = ?", id, workspaceID).Delete(&models.Collection{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// Move moves a collection to a new parent within the same workspace
func (r *CollectionRepository) Move(id uuid.UUID, newParentID *uuid.UUID, workspaceID uuid.UUID) error {
	// Verify both collection and new parent belong to the same workspace
	if newParentID != nil {
		var parent models.Collection
		if err := r.db.First(&parent, "id = ? AND workspace_id = ?", *newParentID, workspaceID).Error; err != nil {
			return err
		}
	}
	return r.db.Model(&models.Collection{}).Where("id = ? AND workspace_id = ?", id, workspaceID).Update("parent_id", newParentID).Error
}

// Reorder updates the sort order of a collection within the workspace
func (r *CollectionRepository) Reorder(id uuid.UUID, sortOrder int, workspaceID uuid.UUID) error {
	return r.db.Model(&models.Collection{}).Where("id = ? AND workspace_id = ?", id, workspaceID).Update("sort_order", sortOrder).Error
}

// AddFlow adds a flow to a collection (both must be in the same workspace)
func (r *CollectionRepository) AddFlow(collectionID, flowID uuid.UUID, workspaceID uuid.UUID) error {
	// Verify both collection and flow belong to the same workspace
	var collection models.Collection
	if err := r.db.First(&collection, "id = ? AND workspace_id = ?", collectionID, workspaceID).Error; err != nil {
		return err
	}
	return r.db.Model(&models.Flow{}).Where("id = ? AND workspace_id = ?", flowID, workspaceID).Update("collection_id", collectionID).Error
}

// RemoveFlow removes a flow from a collection within the workspace
func (r *CollectionRepository) RemoveFlow(flowID uuid.UUID, workspaceID uuid.UUID) error {
	return r.db.Model(&models.Flow{}).Where("id = ? AND workspace_id = ?", flowID, workspaceID).Update("collection_id", nil).Error
}

// GetFlows retrieves flows in a collection within the workspace
func (r *CollectionRepository) GetFlows(collectionID uuid.UUID, workspaceID uuid.UUID) ([]models.Flow, error) {
	var flows []models.Flow
	if err := r.db.Where("collection_id = ? AND workspace_id = ?", collectionID, workspaceID).Order("sort_order ASC").Find(&flows).Error; err != nil {
		return nil, err
	}
	return flows, nil
}

// ReorderFlow updates the sort order of a flow within a collection
func (r *CollectionRepository) ReorderFlow(flowID uuid.UUID, sortOrder int, workspaceID uuid.UUID) error {
	return r.db.Model(&models.Flow{}).Where("id = ? AND workspace_id = ?", flowID, workspaceID).Update("sort_order", sortOrder).Error
}

// GetTree builds the full collection tree for a workspace
func (r *CollectionRepository) GetTree(workspaceID uuid.UUID) ([]models.CollectionTreeNode, error) {
	// Get all collections in the workspace
	var collections []models.Collection
	if err := r.db.Where("workspace_id = ?", workspaceID).Order("sort_order ASC").Find(&collections).Error; err != nil {
		return nil, err
	}

	// Get all flows with collection assignments in the workspace
	var flows []models.Flow
	if err := r.db.Where("workspace_id = ? AND collection_id IS NOT NULL", workspaceID).Order("sort_order ASC").Find(&flows).Error; err != nil {
		return nil, err
	}

	// Build tree
	return buildTree(collections, flows), nil
}

// buildTree constructs the collection tree recursively
func buildTree(collections []models.Collection, flows []models.Flow) []models.CollectionTreeNode {
	// Create map of collections by ID
	collectionMap := make(map[uuid.UUID]models.Collection)
	for _, c := range collections {
		collectionMap[c.ID] = c
	}

	// Create map of flows by collection ID
	flowMap := make(map[uuid.UUID][]models.Flow)
	for _, f := range flows {
		if f.CollectionID != nil {
			flowMap[*f.CollectionID] = append(flowMap[*f.CollectionID], f)
		}
	}

	// Build tree starting from root collections
	var rootNodes []models.CollectionTreeNode
	for _, c := range collections {
		if c.ParentID == nil {
			node := buildCollectionNode(c, collections, flowMap)
			rootNodes = append(rootNodes, node)
		}
	}

	return rootNodes
}

// buildCollectionNode builds a tree node for a collection
func buildCollectionNode(collection models.Collection, allCollections []models.Collection, flowMap map[uuid.UUID][]models.Flow) models.CollectionTreeNode {
	node := models.CollectionTreeNode{
		ID:          collection.ID,
		Name:        collection.Name,
		Description: collection.Description,
		Icon:        collection.Icon,
		Color:       collection.Color,
		Type:        "collection",
		SortOrder:   collection.SortOrder,
	}

	// Add child collections
	for _, c := range allCollections {
		if c.ParentID != nil && *c.ParentID == collection.ID {
			childNode := buildCollectionNode(c, allCollections, flowMap)
			node.Children = append(node.Children, childNode)
		}
	}

	// Add flows
	if flows, ok := flowMap[collection.ID]; ok {
		for _, f := range flows {
			flowID := f.ID
			flowNode := models.CollectionTreeNode{
				ID:        f.ID,
				Name:      f.Name,
				Type:      "flow",
				SortOrder: f.SortOrder,
				FlowID:    &flowID,
			}
			node.Children = append(node.Children, flowNode)
		}
	}

	return node
}

// Search searches collections by name within a workspace
func (r *CollectionRepository) Search(query string, workspaceID uuid.UUID, limit int) ([]models.Collection, error) {
	var collections []models.Collection
	if err := r.db.Where("workspace_id = ? AND name ILIKE ?", workspaceID, "%"+query+"%").Limit(limit).Find(&collections).Error; err != nil {
		return nil, err
	}
	return collections, nil
}

// GetAncestors retrieves all ancestors of a collection (for breadcrumb) within the workspace
func (r *CollectionRepository) GetAncestors(id uuid.UUID, workspaceID uuid.UUID) ([]models.Collection, error) {
	var ancestors []models.Collection

	current, err := r.GetByID(id, workspaceID)
	if err != nil {
		return nil, err
	}

	for current.ParentID != nil {
		parent, err := r.GetByID(*current.ParentID, workspaceID)
		if err != nil {
			break
		}
		ancestors = append([]models.Collection{*parent}, ancestors...)
		current = parent
	}

	return ancestors, nil
}

// Duplicate duplicates a collection with all its contents within the same workspace
func (r *CollectionRepository) Duplicate(id uuid.UUID, newName string, workspaceID uuid.UUID) (*models.Collection, error) {
	original, err := r.GetByIDWithFlows(id, workspaceID)
	if err != nil {
		return nil, err
	}

	duplicate := &models.Collection{
		WorkspaceID: workspaceID,
		Name:        newName,
		Description: original.Description,
		Icon:        original.Icon,
		Color:       original.Color,
		ParentID:    original.ParentID,
		Variables:   original.Variables,
		Auth:        original.Auth,
	}

	if err := r.db.Create(duplicate).Error; err != nil {
		return nil, err
	}

	// Note: Flows are not duplicated, just the collection structure
	// Flows would need to be duplicated separately if needed

	return duplicate, nil
}

// CountByWorkspace returns the total number of collections in a workspace
func (r *CollectionRepository) CountByWorkspace(workspaceID uuid.UUID) (int64, error) {
	var count int64
	if err := r.db.Model(&models.Collection{}).Where("workspace_id = ?", workspaceID).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}
