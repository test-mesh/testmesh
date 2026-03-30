// api/internal/plugins/loki_native_test.go
package plugins

import (
	"context"
	"testing"

	"go.uber.org/zap"
)

func TestLokiPlugin_Name(t *testing.T) {
	p := NewLokiNativePlugin(zap.NewNop())
	if p.Name() != "loki" {
		t.Errorf("expected name 'loki', got %q", p.Name())
	}
}

func TestLokiPlugin_UnknownAction(t *testing.T) {
	p := NewLokiNativePlugin(zap.NewNop())
	_, err := p.Execute(context.Background(), map[string]interface{}{"_action": "loki.unknown"})
	if err == nil {
		t.Fatal("expected error for unknown action")
	}
	if !contains(err.Error(), "unknown loki action") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestLokiPlugin_QueryMissingURL(t *testing.T) {
	p := NewLokiNativePlugin(zap.NewNop())
	_, err := p.Execute(context.Background(), map[string]interface{}{
		"_action": "loki.query",
		"query":   `{service="test"}`,
	})
	if err == nil {
		t.Fatal("expected error for missing url")
	}
	if !contains(err.Error(), "url is required") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestLokiPlugin_QueryMissingQuery(t *testing.T) {
	p := NewLokiNativePlugin(zap.NewNop())
	_, err := p.Execute(context.Background(), map[string]interface{}{
		"_action": "loki.query",
		"url":     "http://loki:3100",
	})
	if err == nil {
		t.Fatal("expected error for missing query")
	}
	if !contains(err.Error(), "query is required") {
		t.Errorf("unexpected error: %v", err)
	}
}
