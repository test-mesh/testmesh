---
name: action-patterns
description: Use when you need the config fields, output variables, or a copy-paste example for a specific action type (http_request, database_query, kafka, grpc, websocket, redis, mock_server, etc.)
---

# TestMesh Action Patterns

Complete reference for every action type: required config, output variables, and working YAML examples.

---

## Action Reference Table

| Action | Purpose |
|---|---|
| `http_request` | Make HTTP/HTTPS calls |
| `database_query` | Run SQL against PostgreSQL |
| `kafka_producer` | Publish a message to a topic |
| `kafka_consumer` | Consume messages from a topic |
| `grpc` | Call a gRPC method |
| `websocket` | Connect/send/receive over WebSocket |
| `redis.get` | Read a Redis key |
| `redis.set` | Write a Redis key |
| `redis.del` | Delete a Redis key |
| `redis.exists` | Check if a key exists |
| `assert` | Standalone assertion block |
| `transform` | Reshape data with JSONPath |
| `condition` | Evaluate an expr-lang condition |
| `for_each` | Iterate over an array |
| `parallel` | Run branches concurrently |
| `run_flow` | Execute a child flow |
| `wait_for` | Poll HTTP or TCP until ready |
| `db_poll` | Poll a DB query until condition met |
| `wait_until` | Poll an expr-lang condition |
| `delay` | Sleep for a fixed duration |
| `log` | Emit a log message |
| `mock_server_start` | Start an in-process HTTP mock |
| `mock_server_stop` | Stop a running mock server |
| `mock_server_configure` | Add endpoints to a running mock |
| `contract_generate` | Write a Pact 2.0 contract file |
| `contract_verify` | Verify a contract against a live provider |
| `docker_run` | Start an ephemeral Docker container |
| `docker_stop` | Stop/remove a container |
| `mcp_call` | Call an external MCP server tool |

---

## http_request

**Required:** `method`, `url`
**Optional:** `headers` (map), `body` (any → marshalled as JSON), `timeout` (default `30s`)
**Output:** `status` (int), `body` (map or string), `headers` (map), `duration_ms` (int), `content_type`

- `Content-Type: application/json` set automatically when body is present
- OpenTelemetry `traceparent` header injected automatically
- `method` is required — there is no default

```yaml
- id: create_user
  action: http_request
  config:
    method: POST
    url: "${USER_SERVICE_URL}/api/v1/users"
    headers:
      Authorization: "Bearer {{token}}"
    body:
      name: "Alice"
      email: "alice@example.com"
  assert:
    - status == 201
    - body.id != nil
  output:
    user_id: $.body.id
```

---

## database_query

**Required:** `connection` (DSN string), `query`
**Optional:** `params` (array), `timeout`, `max_rows` (appends `LIMIT`)
**Output (SELECT):** `rows` (array of maps), `row_count`, `first_row` (map), `columns`, `query_type`
**Output (INSERT/UPDATE/DELETE):** `rows_affected`, `query_type`

- Uses `$1, $2, …` positional parameters (PostgreSQL)
- Demo service tables are schema-qualified: `user_service.users`, `order_service.orders`, etc.

```yaml
- id: fetch_order
  action: database_query
  config:
    connection: "${DB_URL}"
    query: "SELECT id, status FROM order_service.orders WHERE user_id = $1"
    params: ["{{user_id}}"]
  assert:
    - row_count == 1
    - rows[0].status == "confirmed"
  output:
    order_status: $.first_row.status

- id: cleanup
  action: database_query
  config:
    connection: "${DB_URL}"
    query: "DELETE FROM user_service.users WHERE email = $1"
    params: ["test@example.com"]
  assert:
    - rows_affected >= 0
```

---

## kafka_producer

**Required:** `brokers` (string, comma-separated, or array), `topic`, `payload` (any)
**Optional:** `key`, `headers` (map)
**Output:** `success` (bool), `topic`, `partition`, `offset`, `key`, `duration_ms`

