package models

import (
	"database/sql/driver"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// ExecutionStatus represents the status of an execution
type ExecutionStatus string

const (
	ExecutionStatusPending   ExecutionStatus = "pending"
	ExecutionStatusRunning   ExecutionStatus = "running"
	ExecutionStatusCompleted ExecutionStatus = "completed"
	ExecutionStatusFailed    ExecutionStatus = "failed"
	ExecutionStatusCancelled ExecutionStatus = "cancelled"
)

// Execution represents a flow execution record
type Execution struct {
	ID          uuid.UUID       `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	FlowID      uuid.UUID       `gorm:"type:uuid;not null;index" json:"flow_id"`
	Flow        *Flow           `gorm:"foreignKey:FlowID" json:"flow,omitempty"`
	Status      ExecutionStatus `gorm:"type:varchar(20);not null;default:'pending';index" json:"status"`
	Environment string          `gorm:"default:'default'" json:"environment"`
	StartedAt   *time.Time      `json:"started_at"`
	FinishedAt  *time.Time      `json:"finished_at"`
	DurationMs  int64           `json:"duration_ms"`
	TotalSteps  int             `json:"total_steps"`
	PassedSteps int             `json:"passed_steps"`
	FailedSteps int             `json:"failed_steps"`
	Error       string          `json:"error,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

// TableName specifies the table name with schema
func (Execution) TableName() string {
	return "executions.executions"
}

// StepStatus represents the status of a step execution
type StepStatus string

const (
	StepStatusPending   StepStatus = "pending"
	StepStatusRunning   StepStatus = "running"
	StepStatusCompleted StepStatus = "completed"
	StepStatusFailed    StepStatus = "failed"
	StepStatusSkipped   StepStatus = "skipped"
)

// ExecutionStep represents a single step execution record
type ExecutionStep struct {
	ID           uuid.UUID       `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	ExecutionID  uuid.UUID       `gorm:"type:uuid;not null;index" json:"execution_id"`
	Execution    *Execution      `gorm:"foreignKey:ExecutionID" json:"execution,omitempty"`
	StepID       string          `gorm:"not null" json:"step_id"`
	StepName     string          `json:"step_name"`
	Action       string          `gorm:"not null" json:"action"`
	Status       StepStatus      `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
	StartedAt    *time.Time      `json:"started_at"`
	FinishedAt   *time.Time      `json:"finished_at"`
	DurationMs   int64           `json:"duration_ms"`
	Output       OutputData      `gorm:"type:jsonb" json:"output"`
	ErrorMessage string          `json:"error_message,omitempty"`
	Attempt      int             `gorm:"default:1" json:"attempt"`
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
}

// TableName specifies the table name with schema
func (ExecutionStep) TableName() string {
	return "executions.execution_steps"
}

// OutputData holds step output data
type OutputData map[string]interface{}

// Scan implements sql.Scanner interface for JSONB
func (od *OutputData) Scan(value interface{}) error {
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, od)
}

// Value implements driver.Valuer interface for JSONB
func (od OutputData) Value() (driver.Value, error) {
	return json.Marshal(od)
}
