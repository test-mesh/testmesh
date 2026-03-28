# System Graph

The System Graph is a layered, multi-source knowledge model that maps services, APIs, message queues, databases, and their relationships across a distributed system. It powers TestMesh's intelligent features: coverage analysis, graph-aware test execution, smart test generation, and cloud AI agents.

## Quick Start

### Prerequisites

- **Neo4j 5.x** — required for graph functionality. TestMesh runs without it, but graph endpoints return 503.
- **PostgreSQL** — stores graph metadata (nodes, edges, conflicts) in the `graph.` schema.

### Scanning a Repository

```bash
# Scan the current directory
testmesh graph scan

# Scan a specific path
testmesh graph scan /path/to/repo

# Scan a remote repository
testmesh graph scan --url https://github.com/org/repo.git
```

### Viewing the Graph

```bash
# Graph status and statistics
testmesh graph status

# List discovered services
testmesh graph services

# Show a specific node with dependencies
testmesh graph show <node-id>

# Coverage analysis
testmesh graph coverage

# Search nodes
testmesh graph search "user-service"

# Export graph
testmesh graph export --format dot    # Graphviz DOT
testmesh graph export --format mermaid # Mermaid diagram
testmesh graph export --format json   # Full JSON
```

## Architecture

### 6-Layer Model

The graph is built from 6 independent layers, each produced by dedicated scanners:

| Layer | Source | Scanner | Version |
|-------|--------|---------|---------|
| **Code** | Go, TypeScript, Python, Java, C# source files | `code/*_scanner.go` | OSS |
| **Infra** | Dockerfiles, docker-compose, Kubernetes YAML, Terraform, Helm | `infra/scanner.go` | OSS |
| **Spec** | OpenAPI, gRPC proto, AsyncAPI, Avro, GraphQL schemas | `spec/scanner.go` | OSS |
| **Flow** | TestMesh YAML flow definitions | `flow/scanner.go` | OSS |
| **Runtime** | Live execution events (HTTP calls, DB queries, Kafka messages) | `cloud/runtime_scanner.go` | Cloud |
| **History** | Graph snapshots per commit, structural diffs | `cloud/history_scanner.go` | Cloud |

Layers 1-4 are available in OSS (self-hosted). Layers 5-6 require Cloud.

### Dual-Write Storage

- **PostgreSQL** — metadata source of truth. Stores nodes, edges, conflicts, snapshots in the `graph.` schema.
- **Neo4j** — graph structure for traversal queries (paths, dependencies, impact). Rebuildable from PostgreSQL.

### Node Types

Every discovered entity becomes a node:

- `service` — a deployable unit (Go binary, Node.js app, Spring Boot app, etc.)
- `api_endpoint` — an HTTP route (e.g., `POST /api/users`)
- `database` — a database or table
- `topic` — a Kafka/message queue topic
- `grpc_service` / `grpc_method` — gRPC services and methods
- `external` — an external dependency (third-party API, SaaS)

### Edge Types

Relationships between nodes:

- `calls` — service A calls service B's API
- `produces` / `consumes` — topic publish/subscribe
- `reads` / `writes` — database access
- `depends_on` — general dependency
- `tested_by` — flow covers this node

## Code Scanners

Code scanners use AST-level pattern matching (no code execution) to discover services and dependencies.

### Go Scanner
Detects: `http.HandleFunc`, Gin/Echo/Chi routes, `sql.Open`, Sarama/confluent Kafka, gRPC `RegisterXxxServer`/`NewXxxClient`.

### TypeScript Scanner
Detects: Express routes, NestJS decorators (`@Controller`, `@Get`), KafkaJS, TypeORM/Prisma, gRPC.

### Python Scanner
Detects: Flask/FastAPI/Django routes, SQLAlchemy models, confluent-kafka, grpcio.

### Java Scanner
Detects: Spring Boot `@GetMapping`/`@PostMapping`, `@KafkaListener`, JPA `@Entity`, gRPC `ImplBase`/`Stub`, `RestTemplate`. Reads `pom.xml` or `build.gradle` for service name.

### C# Scanner
Detects: ASP.NET `[HttpGet]`/`[ApiController]`, minimal API `MapGet`/`MapPost`, Entity Framework `DbSet<>`/`[Table]`, Confluent.Kafka, gRPC. Reads `.csproj` for service name.

