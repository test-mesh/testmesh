# System Graph — Design Specification

**Date:** 2026-03-27
**Status:** Approved
**Scope:** OSS + Cloud

---

## Overview

The System Graph is a layered, multi-source knowledge model that maps services, APIs, message queues, databases, and their relationships across a distributed system. It is the architectural backbone for TestMesh's intelligent features — coverage analysis, graph-aware test execution, smart generation, and all cloud AI agents.

The graph is built from 6 layers, each produced by dedicated scanners. Layers 1–4 are OSS (self-hosted). Layers 5–6 are Cloud only.

---

## Design Principles

1. **Layered composition** — each data source is an independent layer with its own scanner. Layers merge into a unified graph via the merge engine.
2. **OSS gets the tools, Cloud gets the intelligence** — self-hosted users can scan repos, visualize dependencies, and check coverage. Cloud adds persistent evolution, runtime behavior, and autonomous agents.
3. **Backward compatible** — existing YAML flows work unchanged. Graph-aware syntax is optional. The graph feature itself is optional — Neo4j is required for graph functionality, but TestMesh runs fully without it. When Neo4j is not configured, all graph endpoints return 503 with setup instructions and all existing features work unchanged.
4. **Environment variables always win** — graph resolution never overrides an explicit env var. The precedence chain: env var > graph environment resolution > infra-layer default > error.
5. **No code execution** — scanners use AST parsing only. No `go run`, `npm install`, or code eval. Repos are read, not executed.

---

## 1. Graph Data Model

### Node Types

Every discovered entity is a node with a shared base structure:

```
BaseNode:
  id:           string (uuid)
  type:         enum
  name:         string
  service:      string (owning service name)
  source_layer: enum (code, infra, spec, flow, runtime, history)
  source_file:  string (file path that produced this node)
  repo_id:      string
  workspace_id: string
  metadata:     map
  tags:         []string
  embedding:    vector (pgvector — for semantic search, dimension configured per provider)
  confidence:   float (0–1)
  created_at:   timestamp
  updated_at:   timestamp
```

| Type | What it represents | Example |
|------|-------------------|---------|
| `service` | A deployable service/app | `order-service`, `payment-api` |
| `api_endpoint` | A specific route | `POST /api/v1/orders` |
| `topic` | Kafka/RabbitMQ topic | `order.created`, `payment.failed` |
| `queue` | Message queue | `email-notifications` |
| `database` | Database instance | `postgres://orders-db` |
| `table` | Database table/collection | `order_service.orders` |
| `external` | Third-party service | `Stripe API`, `SendGrid` |
| `grpc_method` | gRPC service method | `PaymentService.Charge` |
| `websocket` | WebSocket endpoint | `ws://notifications/stream` |
| `redis_key_pattern` | Redis key namespace | `user:{id}`, `session:*` |
| `job` | Cron job / background worker | `nightly-cleanup` |
| `environment` | Deployment environment | `staging`, `production` |

### Edge Types

Edges are directional and typed:

| Edge Type | Meaning | Example |
|-----------|---------|---------|
| `calls` | Synchronous invocation | `order-service` → `payment-service` |
| `publishes` | Produces message | `order-service` → `order.created` |
| `consumes` | Subscribes to message | `notification-service` ← `order.created` |
| `reads` | Reads from data store | `order-service` → `orders` table |
| `writes` | Writes to data store | `order-service` → `orders` table |
| `depends_on` | Runtime dependency | `order-service` → `postgres` |
| `exposes` | Service exposes endpoint | `order-service` → `POST /orders` |
| `triggers` | Causes downstream action | `order.created` → `send-notification` job |
| `tested_by` | Flow covers this node | `POST /orders` → `checkout-flow` |
| `resolves_to` | Environment resolution | `{{ORDER_SERVICE_URL}}` → `http://order:5003` |

```
Edge:
  id:           string
  type:         enum
  from:         node_id
  to:           node_id
  source_layer: enum
  properties:   map (method, headers, auth type, etc.)
  confidence:   float (0–1)
  created_at:   timestamp
```

The `confidence` field scores certainty: code-layer edges are 1.0, runtime-layer edges are scored by observation frequency, LLM-inferred edges start lower.

### Derived Structures (computed, not stored)

**SystemFlow** — a traversable path through the graph:

```
entry: POST /api/v1/orders
path:  api_endpoint → service → topic → service → table
nodes: [POST /orders, order-service, order.created, payment-service, payments]
```

