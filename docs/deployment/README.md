# Deployment Documentation

This directory contains guides for deploying TestMesh in various environments.

## Quick Links

- **[External Services Configuration](EXTERNAL_SERVICES.md)** - Connect to external PostgreSQL, Redis, and Kafka
- **[Deployment Guide](/deploy/README.md)** - Docker Compose, Kubernetes, and Helm deployment instructions

## Deployment Options

### 1. Docker Compose

**Best for**: Local development, small deployments, demos

```bash
cd deploy/docker-compose
docker-compose up -d
```

See: [/deploy/README.md](/deploy/README.md)

### 2. Kubernetes

**Best for**: Production deployments, enterprise environments

```bash
kubectl apply -k deploy/kubernetes/overlays/prod/
```

See: [/deploy/README.md](/deploy/README.md#kubernetes-deployment)

### 3. Helm

**Best for**: Kubernetes deployments with customization

```bash
helm install testmesh deploy/helm/testmesh -f my-values.yaml
```

See: [/deploy/README.md](/deploy/README.md#helm-chart-configuration)

## Infrastructure Modes

### Bundled Services (Development)

Uses Docker containers for all infrastructure:
- PostgreSQL
- Redis
- Kafka (optional)

**Pros**: Easy setup, no external dependencies
**Cons**: Not suitable for production, limited scalability

### External Services (Production)

Connects to managed cloud services:
- AWS: RDS, ElastiCache, MSK
- GCP: Cloud SQL, Memorystore
- Azure: Database, Cache, Event Hubs
- Confluent Cloud (Kafka)

**Pros**: Production-ready, highly available, managed backups
**Cons**: Requires cloud account, costs money

**Configuration**: [EXTERNAL_SERVICES.md](EXTERNAL_SERVICES.md)

## Configuration Approaches

### Environment Variables

Direct configuration via env vars:

```bash
export DATABASE_HOST=my-db.example.com
export DATABASE_PASSWORD=secure_password
export REDIS_HOST=my-cache.example.com
```

### .env File

Copy and customize the template:

```bash
cp .env.example .env
# Edit .env with your values
```

### Kubernetes Secrets

Store credentials securely:

```bash
kubectl create secret generic testmesh-secrets \
  --from-literal=database-url='postgres://...' \
  --from-literal=redis-url='redis://...'
```

### Helm Values

Configure via values.yaml:

```yaml
database:
  external:
    enabled: true
    host: my-db.example.com
```

## Security Considerations

### Required for Production

- ✅ Use SSL/TLS for all connections
- ✅ Store secrets in secret managers (Vault, AWS Secrets Manager, etc.)
- ✅ Rotate credentials regularly (every 90 days)
- ✅ Use strong passwords (32+ characters, random)
- ✅ Enable authentication on Redis
- ✅ Use SASL authentication for Kafka
- ✅ Restrict network access (security groups, firewalls)
- ✅ Monitor connection failures

### Network Security

- Deploy databases in private subnets
- Use VPC peering or private endpoints
- Restrict ingress to necessary IPs/ports only
- Enable audit logging

See: [EXTERNAL_SERVICES.md#security-best-practices](EXTERNAL_SERVICES.md#security-best-practices)

## Cloud Provider Guides

Each cloud provider has specific configuration requirements:

### AWS

- **PostgreSQL**: RDS with SSL
- **Redis**: ElastiCache with TLS and auth tokens
- **Kafka**: MSK with IAM or SASL authentication

[See AWS examples →](EXTERNAL_SERVICES.md#aws-rds-elasticache-msk)

### GCP

- **PostgreSQL**: Cloud SQL with SSL or Cloud SQL Proxy
- **Redis**: Memorystore (private VPC)
- **Kafka**: Confluent Cloud or self-hosted

[See GCP examples →](EXTERNAL_SERVICES.md#gcp-cloud-sql-memorystore-pubsub)

### Azure

- **PostgreSQL**: Azure Database with SSL
- **Redis**: Azure Cache with TLS
- **Kafka**: Event Hubs (Kafka-compatible)

[See Azure examples →](EXTERNAL_SERVICES.md#azure-azure-database-azure-cache-event-hubs)

## Environment Variables Reference

Complete list of configuration variables:

| Service | Variables | Documentation |
|---------|-----------|---------------|
| PostgreSQL | `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, etc. | [Ref →](EXTERNAL_SERVICES.md#postgresql-configuration) |
| Redis | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, etc. | [Ref →](EXTERNAL_SERVICES.md#redis-configuration) |
| Kafka | `KAFKA_BROKERS`, `KAFKA_SASL_USERNAME`, etc. | [Ref →](EXTERNAL_SERVICES.md#kafka-configuration) |

See: [Complete environment variable table →](EXTERNAL_SERVICES.md#environment-variables-reference)

## Troubleshooting

### Connection Issues

**Database connection failed**:
```bash
# Check connectivity
psql "postgres://user:pass@host:5432/testmesh"

# Verify environment variables
docker logs testmesh-api | grep DATABASE
```

**Redis connection timeout**:
```bash
# Test Redis connection
redis-cli -h host -p 6379 -a password PING

# Check TLS settings
# Ensure REDIS_TLS_ENABLED matches your Redis configuration
```

**Kafka broker unreachable**:
```bash
# List topics to test connectivity
kafka-topics --bootstrap-server host:9092 --list

# Check SASL/TLS settings match broker configuration
```

See: [Complete troubleshooting guide →](EXTERNAL_SERVICES.md#troubleshooting)

## Migration Guide

Moving from bundled to external services:

1. **Backup data** from bundled containers
2. **Provision** external services (RDS, ElastiCache, etc.)
3. **Restore data** to external services
4. **Update configuration** with new connection details
5. **Deploy** and validate
6. **Monitor** for issues

See: [Step-by-step migration guide →](EXTERNAL_SERVICES.md#migration-from-bundled-to-external)

## Health Checks

Verify all services are connected:

```bash
# API health endpoint
curl http://localhost:5016/health

# Expected response:
{
  "status": "healthy",
  "services": {
    "database": "connected",
    "redis": "connected",
    "kafka": "connected"
  }
}
```

## Monitoring

### Metrics

- Database connection pool usage
- Redis hit/miss rates
- Kafka lag and throughput
- API request latency

### Logging

Check logs for connection errors:

```bash
# Docker Compose
docker-compose logs -f api

# Kubernetes
kubectl logs -f deployment/testmesh-api
```

## Additional Resources

- **Architecture**: [/docs/architecture/ARCHITECTURE.md](/docs/architecture/ARCHITECTURE.md)
- **YAML Schema**: [/docs/features/YAML_SCHEMA.md](/docs/features/YAML_SCHEMA.md)
- **Microservices**: [/services/README.md](/services/README.md)
- **Project Guide**: [/CLAUDE.md](/CLAUDE.md)

## Support

- **Issues**: https://github.com/testmesh/testmesh/issues
- **Discussions**: https://github.com/testmesh/testmesh/discussions
- **Documentation**: https://testmesh.dev/docs
