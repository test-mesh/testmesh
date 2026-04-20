# Tracing Integration — Write & Fix Tests from Real Traffic

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it trivial for teams already using OpenTelemetry to send their spans to TestMesh and get leverage from that data: generating runnable test flows from real traces, repairing failing tests using trace diffs, and surfacing untested endpoints ranked by production risk.

**Architecture:** Extend the existing `SpanProcessor → discoveryCh` async pipeline with a `TraceEnrichmentWorker` that runs four jobs per completed trace: flow discovery (existing), coverage gap indexing (new), execution linking + repair queuing (new), and LLM-based trace insight summarization (new). All on-demand user actions (generate flow, view repair suggestion) read from pre-computed cache so LLM latency is invisible.

**Tech Stack:** Go (backend pipeline + HTTP handlers), PostgreSQL (new tables in `telemetry` schema), OpenAI/Claude via existing AI provider abstraction, Next.js (new Coverage page + execution detail changes), existing `SpanProcessor`, `FlowDiscovery`, `TelemetryHandler`, `RepairAgent` (extended).

---

## Sub-system 1: Integration Path

### How external services send spans

Teams with OTel already configured point their exporter at TestMesh:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://your-testmesh:5016
OTEL_EXPORTER_OTLP_HEADERS="X-Workspace-ID=<workspace-uuid>"
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
```

No collector required. The receiver at `POST /otlp/v1/traces` accepts both gzip-compressed and plain protobuf, and both `application/x-protobuf` and `application/proto` content-types.

For teams already routing through an OTel Collector, the collector bridge path (documented in `infra/otel-collector.yaml`) remains valid — no code change needed.

### Auth

Two auth modes, both accepted simultaneously:

| Mode | Header | Use case |
|------|--------|----------|
| Workspace UUID | `X-Workspace-ID: <uuid>` | Local dev, trusted internal network |
| API key | `Authorization: Bearer tm_live_<token>` | Internet-facing, production |

**New model: `workspace_api_keys`**
```
id (uuid), workspace_id (uuid), name (text), key_hash (text),
prefix (text, e.g. "tm_live_abc1"), last_used_at, created_at, revoked_at
```

The receiver resolves the API key → workspace ID and proceeds identically to the UUID path. Keys are shown once on creation (stored as bcrypt hash). Revocation sets `revoked_at`.

### Receiver robustness

- Accept `application/x-protobuf` and `application/proto` content-types (in addition to current handling)
- Return OTLP-conformant error responses (`ExportTraceServiceResponse` protobuf) on failure, not JSON
- gRPC OTLP endpoint is out of scope — `http/protobuf` covers all modern OTel SDKs; gRPC requires a separate server port and significant infra work

---

## Sub-system 2: TraceEnrichmentWorker

The central coordinator that replaces the ad-hoc discovery channel consumer.

**Location:** `api/internal/telemetry/enrichment.go`

```go
type TraceEnrichmentWorker struct {
    discovery   *FlowDiscovery       // existing
    coverage    *CoverageIndexer     // new
    linker      *ExecutionLinker     // new
    insights    *TraceInsightCache   // new
    execRepo    *repository.ExecutionRepository
    logger      *zap.Logger
}
```

**Pipeline per completed trace:**
1. `FlowDiscovery.ProcessCompletedTrace()` — existing, unchanged
2. `CoverageIndexer.Update(workspaceID, traceID)` — upsert gap records
3. `ExecutionLinker.LinkTrace(workspaceID, traceID)` — find execution with matching `trace_id`, if status=failed queue repair
4. `TraceInsightCache.Summarize(workspaceID, traceID)` — LLM summarization, async, non-blocking (errors logged, not fatal)

Steps 1–3 are synchronous within the worker goroutine. Step 4 is dispatched to a separate goroutine pool (size 4) so LLM latency does not block the pipeline.

---

## Sub-system 3: Trace → Test Generation (AI-Enhanced)

### TraceInsightCache

**Location:** `api/internal/telemetry/insights.go`

**New model: `telemetry.trace_insights`**
```
trace_id (text, PK), workspace_id (uuid),
span_summary (jsonb),     -- ordered call sequence with extracted attrs
inferred_intent (text),   -- LLM: one sentence describing what this trace does
generated_yaml (text),    -- LLM: full YAML flow
confidence (float),       -- LLM: 0-1
coverage (jsonb),         -- list of endpoints covered: [{method, route, service}]
llm_model (text),
created_at, updated_at
```

**Span summary extraction** (deterministic, no LLM):

For each span (ordered by `start_time`, non-TestMesh only):
```json
{
  "service": "order-service",
  "operation": "POST /orders",
  "kind": "server",
  "status_code": "ok",
  "duration_ms": 45,
  "http_method": "POST",
  "http_route": "/orders",
  "http_status": 201,
  "request_body_sample": "{\"user_id\": \"...\", \"items\": [...]}",
  "response_body_sample": "{\"id\": \"ord_123\", \"status\": \"pending\"}",
  "request_headers": {"content-type": "application/json"}
}
```

Request/response bodies come from OTel semantic convention attributes: `http.request.body`, `http.response.body`. If absent, the span body fields are omitted. Bodies truncated to 2 KB per span.

**Variable extraction** (deterministic):

Walk spans in order. For each span N response body, check if any JSON field value appears as a path segment or query param in span N+1..N+k URLs. If so, emit an `output:` block for span N and `{{var_name}}` substitution in subsequent steps.

Example: span 1 response `{"id": "usr_abc"}`, span 2 URL `/orders?user_id=usr_abc` → extract `user_id: $.body.id` from step 1, use `{{user_id}}` in step 2.

**LLM prompt** (sent to AI provider via existing `ai/provider.go`):

```
You are generating a TestMesh YAML integration test from a real production trace.

