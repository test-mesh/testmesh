package graph

import (
	"context"
	"reflect"
	"strings"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// layerPrecedence defines merge precedence: higher index wins.
// runtime > code > spec > infra > flow > history
var layerPrecedence = map[SourceLayer]int{
	SourceLayerHistory: 0,
	SourceLayerFlow:    1,
	SourceLayerInfra:   2,
	SourceLayerSpec:    3,
	SourceLayerCode:    4,
	SourceLayerRuntime: 5,
}

// EmbeddingIndexer is an optional hook for indexing nodes after merge (avoids circular import with ai package)
type EmbeddingIndexer interface {
	IndexNodes(workspaceID uuid.UUID, nodes []GraphNode)
}

// MergeEngine handles identity resolution and conflict detection when
// scanner output is merged into the existing graph.
type MergeEngine struct {
	db               *gorm.DB
	engine           Engine
	logger           *zap.Logger
	embeddingIndexer EmbeddingIndexer
}

// NewMergeEngine creates a merge engine.
func NewMergeEngine(db *gorm.DB, engine Engine, logger *zap.Logger) *MergeEngine {
	return &MergeEngine{
		db:     db,
		engine: engine,
		logger: logger,
	}
}

// SetEmbeddingIndexer sets the optional embedding indexer for post-merge indexing.
func (m *MergeEngine) SetEmbeddingIndexer(indexer EmbeddingIndexer) {
	m.embeddingIndexer = indexer
}

// MergeResult tracks what happened during a merge pass.
type MergeResult struct {
	NodesCreated  int
	NodesUpdated  int
	EdgesCreated  int
	EdgesUpdated  int
	ConflictsFound int
	IDMapping     map[uuid.UUID]uuid.UUID // scanner-generated ID → existing graph ID
}

// MergeNodes resolves scanner-produced nodes against existing graph nodes,
// merges properties by layer precedence, and detects conflicts.
// Returns a mapping from scanner node IDs to resolved graph node IDs.
func (m *MergeEngine) MergeNodes(ctx context.Context, workspaceID uuid.UUID, incoming []GraphNode) (*MergeResult, error) {
	result := &MergeResult{
		IDMapping: make(map[uuid.UUID]uuid.UUID),
	}

	if len(incoming) == 0 {
		return result, nil
	}

	// Load existing nodes for this workspace to match against
	existing, err := m.loadExistingNodes(ctx, workspaceID)
	if err != nil {
		return nil, err
	}

	// Build lookup indexes for fast matching
	byTypeAndName := buildNodeIndex(existing)

	// Track nodes that were created or updated for post-merge indexing
	var mergedNodes []GraphNode

	for i := range incoming {
		node := &incoming[i]
		node.WorkspaceID = workspaceID

		match := m.findMatchingNode(node, byTypeAndName)

		if match != nil {
			// Map scanner ID → existing ID
			result.IDMapping[node.ID] = match.ID

			// Merge properties based on layer precedence
			updated, conflict := m.mergeNodeProperties(match, node)
			if conflict != nil {
				conflict.WorkspaceID = workspaceID
				if err := m.engine.CreateConflict(ctx, conflict); err != nil {
					m.logger.Warn("Failed to record conflict", zap.Error(err))
				}
				result.ConflictsFound++
			}

			if updated {
				match.UpdatedAt = time.Now().UTC()
				if err := m.engine.UpsertNode(ctx, match); err != nil {
					m.logger.Error("Failed to update merged node", zap.Error(err), zap.String("node_id", match.ID.String()))
					continue
				}
				result.NodesUpdated++
				mergedNodes = append(mergedNodes, *match)
			}
		} else {
			// New node — keep the scanner-generated ID
			result.IDMapping[node.ID] = node.ID
			if err := m.engine.UpsertNode(ctx, node); err != nil {
				m.logger.Error("Failed to create node", zap.Error(err), zap.String("name", node.Name))
				continue
			}
			result.NodesCreated++
			mergedNodes = append(mergedNodes, *node)
			// Add to in-memory index so duplicate nodes later in the same batch
			// (e.g. shared Kafka topics seen by multiple services) resolve to this ID.
			key := nodeIndexKey(node.Type, node.Name)
			byTypeAndName[key] = append(byTypeAndName[key], node)
		}
	}

	// Index merged nodes for semantic search
	if m.embeddingIndexer != nil && len(mergedNodes) > 0 {
		m.embeddingIndexer.IndexNodes(workspaceID, mergedNodes)
	}

	return result, nil
}

// MergeEdges resolves edges using the ID mapping from MergeNodes, deduplicates, and upserts.
func (m *MergeEngine) MergeEdges(ctx context.Context, workspaceID uuid.UUID, incoming []GraphEdge, idMapping map[uuid.UUID]uuid.UUID) error {
	if len(incoming) == 0 {
		return nil
	}

	// Remap edge node IDs to resolved graph IDs
	for i := range incoming {
		incoming[i].WorkspaceID = workspaceID

		if mapped, ok := idMapping[incoming[i].FromNodeID]; ok {
			incoming[i].FromNodeID = mapped
		}
		if mapped, ok := idMapping[incoming[i].ToNodeID]; ok {
			incoming[i].ToNodeID = mapped
		}
	}

	// Deduplicate: same from + to + type → merge properties
	deduped := m.deduplicateEdges(incoming)

	// Check against existing edges
	for i := range deduped {
		edge := &deduped[i]
		existing, err := m.findExistingEdge(ctx, workspaceID, edge)
		if err != nil {
			continue
		}

		if existing != nil {
			// Merge: higher precedence layer wins confidence
			if layerPrecedence[edge.SourceLayer] >= layerPrecedence[existing.SourceLayer] {
				existing.Confidence = edge.Confidence
				existing.SourceLayer = edge.SourceLayer
				mergeJSONMaps(existing.Properties, edge.Properties)
			}
			if err := m.engine.UpsertEdge(ctx, existing); err != nil {
				m.logger.Warn("Failed to update edge", zap.Error(err))
			}
		} else {
			if err := m.engine.UpsertEdge(ctx, edge); err != nil {
				m.logger.Warn("Failed to create edge", zap.Error(err))
			}
		}
	}

	return nil
}

// findMatchingNode uses the identity resolution chain:
// 1. Exact match (same type + name)
// 2. Pattern match (URL templates)
// 3. Semantic match would go here (pgvector, not yet wired)
func (m *MergeEngine) findMatchingNode(incoming *GraphNode, index map[string][]*GraphNode) *GraphNode {
	// 1. Exact match: same type + normalized name
	key := nodeIndexKey(incoming.Type, incoming.Name)
	if candidates, ok := index[key]; ok && len(candidates) > 0 {
		// Prefer same service if available
		for _, c := range candidates {
			if c.Service == incoming.Service {
				return c
			}
		}
		return candidates[0]
	}

	// 2. Pattern match for API endpoints: /orders/{id} matches /orders/:id
	if incoming.Type == NodeTypeAPIEndpoint {
		normalizedIncoming := normalizeURLPattern(incoming.Name)
		for _, candidates := range index {
			for _, c := range candidates {
				if c.Type == NodeTypeAPIEndpoint {
					normalizedExisting := normalizeURLPattern(c.Name)
					if normalizedIncoming == normalizedExisting {
						return c
					}
				}
			}
		}
	}

	// 3. Service name fuzzy match (same type, similar name)
	if incoming.Type == NodeTypeService {
		for _, candidates := range index {
			for _, c := range candidates {
				if c.Type == NodeTypeService && serviceNamesMatch(c.Name, incoming.Name) {
					return c
				}
			}
		}
	}

	return nil
}

// mergeNodeProperties merges incoming node properties into existing node
// based on layer precedence. Returns true if existing was modified, plus any conflict.
func (m *MergeEngine) mergeNodeProperties(existing, incoming *GraphNode) (bool, *GraphConflict) {
	updated := false
	incomingPrecedence := layerPrecedence[incoming.SourceLayer]
	existingPrecedence := layerPrecedence[existing.SourceLayer]

	// Higher precedence layer wins for core properties
	if incomingPrecedence >= existingPrecedence {
		if incoming.Service != "" && incoming.Service != existing.Service {
			existing.Service = incoming.Service
			updated = true
		}
		if incoming.SourceFile != "" {
			existing.SourceFile = incoming.SourceFile
			updated = true
		}
		if incoming.Confidence > existing.Confidence {
			existing.Confidence = incoming.Confidence
			updated = true
		}
		existing.SourceLayer = incoming.SourceLayer
		existing.Version++
		updated = true
	}

	// Always merge metadata (incoming overwrites conflicting keys)
	if len(incoming.Metadata) > 0 {
		if existing.Metadata == nil {
			existing.Metadata = make(JSONMap)
		}
		for k, v := range incoming.Metadata {
			existingVal, exists := existing.Metadata[k]
			if exists && !reflect.DeepEqual(existingVal, v) && incomingPrecedence < existingPrecedence {
				// Lower precedence trying to overwrite — flag as conflict
				nodeAID := existing.ID
				nodeBID := incoming.ID
				return updated, &GraphConflict{
					ID:         uuid.New(),
					NodeA:      &nodeAID,
					NodeB:      &nodeBID,
					Type:       ConflictTypeContradiction,
					Resolution: ConflictPending,
					Details: JSONMap{
						"field":          "metadata." + k,
						"existing_value": existingVal,
						"incoming_value": v,
						"existing_layer": string(existing.SourceLayer),
						"incoming_layer": string(incoming.SourceLayer),
					},
				}
			}
			existing.Metadata[k] = v
			updated = true
		}
	}

	// Merge tags (union)
	if len(incoming.Tags) > 0 {
		tagSet := make(map[string]bool)
		for _, t := range existing.Tags {
			tagSet[t] = true
		}
		for _, t := range incoming.Tags {
			if !tagSet[t] {
				existing.Tags = append(existing.Tags, t)
				updated = true
			}
		}
	}

	return updated, nil
}

// loadExistingNodes retrieves all nodes for a workspace.
func (m *MergeEngine) loadExistingNodes(ctx context.Context, workspaceID uuid.UUID) ([]GraphNode, error) {
	var nodes []GraphNode
	if err := m.db.WithContext(ctx).
		Where("workspace_id = ?", workspaceID).
		Find(&nodes).Error; err != nil {
		return nil, err
	}
	return nodes, nil
}

// findExistingEdge looks for an edge with the same from/to/type.
func (m *MergeEngine) findExistingEdge(ctx context.Context, workspaceID uuid.UUID, edge *GraphEdge) (*GraphEdge, error) {
	var existing GraphEdge
	err := m.db.WithContext(ctx).
		Where("workspace_id = ? AND from_node = ? AND to_node = ? AND type = ?",
			workspaceID, edge.FromNodeID, edge.ToNodeID, edge.Type).
		First(&existing).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &existing, nil
}

// deduplicateEdges merges edges with same from+to+type within the incoming batch.
func (m *MergeEngine) deduplicateEdges(edges []GraphEdge) []GraphEdge {
	seen := make(map[string]int) // key → index in result
	var result []GraphEdge

	for _, e := range edges {
		key := edgeDedupeKey(e)
		if idx, ok := seen[key]; ok {
			// Merge properties into existing
			mergeJSONMaps(result[idx].Properties, e.Properties)
			if e.Confidence > result[idx].Confidence {
				result[idx].Confidence = e.Confidence
			}
		} else {
			seen[key] = len(result)
			result = append(result, e)
		}
	}

	return result
}

// --- Helpers ---

func buildNodeIndex(nodes []GraphNode) map[string][]*GraphNode {
	idx := make(map[string][]*GraphNode, len(nodes))
	for i := range nodes {
		key := nodeIndexKey(nodes[i].Type, nodes[i].Name)
		idx[key] = append(idx[key], &nodes[i])
	}
	return idx
}

func nodeIndexKey(nodeType NodeType, name string) string {
	return string(nodeType) + ":" + strings.ToLower(strings.TrimSpace(name))
}

func edgeDedupeKey(e GraphEdge) string {
	return e.FromNodeID.String() + "→" + e.ToNodeID.String() + ":" + string(e.Type)
}

// normalizeURLPattern converts URL parameter styles to a canonical form.
// /orders/{id} and /orders/:id both become /orders/{param}
func normalizeURLPattern(endpoint string) string {
	// Split method from path (e.g. "GET /orders/{id}")
	parts := strings.SplitN(endpoint, " ", 2)
	method := ""
	path := endpoint
	if len(parts) == 2 {
		method = strings.ToUpper(parts[0])
		path = parts[1]
	}

	segments := strings.Split(path, "/")
	for i, seg := range segments {
		if seg == "" {
			continue
		}
		// Normalize parameter styles
		if strings.HasPrefix(seg, "{") || strings.HasPrefix(seg, ":") ||
			strings.HasPrefix(seg, "<") || seg == "*" {
			segments[i] = "{param}"
		}
	}

	normalized := strings.Join(segments, "/")
	if method != "" {
		return method + " " + normalized
	}
	return normalized
}

// serviceNamesMatch checks if two service names refer to the same service.
// Handles common variations: my-service == my_service == myservice
func serviceNamesMatch(a, b string) bool {
	normalize := func(s string) string {
		s = strings.ToLower(s)
		s = strings.ReplaceAll(s, "-", "")
		s = strings.ReplaceAll(s, "_", "")
		s = strings.ReplaceAll(s, ".", "")
		return s
	}
	return normalize(a) == normalize(b)
}

func mergeJSONMaps(dst, src JSONMap) {
	if dst == nil || src == nil {
		return
	}
	for k, v := range src {
		dst[k] = v
	}
}

// mergeEdgeMetrics incrementally updates runtime-sourced edge metrics instead of overwriting.
// Used when runtime layer edges are merged with existing edges.
func mergeEdgeMetrics(existing, incoming JSONMap) {
	if existing == nil || incoming == nil {
		return
	}

	// Increment call_count
	if incomingCount, ok := toFloat64(incoming["call_count"]); ok {
		existingCount, _ := toFloat64(existing["call_count"])
		existing["call_count"] = existingCount + incomingCount
	}

	// Update avg_duration_ms incrementally
	if incomingAvg, ok := toFloat64(incoming["avg_duration_ms"]); ok {
		existingAvg, _ := toFloat64(existing["avg_duration_ms"])
		existingCount, _ := toFloat64(existing["call_count"])
		if existingCount > 0 {
			// Weighted average
			existing["avg_duration_ms"] = existingAvg + (incomingAvg-existingAvg)/existingCount
		} else {
			existing["avg_duration_ms"] = incomingAvg
		}
	}

	// Increment error_count
	if incomingErrors, ok := toFloat64(incoming["error_count"]); ok {
		existingErrors, _ := toFloat64(existing["error_count"])
		existing["error_count"] = existingErrors + incomingErrors
	}

	// Update last_observed_at (take the latest)
	if v, ok := incoming["last_observed_at"]; ok {
		existing["last_observed_at"] = v
	}
}

func toFloat64(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	default:
		return 0, false
	}
}
