package graph

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// EmbeddingProvider generates vector embeddings for text.
type EmbeddingProvider interface {
	// Embed returns a vector embedding for the given text.
	Embed(ctx context.Context, text string) ([]float32, error)
	// EmbedBatch returns embeddings for multiple texts.
	EmbedBatch(ctx context.Context, texts []string) ([][]float32, error)
	// Dimension returns the embedding vector dimension.
	Dimension() int
}

// EmbeddingService manages node embeddings for semantic search.
type EmbeddingService struct {
	db       *gorm.DB
	provider EmbeddingProvider
	logger   *zap.Logger
}

// NewEmbeddingService creates a new embedding service.
// Returns nil if provider is nil (embeddings disabled).
func NewEmbeddingService(db *gorm.DB, provider EmbeddingProvider, logger *zap.Logger) *EmbeddingService {
	if provider == nil {
		return nil
	}
	return &EmbeddingService{
		db:       db,
		provider: provider,
		logger:   logger,
	}
}

// EmbedNode generates and stores an embedding for a single node.
func (s *EmbeddingService) EmbedNode(ctx context.Context, node *GraphNode) error {
	text := nodeToEmbeddingText(node)
	embedding, err := s.provider.Embed(ctx, text)
	if err != nil {
		return fmt.Errorf("failed to embed node %s: %w", node.ID, err)
	}

	return s.storeEmbedding(ctx, node.ID, embedding)
}

// EmbedNodes generates and stores embeddings for a batch of nodes.
func (s *EmbeddingService) EmbedNodes(ctx context.Context, nodes []GraphNode) error {
	if len(nodes) == 0 {
		return nil
	}

	texts := make([]string, len(nodes))
	for i, node := range nodes {
		texts[i] = nodeToEmbeddingText(&node)
	}

	embeddings, err := s.provider.EmbedBatch(ctx, texts)
	if err != nil {
		return fmt.Errorf("failed to batch embed %d nodes: %w", len(nodes), err)
	}

	for i, node := range nodes {
		if err := s.storeEmbedding(ctx, node.ID, embeddings[i]); err != nil {
			s.logger.Error("Failed to store embedding",
				zap.String("node_id", node.ID.String()),
				zap.Error(err),
			)
		}
	}

	return nil
}

// SemanticSearch finds nodes similar to the query text using vector similarity.
func (s *EmbeddingService) SemanticSearch(ctx context.Context, workspaceID uuid.UUID, query string, limit int) ([]GraphNode, error) {
	if limit <= 0 {
		limit = 20
	}

	queryEmbedding, err := s.provider.Embed(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to embed query: %w", err)
	}

	// Use pgvector cosine distance operator (<=>)
	vectorStr := float32SliceToSQL(queryEmbedding)

	var nodes []GraphNode
	err = s.db.WithContext(ctx).Raw(`
		SELECT gn.*
		FROM graph.graph_nodes gn
		WHERE gn.workspace_id = ?
		  AND gn.embedding IS NOT NULL
		ORDER BY gn.embedding <=> ?::vector
		LIMIT ?
	`, workspaceID, vectorStr, limit).Scan(&nodes).Error

	if err != nil {
		return nil, fmt.Errorf("semantic search failed: %w", err)
	}

	return nodes, nil
}

// RemoveEmbedding clears the embedding for a node.
func (s *EmbeddingService) RemoveEmbedding(ctx context.Context, nodeID uuid.UUID) error {
	return s.db.WithContext(ctx).Exec(
		"UPDATE graph.graph_nodes SET embedding = NULL WHERE id = ?", nodeID,
	).Error
}

// storeEmbedding saves a vector embedding to the node's embedding column.
func (s *EmbeddingService) storeEmbedding(ctx context.Context, nodeID uuid.UUID, embedding []float32) error {
	vectorStr := float32SliceToSQL(embedding)
	return s.db.WithContext(ctx).Exec(
		"UPDATE graph.graph_nodes SET embedding = ?::vector WHERE id = ?",
		vectorStr, nodeID,
	).Error
}

// nodeToEmbeddingText creates a text representation of a node suitable for embedding.
// Combines type, name, service, source info, and tags into a searchable string.
func nodeToEmbeddingText(node *GraphNode) string {
	parts := []string{
		string(node.Type),
		node.Name,
	}

	if node.Service != "" {
		parts = append(parts, "service:"+node.Service)
	}
	if node.SourceFile != "" {
		parts = append(parts, "file:"+node.SourceFile)
	}
	if node.Tags != nil {
		for _, tag := range node.Tags {
			parts = append(parts, "tag:"+tag)
		}
	}

	// Include select metadata fields
	if node.Metadata != nil {
		if desc, ok := node.Metadata["description"].(string); ok {
			parts = append(parts, desc)
		}
		if method, ok := node.Metadata["method"].(string); ok {
			parts = append(parts, method)
		}
		if path, ok := node.Metadata["path"].(string); ok {
			parts = append(parts, path)
		}
	}

	return strings.Join(parts, " ")
}

// float32SliceToSQL converts a float32 slice to a pgvector-compatible SQL string.
// Format: [0.1,0.2,0.3]
func float32SliceToSQL(v []float32) string {
	var b strings.Builder
	b.WriteByte('[')
	for i, f := range v {
		if i > 0 {
			b.WriteByte(',')
		}
		fmt.Fprintf(&b, "%g", f)
	}
	b.WriteByte(']')
	return b.String()
}

// --- NoopEmbeddingProvider ---

// NoopEmbeddingProvider is a placeholder when no embedding provider is configured.
type NoopEmbeddingProvider struct{}

func (n *NoopEmbeddingProvider) Embed(_ context.Context, _ string) ([]float32, error) {
	return nil, fmt.Errorf("no embedding provider configured")
}

func (n *NoopEmbeddingProvider) EmbedBatch(_ context.Context, _ []string) ([][]float32, error) {
	return nil, fmt.Errorf("no embedding provider configured")
}

func (n *NoopEmbeddingProvider) Dimension() int {
	return 0
}
