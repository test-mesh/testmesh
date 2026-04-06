# TestMesh Flow Generation — Design Spec
Date: 2026-04-06

## Goal

Simulate the external user journey: a developer downloads TestMesh, provides a natural language description of their system plus a source code folder, and Claude + TestMesh MCP tools deeply analyze the codebase to generate a comprehensive, Playwright-quality test suite as TestMesh YAML flows.

Secondary goal: after generation and execution, produce a structured critique of TestMesh as a tool — identifying gaps, workarounds, and concrete improvement recommendations.

---

## Input

- **Natural language description**: brief system overview from the user (e.g. "I have a user service, product service, and order service — orders call both, Kafka events drive notifications")
- **Source code folder**: handlers, models, Kafka producers/consumers, DB schemas, gRPC protos, infrastructure config

The demo services (`testmesh/demo-services/`) serve as the stand-in "user's codebase" for this simulation.

---

## Workflow Phases

### Phase 1 — Deep Analysis

Claude reads the codebase in full before generating any flows:

- **HTTP surface**: all routes, request shapes, response shapes, status codes, validation rules
- **Data models**: DB schemas per service (PostgreSQL schemas: `user_service`, `product_service`, `order_service`, `notification_service`, `recommendation_service`)
- **Service dependencies**: which services call which (order → user, order → product)
- **Async topology**: Kafka topics produced and consumed per service, consumer groups
- **Infrastructure**: Redis key namespaces, Neo4j graph edges written/read, MinIO bucket usage
- **gRPC**: proto definitions for recommendation-service

Output: internal service map used to drive all subsequent flow generation.

MCP tools used: `analyze_service`, `analyze_workspace`, `get_action_types`, `get_yaml_schema`

---

### Phase 2 — Flow Generation by Layer

Flows are generated in four layers, each building on outputs from previous layers. All flows use:
- `setup` block: seed required data, clean previous state
- `teardown` block: delete test data, restore state
- Environment variables for all connection strings and URLs (`${USER_SERVICE_URL}`, `${DB_URL}`, `${KAFKA_BROKERS}`, etc.)
- `{{RANDOM_ID}}` for uniqueness where fixed emails/names would conflict

Each flow is validated with `validate_flow` before being written.

#### L1 — Endpoint Contracts (~30 flows)

One scenario per flow. Tests a single endpoint with one specific input/output contract.

| Service | Happy Path | Error Cases |
|---|---|---|
| user-service | create user, get user, list users, login, verify session | duplicate email, invalid email format, missing required fields, bad credentials, invalid session token |
| product-service | create product, get product, list products, update inventory, upload image, get image URL | negative price, missing name, product not found, concurrent inventory lock conflict (409) |
| order-service | create order, get order, list orders, list by user_id | empty items array, zero quantity, nonexistent user_id, nonexistent product_id, insufficient inventory |
| notification-service | get notifications, get unread notifications | user with no notifications, nonexistent user_id |
| recommendation-service | get recommendations via HTTP, get recommendations via gRPC | user with no purchase history |

#### L2 — Within-Service Flows (~15 flows)

Multi-step sequences within one service, verifying side effects:

- **user-service**: register → DB verify → Redis cache hit → login → verify session token
- **product-service**: create → Redis cache verify → update inventory → cache invalidation → inventory.changed Kafka event consumed
- **product-service**: create → upload image to MinIO → get presigned URL → verify URL resolves
- **order-service**: create → DB state verify (status=pending, total correct) → Redis cache hit → items and prices correct
- **notification-service**: trigger Kafka event → db_poll until notification row appears → HTTP returns it with correct type

#### L3 — Cross-Service E2E (~10 flows)

Full journeys spanning multiple services, verifying the complete chain:

- **Full order journey**: create user + product → place order → db_poll inventory deduction → verify notification created → verify Neo4j PURCHASED edges written
- **Order triggers notification**: place order → db_poll until notification.type=order.placed → HTTP notification endpoint returns it
- **Inventory deduction accuracy**: place order qty=3 → verify product inventory decreased by exactly 3
- **Auth-gated flow**: login → extract session token → use token header on order creation
- **Recommendations after purchase**: place 2 orders for different products → query recommendation-service gRPC → verify those product IDs appear in response

#### L4 — Edge Cases & Observability (~8 flows)

- **Concurrent inventory lock**: two parallel order requests for the same product, one must succeed (201), one must get conflict (409) — uses `parallel` action
- **Redis cache miss → DB fallback**: delete Redis key manually → GET endpoint → verify response still 200, Redis repopulated
- **Kafka consumer lag**: produce user.created event, db_poll until notification consumed with timeout
- **gRPC with no graph data**: fresh user, no orders → recommendations returns empty list, not error
- **MinIO image not found**: GET /products/:id/image on product with no upload → 404

---

### Phase 3 — Upload & Execute

Each flow is uploaded via `upload_flow` and executed via `trigger_execution`. Results collected via `get_execution`. Pass/fail recorded per flow with execution IDs.

---

### Phase 4 — Gap Analysis

After execution, Claude produces a structured critique across these dimensions:

| Dimension | What is evaluated |
|---|---|
| **Expressiveness** | Scenarios requiring workarounds; things that couldn't be cleanly expressed in YAML |
| **Async handling** | Whether `db_poll` + `kafka_consumer` are sufficient; fragility of timing; retry/backoff support |
| **Variable passing** | Chaining outputs across 10+ steps; nested JSON extraction limitations |
| **Test isolation** | Setup/teardown effectiveness; flakiness risk from leftover state |
| **Error messages** | Whether assertion failures produce actionable output or cryptic errors |
| **gRPC coverage** | Friction with proto-typed requests/responses |
| **Parallel execution** | Reliability of the `parallel` action under the concurrent inventory test |
| **Developer UX** | Estimated effort to write flows by hand; learning curve observations |

Gaps are ranked: **blocker** (can't express the test at all) / **friction** (possible but awkward) / **nice-to-have** (minor improvement).

Each gap has a concrete TestMesh improvement recommendation tied to a real example from the generation run.

---

### Phase 5 — Package as Skill

Write a `/generate-flows` skill that encodes the exact prompt structure, phase sequence, and output organization that produced good results. Any external user can invoke it against their own codebase.

---

## Output Artifacts

1. `testmesh/generated-flows/` — all generated YAML flows organized by layer and service
2. Execution results — pass/fail per flow with execution IDs
3. `docs/testmesh-gap-analysis.md` — structured critique with improvement recommendations
4. `.claude/plugins/*/skills/generate-flows.md` — reusable skill

---

## Services Under Test

| Service | Port | Key Technology |
|---|---|---|
| user-service | 5001 | HTTP, PostgreSQL, Redis, Kafka |
| product-service | 5002 | HTTP, PostgreSQL, Redis, Kafka, MinIO |
| order-service | 5003 | HTTP, PostgreSQL, Redis, Kafka, Neo4j |
| notification-service | 5004 | HTTP, PostgreSQL, Redis, Kafka (consumer) |
| recommendation-service | 5005 (gRPC) / 5006 (HTTP) | gRPC, HTTP, Neo4j, Kafka (consumer) |

---

## Success Criteria

- 60+ flows generated covering all 4 layers
- All L1 and L2 flows pass on first run
- L3 and L4 flows pass or produce actionable failures (not framework errors)
- Gap analysis identifies at least 5 concrete improvement areas with recommendations
- Skill is usable by an external user on their own codebase with minimal adaptation
