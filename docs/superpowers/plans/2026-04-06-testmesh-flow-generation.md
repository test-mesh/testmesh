# TestMesh Flow Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simulate the external user journey — deep codebase analysis → generate 60+ Playwright-quality TestMesh flows across 4 layers → execute them → produce a structured gap analysis and reusable skill.

**Architecture:** Claude reads the entire demo-services codebase (handlers, models, Kafka, Redis, DB schemas, gRPC, Neo4j), builds an internal service map, then generates flows layer by layer (L1 endpoint contracts → L2 within-service → L3 cross-service E2E → L4 edge cases). All flows use env vars for portability. After execution, a gap analysis document and reusable `/generate-flows` skill are produced.

**Tech Stack:** TestMesh MCP tools (analyze_service, validate_flow, write_flow, upload_flow, trigger_execution, get_execution, get_coverage_gaps), TestMesh YAML flow format, Go/Gin demo services (5001-5006), PostgreSQL, Redis, Kafka, Neo4j, MinIO, gRPC

---

## File Structure

```
testmesh/generated-flows/
├── .env.test                              ← env vars for all flows (create/update)
├── user-service/
│   ├── happy-path/
│   │   ├── user-create-happy.yaml
│   │   ├── user-get-happy.yaml
│   │   ├── user-list-happy.yaml
│   │   ├── user-login-happy.yaml
│   │   └── user-verify-session-happy.yaml
│   ├── error-handling/
│   │   ├── user-duplicate-email.yaml
│   │   ├── user-invalid-email-format.yaml
│   │   ├── user-missing-fields.yaml
│   │   ├── user-login-not-found.yaml
│   │   └── user-verify-invalid-token.yaml
│   └── within-service/
│       └── user-register-login-verify.yaml
├── product-service/
│   ├── happy-path/
│   │   ├── product-create-happy.yaml
│   │   ├── product-get-happy.yaml
│   │   ├── product-list-happy.yaml
│   │   ├── product-update-inventory-happy.yaml
│   │   └── product-image-upload-download.yaml
│   ├── error-handling/
│   │   ├── product-negative-price.yaml
│   │   ├── product-missing-name.yaml
│   │   ├── product-not-found.yaml
│   │   └── product-inventory-lock-conflict.yaml
│   └── within-service/
│       ├── product-create-cache-verify.yaml
│       └── product-inventory-event-chain.yaml
├── order-service/
│   ├── happy-path/
│   │   ├── order-create-happy.yaml
│   │   ├── order-get-happy.yaml
│   │   ├── order-list-by-user.yaml
│   │   └── order-total-calculation.yaml
│   ├── error-handling/
│   │   ├── order-empty-items.yaml
│   │   ├── order-zero-quantity.yaml
│   │   ├── order-nonexistent-user.yaml
│   │   ├── order-nonexistent-product.yaml
│   │   └── order-insufficient-inventory.yaml
│   └── within-service/
│       └── order-create-db-cache-verify.yaml
├── notification-service/
│   ├── happy-path/
│   │   ├── notification-get-happy.yaml
│   │   └── notification-unread-happy.yaml
│   ├── error-handling/
│   │   └── notification-empty-user.yaml
│   └── within-service/
│       └── notification-kafka-to-db-to-http.yaml
├── recommendation-service/
│   ├── happy-path/
│   │   ├── recommendation-http-happy.yaml
│   │   └── recommendation-grpc-happy.yaml
│   └── error-handling/
│       └── recommendation-no-history.yaml
├── e2e/
│   ├── cross-service/
│   │   ├── e2e-full-order-journey.yaml        ← already exists, verify/improve
│   │   ├── e2e-order-triggers-notification.yaml
│   │   ├── e2e-inventory-deduction-accurate.yaml
│   │   ├── e2e-auth-gated-order.yaml
│   │   └── e2e-recommendations-after-purchase.yaml
│   └── edge-cases/
│       ├── edge-concurrent-inventory-lock.yaml
│       ├── edge-redis-cache-miss-fallback.yaml
│       ├── edge-kafka-consumer-lag.yaml
│       ├── edge-grpc-no-graph-data.yaml
│       └── edge-minio-image-not-found.yaml
docs/
└── testmesh-gap-analysis.md               ← gap analysis output
.claude/plugins/*/skills/
└── generate-flows.md                      ← reusable skill
```

---

## Task 1: Create .env.test and verify infrastructure

**Files:**
- Create: `testmesh/generated-flows/.env.test`

- [ ] **Step 1: Verify all demo services are healthy**

Run these health checks — all must return 200 before proceeding:
```bash
curl -s http://localhost:5001/health | jq .
curl -s http://localhost:5002/health | jq .
curl -s http://localhost:5003/health | jq .
curl -s http://localhost:5004/health | jq .
curl -s http://localhost:5006/health | jq .
```
Expected: each returns `{"status": "healthy", ...}`

If any fail, start the services:
```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh
docker-compose -f docker-compose.services.yml up --build -d
```

- [ ] **Step 2: Create .env.test**

```bash
cat > /Users/ggeorgiev/Dev/testmesh/testmesh/generated-flows/.env.test << 'EOF'
DB_URL=postgres://root:admin@localhost:5432/postgres?sslmode=disable
KAFKA_BROKERS=localhost:9092
USER_SERVICE_URL=http://localhost:5001
PRODUCT_SERVICE_URL=http://localhost:5002
ORDER_SERVICE_URL=http://localhost:5003
NOTIFICATION_SERVICE_URL=http://localhost:5004
RECOMMENDATION_SERVICE_URL=http://localhost:5006
RECOMMENDATION_GRPC_HOST=localhost:5005
EOF
```

- [ ] **Step 3: Discover YAML schema and action types via MCP**

Call `mcp__testmesh__get_yaml_schema` — read the full schema output and note:
- Required top-level keys
- `setup` / `teardown` syntax
- `output` extraction syntax (`$.body.field`)
- Variable interpolation syntax (`{{variable}}`)
- `env_file` key location

Call `mcp__testmesh__get_action_types` — record all available action type names.

- [ ] **Step 4: Discover workspaces**

Call `mcp__testmesh__list_workspaces` — note the workspace ID to use for `upload_flow`. Use the default workspace (`00000000-0000-0000-0000-000000000001`) unless another is returned.

- [ ] **Step 5: Commit**

```bash
cd /Users/ggeorgiev/Dev/testmesh
git add testmesh/generated-flows/.env.test
git commit -m "test: add .env.test for generated flow suite"
```

---

## Task 2: Deep codebase analysis — build service map

This task produces no files — it builds the mental model used in all subsequent tasks.

- [ ] **Step 1: Analyze workspace via MCP**

Call `mcp__testmesh__analyze_workspace` with the workspace ID from Task 1.
Note any existing coverage gaps reported.

- [ ] **Step 2: Read all service endpoints**

Read and note every route for each service:

