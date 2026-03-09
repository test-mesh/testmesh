# Writing Your First Flow

A flow is a YAML file that defines a sequence of steps. Each step performs an action (HTTP request, database query, Kafka message, etc.) and optionally asserts the result and extracts output for use in later steps.

## Minimal Flow

```yaml
flow:
  name: "My First Test"
  steps:
    - id: check_health
      action: http_request
      config:
        method: GET
        url: "http://localhost:5001/health"
      assert:
        - status == 200
```

Every flow must have a `flow:` wrapper at the root. Each step needs a unique `id`, an `action` type, and a `config` block.

## Asserting Response Data

Use dot notation to access response fields:

```yaml
steps:
  - id: get_user
    action: http_request
    config:
      method: GET
      url: "http://localhost:5001/users/1"
    assert:
      - status == 200
      - body.name != ""
      - body.email contains "@"
```

Assertions use [expr-lang](https://github.com/expr-lang/expr) syntax. Common operators: `==`, `!=`, `>`, `<`, `contains`, `matches`.

## Passing Data Between Steps

Use `output` to extract values from a step, then reference them with `{{variable}}` in later steps:

```yaml
steps:
  - id: create_user
    action: http_request
    config:
      method: POST
      url: "http://localhost:5001/users"
      body:
        name: "Alice"
        email: "alice@example.com"
    assert:
      - status == 201
    output:
      user_id: $.body.id        # JSONPath from response body
      user_name: $.body.name

  - id: get_user
    action: http_request
    config:
      method: GET
      url: "http://localhost:5001/users/{{user_id}}"
    assert:
      - status == 200
      - body.name == "Alice"

  - id: delete_user
    action: http_request
    config:
      method: DELETE
      url: "http://localhost:5001/users/{{user_id}}"
    assert:
      - status == 204
```

## Using Request Headers and Bodies

```yaml
steps:
  - id: login
    action: http_request
    config:
      method: POST
      url: "http://localhost:5016/api/v1/auth/login"
      headers:
        Content-Type: application/json
      body:
        email: "admin@example.com"
        password: "password"
    assert:
      - status == 200
    output:
      token: $.body.token

  - id: list_flows
    action: http_request
    config:
      method: GET
      url: "http://localhost:5016/api/v1/workspaces/{{workspace_id}}/flows"
      headers:
        Authorization: "Bearer {{token}}"
    assert:
      - status == 200
```

## Database Query Step

```yaml
steps:
  - id: check_db
    action: database_query
    config:
      connection_string: "postgres://testmesh:testmesh@localhost:5432/testmesh?sslmode=disable"
      query: "SELECT id, name FROM flows WHERE id = $1"
      params:
        - "{{flow_id}}"
    assert:
      - rows[0].name == "Expected Flow Name"
```

## Kafka Steps

```yaml
steps:
  - id: publish_event
    action: kafka_producer
    config:
      brokers: ["localhost:9092"]
      topic: "orders"
      key: "order-{{order_id}}"
      value:
        order_id: "{{order_id}}"
        status: "placed"

  - id: consume_event
    action: kafka_consumer
    config:
      brokers: ["localhost:9092"]
      topic: "order-notifications"
      group_id: "test-group"
      timeout: 10s
    assert:
      - messages[0].value.status == "confirmed"
```

## Running Your Flow

```bash
# Via CLI
cd cli
go run main.go run path/to/my-flow.yaml

# Validate without running
go run main.go validate path/to/my-flow.yaml

# Debug mode (step-by-step)
go run main.go debug path/to/my-flow.yaml
```

## Complete Multi-Step Example

```yaml
flow:
  name: "Order Lifecycle"
  description: "Create user, place order, verify notification"
  steps:
    - id: create_user
      action: http_request
      config:
        method: POST
        url: "http://localhost:5001/users"
        body:
          name: "Test User"
          email: "test@example.com"
      assert:
        - status == 201
      output:
        user_id: $.body.id

    - id: create_product
      action: http_request
      config:
        method: POST
        url: "http://localhost:5002/products"
        body:
          name: "Widget"
          price: 9.99
          inventory: 100
      assert:
        - status == 201
      output:
        product_id: $.body.id

    - id: place_order
      action: http_request
      config:
        method: POST
        url: "http://localhost:5003/orders"
        body:
          user_id: "{{user_id}}"
          items:
            - product_id: "{{product_id}}"
              quantity: 2
      assert:
        - status == 201
        - body.total > 0
      output:
        order_id: $.body.id

    - id: verify_notification
      action: http_request
      config:
        method: GET
        url: "http://localhost:5004/notifications?user_id={{user_id}}"
      assert:
        - status == 200
        - body.notifications[0].type == "order_placed"
```

## Next Steps

- [Using the CLI](./USING_THE_CLI.md) — Run, debug, watch, and generate flows
- [YAML Schema Reference](../features/YAML_SCHEMA.md) — Full specification of all action types
- [Async Patterns](../features/ASYNC_PATTERNS.md) — Kafka and WebSocket testing patterns
