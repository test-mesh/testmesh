package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// NotificationType represents the severity/type of a notification
type NotificationType string

const (
	NotificationTypeInfo    NotificationType = "info"
	NotificationTypeSuccess NotificationType = "success"
	NotificationTypeWarning NotificationType = "warning"
	NotificationTypeError   NotificationType = "error"
)

// NotificationEntityType represents what entity the notification is about
type NotificationEntityType string

const (
	NotificationEntityExecution NotificationEntityType = "execution"
	NotificationEntitySchedule  NotificationEntityType = "schedule"
	NotificationEntityFlow      NotificationEntityType = "flow"
	NotificationEntitySystem    NotificationEntityType = "system"
)

// Notification represents an in-app notification
type Notification struct {
	ID          uuid.UUID              `gorm:"type:uuid;primary_key" json:"id"`
	WorkspaceID uuid.UUID              `gorm:"type:uuid;not null;index" json:"workspace_id"`
	Title       string                 `gorm:"not null" json:"title"`
	Message     string                 `gorm:"not null" json:"message"`
	Type        NotificationType       `gorm:"type:varchar(20);not null;default:'info'" json:"type"`
	Read        bool                   `gorm:"default:false" json:"read"`
	EntityType  NotificationEntityType `gorm:"type:varchar(50)" json:"entity_type,omitempty"`
	EntityID    *uuid.UUID             `gorm:"type:uuid" json:"entity_id,omitempty"`
	Metadata    map[string]interface{} `gorm:"type:jsonb;serializer:json" json:"metadata,omitempty"`
	CreatedAt   time.Time              `gorm:"autoCreateTime;index" json:"created_at"`
}

// TableName sets the table name explicitly (public schema)
func (Notification) TableName() string {
	return "notifications"
}

// BeforeCreate generates UUID if not set
func (n *Notification) BeforeCreate(tx *gorm.DB) error {
	if n.ID == uuid.Nil {
		n.ID = uuid.New()
	}
	return nil
}
