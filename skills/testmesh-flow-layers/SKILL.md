---
name: testmesh-flow-layers
description: Use when designing or writing TestMesh flows from scratch, choosing which layer (L1–L4) a test belongs to, or building a full test suite for a service or system.
---

# TestMesh Flow Layers

Four layers of test coverage, each with a distinct purpose. Every service needs all four.

## Layer Overview

| Layer | Scope | Steps | Asserts |
|---|---|---|---|
| L1 | Single endpoint contract | 1–3 | status, schema, types |
| L2 | Within-service chain | 3–8 | state after each step, side-effects |
| L3 | Cross-service E2E | 8–20+ | full journey, async effects |
| L4 | Edge cases | 1–5 | error codes, boundary values |

---

## L1 — Endpoint Contracts

One call. Verify the contract: status code, required fields present, types correct.

**When to use:** First test you write for any endpoint. Runs in CI on every push. Catches regressions in the API contract.

```yaml
flow:
  name: "L1 — POST /users contract"
  steps:
    - id: create_user
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/users"
        headers:
          Content-Type: application/json
        body:
          name: "Test User {{RANDOM_ID}}"
          email: "test-{{RANDOM_ID}}@example.com"
      assert:
        - "status == 201"
        - "body.id != nil"
        - "body.name != nil"
        - "body.email != nil"
        - "duration_ms < 500"
      output:
        user_id: "$.body.id"
```

**L1 checklist:**
- Assert exact status code (201 not just `< 300`)
- Assert every required response field is non-nil
- One flow per endpoint — keep them independent
- No setup/teardown needed unless endpoint requires existing state

---

## L2 — Within-Service Chains

Multi-step flow scoped to one service. Verify that each action persists correctly: HTTP → DB → cache → event.

**When to use:** After L1 passes. Tests the full internal lifecycle of a resource within one service.

```yaml
flow:
  name: "L2 — Product lifecycle (create → verify DB, Redis, Kafka)"
  env:
    DB_URL: "postgres://root:admin@localhost:5432/postgres?sslmode=disable"
    KAFKA_BROKERS: "localhost:9092"
    PRODUCT_SERVICE_URL: "http://localhost:5002"

  steps:
    - id: create_product
      action: http_request
      config:
        method: POST
        url: "${PRODUCT_SERVICE_URL}/api/v1/products"
        headers:
          Content-Type: application/json
        body:
          name: "Widget {{RANDOM_ID}}"
          price: 49.99
          inventory: 20
      assert:
        - "status == 201"
        - "body.id != nil"
      output:
        product_id: "$.body.id"

    - id: verify_db
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "SELECT id, inventory FROM product_service.products WHERE id = '{{product_id}}' LIMIT 1"
      assert:
        - "row_count == 1"
        - "first_row.inventory == 20"

    - id: verify_redis
      action: redis.get
      config:
        host: localhost
        port: "6379"
        key: "product:{{product_id}}"
      assert:
        - "value != nil"

    - id: verify_kafka_event
      action: kafka_consumer
      config:
        brokers: ["${KAFKA_BROKERS}"]
        topic: product.created
        group_id: "testmesh-l2-{{RANDOM_ID}}"
        from_beginning: true
        timeout: "10s"
        count: 1
      assert:
        - "len(messages) > 0"
```

**L2 checklist:**
- One service only — no calls to other services
- DB tables must be schema-qualified: `product_service.products`, not `products`
- Verify HTTP → DB → cache → event when all are used
- Use `from_beginning: true` on Kafka consumer

---

## L3 — Cross-Service E2E

Full user journey across multiple services. Use `db_poll` for async side-effects triggered via Kafka.

**When to use:** Smoke test for an entire business transaction. Catches integration failures and contract mismatches between services.

```yaml
flow:
  name: "L3 — Full order journey (user → product → order → notification)"
  env:
    DB_URL: "postgres://root:admin@localhost:5432/postgres?sslmode=disable"
    KAFKA_BROKERS: "localhost:9092"
    USER_SERVICE_URL: "http://localhost:5001"
    PRODUCT_SERVICE_URL: "http://localhost:5002"
    ORDER_SERVICE_URL: "http://localhost:5003"

  setup:
    - id: cleanup_test_users
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM user_service.users WHERE email LIKE 'e2e-%@example.com'"

  steps:
    - id: create_product
      action: http_request
      config:
        method: POST
        url: "${PRODUCT_SERVICE_URL}/api/v1/products"
        headers:
          Content-Type: application/json
        body:
          name: "E2E Product {{RANDOM_ID}}"
          price: 19.99
          inventory: 10
      assert:
        - "status == 201"
      output:
        product_id: "$.body.id"
        initial_inventory: "$.body.inventory"

    - id: create_user
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/users"
        headers:
          Content-Type: application/json
        body:
          name: "E2E User {{RANDOM_ID}}"
          email: "e2e-{{RANDOM_ID}}@example.com"
      assert:
        - "status == 201"
      output:
        user_id: "$.body.id"

    - id: create_order
      action: http_request
      config:
        method: POST
        url: "${ORDER_SERVICE_URL}/api/v1/orders"
        headers:
          Content-Type: application/json
        body:
          user_id: "{{user_id}}"
          items:
            - product_id: "{{product_id}}"
              quantity: 2
      assert:
        - "status == 201"
        - "body.id != nil"
      output:
        order_id: "$.body.id"

    - id: verify_order_db
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "SELECT status FROM order_service.orders WHERE id = '{{order_id}}' LIMIT 1"
      assert:
        - "row_count == 1"

    # Async effect: notification-service reacts to order via Kafka
    - id: poll_notification
      action: db_poll
      config:
        connection: "${DB_URL}"
        query: "SELECT id FROM notification_service.notifications WHERE user_id = '{{user_id}}'"
        interval: "1s"
        timeout: "15s"

    # Async effect: product inventory decreased by quantity
    - id: verify_final_inventory
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "SELECT inventory FROM product_service.products WHERE id = '{{product_id}}' LIMIT 1"
      assert:
        - "row_count == 1"
        - "first_row.inventory == 8"

  teardown:
    - id: cleanup
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM order_service.orders WHERE id = '{{order_id}}'"
```