- `traceparent` injected into Kafka message headers automatically

```yaml
- id: publish_order_created
  action: kafka_producer
  config:
    brokers: "${KAFKA_BROKERS}"
    topic: order.created
    key: "{{order_id}}"
    payload:
      order_id: "{{order_id}}"
      user_id: "{{user_id}}"
      amount: 99.99
  assert:
    - success == true
  output:
    kafka_offset: $.offset
```

---

## kafka_consumer

**Required:** `brokers`, `topic`
**Optional:** `group_id` (default `testmesh`), `timeout` (default `30s`), `count` (default `1`), `from_beginning` (bool)
**Output:** `messages` (array of `{value, key, headers, partition, offset, timestamp}`), `count`, `success`, `duration_ms`

- Set `from_beginning: true` when the consumer group has never seen the topic

```yaml
- id: consume_notification
  action: kafka_consumer
  config:
    brokers: "${KAFKA_BROKERS}"
    topic: notification.sent
    group_id: testmesh-e2e
    timeout: 15s
    count: 1
    from_beginning: true
  assert:
    - success == true
    - count >= 1
  output:
    notification_payload: $.messages[0].value
```

---

## grpc

**Required:** `address` (host:port), `service` (full name), `method`
**Optional:** `request` (map), `metadata` (map), `timeout` (default `30s`), `use_reflection` (bool), `streaming` (bool)
**Output:** `status_code` (string), `body` / `response` (map), `latency_ms`, `error_message`

- `use_reflection: true` requires server reflection service enabled
- `streaming: true` collects all messages into `response.messages`

```yaml
- id: get_product
  action: grpc
  config:
    address: "product-service:50051"
    service: "product.ProductService"
    method: "GetProduct"
    use_reflection: true
    request:
      product_id: "{{product_id}}"
  assert:
    - status_code == "OK"
    - body.name != nil
  output:
    product_name: $.body.name
```

---

## websocket

Sub-actions: `connect`, `send`, `receive`, `close`

**connect:** `url`, `headers` (map), `connection_id` (auto-generated if omitted), `timeout`
**connect output:** `connected` (bool), `metadata.connection_id`
**send:** `connection_id`, `message` (any), `message_type` (`text`/`binary`)
**receive:** `connection_id`, `timeout` → `received_message`, `message_type`
**close:** `connection_id`

```yaml
- id: ws_connect
  action: websocket
  config:
    url: "ws://localhost:5001/ws"
    action: connect
    connection_id: my_conn
    timeout: 10s
  assert:
    - connected == true

- id: ws_send
  action: websocket
  config:
    action: send
    connection_id: my_conn
    message:
      type: subscribe
      channel: orders

- id: ws_receive
  action: websocket
  config:
    action: receive
    connection_id: my_conn
    timeout: 5s
  assert:
    - received_message.type == "subscribed"

- id: ws_close
  action: websocket
  config:
    action: close
    connection_id: my_conn
```

---

## redis.get / redis.set / redis.del / redis.exists

**Common config:** `host` (default `localhost`), `port` (default `6379`), `key`
**redis.get output:** `value` (string or nil), `exists` (bool)
**redis.set output:** `ok` (bool) — optional `ttl` (duration)
**redis.del output:** `deleted` (int)
**redis.exists output:** `exists` (bool), `count` (int)

```yaml
- id: cache_token
  action: redis.set
  config:
    host: "${REDIS_HOST}"
    key: "session:{{user_id}}"
    value: "{{auth_token}}"
    ttl: 1h

- id: read_cache
  action: redis.get
  config:
    host: "${REDIS_HOST}"
    key: "session:{{user_id}}"
  assert:
    - exists == true
  output:
    cached_token: $.value
```

---

## assert (standalone)

**Required:** `data` (map), `assertions` (array of expr-lang strings)
**Output:** `passed` (bool), `assertions_count`, `data`

