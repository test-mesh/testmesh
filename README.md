# TestMesh

> **A platform for writing and running end-to-end integration tests**

TestMesh makes it easy to write, manage, and execute integration tests across multiple protocols. Define tests in YAML, run them locally or in CI/CD, and get detailed execution results.

## Repository Structure

This is a monorepo containing all TestMesh components:

```
testmesh/
├── api/          # Go backend service (modular monolith)
├── cli/          # CLI tool for running flows locally
├── dashboard/    # Next.js frontend dashboard (port 3000)
├── web/          # Documentation site (port 3001)
├── services/     # Demo microservices for testing
│   ├── user-service/
│   ├── product-service/
│   ├── order-service/
│   └── notification-service/
├── examples/     # Example test flows
└── docs/         # Architecture & feature documentation
```

## Why TestMesh?

### 🎯 Simple & Powerful
Write tests in human-readable YAML. No complex coding required. Yet powerful enough to handle complex scenarios with data extraction, assertions, and variable passing between steps.

### 🔌 Multi-Protocol Support
- **HTTP/REST APIs** - Full HTTP client with headers, auth, assertions
- **Databases** - PostgreSQL, MySQL query execution and validation
- **Message Queues** - Kafka producer/consumer testing
- **Redis** - GET/SET operations, caching verification
- **WebSocket** - Real-time communication testing

### 🧪 Demo Microservices
Includes a complete e-commerce microservices architecture for demonstration:
- **User Service** - User management with Redis sessions
- **Product Service** - Product catalog with Redis caching and inventory locking
- **Order Service** - Order processing with inter-service HTTP calls
- **Notification Service** - Event-driven notifications via Kafka

Perfect for learning integration testing patterns and demonstrating TestMesh capabilities.

### 💻 Developer Experience
- **CLI tool** for local development and CI/CD
- **YAML-based** test definitions
- **Variable extraction** from responses (JSONPath)
- **Assertions** with expression language
- **Real-time dashboard** for monitoring

## Quick Start

### Prerequisites

TestMesh requires:
- **PostgreSQL** (5432) - for data persistence
- **Redis** (6379) - for caching and job queue
- **Kafka** (9092) - optional, for async testing

**Option A**: Use your existing services
**Option B**: Use our bundled services (see below)

### Option A: Using Existing Infrastructure

If you already have PostgreSQL, Redis, and Kafka running:

```bash
# 1. Configure connection details
cp .env.example .env
# Edit .env with your database/redis/kafka connection details

# 2. Start TestMesh
docker-compose up -d

# 3. Access the dashboard
open http://localhost:3000
```

### Option B: Full Local Development Setup

Start everything with bundled services:

```bash
# Start all services (infrastructure + TestMesh + demo microservices)
docker-compose -f docker-compose.dev.yml up -d

# Or start infrastructure only
docker-compose -f docker-compose.infra.yml up -d
docker-compose up -d

# Or start with demo microservices
docker-compose -f docker-compose.infra.yml up -d
docker-compose up -d
docker-compose -f docker-compose.services.yml up -d
```

### Run Example E2E Test

```bash
# Run the complete end-to-end order flow
cd cli
go run main.go run ../examples/microservices/e2e-order-flow.yaml
```

This E2E test demonstrates:
- HTTP requests to create users and products
- Redis cache verification
- Kafka event publishing and consumption
- PostgreSQL data persistence
- Inter-service communication
- Notification generation

**Result:**
```
✅ Flow completed successfully in 177ms
   Total steps: 16
   Passed: 16
   Failed: 0
```

## Deployment Options

TestMesh provides multiple Docker Compose files for different use cases:

### `docker-compose.yml` (Production Ready)

**Use when**: Deploying to production or using existing infrastructure

```bash
docker-compose up -d
```

- ✅ Just TestMesh API and Dashboard
- ✅ Expects external PostgreSQL and Redis
- ✅ Configurable via environment variables
- ✅ Port conflicts avoided (configurable ports)
- ✅ Suitable for: Production, existing infrastructure, Docker deployments

**Configuration**:
```bash
# .env file
DATABASE_HOST=my-postgres-host
DATABASE_PORT=5432
REDIS_HOST=my-redis-host
REDIS_PORT=6379
API_PORT=5016
DASHBOARD_PORT=3000
```

### `docker-compose.dev.yml` (Full Stack)

**Use when**: Local development with everything bundled

```bash
docker-compose -f docker-compose.dev.yml up -d
```

- ✅ Complete development stack
- ✅ Bundled PostgreSQL, Redis, Kafka
- ✅ TestMesh API and Dashboard
- ✅ Demo microservices
- ✅ All ports exposed on host
- ✅ Suitable for: Local development, learning, demos

**Ports used**: 5432, 6379, 9092-9093, 5016, 3000, 5001-5004

### `docker-compose.infra.yml` (Infrastructure Only)

**Use when**: You want bundled databases but deploy TestMesh separately

