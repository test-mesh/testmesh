package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// IntegrationType represents the type of integration
type IntegrationType string

const (
	IntegrationTypeAIProvider IntegrationType = "ai_provider"
	IntegrationTypeGit        IntegrationType = "git"
)

// IntegrationProvider represents the specific provider
type IntegrationProvider string

const (
	// AI Providers
	IntegrationProviderOpenAI    IntegrationProvider = "openai"
	IntegrationProviderAnthropic IntegrationProvider = "anthropic"
	IntegrationProviderLocal     IntegrationProvider = "local"

	// Git Providers
	IntegrationProviderGitHub IntegrationProvider = "github"
)

// IntegrationStatus represents the status of an integration
type IntegrationStatus string

const (
	IntegrationStatusActive   IntegrationStatus = "active"
	IntegrationStatusDisabled IntegrationStatus = "disabled"
	IntegrationStatusError    IntegrationStatus = "error"
)

// SystemIntegration represents a system-level integration (AI provider or Git)
type SystemIntegration struct {
	ID               uuid.UUID           `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Name             string              `gorm:"not null" json:"name"`
	Type             IntegrationType     `gorm:"type:varchar(50);not null;index" json:"type"`
	Provider         IntegrationProvider `gorm:"type:varchar(50);not null;index" json:"provider"`
	Status           IntegrationStatus   `gorm:"type:varchar(20);default:'active'" json:"status"`
	Config           IntegrationConfig   `gorm:"type:jsonb;serializer:json;default:'{}'" json:"config"`
	LastTestAt       *time.Time          `json:"last_test_at,omitempty"`
	LastTestStatus   string              `json:"last_test_status,omitempty"`
	LastTestError    string              `json:"last_test_error,omitempty"`
	CreatedBy        *uuid.UUID          `gorm:"type:uuid" json:"created_by,omitempty"`
	CreatedAt        time.Time           `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt        time.Time           `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt        gorm.DeletedAt      `gorm:"index" json:"deleted_at,omitempty"`

	// Not stored in DB - populated by repository when loading with secrets
	Secrets map[string]string `gorm:"-" json:"secrets,omitempty"`
}

// IntegrationConfig holds non-sensitive configuration
type IntegrationConfig struct {
	// AI Provider config
	Model       string  `json:"model,omitempty"`
	Endpoint    string  `json:"endpoint,omitempty"`
	Temperature float64 `json:"temperature,omitempty"`
	MaxTokens   int     `json:"max_tokens,omitempty"`

	// GitHub config
	SignatureHeader string `json:"signature_header,omitempty"` // "X-Hub-Signature-256"
}

// BeforeCreate generates UUID if not set
func (i *SystemIntegration) BeforeCreate(tx *gorm.DB) error {
	if i.ID == uuid.Nil {
		i.ID = uuid.New()
	}
	return nil
}

// IntegrationSecret stores encrypted secrets for integrations
type IntegrationSecret struct {
	ID            uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	IntegrationID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_secrets_integration" json:"integration_id"`
	EncryptedData string    `gorm:"type:text;not null" json:"-"` // Never expose in JSON
	Nonce         string    `gorm:"type:text;not null" json:"-"` // Never expose in JSON
	CreatedAt     time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt     time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

// BeforeCreate generates UUID if not set
func (s *IntegrationSecret) BeforeCreate(tx *gorm.DB) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return nil
}

// TriggerMode defines how a git trigger executes
type TriggerMode string

const (
	TriggerModeSchedule TriggerMode = "schedule"
	TriggerModeDirect   TriggerMode = "direct"
)

// GitTriggerRule maps git events to test executions
type GitTriggerRule struct {
	ID            uuid.UUID   `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID   uuid.UUID   `gorm:"type:uuid;not null;index" json:"workspace_id"`
	IntegrationID uuid.UUID   `gorm:"type:uuid;not null;index" json:"integration_id"`
	Name          string      `gorm:"not null" json:"name"`
	Repository    string      `gorm:"not null;index" json:"repository"` // "owner/repo"
	BranchFilter  string      `gorm:"default:'*'" json:"branch_filter"` // glob pattern
	EventTypes    StringArray `gorm:"type:text[];default:'{push,pull_request}'" json:"event_types"`
	TriggerMode   TriggerMode `gorm:"type:varchar(20);not null" json:"trigger_mode"`
	ScheduleID    *uuid.UUID  `gorm:"type:uuid" json:"schedule_id,omitempty"`
	FlowID        *uuid.UUID  `gorm:"type:uuid" json:"flow_id,omitempty"`
	Enabled       bool        `gorm:"default:true" json:"enabled"`
	CreatedAt     time.Time   `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt     time.Time   `gorm:"autoUpdateTime" json:"updated_at"`

	// Relations (not always loaded)
	Integration *SystemIntegration `gorm:"foreignKey:IntegrationID" json:"integration,omitempty"`
	Schedule    *Schedule          `gorm:"foreignKey:ScheduleID" json:"schedule,omitempty"`
	Flow        *Flow              `gorm:"foreignKey:FlowID" json:"flow,omitempty"`
}

// BeforeCreate generates UUID if not set
func (r *GitTriggerRule) BeforeCreate(tx *gorm.DB) error {
	if r.ID == uuid.Nil {
		r.ID = uuid.New()
	}
	return nil
}

// WebhookDeliveryStatus represents the status of a webhook delivery
type WebhookDeliveryStatus string

const (
	WebhookDeliveryStatusSuccess  WebhookDeliveryStatus = "success"
	WebhookDeliveryStatusFailed   WebhookDeliveryStatus = "failed"
	WebhookDeliveryStatusRejected WebhookDeliveryStatus = "rejected"
)

// UUIDArray is a custom type for UUID arrays
type UUIDArray []uuid.UUID

// WebhookDelivery represents an audit log of webhook events
type WebhookDelivery struct {
	ID            uuid.UUID             `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	IntegrationID uuid.UUID             `gorm:"type:uuid;not null;index" json:"integration_id"`
	WorkspaceID   *uuid.UUID            `gorm:"type:uuid" json:"workspace_id,omitempty"`
	EventType     string                `gorm:"not null" json:"event_type"`
	Repository    string                `json:"repository,omitempty"`
	Branch        string                `json:"branch,omitempty"`
	CommitSHA     string                `json:"commit_sha,omitempty"`
	Payload       map[string]interface{} `gorm:"type:jsonb;serializer:json;not null" json:"payload"`
	Signature     string                `json:"signature,omitempty"`
	Status        WebhookDeliveryStatus `gorm:"type:varchar(20);not null;index" json:"status"`
	Error         string                `json:"error,omitempty"`
	TriggeredRuns UUIDArray             `gorm:"type:uuid[]" json:"triggered_runs,omitempty"`
	ReceivedAt    time.Time             `gorm:"index;default:CURRENT_TIMESTAMP" json:"received_at"`
	ProcessedAt   *time.Time            `json:"processed_at,omitempty"`
}

// BeforeCreate generates UUID if not set
func (d *WebhookDelivery) BeforeCreate(tx *gorm.DB) error {
	if d.ID == uuid.Nil {
		d.ID = uuid.New()
	}
	return nil
}