Never use `{{var}}` in assertion expressions — use bare variable names.

```yaml
- id: verify_state
  action: assert
  config:
    data: "{{fetch_order.body}}"
    assertions:
      - status == "confirmed"
      - total > 0
```

---

## transform

**Required:** `input` (map), `transforms` (map of `outputKey: "$.jsonpath"`)
**Output:** the keys you define in `transforms`

Paths starting with `$.` are JSONPath; all other values are static strings.

```yaml
- id: reshape_user
  action: transform
  config:
    input: "{{create_user.body}}"
    transforms:
      full_name: "$.name"
      email_address: "$.email"
      source: "test-suite"   # static
  output:
    shaped_name: $.full_name
```

---

## condition

**Required:** `condition` (expr-lang expression)
**Output:** `result` (bool), `condition`, `evaluated`

```yaml
- id: check_premium
  action: condition
  config:
    condition: "user_tier == \"premium\""
```

---

## for_each

**Required:** `items` (array)
**Optional:** `item_name` (default `item`), `steps` (array)

```yaml
- id: process_products
  action: for_each
  config:
    items: "{{product_list}}"
    item_name: product
    steps:
      - id: delete_product
        action: http_request
        config:
          method: DELETE
          url: "${PRODUCT_SERVICE_URL}/api/v1/products/{{product.id}}"
```

---

## parallel

**Required:** `branches` (array of `{steps: [...]}`)
**Optional:** `max_concurrent` (int, 0 = unlimited), `fail_fast` (bool, default `true`)
**Output:** `branch_0`, `branch_1`, … (each `{output, status}`), `branches_total`, `branches_failed`

```yaml
- id: parallel_checks
  action: parallel
  config:
    max_concurrent: 2
    fail_fast: false
    branches:
      - steps:
          - id: check_user
            action: http_request
            config:
              method: GET
              url: "${USER_SERVICE_URL}/api/v1/users/{{user_id}}"
      - steps:
          - id: check_order
            action: http_request
            config:
              method: GET
              url: "${ORDER_SERVICE_URL}/api/v1/orders/{{order_id}}"
```

---

## run_flow

**Required:** `flow` (name or UUID)
**Optional:** `input` (map), `inherit_env` (bool, default `true`)
**Output:** `flow`, `status`, plus all output vars from child flow

```yaml
- id: run_auth_setup
  action: run_flow
  config:
    flow: "auth-setup"
    input:
      test_email: "alice@example.com"
  output:
    auth_token: $.auth_token
```

---

## wait_for

**Required:** `type` (`http` or `tcp`)
**HTTP optional:** `url`, `status_code` (default 200), `body_contains`
**Common optional:** `timeout`, `interval`, `max_attempts`
**Output:** `success`, `attempts`, `duration_ms`

```yaml
- id: wait_user_service
  action: wait_for
  config:
    type: http
    url: "${USER_SERVICE_URL}/health"
    status_code: 200
    timeout: 30s
    interval: 2s
```

---

## db_poll

**Required:** `connection`, `query`
**Optional:** `params`, `timeout`, `interval`, `condition` (map: `type`, `column`, `value`)
**Output:** `success`, `row_count`, `rows`, `first_row`, `attempts`, `duration_ms`

```yaml
- id: wait_order_confirmed
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
  assert:
    - success == true
  output:
    final_status: $.first_row.status
```

---

## wait_until

**Required:** `condition` (expr-lang string)
**Optional:** `max_duration` (default `30s`), `interval` (default `1s`), `on_timeout` (`fail`/`continue`)
**Output:** `met` (bool), `attempts`, `timed_out`

```yaml
- id: wait_until_processed
  action: wait_until
  config:
    condition: "processed_count >= 3"
    max_duration: 60s
    interval: 2s
    on_timeout: fail
```

---

## delay

**Required:** `duration`

