package graph

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/shared/database"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// Engine is the core graph engine that provides queries and mutations
// against the system graph stored in Neo4j (traversal) and PostgreSQL (metadata).
type Engine interface {
	// Node queries
	GetNode(ctx context.Context, id uuid.UUID) (*GraphNode, error)
	FindNodes(ctx context.Context, filter NodeFilter) ([]GraphNode, int64, error)
	SearchNodes(ctx context.Context, workspaceID uuid.UUID, query string, limit int) ([]GraphNode, error)

	// Node mutations
	UpsertNode(ctx context.Context, node *GraphNode) error
	DeleteNode(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID) error

	// Edge queries
	GetEdge(ctx context.Context, id uuid.UUID) (*GraphEdge, error)
	GetEdgesForNode(ctx context.Context, nodeID uuid.UUID, direction string) ([]GraphEdge, error)
	ListEdges(ctx context.Context, workspaceID uuid.UUID) ([]GraphEdge, error)

	// Edge mutations
	UpsertEdge(ctx context.Context, edge *GraphEdge) error
	DeleteEdge(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID) error

	// Traversal
	GetDependencies(ctx context.Context, nodeID uuid.UUID, depth int) (*Subgraph, error)
	GetDependents(ctx context.Context, nodeID uuid.UUID, depth int) (*Subgraph, error)
	FindPaths(ctx context.Context, fromID, toID uuid.UUID) ([]GraphPath, error)

	// Flow-oriented queries
	GetFlowsForNode(ctx context.Context, nodeID uuid.UUID) ([]uuid.UUID, error)
	GetUncoveredNodes(ctx context.Context, workspaceID uuid.UUID) ([]GraphNode, error)
	GetSystemFlows(ctx context.Context, entryID uuid.UUID) ([]SystemFlow, error)

	// Impact analysis
	GetImpact(ctx context.Context, changedNodeIDs []uuid.UUID) (*ImpactReport, error)

	// Contracts
	GetContracts(ctx context.Context, workspaceID uuid.UUID) ([]Contract, error)

	// Graph metadata
	GetGraphStats(ctx context.Context, workspaceID uuid.UUID) (*GraphStats, error)
	GetMergeConflicts(ctx context.Context, workspaceID uuid.UUID) ([]GraphConflict, error)

	// Repo management
	CreateRepo(ctx context.Context, repo *GraphRepo) error
	GetRepo(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID) (*GraphRepo, error)
	ListRepos(ctx context.Context, workspaceID uuid.UUID) ([]GraphRepo, error)
	UpdateRepo(ctx context.Context, repo *GraphRepo) error
	DeleteRepo(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID) error
	// GetRepoByURL finds a repo by exact URL within a workspace.
	GetRepoByURL(ctx context.Context, url string, workspaceID uuid.UUID) (*GraphRepo, error)
	// FindReposByURLFragment finds repos whose URL contains the given fragment (cross-workspace).
	FindReposByURLFragment(ctx context.Context, fragment string) ([]GraphRepo, error)

	// Scan management
	CreateScan(ctx context.Context, scan *GraphScan) error
	UpdateScan(ctx context.Context, scan *GraphScan) error
	GetScan(ctx context.Context, id uuid.UUID) (*GraphScan, error)
	GetLatestScan(ctx context.Context, workspaceID uuid.UUID) (*GraphScan, error)

	// Conflict management
	CreateConflict(ctx context.Context, conflict *GraphConflict) error
	ResolveConflict(ctx context.Context, id uuid.UUID, resolution ConflictResolution) error

	// Bulk operations (used by scanners)
	BulkUpsertNodes(ctx context.Context, nodes []GraphNode) error
	BulkUpsertEdges(ctx context.Context, edges []GraphEdge) error
	ClearWorkspaceGraph(ctx context.Context, workspaceID uuid.UUID) error

	// Health
	IsAvailable() bool
}

// DefaultEngine implements Engine using Neo4j for graph traversal
// and PostgreSQL for metadata, embeddings, and relational queries.
type DefaultEngine struct {
	db     *gorm.DB
	neo4j  *database.Neo4jClient
	logger *zap.Logger
}

