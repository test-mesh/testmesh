# TestMesh Architecture

## System Overview

TestMesh is built as a **modular monolith** designed for simplicity, maintainability, and future scalability. The system runs as a single Go binary with clear domain boundaries that can be extracted into microservices when needed.

```
                              ┌─────────────────────────────────────┐
                              │      TestMesh Server (Go)           │
                              │      Single Binary                  │
                              ├─────────────────────────────────────┤
                              │                                     │
                              │  ┌───────────────────────────────┐ │
External                      │  │    API Domain                 │ │
Clients                       │  │  - REST API (port 5016)       │ │
   │                          │  │  - WebSocket (real-time)      │ │
   │                          │  │  - Auth & middleware          │ │
   ▼                          │  └──────────┬────────────────────┘ │
┌──────┐                      │             │                       │
│ CLI  │────────────┐         │  ┌──────────▼────────────────────┐ │
└──────┘            │         │  │  Scheduler Domain             │ │
                    │         │  │  - Cron scheduler             │ │
┌──────────┐        │         │  │  - Job queue                  │ │
│Dashboard │────────┼─────────┼─▶│  - Worker pool                │ │
└──────────┘        │         │  └──────────┬────────────────────┘ │
                    │         │             │                       │
┌──────────┐        │         │  ┌──────────▼────────────────────┐ │
│ Agents   │────────┘         │  │  Runner Domain                │ │
└──────────┘                  │  │  - Execution engine           │ │
                              │  │  - Action handlers            │ │
                              │  │  - Assertion engine           │ │
                              │  │  - Plugin system              │ │
                              │  └──────────┬────────────────────┘ │
                              │             │                       │
                              │  ┌──────────▼────────────────────┐ │
                              │  │  Storage Domain               │ │
                              │  │  - Flow repository            │ │
                              │  │  - Execution store            │ │
                              │  │  - Metrics store              │ │
                              │  └──────────┬────────────────────┘ │
                              │             │                       │
                              │  ┌──────────▼────────────────────┐ │
                              │  │  Shared Layer                 │ │
                              │  │  - DB, Redis, Queue clients   │ │
                              │  │  - Auth, Logging, Config      │ │
                              │  └───────────────────────────────┘ │
                              └─────────────┬───────────────────────┘
                                            │
                                            ▼
                              ┌─────────────────────────────────────┐
                              │  External Infrastructure            │
                              ├─────────────────────────────────────┤
                              │  ┌──────────┐  ┌───────┐  ┌──────┐│
                              │  │PostgreSQL│  │ Redis │  │Redis Streams││
                              │  │  (DB)    │  │(Cache)│  │(Queue)││
                              │  └──────────┘  └───────┘  └──────┘│
                              └─────────────────────────────────────┘
```

## Architecture Pattern: Modular Monolith

**Why Modular Monolith?**

✅ **Faster Development**: Single codebase, no distributed system complexity
✅ **Easier Debugging**: All code in one process, simple stack traces
✅ **Better Performance**: In-process calls (~microseconds) vs HTTP (~milliseconds)
✅ **Simpler Deployment**: One binary to deploy and scale
✅ **Lower Operational Cost**: Fewer resources, simpler infrastructure
✅ **Clear Migration Path**: Domain boundaries allow future microservices extraction

## Domain Structure

The TestMesh server is organized into four main domains, each with clear responsibilities:

### 1. API Domain

**Location**: `server/internal/api/`

**Responsibilities**:
- REST API endpoints (HTTP/JSON)
- WebSocket connections (real-time updates)
- Authentication and authorization
- Request validation
- Rate limiting
- CORS handling
- API versioning

**Key Components**:
- `handlers/` - HTTP request handlers
- `middleware/` - Auth, logging, rate limiting
- `websocket/` - Real-time communication
- `routes.go` - Route definitions

