# Flow UI / Backend Gap Fix — Design Spec

**Date:** 2026-03-30
**Scope:** Fix all gaps between the TestMesh flow YAML backend capabilities and the OSS dashboard flow editor UI, and implement missing backend action handlers that the UI already exposes.

---

## Background

Analysis revealed three categories of gaps:

1. **Critical bugs** — UI sends wrong field names/shapes; flows silently fail at runtime
2. **Backend-only features** — implemented as native plugins or action fields with no UI exposure (YAML only)
3. **UI-only features** — palette nodes with full forms but no backend handler (will error at runtime)

Work is grouped into 5 independent groups, each shippable on its own.

---

## Group 1 — Kafka & Database Form Fixes

### Kafka Consumer (`KafkaConsumeForm.tsx`)

**Bug fixes:**
- Rename all `match.*` fields to `filter.*` to match backend expectations (`filter.key`, `filter.json_path`)
- Fix `json_path` serialization: UI currently builds an array of lines; serialize to a single string (newline-joined or first element) before submitting, since backend expects `filter.json_path: string`

**Add missing fields:**
- `filter.key_pattern` — regex string input, optional
- `filter.headers` — KeyValueEditor, optional
- `filter.json_value` — string input, optional (pairs with `filter.json_path`)
- `auto_offset_reset` — dropdown: `earliest` | `latest`, shown when `from_beginning` is false
- TLS section (collapsible): `tls.enabled`, `tls.insecure_skip_verify`, `tls.cert_file`, `tls.key_file`, `tls.ca_file`

**Default config fix:** Change default `timeout` from `"10s"` to `"30s"` to match backend default.

### Kafka Producer (`KafkaPublishForm.tsx`)

