package models

import (
	"database/sql/driver"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// MockServerStatus represents the status of a mock server
type MockServerStatus string

const (
	MockServerStatusStarting MockServerStatus = "starting"
	MockServerStatusRunning  MockServerStatus = "running"
	MockServerStatusStopped  MockServerStatus = "stopped"
	MockServerStatusFailed   MockServerStatus = "failed"
)

// MockServer represents a mock server instance
type MockServer struct {
	ID          uuid.UUID        `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	ExecutionID *uuid.UUID       `gorm:"type:uuid;index" json:"execution_id,omitempty"`
	Execution   *Execution       `gorm:"foreignKey:ExecutionID" json:"execution,omitempty"`
	Name        string           `gorm:"not null" json:"name"`
	Port        int              `gorm:"not null;index" json:"port"`
	BaseURL     string           `gorm:"not null" json:"base_url"`
	Status      MockServerStatus `gorm:"type:varchar(20);not null;default:'starting'" json:"status"`
	StartedAt   *time.Time       `json:"started_at,omitempty"`
	StoppedAt   *time.Time       `json:"stopped_at,omitempty"`
	CreatedAt   time.Time        `json:"created_at"`
	UpdatedAt   time.Time        `json:"updated_at"`
}

// TableName specifies the table name with schema
func (MockServer) TableName() string {
	return "mocks.mock_servers"
}

// MockEndpoint represents a mock endpoint configuration
type MockEndpoint struct {
	ID             uuid.UUID       `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	MockServerID   uuid.UUID       `gorm:"type:uuid;not null;index" json:"mock_server_id"`
	MockServer     *MockServer     `gorm:"foreignKey:MockServerID" json:"mock_server,omitempty"`
	Path           string          `gorm:"not null" json:"path"`
	Method         string          `gorm:"not null" json:"method"`
	MatchConfig    MatchConfig     `gorm:"type:jsonb" json:"match_config"`
	ResponseConfig ResponseConfig  `gorm:"type:jsonb;not null" json:"response_config"`
	StateConfig    *StateConfig    `gorm:"type:jsonb" json:"state_config,omitempty"`
	Priority       int             `gorm:"default:0" json:"priority"` // Higher priority = match first
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

// TableName specifies the table name with schema
func (MockEndpoint) TableName() string {
	return "mocks.mock_endpoints"
}

// MatchConfig defines request matching criteria
type MatchConfig struct {
	PathPattern string                 `json:"path_pattern,omitempty"` // Regex pattern for path
	Headers     map[string]string      `json:"headers,omitempty"`      // Required headers
	QueryParams map[string]string      `json:"query_params,omitempty"` // Required query params
	BodyPattern string                 `json:"body_pattern,omitempty"` // Regex pattern for body
	BodyJSON    map[string]interface{} `json:"body_json,omitempty"`    // JSON body match
}

// Scan implements sql.Scanner interface for JSONB
func (mc *MatchConfig) Scan(value interface{}) error {
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, mc)
}

// Value implements driver.Valuer interface for JSONB
func (mc MatchConfig) Value() (driver.Value, error) {
	return json.Marshal(mc)
}

// ResponseConfig defines the mock response
type ResponseConfig struct {
	StatusCode  int                    `json:"status_code"`
	Headers     map[string]string      `json:"headers,omitempty"`
	Body        interface{}            `json:"body,omitempty"`
	BodyJSON    map[string]interface{} `json:"body_json,omitempty"`
	BodyText    string                 `json:"body_text,omitempty"`
	DelayMs     int                    `json:"delay_ms,omitempty"`     // Response delay
	Template    bool                   `json:"template,omitempty"`     // Use templating
	TemplateVars map[string]interface{} `json:"template_vars,omitempty"` // Template variables
}

// Scan implements sql.Scanner interface for JSONB
func (rc *ResponseConfig) Scan(value interface{}) error {
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, rc)
}

// Value implements driver.Valuer interface for JSONB
func (rc ResponseConfig) Value() (driver.Value, error) {
	return json.Marshal(rc)
}

// StateConfig defines stateful behavior
type StateConfig struct {
	StateKey    string                 `json:"state_key"`              // Key in state store
	InitialValue interface{}            `json:"initial_value,omitempty"` // Initial state value
	UpdateRule  string                 `json:"update_rule,omitempty"`  // How to update state (increment, set, etc.)
	UpdateValue interface{}            `json:"update_value,omitempty"` // Value to update with
	Condition   map[string]interface{} `json:"condition,omitempty"`    // Conditional state logic
}

// Scan implements sql.Scanner interface for JSONB
func (sc *StateConfig) Scan(value interface{}) error {
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, sc)
}

// Value implements driver.Valuer interface for JSONB
func (sc StateConfig) Value() (driver.Value, error) {
	return json.Marshal(sc)
}

// MockRequest represents a logged request to a mock server
type MockRequest struct {
	ID           uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	MockServerID uuid.UUID  `gorm:"type:uuid;not null;index" json:"mock_server_id"`
	MockServer   *MockServer `gorm:"foreignKey:MockServerID" json:"mock_server,omitempty"`
	EndpointID   *uuid.UUID `gorm:"type:uuid;index" json:"endpoint_id,omitempty"`
	Method       string     `gorm:"not null" json:"method"`
	Path         string     `gorm:"not null" json:"path"`
	Headers      JSONMap    `gorm:"type:jsonb" json:"headers"`
	QueryParams  JSONMap    `gorm:"type:jsonb" json:"query_params"`
	Body         string     `json:"body"`
	Matched      bool       `gorm:"default:false" json:"matched"`
	ResponseCode int        `json:"response_code"`
	ReceivedAt   time.Time  `gorm:"default:CURRENT_TIMESTAMP" json:"received_at"`
}

// TableName specifies the table name with schema
func (MockRequest) TableName() string {
	return "mocks.mock_requests"
}

// MockState represents server state for stateful mocking
type MockState struct {
	ID           uuid.UUID              `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	MockServerID uuid.UUID              `gorm:"type:uuid;not null;index" json:"mock_server_id"`
	MockServer   *MockServer            `gorm:"foreignKey:MockServerID" json:"mock_server,omitempty"`
	StateKey     string    `gorm:"not null;index" json:"state_key"`
	StateValue   JSONMap   `gorm:"type:jsonb;not null" json:"state_value"`
	UpdatedAt    time.Time              `json:"updated_at"`
}

// TableName specifies the table name with schema
func (MockState) TableName() string {
	return "mocks.mock_state"
}