**API Endpoints**:
```
POST   /api/v1/flows                    # Create flow
GET    /api/v1/flows                    # List flows
GET    /api/v1/flows/:id                # Get flow details
PUT    /api/v1/flows/:id                # Update flow
DELETE /api/v1/flows/:id                # Delete flow

POST   /api/v1/executions               # Trigger execution
GET    /api/v1/executions               # List executions
GET    /api/v1/executions/:id           # Get execution details
POST   /api/v1/executions/:id/cancel    # Cancel execution
GET    /api/v1/executions/:id/logs      # Stream logs (WebSocket)

GET    /api/v1/results                  # Query results
GET    /api/v1/results/:id              # Get result details
GET    /api/v1/results/:id/artifacts    # Get artifacts

POST   /api/v1/schedules                # Create schedule
GET    /api/v1/schedules                # List schedules
PUT    /api/v1/schedules/:id            # Update schedule
DELETE /api/v1/schedules/:id            # Delete schedule

GET    /api/v1/metrics                  # Get metrics
GET    /api/v1/health                   # Health check
```

### 2. Runner Domain

**Location**: `server/internal/runner/`

**Responsibilities**:
- Execute test flows
- Manage execution context and state
- Dispatch actions to handlers
- Evaluate assertions
- Capture artifacts
- Plugin management

**Key Components**:
```
runner/
├── executor.go           # Main execution engine
├── context.go            # Execution context
├── actions/              # Action handlers
│   ├── http.go           # HTTP requests
│   ├── database.go       # Database queries
│   ├── kafka.go          # Kafka produce/consume
│   ├── grpc.go           # gRPC calls
│   ├── websocket.go      # WebSocket actions
│   └── browser.go        # Browser automation
├── assertions/           # Assertion engine
│   ├── evaluator.go
│   └── matchers.go
├── artifacts/            # Artifact collection
│   └── collector.go
└── plugins/              # Plugin system
    ├── loader.go
    └── registry.go
```

**Execution Flow**:
1. Load flow definition
2. Create execution context
3. Execute steps sequentially (or parallel if specified)
4. For each step:
   - Dispatch to appropriate action handler
   - Evaluate assertions
   - Capture artifacts
   - Update execution state
5. Store final results

### 3. Scheduler Domain

**Location**: `server/internal/scheduler/`

**Responsibilities**:
- Manage scheduled flow executions
- Parse cron expressions
- Queue jobs to Redis Streams
- Handle execution failures
- Retry logic

**Key Components**:
- `cron/` - Cron parser and scheduler
- `triggers/` - Trigger handlers
- `scheduler.go` - Main scheduler logic

**Features**:
- Cron expression support
- Time zone handling
- Overlapping execution prevention
- Schedule enable/disable
- Execution history tracking

### 4. Storage Domain

**Location**: `server/internal/storage/`

**Responsibilities**:
- Persist flow definitions
- Store execution results
- Manage metrics data
- Handle data retention
- Query interface for historical data

**Key Components**:
- `repository/` - Data access layer
- `models/` - Database models
- `migrations/` - Schema migrations

## Database Schema Organization

**Strategy**: Single PostgreSQL database with separate schemas per domain for clear ownership and future microservices extraction.