// NewEngine creates a new graph engine backed by Neo4j and PostgreSQL.
func NewEngine(db *gorm.DB, neo4j *database.Neo4jClient, logger *zap.Logger) *DefaultEngine {
	return &DefaultEngine{
		db:     db,
		neo4j:  neo4j,
		logger: logger,
	}
}

func (e *DefaultEngine) IsAvailable() bool {
	return e.neo4j != nil
}

// --- Node Operations ---

func (e *DefaultEngine) GetNode(ctx context.Context, id uuid.UUID) (*GraphNode, error) {
	var node GraphNode
	if err := e.db.WithContext(ctx).First(&node, "id = ?", id).Error; err != nil {
		return nil, fmt.Errorf("node not found: %w", err)
	}
	return &node, nil
}

func (e *DefaultEngine) FindNodes(ctx context.Context, filter NodeFilter) ([]GraphNode, int64, error) {
	var nodes []GraphNode
	var total int64

	query := e.db.WithContext(ctx).Model(&GraphNode{}).Where("workspace_id = ?", filter.WorkspaceID)

	if len(filter.Types) > 0 {
		query = query.Where("type IN ?", filter.Types)
	}
	if filter.Service != "" {
		query = query.Where("service = ?", filter.Service)
	}
	if filter.SourceLayer != "" {
		query = query.Where("source_layer = ?", filter.SourceLayer)
	}
	if filter.RepoID != nil {
		query = query.Where("repo_id = ?", *filter.RepoID)
	}
	if filter.Search != "" {
		query = query.Where("name ILIKE ?", "%"+filter.Search+"%")
	}

	query.Count(&total)

	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	query = query.Limit(limit).Offset(filter.Offset).Order("name ASC")

	if err := query.Find(&nodes).Error; err != nil {
		return nil, 0, err
	}
	return nodes, total, nil
}

func (e *DefaultEngine) SearchNodes(ctx context.Context, workspaceID uuid.UUID, query string, limit int) ([]GraphNode, error) {
	// Text search fallback — semantic search via pgvector implemented in embeddings.go
	var nodes []GraphNode
	if limit <= 0 {
		limit = 20
	}
	err := e.db.WithContext(ctx).
		Where("workspace_id = ? AND name ILIKE ?", workspaceID, "%"+query+"%").
		Limit(limit).
		Order("name ASC").
		Find(&nodes).Error
	return nodes, err
}

func (e *DefaultEngine) UpsertNode(ctx context.Context, node *GraphNode) error {
	if node.ID == uuid.Nil {
		node.ID = uuid.New()
	}
	node.UpdatedAt = time.Now().UTC()

	// Upsert in PostgreSQL
	result := e.db.WithContext(ctx).Save(node)
	if result.Error != nil {
		return fmt.Errorf("failed to upsert node in postgres: %w", result.Error)
	}

	// Upsert in Neo4j
	if e.neo4j != nil {
		if err := e.upsertNodeNeo4j(ctx, node); err != nil {
			e.logger.Error("Failed to upsert node in neo4j (postgres succeeded)",
				zap.String("node_id", node.ID.String()),
				zap.Error(err),
			)
			return fmt.Errorf("failed to upsert node in neo4j: %w", err)
		}
	}

	return nil
}

func (e *DefaultEngine) DeleteNode(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID) error {
	// Get the node first for Neo4j ID
	var node GraphNode
	if err := e.db.WithContext(ctx).First(&node, "id = ? AND workspace_id = ?", id, workspaceID).Error; err != nil {
		return err
	}

	// Delete edges referencing this node
	e.db.WithContext(ctx).Where("from_node = ? OR to_node = ?", id, id).Delete(&GraphEdge{})

	// Delete from PostgreSQL
	if err := e.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).Delete(&GraphNode{}).Error; err != nil {
		return err
	}

	// Delete from Neo4j
	if e.neo4j != nil {
		if err := e.deleteNodeNeo4j(ctx, node.Neo4jID); err != nil {
			e.logger.Error("Failed to delete node from neo4j", zap.Error(err))
		}
	}

	return nil
}

// --- Edge Operations ---

