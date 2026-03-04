# Docker Setup Guide

TestMesh provides flexible Docker deployment options to suit different environments and use cases.

## TL;DR - Quick Start

```bash
# I have my own PostgreSQL and Redis
docker-compose up -d

# I need everything bundled (full local dev)
docker-compose -f docker-compose.dev.yml up -d

# I need databases but not TestMesh
docker-compose -f docker-compose.infra.yml up -d

# I need just demo microservices
docker-compose -f docker-compose.services.yml up -d
```

## Docker Compose Files

| File | Purpose | What's Included | When to Use |
|------|---------|-----------------|-------------|
| `docker-compose.yml` | **Production/Distribution** | API + Dashboard | Existing infrastructure, production deployments |
| `docker-compose.dev.yml` | **Full Local Dev** | Everything | Learning, development, demos |
| `docker-compose.infra.yml` | **Infrastructure Only** | PostgreSQL + Redis + Kafka | Local databases, CI/CD |
| `docker-compose.services.yml` | **Demo Microservices** | 4 demo services | E2E testing with examples |

## 1. docker-compose.yml (Default - Production Ready)

### What's Inside
- TestMesh API (port 5016)
- TestMesh Dashboard (port 3000)

### What's NOT Inside
- PostgreSQL (expects external)
- Redis (expects external)
- Kafka (optional, expects external)

### Use Cases
✅ **Production deployment** with AWS RDS + ElastiCache
✅ **Staging environment** with managed databases
✅ **Local dev** with your own Postgres/Redis
✅ **Docker Hub distribution** - users have their own infrastructure
✅ **Port conflict avoidance** - standard ports might be in use

### Quick Start

```bash
# 1. Set your connection details
export DATABASE_HOST=localhost
export DATABASE_PORT=5432
export REDIS_HOST=localhost
export REDIS_PORT=6379

# 2. Start TestMesh
docker-compose up -d

# 3. Check health
curl http://localhost:5016/health
```

### Using .env File

```bash
# Create .env
cat > .env << EOF
DATABASE_HOST=my-postgres.example.com
DATABASE_PORT=5432
DATABASE_USER=testmesh
DATABASE_PASSWORD=secure_password
DATABASE_DBNAME=testmesh
DATABASE_SSLMODE=require

REDIS_HOST=my-redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=secure_password
REDIS_TLS_ENABLED=true

API_PORT=5016
DASHBOARD_PORT=3000
JWT_SECRET=your-secret-key
EOF

# Start
docker-compose up -d
```

### Custom Ports

Avoid conflicts with services already running:

```bash
# API on 8080, Dashboard on 8081
API_PORT=8080 DASHBOARD_PORT=8081 docker-compose up -d

# Or in .env
echo "API_PORT=8080" >> .env
echo "DASHBOARD_PORT=8081" >> .env
docker-compose up -d
```

### Production Deployment

```bash
# Pull pre-built images
docker pull testmesh/api:latest
docker pull testmesh/dashboard:latest

# Set production config
export ENV=production
export DATABASE_HOST=prod-rds.amazonaws.com
export REDIS_HOST=prod-cache.amazonaws.com
export JWT_SECRET=$(openssl rand -base64 32)

# Start
docker-compose up -d

# Verify
docker-compose ps
docker-compose logs -f api
```

## 2. docker-compose.dev.yml (Full Stack)

### What's Inside
- PostgreSQL (port 5432)
- Redis (port 6379)
- Kafka (ports 9092-9093)
- TestMesh API (port 5016)
- TestMesh Dashboard (port 3000)
- User Service (port 5001)
- Product Service (port 5002)
- Order Service (port 5003)
- Notification Service (port 5004)

### Use Cases
✅ **First-time setup** - get everything running quickly
✅ **Learning TestMesh** - try all features
✅ **Demo presentations** - full E2E scenarios
✅ **No existing infrastructure** - everything bundled
✅ **Offline development** - no cloud dependencies

### Quick Start

```bash
# Start everything
docker-compose -f docker-compose.dev.yml up -d

# Check all services
docker-compose -f docker-compose.dev.yml ps

# Run example test
cd cli
go run main.go run ../examples/microservices/e2e-order-flow.yaml
```

### Ports Used

| Service | Port | Alternative |
|---------|------|-------------|
| PostgreSQL | 5432 | Change via `POSTGRES_PORT` |
| Redis | 6379 | Change via `REDIS_PORT` |
| Kafka | 9092, 9093 | Change via `KAFKA_PORT` |
| TestMesh API | 5016 | Change via `API_PORT` |
| Dashboard | 3000 | Change via `DASHBOARD_PORT` |
| User Service | 5001 | Change via `USER_SERVICE_PORT` |
| Product Service | 5002 | Change via `PRODUCT_SERVICE_PORT` |
| Order Service | 5003 | Change via `ORDER_SERVICE_PORT` |
| Notification | 5004 | Change via `NOTIFICATION_SERVICE_PORT` |

### Custom Port Configuration

If default ports conflict with your local services:

```bash
# Create .env with custom ports
cat > .env << EOF
POSTGRES_PORT=5433
REDIS_PORT=6380
KAFKA_PORT=9094
API_PORT=5017
DASHBOARD_PORT=3001
USER_SERVICE_PORT=5011
PRODUCT_SERVICE_PORT=5012
ORDER_SERVICE_PORT=5013
NOTIFICATION_SERVICE_PORT=5014
EOF

# Start with custom ports
docker-compose -f docker-compose.dev.yml up -d
```

### Accessing Services

```bash
# PostgreSQL
psql postgres://testmesh:testmesh_dev@localhost:5432/testmesh

# Redis
redis-cli -h localhost -p 6379

# Kafka
kafka-topics --bootstrap-server localhost:9093 --list

# TestMesh API
curl http://localhost:5016/health

# Dashboard
open http://localhost:3000

# User Service
curl http://localhost:5001/health
```

## 3. docker-compose.infra.yml (Infrastructure Only)

### What's Inside
- PostgreSQL (port 5432)
- Redis (port 6379)
- Kafka (port 9092, optional via profile)

### What's NOT Inside
- TestMesh API
- TestMesh Dashboard
- Demo Microservices

### Use Cases
✅ **Hybrid setup** - bundled DBs, custom API deployment
✅ **CI/CD pipelines** - ephemeral test databases
✅ **Multiple projects** - shared infrastructure
✅ **Port conflict resolution** - your Postgres on 5432, use 5433
✅ **Development databases** - isolated from production

### Quick Start

```bash
# Start just databases
docker-compose -f docker-compose.infra.yml up -d

# Start with Kafka
docker-compose -f docker-compose.infra.yml --profile kafka up -d

# Then start TestMesh separately
docker-compose up -d
```

### Custom Ports (Avoid Conflicts)

```bash
# Your local Postgres is on 5432, use 5433
POSTGRES_PORT=5433 REDIS_PORT=6380 \
  docker-compose -f docker-compose.infra.yml up -d

# Configure TestMesh to use custom ports
DATABASE_PORT=5433 REDIS_PORT=6380 \
  docker-compose up -d
```

### CI/CD Example

```yaml
# .github/workflows/test.yml
- name: Start test databases
  run: |
    docker-compose -f docker-compose.infra.yml up -d
    docker-compose -f docker-compose.infra.yml exec -T postgres \
      psql -U testmesh -c "SELECT 1"

- name: Run tests
  run: |
    export DATABASE_HOST=localhost
    export REDIS_HOST=localhost
    go test ./...

- name: Cleanup
  run: docker-compose -f docker-compose.infra.yml down -v
```

## 4. docker-compose.services.yml (Demo Microservices)

### What's Inside
- User Service (port 5001)
- Product Service (port 5002)
- Order Service (port 5003)
- Notification Service (port 5004)

### What's NOT Inside
- Infrastructure (expects external)
- TestMesh API/Dashboard

### Use Cases
✅ **E2E testing** - run example flows
✅ **Integration testing** - test against real services
✅ **Demonstrations** - show multi-service scenarios
✅ **Separate deployment** - services on different hosts

### Quick Start

```bash
# Start infrastructure
docker-compose -f docker-compose.infra.yml up -d

# Start microservices
docker-compose -f docker-compose.services.yml up -d

# Run E2E test
cd cli
go run main.go run ../examples/microservices/e2e-order-flow.yaml
```

### Custom Configuration

```bash
# Use external databases
DATABASE_HOST=my-postgres.com \
REDIS_HOST=my-redis.com \
  docker-compose -f docker-compose.services.yml up -d

# Custom ports
USER_SERVICE_PORT=6001 \
PRODUCT_SERVICE_PORT=6002 \
  docker-compose -f docker-compose.services.yml up -d
```

## Common Scenarios

### Scenario 1: Complete Local Development

**Goal**: Everything running locally, no conflicts

```bash
# Check what ports are in use
lsof -i :5432 -i :6379 -i :9092 -i :5016 -i :3000

# If ports are free, use full dev setup
docker-compose -f docker-compose.dev.yml up -d

# If ports conflict, customize
cat > .env << EOF
POSTGRES_PORT=15432
REDIS_PORT=16379
API_PORT=15016
DASHBOARD_PORT=13000
EOF

docker-compose -f docker-compose.dev.yml up -d
```

### Scenario 2: Production with AWS

**Goal**: Deploy to EC2 with RDS and ElastiCache

```bash
# On EC2 instance
cat > .env << EOF
ENV=production
DATABASE_HOST=mydb.abc123.us-east-1.rds.amazonaws.com
DATABASE_PORT=5432
DATABASE_USER=testmesh
DATABASE_PASSWORD=${RDS_PASSWORD}
DATABASE_SSLMODE=require

REDIS_HOST=mycache.abc123.cache.amazonaws.com
REDIS_PORT=6379
REDIS_TLS_ENABLED=true

JWT_SECRET=${JWT_SECRET}
LOG_LEVEL=info
EOF

# Start TestMesh only
docker-compose up -d

# Verify
curl http://localhost:5016/health
```

### Scenario 3: Local Dev with Existing Postgres

**Goal**: Use my local Postgres on 5432, bundled Redis

