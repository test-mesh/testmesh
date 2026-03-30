# CLAUDE.md

> **Part of the TestMesh monorepo.** See `../CLAUDE.md` for the full component map (cloud, agent, web/docs).

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TestMesh is a production-ready platform for writing and running end-to-end integration tests across multiple protocols. It's built as a **modular monolith** using Go (backend) and Next.js (frontend), designed to scale from local development to production deployments.

**Core Philosophy**: Tests are defined in human-readable YAML flows that execute actions across HTTP, databases, Kafka, gRPC, WebSocket, and more. The platform handles execution, observability, scheduling, and reporting.

## Repository Structure

```
testmesh/
├── api/              # Go backend (modular monolith - single binary)
│   ├── main.go       # API server entry point
│   ├── internal/     # Internal packages by domain
│   │   ├── api/      # REST API handlers
│   │   ├── runner/   # Test execution engine & action handlers
│   │   ├── scheduler/# Cron-based test scheduling
│   │   ├── storage/  # Data models & repositories
│   │   ├── graph/    # System Graph (scanners, merge engine, Neo4j)
│   │   ├── ai/       # AI agents (coverage, diagnosis, impact, etc.)
│   │   ├── mcp/      # Model Context Protocol (AI integration)
│   │   └── shared/   # Config, database, logging utilities
│   └── cmd/seed/     # Database seeding tool
├── cli/              # CLI tool (standalone Go module)
│   ├── main.go       # Entry point
│   └── cmd/          # Commands: run, debug, generate, watch, etc.
├── dashboard/        # Next.js frontend (port 3000)
├── web/              # Documentation + marketing site (Fumadocs/Next.js, port 3001)
├── agent/            # Self-hosted agent (outbound WebSocket to cloud, executes flows locally)
│   ├── main.go
│   ├── cmd/          # start command
│   └── internal/
│       ├── connection/ # WebSocket connection + reconnect logic
│       └── worker/     # Flow execution workers
├── demo-services/    # Demo microservices for testing
│   ├── user-service/
│   ├── product-service/
│   ├── order-service/
│   └── notification-service/
├── examples/         # Example test flows
└── docs/             # Architecture & feature documentation
```

## Development Commands

### API Server (Go)

```bash
# Run API server locally
cd api
go run main.go

# Build binary
go build -o testmesh-api main.go

# Run with Docker
docker-compose up api

# Seed database with sample data
cd api/cmd/seed
go run main.go

# Run tests
cd api
go test ./...
```

**Environment Variables** (defined in `docker-compose.yml`):
- Viper reads from environment with sensible defaults
- No `.env` file needed - use `docker-compose.yml` or export shell variables
- Key vars: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `REDIS_HOST`

### CLI Tool

```bash
# Run a flow locally
cd cli
go run main.go run ../examples/microservices/e2e-order-flow.yaml

# Available commands
go run main.go --help
# - run        Execute a flow
# - debug      Interactive debugging
# - generate   AI-powered test generation
# - validate   Validate flow YAML
# - watch      Auto-run on file changes
# - chat       Conversational test creation
# - mock       Start mock server
```

### Dashboard (Next.js)

```bash
# Run dashboard locally
cd dashboard
npm install
npm run dev          # Development server on port 3000
npm run build        # Production build
npm run lint         # ESLint

# With Docker
docker-compose up dashboard
```

### Microservices (Demo)

```bash
# Start all microservices + infrastructure
docker-compose up --build \
  postgres redis kafka \
  user-service product-service order-service notification-service

# Health checks
curl http://localhost:5001/health  # User Service
curl http://localhost:5002/health  # Product Service
curl http://localhost:5003/health  # Order Service
curl http://localhost:5004/health  # Notification Service

# Run E2E test against microservices
cd cli
go run main.go run ../examples/microservices/e2e-order-flow.yaml
```

## Architecture: Modular Monolith

The API is a **single Go binary** with clear domain boundaries that can be extracted into microservices later if needed.

### Domain Structure (`api/internal/`)

