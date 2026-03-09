# Modular Monolith Architecture

## Overview

TestMesh v1.0 uses a **modular monolith** architecture: a single Go service organized into domain modules with clear boundaries. This approach provides simplicity for initial development while maintaining a clean structure for future microservices extraction if needed.

**Philosophy**: Start simple, scale when necessary.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        TestMesh Server                          │
│                       (Single Go Binary)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                   API Domain                           │    │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────────────┐  │    │
│  │  │ REST API │  │ WebSocket│  │ Authentication     │  │    │
│  │  │ Handlers │  │ Server   │  │ & Authorization    │  │    │
│  │  └──────────┘  └──────────┘  └────────────────────┘  │    │
│  └──────────┬─────────────────────────────────────────────┘    │
│             │ (direct calls)                                    │
│  ┌──────────▼─────────────────────────────────────────────┐    │
│  │              Scheduler Domain                          │    │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────────────┐  │    │
│  │  │ Cron     │  │ Job      │  │ Worker Pool        │  │    │
│  │  │ Scheduler│  │ Queue    │  │ Management         │  │    │
│  │  └──────────┘  └──────────┘  └────────────────────┘  │    │
│  └──────────┬─────────────────────────────────────────────┘    │
│             │ (queue jobs)                                      │
│  ┌──────────▼─────────────────────────────────────────────┐    │
│  │               Runner Domain                            │    │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────────────┐  │    │
│  │  │ Execution│  │ Action   │  │ Assertion          │  │    │
│  │  │ Engine   │  │ Handlers │  │ Engine             │  │    │
│  │  └──────────┘  └──────────┘  └────────────────────┘  │    │
│  └──────────┬─────────────────────────────────────────────┘    │
│             │ (direct calls)                                    │
│  ┌──────────▼─────────────────────────────────────────────┐    │
│  │              Storage Domain                            │    │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────────────┐  │    │
│  │  │ Flow     │  │ Execution│  │ Metrics            │  │    │
│  │  │ Store    │  │ Store    │  │ Store              │  │    │
│  │  └──────────┘  └──────────┘  └────────────────────┘  │    │
│  └──────────┬─────────────────────────────────────────────┘    │
│             │                                                   │
│  ┌──────────▼─────────────────────────────────────────────┐    │
│  │               Shared Layer                             │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────┐ │    │
│  │  │ Database │  │  Redis   │  │ Redis Streams │  │Logger │ │    │
│  │  │  Client  │  │  Client  │  │  Client  │  │       │ │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └───────┘ │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
        ┌────────────────────────────────────────┐
        │   External Infrastructure              │
        │  ┌──────────┐  ┌───────┐  ┌────────┐ │
        │  │PostgreSQL│  │ Redis │  │Redis Streams│ │
        │  └──────────┘  └───────┘  └────────┘ │
        └────────────────────────────────────────┘