**Contract** — inferred agreement between two services:

```
producer:     order-service
consumer:     payment-service
via:          order.created (topic)
schema:       { order_id: string, amount: number, currency: string }
expectations: { latency: <500ms, retries: 3 }
```

### Storage

| Store | What | Why |
|-------|------|-----|
| Neo4j | Nodes + edges (graph structure) | Fast traversal, path queries, impact analysis |
| PostgreSQL | Node metadata, repo configs, scan history | Relational data, joins with existing tables |
| pgvector | Node embeddings, code chunk embeddings | Semantic search |

---

## 2. Scanner Architecture

Each layer has a dedicated scanner producing nodes + edges in a common format. The graph engine is source-agnostic.

### Scanner Interface

```go
type ScannerOutput struct {
    Nodes    []GraphNode
    Edges    []GraphEdge
    Warnings []ScanWarning
}

type Scanner interface {
    Scan(ctx context.Context, input ScanInput) (*ScannerOutput, error)
    ScanDiff(ctx context.Context, input DiffInput) (*ScannerOutput, error)
    Capabilities() ScannerCapabilities
}

type ScanInput struct {
    RepoPath     string
    RepoID       string
    WorkspaceID  string
    Config       ScannerConfig
}

type DiffInput struct {
    ScanInput
    ChangedFiles  []string
    PreviousGraph *ScannerOutput
}
```

### Layer 1: Code Scanners

5 language-specific scanners using Tree-sitter for AST parsing.

**What they detect:**

| Pattern | How detected | Nodes/Edges produced |
|---------|-------------|---------------------|
| HTTP routes | Framework decorators/registrations | `api_endpoint` + `exposes` edge |
| HTTP client calls | `http.Get`, `fetch()`, `requests.post()` | `calls` edge |
| Kafka producer | `producer.send(topic)` | `publishes` edge to `topic` |
| Kafka consumer | `consumer.subscribe(topic)` | `consumes` edge from `topic` |
| DB queries | SQL strings, ORM models | `reads`/`writes` edges to `table` |
| gRPC definitions | `.proto` files, generated clients | `grpc_method` + `calls` edges |
| Redis operations | GET/SET/DEL with key patterns | `redis_key_pattern` nodes |
| WebSocket | Upgrade handlers, socket connections | `websocket` nodes |
| External HTTP calls | Calls to non-internal URLs | `external` + `calls` edges |
| Service metadata | `main.go`, `package.json`, Dockerfile | `service` node |

**Language coverage:**

- **Go** — Gin, Echo, Chi, Fiber, net/http, Sarama, confluent-kafka-go, GORM, sqlx, gRPC
- **Node.js/TypeScript** — Express, Fastify, NestJS, Next.js API routes, KafkaJS, Prisma, Sequelize, TypeORM, gRPC
- **Python** — FastAPI, Django, Flask, confluent-kafka, aiokafka, SQLAlchemy, Django ORM, gRPC
- **Java/Kotlin** — Spring Boot (@RestController, @KafkaListener, JPA), Micronaut
- **C#/.NET** — ASP.NET ([ApiController], minimal APIs), Entity Framework Core, Confluent.Kafka, gRPC

**Fallback heuristics (all languages):** regex for URLs, connection strings, topic names; import analysis for SDK detection; string literal analysis.

### Layer 2: Infra Scanner

Single scanner, multiple format parsers:

- **Docker Compose** — service names, ports, depends_on, env vars, networks
- **Kubernetes** — Deployments, Services, Ingress, ConfigMaps, Secrets, CronJobs
- **Terraform** — AWS/GCP/Azure resources (ECS, Lambda, RDS, ElastiCache, MSK), security groups, IAM
- **Helm** — values.yaml extraction, template detection, subchart dependencies

### Layer 3: Spec Scanner

Parses API specifications and schema registries:

- **OpenAPI/Swagger** → `api_endpoint` nodes with request/response schemas
- **gRPC .proto files** → `grpc_method` nodes with message types
- **AsyncAPI** → event channels, message shapes
- **Avro/JSON Schema** (Kafka schema registry) → topic schema enrichment
- **GraphQL schemas** → query/mutation/subscription nodes

### Layer 4: Flow Scanner

Parses existing YAML flows:

- Each step → matched to graph nodes (by URL, topic, connection string, or graph reference)
- Creates `tested_by` edges
- Detects env var references → `resolves_to` edges
- Identifies untested nodes (coverage gaps)
- Parses assertions → enriches contract data

