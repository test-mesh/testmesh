package models

import (
	"database/sql/driver"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// Contract represents a Pact-compatible contract
type Contract struct {
	ID           uuid.UUID     `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Consumer     string        `gorm:"not null;index" json:"consumer"`
	Provider     string        `gorm:"not null;index" json:"provider"`
	Version      string        `gorm:"not null" json:"version"`
	PactVersion  string        `gorm:"default:'4.0'" json:"pact_version"`
	ContractData ContractData  `gorm:"type:jsonb;not null" json:"contract_data"`
	FlowID       *uuid.UUID    `gorm:"type:uuid;index" json:"flow_id,omitempty"`
	Flow         *Flow         `gorm:"foreignKey:FlowID" json:"flow,omitempty"`
	CreatedAt    time.Time     `json:"created_at"`
	UpdatedAt    time.Time     `json:"updated_at"`
}

// TableName specifies the table name with schema
func (Contract) TableName() string {
	return "contracts.contracts"
}

// ContractData holds the Pact contract structure
type ContractData struct {
	Consumer     ConsumerInfo  `json:"consumer"`
	Provider     ProviderInfo  `json:"provider"`
	Interactions []Interaction `json:"interactions"`
	Metadata     Metadata      `json:"metadata"`
}

// Scan implements sql.Scanner interface for JSONB
func (cd *ContractData) Scan(value interface{}) error {
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, cd)
}

// Value implements driver.Valuer interface for JSONB
func (cd ContractData) Value() (driver.Value, error) {
	return json.Marshal(cd)
}

// ConsumerInfo represents the consumer service
type ConsumerInfo struct {
	Name string `json:"name"`
}

// ProviderInfo represents the provider service
type ProviderInfo struct {
	Name string `json:"name"`
}

// Metadata contains Pact metadata
type Metadata struct {
	PactSpecification PactSpecification `json:"pactSpecification"`
	Client            ClientInfo        `json:"client,omitempty"`
}

// PactSpecification version information
type PactSpecification struct {
	Version string `json:"version"`
}

// ClientInfo about the tool that created the contract
type ClientInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// Interaction represents a single interaction in a contract
type Interaction struct {
	ID                uuid.UUID              `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	ContractID        uuid.UUID              `gorm:"type:uuid;not null;index" json:"contract_id"`
	Contract          *Contract              `gorm:"foreignKey:ContractID" json:"contract,omitempty"`
	Description       string                 `gorm:"not null" json:"description"`
	ProviderState     string                 `json:"provider_state,omitempty"`
	Request           HTTPRequest            `gorm:"type:jsonb;not null" json:"request"`
	Response          HTTPResponse           `gorm:"type:jsonb;not null" json:"response"`
	InteractionType   string                 `gorm:"default:'http'" json:"type"`
	Metadata          map[string]interface{} `gorm:"type:jsonb" json:"metadata,omitempty"`
	CreatedAt         time.Time              `json:"created_at"`
	UpdatedAt         time.Time              `json:"updated_at"`
}

// TableName specifies the table name with schema
func (Interaction) TableName() string {
	return "contracts.interactions"
}

// HTTPRequest represents an HTTP request in a Pact interaction
type HTTPRequest struct {
	Method  string                 `json:"method"`
	Path    string                 `json:"path"`
	Query   map[string]interface{} `json:"query,omitempty"`
	Headers map[string]interface{} `json:"headers,omitempty"`
	Body    interface{}            `json:"body,omitempty"`
}

// Scan implements sql.Scanner interface for JSONB
func (hr *HTTPRequest) Scan(value interface{}) error {
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, hr)
}

// Value implements driver.Valuer interface for JSONB
func (hr HTTPRequest) Value() (driver.Value, error) {
	return json.Marshal(hr)
}

// HTTPResponse represents an HTTP response in a Pact interaction
type HTTPResponse struct {
	Status  int                    `json:"status"`
	Headers map[string]interface{} `json:"headers,omitempty"`
	Body    interface{}            `json:"body,omitempty"`
}

// Scan implements sql.Scanner interface for JSONB
func (hr *HTTPResponse) Scan(value interface{}) error {
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, hr)
}

// Value implements driver.Valuer interface for JSONB
func (hr HTTPResponse) Value() (driver.Value, error) {
	return json.Marshal(hr)
}

// VerificationStatus represents the status of a contract verification
type VerificationStatus string

const (
	VerificationStatusPending   VerificationStatus = "pending"
	VerificationStatusPassed    VerificationStatus = "passed"
	VerificationStatusFailed    VerificationStatus = "failed"
)

