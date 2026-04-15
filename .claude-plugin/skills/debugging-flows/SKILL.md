---
name: debugging-flows
description: Use when a TestMesh flow step fails, an assertion errors, a variable is missing, or a flow produces unexpected results
---

# Debugging TestMesh Flows

Systematic approach: validate → run locally → use debugger → fix assertion or config.

## 1. Start With Validation

```bash
cd testmesh/cli
go run main.go validate path/to/flow.yaml
```

| Error | Fix |
|---|---|
| `missing 'flow:' root key` | Wrap everything under `flow:` |
| `flow.name is required` | Add `name:` under `flow:` |
| `missing 'id' field` | Every step needs `id:` |
| `unknown action 'X'` | See valid action list below |
| `config.url is required` | Add missing required config key |
| `references '{{var}}' but not defined` | Variable used before `output:` defines it |

Valid actions: `http_request`, `database_query`, `kafka_producer`, `kafka_consumer`, `delay`, `log`, `assert`, `transform`, `condition`, `for_each`, `mock_server_start`, `mock_server_stop`, `mock_server_configure`, `contract_generate`, `contract_verify`, `websocket`, `grpc`, `wait_for`, `db_poll`, `redis.get`, `redis.set`, `redis.del`, `redis.exists`, `wait_until`, `parallel`, `run_flow`, `docker_run`, `docker_stop`, `mcp_call`.

## 2. Run Locally

```bash
go run main.go run path/to/flow.yaml
```

Output shows per-step result:
```
   ✅ create_user (http_request) — 45ms
   ❌ verify_order (database_query) — 12ms
      assertion failed:
        - rows[0].status == "confirmed": rows[0].status = "pending"
```

For remote execution via API: `go run main.go run flow.yaml --remote`

## 3. Interactive Debugger

Requires API server running (`go run main.go` in `api/`).

```bash
go run main.go debug path/to/flow.yaml
go run main.go debug path/to/flow.yaml --break step_id
```

| Command | Alias | Description |
|---|---|---|
| `next` | `n` | Execute next step |
| `continue` | `c` | Run to next breakpoint |
| `vars` | `v` | List all variables |
| `print <var>` | `p <var>` | Print variable value |
| `break <step_id>` | `b` | Set breakpoint |
| `watch <var>` | `w` | Watch variable for changes |
| `restart` | `r` | Restart from step 1 |
| `quit` | `q` | End session |

Typical workflow:
```
(debug) n              # execute create_user
(debug) v              # inspect captured variables
(debug) b verify_order # set breakpoint
(debug) c              # run to breakpoint
(debug) p order_id     # order_id = null  ← problem found
```

## 4. Assertion Failures

Assertions use expr-lang. Available variables per action:

**http_request:** `status` (int), `body` (map), `headers` (map), `duration_ms`
**database_query:** `row_count`, `rows` (array), `first_row`, `columns`
**kafka_consumer:** `messages` (array), `count`, `success`, `duration_ms`

**Critical rule — never use `{{var}}` in assertions:**
```yaml
# WRONG
assert:
  - body.user_id == "{{user_id}}"

# CORRECT — bare variable name
assert:
  - body.user_id == user_id
  - status == 201
  - body.id != nil
  - len(body.items) == 1
  - duration_ms < 500
```

## 5. Variable Interpolation

Capture from a step:
```yaml
output:
  user_id: $.body.id        # JSONPath into response body
  auth_token: $.body.token
```

Use in later steps (`{{var}}` and `${var}` both work):
```yaml
config:
  url: "${ORDER_SERVICE_URL}/api/v1/orders"
  body:
    user_id: "{{user_id}}"
```

Cross-step dot notation: `${create_user.body.id}`

Built-in variables: `{{RANDOM_ID}}`, `{{UUID}}`, `{{TIMESTAMP}}`, `{{ISO_TIMESTAMP}}`, `{{DATE}}`, `{{TIME}}`, `{{DATETIME}}`.

## 6. Action-Specific Gotchas

**http_request** — `method` is required; there is no default. `traceparent` injected automatically.

**database_query** — demo services use schema-qualified tables:
```yaml
query: "SELECT * FROM user_service.users WHERE id = $1"
#                     ^^^^^^^^^^^^^ required prefix
```

**kafka_consumer** — add `from_beginning: true` when consumer group hasn't seen the topic:
```yaml
config:
  brokers: "${KAFKA_BROKERS}"
  topic: user.created
  group_id: testmesh-test
  timeout: 15s
  from_beginning: true
  count: 1
```

**Timing issues** — use polling actions instead of fixed delays:
```yaml
# HTTP polling
- id: wait_for_api
  action: wait_for
  config:
    type: http
    url: "http://localhost:5001/health"
    status_code: 200
    timeout: 30s
    interval: 2s

# DB polling
- id: wait_for_record
  action: db_poll
  config:
    connection: "${DB_URL}"
    query: "SELECT status FROM order_service.orders WHERE id = $1"
    params: ["{{order_id}}"]
    timeout: 30s
    interval: 2s
    condition:
      type: row_value
      column: status
      value: "confirmed"
```

## 7. Environment Variables

Define defaults in `flow.env:`, override via `--env` flag or system env:
```yaml
flow:
  name: "E2E"
  env:
    DB_URL: "postgresql://root:admin@localhost:5432/postgres"
    KAFKA_BROKERS: "localhost:9092"
    USER_SERVICE_URL: "http://localhost:5001"
```

In Docker, use container names not `localhost` (`postgres`, `kafka`, `user-service`).

## 8. Setup / Teardown

`setup:` runs before steps, `teardown:` always runs (even on failure):
```yaml
flow:
  setup:
    - id: cleanup
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM order_service.orders WHERE user_id = $1"
        params: ["{{test_user_id}}"]
  steps: [ ... ]
  teardown:
    - id: remove_test_user
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM user_service.users WHERE email = 'test@example.com'"
```

## Debugging Checklist

1. `validate` first — fixes structural issues before running
2. Check infrastructure is up: `./infra.sh up`, `docker ps`
3. Check service health: `curl http://localhost:5001/health`
4. Read the assertion error — it shows the actual value
5. No `{{}}` in `assert:` blocks — use bare variable names
6. Check `output:` JSONPath matches actual response shape
7. Use debugger for complex flows: step through with `n`, inspect with `v`
8. Async results: use `wait_for`/`db_poll`/`wait_until`, not `delay`
9. DB tables: always schema-qualified (`user_service.users`, not `users`)
10. Docker: service URLs use container names, not `localhost`
