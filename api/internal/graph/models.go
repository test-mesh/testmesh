package graph

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ErrGraphDisabled is returned by NoopEngine when graph features are disabled.
var ErrGraphDisabled = errors.New("graph features are disabled")

// NodeType represents the type of a graph node.
type NodeType string

const (
	NodeTypeService        NodeType = "service"
	NodeTypeAPIEndpoint    NodeType = "api_endpoint"
	NodeTypeTopic          NodeType = "topic"
	NodeTypeQueue          NodeType = "queue"
	NodeTypeDatabase       NodeType = "database"
	NodeTypeTable          NodeType = "table"
	NodeTypeExternal       NodeType = "external"
	NodeTypeGRPCMethod     NodeType = "grpc_method"
	NodeTypeWebSocket      NodeType = "websocket"
	NodeTypeRedisKeyPattern NodeType = "redis_key_pattern"
	NodeTypeJob            NodeType = "job"
	NodeTypeEnvironment    NodeType = "environment"
)

// EdgeType represents the type of a graph edge.
type EdgeType string

const (
	EdgeTypeCalls      EdgeType = "calls"
	EdgeTypePublishes  EdgeType = "publishes"
	EdgeTypeConsumes   EdgeType = "consumes"
	EdgeTypeReads      EdgeType = "reads"
	EdgeTypeWrites     EdgeType = "writes"
	EdgeTypeDependsOn  EdgeType = "depends_on"
	EdgeTypeExposes    EdgeType = "exposes"
	EdgeTypeTriggers   EdgeType = "triggers"
	EdgeTypeTestedBy   EdgeType = "tested_by"
	EdgeTypeResolvesTo EdgeType = "resolves_to"
)

// SourceLayer indicates which scanner layer produced a node or edge.
type SourceLayer string

const (
	SourceLayerCode    SourceLayer = "code"
	SourceLayerInfra   SourceLayer = "infra"
	SourceLayerSpec    SourceLayer = "spec"
	SourceLayerFlow    SourceLayer = "flow"
	SourceLayerRuntime SourceLayer = "runtime"
	SourceLayerHistory SourceLayer = "history"
)

// ConflictType categorizes merge conflicts.
type ConflictType string

const (
	ConflictTypeDuplicate      ConflictType = "duplicate"
	ConflictTypeContradiction  ConflictType = "contradiction"
	ConflictTypeMissingInLayer ConflictType = "missing_in_layer"
)

// ConflictResolution tracks how a conflict was resolved.
type ConflictResolution string

const (
	ConflictPending      ConflictResolution = "pending"
	ConflictAutoMerged   ConflictResolution = "auto_merged"
	ConflictUserResolved ConflictResolution = "user_resolved"
	ConflictDismissed    ConflictResolution = "dismissed"
)

// ScanStatus represents the state of a graph scan.
type ScanStatus string

const (
	ScanStatusPending   ScanStatus = "pending"
	ScanStatusRunning   ScanStatus = "running"
	ScanStatusCompleted ScanStatus = "completed"
	ScanStatusFailed    ScanStatus = "failed"
)

// --- GORM Models (PostgreSQL) ---

// GraphConfig stores per-workspace graph configuration.
type GraphConfig struct {
	WorkspaceID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"workspace_id"`
	EmbeddingDimension int       `gorm:"default:1536" json:"embedding_dimension"`
	EmbeddingProvider  string    `gorm:"default:'openai'" json:"embedding_provider"`
	CreatedAt          time.Time `json:"created_at"`
}

func (GraphConfig) TableName() string {
	return "graph.graph_config"
}

// GraphRepo represents a connected source code repository.
type GraphRepo struct {
	ID             uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID    uuid.UUID      `gorm:"type:uuid;index;not null" json:"workspace_id"`
	Name           string         `gorm:"not null" json:"name"`
	URL            string         `json:"url,omitempty"`
	Branch         string         `gorm:"default:'main'" json:"branch"`
	Credentials    JSONMap        `gorm:"type:jsonb" json:"-"` // Encrypted, never serialized to JSON
	ScanConfig     JSONMap        `gorm:"type:jsonb;default:'{}'" json:"scan_config"`
	LastScanAt     *time.Time     `json:"last_scan_at,omitempty"`
	LastScanStatus string         `gorm:"default:'pending'" json:"last_scan_status"`
	CreatedAt      time.Time      `json:"created_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
}

func (GraphRepo) TableName() string {
	return "graph.graph_repos"
}