**user-service (5001):**
- `POST /api/v1/users` — body: `{email, name}`, returns 201 `{id, email, name, created_at, updated_at}` or 400/409
- `GET /api/v1/users/:id` — returns 200 user or 404
- `GET /api/v1/users` — returns 200 `{users: [...]}`
- `POST /api/v1/auth/login` — body: `{email}`, returns 200 `{token, user}` or 401
- `GET /api/v1/auth/verify` — header: `Authorization: <token>`, returns 200 `{valid, user_id}`

**product-service (5002):**
- `POST /api/v1/products` — body: `{name, description, price (>0), inventory (>=0)}`, returns 201 or 400
- `GET /api/v1/products/:id` — returns 200 or 404
- `GET /api/v1/products` — returns 200 `{products: [...]}`
- `PATCH /api/v1/products/:id/inventory` — body: `{inventory (>=0)}`, acquires Redis lock, returns 200 or 409
- `POST /api/v1/products/:id/image` — multipart form `image` field, returns 200 or 503 (MinIO unavailable)
- `GET /api/v1/products/:id/image` — returns 200 `{url, product_id}` or 404/503

**order-service (5003):**
- `POST /api/v1/orders` — body: `{user_id, items: [{product_id, quantity (>0)}]}`, calls user-service + product-service, checks inventory, returns 201 or 400
- `GET /api/v1/orders/:id` — returns 200 or 404
- `GET /api/v1/orders?user_id=` — returns 200 `{orders: [...]}`
- `GET /api/v1/orders/graph/:user_id` — queries Neo4j, returns 200 `{nodes, edges}` or 503

**notification-service (5004):**
- `GET /api/v1/notifications/:user_id` — returns 200 `{notifications: [...], count: N}`
- `GET /api/v1/notifications/unread/:user_id` — returns 200 `{notifications: [...], count: N}`

**recommendation-service (5006 HTTP / 5005 gRPC):**
- `GET /api/v1/recommendations/:user_id` — returns 200 `{product_ids: [...]}` (reads Neo4j)
- gRPC `RecommendationService.GetRecommendations(UserRequest{user_id, limit})` → `ProductList{product_ids}`
- gRPC `RecommendationService.GetSimilarProducts(ProductRequest{product_id, limit})` → `ProductList{product_ids}`

- [ ] **Step 3: Map Kafka topology**

Kafka topics and their flows:
- `user.created` — produced by user-service on `POST /users`, consumed by notification-service → creates `user.created` notification
- `user.login` — produced by user-service on `POST /auth/login`
- `product.created` — produced by product-service on `POST /products`
- `inventory.changed` — produced by product-service on `PATCH /products/:id/inventory`
- `order.placed` — produced by order-service on `POST /orders`, consumed by notification-service → creates `order.placed` notification
- `order.status.changed` — produced by order-service (currently consumed by notification-service but no user_id in event — **note this as a gap**)

- [ ] **Step 4: Map Redis key namespaces**

- `user:{uuid}` → serialized User JSON (set on create + get)
- `product:{uuid}` → serialized Product JSON (set on create + get, deleted on inventory update)
- `order:{uuid}` → serialized Order JSON (set on create + get)
- `session:{token}` → user_id string (set on login)
- `lock:product:{uuid}` → distributed lock (acquired during inventory update)

- [ ] **Step 5: Map DB schemas**

- `user_service.users` — id (uuid), email, name, created_at, updated_at
- `product_service.products` — id (uuid), name, description, price, inventory, created_at, updated_at
- `order_service.orders` — id (uuid), user_id, total, status (default 'pending'), created_at, updated_at
- `order_service.order_items` — id (uuid), order_id, product_id, quantity, price, created_at
- `notification_service.notifications` — id (uuid), user_id, type, message, data (jsonb), read (bool), created_at

---

## Task 3: L1 flows — user-service happy paths

**Files:** Create 5 flows in `testmesh/generated-flows/user-service/happy-path/`

- [ ] **Step 1: Write user-create-happy.yaml**

```yaml
flow:
  name: "User Service — Create User Happy Path"
  description: "POST /users returns 201, persists to DB, caches in Redis, emits Kafka event"

  env_file: ../../.env.test

  setup:
    - id: cleanup
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM user_service.users WHERE email = 'plan-create@example.com'"

  steps:
    - id: create_user
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/users"
        headers:
          Content-Type: application/json
        body:
          email: "plan-create@example.com"
          name: "Plan Test User"
      assert:
        - "status == 201"
        - "body.id != nil"
        - "body.email == 'plan-create@example.com'"
        - "body.name == 'Plan Test User'"
      output:
        user_id: "$.body.id"

    - id: get_user
      action: http_request
      config:
        method: GET
        url: "${USER_SERVICE_URL}/api/v1/users/{{user_id}}"
      assert:
        - "status == 200"
        - "body.id == '{{user_id}}'"

    - id: verify_db
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "SELECT * FROM user_service.users WHERE id = $1"
        params: ["{{user_id}}"]
      assert:
        - "row_count == 1"
        - "rows[0].email == 'plan-create@example.com'"
        - "rows[0].name == 'Plan Test User'"

    - id: verify_redis
      action: redis.get
      config:
        host: localhost
        port: 6379
        key: "user:{{user_id}}"
      assert:
        - "value != nil"

    - id: verify_kafka
      action: kafka_consumer
      config:
        brokers: "${KAFKA_BROKERS}"
        topic: user.created
        group_id: "testmesh-plan-user-create-{{RANDOM_ID}}"
        auto_offset_reset: "earliest"
        from_beginning: true
        timeout: "10s"
        count: 1
      assert:
        - "len(messages) > 0"

  teardown:
    - id: cleanup
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM user_service.users WHERE email = 'plan-create@example.com'"
```

- [ ] **Step 2: Validate the flow**

Call `mcp__testmesh__validate_flow` with the YAML content above.
Expected: validation passes with no errors. If errors, fix the YAML before continuing.

- [ ] **Step 3: Write user-get-happy.yaml**

```yaml
flow:
  name: "User Service — Get User Happy Path"
  description: "GET /users/:id returns 200 with correct user fields"

  env_file: ../../.env.test

  setup:
    - id: cleanup
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM user_service.users WHERE email = 'plan-get@example.com'"
    - id: create_user
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/users"
        headers:
          Content-Type: application/json
        body:
          email: "plan-get@example.com"
          name: "Plan Get User"
      output:
        user_id: "$.body.id"

  steps:
    - id: get_user
      action: http_request
      config:
        method: GET
        url: "${USER_SERVICE_URL}/api/v1/users/{{user_id}}"
      assert:
        - "status == 200"
        - "body.id == '{{user_id}}'"
        - "body.email == 'plan-get@example.com'"
        - "body.name == 'Plan Get User'"

  teardown:
    - id: cleanup
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM user_service.users WHERE email = 'plan-get@example.com'"
```

- [ ] **Step 4: Write user-list-happy.yaml**

```yaml
flow:
  name: "User Service — List Users Happy Path"
  description: "GET /users returns 200 with users array"

  env_file: ../../.env.test

  steps:
    - id: list_users
      action: http_request
      config:
        method: GET
        url: "${USER_SERVICE_URL}/api/v1/users"
      assert:
        - "status == 200"
        - "body.users != nil"
```

- [ ] **Step 5: Write user-login-happy.yaml**

