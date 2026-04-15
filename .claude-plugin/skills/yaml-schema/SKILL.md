---
name: yaml-schema
description: Use when writing or editing TestMesh YAML flow files and you need the flow structure, step-level fields (when, retry, on_error, timeout), variable interpolation syntax, assertion expressions, or validation errors. For action-specific config and output fields, use the action-patterns skill instead.
---

# TestMesh YAML Schema Reference

Flow structure, step meta-fields, variable system, and assertion syntax. For action config and output fields, see the `action-patterns` skill.

---

## Top-Level Flow Structure

```yaml
flow:
  name: "Flow Name"              # required — 1-255 chars
  description: "optional"
  version: "1.0"
  suite: "suite-name"            # groups flows for run_suite
  tags:
    - smoke-test
    - e2e
  env_file: .env.test            # relative to flow file; loaded first
  env:                           # inline vars; override env_file values
    USER_SERVICE_URL: "http://localhost:5001"
    DB_URL: "postgres://root:admin@localhost:5432/postgres?sslmode=disable"
  config:
    timeout: "5m"                # global flow timeout
    fail_fast: true              # stop on first step failure (default true)
    retry:
      enabled: true
      max_attempts: 3
      delay: "1s"
      backoff: "exponential"     # linear | exponential | constant
  setup:                         # run before steps; failure aborts flow
    - id: setup_step
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM user_service.users WHERE email LIKE 'test-%'"
  steps:                         # required — at least 1 step
    - ...
  teardown:                      # always runs, even when steps fail
    - id: cleanup
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM order_service.orders WHERE id = '{{order_id}}'"
```

---

## Step Fields

Every step in `setup`, `steps`, and `teardown` supports:

```yaml
- id: unique_step_id             # required; [a-z0-9_-]+; unique within flow
  action: http_request           # required; see action list below
  config: {}                     # required; action-specific
  when: "user_id != nil"         # optional; expr-lang condition; skip if false
  assert:                        # optional; expr-lang strings; fail if any false
    - status == 201
    - body.id != nil
  output:                        # optional; capture values for later steps
    user_id: "$.body.id"
  on_error: "fail"               # fail (default) | continue
  retry:                         # step-level retry (overrides flow retry)
    max_attempts: 3
    delay: "2s"
    backoff: "exponential"
  timeout: "30s"                 # step-level timeout (overrides flow timeout)
  disabled: false                # set true to skip without removing
```

---

## All Action Types

For config fields and copy-paste examples, use the `action-patterns` skill. Quick reference:

| Action | Purpose |
|---|---|
| `http_request` | HTTP/HTTPS call |
| `database_query` | SQL query (PostgreSQL) |
| `db_poll` | Poll SQL until condition met |
| `kafka_producer` | Publish message to topic |
| `kafka_consumer` | Consume messages from topic |
| `grpc` | Call a gRPC method |
| `websocket` | Connect/send/receive over WebSocket |
| `redis.get` / `redis.set` / `redis.del` / `redis.exists` | Redis operations |
| `assert` | Standalone assertion block |
| `transform` | Reshape data with JSONPath |
| `condition` | Evaluate expr-lang condition |
| `for_each` | Iterate over an array |
| `parallel` | Run branches concurrently |
| `run_flow` | Execute a child flow |
| `wait_for` | Poll HTTP or TCP until ready |
| `wait_until` | Poll expr-lang condition |
| `delay` | Sleep (prefer polling actions in CI) |
| `log` | Emit a log message |
| `mock_server_start` / `mock_server_stop` / `mock_server_configure` | In-process HTTP mock |
| `contract_generate` / `contract_verify` | Pact 2.0 consumer-driven contracts |
| `docker_run` / `docker_stop` | Ephemeral Docker containers |
| `mcp_call` | Call an external MCP server tool |

---

## Variable System

### Capture output from a step

```yaml
output:
  user_id: "$.body.id"           # JSONPath into the step's output object
  token: "$.body.token"
  first_item: "$.body.items[0].id"
  order_status: "$.first_row.status"   # for database_query
  event: "$.messages[0].value"         # for kafka_consumer
```

### Reference in later steps

Both syntaxes are equivalent:

```yaml
config:
  url: "${ORDER_SERVICE_URL}/api/v1/orders/{{order_id}}"
  body:
    user_id: "{{user_id}}"
    token: "${token}"
```

### Cross-step dot notation (no prior output: needed)

```yaml
config:
  body:
    name: "${create_user.body.name}"    # step_id.field.path
```

### Built-in variables

| Variable | Value |
|---|---|
| `{{RANDOM_ID}}` / `{{UUID}}` | New UUID v4 per evaluation |
| `{{TIMESTAMP}}` | Unix timestamp (seconds) |
| `{{ISO_TIMESTAMP}}` | ISO 8601 datetime |
| `{{DATE}}` | YYYY-MM-DD |
| `{{TIME}}` | HH:MM:SS |
| `{{DATETIME}}` | YYYY-MM-DD HH:MM:SS |

---

## Assertion Expressions (expr-lang)

**Critical rule:** Never use `{{var}}` or `${var}` inside `assert:` blocks — use bare variable names.

```yaml
assert:
  # status codes
  - status == 201
  - status != 500

  # nil checks
  - body.id != nil
  - body.error == nil

  # numeric comparisons
  - row_count == 1
  - len(body.items) == 3
  - duration_ms < 500
  - first_row.inventory == 8

  # string comparisons
  - first_row.status == "active"
  - body.email == email          # bare variable name, not {{email}}

  # boolean
  - success == true
  - exists == true

  # array
  - len(messages) > 0
  - count >= 1
```

**Operators:** `== != < > <= >= && || ! in contains startsWith endsWith matches`

**Functions:** `len()`, `string()`, `int()`, `float()`, `keys()`, `values()`

---

## Environment Variables in Flows

Two sources, merged at runtime (`env:` overrides `env_file:`):

```yaml
flow:
  env_file: .env.test          # shared file for all flows in a suite
  env:
    USER_SERVICE_URL: "http://localhost:5001"   # inline override
```

Reference with `${VAR}` or `{{VAR}}` in config values. In Docker Compose, use container names instead of `localhost`:

| Local | Docker |
|---|---|
| `localhost:5432` | `postgres:5432` |
| `localhost:9092` | `kafka:9092` |
| `localhost:6379` | `redis:6379` |
| `localhost:5001` | `user-service:5001` |

---

## Validation Errors

Run `mcp__testmesh__validate_flow` or `go run main.go validate path/to/flow.yaml` before executing.

| Error | Fix |
|---|---|
| `missing 'flow:' root key` | Wrap everything under `flow:` |
| `flow.name is required` | Add `name:` under `flow:` |
| `missing 'id' field` | Every step needs a unique `id:` |
| `unknown action 'X'` | Check the action list above |
| `config.url is required` | Add the missing required config key |
| `references '{{var}}' but not defined` | Variable used before the `output:` that defines it |
| `duplicate step id 'X'` | Step IDs must be unique within the flow |
