# Native Plugins & LGTM Infra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5 native Go plugins (Neo4j, MinIO, OTel/Tempo, Loki, Prometheus) exposing 12 new flow actions, and extend `infra.sh` with the full LGTM observability stack.

**Architecture:** Each plugin implements `plugins.ActionPlugin` in `api/internal/plugins/`, registered via `RegisterAction` in `routes.go`. The executor already routes dot-notation actions (`neo4j.query`) via prefix match to the registry — no executor changes needed. LGTM containers (otel-collector, tempo, loki, prometheus, grafana) are added to `infra.sh` with config files mounted from `infra/`.

**Tech Stack:** Go 1.25, `github.com/neo4j/neo4j-go-driver/v5`, `github.com/minio/minio-go/v7`, `go.opentelemetry.io/otel`, stdlib `net/http` for Tempo/Loki/Prometheus HTTP APIs, Docker for infra.

**Spec:** `docs/superpowers/specs/2026-03-30-observability-storage-graph-actions-design.md`

---

## File Map

```
infra/
  otel-collector.yaml        NEW — OTel Collector pipeline: OTLP → Tempo/Loki/Prometheus
  tempo.yaml                 NEW — Tempo local storage config
  loki.yaml                  NEW — Loki filesystem storage config
  prometheus.yaml            NEW — Prometheus scrape config
  grafana/
    datasources.yaml         NEW — Pre-wired Tempo, Loki, Prometheus datasources

infra.sh                     MODIFIED — add 5 new containers (otel-collector, tempo, loki, prometheus, grafana)

api/internal/plugins/
  neo4j_native.go            NEW — neo4j.query + neo4j.assert
  neo4j_native_test.go       NEW — unit tests
  minio_native.go            NEW — minio.put + minio.get + minio.delete + minio.assert
  minio_native_test.go       NEW — unit tests
  otel_native.go             NEW — otel.inject + otel.assert (Tempo HTTP API)
  otel_native_test.go        NEW — unit tests
  loki_native.go             NEW — loki.query + loki.assert
  loki_native_test.go        NEW — unit tests
  prometheus_native.go       NEW — prometheus.query + prometheus.assert
  prometheus_native_test.go  NEW — unit tests

api/internal/api/routes.go   MODIFIED — 5 new RegisterAction calls
```

---

## Task 1: LGTM Infrastructure Config Files

**Files:**
- Create: `infra/otel-collector.yaml`
- Create: `infra/tempo.yaml`
- Create: `infra/loki.yaml`
- Create: `infra/prometheus.yaml`
- Create: `infra/grafana/datasources.yaml`

- [ ] **Step 1: Create OTel Collector config**

```yaml
# infra/otel-collector.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: "0.0.0.0:4317"
      http:
        endpoint: "0.0.0.0:4318"

processors:
  batch:

exporters:
  otlp/tempo:
    endpoint: "tempo:4317"
    tls:
      insecure: true
  loki:
    endpoint: "http://loki:3100/loki/api/v1/push"
  prometheusremotewrite:
    endpoint: "http://prometheus:9090/api/v1/write"

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp/tempo]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [loki]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [prometheusremotewrite]
```

- [ ] **Step 2: Create Tempo config**

```yaml
# infra/tempo.yaml
server:
  http_listen_port: 3200

distributor:
  receivers:
    otlp:
      protocols:
        grpc:

storage:
  trace:
    backend: local
    local:
      path: /tmp/tempo/blocks
    wal:
      path: /tmp/tempo/wal

compactor:
  compaction:
    block_retention: 24h
```

- [ ] **Step 3: Create Loki config**

```yaml
# infra/loki.yaml
auth_enabled: false

server:
  http_listen_port: 3100

common:
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h
```

- [ ] **Step 4: Create Prometheus config**

```yaml
# infra/prometheus.yaml
global:
  scrape_interval: 15s

storage:
  tsdb:
    allow_overlapping_blocks: true

# Enable remote write receiver so OTel Collector can push metrics
# (start prometheus with --web.enable-remote-write-receiver flag)

scrape_configs:
  - job_name: demo-services
    static_configs:
      - targets:
          - user-service:5001
          - product-service:5002
          - order-service:5003
          - notification-service:5004
    metrics_path: /metrics

  - job_name: otel-collector
    static_configs:
      - targets: ["otel-collector:8888"]
```

- [ ] **Step 5: Create Grafana datasources config**

```yaml
# infra/grafana/datasources.yaml
apiVersion: 1
datasources:
  - name: Tempo
    type: tempo
    url: http://tempo:3200
    isDefault: false

  - name: Loki
    type: loki
    url: http://loki:3100
    isDefault: false

  - name: Prometheus
    type: prometheus
    url: http://prometheus:9090
    isDefault: true
```

- [ ] **Step 6: Commit config files**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh
git add infra/
git commit -m "feat: add LGTM stack config files (otel-collector, tempo, loki, prometheus, grafana)"
```

---

## Task 2: Extend infra.sh with LGTM Stack

**Files:**
- Modify: `infra.sh`

- [ ] **Step 1: Add `start_otel_collector` function**

In `infra.sh`, add after the `start_minio` function:

```bash
start_otel_collector() {
  if docker ps -q -f name=otel-collector | grep -q .; then
    echo "otel-collector already running"
    return
  fi
  if docker ps -aq -f name=otel-collector | grep -q .; then
    echo "otel-collector starting (stopped container)"
    docker start otel-collector
    return
  fi
  echo "otel-collector creating"
  docker run -d \
    --name otel-collector \
    --network "$NETWORK" \
    -p 4317:4317 \
    -p 4318:4318 \
    -p 8888:8888 \
    -v "$(pwd)/infra/otel-collector.yaml:/etc/otelcol-contrib/config.yaml:ro" \
    otel/opentelemetry-collector-contrib:latest
}