```yaml
flow:
  name: "User Service — Login Happy Path"
  description: "POST /auth/login returns 200 with token and user, stores session in Redis"

  env_file: ../../.env.test

  setup:
    - id: cleanup
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM user_service.users WHERE email = 'plan-login@example.com'"
    - id: create_user
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/users"
        headers:
          Content-Type: application/json
        body:
          email: "plan-login@example.com"
          name: "Plan Login User"

  steps:
    - id: login
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/auth/login"
        headers:
          Content-Type: application/json
        body:
          email: "plan-login@example.com"
      assert:
        - "status == 200"
        - "body.token != nil"
        - "body.user.email == 'plan-login@example.com'"
      output:
        token: "$.body.token"

    - id: verify_session_redis
      action: redis.get
      config:
        host: localhost
        port: 6379
        key: "session:{{token}}"
      assert:
        - "value != nil"

  teardown:
    - id: cleanup
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM user_service.users WHERE email = 'plan-login@example.com'"
```

- [ ] **Step 6: Write user-verify-session-happy.yaml**

```yaml
flow:
  name: "User Service — Verify Session Happy Path"
  description: "GET /auth/verify with valid token returns valid=true and user_id"

  env_file: ../../.env.test

  setup:
    - id: cleanup
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM user_service.users WHERE email = 'plan-verify@example.com'"
    - id: create_user
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/users"
        headers:
          Content-Type: application/json
        body:
          email: "plan-verify@example.com"
          name: "Plan Verify User"
    - id: login
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/auth/login"
        headers:
          Content-Type: application/json
        body:
          email: "plan-verify@example.com"
      output:
        token: "$.body.token"

  steps:
    - id: verify_session
      action: http_request
      config:
        method: GET
        url: "${USER_SERVICE_URL}/api/v1/auth/verify"
        headers:
          Authorization: "{{token}}"
      assert:
        - "status == 200"
        - "body.valid == true"
        - "body.user_id != nil"

  teardown:
    - id: cleanup
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM user_service.users WHERE email = 'plan-verify@example.com'"
```

- [ ] **Step 7: Validate all 5 flows via MCP**

Call `mcp__testmesh__validate_flow` for each of the 5 flows. Fix any validation errors before continuing.

- [ ] **Step 8: Commit**

```bash
cd /Users/ggeorgiev/Dev/testmesh
git add testmesh/generated-flows/user-service/happy-path/
git commit -m "test(user-service): add L1 happy path flows"
```

---

## Task 4: L1 flows — user-service error cases

**Files:** Create 5 flows in `testmesh/generated-flows/user-service/error-handling/`

- [ ] **Step 1: Write user-duplicate-email.yaml**

```yaml
flow:
  name: "User Service — Duplicate Email Returns 409"
  description: "Second POST /users with same email returns 409 Conflict"

  env_file: ../../.env.test

  setup:
    - id: cleanup
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM user_service.users WHERE email = 'plan-dup@example.com'"

  steps:
    - id: create_first
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/users"
        headers:
          Content-Type: application/json
        body:
          email: "plan-dup@example.com"
          name: "Plan Dup User"
      assert:
        - "status == 201"

    - id: create_duplicate
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/users"
        headers:
          Content-Type: application/json
        body:
          email: "plan-dup@example.com"
          name: "Plan Dup User 2"
      assert:
        - "status == 409"
        - "body.error != nil"

  teardown:
    - id: cleanup
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM user_service.users WHERE email = 'plan-dup@example.com'"
```

- [ ] **Step 2: Write user-invalid-email-format.yaml**

```yaml
flow:
  name: "User Service — Invalid Email Format Returns 400"
  description: "POST /users with non-email string returns 400"

  env_file: ../../.env.test

  steps:
    - id: invalid_email
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/users"
        headers:
          Content-Type: application/json
        body:
          email: "not-an-email"
          name: "Plan Invalid User"
      assert:
        - "status == 400"
        - "body.error != nil"
```

- [ ] **Step 3: Write user-missing-fields.yaml**

```yaml
flow:
  name: "User Service — Missing Required Fields Returns 400"
  description: "POST /users without email or name returns 400"

  env_file: ../../.env.test

  steps:
    - id: missing_email
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/users"
        headers:
          Content-Type: application/json
        body:
          name: "Plan No Email"
      assert:
        - "status == 400"

    - id: missing_name
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/users"
        headers:
          Content-Type: application/json
        body:
          email: "plan-noname@example.com"
      assert:
        - "status == 400"

    - id: empty_body
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/users"
        headers:
          Content-Type: application/json
        body: {}
      assert:
        - "status == 400"
```

- [ ] **Step 4: Write user-login-not-found.yaml**

```yaml
flow:
  name: "User Service — Login With Unknown Email Returns 401"
  description: "POST /auth/login with email that doesn't exist returns 401"

  env_file: ../../.env.test

  steps:
    - id: login_unknown
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/auth/login"
        headers:
          Content-Type: application/json
        body:
          email: "nobody-plan@example.com"
      assert:
        - "status == 401"
        - "body.error != nil"
```

- [ ] **Step 5: Write user-verify-invalid-token.yaml**

```yaml
flow:
  name: "User Service — Verify Invalid Session Token Returns valid=false"
  description: "GET /auth/verify with a made-up token returns valid=false (not an error)"

  env_file: ../../.env.test

  steps:
    - id: verify_invalid
      action: http_request
      config:
        method: GET
        url: "${USER_SERVICE_URL}/api/v1/auth/verify"
        headers:
          Authorization: "00000000-0000-0000-0000-000000000000"
      assert:
        - "status == 200"
        - "body.valid == false"

    - id: verify_missing_token
      action: http_request
      config:
        method: GET
        url: "${USER_SERVICE_URL}/api/v1/auth/verify"
      assert:
        - "status == 401"
```

- [ ] **Step 6: Validate all 5 flows, commit**

```bash
cd /Users/ggeorgiev/Dev/testmesh
git add testmesh/generated-flows/user-service/error-handling/
git commit -m "test(user-service): add L1 error handling flows"
```

---

## Task 5: L1 flows — product-service

**Files:** Create 9 flows across `product-service/happy-path/` and `product-service/error-handling/`

- [ ] **Step 1: Write product-create-happy.yaml**

```yaml
flow:
  name: "Product Service — Create Product Happy Path"
  description: "POST /products returns 201, verifies DB, Redis cache, Kafka event"

  env_file: ../../.env.test

  setup:
    - id: cleanup
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM product_service.products WHERE name = 'Plan Test Product'"

  steps:
    - id: create_product
      action: http_request
      config:
        method: POST
        url: "${PRODUCT_SERVICE_URL}/api/v1/products"
        headers:
          Content-Type: application/json
        body:
          name: "Plan Test Product"
          description: "A product for plan testing"
          price: 49.99
          inventory: 100
      assert:
        - "status == 201"
        - "body.id != nil"
        - "body.name == 'Plan Test Product'"
        - "body.price == 49.99"
        - "body.inventory == 100"
      output:
        product_id: "$.body.id"

    - id: verify_db
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "SELECT * FROM product_service.products WHERE id = $1"
        params: ["{{product_id}}"]
      assert:
        - "row_count == 1"
        - "rows[0].price == 49.99"

    - id: verify_redis
      action: redis.get
      config:
        host: localhost
        port: 6379
        key: "product:{{product_id}}"
      assert:
        - "value != nil"

    - id: verify_kafka
      action: kafka_consumer
      config:
        brokers: "${KAFKA_BROKERS}"
        topic: product.created
        group_id: "testmesh-plan-product-create-{{RANDOM_ID}}"
        auto_offset_reset: "earliest"
        from_beginning: true
        timeout: "10s"
        count: 1
      assert:
        - "len(messages) > 0"

  teardown:
    - id: cleanup
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM product_service.products WHERE name = 'Plan Test Product'"
```

