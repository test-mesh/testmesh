package models

import (
	"database/sql/driver"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Environment represents a named environment with variables
type Environment struct {
	ID          uuid.UUID            `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID            `gorm:"type:uuid;index;not null" json:"workspace_id"`
	Name        string               `gorm:"not null;index" json:"name"`
	Description string               `json:"description"`
	Color       string               `json:"color"`      // Hex color for UI display
	IsDefault   bool                 `gorm:"default:false" json:"is_default"`
	Variables   EnvironmentVariables `gorm:"type:jsonb;default:'[]'" json:"variables"`
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
	Name        string               `json:"name"`
	Description string               `json:"description"`
	Variables   []EnvironmentVariable `json:"variables"`
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
	}
}
