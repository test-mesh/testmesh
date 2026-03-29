package ai

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// VectorItem represents an item to store with its embedding
type VectorItem struct {
	ID          string
	WorkspaceID uuid.UUID
	ItemType    string // "node", "flow", "code_change"
	Content     string // original text that was embedded
	Metadata    map[string]string
	Embedding   []float32
}

// SearchOpts configures a vector similarity search
type SearchOpts struct {
	WorkspaceID uuid.UUID
	ItemType    string // filter by type, empty = all
	TopK        int
}

// SearchResult represents a single search result
type SearchResult struct {
	ID         string
	ItemType   string
	Content    string
	Metadata   map[string]string
	Score      float64
}

// VectorStore stores and retrieves vector embeddings
type VectorStore interface {
	Upsert(ctx context.Context, items []VectorItem) error
	Search(ctx context.Context, embedding []float32, opts SearchOpts) ([]SearchResult, error)
	Delete(ctx context.Context, ids []string) error
}

// PgVectorStore implements VectorStore using pgvector
type PgVectorStore struct {
	db         *gorm.DB
	dimensions int
}

// NewPgVectorStore creates a new pgvector-backed store
func NewPgVectorStore(db *gorm.DB, dimensions int) *PgVectorStore {
	return &PgVectorStore{db: db, dimensions: dimensions}
}

func (s *PgVectorStore) Upsert(ctx context.Context, items []VectorItem) error {
	for _, item := range items {
		// Use raw SQL for pgvector operations
		err := s.db.WithContext(ctx).Exec(`
			INSERT INTO embeddings (id, workspace_id, item_type, content, metadata, embedding)
			VALUES (?, ?, ?, ?, ?::jsonb, ?::vector)
			ON CONFLICT (id) DO UPDATE SET
				content = EXCLUDED.content,
				metadata = EXCLUDED.metadata,
				embedding = EXCLUDED.embedding,
				updated_at = NOW()
		`, item.ID, item.WorkspaceID, item.ItemType, item.Content,
			metadataToJSON(item.Metadata), float32SliceToString(item.Embedding)).Error
		if err != nil {
			return fmt.Errorf("upsert embedding %s: %w", item.ID, err)
		}
	}
	return nil
}

func (s *PgVectorStore) Search(ctx context.Context, embedding []float32, opts SearchOpts) ([]SearchResult, error) {
	topK := opts.TopK
	if topK <= 0 {
		topK = 10
	}

	query := `
		SELECT id, item_type, content, metadata, 1 - (embedding <=> ?::vector) AS score
		FROM embeddings
		WHERE workspace_id = ?
	`
	args := []interface{}{float32SliceToString(embedding), opts.WorkspaceID}

	if opts.ItemType != "" {
		query += " AND item_type = ?"
		args = append(args, opts.ItemType)
	}

	query += " ORDER BY embedding <=> ?::vector LIMIT ?"
	args = append(args, float32SliceToString(embedding), topK)

	rows, err := s.db.WithContext(ctx).Raw(query, args...).Rows()
	if err != nil {
		return nil, fmt.Errorf("search embeddings: %w", err)
	}
	defer rows.Close()

	var results []SearchResult
	for rows.Next() {
		var r SearchResult
		var metadataJSON string
		if err := rows.Scan(&r.ID, &r.ItemType, &r.Content, &metadataJSON, &r.Score); err != nil {
			return nil, fmt.Errorf("scan result: %w", err)
		}
		r.Metadata = jsonToMetadata(metadataJSON)
		results = append(results, r)
	}
	return results, nil
}

func (s *PgVectorStore) Delete(ctx context.Context, ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	return s.db.WithContext(ctx).Exec("DELETE FROM embeddings WHERE id = ANY(?)", ids).Error
}

// Helper functions

func float32SliceToString(v []float32) string {
	if len(v) == 0 {
		return "[]"
	}
	s := "["
	for i, f := range v {
		if i > 0 {
			s += ","
		}
		s += fmt.Sprintf("%g", f)
	}
	s += "]"
	return s
}

func metadataToJSON(m map[string]string) string {
	if m == nil {
		return "{}"
	}
	b, _ := json.Marshal(m)
	return string(b)
}

func jsonToMetadata(s string) map[string]string {
	m := make(map[string]string)
	json.Unmarshal([]byte(s), &m)
	return m
}