// Verification represents a contract verification result
type Verification struct {
	ID                uuid.UUID          `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	ContractID        uuid.UUID          `gorm:"type:uuid;not null;index" json:"contract_id"`
	Contract          *Contract          `gorm:"foreignKey:ContractID" json:"contract,omitempty"`
	ProviderVersion   string             `gorm:"not null" json:"provider_version"`
	Status            VerificationStatus `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
	VerifiedAt        time.Time          `json:"verified_at"`
	Results           VerificationResults `gorm:"type:jsonb;not null" json:"results"`
	ExecutionID       *uuid.UUID         `gorm:"type:uuid;index" json:"execution_id,omitempty"`
	Execution         *Execution         `gorm:"foreignKey:ExecutionID" json:"execution,omitempty"`
	CreatedAt         time.Time          `json:"created_at"`
	UpdatedAt         time.Time          `json:"updated_at"`
}

// TableName specifies the table name with schema
func (Verification) TableName() string {
	return "contracts.verifications"
}

// VerificationResults holds detailed verification results
type VerificationResults struct {
	TotalInteractions  int                       `json:"total_interactions"`
	PassedInteractions int                       `json:"passed_interactions"`
	FailedInteractions int                       `json:"failed_interactions"`
	Details            []InteractionResult       `json:"details"`
	Summary            string                    `json:"summary"`
}

// Scan implements sql.Scanner interface for JSONB
func (vr *VerificationResults) Scan(value interface{}) error {
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, vr)
}

// Value implements driver.Valuer interface for JSONB
func (vr VerificationResults) Value() (driver.Value, error) {
	return json.Marshal(vr)
}

// InteractionResult represents the result of verifying a single interaction
type InteractionResult struct {
	InteractionID   uuid.UUID              `json:"interaction_id"`
	Description     string                 `json:"description"`
	Passed          bool                   `json:"passed"`
	Mismatches      []Mismatch             `json:"mismatches,omitempty"`
	ActualRequest   map[string]interface{} `json:"actual_request,omitempty"`
	ActualResponse  map[string]interface{} `json:"actual_response,omitempty"`
}

// Mismatch represents a difference between expected and actual
type Mismatch struct {
	Type     string      `json:"type"` // status, header, body, path, method
	Expected interface{} `json:"expected"`
	Actual   interface{} `json:"actual"`
	Path     string      `json:"path,omitempty"` // JSONPath for nested mismatches
	Message  string      `json:"message"`
}

// BreakingChangeSeverity represents the severity of a breaking change
type BreakingChangeSeverity string

const (
	SeverityCritical BreakingChangeSeverity = "critical"
	SeverityMajor    BreakingChangeSeverity = "major"
	SeverityMinor    BreakingChangeSeverity = "minor"
)

// BreakingChange represents a detected breaking change between contract versions
type BreakingChange struct {
	ID              uuid.UUID              `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	OldContractID   uuid.UUID              `gorm:"type:uuid;not null;index" json:"old_contract_id"`
	OldContract     *Contract              `gorm:"foreignKey:OldContractID" json:"old_contract,omitempty"`
	NewContractID   uuid.UUID              `gorm:"type:uuid;not null;index" json:"new_contract_id"`
	NewContract     *Contract              `gorm:"foreignKey:NewContractID" json:"new_contract,omitempty"`
	ChangeType      string                 `gorm:"not null" json:"change_type"` // removed_interaction, modified_request, modified_response, etc.
	Severity        BreakingChangeSeverity `gorm:"type:varchar(20);not null" json:"severity"`
	Description     string                 `gorm:"not null" json:"description"`
	Details         ChangeDetails          `gorm:"type:jsonb" json:"details"`
	DetectedAt      time.Time              `json:"detected_at"`
	CreatedAt       time.Time              `json:"created_at"`
}

// TableName specifies the table name with schema
func (BreakingChange) TableName() string {
	return "contracts.breaking_changes"
}

// ChangeDetails holds detailed information about a breaking change
type ChangeDetails struct {
	InteractionID string                 `json:"interaction_id,omitempty"`
	Field         string                 `json:"field,omitempty"`
	OldValue      interface{}            `json:"old_value,omitempty"`
	NewValue      interface{}            `json:"new_value,omitempty"`
	Impact        string                 `json:"impact"`
	Suggestion    string                 `json:"suggestion,omitempty"`
	Metadata      map[string]interface{} `json:"metadata,omitempty"`
}

// Scan implements sql.Scanner interface for JSONB
func (cd *ChangeDetails) Scan(value interface{}) error {
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, cd)
}

// Value implements driver.Valuer interface for JSONB
func (cd ChangeDetails) Value() (driver.Value, error) {
	return json.Marshal(cd)
}