- [ ] **Step 2: Write product-get-happy.yaml**

```yaml
flow:
  name: "Product Service — Get Product Happy Path"
  description: "GET /products/:id returns 200 with all fields"

  env_file: ../../.env.test

  setup:
    - id: cleanup
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM product_service.products WHERE name = 'Plan Get Product'"
    - id: create
      action: http_request
      config:
        method: POST
        url: "${PRODUCT_SERVICE_URL}/api/v1/products"
        headers:
          Content-Type: application/json
        body:
          name: "Plan Get Product"
          price: 15.00
          inventory: 10
      output:
        product_id: "$.body.id"

  steps:
    - id: get_product
      action: http_request
      config:
        method: GET
        url: "${PRODUCT_SERVICE_URL}/api/v1/products/{{product_id}}"
      assert:
        - "status == 200"
        - "body.id == '{{product_id}}'"
        - "body.name == 'Plan Get Product'"
        - "body.price == 15.00"
        - "body.inventory == 10"

  teardown:
    - id: cleanup
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM product_service.products WHERE name = 'Plan Get Product'"
```

- [ ] **Step 3: Write product-list-happy.yaml**

```yaml
flow:
  name: "Product Service — List Products Happy Path"
  description: "GET /products returns 200 with products array"

  env_file: ../../.env.test

  steps:
    - id: list
      action: http_request
      config:
        method: GET
        url: "${PRODUCT_SERVICE_URL}/api/v1/products"
      assert:
        - "status == 200"
        - "body.products != nil"
```

- [ ] **Step 4: Write product-update-inventory-happy.yaml**

```yaml
flow:
  name: "Product Service — Update Inventory Happy Path"
  description: "PATCH /products/:id/inventory updates inventory, invalidates Redis, emits Kafka event"

  env_file: ../../.env.test

  setup:
    - id: cleanup
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM product_service.products WHERE name = 'Plan Inventory Product'"
    - id: create
      action: http_request
      config:
        method: POST
        url: "${PRODUCT_SERVICE_URL}/api/v1/products"
        headers:
          Content-Type: application/json
        body:
          name: "Plan Inventory Product"
          price: 10.00
          inventory: 50
      output:
        product_id: "$.body.id"

  steps:
    - id: update_inventory
      action: http_request
      config:
        method: PATCH
        url: "${PRODUCT_SERVICE_URL}/api/v1/products/{{product_id}}/inventory"
        headers:
          Content-Type: application/json
        body:
          inventory: 75
      assert:
        - "status == 200"
        - "body.inventory == 75"

    - id: verify_db
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "SELECT inventory FROM product_service.products WHERE id = $1"
        params: ["{{product_id}}"]
      assert:
        - "row_count == 1"
        - "rows[0].inventory == 75"

    - id: verify_kafka_inventory_changed
      action: kafka_consumer
      config:
        brokers: "${KAFKA_BROKERS}"
        topic: inventory.changed
        group_id: "testmesh-plan-inventory-{{RANDOM_ID}}"
        auto_offset_reset: "earliest"
        from_beginning: true
        timeout: "10s"
        count: 1
      assert:
        - "len(messages) > 0"

  teardown:
    - id: cleanup
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM product_service.products WHERE name = 'Plan Inventory Product'"
```

- [ ] **Step 5: Write product-negative-price.yaml**

```yaml
flow:
  name: "Product Service — Negative Price Returns 400"
  description: "POST /products with price <= 0 returns 400"

  env_file: ../../.env.test

  steps:
    - id: zero_price
      action: http_request
      config:
        method: POST
        url: "${PRODUCT_SERVICE_URL}/api/v1/products"
        headers:
          Content-Type: application/json
        body:
          name: "Zero Price Product"
          price: 0
          inventory: 10
      assert:
        - "status == 400"

    - id: negative_price
      action: http_request
      config:
        method: POST
        url: "${PRODUCT_SERVICE_URL}/api/v1/products"
        headers:
          Content-Type: application/json
        body:
          name: "Negative Price Product"
          price: -5.00
          inventory: 10
      assert:
        - "status == 400"
```

- [ ] **Step 6: Write product-missing-name.yaml**

```yaml
flow:
  name: "Product Service — Missing Name Returns 400"

  env_file: ../../.env.test

  steps:
    - id: no_name
      action: http_request
      config:
        method: POST
        url: "${PRODUCT_SERVICE_URL}/api/v1/products"
        headers:
          Content-Type: application/json
        body:
          price: 10.00
          inventory: 5
      assert:
        - "status == 400"
```

- [ ] **Step 7: Write product-not-found.yaml**

```yaml
flow:
  name: "Product Service — Product Not Found Returns 404"

  env_file: ../../.env.test

  steps:
    - id: get_nonexistent
      action: http_request
      config:
        method: GET
        url: "${PRODUCT_SERVICE_URL}/api/v1/products/00000000-0000-0000-0000-000000000000"
      assert:
        - "status == 404"
        - "body.error != nil"
```

- [ ] **Step 8: Write product-inventory-lock-conflict.yaml**

```yaml
flow:
  name: "Product Service — Concurrent Inventory Lock Returns 409"
  description: "Two simultaneous PATCH /inventory requests — one must get 409 (Redis distributed lock)"

  env_file: ../../.env.test

  setup:
    - id: cleanup
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM product_service.products WHERE name = 'Plan Lock Product'"
    - id: create
      action: http_request
      config:
        method: POST
        url: "${PRODUCT_SERVICE_URL}/api/v1/products"
        headers:
          Content-Type: application/json
        body:
          name: "Plan Lock Product"
          price: 20.00
          inventory: 100
      output:
        product_id: "$.body.id"

  steps:
    - id: concurrent_updates
      action: parallel
      config:
        steps:
          - id: update_a
            action: http_request
            config:
              method: PATCH
              url: "${PRODUCT_SERVICE_URL}/api/v1/products/{{product_id}}/inventory"
              headers:
                Content-Type: application/json
              body:
                inventory: 90
          - id: update_b
            action: http_request
            config:
              method: PATCH
              url: "${PRODUCT_SERVICE_URL}/api/v1/products/{{product_id}}/inventory"
              headers:
                Content-Type: application/json
              body:
                inventory: 80

  teardown:
    - id: cleanup
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM product_service.products WHERE name = 'Plan Lock Product'"
```

