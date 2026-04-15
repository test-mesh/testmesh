---
name: testmesh-mcp-tools
description: Use when working with TestMesh MCP tools to analyze services, generate flows, run tests, or interact with the TestMesh API. Covers all mcp__testmesh__* tools and the workflows that connect them.
---

# TestMesh MCP Tools

Complete reference for all `mcp__testmesh__*` tools and the workflows that connect them.

---

## Tool Inventory

### Discovery & Schema

| Tool | Purpose |
|---|---|
| `list_workspaces` | List all workspaces — always call first to get a `workspace_id` |
| `list_flows_api` | List flows stored in the API (returns flow IDs for `trigger_execution`) |
| `list_flows` | List flow YAML files on disk recursively under a directory |
| `get_action_types` | All supported action types with required/optional config fields |
| `get_yaml_schema` | Complete YAML schema with examples for every action type |
| `get_testing_guide` | Best-practices guide: layers, assertions, async, setup/teardown |

### Analysis

| Tool | Purpose |
|---|---|
| `analyze_workspace` | Multi-service analysis: endpoints, schemas, Kafka topics, DB tables, call graph |
| `analyze_service` | Single-service analysis: endpoints, DB tables, Kafka topics, Redis keys |
| `get_coverage_gaps` | Show uncovered endpoints/operations and coverage percentage |
| `generate_test_plan` | Structured context for planning a full test suite across a workspace |

### Authoring

| Tool | Purpose |
|---|---|
| `generate_flow` | Focused context for writing one flow (endpoints, schemas, examples, guidance) |
| `write_flow` | Write + validate a flow YAML to disk |
| `write_env_file` | Write a shared `.env.test` file for infrastructure connection strings |
| `validate_flow` | Validate flow structure, action types, and variable dependencies without executing |

### Execution

| Tool | Purpose |
|---|---|
| `run_step` | Run a single action step in isolation — debug a query, probe an endpoint |
| `run_flow` | Execute a flow (inline YAML or file path) and return per-step results |
| `run_suite` | Execute a directory or test plan with tiered validation (tiers 1–4) |
| `upload_flow` | Upload a flow to the API — makes it visible in the dashboard |
| `trigger_execution` | Trigger an API-stored flow by ID; returns `execution_id` |
| `get_execution` | Poll an `execution_id` for full per-step results |

---

## Standard Workflows

### New project: analyze → plan → write → run

```
1. list_workspaces            → get workspace_id
2. analyze_workspace          → understand endpoints, schemas, Kafka, DB, dependencies
3. get_testing_guide          → read best practices before writing anything
4. generate_test_plan         → structure coverage plan (services × categories)
5. write_env_file             → create shared .env.test
6. generate_flow (×N)        → get focused context per flow
7. write_flow (×N)           → save each flow (validates on write)
8. run_suite --tier 1         → structural validation pass
9. run_suite --tier 4         → full execution
```

### Single-service flows

```
1. analyze_service            → endpoint + schema inventory
2. get_yaml_schema            → confirm field names for actions used
3. write_env_file             → shared env if not already present
4. generate_flow              → focused context for each scenario
5. write_flow                 → save + validate
6. run_flow                   → execute and inspect results
```

### Debug a failing step

```
1. validate_flow              → catch structural issues first
2. run_step                   → run the failing action in isolation with assertions
3. run_flow                   → full flow with per-step output
```

### API-managed flow lifecycle

```
1. upload_flow                → POST to API, get flow_id
2. trigger_execution          → start run, get execution_id
3. get_execution              → poll for results
```

---

## Tool Usage Notes

### `analyze_workspace` vs `analyze_service`

Use `analyze_workspace` for multi-service projects (e.g. `testmesh/demo-services/`). Use `analyze_service` for a single service directory. Both accept optional infra connection params:

```
db_connection:  postgres://root:admin@localhost:5432/postgres?sslmode=disable
kafka_brokers:  localhost:9092
redis_addr:     localhost:6379
```

### `generate_flow` categories

| Category | When to use |
|---|---|
| `happy-path` | Nominal request + verify DB/Kafka side effects |
| `error-handling` | 4xx responses, validation errors, missing auth |
| `cross-service` | Multi-service chains (user → order → product) |
| `edge-case` | Boundary values, concurrent writes, empty results |

### `run_suite` tiers

| Tier | What it checks |
|---|---|
| 1 | YAML syntax, action types, variable dependency order |
| 2 | HTTP health checks, PostgreSQL `SELECT 1`, Kafka/Redis connectivity |
| 3 | Setup steps only (infra access without full flow execution) |
| 4 | Full end-to-end execution of all flows |

Always run tier 1 before tier 4. Use tier 2–3 when infrastructure availability is uncertain.

### `run_step` — isolate and debug

Run a single action without a full flow. Useful for confirming a SQL query, checking a Redis key, or probing an HTTP response shape:

```
action: database_query
config:
  connection: "postgres://root:admin@localhost:5432/postgres"
  query: "SELECT * FROM user_service.users WHERE email = $1"
  params: ["test@example.com"]
assert:
  - row_count == 1
  - rows[0].status == "active"
```

### `write_env_file` — shared infra config

Write once, reference in every flow via `env_file: .env.test`:

```
DB_URL=postgresql://root:admin@localhost:5432/postgres?sslmode=disable
KAFKA_BROKERS=localhost:9092
REDIS_ADDR=localhost:6379
USER_SERVICE_URL=http://localhost:5001
ORDER_SERVICE_URL=http://localhost:5002
PRODUCT_SERVICE_URL=http://localhost:5003
PAYMENT_SERVICE_URL=http://localhost:5004
```

In Docker Compose, replace `localhost` with container service names (`postgres`, `kafka`, `user-service`, etc.).

### `upload_flow` + `trigger_execution` + `get_execution`

For API-managed execution (dashboard-visible, org-scoped):

```
upload_flow       → yaml: <full YAML>   → returns flow_id
trigger_execution → flow_id: <id>       → returns execution_id
get_execution     → execution_id: <id>  → per-step pass/fail, durations, errors
```

`trigger_execution` also accepts `environment` (environment name) and `variables` (override map) for parameterized runs.

---

## Workspace Defaults

The TestMesh demo workspace uses:

- **Workspace ID:** `00000000-0000-0000-0000-000000000001`
- **OSS API:** `http://localhost:5016`
- **Demo services:** ports 5001–5004 (user, order, product, payment)
- **DB schema prefix:** always schema-qualify tables (`user_service.users`, not `users`)

---

## Common Mistakes

| Mistake | Fix |
|---|---|
| Using `{{var}}` in `assert:` blocks | Use bare variable names: `body.id == user_id` |
| Calling `trigger_execution` without uploading first | Call `upload_flow` first to get a `flow_id` |
| Skipping `list_workspaces` | Always run it first — other tools need `workspace_id` |
| Running tier 4 suite against stopped infra | Run tier 2 first to verify connectivity |
| Writing flows without `write_env_file` | Create `.env.test` first; reference via `env_file:` in flow |
| Hardcoding `localhost` in Docker flows | Use container service names: `postgres`, `kafka`, `user-service` |
