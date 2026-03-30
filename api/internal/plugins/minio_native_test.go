// api/internal/plugins/minio_native_test.go
package plugins

import (
	"context"
	"testing"

	"go.uber.org/zap"
)

func TestMinioPlugin_Name(t *testing.T) {
	p := NewMinioNativePlugin(zap.NewNop())
	if p.Name() != "minio" {
		t.Errorf("expected name 'minio', got %q", p.Name())
	}
}

func TestMinioPlugin_UnknownAction(t *testing.T) {
	p := NewMinioNativePlugin(zap.NewNop())
	_, err := p.Execute(context.Background(), map[string]interface{}{"_action": "minio.unknown"})
	if err == nil {
		t.Fatal("expected error for unknown action")
	}
	if !contains(err.Error(), "unknown minio action") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestMinioPlugin_PutMissingBucket(t *testing.T) {
	p := NewMinioNativePlugin(zap.NewNop())
	_, err := p.Execute(context.Background(), map[string]interface{}{
		"_action": "minio.put",
		"object":  "test.txt",
		"data":    "hello",
	})
	if err == nil {
		t.Fatal("expected error for missing bucket")
	}
	if !contains(err.Error(), "bucket is required") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestMinioPlugin_PutMissingObject(t *testing.T) {
	p := NewMinioNativePlugin(zap.NewNop())
	_, err := p.Execute(context.Background(), map[string]interface{}{
		"_action": "minio.put",
		"bucket":  "testmesh",
		"data":    "hello",
	})
	if err == nil {
		t.Fatal("expected error for missing object")
	}
	if !contains(err.Error(), "object is required") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestMinioPlugin_PutMissingData(t *testing.T) {
	p := NewMinioNativePlugin(zap.NewNop())
	_, err := p.Execute(context.Background(), map[string]interface{}{
		"_action": "minio.put",
		"bucket":  "testmesh",
		"object":  "test.txt",
	})
	if err == nil {
		t.Fatal("expected error for missing data")
	}
	if !contains(err.Error(), "data is required") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestMinioPlugin_AssertMissingExists(t *testing.T) {
	p := NewMinioNativePlugin(zap.NewNop())
	_, err := p.Execute(context.Background(), map[string]interface{}{
		"_action": "minio.assert",
		"bucket":  "testmesh",
		"object":  "test.txt",
	})
	if err == nil {
		t.Fatal("expected error for missing exists field")
	}
	if !contains(err.Error(), "exists is required") {
		t.Errorf("unexpected error: %v", err)
	}
}