func (e *DefaultEngine) GetEdge(ctx context.Context, id uuid.UUID) (*GraphEdge, error) {
	var edge GraphEdge
	if err := e.db.WithContext(ctx).First(&edge, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &edge, nil
}

func (e *DefaultEngine) GetEdgesForNode(ctx context.Context, nodeID uuid.UUID, direction string) ([]GraphEdge, error) {
	var edges []GraphEdge
	query := e.db.WithContext(ctx)

	switch direction {
	case "outgoing":
		query = query.Where("from_node = ?", nodeID)
	case "incoming":
		query = query.Where("to_node = ?", nodeID)
	default: // "both"
		query = query.Where("from_node = ? OR to_node = ?", nodeID, nodeID)
	}

	if err := query.Find(&edges).Error; err != nil {
		return nil, err
	}
	return edges, nil
}

func (e *DefaultEngine) ListEdges(ctx context.Context, workspaceID uuid.UUID) ([]GraphEdge, error) {
	var edges []GraphEdge
	if err := e.db.WithContext(ctx).Where("workspace_id = ?", workspaceID).Find(&edges).Error; err != nil {
		return nil, err
	}
	return edges, nil
}

func (e *DefaultEngine) UpsertEdge(ctx context.Context, edge *GraphEdge) error {
	if edge.ID == uuid.Nil {
		edge.ID = uuid.New()
	}

	// Upsert in PostgreSQL
	if err := e.db.WithContext(ctx).Save(edge).Error; err != nil {
		return fmt.Errorf("failed to upsert edge in postgres: %w", err)
	}

	// Upsert in Neo4j
	if e.neo4j != nil {
		if err := e.upsertEdgeNeo4j(ctx, edge); err != nil {
			e.logger.Error("Failed to upsert edge in neo4j", zap.Error(err))
			return fmt.Errorf("failed to upsert edge in neo4j: %w", err)
		}
	}

	return nil
}

func (e *DefaultEngine) DeleteEdge(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID) error {
	var edge GraphEdge
	if err := e.db.WithContext(ctx).First(&edge, "id = ? AND workspace_id = ?", id, workspaceID).Error; err != nil {
		return err
	}

	if err := e.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).Delete(&GraphEdge{}).Error; err != nil {
		return err
	}

	if e.neo4j != nil {
		if err := e.deleteEdgeNeo4j(ctx, edge.Neo4jID); err != nil {
			e.logger.Error("Failed to delete edge from neo4j", zap.Error(err))
		}
	}

	return nil
}

// --- Repo Operations ---

func (e *DefaultEngine) CreateRepo(ctx context.Context, repo *GraphRepo) error {
	if repo.ID == uuid.Nil {
		repo.ID = uuid.New()
	}
	return e.db.WithContext(ctx).Create(repo).Error
}

func (e *DefaultEngine) GetRepo(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID) (*GraphRepo, error) {
	var repo GraphRepo
	if err := e.db.WithContext(ctx).First(&repo, "id = ? AND workspace_id = ?", id, workspaceID).Error; err != nil {
		return nil, err
	}
	return &repo, nil
}

func (e *DefaultEngine) ListRepos(ctx context.Context, workspaceID uuid.UUID) ([]GraphRepo, error) {
	var repos []GraphRepo
	if err := e.db.WithContext(ctx).Where("workspace_id = ?", workspaceID).Order("name ASC").Find(&repos).Error; err != nil {
		return nil, err
	}
	return repos, nil
}

func (e *DefaultEngine) UpdateRepo(ctx context.Context, repo *GraphRepo) error {
	return e.db.WithContext(ctx).Save(repo).Error
}

func (e *DefaultEngine) DeleteRepo(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID) error {
	result := e.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", id, workspaceID).Delete(&GraphRepo{})
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return result.Error
}

func (e *DefaultEngine) GetRepoByURL(ctx context.Context, url string, workspaceID uuid.UUID) (*GraphRepo, error) {
	var repo GraphRepo
	if err := e.db.WithContext(ctx).
		First(&repo, "url = ? AND workspace_id = ?", url, workspaceID).Error; err != nil {
		return nil, err
	}
	return &repo, nil
}

func (e *DefaultEngine) FindReposByURLFragment(ctx context.Context, fragment string) ([]GraphRepo, error) {
	var repos []GraphRepo
	if err := e.db.WithContext(ctx).
		Where("url LIKE ?", "%"+fragment+"%").
		Find(&repos).Error; err != nil {
		return nil, err
	}
	return repos, nil
}