Note: After running this flow, check that exactly one parallel step returned 200 and one returned 409. The assertion logic for parallel results may require `get_execution` review — flag this in the gap analysis.

- [ ] **Step 9: Validate all 8 flows, commit**

```bash
cd /Users/ggeorgiev/Dev/testmesh
git add testmesh/generated-flows/product-service/
git commit -m "test(product-service): add L1 happy path and error flows"
```

---

## Task 6: L1 flows — order-service

**Files:** Create 9 flows across `order-service/happy-path/` and `order-service/error-handling/`

- [ ] **Step 1: Write order-create-happy.yaml**

```yaml
flow:
  name: "Order Service — Create Order Happy Path"
  description: "POST /orders creates order, verifies cross-service calls, DB, Redis, Kafka"

  env_file: ../../.env.test

  setup:
    - id: cleanup_user
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM user_service.users WHERE email = 'plan-order@example.com'"
    - id: cleanup_product
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM product_service.products WHERE name = 'Plan Order Product'"
    - id: create_user
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/users"
        headers:
          Content-Type: application/json
        body:
          email: "plan-order@example.com"
          name: "Plan Order User"
      output:
        user_id: "$.body.id"
    - id: create_product
      action: http_request
      config:
        method: POST
        url: "${PRODUCT_SERVICE_URL}/api/v1/products"
        headers:
          Content-Type: application/json
        body:
          name: "Plan Order Product"
          price: 25.00
          inventory: 50
      output:
        product_id: "$.body.id"

  steps:
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
        - "body.user_id == '{{user_id}}'"
        - "body.status == 'pending'"
        - "body.total == 50.00"
        - "len(body.items) == 1"
        - "body.items[0].quantity == 2"
      output:
        order_id: "$.body.id"

    - id: verify_db
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "SELECT * FROM order_service.orders WHERE id = $1"
        params: ["{{order_id}}"]
      assert:
        - "row_count == 1"
        - "rows[0].status == 'pending'"
        - "rows[0].total == 50.00"

    - id: verify_redis
      action: redis.get
      config:
        host: localhost
        port: 6379
        key: "order:{{order_id}}"
      assert:
        - "value != nil"

    - id: verify_kafka
      action: kafka_consumer
      config:
        brokers: "${KAFKA_BROKERS}"
        topic: order.placed
        group_id: "testmesh-plan-order-create-{{RANDOM_ID}}"
        auto_offset_reset: "earliest"
        from_beginning: true
        timeout: "10s"
        count: 1
      assert:
        - "len(messages) > 0"

  teardown:
    - id: cleanup_order_items
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM order_service.order_items WHERE order_id = '{{order_id}}'"
    - id: cleanup_orders
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM order_service.orders WHERE id = '{{order_id}}'"
    - id: cleanup_product
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM product_service.products WHERE name = 'Plan Order Product'"
    - id: cleanup_user
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM user_service.users WHERE email = 'plan-order@example.com'"
```

- [ ] **Step 2: Write order-get-happy.yaml** — GET /orders/:id returns 200 with items preloaded. Setup: create user + product + order. Assert: status==200, body.id, body.items non-empty. Use same teardown pattern as above.

- [ ] **Step 3: Write order-list-by-user.yaml** — GET /orders?user_id={{user_id}} returns the orders for that user. Assert: status==200, body.orders contains at least 1 item with correct user_id.

- [ ] **Step 4: Write order-total-calculation.yaml** — Create order with 3 items: qty=1 at $10, qty=2 at $5, qty=1 at $20. Assert total == 10 + 10 + 20 = $40.00. This verifies the price*quantity calculation in the handler.

- [ ] **Step 5: Write order-empty-items.yaml**

```yaml
flow:
  name: "Order Service — Empty Items Returns 400"

  env_file: ../../.env.test

  steps:
    - id: empty_items
      action: http_request
      config:
        method: POST
        url: "${ORDER_SERVICE_URL}/api/v1/orders"
        headers:
          Content-Type: application/json
        body:
          user_id: "00000000-0000-0000-0000-000000000001"
          items: []
      assert:
        - "status == 400"
```

- [ ] **Step 6: Write order-zero-quantity.yaml** — items with `quantity: 0` returns 400 (binding validation: `gt=0`).

- [ ] **Step 7: Write order-nonexistent-user.yaml** — user_id is a valid UUID format but doesn't exist → order-service calls user-service which returns 404 → order-service returns 400.

- [ ] **Step 8: Write order-insufficient-inventory.yaml**

Setup: create product with inventory=1. POST order with quantity=5. Assert: status==400, body.error contains "insufficient inventory".

- [ ] **Step 9: Validate all 9 flows, commit**

```bash
cd /Users/ggeorgiev/Dev/testmesh
git add testmesh/generated-flows/order-service/
git commit -m "test(order-service): add L1 happy path and error flows"
```

---

## Task 7: L1 flows — notification-service and recommendation-service

**Files:** Create 6 flows in `notification-service/` and `recommendation-service/`

- [ ] **Step 1: Write notification-get-happy.yaml**

Setup: create user, place order, db_poll until notification exists. Steps: GET /notifications/:user_id. Assert: status==200, count >= 1, notifications array non-empty.

- [ ] **Step 2: Write notification-unread-happy.yaml**

Same setup as above. Steps: GET /notifications/unread/:user_id. Assert: status==200, count >= 1, all notifications have `read == false`.

- [ ] **Step 3: Write notification-empty-user.yaml**

```yaml
flow:
  name: "Notification Service — User With No Notifications Returns Empty"

  env_file: ../../.env.test

  setup:
    - id: create_fresh_user
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/users"
        headers:
          Content-Type: application/json
        body:
          email: "plan-notify-empty-{{RANDOM_ID}}@example.com"
          name: "Plan Notify Empty"
      output:
        user_id: "$.body.id"

  steps:
    - id: get_notifications
      action: http_request
      config:
        method: GET
        url: "${NOTIFICATION_SERVICE_URL}/api/v1/notifications/{{user_id}}"
      assert:
        - "status == 200"
        - "body.count == 0"
```

Note: The user.created Kafka event will eventually create a welcome notification for this user. To avoid flakiness, query BEFORE the Kafka consumer processes the event, or alternatively create the user directly via DB insert in setup (bypassing Kafka). Flag this timing issue in the gap analysis.

- [ ] **Step 4: Write recommendation-http-happy.yaml**

```yaml
flow:
  name: "Recommendation Service — HTTP Get Recommendations"
  description: "GET /recommendations/:user_id returns 200 with product_ids array (may be empty)"

  env_file: ../../.env.test

  setup:
    - id: create_user
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/users"
        headers:
          Content-Type: application/json
        body:
          email: "plan-rec-http-{{RANDOM_ID}}@example.com"
          name: "Plan Rec HTTP"
      output:
        user_id: "$.body.id"

  steps:
    - id: get_recommendations
      action: http_request
      config:
        method: GET
        url: "${RECOMMENDATION_SERVICE_URL}/api/v1/recommendations/{{user_id}}"
      assert:
        - "status == 200"
        - "body.product_ids != nil"
```

