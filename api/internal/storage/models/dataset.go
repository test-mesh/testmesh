package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Dataset represents a stored data file (CSV/JSON) used for data-driven testing.
type Dataset struct {
	ID          uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID      `gorm:"type:uuid;index;not null" json:"workspace_id"`
	Name        string         `gorm:"not null" json:"name"`
	Description string         `json:"description,omitempty"`
	FileName    string         `gorm:"not null" json:"file_name"`
	FileType    string         `gorm:"not null" json:"file_type"` // "csv" or "json"
	MimeType    string         `json:"mime_type"`
	SizeBytes   int64          `json:"size_bytes"`
	RowCount    int            `json:"row_count"`
	Columns     StringArray    `gorm:"type:text[]" json:"columns"`
	S3Key       string         `gorm:"not null" json:"-"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

func (Dataset) TableName() string {
	return "storage.datasets"
}