// GraphNode represents a discovered entity in the system graph (PostgreSQL side).
type GraphNode struct {
	ID          uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID  `gorm:"type:uuid;index;not null" json:"workspace_id"`
	Neo4jID     string     `gorm:"not null" json:"-"`
	Type        NodeType   `gorm:"not null;index" json:"type"`
	Name        string     `gorm:"not null" json:"name"`
	Service     string     `gorm:"index" json:"service,omitempty"`
	SourceLayer SourceLayer `gorm:"not null" json:"source_layer"`
	SourceFile  string     `json:"source_file,omitempty"`
	RepoID      *uuid.UUID `gorm:"type:uuid;index" json:"repo_id,omitempty"`
	Metadata    JSONMap    `gorm:"type:jsonb;default:'{}'" json:"metadata"`
	Tags        StringArray `gorm:"type:text[]" json:"tags"`
	Confidence  float64    `gorm:"default:1.0" json:"confidence"`
	Version     int        `gorm:"default:1" json:"version"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

func (GraphNode) TableName() string {
	return "graph.graph_nodes"
}

// GraphEdge represents a relationship between two graph nodes (PostgreSQL side).
type GraphEdge struct {
	ID          uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID  `gorm:"type:uuid;index;not null" json:"workspace_id"`
	Neo4jID     string     `gorm:"not null" json:"-"`
	Type        EdgeType   `gorm:"column:type;not null" json:"type"`
	FromNodeID  uuid.UUID  `gorm:"column:from_node;type:uuid;index;not null" json:"from_node_id"`
	ToNodeID    uuid.UUID  `gorm:"column:to_node;type:uuid;index;not null" json:"to_node_id"`
	SourceLayer SourceLayer `gorm:"not null" json:"source_layer"`
	Properties  JSONMap    `gorm:"type:jsonb;default:'{}'" json:"properties"`
	Confidence  float64    `gorm:"default:1.0" json:"confidence"`
	CreatedAt   time.Time  `json:"created_at"`
}

func (GraphEdge) TableName() string {
	return "graph.graph_edges"
}

// GraphScan records a scan operation and its results.
type GraphScan struct {
	ID            uuid.UUID   `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID   uuid.UUID   `gorm:"type:uuid;index;not null" json:"workspace_id"`
	RepoID        *uuid.UUID  `gorm:"type:uuid;index" json:"repo_id,omitempty"`
	Type          string      `gorm:"not null" json:"type"` // "full" or "incremental"
	Status        ScanStatus  `gorm:"default:'running'" json:"status"`
	LayersScanned StringArray `gorm:"type:text[]" json:"layers_scanned"`
	NodesAdded    int         `gorm:"default:0" json:"nodes_added"`
	NodesUpdated  int         `gorm:"default:0" json:"nodes_updated"`
	EdgesAdded    int         `gorm:"default:0" json:"edges_added"`
	Conflicts     int         `gorm:"default:0" json:"conflicts"`
	Warnings      JSONArray   `gorm:"type:jsonb;default:'[]'" json:"warnings"`
	StartedAt     time.Time   `json:"started_at"`
	CompletedAt   *time.Time  `json:"completed_at,omitempty"`
	DurationMs    *int        `json:"duration_ms,omitempty"`
}

func (GraphScan) TableName() string {
	return "graph.graph_scans"
}

