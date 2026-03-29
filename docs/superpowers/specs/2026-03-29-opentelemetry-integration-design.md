# OpenTelemetry Integration Design

**Date:** 2026-03-29
**Status:** Draft
**Scope:** OSS (ingestion, graph mapping, flow discovery, validation) + Cloud (LLM analysis, suggested fixes, recommendations)

---

## 1. Overview

Integrate OpenTelemetry into TestMesh to transform it from a guess-based testing tool into a data-driven system validation engine. Real production traces feed the system graph, enable automatic flow discovery, and provide ground truth for test validation and root cause analysis.

### Goals

- Ingest production traces via OTLP to build a runtime view of system behavior
- Enrich the existing system graph with observed runtime topology and metrics
- Automatically discover real user flows from trace patterns
- Instrument the test runner to emit traces and propagate context to downstream services
- Validate test executions by comparing actual traces against expected graph paths
- Provide root cause analysis at three tiers: structural diff (OSS), LLM explanation (Cloud), suggested fix (Cloud)

### Non-Goals

- Replacing existing observability tools (Jaeger, Tempo, Datadog)
- Storing full raw trace data (TestMesh stores span summaries only)
- Building a custom trace query language (reuse expr-lang/expr)
- LLM-powered scenario generation from traces (follow-up spec)

### Supersedes

This design moves runtime graph enrichment (the "runtime layer") to OSS. The system graph spec (`2026-03-27-system-graph-design.md`) designated the runtime layer as Cloud-only. This spec supersedes that decision: OTLP-based trace ingestion and graph enrichment are OSS features. The existing `api/internal/graph/cloud/runtime_scanner.go` handles execution-result-based enrichment and remains Cloud; the new trace scanner handles OTLP-based enrichment and is OSS. Both coexist — they enrich the graph from different data sources.

---

## 2. Architecture

```
Production Services (instrumented with OTel SDK)
        │
        ▼
  OTel Collector
        │
        ▼ OTLP HTTP/protobuf
  ┌─────────────────────────────────────────────────┐
  │  TestMesh OSS API                                │
  │                                                   │
  │  /otlp/v1/traces ──► Span Processor              │
  │                         │                         │
  │                         ├──► spans table (Postgres)│
  │                         │                         │
  │                         └──► Trace Scanner         │
  │                               │                   │
  │                               ▼                   │
  │                         System Graph (Neo4j)       │
  │                               │                   │
  │                               ▼                   │
  │                         Flow Discovery             │
  │                               │                   │
  │                               ▼                   │
  │                         discovered_flows table     │
  │                                                   │
  │  Runner (executor.go)                             │
  │    │ creates root span per execution              │
  │    │ child span per step                          │
  │    │ injects traceparent into outgoing calls      │
  │    │                                              │
  │    └──► same OTLP pipeline                        │
  │                                                   │
  │  Trace Validator                                  │
  │    │ compares execution trace vs expected path    │
  │    │ evaluates trace_assert expressions           │
  │    └──► trace_validation_results table            │
  │                                                   │
  │  Root Cause (Tier 1 — structural diff)            │
  └─────────────────────────────────────────────────┘
              │
              ▼ (Cloud proxy)
  ┌─────────────────────────────────────────────────┐
  │  TestMesh Cloud API                               │
  │                                                   │
  │  Root Cause (Tier 2 — LLM explanation)            │
  │    DiagnosisAgent + trace diff context             │
  │                                                   │
  │  Root Cause (Tier 3 — suggested fix)              │
  │    RepairAgent + SelfHealingEngine                 │
  │    Auto-PR if enabled                              │
  │                                                   │
  │  Flow Recommender                                 │
  │    LLM ranks discovered flows by risk              │
  │                                                   │
  │  Trace Analytics Dashboard                        │
  └─────────────────────────────────────────────────┘
```

---

## 3. OTLP Ingestion Pipeline

### 3a. OTLP Receiver

**Endpoint:** `POST /otlp/v1/traces`

Accepts standard OTLP HTTP/protobuf trace exports. This path follows the OTLP specification convention so users can point any OpenTelemetry Collector at `http://testmesh-host:5016/otlp/v1/traces` without custom path configuration.

**Authentication:** Workspace-scoped via an `X-Workspace-ID` header or an API key mapped to a workspace. The receiver rejects traces without valid workspace association.

**Protocol:** HTTP/protobuf only (no gRPC). Covers all collectors and keeps the dependency footprint minimal. gRPC support can be added later if demand warrants it.

**Cloud routing:** The cloud proxy forwards `/otlp/*` to the OSS API like any other route. No cloud-specific ingestion logic.

### 3b. Span Processor

**New package:** `api/internal/telemetry/`

Processing pipeline for each incoming ExportTraceServiceRequest:

1. Parse OTLP protobuf into internal `Span` model
2. Extract key attributes (service name, operation, db.system, messaging.destination, etc.)
3. Store span summary in PostgreSQL `telemetry.spans` table
4. Dispatch to Trace Scanner for graph mapping (async, buffered channel)
5. Check if trace is complete (all spans received) and dispatch to Flow Discovery if so

**Span model (internal):**

```go
type Span struct {
    ID            uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
    TraceID       string     `gorm:"size:32;index" json:"trace_id"`
    SpanID        string     `gorm:"size:16" json:"span_id"`
    ParentSpanID  string     `gorm:"size:16" json:"parent_span_id"`
    WorkspaceID   uuid.UUID  `gorm:"type:uuid;index" json:"workspace_id"`
    Service       string     `json:"service"`
    Operation     string     `json:"operation"`
    Kind          string     `json:"kind"`
    StatusCode    string     `json:"status_code"`
    DurationMs    int64      `json:"duration_ms"`
    Attributes    JSONMap    `gorm:"type:jsonb" json:"attributes"`
    IsTestGenerated bool     `gorm:"default:false" json:"is_test_generated"`
    StartTime     time.Time  `json:"start_time"`
    CreatedAt     time.Time  `gorm:"index" json:"created_at"`
}

func (Span) TableName() string { return "telemetry.spans" }
```

`JSONMap` follows the same custom JSONB type pattern used in `api/internal/graph/models.go` (the `JSONMap` type with `Scan`/`Value` methods for GORM). The telemetry package defines its own `JSONMap` or imports the graph package's type.

**Trace completeness detection:** A trace is considered complete when no new spans for that trace_id arrive within a configurable window (default 30 seconds). Implemented via a buffered aggregation — spans are grouped by trace_id in memory, flushed to flow discovery after the quiet window expires.

**Memory bounds:** The in-memory trace buffer holds at most 10,000 concurrent incomplete traces. If the buffer is full, the oldest incomplete trace is evicted (its spans are already persisted to PostgreSQL; only flow discovery for that trace is skipped). On process restart, incomplete traces in the buffer are lost — this is acceptable because spans are already in the database and will be picked up by the next periodic scan or simply skipped.

### 3c. Workspace Trace Settings

Stored in workspace configuration (existing workspace settings table or new columns):

| Setting | Type | Default | Description |
|---|---|---|---|
| `otlp_enabled` | bool | false | Whether the workspace accepts OTLP traces |
| `trace_viewer_url` | string | "" | URL template for external trace viewer. Use `{trace_id}` placeholder. Example: `https://tempo.company.com/trace/{trace_id}` |
| `trace_retention_days` | int | 30 | Auto-cleanup span summaries older than this |

The `trace_viewer_url` is backend-agnostic. Works with Jaeger, Tempo, Datadog, Zipkin, Honeycomb, X-Ray, or any tool that supports trace ID in the URL.

### 3d. Retention and Cleanup

A background job runs periodically (default every hour) to delete spans older than `trace_retention_days`. Uses a simple `DELETE FROM telemetry.spans WHERE workspace_id = ? AND created_at < ?` query.

**TimescaleDB optimization (optional):** If TimescaleDB is available, the `telemetry.spans` table can be converted to a hypertable with `SELECT create_hypertable('telemetry.spans', 'created_at')`. This enables automatic chunk-based partitioning, compression, and retention policies. The application code is identical — this is a deployment-time optimization documented in the operations guide.

---

## 4. Trace Scanner (Graph Mapping)

### 4a. Scanner Design

**New file:** `api/internal/graph/scanner/trace/trace_scanner.go`

Follows the same directory pattern as the existing scanners under `api/internal/graph/scanner/` (`code/`, `infra/`, `spec/`, `flow/`). The trace scanner is a new scanner directory, adding a **runtime layer** to the system graph.

**Graph layers after this integration:**
- Code layer — static structure from source code
- Infra layer — infrastructure topology from deployment config
- Spec layer — API specifications
- Flow layer — test flow definitions
- History layer — execution results (Cloud, existing `cloud/runtime_scanner.go`)
- **Runtime layer** — observed behavior from production traces (OSS, new)

### 4b. Span to Node Mapping

| Span Attribute | Graph Node Type | Node Properties |
|---|---|---|
| `service.name` | ServiceNode | name, observed_latency_avg, request_count, error_count |
| `http.route` or `http.url` | APINode | method, path, service |
| `db.system` + `db.name` | DatabaseNode | system (postgres/mysql/redis), name |
| `db.statement` (table extracted) | TableNode | table_name, database |
| `messaging.system` + `messaging.destination` | TopicNode | system (kafka/rabbitmq), topic_name |

**Attribute extraction rules:**
- `service.name` comes from the resource attributes (standard OTel semantic convention)
- `http.route` is preferred over `http.url` for APINode identity (avoids ID explosion from path parameters)
- Table name extraction from `db.statement`: simple regex for `FROM`, `INTO`, `UPDATE`, `JOIN` clauses. Not a full SQL parser — covers 90% of cases.
- If an attribute is missing, the span is still processed but the corresponding node type is skipped.

