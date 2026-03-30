# Design: Observability, Storage & Graph Native Plugins

**Date:** 2026-03-30
**Status:** Approved
**Scope:** OSS engine (`testmesh/`)

---

## Overview

Add 12 new actions across 5 native Go plugins covering three integration areas already part of the TestMesh stack but not yet exposed as flow actions:

| Plugin | File | Actions |
|---|---|---|
| `neo4j` | `neo4j_native.go` | `neo4j.query`, `neo4j.assert` |
| `minio` | `minio_native.go` | `minio.put`, `minio.get`, `minio.delete`, `minio.assert` |
| `otel` | `otel_native.go` | `otel.inject`, `otel.assert` |
| `loki` | `loki_native.go` | `loki.query`, `loki.assert` |
| `prometheus` | `prometheus_native.go` | `prometheus.query`, `prometheus.assert` |

Alongside the plugins, extend `infra.sh` with the full LGTM observability stack, instrument the four demo services with metrics and structured logs, and add example flows that exercise every new action end-to-end.

No new plugin SDK examples are added — the existing `plugins/examples/hello-plugin` remains the reference for external contributors.

---

## Architecture

### Native plugin pattern

All new integrations implement the `ActionPlugin` interface in `api/internal/plugins/`, following the same pattern as `kafka_native.go`, `postgresql_native.go`, and `redis_native.go`:

```go
type Neo4jNativePlugin struct { logger *zap.Logger }

func (p *Neo4jNativePlugin) Name() string { return "neo4j" }

func (p *Neo4jNativePlugin) Execute(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
    action, _ := config["_action"].(string)
    switch action {
    case "neo4j.query":  return p.query(ctx, config)
    case "neo4j.assert": return p.assert(ctx, config)
    default:             return nil, fmt.Errorf("unknown action: %s", action)
    }
}
```

- Fresh connection per execution (no global state)
- Config extracted from `map[string]interface{}` with explicit required/optional validation
- Output keys are lowercase snake_case
- Errors wrapped with `fmt.Errorf("...: %w", err)`

### Registration

5 new `RegisterAction` calls in `api/internal/api/routes.go`:

```go
pluginRegistry.RegisterAction("neo4j",      plugins.NewNeo4jNativePlugin(logger))
pluginRegistry.RegisterAction("minio",      plugins.NewMinioNativePlugin(logger))
pluginRegistry.RegisterAction("otel",       plugins.NewOtelNativePlugin(logger))
pluginRegistry.RegisterAction("loki",       plugins.NewLokiNativePlugin(logger))
pluginRegistry.RegisterAction("prometheus", plugins.NewPrometheusNativePlugin(logger))
```

The executor already handles dot-notation via prefix match: `neo4j.query` → looks up `neo4j` in registry → calls `Execute` with `_action: "neo4j.query"`. No changes to `executor.go` needed.

### Dashboard display

Each native plugin appears automatically in the dashboard's "Built-in Integrations" section alongside Kafka, PostgreSQL, and Redis, showing its name, description, and available actions.

---

## Action Specifications

### neo4j.query

Runs any Cypher query and returns results.

**Config:**
```yaml
url:      bolt://localhost:7687   # required
username: neo4j                   # required
password: testmesh                # required
database: neo4j                   # optional, default "neo4j"
query:    "MATCH (n:Service) RETURN n.name AS name, n.type AS type"  # required
params:                           # optional
  service_id: "{{service_id}}"
```

**Output:**
```json
{ "rows": [{"name": "user-service", "type": "http"}], "count": 1 }
```

---

### neo4j.assert

Runs a Cypher query and asserts on the results using expr-lang (same syntax as existing `assert` steps).

**Config:** Same as `neo4j.query`, plus:
```yaml
assert:
  - "count > 0"
  - "rows[0].name == 'user-service'"
```

**Output:** Same as `neo4j.query`. Fails the step if any assertion is false.

---

### minio.put

Uploads an object to MinIO/S3.

**Config:**
```yaml
endpoint:     localhost:9000      # required
access_key:   minioadmin          # required
secret_key:   minioadmin          # required
use_ssl:      false               # optional, default false
bucket:       testmesh            # required
object:       reports/run.json    # required
data:         "{{output_json}}"   # required — string or base64-encoded bytes
content_type: application/json   # optional, default application/octet-stream
```