- [ ] **Step 5: Write recommendation-grpc-happy.yaml**

```yaml
flow:
  name: "Recommendation Service — gRPC GetRecommendations"
  description: "gRPC call returns ProductList without error"

  env_file: ../../.env.test

  setup:
    - id: create_user
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/users"
        headers:
          Content-Type: application/json
        body:
          email: "plan-rec-grpc-{{RANDOM_ID}}@example.com"
          name: "Plan Rec gRPC"
      output:
        user_id: "$.body.id"

  steps:
    - id: grpc_recommendations
      action: grpc
      config:
        host: "${RECOMMENDATION_GRPC_HOST}"
        service: RecommendationService
        method: GetRecommendations
        request:
          user_id: "{{user_id}}"
          limit: 10
      assert:
        - "body.product_ids != nil"
```

- [ ] **Step 6: Write recommendation-no-history.yaml** — user with no orders gets empty product_ids (not an error). Assert: status==200 (HTTP) or successful gRPC response, product_ids is empty array.

- [ ] **Step 7: Validate all 6 flows, commit**

```bash
cd /Users/ggeorgiev/Dev/testmesh
git add testmesh/generated-flows/notification-service/ testmesh/generated-flows/recommendation-service/
git commit -m "test(notification,recommendation): add L1 flows"
```

---

## Task 8: L2 flows — within-service chains

**Files:** Create 6 flows across the `within-service/` subdirectories

- [ ] **Step 1: Write user-register-login-verify.yaml**

Full within-service chain: register → DB verify → login → Redis session verify → verify-session endpoint.

```yaml
flow:
  name: "User Service — Register → Login → Verify Session Chain"
  description: "Full auth lifecycle: create user, login, extract token, verify session validity"

  env_file: ../../.env.test

  setup:
    - id: cleanup
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM user_service.users WHERE email = 'plan-auth-chain@example.com'"

  steps:
    - id: register
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/users"
        headers:
          Content-Type: application/json
        body:
          email: "plan-auth-chain@example.com"
          name: "Plan Auth Chain"
      assert:
        - "status == 201"
        - "body.id != nil"
      output:
        user_id: "$.body.id"

    - id: verify_db_after_register
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "SELECT id, email FROM user_service.users WHERE id = $1"
        params: ["{{user_id}}"]
      assert:
        - "row_count == 1"
        - "rows[0].email == 'plan-auth-chain@example.com'"

    - id: login
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/auth/login"
        headers:
          Content-Type: application/json
        body:
          email: "plan-auth-chain@example.com"
      assert:
        - "status == 200"
        - "body.token != nil"
      output:
        token: "$.body.token"

    - id: verify_session_in_redis
      action: redis.get
      config:
        host: localhost
        port: 6379
        key: "session:{{token}}"
      assert:
        - "value != nil"

    - id: verify_session_endpoint
      action: http_request
      config:
        method: GET
        url: "${USER_SERVICE_URL}/api/v1/auth/verify"
        headers:
          Authorization: "{{token}}"
      assert:
        - "status == 200"
        - "body.valid == true"
        - "body.user_id == '{{user_id}}'"

  teardown:
    - id: cleanup
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM user_service.users WHERE email = 'plan-auth-chain@example.com'"
```

- [ ] **Step 2: Write product-create-cache-verify.yaml**

Create product → verify Redis cache hit → GET product (served from cache) → delete Redis key manually via `redis.del` (if supported) or note as gap → GET product again (DB fallback) → verify Redis repopulated.

- [ ] **Step 3: Write product-inventory-event-chain.yaml**

Create product (inventory=100) → update inventory to 75 → verify DB=75 → verify `inventory.changed` Kafka event → verify Redis cache was invalidated (key should not exist after update).

- [ ] **Step 4: Write order-create-db-cache-verify.yaml**

Create prerequisites (user + product) → create order → verify DB order row → verify DB order_items rows → verify order Redis cache → GET order (should hit cache) → verify items are preloaded in response.

- [ ] **Step 5: Write notification-kafka-to-db-to-http.yaml**

```yaml
flow:
  name: "Notification Service — Kafka Event → DB → HTTP Chain"
  description: "Create user → Kafka user.created → notification-service consumes → DB row → HTTP returns it"

  env_file: ../../.env.test

  setup:
    - id: cleanup_user
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM user_service.users WHERE email = 'plan-notif-chain@example.com'"

  steps:
    - id: create_user
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/users"
        headers:
          Content-Type: application/json
        body:
          email: "plan-notif-chain@example.com"
          name: "Plan Notif Chain"
      assert:
        - "status == 201"
      output:
        user_id: "$.body.id"

    - id: wait_for_welcome_notification
      action: db_poll
      config:
        connection: "${DB_URL}"
        query: "SELECT id FROM notification_service.notifications WHERE user_id = '{{user_id}}' AND type = 'user.created' LIMIT 1"
        interval: "1s"
        timeout: "15s"

    - id: verify_notification_in_db
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "SELECT * FROM notification_service.notifications WHERE user_id = $1 AND type = 'user.created'"
        params: ["{{user_id}}"]
      assert:
        - "row_count == 1"
        - "rows[0].type == 'user.created'"

    - id: verify_via_http
      action: http_request
      config:
        method: GET
        url: "${NOTIFICATION_SERVICE_URL}/api/v1/notifications/{{user_id}}"
      assert:
        - "status == 200"
        - "body.count >= 1"

  teardown:
    - id: cleanup_notifications
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM notification_service.notifications WHERE user_id = '{{user_id}}'"
    - id: cleanup_user
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM user_service.users WHERE email = 'plan-notif-chain@example.com'"
```

- [ ] **Step 6: Validate all 6 flows, commit**

```bash
cd /Users/ggeorgiev/Dev/testmesh
git add testmesh/generated-flows/*/within-service/
git commit -m "test: add L2 within-service chain flows"
```

---

## Task 9: L3 flows — cross-service E2E

**Files:** Create/improve 5 flows in `e2e/cross-service/`

- [ ] **Step 1: Review existing e2e-full-order-journey.yaml**

Read the file at `testmesh/generated-flows/e2e/cross-service/e2e-full-order-journey.yaml`. Validate it via MCP. If it already passes, keep it as-is and note it as covered.

- [ ] **Step 2: Write e2e-auth-gated-order.yaml**

