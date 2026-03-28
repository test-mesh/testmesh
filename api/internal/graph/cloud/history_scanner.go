package cloud

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/graph"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// GraphSnapshot stores a point-in-time snapshot of graph state, keyed by commit.
type GraphSnapshot struct {
	ID          uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID  `gorm:"type:uuid;index;not null" json:"workspace_id"`
	CommitSHA   string     `gorm:"not null;index" json:"commit_sha"`
	Branch      string     `json:"branch"`
	NodeCount   int        `json:"node_count"`
	EdgeCount   int        `json:"edge_count"`
	NodeHash    string     `json:"node_hash"` // Hash of sorted node IDs — detect structural changes
	EdgeHash    string     `json:"edge_hash"`
	Metadata    graph.JSONMap `gorm:"type:jsonb;default:'{}'" json:"metadata"`
	CreatedAt   time.Time  `json:"created_at"`
}

func (GraphSnapshot) TableName() string {
	return "graph.graph_snapshots"
}

// GraphDiff records what changed between two snapshots.
type GraphDiff struct {
	ID           uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID  uuid.UUID  `gorm:"type:uuid;index;not null" json:"workspace_id"`
	FromCommit   string     `gorm:"not null" json:"from_commit"`
	ToCommit     string     `gorm:"not null" json:"to_commit"`
	NodesAdded   graph.JSONArray `gorm:"type:jsonb;default:'[]'" json:"nodes_added"`
	NodesRemoved graph.JSONArray `gorm:"type:jsonb;default:'[]'" json:"nodes_removed"`
	NodesChanged graph.JSONArray `gorm:"type:jsonb;default:'[]'" json:"nodes_changed"`
	EdgesAdded   graph.JSONArray `gorm:"type:jsonb;default:'[]'" json:"edges_added"`
	EdgesRemoved graph.JSONArray `gorm:"type:jsonb;default:'[]'" json:"edges_removed"`
	CreatedAt    time.Time  `json:"created_at"`
}

func (GraphDiff) TableName() string {
	return "graph.graph_diffs"
}

// HistoryScanner tracks graph changes over time (Layer 6).
// It creates snapshots after each scan and computes diffs between commits.
type HistoryScanner struct {
	db     *gorm.DB
	engine graph.Engine
	logger *zap.Logger
}

// NewHistoryScanner creates a history scanner.
func NewHistoryScanner(db *gorm.DB, engine graph.Engine, logger *zap.Logger) *HistoryScanner {
	return &HistoryScanner{
		db:     db,
		engine: engine,
		logger: logger,
	}
}

// TakeSnapshot captures the current graph state for a given commit.
func (s *HistoryScanner) TakeSnapshot(ctx context.Context, workspaceID uuid.UUID, commitSHA, branch string) (*GraphSnapshot, error) {
	// Get current graph stats
	stats, err := s.engine.GetGraphStats(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("get graph stats: %w", err)
	}

	// Load all node and edge IDs for hashing
	nodeHash, err := s.computeNodeHash(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("compute node hash: %w", err)
	}
	edgeHash, err := s.computeEdgeHash(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("compute edge hash: %w", err)
	}

	snapshot := &GraphSnapshot{
		ID:          uuid.New(),
		WorkspaceID: workspaceID,
		CommitSHA:   commitSHA,
		Branch:      branch,
		NodeCount:   stats.TotalNodes,
		EdgeCount:   stats.TotalEdges,
		NodeHash:    nodeHash,
		EdgeHash:    edgeHash,
		Metadata: graph.JSONMap{
			"service_count":    stats.ServiceCount,
			"coverage_percent": stats.CoveragePercent,
			"nodes_by_type":    stats.NodesByType,
		},
		CreatedAt: time.Now().UTC(),
	}

	if err := s.db.WithContext(ctx).Create(snapshot).Error; err != nil {
		return nil, fmt.Errorf("save snapshot: %w", err)
	}

	s.logger.Info("Graph snapshot captured",
		zap.String("commit", commitSHA),
		zap.Int("nodes", stats.TotalNodes),
		zap.Int("edges", stats.TotalEdges),
	)

	return snapshot, nil
}