### 4c. Span to Edge Mapping

Parent-child span relationships produce graph edges using the existing `EdgeType` constants from `api/internal/graph/models.go`:

- **`calls` edge:** When span A (service X) is the parent of span B (service Y), create a `calls` edge from ServiceNode X to ServiceNode Y.
- **`reads`/`writes` edges:** When a service span has a child database span, create a `reads` edge (for SELECT/query operations) or `writes` edge (for INSERT/UPDATE/DELETE operations). Operation type is inferred from `db.statement` or span operation name.
- **`publishes`/`consumes` edges:** When a service span has a child messaging span, create a `publishes` edge (for producer-kind spans) or `consumes` edge (for consumer-kind spans) from the ServiceNode to the TopicNode.
- **`exposes` edge:** When a server-kind span has `http.route`, create an `exposes` edge from the ServiceNode to the APINode.

**Edge properties (updated incrementally):**
- `call_count` — incremented each time the edge is observed
- `avg_duration_ms` — rolling average of the child span's duration
- `error_count` — incremented when the child span has error status
- `last_seen_at` — timestamp of most recent observation

### 4d. Merge Behavior

The trace scanner uses the existing merge engine (`api/internal/graph/merge.go`):

- **Node exists (from code/infra scanner):** Enrich with runtime metrics. The node gains observed latency, request count, and error count. The node's `source` metadata tracks that it was seen by both static analysis and runtime traces.
- **Node does not exist:** Create it. This solves the bootstrap problem — first traces create the graph automatically. The node's `source` is marked as `runtime_only` until a code or infra scan confirms it.
- **Edge exists:** Update metrics (call count, avg duration, error count).
- **Edge does not exist:** Create it. New edges discovered via traces that weren't visible in static analysis represent runtime-only call paths.

### 4e. Drift Detection Foundation

When the trace scanner observes a call path that contradicts the code scanner's graph:
- A code-scanner edge A→B exists but traces never show this path → potentially dead code
- Traces show A→C but no code-scanner edge exists → runtime-only dependency

These discrepancies are stored as `GraphDrift` records for later surfacing in the dashboard and as input to flow discovery drift detection (Section 5e).

---

## 5. Flow Discovery

### 5a. Trace to Graph Path

**New file:** `api/internal/telemetry/discovery.go`

When a trace is complete (all spans received, quiet window expired):

1. Reconstruct the span tree from parent-child relationships
2. Walk the tree depth-first to produce an ordered list of graph node references
3. Each node reference is: `{node_type, node_id}` (resolved via the graph)
4. The result is a `GraphPath` — the ordered sequence of nodes this trace traversed

Example:
```
Trace: POST /orders → order-service → payment-service → PostgreSQL(orders.items) → Kafka(orders.created)

GraphPath: [
  APINode(/orders, POST),
  ServiceNode(order-service),
  ServiceNode(payment-service),
  TableNode(orders.items),
  TopicNode(orders.created)
]
```

### 5b. Path Fingerprinting

Create a deterministic fingerprint from the graph path:

```
fingerprint = SHA256(
  join(path.map(node => "{node.type}:{node.identifier}"), " → ")
)
```

The fingerprint ignores: timing, payload, span attributes, trace ID. Two traces with the same service call sequence and the same operations produce the same fingerprint.

**Branching:** If a service calls different downstream services based on conditions (e.g., payment type), these produce different fingerprints and thus different discovered flows. This is correct — they ARE different flows.

### 5c. Flow Template Creation

When a new fingerprint appears:

```go
type DiscoveredFlow struct {
    ID              uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
    WorkspaceID     uuid.UUID  `gorm:"type:uuid;index" json:"workspace_id"`
    Fingerprint     string     `gorm:"size:64;uniqueIndex:idx_ws_fingerprint" json:"fingerprint"`
    EntryPoint      string     `json:"entry_point"`
    GraphPath       JSONMap    `gorm:"type:jsonb" json:"graph_path"`
    SampleTraceID   string     `gorm:"size:32" json:"sample_trace_id"`
    OccurrenceCount int64      `gorm:"default:1" json:"occurrence_count"`
    AvgDurationMs   int64      `json:"avg_duration_ms"`
    P95DurationMs   int64      `json:"p95_duration_ms"`
    ErrorRate       float64    `json:"error_rate"`
    RiskScore       float64    `gorm:"index" json:"risk_score"`
    Drifted         bool       `gorm:"default:false" json:"drifted"`
    DriftDiff       JSONMap    `gorm:"type:jsonb" json:"drift_diff,omitempty"`
    LastSeenAt      time.Time  `json:"last_seen_at"`
    CreatedAt       time.Time  `json:"created_at"`
}

func (DiscoveredFlow) TableName() string { return "telemetry.discovered_flows" }
```