```

---

## Project Structure

```
testmesh/
├── server/                          # Backend monolith
│   ├── main.go                      # Entry point
│   ├── cmd/
│   │   ├── server/
│   │   │   └── main.go             # HTTP server command
│   │   ├── worker/
│   │   │   └── main.go             # Background worker command
│   │   └── migrate/
│   │       └── main.go             # Database migrations
│   │
│   ├── internal/                    # Private application code
│   │   │
│   │   ├── api/                     # Domain: API Gateway
│   │   │   ├── handlers/
│   │   │   │   ├── flows.go        # Flow CRUD handlers
│   │   │   │   ├── executions.go   # Execution handlers
│   │   │   │   ├── collections.go
│   │   │   │   ├── environments.go
│   │   │   │   ├── agents.go
│   │   │   │   └── auth.go
│   │   │   ├── middleware/
│   │   │   │   ├── auth.go         # JWT/API key validation
│   │   │   │   ├── logging.go      # Request logging
│   │   │   │   ├── recovery.go     # Panic recovery
│   │   │   │   ├── ratelimit.go    # Rate limiting
│   │   │   │   └── cors.go
│   │   │   ├── websocket/
│   │   │   │   ├── hub.go          # WebSocket hub
│   │   │   │   └── client.go       # WebSocket client
│   │   │   ├── router/
│   │   │   │   └── router.go       # Route definitions
│   │   │   └── server.go           # HTTP server setup
│   │   │
│   │   ├── runner/                  # Domain: Test Execution
│   │   │   ├── executor.go         # Main executor
│   │   │   ├── context.go          # Execution context
│   │   │   ├── actions/
│   │   │   │   ├── http.go         # HTTP action handler
│   │   │   │   ├── database.go     # Database action handler
│   │   │   │   ├── kafka.go        # Kafka action handler
│   │   │   │   ├── grpc.go         # gRPC action handler
│   │   │   │   ├── websocket.go    # WebSocket action handler
│   │   │   │   ├── browser.go      # Browser automation
│   │   │   │   ├── mcp.go          # MCP/AI integration
│   │   │   │   └── registry.go     # Action registry
│   │   │   ├── assertions/
│   │   │   │   ├── engine.go       # Assertion evaluator
│   │   │   │   ├── jsonpath.go     # JSONPath support
│   │   │   │   └── validators.go   # Built-in validators
│   │   │   ├── variables/
│   │   │   │   ├── resolver.go     # Variable interpolation
│   │   │   │   └── store.go        # Variable storage
│   │   │   ├── flow/
│   │   │   │   ├── parser.go       # YAML parser
│   │   │   │   ├── validator.go    # Flow validation
│   │   │   │   └── loader.go       # Flow loader
│   │   │   └── plugins/
│   │   │       ├── loader.go       # Plugin loader
│   │   │       └── registry.go     # Plugin registry
│   │   │
│   │   ├── scheduler/               # Domain: Job Scheduling
│   │   │   ├── scheduler.go        # Main scheduler
│   │   │   ├── cron/
│   │   │   │   ├── cron.go         # Cron scheduler
│   │   │   │   └── parser.go       # Cron expression parser
│   │   │   ├── queue/
│   │   │   │   ├── publisher.go    # Job publisher
│   │   │   │   ├── consumer.go     # Job consumer
│   │   │   │   └── job.go          # Job definition
│   │   │   └── worker/
│   │   │       ├── pool.go         # Worker pool
│   │   │       └── worker.go       # Individual worker
│   │   │
│   │   ├── storage/                 # Domain: Data Storage
│   │   │   ├── flows/
│   │   │   │   ├── repository.go   # Flow CRUD
│   │   │   │   └── models.go       # Flow models
│   │   │   ├── executions/
│   │   │   │   ├── repository.go   # Execution CRUD
│   │   │   │   └── models.go       # Execution models
│   │   │   ├── collections/
│   │   │   │   ├── repository.go
│   │   │   │   └── models.go
│   │   │   ├── environments/
│   │   │   │   ├── repository.go
│   │   │   │   └── models.go
│   │   │   ├── agents/
│   │   │   │   ├── repository.go
│   │   │   │   └── models.go
│   │   │   ├── users/
│   │   │   │   ├── repository.go
│   │   │   │   └── models.go
│   │   │   └── metrics/
│   │   │       ├── repository.go
│   │   │       └── models.go
│   │   │
│   │   ├── cleanup/                 # Test data cleanup
│   │   │   ├── tracker.go          # Resource tracking
│   │   │   ├── cleaner.go          # Cleanup executor
│   │   │   └── strategies.go       # Cleanup strategies
│   │   │
│   │   └── shared/                  # Shared utilities
│   │       ├── database/
│   │       │   ├── client.go       # PostgreSQL client
│   │       │   ├── migrations/     # DB migrations
│   │       │   └── transaction.go  # Transaction helper
│   │       ├── cache/
│   │       │   └── redis.go        # Redis client
│   │       ├── queue/
│   │       │   └── redis.go     # Redis Streams client
│   │       ├── auth/
│   │       │   ├── jwt.go          # JWT utilities
│   │       │   ├── apikey.go       # API key validation
│   │       │   └── password.go     # Password hashing
│   │       ├── config/
│   │       │   └── config.go       # Configuration
│   │       ├── logger/
│   │       │   └── logger.go       # Structured logging
│   │       ├── metrics/
│   │       │   └── metrics.go      # Prometheus metrics
│   │       ├── tracing/
│   │       │   └── tracer.go       # OpenTelemetry
│   │       └── errors/
│   │           └── errors.go       # Error types
│   │
│   ├── pkg/                         # Public packages (reusable)
│   │   └── flowparser/
│   │       └── parser.go           # Flow YAML parser
│   │
│   ├── migrations/                  # Database migrations
│   │   ├── 001_initial_schema.up.sql
│   │   ├── 001_initial_schema.down.sql
│   │   └── ...
│   │
│   ├── config/
│   │   └── config.yaml             # Default configuration
│   │
│   └── go.mod
│
├── cli/                             # CLI tool
│   ├── cmd/
│   │   ├── root.go
│   │   ├── run.go
│   │   ├── watch.go
│   │   └── ...
│   └── go.mod
│
├── web/
│   └── dashboard/                   # Next.js dashboard
│       └── ...
│
└── docker-compose.yaml
```

---

## Domain Boundaries

### 1. API Domain

**Responsibilities**:
- HTTP request handling
- WebSocket connections
- Request validation
- Authentication & authorization
- Rate limiting
- Response formatting

**Interface**:
```go
// internal/api/handlers/flows.go
package handlers