**L3 checklist:**
- Create dependencies in order: product → user → order
- Capture IDs with `output:` and thread through later steps
- Use `db_poll` for Kafka-driven async effects — never `delay`
- `teardown:` runs even on failure — always clean up test data

---

## L4 — Edge Cases

Error paths, boundary values, duplicates. One scenario per flow.

**When to use:** After L1–L3 pass. Covers the cases that break in production.

### L4a — Validation errors (400/404)

```yaml
flow:
  name: "L4 — User validation errors"
  steps:
    - id: missing_email
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/users"
        headers:
          Content-Type: application/json
        body:
          name: "No Email"
      assert:
        - "status == 400"

    - id: not_found
      action: http_request
      config:
        method: GET
        url: "${USER_SERVICE_URL}/api/v1/users/00000000-0000-0000-0000-000000000000"
      assert:
        - "status == 404"
```

### L4b — Duplicate / conflict (409)

```yaml
flow:
  name: "L4 — Duplicate email returns 409"
  steps:
    - id: create_first
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/users"
        headers:
          Content-Type: application/json
        body:
          name: "First"
          email: "dup-{{RANDOM_ID}}@example.com"
      assert:
        - "status == 201"
      output:
        test_email: "$.body.email"

    - id: create_duplicate
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/users"
        headers:
          Content-Type: application/json
        body:
          name: "Second"
          email: "{{test_email}}"
      assert:
        - "status == 409"
        - "body.error != nil"
```

### L4c — Boundary (insufficient resources)

```yaml
flow:
  name: "L4 — Order exceeds inventory"
  steps:
    - id: order_too_many
      action: http_request
      config:
        method: POST
        url: "${ORDER_SERVICE_URL}/api/v1/orders"
        headers:
          Content-Type: application/json
        body:
          user_id: "{{user_id}}"
          items:
            - product_id: "{{product_id}}"
              quantity: 999
      assert:
        - "status == 400"
        - "body.error != nil"
```

**L4 checklist:**
- One scenario per flow
- Use `setup:` + `teardown:` when state must exist before the bad request
- Assert `body.error != nil` alongside the status code
- Use nil UUID `00000000-0000-0000-0000-000000000000` for non-existent ID tests

---

## Critical Rules (all layers)

**Never use `{{var}}` inside `assert:` blocks:**
```yaml
# WRONG
assert:
  - body.id == "{{user_id}}"

# CORRECT
assert:
  - body.id == user_id
```

**Always schema-qualify DB tables:**
```yaml
query: "SELECT * FROM user_service.users WHERE id = $1"
#                     ^^^^^^^^^^^^^ required
```

**Use polling, not delay, for async:**
```yaml
# CORRECT
- id: poll_result
  action: db_poll
  config:
    connection: "${DB_URL}"
    query: "SELECT id FROM notification_service.notifications WHERE user_id = '{{user_id}}'"
    interval: "1s"
    timeout: "15s"
```

---

## Layer Decision Guide

```
New endpoint?          → Write L1 first (1 flow, ~5 assertions)
L1 passes?             → Write L2 (HTTP + DB + Redis + Kafka chain)
All services running?  → Write L3 (full user journey, poll async effects)
L3 passes?             → Write L4 (validation errors, duplicates, boundary values)
```

**Recommended file layout:**
```
flows/
├── user-service/
│   ├── l1-create-user.yaml
│   ├── l1-get-user.yaml
│   ├── l2-user-lifecycle.yaml
│   ├── l4-duplicate-email.yaml
│   └── l4-missing-fields.yaml
├── order-service/
│   ├── l1-create-order.yaml
│   ├── l2-order-chain.yaml
│   └── l4-insufficient-inventory.yaml
└── e2e/
    └── l3-full-order-journey.yaml
```