When an existing fingerprint is seen again: increment `OccurrenceCount`, update duration stats and error rate, update `LastSeenAt`, optionally update `SampleTraceID` if the new trace is more representative (e.g., has more complete spans).

**P95 duration computation:** Approximate using on-demand query against the `telemetry.spans` table. When a discovered flow's stats are updated, query: `SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) FROM telemetry.spans WHERE workspace_id = ? AND trace_id IN (SELECT trace_id FROM ... matching fingerprint traces) AND parent_span_id = ''` (root spans only). This runs at flow-update time, not per-span, keeping overhead manageable. For workspaces with very high trace volume, a periodic background job can recompute p95 in bulk.

### 5d. Flow Ranking

Discovered flows are ranked by a composite risk score:

```
risk_score = (frequency_weight * normalized_occurrence_count)
           + (error_weight * error_rate)
           + (variance_weight * latency_coefficient_of_variation)
```

Default weights: frequency=0.3, error=0.5, variance=0.2. Configurable per workspace.

This ranking drives the "what should you test first" recommendation — high-risk flows that are frequently used and error-prone surface to the top.

### 5e. Drift Detection

When a known fingerprint's graph path changes (a service added, removed, or reordered):

1. Mark the discovered flow as `drifted`
2. Store the before/after path diff
3. Flag any existing test flows that were exported from this discovered flow as potentially stale
4. Surface in the dashboard as a drift alert

### 5f. Flow Export to YAML

A discovered flow can be exported as a TestMesh flow YAML:

```yaml
flow:
  name: "POST /orders (discovered)"
  description: "Auto-discovered from production traces"
  discovered_from:
    fingerprint: "abc123..."
    sample_trace_id: "def456..."
    occurrence_count: 1247
  steps:
    - id: create_order
      action: http_request
      config:
        method: POST
        url: "http://order-service/orders"
        timeout: 2500  # from p95 duration
      assert:
        - status == 201
    - id: verify_payment
      action: http_request
      config:
        method: GET
        url: "http://payment-service/payments/{{create_order.body.payment_id}}"
        timeout: 1500
      assert:
        - status == 200
```

This export is deterministic — no LLM required. Timing thresholds come from observed p95 durations. Payload templates come from the sample trace's span attributes. Variable linking (`{{step.body.field}}`) is inferred from common patterns in span attributes.

---

## 6. Runner Instrumentation

### 6a. Execution Tracing

**Modified:** `api/internal/runner/executor.go`

When a flow execution starts:

1. Create a root span: `testmesh.execution`
   - Attributes: `testmesh.execution_id`, `testmesh.flow_name`, `testmesh.workspace_id`
2. For each step, create a child span: `testmesh.step.{action_type}`
   - Attributes: `testmesh.step_id`, `testmesh.step_name`, `testmesh.action_type`
3. When the step completes, record duration, status, and assertion results on the span

**Workspace ID propagation:** The executor resolves workspace ID from the execution context (`execCtx.Get("workspace_id")`), which is set by the API handler when triggering the execution. This value is included as a span attribute and used to associate runner-emitted spans with the correct workspace in the span processor.

### 6b. Trace Context Propagation

For outgoing calls, the runner injects W3C Trace Context headers:

| Action Type | Propagation Method |
|---|---|
| `http_request` | `traceparent` + `tracestate` HTTP headers |
| `grpc_call` | gRPC metadata `traceparent` |
| `kafka_producer` | Kafka message header `traceparent` |
| `kafka_consumer` | Extract `traceparent` from consumed message headers (links consumer span to producer trace) |
| `redis_set/get` | Not propagated (no standard mechanism) |
| `database_query` | Not propagated (trace links via parent span) |

This produces a unified trace: test step spans → downstream service spans → their database/messaging spans, all sharing the same trace ID.

### 6c. Execution Record Linking

**Modified:** `api/internal/storage/models/execution.go`

Add `TraceID string` column to the `Execution` model. Set when the root span is created. This links every execution to its full distributed trace.

### 6d. Self-Ingestion

The runner's spans flow through the same OTLP pipeline as production traces. The span processor recognizes `testmesh.*` span names and tags them as test-generated (`is_test_generated = true`). Both types enrich the graph and feed flow discovery, but they can be filtered separately in queries.

---

## 7. Trace Validation

### 7a. Validation Trigger

After a test execution completes and its trace is fully received (quiet window expired), the validation pipeline runs automatically.

### 7b. Layer 1 — Path Correctness

Compare the execution's actual graph path against the expected path.

**Expected path sources (in priority order):**
1. Explicit `expected_path` in the flow YAML (if specified)
2. The discovered flow baseline that this flow was exported from (via `discovered_from.fingerprint`)
3. The most common graph path for the same entry point (fallback)

**Diff output:**
- `missing_nodes` — nodes in expected path not seen in trace
- `unexpected_nodes` — nodes in trace not in expected path
- `order_violations` — nodes present but in wrong sequence
- `path_match` — boolean, true if actual matches expected exactly