start_tempo() {
  if docker ps -q -f name=tempo | grep -q .; then
    echo "tempo     already running"
    return
  fi
  if docker ps -aq -f name=tempo | grep -q .; then
    echo "tempo     starting (stopped container)"
    docker start tempo
    return
  fi
  echo "tempo     creating"
  docker run -d \
    --name tempo \
    --network "$NETWORK" \
    -p 3200:3200 \
    -v "$(pwd)/infra/tempo.yaml:/etc/tempo.yaml:ro" \
    -v tempo-data:/tmp/tempo \
    grafana/tempo:latest \
    -config.file=/etc/tempo.yaml
}

start_loki() {
  if docker ps -q -f name=loki | grep -q .; then
    echo "loki      already running"
    return
  fi
  if docker ps -aq -f name=loki | grep -q .; then
    echo "loki      starting (stopped container)"
    docker start loki
    return
  fi
  echo "loki      creating"
  docker run -d \
    --name loki \
    --network "$NETWORK" \
    -p 3100:3100 \
    -v "$(pwd)/infra/loki.yaml:/etc/loki/config.yaml:ro" \
    -v loki-data:/loki \
    grafana/loki:latest \
    -config.file=/etc/loki/config.yaml
}

start_prometheus() {
  if docker ps -q -f name=prometheus | grep -q .; then
    echo "prometheus already running"
    return
  fi
  if docker ps -aq -f name=prometheus | grep -q .; then
    echo "prometheus starting (stopped container)"
    docker start prometheus
    return
  fi
  echo "prometheus creating"
  docker run -d \
    --name prometheus \
    --network "$NETWORK" \
    -p 9090:9090 \
    -v "$(pwd)/infra/prometheus.yaml:/etc/prometheus/prometheus.yml:ro" \
    -v prometheus-data:/prometheus \
    prom/prometheus:latest \
    --config.file=/etc/prometheus/prometheus.yml \
    --web.enable-remote-write-receiver
}

start_grafana() {
  if docker ps -q -f name=grafana | grep -q .; then
    echo "grafana   already running"
    return
  fi
  if docker ps -aq -f name=grafana | grep -q .; then
    echo "grafana   starting (stopped container)"
    docker start grafana
    return
  fi
  echo "grafana   creating"
  docker run -d \
    --name grafana \
    --network "$NETWORK" \
    -p 3002:3000 \
    -e GF_AUTH_ANONYMOUS_ENABLED=true \
    -e GF_AUTH_ANONYMOUS_ORG_ROLE=Admin \
    -v "$(pwd)/infra/grafana:/etc/grafana/provisioning/datasources:ro" \
    -v grafana-data:/var/lib/grafana \
    grafana/grafana:latest
}
```

- [ ] **Step 2: Call new functions in the `up` case and update `down`/`destroy`/`status`**

Replace the `up)` block:

```bash
  up)
    create_network
    start_postgres
    start_redis
    start_kafka
    start_neo4j
    start_minio
    start_otel_collector
    start_tempo
    start_loki
    start_prometheus
    start_grafana
    echo ""
    echo "PostgreSQL   postgresql://root:admin@localhost:5432/postgres"
    echo "Redis        redis://localhost:6379"
    echo "Kafka        localhost:9092"
    echo "Neo4j        bolt://localhost:7687 (browser: http://localhost:7474)"
    echo "MinIO        http://localhost:9000 (console: http://localhost:9001)"
    echo "OTel         grpc://localhost:4317  http://localhost:4318"
    echo "Tempo        http://localhost:3200"
    echo "Loki         http://localhost:3100"
    echo "Prometheus   http://localhost:9090"
    echo "Grafana      http://localhost:3002  (admin/admin)"
    ;;
```

Replace the `down)` block:

```bash
  down)
    echo "Stopping containers (data volumes preserved)"
    docker stop postgres redis kafka neo4j minio otel-collector tempo loki prometheus grafana 2>/dev/null || true
    ;;
```

Replace the `destroy)` block:

```bash
  destroy)
    echo "Removing containers and volumes"
    docker rm -f postgres redis kafka neo4j minio otel-collector tempo loki prometheus grafana 2>/dev/null || true
    docker volume rm postgres-data redis-data neo4j-data minio-data tempo-data loki-data prometheus-data grafana-data 2>/dev/null || true
    ;;
```

Replace the `status)` block:

```bash
  status)
    docker ps \
      --filter name=postgres --filter name=redis --filter name=kafka \
      --filter name=neo4j --filter name=minio --filter name=otel-collector \
      --filter name=tempo --filter name=loki --filter name=prometheus --filter name=grafana \
      --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    ;;
```

- [ ] **Step 3: Verify infra starts cleanly**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh
./infra.sh up
```

Expected: all 10 containers listed as running. Check:
```bash
./infra.sh status
```
Expected: 10 rows in the table, all `Up`.

- [ ] **Step 4: Commit**

```bash
git add infra.sh
git commit -m "feat: add LGTM stack to infra.sh (otel-collector, tempo, loki, prometheus, grafana)"
```

---

## Task 3: Neo4j Native Plugin

**Files:**
- Create: `api/internal/plugins/neo4j_native.go`
- Create: `api/internal/plugins/neo4j_native_test.go`

- [ ] **Step 1: Write failing tests**

```go
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go test ./internal/plugins/ -run TestNeo4j -v
```

Expected: compile error — `NewNeo4jNativePlugin` undefined.

- [ ] **Step 3: Implement neo4j_native.go**