Prefer `wait_for`/`db_poll`/`wait_until` in CI.

```yaml
- id: brief_pause
  action: delay
  config:
    duration: 500ms
```

---

## log

**Required:** `message`
**Optional:** `level` (`info`/`warn`/`error`/`debug`)

```yaml
- id: debug_print
  action: log
  config:
    message: "user_id={{user_id}}, order_id={{order_id}}"
```

---

## mock_server_start / stop / configure

```yaml
- id: start_payment_mock
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
    mock_id: $.server_id

- id: reconfigure_mock
  action: mock_server_configure
  config:
    server_id: "{{start_payment_mock.server_id}}"
    endpoints:
      - path: /payments
        method: POST
        priority: 10
        response:
          status_code: 402
          body_json:
            error: insufficient_funds

- id: stop_mock
  action: mock_server_stop
  config:
    server_id: "{{mock_id}}"
```

---

## contract_generate / contract_verify

```yaml
- id: gen_contract
  action: contract_generate
  config:
    consumer: order-service
    provider: user-service
    output_path: pacts/
    interactions:
      - description: get user by id
        request:
          method: GET
          path: /api/v1/users/123
        response:
          status: 200
          body:
            id: "123"
            name: Alice
  output:
    contract_file: $.contract_path

- id: verify_contract
  action: contract_verify
  config:
    contract_id: "{{gen_contract.contract_path}}"
    provider_base_url: "${USER_SERVICE_URL}"
  assert:
    - verified == true
    - failed == 0
```

---

## docker_run / docker_stop

Requires Docker CLI on the host running the TestMesh API.

```yaml
- id: start_db
  action: docker_run
  config:
    image: postgres:16-alpine
    env:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: testdb
    ports:
      "5432": "0"       # "0" = random host port
    wait_for_port: "5432"
    timeout: 30s
  output:
    test_db_dsn: $.dsn

- id: stop_db
  action: docker_stop
  config:
    container_id: "{{start_db.container_id}}"
    remove: true
```

---

## mcp_call

```yaml
- id: analyze
  action: mcp_call
  config:
    server_url: "http://localhost:8090"
    tool: "analyze_sentiment"
    arguments:
      text: "{{user_message}}"
```

---

## Output Variable Quick Reference

| Action | Key outputs |
|---|---|
| `http_request` | `status`, `body`, `headers`, `duration_ms` |
| `database_query` SELECT | `rows`, `row_count`, `first_row`, `columns` |
| `database_query` modify | `rows_affected` |
| `kafka_producer` | `success`, `offset`, `partition` |
| `kafka_consumer` | `messages`, `count`, `success` |
| `grpc` | `status_code`, `body`, `latency_ms` |
| `websocket connect` | `connected`, `metadata.connection_id` |
| `websocket receive` | `received_message` |
| `redis.get` | `value`, `exists` |
| `redis.set` | `ok` |
| `wait_for` | `success`, `attempts` |
| `db_poll` | `success`, `rows`, `first_row`, `attempts` |
| `mock_server_start` | `server_id`, `base_url` |
| `contract_generate` | `contract_path` |
| `contract_verify` | `verified`, `passed`, `failed` |
| `docker_run` | `container_id`, `dsn`, `ports` |

---

## Common Gotchas

1. **`{{var}}` in `assert:` fails** — use bare names: `status == 201` not `status == "{{expected}}"`
2. **`http_request` method is required** — no default; omitting causes runtime error
3. **DB tables are schema-qualified** — `user_service.users`, not `users`
4. **Kafka `from_beginning: true`** — required when group has no committed offsets
5. **`grpc` reflection** — needs server reflection service enabled to use `use_reflection: true`
6. **WebSocket `connection_id`** — connections are global; use unique IDs to avoid collisions
7. **`docker_run`** — only works when TestMesh API can invoke Docker CLI
8. **`parallel fail_fast`** — default `true` cancels remaining branches; set `false` to collect all results