Trace summary (ordered service calls):
<span_summary JSON>

Existing flows in this workspace (for style reference):
<top 3 flows, truncated to 500 chars each>

Generate a complete TestMesh YAML flow that:
1. Tests this interaction end-to-end
2. Uses variable extraction between steps where values flow between calls
3. Includes status code assertions on every HTTP step
4. Includes response body assertions for key fields (IDs, status fields, counts)
5. Uses realistic placeholder values ({{base_url}}, {{api_key}}) for configuration
6. Adds a clear description explaining what scenario is being tested

Return JSON: {"yaml": "...", "confidence": 0.0-1.0, "intent": "one sentence"}
```

**API endpoint:**

```
POST /api/v1/workspaces/:workspace_id/telemetry/traces/:trace_id/generate-flow
```

Response:
```json
{
  "yaml": "flow:\n  name: ...",
  "confidence": 0.87,
  "coverage": [{"method": "POST", "route": "/orders", "service": "order-service"}],
  "cached": true
}
```

`cached: true` if `TraceInsight` existed (fast path). `cached: false` if computed on demand (first call, may be slow).

**UI:**
- "Generate test" button on: Trace Explorer trace detail, Discovered Flows list rows, Coverage Gaps page rows
- On click: POST to generate endpoint → show YAML in a modal with "Save as flow" and "Copy" buttons
- "Save as flow" → `POST /api/v1/workspaces/:id/flows` with the YAML → redirect to flow editor

---

## Sub-system 4: Trace-Assisted Repair

### RepairAnalyzer

**Location:** `api/internal/telemetry/repair.go` (new, distinct from `ai/repair_agent.go` which uses graph context)

**New model: `telemetry.repair_suggestions`**
```
id (uuid), execution_id (uuid, FK), workspace_id (uuid),
step_id (text),           -- which flow step failed
diagnosis (text),         -- LLM: paragraph explaining what diverged
yaml_diff (text),         -- human-readable unified diff, for display only
fixed_yaml (text),        -- LLM: complete replacement flow YAML (used for apply)
confidence (float),
status (text),            -- pending | accepted | dismissed
applied_at, created_at
```

**Trigger:** `ExecutionLinker.LinkTrace()` finds an execution with matching `trace_id` and `status=failed` → calls `RepairAnalyzer.Analyze(executionID, traceID)` in the worker pool.

**Analysis steps:**

1. Load execution steps where `status=failed`, with their `error_message` and `output` (HTTP status, body)
2. Load spans for the trace where `is_test_generated=false`
3. For each failed step, find matching real span:
   - Match by: HTTP method + URL path overlap + time window overlap with step's `started_at`/`finished_at`
   - If no match found: note "no matching span — service may not have been reached"
4. Build diff context per failed step:
   ```json
   {
     "step": {"name": "create order", "action": "http_request", "expected_status": 201},
     "actual": {"status": 404, "body": "{\"error\": \"user not found\"}"},
     "span": {"service": "order-service", "operation": "POST /orders", "duration_ms": 8,
               "upstream_calls": ["GET /users/usr_abc → 404 from user-service"]}
   }
   ```
5. Load current flow YAML for the execution's flow
6. LLM call:
   ```
   A TestMesh flow step failed. Here is the context:

   Failed step + expected behavior: <step config + assertions>
   What actually happened (from trace): <diff context>
   Current flow YAML: <full YAML>

   Produce JSON:
   {
     "diagnosis": "one paragraph: root cause and what diverged",
     "fixed_yaml": "complete updated flow YAML with only the failing step changed",
     "yaml_diff": "human-readable unified diff for display only (not used for applying)",
     "confidence": 0.0-1.0
   }

   Change only the failing step(s). Do not modify passing steps.
   ```
7. Store `RepairSuggestion` record — `yaml_diff` field stores the display diff, `fixed_yaml` stores the full replacement YAML

**Apply endpoint:**

```
POST /api/v1/executions/:id/repair-suggestions/:sid/apply
```

- Loads `fixed_yaml` from the suggestion (pre-validated full YAML, not a patch)
- Parses and validates the YAML against the flow schema
- Saves as the new flow definition
- Updates suggestion `status=accepted`, `applied_at=now`
- Updates suggestion `status=accepted`, `applied_at=now`
- Returns `{"flow_id": "...", "redirect": "/flows/:id"}`

**UI changes on execution detail page (`app/executions/[id]/page.tsx`):**

When `execution.status === 'failed'` and `execution.trace_id` is set:

1. Poll `GET /executions/:id/repair-suggestions` every 3s until `status !== 'pending'` (or use existing WebSocket)
2. When suggestion arrives, show a new card above the step list:

```
┌─────────────────────────────────────────────────────────┐
│ ✦ Repair Suggestion  (confidence: 87%)                  │
│                                                         │
│ The create-order step failed because user-service       │
│ returned 404 for GET /users/usr_abc. The user ID was    │
│ extracted from a previous step but the format changed   │
│ from integer to UUID. Update the extraction expression. │
│                                                         │
│ [View diff ▾]                                           │
│  - output:                                              │
│  -   user_id: $.body.id                                 │
│  + output:                                              │
│  +   user_id: $.body.uuid                               │
│                                                         │
│ [Apply fix]  [Edit in editor]  [Dismiss]                │
└─────────────────────────────────────────────────────────┘
```

3. Existing "Analyze with AI" button passes `trace_id` as additional context to the existing `analyzeFailure` mutation (minor change to handler)

---

## Sub-system 5: Coverage Gap Surface

### CoverageIndexer

**Location:** `api/internal/telemetry/coverage.go`

**New model: `telemetry.coverage_gaps`**
```
id (uuid), workspace_id (uuid),
service (text), operation (text), method (text), route (text),
occurrence_count (int), last_seen_at (timestamptz),
error_count (int, default 0),     -- spans with status_code='error' for this endpoint
avg_latency_ms (float, default 0),
risk_score (float),
has_test_flow (bool, default false),
sample_trace_id (text),   -- most recent trace ID for this endpoint
created_at, updated_at
UNIQUE (workspace_id, service, method, route)
```

**Gap detection** (called by `TraceEnrichmentWorker` per completed trace):

1. Extract `(service, operation, http.method, http.route, status_code, duration_ms)` from non-TestMesh spans
2. Upsert each endpoint into `coverage_gaps`: increment `occurrence_count`, `error_count` (if status_code=error), update rolling `avg_latency_ms`, update `last_seen_at`, `sample_trace_id`
3. Recompute `risk_score`: `0.3*(occurrences/1000 capped at 1) + 0.5*(error_count/occurrence_count) + 0.2*(avg_latency_ms/10000 capped at 1)`

**Gap marking** (called on flow save/delete):

Scan flow definition for `http_request` steps. Extract method + URL path. Match against `coverage_gaps` rows. Set `has_test_flow=true/false`.

**API:**

```
GET /api/v1/workspaces/:id/telemetry/coverage-gaps
  ?uncovered=true (default)
  ?sort=risk_score (default) | last_seen_at | occurrence_count
  ?limit=50&offset=0