```go
// api/internal/plugins/neo4j_native.go
package plugins

import (
	"context"
	"fmt"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
	"github.com/test-mesh/testmesh/internal/runner/assertions"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// Neo4jNativePlugin provides native Neo4j integration.
// Actions: neo4j.query, neo4j.assert
type Neo4jNativePlugin struct {
	logger *zap.Logger
}

func NewNeo4jNativePlugin(logger *zap.Logger) *Neo4jNativePlugin {
	return &Neo4jNativePlugin{logger: logger}
}

func (p *Neo4jNativePlugin) Name() string { return "neo4j" }

func (p *Neo4jNativePlugin) Execute(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	action, _ := config["_action"].(string)
	switch action {
	case "neo4j.query":
		return p.query(ctx, config)
	case "neo4j.assert":
		return p.assert(ctx, config)
	default:
		return nil, fmt.Errorf("unknown neo4j action: %s", action)
	}
}

func (p *Neo4jNativePlugin) driver(config map[string]interface{}) (neo4j.DriverWithContext, error) {
	url, _ := config["url"].(string)
	if url == "" {
		url = "bolt://localhost:7687"
	}
	username, _ := config["username"].(string)
	if username == "" {
		username = "neo4j"
	}
	password, _ := config["password"].(string)
	return neo4j.NewDriverWithContext(url, neo4j.BasicAuth(username, password, ""))
}

func (p *Neo4jNativePlugin) query(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	cypher, ok := config["query"].(string)
	if !ok || cypher == "" {
		return nil, fmt.Errorf("neo4j.query: query is required")
	}

	database, _ := config["database"].(string)
	if database == "" {
		database = "neo4j"
	}

	var params map[string]interface{}
	if raw, ok := config["params"].(map[string]interface{}); ok {
		params = raw
	}

	driver, err := p.driver(config)
	if err != nil {
		return nil, fmt.Errorf("neo4j.query: connect: %w", err)
	}
	defer driver.Close(ctx)

	session := driver.NewSession(ctx, neo4j.SessionConfig{DatabaseName: database})
	defer session.Close(ctx)

	result, err := session.Run(ctx, cypher, params)
	if err != nil {
		return nil, fmt.Errorf("neo4j.query: run: %w", err)
	}

	var rows []map[string]interface{}
	for result.Next(ctx) {
		row := make(map[string]interface{})
		for k, v := range result.Record().AsMap() {
			row[k] = v
		}
		rows = append(rows, row)
	}
	if err := result.Err(); err != nil {
		return nil, fmt.Errorf("neo4j.query: iterate: %w", err)
	}
	if rows == nil {
		rows = []map[string]interface{}{}
	}

	p.logger.Info("neo4j.query", zap.String("query", cypher), zap.Int("rows", len(rows)))
	return map[string]interface{}{"rows": rows, "count": len(rows)}, nil
}

func (p *Neo4jNativePlugin) assert(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	result, err := p.query(ctx, config)
	if err != nil {
		return nil, err
	}

	var exprs []string
	if raw, ok := config["assert"].([]interface{}); ok {
		for _, a := range raw {
			if s, ok := a.(string); ok {
				exprs = append(exprs, s)
			}
		}
	}

	if len(exprs) > 0 {
		ev := assertions.NewEvaluator(models.OutputData(result))
		if err := ev.Evaluate(exprs); err != nil {
			return nil, fmt.Errorf("neo4j.assert: %w", err)
		}
	}

	return result, nil
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go test ./internal/plugins/ -run TestNeo4j -v
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add api/internal/plugins/neo4j_native.go api/internal/plugins/neo4j_native_test.go
git commit -m "feat: add neo4j native plugin (neo4j.query, neo4j.assert)"
```

---

## Task 4: MinIO Native Plugin

**Files:**
- Create: `api/internal/plugins/minio_native.go`
- Create: `api/internal/plugins/minio_native_test.go`

- [ ] **Step 1: Write failing tests**

```go
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
```

- [ ] **Step 2: Run tests — confirm compile error**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go test ./internal/plugins/ -run TestMinio -v
```

Expected: compile error — `NewMinioNativePlugin` undefined.

- [ ] **Step 3: Implement minio_native.go**

```go
// api/internal/plugins/minio_native.go
package plugins

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/test-mesh/testmesh/internal/runner/assertions"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"go.uber.org/zap"
	"io"
)

// MinioNativePlugin provides native MinIO/S3 integration.
// Actions: minio.put, minio.get, minio.delete, minio.assert
type MinioNativePlugin struct {
	logger *zap.Logger
}

func NewMinioNativePlugin(logger *zap.Logger) *MinioNativePlugin {
	return &MinioNativePlugin{logger: logger}
}

func (p *MinioNativePlugin) Name() string { return "minio" }

func (p *MinioNativePlugin) Execute(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	action, _ := config["_action"].(string)
	switch action {
	case "minio.put":
		return p.put(ctx, config)
	case "minio.get":
		return p.get(ctx, config)
	case "minio.delete":
		return p.delete(ctx, config)
	case "minio.assert":
		return p.assert(ctx, config)
	default:
		return nil, fmt.Errorf("unknown minio action: %s", action)
	}
}

func (p *MinioNativePlugin) client(config map[string]interface{}) (*minio.Client, error) {
	endpoint, _ := config["endpoint"].(string)
	if endpoint == "" {
		endpoint = "localhost:9000"
	}
	accessKey, _ := config["access_key"].(string)
	if accessKey == "" {
		accessKey = "minioadmin"
	}
	secretKey, _ := config["secret_key"].(string)
	if secretKey == "" {
		secretKey = "minioadmin"
	}
	useSSL, _ := config["use_ssl"].(bool)

	return minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
}

