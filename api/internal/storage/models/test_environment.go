package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// TestEnvState represents the lifecycle state of a test environment.
type TestEnvState string

const (
	TestEnvCold         TestEnvState = "cold"
	TestEnvProvisioning TestEnvState = "provisioning"
	TestEnvWarm         TestEnvState = "warm"
	TestEnvRunning      TestEnvState = "running"
	TestEnvCooling      TestEnvState = "cooling"
	TestEnvDestroyed    TestEnvState = "destroyed"
)

// GitOpsProviderType is a string (not an enum) so new providers can be added
// without changing core code.
type GitOpsProviderType string

const (
	GitOpsProviderArgoCD GitOpsProviderType = "argocd"
)

// TestEnvService describes one deployed service in a test namespace.
type TestEnvService struct {
	Name      string `json:"name"`
	Image     string `json:"image"`
	SourceRef string `json:"source_ref"`
	Repo      string `json:"repo"`
}

// TestEnvServices is a slice of TestEnvService that serialises as JSONB.
type TestEnvServices []TestEnvService

// Scan implements sql.Scanner for JSONB.
func (s *TestEnvServices) Scan(value interface{}) error {
	if value == nil {
		*s = TestEnvServices{}
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return fmt.Errorf("TestEnvServices: expected []byte, got %T", value)
	}
	return json.Unmarshal(bytes, s)
}

// Value implements driver.Valuer for JSONB.
func (s TestEnvServices) Value() (driver.Value, error) {
	return json.Marshal(s)
}

// TestEnvRoutingPolicy is a map of service name → URL that serialises as JSONB.
type TestEnvRoutingPolicy map[string]string

// Scan implements sql.Scanner for JSONB.
func (r *TestEnvRoutingPolicy) Scan(value interface{}) error {
	if value == nil {
		*r = TestEnvRoutingPolicy{}
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return fmt.Errorf("TestEnvRoutingPolicy: expected []byte, got %T", value)
	}
	return json.Unmarshal(bytes, r)
}

// Value implements driver.Valuer for JSONB.
func (r TestEnvRoutingPolicy) Value() (driver.Value, error) {
	return json.Marshal(r)
}

// TestEnvironment tracks the lifecycle of an isolated Kubernetes namespace
// used for test execution. Environments are reused within their TTL.
type TestEnvironment struct {
	ID          uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID `gorm:"type:uuid;not null;index"                        json:"workspace_id"`
	Name        string    `gorm:"not null"                                        json:"name"`
	// Context is the reuse key — e.g. "pr-123", "nightly", "branch-main"
	Context         string             `gorm:"index"           json:"context"`
	Namespace       string             `json:"namespace"`
	Provider        GitOpsProviderType `gorm:"not null"        json:"provider"`
	ProviderAppName string             `json:"provider_app_name"`
	State           TestEnvState       `gorm:"not null;default:'cold'" json:"state"`
	TTLMinutes      int                `gorm:"default:120"     json:"ttl_minutes"`
	LastUsedAt      *time.Time         `json:"last_used_at"`
	// Services: JSON array of TestEnvService — which services are deployed here
	Services TestEnvServices `gorm:"type:jsonb" json:"services"`
	// RoutingPolicy: JSON map of service name → URL
	RoutingPolicy TestEnvRoutingPolicy `gorm:"type:jsonb" json:"routing_policy"`
	CreatedAt     time.Time            `json:"created_at"`
	UpdatedAt     time.Time            `json:"updated_at"`
}

func (TestEnvironment) TableName() string { return "test_environments" }