### Layer 5: Runtime Scanner (Cloud only)

Processes execution results:

- Observed response shapes → validates/enriches spec schemas
- Timing data → latency baselines per edge
- Error patterns → failure rate annotations
- Discovered endpoints (redirects, dynamic routes) → new nodes
- OpenTelemetry traces → validates declared vs observed call paths

### Layer 6: History Scanner (Cloud only)

Tracks graph changes over time:

- Git commit → graph diff
- Graph snapshots per commit/PR
- Powers Impact Agent (PR diff → affected graph nodes → affected flows)
- Contract evolution tracking

### Scan Orchestration

Scanners run in dependency order:

```
1. Infra Scanner      → discovers services, ports, networks
2. Spec Scanner       → discovers APIs, schemas, contracts
3. Code Scanners      → discovers implementation, wires to infra/spec nodes
4. Flow Scanner       → maps flows to discovered nodes
5. Runtime Scanner    → enriches with observed behavior [Cloud]
6. History Scanner    → tracks changes over time [Cloud]
```

### Where Scanners Run

| Context | Where |
|---------|-------|
| CLI `testmesh scan` | Local machine, results push to API |
| Git URL clone (OSS) | API server, clones to temp dir |
| GitHub/GitLab App (Cloud) | Cloud workers, webhook-triggered |
| Incremental re-scan | ScanDiff with changed files from push |
| Flow save/edit | Flow Scanner on single changed flow |
| Execution complete | Runtime Scanner on results [Cloud] |

---

## 3. Graph Engine & Merge Logic

### Node Identity Resolution

Nodes matched across layers using a priority chain:

1. **Exact match** — same type + same unique identifier
2. **Pattern match** — URL template matches concrete URL (e.g., `/orders/{id}` = `/orders/:id`)
3. **Semantic match** — pgvector similarity > 0.9 on embeddings
4. **Manual link** — user maps nodes in dashboard

### Merge Precedence

When nodes match, properties merge with precedence:

```
runtime > code > spec > infra > flow > history
```

### Edge Merge Rules

- Same from + to + type → merge, combine properties
- Conflicting edges → keep both, flag as conflict
- Runtime edges override declared edges for confidence scoring

### Graph Query Interface

```go
type GraphEngine interface {
    // Node queries
    GetNode(ctx context.Context, id string) (*GraphNode, error)
    FindNodes(ctx context.Context, filter NodeFilter) ([]GraphNode, error)
    SearchNodes(ctx context.Context, query string) ([]GraphNode, error)

    // Traversal
    GetDependencies(ctx context.Context, nodeID string, depth int) (*Subgraph, error)
    GetDependents(ctx context.Context, nodeID string, depth int) (*Subgraph, error)
    FindPaths(ctx context.Context, from, to string) ([]GraphPath, error)

    // Flow-oriented
    GetFlowsForNode(ctx context.Context, nodeID string) ([]Flow, error)
    GetUncoveredNodes(ctx context.Context, workspaceID string) ([]GraphNode, error)
    GetSystemFlows(ctx context.Context, entryID string) ([]SystemFlow, error)

    // Impact analysis
    GetImpact(ctx context.Context, changedNodes []string) (*ImpactReport, error)

    // Contracts
    GetContracts(ctx context.Context, serviceID string) ([]Contract, error)
    ValidateContract(ctx context.Context, contractID string, against *ScannerOutput) ([]Violation, error)

    // Metadata
    GetGraphStats(ctx context.Context, workspaceID string) (*GraphStats, error)
    GetMergeConflicts(ctx context.Context, workspaceID string) ([]MergeConflict, error)
}
```

### Key Cypher Queries

```cypher
-- Dependencies (2 hops)
MATCH path=(s:Node {id: $nodeId})-[:calls|publishes|reads|writes|depends_on*1..2]->(dep)
RETURN path

-- Dependents (reverse)
MATCH path=(dep)-[:calls|publishes|consumes|reads*1..2]->(s:Node {id: $nodeId})
RETURN DISTINCT dep

-- Shortest path
MATCH path=shortestPath((a:Node {id: $from})-[*..10]->(b:Node {id: $to}))
RETURN path

-- System flows from entry point
MATCH path=(entry:Node {id: $entryId})-[:calls|publishes|consumes|writes*]->(term)
WHERE NOT (term)-[:calls|publishes]->()
RETURN path

-- Impact: changed nodes → affected flows
MATCH (changed:Node) WHERE changed.id IN $changedIds
MATCH (changed)<-[:calls|consumes|reads*1..3]-(affected)
MATCH (affected)<-[:tested_by]-(flow)
RETURN DISTINCT flow, affected, changed

-- Uncovered nodes
MATCH (n:Node {workspace_id: $wsId})
WHERE n.type IN ['api_endpoint', 'topic', 'grpc_method']
AND NOT (n)<-[:tested_by]-()
RETURN n
```