// ComputeDiff calculates what changed in the graph between two commits.
func (s *HistoryScanner) ComputeDiff(ctx context.Context, workspaceID uuid.UUID, fromCommit, toCommit string) (*GraphDiff, error) {
	// Load both snapshots
	var fromSnapshot, toSnapshot GraphSnapshot
	if err := s.db.WithContext(ctx).Where("workspace_id = ? AND commit_sha = ?", workspaceID, fromCommit).
		First(&fromSnapshot).Error; err != nil {
		return nil, fmt.Errorf("from snapshot not found: %w", err)
	}
	if err := s.db.WithContext(ctx).Where("workspace_id = ? AND commit_sha = ?", workspaceID, toCommit).
		First(&toSnapshot).Error; err != nil {
		return nil, fmt.Errorf("to snapshot not found: %w", err)
	}

	// If hashes match, no structural changes
	if fromSnapshot.NodeHash == toSnapshot.NodeHash && fromSnapshot.EdgeHash == toSnapshot.EdgeHash {
		diff := &GraphDiff{
			ID:          uuid.New(),
			WorkspaceID: workspaceID,
			FromCommit:  fromCommit,
			ToCommit:    toCommit,
			CreatedAt:   time.Now().UTC(),
		}
		s.db.WithContext(ctx).Create(diff)
		return diff, nil
	}

	// Load node IDs from each snapshot period
	fromNodes, err := s.loadNodeIDsAtCommit(ctx, workspaceID, fromCommit)
	if err != nil {
		return nil, err
	}
	toNodes, err := s.loadNodeIDsAtCommit(ctx, workspaceID, toCommit)
	if err != nil {
		return nil, err
	}

	// Compute set differences
	added, removed := setDiff(fromNodes, toNodes)

	diff := &GraphDiff{
		ID:          uuid.New(),
		WorkspaceID: workspaceID,
		FromCommit:  fromCommit,
		ToCommit:    toCommit,
		NodesAdded:  uuidsToJSONArray(added),
		NodesRemoved: uuidsToJSONArray(removed),
		CreatedAt:   time.Now().UTC(),
	}

	if err := s.db.WithContext(ctx).Create(diff).Error; err != nil {
		return nil, fmt.Errorf("save diff: %w", err)
	}

	s.logger.Info("Graph diff computed",
		zap.String("from", fromCommit[:8]),
		zap.String("to", toCommit[:8]),
		zap.Int("added", len(added)),
		zap.Int("removed", len(removed)),
	)

	return diff, nil
}

// GetHistory returns snapshots for a workspace, ordered by time.
func (s *HistoryScanner) GetHistory(ctx context.Context, workspaceID uuid.UUID, limit int) ([]GraphSnapshot, error) {
	if limit <= 0 {
		limit = 50
	}
	var snapshots []GraphSnapshot
	err := s.db.WithContext(ctx).
		Where("workspace_id = ?", workspaceID).
		Order("created_at DESC").
		Limit(limit).
		Find(&snapshots).Error
	return snapshots, err
}

// GetDiffBetween returns the diff between two commits.
func (s *HistoryScanner) GetDiffBetween(ctx context.Context, workspaceID uuid.UUID, fromCommit, toCommit string) (*GraphDiff, error) {
	var diff GraphDiff
	err := s.db.WithContext(ctx).
		Where("workspace_id = ? AND from_commit = ? AND to_commit = ?", workspaceID, fromCommit, toCommit).
		First(&diff).Error
	if err == gorm.ErrRecordNotFound {
		// Compute on demand
		return s.ComputeDiff(ctx, workspaceID, fromCommit, toCommit)
	}
	return &diff, err
}

// --- Helpers ---

func (s *HistoryScanner) computeNodeHash(ctx context.Context, workspaceID uuid.UUID) (string, error) {
	var ids []string
	err := s.db.WithContext(ctx).
		Model(&graph.GraphNode{}).
		Where("workspace_id = ?", workspaceID).
		Order("id ASC").
		Pluck("id", &ids).Error
	if err != nil {
		return "", err
	}
	return hashStrings(ids), nil
}

func (s *HistoryScanner) computeEdgeHash(ctx context.Context, workspaceID uuid.UUID) (string, error) {
	var ids []string
	err := s.db.WithContext(ctx).
		Model(&graph.GraphEdge{}).
		Where("workspace_id = ?", workspaceID).
		Order("id ASC").
		Pluck("id", &ids).Error
	if err != nil {
		return "", err
	}
	return hashStrings(ids), nil
}

func (s *HistoryScanner) loadNodeIDsAtCommit(ctx context.Context, workspaceID uuid.UUID, _ string) ([]uuid.UUID, error) {
	// For now, load current node IDs. Full commit-keyed snapshots require
	// storing node ID sets per snapshot (future enhancement).
	var ids []uuid.UUID
	err := s.db.WithContext(ctx).
		Model(&graph.GraphNode{}).
		Where("workspace_id = ?", workspaceID).
		Pluck("id", &ids).Error
	return ids, err
}

func hashStrings(strs []string) string {
	data, _ := json.Marshal(strs)
	h := sha256.Sum256(data)
	return fmt.Sprintf("%x", h[:8])
}

func setDiff(from, to []uuid.UUID) (added, removed []uuid.UUID) {
	fromSet := make(map[uuid.UUID]bool, len(from))
	toSet := make(map[uuid.UUID]bool, len(to))

	for _, id := range from {
		fromSet[id] = true
	}
	for _, id := range to {
		toSet[id] = true
	}

	for _, id := range to {
		if !fromSet[id] {
			added = append(added, id)
		}
	}
	for _, id := range from {
		if !toSet[id] {
			removed = append(removed, id)
		}
	}
	return
}

func uuidsToJSONArray(ids []uuid.UUID) graph.JSONArray {
	result := make(graph.JSONArray, len(ids))
	for i, id := range ids {
		result[i] = id.String()
	}
	return result
}
