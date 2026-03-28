package graph

import (
	"context"

	"github.com/google/uuid"
)

// NoopEngine implements Engine with no-op operations.
// Used when the graph feature is disabled (no Neo4j, graph.enabled=false).
// All methods return empty results without errors, allowing the rest of
// the application to function normally.
type NoopEngine struct{}

func NewNoopEngine() *NoopEngine {
	return &NoopEngine{}
}

func (n *NoopEngine) IsAvailable() bool                { return false }

func (n *NoopEngine) GetNode(_ context.Context, _ uuid.UUID) (*GraphNode, error) {
	return nil, ErrGraphDisabled
}

func (n *NoopEngine) FindNodes(_ context.Context, _ NodeFilter) ([]GraphNode, int64, error) {
	return nil, 0, nil
}

func (n *NoopEngine) SearchNodes(_ context.Context, _ uuid.UUID, _ string, _ int) ([]GraphNode, error) {
	return nil, nil
}

func (n *NoopEngine) UpsertNode(_ context.Context, _ *GraphNode) error {
	return ErrGraphDisabled
}

func (n *NoopEngine) DeleteNode(_ context.Context, _ uuid.UUID, _ uuid.UUID) error {
	return ErrGraphDisabled
}

func (n *NoopEngine) GetEdge(_ context.Context, _ uuid.UUID) (*GraphEdge, error) {
	return nil, ErrGraphDisabled
}

func (n *NoopEngine) GetEdgesForNode(_ context.Context, _ uuid.UUID, _ string) ([]GraphEdge, error) {
	return nil, nil
}

func (n *NoopEngine) UpsertEdge(_ context.Context, _ *GraphEdge) error {
	return ErrGraphDisabled
}

func (n *NoopEngine) DeleteEdge(_ context.Context, _ uuid.UUID, _ uuid.UUID) error {
	return ErrGraphDisabled
}

func (n *NoopEngine) GetDependencies(_ context.Context, _ uuid.UUID, _ int) (*Subgraph, error) {
	return &Subgraph{}, nil
}

func (n *NoopEngine) GetDependents(_ context.Context, _ uuid.UUID, _ int) (*Subgraph, error) {
	return &Subgraph{}, nil
}

func (n *NoopEngine) FindPaths(_ context.Context, _, _ uuid.UUID) ([]GraphPath, error) {
	return nil, nil
}

func (n *NoopEngine) GetFlowsForNode(_ context.Context, _ uuid.UUID) ([]uuid.UUID, error) {
	return nil, nil
}

func (n *NoopEngine) GetUncoveredNodes(_ context.Context, _ uuid.UUID) ([]GraphNode, error) {
	return nil, nil
}

func (n *NoopEngine) GetSystemFlows(_ context.Context, _ uuid.UUID) ([]SystemFlow, error) {
	return nil, nil
}

func (n *NoopEngine) GetImpact(_ context.Context, _ []uuid.UUID) (*ImpactReport, error) {
	return &ImpactReport{}, nil
}

func (n *NoopEngine) GetContracts(_ context.Context, _ uuid.UUID) ([]Contract, error) {
	return nil, nil
}

func (n *NoopEngine) GetGraphStats(_ context.Context, _ uuid.UUID) (*GraphStats, error) {
	return &GraphStats{
		NodesByType: make(map[NodeType]int),
		EdgesByType: make(map[EdgeType]int),
	}, nil
}

func (n *NoopEngine) GetMergeConflicts(_ context.Context, _ uuid.UUID) ([]GraphConflict, error) {
	return nil, nil
}

func (n *NoopEngine) CreateRepo(_ context.Context, _ *GraphRepo) error {
	return ErrGraphDisabled
}

func (n *NoopEngine) GetRepo(_ context.Context, _ uuid.UUID, _ uuid.UUID) (*GraphRepo, error) {
	return nil, ErrGraphDisabled
}

func (n *NoopEngine) ListRepos(_ context.Context, _ uuid.UUID) ([]GraphRepo, error) {
	return nil, nil
}

func (n *NoopEngine) UpdateRepo(_ context.Context, _ *GraphRepo) error {
	return ErrGraphDisabled
}

func (n *NoopEngine) DeleteRepo(_ context.Context, _ uuid.UUID, _ uuid.UUID) error {
	return ErrGraphDisabled
}

func (n *NoopEngine) CreateScan(_ context.Context, _ *GraphScan) error {
	return ErrGraphDisabled
}

func (n *NoopEngine) UpdateScan(_ context.Context, _ *GraphScan) error {
	return ErrGraphDisabled
}

func (n *NoopEngine) GetScan(_ context.Context, _ uuid.UUID) (*GraphScan, error) {
	return nil, ErrGraphDisabled
}

func (n *NoopEngine) GetLatestScan(_ context.Context, _ uuid.UUID) (*GraphScan, error) {
	return nil, ErrGraphDisabled
}

func (n *NoopEngine) CreateConflict(_ context.Context, _ *GraphConflict) error {
	return ErrGraphDisabled
}

func (n *NoopEngine) ResolveConflict(_ context.Context, _ uuid.UUID, _ ConflictResolution) error {
	return ErrGraphDisabled
}

func (n *NoopEngine) BulkUpsertNodes(_ context.Context, _ []GraphNode) error {
	return ErrGraphDisabled
}

func (n *NoopEngine) BulkUpsertEdges(_ context.Context, _ []GraphEdge) error {
	return ErrGraphDisabled
}

func (n *NoopEngine) ClearWorkspaceGraph(_ context.Context, _ uuid.UUID) error {
	return ErrGraphDisabled
}

// Compile-time check.
var _ Engine = (*NoopEngine)(nil)
