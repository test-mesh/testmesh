package mcpserver

// TestingGuideContent returns a comprehensive best-practices guide for writing
// TestMesh E2E flows. This content is served by the get_testing_guide MCP tool
// to teach AI assistants how to think like a test engineer when using TestMesh.
func TestingGuideContent() string {
	return `# TestMesh Testing Guide

## 1. Flow Organization

Organize flows by service and category under a ` + "`flows/`" + ` directory:

` + "```" + `
flows/
├── user-service/
│   ├── happy-path/
│   │   ├── user-service-create-user-happy.yaml
│   │   └── user-service-list-users-happy.yaml
│   ├── error-handling/
│   │   ├── user-service-create-user-missing-email.yaml
│   │   └── user-service-get-user-not-found.yaml
│   └── edge-case/
│       └── user-service-create-user-duplicate.yaml
├── order-service/
│   ├── happy-path/
│   │   └── order-service-create-order-happy.yaml
│   └── cross-service/
│       └── order-service-full-order-journey.yaml
└── e2e/
    └── cross-service/
        └── e2e-full-purchase-flow.yaml
` + "```" + `

**Naming convention:** ` + "`{service}-{operation}-{variant}.yaml`" + `

**One scenario per flow.** Each flow should test one specific scenario. This makes failures easy
to diagnose, allows parallel execution, and keeps setup/teardown focused.

## 2. Assertion Patterns Per Layer

### HTTP Assertions
` + "```yaml" + `
assert:
  - "status == 201"           # Status code (int)
  - "body.id != nil"          # Field exists
  - "body.email == 'test@example.com'"  # Exact match
  - "len(body.items) == 1"    # Array length
  - "body.total > 0"          # Numeric comparison
  - "body.status == \"pending\""  # String with quotes
` + "```" + `

### Kafka Assertions
` + "```yaml" + `
assert:
  - "len(messages) > 0"       # At least one message received
  - "len(messages) == 1"      # Exactly one message
` + "```" + `
Always use a unique ` + "`group_id`" + ` per test run (e.g., ` + "`testmesh-e2e-{{RANDOM_ID}}`" + `) to prevent
reading stale messages from prior executions.

### Database Assertions
` + "```yaml" + `
assert:
  - "row_count == 1"          # Exactly one row returned
  - "row_count >= 2"          # At least two rows
  - "rows[0].email == 'test@example.com'"  # First row field value
  - "first_row.name != nil"   # Shorthand for rows[0]
` + "```" + `
Use ` + "`SELECT *`" + ` or ` + "`SELECT field1, field2`" + ` (not ` + "`COUNT(*)`" + `) so ` + "`row_count`" + ` reflects actual rows.

### Redis Assertions
` + "```yaml" + `
assert:
  - "value != nil"            # Key exists and has a value
  - "value == 'expected'"     # Exact value match
` + "```" + `

## 3. Setup/Teardown for Idempotency

Every flow should be **idempotent** — safe to run repeatedly without prior cleanup.

### Cleanup Order
Delete in **reverse dependency order** to avoid foreign key violations:
1. Dependent/child tables first (notifications, order_items)
2. Parent tables next (orders, products)
3. Root entities last (users)

### Example Setup Block
` + "```yaml" + `
setup:
  - id: cleanup_notifications
    action: database_query
    config:
      connection: "postgres://root:admin@localhost:5432/postgres?sslmode=disable"
      query: >
        DELETE FROM notification_service.notifications
        WHERE user_id IN (
          SELECT id::text FROM user_service.users WHERE email = 'test-{{RANDOM_ID}}@example.com'
        )

  - id: cleanup_orders
    action: database_query
    config:
      connection: "postgres://root:admin@localhost:5432/postgres?sslmode=disable"
      query: >
        DELETE FROM order_service.order_items
        WHERE order_id IN (
          SELECT id FROM order_service.orders WHERE user_id IN (
            SELECT id::text FROM user_service.users WHERE email = 'test-{{RANDOM_ID}}@example.com'
          )
        )

  - id: cleanup_order_records
    action: database_query
    config:
      connection: "postgres://root:admin@localhost:5432/postgres?sslmode=disable"
      query: >
        DELETE FROM order_service.orders
        WHERE user_id IN (
          SELECT id::text FROM user_service.users WHERE email = 'test-{{RANDOM_ID}}@example.com'
        )

  - id: cleanup_user
    action: database_query
    config:
      connection: "postgres://root:admin@localhost:5432/postgres?sslmode=disable"
      query: "DELETE FROM user_service.users WHERE email = 'test-{{RANDOM_ID}}@example.com'"
` + "```" + `

Use ` + "`{{RANDOM_ID}}`" + ` in test data (emails, names) so each run is isolated.

### Teardown
If setup handles cleanup (deleting before creating), teardown is optional. Use teardown when
you need to restore shared state after the test:
` + "```yaml" + `
teardown:
  - id: restore_inventory
    action: database_query
    config:
      connection: "postgres://root:admin@localhost:5432/postgres?sslmode=disable"
      query: "UPDATE product_service.products SET inventory = 100 WHERE id = '{{product_id}}'"
` + "```" + `

## 4. Async Verification

When a step triggers an asynchronous process (e.g., order placement triggers a Kafka event
that updates inventory), you need to wait before verifying the result.

### Option A: delay (Simple)
Use for simple cases where timing is predictable (2-5 seconds):
` + "```yaml" + `
- id: wait_for_processing
  action: delay
  config:
    duration: "3s"
` + "```" + `
**Pros:** Simple, no dependencies. **Cons:** May be flaky if processing takes longer.

### Option B: db_poll (Preferred for Consistency)
Polls a database query until a condition is met. Much more reliable than fixed delays:
` + "```yaml" + `
- id: wait_for_notification
  action: db_poll
  config:
    connection: "postgres://root:admin@localhost:5432/postgres?sslmode=disable"
    query: "SELECT id FROM notification_service.notifications WHERE user_id = '{{user_id}}' LIMIT 1"
    interval: "1s"
    timeout: "15s"
` + "```" + `
Polling stops when the query returns at least one row. No ` + "`condition`" + ` field needed.

### Option C: kafka_consumer (Event Verification)
When you need to verify that a specific event was published:
` + "```yaml" + `
- id: verify_order_event
  action: kafka_consumer
  config:
    brokers:
      - "localhost:9092"
    topic: "order.placed"
    group_id: "testmesh-verify-{{RANDOM_ID}}"
    auto_offset_reset: "earliest"
    from_beginning: true
    timeout: "10s"
    count: 1
  assert:
    - "len(messages) > 0"
` + "```" + `
**Important:** Always use a unique ` + "`group_id`" + ` with ` + "`{{RANDOM_ID}}`" + ` to prevent reading
messages from prior test runs.

## 5. Variable Chaining

Capture IDs and values from one step and use them in subsequent steps.

### Capture via output blocks
` + "```yaml" + `
- id: create_user
  action: http_request
  config:
    method: POST
    url: "http://localhost:5001/api/v1/users"
    body:
      name: "Test User"
      email: "test@example.com"
  assert:
    - "status == 201"
  output:
    user_id: "$.body.id"       # Captures response body's id field
    user_name: "$.body.name"   # Captures response body's name field
` + "```" + `

### Use captured variables with {{variable}}
` + "```yaml" + `
- id: create_order
  action: http_request
  config:
    method: POST
    url: "http://localhost:5003/api/v1/orders"
    body:
      user_id: "{{user_id}}"   # Uses captured value from create_user step
      items:
        - product_id: "{{product_id}}"
          quantity: 2
` + "```" + `

### Full Chaining Example
1. Create user → capture ` + "`user_id`" + `
2. Create product → capture ` + "`product_id`" + `
3. Create order with ` + "`{{user_id}}`" + ` and ` + "`{{product_id}}`" + ` → capture ` + "`order_id`" + `
4. Verify order in DB using ` + "`{{order_id}}`" + `
5. Verify notification for ` + "`{{user_id}}`" + `

### Built-in Variables
- ` + "`{{RANDOM_ID}}`" + ` — generates a unique UUID at runtime (different per step evaluation)

## 6. Edge Case Patterns

### Idempotency (Duplicate Request)
Verify that sending the same POST twice doesn't create duplicate resources:
` + "```yaml" + `
- id: create_user_first
  action: http_request
  config:
    method: POST
    url: "http://localhost:5001/api/v1/users"
    body:
      name: "Idempotent User"
      email: "idem@example.com"
  assert:
    - "status == 201"

- id: create_user_duplicate
  action: http_request
  config:
    method: POST
    url: "http://localhost:5001/api/v1/users"
    body:
      name: "Idempotent User"
      email: "idem@example.com"
  assert:
    - "status == 409"  # or 400 depending on service behavior
` + "```" + `

### Not-Found (Zero UUID)
Use the zero UUID to test 404 responses:
` + "```yaml" + `
- id: get_nonexistent_user
  action: http_request
  config:
    method: GET
    url: "http://localhost:5001/api/v1/users/00000000-0000-0000-0000-000000000000"
  assert:
    - "status == 404"
` + "```" + `

### Validation (Missing Required Fields)
Test that the service rejects requests missing required fields with 400:
` + "```yaml" + `
- id: create_user_missing_email
  action: http_request
  config:
    method: POST
    url: "http://localhost:5001/api/v1/users"
    headers:
      Content-Type: application/json
    body:
      name: "No Email User"
  assert:
    - "status == 400"
` + "```" + `

### Concurrency
Verify that concurrent updates to the same resource behave correctly (e.g., inventory
doesn't go negative under concurrent orders):
` + "```yaml" + `
- id: concurrent_order_1
  action: http_request
  config:
    method: POST
    url: "http://localhost:5003/api/v1/orders"
    body:
      user_id: "{{user_id}}"
      items:
        - product_id: "{{product_id}}"
          quantity: 50

- id: concurrent_order_2
  action: http_request
  config:
    method: POST
    url: "http://localhost:5003/api/v1/orders"
    body:
      user_id: "{{user_id}}"
      items:
        - product_id: "{{product_id}}"
          quantity: 60

# At least one should fail if inventory is 100
- id: verify_no_oversell
  action: database_query
  config:
    connection: "postgres://root:admin@localhost:5432/postgres?sslmode=disable"
    query: "SELECT inventory FROM product_service.products WHERE id = '{{product_id}}'"
  assert:
    - "rows[0].inventory >= 0"
` + "```" + `

## 7. Test Plan YAML Schema

When generating a comprehensive test suite, organize it with a test plan manifest:

` + "```yaml" + `
version: "1"
name: "my-project-test-suite"
generated: "2026-04-02T10:00:00Z"
workspace_analysis: ".testmesh/workspace-analysis.json"

services:
  - name: "user-service"
    endpoints_discovered: 4
    flows:
      - id: "user-create-happy"
        category: happy-path      # happy-path | error-handling | cross-service | edge-case
        priority: critical         # critical | high | medium
        action: "Create a user with valid data and verify 201 + DB persistence"
        status: pending            # pending | generated | validated | invalid | passed | failed | repaired | needs-review | existing | removed
        file: "flows/user-service/happy-path/user-service-create-user-happy.yaml"

      - id: "user-create-missing-email"
        category: error-handling
        priority: high
        action: "Send POST without email, verify 400 response"
        status: pending
        file: "flows/user-service/error-handling/user-service-create-user-missing-email.yaml"

  - name: "e2e"
    endpoints_discovered: 0
    flows:
      - id: "e2e-full-order-journey"
        category: cross-service
        priority: critical
        action: "Create user + product + order, verify Kafka events + DB state + notifications"
        status: pending
        file: "flows/e2e/cross-service/e2e-full-order-journey.yaml"
        depends_on: ["user-create-happy", "product-create-happy"]

summary:
  total_flows: 3
  by_category:
    happy-path: 1
    error-handling: 1
    cross-service: 1
  by_priority:
    critical: 2
    high: 1
  by_status:
    pending: 3
` + "```" + `

### Status Transitions
` + "```" + `
pending → generated → validated → passed
                                → failed → repaired → passed
                                         → needs-review
                   → invalid → (regenerated) → generated
existing (discovered from disk, not generated by this plan)
removed (endpoint deleted, flow orphaned)
` + "```" + `

### Category Definitions
- **happy-path**: Standard success scenario — create, read, update, delete with valid data
- **error-handling**: Invalid input, missing fields, not-found, unauthorized — verify proper error responses
- **cross-service**: End-to-end journeys spanning multiple services (order flow, notification chain)
- **edge-case**: Idempotency, concurrency, boundary values, timeouts, duplicate detection
`
}
