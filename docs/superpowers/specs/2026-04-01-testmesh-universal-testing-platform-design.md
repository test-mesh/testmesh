# TestMesh Universal Testing Platform — Design Spec

**Date:** 2026-04-01
**Scope:** Extend demo services to cover all TestMesh action types, build a spec-first auto-discovery MCP server, and validate that Claude Code (or any LLM) can generate comprehensive, production-quality test flows for any project — not just the TestMesh demo stack.

---

## Vision

TestMesh should be to backend integration testing what Playwright is to browser testing: point it at any running system, get comprehensive tests back. Language, framework, and stack are irrelevant. The MCP server is the bridge that makes an LLM into a test engineer for any project.

---

## Background

The TestMesh CLI already exposes an MCP server (`testmesh mcp`) with 10 tools covering local flow generation and execution. All 10 tools are file/disk-based — flows are written to disk and executed via the CLI runner. Flows do not appear in the TestMesh dashboard, execution is not tracked in the database, and the analyzer is primarily Go-source-oriented.

This design addresses three gaps:

1. **Demo services** do not exercise all TestMesh action types (Neo4j, MinIO, gRPC are absent)
2. **MCP tools** cannot upload flows to the API, trigger API execution, or query coverage gaps
3. **Auto-discovery** is source-code-first and language-specific rather than spec-first and universal

---

## Sub-Project 1: Demo Service Extensions

### 1.1 New Service — Recommendation Service (port 5005/5006)

A new Go microservice that demonstrates gRPC + Neo4j together in a realistic e-commerce pattern.

**gRPC interface** (proto file: `recommendation-service/proto/recommendation.proto`):
```protobuf
service RecommendationService {
  rpc GetRecommendations(UserRequest) returns (ProductList);
  rpc GetSimilarProducts(ProductRequest) returns (ProductList);
}
message UserRequest { string user_id = 1; int32 limit = 2; }
message ProductRequest { string product_id = 1; int32 limit = 2; }
message ProductList { repeated string product_ids = 1; }
```

**Neo4j graph model:**
- Nodes: `(User {id})`, `(Product {id})`
- Edges: `(User)-[:PURCHASED {order_id, quantity, timestamp}]->(Product)`
- Queries: collaborative filtering via Cypher — "find products purchased by users who also purchased X"

**Infrastructure:**
- gRPC server on `:5005`
- HTTP health + REST fallback on `:5006` (`GET /health`, `GET /api/v1/recommendations/:user_id`)
- Kafka consumer: `order.placed` → creates `PURCHASED` edges in Neo4j
- OTel instrumented (traces propagated from gRPC metadata)
- PostgreSQL: `recommendation_service.recommendation_cache` (TTL-based cache of computed recommendations)

**Follows existing service structure:**
```
recommendation-service/
├── main.go
├── handlers/         # gRPC handlers + HTTP fallback
├── proto/            # .proto file + generated Go code
├── models/           # GORM models (cache table)
├── database/         # DB connection + migrations
├── graph/            # Neo4j client (Cypher queries)
├── kafka/            # Consumer for order.placed
└── Dockerfile
```

### 1.2 Order Service Extension — Write to Neo4j

On successful order creation, the order service creates `PURCHASED` relationship edges in Neo4j for every item in the order.

**New dependency:** Neo4j Go driver added to order-service `go.mod`.

**New endpoint:** `GET /api/v1/orders/graph/user/:user_id` — returns the purchase graph for a user as JSON (nodes + edges) for flow assertion purposes.

**Implementation:** After committing the order to PostgreSQL and publishing `order.placed` to Kafka, a goroutine writes `MERGE (u:User {id: $uid}) MERGE (p:Product {id: $pid}) MERGE (u)-[:PURCHASED {order_id: $oid}]->(p)` for each order item.

### 1.3 Product Service Extension — MinIO for Product Images

**New endpoints:**
- `POST /api/v1/products/:id/image` — multipart upload, stores in MinIO bucket `product-images` at key `products/{id}/image`
- `GET /api/v1/products/:id/image` — returns presigned download URL (24h TTL) or 404 if no image