```

Response:
```json
{
  "gaps": [
    {
      "id": "...",
      "service": "order-service",
      "method": "POST",
      "route": "/orders",
      "occurrence_count": 1420,
      "last_seen_at": "2026-04-15T10:23:00Z",
      "risk_score": 0.73,
      "has_test_flow": false,
      "sample_trace_id": "c25ee7bb802a097b..."
    }
  ],
  "total": 12,
  "uncovered_count": 8
}
```

**UI — new `/coverage` page (`app/coverage/page.tsx`):**

- Table columns: Service | Method + Route | Calls seen | Risk | Last seen | Status | Action
- Risk shown as colored bar: red (>0.7), amber (0.3–0.7), green (<0.3)
- Status badge: "No test" (red) / "Has test" (green)
- "Generate test" button per uncovered row → calls generate-flow endpoint → opens YAML modal
- Filter tabs: All | Uncovered | Has test
- Empty state: "No endpoints seen yet — send traces to TestMesh to discover your coverage"
- Sidebar nav: add "Coverage" between "Traces" and "Settings"

---

## Docs

### New files (in `testmesh/web/content/docs/tracing/` or `testmesh/docs/guides/tracing/`)

**`overview.md`** — Pipeline diagram, what TestMesh does with traces, links to three sub-docs.

**`integration.md`** — Integration guide:
- Direct send: 3 env vars, copy-paste snippet
- API key setup (where to find in Settings UI)
- Collector bridge: copy-paste otel-collector.yaml exporter block
- Verification steps
- Troubleshooting table (content-type mismatch, missing header, gzip, firewall)

**`test-generation.md`** — How to generate tests from traces:
- What span attributes improve generation quality (`http.request.body`, `http.response.body`, `http.route`)
- The generated YAML structure
- Editing and saving generated flows

**`repair.md`** — How repair suggestions work:
- When they appear
- Reading the diagnosis + diff
- Apply / dismiss / edit
- Confidence score guidance

### Updated files

- `testmesh/docs/features/` or `CLAUDE.md` — add `TraceInsight`, `RepairSuggestion`, `coverage_gaps` models to telemetry section
- `testmesh/infra/otel-collector.yaml` — add header comment referencing integration doc

---

## Data Flow Summary

```
OTel-instrumented service
  │  OTLP/HTTP  X-Workspace-ID or Bearer token
  ▼