```bash
docker-compose -f docker-compose.infra.yml up -d
```

- ✅ Just PostgreSQL, Redis, Kafka
- ✅ No application services
- ✅ Configurable ports to avoid conflicts
- ✅ Suitable for: Local dev, CI/CD pipelines, testing

**Configuration**:
```bash
POSTGRES_PORT=5433  # Change if 5432 is in use
REDIS_PORT=6380     # Change if 6379 is in use
KAFKA_PORT=9093     # Change if 9092 is in use
```

### `docker-compose.services.yml` (Demo Microservices)

**Use when**: Testing with demo e-commerce microservices

```bash
docker-compose -f docker-compose.services.yml up -d
```

- ✅ Demo microservices only
- ✅ Connects to external infrastructure
- ✅ Suitable for: E2E testing, demonstrations

**Ports**: 5001-5004 (configurable)

### Combined Usage Examples

**Scenario 1**: Local dev with custom Postgres port
```bash
# Start infrastructure on custom ports
POSTGRES_PORT=5433 REDIS_PORT=6380 docker-compose -f docker-compose.infra.yml up -d

# Start TestMesh pointing to custom ports
DATABASE_PORT=5433 REDIS_PORT=6380 docker-compose up -d
```

**Scenario 2**: Use existing services
```bash
# Create .env with your connection details
cat > .env << EOF
DATABASE_HOST=my-rds-instance.amazonaws.com
DATABASE_PORT=5432
REDIS_HOST=my-elasticache.amazonaws.com
REDIS_PORT=6379
EOF

# Start TestMesh
docker-compose up -d
```

**Scenario 3**: Full local setup with different API port
```bash
API_PORT=8080 DASHBOARD_PORT=8081 docker-compose -f docker-compose.dev.yml up -d
# API: http://localhost:8080
# Dashboard: http://localhost:8081
```

**Scenario 4**: Production with external RDS + ElastiCache
```bash
# Pull pre-built images
docker pull testmesh/api:latest
docker pull testmesh/dashboard:latest

# Start with production config
docker-compose up -d
```

**📖 For detailed Docker setup guide**: See [DOCKER_SETUP.md](DOCKER_SETUP.md) for:
- Complete port configuration reference
- Troubleshooting common issues
- Network architecture details
- CI/CD integration examples

### 3. Create Your Own Test

```yaml
# my-test.yaml
flow:
  name: "API Health Check"
  steps:
    - id: check_health
      action: http_request
      config:
        method: GET
        url: "http://localhost:5001/health"
      assert:
        - status == 200
        - body.status == "healthy"
```

```bash
cd cli
go run main.go run my-test.yaml
```

## Test Definition

### Basic HTTP Test
```yaml
flow:
  name: "User Creation Flow"
  steps:
    - id: create_user
      action: http_request
      config:
        method: POST
        url: "http://localhost:5001/api/v1/users"
        headers:
          Content-Type: application/json
        body:
          name: "John Doe"
          email: "john@example.com"
      assert:
        - status == 201
        - body.id != null
      output:
        user_id: $.body.id
```

### Database Verification
```yaml
    - id: verify_in_db
      action: database_query
      config:
        connection_string: "postgresql://testmesh:testmesh_dev@localhost:5432/testmesh"
        query: "SELECT * FROM user_service.users WHERE id = $1"
        params: ["{{user_id}}"]
      assert:
        - row_count == 1
        - rows[0].email == "john@example.com"
```

### Kafka Event Testing
```yaml
    - id: verify_kafka_event
      action: kafka_consumer
      config:
        brokers: "localhost:9093"
        topic: "user.created"
        group_id: "testmesh-test"
        timeout: 10s
      assert:
        - messages.length > 0
        - messages[0].value.user_id == user_id
```

### Redis Cache Check
```yaml
    - id: verify_cache
      action: redis_get
      config:
        host: localhost
        port: 6379
        key: "user:{{user_id}}"
      assert:
        - value != null
```

## CLI Commands

```bash
# Run a flow
go run main.go run <flow.yaml>

# Validate flow syntax
go run main.go validate <flow.yaml>

# Available commands
go run main.go --help
```

## Architecture

TestMesh is built as a **modular monolith** - a single Go service with clear domain boundaries:

```
┌─────────────┬───────────────┬───────────────┐
│  CLI Tool   │   Dashboard   │   API Client  │
└──────┬──────┴───────┬───────┴───────┬───────┘
       │              │               │
       └──────────────┴───────────────┘
                      │
       ┌──────────────┴──────────────────┐
       │   TestMesh API Server (Go)      │
       ├─────────────────────────────────┤
       │  ┌────────────────────────────┐ │
       │  │ API Domain                 │ │  REST API + WebSocket
       │  └──────────┬─────────────────┘ │
       │  ┌──────────▼─────────────────┐ │
       │  │ Runner Domain              │ │  Flow execution engine
       │  └──────────┬─────────────────┘ │
       │  ┌──────────▼─────────────────┐ │
       │  │ Storage Domain             │ │  Data persistence
       │  └────────────────────────────┘ │
       └──────────────┬──────────────────┘
                      │
       ┌──────────────┴──────────────────┐
       │  PostgreSQL + Redis + Kafka     │
       └─────────────────────────────────┘
```