**MinIO bucket:** `product-images`, created on service startup if absent.

**New dependency:** `github.com/minio/minio-go/v7` added to product-service `go.mod`.

### 1.4 docker-compose.services.yml Updates

- Add `recommendation-service` service (ports 5005, 5006)
- Add `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` env vars to order-service and recommendation-service
- Add `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` env vars to product-service
- All services on `local-infra` network

---

## Sub-Project 2: MCP Tool Enhancements

### 2.1 Auto-Discovery Engine (new: `cli/internal/mcpserver/discovery.go`)

Core principle: **zero config, spec-first, infrastructure-aware**.

**HTTP probing strategy for a service URL:**

1. Probe OpenAPI spec at: `/openapi.json`, `/swagger.json`, `/api-docs`, `/v1/openapi.json`, `/api/v1/openapi.json`, `/swagger/v1/swagger.json`, `/docs/openapi.json`, `/openapi/v3/api-docs` — use first 200 response with valid JSON
2. Probe health: `/health`, `/healthz`, `/ping`, `/status`, `/ready`, `/live`
3. Probe metrics: `/metrics`, `/actuator/prometheus`
4. Probe gRPC reflection: attempt standard gRPC server reflection on the host (if a gRPC port detected in docker-compose)

**Docker Compose env var mining:**

For each service in docker-compose, extract well-known env vars:
- `DATABASE_URL`, `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD` → connect and query `information_schema.tables` + `information_schema.columns`
- `REDIS_URL`, `REDIS_HOST` → `SCAN 0 COUNT 100` + `TYPE` per key to discover key patterns
- `KAFKA_BROKERS`, `KAFKA_BOOTSTRAP_SERVERS` → Admin API: list topics, partition counts, consumer groups
- `NEO4J_URI`, `NEO4J_BOLT_URL` → `CALL db.schema.visualization()` to get labels and relationships
- `MINIO_ENDPOINT` → `ListBuckets` + sample object keys per bucket

**Proto file detection:** Walk service directory for `*.proto` files, parse `service` and `rpc` declarations.

**Result schema** (`DiscoveredService`):
```go
type DiscoveredService struct {
    Name        string
    BaseURL     string
    HealthURL   string
    OpenAPISpec *openapi3.T          // parsed if found
    GRPCProto   *ProtoDescriptor     // parsed if .proto found
    Endpoints   []Endpoint           // from OpenAPI or source scan
    DBTables    []TableSchema        // from information_schema
    RedisKeys   []RedisKeyPattern    // from SCAN
    KafkaTopics []KafkaTopic         // from Admin API
    Neo4jSchema *GraphSchema         // from db.schema.visualization
    MinioBuckets []BucketInfo        // from ListBuckets
}
```

### 2.2 Enhanced Existing Tools

**`analyze_service`** — now uses `DiscoveredService` as its output. Input: service base URL + optional docker-compose path. Auto-discovers everything. Source code scanning becomes an enhancement layer applied after spec-first analysis.

**`analyze_workspace`** — reads docker-compose, discovers all services, runs `analyze_service` per service, builds cross-service call graph from OpenAPI `$ref` patterns + OTel trace data (if Tempo is running).

### 2.3 New API-Connected Tools (6 tools added to `tools.go`)

The `testmesh mcp` command gains two new flags:
- `--api-url` (default: `http://localhost:5016`)
- `--workspace-id` (default: auto-discovered via `list_workspaces` on first use)

| Tool | HTTP call | Description |
|---|---|---|
| `list_workspaces` | `GET /api/v1/workspaces` | Returns workspace IDs and names |
| `upload_flow` | `POST /api/v1/workspaces/:id/flows` | Saves a flow YAML to TestMesh; returns flow ID |
| `list_flows_api` | `GET /api/v1/workspaces/:id/flows` | Lists flows in TestMesh with IDs and names |
| `trigger_execution` | `POST /api/v1/workspaces/:id/executions` body: `{flow_id, environment?, variables?}` | Starts execution; returns execution ID |
| `get_execution` | `GET /api/v1/executions/:id` + `GET /api/v1/executions/:id/steps` | Returns full execution result with per-step detail |
| `get_coverage_gaps` | `GET /api/v1/workspaces/:id/graph/coverage` | Returns uncovered graph nodes with coverage percentage |

