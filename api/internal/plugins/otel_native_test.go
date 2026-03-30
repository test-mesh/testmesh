// api/internal/plugins/otel_native_test.go
package plugins

import (
	"context"
	"testing"

	"go.uber.org/zap"
)

func TestOtelPlugin_Name(t *testing.T) {
	p := NewOtelNativePlugin(zap.NewNop())
	if p.Name() != "otel" {
		t.Errorf("expected name 'otel', got %q", p.Name())
	}
}

func TestOtelPlugin_UnknownAction(t *testing.T) {
	p := NewOtelNativePlugin(zap.NewNop())
	_, err := p.Execute(context.Background(), map[string]interface{}{"_action": "otel.unknown"})
	if err == nil {
		t.Fatal("expected error for unknown action")
	}
	if !contains(err.Error(), "unknown otel action") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestOtelPlugin_InjectReturnsTraceContext(t *testing.T) {
	p := NewOtelNativePlugin(zap.NewNop())
	result, err := p.Execute(context.Background(), map[string]interface{}{
		"_action":   "otel.inject",
		"span_name": "test-span",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result["traceparent"] == "" {
		t.Error("expected non-empty traceparent")
	}
	if result["trace_id"] == "" {
		t.Error("expected non-empty trace_id")
	}
	if result["span_id"] == "" {
		t.Error("expected non-empty span_id")
	}
}

func TestOtelPlugin_AssertMissingBackendURL(t *testing.T) {
	p := NewOtelNativePlugin(zap.NewNop())
	_, err := p.Execute(context.Background(), map[string]interface{}{
		"_action":  "otel.assert",
		"trace_id": "abc123",
	})
	if err == nil {
		t.Fatal("expected error for missing backend_url")
	}
	if !contains(err.Error(), "backend_url is required") {
		t.Errorf("unexpected error: %v", err)
	}
}
