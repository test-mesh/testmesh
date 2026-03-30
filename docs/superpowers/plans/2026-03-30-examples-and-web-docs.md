# Example Flows & Web Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5 example flows exercising every new action end-to-end, and update the web/docs site with new action reference pages, updated feature pages, and a changelog entry.

**Architecture:** Example flows are YAML files in `examples/` that run against the local stack. Web docs are MDX files in `web/content/docs/` using Fumadocs components (`<Callout>`, `<Cards>`, `<Card>`, `<Tabs>`, `<Tab>`). No build tooling changes needed — Fumadocs picks up new `.mdx` files automatically as long as `meta.json` is updated.

**Tech Stack:** YAML (flow definitions), MDX + Fumadocs (docs), Next.js 16 dev server.

**Spec:** `docs/superpowers/specs/2026-03-30-observability-storage-graph-actions-design.md` §§ Example Flows, Web / Living Docs Updates

**Prerequisite:** Plans 1 and 2 must be complete — all native plugins registered, demo services instrumented, LGTM stack running.

---

## File Map

```
examples/
  observability/
    trace-propagation.yaml     NEW
    log-assertion.yaml         NEW
    metrics-assertion.yaml     NEW
  storage/
    minio-artifacts.yaml       NEW
  graph/
    neo4j-queries.yaml         NEW

web/content/docs/yaml-reference/actions/
  neo4j.mdx                    NEW
  minio.mdx                    NEW
  otel-loki-prometheus.mdx     NEW
  index.mdx                    MODIFIED — add 12 new actions to table
  meta.json                    MODIFIED — add new pages to nav

web/content/docs/features/
  observability.mdx            MODIFIED — add "Asserting on Service Observability"
  plugins.mdx                  MODIFIED — add "Built-in Integrations" section

web/content/docs/getting-started/ (or deployment/)
  MODIFIED — update local dev setup with LGTM ports

web/content/docs/changelog.mdx  MODIFIED — add release entry
```

---

## Task 1: Observability Example Flows

**Files:**
- Create: `examples/observability/trace-propagation.yaml`
- Create: `examples/observability/log-assertion.yaml`
- Create: `examples/observability/metrics-assertion.yaml`

- [ ] **Step 1: Create trace-propagation.yaml**

```yaml
# examples/observability/trace-propagation.yaml
flow:
  name: Trace Propagation
  description: Inject W3C trace context into an HTTP request and verify the span appears in Tempo.
  steps:
    - id: inject_trace
      action: otel.inject
      config:
        service_name: testmesh-flow
        span_name: create-user-traced
      output:
        traceparent: $.traceparent
        trace_id: $.trace_id

    - id: create_user
      action: http_request
      config:
        method: POST
        url: http://user-service:5001/users
        headers:
          traceparent: "{{traceparent}}"
          Content-Type: application/json
        body:
          name: Traced User
          email: traced@example.com
      assert:
        - status == 201

    - id: verify_span
      action: otel.assert
      config:
        backend_url: http://tempo:3200
        trace_id: "{{trace_id}}"
        within: 15s
        assert:
          - "len(spans) > 0"
          - "spans[0].duration_ms < 500"
```

- [ ] **Step 2: Create log-assertion.yaml**

```yaml
# examples/observability/log-assertion.yaml
flow:
  name: Log Assertion
  description: Create a product and verify the structured log line appears in Loki within 5 seconds.
  steps:
    - id: create_product
      action: http_request
      config:
        method: POST
        url: http://product-service:5002/products
        headers:
          Content-Type: application/json
        body:
          name: Log Test Product
          price: 9.99
          stock: 10
      assert:
        - status == 201
      output:
        product_id: $.body.id

    - id: verify_log
      action: loki.assert
      config:
        url: http://loki:3100
        query: '{service="product-service"} |= "created product"'
        start: "-30s"
        within: 5s
        assert:
          - "count > 0"
```

- [ ] **Step 3: Create metrics-assertion.yaml**