```bash
# Start only Redis
docker-compose -f docker-compose.infra.yml up -d redis

# Start TestMesh pointing to localhost Postgres
DATABASE_HOST=host.docker.internal \
REDIS_HOST=redis \
  docker-compose up -d
```

### Scenario 4: CI/CD Testing

**Goal**: Isolated test environment in GitHub Actions

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Start test infrastructure
        run: docker-compose -f docker-compose.infra.yml up -d

      - name: Wait for databases
        run: |
          docker-compose -f docker-compose.infra.yml exec -T postgres \
            pg_isready -U testmesh

      - name: Run integration tests
        run: |
          export DATABASE_HOST=localhost
          export REDIS_HOST=localhost
          go test ./...

      - name: Cleanup
        run: docker-compose -f docker-compose.infra.yml down -v
```

### Scenario 5: Development Team Setup

**Goal**: Shared infrastructure, individual TestMesh instances

```bash
# Team lead: Start shared infrastructure on custom ports
POSTGRES_PORT=15432 REDIS_PORT=16379 KAFKA_PORT=19092 \
  docker-compose -f docker-compose.infra.yml --profile kafka up -d

# Developer 1: Use shared infra, custom API port
DATABASE_PORT=15432 REDIS_PORT=16379 API_PORT=5016 \
  docker-compose up -d

# Developer 2: Same infra, different API port
DATABASE_PORT=15432 REDIS_PORT=16379 API_PORT=5017 \
  docker-compose up -d
```

## Port Configuration Reference

### Environment Variables

All ports are configurable via environment variables:

```bash
# Infrastructure
POSTGRES_PORT=5432
REDIS_PORT=6379
KAFKA_PORT=9092

# TestMesh
API_PORT=5016
DASHBOARD_PORT=3000

# Demo Microservices
USER_SERVICE_PORT=5001
PRODUCT_SERVICE_PORT=5002
ORDER_SERVICE_PORT=5003
NOTIFICATION_SERVICE_PORT=5004
```

### Checking Port Availability

```bash
# Check if port is in use
lsof -i :5432
netstat -an | grep 5432

# Find alternative port
for port in {5432..5442}; do
  ! lsof -i :$port && echo "Port $port is available" && break
done
```

## Networking

All Docker Compose files use a shared network: `testmesh-network`

This allows services from different compose files to communicate:

```bash
# Start infrastructure
docker-compose -f docker-compose.infra.yml up -d

# Start TestMesh (can reach postgres/redis via network)
docker-compose up -d

# Start microservices (can reach everything)
docker-compose -f docker-compose.services.yml up -d
```

### Network Architecture

```
testmesh-network (bridge)
├── postgres (testmesh-postgres)
├── redis (testmesh-redis)
├── kafka (testmesh-kafka)
├── api (testmesh-api)
├── dashboard (testmesh-dashboard)
├── user-service (testmesh-user-service)
├── product-service (testmesh-product-service)
├── order-service (testmesh-order-service)
└── notification-service (testmesh-notification-service)
```

## Troubleshooting

### Port Already in Use

```bash
# Find what's using the port
lsof -i :5432

# Kill process
kill -9 <PID>

# Or use different port
POSTGRES_PORT=5433 docker-compose -f docker-compose.infra.yml up -d
```

### Can't Connect to Database

```bash
# Check if container is running
docker ps | grep postgres

# Check logs
docker logs testmesh-postgres

# Test connection
docker exec testmesh-postgres pg_isready -U testmesh

# From host
psql postgres://testmesh:testmesh_dev@localhost:5432/testmesh
```

### Network Issues

```bash
# Recreate network
docker network rm testmesh-network
docker network create testmesh-network

# Restart services
docker-compose down
docker-compose up -d
```

### Reset Everything

```bash
# Stop all containers
docker-compose -f docker-compose.dev.yml down
docker-compose down
docker-compose -f docker-compose.infra.yml down
docker-compose -f docker-compose.services.yml down

# Remove volumes (data will be lost!)
docker volume rm testmesh_postgres_data testmesh_redis_data

# Recreate network
docker network rm testmesh-network
docker network create testmesh-network

# Fresh start
docker-compose -f docker-compose.dev.yml up -d
```

## Next Steps

- **External Services**: See [docs/deployment/EXTERNAL_SERVICES.md](docs/deployment/EXTERNAL_SERVICES.md) for cloud deployment
- **Production Deployment**: See [deploy/README.md](deploy/README.md) for Kubernetes and Helm
- **Configuration**: See [.env.example](.env.example) for all available options

## Summary

| I Want To... | Command |
|-------------|---------|
| Deploy to production with my RDS/ElastiCache | `docker-compose up -d` |
| Get started quickly with everything bundled | `docker-compose -f docker-compose.dev.yml up -d` |
| Use my local Postgres on port 5432 | `docker-compose up -d` |
| Avoid port conflicts | `API_PORT=8080 docker-compose up -d` |
| Just start databases | `docker-compose -f docker-compose.infra.yml up -d` |
| Test with demo microservices | `docker-compose -f docker-compose.services.yml up -d` |
| CI/CD testing | `docker-compose -f docker-compose.infra.yml up -d` |
