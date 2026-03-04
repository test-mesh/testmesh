package models

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Workspace represents a workspace for organizing resources
type Workspace struct {
	ID          uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	Name        string         `gorm:"not null;index" json:"name"`
	Slug        string         `gorm:"uniqueIndex;not null" json:"slug"`
	Description string         `json:"description,omitempty"`
	Type        WorkspaceType  `gorm:"type:varchar(20);not null;default:'personal'" json:"type"`
	OwnerID     uuid.UUID      `gorm:"type:uuid;index" json:"owner_id"`
	Settings    WorkspaceSettings `gorm:"type:jsonb;default:'{}'" json:"settings"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`

	// Relations
	Members []WorkspaceMember `gorm:"foreignKey:WorkspaceID" json:"members,omitempty"`
}

// WorkspaceType represents the type of workspace
type WorkspaceType string

const (
	WorkspaceTypePersonal WorkspaceType = "personal"
	WorkspaceTypeTeam     WorkspaceType = "team"
)

// WorkspaceSettings holds configurable settings for a workspace
type WorkspaceSettings struct {
	DefaultEnvironment string            `json:"default_environment,omitempty"`
	Variables          map[string]string `json:"variables,omitempty"`
	AllowPublicSharing bool              `json:"allow_public_sharing,omitempty"`
	RequireApproval    bool              `json:"require_approval,omitempty"`
}

// Scan implements the sql.Scanner interface for WorkspaceSettings
func (ws *WorkspaceSettings) Scan(value interface{}) error {
	if value == nil {
		*ws = WorkspaceSettings{}
		return nil
	}

	var bytes []byte
	switch v := value.(type) {
	case []byte:
		bytes = v
	case string:
		bytes = []byte(v)
	default:
		return errors.New("failed to scan WorkspaceSettings: unsupported type")
	}

	return json.Unmarshal(bytes, ws)
}

// Value implements the driver.Valuer interface for WorkspaceSettings
func (ws WorkspaceSettings) Value() (driver.Value, error) {
	return json.Marshal(ws)
}

// WorkspaceMember represents a user's membership in a workspace
type WorkspaceMember struct {
	ID          uuid.UUID       `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID       `gorm:"type:uuid;index;not null" json:"workspace_id"`
	UserID      uuid.UUID       `gorm:"type:uuid;index;not null" json:"user_id"`
	Email       string          `gorm:"index" json:"email"`
	Name        string          `json:"name,omitempty"`
	Role        WorkspaceRole   `gorm:"type:varchar(20);not null;default:'viewer'" json:"role"`
	InvitedBy   *uuid.UUID      `gorm:"type:uuid" json:"invited_by,omitempty"`
	InvitedAt   *time.Time      `json:"invited_at,omitempty"`
	JoinedAt    *time.Time      `json:"joined_at,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`

	// Relations
	Workspace *Workspace `gorm:"foreignKey:WorkspaceID" json:"workspace,omitempty"`
}

// WorkspaceRole represents a user's role in a workspace
type WorkspaceRole string

const (
	WorkspaceRoleOwner  WorkspaceRole = "owner"
	WorkspaceRoleAdmin  WorkspaceRole = "admin"
	WorkspaceRoleEditor WorkspaceRole = "editor"
	WorkspaceRoleViewer WorkspaceRole = "viewer"
)

// WorkspaceInvitation represents a pending invitation to join a workspace
type WorkspaceInvitation struct {
	ID          uuid.UUID       `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID       `gorm:"type:uuid;index;not null" json:"workspace_id"`
	Email       string          `gorm:"index;not null" json:"email"`
	Role        WorkspaceRole   `gorm:"type:varchar(20);not null" json:"role"`
	Token       string          `gorm:"uniqueIndex;not null" json:"-"`
	InvitedBy   uuid.UUID       `gorm:"type:uuid" json:"invited_by"`
	ExpiresAt   time.Time       `json:"expires_at"`
	CreatedAt   time.Time       `json:"created_at"`

	// Relations
	Workspace *Workspace `gorm:"foreignKey:WorkspaceID" json:"workspace,omitempty"`
}

// RolePermissions defines what each role can do
var RolePermissions = map[WorkspaceRole][]string{
	WorkspaceRoleOwner: {
		"workspace:delete",
		"workspace:settings",
		"members:manage",
		"flows:create", "flows:edit", "flows:delete", "flows:run", "flows:view",
		"collections:create", "collections:edit", "collections:delete", "collections:view",
		"mocks:create", "mocks:edit", "mocks:delete", "mocks:view",
		"contracts:create", "contracts:edit", "contracts:delete", "contracts:view",
	},
	WorkspaceRoleAdmin: {
		"workspace:settings",
		"members:manage",
		"flows:create", "flows:edit", "flows:delete", "flows:run", "flows:view",
		"collections:create", "collections:edit", "collections:delete", "collections:view",
		"mocks:create", "mocks:edit", "mocks:delete", "mocks:view",
		"contracts:create", "contracts:edit", "contracts:delete", "contracts:view",
	},
	WorkspaceRoleEditor: {
		"flows:create", "flows:edit", "flows:run", "flows:view",
		"collections:create", "collections:edit", "collections:view",
		"mocks:create", "mocks:edit", "mocks:view",
		"contracts:create", "contracts:edit", "contracts:view",
	},
	WorkspaceRoleViewer: {
		"flows:view", "flows:run",
		"collections:view",
		"mocks:view",
		"contracts:view",
	},
}

// HasPermission checks if a role has a specific permission
func HasPermission(role WorkspaceRole, permission string) bool {
	permissions, ok := RolePermissions[role]
	if !ok {
		return false
	}

	for _, p := range permissions {
		if p == permission {
			return true
		}
	}
	return false
}

// TableName specifies the table name for Workspace
func (Workspace) TableName() string {
	return "workspaces"
}

// TableName specifies the table name for WorkspaceMember
func (WorkspaceMember) TableName() string {
	return "workspace_members"
}

// TableName specifies the table name for WorkspaceInvitation
func (WorkspaceInvitation) TableName() string {
	return "workspace_invitations"
}