### Update Pipeline

```
Scanner Output → Merge Engine → Graph Writer → Post-Update Hooks
                                    │
                                    ├─► Upsert nodes/edges to Neo4j
                                    ├─► Update metadata in PostgreSQL
                                    ├─► Generate embeddings → pgvector
                                    ├─► Record scan history
                                    │
                                Post-Update:
                                    ├─► Re-run Flow Scanner (coverage changed?)
                                    ├─► Emit "graph.updated" WebSocket event
                                    ├─► [Cloud] Trigger Impact Agent
                                    ├─► [Cloud] Update History Layer
                                    └─► [Cloud] Notify Watch Agent
```

### Caching

- Neo4j is source of truth
- Redis caches frequent subgraphs (dependency trees, impact results)
- Invalidated on graph update per workspace

### OSS vs Cloud Engine Capabilities

| Capability | OSS | Cloud |
|-----------|-----|-------|
| Full scan (layers 1–4) | ✅ | ✅ |
| Incremental scan (diff) | ✅ | ✅ |
| Node/edge CRUD | ✅ | ✅ |
| Traversal queries | ✅ | ✅ |
| Semantic search (pgvector) | ✅ | ✅ |
| Coverage gap detection | ✅ | ✅ |
| Merge conflict resolution | ✅ | ✅ |
| Runtime layer | ❌ | ✅ |
| History layer | ❌ | ✅ |
| Impact analysis (PR → flows) | ❌ | ✅ |
| Contract evolution | ❌ | ✅ |

---

## 4. YAML DSL Extensions

### Existing Syntax (unchanged)

```yaml
flow:
  name: "Checkout Flow"
  steps:
    - id: create_order
      action: http_request
      config:
        method: POST
        url: "{{ORDER_SERVICE_URL}}/api/v1/orders"
        body:
          product_id: "{{product_id}}"
      assert:
        - status == 201
      output:
        order_id: $.body.id
```

### Graph-Aware Syntax (new, optional)

```yaml
flow:
  name: "Checkout Flow"
  graph:
    require:
      - service: order-service
      - service: payment-service
      - topic: order.created
    environment: staging
    validate_contracts: true
  steps:
    - id: create_order
      action: http_request
      config:
        method: POST
        service: order-service
        endpoint: POST /api/v1/orders
        body:
          product_id: "{{product_id}}"
      assert:
        - status == 201
      output:
        order_id: $.body.id
```

### Resolution Precedence

```
1. Explicit env var ({{ORDER_SERVICE_URL}})     ← always wins
2. Environment-scoped graph resolution           ← graph knows staging vs prod
3. Infra-layer default (Docker/K8s service name) ← fallback
4. Error with helpful message                    ← nothing found
```

### Graph Block

- **`require`** — list graph node dependencies. Executor validates all exist before running. Fails fast with clear error.
- **`environment`** — which environment to resolve for. Works alongside existing env vars.
- **`validate_contracts`** — check request/response shapes against graph schemas before executing.

### Mixed Syntax

Old and new coexist in the same flow. Graph-resolved steps and hardcoded steps interleave freely.

### Executor Changes

Minimal — 3 touch points:

1. Before step dispatch: check for graph references → call `GraphResolver.ResolveStep()`
2. `GraphResolver` fills concrete values → action handlers unchanged
3. [Cloud] After step execution: feed result to Runtime Scanner

---

## 5. API Endpoints

### OSS Endpoints

**Graph Management:**

```
POST   /api/v1/workspaces/:id/graph/scan
POST   /api/v1/workspaces/:id/graph/scan/incremental
GET    /api/v1/workspaces/:id/graph/status
DELETE /api/v1/workspaces/:id/graph
```

**Repo Connections:**

```
POST   /api/v1/workspaces/:id/graph/repos
GET    /api/v1/workspaces/:id/graph/repos
PUT    /api/v1/workspaces/:id/graph/repos/:repo_id
DELETE /api/v1/workspaces/:id/graph/repos/:repo_id
POST   /api/v1/workspaces/:id/graph/repos/:repo_id/scan
```

