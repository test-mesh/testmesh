package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// WorkspaceAIConfig stores per-workspace AI provider preferences
type WorkspaceAIConfig struct {
	ID              uuid.UUID              `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID     uuid.UUID              `gorm:"type:uuid;not null;uniqueIndex" json:"workspace_id"`
	DefaultProvider string                 `gorm:"type:varchar(50)" json:"default_provider,omitempty"` // "openai", "anthropic", "local"
	AgentOverrides  []AgentProviderOverride `gorm:"type:jsonb;serializer:json;default:'[]'" json:"agent_overrides"`
	CreatedAt       time.Time              `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt       time.Time              `gorm:"autoUpdateTime" json:"updated_at"`
}

// AgentProviderOverride maps an agent name to a specific integration
type AgentProviderOverride struct {
	AgentName     string    `json:"agent_name"`
	IntegrationID uuid.UUID `json:"integration_id"`
}

// TableName specifies the table name
func (WorkspaceAIConfig) TableName() string {
	return "workspace_ai_configs"
}

// BeforeCreate generates UUID if not set
func (c *WorkspaceAIConfig) BeforeCreate(tx *gorm.DB) error {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	return nil
}