import (
    "github.com/test-mesh/server/internal/storage/flows"
    "github.com/test-mesh/server/internal/runner"
)

type FlowHandler struct {
    flowRepo *flows.Repository
    executor *runner.Executor
}

func (h *FlowHandler) Run(c *gin.Context) {
    // 1. Parse request
    // 2. Call runner domain
    result, err := h.executor.Execute(ctx, flow)
    // 3. Return response
}
```

**Dependencies**: → Scheduler, → Runner, → Storage

---

### 2. Runner Domain

**Responsibilities**:
- Flow execution
- Action handling (HTTP, DB, Kafka, etc.)
- Assertion evaluation
- Variable resolution
- Plugin management
- Execution context

**Interface**:
```go
// internal/runner/executor.go
package runner

type Executor struct {
    actions    *actions.Registry
    assertions *assertions.Engine
    storage    storage.ExecutionStore
}

// Execute runs a flow
func (e *Executor) Execute(ctx context.Context, flow *Flow) (*ExecutionResult, error) {
    // 1. Create execution context
    execCtx := NewExecutionContext(flow)

    // 2. Run setup
    if err := e.runSetup(ctx, execCtx); err != nil {
        return nil, err
    }

    // 3. Execute steps
    for _, step := range flow.Steps {
        if err := e.executeStep(ctx, execCtx, step); err != nil {
            return nil, err
        }
    }

    // 4. Run teardown
    e.runTeardown(ctx, execCtx)

    return execCtx.Result(), nil
}
```

**Dependencies**: → Storage, → Shared

---

### 3. Scheduler Domain

**Responsibilities**:
- Cron-based scheduling
- Job queue management
- Worker pool management
- Job retry logic

**Interface**:
```go
// internal/scheduler/scheduler.go
package scheduler

type Scheduler struct {
    queue  *queue.Publisher
    cron   *cron.Scheduler
}

// ScheduleFlow adds a flow to the cron schedule
func (s *Scheduler) ScheduleFlow(schedule string, flowID string) error {
    return s.cron.Add(schedule, func() {
        s.queue.Publish(Job{
            Type:   "run_flow",
            FlowID: flowID,
        })
    })
}

// EnqueueFlow queues a flow for immediate execution
func (s *Scheduler) EnqueueFlow(flowID string) error {
    return s.queue.Publish(Job{
        Type:   "run_flow",
        FlowID: flowID,
    })
}
```

**Dependencies**: → Runner (via queue), → Storage

---

### 4. Storage Domain

**Responsibilities**:
- Database CRUD operations
- Data access layer
- Query builders
- Database schema ownership

**Interface**:
```go
// internal/storage/flows/repository.go
package flows

type Repository struct {
    db *sql.DB
}

// Create inserts a new flow
func (r *Repository) Create(ctx context.Context, flow *Flow) error {
    query := `
        INSERT INTO flows.flows (id, name, definition, created_at)
        VALUES ($1, $2, $3, $4)
    `
    _, err := r.db.ExecContext(ctx, query, flow.ID, flow.Name, flow.Definition, time.Now())
    return err
}

// Get retrieves a flow by ID
func (r *Repository) Get(ctx context.Context, id string) (*Flow, error) {
    // ...
}
```

**Dependencies**: → Shared (database client only)

---

### 5. Shared Layer

**Responsibilities**:
- Database client
- Redis client
- Redis Streams client
- Authentication utilities
- Logging
- Metrics
- Configuration

**No business logic** - pure infrastructure concerns.

---

## Database Schema Organization

Separate schemas per domain for clean boundaries:

```sql
-- Schema: flows
CREATE SCHEMA flows;
CREATE TABLE flows.flows (...);
CREATE TABLE flows.versions (...);

