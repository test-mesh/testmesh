# TestMesh Gap Analysis — Generated Flow Suite

**Date:** 2026-04-06
**Suite:** `testmesh/generated-flows/` (50 flows, 4 layers)
**Result:** 46 PASS / 4 FAIL (92%)

---

## Executive Summary

50 YAML flows were generated from natural language descriptions and source code, covering the 5 demo microservices (user, product, order, notification, recommendation) across 4 test layers:

| Layer | Description | Flows | Pass |
|---|---|---|---|
| L1 — Endpoint Contracts | Happy path + error cases per endpoint | 30 | 29 |
| L2 — Within-Service Chains | Multi-step flows inside a single service | 6 | 6 |
| L3 — Cross-Service E2E | Flows spanning 2+ services | 5 | 4 |
| L4 — Edge Cases | Concurrency, cache miss, Kafka lag, gRPC | 9 | 7 |
| **Total** | | **50** | **46** |

---

## Known Failures (4 flows)

### 1. gRPC JSON Codec Incompatibility (3 flows)

**Affected flows:**
- `recommendation-service/happy-path/recommendation-grpc-happy.yaml`
- `e2e/edge-cases/edge-grpc-no-graph-data.yaml`
- `e2e/cross-service/e2e-recommendations-after-purchase.yaml`

**Root cause:** The TestMesh gRPC action handler (`grpc.go`) uses a custom JSON codec (`ForceCodec`) to send request bytes over the gRPC connection. Standard protobuf gRPC servers (like the recommendation service) expect protobuf-encoded messages, not JSON. The server returns:
```
rpc error: code = Internal desc = grpc: error unmarshalling request: proto: cannot parse invalid wire-format data
```

**Impact:** Any gRPC flow targeting a standard protobuf server will fail.

**Recommended fix:**
- Implement gRPC server reflection support (`UseReflection: true`) — the recommendation service's port is open and likely supports reflection
- Or add `proto_file:` support to load `.proto` descriptors and encode requests as proper protobuf
- As a workaround, test gRPC services via their HTTP transcoding endpoints where available (the recommendation service also exposes HTTP on port 5006)

**Workaround applied:** The HTTP-based recommendation flows (`recommendation-http-happy.yaml`, `recommendation-no-history.yaml`) pass and cover the same logic.

---

### 2. Product Image Upload Endpoint Not Implemented (1 flow)

**Affected flow:** `product-service/happy-path/product-image-upload-download.yaml`

**Root cause:** `POST /products/:id/image` is not implemented in the product-service demo. The endpoint returns 404. MinIO is configured (infrastructure is running at port 9000) but the service has no handler for multipart image uploads.

**Impact:** MinIO integration cannot be tested end-to-end.

**Recommended fix:** Add image upload/download handlers to the product-service:
```go
// POST /api/v1/products/:id/image — upload image to MinIO bucket
// GET  /api/v1/products/:id/image — redirect/stream from MinIO
```

The `edge-minio-image-not-found.yaml` edge case test (404 on missing image) PASSES because it only requires a product to have no image — it doesn't need the upload endpoint.

---

## Framework Gaps Discovered

### A. Assertion Expression Syntax: Template Variables Are Not Substituted

**Discovery:** `{{user_id}}` inside assertion strings is NOT treated as a template substitution. Captured output variables are added to the expr-lang environment as bare names.

**Wrong:** `"body.id == '{{user_id}}'"`
**Correct:** `"body.id == user_id"`

This affects all assertions that compare captured IDs with response fields. The evaluator (`evaluator.go`) adds variables directly to the expr-lang `env` map, so they must be referenced without `{{}}` syntax.

**Impact:** High — affects ~12 flows that were initially broken.
**Status:** Fixed in all generated flows.

---

### B. Parallel Action Branch Structure

**Discovery:** The `parallel` action requires each branch to have a `steps:` array wrapper. A branch is a sub-flow, not a step.

**Wrong:**
```yaml
config:
  branches:
    - id: update_a
      action: http_request
      config: ...
```
**Correct:**
```yaml
config:
  branches:
    - steps:
        - id: update_a
          action: http_request
          config: ...
```

**Impact:** Both parallel flows were broken initially.
**Status:** Fixed.

---