**api/** - HTTP handlers, WebSocket, middleware
- Exposes REST API on port 5016
- JWT authentication, CORS, rate limiting

**runner/** - Test execution engine
- `executor.go` - Orchestrates flow execution
- `actions/` - Action handlers (http_request, database_query, kafka_producer, etc.)
- Context management for variable passing between steps
- Expression evaluation using `expr-lang/expr`

**scheduler/** - Cron-based scheduling
- Job queue using Redis Streams
- Executes flows on schedule

**storage/** - Database layer
- Models: Flow, Execution, MockServer, Schedule, Environment, etc.
- GORM ORM with PostgreSQL
- Repositories follow pattern: `models/` and domain-specific repos

**mcp/** - Model Context Protocol client
- Calls external MCP servers for AI capabilities
- Used for test generation, analysis, smart assertions

**shared/** - Cross-cutting concerns
- `config/` - Viper-based configuration with AutomaticEnv
- `database/` - PostgreSQL connection, migrations
- `logger/` - Zap structured logging

### Flow Execution Model

1. **Flow Definition** (YAML):
```yaml
flow:
  name: "Test Name"
  steps:
    - id: step1
      action: http_request
      config:
        method: POST
        url: "http://api/users"
        body: { name: "John" }
      assert:
        - status == 201
      output:
        user_id: $.body.id
```

2. **Execution**:
   - CLI or API submits flow → Executor
   - Executor iterates steps, calls action handlers
   - Context stores variables (e.g., `user_id`)
   - Assertions evaluated with expr-lang
   - Results stored in `executions` table

3. **Action Handlers** (`api/internal/runner/actions/`):
   - Each action type has a handler (e.g., `http.go`, `database.go`, `kafka_producer.go`)
   - Handlers implement common interface
   - Can access shared context, parse templates (`{{variable}}`)

## Key Patterns & Conventions

### Flow YAML Structure

Flows use a `flow:` wrapper at root level:
```yaml
flow:
  name: "Flow Name"
  description: "Optional description"
  steps:
    - id: unique_id
      action: action_type
      config: { ... }
      assert: [ ... ]
      output: { ... }
```

### Action Configuration

Each action handler expects specific config structure:
- **http_request**: `method`, `url`, `headers`, `body`, `timeout`
- **database_query**: `connection_string`, `query`, `params`
- **kafka_producer**: `brokers`, `topic`, `key`, `value`
- **kafka_consumer**: `brokers`, `topic`, `group_id`, `timeout`
- **redis_get/set**: `host`, `port`, `key`, `value`, `ttl`

### Microservices Architecture

The demo microservices (`demo-services/`) follow consistent patterns:

**Database**: Each service has its own PostgreSQL schema (e.g., `user_service.users`)
```go
func (User) TableName() string {
    return "user_service.users"
}
```

**Structure**: All services follow same layout:
```
service/
├── main.go           # Server setup, graceful shutdown
├── handlers/         # HTTP handlers
├── models/           # GORM models
├── database/         # DB connection, migrations
├── redis/            # Redis client operations
├── kafka/            # Kafka producer/consumer
└── Dockerfile        # Multi-stage Go build
```

**Dockerfile Pattern**: All use golang:1.23-alpine builder + alpine runtime

### Docker Compose Configuration

**Environment variables** are the single source of truth (no `.env` files):
- Services get env vars from `docker-compose.yml`
- Dashboard gets `NEXT_PUBLIC_*` vars for client-side access
- Microservices use service-specific schemas via `DB_SCHEMA` env var

### External Services Configuration

TestMesh supports both **bundled** (Docker containers) and **external** (managed cloud services) infrastructure:

**Bundled Mode** (default):
- Uses Docker containers for PostgreSQL, Redis, Kafka
- Suitable for local development, testing, demos
- Started via docker-compose

**External Mode** (production):
- Connect to managed services (AWS RDS, ElastiCache, MSK, etc.)
- Configure via environment variables or Helm values
- Required for production deployments

**Environment Variables**:
```bash
# PostgreSQL
DATABASE_HOST=my-rds.us-east-1.rds.amazonaws.com
DATABASE_PORT=5432
DATABASE_USER=testmesh
DATABASE_PASSWORD=secure_password
DATABASE_SSLMODE=require

# Redis
REDIS_HOST=my-cache.cache.amazonaws.com
REDIS_PORT=6379
REDIS_TLS_ENABLED=true

# Kafka (optional)
KAFKA_ENABLED=true
KAFKA_BROKERS=broker1:9092,broker2:9092
KAFKA_SASL_ENABLED=true
KAFKA_TLS_ENABLED=true
```

**Configuration Files**:
- `api/internal/shared/config/config.go` - Viper config with Kafka, Redis TLS support
- `.env.example` - Template with all variables and cloud provider examples
- `deploy/helm/testmesh/values.yaml` - Helm chart with external service options

**Documentation**: See `/docs/deployment/EXTERNAL_SERVICES.md` for:
- Complete environment variable reference
- Cloud provider examples (AWS, GCP, Azure, Confluent)
- SSL/TLS configuration
- Security best practices
- Migration guide from bundled to external services

## Database Schema

**Primary Database**: PostgreSQL (`testmesh` database)

**Main Tables** (in `public` schema):
- `flows` - Test flow definitions
- `executions` - Execution results
- `mock_servers` - Mock server configs
- `schedules` - Cron schedules
- `environments` - Environment configs

**Microservice Schemas** (for demo):
- `user_service.users`
- `product_service.products`
- `order_service.orders`, `order_service.order_items`
- `notification_service.notifications`

## Important Files

**Configuration**:
- `docker-compose.yml` - Single source for all environment configuration
- `api/internal/shared/config/config.go` - Viper config with defaults (includes Kafka, Redis TLS)
- `.env.example` - Environment variable template with cloud provider examples
- `deploy/helm/testmesh/values.yaml` - Helm chart configuration

**Deployment**:
- `deploy/README.md` - Deployment guide for Docker, Kubernetes, Helm
- `deploy/docker-compose/` - Production-ready Docker Compose configurations
- `deploy/kubernetes/` - Kubernetes manifests with Kustomize
- `deploy/helm/testmesh/` - Helm chart for Kubernetes deployments

**Action Handlers**:
- `api/internal/runner/actions/*.go` - Each protocol/action type
- Adding new actions: Implement handler interface, register in executor

**CLI Entry Points**:
- `cli/cmd/run.go` - Local flow execution (parses YAML, executes steps)
- `cli/cmd/generate.go` - AI-powered test generation

**Documentation**:
- `docs/architecture/ARCHITECTURE.md` - Complete system design
- `docs/features/YAML_SCHEMA.md` - Flow definition specification
- `docs/deployment/EXTERNAL_SERVICES.md` - External PostgreSQL/Redis/Kafka configuration
- `demo-services/README.md` - Microservices architecture guide

## Testing Approach

**Unit Tests**: Test individual action handlers, utilities
```bash
cd api
go test ./internal/runner/actions/
```

**Integration Tests**: Use the microservices + test flows
```bash
# Start microservices
docker-compose up postgres redis kafka user-service product-service order-service notification-service

# Run E2E flow
cd cli
go run main.go run ../examples/microservices/e2e-order-flow.yaml
```

**Flow Examples**: `examples/microservices/*.yaml` demonstrate all patterns

## AI Integration (MCP)

TestMesh integrates with AI via Model Context Protocol:
- **MCP Client**: `api/internal/mcp/client.go`
- **Usage**: Flows can call external MCP servers using `mcp_call` action
- **Documentation**: `docs/features/MCP_INTEGRATION.md`

## Common Gotchas

1. **Flow YAML Must Have `flow:` Wrapper**: CLI expects `flow:` at root, not direct `name:` and `steps:`
2. **Go Version**: Services require Go 1.23+ (dependencies need this version)
3. **Kafka Cluster ID**: KRaft mode requires `CLUSTER_ID` env var
4. **PostgreSQL Schemas**: Each microservice creates its own schema on startup (migrations in `database/migrations.go`)
5. **Redis Keys**: Services use namespaced keys (e.g., `user:{id}`, `product:{id}`)

## Making Changes

**Adding a New Action Handler**:
1. Create `api/internal/runner/actions/my_action.go`
2. Implement action handler interface
3. Register in executor's action registry
4. Add config struct and validation
5. Document in `docs/features/YAML_SCHEMA.md`

**Adding a New Microservice**:
1. Copy structure from existing service (e.g., `demo-services/user-service/`)
2. Update `docker-compose.yml` with new service
3. Use unique port and database schema
4. Follow naming: `{service}-service` container, `{service}_service` schema

**Updating Documentation**:
- Architecture changes → `docs/architecture/`
- Feature specs → `docs/features/`
- Keep `docs/README.md` index updated
