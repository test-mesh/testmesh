package ai

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

// SemanticSearch provides vector-similarity search over workspace data
type SemanticSearch struct {
	embedder EmbeddingProvider
	store    VectorStore
}

// NewSemanticSearch creates a new semantic search engine
func NewSemanticSearch(embedder EmbeddingProvider, store VectorStore) *SemanticSearch {
	return &SemanticSearch{embedder: embedder, store: store}
}

// FindSimilarCode finds code changes similar to the query
func (ss *SemanticSearch) FindSimilarCode(ctx context.Context, workspaceID uuid.UUID, query string, topK int) ([]SearchResult, error) {
	return ss.search(ctx, workspaceID, "code_change", query, topK)
}

// FindSimilarNodes finds graph nodes similar to the query
func (ss *SemanticSearch) FindSimilarNodes(ctx context.Context, workspaceID uuid.UUID, query string, topK int) ([]SearchResult, error) {
	return ss.search(ctx, workspaceID, "node", query, topK)
}

// FindSimilarFlows finds flows similar to the query
func (ss *SemanticSearch) FindSimilarFlows(ctx context.Context, workspaceID uuid.UUID, query string, topK int) ([]SearchResult, error) {
	return ss.search(ctx, workspaceID, "flow", query, topK)
}

func (ss *SemanticSearch) search(ctx context.Context, workspaceID uuid.UUID, itemType, query string, topK int) ([]SearchResult, error) {
	embeddings, err := ss.embedder.Embed(ctx, []string{query})
	if err != nil {
		return nil, fmt.Errorf("embed query: %w", err)
	}
	if len(embeddings) == 0 || len(embeddings[0]) == 0 {
		return nil, fmt.Errorf("empty embedding returned")
	}

	return ss.store.Search(ctx, embeddings[0], SearchOpts{
		WorkspaceID: workspaceID,
		ItemType:    itemType,
		TopK:        topK,
	})
}