**Graph Queries:**

```
GET    /api/v1/workspaces/:id/graph/nodes
GET    /api/v1/workspaces/:id/graph/nodes/:node_id
GET    /api/v1/workspaces/:id/graph/nodes/:node_id/dependencies
GET    /api/v1/workspaces/:id/graph/nodes/:node_id/dependents
GET    /api/v1/workspaces/:id/graph/paths
POST   /api/v1/workspaces/:id/graph/search
```

**Coverage & Contracts:**

```
GET    /api/v1/workspaces/:id/graph/coverage
GET    /api/v1/workspaces/:id/graph/contracts
GET    /api/v1/workspaces/:id/graph/conflicts
POST   /api/v1/workspaces/:id/graph/nodes/:node_id/link
GET    /api/v1/workspaces/:id/graph/stats
```

### Cloud-Only Endpoints

```
POST   /api/v1/workspaces/:id/graph/impact
GET    /api/v1/workspaces/:id/graph/history
GET    /api/v1/workspaces/:id/graph/history/:commit
GET    /api/v1/workspaces/:id/graph/contracts/:id/evolution
POST   /api/v1/workspaces/:id/graph/repos/github
POST   /api/v1/workspaces/:id/graph/repos/gitlab
POST   /api/v1/webhooks/graph/github
POST   /api/v1/webhooks/graph/gitlab
```

---

## 6. Dashboard Integration

### New Pages (OSS)

| Page | Purpose |
|------|---------|
| `/graph` | Interactive system graph visualization |
| `/graph/services/[id]` | Service detail (endpoints, topics, DBs, dependencies, coverage) |
| `/graph/coverage` | Coverage dashboard (tested vs untested nodes) |
| `/graph/contracts` | Inferred contracts between services |
| `/graph/repos` | Repository connections and scan management |
| `/graph/conflicts` | Merge conflict resolution UI |

### New Pages (Cloud)

| Page | Purpose |
|------|---------|
| `/graph/impact` | PR impact analysis (affected nodes + flows) |
| `/graph/history` | Graph timeline (changes over time) |

### Enhancements to Existing Pages

| Page | Enhancement |
|------|------------|
| Flow editor | Autocomplete service/endpoint/topic from graph |
| Flow editor | Real-time validation of graph references |
| Execution detail | Graph path visualization for executed flow |
| AI generation | "Generate from graph" for uncovered nodes |
| Schedules | Graph coverage per scheduled flow |
| Analytics | Coverage % as top-level metric |
| Mock servers | "Mock this service" from graph nodes |

---

## 7. CLI & MCP Extensions

### CLI Commands

```bash
testmesh graph scan [path]                # Scan local repo
testmesh graph scan --url <git-url>       # Clone and scan remote
testmesh graph status                     # Graph stats
testmesh graph services                   # List services
testmesh graph show <node-id>             # Node detail + dependencies
testmesh graph coverage                   # Coverage report
testmesh graph search "query"             # Semantic search
testmesh graph conflicts                  # List conflicts
testmesh graph export [--format]          # Export as JSON/DOT/Mermaid

# Enhanced existing commands
testmesh run flow.yaml --graph            # Graph-aware execution
testmesh validate flow.yaml --graph       # Check graph references
testmesh generate "prompt" --graph        # Graph-context generation
```

### MCP Tools

```
graph_scan, graph_services, graph_dependencies, graph_coverage,
graph_generate, graph_impact, graph_search
```

---

## 8. Cloud Agent Integration

The graph is the shared brain for all 9 cloud agents. Each receives a `GraphEngine` via `AgentContext`.

### Agent → Graph Usage

| Agent | Primary Graph Queries |
|-------|----------------------|
| Orchestrator | GetImpact, GetUncoveredNodes, GetGraphStats |
| Impact | GetDependents (ripple effect), GetFlowsForNode |
| Repair | GetNode (context), GetDependencies (root cause), GetContracts (drift) |
| Flakiness | GetDependencies (external services), Runtime Layer (latency data) |
| Coverage | GetUncoveredNodes, GetSystemFlows (untested paths) |
| Diagnosis | GetDependencies (full path), History Layer (recent changes) |
| Generation | GetNode (schemas), FindNodes (existing patterns), GetUncoveredNodes |
| Watch | GetDependencies (regression scope), History Layer (deployment correlation) |
| Schedule Optimizer | GetGraphStats (centrality), GetFlowsForNode (redundancy) |

