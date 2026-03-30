// api/internal/plugins/prometheus_native_test.go
package plugins

import (
	"context"
	"testing"

	"go.uber.org/zap"
)

func TestPrometheusPlugin_Name(t *testing.T) {
	p := NewPrometheusNativePlugin(zap.NewNop())
	if p.Name() != "prometheus" {
		t.Errorf("expected name 'prometheus', got %q", p.Name())
	}
}

func TestPrometheusPlugin_UnknownAction(t *testing.T) {
	p := NewPrometheusNativePlugin(zap.NewNop())
	_, err := p.Execute(context.Background(), map[string]interface{}{"_action": "prometheus.unknown"})
	if err == nil {
		t.Fatal("expected error for unknown action")
	}
	if !contains(err.Error(), "unknown prometheus action") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestPrometheusPlugin_QueryMissingURL(t *testing.T) {
	p := NewPrometheusNativePlugin(zap.NewNop())
	_, err := p.Execute(context.Background(), map[string]interface{}{
		"_action": "prometheus.query",
		"query":   "up",
	})
	if err == nil {
		t.Fatal("expected error for missing url")
	}
	if !contains(err.Error(), "url is required") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestPrometheusPlugin_QueryMissingQuery(t *testing.T) {
	p := NewPrometheusNativePlugin(zap.NewNop())
	_, err := p.Execute(context.Background(), map[string]interface{}{
		"_action": "prometheus.query",
		"url":     "http://prometheus:9090",
	})
	if err == nil {
		t.Fatal("expected error for missing query")
	}
	if !contains(err.Error(), "query is required") {
		t.Errorf("unexpected error: %v", err)
	}
}
