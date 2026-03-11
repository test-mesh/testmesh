package repository

import (
	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"gorm.io/gorm"
)

// NotificationRepository handles notification database operations
type NotificationRepository struct {
	db *gorm.DB
}

// NewNotificationRepository creates a new notification repository
func NewNotificationRepository(db *gorm.DB) *NotificationRepository {
	return &NotificationRepository{db: db}
}

// List retrieves notifications for a workspace ordered by most recent first
func (r *NotificationRepository) List(workspaceID uuid.UUID, limit, offset int) ([]models.Notification, error) {
	var notifications []models.Notification
	if limit <= 0 {
		limit = 50
	}
	err := r.db.
		Where("workspace_id = ?", workspaceID).
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&notifications).Error
	return notifications, err
}

// Create persists a new notification
func (r *NotificationRepository) Create(n *models.Notification) error {
	return r.db.Create(n).Error
}

// MarkRead marks a single notification as read (workspace-scoped for safety)
func (r *NotificationRepository) MarkRead(id, workspaceID uuid.UUID) error {
	return r.db.Model(&models.Notification{}).
		Where("id = ? AND workspace_id = ?", id, workspaceID).
		Update("read", true).Error
}

// MarkAllRead marks all notifications for a workspace as read
func (r *NotificationRepository) MarkAllRead(workspaceID uuid.UUID) error {
	return r.db.Model(&models.Notification{}).
		Where("workspace_id = ? AND read = false", workspaceID).
		Update("read", true).Error
}

// Delete removes a notification (workspace-scoped for safety)
func (r *NotificationRepository) Delete(id, workspaceID uuid.UUID) error {
	return r.db.
		Where("id = ? AND workspace_id = ?", id, workspaceID).
		Delete(&models.Notification{}).Error
}

// CountUnread returns the number of unread notifications for a workspace
func (r *NotificationRepository) CountUnread(workspaceID uuid.UUID) (int64, error) {
	var count int64
	err := r.db.Model(&models.Notification{}).
		Where("workspace_id = ? AND read = false", workspaceID).
		Count(&count).Error
	return count, err
}