**Output:**
```json
{ "etag": "abc123", "size": 1024, "bucket": "testmesh", "object": "reports/run.json" }
```

---

### minio.get

Downloads an object from MinIO/S3.

**Config:** Same connection fields as `minio.put`, plus:
```yaml
bucket: testmesh
object: reports/run.json
as:     text     # optional: text | base64 | json (default: text)
```

**Output:**
```json
{ "body": "...", "content_type": "application/json", "size": 1024, "etag": "abc123" }
```

---

### minio.delete

Deletes an object.

**Config:** Connection fields + `bucket` + `object`.

**Output:**
```json
{ "deleted": true }
```

---

### minio.assert

Asserts an object exists (or does not exist), optionally checks metadata.

**Config:** Connection fields + `bucket` + `object`, plus:
```yaml
exists:       true               # required
content_type: application/json  # optional
size_gte:     100                # optional: assert size >= N bytes
metadata:                        # optional: assert object user metadata
  x-flow-id: "{{flow_id}}"
```

**Output:**
```json
{ "exists": true, "content_type": "application/json", "size": 1024 }
```

---

### otel.inject

Creates a new OTel span and injects W3C trace context into flow variables. Use the output as headers in subsequent HTTP steps to propagate traces into your services.

**Config:**
```yaml
service_name: testmesh-flow   # optional, default "testmesh-flow"
span_name:    create-user     # optional, default step id
```

**Output:**
```json
{
  "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
  "tracestate":  "",
  "trace_id":    "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id":     "00f067aa0ba902b7"
}
```

**Usage pattern:**
```yaml
- id: inject_trace
  action: otel.inject
  config:
    span_name: create-user
  output:
    traceparent: $.traceparent

- id: create_user
  action: http_request
  config:
    method: POST
    url: http://user-service:5001/users
    headers:
      traceparent: "{{traceparent}}"
    body: { name: "Alice", email: "alice@example.com" }
```

---

### otel.assert

Queries Grafana Tempo for spans and asserts on them.

**Config:**
```yaml
backend_url:  http://tempo:3200   # required
trace_id:     "{{trace_id}}"      # required (or use service + operation)
service:      user-service        # alternative to trace_id
operation:    "POST /users"       # used with service
within:       "10s"               # poll until spans appear or timeout
assert:
  - "len(spans) > 0"
  - "spans[0].duration_ms < 200"
  - "spans[0].status == 'ok'"
```

**Output:**
```json
{
  "spans": [
    { "trace_id": "...", "span_id": "...", "service": "user-service",
      "operation": "POST /users", "duration_ms": 42, "status": "ok",
      "attributes": { "http.status_code": 201 } }
  ]
}
```

---

### loki.query

Queries Grafana Loki using LogQL.

**Config:**
```yaml
url:   http://loki:3100    # required
query: '{service="user-service"} |= "created user"'  # required (LogQL)
start: "{{flow_start}}"    # optional, RFC3339 or relative like "-5m"
end:   "now"               # optional
limit: 100                 # optional, default 100
```

**Output:**
```json
{ "lines": ["2026-03-30T10:00:00Z user-service created user id=abc"], "count": 1 }
```

---

### loki.assert

Queries Loki and asserts on the results.

**Config:** Same as `loki.query`, plus:
```yaml
assert:
  - "count > 0"
  - "lines[0] contains 'created user'"
within: "10s"   # optional: poll until assertion passes or timeout
```

**Output:** Same as `loki.query`.

---

### prometheus.query

Runs a PromQL instant query.

**Config:**
```yaml
url:   http://prometheus:9090  # required
query: 'http_requests_total{service="user-service",status="201"}'  # required (PromQL)
time:  "now"                   # optional
```

**Output:**
```json
{ "value": 42.0, "metric": { "service": "user-service", "status": "201" } }
```

---

### prometheus.assert

Runs PromQL and asserts on the result.

**Config:** Same as `prometheus.query`, plus:
```yaml
assert:
  - "value > 0"
  - "value >= 5"
within: "15s"   # optional: poll until assertion passes or timeout
```

**Output:** Same as `prometheus.query`.

---

## Infrastructure: LGTM Stack

Added to `infra.sh` alongside existing postgres/redis/kafka/neo4j/minio:

| Container | Image | Ports | Purpose |
|---|---|---|---|
| `otel-collector` | `otel/opentelemetry-collector-contrib:latest` | 4317 (gRPC), 4318 (HTTP) | Receives OTLP from services, routes to Tempo/Loki/Prometheus |
| `tempo` | `grafana/tempo:latest` | 3200 | Trace storage + query API |
| `loki` | `grafana/loki:latest` | 3100 | Log storage + LogQL API |
| `prometheus` | `prom/prometheus:latest` | 9090 | Metrics storage + PromQL API |
| `grafana` | `grafana/grafana:latest` | 3002 | Visualization (Tempo, Loki, Prometheus datasources pre-configured) |

Grafana runs on port **3002** to avoid collision with OSS dashboard (:3000) and cloud dashboard (:3001).

OTel Collector config (`infra/otel-collector.yaml`):
- Receivers: `otlp` (grpc :4317, http :4318)
- Exporters: `otlp/tempo` (traces), `loki` (logs), `prometheusremotewrite` (metrics)
- Pipelines: traces → tempo, logs → loki, metrics → prometheus

---

## Demo Service Instrumentation

All four services (`user-service`, `product-service`, `order-service`, `notification-service`) receive the same additions:

### 1. Structured logging (zap)
Replace stdlib `log` with `go.uber.org/zap`. JSON output. Key fields on every log line: `service`, `trace_id`, `span_id` (extracted from OTel context), `level`, `msg`. Services export logs directly via OTLP logs SDK to `otel-collector:4318`.

### 2. Prometheus metrics
New `metrics/` package per service exposing:
- `http_requests_total` (counter, labels: method, route, status)
- `http_request_duration_seconds` (histogram, labels: method, route)
- `http_requests_in_flight` (gauge)

Exposed on `GET /metrics`. OTel Collector scrapes it and forwards to Prometheus.

### 3. OTel endpoint update
Change `OTEL_EXPORTER_OTLP_ENDPOINT` default from `testmesh-api:5016` to `otel-collector:4318`. Update `docker-compose.services.yml` accordingly.

---

## Example Flows

### `examples/observability/trace-propagation.yaml`
1. `otel.inject` — create span, capture `traceparent`
2. `http_request` — POST to user-service with `traceparent` header
3. `otel.assert` — verify span appeared in Tempo with `duration_ms < 500`

### `examples/observability/log-assertion.yaml`
1. `http_request` — create a product
2. `loki.assert` — verify `"created product"` log line appeared within 5s

### `examples/observability/metrics-assertion.yaml`
1. `prometheus.query` — capture baseline `http_requests_total` for order-service
2. `http_request` ×3 — place three orders
3. `prometheus.assert` — verify counter increased by 3

### `examples/storage/minio-artifacts.yaml`
1. `http_request` — fetch a report from the API
2. `minio.put` — store the response body as an artifact
3. `minio.assert` — verify object exists with correct `content_type`
4. `minio.get` — retrieve and parse the artifact
5. `minio.delete` — clean up

### `examples/graph/neo4j-queries.yaml`
1. `http_request` — create a user + product + order (triggers graph sync)
2. `neo4j.assert` — verify service nodes exist
3. `neo4j.query` — query relationships, assert order node connects to both user and product nodes

---

## Files Changed / Created

```
api/internal/plugins/
  neo4j_native.go        NEW — neo4j.query + neo4j.assert
  minio_native.go        NEW — minio.put/get/delete/assert
  otel_native.go         NEW — otel.inject + otel.assert
  loki_native.go         NEW — loki.query + loki.assert
  prometheus_native.go   NEW — prometheus.query + prometheus.assert

api/internal/api/routes.go
  MODIFIED — 5 new RegisterAction calls

infra.sh
  MODIFIED — add otel-collector, tempo, loki, prometheus, grafana

infra/
  otel-collector.yaml    NEW — collector pipeline config
  tempo.yaml             NEW — tempo local config
  loki.yaml              NEW — loki local config
  prometheus.yaml        NEW — prometheus scrape config
  grafana/
    datasources.yaml     NEW — pre-configured datasources

docker-compose.services.yml
  MODIFIED — OTEL_EXPORTER_OTLP_ENDPOINT → otel-collector:4318

demo-services/{user,product,order,notification}-service/
  metrics/metrics.go     NEW — prometheus instrumentation
  main.go                MODIFIED — init metrics, switch to zap, add OTel logs
  go.mod                 MODIFIED — add zap, prometheus client, otel logs SDK

examples/
  observability/trace-propagation.yaml   NEW
  observability/log-assertion.yaml       NEW
  observability/metrics-assertion.yaml   NEW
  storage/minio-artifacts.yaml           NEW
  graph/neo4j-queries.yaml               NEW

docs/features/YAML_SCHEMA.md
  MODIFIED — document all 12 new action types

web/content/docs/yaml-reference/actions/
  neo4j.mdx                    NEW
  minio.mdx                    NEW
  otel-loki-prometheus.mdx     NEW
  index.mdx                    MODIFIED — add 12 new actions to reference table

web/content/docs/features/
  observability.mdx            MODIFIED — add "Asserting on Service Observability" section
  plugins.mdx                  MODIFIED — add "Built-in Integrations" section

web/content/docs/              (getting-started or deployment page)
  MODIFIED — update local dev setup with LGTM stack ports/URLs

web/content/docs/changelog.mdx
  MODIFIED — add release entry for new native plugins + LGTM stack
```

