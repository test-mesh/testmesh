# TestMesh Microservices

This directory contains a demonstration e-commerce microservices architecture designed to showcase TestMesh's integration testing capabilities. These services provide real targets for testing HTTP APIs, Kafka event streams, Redis caching, and PostgreSQL databases.

## Architecture Overview

### Services

1. **User Service** (Port 5001)
   - User CRUD operations
   - Session management with Redis
   - Publishes `user.created` and `user.login` events

2. **Product Service** (Port 5002)
   - Product catalog management
   - Redis caching with TTL
   - Distributed locking for inventory updates (Redis SETNX)
   - Publishes `product.created` and `product.inventory.changed` events
   - Consumes `order.placed` events to update inventory

3. **Order Service** (Port 5003)
   - Order creation and management
   - Inter-service HTTP calls to User and Product services
   - Redis caching
   - Publishes `order.placed` events

4. **Notification Service** (Port 5004)
   - Kafka consumer for multiple topics
   - Creates notifications based on events
   - Redis caching for recent notifications
   - Provides API to retrieve user notifications

### Technology Stack

- **Language**: Go 1.21+
- **Web Framework**: Gin
- **Database**: PostgreSQL with GORM ORM
- **Message Broker**: Kafka (IBM/sarama)
- **Cache**: Redis (go-redis/v9)
- **Database Isolation**: Separate schemas per service

### Communication Patterns

- **Synchronous HTTP**: Order Service → User/Product Services
- **Asynchronous Kafka**: Event-driven communication between all services
- **Redis**: Caching (GET/SET), sessions, distributed locks (SETNX)
- **PostgreSQL**: Data persistence with schema-per-service isolation

## Quick Start

### 1. Start All Services

```bash
# From repository root
docker-compose up --build kafka user-service product-service order-service notification-service
```

### 2. Verify Services

```bash
# Check service health
curl http://localhost:5001/health  # User Service
curl http://localhost:5002/health  # Product Service
curl http://localhost:5003/health  # Order Service
curl http://localhost:5004/health  # Notification Service
```

### 3. Run TestMesh Flows

```bash
# Run individual service tests
testmesh run examples/microservices/user-service-flow.yaml
testmesh run examples/microservices/product-service-flow.yaml

# Run complete E2E test
testmesh run examples/microservices/e2e-order-flow.yaml

# Run Kafka messaging test
testmesh run examples/microservices/kafka-messaging-flow.yaml
```

## Service Details

### User Service

**HTTP Endpoints:**
- `GET /health` - Health check
- `POST /api/v1/users` - Create user
- `GET /api/v1/users/:id` - Get user by ID
- `GET /api/v1/users` - List all users
- `POST /api/v1/auth/login` - Login (creates session)
- `GET /api/v1/auth/verify` - Verify session token

**Redis Keys:**
- `user:{id}` → User JSON (TTL: 5m)
- `session:{token}` → User ID (TTL: 24h)

**Kafka Topics (Producer):**
- `user.created` - User registration events
- `user.login` - User login events

**Database Schema:**
- `user_service.users`

### Product Service

**HTTP Endpoints:**
- `GET /health` - Health check
- `POST /api/v1/products` - Create product
- `GET /api/v1/products/:id` - Get product by ID
- `GET /api/v1/products` - List all products
- `PUT /api/v1/products/:id/inventory` - Update inventory (with distributed lock)

**Redis Keys:**
- `product:{id}` → Product JSON (TTL: 10m)
- `lock:inventory:{id}` → Distributed lock (TTL: 5s)

**Kafka Topics:**
- Producer: `product.created`, `product.inventory.changed`
- Consumer: `order.placed` (updates inventory)

**Database Schema:**
- `product_service.products`

### Order Service

**HTTP Endpoints:**
- `GET /health` - Health check
- `POST /api/v1/orders` - Create order (calls User & Product services)
- `GET /api/v1/orders/:id` - Get order by ID
- `GET /api/v1/orders?user_id=X` - List orders by user

