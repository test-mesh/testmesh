package models

import (
	"database/sql/driver"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// DailyMetric stores aggregated metrics for a specific date
type DailyMetric struct {
	ID             uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Date           time.Time `gorm:"type:date;not null;uniqueIndex:idx_daily_metrics_date_env" json:"date"`
	Environment    string    `gorm:"not null;uniqueIndex:idx_daily_metrics_date_env" json:"environment"`
	TotalFlows     int       `json:"total_flows"`
	TotalExecs     int       `json:"total_executions"`
	PassedExecs    int       `json:"passed_executions"`
	FailedExecs    int       `json:"failed_executions"`
	PassRate       float64   `gorm:"type:decimal(5,2)" json:"pass_rate"`
	AvgDurationMs  int64     `json:"avg_duration_ms"`
	P50DurationMs  int64     `json:"p50_duration_ms"`
	P95DurationMs  int64     `json:"p95_duration_ms"`
	P99DurationMs  int64     `json:"p99_duration_ms"`
	TotalSteps     int       `json:"total_steps"`
	PassedSteps    int       `json:"passed_steps"`
	FailedSteps    int       `json:"failed_steps"`
	ByFlowMetrics  FlowMetricsMap  `gorm:"type:jsonb" json:"by_flow_metrics,omitempty"`
	BySuiteMetrics SuiteMetricsMap `gorm:"type:jsonb" json:"by_suite_metrics,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

// TableName specifies the table name with schema
func (DailyMetric) TableName() string {
	return "reporting.daily_metrics"
}

// FlowMetricsMap holds per-flow metrics
type FlowMetricsMap map[string]FlowMetricEntry

// FlowMetricEntry is a single flow's daily metrics
type FlowMetricEntry struct {
	FlowID        string  `json:"flow_id"`
	FlowName      string  `json:"flow_name"`
	Executions    int     `json:"executions"`
	Passed        int     `json:"passed"`
	Failed        int     `json:"failed"`
	PassRate      float64 `json:"pass_rate"`
	AvgDurationMs int64   `json:"avg_duration_ms"`
}

// Scan implements sql.Scanner interface for JSONB
func (m *FlowMetricsMap) Scan(value interface{}) error {
	if value == nil {
		*m = make(FlowMetricsMap)
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, m)
}

// Value implements driver.Valuer interface for JSONB
func (m FlowMetricsMap) Value() (driver.Value, error) {
	return json.Marshal(m)
}

// SuiteMetricsMap holds per-suite metrics
type SuiteMetricsMap map[string]SuiteMetricEntry

// SuiteMetricEntry is a single suite's daily metrics
type SuiteMetricEntry struct {
	Suite         string  `json:"suite"`
	Flows         int     `json:"flows"`
	Executions    int     `json:"executions"`
	Passed        int     `json:"passed"`
	Failed        int     `json:"failed"`
	PassRate      float64 `json:"pass_rate"`
	AvgDurationMs int64   `json:"avg_duration_ms"`
}

// Scan implements sql.Scanner interface for JSONB
func (m *SuiteMetricsMap) Scan(value interface{}) error {
	if value == nil {
		*m = make(SuiteMetricsMap)
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, m)
}

// Value implements driver.Valuer interface for JSONB
func (m SuiteMetricsMap) Value() (driver.Value, error) {
	return json.Marshal(m)
}

// FlakinessMetric tracks flakiness data for a flow over time
type FlakinessMetric struct {
	ID              uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	FlowID          uuid.UUID `gorm:"type:uuid;not null;index" json:"flow_id"`
	Flow            *Flow     `gorm:"foreignKey:FlowID" json:"flow,omitempty"`
	WindowStartDate time.Time `gorm:"type:date;not null" json:"window_start_date"`
	WindowEndDate   time.Time `gorm:"type:date;not null" json:"window_end_date"`
	WindowDays      int       `json:"window_days"`
	TotalExecs      int       `json:"total_executions"`
	PassedExecs     int       `json:"passed_executions"`
	FailedExecs     int       `json:"failed_executions"`
	Transitions     int       `json:"transitions"` // Number of pass->fail or fail->pass transitions
	FlakinessScore  float64   `gorm:"type:decimal(5,4)" json:"flakiness_score"` // 0.0 to 1.0
	IsFlaky         bool      `gorm:"default:false" json:"is_flaky"`
	FailurePatterns StringArray `gorm:"type:text[]" json:"failure_patterns,omitempty"`
	CreatedAt       time.Time   `json:"created_at"`
	UpdatedAt       time.Time   `json:"updated_at"`
}

// TableName specifies the table name with schema
func (FlakinessMetric) TableName() string {
	return "reporting.flakiness_metrics"
}

// ReportStatus represents the status of a report
type ReportStatus string

const (
	ReportStatusPending   ReportStatus = "pending"
	ReportStatusGenerating ReportStatus = "generating"
	ReportStatusCompleted ReportStatus = "completed"
	ReportStatusFailed    ReportStatus = "failed"
)

// ReportFormat represents the format of a report
type ReportFormat string

const (
	ReportFormatHTML  ReportFormat = "html"
	ReportFormatJSON  ReportFormat = "json"
	ReportFormatJUnit ReportFormat = "junit"
)

// Report stores generated reports
type Report struct {
	ID           uuid.UUID     `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Name         string        `gorm:"not null" json:"name"`
	Format       ReportFormat  `gorm:"type:varchar(20);not null" json:"format"`
	Status       ReportStatus  `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
	Filters      ReportFilters `gorm:"type:jsonb" json:"filters"`
	StartDate    time.Time     `gorm:"type:date" json:"start_date"`
	EndDate      time.Time     `gorm:"type:date" json:"end_date"`
	FilePath     string        `json:"file_path,omitempty"`
	FileSize     int64         `json:"file_size"`
	GeneratedAt  *time.Time    `json:"generated_at,omitempty"`
	ExpiresAt    *time.Time    `json:"expires_at,omitempty"`
	Error        string        `json:"error,omitempty"`
	CreatedAt    time.Time     `json:"created_at"`
	UpdatedAt    time.Time     `json:"updated_at"`
}

// TableName specifies the table name with schema
func (Report) TableName() string {
	return "reporting.reports"
}

// ReportFilters defines filtering options for reports
type ReportFilters struct {
	Suites       []string `json:"suites,omitempty"`
	FlowIDs      []string `json:"flow_ids,omitempty"`
	Tags         []string `json:"tags,omitempty"`
	Environments []string `json:"environments,omitempty"`
	Statuses     []string `json:"statuses,omitempty"`
}

// Scan implements sql.Scanner interface for JSONB
func (f *ReportFilters) Scan(value interface{}) error {
	if value == nil {
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, f)
}

// Value implements driver.Valuer interface for JSONB
func (f ReportFilters) Value() (driver.Value, error) {
	return json.Marshal(f)
}

// StepPerformance tracks individual step performance metrics
type StepPerformance struct {
	ID            uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	FlowID        uuid.UUID `gorm:"type:uuid;not null;index" json:"flow_id"`
	Flow          *Flow     `gorm:"foreignKey:FlowID" json:"flow,omitempty"`
	StepID        string    `gorm:"not null;index" json:"step_id"`
	StepName      string    `json:"step_name"`
	Action        string    `gorm:"not null" json:"action"`
	Date          time.Time `gorm:"type:date;not null" json:"date"`
	ExecutionCount int      `json:"execution_count"`
	PassedCount   int       `json:"passed_count"`
	FailedCount   int       `json:"failed_count"`
	PassRate      float64   `gorm:"type:decimal(5,2)" json:"pass_rate"`
	AvgDurationMs int64     `json:"avg_duration_ms"`
	MinDurationMs int64     `json:"min_duration_ms"`
	MaxDurationMs int64     `json:"max_duration_ms"`
	P50DurationMs int64     `json:"p50_duration_ms"`
	P95DurationMs int64     `json:"p95_duration_ms"`
	P99DurationMs int64     `json:"p99_duration_ms"`
	CommonErrors  StringArray `gorm:"type:text[]" json:"common_errors,omitempty"`
	CreatedAt     time.Time   `json:"created_at"`
	UpdatedAt     time.Time   `json:"updated_at"`
}

// TableName specifies the table name with schema
func (StepPerformance) TableName() string {
	return "reporting.step_performance"
}