- Remove `compression` field from UI (backend doesn't implement it), OR implement compression in `async/kafka_producer.go` using the Kafka library's compression codec option — **implement it** (one-liner, high value)
- Add TLS section (collapsible): same fields as consumer — backend `async/kafka_producer.go` already parses them

### Database Query Form (`DatabaseQueryForm.tsx`)

- Replace `db_type` dropdown (postgresql/mysql/sqlite/mongodb/redis) with a static "PostgreSQL" label — backend only supports postgres via GORM
- Remove polling fields (`poll`, `poll_until`, `poll_interval`, `poll_timeout`) — the `db_poll` action already covers this use case; keep a tooltip hint pointing users to `db_poll`
- Remove `row_mapper` and `read_only` fields (no backend support, low value)
- Implement `max_rows` and `timeout` in the database handler (`actions/database.go`): apply `LIMIT` to SELECT queries when `max_rows` set; apply context deadline when `timeout` set
- Remove `query_type` dropdown (query/exec/transaction) — backend auto-detects from SQL; replace with auto-detected display label in result output

---

## Group 2 — Plugin UI

Five native plugins are fully implemented in the backend but have zero UI. Each gets:

- An `ActionType` union entry in `types.ts`
- A palette entry in `NodePalette.tsx` (appropriate category)
- A default config in `utils.ts`
- A form component in `components/flow-editor/forms/`
- Routing in `PropertiesPanel.tsx`

### Redis (`RedisForm.tsx`)

Action dropdown: `redis.get` | `redis.set` | `redis.del` | `redis.exists`

Connection block (collapsible, defaults to localhost:6379):
- `host` (default: `localhost`)
- `port` (default: `6379`)

Action fields:
- `key` — always shown
- `value` — shown for `set` only
- `ttl` — shown for `set` only (duration string, e.g. `"10s"`)

Palette category: **Cache**

### MinIO (`MinioForm.tsx`)

Action dropdown: `minio.put` | `minio.get` | `minio.delete` | `minio.assert`

Connection block (collapsible):
- `endpoint` (default: `localhost:9000`)
- `access_key` (default: `minioadmin`)
- `secret_key` (default: `minioadmin`)
- `use_ssl` (bool)

Action fields:
- `bucket` — always shown
- `object` — always shown
- `data` — shown for `put`
- `content_type` — shown for `put`
- `as` dropdown (text/json/base64) — shown for `get`
- Assertions editor — shown for `assert`

Palette category: **Storage**

### Neo4j (`Neo4jForm.tsx`)

Action dropdown: `neo4j.query` | `neo4j.assert`

Connection block (collapsible):
- `url` (default: `bolt://localhost:7687`)
- `username` (default: `neo4j`)
- `password`
- `database` (default: `neo4j`)

Action fields:
- `query` — Cypher textarea, always shown
- `params` — JSON object editor, optional
- Assertions editor — shown for `assert`

Palette category: **Database**

### OTel (`OtelForm.tsx`)

Action dropdown: `otel.inject` | `otel.assert`

Shared field:
- `span_name` (default: `testmesh-step`)

`otel.assert` additional fields:
- `backend_url` — Tempo endpoint
- `trace_id` — expression (e.g. `${prev.trace_id}`)
- `service` — optional filter
- `operation` — optional filter
- `within` — duration (default: `10s`)
- Assertions editor

Palette category: **Observability**

### PostgreSQL Native (`PostgreSQLNativeForm.tsx`)

Action dropdown: `postgresql.query` | `postgresql.insert` | `postgresql.update` | `postgresql.delete` | `postgresql.assert` | `postgresql.execute` | `postgresql.transaction` | `postgresql.tables` | `postgresql.columns`

Connection block (collapsible, two modes toggled by "Use connection string"):
- Individual fields: `host`, `port`, `user`, `password`, `database`, `sslmode`
- Or: `connectionString` (DSN)

Action-specific fields shown conditionally:
- `query` — for query/assert/execute
- `table` — for insert/update/delete/columns
- `data` — JSON object, for insert/update
- `where` / `whereParams` — for update/delete
- `returning` — for insert/update/delete
- `schema` — for tables/columns
- `statements` — array, for transaction
- Assertions editor — for assert

Palette category: **Database** (distinct from `database_query` which is the generic SQL action)

---

## Group 3 — Control Flow Backends

### `parallel` handler (`actions/parallel.go`)

Config:
```yaml
branches:
  - steps: [...]
  - steps: [...]
max_concurrent: 3      # default: unlimited
fail_fast: true        # default: true
wait_for_all: true     # default: true
```

Implementation:
- Parse `branches` as `[][]StepConfig`
- Launch each branch in a goroutine, using the existing step executor
- Use a semaphore for `max_concurrent`
- Collect results per branch keyed by index
- If `fail_fast` and any branch errors, cancel remaining via context cancellation
- Return merged output map `{ "branch_0": {...}, "branch_1": {...} }`

### `wait_until` handler (`actions/wait_until.go`)

Config:
```yaml
condition: "${status} == 'ready'"
max_duration: "30s"
interval: "1s"
on_timeout: "fail"     # or "continue"
```

Implementation:
- Evaluate `condition` expression on each tick using the existing expression evaluator
- Return immediately on true; return error/continue on timeout based on `on_timeout`

### `run_flow` handler (`actions/run_flow.go`)

Config:
```yaml
flow: "my-flow-name"   # or UUID
input:
  user_id: "${vars.userId}"
inherit_env: true
```

Implementation:
- Load flow definition by name or ID from the store
- Build a child runner with merged env (`inherit_env`) + `input` vars
- Execute synchronously; return child flow's output vars and run summary
- Prevent circular references: track active flow IDs in context, error if `flow` is already in the chain

### `condition` and `for_each` forms

Both currently appear in the palette with no config forms. Add:

**`ConditionForm.tsx`:**
- `expression` — string input (the `when` expression for the branch)
- `then_steps` / `else_steps` — rendered as ordered step lists (add/remove, reorder); each entry shows step ID + action type badge

**`ForEachForm.tsx`:**
- `items` — expression or JSON array input
- `item_var` — variable name (default: `item`)
- `max_iterations` — number, optional
- `continue_on_error` — bool
- `parallel` — bool
- `steps` — ordered step list (same as condition form)

---

## Group 4 — Integration Backends

### `browser` — register in executor

`browser.go` already implements the handler. Add one line to `executor.go` `getActionHandler()`:

```go
case "browser":
    return NewBrowserHandler(r.cfg)
```

No other changes needed.

### `grpc_call` / `grpc_stream` — alias routing

Backend has a single `grpc` handler. Options evaluated:
- Rename UI types to `grpc` — breaks existing saved flows that use `grpc_call`/`grpc_stream`
- Add aliases in executor — **chosen approach**

In `executor.go`, add:
```go
case "grpc_call":
    return NewGRPCHandler(r.cfg)   // existing handler
case "grpc_stream":
    return NewGRPCHandler(r.cfg)
```

Update the gRPC handler to check `config.streaming` (bool) to select unary vs. streaming mode, since the UI already passes this distinction via separate action types.

### `contract_generate` / `contract_verify`

Implement using the [Pact Go](https://github.com/pact-foundation/pact-go) library.

**`contract_generate`** (`actions/contract_generate.go`):
```yaml
consumer: "frontend"
provider: "user-service"
interactions:
  - description: "get user"
    request: { method: GET, path: "/users/1" }
    response: { status: 200, body: { id: 1 } }
output_path: "pacts/"   # or minio:// URI
```

**`contract_verify`** (`actions/contract_verify.go`):
```yaml
contract_id: "${generate_step.contract_id}"  # or path/URI
provider_base_url: "http://user-service:8080"
```

Both registered in `executor.go`. Pact Go added as a Go module dependency.

---

## Group 5 — Step-Level Fields

### `on_error` — wire `ErrorHandlingPanel`

`ErrorHandlingPanel.tsx` exists but is not used. In `PropertiesPanel.tsx`:
- Add an "Error" tab for all step types (currently only "General", "Output", "Retry" tabs exist)
- Render `ErrorHandlingPanel` inside it, bound to `step.on_error`

Backend model `Step.OnError` already exists.

### `step.when` — add Condition field

In `PropertiesPanel.tsx` General tab, add a "Run condition" field above the timeout field:
- Label: "Run condition"
- Placeholder: `${env.STAGE} == "staging"`
- Tooltip: "Step is skipped if this expression evaluates to false"
- Bound to `step.when`

Backend model `Step.When` already exists.

### `mock_server_configure` — palette + form

Add to palette under **Mock Servers** category.

New `MockServerConfigureForm.tsx`:
- `mock_server_id` — string (which mock server to configure)
- `routes` — array editor, each row: `method` dropdown, `path` string, `status` number, `response` JSON textarea, `headers` KeyValueEditor

---

## File Change Summary

### Backend (`testmesh/api/`)

| File | Change |
|---|---|
| `internal/runner/actions/database.go` | Add `max_rows` LIMIT + `timeout` context deadline |
| `internal/runner/actions/async/kafka_producer.go` | Add compression codec support |
| `internal/runner/actions/parallel.go` | **New** — parallel branches handler |
| `internal/runner/actions/wait_until.go` | **New** — polling condition handler |
| `internal/runner/actions/run_flow.go` | **New** — sub-flow execution handler |
| `internal/runner/actions/contract_generate.go` | **New** — Pact contract generation |
| `internal/runner/actions/contract_verify.go` | **New** — Pact contract verification |
| `internal/runner/executor.go` | Register browser, grpc_call, grpc_stream, parallel, wait_until, run_flow, contract_generate, contract_verify |
| `internal/runner/actions/grpc.go` | Add `streaming` bool handling |
| `go.mod` / `go.sum` | Add pact-go dependency |

### Dashboard (`testmesh/dashboard/`)

| File | Change |
|---|---|
| `components/flow-editor/types.ts` | Add: `redis.*`, `minio.*`, `neo4j.*`, `otel.*`, `postgresql.*`, `mock_server_configure` to ActionType |
| `components/flow-editor/utils.ts` | Add default configs for all new types; fix kafka_consumer defaults |
| `components/flow-editor/NodePalette.tsx` | Add palette entries for all new types in appropriate categories |
| `components/flow-editor/PropertiesPanel.tsx` | Route new types; add Error tab + `on_error`; add `when` field to General tab |
| `components/flow-editor/forms/KafkaConsumeForm.tsx` | Fix `match.*`→`filter.*`; fix json_path; add TLS + missing filter fields |
| `components/flow-editor/forms/KafkaPublishForm.tsx` | Add compression + TLS |
| `components/flow-editor/forms/DatabaseQueryForm.tsx` | Remove unsupported fields; implement max_rows/timeout |
| `components/flow-editor/forms/RedisForm.tsx` | **New** |
| `components/flow-editor/forms/MinioForm.tsx` | **New** |
| `components/flow-editor/forms/Neo4jForm.tsx` | **New** |
| `components/flow-editor/forms/OtelForm.tsx` | **New** |
| `components/flow-editor/forms/PostgreSQLNativeForm.tsx` | **New** |
| `components/flow-editor/forms/MockServerConfigureForm.tsx` | **New** |
| `components/flow-editor/forms/ConditionForm.tsx` | **New** |
| `components/flow-editor/forms/ForEachForm.tsx` | **New** |

---

## Implementation Order

Groups are independent. Recommended execution order if sequential:

1. **Group 1** (bug fixes) — highest risk, should ship first
2. **Group 5** (step-level fields) — pure wiring, very low risk
3. **Group 2** (plugin UI) — UI-only, no backend risk
4. **Group 3** (control flow backends) — new backend handlers
5. **Group 4** (integration backends) — has external dependency (pact-go)

If using parallel agents: Groups 1, 2, 3, 4, 5 can all run concurrently since they touch different files.

---

## Out of Scope

- Implementing multi-database support in `database_query` (mysql, sqlite, mongodb) — separate project
- Adding new infrastructure actions beyond what's already designed
- Changes to the cloud dashboard (cloud/dashboard/)
- Agent relay changes
