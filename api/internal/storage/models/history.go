package models

import (
	"database/sql/driver"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// RequestHistory stores a record of HTTP requests made through the request builder
type RequestHistory struct {
	ID           uuid.UUID         `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	FlowID       *uuid.UUID        `gorm:"type:uuid;index" json:"flow_id,omitempty"` // Optional flow association
	CollectionID *uuid.UUID        `gorm:"type:uuid;index" json:"collection_id,omitempty"` // Optional collection association
	Method       string            `gorm:"not null" json:"method"`
	URL          string            `gorm:"not null;index" json:"url"`
	Request      RequestHistoryData `gorm:"type:jsonb;not null" json:"request"`
	Response     ResponseHistoryData `gorm:"type:jsonb" json:"response"`
	StatusCode   int               `json:"status_code"`
	DurationMs   int64             `json:"duration_ms"`
	SizeBytes    int64             `json:"size_bytes"`
	Error        string            `json:"error,omitempty"`
	Tags         StringArray       `gorm:"type:text[]" json:"tags"`
	SavedAt      *time.Time        `json:"saved_at,omitempty"` // Non-nil if user saved it
	CreatedAt    time.Time         `json:"created_at"`
}

// TableName specifies the table name
func (RequestHistory) TableName() string {
	return "flows.request_history"
}

// BeforeCreate sets UUID before insert
func (r *RequestHistory) BeforeCreate(tx *gorm.DB) error {
	if r.ID == uuid.Nil {
		r.ID = uuid.New()
	}
	return nil
}

// RequestHistoryData stores the request details
type RequestHistoryData struct {
	Method      string                 `json:"method"`
	URL         string                 `json:"url"`
	Headers     map[string]string      `json:"headers,omitempty"`
	QueryParams map[string]string      `json:"query_params,omitempty"`
	Body        string                 `json:"body,omitempty"`
	BodyType    string                 `json:"body_type,omitempty"` // json, form, raw, etc.
	Auth        *RequestHistoryAuth    `json:"auth,omitempty"`
}

// Scan implements sql.Scanner for JSONB
func (r *RequestHistoryData) Scan(value interface{}) error {
	if value == nil {
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, r)
}

// Value implements driver.Valuer for JSONB
func (r RequestHistoryData) Value() (driver.Value, error) {
	return json.Marshal(r)
}

// RequestHistoryAuth stores auth configuration
type RequestHistoryAuth struct {
	Type   string `json:"type"` // none, basic, bearer, api_key
	Prefix string `json:"prefix,omitempty"` // For bearer token
	Key    string `json:"key,omitempty"`    // For API key
	In     string `json:"in,omitempty"`     // header or query for API key
}

// ResponseHistoryData stores the response details
type ResponseHistoryData struct {
	StatusCode int               `json:"status_code"`
	StatusText string            `json:"status_text"`
	Headers    map[string]string `json:"headers,omitempty"`
	Body       string            `json:"body,omitempty"`
	BodyText   string            `json:"body_text,omitempty"` // Raw text version
	SizeBytes  int64             `json:"size_bytes"`
	TimeMs     int64             `json:"time_ms"`
	Cookies    map[string]string `json:"cookies,omitempty"`
}

// Scan implements sql.Scanner for JSONB
func (r *ResponseHistoryData) Scan(value interface{}) error {
	if value == nil {
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, r)
}

// Value implements driver.Valuer for JSONB
func (r ResponseHistoryData) Value() (driver.Value, error) {
	return json.Marshal(r)
}

// HistoryFilter represents filters for request history queries
type HistoryFilter struct {
	Method       string
	URL          string
	StatusCode   *int
	FlowID       *uuid.UUID
	CollectionID *uuid.UUID
	SavedOnly    bool
	StartDate    *time.Time
	EndDate      *time.Time
	Tags         []string
}
