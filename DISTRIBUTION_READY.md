# TestMesh - Distribution Ready Docker Setup

## What Changed?

TestMesh has been restructured for **easy distribution as a public Docker image** that works in any environment.

## The Problem (Before)

The original `docker-compose.yml`:
- ❌ Bundled everything (Postgres, Redis, Kafka, microservices)
- ❌ Used standard ports (5432, 6379, 9092) - conflicts with existing services
- ❌ Not suitable for production (required editing compose file)
- ❌ Forced users to run unnecessary services
- ❌ Hard to adopt - "too opinionated"

## The Solution (After)

### New Docker Compose Structure

```
docker-compose.yml          ← Production ready (just TestMesh)
docker-compose.dev.yml      ← Full stack (everything bundled)
docker-compose.infra.yml    ← Just databases
docker-compose.services.yml ← Just demo microservices
```

### Key Improvements

✅ **Default expects external services** - users typically have their own databases
✅ **All ports configurable** - avoid conflicts via environment variables
✅ **Modular composition** - use what you need
✅ **Production ready** - works with RDS, ElastiCache, etc.
✅ **Port flexibility** - `API_PORT=8080 docker-compose up`
✅ **Pre-built images** - `docker pull testmesh/api:latest`

## Usage Scenarios

### 1. Production Deployment (Most Common)

**Before** (old approach):
```bash
# Had to edit docker-compose.yml to remove bundled services
# Had to change connection strings manually
docker-compose up -d  # Would start Postgres/Redis we don't need
```

**After** (new approach):
```bash
# Just works with existing infrastructure
export DATABASE_HOST=my-rds.amazonaws.com
export REDIS_HOST=my-elasticache.amazonaws.com
docker-compose up -d  # Only starts TestMesh
```

### 2. Local Development with Existing Services

**Before**:
```bash
# Port 5432 already in use by local Postgres
# Had to stop local Postgres or edit compose file
```

**After**:
```bash
# Use my local Postgres on 5432
docker-compose up -d

# Or use bundled Postgres on different port
POSTGRES_PORT=5433 docker-compose -f docker-compose.infra.yml up -d
DATABASE_PORT=5433 docker-compose up -d
```

### 3. Quick Start / Learning

**Before**:
```bash
docker-compose up -d  # Started everything, took forever
```

**After**:
```bash
# Same experience, but explicit
docker-compose -f docker-compose.dev.yml up -d
```

## Docker Compose Files Explained

### `docker-compose.yml` (Main - Distribution Default)

**Philosophy**: Users have their own infrastructure

```yaml
services:
  api:          # TestMesh API
  dashboard:    # TestMesh Dashboard
# NO postgres, redis, kafka - expects external
```

**Configurable**:
- Database connection via env vars
- Redis connection via env vars
- Kafka connection via env vars (optional)
- All ports customizable

**Target users**:
- Production deployments
- Users with existing Postgres/Redis
- Docker Hub users
- Cloud deployments (ECS, GKE, etc.)

### `docker-compose.dev.yml` (Full Stack)

**Philosophy**: Everything bundled for convenience

```yaml
services:
  postgres:     # Bundled
  redis:        # Bundled
  kafka:        # Bundled
  api:          # TestMesh
  dashboard:    # TestMesh
  user-service: # Demo
  # ... more demo services
```

**Target users**:
- First-time users
- Local development
- Learning/demos
- No existing infrastructure

### `docker-compose.infra.yml` (Infrastructure Only)

**Philosophy**: Provide databases, users deploy apps

```yaml
services:
  postgres:     # Bundled
  redis:        # Bundled
  kafka:        # Bundled (optional)
# NO applications
```

**Target users**:
- CI/CD pipelines
- Multiple projects sharing infrastructure
- Port conflict resolution
- Hybrid deployments

### `docker-compose.services.yml` (Demo Microservices)

**Philosophy**: Demo services separate from core

```yaml
services:
  user-service:
  product-service:
  order-service:
  notification-service:
# Expects external infrastructure and TestMesh
```

**Target users**:
- E2E testing with examples
- Demonstrations
- Optional addition to any setup

## Port Configuration

### All Ports Are Now Configurable

```bash
# Main application ports
API_PORT=8080              # Default: 5016
DASHBOARD_PORT=8081        # Default: 3000

# Infrastructure ports (for bundled services)
POSTGRES_PORT=15432        # Default: 5432
REDIS_PORT=16379           # Default: 6379
KAFKA_PORT=19092           # Default: 9092

# Demo microservice ports
USER_SERVICE_PORT=6001     # Default: 5001
PRODUCT_SERVICE_PORT=6002  # Default: 5002
ORDER_SERVICE_PORT=6003    # Default: 5003
NOTIFICATION_SERVICE_PORT=6004  # Default: 5004
```

### Why This Matters

**Scenario**: User has Postgres on 5432, Redis on 6379

**Before**:
```bash
# Stop local services
sudo systemctl stop postgresql redis
# Or edit docker-compose.yml manually
```

**After**:
```bash
# Just use different ports
POSTGRES_PORT=5433 REDIS_PORT=6380 \
  docker-compose -f docker-compose.infra.yml up -d

DATABASE_PORT=5433 REDIS_PORT=6380 \
  docker-compose up -d
```

## Environment Variable Configuration

### Three Ways to Configure

**1. Command Line** (Quick testing)
```bash
DATABASE_HOST=mydb.com REDIS_HOST=myredis.com docker-compose up -d
```

**2. .env File** (Recommended)
```bash
cp .env.example .env
# Edit .env with your values
docker-compose up -d
```