```sql
-- Separate schema per domain
CREATE SCHEMA flows;        -- Storage Domain
CREATE SCHEMA executions;   -- Storage Domain
CREATE SCHEMA scheduler;    -- Scheduler Domain
CREATE SCHEMA agents;       -- Agent Domain
CREATE SCHEMA users;        -- Storage Domain

-- Flow definitions
CREATE TABLE flows.flows (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    suite VARCHAR(100),
    tags TEXT[],
    definition JSONB NOT NULL,
    environment VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(100),
    version INT NOT NULL DEFAULT 1
);

CREATE INDEX idx_flows_tags ON flows.flows USING GIN(tags);
CREATE INDEX idx_flows_suite ON flows.flows(suite);

-- Executions
CREATE TABLE executions.executions (
    id UUID PRIMARY KEY,
    flow_id UUID NOT NULL,  -- References flows.flows(id)
    status VARCHAR(20) NOT NULL, -- pending, running, passed, failed, cancelled
    environment VARCHAR(50) NOT NULL,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    duration_ms INT,
    trigger_type VARCHAR(20), -- manual, scheduled, api, webhook
    triggered_by VARCHAR(100),
    context JSONB,
    error_message TEXT
);

CREATE INDEX idx_executions_flow_id ON executions.executions(flow_id);
CREATE INDEX idx_executions_status ON executions.executions(status);
CREATE INDEX idx_executions_started_at ON executions.executions(started_at DESC);

-- Execution steps
CREATE TABLE executions.execution_steps (
    id UUID PRIMARY KEY,
    execution_id UUID NOT NULL REFERENCES executions.executions(id),
    step_number INT NOT NULL,
    step_name VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    duration_ms INT,
    input JSONB,
    output JSONB,
    error_message TEXT,
    retry_count INT DEFAULT 0
);

CREATE INDEX idx_steps_execution_id ON executions.execution_steps(execution_id);

-- Artifacts
CREATE TABLE executions.artifacts (
    id UUID PRIMARY KEY,
    execution_id UUID NOT NULL REFERENCES executions.executions(id),
    step_id UUID REFERENCES executions.execution_steps(id),
    type VARCHAR(50) NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    size_bytes BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_artifacts_execution_id ON executions.artifacts(execution_id);

-- Schedules
CREATE TABLE scheduler.schedules (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    flow_id UUID NOT NULL,  -- References flows.flows(id)
    cron_expression VARCHAR(100) NOT NULL,
    environment VARCHAR(50) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    config JSONB
);

-- Metrics (TimescaleDB hypertable)
CREATE TABLE executions.metrics (
    time TIMESTAMPTZ NOT NULL,
    flow_id UUID NOT NULL,
    execution_id UUID NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DOUBLE PRECISION NOT NULL,
    tags JSONB
);

SELECT create_hypertable('executions.metrics', 'time');
CREATE INDEX idx_metrics_flow_id ON executions.metrics(flow_id, time DESC);
CREATE INDEX idx_metrics_name ON executions.metrics(metric_name, time DESC);
```

**Benefits**:
- Clear domain ownership
- Easy to migrate to separate databases later
- Schema-level access control
- Clean separation of concerns

### 5. Plugin System

**Technology**: Go with plugin architecture or Node.js with dynamic imports

**Structure**:
```typescript
// Plugin interface
interface TestMeshPlugin {
  metadata: PluginMetadata;
  actions?: ActionHandler[];
  assertions?: AssertionHandler[];
  hooks?: HookHandler[];
  reporters?: Reporter[];
  initialize(config: PluginConfig): Promise<void>;
  cleanup(): Promise<void>;
}

// Plugin metadata
interface PluginMetadata {
  name: string;
  version: string;
  description: string;
  author: string;
  dependencies?: string[];
}

// Action handler
interface ActionHandler {
  name: string;
  schema: JSONSchema;
  execute(config: any, context: ExecutionContext): Promise<ActionResult>;
}

// Assertion handler
interface AssertionHandler {
  name: string;
  evaluate(expected: any, actual: any, context: ExecutionContext): Promise<boolean>;
}

// Hook handler
interface HookHandler {
  onBeforeTest?(context: ExecutionContext): Promise<void>;
  onAfterTest?(context: ExecutionContext, result: TestResult): Promise<void>;
  onBeforeStep?(context: ExecutionContext, step: Step): Promise<void>;
  onAfterStep?(context: ExecutionContext, step: Step, result: StepResult): Promise<void>;
}

// Reporter
interface Reporter {
  name: string;
  generate(results: TestResult[]): Promise<Report>;
}
```

**Plugin Loading**:
```
/plugins
  /http-actions
    plugin.json
    index.js
  /slack-notifier
    plugin.json
    index.js
  /custom-assertions
    plugin.json
    index.js
```

### 6. Web Dashboard

**Technology**: React + TypeScript + Vite

**Pages**:
- **Dashboard**: Overview of test executions, success rates, trends
- **Tests**: List and manage test definitions
- **Executions**: View execution history and details
- **Results**: Detailed test results with artifacts
- **Schedules**: Manage scheduled runs
- **Analytics**: Metrics and reports
- **Settings**: System configuration
- **Plugins**: Plugin management