### Event Flow

```
Graph Updated → Orchestrator, Coverage Agent, Watch Agent
Execution Complete → Runtime Scanner, Flakiness, Diagnosis, Repair
PR Opened → Code Scanner (incremental), Impact Agent, Generation Agent
```

---

## 9. Package Structure

### OSS (`api/internal/`)

```
api/internal/
├── graph/                              # NEW: graph engine core
│   ├── engine.go                       # GraphEngine interface + implementation
│   ├── merge.go                        # Merge engine
│   ├── identity.go                     # Node identity resolution
│   ├── models.go                       # GraphNode, GraphEdge, Contract, etc.
│   ├── neo4j.go                        # Neo4j client
│   ├── embeddings.go                   # pgvector read/write
│   ├── cache.go                        # Redis caching
│   ├── resolve.go                      # Graph-aware flow resolution
│   ├── stats.go                        # Coverage %, node counts
│   │
│   ├── scanner/                        # Scanner framework
│   │   ├── scanner.go                  # Scanner interface
│   │   ├── orchestrator.go             # Runs scanners, feeds merge engine
│   │   ├── diff.go                     # Git diff parsing
│   │   ├── code/                       # Language scanners
│   │   │   ├── go_scanner.go
│   │   │   ├── typescript_scanner.go
│   │   │   ├── python_scanner.go
│   │   │   ├── java_scanner.go
│   │   │   ├── dotnet_scanner.go
│   │   │   ├── detector.go             # Language/framework auto-detection
│   │   │   └── patterns/              # Framework-specific patterns
│   │   ├── infra/                      # Docker Compose, K8s, Terraform, Helm
│   │   ├── spec/                       # OpenAPI, gRPC, AsyncAPI, Avro, GraphQL
│   │   └── flow/                       # YAML flow → tested_by edges
│   │
│   └── repo/                           # Repository connection management
│       ├── manager.go
│       ├── git.go                      # Clone, pull, diff
│       └── webhook.go                  # Push-triggered scan
│
├── api/handlers/graph.go               # NEW: /graph/* HTTP handlers
├── runner/graph_resolver.go            # NEW: graph reference resolution
└── shared/database/neo4j.go            # NEW: Neo4j connection pool
```

### Cloud (`api/internal/`)

```
cloud/api/internal/
├── graph/                              # Cloud graph extensions
│   ├── runtime_scanner.go              # Layer 5: execution → graph
│   ├── history_scanner.go              # Layer 6: graph diffs over time
│   ├── impact_queries.go               # Advanced Cypher for PR impact
│   ├── contract_evolution.go           # Contract change tracking
│   └── handlers.go                     # Cloud graph API handlers
│
└── ai/                                 # Cloud AI agents
    ├── orchestrator.go                 # Agent 1
    ├── impact.go                       # Agent 2
    ├── repair.go                       # Agent 3
    ├── flakiness.go                    # Agent 4 (enhanced)
    ├── coverage.go                     # Agent 5
    ├── diagnosis.go                    # Agent 6
    ├── generation.go                   # Agent 7
    ├── watch.go                        # Agent 8
    ├── scheduler_optimizer.go          # Agent 9
    ├── context.go                      # AgentContext
    └── confidence.go                   # Confidence scoring
```

### Existing Go Backend Touch Points (3 files)

1. `api/internal/runner/executor.go` — add graph resolution step before action dispatch
2. `api/internal/api/routes.go` — add `/graph/*` route group
3. `api/main.go` — initialize Neo4j, GraphEngine, pass to router/executor

Note: the dashboard requires 6 new pages and 7 enhancements to existing pages (see Section 6). The CLI adds ~12 new commands (see Section 7). The "3 touch points" refers only to modifications of existing Go backend files — all other code is additive.

---

## 10. Infrastructure

### PostgreSQL Schema Additions

