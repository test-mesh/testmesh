// api/internal/plugins/neo4j_native_test.go
package plugins

import (
	"context"
	"testing"

	"go.uber.org/zap"
)

func TestNeo4jPlugin_Name(t *testing.T) {
	p := NewNeo4jNativePlugin(zap.NewNop())
	if p.Name() != "neo4j" {
		t.Errorf("expected name 'neo4j', got %q", p.Name())
	}
}

func TestNeo4jPlugin_UnknownAction(t *testing.T) {
	p := NewNeo4jNativePlugin(zap.NewNop())
	_, err := p.Execute(context.Background(), map[string]interface{}{"_action": "neo4j.unknown"})
	if err == nil {
		t.Fatal("expected error for unknown action")
	}
	if !contains(err.Error(), "unknown neo4j action") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestNeo4jPlugin_QueryMissingQuery(t *testing.T) {
	p := NewNeo4jNativePlugin(zap.NewNop())
	_, err := p.Execute(context.Background(), map[string]interface{}{
		"_action": "neo4j.query",
		"url":     "bolt://localhost:7687",
	})
	if err == nil {
		t.Fatal("expected error for missing query")
	}
	if !contains(err.Error(), "query is required") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestNeo4jPlugin_AssertMissingQuery(t *testing.T) {
	p := NewNeo4jNativePlugin(zap.NewNop())
	_, err := p.Execute(context.Background(), map[string]interface{}{
		"_action": "neo4j.assert",
	})
	if err == nil {
		t.Fatal("expected error for missing query")
	}
	if !contains(err.Error(), "query is required") {
		t.Errorf("unexpected error: %v", err)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(s) > 0 && containsStr(s, sub))
}

func containsStr(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
