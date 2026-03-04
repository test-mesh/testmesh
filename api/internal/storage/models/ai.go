package models

import (
	"database/sql/driver"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// AIProviderType represents supported AI providers
type AIProviderType string

const (
	AIProviderAnthropic AIProviderType = "anthropic"
	AIProviderOpenAI    AIProviderType = "openai"
	AIProviderLocal     AIProviderType = "local"
)

// GenerationStatus represents the status of an AI generation
type GenerationStatus string

const (
	GenerationStatusPending    GenerationStatus = "pending"
	GenerationStatusProcessing GenerationStatus = "processing"
	GenerationStatusCompleted  GenerationStatus = "completed"
	GenerationStatusFailed     GenerationStatus = "failed"
)

// GenerationHistory stores AI generation requests and results
type GenerationHistory struct {
	ID            uuid.UUID        `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Provider      AIProviderType   `gorm:"type:varchar(50);not null" json:"provider"`
	Model         string           `gorm:"not null" json:"model"`
	Prompt        string           `gorm:"type:text;not null" json:"prompt"`
	Status        GenerationStatus `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
	GeneratedYAML string           `gorm:"type:text" json:"generated_yaml,omitempty"`
	FlowID        *uuid.UUID       `gorm:"type:uuid" json:"flow_id,omitempty"`
	Flow          *Flow            `gorm:"foreignKey:FlowID" json:"flow,omitempty"`
	TokensUsed    int              `json:"tokens_used"`
	LatencyMs     int64            `json:"latency_ms"`
	Error         string           `json:"error,omitempty"`
	Metadata      GenerationMeta   `gorm:"type:jsonb" json:"metadata"`
	CreatedAt     time.Time        `json:"created_at"`
	UpdatedAt     time.Time        `json:"updated_at"`
}

// TableName specifies the table name with schema
func (GenerationHistory) TableName() string {
	return "ai.generation_history"
}

// GenerationMeta holds additional metadata for generation
type GenerationMeta struct {
	Temperature      float64  `json:"temperature,omitempty"`
	MaxTokens        int      `json:"max_tokens,omitempty"`
	SystemPrompt     string   `json:"system_prompt,omitempty"`
	Tags             []string `json:"tags,omitempty"`
	SourceType       string   `json:"source_type,omitempty"` // "prompt", "openapi", "postman", "pact"
	SourceIdentifier string   `json:"source_identifier,omitempty"`
}

// Scan implements sql.Scanner interface for JSONB
func (m *GenerationMeta) Scan(value interface{}) error {
	if value == nil {
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, m)
}

// Value implements driver.Valuer interface for JSONB
func (m GenerationMeta) Value() (driver.Value, error) {
	return json.Marshal(m)
}

// SuggestionStatus represents the status of an AI suggestion
type SuggestionStatus string

const (
	SuggestionStatusPending  SuggestionStatus = "pending"
	SuggestionStatusAccepted SuggestionStatus = "accepted"
	SuggestionStatusRejected SuggestionStatus = "rejected"
	SuggestionStatusApplied  SuggestionStatus = "applied"
)

// SuggestionType represents the type of suggestion
type SuggestionType string

const (
	SuggestionTypeFix           SuggestionType = "fix"
	SuggestionTypeOptimization  SuggestionType = "optimization"
	SuggestionTypeRetryStrategy SuggestionType = "retry_strategy"
	SuggestionTypeAssertion     SuggestionType = "assertion"
	SuggestionTypeTimeout       SuggestionType = "timeout"
)

// Suggestion stores AI-generated suggestions for fixing or improving flows
type Suggestion struct {
	ID            uuid.UUID        `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	FlowID        uuid.UUID        `gorm:"type:uuid;not null;index" json:"flow_id"`
	Flow          *Flow            `gorm:"foreignKey:FlowID" json:"flow,omitempty"`
	ExecutionID   *uuid.UUID       `gorm:"type:uuid;index" json:"execution_id,omitempty"`
	Execution     *Execution       `gorm:"foreignKey:ExecutionID" json:"execution,omitempty"`
	Type          SuggestionType   `gorm:"type:varchar(50);not null" json:"type"`
	Status        SuggestionStatus `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
	Title         string           `gorm:"not null" json:"title"`
	Description   string           `gorm:"type:text" json:"description"`
	OriginalYAML  string           `gorm:"type:text" json:"original_yaml"`
	SuggestedYAML string           `gorm:"type:text" json:"suggested_yaml"`
	DiffPatch     string           `gorm:"type:text" json:"diff_patch,omitempty"`
	Confidence    float64          `gorm:"type:decimal(5,4)" json:"confidence"` // 0.0 to 1.0
	Reasoning     string           `gorm:"type:text" json:"reasoning"`
	AppliedAt     *time.Time       `json:"applied_at,omitempty"`
	CreatedAt     time.Time        `json:"created_at"`
	UpdatedAt     time.Time        `json:"updated_at"`
}

// TableName specifies the table name with schema
func (Suggestion) TableName() string {
	return "ai.suggestions"
}

// ImportSourceType represents the source type for imports
type ImportSourceType string

const (
	ImportSourceOpenAPI  ImportSourceType = "openapi"
	ImportSourcePostman  ImportSourceType = "postman"
	ImportSourcePact     ImportSourceType = "pact"
	ImportSourceSwagger  ImportSourceType = "swagger"
	ImportSourceGraphQL  ImportSourceType = "graphql"
)

// ImportStatus represents the status of an import
type ImportStatus string

const (
	ImportStatusPending    ImportStatus = "pending"
	ImportStatusProcessing ImportStatus = "processing"
	ImportStatusCompleted  ImportStatus = "completed"
	ImportStatusFailed     ImportStatus = "failed"
)

// ImportHistory stores API spec import history
type ImportHistory struct {
	ID             uuid.UUID        `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	SourceType     ImportSourceType `gorm:"type:varchar(50);not null" json:"source_type"`
	SourceName     string           `gorm:"not null" json:"source_name"`
	SourceContent  string           `gorm:"type:text" json:"source_content,omitempty"`
	SourceURL      string           `json:"source_url,omitempty"`
	Status         ImportStatus     `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
	FlowsGenerated int              `json:"flows_generated"`
	FlowIDs        StringArray      `gorm:"type:text[]" json:"flow_ids"`
	Error          string           `json:"error,omitempty"`
	Metadata       ImportMeta       `gorm:"type:jsonb" json:"metadata"`
	CreatedAt      time.Time        `json:"created_at"`
	UpdatedAt      time.Time        `json:"updated_at"`
}

// TableName specifies the table name with schema
func (ImportHistory) TableName() string {
	return "ai.import_history"
}

// ImportMeta holds additional metadata for imports
type ImportMeta struct {
	Version       string   `json:"version,omitempty"`
	Title         string   `json:"title,omitempty"`
	Description   string   `json:"description,omitempty"`
	EndpointCount int      `json:"endpoint_count,omitempty"`
	Tags          []string `json:"tags,omitempty"`
	Servers       []string `json:"servers,omitempty"`
}

// Scan implements sql.Scanner interface for JSONB
func (m *ImportMeta) Scan(value interface{}) error {
	if value == nil {
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, m)
}

// Value implements driver.Valuer interface for JSONB
func (m ImportMeta) Value() (driver.Value, error) {
	return json.Marshal(m)
}

// CoverageStatus represents the status of coverage analysis
type CoverageStatus string

const (
	CoverageStatusPending   CoverageStatus = "pending"
	CoverageStatusAnalyzing CoverageStatus = "analyzing"
	CoverageStatusCompleted CoverageStatus = "completed"
	CoverageStatusFailed    CoverageStatus = "failed"
)

// CoverageAnalysis stores API coverage analysis results
type CoverageAnalysis struct {
	ID              uuid.UUID        `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	SpecType        ImportSourceType `gorm:"type:varchar(50);not null" json:"spec_type"`
	SpecName        string           `gorm:"not null" json:"spec_name"`
	SpecContent     string           `gorm:"type:text" json:"spec_content,omitempty"`
	SpecURL         string           `json:"spec_url,omitempty"`
	Status          CoverageStatus   `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
	TotalEndpoints  int              `json:"total_endpoints"`
	CoveredEndpoints int             `json:"covered_endpoints"`
	CoveragePercent float64          `gorm:"type:decimal(5,2)" json:"coverage_percent"`
	Results         CoverageResults  `gorm:"type:jsonb" json:"results"`
	Error           string           `json:"error,omitempty"`
	CreatedAt       time.Time        `json:"created_at"`
	UpdatedAt       time.Time        `json:"updated_at"`
}

// TableName specifies the table name with schema
func (CoverageAnalysis) TableName() string {
	return "ai.coverage_analysis"
}

// CoverageResults holds detailed coverage analysis results
type CoverageResults struct {
	Covered   []EndpointCoverage `json:"covered"`
	Uncovered []EndpointCoverage `json:"uncovered"`
	Partial   []EndpointCoverage `json:"partial"`
}

// EndpointCoverage represents coverage for a single endpoint
type EndpointCoverage struct {
	Method      string   `json:"method"`
	Path        string   `json:"path"`
	OperationID string   `json:"operation_id,omitempty"`
	Description string   `json:"description,omitempty"`
	FlowIDs     []string `json:"flow_ids,omitempty"`
	Coverage    float64  `json:"coverage"` // 0.0 to 1.0
	MissingTests []string `json:"missing_tests,omitempty"`
}

// Scan implements sql.Scanner interface for JSONB
func (r *CoverageResults) Scan(value interface{}) error {
	if value == nil {
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, r)
}

// Value implements driver.Valuer interface for JSONB
func (r CoverageResults) Value() (driver.Value, error) {
	return json.Marshal(r)
}

// AIUsageStats tracks AI usage for billing/monitoring
type AIUsageStats struct {
	ID             uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Provider       AIProviderType `gorm:"type:varchar(50);not null" json:"provider"`
	Model          string         `gorm:"not null" json:"model"`
	Date           time.Time      `gorm:"type:date;not null" json:"date"`
	TotalRequests  int            `json:"total_requests"`
	TotalTokens    int            `json:"total_tokens"`
	SuccessCount   int            `json:"success_count"`
	FailureCount   int            `json:"failure_count"`
	AvgLatencyMs   int64          `json:"avg_latency_ms"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
}

// TableName specifies the table name with schema
func (AIUsageStats) TableName() string {
	return "ai.usage_stats"
}