```sql
CREATE EXTENSION IF NOT EXISTS vector;

-- Repos first (referenced by graph_nodes)
CREATE TABLE graph_repos (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id     UUID NOT NULL,
    name             TEXT NOT NULL,
    url              TEXT,
    branch           TEXT DEFAULT 'main',
    credentials      JSONB,  -- encrypted with ENCRYPTION_KEY
    scan_config      JSONB DEFAULT '{}',
    last_scan_at     TIMESTAMPTZ,
    last_scan_status TEXT DEFAULT 'pending',
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Embedding dimension is configurable per workspace via graph_config.
-- Default 1536 (OpenAI text-embedding-3-small). Ollama models may use
-- 384, 768, or 1024. Set dimension before first scan; changing later
-- requires re-generating all embeddings.
CREATE TABLE graph_config (
    workspace_id       UUID PRIMARY KEY,
    embedding_dimension INT DEFAULT 1536,
    embedding_provider  TEXT DEFAULT 'openai',
    created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE graph_nodes (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    neo4j_id     TEXT NOT NULL,
    type         TEXT NOT NULL,
    name         TEXT NOT NULL,
    service      TEXT,
    source_layer TEXT NOT NULL,
    source_file  TEXT,
    repo_id      UUID REFERENCES graph_repos(id),
    metadata     JSONB DEFAULT '{}',
    tags         TEXT[] DEFAULT '{}',
    embedding    vector,  -- dimension set per graph_config
    confidence   FLOAT DEFAULT 1.0,
    version      INT DEFAULT 1,  -- optimistic concurrency for merge engine
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE graph_edges (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    neo4j_id     TEXT NOT NULL,
    type         TEXT NOT NULL,
    from_node    UUID NOT NULL REFERENCES graph_nodes(id),
    to_node      UUID NOT NULL REFERENCES graph_nodes(id),
    source_layer TEXT NOT NULL,
    properties   JSONB DEFAULT '{}',
    confidence   FLOAT DEFAULT 1.0,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE graph_scans (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id   UUID NOT NULL,
    repo_id        UUID REFERENCES graph_repos(id),
    type           TEXT NOT NULL,
    status         TEXT DEFAULT 'running',
    layers_scanned TEXT[] DEFAULT '{}',
    nodes_added    INT DEFAULT 0,
    nodes_updated  INT DEFAULT 0,
    edges_added    INT DEFAULT 0,
    conflicts      INT DEFAULT 0,
    warnings       JSONB DEFAULT '[]',
    started_at     TIMESTAMPTZ DEFAULT NOW(),
    completed_at   TIMESTAMPTZ,
    duration_ms    INT
);

CREATE TABLE graph_conflicts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    node_a       UUID REFERENCES graph_nodes(id),  -- null for edge-only conflicts
    node_b       UUID REFERENCES graph_nodes(id),  -- null for edge-only conflicts
    edge_a       UUID REFERENCES graph_edges(id),  -- null for node-only conflicts
    edge_b       UUID REFERENCES graph_edges(id),  -- null for node-only conflicts
    type         TEXT NOT NULL,  -- duplicate, contradiction, missing_in_layer
    resolution   TEXT DEFAULT 'pending',  -- pending, auto_merged, user_resolved, dismissed
    details      JSONB DEFAULT '{}',
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    resolved_at  TIMESTAMPTZ
);
```

### Dual-Write Consistency (Neo4j + PostgreSQL)

The graph is stored in both Neo4j (traversal) and PostgreSQL (metadata, embeddings, relational joins). Consistency strategy:

1. **PostgreSQL is the source of truth for metadata.** Neo4j is the source of truth for graph structure (nodes, edges, traversal).
2. **Write order:** PostgreSQL first, then Neo4j. If PostgreSQL write succeeds but Neo4j fails, the scan is marked as `failed` and can be retried. The partial Neo4j state is cleaned up on retry (idempotent upserts).
3. **Neo4j is rebuildable.** If Neo4j data is lost or corrupted, the graph can be fully reconstructed from PostgreSQL records + a re-scan. Neo4j stores no data that cannot be regenerated.
4. **No distributed transactions.** The two stores are eventually consistent within a single scan operation. Scans are workspace-scoped and serialized (one scan per workspace at a time), eliminating concurrent write conflicts.
5. **Health check:** The graph engine periodically verifies node counts match between Neo4j and PostgreSQL. Mismatches trigger a warning in the system health dashboard.

### Docker Compose

```yaml
neo4j:
  image: neo4j:5-community
  ports:
    - "${NEO4J_HTTP_PORT:-7474}:7474"
    - "${NEO4J_BOLT_PORT:-7687}:7687"
  environment:
    NEO4J_AUTH: "neo4j/${NEO4J_PASSWORD:-testmesh}"
    NEO4J_PLUGINS: '["apoc"]'
    NEO4J_server_memory_heap_max__size: "512m"
  volumes:
    - neo4j_data:/data
```

### Go Dependencies