```yaml
# examples/observability/metrics-assertion.yaml
flow:
  name: Metrics Assertion
  description: Capture a baseline request count, place three orders, then assert the counter increased by 3.
  steps:
    - id: baseline
      action: prometheus.query
      config:
        url: http://prometheus:9090
        query: 'http_requests_total{service="order-service",route="/orders",status="201"}'
      output:
        baseline_count: $.value

    - id: order_1
      action: http_request
      config:
        method: POST
        url: http://order-service:5003/orders
        headers:
          Content-Type: application/json
        body:
          user_id: 1
          product_id: 1
          quantity: 1
      assert:
        - status == 201

    - id: order_2
      action: http_request
      config:
        method: POST
        url: http://order-service:5003/orders
        headers:
          Content-Type: application/json
        body:
          user_id: 1
          product_id: 2
          quantity: 2
      assert:
        - status == 201

    - id: order_3
      action: http_request
      config:
        method: POST
        url: http://order-service:5003/orders
        headers:
          Content-Type: application/json
        body:
          user_id: 2
          product_id: 1
          quantity: 1
      assert:
        - status == 201

    - id: verify_metric
      action: prometheus.assert
      config:
        url: http://prometheus:9090
        query: 'http_requests_total{service="order-service",route="/orders",status="201"}'
        within: 15s
        assert:
          - "value >= baseline_count + 3"
```

- [ ] **Step 4: Validate flows parse correctly**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/cli
go run main.go validate ../examples/observability/trace-propagation.yaml
go run main.go validate ../examples/observability/log-assertion.yaml
go run main.go validate ../examples/observability/metrics-assertion.yaml
```

Expected: each prints `✓ valid` (or equivalent success output).

- [ ] **Step 5: Commit**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh
git add examples/observability/
git commit -m "feat: add observability example flows (trace propagation, log assertion, metrics assertion)"
```

---

## Task 2: Storage and Graph Example Flows

**Files:**
- Create: `examples/storage/minio-artifacts.yaml`
- Create: `examples/graph/neo4j-queries.yaml`

- [ ] **Step 1: Create minio-artifacts.yaml**

```yaml
# examples/storage/minio-artifacts.yaml
flow:
  name: MinIO Artifact Storage
  description: Store an API response as an artifact in MinIO, verify it, retrieve it, then clean up.
  steps:
    - id: fetch_report
      action: http_request
      config:
        method: GET
        url: http://testmesh-api:5016/health
      assert:
        - status == 200
      output:
        report_body: $.body

    - id: store_artifact
      action: minio.put
      config:
        endpoint: minio:9000
        access_key: minioadmin
        secret_key: minioadmin
        use_ssl: false
        bucket: testmesh
        object: "artifacts/health-report.json"
        data: "{{report_body}}"
        content_type: application/json
      output:
        etag: $.etag

    - id: assert_exists
      action: minio.assert
      config:
        endpoint: minio:9000
        access_key: minioadmin
        secret_key: minioadmin
        use_ssl: false
        bucket: testmesh
        object: "artifacts/health-report.json"
        exists: true
        content_type: application/json
        size_gte: 1

    - id: retrieve_artifact
      action: minio.get
      config:
        endpoint: minio:9000
        access_key: minioadmin
        secret_key: minioadmin
        use_ssl: false
        bucket: testmesh
        object: "artifacts/health-report.json"
        as: json
      assert:
        - "body != null"

    - id: cleanup
      action: minio.delete
      config:
        endpoint: minio:9000
        access_key: minioadmin
        secret_key: minioadmin
        use_ssl: false
        bucket: testmesh
        object: "artifacts/health-report.json"
      assert:
        - "deleted == true"
```

- [ ] **Step 2: Create neo4j-queries.yaml**

```yaml
# examples/graph/neo4j-queries.yaml
flow:
  name: Neo4j Graph Queries
  description: Verify service graph nodes exist and query relationships after creating test data.
  steps:
    - id: create_user
      action: http_request
      config:
        method: POST
        url: http://user-service:5001/users
        headers:
          Content-Type: application/json
        body:
          name: Graph Test User
          email: graph@example.com
      assert:
        - status == 201
      output:
        user_id: $.body.id

    - id: verify_service_nodes
      action: neo4j.assert
      config:
        url: bolt://neo4j:7687
        username: neo4j
        password: testmesh
        query: "MATCH (n:Node) WHERE n.type = 'Service' RETURN n.name AS name"
        assert:
          - "count > 0"

    - id: query_relationships
      action: neo4j.query
      config:
        url: bolt://neo4j:7687
        username: neo4j
        password: testmesh
        query: |
          MATCH (n:Node)
          RETURN n.name AS name, n.type AS type, n.service AS service
          LIMIT 10
      assert:
        - "count > 0"
```

