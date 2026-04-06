package graph_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/graph"
	"gorm.io/gorm"
)

// TestEngineInterfaceCompiles verifies that both DefaultEngine and NoopEngine
// implement the full Engine interface, including the new GetRepoByURL and
// FindReposByURLFragment methods.
func TestEngineInterfaceCompiles(t *testing.T) {
	// NoopEngine must implement Engine
	var _ graph.Engine = graph.NewNoopEngine()

	// DefaultEngine must implement Engine
	// (using nil db/neo4j/logger is safe for compile-time check)
	var _ graph.Engine = graph.NewEngine(nil, nil, nil)
}

// TestGetRepoByURLNoopEngine verifies NoopEngine returns ErrGraphDisabled.
func TestGetRepoByURLNoopEngine(t *testing.T) {
	engine := graph.NewNoopEngine()
	_, err := engine.GetRepoByURL(context.Background(), "https://github.com/org/repo.git", uuid.New())
	if err != graph.ErrGraphDisabled {
		t.Errorf("expected ErrGraphDisabled, got %v", err)
	}
}

// TestFindReposByURLFragmentNoopEngine verifies NoopEngine returns ErrGraphDisabled.
func TestFindReposByURLFragmentNoopEngine(t *testing.T) {
	engine := graph.NewNoopEngine()
	_, err := engine.FindReposByURLFragment(context.Background(), "org/repo")
	if err != graph.ErrGraphDisabled {
		t.Errorf("expected ErrGraphDisabled, got %v", err)
	}
}

// mockDB is a minimal GORM mock for basic engine tests.
// This avoids external dependencies like SQLite/CGo.
type mockDB struct {
	*gorm.DB
	queries []string
}

// TestDefaultEngineImplementsEngine verifies DefaultEngine implements Engine.
func TestDefaultEngineImplementsEngine(t *testing.T) {
	// This compile-time check ensures DefaultEngine has all required methods.
	// Full integration testing would use a real PostgreSQL test DB
	// (see deployment/testing docs for PostgreSQL test setup).
	engine := graph.NewEngine(nil, nil, nil)
	var _ graph.Engine = engine
}