-- Schema: executions
CREATE SCHEMA executions;
CREATE TABLE executions.executions (...);
CREATE TABLE executions.logs (...);
CREATE TABLE executions.cleanup (...);

-- Schema: scheduler
CREATE SCHEMA scheduler;
CREATE TABLE scheduler.schedules (...);
CREATE TABLE scheduler.jobs (...);

-- Schema: agents
CREATE SCHEMA agents;
CREATE TABLE agents.agents (...);
CREATE TABLE agents.heartbeats (...);

-- Schema: users
CREATE SCHEMA users;
CREATE TABLE users.users (...);
CREATE TABLE users.api_keys (...);
```

This makes future microservices split easy - each service gets its own database/schema.

---

## Communication Patterns

### Synchronous (In-Process)

```go
// API calls Runner directly
result, err := executor.Execute(ctx, flow)
```

**Used for**:
- API → Runner (immediate execution)
- API → Storage (CRUD operations)
- Runner → Storage (save results)

### Asynchronous (Queue)

```go
// Scheduler publishes job to queue
scheduler.EnqueueFlow(flowID)

// Worker consumes job from queue
job := queue.Consume()
runner.Execute(ctx, job.Flow)
```

**Used for**:
- Scheduled executions
- Background jobs
- Long-running operations
- Retries

---

## Deployment

### Build and Run

```bash
# Build API server
cd api
go build -o testmesh-api main.go

# Run API server
./testmesh-api

# Build CLI tool
cd cli
go build -o testmesh main.go

# Run CLI
./testmesh run flow.yaml
```

### Docker Compose (Development)

```yaml
version: '3.8'

services:
  testmesh:
    build: ./server
    ports:
      - "5016:5016"
    environment:
      DATABASE_URL: postgres://postgres:password@postgres:5432/testmesh
      REDIS_URL: redis://redis:6379
      RABBITMQ_URL: amqp://redis:5672
    depends_on:
      - postgres
      - redis
      - redis

  testmesh-worker:
    build: ./server
    command: ["worker"]
    environment:
      DATABASE_URL: postgres://postgres:password@postgres:5432/testmesh
      RABBITMQ_URL: amqp://redis:5672
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: testmesh
      POSTGRES_PASSWORD: password

  redis:
    image: redis:6

  redis:
    image: redis:3-management
```

### Kubernetes (Production)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: testmesh-server
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: server
        image: testmesh/server:1.0.0
        ports:
        - containerPort: 5016

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: testmesh-worker
spec:
  replicas: 5
  template:
    spec:
      containers:
      - name: worker
        image: testmesh/server:1.0.0
        command: ["./testmesh-server", "worker"]
```

---

## Migration Path to Microservices

When scale demands splitting (v2.0+):

### Step 1: Extract Storage Service

```go
// Before (in-process):
storage := flows.NewRepository(db)
flow, err := storage.Get(ctx, id)

// After (HTTP):
client := flowsapi.NewClient("http://storage-service:5016")
flow, err := client.GetFlow(ctx, id)
```

### Step 2: Extract Runner Service

```go
// Before (in-process):
result, err := runner.Execute(ctx, flow)

// After (HTTP/gRPC):
client := runnerapi.NewClient("http://runner-service:5016")
result, err := client.Execute(ctx, flow)
```

### Step 3: Extract Scheduler Service

Already async via queue - no code changes needed!

---

## Benefits of This Approach

### ✅ **For v1.0**
- Simpler deployment (single binary)
- Faster development (no distributed system complexity)
- Easier debugging (all in one process)
- Better performance (in-process calls)
- Simpler transactions (single DB)

### ✅ **For Future**
- Clean domain boundaries
- Separate database schemas
- No circular dependencies
- Clear interfaces
- Easy to extract services when needed

### ✅ **Best of Both Worlds**
- Start simple (monolith)
- Scale smart (microservices when needed)
- No premature optimization
- No over-engineering

---

## Summary

**Architecture**: Modular Monolith
**Domains**: 4 (API, Runner, Scheduler, Storage)
**Communication**: In-process + Queue
**Database**: Single PostgreSQL with schemas
**Deployment**: Single binary, Docker, Kubernetes
**Migration**: Extract to microservices in v2.0 if needed

**This is the pragmatic path for v1.0!** 🚀
