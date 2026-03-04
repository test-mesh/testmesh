package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Flow represents a test flow definition
type Flow struct {
	ID           uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID  uuid.UUID      `gorm:"type:uuid;index;not null" json:"workspace_id"`
	Name         string         `gorm:"not null;index" json:"name"`
	Description  string         `json:"description"`
	Suite        string         `gorm:"index" json:"suite"`
	Tags         StringArray    `gorm:"type:text[]" json:"tags"`
	Definition   FlowDefinition `gorm:"type:jsonb;not null" json:"definition"`
	Environment  string         `gorm:"default:'default'" json:"environment"`
	CollectionID *uuid.UUID     `gorm:"type:uuid;index" json:"collection_id,omitempty"` // Optional collection membership
	SortOrder    int            `gorm:"default:0" json:"sort_order"`                    // Order within collection
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
}

// StringArray is a custom type for PostgreSQL text arrays
type StringArray []string

// Scan implements sql.Scanner interface
func (a *StringArray) Scan(value interface{}) error {
	if value == nil {
		*a = []string{}
		return nil
	}

	// PostgreSQL driver can return different types
	switch v := value.(type) {
	case []byte:
		return a.scanBytes(v)
	case string:
		return a.scanBytes([]byte(v))
	case []interface{}:
		// Some PostgreSQL drivers return []interface{}
		result := make([]string, len(v))
		for i, item := range v {
			result[i] = fmt.Sprintf("%v", item)
		}
		*a = result
		return nil
	default:
		return fmt.Errorf("failed to scan StringArray from type %T", value)
	}
}

func (a *StringArray) scanBytes(bytes []byte) error {
	// Parse PostgreSQL array format: {value1,value2,...}
	str := string(bytes)
	if str == "{}" || str == "" {
		*a = []string{}
		return nil
	}

	// Remove braces
	if strings.HasPrefix(str, "{") && strings.HasSuffix(str, "}") {
		str = str[1 : len(str)-1]
	}

	if str == "" {
		*a = []string{}
		return nil
	}

	// Split by comma
	*a = strings.Split(str, ",")
	return nil
}

// Value implements driver.Valuer interface
func (a StringArray) Value() (driver.Value, error) {
	if len(a) == 0 {
		return "{}", nil
	}

	// Format as PostgreSQL array: {value1,value2,...}
	return fmt.Sprintf("{%s}", strings.Join(a, ",")), nil
}

// TableName specifies the table name with schema
func (Flow) TableName() string {
	return "flows.flows"
}

// FlowDefinition holds the parsed YAML flow structure
type FlowDefinition struct {
	Name        string                 `json:"name" yaml:"name"`
	Description string                 `json:"description" yaml:"description"`
	Suite       string                 `json:"suite" yaml:"suite"`
	Tags        []string               `json:"tags" yaml:"tags"`
	Env         map[string]interface{} `json:"env" yaml:"env"`
	Setup       []Step                 `json:"setup" yaml:"setup"`
	Steps       []Step                 `json:"steps" yaml:"steps"`
	Teardown    []Step                 `json:"teardown" yaml:"teardown"`
}

// Step represents a single step in a flow
type Step struct {
	ID          string                 `json:"id" yaml:"id"`
	Action      string                 `json:"action" yaml:"action"`
	Name        string                 `json:"name" yaml:"name"`
	Description string                 `json:"description" yaml:"description"`
	Config      map[string]interface{} `json:"config" yaml:"config"`
	Assert      []string               `json:"assert" yaml:"assert"`
	Output      map[string]string      `json:"output" yaml:"output"`
	Retry       *RetryConfig           `json:"retry,omitempty" yaml:"retry,omitempty"`
	Timeout     string                 `json:"timeout,omitempty" yaml:"timeout,omitempty"`
}

// RetryConfig defines retry behavior for a step
type RetryConfig struct {
	MaxAttempts int    `json:"max_attempts" yaml:"max_attempts"`
	Delay       string `json:"delay" yaml:"delay"`
	Backoff     string `json:"backoff,omitempty" yaml:"backoff,omitempty"`
}

// Scan implements sql.Scanner interface for JSONB
func (fd *FlowDefinition) Scan(value interface{}) error {
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, fd)
}

// Value implements driver.Valuer interface for JSONB
func (fd FlowDefinition) Value() (driver.Value, error) {
	return json.Marshal(fd)
}