POST /otlp/v1/traces  (receiver.go)
  │
  ▼
SpanProcessor.ProcessOTLP()
  ├── telemetry.spans  (persist)
  └── discoveryCh  ──►  TraceEnrichmentWorker
                          ├── FlowDiscovery.ProcessCompletedTrace()
                          │     └── telemetry.discovered_flows
                          ├── CoverageIndexer.Update()
                          │     └── telemetry.coverage_gaps
                          ├── ExecutionLinker.LinkTrace()
                          │     └── if execution failed → RepairAnalyzer.Analyze()
                          │           └── telemetry.repair_suggestions
                          └── TraceInsightCache.Summarize()  [goroutine pool]
                                └── telemetry.trace_insights

On-demand:
  POST .../traces/:id/generate-flow  →  TraceInsightCache (fast if cached)
  GET  .../coverage-gaps             →  telemetry.coverage_gaps
  GET  .../repair-suggestions        →  telemetry.repair_suggestions
  POST .../repair-suggestions/:id/apply  →  patches flow definition
```

## Out of Scope

- OTel SDK instrumentation guides (teams already have OTel)
- Metrics or logs ingestion (traces only)
- Multi-collector fan-out configuration
- Flow versioning UI (apply uses existing flow update mechanism)
- Real-time streaming of repair suggestions (polling is sufficient)