**Redis Keys:**
- `order:{id}` → Order JSON (TTL: 30m)

**Kafka Topics (Producer):**
- `order.placed` - Order creation events
- `order.status.changed` - Order status update events

**Inter-Service HTTP Calls:**
- `GET http://user-service:5001/api/v1/users/:id` - Verify user exists
- `GET http://product-service:5002/api/v1/products/:id` - Get product details

**Database Schema:**
- `order_service.orders`
- `order_service.order_items`

### Notification Service

**HTTP Endpoints:**
- `GET /health` - Health check
- `GET /api/v1/notifications/:user_id` - Get all notifications for user
- `GET /api/v1/notifications/:user_id/unread` - Get unread notifications

**Redis Keys:**
- `notifications:{user_id}:recent` → List of recent notification IDs (TTL: 10m)

**Kafka Topics (Consumer):**
- `user.created` → Creates welcome notification
- `order.placed` → Creates order confirmation notification
- `order.status.changed` → Creates status update notification

**Database Schema:**
- `notification_service.notifications`

## Testing with TestMesh

### Available Example Flows

1. **e2e-order-flow.yaml** - Complete end-to-end order creation
   - Tests all 4 services
   - Verifies HTTP, Kafka, Redis, and PostgreSQL interactions
   - 16 comprehensive steps

2. **user-service-flow.yaml** - User service operations
   - User CRUD with PostgreSQL
   - Redis session management
   - Kafka event verification
   - 10 steps

3. **product-service-flow.yaml** - Product catalog testing
   - Product CRUD with PostgreSQL
   - Redis caching
   - Distributed locking for inventory
   - Kafka event verification
   - 11 steps

4. **kafka-messaging-flow.yaml** - Event-driven patterns
   - Multi-topic Kafka pub/sub
   - Event consumption across services
   - Notification service event processing
   - 14 steps

### Example API Calls

**Create User:**
```bash
curl -X POST http://localhost:5001/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com"}'
```

**Create Product:**
```bash
curl -X POST http://localhost:5002/api/v1/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Widget","description":"A test product","price":29.99,"inventory":100}'
```

**Create Order:**
```bash
curl -X POST http://localhost:5003/api/v1/orders \
  -H "Content-Type: application/json" \
  -d '{"user_id":"USER_ID","items":[{"product_id":"PRODUCT_ID","quantity":2}]}'
```

**Get Notifications:**
```bash
curl http://localhost:5004/api/v1/notifications/USER_ID
```

## Database Verification

### Connect to PostgreSQL

```bash
docker exec -it testmesh-postgres psql -U testmesh -d testmesh
```

### Check Schemas

```sql
-- List all schemas
\dn

-- Should see:
-- user_service
-- product_service
-- order_service
-- notification_service

-- List tables in each schema
\dt user_service.*
\dt product_service.*
\dt order_service.*
\dt notification_service.*
```

### Query Data

```sql
-- Users
SELECT * FROM user_service.users;

-- Products
SELECT * FROM product_service.products;

-- Orders
SELECT * FROM order_service.orders;
SELECT * FROM order_service.order_items;

-- Notifications
SELECT * FROM notification_service.notifications;
```

## Redis Verification

### Connect to Redis

```bash
docker exec -it testmesh-redis redis-cli
```

### Check Cached Data

```redis
# Get user cache
GET user:USER_ID

# Get product cache
GET product:PRODUCT_ID

# Get session
GET session:SESSION_TOKEN

# Check if inventory lock exists
GET lock:inventory:PRODUCT_ID

# List notification cache
LRANGE notifications:USER_ID:recent 0 -1
```

## Kafka Verification

### List Topics

```bash
docker exec testmesh-kafka kafka-topics --bootstrap-server localhost:9092 --list
```

Expected topics:
- `user.created`
- `user.login`
- `product.created`
- `product.inventory.changed`
- `order.placed`
- `order.status.changed`