- [ ] **Step 3: Validate flows**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/cli
go run main.go validate ../examples/storage/minio-artifacts.yaml
go run main.go validate ../examples/graph/neo4j-queries.yaml
```

Expected: both print valid.

- [ ] **Step 4: Commit**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh
git add examples/storage/ examples/graph/
git commit -m "feat: add minio artifact storage and neo4j graph query example flows"
```

---

## Task 3: New Action Doc Pages

**Files:**
- Create: `web/content/docs/yaml-reference/actions/neo4j.mdx`
- Create: `web/content/docs/yaml-reference/actions/minio.mdx`
- Create: `web/content/docs/yaml-reference/actions/otel-loki-prometheus.mdx`
- Modify: `web/content/docs/yaml-reference/actions/meta.json`

- [ ] **Step 1: Create neo4j.mdx**

```mdx
---
title: Neo4j
description: Run Cypher queries and assert on graph data using the built-in Neo4j native plugin.
---

The `neo4j` native plugin lets you query and assert on Neo4j graph databases directly in your flows. No installation needed — it ships built into the TestMesh API.

## neo4j.query

Runs any Cypher query and returns the results.

```yaml
- id: find_services
  action: neo4j.query
  config:
    url: bolt://localhost:7687      # required
    username: neo4j                  # required
    password: testmesh               # required
    database: neo4j                  # optional, default "neo4j"
    query: "MATCH (n:Service) RETURN n.name AS name, n.type AS type"
    params:                          # optional map of query parameters
      workspace_id: "{{workspace_id}}"
  output:
    service_count: $.count
```

**Output**

```json
{ "rows": [{"name": "user-service", "type": "http"}], "count": 1 }
```

| Field | Type | Description |
|---|---|---|
| `rows` | array | Each record as a key/value map |
| `count` | number | Number of rows returned |

## neo4j.assert

Runs a Cypher query and asserts on the results inline using [expr-lang](https://expr-lang.org/) expressions — the same syntax used in `assert:` blocks everywhere else in TestMesh.

```yaml
- id: assert_graph
  action: neo4j.assert
  config:
    url: bolt://localhost:7687
    username: neo4j
    password: testmesh
    query: "MATCH (n:Service) RETURN count(n) AS total"
    assert:
      - "rows[0].total > 0"
      - "count == 1"
```

The step fails if any assertion evaluates to false. The output shape is identical to `neo4j.query`.

<Callout type="info">
  Neo4j must be reachable from the TestMesh API. When running locally, start it with `./infra.sh up` — Neo4j will be available at `bolt://localhost:7687`.
</Callout>
```

- [ ] **Step 2: Create minio.mdx**

```mdx
---
title: MinIO / S3
description: Upload, download, delete, and assert on objects in MinIO or any S3-compatible store.
---

The `minio` native plugin provides object storage operations against MinIO or any S3-compatible API. No installation needed.

## Connection fields

All four actions share the same connection config:

| Field | Required | Default | Description |
|---|---|---|---|
| `endpoint` | no | `localhost:9000` | Host:port of MinIO/S3 |
| `access_key` | no | `minioadmin` | Access key ID |
| `secret_key` | no | `minioadmin` | Secret access key |
| `use_ssl` | no | `false` | Enable TLS |

## minio.put

Uploads an object.

```yaml
- id: store_report
  action: minio.put
  config:
    endpoint: minio:9000
    access_key: minioadmin
    secret_key: minioadmin
    bucket: testmesh               # required
    object: reports/run-001.json   # required
    data: "{{response_body}}"      # required — string or base64 bytes
    content_type: application/json # optional
  output:
    etag: $.etag
```

**Output:** `{ "etag": "abc123", "size": 1024, "bucket": "testmesh", "object": "reports/run-001.json" }`

## minio.get

Downloads an object.

