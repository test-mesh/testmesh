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
├── .env.test                         ← shared infra config for all flows
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

Every flow references ` + "`.env.test`" + ` via ` + "`env_file: ../.env.test`" + ` (path relative to the flow file).
Never hardcode hostnames, ports, credentials, or DSNs directly in flow YAML.

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
- id: order_placed
  action: kafka_consumer
  config:
    topic: "order.placed"
    match:                                # wait for THIS test's event
      order_id: "{{order_id}}"
    timeout: "10s"
  assert:
    - "event.user_id == user_id"          # event = parsed JSON payload of the matched message
    - "event.total > 0"
    - "message.key == order_id"           # message = key, headers, partition, offset, timestamp
` + "```" + `
Always use ` + "`match`" + ` with an ID from an earlier step: the consumer reads events published since the
flow started (so it never misses an event emitted before the step began) and ` + "`match`" + ` picks out the
one your test caused. When nothing matches before the timeout, the step fails and shows the events it
did see. Do not set ` + "`group_id`" + ` or ` + "`from_beginning`" + ` — they disable this behaviour.
` + "`len(messages) > 0`" + ` only proves delivery — always verify payload fields match what triggered the event.

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

### Assertion Quality Rules

Write assertions that catch real bugs — shallow assertions give false confidence.

**Rule 1 — No permissive OR assertions.** ` + "`status == 200 || status == 404`" + ` is almost always true and catches nothing.
` + "```yaml" + `
# WRONG — passes whether the operation succeeded or not
assert:
  - status == 200 || status == 201

# CORRECT — encode the exact expectation for this scenario
assert:
  - status == 201   # POST create always returns 201
` + "```" + `

**Rule 2 — Kafka consumers must verify message content.** ` + "`len(messages) > 0`" + ` only proves delivery.
` + "```yaml" + `
# WRONG
assert:
  - len(messages) > 0

# CORRECT — verify payload fields match what triggered the event
assert:
  - len(messages) == 1
  - messages[0].value.user_id == user_id
  - messages[0].value.email == email
  - messages[0].value.status == "active"
` + "```" + `

**Rule 3 — Cross-step comparisons: capture before, assert delta after.**
` + "```yaml" + `
- id: get_before
  action: http_request
  config:
    method: GET
    url: "${SERVICE_URL}/api/v1/items"
  output:
    count_before: $.body.total

- id: create_item
  action: http_request
  config:
    method: POST
    url: "${SERVICE_URL}/api/v1/items"
    body: { name: "New Item" }
  assert:
    - status == 201

- id: verify_count
  action: http_request
  config:
    method: GET
    url: "${SERVICE_URL}/api/v1/items"
  assert:
    - body.total == count_before + 1
` + "```" + `
Also applies to inventory: ` + "`first_row.inventory == initial_inventory - 2`" + `

**Rule 4 — Verify created entity fields, not just existence.**
` + "```yaml" + `
# WRONG — only proves something was created
assert:
  - status == 201
  - body.id != nil

# CORRECT — verify the entity matches what was sent
assert:
  - status == 201
  - body.id != nil
  - body.name == "Widget Alpha"
  - body.email == email          # bare variable name, not {{email}}
  - body.format == "gtfs-realtime"
  - body.is_active == true
  - body.owner_id == user_id
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
flow:
  name: "..."
  env_file: ../../.env.test   # DB_URL defined here — never hardcode the DSN

setup:
  - id: cleanup_notifications
    action: database_query
    config:
      connection: "${DB_URL}"
      query: >
        DELETE FROM notification_service.notifications
        WHERE user_id IN (
          SELECT id::text FROM user_service.users WHERE email = 'test-{{RANDOM_ID}}@example.com'
        )

  - id: cleanup_orders
    action: database_query
    config:
      connection: "${DB_URL}"
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
      connection: "${DB_URL}"
      query: >
        DELETE FROM order_service.orders
        WHERE user_id IN (
          SELECT id::text FROM user_service.users WHERE email = 'test-{{RANDOM_ID}}@example.com'
        )

  - id: cleanup_user
    action: database_query
    config:
      connection: "${DB_URL}"
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
      connection: "${DB_URL}"
      query: "UPDATE product_service.products SET inventory = 100 WHERE id = '{{product_id}}'"
` + "```" + `

## 4. Async Verification

When a step triggers an asynchronous process (e.g., order placement triggers a Kafka event
that updates inventory), you need to wait before verifying the result.

### Option A: eventually (Preferred)
Add ` + "`eventually: <timeout>`" + ` to any step to re-run it until its assertions pass. Use it to verify
state written by an asynchronous consumer — it replaces db_poll + database_query pairs and fixed delays:
` + "```yaml" + `
- id: inventory_reserved
  action: database_query
  eventually: 15s                  # or { timeout: 15s, interval: 250ms }
  config:
    query: "SELECT inventory FROM product_service.products WHERE id = $1"
    params: ["{{product_id}}"]
  assert:
    - "first_row.inventory == 8"
