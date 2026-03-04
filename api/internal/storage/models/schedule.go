package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ScheduleStatus represents the status of a schedule
type ScheduleStatus string

const (
	ScheduleStatusActive   ScheduleStatus = "active"
	ScheduleStatusPaused   ScheduleStatus = "paused"
	ScheduleStatusDisabled ScheduleStatus = "disabled"
)

// Schedule represents a scheduled test execution
type Schedule struct {
	ID          uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Name        string         `gorm:"not null" json:"name"`
	Description string         `json:"description,omitempty"`
	FlowID      uuid.UUID      `gorm:"type:uuid;index" json:"flow_id"`
	Flow        *Flow          `gorm:"foreignKey:FlowID" json:"flow,omitempty"`
	CronExpr    string         `gorm:"not null" json:"cron_expr"`
	Timezone    string         `gorm:"default:'UTC'" json:"timezone"`
	Status      ScheduleStatus `gorm:"type:varchar(20);not null;default:'active'" json:"status"`

	// Execution settings
	Environment     map[string]interface{} `gorm:"type:jsonb;serializer:json;default:'{}'" json:"environment,omitempty"`
	NotifyOnFailure bool        `gorm:"default:false" json:"notify_on_failure"`
	NotifyOnSuccess bool        `gorm:"default:false" json:"notify_on_success"`
	NotifyEmails    StringArray `gorm:"type:text[]" json:"notify_emails,omitempty"`
	MaxRetries      int                    `gorm:"default:0" json:"max_retries"`
	RetryDelay      string                 `gorm:"default:'1m'" json:"retry_delay"`

	// Overlap prevention
	AllowOverlap bool `gorm:"default:false" json:"allow_overlap"`

	// Timing
	NextRunAt   *time.Time `json:"next_run_at,omitempty"`
	LastRunAt   *time.Time `json:"last_run_at,omitempty"`
	LastRunID   *uuid.UUID `gorm:"type:uuid" json:"last_run_id,omitempty"`
	LastRunResult string   `json:"last_run_result,omitempty"` // "success", "failure", "skipped"

	// Metadata
	Tags      StringArray `gorm:"type:text[]" json:"tags,omitempty"`
	CreatedBy uuid.UUID `gorm:"type:uuid" json:"created_by"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

// BeforeCreate generates UUID if not set
func (s *Schedule) BeforeCreate(tx *gorm.DB) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return nil
}

// ScheduleRun represents a single execution of a schedule
type ScheduleRun struct {
	ID          uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	ScheduleID  uuid.UUID  `gorm:"type:uuid;index;not null" json:"schedule_id"`
	Schedule    *Schedule  `gorm:"foreignKey:ScheduleID" json:"schedule,omitempty"`
	ExecutionID *uuid.UUID `gorm:"type:uuid" json:"execution_id,omitempty"`
	Status      string     `gorm:"not null" json:"status"` // "pending", "running", "completed", "failed", "skipped"
	Result      string     `json:"result,omitempty"`       // "success", "failure"
	Error       string     `json:"error,omitempty"`
	RetryCount  int        `gorm:"default:0" json:"retry_count"`

	// Timing
	ScheduledAt time.Time  `gorm:"not null" json:"scheduled_at"`
	StartedAt   *time.Time `json:"started_at,omitempty"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
	Duration    int64      `json:"duration_ms,omitempty"`

	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
}

// BeforeCreate generates UUID if not set
func (sr *ScheduleRun) BeforeCreate(tx *gorm.DB) error {
	if sr.ID == uuid.Nil {
		sr.ID = uuid.New()
	}
	return nil
}

// ScheduleListParams defines parameters for listing schedules
type ScheduleListParams struct {
	Status   ScheduleStatus
	FlowID   uuid.UUID
	Tags     []string
	Search   string
	Page     int
	PageSize int
}