**Domains:**
- **API** - HTTP handlers, WebSocket, middleware
- **Runner** - Test execution engine with action handlers
- **Scheduler** - Cron-based test scheduling
- **Storage** - Data models and repositories
- **MCP** - Model Context Protocol for AI integration
- **Shared** - Configuration, database, logging

See [docs/architecture/ARCHITECTURE.md](./docs/architecture/ARCHITECTURE.md) for complete architecture details.

## Tech Stack

### Backend
- **Go 1.23+** - Primary language
- **Gin** - HTTP framework
- **GORM** - PostgreSQL ORM
- **Viper** - Configuration management
- **Zap** - Structured logging

### Frontend
- **Next.js 16** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI components

### Infrastructure
- **PostgreSQL** - Primary database
- **Redis** - Caching and sessions
- **Kafka** - Event streaming
- **Docker** - Containerization

## Documentation

### Getting Started
- **[CLAUDE.md](./CLAUDE.md)** - Quick reference for developers
- **[QUICKSTART.md](./docs/planning/QUICKSTART.md)** - Detailed getting started guide

### Architecture
- **[ARCHITECTURE.md](./docs/architecture/ARCHITECTURE.md)** - Complete system architecture
- **[MODULAR_MONOLITH.md](./docs/architecture/MODULAR_MONOLITH.md)** - Architectural approach
- **[TECH_STACK.md](./docs/architecture/TECH_STACK.md)** - Technology decisions
- **[PROJECT_STRUCTURE.md](./docs/architecture/PROJECT_STRUCTURE.md)** - Code organization

### Features
- **[FLOW_DESIGN.md](./docs/features/FLOW_DESIGN.md)** - Flow execution design
- **[YAML_SCHEMA.md](./docs/features/YAML_SCHEMA.md)** - Flow definition specification
- **[MCP_INTEGRATION.md](./docs/features/MCP_INTEGRATION.md)** - AI integration via Model Context Protocol
- **[CONTRACT_TESTING.md](./docs/features/CONTRACT_TESTING.md)** - Consumer-driven contracts
- **[More...](./docs/README.md)** - Full documentation index

### Microservices Demo
- **[services/README.md](./services/README.md)** - Demo microservices architecture guide
- Complete e-commerce example with User, Product, Order, and Notification services
- Shows HTTP, Kafka, Redis, and PostgreSQL integration patterns

### Development
- **[CODING_STANDARDS.md](./docs/process/CODING_STANDARDS.md)** - Code style guide
- **[DEVELOPMENT_WORKFLOW.md](./docs/process/DEVELOPMENT_WORKFLOW.md)** - Git workflow
- **[SECURITY_GUIDELINES.md](./docs/process/SECURITY_GUIDELINES.md)** - Security practices

## Development

### Run API Server
```bash
cd api
go run main.go
# API runs on http://localhost:5016
```

### Run Dashboard
```bash
cd dashboard
npm install
npm run dev
# Dashboard runs on http://localhost:3000
```

### Run CLI
```bash
cd cli
go run main.go run <flow.yaml>
```

### Start Everything with Docker
```bash
# All services
docker-compose up

# Just infrastructure + microservices
docker-compose up postgres redis kafka user-service product-service order-service notification-service

# Just API + Dashboard
docker-compose up api dashboard
```

## Examples

Check the [examples/](./examples/) directory for:
- **microservices/** - Complete E2E flows testing all demo services
  - `e2e-order-flow.yaml` - 16-step complete order journey
  - `user-service-flow.yaml` - User CRUD with Redis sessions
  - `product-service-flow.yaml` - Product operations with caching
  - `kafka-messaging-flow.yaml` - Event streaming patterns
- **emv-fare-testing/** - EMV fare calculation testing example

## Health Checks

```bash
# API Server
curl http://localhost:5016/health

# User Service
curl http://localhost:5001/health

# Product Service
curl http://localhost:5002/health

# Order Service
curl http://localhost:5003/health

# Notification Service
curl http://localhost:5004/health
```

## Contributing

Contributions are welcome! Please read the development documentation in `docs/` before contributing.

### Development Setup
1. Install Go 1.23+
2. Install Node.js 20+
3. Install Docker & Docker Compose
4. Clone the repository
5. Run `docker-compose up` to start infrastructure

## License

MIT License - See [LICENSE](./LICENSE) for details.

---

**Get Started:** Check out [CLAUDE.md](./CLAUDE.md) for a quick development guide, or [docs/planning/QUICKSTART.md](./docs/planning/QUICKSTART.md) for detailed instructions.

**Questions?** See the documentation in `docs/` or open an issue on GitHub.