**3. Shell Export** (CI/CD)
```bash
export DATABASE_HOST=mydb.com
export REDIS_HOST=myredis.com
docker-compose up -d
```

### Sample .env for Production

```bash
# Production AWS deployment
ENV=production
DATABASE_HOST=testmesh-prod.abc123.us-east-1.rds.amazonaws.com
DATABASE_SSLMODE=require
REDIS_HOST=testmesh-prod.abc123.cache.amazonaws.com
REDIS_TLS_ENABLED=true
JWT_SECRET=<generated-secret>
```

### Sample .env for Local Dev

```bash
# Use bundled services on custom ports
POSTGRES_PORT=15432
REDIS_PORT=16379
API_PORT=5016
DASHBOARD_PORT=3000
```

## Distribution Benefits

### For Docker Hub Users

```bash
# Simple one-liner to get started
docker pull testmesh/api:latest
docker pull testmesh/dashboard:latest

# Works with any Postgres/Redis
docker-compose up -d
```

### For Cloud Deployments

**AWS ECS**:
```bash
# Uses RDS and ElastiCache
# docker-compose.yml already configured for external services
```

**Google Cloud Run**:
```bash
# Uses Cloud SQL and Memorystore
# Just set DATABASE_HOST and REDIS_HOST
```

**Azure Container Instances**:
```bash
# Uses Azure Database and Azure Cache
# Environment variables match Azure naming
```

### For Kubernetes Users

Helm chart already supports external services:
```yaml
# values.yaml
database:
  external:
    enabled: true
    host: my-rds.amazonaws.com

redis:
  external:
    enabled: true
    host: my-elasticache.amazonaws.com
```

## Migration Guide

### If You're Using Current Setup

**Old setup**:
```bash
# This still works!
mv docker-compose.yml docker-compose.old.yml
git pull
mv docker-compose.old.yml docker-compose.dev.yml
docker-compose -f docker-compose.dev.yml up -d
```

**New setup** (recommended):
```bash
git pull

# Option 1: Full dev (same as before)
docker-compose -f docker-compose.dev.yml up -d

# Option 2: Just TestMesh (use your local services)
docker-compose up -d
```

## Documentation Updates

### New Files

- **`DOCKER_SETUP.md`** - Complete Docker deployment guide
  - All compose files explained
  - Port configuration
  - Common scenarios
  - Troubleshooting

- **`.env.example`** - Updated with port configuration
  - Port variables added
  - Cloud provider examples
  - All options documented

- **`README.md`** - Updated with new structure
  - Deployment options section
  - Clear use cases
  - Quick start guides

### Updated Files

- **`docker-compose.yml`** - Production ready (external services)
- **`docker-compose.dev.yml`** - Renamed from old docker-compose.yml
- **`CLAUDE.md`** - References new structure

## Comparison

| Aspect | Before | After |
|--------|--------|-------|
| **Default Behavior** | Bundle everything | Expect external services |
| **Port Conflicts** | Manual editing required | Environment variable override |
| **Production Ready** | No | Yes |
| **Docker Hub Ready** | No | Yes |
| **Modular** | No | Yes (4 compose files) |
| **Documentation** | Basic | Comprehensive |
| **Cloud Friendly** | Needs adaptation | Works out of box |
| **Configuration** | Edit compose file | Environment variables |

## Use Case Matrix

| I Want To... | Use This |
|-------------|----------|
| Deploy to production with RDS/ElastiCache | `docker-compose up -d` |
| Use my local Postgres on port 5432 | `docker-compose up -d` |
| Get everything running quickly | `docker-compose -f docker-compose.dev.yml up -d` |
| Avoid port conflicts with local services | `API_PORT=8080 docker-compose up -d` |
| Set up CI/CD pipeline | `docker-compose -f docker-compose.infra.yml up -d` |
| Test with demo microservices | `docker-compose -f docker-compose.services.yml up -d` |
| Deploy to Kubernetes | `helm install testmesh deploy/helm/testmesh` |
| Distribute to users | `docker push testmesh/api:latest` |

## Benefits Summary

### For Users
✅ **Works out of the box** with existing infrastructure
✅ **No port conflicts** - everything configurable
✅ **Flexible deployment** - choose what you need
✅ **Production ready** - follows best practices
✅ **Well documented** - clear guides for all scenarios

### For Maintainers
✅ **Easy to distribute** - Docker Hub ready
✅ **Cloud agnostic** - works on AWS, GCP, Azure
✅ **Modular** - easier to maintain separate concerns
✅ **Professional** - matches industry standards
✅ **Scalable** - from local dev to enterprise

## Next Steps

1. **Test the new setup**:
   ```bash
   docker-compose up -d
   curl http://localhost:5016/health
   ```

2. **Read the docs**:
   - [DOCKER_SETUP.md](DOCKER_SETUP.md) - Comprehensive guide
   - [docs/deployment/EXTERNAL_SERVICES.md](docs/deployment/EXTERNAL_SERVICES.md) - Cloud config

3. **Update your workflow**:
   - Local dev: Use `docker-compose.dev.yml`
   - Production: Use `docker-compose.yml` with external services
   - CI/CD: Use `docker-compose.infra.yml` for test databases

4. **Publish Docker images**:
   ```bash
   docker build -t testmesh/api:latest ./api
   docker build -t testmesh/dashboard:latest ./dashboard
   docker push testmesh/api:latest
   docker push testmesh/dashboard:latest
   ```

## Questions?

See [DOCKER_SETUP.md](DOCKER_SETUP.md) for detailed documentation and troubleshooting.
