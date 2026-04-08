package graph

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

const (
	cachePrefix     = "graph:"
	nodeTTL         = 10 * time.Minute
	statsTTL        = 5 * time.Minute
	subgraphTTL     = 3 * time.Minute
)

// CachedEngine wraps an Engine with Redis caching for read-heavy operations.
type CachedEngine struct {
	inner  Engine
	redis  *redis.Client
	logger *zap.Logger
}

// NewCachedEngine wraps an engine with Redis caching.
// Returns the inner engine directly if redis is nil.
func NewCachedEngine(inner Engine, rdb *redis.Client, logger *zap.Logger) Engine {
	if rdb == nil {
		return inner
	}
	return &CachedEngine{
		inner:  inner,
		redis:  rdb,
		logger: logger,
	}
}

func (c *CachedEngine) IsAvailable() bool {
	return c.inner.IsAvailable()
}

// --- Cached Node Operations ---

func (c *CachedEngine) GetNode(ctx context.Context, id uuid.UUID) (*GraphNode, error) {
	key := nodeKey(id)

	// Try cache
	data, err := c.redis.Get(ctx, key).Bytes()
	if err == nil {
		var node GraphNode
		if json.Unmarshal(data, &node) == nil {
			return &node, nil
		}
	}

	// Cache miss — fetch from inner
	node, err := c.inner.GetNode(ctx, id)
	if err != nil {
		return nil, err
	}

	c.cacheJSON(ctx, key, node, nodeTTL)
	return node, nil
}

func (c *CachedEngine) FindNodes(ctx context.Context, filter NodeFilter) ([]GraphNode, int64, error) {
	// Not cached — filter combinations are too varied
	return c.inner.FindNodes(ctx, filter)
}

func (c *CachedEngine) SearchNodes(ctx context.Context, workspaceID uuid.UUID, query string, limit int) ([]GraphNode, error) {
	return c.inner.SearchNodes(ctx, workspaceID, query, limit)
}

func (c *CachedEngine) UpsertNode(ctx context.Context, node *GraphNode) error {
	err := c.inner.UpsertNode(ctx, node)
	if err == nil {
		c.invalidateNode(ctx, node.ID, node.WorkspaceID)
	}
	return err
}

func (c *CachedEngine) DeleteNode(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID) error {
	err := c.inner.DeleteNode(ctx, id, workspaceID)
	if err == nil {
		c.invalidateNode(ctx, id, workspaceID)
	}
	return err
}

// --- Cached Edge Operations ---

func (c *CachedEngine) GetEdge(ctx context.Context, id uuid.UUID) (*GraphEdge, error) {
	return c.inner.GetEdge(ctx, id)
}

func (c *CachedEngine) GetEdgesForNode(ctx context.Context, nodeID uuid.UUID, direction string) ([]GraphEdge, error) {
	return c.inner.GetEdgesForNode(ctx, nodeID, direction)
}

func (c *CachedEngine) ListEdges(ctx context.Context, workspaceID uuid.UUID) ([]GraphEdge, error) {
	return c.inner.ListEdges(ctx, workspaceID)
}

func (c *CachedEngine) UpsertEdge(ctx context.Context, edge *GraphEdge) error {
	err := c.inner.UpsertEdge(ctx, edge)
	if err == nil {
		// Invalidate both endpoint nodes' cached subgraphs
		c.invalidateNode(ctx, edge.FromNodeID, edge.WorkspaceID)
		c.invalidateNode(ctx, edge.ToNodeID, edge.WorkspaceID)
	}
	return err
}

func (c *CachedEngine) DeleteEdge(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID) error {
	// Get edge first for invalidation
	edge, _ := c.inner.GetEdge(ctx, id)
	err := c.inner.DeleteEdge(ctx, id, workspaceID)
	if err == nil && edge != nil {
		c.invalidateNode(ctx, edge.FromNodeID, workspaceID)
		c.invalidateNode(ctx, edge.ToNodeID, workspaceID)
	}
	return err
}

// --- Cached Traversal ---

