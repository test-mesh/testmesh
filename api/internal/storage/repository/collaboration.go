package repository

import (
	"time"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// CollaborationRepository handles collaboration database operations
type CollaborationRepository struct {
	db *gorm.DB
}

// NewCollaborationRepository creates a new collaboration repository
func NewCollaborationRepository(db *gorm.DB) *CollaborationRepository {
	return &CollaborationRepository{db: db}
}

// Presence Operations

// SetPresence creates or updates a user's presence
func (r *CollaborationRepository) SetPresence(presence *models.UserPresence) error {
	// Try to find existing presence for this user and resource
	var existing models.UserPresence
	err := r.db.Where("user_id = ? AND resource_type = ? AND resource_id = ?",
		presence.UserID, presence.ResourceType, presence.ResourceID).First(&existing).Error

	if err == gorm.ErrRecordNotFound {
		// Create new presence
		presence.ConnectedAt = time.Now()
		presence.LastActiveAt = time.Now()
		return r.db.Create(presence).Error
	} else if err != nil {
		return err
	}

	// Update existing presence
	return r.db.Model(&existing).Updates(map[string]interface{}{
		"status":         presence.Status,
		"cursor_data":    presence.CursorData,
		"last_active_at": time.Now(),
	}).Error
}

// RemovePresence removes a user's presence
func (r *CollaborationRepository) RemovePresence(userID uuid.UUID, resourceType string, resourceID uuid.UUID) error {
	return r.db.Where("user_id = ? AND resource_type = ? AND resource_id = ?",
		userID, resourceType, resourceID).Delete(&models.UserPresence{}).Error
}

// RemoveAllPresenceForUser removes all presence records for a user
func (r *CollaborationRepository) RemoveAllPresenceForUser(userID uuid.UUID) error {
	return r.db.Where("user_id = ?", userID).Delete(&models.UserPresence{}).Error
}

// GetPresenceForResource returns all users present on a resource
func (r *CollaborationRepository) GetPresenceForResource(resourceType string, resourceID uuid.UUID) ([]*models.UserPresence, error) {
	var presences []*models.UserPresence
	// Only return users active in the last 5 minutes
	cutoff := time.Now().Add(-5 * time.Minute)
	err := r.db.Where("resource_type = ? AND resource_id = ? AND last_active_at > ?",
		resourceType, resourceID, cutoff).Find(&presences).Error
	return presences, err
}

// CleanupStalePresence removes presence records older than a threshold
func (r *CollaborationRepository) CleanupStalePresence(olderThan time.Duration) error {
	cutoff := time.Now().Add(-olderThan)
	return r.db.Where("last_active_at < ?", cutoff).Delete(&models.UserPresence{}).Error
}

// Comment Operations

// CreateComment creates a new comment
func (r *CollaborationRepository) CreateComment(comment *models.FlowComment) error {
	return r.db.Create(comment).Error
}

// GetComment retrieves a comment by ID
func (r *CollaborationRepository) GetComment(id uuid.UUID) (*models.FlowComment, error) {
	var comment models.FlowComment
	err := r.db.Preload("Replies").First(&comment, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &comment, nil
}

// UpdateComment updates a comment
func (r *CollaborationRepository) UpdateComment(comment *models.FlowComment) error {
	return r.db.Save(comment).Error
}

// DeleteComment soft-deletes a comment
func (r *CollaborationRepository) DeleteComment(id uuid.UUID) error {
	return r.db.Delete(&models.FlowComment{}, "id = ?", id).Error
}

// ListCommentsForFlow returns all comments for a flow
func (r *CollaborationRepository) ListCommentsForFlow(flowID uuid.UUID, includeResolved bool) ([]*models.FlowComment, error) {
	var comments []*models.FlowComment
	query := r.db.Where("flow_id = ? AND parent_id IS NULL", flowID)
	if !includeResolved {
		query = query.Where("resolved = ?", false)
	}
	err := query.Preload("Replies").Order("created_at DESC").Find(&comments).Error
	return comments, err
}

// ListCommentsForStep returns all comments for a specific step
func (r *CollaborationRepository) ListCommentsForStep(flowID uuid.UUID, stepID string) ([]*models.FlowComment, error) {
	var comments []*models.FlowComment
	err := r.db.Where("flow_id = ? AND step_id = ? AND parent_id IS NULL", flowID, stepID).
		Preload("Replies").
		Order("created_at DESC").
		Find(&comments).Error
	return comments, err
}

// ResolveComment marks a comment as resolved
func (r *CollaborationRepository) ResolveComment(id uuid.UUID) error {
	return r.db.Model(&models.FlowComment{}).Where("id = ?", id).Update("resolved", true).Error
}

// UnresolveComment marks a comment as unresolved
func (r *CollaborationRepository) UnresolveComment(id uuid.UUID) error {
	return r.db.Model(&models.FlowComment{}).Where("id = ?", id).Update("resolved", false).Error
}

// GetCommentCount returns the number of unresolved comments for a flow
func (r *CollaborationRepository) GetCommentCount(flowID uuid.UUID) (int64, error) {
	var count int64
	err := r.db.Model(&models.FlowComment{}).
		Where("flow_id = ? AND resolved = ?", flowID, false).
		Count(&count).Error
	return count, err
}

// Activity Event Operations

// CreateActivityEvent creates a new activity event
func (r *CollaborationRepository) CreateActivityEvent(event *models.ActivityEvent) error {
	return r.db.Create(event).Error
}

// ListActivityEvents returns activity events with filtering
func (r *CollaborationRepository) ListActivityEvents(params ActivityEventParams) ([]*models.ActivityEvent, int64, error) {
	query := r.db.Model(&models.ActivityEvent{})

	if params.WorkspaceID != uuid.Nil {
		query = query.Where("workspace_id = ?", params.WorkspaceID)
	}
	if params.ResourceType != "" {
		query = query.Where("resource_type = ?", params.ResourceType)
	}
	if params.ResourceID != uuid.Nil {
		query = query.Where("resource_id = ?", params.ResourceID)
	}
	if params.ActorID != uuid.Nil {
		query = query.Where("actor_id = ?", params.ActorID)
	}
	if params.EventType != "" {
		query = query.Where("event_type = ?", params.EventType)
	}
	if !params.Since.IsZero() {
		query = query.Where("created_at >= ?", params.Since)
	}

	// Count total
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Pagination
	if params.Limit > 0 {
		query = query.Limit(params.Limit)
	}
	if params.Offset > 0 {
		query = query.Offset(params.Offset)
	}

	var events []*models.ActivityEvent
	err := query.Order("created_at DESC").Find(&events).Error
	return events, total, err
}

// ActivityEventParams defines parameters for listing activity events
type ActivityEventParams struct {
	WorkspaceID  uuid.UUID
	ResourceType string
	ResourceID   uuid.UUID
	ActorID      uuid.UUID
	EventType    string
	Since        time.Time
	Limit        int
	Offset       int
}

// Flow Version Operations

// CreateFlowVersion creates a new flow version
func (r *CollaborationRepository) CreateFlowVersion(version *models.FlowVersion) error {
	// Get the next version number
	var maxVersion int
	r.db.Model(&models.FlowVersion{}).
		Where("flow_id = ?", version.FlowID).
		Select("COALESCE(MAX(version), 0)").
		Scan(&maxVersion)

	version.Version = maxVersion + 1
	return r.db.Create(version).Error
}

// GetFlowVersion retrieves a specific version of a flow
func (r *CollaborationRepository) GetFlowVersion(flowID uuid.UUID, version int) (*models.FlowVersion, error) {
	var v models.FlowVersion
	err := r.db.Where("flow_id = ? AND version = ?", flowID, version).First(&v).Error
	if err != nil {
		return nil, err
	}
	return &v, nil
}

// GetLatestFlowVersion retrieves the latest version of a flow
func (r *CollaborationRepository) GetLatestFlowVersion(flowID uuid.UUID) (*models.FlowVersion, error) {
	var v models.FlowVersion
	err := r.db.Where("flow_id = ?", flowID).Order("version DESC").First(&v).Error
	if err != nil {
		return nil, err
	}
	return &v, nil
}

// ListFlowVersions returns all versions of a flow
func (r *CollaborationRepository) ListFlowVersions(flowID uuid.UUID, limit int) ([]*models.FlowVersion, error) {
	var versions []*models.FlowVersion
	query := r.db.Where("flow_id = ?", flowID).Order("version DESC")
	if limit > 0 {
		query = query.Limit(limit)
	}
	err := query.Find(&versions).Error
	return versions, err
}

// CompareFlowVersions returns two versions for comparison
func (r *CollaborationRepository) CompareFlowVersions(flowID uuid.UUID, v1, v2 int) (*models.FlowVersion, *models.FlowVersion, error) {
	ver1, err := r.GetFlowVersion(flowID, v1)
	if err != nil {
		return nil, nil, err
	}
	ver2, err := r.GetFlowVersion(flowID, v2)
	if err != nil {
		return nil, nil, err
	}
	return ver1, ver2, nil
}