**Features**:
- Real-time updates via WebSocket
- Responsive design
- Dark mode support
- Export functionality
- Search and filtering
- Pagination

### 7. CLI Tool

**Technology**: Go with Cobra or Node.js with Commander

**Commands**:
```bash
testmesh
  ├── init              # Initialize project
  ├── run               # Run tests locally
  ├── watch             # Watch mode
  ├── debug             # Debug test
  ├── generate          # Generate test templates
  ├── validate          # Validate test syntax
  ├── push              # Upload tests to server
  ├── pull              # Download tests from server
  ├── results           # View results
  ├── logs              # View logs
  ├── config            # Manage configuration
  ├── plugin            # Plugin management
  └── server            # Run local server
```

**Configuration**:
```yaml
# .testmesh.yaml
version: 1
project: my-tests

environments:
  local:
    api_url: http://localhost:3000
  staging:
    api_url: https://testmesh.staging.example.com
  production:
    api_url: https://testmesh.example.com

defaults:
  environment: local
  timeout: 30s
  retry: 3

plugins:
  - name: slack-notifier
    version: 1.0.0
    config:
      webhook_url: ${SLACK_WEBHOOK_URL}
```

## Communication Patterns

### In-Process Communication (Default)

Most communication happens via direct function calls within the same process:

```go
// API Domain calls Runner Domain directly
result := runner.Execute(ctx, flow)

// Runner Domain calls Storage Domain directly
storage.SaveExecution(ctx, execution)
```

**Performance**: ~1-10 microseconds per call (1000x faster than HTTP)

### Async Communication (For Long-Running Tasks)

Background jobs use Redis Streams for decoupling:

```
1. Scheduler Domain → Redis Streams (publish job)
2. Worker Process → Redis Streams (consume job)
3. Worker → Runner Domain (execute in-process)
4. Runner → Storage Domain (save results in-process)
```

## Request Flow Examples

### Example 1: Run Flow via API

```
1. User → Dashboard → API Domain
   POST /api/v1/executions

2. API Domain → Runner Domain (direct call)
   result := executor.Execute(ctx, flow)

3. Runner Domain → Storage Domain (direct call)
   storage.SaveExecution(ctx, result)

4. Runner Domain → API Domain
   return result

5. API Domain → User
   HTTP 201 Created + result
```

**Total time**: ~1-5 seconds (depending on flow complexity)
**Inter-service latency**: ~10 microseconds (in-process calls)

### Example 2: Scheduled Flow Execution

```
1. Cron → Scheduler Domain
   trigger scheduled job

2. Scheduler Domain → Redis Streams (publish)
   job message enqueued

3. Worker Process → Redis Streams (consume)
   consume job message

4. Worker → Runner Domain (direct call)
   executor.Execute(ctx, flow)

5. Runner Domain → Storage Domain (direct call)
   storage.SaveExecution(ctx, result)

6. Storage Domain → WebSocket (via API Domain)
   broadcast execution complete event
```

### Example 3: Real-time Dashboard Updates

```
Web Dashboard
   │
   ├─► WebSocket connection to API Domain
   │
   ├─► Subscribe to execution:abc123
   │
   │   Runner Domain (executing flow)
   │      │
   │      ├─► Emits events to internal channel
   │      │   - execution.started
   │      │   - step.completed
   │      │   - execution.completed
   │      │
   │      ▼
   │   API Domain (WebSocket handler)
   │      │
   │      ├─► Broadcasts to connected clients
   │      │
   │      ▼
   │   Dashboard receives updates
   │      │
   │      └─► Updates UI in real-time
```

**Latency**: < 100ms from event to UI update

## Deployment Architecture

### Docker Compose (Local/Development)