func (c *CachedEngine) GetDependencies(ctx context.Context, nodeID uuid.UUID, depth int) (*Subgraph, error) {
	key := fmt.Sprintf("%sdeps:%s:%d", cachePrefix, nodeID, depth)

	data, err := c.redis.Get(ctx, key).Bytes()
	if err == nil {
		var sg Subgraph
		if json.Unmarshal(data, &sg) == nil {
			return &sg, nil
		}
	}

	sg, err := c.inner.GetDependencies(ctx, nodeID, depth)
	if err != nil {
		return nil, err
	}

	c.cacheJSON(ctx, key, sg, subgraphTTL)
	return sg, nil
}

func (c *CachedEngine) GetDependents(ctx context.Context, nodeID uuid.UUID, depth int) (*Subgraph, error) {
	key := fmt.Sprintf("%sdependents:%s:%d", cachePrefix, nodeID, depth)

	data, err := c.redis.Get(ctx, key).Bytes()
	if err == nil {
		var sg Subgraph
		if json.Unmarshal(data, &sg) == nil {
			return &sg, nil
		}
	}

	sg, err := c.inner.GetDependents(ctx, nodeID, depth)
	if err != nil {
		return nil, err
	}

	c.cacheJSON(ctx, key, sg, subgraphTTL)
	return sg, nil
}

func (c *CachedEngine) FindPaths(ctx context.Context, fromID, toID uuid.UUID) ([]GraphPath, error) {
	return c.inner.FindPaths(ctx, fromID, toID)
}

// --- Cached Flow/Impact ---

func (c *CachedEngine) GetFlowsForNode(ctx context.Context, nodeID uuid.UUID) ([]uuid.UUID, error) {
	return c.inner.GetFlowsForNode(ctx, nodeID)
}

func (c *CachedEngine) GetUncoveredNodes(ctx context.Context, workspaceID uuid.UUID) ([]GraphNode, error) {
	return c.inner.GetUncoveredNodes(ctx, workspaceID)
}

func (c *CachedEngine) GetSystemFlows(ctx context.Context, entryID uuid.UUID) ([]SystemFlow, error) {
	return c.inner.GetSystemFlows(ctx, entryID)
}

func (c *CachedEngine) GetImpact(ctx context.Context, changedNodeIDs []uuid.UUID) (*ImpactReport, error) {
	return c.inner.GetImpact(ctx, changedNodeIDs)
}

func (c *CachedEngine) GetContracts(ctx context.Context, workspaceID uuid.UUID) ([]Contract, error) {
	return c.inner.GetContracts(ctx, workspaceID)
}

// --- Cached Stats ---

func (c *CachedEngine) GetGraphStats(ctx context.Context, workspaceID uuid.UUID) (*GraphStats, error) {
	key := fmt.Sprintf("%sstats:%s", cachePrefix, workspaceID)

	data, err := c.redis.Get(ctx, key).Bytes()
	if err == nil {
		var stats GraphStats
		if json.Unmarshal(data, &stats) == nil {
			return &stats, nil
		}
	}

	stats, err := c.inner.GetGraphStats(ctx, workspaceID)
	if err != nil {
		return nil, err
	}

	c.cacheJSON(ctx, key, stats, statsTTL)
	return stats, nil
}

func (c *CachedEngine) GetMergeConflicts(ctx context.Context, workspaceID uuid.UUID) ([]GraphConflict, error) {
	return c.inner.GetMergeConflicts(ctx, workspaceID)
}

// --- Pass-through (Repo/Scan/Conflict/Bulk) ---

func (c *CachedEngine) CreateRepo(ctx context.Context, repo *GraphRepo) error {
	return c.inner.CreateRepo(ctx, repo)
}

func (c *CachedEngine) GetRepo(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID) (*GraphRepo, error) {
	return c.inner.GetRepo(ctx, id, workspaceID)
}

func (c *CachedEngine) ListRepos(ctx context.Context, workspaceID uuid.UUID) ([]GraphRepo, error) {
	return c.inner.ListRepos(ctx, workspaceID)
}

func (c *CachedEngine) UpdateRepo(ctx context.Context, repo *GraphRepo) error {
	return c.inner.UpdateRepo(ctx, repo)
}

