package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// SuiteRunStatus represents the status of a suite run
type SuiteRunStatus string

const (
	SuiteRunPending   SuiteRunStatus = "pending"
	SuiteRunRunning   SuiteRunStatus = "running"
	SuiteRunCompleted SuiteRunStatus = "completed"
	SuiteRunFailed    SuiteRunStatus = "failed"
	SuiteRunCancelled SuiteRunStatus = "cancelled"
)

// TriggerType represents how an execution or suite run was triggered
type TriggerType string

const (
	TriggerTypeManual   TriggerType = "manual"
	TriggerTypeSchedule TriggerType = "schedule"
	TriggerTypeWebhook  TriggerType = "webhook"
	TriggerTypeArgoCD   TriggerType = "argocd"
	TriggerTypeAPI      TriggerType = "api"
)

// Suite groups flows for batch execution.
type Suite struct {
	ID          uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID      `gorm:"type:uuid;not null;index" json:"workspace_id"`
	Name        string         `gorm:"not null" json:"name"`
	Description string         `json:"description"`
	Tags        StringArray    `gorm:"type:text[]" json:"tags"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`

	SuiteFlows []SuiteFlow `gorm:"foreignKey:SuiteID;constraint:OnDelete:CASCADE" json:"flows,omitempty"`
}

func (Suite) TableName() string { return "flows.suites" }

// SuiteFlow is an ordered flow membership in a Suite.
// Flows with the same Order value run in parallel.
type SuiteFlow struct {
	ID       uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	SuiteID  uuid.UUID `gorm:"type:uuid;not null;index" json:"suite_id"`
	FlowID   uuid.UUID `gorm:"type:uuid;not null" json:"flow_id"`
	Order    int       `gorm:"default:0" json:"order"`
	Parallel bool      `gorm:"default:false" json:"parallel"`

	Flow *Flow `gorm:"foreignKey:FlowID" json:"flow,omitempty"`
}

func (SuiteFlow) TableName() string { return "flows.suite_flows" }

// SuiteRun tracks a single execution of a Suite.
type SuiteRun struct {
	ID          uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	SuiteID     uuid.UUID      `gorm:"type:uuid;not null;index" json:"suite_id"`
	Status      SuiteRunStatus `gorm:"not null;default:'pending'" json:"status"`
	TriggerType TriggerType    `gorm:"not null;default:'manual'" json:"trigger_type"`
	TriggerRef  string         `json:"trigger_ref"`
	Environment string         `json:"environment"`
	StartedAt   *time.Time     `json:"started_at"`
	CompletedAt *time.Time     `json:"completed_at"`
	DurationMs  int64          `json:"duration_ms"`
	TotalFlows  int            `json:"total_flows"`
	PassedFlows int            `json:"passed_flows"`
	FailedFlows int            `json:"failed_flows"`
	Error       string         `json:"error"`

	SuiteRunExecutions []SuiteRunExecution `gorm:"foreignKey:SuiteRunID;constraint:OnDelete:CASCADE" json:"executions,omitempty"`
}

func (SuiteRun) TableName() string { return "flows.suite_runs" }

// SuiteRunExecution links each individual Execution to its parent SuiteRun.
type SuiteRunExecution struct {
	ID          uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	SuiteRunID  uuid.UUID `gorm:"type:uuid;not null;index" json:"suite_run_id"`
	ExecutionID uuid.UUID `gorm:"type:uuid;not null" json:"execution_id"`
	FlowID      uuid.UUID `gorm:"type:uuid;not null" json:"flow_id"`
	Order       int       `json:"order"`
}

func (SuiteRunExecution) TableName() string { return "flows.suite_run_executions" }