```yaml
version: '3.8'

services:
  testmesh:
    build: ./server
    ports:
      - "5016:5016"
    command: ["server"]  # HTTP server mode
    environment:
      - DATABASE_URL=postgresql://testmesh:${DB_PASSWORD}@postgres:5432/testmesh
      - REDIS_URL=redis://redis:6379
      - RABBITMQ_URL=amqp://testmesh:${RABBITMQ_PASSWORD}@redis:5672
    depends_on:
      - postgres
      - redis
      - redis

  testmesh-worker:
    build: ./server
    command: ["worker"]  # Background worker mode
    environment:
      - DATABASE_URL=postgresql://testmesh:${DB_PASSWORD}@postgres:5432/testmesh
      - REDIS_URL=redis://redis:6379
      - RABBITMQ_URL=amqp://testmesh:${RABBITMQ_PASSWORD}@redis:5672
    depends_on:
      - postgres
      - redis
      - redis
    deploy:
      replicas: 3

  dashboard:
    build: ./web/dashboard
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:5016

  postgres:
    image: timescale/timescaledb:latest-pg14
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_DB=testmesh
      - POSTGRES_USER=testmesh
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data

  redis:
    image: redis:3-management-alpine
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      - RABBITMQ_DEFAULT_USER=testmesh
      - RABBITMQ_DEFAULT_PASS=${RABBITMQ_PASSWORD}
    volumes:
      - redis-data:/var/lib/redis

volumes:
  postgres-data:
  redis-data:
  redis-data:
```

**Key Points**:
- Same Docker image for both server and worker
- Different command determines mode: `server` or `worker`
- Workers scale independently (3 replicas by default)

### Kubernetes (Production)

```
Namespace: testmesh
│
├── Deployments:
│   ├── testmesh-server (3 replicas)      # HTTP API + Scheduler
│   ├── testmesh-worker (5-20 replicas)   # Background job processing (HPA enabled)
│   └── testmesh-dashboard (2 replicas)   # Next.js dashboard
│
├── StatefulSets:
│   ├── postgres (primary + 2 read replicas)
│   ├── redis (sentinel mode, 3 nodes)
│   └── redis (cluster mode, 3 nodes)
│
├── Services:
│   ├── testmesh-server (LoadBalancer, port 5016)
│   ├── testmesh-dashboard (LoadBalancer, port 3000)
│   ├── postgres (ClusterIP)
│   ├── redis (ClusterIP)
│   └── redis (ClusterIP)
│
├── ConfigMaps:
│   ├── testmesh-config          # Shared configuration
│   └── dashboard-config
│
├── Secrets:
│   ├── database-credentials
│   ├── redis-credentials
│   ├── redis-credentials
│   └── jwt-secret
│
├── HorizontalPodAutoscaler:
│   └── testmesh-worker-hpa      # Scale workers based on queue depth
│
└── PersistentVolumeClaims:
    ├── postgres-data
    ├── redis-data
    └── redis-data
```

**Scaling Strategy**:
- **API Server**: Scale based on request rate (CPU/memory)
- **Workers**: Scale based on Redis Streams queue depth
- **Dashboard**: Scale based on concurrent users

## Technology Stack Summary

### Backend (Single Go Binary)
- **Language**: Go 1.21+
- **API Framework**: Gin (HTTP router)
- **ORM**: GORM (database access)
- **Background Jobs**: Redis Streams (async tasks)
- **Project Structure**: Domain-driven design

### Frontend
- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **UI Library**: React 18
- **State Management**: Zustand
- **UI Components**: shadcn/ui + Radix UI
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Real-time**: Socket.io
- **Visual Editor**: React Flow

### CLI
- **Language**: Go
- **CLI Framework**: Cobra
- **Config**: Viper
- **Build**: Single binary (cross-platform)

### Data Storage
- **Primary Database**: PostgreSQL 14+ with separate schemas per domain
- **Time-Series**: TimescaleDB extension for metrics
- **Cache**: Redis 7+ (sessions, locks, caching)
- **Message Queue**: Redis Streams (job queue)
- **Artifact Storage**: S3 or MinIO

### Browser Automation
- **Library**: Playwright

