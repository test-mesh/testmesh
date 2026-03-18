package models

import (
	"database/sql/driver"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// RoutingPolicy defines sandbox/canary routing rules applied to an execution.
//
// Headers: injected into every http_request step (step-level headers take precedence).
// Services: logical name → connection string/URL; accessible as ${service.<name>} in all
//   action configs, not just HTTP (covers databases, Kafka brokers, Redis hosts, etc.).
// Overrides: per-action-type config overrides merged into every step of that type.
//   Keys are action type names (e.g. "database_query", "kafka_producer").
//   Values are partial config maps merged before the step's own config (step wins on conflict).
//   Example: {"database_query": {"connection_string": "${service.postgres}"}}
type RoutingPolicy struct {
	Headers   map[string]string            `json:"headers,omitempty"`   // HTTP header injection
	Services  map[string]string            `json:"services,omitempty"`  // ${service.<name>} variables
	Overrides map[string]map[string]string `json:"overrides,omitempty"` // per-action-type config defaults
}

// Scan implements sql.Scanner for JSONB
func (r *RoutingPolicy) Scan(value interface{}) error {
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
func (r RoutingPolicy) Value() (driver.Value, error) {
	return json.Marshal(r)
}

// Environment represents a named environment with variables
type Environment struct {
	ID          uuid.UUID            `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID            `gorm:"type:uuid;index;not null" json:"workspace_id"`
	Name        string               `gorm:"not null;index" json:"name"`
	Description string               `json:"description"`
	Color       string               `json:"color"`      // Hex color for UI display
	IsDefault   bool                 `gorm:"default:false" json:"is_default"`
	Variables   EnvironmentVariables `gorm:"type:jsonb;default:'[]'" json:"variables"`
	Routing     RoutingPolicy        `gorm:"type:jsonb;default:'{}'" json:"routing"`
	CreatedAt   time.Time            `json:"created_at"`
	UpdatedAt   time.Time            `json:"updated_at"`
	DeletedAt   gorm.DeletedAt       `gorm:"index" json:"-"`
}

// TableName specifies the table name
func (Environment) TableName() string {
	return "flows.environments"
}

// EnvironmentVariable represents a single variable in an environment
type EnvironmentVariable struct {
	Key         string `json:"key"`
	Value       string `json:"value"`
	Description string `json:"description,omitempty"`
	IsSecret    bool   `json:"is_secret"`    // Mask value in UI
	Enabled     bool   `json:"enabled"`      // Can be toggled off without deleting
}

// EnvironmentVariables is a slice of variables with JSON serialization
type EnvironmentVariables []EnvironmentVariable

// Scan implements sql.Scanner interface for JSONB
func (ev *EnvironmentVariables) Scan(value interface{}) error {
	if value == nil {
		*ev = EnvironmentVariables{}
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, ev)
}

// Value implements driver.Valuer interface for JSONB
func (ev EnvironmentVariables) Value() (driver.Value, error) {
	return json.Marshal(ev)
}

// ToMap converts variables to a map for interpolation
func (ev EnvironmentVariables) ToMap() map[string]string {
	result := make(map[string]string)
	for _, v := range ev {
		if v.Enabled {
			result[v.Key] = v.Value
		}
	}
	return result
}

// EnvironmentExport represents an environment for export (secrets masked)
type EnvironmentExport struct {
	Name        string                `json:"name"`
	Description string                `json:"description"`
	Variables   []EnvironmentVariable `json:"variables"`
	Routing     RoutingPolicy         `json:"routing"`
}

// Export creates an export-safe copy with secrets masked
func (e *Environment) Export(includeSecrets bool) EnvironmentExport {
	vars := make([]EnvironmentVariable, len(e.Variables))
	for i, v := range e.Variables {
		vars[i] = v
		if v.IsSecret && !includeSecrets {
			vars[i].Value = "********"
		}
	}
	return EnvironmentExport{
		Name:        e.Name,
		Description: e.Description,
		Variables:   vars,
		Routing:     e.Routing,
	}
}