```yaml
- id: fetch_artifact
  action: minio.get
  config:
    endpoint: minio:9000
    access_key: minioadmin
    secret_key: minioadmin
    bucket: testmesh
    object: reports/run-001.json
    as: json    # text | base64 | json
  output:
    artifact: $.body
```

**Output:** `{ "body": {...}, "content_type": "application/json", "size": 1024, "etag": "abc123" }`

## minio.delete

Deletes an object.

```yaml
- id: cleanup
  action: minio.delete
  config:
    endpoint: minio:9000
    access_key: minioadmin
    secret_key: minioadmin
    bucket: testmesh
    object: reports/run-001.json
  assert:
    - "deleted == true"
```

## minio.assert

Asserts an object exists (or doesn't), optionally checking content type and size.

```yaml
- id: verify_upload
  action: minio.assert
  config:
    endpoint: minio:9000
    access_key: minioadmin
    secret_key: minioadmin
    bucket: testmesh
    object: reports/run-001.json
    exists: true                    # required
    content_type: application/json  # optional
    size_gte: 100                   # optional: assert size >= N bytes
```

**Output:** `{ "exists": true, "content_type": "application/json", "size": 1024 }`

<Callout type="info">
  MinIO is included in the local dev stack. Start it with `./infra.sh up` — available at `localhost:9000` (console at `localhost:9001`, login: minioadmin/minioadmin).
</Callout>
```

- [ ] **Step 3: Create otel-loki-prometheus.mdx**

```mdx
---
title: Observability (OTel, Loki, Prometheus)
description: Inject trace context, assert on spans in Tempo, query logs in Loki, and validate metrics in Prometheus.
---

TestMesh ships three built-in observability plugins covering the full LGTM stack. Together they let you write flows that verify not just API responses, but the traces, logs, and metrics your services emit.

## How it fits together

```
Flow step (otel.inject)
  → sets traceparent header
  → http_request carries header to your service
  → service emits span to OTel Collector → Tempo
  → otel.assert queries Tempo by trace ID

Flow action triggers your service
  → service logs via zap/OTLP → Loki
  → loki.assert queries Loki with LogQL

Metric counter increments in your service
  → prometheus.query captures baseline
  → ... actions run ...
  → prometheus.assert verifies counter increased
```

---

## otel.inject

Creates an OTel span and injects W3C `traceparent` / `tracestate` into the flow context. Pass the output as a header in subsequent HTTP steps.

```yaml
- id: start_trace
  action: otel.inject
  config:
    service_name: testmesh-flow  # optional
    span_name: create-order      # optional, defaults to step id
  output:
    traceparent: $.traceparent
    trace_id: $.trace_id

- id: create_order
  action: http_request
  config:
    method: POST
    url: http://order-service:5003/orders
    headers:
      traceparent: "{{traceparent}}"
    body: { user_id: 1, product_id: 2, quantity: 1 }
```

**Output:** `{ "traceparent": "00-...", "tracestate": "", "trace_id": "...", "span_id": "..." }`

## otel.assert

Queries Grafana Tempo for spans by trace ID (or service + operation) and asserts on them.

```yaml
- id: verify_trace
  action: otel.assert
  config:
    backend_url: http://tempo:3200  # required
    trace_id: "{{trace_id}}"        # required (or use service + operation)
    within: 10s                     # poll until spans appear or timeout
    assert:
      - "len(spans) > 0"
      - "spans[0].duration_ms < 500"
      - "spans[0].status == 'ok'"
```

**Output:** `{ "spans": [{ "trace_id": "...", "service": "order-service", "operation": "POST /orders", "duration_ms": 42, "status": "ok", "attributes": {...} }] }`

---

## loki.query

Queries Grafana Loki using [LogQL](https://grafana.com/docs/loki/latest/logql/).

```yaml
- id: fetch_logs
  action: loki.query
  config:
    url: http://loki:3100              # required
    query: '{service="order-service"} |= "created order"'  # required (LogQL)
    start: "-5m"                       # optional, relative or RFC3339
    end: "now"                         # optional
    limit: 100                         # optional, default 100
  output:
    log_count: $.count
```

**Output:** `{ "lines": ["2026-03-30T10:00:00Z order-service created order id=abc"], "count": 1 }`

## loki.assert

Queries Loki and asserts on the results, with optional polling.

```yaml
- id: verify_log
  action: loki.assert
  config:
    url: http://loki:3100
    query: '{service="order-service"} |= "created order"'
    start: "-30s"
    within: 5s      # poll until assertion passes or timeout
    assert:
      - "count > 0"
```

---

## prometheus.query

Runs a PromQL instant query against Prometheus.

```yaml
- id: baseline
  action: prometheus.query
  config:
    url: http://prometheus:9090  # required
    query: 'http_requests_total{service="order-service",status="201"}'
  output:
    baseline: $.value
```

**Output:** `{ "value": 42.0, "metric": { "service": "order-service", "status": "201" } }`

## prometheus.assert

Runs PromQL and asserts on the result, with optional polling until the assertion passes.

```yaml
- id: verify_counter
  action: prometheus.assert
  config:
    url: http://prometheus:9090
    query: 'http_requests_total{service="order-service",status="201"}'
    within: 15s
    assert:
      - "value >= baseline + 3"
```

<Callout type="info">
  The full LGTM stack (OTel Collector, Tempo, Loki, Prometheus, Grafana) is included in the local dev setup. Start everything with `./infra.sh up`. Grafana is available at `http://localhost:3002` with Tempo, Loki, and Prometheus pre-configured as datasources.
</Callout>
```

- [ ] **Step 4: Update meta.json to include new pages in nav**

Read the current `web/content/docs/yaml-reference/actions/meta.json` and add the three new pages:

```json
{
  "pages": [
    "index",
    "http-request",
    "database-query",
    "kafka",
    "redis",
    "neo4j",
    "minio",
    "otel-loki-prometheus",
    "websocket",
    "grpc",
    "mock-server",
    "browser",
    "docker",
    "transform",
    "control-flow",
    "utility"
  ]
}
```

(Insert `neo4j`, `minio`, `otel-loki-prometheus` after `redis` — keep the rest in the original order.)

- [ ] **Step 5: Verify docs site builds**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/web
npm run build 2>&1 | tail -20
```

Expected: build succeeds, no MDX errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh
git add web/content/docs/yaml-reference/actions/
git commit -m "docs: add neo4j, minio, otel/loki/prometheus action reference pages"
```

---

## Task 4: Update features/observability.mdx

**Files:**
- Modify: `web/content/docs/features/observability.mdx`

- [ ] **Step 1: Append new section to observability.mdx**

Read the current file and append at the end:

```mdx
---

## Asserting on Service Observability

Beyond TestMesh's own execution visibility, you can use the built-in LGTM plugins to assert on the traces, logs, and metrics that *your services* emit. This closes the loop: not just "did the API return 201?" but "did the service emit the right span, write the right log line, and increment the right counter?"

### Trace propagation

`otel.inject` creates a span and returns W3C `traceparent` / `tracestate` headers. Pass these to your service — any OTel-instrumented service will attach its own spans as children of the injected trace. Then `otel.assert` queries Tempo to verify the full trace.

```yaml
steps:
  - id: inject
    action: otel.inject
    config:
      span_name: place-order
    output:
      traceparent: $.traceparent
      trace_id: $.trace_id

  - id: place_order
    action: http_request
    config:
      method: POST
      url: http://order-service/orders
      headers:
        traceparent: "{{traceparent}}"
      body: { user_id: 1, product_id: 2, quantity: 1 }

  - id: verify_span
    action: otel.assert
    config:
      backend_url: http://tempo:3200
      trace_id: "{{trace_id}}"
      within: 10s
      assert:
        - "len(spans) > 0"
        - "spans[0].duration_ms < 500"
```

### Log assertion

`loki.assert` queries Loki with [LogQL](https://grafana.com/docs/loki/latest/logql/) and asserts that specific log lines appeared — with optional polling until they arrive.

```yaml
- id: verify_log
  action: loki.assert
  config:
    url: http://loki:3100
    query: '{service="order-service"} |= "created order"'
    start: "-30s"
    within: 5s
    assert:
      - "count > 0"
```

### Metrics assertion

`prometheus.assert` runs PromQL and asserts on the result. Capture a baseline before your action, then assert the delta after.

```yaml
- id: baseline
  action: prometheus.query
  config:
    url: http://prometheus:9090
    query: 'http_requests_total{service="order-service",status="201"}'
  output:
    baseline: $.value

# ... run some orders ...

- id: verify
  action: prometheus.assert
  config:
    url: http://prometheus:9090
    query: 'http_requests_total{service="order-service",status="201"}'
    within: 15s
    assert:
      - "value >= baseline + 3"
```

See the [Observability Actions reference](/docs/yaml-reference/actions/otel-loki-prometheus) for full config options and the [observability examples](https://github.com/test-mesh/testmesh/tree/main/examples/observability) for complete flows.
```

- [ ] **Step 2: Verify docs site builds**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/web
npm run build 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/content/docs/features/observability.mdx
git commit -m "docs: add 'Asserting on Service Observability' section to observability page"
```

---

## Task 5: Update features/plugins.mdx

**Files:**
- Modify: `web/content/docs/features/plugins.mdx`

- [ ] **Step 1: Add "Built-in Integrations" section**

Read the current `plugins.mdx`. Add a new section near the top, after the intro `<Cards>` block and before "Plugin Types":

```mdx
## Built-in Integrations

TestMesh ships several native integrations that work without any installation. They use the same action system as external plugins but run inside the API process — no HTTP overhead, no separate process to manage.

<Callout type="info">
  Built-in integrations appear in the dashboard under **Plugins → Built-in Integrations** and are always available in flows using dot-notation action names (e.g. `kafka.produce`, `neo4j.query`).
</Callout>

| Plugin | Actions | Docs |
|---|---|---|
| **Apache Kafka** | `kafka.produce`, `kafka.consume`, `kafka.admin.topics` +2 | [Reference](/docs/yaml-reference/actions/kafka) |
| **PostgreSQL** | `postgresql.query`, `postgresql.insert`, `postgresql.update` +3 | [Reference](/docs/yaml-reference/actions/database-query) |
| **Redis** | `redis.get`, `redis.set`, `redis.del`, `redis.exists` | [Reference](/docs/yaml-reference/actions/redis) |
| **Neo4j** | `neo4j.query`, `neo4j.assert` | [Reference](/docs/yaml-reference/actions/neo4j) |
| **MinIO / S3** | `minio.put`, `minio.get`, `minio.delete`, `minio.assert` | [Reference](/docs/yaml-reference/actions/minio) |
| **OTel / Tempo** | `otel.inject`, `otel.assert` | [Reference](/docs/yaml-reference/actions/otel-loki-prometheus) |
| **Grafana Loki** | `loki.query`, `loki.assert` | [Reference](/docs/yaml-reference/actions/otel-loki-prometheus) |
| **Prometheus** | `prometheus.query`, `prometheus.assert` | [Reference](/docs/yaml-reference/actions/otel-loki-prometheus) |

External plugins (the rest of this page) use an HTTP-based protocol and can be written in any language. Built-in integrations are Go implementations that ship with TestMesh — use them when you need reliability and performance without external dependencies.
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/web
npm run build 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add web/content/docs/features/plugins.mdx
git commit -m "docs: add Built-in Integrations table to plugins page"
```

---

## Task 6: Update Action Reference Index + Local Dev Setup + Changelog

**Files:**
- Modify: `web/content/docs/yaml-reference/actions/index.mdx`
- Modify: relevant getting-started or deployment page
- Modify: `web/content/docs/changelog.mdx`

- [ ] **Step 1: Add new actions to the reference index table**

Read `web/content/docs/yaml-reference/actions/index.mdx`. Find the table listing all action types and add rows for the 12 new actions. Group them under their integration:

```mdx
| `neo4j.query` | Query Neo4j with Cypher | [neo4j](/docs/yaml-reference/actions/neo4j) |
| `neo4j.assert` | Query + inline assert | [neo4j](/docs/yaml-reference/actions/neo4j) |
| `minio.put` | Upload object to MinIO/S3 | [minio](/docs/yaml-reference/actions/minio) |
| `minio.get` | Download object | [minio](/docs/yaml-reference/actions/minio) |
| `minio.delete` | Delete object | [minio](/docs/yaml-reference/actions/minio) |
| `minio.assert` | Assert object exists/metadata | [minio](/docs/yaml-reference/actions/minio) |
| `otel.inject` | Create span, inject traceparent | [observability](/docs/yaml-reference/actions/otel-loki-prometheus) |
| `otel.assert` | Query Tempo, assert on spans | [observability](/docs/yaml-reference/actions/otel-loki-prometheus) |
| `loki.query` | Query Loki with LogQL | [observability](/docs/yaml-reference/actions/otel-loki-prometheus) |
| `loki.assert` | Query Loki + assert | [observability](/docs/yaml-reference/actions/otel-loki-prometheus) |
| `prometheus.query` | Run PromQL instant query | [observability](/docs/yaml-reference/actions/otel-loki-prometheus) |
| `prometheus.assert` | Run PromQL + assert | [observability](/docs/yaml-reference/actions/otel-loki-prometheus) |
```

- [ ] **Step 2: Update local dev setup docs**

Find the getting-started or local setup page (check `web/content/docs/getting-started/` for a relevant file). Find the section listing infra services and add the LGTM stack:

```mdx
| Service | Port | URL |
|---|---|---|
| PostgreSQL | 5432 | — |
| Redis | 6379 | — |
| Kafka | 9092 | — |
| Neo4j | 7687 | http://localhost:7474 |
| MinIO | 9000 | http://localhost:9001 (console) |
| OTel Collector | 4317/4318 | — |
| Grafana Tempo | 3200 | — |
| Grafana Loki | 3100 | — |
| Prometheus | 9090 | http://localhost:9090 |
| Grafana | 3002 | http://localhost:3002 |
```

All services start with `./infra.sh up`.

- [ ] **Step 3: Add changelog entry**

Read `web/content/docs/changelog.mdx`. Prepend a new entry at the top (before the most recent existing entry):

```mdx
## vX.X.X — 2026-03-30

### New: Observability, Storage & Graph Native Plugins

Five new built-in integrations shipping with the OSS engine:

**Neo4j** — query and assert on graph data using Cypher
- `neo4j.query`, `neo4j.assert`

**MinIO / S3** — object storage operations in flows
- `minio.put`, `minio.get`, `minio.delete`, `minio.assert`

**OTel / Tempo** — trace context propagation and span assertion
- `otel.inject`, `otel.assert`

**Grafana Loki** — log query and assertion with LogQL
- `loki.query`, `loki.assert`

**Prometheus** — PromQL queries and metric counter assertions
- `prometheus.query`, `prometheus.assert`

### New: LGTM Local Stack

`./infra.sh up` now starts the full LGTM observability stack alongside existing infrastructure: OTel Collector, Grafana Tempo, Grafana Loki, Prometheus, and Grafana (with all three datasources pre-configured).

### Demo Services

All four demo services (user, product, order, notification) now emit:
- Structured JSON logs via zap, exported to Loki via OTLP
- Prometheus metrics (`http_requests_total`, `http_request_duration_seconds`, `http_requests_in_flight`) on `GET /metrics`
- Traces to OTel Collector (previously went directly to the TestMesh API)
```

- [ ] **Step 4: Final build check**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/web
npm run build
```

Expected: clean build, no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh
git add web/content/docs/
git commit -m "docs: update action index, local dev setup, and changelog for new native plugins"
```

---

## Task 7: Run All New Example Flows End-to-End

With full stack running (infra + API + demo services), validate all 5 flows execute successfully.

- [ ] **Step 1: Start full stack**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh
./infra.sh up
docker-compose -f docker-compose.dev.yml up -d
docker-compose -f docker-compose.services.yml up -d
```

- [ ] **Step 2: Run observability flows**

```bash
cd cli
go run main.go run ../examples/observability/trace-propagation.yaml
go run main.go run ../examples/observability/log-assertion.yaml
go run main.go run ../examples/observability/metrics-assertion.yaml
```

Expected: all three pass.

- [ ] **Step 3: Run storage flow**

```bash
go run main.go run ../examples/storage/minio-artifacts.yaml
```

Expected: pass.

- [ ] **Step 4: Run graph flow**

```bash
go run main.go run ../examples/graph/neo4j-queries.yaml
```

Expected: pass.

- [ ] **Step 5: Final commit**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh
git add -A
git commit -m "feat: validate all new example flows end-to-end against full local stack"
```
