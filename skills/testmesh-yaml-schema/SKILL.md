---
name: testmesh-yaml-schema
description: Use when writing or editing TestMesh YAML flow files, looking up action config fields, assert syntax, output expressions, or flow structure
---

# TestMesh YAML Schema Reference

Complete field-level reference for writing TestMesh flow YAML files.

---

## Top-Level Flow Structure

```yaml
flow:
  name: "Flow Name"              # required — 1-255 chars
  description: "optional"
  version: "1.0"
  suite: "suite-name"            # groups flows for suite runs
  tags:
    - smoke-test
  env_file: .env.test            # relative to flow file
  env:                           # inline env vars (override env_file)
    VAR_NAME: "value"
  config:
    timeout: "5m"
    fail_fast: true
    retry:
      enabled: true
      max_attempts: 3
      delay: "1s"
      backoff: "exponential"     # linear | exponential | constant
  setup:                         # run before steps
    - id: setup_step
      action: log
      config:
        message: "starting"
  steps:                         # required — at least 1
    - id: step_id                # required, unique [a-z0-9_-]+
      action: action_type        # required
      config: {}
      when: "some_var != nil"    # conditional execution (expr-lang)
      assert: []
      output: {}
      on_error: "fail"           # fail | continue
      retry:
        max_attempts: 3
        delay: "1s"
      timeout: "30s"
      disabled: false
  teardown:                      # always runs, even on failure
    - id: cleanup
      action: database_query
      config:
        connection: "postgres://..."
        query: "DELETE FROM ..."
```

---

## All Action Types

### http_request

**Required:** `method`, `url`
**Optional:** `headers` (map), `body` (any), `timeout` (default `30s`)
**Output:** `status` (int), `body` (map), `headers` (map), `duration_ms` (int), `content_type`

```yaml
- id: create_user
  action: http_request
  config:
    method: POST
    url: "${USER_SERVICE_URL}/api/v1/users"
    headers:
      Content-Type: "application/json"
      Authorization: "Bearer {{token}}"
    body:
      name: "Test User"
      email: "test@example.com"
    timeout: "30s"
  assert:
    - status == 201
    - body.id != nil
    - duration_ms < 500
  output:
    user_id: "$.body.id"
```

---

### database_query

**Required:** `connection` (DSN), `query`
**Optional:** `params` (array), `max_rows` (int)
**Output (SELECT):** `rows` (array), `row_count`, `first_row` (map), `columns`, `query_type`
**Output (modify):** `rows_affected`, `query_type`

```yaml
- id: verify_user
  action: database_query
  config:
    connection: "postgres://root:admin@localhost:5432/postgres?sslmode=disable"
    query: "SELECT id, status FROM user_service.users WHERE id = $1 LIMIT 1"
    params: ["{{user_id}}"]
  assert:
    - row_count == 1
    - first_row.status == "active"
```

**Critical:** Demo service tables are schema-qualified: `user_service.users`, `order_service.orders`, `product_service.products`, `notification_service.notifications`

---

### db_poll

Poll a SQL query until a condition is met. Use instead of `delay` + `database_query`.

**Required:** `connection`, `query`
**Optional:** `params`, `interval`, `timeout`, `condition` (map with `type`, `column`, `value`)

```yaml
- id: wait_for_order
  action: db_poll
  config:
    connection: "${DB_URL}"
    query: "SELECT status FROM order_service.orders WHERE id = '{{order_id}}' LIMIT 1"
    interval: "1s"
    timeout: "30s"
    condition:
      type: row_value
      column: status
      value: "confirmed"
```

---

### kafka_producer

**Required:** `brokers`, `topic`, `payload`
**Optional:** `key`, `headers` (map)
**Output:** `success`, `topic`, `partition`, `offset`, `key`, `duration_ms`

```yaml
- id: publish_event
  action: kafka_producer
  config:
    brokers: "${KAFKA_BROKERS}"
    topic: "user.created"
    key: "{{user_id}}"
    payload:
      user_id: "{{user_id}}"
      email: "{{email}}"
```

---

### kafka_consumer

**Required:** `brokers`, `topic`
**Optional:** `group_id`, `timeout` (default `30s`), `count` (default `1`), `from_beginning` (bool)
**Output:** `messages` (array of `{value, key, headers, offset}`), `count`, `success`, `duration_ms`

```yaml
- id: verify_event
  action: kafka_consumer
  config:
    brokers: ["${KAFKA_BROKERS}"]
    topic: "user.created"
    group_id: "testmesh-e2e-{{RANDOM_ID}}"
    from_beginning: true    # required for new group IDs
    timeout: "15s"
    count: 1
  assert:
    - len(messages) > 0
  output:
    event_user_id: "$.messages[0].value.user_id"
```

---

### redis.get / redis.set / redis.del / redis.exists

**Common config:** `host` (default `localhost`), `port` (default `6379`), `key`

```yaml
- id: cache_token
  action: redis.set
  config:
    key: "session:{{user_id}}"
    value: "{{auth_token}}"
    ttl: 1h

- id: read_cache
  action: redis.get
  config:
    key: "session:{{user_id}}"
  assert:
    - exists == true
  output:
    cached_token: $.value
```

---

### grpc

**Required:** `address` (host:port), `service`, `method`
**Optional:** `request`, `metadata`, `timeout`, `use_reflection` (bool)
**Output:** `status_code`, `body`, `latency_ms`

```yaml
- id: grpc_call
  action: grpc
  config:
    address: "localhost:50051"
    service: "product.ProductService"
    method: "GetProduct"
    use_reflection: true
    request:
      product_id: "{{product_id}}"
  assert:
    - status_code == "OK"
```

