# Getting Started with TestMesh

TestMesh is a platform for writing and running end-to-end integration tests across HTTP, databases, Kafka, gRPC, and more. Tests are defined in human-readable YAML files.

## Prerequisites

- Docker installed
- Access to PostgreSQL and Redis (or use bundled services — see below)

## Option A: Pre-built Docker Image

This is the fastest way to run TestMesh. The combined image runs both the API and dashboard.

### If you already have PostgreSQL, Redis, and Kafka running in Docker

Connect TestMesh to your existing infrastructure network:

```bash
docker run -d \
  --name testmesh \
  --network <your-network> \
  -p 5016:5016 \
  -p 3000:3000 \
  -e DATABASE_URL=postgres://<user>:<password>@<host>:<port>/<db>?sslmode=disable \
  -e REDIS_URL=redis://<host>:6379 \
  -e KAFKA_ENABLED=true \
  -e KAFKA_BROKERS=<host>:9092 \
  ghcr.io/test-mesh/testmesh:latest
```

### If you don't have infrastructure running

Use the provided Docker Compose which bundles PostgreSQL and Redis:

```bash
# Download and start everything
curl -O https://raw.githubusercontent.com/test-mesh/testmesh/main/deploy/docker-compose/docker-compose.yml
docker compose up -d

# With Kafka support
docker compose --profile kafka up -d
```

### Verify it's running

```bash
curl http://localhost:5016/health
# Expected: {"status":"ok"}
```

Open the dashboard at **http://localhost:3000**.

---

## Option B: Run from Source (Local Development)

### 1. Start infrastructure

```bash
./infra.sh up
# Starts PostgreSQL (port 5432), Redis (port 6379), Kafka (port 9092)
# on the local-infra Docker network
```

### 2. Start the API and dashboard

```bash
docker-compose -f docker-compose.dev.yml up --build
# API: http://localhost:5016
# Dashboard: http://localhost:3000
```

### 3. (Optional) Start demo microservices

These are used by the example test flows:

```bash
docker-compose -f docker-compose.services.yml up --build
# User:    http://localhost:5001
# Product: http://localhost:5002
# Order:   http://localhost:5003
# Notification: http://localhost:5004
```

### 4. Seed sample data

```bash
cd api/cmd/seed
go run main.go
```

---

## Running Your First Test

Once running, use the CLI to execute a test flow:

```bash
# Install CLI dependencies
cd cli

# Run the example E2E flow
go run main.go run ../examples/microservices/e2e-order-flow.yaml
```

Or use the dashboard at **http://localhost:3000** to browse and run flows visually.

---

## Next Steps

- [Writing Your First Flow](./WRITING_YOUR_FIRST_FLOW.md) — Learn the YAML flow format
- [Using the CLI](./USING_THE_CLI.md) — All CLI commands and options
- [Docker Setup](../deployment/DOCKER_SETUP.md) — Detailed Docker deployment scenarios
- [YAML Schema Reference](../features/YAML_SCHEMA.md) — Complete flow specification