` + "```" + `
On timeout the step fails with the last assertion error, e.g. ` + "`got first_row.inventory = 10`" + `.

### Option B: kafka_consumer with match (Event Verification)
When you need to verify that a specific event was published, see **Kafka Assertions** above.

### Shared connections
Declare connections once instead of repeating them in every step. ` + "`database_query`" + ` and ` + "`db_poll`" + `
default ` + "`connection`" + ` to ` + "`DATABASE_URL`" + `; ` + "`kafka_producer`" + ` and ` + "`kafka_consumer`" + ` default ` + "`brokers`" + `
to ` + "`KAFKA_BROKERS`" + `:
` + "```yaml" + `
flow:
  name: "..."
  env:
    DATABASE_URL: "postgres://user:pass@localhost:5432/app?sslmode=disable"
    KAFKA_BROKERS: "localhost:9092"
` + "```" + `

### Avoid: delay
Fixed delays (` + "`action: delay`" + `) are either too short (flaky) or too long (slow). Prefer ` + "`eventually`" + `.

## 5. Variable Chaining

Capture IDs and values from one step and use them in subsequent steps.

### Capture via output blocks
` + "```yaml" + `
- id: create_user
  action: http_request
  config:
    method: POST
    url: "${USER_SERVICE_URL}/api/v1/users"
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
    url: "${ORDER_SERVICE_URL}/api/v1/orders"
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
    url: "${USER_SERVICE_URL}/api/v1/users"
    body:
      name: "Idempotent User"
      email: "idem@example.com"
  assert:
    - "status == 201"

- id: create_user_duplicate
  action: http_request
  config:
    method: POST
    url: "${USER_SERVICE_URL}/api/v1/users"
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
    url: "${USER_SERVICE_URL}/api/v1/users/00000000-0000-0000-0000-000000000000"
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
    url: "${USER_SERVICE_URL}/api/v1/users"
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
    url: "${ORDER_SERVICE_URL}/api/v1/orders"
    body:
      user_id: "{{user_id}}"
      items:
        - product_id: "{{product_id}}"
          quantity: 50

- id: concurrent_order_2
  action: http_request
  config:
    method: POST
    url: "${ORDER_SERVICE_URL}/api/v1/orders"
    body:
      user_id: "{{user_id}}"
      items:
        - product_id: "{{product_id}}"
          quantity: 60

# At least one should fail if inventory is 100
- id: verify_no_oversell
  action: database_query
  config:
    connection: "${DB_URL}"
    query: "SELECT inventory FROM product_service.products WHERE id = '{{product_id}}'"
  assert:
    - "rows[0].inventory >= 0"
` + "```" + `

## 7. Environment Files (env_file)

Instead of duplicating connection strings and service URLs in every flow's ` + "`env:`" + ` block,
use a shared ` + "`.env.test`" + ` file:

### Create a shared env file
` + "```" + `
# .env.test — shared infrastructure for all test flows
DB_URL=postgres://root:admin@localhost:5432/postgres?sslmode=disable
USER_SERVICE_URL=http://localhost:5001
PRODUCT_SERVICE_URL=http://localhost:5002
ORDER_SERVICE_URL=http://localhost:5003
NOTIFICATION_SERVICE_URL=http://localhost:5004
KAFKA_BROKERS=localhost:9092
REDIS_HOST=localhost
REDIS_PORT=6379
` + "```" + `

### Reference it in flows
` + "```yaml" + `
flow:
  name: "My Test Flow"
  env_file: .env.test            # relative to the flow file's directory
  env:                            # optional: inline overrides (take precedence)
    CUSTOM_TIMEOUT: "30s"
  steps:
    - id: create_user
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/users"
        body: { name: "Test" }
` + "```" + `

### Merge priority
1. **env_file** values load first (base layer)
2. **inline env:** values override env_file (flow-specific overrides)
3. **CLI/API variables** override everything (runtime overrides)

### Benefits
- **Single source of truth** — change a port number in one place, all flows pick it up
- **Environment portability** — swap ` + "`.env.test`" + ` for ` + "`.env.staging`" + ` to run against staging
- **Smaller YAML files** — flows focus on test logic, not infrastructure config
- **Dashboard compatibility** — when importing flows, the dashboard can resolve env_file or merge variables from its environment system

### When to use inline env: instead
- Flow-specific variables not shared across flows (e.g., test-specific timeout)
- Quick one-off flows during development
- Overriding a single value from env_file for a specific scenario

## 8. Test Plan YAML Schema

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