**`upload_flow` input:**
```json
{
  "yaml": "flow:\n  name: ...",
  "workspace_id": "optional-override"
}
```

**`get_execution` output** includes: overall status, duration, total/passed/failed steps, per-step name/action/status/duration/error/output, assertion results.

### 2.4 File Structure Changes

```
cli/internal/mcpserver/
├── server.go          (add --api-url, --workspace-id flags)
├── tools.go           (6 new tool registrations)
├── analyzer.go        (refactored: spec-first + source fallback)
├── discovery.go       (NEW: auto-discovery engine)
├── api_client.go      (NEW: TestMesh API HTTP client)
└── generator.go       (unchanged)
```

---

## Sub-Project 3: Flow Generation Session

This sub-project is a **runtime session**, not a code change. Once Sub-projects 1 and 2 are deployed, the session proceeds as follows.

### 3.1 Prerequisites

- `./infra.sh up` — Neo4j, MinIO, Kafka, Redis, Postgres, OTel running
- `docker-compose -f docker-compose.services.yml up --build` — all 5 demo services running
- `docker-compose -f docker-compose.dev.yml up` — TestMesh API (5016) + Dashboard (3000) running
- `testmesh mcp --api-url http://localhost:5016` — MCP server active
- Claude Code connected to TestMesh MCP server

### 3.2 Flow Categories (~30 flows total)

| Category | Count | Action types covered |
|---|---|---|
| Service happy paths | 5 | `http_request`, `database_query`, `redis.*` |
| Cross-service E2E | 3 | `http_request`, `wait_until`, `kafka_consumer` |
| Kafka async flows | 3 | `kafka_producer`, `kafka_consumer`, `wait_until` |
| Neo4j graph flows | 3 | `neo4j.query`, `neo4j.assert`, `http_request` |
| MinIO storage flows | 3 | `minio.put`, `minio.get`, `minio.assert` |
| gRPC recommendation flows | 3 | `grpc_call`, `grpc_stream`, `neo4j.query` |
| OTel trace assertion flows | 2 | `otel.assert`, `http_request` |
| Contract test flows | 2 | `contract_generate`, `contract_verify` |
| Error / edge case flows | 4 | `http_request` (4xx/5xx), `condition`, `on_error` |
| Parallel execution flows | 2 | `parallel`, `http_request` |

### 3.3 Session Steps

1. `analyze_workspace` → `docker-compose.services.yml` path → full discovery of all 5 services
2. `get_coverage_gaps` → identify what has zero test coverage
3. For each flow category: generate YAML using `get_yaml_schema` + `get_action_types` as reference
4. `validate_flow` → verify structure before upload
5. `upload_flow` → save to TestMesh (flows appear in dashboard)
6. `trigger_execution` per flow → run all
7. `get_execution` per flow → collect results
8. Report: pass rate, failed flows with step-level detail, coverage improvement

### 3.4 Success Criteria

- All 30 flows upload successfully
- ≥ 90% of flows pass on first execution
- Every TestMesh action type exercised by at least one flow
- `get_coverage_gaps` reports significantly fewer uncovered nodes after the session

---

## Out of Scope

- Cloud dashboard changes
- Agent relay testing
- Non-Docker deployment scenarios for the demo services
- Browser action type (not applicable to backend microservices)
- Multi-language demo services (demo stack stays Go; universality is proven by the analyzer design, not by rewriting services)

---

## Implementation Order

1. Sub-project 1: Demo service extensions (recommendation service + order/product extensions)
2. Sub-project 2a: `discovery.go` + enhanced analyzers
3. Sub-project 2b: 6 new API-connected MCP tools + CLI flags
4. Sub-project 3: Flow generation session (runtime, no code)
