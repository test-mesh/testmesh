package models

import (
	"database/sql/driver"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Collection represents a group of flows organized together
type Collection struct {
	ID          uuid.UUID           `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID           `gorm:"type:uuid;index;not null" json:"workspace_id"`
	Name        string              `gorm:"not null;index" json:"name"`
	Description string              `json:"description"`
	Icon        string              `json:"icon"`              // Emoji or icon identifier
	Color       string              `json:"color"`             // Hex color code
	ParentID    *uuid.UUID          `gorm:"type:uuid;index" json:"parent_id"` // For nested collections/folders
	SortOrder   int                 `gorm:"default:0" json:"sort_order"`
	Variables   CollectionVariables `gorm:"type:jsonb" json:"variables"` // Collection-level variables
	Auth        CollectionAuth      `gorm:"type:jsonb" json:"auth"`      // Collection-level auth settings
	CreatedAt   time.Time           `json:"created_at"`
	UpdatedAt   time.Time           `json:"updated_at"`
	DeletedAt   gorm.DeletedAt      `gorm:"index" json:"-"`

	// Relationships
	Flows    []Flow       `gorm:"foreignKey:CollectionID" json:"flows,omitempty"`
	Children []Collection `gorm:"foreignKey:ParentID" json:"children,omitempty"`
}

// TableName specifies the table name
func (Collection) TableName() string {
	return "flows.collections"
}

// CollectionVariables holds variables defined at the collection level
type CollectionVariables struct {
	Environment map[string]interface{} `json:"environment,omitempty"` // Environment-specific vars
	Global      map[string]interface{} `json:"global,omitempty"`      // Always-available vars
}

// Scan implements sql.Scanner interface for JSONB
func (cv *CollectionVariables) Scan(value interface{}) error {
	if value == nil {
		*cv = CollectionVariables{}
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, cv)
}

// Value implements driver.Valuer interface for JSONB
func (cv CollectionVariables) Value() (driver.Value, error) {
	return json.Marshal(cv)
}

// CollectionAuth holds auth settings defined at the collection level
type CollectionAuth struct {
	Type        string                 `json:"type"`                   // none, basic, bearer, api_key, oauth2
	Inherit     bool                   `json:"inherit"`                // Inherit from parent collection
	Basic       *CollectionBasicAuth   `json:"basic,omitempty"`
	Bearer      *CollectionBearerAuth  `json:"bearer,omitempty"`
	APIKey      *CollectionAPIKeyAuth  `json:"api_key,omitempty"`
	OAuth2      *CollectionOAuth2Auth  `json:"oauth2,omitempty"`
}

// CollectionBasicAuth holds basic auth credentials
type CollectionBasicAuth struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// CollectionBearerAuth holds bearer token settings
type CollectionBearerAuth struct {
	Token  string `json:"token"`
	Prefix string `json:"prefix"` // Default: "Bearer"
}

// CollectionAPIKeyAuth holds API key settings
type CollectionAPIKeyAuth struct {
	Key   string `json:"key"`
	Value string `json:"value"`
	In    string `json:"in"` // "header" or "query"
}

// CollectionOAuth2Auth holds OAuth2 settings
type CollectionOAuth2Auth struct {
	GrantType    string `json:"grant_type"` // authorization_code, client_credentials, password, implicit
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret,omitempty"`
	AuthURL      string `json:"auth_url,omitempty"`
	TokenURL     string `json:"token_url,omitempty"`
	RedirectURI  string `json:"redirect_uri,omitempty"`
	Scope        string `json:"scope,omitempty"`
	AccessToken  string `json:"access_token,omitempty"`
	RefreshToken string `json:"refresh_token,omitempty"`
	TokenExpiry  string `json:"token_expiry,omitempty"`
}

// Scan implements sql.Scanner interface for JSONB
func (ca *CollectionAuth) Scan(value interface{}) error {
	if value == nil {
		*ca = CollectionAuth{Type: "none"}
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, ca)
}

// Value implements driver.Valuer interface for JSONB
func (ca CollectionAuth) Value() (driver.Value, error) {
	return json.Marshal(ca)
}

// CollectionItem represents a flow's membership in a collection
type CollectionItem struct {
	ID           uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	CollectionID uuid.UUID `gorm:"type:uuid;not null;index" json:"collection_id"`
	FlowID       uuid.UUID `gorm:"type:uuid;not null;index" json:"flow_id"`
	SortOrder    int       `gorm:"default:0" json:"sort_order"`
	CreatedAt    time.Time `json:"created_at"`

	// Relationships
	Collection Collection `gorm:"foreignKey:CollectionID" json:"collection,omitempty"`
	Flow       Flow       `gorm:"foreignKey:FlowID" json:"flow,omitempty"`
}

// TableName specifies the table name
func (CollectionItem) TableName() string {
	return "flows.collection_items"
}

// CollectionTreeNode represents a node in the collection tree (for API responses)
type CollectionTreeNode struct {
	ID          uuid.UUID            `json:"id"`
	Name        string               `json:"name"`
	Description string               `json:"description"`
	Icon        string               `json:"icon"`
	Color       string               `json:"color"`
	Type        string               `json:"type"` // "collection" or "flow"
	SortOrder   int                  `json:"sort_order"`
	Children    []CollectionTreeNode `json:"children,omitempty"`
	FlowID      *uuid.UUID           `json:"flow_id,omitempty"` // Only for type="flow"
}