```
github.com/neo4j/neo4j-go-driver/v5
github.com/smacker/go-tree-sitter
github.com/pgvector/pgvector-go
github.com/hashicorp/hcl/v2
github.com/pb33f/libopenapi
github.com/bufbuild/protocompile
```

### Graceful Degradation

If Neo4j is not configured (`NEO4J_URI` empty):

- Graph API endpoints return 503 with setup instructions
- Dashboard graph pages show setup guide
- Flow execution works unchanged (graph resolution skipped)
- All existing functionality unaffected

### Embedding Providers

Uses existing AI provider config:

- OpenAI `text-embedding-3-small` (if API key configured)
- Ollama local models (for offline/self-hosted)
- No provider → semantic search disabled, exact/pattern matching only

---

## 11. Security

### Repository Credentials

- Encrypted at rest with AES-256-GCM using existing `ENCRYPTION_KEY`
- Decrypted only at scan time, in memory only
- Cloud GitHub/GitLab App: OAuth tokens managed by provider, no user credentials stored

### Scanner Sandboxing

- AST parsing only — no code execution
- Clone timeout: 5 minutes
- Repo size limit: 2GB
- File count limit: 100,000
- File size limit: 10MB per file
- Default ignore: `.git`, `node_modules`, `vendor`, `dist`, `build`, `__pycache__`

### Sensitive Data Redaction

- Connection strings: host + port + db stored, credentials stripped
- Env var values: variable name stored, never the value
- Hardcoded secrets: detected, flagged as warning, not stored in graph
- Request body schemas extracted, literal values stripped

### Access Control

- OSS: workspace-scoped isolation, existing JWT middleware
- Cloud: org-level isolation, RBAC (admin manages repos, member views graph), audit logging
- Neo4j: internal only, workspace_id filtering at application layer

---

## 12. Build Phases

| Phase | What | Depends On | Version |
|-------|------|-----------|---------|
| 1 | Foundation (Neo4j, models, engine, schema) | — | OSS |
| 2 | Scanner framework + Infra/Spec/Flow scanners | 1 | OSS |
| 3 | Graph API + Dashboard | 2 | OSS |
| 4 | Code scanners (Go, TS, Python, Java, C#) | 2 | OSS |
| 5 | Merge engine + conflict resolution | 4 | OSS |
| 6 | Graph-aware DSL + executor integration | 5 | OSS |
| 7 | CLI commands + MCP tools | 3, 6 | OSS |
| 8 | Terraform + Helm scanners | 2 | OSS |
| 9 | Git integration (clone, webhooks) | 3 | OSS |
| 10 | Cloud graph (runtime, history, GitHub/GitLab App) | 9 | Cloud |
| 11 | Cloud agents (Impact → Repair → Flakiness → Diagnosis → Coverage → Orchestrator → Generation → Watch → Schedule Optimizer) | 10 | Cloud |
| 12 | Documentation + distribution | All | Both |

Documentation should be written alongside each phase, not deferred to phase 12. Phase 12 is for comprehensive reference docs and public-facing content.

---

## Feature Matrix Summary

| Feature | OSS | Cloud |
|---------|:---:|:-----:|
| Graph data model (Neo4j + pgvector) | ✅ | ✅ |
| Code scanning (5 languages) | ✅ | ✅ |
| Infra scanning (Docker, K8s, Terraform, Helm) | ✅ | ✅ |
| Spec scanning (OpenAPI, gRPC, AsyncAPI, Avro, GraphQL) | ✅ | ✅ |
| Flow scanning (coverage mapping) | ✅ | ✅ |
| Merge engine + conflict resolution | ✅ | ✅ |
| Graph-aware YAML DSL | ✅ | ✅ |
| Dashboard graph visualization | ✅ | ✅ |
| Coverage analysis | ✅ | ✅ |
| Contract inference | ✅ | ✅ |
| Semantic search (pgvector) | ✅ | ✅ |
| CLI graph commands | ✅ | ✅ |
| MCP graph tools | ✅ | ✅ |
| Repo connection (Git URL + CLI scan) | ✅ | ✅ |
| Runtime layer (execution → graph) | ❌ | ✅ |
| History layer (graph diffs over time) | ❌ | ✅ |
| Impact analysis (PR → affected flows) | ❌ | ✅ |
| Contract evolution tracking | ❌ | ✅ |
| GitHub/GitLab App (one-click) | ❌ | ✅ |
| Auto re-scan on push | ❌ | ✅ |
| All 9 AI agents | ❌ | ✅ |
