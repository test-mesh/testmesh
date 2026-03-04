# TestMesh Deployment

This directory contains production-ready deployment configurations for TestMesh.

## Directory Structure

```
deploy/
├── docker/              # Docker build files
├── docker-compose/      # Docker Compose configurations
├── kubernetes/          # Kubernetes manifests (Kustomize)
├── helm/                # Helm charts
└── README.md           # This file
```

## Quick Start

### Docker Compose (Production)

```bash
# Build and start with bundled services
cd deploy/docker-compose
docker-compose up -d

# Build and start with monitoring
docker-compose --profile monitoring up -d

# Build and start with Kafka
docker-compose --profile kafka up -d

# Access services
# API: http://localhost:5016
# Dashboard: http://localhost:3000
# Prometheus: http://localhost:9090 (with monitoring profile)
# Grafana: http://localhost:3001 (with monitoring profile)
```

### Kubernetes (Kustomize)

```bash
# Deploy to development environment
kubectl apply -k kubernetes/overlays/dev/

# Deploy to production (create overlay first)
kubectl apply -k kubernetes/overlays/prod/

# Check status
kubectl get pods -l app=testmesh
kubectl get svc -l app=testmesh
```

### Helm

```bash
# Add TestMesh Helm repo (future - when published)
helm repo add testmesh https://charts.testmesh.dev
helm repo update

# Install with default values (bundled services)
helm install testmesh testmesh/testmesh

# Install with custom values
helm install testmesh testmesh/testmesh -f my-values.yaml

# Or install from local chart
cd deploy/helm
helm install testmesh ./testmesh -f values.yaml

# Upgrade
helm upgrade testmesh testmesh/testmesh -f my-values.yaml

# Uninstall
helm uninstall testmesh
```

## Deployment Modes

### Development Mode

- Uses bundled PostgreSQL, Redis (optional Kafka)
- Hot reload enabled (docker-compose.dev.yml)
- Debug logging
- Suitable for: Local development, testing

**Start**:
```bash
cd deploy/docker-compose
docker-compose -f docker-compose.dev.yml up
```

### Test Mode

- Isolated environment for CI/CD
- Ephemeral data (no volumes)
- Fast startup
- Suitable for: CI pipelines, automated testing

**Start**:
```bash
cd deploy/docker-compose
docker-compose -f docker-compose.test.yml up
```

### Production Mode

- Optimized builds
- Health checks and restart policies
- Resource limits
- Optional profiles for monitoring/tracing
- Suitable for: Staging, production

**Start**:
```bash
cd deploy/docker-compose
docker-compose up -d
```

## External Services Configuration

TestMesh supports connecting to external PostgreSQL, Redis, and Kafka instead of bundled containers.

**When to use external services:**
- Production deployments requiring HA
- Managed cloud services (AWS RDS, ElastiCache, MSK)
- Existing infrastructure
- Better scalability and reliability

**📖 See detailed guide**: [External Services Documentation](/docs/deployment/EXTERNAL_SERVICES.md)

### Quick Examples

**Docker Compose with AWS RDS + ElastiCache**:
```yaml
services:
  api:
    image: testmesh/api:latest
    environment:
      - DATABASE_HOST=mydb.abc123.us-east-1.rds.amazonaws.com
      - DATABASE_PORT=5432
      - DATABASE_USER=testmesh
      - DATABASE_PASSWORD=${DB_PASSWORD}
      - DATABASE_SSLMODE=require
      - REDIS_HOST=mycache.abc123.cache.amazonaws.com
      - REDIS_PORT=6379
      - REDIS_TLS_ENABLED=true
  # Remove postgres and redis services
```

**Helm with External Services**:
```yaml
# values.yaml
database:
  external:
    enabled: true
    host: my-postgres.example.com
    port: 5432
    username: testmesh
    password: secure_password
  postgresql:
    enabled: false

redis:
  external:
    enabled: true
    host: my-redis.example.com
    port: 6379
  bundled:
    enabled: false
```

## Docker Compose Profiles

Profiles allow optional services to be started on-demand:

| Profile | Services | Usage |
|---------|----------|-------|
| `kafka` | Kafka + Zookeeper | `docker-compose --profile kafka up` |
| `tracing` | Jaeger | `docker-compose --profile tracing up` |
| `monitoring` | Prometheus + Grafana | `docker-compose --profile monitoring up` |

**Start multiple profiles**:
```bash
docker-compose --profile kafka --profile monitoring up -d
```

## Kubernetes Deployment

### Prerequisites

- Kubernetes 1.24+
- kubectl configured
- Ingress controller (nginx recommended)
- Optional: cert-manager for TLS

### Kustomize Structure

```
kubernetes/
├── base/
│   ├── deployment.yaml       # Core deployments
│   ├── service.yaml          # Services
│   └── kustomization.yaml    # Base kustomization
└── overlays/
    ├── dev/
    │   ├── kustomization.yaml
    │   └── resources-patch.yaml  # Lower resource limits
    └── prod/
        ├── kustomization.yaml
        └── resources-patch.yaml  # Production settings
```

### Create Secrets

```bash
# Create secrets for external services
kubectl create secret generic testmesh-secrets \
  --from-literal=database-url='postgres://user:pass@host:5432/testmesh?sslmode=require' \
  --from-literal=redis-url='redis://:password@host:6379/0' \
  --from-literal=jwt-secret='your-secret-key' \
  --from-literal=openai-api-key='your-openai-key' \
  --from-literal=anthropic-api-key='your-anthropic-key'
```

### Deploy

```bash
# Deploy to development
kubectl apply -k kubernetes/overlays/dev/

# Watch deployment
kubectl get pods -w

# Check logs
kubectl logs -f deployment/testmesh-api

# Port forward for testing
kubectl port-forward svc/testmesh-api 5016:5016
kubectl port-forward svc/testmesh-dashboard 3000:3000
```

### Ingress

Create ingress for external access:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: testmesh-ingress
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - testmesh.example.com
    secretName: testmesh-tls
  rules:
  - host: testmesh.example.com
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: testmesh-api
            port:
              number: 5016
      - path: /
        pathType: Prefix
        backend:
          service:
            name: testmesh-dashboard
            port:
              number: 3000
```

## Helm Chart Configuration

### Values Structure

Key sections in `values.yaml`:

```yaml
# Replica counts
replicaCount:
  api: 2
  web: 2

# Docker images
image:
  api:
    repository: testmesh/api
    tag: latest

# Resource limits
resources:
  api:
    limits:
      cpu: 1000m
      memory: 1Gi

# External services
database:
  external:
    enabled: false  # Set true for external DB
    url: ""

redis:
  external:
    enabled: false  # Set true for external Redis

# Ingress
ingress:
  enabled: true
  className: nginx
  hosts:
    - host: testmesh.local

# Autoscaling
autoscaling:
  enabled: false
  minReplicas: 2
  maxReplicas: 10
```

### Common Helm Operations

```bash
# Install with custom values
helm install testmesh ./helm/testmesh \
  --set image.api.tag=v1.2.3 \
  --set replicaCount.api=3 \
  --set database.external.enabled=true

# Upgrade release
helm upgrade testmesh ./helm/testmesh -f my-values.yaml

# Rollback
helm rollback testmesh

# View values
helm get values testmesh

# Uninstall
helm uninstall testmesh
```

## Environment Variables

### Core Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENV` | `production` | Environment: development, staging, production |
| `PORT` | `5016` | API server port |
| `LOG_LEVEL` | `info` | Log level: debug, info, warn, error |
| `JWT_SECRET` | - | JWT signing secret (required) |

### Infrastructure

See [External Services Documentation](/docs/deployment/EXTERNAL_SERVICES.md) for complete reference.

