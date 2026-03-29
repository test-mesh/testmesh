package telemetry

import (
	"time"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/graph"
)

// Span represents a single OpenTelemetry span stored in PostgreSQL.
type Span struct {
	ID              uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID     uuid.UUID  `gorm:"type:uuid;not null;index" json:"workspace_id"`
	TraceID         string     `gorm:"size:32;not null;index" json:"trace_id"`
	SpanID          string     `gorm:"size:16;not null" json:"span_id"`
	ParentSpanID    string     `gorm:"size:16" json:"parent_span_id,omitempty"`
	Service         string     `gorm:"not null" json:"service"`
	Operation       string     `gorm:"not null" json:"operation"`
	Kind            string     `gorm:"size:20" json:"kind"` // client, server, producer, consumer, internal
	StatusCode      string     `gorm:"size:20;default:'ok'" json:"status_code"`
	StatusMessage   string     `json:"status_message,omitempty"`
	StartTime       time.Time  `gorm:"not null" json:"start_time"`
	EndTime         time.Time  `gorm:"not null" json:"end_time"`
	DurationMs      int64      `json:"duration_ms"`
	Attributes      graph.JSONMap `gorm:"type:jsonb;default:'{}'" json:"attributes"`
	ResourceAttrs   graph.JSONMap `gorm:"type:jsonb;default:'{}'" json:"resource_attrs"`
	Events          graph.JSONArray `gorm:"type:jsonb;default:'[]'" json:"events,omitempty"`
	IsTestGenerated bool       `gorm:"default:false" json:"is_test_generated"`
	CreatedAt       time.Time  `json:"created_at"`
}

func (Span) TableName() string {
	return "telemetry.spans"
}

// DiscoveredFlow represents a recurring flow pattern discovered from traces.
type DiscoveredFlow struct {
	ID              uuid.UUID    `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID     uuid.UUID    `gorm:"type:uuid;not null;index" json:"workspace_id"`
	Fingerprint     string       `gorm:"size:64;not null" json:"fingerprint"`
	Name            string       `gorm:"not null" json:"name"`
	EntryService    string       `json:"entry_service"`
	EntryOperation  string       `json:"entry_operation"`
	GraphPath       graph.JSONArray `gorm:"type:jsonb;not null" json:"graph_path"`
	OccurrenceCount int          `gorm:"default:1" json:"occurrence_count"`
	LastSeenAt      time.Time    `json:"last_seen_at"`
	AvgDurationMs   float64      `json:"avg_duration_ms"`
	P95DurationMs   float64      `json:"p95_duration_ms"`
	ErrorRate       float64      `json:"error_rate"`
	RiskScore       float64      `gorm:"default:0" json:"risk_score"`
	Drifted         bool         `gorm:"default:false" json:"drifted"`
	DriftDetails    graph.JSONMap `gorm:"type:jsonb;default:'{}'" json:"drift_details,omitempty"`
	SampleTraceID   string       `gorm:"size:32" json:"sample_trace_id,omitempty"`
	CreatedAt       time.Time    `json:"created_at"`
	UpdatedAt       time.Time    `json:"updated_at"`
}

func (DiscoveredFlow) TableName() string {
	return "telemetry.discovered_flows"
}

// TraceValidationResult stores the result of validating an execution's trace.
type TraceValidationResult struct {
	ID              uuid.UUID    `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	ExecutionID     uuid.UUID    `gorm:"type:uuid;not null;uniqueIndex" json:"execution_id"`
	WorkspaceID     uuid.UUID    `gorm:"type:uuid;not null;index" json:"workspace_id"`
	TraceID         string       `gorm:"size:32;not null" json:"trace_id"`
	Status          string       `gorm:"size:20;not null;default:'pending'" json:"status"` // passed, failed, partial
	PathMatch       bool         `json:"path_match"`
	MissingNodes    graph.JSONArray `gorm:"type:jsonb;default:'[]'" json:"missing_nodes"`
	UnexpectedNodes graph.JSONArray `gorm:"type:jsonb;default:'[]'" json:"unexpected_nodes"`
	OrderViolations graph.JSONArray `gorm:"type:jsonb;default:'[]'" json:"order_violations"`
	SlowSpans       graph.JSONArray `gorm:"type:jsonb;default:'[]'" json:"slow_spans"`
	ErrorSpans      graph.JSONArray `gorm:"type:jsonb;default:'[]'" json:"error_spans"`
	FailedAssertions graph.JSONArray `gorm:"type:jsonb;default:'[]'" json:"failed_assertions"`
	RootCauseDiff   graph.JSONMap  `gorm:"type:jsonb;default:'{}'" json:"root_cause_diff"`
	CreatedAt       time.Time    `json:"created_at"`
}

func (TraceValidationResult) TableName() string {
	return "telemetry.trace_validation_results"
}

// TraceSettings holds per-workspace telemetry configuration.
type TraceSettings struct {
	WorkspaceID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"workspace_id"`
	Enabled            bool      `gorm:"default:true" json:"enabled"`
	RetentionDays      int       `gorm:"default:30" json:"retention_days"`
	DefaultTimeoutMs   int64     `gorm:"default:30000" json:"default_timeout_ms"`
	AutoDiscovery      bool      `gorm:"default:true" json:"auto_discovery"`
	AutoValidation     bool      `gorm:"default:true" json:"auto_validation"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

func (TraceSettings) TableName() string {
	return "telemetry.trace_settings"
}

// GraphPathNode represents a single node in a discovered flow's graph path.
type GraphPathNode struct {
	Type       string `json:"type"`       // service, api_endpoint, database, topic, etc.
	Identifier string `json:"identifier"` // service name, endpoint path, etc.
	Service    string `json:"service,omitempty"`
}

// SpanFilter is used to query spans with optional filters.
type SpanFilter struct {
	WorkspaceID     uuid.UUID `json:"workspace_id"`
	TraceID         string    `json:"trace_id,omitempty"`
	Service         string    `json:"service,omitempty"`
	Operation       string    `json:"operation,omitempty"`
	StatusCode      string    `json:"status_code,omitempty"`
	IsTestGenerated *bool     `json:"is_test_generated,omitempty"`
	Since           *time.Time `json:"since,omitempty"`
	Until           *time.Time `json:"until,omitempty"`
	Limit           int       `json:"limit,omitempty"`
	Offset          int       `json:"offset,omitempty"`
}