### Observability
- **Metrics**: Prometheus + Grafana
- **Logs**: Structured logging (JSON)
- **Tracing**: OpenTelemetry + Jaeger
- **Error Tracking**: Built-in (can integrate Sentry)

### Infrastructure
- **Containers**: Docker (single image)
- **Orchestration**: Kubernetes + Helm
- **IaC**: Terraform (cloud-agnostic)

## Scalability Considerations

### Horizontal Scaling (Modular Monolith)

**Current Architecture** (v1.0):
- **API Servers**: Scale based on request rate (add more replicas)
- **Workers**: Scale based on Redis Streams queue depth (HPA)
- **Database**: Read replicas for query load
- **Redis**: Cluster mode for high throughput

**Throughput Expectations**:
- Single server: 100-200 flows/second
- With workers: 1000+ flows/second
- Database will be bottleneck before application

### Performance Optimizations

**In-Process Communication**:
- Function calls: ~1-10 microseconds
- No network overhead
- No serialization/deserialization
- 1000x faster than HTTP microservices

**Connection Pooling**:
- Database connection pool (max 100 connections)
- Redis connection pool
- HTTP client connection reuse

**Caching**:
- Flow definitions (Redis)
- User sessions (Redis)
- Execution results (short TTL)

**Async Processing**:
- Non-blocking I/O
- Background jobs via Redis Streams
- Goroutines for concurrent execution

### Resource Management
- **Memory Limits**: 2GB per server pod, 1GB per worker pod
- **CPU Limits**: 2 cores per server, 1 core per worker
- **Disk I/O**: SSDs for database
- **Queue Depth**: Alert when >1000 jobs

## Future Migration to Microservices

### When to Split? (v2.0+)

**DO split when**:
- Worker needs 10x more capacity than API
- Different deployment schedules required
- Team structure demands it (separate teams)
- Clear performance/scaling bottlenecks identified

**DON'T split when**:
- Traffic is still manageable with horizontal scaling
- Team is small (<10 engineers)
- Operational complexity outweighs benefits

### Migration Path

**Phase 1**: Extract Storage Domain
```
Before: API → Storage (in-process)
After:  API → Storage Service (HTTP/gRPC)
```

**Phase 2**: Extract Runner Domain
```
Before: API → Runner (in-process)
After:  API → Runner Service (HTTP/gRPC)
```

**Phase 3**: Extract Scheduler Domain
```
Before: Scheduler → Runner (in-process)
After:  Scheduler → Runner Service (queue)
```

**Cost of Each Split**:
- Network latency added (+1-10ms per call)
- Deployment complexity increased
- Operational overhead (monitoring, debugging)
- Distributed transaction complexity

**Benefit**:
- Independent scaling per service
- Independent deployment per service
- Technology diversity (can use different languages)

### Domain Boundaries (Designed for Extraction)

Each domain is already structured for easy extraction:
- Clear interfaces between domains
- No circular dependencies
- Separate database schemas
- Standalone testability

**To extract a domain**:
1. Add HTTP/gRPC API layer on top of domain
2. Replace in-process calls with RPC calls
3. Deploy as separate service
4. Update Kubernetes manifests
5. Monitor and optimize

**Estimated effort per domain**: 2-4 weeks

## Security Architecture

### Authentication & Authorization
- **JWT Tokens**: For API authentication
- **API Keys**: For programmatic access
- **RBAC**: Role-based access control
- **OAuth2**: Third-party integration

### Network Security
- **TLS/SSL**: All connections encrypted
- **Network Policies**: Kubernetes network policies
- **Firewall Rules**: Restrict access
- **VPC**: Isolated network

### Data Security
- **Encryption at Rest**: Database encryption
- **Encryption in Transit**: TLS 1.3
- **Secrets Management**: Kubernetes secrets, Vault
- **Audit Logs**: Track all access

### Application Security
- **Input Validation**: Validate all inputs
- **SQL Injection**: Parameterized queries
- **XSS Protection**: Sanitize outputs
- **CSRF Protection**: CSRF tokens
- **Rate Limiting**: Prevent abuse
- **Dependency Scanning**: Regular vulnerability scans