**PostgreSQL**: `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, etc.
**Redis**: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, etc.
**Kafka**: `KAFKA_BROKERS`, `KAFKA_SASL_USERNAME`, etc.

## Security Best Practices

### Secrets Management

- **Never commit secrets** to version control
- Use secret managers (AWS Secrets Manager, Vault, etc.)
- Rotate credentials regularly (every 90 days)
- Use least privilege access

### Network Security

- Deploy databases in private subnets
- Use VPC peering or private endpoints
- Enable SSL/TLS for all services
- Restrict ingress to necessary ports only

### Container Security

- Run containers as non-root user
- Use minimal base images (alpine)
- Scan images for vulnerabilities
- Keep images updated

### Kubernetes Security

- Use Network Policies to restrict pod communication
- Enable Pod Security Standards
- Use RBAC for access control
- Enable audit logging

## Monitoring & Observability

### Metrics (Prometheus)

Start with monitoring profile:
```bash
docker-compose --profile monitoring up -d
```

Access Prometheus: http://localhost:9090

**Key metrics**:
- API request rate/latency
- Database connection pool usage
- Redis hit/miss rate
- Test execution duration

### Dashboards (Grafana)

Access Grafana: http://localhost:3001 (admin/admin)

**Pre-configured dashboards**:
- API Performance
- Infrastructure Health
- Test Execution Metrics

### Distributed Tracing (Jaeger)

Start with tracing profile:
```bash
docker-compose --profile tracing up -d
```

Access Jaeger: http://localhost:16686

### Logs

**Docker Compose**:
```bash
# View API logs
docker-compose logs -f api

# View all logs
docker-compose logs -f
```

**Kubernetes**:
```bash
# View pod logs
kubectl logs -f deployment/testmesh-api

# View logs from all replicas
kubectl logs -f -l app=testmesh,component=api

# Stern (multi-pod log tailing)
stern testmesh
```

## Scaling

### Docker Compose

```bash
# Scale API containers
docker-compose up -d --scale api=3

# Note: Requires load balancer in front
```

### Kubernetes

```bash
# Manual scaling
kubectl scale deployment testmesh-api --replicas=5

# Auto-scaling (HPA)
kubectl autoscale deployment testmesh-api \
  --cpu-percent=70 \
  --min=2 \
  --max=10
```

### Helm

```yaml
# values.yaml
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
```

## Troubleshooting

### API won't start

```bash
# Check logs
docker-compose logs api

# Common issues:
# - Database connection failed → verify DATABASE_* env vars
# - Redis connection failed → verify REDIS_* env vars
# - Port already in use → change PORT env var
```

### Database migrations fail

```bash
# Run migrations manually
docker-compose exec api ./testmesh-api migrate up

# Check migration status
docker-compose exec api ./testmesh-api migrate status
```

### Cannot connect to Kafka

```bash
# Verify Kafka is running
docker-compose ps kafka

# Check Kafka logs
docker-compose logs kafka

# Test connection from API container
docker-compose exec api kafka-console-consumer \
  --bootstrap-server kafka:9092 \
  --topic test --from-beginning
```

### Health check failing

```bash
# Check health endpoint
curl http://localhost:5016/health

# Expected response:
# {"status":"healthy","services":{"database":"connected","redis":"connected"}}
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Build Docker images
        run: |
          docker build -t testmesh/api:${{ github.sha }} -f deploy/docker/Dockerfile.api .
          docker build -t testmesh/dashboard:${{ github.sha }} -f deploy/docker/Dockerfile.dashboard .

      - name: Push to registry
        run: |
          docker push testmesh/api:${{ github.sha }}
          docker push testmesh/dashboard:${{ github.sha }}

      - name: Deploy with Helm
        run: |
          helm upgrade testmesh ./deploy/helm/testmesh \
            --set image.api.tag=${{ github.sha }} \
            --set image.dashboard.tag=${{ github.sha }}
```

## Support & Documentation

- **External Services**: [/docs/deployment/EXTERNAL_SERVICES.md](/docs/deployment/EXTERNAL_SERVICES.md)
- **Architecture**: [/docs/architecture/ARCHITECTURE.md](/docs/architecture/ARCHITECTURE.md)
- **Contributing**: [/CONTRIBUTING.md](/CONTRIBUTING.md)
- **GitHub Issues**: https://github.com/testmesh/testmesh/issues

## License

See [LICENSE](/LICENSE) for details.