## Merge Engine

When multiple scanners discover the same entity, the merge engine resolves identity and conflicts.

### Identity Resolution Chain

1. **Exact match** — same type + name + service
2. **URL pattern normalization** — `/orders/{id}`, `/orders/:id`, `/orders/<id>` are the same endpoint
3. **Service name fuzzy match** — `my-service`, `my_service`, `myservice` are equivalent

### Layer Precedence

When two layers disagree on a property, the higher-precedence layer wins:

```
runtime (0.95) > code (0.85) > spec (0.80) > infra (0.75) > flow (0.70) > history (0.60)
```

Conflicts are recorded and surfaceable via the API for manual resolution.

### Confidence Scoring

Each node and edge has a confidence score (0.0-1.0). Multi-layer corroboration boosts confidence: +5% per confirming layer, capped at 1.0.

| Classification | Score Range |
|---------------|-------------|
| High          | >= 0.9      |
| Medium        | >= 0.7      |
| Low           | >= 0.5      |
| Very Low      | < 0.5       |

## Graph-Aware YAML DSL

Flows can reference graph entities instead of hardcoding URLs:

```yaml
flow:
  name: "Graph-aware order test"
  graph:
    require:
      - service: order-service
      - service: user-service
    environment: staging
  steps:
    - id: create_user
      action: http_request
      config:
        service: user-service        # Resolved via graph
        endpoint: POST /api/users    # Resolved via graph
        body:
          name: "Test User"
```

### Resolution Precedence

When resolving `service:` and `endpoint:` references:

```
env var > graph environment > infra-layer default > error
```

Environment variables always win. Graph resolution never overrides an explicit env var.

### Graph Requirements

The `graph.require` block validates that required services exist in the graph before execution starts. If a required service is missing, the flow fails fast with a clear error.

## API Reference

All graph endpoints are workspace-scoped: `/api/v1/workspaces/:workspace_id/graph/...`

### Graph Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/graph/scan` | Trigger a full repository scan |
| GET | `/graph/status` | Get graph status and readiness |
| GET | `/graph/stats` | Get node/edge counts, coverage percentage |
| DELETE | `/graph` | Clear all graph data |

### Repository Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/graph/repos` | Connect a repository |
| GET | `/graph/repos` | List connected repositories |
| PUT | `/graph/repos/:id` | Update repository config |
| DELETE | `/graph/repos/:id` | Disconnect a repository |
| POST | `/graph/repos/:id/scan` | Trigger scan for a specific repo |

### Node Queries

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/graph/nodes` | List nodes with filtering |
| GET | `/graph/nodes/:id` | Get node details |
| GET | `/graph/nodes/:id/dependencies` | Get node dependencies (with depth) |
| GET | `/graph/nodes/:id/dependents` | Get nodes that depend on this one |

### Graph Queries

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/graph/paths` | Find paths between two nodes |
| POST | `/graph/search` | Search nodes by name, type, service |
| GET | `/graph/coverage` | Coverage analysis (nodes vs flows) |
| GET | `/graph/contracts` | Inferred producer-consumer contracts |
| GET | `/graph/conflicts` | Merge conflicts pending resolution |
| POST | `/graph/conflicts/:id/resolve` | Resolve a merge conflict |

### Cloud Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/graph/cloud/executions` | Ingest runtime execution events |
| POST | `/graph/cloud/snapshots` | Take a graph snapshot for a commit |
| GET | `/graph/cloud/history` | List graph snapshots |
| GET | `/graph/cloud/diff?from=&to=` | Structural diff between commits |
| POST | `/graph/cloud/impact` | Impact analysis for changed nodes |
| GET | `/graph/cloud/contracts/evolution` | Contract evolution over time |

### AI Agent Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/graph/cloud/agents` | List available AI agents |
| POST | `/graph/cloud/agents/:name` | Run a specific agent |
| POST | `/graph/cloud/agents/orchestrate` | Event-driven agent orchestration |
| POST | `/graph/cloud/confidence` | Score node confidence |

## AI Agents (Cloud)

Nine specialized agents analyze the graph and suggest improvements:

| Agent | Purpose |
|-------|---------|
| **coverage** | Identifies untested nodes, suggests flow generation |
| **diagnosis** | Deep dependency analysis on failing nodes |
| **flakiness** | Detects external dependency flakiness risks |
| **generation** | Suggests test flows for uncovered nodes |
| **impact** | Calculates blast radius of changed nodes |
| **repair** | Diagnoses failing flows via dependency and contract analysis |
| **watch** | Monitors for regressions via snapshot diffs |
| **scheduler_optimizer** | Prioritizes test execution by graph centrality |
| **orchestrator** | Coordinates agents based on system events |

### Running an Agent

```bash
# Via API
curl -X POST /api/v1/workspaces/:ws/graph/cloud/agents/coverage

# With parameters
curl -X POST /api/v1/workspaces/:ws/graph/cloud/agents/diagnosis \
  -d '{"node_id": "uuid-of-failing-node"}'

# Event-driven orchestration
curl -X POST /api/v1/workspaces/:ws/graph/cloud/agents/orchestrate \
  -d '{"event": "graph.updated"}'
```

### Agent Events

The orchestrator responds to three event types:

- `graph.updated` — triggers coverage analysis and conflict detection
- `execution.complete` — triggers flakiness, diagnosis, and repair agents
- `pr.opened` — triggers impact analysis and test generation

## CLI Commands

```
testmesh graph scan [path]       Scan a repository
testmesh graph status            Show graph statistics
testmesh graph services          List discovered services
testmesh graph show <node-id>    Show node details and dependencies
testmesh graph coverage          Coverage analysis
testmesh graph search <query>    Search for nodes
testmesh graph conflicts         List merge conflicts
testmesh graph export            Export graph (--format json|dot|mermaid)
```

Use `--graph` flag with `testmesh run` to enable graph-aware execution:

```bash
testmesh run flow.yaml --graph
```

## Package Structure

```
api/internal/graph/
  engine.go              # Engine interface + Neo4j/PostgreSQL implementation
  models.go              # GraphNode, GraphEdge, Subgraph, etc.
  merge.go               # Merge engine (identity resolution, conflict detection)
  resolver.go            # Graph-aware step resolution for executor
  repo/
    manager.go           # Git repository connection and management
  scanner/
    scanner.go           # Scanner interface
    orchestrator.go      # Runs scanners in dependency order
    code/
      go_scanner.go      # Go code scanner
      typescript_scanner.go
      python_scanner.go
      java_scanner.go
      dotnet_scanner.go
    infra/scanner.go     # Dockerfile, Kubernetes, Terraform, Helm
    spec/scanner.go      # OpenAPI, gRPC, AsyncAPI, Avro, GraphQL
    flow/scanner.go      # TestMesh YAML flows
  cloud/
    runtime_scanner.go   # Live execution event processing
    history_scanner.go   # Graph snapshots and diffs
    handlers.go          # Cloud graph HTTP handlers

api/internal/ai/
  context.go             # AgentContext (shared graph access for agents)
  confidence.go          # Multi-layer confidence scoring
  handler.go             # HTTP handler for AI agent endpoints
  orchestrator_agent.go  # Event-driven agent coordination
  impact_agent.go        # Change blast radius
  repair_agent.go        # Failing flow diagnosis
  flakiness_agent.go     # External dependency detection
  coverage_agent.go      # Untested node identification
  diagnosis_agent.go     # Deep dependency analysis
  generation_agent.go    # Test flow suggestion
  watch_agent.go         # Regression monitoring
  scheduler_optimizer_agent.go  # Test priority by centrality

cli/cmd/
  graph.go               # CLI graph subcommands
```

## Configuration

The graph feature is fully optional. When Neo4j is not configured, all graph endpoints return 503 with setup instructions and all existing features work unchanged.

### Environment Variables

```bash
# Neo4j connection (required for graph features)
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# Repository clone path for remote scanning
GRAPH_REPO_CLONE_PATH=/tmp/testmesh-repos
```

### Docker Compose

```yaml
neo4j:
  image: neo4j:5-community
  ports:
    - "7474:7474"   # Browser
    - "7687:7687"   # Bolt
  environment:
    NEO4J_AUTH: neo4j/password
  volumes:
    - neo4j_data:/data
```
