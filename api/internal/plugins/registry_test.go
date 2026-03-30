// api/internal/plugins/registry_test.go
package plugins

import (
	"testing"

	"go.uber.org/zap"
)

func TestAllNativePluginsRegistered(t *testing.T) {
	logger := zap.NewNop()
	pluginMap := map[string]ActionPlugin{
		"kafka":      NewKafkaNativePlugin(logger),
		"postgresql": NewPostgreSQLNativePlugin(logger),
		"redis":      NewRedisNativePlugin(logger),
		"neo4j":      NewNeo4jNativePlugin(logger),
		"minio":      NewMinioNativePlugin(logger),
		"otel":       NewOtelNativePlugin(logger),
		"loki":       NewLokiNativePlugin(logger),
		"prometheus": NewPrometheusNativePlugin(logger),
	}

	for name, plugin := range pluginMap {
		if plugin.Name() != name {
			t.Errorf("plugin %q: Name() returned %q", name, plugin.Name())
		}
	}
}