// GraphConflict records a merge conflict between graph layers.
type GraphConflict struct {
	ID          uuid.UUID          `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID          `gorm:"type:uuid;index;not null" json:"workspace_id"`
	NodeA       *uuid.UUID         `gorm:"type:uuid;index" json:"node_a,omitempty"`
	NodeB       *uuid.UUID         `gorm:"type:uuid;index" json:"node_b,omitempty"`
	EdgeA       *uuid.UUID         `gorm:"type:uuid" json:"edge_a,omitempty"`
	EdgeB       *uuid.UUID         `gorm:"type:uuid" json:"edge_b,omitempty"`
	Type        ConflictType       `gorm:"not null" json:"type"`
	Resolution  ConflictResolution `gorm:"default:'pending'" json:"resolution"`
	Details     JSONMap            `gorm:"type:jsonb;default:'{}'" json:"details"`
	CreatedAt   time.Time          `json:"created_at"`
	ResolvedAt  *time.Time         `json:"resolved_at,omitempty"`
}

func (GraphConflict) TableName() string {
	return "graph.graph_conflicts"
}

// --- Derived / Query Structures (not stored directly) ---

// Subgraph is a subset of the graph returned by traversal queries.
type Subgraph struct {
	Nodes []GraphNode `json:"nodes"`
	Edges []GraphEdge `json:"edges"`
}

// GraphPath represents a traversal path between two nodes.
type GraphPath struct {
	Nodes []GraphNode `json:"nodes"`
	Edges []GraphEdge `json:"edges"`
}

// SystemFlow is a discovered end-to-end path through the graph.
type SystemFlow struct {
	ID    string      `json:"id"`
	Entry GraphNode   `json:"entry"`
	Steps []FlowStep  `json:"steps"`
}

// FlowStep is a single step in a system flow.
type FlowStep struct {
	Node GraphNode `json:"node"`
	Via  EdgeType  `json:"via,omitempty"`
}

// Contract is an inferred agreement between two services.
type Contract struct {
	ID           string    `json:"id"`
	Producer     GraphNode `json:"producer"`
	Consumer     GraphNode `json:"consumer"`
	Via          GraphNode `json:"via"` // topic, API, etc.
	Schema       JSONMap   `json:"schema,omitempty"`
	Expectations JSONMap   `json:"expectations,omitempty"`
}

// ImpactReport shows what flows are affected by changed nodes.
type ImpactReport struct {
	ChangedNodes  []GraphNode       `json:"changed_nodes"`
	AffectedNodes []GraphNode       `json:"affected_nodes"`
	AffectedFlows []AffectedFlow    `json:"affected_flows"`
}

// AffectedFlow pairs a flow with its relevance score.
type AffectedFlow struct {
	FlowID    uuid.UUID `json:"flow_id"`
	FlowName  string    `json:"flow_name"`
	Relevance float64   `json:"relevance"` // 1.0 = direct, 0.7 = 1-hop, 0.4 = 2-hop
	Reason    string    `json:"reason"`
}

// GraphStats summarizes graph state for a workspace.
type GraphStats struct {
	TotalNodes       int                `json:"total_nodes"`
	TotalEdges       int                `json:"total_edges"`
	NodesByType      map[NodeType]int   `json:"nodes_by_type"`
	EdgesByType      map[EdgeType]int   `json:"edges_by_type"`
	ServiceCount     int                `json:"service_count"`
	CoveragePercent  float64            `json:"coverage_percent"`
	UncoveredCount   int                `json:"uncovered_count"`
	ConflictCount    int                `json:"conflict_count"`
	LastScanAt       *time.Time         `json:"last_scan_at,omitempty"`
}

// NodeFilter is used to query nodes with optional filters.
type NodeFilter struct {
	WorkspaceID uuid.UUID   `json:"workspace_id"`
	Types       []NodeType  `json:"types,omitempty"`
	Service     string      `json:"service,omitempty"`
	SourceLayer SourceLayer `json:"source_layer,omitempty"`
	RepoID      *uuid.UUID  `json:"repo_id,omitempty"`
	Tags        []string    `json:"tags,omitempty"`
	Search      string      `json:"search,omitempty"` // text search on name
	Limit       int         `json:"limit,omitempty"`
	Offset      int         `json:"offset,omitempty"`
}

// --- JSON helper types ---

// JSONMap is a map[string]any that scans from/to JSONB.
type JSONMap map[string]any

func (m *JSONMap) Scan(value interface{}) error {
	if value == nil {
		*m = make(JSONMap)
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return fmt.Errorf("failed to scan JSONMap from type %T", value)
	}
	return json.Unmarshal(bytes, m)
}

func (m JSONMap) Value() (driver.Value, error) {
	if m == nil {
		return json.Marshal(map[string]any{})
	}
	return json.Marshal(m)
}

// JSONArray is a []any that scans from/to JSONB arrays.
type JSONArray []any

func (a *JSONArray) Scan(value interface{}) error {
	if value == nil {
		*a = make(JSONArray, 0)
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return fmt.Errorf("failed to scan JSONArray from type %T", value)
	}
	return json.Unmarshal(bytes, a)
}

func (a JSONArray) Value() (driver.Value, error) {
	if a == nil {
		return json.Marshal([]any{})
	}
	return json.Marshal(a)
}

// StringArray is a custom type for PostgreSQL text arrays (reused from models package).
type StringArray []string

func (a *StringArray) Scan(value interface{}) error {
	if value == nil {
		*a = []string{}
		return nil
	}
	switch v := value.(type) {
	case []byte:
		return a.scanBytes(v)
	case string:
		return a.scanBytes([]byte(v))
	case []interface{}:
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
	str := string(bytes)
	if str == "{}" || str == "" {
		*a = []string{}
		return nil
	}
	// Strip PostgreSQL array braces and split
	str = str[1 : len(str)-1] // Remove { }
	if str == "" {
		*a = []string{}
		return nil
	}
	parts := splitPostgresArray(str)
	*a = parts
	return nil
}

func (a StringArray) Value() (driver.Value, error) {
	if a == nil || len(a) == 0 {
		return "{}", nil
	}
	result := "{"
	for i, s := range a {
		if i > 0 {
			result += ","
		}
		result += fmt.Sprintf("%q", s)
	}
	result += "}"
	return result, nil
}

func splitPostgresArray(s string) []string {
	var result []string
	var current string
	inQuote := false
	for _, r := range s {
		switch {
		case r == '"':
			inQuote = !inQuote
		case r == ',' && !inQuote:
			result = append(result, current)
			current = ""
		default:
			current += string(r)
		}
	}
	if current != "" {
		result = append(result, current)
	}
	return result
}