---

## Web / Living Docs Updates

All documentation lives in `testmesh/web/content/docs/`. Changes keep the public docs in sync with the new capabilities.

### New action reference pages (`yaml-reference/actions/`)

**`neo4j.mdx`** — new page
- `neo4j.query`: config fields, output shape, Cypher example
- `neo4j.assert`: same + inline assertion syntax, failure behaviour

**`minio.mdx`** — new page
- `minio.put/get/delete/assert`: config fields, output shapes
- End-to-end pattern: upload artifact → assert exists → retrieve → clean up

**`otel-loki-prometheus.mdx`** — new page
- `otel.inject` + `otel.assert`: trace propagation pattern, Tempo query config
- `loki.query` + `loki.assert`: LogQL syntax, `within` polling
- `prometheus.query` + `prometheus.assert`: PromQL syntax, baseline-then-assert pattern
- Diagram: flow → OTel Collector → Tempo / Loki / Prometheus

### Updated existing pages

**`yaml-reference/actions/index.mdx`**
Add new actions to the reference table: `neo4j.query`, `neo4j.assert`, `minio.put`, `minio.get`, `minio.delete`, `minio.assert`, `otel.inject`, `otel.assert`, `loki.query`, `loki.assert`, `prometheus.query`, `prometheus.assert`.

**`features/observability.mdx`**
Add a new section "Asserting on Service Observability" covering:
- How `otel.inject` propagates trace context from a flow into a real service
- How `otel.assert` queries Tempo to verify a span was emitted with expected attributes
- How `loki.assert` verifies a structured log line appeared after an action
- How `prometheus.assert` checks that a metric counter or gauge changed as expected
- Full worked example tying all three signals together in one flow

**`features/plugins.mdx`**
Add "Built-in Integrations" section listing all 8 native plugins with their action sets:

| Plugin | Actions |
|---|---|
| Kafka | `kafka.produce`, `kafka.consume`, `kafka.admin.topics` +2 |
| PostgreSQL | `postgresql.query`, `postgresql.insert`, `postgresql.update` +3 |
| Redis | `redis.get`, `redis.set`, `redis.del`, `redis.exists` |
| Neo4j | `neo4j.query`, `neo4j.assert` |
| MinIO | `minio.put`, `minio.get`, `minio.delete`, `minio.assert` |
| OTel/Tempo | `otel.inject`, `otel.assert` |
| Loki | `loki.query`, `loki.assert` |
| Prometheus | `prometheus.query`, `prometheus.assert` |

Clarify distinction between built-in native plugins (Go, no install needed) and external plugins (HTTP-based, any language).

**`deployment/` or `getting-started/`**
Update local dev setup instructions to include the LGTM stack:
- Running `./infra.sh up` now also starts OTel Collector, Tempo, Loki, Prometheus, Grafana
- Add service table with ports and URLs
- Note: Grafana at `:3002` with pre-configured datasources

### Changelog entry (`changelog.mdx`)
Add entry for this release covering:
- 5 new native plugins: Neo4j, MinIO, OTel/Tempo, Loki, Prometheus
- 12 new flow actions
- LGTM observability stack in local infra
- Demo services: structured logging (zap) + Prometheus metrics + OTel endpoint update

---

## Out of Scope

- Grafana dashboard provisioning beyond pre-configured datasources
- OTel metrics / log shipping from the TestMesh API itself
- Plugin SDK examples for new integrations (built-in Go native plugins are the deliverable)