### 7c. Layer 2 — Performance

For each span in the trace:

**Threshold sources (in priority order):**
1. Explicit `trace_assert` duration assertion in the flow YAML
2. Discovered flow baseline p95 duration for the corresponding span
3. Workspace-level default timeout

**Checks:**
- Span duration vs threshold
- Span status code (error spans flagged)
- Total trace duration vs flow timeout
- Span count anomaly (significantly more/fewer spans than baseline)

### 7d. Layer 3 — Behavioral Assertions

New `trace_assert` block in flow YAML, evaluated using the existing `expr-lang/expr` evaluator.

**Syntax:**

```yaml
steps:
  - id: create_order
    action: http_request
    config:
      method: POST
      url: "http://order-service/orders"
    assert:
      - status == 201
    trace_assert:
      - trace.span("payment-service").duration_ms < 500
      - trace.span("db").attributes["db.statement"] not contains "SELECT *"
      - trace.has_error == false
      - trace.span_count <= 10
      - trace.span("kafka-producer").attributes["messaging.destination"] == "orders.created"
```

**Expression context variables:**

| Variable | Type | Description |
|---|---|---|
| `trace.spans` | []Span | All spans in the execution trace |
| `trace.span(service)` | Span | First span matching service name |
| `trace.span_count` | int | Total number of spans |
| `trace.has_error` | bool | Whether any span has error status |
| `trace.duration_ms` | int64 | Total trace duration |
| `trace.services` | []string | Unique service names in trace |

**Span fields available in expressions:**

| Field | Type |
|---|---|
| `span.service` | string |
| `span.operation` | string |
| `span.duration_ms` | int64 |
| `span.status_code` | string |
| `span.kind` | string |
| `span.attributes[key]` | any |
| `span.child_count` | int |

### 7e. Validation Result

```go
type TraceValidationResult struct {
    ID                uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
    ExecutionID       uuid.UUID  `gorm:"type:uuid;uniqueIndex" json:"execution_id"`
    TraceID           string     `gorm:"size:32" json:"trace_id"`
    PathMatch         bool       `json:"path_match"`
    PerformancePass   bool       `json:"performance_pass"`
    AssertionsPass    bool       `json:"assertions_pass"`
    PathDiff          JSONMap    `gorm:"type:jsonb" json:"path_diff"`
    PerformanceIssues JSONMap    `gorm:"type:jsonb" json:"performance_issues"`
    FailedAssertions  JSONMap    `gorm:"type:jsonb" json:"failed_assertions"`
    RootCauseDiff     JSONMap    `gorm:"type:jsonb" json:"root_cause_diff"`
    CreatedAt         time.Time  `json:"created_at"`
}

func (TraceValidationResult) TableName() string { return "telemetry.trace_validation_results" }
```

Stored alongside the execution result. The dashboard shows validation results as a tab on the execution detail page.

---

## 8. Root Cause Analysis

### 8a. Tier 1 — Structural Diff (OSS)

Deterministic, no LLM. Produced automatically when trace validation fails.

**Output structure:**

```json
{
  "path_diff": {
    "expected": ["ServiceNode:order", "ServiceNode:payment", "TableNode:orders"],
    "actual": ["ServiceNode:order", "ServiceNode:payment-fallback", "TableNode:orders"],
    "missing": ["ServiceNode:payment"],
    "unexpected": ["ServiceNode:payment-fallback"]
  },
  "error_chain": [
    {
      "span": "payment-service",
      "status": "error",
      "attributes": {"http.status_code": 503},
      "children_affected": 2
    }
  ],
  "performance_breaches": [
    {
      "span": "db-query",
      "expected_ms": 50,
      "actual_ms": 340,
      "threshold_source": "discovered_flow_p95"
    }
  ],
  "failed_assertions": [
    {
      "expression": "trace.span(\"payment-service\").duration_ms < 500",
      "actual_value": 2340
    }
  ]
}
```

**Dashboard rendering:** Expected graph path on top, actual graph path below, differences highlighted. Error spans shown in red, slow spans in yellow. Links to external trace viewer via `trace_viewer_url` template.

### 8b. Tier 2 — LLM Explanation (Cloud)

**Cloud file:** `api/internal/ai/trace_diagnosis.go` (in the cloud repo)

Extends the existing `DiagnosisAgent` with trace context. The agent receives:

- Structural diff (from Tier 1)
- Graph topology around the failure point (neighboring nodes and edges)
- Discovered flow baseline (what normal looks like)
- Span attributes from error spans

**Prompt structure:**

```
You are analyzing a test execution failure. The test validated a distributed trace
against the expected system behavior.

Expected flow: {expected_path}
Actual flow: {actual_path}
Diff: {path_diff}

Error spans:
{error_span_details}

Performance breaches:
{performance_details}

System graph context (services around the failure):
{graph_neighborhood}

Normal behavior baseline:
{discovered_flow_stats}

Explain why this test failed. Identify the root cause, which service is responsible,
and what triggered the deviation from expected behavior.
```

