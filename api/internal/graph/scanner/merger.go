package scanner

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/graph"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// CrossRepoMerger detects cross-repo dependencies and writes them as graph edges.
type CrossRepoMerger struct {
	db     *gorm.DB
	logger *zap.Logger
}

// NewCrossRepoMerger creates a new CrossRepoMerger.
func NewCrossRepoMerger(db *gorm.DB, _ graph.Engine, logger *zap.Logger) *CrossRepoMerger {
	return &CrossRepoMerger{db: db, logger: logger}
}

// EnqueueForWorkspace creates a WorkspaceMergeJob record and runs the merge synchronously.
// Designed to be called from a goroutine: go merger.EnqueueForWorkspace(ctx, workspaceID, scanID)
func (m *CrossRepoMerger) EnqueueForWorkspace(ctx context.Context, workspaceID, triggerScanID uuid.UUID) {
	job := &graph.WorkspaceMergeJob{
		WorkspaceID:   workspaceID,
		TriggerScanID: triggerScanID,
		Status:        "running",
		StartedAt:     time.Now().UTC(),
	}
	if err := m.db.Create(job).Error; err != nil {
		m.logger.Error("failed to create merge job record", zap.Error(err))
		return
	}

	edgesAdded, edgesUpdated, runErr := m.run(ctx, workspaceID)

	now := time.Now().UTC()
	job.CompletedAt = &now
	job.EdgesAdded = edgesAdded
	job.EdgesUpdated = edgesUpdated

	if runErr != nil {
		job.Status = "failed"
		job.Error = runErr.Error()
		m.logger.Error("cross-repo merge failed",
			zap.String("workspace_id", workspaceID.String()),
			zap.Error(runErr),
		)
	} else {
		job.Status = "completed"
		m.logger.Info("cross-repo merge completed",
			zap.String("workspace_id", workspaceID.String()),
			zap.Int("edges_added", edgesAdded),
			zap.Int("edges_updated", edgesUpdated),
		)
	}

	if err := m.db.Save(job).Error; err != nil {
		m.logger.Error("failed to update merge job record", zap.Error(err))
	}
}

// run performs the cross-repo merge and returns (edgesAdded, edgesUpdated, error).
func (m *CrossRepoMerger) run(ctx context.Context, workspaceID uuid.UUID) (int, int, error) {
	var nodes []graph.GraphNode
	if err := m.db.WithContext(ctx).Where("workspace_id = ?", workspaceID).Find(&nodes).Error; err != nil {
		return 0, 0, fmt.Errorf("failed to load graph nodes: %w", err)
	}
	if len(nodes) == 0 {
		return 0, 0, nil
	}

	// Build lookup maps
	serviceNodes := map[string][]graph.GraphNode{}  // lowercase service name → nodes
	topicProducers := map[string][]graph.GraphNode{} // topic name → producer nodes
	topicConsumers := map[string][]graph.GraphNode{} // topic name → consumer nodes

	for _, n := range nodes {
		if n.Service != "" {
			key := strings.ToLower(n.Service)
			serviceNodes[key] = append(serviceNodes[key], n)
		}
		if n.Type == graph.NodeTypeTopic {
			topic := strings.ToLower(n.Name)
			dir, _ := n.Metadata["direction"].(string)
			if dir == "producer" || dir == "publish" {
				topicProducers[topic] = append(topicProducers[topic], n)
			} else if dir == "consumer" || dir == "subscribe" {
				topicConsumers[topic] = append(topicConsumers[topic], n)
			}
		}
	}

	var newEdges []graph.GraphEdge

	// HTTP dependency detection: nodes with env_var metadata matching *_SERVICE_URL
	reServiceURL := regexp.MustCompile(`(?i)^(.+)_SERVICE_URL$`)
	for _, n := range nodes {
		envVar, _ := n.Metadata["env_var"].(string)
		if envVar == "" {
			continue
		}
		matches := reServiceURL.FindStringSubmatch(envVar)
		if matches == nil {
			continue
		}
		prefix := strings.ToLower(strings.ReplaceAll(matches[1], "_", "-"))
		targetNodes := findServiceNodes(serviceNodes, prefix, n.RepoID)
		for _, target := range targetNodes {
			newEdges = append(newEdges, graph.GraphEdge{
				ID:          uuid.New(),
				WorkspaceID: workspaceID,
				Neo4jID:     fmt.Sprintf("cross-repo-http-%s-%s", n.ID, target.ID),
				Type:        graph.EdgeTypeCalls,
				FromNodeID:  n.ID,
				ToNodeID:    target.ID,
				SourceLayer: graph.SourceLayerCrossRepo,
				Properties:  graph.JSONMap{"via": "http", "env_var": envVar},
				Confidence:  0.85,
			})
		}
	}

	// Kafka dependency detection: match producers to consumers by topic name across repos
	for topic, producers := range topicProducers {
		consumers, ok := topicConsumers[topic]
		if !ok {
			continue
		}
		for _, producer := range producers {
			for _, consumer := range consumers {
				if producer.RepoID != nil && consumer.RepoID != nil && *producer.RepoID == *consumer.RepoID {
					continue // same repo — skip
				}
				newEdges = append(newEdges, graph.GraphEdge{
					ID:          uuid.New(),
					WorkspaceID: workspaceID,
					Neo4jID:     fmt.Sprintf("cross-repo-kafka-%s-%s-%s", topic, producer.ID, consumer.ID),
					Type:        graph.EdgeTypePublishes,
					FromNodeID:  producer.ID,
					ToNodeID:    consumer.ID,
					SourceLayer: graph.SourceLayerCrossRepo,
					Properties:  graph.JSONMap{"via": "kafka", "topic": topic},
					Confidence:  0.9,
				})
			}
		}
	}

	if len(newEdges) == 0 {
		return 0, 0, nil
	}

	added := 0
	updated := 0
	for _, edge := range newEdges {
		// Use FirstOrCreate keyed on Neo4jID to avoid duplicates on re-runs
		var existing graph.GraphEdge
		result := m.db.Where("neo4j_id = ?", edge.Neo4jID).First(&existing)
		if result.Error != nil {
			// Not found — create it
			if err := m.db.Create(&edge).Error; err != nil {
				m.logger.Warn("failed to create cross-repo edge",
					zap.String("neo4j_id", edge.Neo4jID),
					zap.Error(err),
				)
				continue
			}
			added++
		} else {
			updated++
		}
	}

	return added, updated, nil
}

// findServiceNodes finds service nodes in other repos matching the given name prefix.
// Tries: prefix, prefix+"-service", prefix+"_service".
func findServiceNodes(serviceNodes map[string][]graph.GraphNode, prefix string, fromRepoID *uuid.UUID) []graph.GraphNode {
	candidates := []string{prefix, prefix + "-service", prefix + "_service"}
	var result []graph.GraphNode
	seen := map[uuid.UUID]bool{}
	for _, key := range candidates {
		for _, n := range serviceNodes[key] {
			if seen[n.ID] {
				continue
			}
			if fromRepoID != nil && n.RepoID != nil && *fromRepoID == *n.RepoID {
				continue // exclude same repo
			}
			seen[n.ID] = true
			result = append(result, n)
		}
	}
	return result
}