// --- Scan Operations ---

func (e *DefaultEngine) CreateScan(ctx context.Context, scan *GraphScan) error {
	if scan.ID == uuid.Nil {
		scan.ID = uuid.New()
	}
	scan.StartedAt = time.Now().UTC()
	return e.db.WithContext(ctx).Create(scan).Error
}

func (e *DefaultEngine) UpdateScan(ctx context.Context, scan *GraphScan) error {
	return e.db.WithContext(ctx).Save(scan).Error
}

func (e *DefaultEngine) GetScan(ctx context.Context, id uuid.UUID) (*GraphScan, error) {
	var scan GraphScan
	if err := e.db.WithContext(ctx).First(&scan, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &scan, nil
}

func (e *DefaultEngine) GetLatestScan(ctx context.Context, workspaceID uuid.UUID) (*GraphScan, error) {
	var scan GraphScan
	if err := e.db.WithContext(ctx).
		Where("workspace_id = ?", workspaceID).
		Order("started_at DESC").
		First(&scan).Error; err != nil {
		return nil, err
	}
	return &scan, nil
}

// --- Conflict Operations ---

func (e *DefaultEngine) CreateConflict(ctx context.Context, conflict *GraphConflict) error {
	if conflict.ID == uuid.Nil {
		conflict.ID = uuid.New()
	}
	return e.db.WithContext(ctx).Create(conflict).Error
}

func (e *DefaultEngine) ResolveConflict(ctx context.Context, id uuid.UUID, resolution ConflictResolution) error {
	now := time.Now().UTC()
	return e.db.WithContext(ctx).
		Model(&GraphConflict{}).
		Where("id = ?", id).
		Updates(map[string]interface{}{
			"resolution":  resolution,
			"resolved_at": now,
		}).Error
}

func (e *DefaultEngine) GetMergeConflicts(ctx context.Context, workspaceID uuid.UUID) ([]GraphConflict, error) {
	var conflicts []GraphConflict
	if err := e.db.WithContext(ctx).
		Where("workspace_id = ? AND resolution = ?", workspaceID, ConflictPending).
		Order("created_at DESC").
		Find(&conflicts).Error; err != nil {
		return nil, err
	}
	return conflicts, nil
}

// --- Graph Stats ---

func (e *DefaultEngine) GetGraphStats(ctx context.Context, workspaceID uuid.UUID) (*GraphStats, error) {
	stats := &GraphStats{
		NodesByType: make(map[NodeType]int),
		EdgesByType: make(map[EdgeType]int),
	}

	// Total counts
	var nodeCount, edgeCount int64
	e.db.WithContext(ctx).Model(&GraphNode{}).Where("workspace_id = ?", workspaceID).Count(&nodeCount)
	e.db.WithContext(ctx).Model(&GraphEdge{}).Where("workspace_id = ?", workspaceID).Count(&edgeCount)
	stats.TotalNodes = int(nodeCount)
	stats.TotalEdges = int(edgeCount)

	// Nodes by type
	var nodeTypeCounts []struct {
		Type  NodeType
		Count int
	}
	e.db.WithContext(ctx).Model(&GraphNode{}).
		Select("type, count(*) as count").
		Where("workspace_id = ?", workspaceID).
		Group("type").
		Scan(&nodeTypeCounts)
	for _, ntc := range nodeTypeCounts {
		stats.NodesByType[ntc.Type] = ntc.Count
	}

	// Edges by type
	var edgeTypeCounts []struct {
		Type  EdgeType
		Count int
	}
	e.db.WithContext(ctx).Model(&GraphEdge{}).
		Select("type, count(*) as count").
		Where("workspace_id = ?", workspaceID).
		Group("type").
		Scan(&edgeTypeCounts)
	for _, etc := range edgeTypeCounts {
		stats.EdgesByType[etc.Type] = etc.Count
	}

	// Service count
	var serviceCount int64
	e.db.WithContext(ctx).Model(&GraphNode{}).
		Where("workspace_id = ? AND type = ?", workspaceID, NodeTypeService).
		Count(&serviceCount)
	stats.ServiceCount = int(serviceCount)

	// Coverage: count testable nodes (api_endpoint, topic, grpc_method) with vs without tested_by edges
	var testableCount int64
	e.db.WithContext(ctx).Model(&GraphNode{}).
		Where("workspace_id = ? AND type IN ?", workspaceID,
			[]NodeType{NodeTypeAPIEndpoint, NodeTypeTopic, NodeTypeGRPCMethod}).
		Count(&testableCount)

	if testableCount > 0 {
		var coveredCount int64
		e.db.WithContext(ctx).Raw(`
			SELECT COUNT(DISTINCT gn.id)
			FROM graph.graph_nodes gn
			INNER JOIN graph.graph_edges ge ON ge.to_node = gn.id AND ge.type = 'tested_by'
			WHERE gn.workspace_id = ? AND gn.type IN ('api_endpoint', 'topic', 'grpc_method')
		`, workspaceID).Scan(&coveredCount)

		stats.CoveragePercent = float64(coveredCount) / float64(testableCount) * 100
		stats.UncoveredCount = int(testableCount - coveredCount)
	}

	// Conflict count
	var conflictCount int64
	e.db.WithContext(ctx).Model(&GraphConflict{}).
		Where("workspace_id = ? AND resolution = ?", workspaceID, ConflictPending).
		Count(&conflictCount)
	stats.ConflictCount = int(conflictCount)

	// Last scan
	var lastScan GraphScan
	if err := e.db.WithContext(ctx).
		Where("workspace_id = ? AND status = ?", workspaceID, ScanStatusCompleted).
		Order("completed_at DESC").
		First(&lastScan).Error; err == nil {
		stats.LastScanAt = lastScan.CompletedAt
	}

	return stats, nil
}

// --- Bulk Operations ---

func (e *DefaultEngine) BulkUpsertNodes(ctx context.Context, nodes []GraphNode) error {
	if len(nodes) == 0 {
		return nil
	}

	// PostgreSQL batch upsert
	for i := range nodes {
		if nodes[i].ID == uuid.Nil {
			nodes[i].ID = uuid.New()
		}
		nodes[i].UpdatedAt = time.Now().UTC()
	}

	if err := e.db.WithContext(ctx).Save(&nodes).Error; err != nil {
		return fmt.Errorf("failed to bulk upsert nodes in postgres: %w", err)
	}

	// Neo4j batch upsert
	if e.neo4j != nil {
		if err := e.bulkUpsertNodesNeo4j(ctx, nodes); err != nil {
			return fmt.Errorf("failed to bulk upsert nodes in neo4j: %w", err)
		}
	}

	return nil
}

func (e *DefaultEngine) BulkUpsertEdges(ctx context.Context, edges []GraphEdge) error {
	if len(edges) == 0 {
		return nil
	}

	for i := range edges {
		if edges[i].ID == uuid.Nil {
			edges[i].ID = uuid.New()
		}
	}

	if err := e.db.WithContext(ctx).Save(&edges).Error; err != nil {
		return fmt.Errorf("failed to bulk upsert edges in postgres: %w", err)
	}

	if e.neo4j != nil {
		if err := e.bulkUpsertEdgesNeo4j(ctx, edges); err != nil {
			return fmt.Errorf("failed to bulk upsert edges in neo4j: %w", err)
		}
	}

	return nil
}

func (e *DefaultEngine) ClearWorkspaceGraph(ctx context.Context, workspaceID uuid.UUID) error {
	// Delete edges first (FK to nodes)
	if err := e.db.WithContext(ctx).Where("workspace_id = ?", workspaceID).Delete(&GraphEdge{}).Error; err != nil {
		return err
	}
	if err := e.db.WithContext(ctx).Where("workspace_id = ?", workspaceID).Delete(&GraphNode{}).Error; err != nil {
		return err
	}
	if err := e.db.WithContext(ctx).Where("workspace_id = ?", workspaceID).Delete(&GraphConflict{}).Error; err != nil {
		return err
	}

	// Clear Neo4j
	if e.neo4j != nil {
		if err := e.clearWorkspaceNeo4j(ctx, workspaceID); err != nil {
			e.logger.Error("Failed to clear workspace graph in neo4j", zap.Error(err))
		}
	}

	return nil
}