**Output:** Human-readable explanation stored as `diagnosis` field on the execution result.

### 8c. Tier 3 — Suggested Fix (Cloud)

**Cloud file:** `api/internal/ai/trace_repair.go` (in the cloud repo)

Extends the existing `RepairAgent` and `SelfHealingEngine`. Receives the Tier 2 diagnosis plus:

- Source code context around the failing service (from the system graph code layer)
- Similar past failures (from the history layer / embeddings if available)

**Fix categories:**

1. **Test update** — The system behavior changed legitimately; update the test flow to match. Output: modified flow YAML.
2. **Code fix** — The failure is a bug in the service. Output: code diff suggestion.
3. **Config fix** — The failure is due to misconfiguration (timeout too low, pool too small). Output: config change suggestion.

**Auto-PR:** If the workspace has GitHub integration with auto-PR enabled (from the GitHub+LLM spec), suggested fixes can be submitted as pull requests automatically. Confidence threshold applies.

---

## 9. API Endpoints

### 9a. OSS API Endpoints

New endpoints in the OSS API for telemetry features:

| Method | Path | Description |
|---|---|---|
| POST | `/otlp/v1/traces` | OTLP trace ingestion (outside /api/v1, follows OTLP convention) |
| GET | `/api/v1/workspaces/:id/telemetry/flows` | List discovered flows (supports `?sort=risk_score&drifted=true` filters) |
| GET | `/api/v1/workspaces/:id/telemetry/flows/:flow_id` | Get discovered flow detail |
| POST | `/api/v1/workspaces/:id/telemetry/flows/:flow_id/export` | Export discovered flow as YAML |
| GET | `/api/v1/workspaces/:id/telemetry/spans` | Query spans (supports `?trace_id=&service=&status=error` filters) |
| GET | `/api/v1/workspaces/:id/executions/:exec_id/trace-validation` | Get trace validation result for an execution |
| GET | `/api/v1/workspaces/:id/telemetry/drift` | List drift alerts |
| PUT | `/api/v1/workspaces/:id/settings/telemetry` | Update trace settings (otlp_enabled, trace_viewer_url, retention_days) |
| GET | `/api/v1/workspaces/:id/settings/telemetry` | Get trace settings |

### 9b. Cloud API Endpoints

New endpoints in the cloud API (all under `/api/v1`, JWT-protected):

| Method | Path | Description |
|---|---|---|
| GET | `/analytics/traces/diagnose/:execution_id` | Tier 2 LLM explanation for a failed execution |
| POST | `/analytics/traces/repair/:execution_id` | Tier 3 suggested fix for a failed execution |
| GET | `/analytics/traces/recommendations` | LLM-ranked discovered flows by risk (what to test next) |

### 9c. Flow Recommender

**Cloud file:** `api/internal/ai/flow_recommender.go` (in the cloud repo)

Queries discovered flows ranked by risk score, then uses the LLM to:
- Explain WHY each flow is high-risk (based on error rate, latency variance, graph centrality)
- Suggest specific test scenarios for each flow
- Identify coverage gaps (high-risk flows with no corresponding test flows)

---

## 10. Cloud Dashboard Pages

### 10a. Trace Analytics

**Cloud file:** `dashboard/app/(dashboard)/analytics/traces/page.tsx` (in the cloud repo)