---

### websocket

Sub-actions: `connect`, `send`, `receive`, `close`

```yaml
- id: ws_connect
  action: websocket
  config:
    url: "ws://localhost:5001/ws"
    action: connect
    connection_id: my_conn
    timeout: 10s

- id: ws_receive
  action: websocket
  config:
    action: receive
    connection_id: my_conn
    timeout: 5s
  assert:
    - received_message.type == "subscribed"
```

---

### wait_for

Poll HTTP or TCP until ready.

```yaml
- id: wait_for_api
  action: wait_for
  config:
    type: http
    url: "${USER_SERVICE_URL}/health"
    status_code: 200
    timeout: 30s
    interval: 2s
```

---

### wait_until

Poll an expr-lang condition.

```yaml
- id: wait_until_ready
  action: wait_until
  config:
    condition: "some_var != nil"
    max_duration: "30s"
    interval: "1s"
    on_timeout: "fail"   # fail | continue
```

---

### delay

```yaml
- id: pause
  action: delay
  config:
    duration: 500ms
```

Prefer `wait_for`/`db_poll`/`wait_until` over `delay` in CI.

---

### transform

Reshape data with JSONPath.

```yaml
- id: reshape
  action: transform
  config:
    input: "{{create_user}}"
    transforms:
      full_name: "$.body.name"
      email: "$.body.email"
      source: "test-suite"   # static value
```

---

### condition / assert / log

```yaml
- id: check
  action: condition
  config:
    condition: "status_code == 200"

- id: verify
  action: assert
  config:
    data: "{{fetch_order.body}}"
    assertions:
      - status == "confirmed"

- id: debug
  action: log
  config:
    message: "Processing user {{user_id}}"
    level: info
```

---

### parallel / for_each

```yaml
- id: concurrent
  action: parallel
  config:
    max_concurrent: 2
    branches:
      - steps:
          - id: branch_a
            action: http_request
            config:
              method: GET
              url: "${USER_SERVICE_URL}/api/v1/users"
      - steps:
          - id: branch_b
            action: http_request
            config:
              method: GET
              url: "${PRODUCT_SERVICE_URL}/api/v1/products"

- id: loop
  action: for_each
  config:
    items: "{{product_list}}"
    item_name: product
    steps:
      - id: process
        action: http_request
        config:
          method: DELETE
          url: "${PRODUCT_SERVICE_URL}/api/v1/products/{{product.id}}"
```

---

### mock_server_start / mock_server_stop / mock_server_configure

```yaml
- id: start_mock
  action: mock_server_start
  config:
    name: payment-gateway
    endpoints:
      - path: /payments
        method: POST
        response:
          status_code: 200
          body_json:
            transaction_id: "txn_{{RANDOM_ID}}"
            status: approved
  output:
    mock_url: $.base_url

- id: stop_mock
  action: mock_server_stop
  config:
    server_id: "{{start_mock.server_id}}"
```

---

### mcp_call

```yaml
- id: call_mcp
  action: mcp_call
  config:
    server_url: "http://localhost:8090"
    tool: "analyze_sentiment"
    arguments:
      text: "{{user_message}}"
```

---

## Variable System

### Capture output

```yaml
output:
  user_id: "$.body.id"           # JSONPath from response body
  token: "$.body.token"
  first_item: "$.body.items[0].id"
```

### Use in config — both syntaxes equivalent

```yaml
url: "${ORDER_SERVICE_URL}/api/v1/orders/{{order_id}}"
body:
  user_id: "{{user_id}}"
```

Cross-step dot notation: `${create_user.body.id}`

### Built-in variables

| Variable | Value |
|---|---|
| `{{RANDOM_ID}}` / `{{UUID}}` | New UUID per step |
| `{{TIMESTAMP}}` | Unix timestamp (seconds) |
| `{{ISO_TIMESTAMP}}` | ISO 8601 datetime |
| `{{DATE}}` | YYYY-MM-DD |
| `{{TIME}}` | HH:MM:SS |
| `{{DATETIME}}` | YYYY-MM-DD HH:MM:SS |

---

## Assertion Expressions (expr-lang)

**Critical rule:** Never use `{{var}}` inside `assert:` blocks — use bare variable names.

```yaml
# WRONG
assert:
  - body.user_id == "{{user_id}}"

# CORRECT
assert:
  - body.user_id == user_id
  - status == 201
  - body.id != nil
  - len(body.items) == 3
  - row_count == 1
  - first_row.status == "active"
  - len(messages) > 0
  - duration_ms < 500
  - exists == true
```

Operators: `== != < > <= >= && || ! in contains startsWith endsWith matches`

---

## Validation Errors

Run `go run main.go validate path/to/flow.yaml` before executing.

| Error | Fix |
|---|---|
| `missing 'flow:' root key` | Wrap everything under `flow:` |
| `flow.name is required` | Add `name:` |
| `missing 'id' field` | Every step needs `id:` |
| `unknown action 'X'` | Check valid action list |
| `config.url is required` | Add missing required config key |
| `references '{{var}}' but not defined` | Variable used before `output:` defines it |

Valid actions: `http_request`, `database_query`, `kafka_producer`, `kafka_consumer`, `delay`, `log`, `assert`, `transform`, `condition`, `for_each`, `parallel`, `mock_server_start`, `mock_server_stop`, `mock_server_configure`, `contract_generate`, `contract_verify`, `websocket`, `grpc`, `wait_for`, `db_poll`, `redis.get`, `redis.set`, `redis.del`, `redis.exists`, `wait_until`, `run_flow`, `docker_run`, `docker_stop`, `mcp_call`
