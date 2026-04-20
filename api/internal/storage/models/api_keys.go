package models

import (
	"time"

	"github.com/google/uuid"
)

// WorkspaceAPIKey is a long-lived token for sending spans to TestMesh.
type WorkspaceAPIKey struct {
	ID          uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID  `gorm:"type:uuid;not null;index" json:"workspace_id"`
	Name        string     `gorm:"not null" json:"name"`
	KeyHash     string     `gorm:"not null" json:"-"`
	Prefix      string     `gorm:"size:12;not null" json:"prefix"`
	LastUsedAt  *time.Time `json:"last_used_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	RevokedAt   *time.Time `json:"revoked_at,omitempty"`
}

func (WorkspaceAPIKey) TableName() string { return "workspace_api_keys" }