func (p *MinioNativePlugin) put(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	bucket, ok := config["bucket"].(string)
	if !ok || bucket == "" {
		return nil, fmt.Errorf("minio.put: bucket is required")
	}
	object, ok := config["object"].(string)
	if !ok || object == "" {
		return nil, fmt.Errorf("minio.put: object is required")
	}
	dataRaw, ok := config["data"]
	if !ok {
		return nil, fmt.Errorf("minio.put: data is required")
	}

	dataStr := fmt.Sprintf("%v", dataRaw)
	contentType, _ := config["content_type"].(string)
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	// Try base64 decode; if it fails treat as plain string
	var reader io.Reader
	var size int64
	if decoded, err := base64.StdEncoding.DecodeString(dataStr); err == nil && !strings.ContainsAny(dataStr, " \n\t") {
		reader = bytes.NewReader(decoded)
		size = int64(len(decoded))
	} else {
		b := []byte(dataStr)
		reader = bytes.NewReader(b)
		size = int64(len(b))
	}

	mc, err := p.client(config)
	if err != nil {
		return nil, fmt.Errorf("minio.put: client: %w", err)
	}

	info, err := mc.PutObject(ctx, bucket, object, reader, size, minio.PutObjectOptions{ContentType: contentType})
	if err != nil {
		return nil, fmt.Errorf("minio.put: upload: %w", err)
	}

	p.logger.Info("minio.put", zap.String("bucket", bucket), zap.String("object", object), zap.Int64("size", info.Size))
	return map[string]interface{}{
		"etag":   strings.Trim(info.ETag, "\""),
		"size":   info.Size,
		"bucket": info.Bucket,
		"object": info.Key,
	}, nil
}

func (p *MinioNativePlugin) get(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	bucket, ok := config["bucket"].(string)
	if !ok || bucket == "" {
		return nil, fmt.Errorf("minio.get: bucket is required")
	}
	object, ok := config["object"].(string)
	if !ok || object == "" {
		return nil, fmt.Errorf("minio.get: object is required")
	}
	as, _ := config["as"].(string)
	if as == "" {
		as = "text"
	}

	mc, err := p.client(config)
	if err != nil {
		return nil, fmt.Errorf("minio.get: client: %w", err)
	}

	obj, err := mc.GetObject(ctx, bucket, object, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("minio.get: get: %w", err)
	}
	defer obj.Close()

	stat, err := obj.Stat()
	if err != nil {
		return nil, fmt.Errorf("minio.get: stat: %w", err)
	}

	rawBytes, err := io.ReadAll(obj)
	if err != nil {
		return nil, fmt.Errorf("minio.get: read: %w", err)
	}

	var body interface{}
	switch as {
	case "json":
		var parsed interface{}
		if err := json.Unmarshal(rawBytes, &parsed); err != nil {
			return nil, fmt.Errorf("minio.get: parse json: %w", err)
		}
		body = parsed
	case "base64":
		body = base64.StdEncoding.EncodeToString(rawBytes)
	default:
		body = string(rawBytes)
	}

	p.logger.Info("minio.get", zap.String("bucket", bucket), zap.String("object", object))
	return map[string]interface{}{
		"body":         body,
		"content_type": stat.ContentType,
		"size":         stat.Size,
		"etag":         strings.Trim(stat.ETag, "\""),
	}, nil
}

func (p *MinioNativePlugin) delete(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	bucket, ok := config["bucket"].(string)
	if !ok || bucket == "" {
		return nil, fmt.Errorf("minio.delete: bucket is required")
	}
	object, ok := config["object"].(string)
	if !ok || object == "" {
		return nil, fmt.Errorf("minio.delete: object is required")
	}

	mc, err := p.client(config)
	if err != nil {
		return nil, fmt.Errorf("minio.delete: client: %w", err)
	}

	if err := mc.RemoveObject(ctx, bucket, object, minio.RemoveObjectOptions{}); err != nil {
		return nil, fmt.Errorf("minio.delete: remove: %w", err)
	}

	p.logger.Info("minio.delete", zap.String("bucket", bucket), zap.String("object", object))
	return map[string]interface{}{"deleted": true}, nil
}

