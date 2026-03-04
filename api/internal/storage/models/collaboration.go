package models

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// JSONMap is a map type that can be scanned from JSONB
type JSONMap map[string]interface{}

// Scan implements the sql.Scanner interface for JSONMap
func (j *JSONMap) Scan(value interface{}) error {
	if value == nil {
		*j = make(JSONMap)
		return nil
	}

	var bytes []byte
	switch v := value.(type) {
	case []byte:
		bytes = v
	case string:
		bytes = []byte(v)
	default:
		return errors.New("failed to scan JSONMap: unsupported type")
	}

	if len(bytes) == 0 {
		*j = make(JSONMap)
		return nil
	}

	return json.Unmarshal(bytes, j)
}

// Value implements the driver.Valuer interface for JSONMap
func (j JSONMap) Value() (driver.Value, error) {
	if j == nil {
		return "{}", nil
	}
	return json.Marshal(j)
}

// UserPresence represents a user's presence in a resource
type UserPresence struct {
	ID         uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	UserID     uuid.UUID `gorm:"type:uuid;index;not null" json:"user_id"`
	UserName   string    `gorm:"not null" json:"user_name"`
	UserEmail  string    `json:"user_email,omitempty"`
	UserAvatar string    `json:"user_avatar,omitempty"`
	Color      string    `gorm:"not null" json:"color"` // Assigned color for cursor/indicator

	// Resource being viewed/edited
	ResourceType string    `gorm:"not null;index" json:"resource_type"` // "flow", "collection", etc.
	ResourceID   uuid.UUID `gorm:"type:uuid;not null;index" json:"resource_id"`

	// Presence state
	Status     string `gorm:"not null;default:'viewing'" json:"status"` // "viewing", "editing"
	CursorData string `gorm:"type:jsonb" json:"cursor_data,omitempty"`  // JSON with cursor position

	// Timing
	LastActiveAt time.Time `gorm:"not null" json:"last_active_at"`
	ConnectedAt  time.Time `gorm:"not null" json:"connected_at"`
	CreatedAt    time.Time `gorm:"autoCreateTime" json:"created_at"`
}

// BeforeCreate generates UUID if not set
func (p *UserPresence) BeforeCreate(tx *gorm.DB) error {
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	return nil
}

// FlowComment represents a comment on a flow or flow step
type FlowComment struct {
	ID        uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	FlowID    uuid.UUID `gorm:"type:uuid;index;not null" json:"flow_id"`
	StepID    string    `gorm:"index" json:"step_id,omitempty"` // Optional: comment on specific step
	ParentID  *uuid.UUID `gorm:"type:uuid;index" json:"parent_id,omitempty"` // For threaded replies

	// Author
	AuthorID     uuid.UUID `gorm:"type:uuid;not null" json:"author_id"`
	AuthorName   string    `gorm:"not null" json:"author_name"`
	AuthorAvatar string    `json:"author_avatar,omitempty"`

	// Content
	Content  string `gorm:"type:text;not null" json:"content"`
	Resolved bool   `gorm:"default:false" json:"resolved"`

	// Metadata
	Position JSONMap `gorm:"type:jsonb" json:"position,omitempty"` // For inline comments

	CreatedAt time.Time  `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt time.Time  `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt *time.Time `gorm:"index" json:"-"`

	// Relations
	Replies []*FlowComment `gorm:"foreignKey:ParentID" json:"replies,omitempty"`
}

// BeforeCreate generates UUID if not set
func (c *FlowComment) BeforeCreate(tx *gorm.DB) error {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	return nil
}

// ActivityEvent represents an activity event in the system
type ActivityEvent struct {
	ID uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`

	// Actor
	ActorID     uuid.UUID `gorm:"type:uuid;index" json:"actor_id"`
	ActorName   string    `gorm:"not null" json:"actor_name"`
	ActorAvatar string    `json:"actor_avatar,omitempty"`

	// Event type
	EventType string `gorm:"not null;index" json:"event_type"` // "flow.created", "flow.updated", "execution.started", etc.

	// Resource
	ResourceType string    `gorm:"not null;index" json:"resource_type"`
	ResourceID   uuid.UUID `gorm:"type:uuid;not null;index" json:"resource_id"`
	ResourceName string    `json:"resource_name,omitempty"`

	// Details
	Description string  `json:"description,omitempty"`
	Changes     JSONMap `gorm:"type:jsonb" json:"changes,omitempty"`
	Metadata    JSONMap `gorm:"type:jsonb" json:"metadata,omitempty"`

	// Workspace scoping
	WorkspaceID *uuid.UUID `gorm:"type:uuid;index" json:"workspace_id,omitempty"`

	CreatedAt time.Time `gorm:"autoCreateTime;index" json:"created_at"`
}

// BeforeCreate generates UUID if not set
func (e *ActivityEvent) BeforeCreate(tx *gorm.DB) error {
	if e.ID == uuid.Nil {
		e.ID = uuid.New()
	}
	return nil
}

// FlowVersion represents a version/revision of a flow for history
type FlowVersion struct {
	ID        uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	FlowID    uuid.UUID `gorm:"type:uuid;index;not null" json:"flow_id"`
	Version   int       `gorm:"not null" json:"version"`

	// Snapshot
	Content string `gorm:"type:text;not null" json:"content"` // YAML content

	// Author
	AuthorID   uuid.UUID `gorm:"type:uuid" json:"author_id"`
	AuthorName string    `json:"author_name,omitempty"`

	// Metadata
	Message     string `json:"message,omitempty"`     // Commit message
	Description string `json:"description,omitempty"` // Change description

	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
}

// BeforeCreate generates UUID if not set
func (v *FlowVersion) BeforeCreate(tx *gorm.DB) error {
	if v.ID == uuid.Nil {
		v.ID = uuid.New()
	}
	return nil
}

// Common event types
const (
	EventTypeFlowCreated         = "flow.created"
	EventTypeFlowUpdated         = "flow.updated"
	EventTypeFlowDeleted         = "flow.deleted"
	EventTypeExecutionStarted    = "execution.started"
	EventTypeExecutionCompleted  = "execution.completed"
	EventTypeExecutionFailed     = "execution.failed"
	EventTypeCommentAdded        = "comment.added"
	EventTypeCommentResolved     = "comment.resolved"
	EventTypeCollectionCreated   = "collection.created"
	EventTypeCollectionUpdated   = "collection.updated"
	EventTypeMemberJoined        = "member.joined"
	EventTypeMemberLeft          = "member.left"
)

// Presence colors for users
var PresenceColors = []string{
	"#FF6B6B", // Red
	"#4ECDC4", // Teal
	"#45B7D1", // Blue
	"#96CEB4", // Green
	"#FFEAA7", // Yellow
	"#DDA0DD", // Plum
	"#98D8C8", // Mint
	"#F7DC6F", // Gold
	"#BB8FCE", // Purple
	"#85C1E9", // Light Blue
}

// GetPresenceColor returns a color based on user index
func GetPresenceColor(index int) string {
	return PresenceColors[index%len(PresenceColors)]
}