### C. gRPC Config Field: `address` Not `host`

**Discovery:** The gRPC action handler uses `address` (combined host:port) not `host`/`port` separately.

**Status:** Fixed in all 3 gRPC flows.

---

### D. gRPC Service Name Must Include Package Prefix

**Discovery:** The gRPC service must be specified as `package.ServiceName` (e.g., `recommendation.RecommendationService`), not just the short name (`RecommendationService`).

**Status:** Fixed. But ultimately moot due to the JSON codec issue (gap A above).

---

### E. Kafka Message Field Type Comparisons

**Discovery:** `messages[0].value.<field> == captured_var` fails with `invalid operation: int(string)` because Kafka message fields and captured string vars may have type mismatches in the expr-lang evaluator. Field-level Kafka assertions are unreliable.

**Workaround:** Use only `len(messages) > 0` to verify events were produced. Use `db_poll` + `database_query` to verify the downstream effects of events.

**Recommendation:** Add a `messages[0].value.<field> as string == captured_var` cast syntax to the expression evaluator, or document that Kafka field comparisons require explicit type casting.

---

### F. MCP `run_flow` Tool: `env_file` Not Resolved with `file_path`

**Discovery:** The MCP `run_flow` tool's `file_path` parameter sets `FlowDir` correctly in code, but env_file loading fails silently (likely a path resolution bug in the compiled binary vs source). Using `yaml_content` with inline `env:` block works.

**Workaround:** Use the CLI directly (`./cli/testmesh run <file>`) which resolves `env_file` correctly.

**Recommendation:** Add a debug log when `env_file` fails to load (currently silently returns empty env), and add an integration test for env_file resolution.

---

## Service Coverage Summary

| Service | Endpoints Tested | Protocols | Gaps |
|---|---|---|---|
| user-service | POST /users, GET /users/:id, GET /users, POST /auth/login, GET /auth/verify | HTTP + DB + Redis + Kafka | None |
| product-service | POST /products, GET /products/:id, GET /products, PUT /products/:id/inventory, POST/GET /products/:id/image | HTTP + DB + Redis + Kafka + MinIO | Image upload endpoint missing |
| order-service | POST /orders, GET /orders/:id, GET /orders?user_id=, cross-service validation | HTTP + DB + Redis + Kafka | None |
| notification-service | GET /notifications/:user_id, Kafka consumer | HTTP + DB + Kafka | No write/update API tested |
| recommendation-service | GET /recommend/:user_id (HTTP), GetRecommendations (gRPC) | HTTP + gRPC + Neo4j | gRPC codec incompatibility |

---

## Recommendations by Priority

### P0 — Fix Framework (Blocks Coverage Expansion)

1. **Fix gRPC action to use protobuf encoding** — implement server reflection or `proto_file` support. Without this, gRPC services cannot be tested end-to-end.
2. **Document assertion syntax** — `{{var}}` is NOT interpolated in assertion strings. Add a clear error message when `{{var}}'` pattern is detected in assertions (it's always a bug).

### P1 — Improve Framework Reliability

3. **Fix env_file loading in MCP `run_flow` with `file_path`** — add error logging and fix the silent failure.
4. **Add Kafka field type coercion** — allow `messages[0].value.field as string == var` or auto-coerce in comparisons.
5. **Document parallel action branch structure** — the `branches[].steps[]` nesting is unintuitive; document clearly.

### P2 — Extend Demo Service Coverage

6. **Implement product image upload/download** in product-service to enable MinIO E2E testing.
7. **Add Neo4j direct query action** (`neo4j_query`) — currently the only way to verify PURCHASED edges is via the gRPC result, which is blocked by the codec issue. A direct Cypher query action would allow teardown cleanup and direct graph state verification.
8. **Add notification write API** (mark as read) to enable lifecycle testing.

### P3 — Test Suite Improvements

9. **Add `db_poll` for Kafka-driven flows** — polling the DB for side effects is more reliable than Kafka consumer assertions for verifying async processing.
10. **Use `{{RANDOM_ID}}` emails** in all flows to prevent cross-test pollution (already done in most flows).
11. **Add `order_id` field to order.placed Kafka event** — currently the event may not include `order_id` as a top-level string field, making message-level assertions fragile.