func (p *MinioNativePlugin) assert(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	bucket, ok := config["bucket"].(string)
	if !ok || bucket == "" {
		return nil, fmt.Errorf("minio.assert: bucket is required")
	}
	object, ok := config["object"].(string)
	if !ok || object == "" {
		return nil, fmt.Errorf("minio.assert: object is required")
	}
	existsWanted, ok := config["exists"]
	if !ok {
		return nil, fmt.Errorf("minio.assert: exists is required")
	}

	mc, err := p.client(config)
	if err != nil {
		return nil, fmt.Errorf("minio.assert: client: %w", err)
	}

	stat, statErr := mc.StatObject(ctx, bucket, object, minio.StatObjectOptions{})
	exists := statErr == nil

	wantExists, _ := existsWanted.(bool)
	if exists != wantExists {
		if wantExists {
			return nil, fmt.Errorf("minio.assert: object %s/%s does not exist", bucket, object)
		}
		return nil, fmt.Errorf("minio.assert: object %s/%s exists but expected not to", bucket, object)
	}

	result := map[string]interface{}{"exists": exists}
	if exists {
		result["content_type"] = stat.ContentType
		result["size"] = stat.Size

		if expected, ok := config["content_type"].(string); ok && expected != "" {
			if stat.ContentType != expected {
				return nil, fmt.Errorf("minio.assert: content_type: got %q, want %q", stat.ContentType, expected)
			}
		}
		if sizeGte, ok := config["size_gte"].(float64); ok {
			if float64(stat.Size) < sizeGte {
				return nil, fmt.Errorf("minio.assert: size %d < size_gte %d", stat.Size, int64(sizeGte))
			}
		}
	}

	var exprs []string
	if raw, ok := config["assert"].([]interface{}); ok {
		for _, a := range raw {
			if s, ok := a.(string); ok {
				exprs = append(exprs, s)
			}
		}
	}
	if len(exprs) > 0 {
		ev := assertions.NewEvaluator(models.OutputData(result))
		if err := ev.Evaluate(exprs); err != nil {
			return nil, fmt.Errorf("minio.assert: %w", err)
		}
	}

	return result, nil
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go test ./internal/plugins/ -run TestMinio -v
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add api/internal/plugins/minio_native.go api/internal/plugins/minio_native_test.go
git commit -m "feat: add minio native plugin (minio.put, minio.get, minio.delete, minio.assert)"
```

---

## Task 5: OTel Native Plugin

**Files:**
- Create: `api/internal/plugins/otel_native.go`
- Create: `api/internal/plugins/otel_native_test.go`

- [ ] **Step 1: Write failing tests**

```go
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
		"_action":    "otel.inject",
		"span_name":  "test-span",
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
```

- [ ] **Step 2: Run tests — confirm compile error**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go test ./internal/plugins/ -run TestOtel -v
```

Expected: compile error — `NewOtelNativePlugin` undefined.

- [ ] **Step 3: Implement otel_native.go**

```go
// api/internal/plugins/otel_native.go
package plugins

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
	"go.uber.org/zap"

	"github.com/test-mesh/testmesh/internal/runner/assertions"
	"github.com/test-mesh/testmesh/internal/storage/models"
)

// OtelNativePlugin provides OTel trace context injection and Tempo span assertion.
// Actions: otel.inject, otel.assert
type OtelNativePlugin struct {
	logger *zap.Logger
	tracer trace.Tracer
}

func NewOtelNativePlugin(logger *zap.Logger) *OtelNativePlugin {
	// Use a no-op SDK tracer so inject works even without a running collector.
	// When the global tracer provider is set (e.g. by the API server startup),
	// otel.GetTracerProvider() returns the real provider and spans will be exported.
	tp := sdktrace.NewTracerProvider()
	tracer := tp.Tracer("testmesh-flow")
	return &OtelNativePlugin{logger: logger, tracer: tracer}
}

func (p *OtelNativePlugin) Name() string { return "otel" }

func (p *OtelNativePlugin) Execute(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	action, _ := config["_action"].(string)
	switch action {
	case "otel.inject":
		return p.inject(ctx, config)
	case "otel.assert":
		return p.assert(ctx, config)
	default:
		return nil, fmt.Errorf("unknown otel action: %s", action)
	}
}

func (p *OtelNativePlugin) inject(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	spanName, _ := config["span_name"].(string)
	if spanName == "" {
		spanName = "testmesh-step"
	}
	serviceName, _ := config["service_name"].(string)
	if serviceName == "" {
		serviceName = "testmesh-flow"
	}

	// Use global tracer so spans are exported to the configured backend
	tracer := otel.GetTracerProvider().Tracer(serviceName)
	_, span := tracer.Start(ctx, spanName)
	defer span.End()

	sc := span.SpanContext()

	// Inject W3C traceparent into a carrier map
	carrier := make(propagation.MapCarrier)
	otel.GetTextMapPropagator().Inject(
		trace.ContextWithSpan(ctx, span),
		carrier,
	)

	traceparent := carrier["traceparent"]
	tracestate := carrier["tracestate"]

	p.logger.Info("otel.inject",
		zap.String("trace_id", sc.TraceID().String()),
		zap.String("span_id", sc.SpanID().String()),
	)

	return map[string]interface{}{
		"traceparent": traceparent,
		"tracestate":  tracestate,
		"trace_id":    sc.TraceID().String(),
		"span_id":     sc.SpanID().String(),
	}, nil
}

// tempoTrace is a minimal struct for parsing Tempo's /api/traces/{id} response.
type tempoTrace struct {
	Batches []struct {
		Resource struct {
			Attributes []tempoAttr `json:"attributes"`
		} `json:"resource"`
		ScopeSpans []struct {
			Spans []struct {
				TraceID           string     `json:"traceId"`
				SpanID            string     `json:"spanId"`
				Name              string     `json:"name"`
				StartTimeUnixNano string     `json:"startTimeUnixNano"`
				EndTimeUnixNano   string     `json:"endTimeUnixNano"`
				Status            struct {
					Code string `json:"code"`
				} `json:"status"`
				Attributes []tempoAttr `json:"attributes"`
			} `json:"spans"`
		} `json:"scopeSpans"`
	} `json:"batches"`
}

type tempoAttr struct {
	Key   string `json:"key"`
	Value struct {
		StringValue string  `json:"stringValue"`
		IntValue    string  `json:"intValue"`
		BoolValue   bool    `json:"boolValue"`
		DoubleValue float64 `json:"doubleValue"`
	} `json:"value"`
}

func (p *OtelNativePlugin) assert(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	backendURL, ok := config["backend_url"].(string)
	if !ok || backendURL == "" {
		return nil, fmt.Errorf("otel.assert: backend_url is required")
	}

	traceID, _ := config["trace_id"].(string)
	service, _ := config["service"].(string)
	operation, _ := config["operation"].(string)

	if traceID == "" && service == "" {
		return nil, fmt.Errorf("otel.assert: trace_id or service is required")
	}

	withinStr, _ := config["within"].(string)
	deadline := time.Now().Add(10 * time.Second)
	if withinStr != "" {
		if d, err := time.ParseDuration(withinStr); err == nil {
			deadline = time.Now().Add(d)
		}
	}

	var spans []map[string]interface{}
	var lastErr error

	for time.Now().Before(deadline) {
		spans, lastErr = p.fetchSpans(ctx, backendURL, traceID, service, operation)
		if lastErr == nil && len(spans) > 0 {
			break
		}
		time.Sleep(500 * time.Millisecond)
	}
	if lastErr != nil {
		return nil, fmt.Errorf("otel.assert: fetch spans: %w", lastErr)
	}

	result := map[string]interface{}{"spans": spans}

	var exprs []string
	if raw, ok := config["assert"].([]interface{}); ok {
		for _, a := range raw {
			if s, ok := a.(string); ok {
				exprs = append(exprs, s)
			}
		}
	}
	if len(exprs) > 0 {
		ev := assertions.NewEvaluator(models.OutputData(result))
		if err := ev.Evaluate(exprs); err != nil {
			return nil, fmt.Errorf("otel.assert: %w", err)
		}
	}

	return result, nil
}

func (p *OtelNativePlugin) fetchSpans(ctx context.Context, backendURL, traceID, service, operation string) ([]map[string]interface{}, error) {
	var apiURL string
	if traceID != "" {
		apiURL = strings.TrimRight(backendURL, "/") + "/api/traces/" + traceID
	} else {
		params := url.Values{}
		if service != "" {
			params.Set("tags", "service.name="+service)
		}
		if operation != "" {
			params.Set("tags", params.Get("tags")+" span.name="+operation)
		}
		apiURL = strings.TrimRight(backendURL, "/") + "/api/search?" + params.Encode()
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, nil
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tempo returned HTTP %d", resp.StatusCode)
	}

	var trace tempoTrace
	if err := json.NewDecoder(resp.Body).Decode(&trace); err != nil {
		return nil, fmt.Errorf("decode tempo response: %w", err)
	}

	var spans []map[string]interface{}
	for _, batch := range trace.Batches {
		// Extract service name from resource attributes
		svcName := ""
		for _, attr := range batch.Resource.Attributes {
			if attr.Key == "service.name" {
				svcName = attr.Value.StringValue
			}
		}
		for _, ss := range batch.ScopeSpans {
			for _, s := range ss.Spans {
				attrs := make(map[string]interface{})
				for _, attr := range s.Attributes {
					attrs[attr.Key] = attr.Value.StringValue
				}

				start, _ := strToNano(s.StartTimeUnixNano)
				end, _ := strToNano(s.EndTimeUnixNano)
				durationMs := int64(0)
				if end > start {
					durationMs = (end - start) / 1_000_000
				}

				status := strings.ToLower(s.Status.Code)
				if status == "" || status == "status_code_unset" {
					status = "ok"
				}

				spans = append(spans, map[string]interface{}{
					"trace_id":    s.TraceID,
					"span_id":     s.SpanID,
					"service":     svcName,
					"operation":   s.Name,
					"duration_ms": durationMs,
					"status":      status,
					"attributes":  attrs,
				})
			}
		}
	}
	return spans, nil
}

func strToNano(s string) (int64, error) {
	var n int64
	_, err := fmt.Sscan(s, &n)
	return n, err
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go test ./internal/plugins/ -run TestOtel -v
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add api/internal/plugins/otel_native.go api/internal/plugins/otel_native_test.go
git commit -m "feat: add otel native plugin (otel.inject, otel.assert via Tempo)"
```

---

## Task 6: Loki Native Plugin

**Files:**
- Create: `api/internal/plugins/loki_native.go`
- Create: `api/internal/plugins/loki_native_test.go`

- [ ] **Step 1: Write failing tests**

```go
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
```

- [ ] **Step 2: Run tests — confirm compile error**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go test ./internal/plugins/ -run TestLoki -v
```

- [ ] **Step 3: Implement loki_native.go**

```go
// api/internal/plugins/loki_native.go
package plugins

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/test-mesh/testmesh/internal/runner/assertions"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// LokiNativePlugin provides native Grafana Loki integration.
// Actions: loki.query, loki.assert
type LokiNativePlugin struct {
	logger *zap.Logger
}

func NewLokiNativePlugin(logger *zap.Logger) *LokiNativePlugin {
	return &LokiNativePlugin{logger: logger}
}

func (p *LokiNativePlugin) Name() string { return "loki" }

func (p *LokiNativePlugin) Execute(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	action, _ := config["_action"].(string)
	switch action {
	case "loki.query":
		return p.query(ctx, config)
	case "loki.assert":
		return p.assert(ctx, config)
	default:
		return nil, fmt.Errorf("unknown loki action: %s", action)
	}
}

// lokiQueryRangeResponse is a minimal struct for Loki's /loki/api/v1/query_range response.
type lokiQueryRangeResponse struct {
	Data struct {
		ResultType string `json:"resultType"`
		Result     []struct {
			Values [][2]string `json:"values"` // [timestamp, line]
		} `json:"result"`
	} `json:"data"`
}

func (p *LokiNativePlugin) query(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	lokiURL, ok := config["url"].(string)
	if !ok || lokiURL == "" {
		return nil, fmt.Errorf("loki.query: url is required")
	}
	logql, ok := config["query"].(string)
	if !ok || logql == "" {
		return nil, fmt.Errorf("loki.query: query is required")
	}

	limit := 100
	if l, ok := config["limit"].(float64); ok {
		limit = int(l)
	}

	end := time.Now()
	start := end.Add(-5 * time.Minute)

	if s, ok := config["start"].(string); ok && s != "" && s != "now" {
		if d, err := time.ParseDuration(s); err == nil {
			start = end.Add(d)
		} else if t, err := time.Parse(time.RFC3339, s); err == nil {
			start = t
		}
	}
	if e, ok := config["end"].(string); ok && e != "" && e != "now" {
		if t, err := time.Parse(time.RFC3339, e); err == nil {
			end = t
		}
	}

	params := url.Values{
		"query": {logql},
		"start": {fmt.Sprintf("%d", start.UnixNano())},
		"end":   {fmt.Sprintf("%d", end.UnixNano())},
		"limit": {fmt.Sprintf("%d", limit)},
	}

	apiURL := strings.TrimRight(lokiURL, "/") + "/loki/api/v1/query_range?" + params.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("loki.query: build request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("loki.query: http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("loki.query: HTTP %d", resp.StatusCode)
	}

	var result lokiQueryRangeResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("loki.query: decode: %w", err)
	}

	var lines []string
	for _, stream := range result.Data.Result {
		for _, v := range stream.Values {
			lines = append(lines, v[1])
		}
	}
	if lines == nil {
		lines = []string{}
	}

	p.logger.Info("loki.query", zap.String("query", logql), zap.Int("lines", len(lines)))
	return map[string]interface{}{"lines": lines, "count": len(lines)}, nil
}