### Consume Events

```bash
# Consume user events
docker exec testmesh-kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic user.created \
  --from-beginning

# Consume order events
docker exec testmesh-kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic order.placed \
  --from-beginning
```

## Development

### Building Individual Services

```bash
# Build user service
cd services/user-service
go build -o user-service

# Build product service
cd services/product-service
go build -o product-service

# Build order service
cd services/order-service
go build -o order-service

# Build notification service
cd services/notification-service
go build -o notification-service
```

### Running Locally (Without Docker)

Ensure PostgreSQL, Redis, and Kafka are running, then:

```bash
# User Service
cd services/user-service
export PORT=5001
export DB_HOST=localhost
export DB_PORT=5432
export DB_USER=testmesh
export DB_PASSWORD=testmesh_dev
export DB_NAME=testmesh
export DB_SCHEMA=user_service
export DB_SSLMODE=disable
export REDIS_HOST=localhost
export REDIS_PORT=6379
export KAFKA_BROKERS=localhost:9093
go run main.go
```

Repeat for other services with appropriate ports and schemas.

## Architecture Highlights

### Database Isolation

Each service has its own PostgreSQL schema for data isolation:
- `user_service.users`
- `product_service.products`
- `order_service.orders`, `order_service.order_items`
- `notification_service.notifications`

This demonstrates multi-tenant database patterns while using a single PostgreSQL instance.

### Event-Driven Architecture

Services communicate asynchronously via Kafka:
- **User Service** publishes user lifecycle events
- **Product Service** publishes inventory changes and consumes order events
- **Order Service** publishes order events
- **Notification Service** consumes all events to create notifications

### Distributed Locking

Product Service uses Redis SETNX for distributed locking during inventory updates:
- Acquires lock: `SET lock:inventory:{id} locked NX EX 5`
- Updates inventory in PostgreSQL
- Releases lock: `DEL lock:inventory:{id}`

This prevents race conditions in concurrent inventory updates.

### Caching Strategy

Services use Redis for different caching patterns:
- **User Service**: User data and session tokens
- **Product Service**: Product details (invalidated on update)
- **Order Service**: Order data
- **Notification Service**: Recent notification IDs

### Inter-Service Communication

Order Service demonstrates HTTP-based inter-service calls:
1. Receives order creation request
2. Calls User Service to verify user exists
3. Calls Product Service to get product details and check inventory
4. Creates order in database
5. Publishes order event to Kafka

## Troubleshooting

### Services Won't Start

```bash
# Check logs
docker-compose logs user-service
docker-compose logs kafka

# Restart services
docker-compose restart user-service product-service order-service notification-service
```

### Database Connection Issues

```bash
# Check PostgreSQL is healthy
docker ps | grep postgres

# Verify schemas exist
docker exec -it testmesh-postgres psql -U testmesh -d testmesh -c "\dn"
```

### Kafka Connection Issues

```bash
# Check Kafka is healthy
docker exec testmesh-kafka kafka-topics --bootstrap-server localhost:9092 --list

# Check if topics exist
docker exec testmesh-kafka kafka-topics --bootstrap-server localhost:9092 --describe
```

### Redis Connection Issues

```bash
# Check Redis is healthy
docker exec -it testmesh-redis redis-cli ping

# Should return: PONG
```

## What's Tested

This microservices architecture allows TestMesh to test:

✅ **HTTP APIs** - RESTful endpoints with JSON payloads
✅ **PostgreSQL Databases** - CRUD operations, schema isolation, complex queries
✅ **Redis Caching** - GET/SET operations, TTL, distributed locks
✅ **Kafka Messaging** - Event publishing and consumption across services
✅ **Inter-Service Communication** - HTTP calls between microservices
✅ **Event-Driven Patterns** - Async messaging, event sourcing
✅ **Distributed Systems** - Locks, caching, eventual consistency

This provides a realistic environment for integration testing with TestMesh!