func (c *CachedEngine) DeleteRepo(ctx context.Context, id uuid.UUID, workspaceID uuid.UUID) error {
	return c.inner.DeleteRepo(ctx, id, workspaceID)
}

func (c *CachedEngine) GetRepoByURL(ctx context.Context, url string, workspaceID uuid.UUID) (*GraphRepo, error) {
	return c.inner.GetRepoByURL(ctx, url, workspaceID)
}

func (c *CachedEngine) FindReposByURLFragment(ctx context.Context, fragment string) ([]GraphRepo, error) {
	return c.inner.FindReposByURLFragment(ctx, fragment)
}

func (c *CachedEngine) CreateScan(ctx context.Context, scan *GraphScan) error {
	return c.inner.CreateScan(ctx, scan)
}

func (c *CachedEngine) UpdateScan(ctx context.Context, scan *GraphScan) error {
	return c.inner.UpdateScan(ctx, scan)
}

func (c *CachedEngine) GetScan(ctx context.Context, id uuid.UUID) (*GraphScan, error) {
	return c.inner.GetScan(ctx, id)
}

func (c *CachedEngine) GetLatestScan(ctx context.Context, workspaceID uuid.UUID) (*GraphScan, error) {
	return c.inner.GetLatestScan(ctx, workspaceID)
}

func (c *CachedEngine) CreateConflict(ctx context.Context, conflict *GraphConflict) error {
	return c.inner.CreateConflict(ctx, conflict)
}

func (c *CachedEngine) ResolveConflict(ctx context.Context, id uuid.UUID, resolution ConflictResolution) error {
	return c.inner.ResolveConflict(ctx, id, resolution)
}

func (c *CachedEngine) BulkUpsertNodes(ctx context.Context, nodes []GraphNode) error {
	err := c.inner.BulkUpsertNodes(ctx, nodes)
	if err == nil && len(nodes) > 0 {
		// Invalidate workspace stats after bulk operations
		c.invalidateWorkspace(ctx, nodes[0].WorkspaceID)
	}
	return err
}

func (c *CachedEngine) BulkUpsertEdges(ctx context.Context, edges []GraphEdge) error {
	err := c.inner.BulkUpsertEdges(ctx, edges)
	if err == nil && len(edges) > 0 {
		c.invalidateWorkspace(ctx, edges[0].WorkspaceID)
	}
	return err
}

func (c *CachedEngine) ClearWorkspaceGraph(ctx context.Context, workspaceID uuid.UUID) error {
	err := c.inner.ClearWorkspaceGraph(ctx, workspaceID)
	if err == nil {
		c.invalidateWorkspace(ctx, workspaceID)
	}
	return err
}

// --- Internal Cache Helpers ---

func (c *CachedEngine) cacheJSON(ctx context.Context, key string, value any, ttl time.Duration) {
	data, err := json.Marshal(value)
	if err != nil {
		return
	}
	if err := c.redis.Set(ctx, key, data, ttl).Err(); err != nil {
		c.logger.Debug("Failed to cache graph data", zap.String("key", key), zap.Error(err))
	}
}

func (c *CachedEngine) invalidateNode(ctx context.Context, nodeID uuid.UUID, workspaceID uuid.UUID) {
	keys := []string{
		nodeKey(nodeID),
		fmt.Sprintf("%sstats:%s", cachePrefix, workspaceID),
	}
	// Also invalidate dependency/dependent subgraph caches for common depths
	for _, depth := range []int{1, 2, 3} {
		keys = append(keys,
			fmt.Sprintf("%sdeps:%s:%d", cachePrefix, nodeID, depth),
			fmt.Sprintf("%sdependents:%s:%d", cachePrefix, nodeID, depth),
		)
	}
	c.redis.Del(ctx, keys...)
}

func (c *CachedEngine) invalidateWorkspace(ctx context.Context, workspaceID uuid.UUID) {
	c.redis.Del(ctx, fmt.Sprintf("%sstats:%s", cachePrefix, workspaceID))
}

func nodeKey(id uuid.UUID) string {
	return fmt.Sprintf("%snode:%s", cachePrefix, id)
}

// Compile-time check.
var _ Engine = (*CachedEngine)(nil)