func (p *LokiNativePlugin) assert(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	withinStr, _ := config["within"].(string)
	deadline := time.Now().Add(10 * time.Second)
	if withinStr != "" {
		if d, err := time.ParseDuration(withinStr); err == nil {
			deadline = time.Now().Add(d)
		}
	}

	var result map[string]interface{}
	var lastErr error

	for time.Now().Before(deadline) {
		result, lastErr = p.query(ctx, config)
		if lastErr == nil {
			count, _ := result["count"].(int)
			if count > 0 {
				break
			}
		}
		time.Sleep(500 * time.Millisecond)
	}
	if lastErr != nil {
		return nil, lastErr
	}

	var exprs []string
	if raw, ok := config["assert"].([]interface{}); ok {
		for _, a := range raw {
			if s, ok := a.(string); ok {
				exprs = append(exprs, s)
			}
		}
	}
	if len(exprs) > 0 {
		ev := assertions.NewEvaluator(models.OutputData(result))
		if err := ev.Evaluate(exprs); err != nil {
			return nil, fmt.Errorf("loki.assert: %w", err)
		}
	}

	return result, nil
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go test ./internal/plugins/ -run TestLoki -v
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add api/internal/plugins/loki_native.go api/internal/plugins/loki_native_test.go
git commit -m "feat: add loki native plugin (loki.query, loki.assert)"
```

---

## Task 7: Prometheus Native Plugin

**Files:**
- Create: `api/internal/plugins/prometheus_native.go`
- Create: `api/internal/plugins/prometheus_native_test.go`

- [ ] **Step 1: Write failing tests**

```go
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
```

- [ ] **Step 2: Run tests — confirm compile error**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go test ./internal/plugins/ -run TestPrometheus -v
```

- [ ] **Step 3: Implement prometheus_native.go**

```go
// api/internal/plugins/prometheus_native.go
package plugins

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/test-mesh/testmesh/internal/runner/assertions"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// PrometheusNativePlugin provides native Prometheus integration.
// Actions: prometheus.query, prometheus.assert
type PrometheusNativePlugin struct {
	logger *zap.Logger
}

func NewPrometheusNativePlugin(logger *zap.Logger) *PrometheusNativePlugin {
	return &PrometheusNativePlugin{logger: logger}
}

func (p *PrometheusNativePlugin) Name() string { return "prometheus" }

func (p *PrometheusNativePlugin) Execute(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	action, _ := config["_action"].(string)
	switch action {
	case "prometheus.query":
		return p.query(ctx, config)
	case "prometheus.assert":
		return p.assert(ctx, config)
	default:
		return nil, fmt.Errorf("unknown prometheus action: %s", action)
	}
}

type prometheusResponse struct {
	Status string `json:"status"`
	Data   struct {
		ResultType string `json:"resultType"`
		Result     []struct {
			Metric map[string]string `json:"metric"`
			Value  [2]interface{}    `json:"value"` // [timestamp, value_string]
		} `json:"result"`
	} `json:"data"`
}

func (p *PrometheusNativePlugin) query(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	promURL, ok := config["url"].(string)
	if !ok || promURL == "" {
		return nil, fmt.Errorf("prometheus.query: url is required")
	}
	promql, ok := config["query"].(string)
	if !ok || promql == "" {
		return nil, fmt.Errorf("prometheus.query: query is required")
	}

	queryTime := fmt.Sprintf("%d", time.Now().Unix())
	if t, ok := config["time"].(string); ok && t != "" && t != "now" {
		queryTime = t
	}

	params := url.Values{
		"query": {promql},
		"time":  {queryTime},
	}

	apiURL := strings.TrimRight(promURL, "/") + "/api/v1/query?" + params.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("prometheus.query: build request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("prometheus.query: http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("prometheus.query: HTTP %d", resp.StatusCode)
	}

	var pr prometheusResponse
	if err := json.NewDecoder(resp.Body).Decode(&pr); err != nil {
		return nil, fmt.Errorf("prometheus.query: decode: %w", err)
	}
	if pr.Status != "success" {
		return nil, fmt.Errorf("prometheus.query: status=%s", pr.Status)
	}
	if len(pr.Data.Result) == 0 {
		return map[string]interface{}{"value": nil, "metric": map[string]string{}}, nil
	}

	first := pr.Data.Result[0]
	var value float64
	if vs, ok := first.Value[1].(string); ok {
		fmt.Sscan(vs, &value)
	}

	p.logger.Info("prometheus.query", zap.String("query", promql), zap.Float64("value", value))
	return map[string]interface{}{"value": value, "metric": first.Metric}, nil
}

func (p *PrometheusNativePlugin) assert(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	withinStr, _ := config["within"].(string)
	deadline := time.Now().Add(15 * time.Second)
	if withinStr != "" {
		if d, err := time.ParseDuration(withinStr); err == nil {
			deadline = time.Now().Add(d)
		}
	}

	var exprs []string
	if raw, ok := config["assert"].([]interface{}); ok {
		for _, a := range raw {
			if s, ok := a.(string); ok {
				exprs = append(exprs, s)
			}
		}
	}

	var result map[string]interface{}
	var lastErr error

	for time.Now().Before(deadline) {
		result, lastErr = p.query(ctx, config)
		if lastErr != nil {
			time.Sleep(500 * time.Millisecond)
			continue
		}
		if len(exprs) == 0 {
			break
		}
		ev := assertions.NewEvaluator(models.OutputData(result))
		if err := ev.Evaluate(exprs); err == nil {
			return result, nil
		}
		time.Sleep(500 * time.Millisecond)
	}

	if lastErr != nil {
		return nil, lastErr
	}

	if len(exprs) > 0 {
		ev := assertions.NewEvaluator(models.OutputData(result))
		if err := ev.Evaluate(exprs); err != nil {
			return nil, fmt.Errorf("prometheus.assert: %w", err)
		}
	}

	return result, nil
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go test ./internal/plugins/ -run TestPrometheus -v
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add api/internal/plugins/prometheus_native.go api/internal/plugins/prometheus_native_test.go
git commit -m "feat: add prometheus native plugin (prometheus.query, prometheus.assert)"
```

---

## Task 8: Register All Plugins in routes.go

**Files:**
- Modify: `api/internal/api/routes.go`

- [ ] **Step 1: Write a test confirming all 8 plugins are registered**

Add a new test file to verify all expected plugins are available:

```go
// api/internal/plugins/registry_test.go
package plugins

import (
	"testing"

	"go.uber.org/zap"
)

func TestAllNativePluginsRegistered(t *testing.T) {
	logger := zap.NewNop()
	plugins := map[string]ActionPlugin{
		"kafka":      NewKafkaNativePlugin(logger),
		"postgresql": NewPostgreSQLNativePlugin(logger),
		"redis":      NewRedisNativePlugin(logger),
		"neo4j":      NewNeo4jNativePlugin(logger),
		"minio":      NewMinioNativePlugin(logger),
		"otel":       NewOtelNativePlugin(logger),
		"loki":       NewLokiNativePlugin(logger),
		"prometheus": NewPrometheusNativePlugin(logger),
	}

	for name, plugin := range plugins {
		if plugin.Name() != name {
			t.Errorf("plugin %q: Name() returned %q", name, plugin.Name())
		}
	}
}
```

- [ ] **Step 2: Run the test**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go test ./internal/plugins/ -run TestAllNativePlugins -v
```

Expected: PASS.

- [ ] **Step 3: Add 5 RegisterAction calls in routes.go**

Find the existing block (around line 288):
```go
pluginRegistry.RegisterAction("kafka", plugins.NewKafkaNativePlugin(logger))
pluginRegistry.RegisterAction("postgresql", plugins.NewPostgreSQLNativePlugin(logger))
pluginRegistry.RegisterAction("redis", plugins.NewRedisNativePlugin(logger))
```

Add after it:
```go
pluginRegistry.RegisterAction("neo4j",      plugins.NewNeo4jNativePlugin(logger))
pluginRegistry.RegisterAction("minio",      plugins.NewMinioNativePlugin(logger))
pluginRegistry.RegisterAction("otel",       plugins.NewOtelNativePlugin(logger))
pluginRegistry.RegisterAction("loki",       plugins.NewLokiNativePlugin(logger))
pluginRegistry.RegisterAction("prometheus", plugins.NewPrometheusNativePlugin(logger))
```

- [ ] **Step 4: Build the API to confirm no compile errors**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go build ./...
```

Expected: no errors.

- [ ] **Step 5: Run full plugin test suite**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/api
go test ./internal/plugins/ -v
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add api/internal/api/routes.go api/internal/plugins/registry_test.go
git commit -m "feat: register neo4j, minio, otel, loki, prometheus native plugins"
```

---

## Task 9: End-to-End Smoke Test

Run the full stack and verify new actions appear in the dashboard.

- [ ] **Step 1: Start infra and API**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh
./infra.sh up
docker-compose -f docker-compose.dev.yml up --build -d
```

- [ ] **Step 2: Verify all infra is healthy**

```bash
./infra.sh status
# All 10 containers should show "Up"

curl -s http://localhost:3200/ready   # Tempo
curl -s http://localhost:3100/ready   # Loki
curl -s http://localhost:9090/-/ready # Prometheus
```

- [ ] **Step 3: Verify new plugins appear in dashboard**

Open http://localhost:3000 → Plugins → Built-in Integrations.

Expected: Neo4j, MinIO, OTel/Tempo, Loki, Prometheus all listed alongside Kafka, PostgreSQL, Redis.

- [ ] **Step 4: Run a quick neo4j.query flow via CLI**

```bash
cat > /tmp/neo4j-smoke.yaml << 'EOF'
flow:
  name: Neo4j Smoke Test
  steps:
    - id: query
      action: neo4j.query
      config:
        url: bolt://localhost:7687
        username: neo4j
        password: testmesh
        query: "RETURN 1 AS n"
      assert:
        - "count == 1"
        - "rows[0].n == 1"
EOF

cd /Users/ggeorgiev/Dev/testmesh/testmesh/cli
go run main.go run /tmp/neo4j-smoke.yaml
```

Expected: flow passes, step shows `rows: [{n: 1}], count: 1`.

- [ ] **Step 5: Commit final state**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh
git add -A
git commit -m "feat: complete LGTM infra + 5 native plugins — neo4j, minio, otel, loki, prometheus"
```