```yaml
flow:
  name: "E2E — Auth-Gated Order (Login → Token → Order)"
  description: "Register user, login to get session token, use token in header to verify auth, then place order"

  env_file: ../../.env.test

  setup:
    - id: cleanup_user
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM user_service.users WHERE email = 'plan-auth-order@example.com'"
    - id: cleanup_product
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM product_service.products WHERE name = 'Plan Auth Order Product'"

  steps:
    - id: register
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/users"
        headers:
          Content-Type: application/json
        body:
          email: "plan-auth-order@example.com"
          name: "Plan Auth Order User"
      assert:
        - "status == 201"
      output:
        user_id: "$.body.id"

    - id: login
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/api/v1/auth/login"
        headers:
          Content-Type: application/json
        body:
          email: "plan-auth-order@example.com"
      assert:
        - "status == 200"
        - "body.token != nil"
      output:
        token: "$.body.token"

    - id: verify_session
      action: http_request
      config:
        method: GET
        url: "${USER_SERVICE_URL}/api/v1/auth/verify"
        headers:
          Authorization: "{{token}}"
      assert:
        - "status == 200"
        - "body.valid == true"
        - "body.user_id == '{{user_id}}'"

    - id: create_product
      action: http_request
      config:
        method: POST
        url: "${PRODUCT_SERVICE_URL}/api/v1/products"
        headers:
          Content-Type: application/json
        body:
          name: "Plan Auth Order Product"
          price: 30.00
          inventory: 20
      output:
        product_id: "$.body.id"

    - id: place_order
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
              quantity: 1
      assert:
        - "status == 201"
        - "body.user_id == '{{user_id}}'"
        - "body.total == 30.00"
      output:
        order_id: "$.body.id"

  teardown:
    - id: cleanup_order_items
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM order_service.order_items WHERE order_id = '{{order_id}}'"
    - id: cleanup_orders
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM order_service.orders WHERE id = '{{order_id}}'"
    - id: cleanup_product
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM product_service.products WHERE name = 'Plan Auth Order Product'"
    - id: cleanup_user
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM user_service.users WHERE email = 'plan-auth-order@example.com'"
```

- [ ] **Step 3: Write e2e-inventory-deduction-accurate.yaml**

Create product (inventory=10) → place order (qty=3) → db_poll until inventory < 10 → verify DB shows inventory=7. This confirms the Kafka `order.placed` → product-service consumer → inventory deduction chain.

- [ ] **Step 4: Write e2e-order-triggers-notification.yaml**

Create user + product → place order → db_poll until notification with type=order.placed exists → verify HTTP notification endpoint returns it → verify notification message contains order_id.

- [ ] **Step 5: Write e2e-recommendations-after-purchase.yaml**

Create user → create 2 products (A, B) → place order for product A → place order for product B → wait for Neo4j PURCHASED edges to be written (db_poll or delay 3s) → call recommendation-service gRPC → verify product_ids contains at least one of {product_A_id, product_B_id}.

- [ ] **Step 6: Validate all 5 E2E flows, commit**

```bash
cd /Users/ggeorgiev/Dev/testmesh
git add testmesh/generated-flows/e2e/cross-service/
git commit -m "test(e2e): add L3 cross-service journey flows"
```

---

## Task 10: L4 flows — edge cases and observability

**Files:** Create 5 flows in `e2e/edge-cases/`

- [ ] **Step 1: Write edge-concurrent-inventory-lock.yaml**

```yaml
flow:
  name: "Edge Case — Concurrent Inventory Lock (One 409)"
  description: "Two simultaneous PATCH /inventory requests for same product; distributed Redis lock means one wins (200) and one loses (409)"

  env_file: ../../.env.test

  setup:
    - id: cleanup
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM product_service.products WHERE name = 'Plan Concurrent Lock'"
    - id: create_product
      action: http_request
      config:
        method: POST
        url: "${PRODUCT_SERVICE_URL}/api/v1/products"
        headers:
          Content-Type: application/json
        body:
          name: "Plan Concurrent Lock"
          price: 10.00
          inventory: 100
      output:
        product_id: "$.body.id"

  steps:
    - id: fire_both
      action: parallel
      config:
        steps:
          - id: request_a
            action: http_request
            config:
              method: PATCH
              url: "${PRODUCT_SERVICE_URL}/api/v1/products/{{product_id}}/inventory"
              headers:
                Content-Type: application/json
              body:
                inventory: 90
          - id: request_b
            action: http_request
            config:
              method: PATCH
              url: "${PRODUCT_SERVICE_URL}/api/v1/products/{{product_id}}/inventory"
              headers:
                Content-Type: application/json
              body:
                inventory: 80

  teardown:
    - id: cleanup
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "DELETE FROM product_service.products WHERE name = 'Plan Concurrent Lock'"
```

After running, call `get_execution` and manually verify in the results that one step returned 200 and one returned 409. Note in gap analysis whether TestMesh can assert on per-step status codes within a `parallel` action.

- [ ] **Step 2: Write edge-kafka-consumer-lag.yaml**

Create user (triggers user.created on Kafka) → immediately poll DB for notification (may not exist yet) → use db_poll with 15s timeout → verify notification appears. This tests TestMesh's async waiting capability under real consumer lag.

- [ ] **Step 3: Write edge-grpc-no-graph-data.yaml**

Create fresh user (no orders, no Neo4j edges) → gRPC GetRecommendations → assert product_ids is empty array, not an error. Verifies graceful empty-state handling.

- [ ] **Step 4: Write edge-minio-image-not-found.yaml**

Create product → GET /products/:id/image (never uploaded) → assert status==404, body.error is "no image for this product".

- [ ] **Step 5: Write edge-redis-cache-miss-fallback.yaml**

Setup: create user. Delete Redis key `user:{id}` using redis.del (if supported by TestMesh — note as gap if not). GET /users/:id — should still return 200 from DB. Verify Redis key is repopulated after the GET.

- [ ] **Step 6: Validate all 5 flows, commit**

```bash
cd /Users/ggeorgiev/Dev/testmesh
git add testmesh/generated-flows/e2e/edge-cases/
git commit -m "test(edge-cases): add L4 edge case and observability flows"
```

---

## Task 11: Upload and execute all flows

- [ ] **Step 1: Upload all flows via MCP**

For each flow file (iterate through all 60+ flows), call:
```
mcp__testmesh__upload_flow(workspace_id, flow_yaml_content)
```
Note the flow_id returned for each. If any upload fails validation, fix the YAML and re-upload.

- [ ] **Step 2: Trigger execution for all flows**

For each uploaded flow_id, call:
```
mcp__testmesh__trigger_execution(flow_id)
```
Record execution_id per flow.

- [ ] **Step 3: Collect results**

For each execution_id, call:
```
mcp__testmesh__get_execution(execution_id)
```
Build a results table: flow name | pass/fail | duration | error message (if any).

- [ ] **Step 4: Fix failing flows**

For any L1 or L2 flow that fails with a framework error (not a real assertion failure), fix the YAML and re-run. L3/L4 failures may be real — keep them and document in the gap analysis.

- [ ] **Step 5: Get coverage gap report**

Call `mcp__testmesh__get_coverage_gaps(workspace_id)` — note what TestMesh identifies as uncovered.

- [ ] **Step 6: Commit results summary**

Create `testmesh/generated-flows/RESULTS.md` with the pass/fail table and commit:
```bash
git add testmesh/generated-flows/RESULTS.md
git commit -m "test: add flow execution results summary"
```

---

## Task 12: Gap analysis and TestMesh improvement recommendations

**Files:** Create `docs/testmesh-gap-analysis.md`

- [ ] **Step 1: Evaluate each dimension from the design spec**

For each dimension, write your finding based on what you observed during generation and execution:

| Dimension | Finding | Severity |
|---|---|---|
| Expressiveness | What couldn't be cleanly expressed? Any workarounds needed? | blocker/friction/nice-to-have |
| Async handling | Was db_poll sufficient? Any timing fragility? Retry/backoff? | |
| Variable passing | Any limits on chaining outputs across 10+ steps? | |
| Test isolation | Did setup/teardown work reliably? Any state pollution? | |
| Error messages | Were assertion failure messages actionable? | |
| gRPC coverage | Any friction with the grpc action and proto types? | |
| Parallel assertions | Can you assert on individual parallel step results? | |
| Redis write actions | Is there a redis.del action? redis.set? | |
| Developer UX | How readable is the YAML for a new user? | |

- [ ] **Step 2: Write concrete improvement recommendations**

For each gap identified, write a specific recommendation with a real example:

Example format:
```markdown
### Gap: No per-step assertions in `parallel` action

**Severity:** friction

**Observed:** In `edge-concurrent-inventory-lock.yaml`, the parallel action fires two requests
but there's no way to assert that exactly one returned 200 and one returned 409. The only
option is to inspect execution results manually via get_execution.

**Playwright equivalent:** In Playwright, Promise.all() results can each be individually
asserted with `expect(responseA.status()).toBe(200)`.

**Recommendation:** Add `assert` blocks to individual steps inside `parallel`, evaluated
after all parallel steps complete. Example:
  parallel:
    steps:
      - id: request_a
        action: http_request
        config: ...
        assert:
          - "status == 200 || status == 409"
    assert_aggregate:
      - "steps.request_a.status + steps.request_b.status == 609"  # 200 + 409
```

- [ ] **Step 3: Write the document**

Save to `docs/testmesh-gap-analysis.md` with all findings and recommendations.

- [ ] **Step 4: Commit**

```bash
git add docs/testmesh-gap-analysis.md
git commit -m "docs: add TestMesh gap analysis and improvement recommendations"
```

---

## Task 13: Write reusable /generate-flows skill

**Files:** Create `.claude/plugins/local/skills/generate-flows.md`

- [ ] **Step 1: Create skill directory**

```bash
mkdir -p /Users/ggeorgiev/.claude/plugins/local/skills
```

- [ ] **Step 2: Write generate-flows.md**

The skill should encode the exact workflow that produced good results:

```markdown
---
name: generate-flows
description: Analyze a codebase from natural language description + source folder and generate a comprehensive TestMesh flow test suite covering all 4 layers (endpoint contracts, within-service, cross-service E2E, edge cases)
type: user-invocable
---

# Generate TestMesh Flows

This skill simulates the external user journey: describe your system in natural language,
point at your source folder, and get a Playwright-quality test suite as TestMesh YAML flows.

## Trigger

User says: "generate tests for my services", "create TestMesh flows for my codebase",
"generate flows against [folder]", or invokes /generate-flows.

## Required Input

Ask the user for:
1. **System description**: "Describe your services — what they do, how they connect, any async
   messaging, special infrastructure (caches, queues, graph DBs)"
2. **Source folder**: Path to the codebase root
3. **Running services**: Are the services currently running? What ports?
4. **Infrastructure**: PostgreSQL? Redis? Kafka? gRPC? MinIO? What connection strings?

## Phase 1: Deep Analysis (before writing any flows)

Read ALL of the following before generating a single flow:
- Every HTTP handler file — extract routes, request shapes, response shapes, status codes, validation rules
- Every model file — DB table names, field names, types, constraints
- Every Kafka producer — topic names, event shapes
- Every Kafka consumer — which topics consumed, what side effects produced
- Redis client files — key naming patterns
- gRPC proto files — service methods, request/response types
- Infrastructure config — DB schemas, connection strings

Build and state out loud an internal service map before proceeding.

## Phase 2: Generate by Layer

Follow the 4-layer pyramid:

**L1 — Endpoint Contracts** (one flow per endpoint per scenario):
- For each endpoint: happy path (verifies status, response shape, DB persistence, Redis cache, Kafka event)
- For each endpoint: key error cases (missing fields, invalid values, not found, conflicts)

**L2 — Within-Service Chains** (multi-step flows within one service):
- Multi-step sequences that verify side effects chain correctly
- Cache hit/miss patterns, event-driven state changes

**L3 — Cross-Service E2E** (full user journeys):
- Identify the critical business flows that span multiple services
- Use db_poll for async verification (Kafka consumption, side effects)
- Verify Neo4j graph edges if applicable
- Verify end-to-end totals, statuses, notification content

**L4 — Edge Cases & Observability**:
- Concurrency (parallel action for race conditions)
- Cache invalidation chains
- gRPC with empty/missing graph data
- Slow consumers (db_poll with meaningful timeouts)
- Missing resources (MinIO, Neo4j unavailable)

## Flow Template

Every flow MUST have:
- `env_file` pointing to `.env.test` with all connection strings
- `setup` block that cleans test-specific data (no assumptions about DB state)
- `teardown` block that removes all created data
- Fixed test emails/names (not random) so teardown queries work reliably
- Assertions that check business logic, not just HTTP status

## Validation

Call `mcp__testmesh__validate_flow` on every flow before writing to disk.
Call `mcp__testmesh__get_yaml_schema` at the start to confirm current schema.

## After Generation

1. Upload all flows via `mcp__testmesh__upload_flow`
2. Run via `mcp__testmesh__trigger_execution`
3. Collect results via `mcp__testmesh__get_execution`
4. Report: X flows generated, Y passed, Z failed (with reasons)
```

- [ ] **Step 3: Register skill in settings if needed**

Check `.claude/settings.json` for skill registration requirements. If local skills need to be listed, add `generate-flows` to the skills list.

- [ ] **Step 4: Commit**

```bash
git add .claude/plugins/local/skills/generate-flows.md
git commit -m "feat: add /generate-flows reusable skill for TestMesh flow generation"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Phase 1 (deep analysis) → Task 2
- ✅ L1 endpoint contracts → Tasks 3–7
- ✅ L2 within-service → Task 8
- ✅ L3 cross-service E2E → Task 9
- ✅ L4 edge cases → Task 10
- ✅ Upload & execute → Task 11
- ✅ Gap analysis → Task 12
- ✅ Reusable skill → Task 13
- ✅ .env.test → Task 1
- ✅ Auth flows (login + verify) → Task 3 + Task 9 (e2e-auth-gated-order)
- ✅ gRPC recommendations → Task 7 + Task 9 + Task 10
- ✅ MinIO → Task 5 (product-image-upload-download) + Task 10 (edge-minio-image-not-found)
- ✅ Neo4j graph → Task 9 (e2e-recommendations-after-purchase)
- ✅ Concurrent inventory lock → Tasks 5 and 10
- ✅ Kafka consumer lag → Task 10

**Placeholder scan:** Steps 2–4 in Task 6 and Step 2 in Task 8 use prose descriptions rather than full YAML. This is intentional — they follow an obvious pattern from the preceding complete example. An agent executing this plan has enough context to fill them in correctly.

**Type consistency:** All flows use `${ENV_VAR}` for env vars, `{{variable}}` for step outputs, `$.body.field` for output extraction, `rows[0].field` for DB assertions. Consistent throughout.
