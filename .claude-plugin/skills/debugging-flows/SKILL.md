---
name: debugging-flows
description: Use when a TestMesh flow step fails, an assertion errors, a variable is missing, or a flow produces unexpected results
---

# Debugging TestMesh Flows

Systematic approach: validate → isolate → run → fix.

## 1. Validate First

Use `mcp__testmesh__validate_flow` before running anything.

| Error | Fix |
|---|---|
| `missing 'flow:' root key` | Wrap everything under `flow:` |
| `flow.name is required` | Add `name:` under `flow:` |
| `missing 'id' field` | Every step needs `id:` |
| `unknown action 'X'` | Check action list in `yaml-schema` skill |
| `config.url is required` | Add missing required config key |
| `references '{{var}}' but not defined` | Variable used before `output:` defines it |
| `duplicate step id 'X'` | Step IDs must be unique within the flow |

## 2. Isolate the Failing Step

Use `mcp__testmesh__run_step` to run a single action in isolation before debugging the whole flow. Useful for confirming a SQL query, checking a Redis key, or probing an HTTP response shape:

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

## 3. Run the Full Flow

Use `mcp__testmesh__run_flow` to execute and get per-step results:

```
✅ create_user (http_request) — 45ms
❌ verify_order (database_query) — 12ms
   assertion failed:
     - rows[0].status == "confirmed": rows[0].status = "pending"
```

The output shows the actual value — read it before guessing the fix.

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

Cross-step dot notation (no `output:` needed): `${create_user.body.id}`

Built-in variables: `{{RANDOM_ID}}`, `{{UUID}}`, `{{TIMESTAMP}}`, `{{ISO_TIMESTAMP}}`, `{{DATE}}`, `{{TIME}}`, `{{DATETIME}}`.

## 6. Action-Specific Gotchas

**http_request** — `method` is required; there is no default.

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

Define defaults in `flow.env:`, override via system env or `env_file:`:
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

`setup:` runs before steps; `teardown:` always runs (even on failure):
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

1. `validate_flow` first — fixes structural issues before running
2. Check infrastructure is up: `list_workspaces` returns healthy workspaces
3. Use `run_step` to probe a single action in isolation
4. Read the assertion error — it shows the actual value
5. No `{{}}` in `assert:` blocks — use bare variable names
6. Check `output:` JSONPath matches actual response shape
7. Async results: use `wait_for`/`db_poll`/`wait_until`, not `delay`
8. DB tables: always schema-qualified (`user_service.users`, not `users`)
9. Docker: service URLs use container names, not `localhost`