- Discovered flow explorer with risk ranking
- Drift alerts (flows whose graph path changed)
- Trace comparison view (expected vs actual)
- Coverage heatmap (which discovered flows have tests, which don't)

### 10b. Execution Trace Tab

**Modified:** Execution detail page (both OSS and Cloud dashboards)

- New "Trace" tab showing the span tree
- Validation results (path correctness, performance, assertions)
- Structural diff visualization
- Link to external trace viewer
- Cloud: LLM diagnosis and suggested fix (Tiers 2 and 3)

---

## 11. Data Model

### 11a. New Tables (OSS — `telemetry` schema)

All telemetry tables use the `telemetry` schema, following the codebase convention where each domain owns its schema (`graph.graph_nodes`, `executions.executions`, etc.). The migration creates the schema with `CREATE SCHEMA IF NOT EXISTS telemetry`.

**`telemetry.spans`**

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| trace_id | VARCHAR(32) | Index, OTLP hex trace ID |
| span_id | VARCHAR(16) | OTLP hex span ID |
| parent_span_id | VARCHAR(16) | Empty for root spans |
| workspace_id | UUID | FK to workspaces, index |
| service | VARCHAR | Resource service.name |
| operation | VARCHAR | Span name |
| kind | VARCHAR | client/server/producer/consumer/internal |
| status_code | VARCHAR | ok/error/unset |
| duration_ms | BIGINT | |
| attributes | JSONB | Selected span attributes |
| is_test_generated | BOOLEAN | True for runner-emitted spans |
| start_time | TIMESTAMP | Span start time |
| created_at | TIMESTAMP | Index, used for retention cleanup |

**Index:** `(workspace_id, trace_id)`, `(workspace_id, created_at)`, `(workspace_id, service, operation)`

TimescaleDB-compatible: can be converted to hypertable on `created_at` at deployment time.

**`telemetry.discovered_flows`**

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| workspace_id | UUID | FK to workspaces, index |
| fingerprint | VARCHAR(64) | SHA256, unique per workspace |
| entry_point | VARCHAR | Root span service + operation |
| graph_path | JSONB | Ordered node references |
| sample_trace_id | VARCHAR(32) | Representative trace |
| occurrence_count | BIGINT | Default 1 |
| avg_duration_ms | BIGINT | |
| p95_duration_ms | BIGINT | |
| error_rate | FLOAT | 0.0–1.0 |
| risk_score | FLOAT | Composite ranking score |
| drifted | BOOLEAN | Default false |
| drift_diff | JSONB | Before/after path diff |
| last_seen_at | TIMESTAMP | |
| created_at | TIMESTAMP | |

**Index:** `(workspace_id, fingerprint)` unique, `(workspace_id, risk_score DESC)`

**`telemetry.trace_validation_results`**

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| execution_id | UUID | FK to executions, unique |
| trace_id | VARCHAR(32) | |
| path_match | BOOLEAN | |
| performance_pass | BOOLEAN | |
| assertions_pass | BOOLEAN | |
| path_diff | JSONB | Missing, unexpected, reordered nodes |
| performance_issues | JSONB | Slow spans, error spans, timeouts |
| failed_assertions | JSONB | Expression, expected, actual |
| root_cause_diff | JSONB | Tier 1 structural diff |
| created_at | TIMESTAMP | |

### 11b. Modified Tables

**`executions.executions`** — add column:
- `trace_id VARCHAR(32)` — links execution to its distributed trace

**Workspace settings** — add columns:
- `otlp_enabled BOOLEAN DEFAULT false`
- `trace_viewer_url VARCHAR` — URL template with `{trace_id}` placeholder
- `trace_retention_days INTEGER DEFAULT 30`

### 11c. Graph Additions (Neo4j)

**New node properties (on existing node types):**
- `observed_avg_latency_ms` (FLOAT)
- `observed_request_count` (INT)
- `observed_error_count` (INT)
- `last_observed_at` (DATETIME)
- `source` — extended to include `runtime` alongside `code`, `infra`

**New edge properties (on `calls`, `reads`, `writes`, `publishes`, `consumes`, `exposes` edges):**
- `call_count` (INT)
- `avg_duration_ms` (FLOAT)
- `error_count` (INT)
- `last_observed_at` (DATETIME)

**No new Neo4j node types.** Discovered flows are PostgreSQL-only entities. The `graph_path` JSONB column stores references to graph node IDs, but discovered flows are not represented as graph nodes themselves. This keeps the graph focused on system topology and avoids mixing metadata entities with infrastructure entities.

---

## 12. New Packages and Files

### OSS (testmesh repo)

| Path | Purpose |
|---|---|
| `api/internal/telemetry/receiver.go` | OTLP HTTP receiver, request parsing |
| `api/internal/telemetry/processor.go` | Span processing pipeline, storage, dispatch |
| `api/internal/telemetry/discovery.go` | Flow discovery, fingerprinting, ranking |
| `api/internal/telemetry/validation.go` | Three-layer trace validation |
| `api/internal/telemetry/rootcause.go` | Tier 1 structural diff generation |
| `api/internal/telemetry/models.go` | Span, DiscoveredFlow, TraceValidationResult models |
| `api/internal/telemetry/repository.go` | Database access for all telemetry tables |
| `api/internal/telemetry/cleanup.go` | Retention-based span cleanup job |
| `api/internal/telemetry/handlers.go` | HTTP handlers for OSS telemetry API endpoints |
| `api/internal/graph/scanner/trace/trace_scanner.go` | Span → graph node/edge mapping |

### Cloud (cloud repo at `/Users/gosh/Dev/testmesh/cloud`)

| Path | Purpose |
|---|---|
| `api/internal/ai/trace_diagnosis.go` | Tier 2 LLM explanation |
| `api/internal/ai/trace_repair.go` | Tier 3 suggested fix |
| `api/internal/ai/flow_recommender.go` | LLM-ranked flow recommendations |
| `dashboard/app/(dashboard)/analytics/traces/page.tsx` | Trace analytics dashboard |

### Modified Files (OSS)

| Path | Change |
|---|---|
| `api/internal/runner/executor.go` | OTel SDK instrumentation, trace context propagation, workspace ID on spans |
| `api/internal/runner/actions/http.go` | Inject traceparent headers |
| `api/internal/runner/actions/kafka_producer.go` | Inject traceparent in message headers |
| `api/internal/runner/actions/kafka.go` | Extract traceparent from consumed message headers |
| `api/internal/runner/actions/grpc.go` | Inject traceparent in metadata |
| `api/internal/storage/models/execution.go` | Add TraceID column |
| `api/internal/api/routes.go` | Register OTLP receiver endpoint, wire telemetry pipeline and handlers |
| `api/internal/shared/database/database.go` | Create telemetry schema, migrations for new tables |
| `api/internal/graph/merge.go` | Support runtime-sourced nodes and edge metric updates |

### Modified Files (Cloud)

| Path | Change |
|---|---|
| `api/internal/router/router.go` | Register cloud trace analysis endpoints |
| `api/internal/analytics/handlers.go` | Add trace diagnosis/repair/recommendation handlers |

---

## 13. Dependencies

### New Go Dependencies (OSS)

| Package | Purpose |
|---|---|
| `go.opentelemetry.io/otel` | OTel API for runner instrumentation |
| `go.opentelemetry.io/otel/sdk/trace` | Span creation and export |
| `go.opentelemetry.io/otel/propagation` | W3C Trace Context injection/extraction |
| `go.opentelemetry.io/proto/otlp` | OTLP protobuf message types for the receiver |

### No New Infrastructure

- PostgreSQL: already required (span summaries stored here)
- Neo4j: already required (graph enrichment)
- No new databases, message queues, or external services

---

## 14. OSS / Cloud Feature Split

| Feature | OSS | Cloud |
|---|---|---|
| OTLP receiver | Yes | Proxied to OSS |
| Span storage + cleanup | Yes | — |
| Trace scanner (graph mapping) | Yes | — |
| Flow discovery + ranking | Yes | — |
| Flow export to YAML | Yes | — |
| Drift detection | Yes | — |
| Runner instrumentation | Yes | — |
| Trace validation (all 3 layers) | Yes | — |
| Root cause Tier 1 (structural diff) | Yes | — |
| Telemetry API endpoints (flows, spans, settings) | Yes | — |
| Root cause Tier 2 (LLM explanation) | — | Yes |
| Root cause Tier 3 (suggested fix + auto-PR) | — | Yes |
| Flow recommender (LLM-ranked) | — | Yes |
| Trace analytics dashboard | — | Yes |
| Execution trace tab (basic) | Yes | Enhanced |

---

## 15. Verification

### Phase 1: Ingestion + Graph Mapping
- Configure OTel Collector to export to TestMesh OTLP endpoint
- Verify spans appear in `telemetry.spans` table with correct attributes
- Verify new graph nodes created for previously unknown services
- Verify existing graph nodes enriched with runtime metrics
- Verify retention cleanup removes old spans
- Verify trace buffer respects 10,000 concurrent trace limit

### Phase 2: Flow Discovery
- Ingest multiple traces for the same endpoint
- Verify they produce the same fingerprint and increment occurrence_count
- Ingest a trace with a different call path for the same endpoint
- Verify it produces a new discovered flow
- Verify p95 duration is computed correctly
- Export a discovered flow to YAML, verify it's valid and runnable

### Phase 3: Runner Instrumentation
- Execute a test flow against instrumented services
- Verify a unified trace appears (test steps + downstream service spans)
- Verify execution record has trace_id set
- Verify runner spans are tagged as test-generated
- Verify trace context propagation (traceparent headers in outgoing HTTP)
- Verify Kafka consumer extracts traceparent from message headers

### Phase 4: Trace Validation
- Execute a flow where the actual trace matches the expected path — verify all layers pass
- Execute a flow where a service is down — verify path diff shows missing node
- Execute a flow with a slow span — verify performance breach detected
- Add `trace_assert` expressions — verify they evaluate correctly against span data
- Verify validation results stored and visible on execution detail page

### Phase 5: Root Cause (OSS)
- Trigger a validation failure
- Verify structural diff is generated with correct missing/unexpected/reordered nodes
- Verify error chain walks to first error span
- Verify dashboard renders expected vs actual path comparison

### Phase 6: Root Cause (Cloud)
- Trigger a validation failure in cloud environment
- Verify Tier 2 LLM explanation is generated
- Verify Tier 3 suggested fix is generated
- If auto-PR enabled, verify PR is created with fix
- Verify flow recommender returns ranked flows with explanations

### Phase 7: OSS API Endpoints
- Verify `GET /api/v1/workspaces/:id/telemetry/flows` returns discovered flows with correct sorting
- Verify `POST .../flows/:id/export` produces valid YAML
- Verify `GET .../telemetry/spans?trace_id=...` returns matching spans
- Verify `PUT .../settings/telemetry` updates workspace trace config
- Verify `GET .../executions/:id/trace-validation` returns validation result
- Verify `GET .../telemetry/drift` returns drifted flows
