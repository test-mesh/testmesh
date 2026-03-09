# External Services Configuration

This guide explains how to configure TestMesh to connect to external PostgreSQL, Redis, and Kafka services instead of using the bundled Docker containers.

## Overview

TestMesh supports three deployment modes for infrastructure services:

- **Bundled** (default): Services run in Docker containers via docker-compose
- **External**: Connect to managed services (AWS RDS, ElastiCache, MSK, etc.)
- **Hybrid**: Mix of bundled and external (e.g., external Postgres, bundled Redis)

**When to use external services:**
- Production deployments requiring high availability
- Compliance requirements for managed databases
- Existing infrastructure you want to reuse
- Better backup/monitoring/scaling capabilities
- Reduced operational overhead

## Table of Contents

- [PostgreSQL Configuration](#postgresql-configuration)
- [Redis Configuration](#redis-configuration)
- [Kafka Configuration](#kafka-configuration)
- [Cloud Provider Examples](#cloud-provider-examples)
- [Environment Variables Reference](#environment-variables-reference)
- [Security Best Practices](#security-best-practices)
- [Connection Validation](#connection-validation)

---

## PostgreSQL Configuration

### Requirements

- PostgreSQL 15 or higher (14+ supported)
- Database and user created with appropriate permissions
- Network access from TestMesh API
- SSL/TLS recommended for production

### Environment Variables

TestMesh supports two configuration styles:

**Style 1: Individual Parameters** (recommended)
```bash
DATABASE_HOST=my-postgres.example.com
DATABASE_PORT=5432
DATABASE_USER=testmesh
DATABASE_PASSWORD=secure_password
DATABASE_DBNAME=testmesh
DATABASE_SSLMODE=require
DATABASE_MAX_CONNS=25
DATABASE_MAX_IDLE=5
```

**Style 2: Connection URL**
```bash
DATABASE_URL=postgres://testmesh:secure_password@my-postgres.example.com:5432/testmesh?sslmode=require
```

### Database Setup

1. **Create Database and User**:
```sql
-- Connect as superuser
CREATE DATABASE testmesh;
CREATE USER testmesh WITH ENCRYPTED PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE testmesh TO testmesh;

-- Connect to testmesh database
\c testmesh

-- Grant schema permissions
GRANT ALL ON SCHEMA public TO testmesh;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO testmesh;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO testmesh;
```

2. **For Microservices** (if using demo services):
```sql
-- Each microservice uses its own schema
CREATE SCHEMA user_service;
CREATE SCHEMA product_service;
CREATE SCHEMA order_service;
CREATE SCHEMA notification_service;

-- Grant permissions
GRANT ALL ON SCHEMA user_service TO testmesh;
GRANT ALL ON SCHEMA product_service TO testmesh;
GRANT ALL ON SCHEMA order_service TO testmesh;
GRANT ALL ON SCHEMA notification_service TO testmesh;
```

3. **Migrations**: TestMesh automatically runs migrations on startup.

### SSL/TLS Configuration

**SSL Modes** (for `DATABASE_SSLMODE`):
- `disable` - No SSL (local dev only)
- `require` - Require SSL, don't verify certificate
- `verify-ca` - Require SSL, verify CA
- `verify-full` - Require SSL, verify CA and hostname (recommended for production)

**With Custom CA Certificate**:
```bash
DATABASE_SSLMODE=verify-full
DATABASE_SSLROOTCERT=/path/to/ca-certificate.crt
```

### Docker Compose Example

```yaml
services:
  api:
    image: testmesh/api:latest
    environment:
      - DATABASE_HOST=my-rds-instance.abc123.us-east-1.rds.amazonaws.com
      - DATABASE_PORT=5432
      - DATABASE_USER=testmesh
      - DATABASE_PASSWORD=${DB_PASSWORD}  # From .env file
      - DATABASE_DBNAME=testmesh
      - DATABASE_SSLMODE=require
      - DATABASE_MAX_CONNS=50
```

### Kubernetes Example

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: testmesh-secrets
type: Opaque
stringData:
  database-url: postgres://testmesh:secure_password@my-postgres.example.com:5432/testmesh?sslmode=require
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: testmesh-api
spec:
  template:
    spec:
      containers:
      - name: api
        image: testmesh/api:latest
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: testmesh-secrets
              key: database-url
```

### Helm Example

```yaml
# values.yaml
database:
  external:
    enabled: true
    host: my-postgres.example.com
    port: 5432
    username: testmesh
    password: secure_password
    database: testmesh
    sslmode: require
  postgresql:
    enabled: false  # Disable bundled postgres
```

---

## Redis Configuration

### Requirements

- Redis 6.0 or higher (7.0+ recommended)
- Network access from TestMesh API
- TLS recommended for production

### Environment Variables

**Individual Parameters**:
```bash
REDIS_HOST=my-redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=secure_redis_password
REDIS_DB=0
REDIS_TLS_ENABLED=true
```

**Connection URL**:
```bash
REDIS_URL=redis://user:secure_redis_password@my-redis.example.com:6379/0
# Or with TLS:
REDIS_URL=rediss://user:secure_redis_password@my-redis.example.com:6380/0
```

### Redis Setup

TestMesh uses Redis for:
- Job queue (scheduler)
- Distributed locking
- Caching
- Real-time WebSocket state

**Recommended Configuration**:
```redis
# redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru
appendonly yes
appendfsync everysec
```

**No special setup required** - TestMesh creates keys as needed.

### Docker Compose Example

```yaml
services:
  api:
    image: testmesh/api:latest
    environment:
      - REDIS_HOST=my-elasticache.abc123.cache.amazonaws.com
      - REDIS_PORT=6379
      - REDIS_PASSWORD=${REDIS_PASSWORD}
      - REDIS_TLS_ENABLED=true
```

### Kubernetes Example

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: testmesh-secrets
type: Opaque
stringData:
  redis-url: rediss://:secure_password@my-redis.example.com:6380/0
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: testmesh-api
spec:
  template:
    spec:
      containers:
      - name: api
        env:
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: testmesh-secrets
              key: redis-url
```

### Helm Example

```yaml
# values.yaml
redis:
  external:
    enabled: true
    host: my-redis.example.com
    port: 6379
    password: secure_password
    tls: true
  bundled:
    enabled: false  # Disable bundled redis
```

---

## Kafka Configuration

### Requirements

- Kafka 2.8+ (KRaft mode) or 3.0+ recommended
- Network access from TestMesh API
- SASL/TLS recommended for production

### Environment Variables

```bash
# Basic Configuration
KAFKA_ENABLED=true
KAFKA_BROKERS=broker1.example.com:9092,broker2.example.com:9092,broker3.example.com:9092

# SASL Authentication (optional)
KAFKA_SASL_ENABLED=true
KAFKA_SASL_MECHANISM=PLAIN  # or SCRAM-SHA-256, SCRAM-SHA-512
KAFKA_SASL_USERNAME=testmesh
KAFKA_SASL_PASSWORD=secure_kafka_password

# TLS Configuration (optional)
KAFKA_TLS_ENABLED=true
KAFKA_TLS_SKIP_VERIFY=false
```

### Kafka Setup

**Topics**: TestMesh creates topics automatically when using `kafka_producer` action. No pre-configuration needed.

**For Production**: Pre-create topics with appropriate settings:
```bash
# Example: Create topic with replication
kafka-topics --bootstrap-server broker:9092 \
  --create \
  --topic test-events \
  --partitions 3 \
  --replication-factor 3 \
  --config retention.ms=604800000  # 7 days
```

### Docker Compose Example

```yaml
services:
  api:
    image: testmesh/api:latest
    environment:
      - KAFKA_ENABLED=true
      - KAFKA_BROKERS=b-1.mycluster.abc123.kafka.us-east-1.amazonaws.com:9092,b-2.mycluster.abc123.kafka.us-east-1.amazonaws.com:9092
      - KAFKA_SASL_ENABLED=true
      - KAFKA_SASL_MECHANISM=SCRAM-SHA-512
      - KAFKA_SASL_USERNAME=testmesh
      - KAFKA_SASL_PASSWORD=${KAFKA_PASSWORD}
      - KAFKA_TLS_ENABLED=true
```

### Kubernetes Example

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: testmesh-config
data:
  kafka-brokers: "broker1:9092,broker2:9092,broker3:9092"
---
apiVersion: v1
kind: Secret
metadata:
  name: testmesh-secrets
type: Opaque
stringData:
  kafka-username: testmesh
  kafka-password: secure_password
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: testmesh-api
spec:
  template:
    spec:
      containers:
      - name: api
        env:
        - name: KAFKA_ENABLED
          value: "true"
        - name: KAFKA_BROKERS
          valueFrom:
            configMapKeyRef:
              name: testmesh-config
              key: kafka-brokers
        - name: KAFKA_SASL_ENABLED
          value: "true"
        - name: KAFKA_SASL_USERNAME
          valueFrom:
            secretKeyRef:
              name: testmesh-secrets
              key: kafka-username
        - name: KAFKA_SASL_PASSWORD
          valueFrom:
            secretKeyRef:
              name: testmesh-secrets
              key: kafka-password
```

### Helm Example

```yaml
# values.yaml
kafka:
  external:
    enabled: true
    brokers:
      - broker1.example.com:9092
      - broker2.example.com:9092
    sasl:
      enabled: true
      mechanism: SCRAM-SHA-512
      username: testmesh
      password: secure_password
    tls:
      enabled: true
  bundled:
    enabled: false  # Disable bundled kafka
```

---

## Cloud Provider Examples

### AWS (RDS, ElastiCache, MSK)

**RDS PostgreSQL**:
```bash
DATABASE_HOST=testmesh-db.abc123.us-east-1.rds.amazonaws.com
DATABASE_PORT=5432
DATABASE_USER=testmesh
DATABASE_PASSWORD=your_password
DATABASE_DBNAME=testmesh
DATABASE_SSLMODE=require
```

**ElastiCache Redis** (without auth):
```bash
REDIS_HOST=testmesh.abc123.cache.amazonaws.com
REDIS_PORT=6379
REDIS_TLS_ENABLED=false
```

**ElastiCache Redis** (with auth token):
```bash
REDIS_HOST=testmesh.abc123.cache.amazonaws.com
REDIS_PORT=6379
REDIS_PASSWORD=your_auth_token
REDIS_TLS_ENABLED=true
```

**MSK (Managed Kafka)**:

*IAM Authentication*:
```bash
KAFKA_BROKERS=b-1.mycluster.abc123.kafka.us-east-1.amazonaws.com:9098,b-2.mycluster.abc123.kafka.us-east-1.amazonaws.com:9098
KAFKA_SASL_ENABLED=true
KAFKA_SASL_MECHANISM=AWS_MSK_IAM
KAFKA_TLS_ENABLED=true
```

*SASL/SCRAM Authentication*:
```bash
KAFKA_BROKERS=b-1.mycluster.abc123.kafka.us-east-1.amazonaws.com:9096,b-2.mycluster.abc123.kafka.us-east-1.amazonaws.com:9096
KAFKA_SASL_ENABLED=true
KAFKA_SASL_MECHANISM=SCRAM-SHA-512
KAFKA_SASL_USERNAME=testmesh
KAFKA_SASL_PASSWORD=your_password
KAFKA_TLS_ENABLED=true
```

**IAM Roles**: Attach appropriate IAM policies to your ECS task role or EKS service account.

### GCP (Cloud SQL, Memorystore, Pub/Sub)

**Cloud SQL PostgreSQL** (with Cloud SQL Proxy):
```bash
# Use Unix socket
DATABASE_HOST=/cloudsql/project:region:instance
DATABASE_PORT=5432
DATABASE_USER=testmesh
DATABASE_PASSWORD=your_password
DATABASE_DBNAME=testmesh

# Or use Cloud SQL Proxy sidecar
DATABASE_HOST=127.0.0.1
DATABASE_PORT=5432
```

**Cloud SQL PostgreSQL** (public IP with SSL):
```bash
DATABASE_HOST=35.123.45.67
DATABASE_PORT=5432
DATABASE_USER=testmesh
DATABASE_PASSWORD=your_password
DATABASE_DBNAME=testmesh
DATABASE_SSLMODE=verify-ca
DATABASE_SSLROOTCERT=/secrets/server-ca.pem
DATABASE_SSLCERT=/secrets/client-cert.pem
DATABASE_SSLKEY=/secrets/client-key.pem
```

**Memorystore Redis**:
```bash
REDIS_HOST=10.0.0.3  # Private IP
REDIS_PORT=6379
REDIS_TLS_ENABLED=false  # Memorystore uses private VPC
```

**Note**: GCP doesn't have managed Kafka. Consider Confluent Cloud or self-hosted Kafka on GKE.

### Azure (Azure Database, Azure Cache, Event Hubs)

**Azure Database for PostgreSQL**:
```bash
DATABASE_HOST=testmesh-db.postgres.database.azure.com
DATABASE_PORT=5432
DATABASE_USER=testmesh@testmesh-db  # Note the @servername suffix
DATABASE_PASSWORD=your_password
DATABASE_DBNAME=testmesh
DATABASE_SSLMODE=require
```

**Azure Cache for Redis**:
```bash
REDIS_HOST=testmesh.redis.cache.windows.net
REDIS_PORT=6380  # SSL port
REDIS_PASSWORD=your_primary_key
REDIS_TLS_ENABLED=true
```

**Azure Event Hubs** (Kafka-compatible):
```bash
KAFKA_BROKERS=testmesh.servicebus.windows.net:9093
KAFKA_SASL_ENABLED=true
KAFKA_SASL_MECHANISM=PLAIN
KAFKA_SASL_USERNAME=$ConnectionString
KAFKA_SASL_PASSWORD=Endpoint=sb://testmesh.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=your_key
KAFKA_TLS_ENABLED=true
```

### Confluent Cloud (Managed Kafka)

```bash
KAFKA_BROKERS=pkc-abc123.us-east-1.aws.confluent.cloud:9092
KAFKA_SASL_ENABLED=true
KAFKA_SASL_MECHANISM=PLAIN
KAFKA_SASL_USERNAME=your_api_key
KAFKA_SASL_PASSWORD=your_api_secret
KAFKA_TLS_ENABLED=true
```

### Aiven (Managed Services)

**Aiven PostgreSQL**:
```bash
DATABASE_HOST=testmesh-project.aivencloud.com
DATABASE_PORT=12345
DATABASE_USER=avnadmin
DATABASE_PASSWORD=your_password
DATABASE_DBNAME=testmesh
DATABASE_SSLMODE=require
```

**Aiven Redis**:
```bash
REDIS_URL=rediss://default:your_password@testmesh-project.aivencloud.com:12345
```

**Aiven Kafka**:
```bash
KAFKA_BROKERS=testmesh-project.aivencloud.com:12345
KAFKA_SASL_ENABLED=true
KAFKA_SASL_MECHANISM=PLAIN
KAFKA_SASL_USERNAME=avnadmin
KAFKA_SASL_PASSWORD=your_password
KAFKA_TLS_ENABLED=true
```

---

## Environment Variables Reference

### Complete List

| Variable | Default | Description |
|----------|---------|-------------|
| **PostgreSQL** | | |
| `DATABASE_HOST` | `localhost` | Database hostname |
| `DATABASE_PORT` | `5432` | Database port |
| `DATABASE_USER` | `testmesh` | Database username |
| `DATABASE_PASSWORD` | `testmesh` | Database password |
| `DATABASE_DBNAME` | `testmesh` | Database name |
| `DATABASE_SSLMODE` | `disable` | SSL mode: `disable`, `require`, `verify-ca`, `verify-full` |
| `DATABASE_MAX_CONNS` | `25` | Max connection pool size |
| `DATABASE_MAX_IDLE` | `5` | Max idle connections |
| `DATABASE_URL` | - | Full connection string (alternative to individual params) |
| **Redis** | | |
| `REDIS_HOST` | `localhost` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | - | Redis password (optional) |
| `REDIS_DB` | `0` | Redis database number |
| `REDIS_TLS_ENABLED` | `false` | Enable TLS/SSL |
| `REDIS_URL` | - | Full connection URL (alternative) |
| **Kafka** | | |
| `KAFKA_ENABLED` | `false` | Enable Kafka support |
| `KAFKA_BROKERS` | - | Comma-separated broker list |
| `KAFKA_SASL_ENABLED` | `false` | Enable SASL authentication |
| `KAFKA_SASL_MECHANISM` | `PLAIN` | SASL mechanism: `PLAIN`, `SCRAM-SHA-256`, `SCRAM-SHA-512`, `AWS_MSK_IAM` |
| `KAFKA_SASL_USERNAME` | - | SASL username |
| `KAFKA_SASL_PASSWORD` | - | SASL password |
| `KAFKA_TLS_ENABLED` | `false` | Enable TLS/SSL |
| `KAFKA_TLS_SKIP_VERIFY` | `false` | Skip TLS certificate verification (not recommended) |

### Configuration Precedence

1. **Environment variables** (highest priority)
2. **Config file** (`config.yaml` in current directory or `./config/`)
3. **Default values** (lowest priority)

### Example .env File

```bash
# PostgreSQL
DATABASE_HOST=my-postgres.example.com
DATABASE_PORT=5432
DATABASE_USER=testmesh
DATABASE_PASSWORD=secure_db_password
DATABASE_DBNAME=testmesh
DATABASE_SSLMODE=require
DATABASE_MAX_CONNS=50

# Redis
REDIS_HOST=my-redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=secure_redis_password
REDIS_TLS_ENABLED=true

# Kafka
KAFKA_ENABLED=true
KAFKA_BROKERS=broker1:9092,broker2:9092,broker3:9092
KAFKA_SASL_ENABLED=true
KAFKA_SASL_MECHANISM=SCRAM-SHA-512
KAFKA_SASL_USERNAME=testmesh
KAFKA_SASL_PASSWORD=secure_kafka_password
KAFKA_TLS_ENABLED=true

# Application
ENV=production
LOG_LEVEL=info
PORT=5016
JWT_SECRET=your_jwt_secret
```

---

## Security Best Practices

### 1. Credentials Management

**Never commit secrets to git**:
```bash
# .gitignore
.env
*.env
secrets/
```

**Use secret management**:
- AWS Secrets Manager
- GCP Secret Manager
- Azure Key Vault
- HashiCorp Vault
- Kubernetes Secrets

**Rotate credentials regularly**:
- Database passwords: Every 90 days
- Redis passwords: Every 90 days
- Kafka credentials: Every 90 days
- JWT secrets: When compromised

### 2. Network Security

**Use private networks**:
- Place databases in private subnets
- Use VPC peering or private endpoints
- Avoid public database access when possible

**Firewall rules**:
```bash
# Only allow TestMesh API IPs
# PostgreSQL: Port 5432
# Redis: Port 6379
# Kafka: Ports 9092-9094
```

**VPN/Bastion**: For development access to production databases.

### 3. SSL/TLS Configuration

**Always use TLS in production**:
```bash
DATABASE_SSLMODE=verify-full  # Not 'disable' or 'require'
REDIS_TLS_ENABLED=true
KAFKA_TLS_ENABLED=true
```

**Certificate validation**:
- Use `verify-full` for PostgreSQL
- Provide CA certificates for custom CAs
- Don't skip TLS verification (`TLS_SKIP_VERIFY=false`)

### 4. Access Control

**Principle of least privilege**:
```sql
-- Don't use superuser accounts
-- Grant only necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO testmesh;
REVOKE ALL PRIVILEGES ON pg_catalog, pg_statistic FROM testmesh;
```

**Read-only replicas**:
- Consider separate read replicas for analytics
- TestMesh doesn't support read replicas yet (future feature)

### 5. Monitoring & Logging

**Enable audit logging**:
- PostgreSQL: `log_statement = 'all'` (or 'ddl' for production)
- Redis: Monitor slow queries with `SLOWLOG`
- Kafka: Enable audit logs

**Connection monitoring**:
- Monitor connection pool usage
- Alert on connection failures
- Track query performance

---

## Connection Validation

### Health Checks

TestMesh validates connections on startup. Check logs for errors:

```bash
# API logs
docker logs testmesh-api

# Look for:
INFO  Successfully connected to PostgreSQL
INFO  Successfully connected to Redis
INFO  Successfully connected to Kafka brokers
```

### Manual Testing

**PostgreSQL**:
```bash
# From TestMesh container
psql "postgres://testmesh:password@host:5432/testmesh?sslmode=require"

# Test query
SELECT version();
```

**Redis**:
```bash
# From TestMesh container
redis-cli -h host -p 6379 -a password --tls

# Test command
PING
```

**Kafka**:
```bash
# From TestMesh container or local machine
kafka-console-producer --bootstrap-server host:9092 \
  --producer-property security.protocol=SASL_SSL \
  --producer-property sasl.mechanism=SCRAM-SHA-512 \
  --producer-property sasl.jaas.config='org.apache.kafka.common.security.scram.ScramLoginModule required username="testmesh" password="password";' \
  --topic test-connection

# Type a message and press Enter
# Check if it appears in consumer
```

### API Health Endpoint

TestMesh exposes a health check endpoint:

```bash
curl http://localhost:5016/health

# Response includes infrastructure status
{
  "status": "healthy",
  "services": {
    "database": "connected",
    "redis": "connected",
    "kafka": "connected"
  }
}
```

### Troubleshooting

**Connection timeouts**:
- Check firewall rules
- Verify security groups (AWS) or firewall rules (GCP/Azure)
- Ensure TestMesh has network access to services

**Authentication failures**:
- Verify credentials
- Check username format (Azure requires `user@servername`)
- Ensure user has necessary permissions

**SSL/TLS errors**:
- Verify SSL mode matches server requirements
- Check certificate paths
- Ensure CA certificates are valid

**Kafka broker errors**:
- Verify all brokers are accessible
- Check SASL mechanism matches server config
- Ensure topics exist or auto-creation is enabled

---

## Migration from Bundled to External

### Step-by-Step Migration

**1. Backup Data** (if migrating existing deployment):
```bash
# Backup PostgreSQL
docker exec testmesh-postgres pg_dump -U testmesh testmesh > backup.sql

# Backup Redis (if needed)
docker exec testmesh-redis redis-cli --rdb /data/dump.rdb
docker cp testmesh-redis:/data/dump.rdb ./redis-backup.rdb
```

**2. Provision External Services**:
- Create database instance
- Create Redis instance
- Create Kafka cluster (if needed)
- Note down connection details

**3. Restore Data to External Services**:
```bash
# Restore PostgreSQL
psql -h external-host -U testmesh testmesh < backup.sql

# Restore Redis
redis-cli -h external-host --rdb redis-backup.rdb
```

**4. Update Configuration**:
```bash
# Update docker-compose.yml or Kubernetes manifests
# Remove bundled services
# Add external service environment variables
```

**5. Deploy and Validate**:
```bash
# Deploy updated configuration
docker-compose up -d api dashboard

# Check health
curl http://localhost:5016/health

# Verify data
# Run test flows to ensure everything works
```

**6. Cleanup**:
```bash
# Remove bundled service volumes (after confirming success)
docker volume rm testmesh_postgres_data
docker volume rm testmesh_redis_data
```

---

## Support

For issues with external service configuration:

1. **Check logs**: `docker logs testmesh-api` or `kubectl logs deployment/testmesh-api`
2. **Verify connectivity**: Use manual testing steps above
3. **Review environment variables**: Ensure all required vars are set
4. **GitHub Issues**: Report bugs at https://github.com/test-mesh/testmesh/issues
5. **Documentation**: See `/docs/` for additional guides

---

## Next Steps

- [Deployment Guide](/docs/deployment/README.md)
- [Helm Chart Configuration](/deploy/helm/testmesh/README.md)
- [Production Checklist](/docs/deployment/PRODUCTION.md)
- [Monitoring & Observability](/docs/deployment/MONITORING.md)
