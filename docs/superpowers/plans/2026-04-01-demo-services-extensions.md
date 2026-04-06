# Demo Service Extensions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the 4 demo microservices to cover Neo4j, MinIO, and gRPC action types, and add a new Recommendation Service.

**Architecture:** Order service writes `PURCHASED` graph edges to Neo4j on order creation. Product service gains MinIO image upload/download endpoints. A new Recommendation Service exposes gRPC + HTTP with Neo4j collaborative filtering and a Kafka consumer for `order.placed`.

**Tech Stack:** Go 1.25.0, gin, sarama, gorm, neo4j-go-driver/v5, minio-go/v7, google.golang.org/grpc, google.golang.org/protobuf

---

## File Map

### Order Service Changes
- Modify: `demo-services/order-service/go.mod` — add neo4j driver
- Create: `demo-services/order-service/graph/client.go` — Neo4j client + MERGE queries
- Modify: `demo-services/order-service/handlers/orders.go` — write graph edges + new graph endpoint
- Modify: `demo-services/order-service/main.go` — init Neo4j client

### Product Service Changes
- Modify: `demo-services/product-service/go.mod` — add minio-go
- Create: `demo-services/product-service/minio/client.go` — MinIO client
- Modify: `demo-services/product-service/handlers/products.go` — image upload/download endpoints
- Modify: `demo-services/product-service/main.go` — init MinIO client

### New Recommendation Service
- Create: `demo-services/recommendation-service/go.mod`
- Create: `demo-services/recommendation-service/proto/recommendation.proto`
- Create: `demo-services/recommendation-service/proto/recommendation.pb.go`
- Create: `demo-services/recommendation-service/proto/recommendation_grpc.pb.go`
- Create: `demo-services/recommendation-service/models/cache.go`
- Create: `demo-services/recommendation-service/database/db.go`
- Create: `demo-services/recommendation-service/database/migrations.go`
- Create: `demo-services/recommendation-service/graph/client.go`
- Create: `demo-services/recommendation-service/kafka/consumer.go`
- Create: `demo-services/recommendation-service/otel/otel.go`
- Create: `demo-services/recommendation-service/otel/middleware.go`
- Create: `demo-services/recommendation-service/handlers/grpc.go`
- Create: `demo-services/recommendation-service/handlers/http.go`
- Create: `demo-services/recommendation-service/main.go`
- Create: `demo-services/recommendation-service/Dockerfile`

### Infrastructure
- Modify: `docker-compose.services.yml` — add recommendation-service + env vars for Neo4j/MinIO

---

## Task 1: Order Service — Neo4j Client

**Files:**
- Create: `demo-services/order-service/graph/client.go`

- [ ] **Step 1: Add neo4j driver to order-service go.mod**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/demo-services/order-service
go get github.com/neo4j/neo4j-go-driver/v5@v5.28.4
```

Expected: `go.mod` updated with `github.com/neo4j/neo4j-go-driver/v5 v5.28.4`

- [ ] **Step 2: Create the Neo4j graph client**

Create `demo-services/order-service/graph/client.go`:

```go
package graph

import (
	"context"
	"fmt"
	"os"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

// Client wraps the Neo4j driver with order-graph operations.
type Client struct {
	driver neo4j.DriverWithContext
}

// NewClient creates a Neo4j client from env vars.
// NEO4J_URI defaults to bolt://neo4j:7687
// NEO4J_USER defaults to neo4j
// NEO4J_PASSWORD defaults to testmesh
func NewClient() (*Client, error) {
	uri := os.Getenv("NEO4J_URI")
	if uri == "" {
		uri = "bolt://neo4j:7687"
	}
	user := os.Getenv("NEO4J_USER")
	if user == "" {
		user = "neo4j"
	}
	password := os.Getenv("NEO4J_PASSWORD")
	if password == "" {
		password = "testmesh"
	}

	driver, err := neo4j.NewDriverWithContext(uri, neo4j.BasicAuth(user, password, ""))
	if err != nil {
		return nil, fmt.Errorf("failed to create neo4j driver: %w", err)
	}
	return &Client{driver: driver}, nil
}

// Close closes the driver.
func (c *Client) Close(ctx context.Context) error {
	return c.driver.Close(ctx)
}

// CreatePurchasedEdges writes PURCHASED relationship edges for all items in an order.
// Idempotent via MERGE.
func (c *Client) CreatePurchasedEdges(ctx context.Context, orderID, userID string, productIDs []string) error {
	session := c.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(ctx)

	_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		for _, pid := range productIDs {
			_, err := tx.Run(ctx,
				`MERGE (u:User {id: $user_id})
				 MERGE (p:Product {id: $product_id})
				 MERGE (u)-[r:PURCHASED {order_id: $order_id}]->(p)`,
				map[string]any{
					"user_id":    userID,
					"product_id": pid,
					"order_id":   orderID,
				},
			)
			if err != nil {
				return nil, err
			}
		}
		return nil, nil
	})
	return err
}

// PurchaseNode represents a node in the purchase graph response.
type PurchaseNode struct {
	ID   string `json:"id"`
	Type string `json:"type"`
}

// PurchaseEdge represents an edge in the purchase graph response.
type PurchaseEdge struct {
	FromUserID  string `json:"from_user_id"`
	ToProductID string `json:"to_product_id"`
	OrderID     string `json:"order_id"`
}

// GetUserPurchaseGraph returns the purchase graph for a user (all PURCHASED edges).
func (c *Client) GetUserPurchaseGraph(ctx context.Context, userID string) ([]PurchaseNode, []PurchaseEdge, error) {
	session := c.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	result, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		r, err := tx.Run(ctx,
			`MATCH (u:User {id: $user_id})-[r:PURCHASED]->(p:Product)
			 RETURN u.id AS user_id, p.id AS product_id, r.order_id AS order_id`,
			map[string]any{"user_id": userID},
		)
		if err != nil {
			return nil, err
		}
		records, err := r.Collect(ctx)
		return records, err
	})
	if err != nil {
		return nil, nil, err
	}

	records := result.([]*neo4j.Record)
	if len(records) == 0 {
		return []PurchaseNode{}, []PurchaseEdge{}, nil
	}

	nodeSet := map[string]PurchaseNode{}
	var edges []PurchaseEdge
	for _, rec := range records {
		uid, _ := rec.Get("user_id")
		pid, _ := rec.Get("product_id")
		oid, _ := rec.Get("order_id")
		nodeSet[uid.(string)] = PurchaseNode{ID: uid.(string), Type: "User"}
		nodeSet[pid.(string)] = PurchaseNode{ID: pid.(string), Type: "Product"}
		edges = append(edges, PurchaseEdge{
			FromUserID:  uid.(string),
			ToProductID: pid.(string),
			OrderID:     oid.(string),
		})
	}

	var nodes []PurchaseNode
	for _, n := range nodeSet {
		nodes = append(nodes, n)
	}
	return nodes, edges, nil
}
```

- [ ] **Step 3: Build to verify compilation**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/demo-services/order-service
go build ./...
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/demo-services/order-service
git add graph/client.go go.mod go.sum
git commit -m "feat(order-service): add Neo4j graph client for PURCHASED edges"
```

---

## Task 2: Order Service — Graph Writes + Graph Endpoint

**Files:**
- Modify: `demo-services/order-service/handlers/orders.go`
- Modify: `demo-services/order-service/main.go`

- [ ] **Step 1: Add Neo4j client to OrderHandler**

In `demo-services/order-service/handlers/orders.go`, change the `OrderHandler` struct and constructor:

```go
import (
	"encoding/json"
	"fmt"
	"net/http"
	"order-service/clients"
	"order-service/graph"
	"order-service/kafka"
	"order-service/models"
	redisclient "order-service/redis"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type OrderHandler struct {
	db            *gorm.DB
	redisClient   *redisclient.Client
	kafkaProducer *kafka.Producer
	userClient    *clients.UserClient
	productClient *clients.ProductClient
	graphClient   *graph.Client
	logger        *zap.Logger
}

func NewOrderHandler(
	db *gorm.DB,
	redisClient *redisclient.Client,
	kafkaProducer *kafka.Producer,
	userClient *clients.UserClient,
	productClient *clients.ProductClient,
	graphClient *graph.Client,
	logger *zap.Logger,
) *OrderHandler {
	return &OrderHandler{
		db:            db,
		redisClient:   redisClient,
		kafkaProducer: kafkaProducer,
		userClient:    userClient,
		productClient: productClient,
		graphClient:   graphClient,
		logger:        logger,
	}
}
```

- [ ] **Step 2: Write PURCHASED edges after order creation**

In `CreateOrder`, after the Kafka publish line `_ = h.kafkaProducer.PublishOrderPlaced(...)`, add:

```go
	// Write PURCHASED graph edges to Neo4j (non-blocking, best-effort)
	if h.graphClient != nil {
		var productIDs []string
		for _, item := range order.Items {
			productIDs = append(productIDs, item.ProductID)
		}
		go func() {
			if err := h.graphClient.CreatePurchasedEdges(context.Background(), order.ID, order.UserID, productIDs); err != nil {
				h.logger.Warn("failed to write graph edges", zap.String("order_id", order.ID), zap.Error(err))
			}
		}()
	}
```

Also add `"context"` to the imports.

- [ ] **Step 3: Add graph endpoint**

Add this method to `OrderHandler` in `orders.go`:

```go
func (h *OrderHandler) GetUserPurchaseGraph(c *gin.Context) {
	userID := c.Param("user_id")
	if h.graphClient == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "graph client not available"})
		return
	}
	nodes, edges, err := h.graphClient.GetUserPurchaseGraph(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("graph query failed: %v", err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"nodes": nodes, "edges": edges})
}
```

- [ ] **Step 4: Update main.go to init Neo4j + pass to handler**

In `demo-services/order-service/main.go`, import `"order-service/graph"` and add after Redis init:

```go
	graphClient, err := graph.NewClient()
	if err != nil {
		logger.Warn("neo4j unavailable, graph features disabled", zap.Error(err))
		graphClient = nil
	} else {
		defer graphClient.Close(context.Background())
	}
```

Change the handler construction to pass `graphClient` and `logger`:

```go
	orderHandler := handlers.NewOrderHandler(db, redisClient, kafkaProducer, userClient, productClient, graphClient, logger)
```

Register the new route in the `api` group:

```go
		api.GET("/orders/graph/user/:user_id", orderHandler.GetUserPurchaseGraph)
```

- [ ] **Step 5: Build to verify**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/demo-services/order-service
go build ./...
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add handlers/orders.go main.go
git commit -m "feat(order-service): write PURCHASED Neo4j edges on order creation + graph endpoint"
```

---

## Task 3: Product Service — MinIO Client

**Files:**
- Create: `demo-services/product-service/minio/client.go`

- [ ] **Step 1: Add minio-go to product-service go.mod**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/demo-services/product-service
go get github.com/minio/minio-go/v7@v7.0.99
```

Expected: `go.mod` updated with `github.com/minio/minio-go/v7 v7.0.99`

- [ ] **Step 2: Create the MinIO client**

Create `demo-services/product-service/minio/client.go`:

```go
package minio

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

const bucket = "product-images"

// Client wraps minio.Client with product-image operations.
type Client struct {
	mc *minio.Client
}

// NewClient creates a MinIO client from env vars.
// MINIO_ENDPOINT defaults to minio:9000
// MINIO_ACCESS_KEY defaults to minioadmin
// MINIO_SECRET_KEY defaults to minioadmin
func NewClient(ctx context.Context) (*Client, error) {
	endpoint := os.Getenv("MINIO_ENDPOINT")
	if endpoint == "" {
		endpoint = "minio:9000"
	}
	accessKey := os.Getenv("MINIO_ACCESS_KEY")
	if accessKey == "" {
		accessKey = "minioadmin"
	}
	secretKey := os.Getenv("MINIO_SECRET_KEY")
	if secretKey == "" {
		secretKey = "minioadmin"
	}

	mc, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: false,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create minio client: %w", err)
	}

	// Ensure bucket exists
	exists, err := mc.BucketExists(ctx, bucket)
	if err != nil {
		return nil, fmt.Errorf("failed to check bucket: %w", err)
	}
	if !exists {
		if err := mc.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, fmt.Errorf("failed to create bucket: %w", err)
		}
	}

	return &Client{mc: mc}, nil
}

// objectKey returns the MinIO object key for a product image.
func objectKey(productID string) string {
	return fmt.Sprintf("products/%s/image", productID)
}

// UploadImage stores image data for a product.
func (c *Client) UploadImage(ctx context.Context, productID string, data []byte, contentType string) error {
	_, err := c.mc.PutObject(ctx, bucket, objectKey(productID),
		bytes.NewReader(data), int64(len(data)),
		minio.PutObjectOptions{ContentType: contentType},
	)
	return err
}

// PresignedDownloadURL returns a 24h presigned URL for the product image.
// Returns ("", false, nil) if the image does not exist.
func (c *Client) PresignedDownloadURL(ctx context.Context, productID string) (string, bool, error) {
	key := objectKey(productID)
	// Check existence
	_, err := c.mc.StatObject(ctx, bucket, key, minio.StatObjectOptions{})
	if err != nil {
		resp := minio.ToErrorResponse(err)
		if resp.Code == "NoSuchKey" {
			return "", false, nil
		}
		return "", false, err
	}

	url, err := c.mc.PresignedGetObject(ctx, bucket, key, 24*time.Hour, nil)
	if err != nil {
		return "", false, err
	}
	return url.String(), true, nil
}

// GetImage returns the raw image bytes for a product.
// Returns (nil, false, nil) if the image does not exist.
func (c *Client) GetImage(ctx context.Context, productID string) ([]byte, string, bool, error) {
	key := objectKey(productID)
	obj, err := c.mc.GetObject(ctx, bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, "", false, err
	}
	defer obj.Close()

	info, err := obj.Stat()
	if err != nil {
		resp := minio.ToErrorResponse(err)
		if resp.Code == "NoSuchKey" {
			return nil, "", false, nil
		}
		return nil, "", false, err
	}

	data, err := io.ReadAll(obj)
	if err != nil {
		return nil, "", false, err
	}
	return data, info.ContentType, true, nil
}
```

- [ ] **Step 3: Build to verify**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/demo-services/product-service
go build ./...
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add minio/client.go go.mod go.sum
git commit -m "feat(product-service): add MinIO client for product images"
```

---

## Task 4: Product Service — Image Endpoints

**Files:**
- Modify: `demo-services/product-service/handlers/products.go`
- Modify: `demo-services/product-service/main.go`

- [ ] **Step 1: Add MinIO client to ProductHandler**

In `handlers/products.go`, add `minioclient` import and extend the struct:

```go
import (
	"io"
	"net/http"
	"product-service/kafka"
	minioclient "product-service/minio"
	"product-service/models"
	redisclient "product-service/redis"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type ProductHandler struct {
	db            *gorm.DB
	redisClient   *redisclient.Client
	kafkaProducer *kafka.Producer
	minioClient   *minioclient.Client
	logger        *zap.Logger
}

func NewProductHandler(
	db *gorm.DB,
	redisClient *redisclient.Client,
	kafkaProducer *kafka.Producer,
	minioClient *minioclient.Client,
	logger *zap.Logger,
) *ProductHandler {
	return &ProductHandler{
		db:            db,
		redisClient:   redisClient,
		kafkaProducer: kafkaProducer,
		minioClient:   minioClient,
		logger:        logger,
	}
}
```

- [ ] **Step 2: Add UploadImage handler**

Add to `handlers/products.go`:

```go
func (h *ProductHandler) UploadImage(c *gin.Context) {
	productID := c.Param("id")

	// Verify product exists
	var product models.Product
	if err := h.db.First(&product, "id = ?", productID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "product not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}

	if h.minioClient == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "storage not available"})
		return
	}

	file, header, err := c.Request.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "image file required"})
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read file"})
		return
	}

	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	if err := h.minioClient.UploadImage(c.Request.Context(), productID, data, contentType); err != nil {
		h.logger.Error("failed to upload image", zap.String("product_id", productID), zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to upload image"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "image uploaded", "product_id": productID})
}
```

- [ ] **Step 3: Add GetImage handler**

Add to `handlers/products.go`:

```go
func (h *ProductHandler) GetImage(c *gin.Context) {
	productID := c.Param("id")

	if h.minioClient == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "storage not available"})
		return
	}

	url, exists, err := h.minioClient.PresignedDownloadURL(c.Request.Context(), productID)
	if err != nil {
		h.logger.Error("failed to get presigned url", zap.String("product_id", productID), zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate download URL"})
		return
	}
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "no image for this product"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"url": url, "product_id": productID})
}
```

- [ ] **Step 4: Update main.go to init MinIO + pass to handler**

In `demo-services/product-service/main.go`, import `"product-service/minio"` and add after Redis init:

```go
	minioClient, err := minio.NewClient(context.Background())
	if err != nil {
		logger.Warn("minio unavailable, image features disabled", zap.Error(err))
		minioClient = nil
	}
```

Change the handler construction:

```go
	productHandler := handlers.NewProductHandler(db, redisClient, kafkaProducer, minioClient, logger)
```

Register the new routes in the `api` group:

```go
		api.POST("/products/:id/image", productHandler.UploadImage)
		api.GET("/products/:id/image", productHandler.GetImage)
```

- [ ] **Step 5: Build to verify**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/demo-services/product-service
go build ./...
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add handlers/products.go main.go
git commit -m "feat(product-service): add MinIO image upload/download endpoints"
```

---

## Task 5: Recommendation Service — Scaffold

**Files:**
- Create: `demo-services/recommendation-service/go.mod`
- Create: `demo-services/recommendation-service/Dockerfile`
- Create: `demo-services/recommendation-service/otel/otel.go`
- Create: `demo-services/recommendation-service/otel/middleware.go`
- Create: `demo-services/recommendation-service/database/db.go`
- Create: `demo-services/recommendation-service/database/migrations.go`
- Create: `demo-services/recommendation-service/models/cache.go`

- [ ] **Step 1: Create go.mod**

Create `demo-services/recommendation-service/go.mod`:

```
module recommendation-service

go 1.25.0

require (
	github.com/IBM/sarama v1.42.1
	github.com/gin-gonic/gin v1.9.1
	github.com/neo4j/neo4j-go-driver/v5 v5.28.4
	github.com/prometheus/client_golang v1.23.2
	github.com/redis/go-redis/v9 v9.3.0
	go.opentelemetry.io/otel v1.42.0
	go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp v1.42.0
	go.opentelemetry.io/otel/sdk v1.42.0
	go.opentelemetry.io/otel/trace v1.42.0
	go.uber.org/zap v1.27.1
	google.golang.org/grpc v1.79.2
	google.golang.org/protobuf v1.36.11
	gorm.io/driver/postgres v1.5.4
	gorm.io/gorm v1.25.5
)
```

- [ ] **Step 2: Run go mod tidy to populate go.sum**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/demo-services/recommendation-service
go mod tidy
```

Expected: `go.sum` created, no errors.

- [ ] **Step 3: Create otel/otel.go (copy from product-service pattern)**

Create `demo-services/recommendation-service/otel/otel.go`:

```go
package otel

import (
	"context"
	"net/url"
	"os"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
)

func InitTracer(serviceName string) (func(context.Context) error, error) {
	endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	if endpoint == "" {
		endpoint = "otel-collector:4318"
	} else {
		if u, err := url.Parse(endpoint); err == nil && u.Host != "" {
			endpoint = u.Host
		}
	}

	exporter, err := otlptracehttp.New(context.Background(),
		otlptracehttp.WithEndpoint(endpoint),
		otlptracehttp.WithInsecure(),
	)
	if err != nil {
		return nil, err
	}

	res, err := resource.New(context.Background(),
		resource.WithAttributes(semconv.ServiceNameKey.String(serviceName)),
	)
	if err != nil {
		return nil, err
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
	)

	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	return tp.Shutdown, nil
}
```

- [ ] **Step 4: Create otel/middleware.go**

Create `demo-services/recommendation-service/otel/middleware.go`:

```go
package otel

import (
	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/propagation"
)

func Middleware(serviceName string) gin.HandlerFunc {
	return func(c *gin.Context) {
		tracer := otel.Tracer(serviceName)
		propagator := otel.GetTextMapPropagator()
		ctx := propagator.Extract(c.Request.Context(), propagation.HeaderCarrier(c.Request.Header))
		ctx, span := tracer.Start(ctx, c.FullPath())
		span.SetAttributes(
			attribute.String("http.method", c.Request.Method),
			attribute.String("http.route", c.FullPath()),
		)
		c.Request = c.Request.WithContext(ctx)
		c.Next()
		span.SetAttributes(attribute.Int("http.status_code", c.Writer.Status()))
		span.End()
	}
}
```

- [ ] **Step 5: Create database/db.go**

Create `demo-services/recommendation-service/database/db.go`:

```go
package database

import (
	"fmt"
	"os"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func InitDB() (*gorm.DB, error) {
	dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		os.Getenv("DB_HOST"),
		os.Getenv("DB_PORT"),
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_NAME"),
		os.Getenv("DB_SSLMODE"),
	)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	schema := os.Getenv("DB_SCHEMA")
	if schema == "" {
		schema = "recommendation_service"
	}
	if err := db.Exec(fmt.Sprintf("CREATE SCHEMA IF NOT EXISTS %s", schema)).Error; err != nil {
		return nil, fmt.Errorf("failed to create schema: %w", err)
	}

	return db, nil
}
```

- [ ] **Step 6: Create models/cache.go + database/migrations.go**

Create `demo-services/recommendation-service/models/cache.go`:

```go
package models

import "time"

// RecommendationCache stores computed recommendations with a TTL.
type RecommendationCache struct {
	ID          string    `gorm:"primaryKey;type:uuid;default:gen_random_uuid()" json:"id"`
	UserID      string    `gorm:"not null;index" json:"user_id"`
	ProductIDs  string    `gorm:"not null" json:"product_ids"` // JSON-encoded []string
	GeneratedAt time.Time `gorm:"autoCreateTime" json:"generated_at"`
	ExpiresAt   time.Time `gorm:"not null" json:"expires_at"`
}

func (RecommendationCache) TableName() string {
	return "recommendation_service.recommendation_cache"
}
```

Create `demo-services/recommendation-service/database/migrations.go`:

```go
package database

import (
	"recommendation-service/models"

	"gorm.io/gorm"
)

func RunMigrations(db *gorm.DB) error {
	return db.AutoMigrate(&models.RecommendationCache{})
}
```

- [ ] **Step 7: Create Dockerfile**

Create `demo-services/recommendation-service/Dockerfile`:

```dockerfile
FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o recommendation-service .

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=builder /app/recommendation-service .
EXPOSE 5005 5006
CMD ["./recommendation-service"]
```

- [ ] **Step 8: Commit scaffold**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh
git add demo-services/recommendation-service/
git commit -m "feat(recommendation-service): scaffold go.mod, otel, database, models, Dockerfile"
```

---

## Task 6: Recommendation Service — Proto + Generated Code

**Files:**
- Create: `demo-services/recommendation-service/proto/recommendation.proto`
- Create: `demo-services/recommendation-service/proto/recommendation.pb.go` (generated)
- Create: `demo-services/recommendation-service/proto/recommendation_grpc.pb.go` (generated)

Generated files are produced by `protoc` + plugins. The generated files are committed to the repo so `protoc` is not needed to build.

- [ ] **Step 1: Create proto definition**

Create `demo-services/recommendation-service/proto/recommendation.proto`:

```protobuf
syntax = "proto3";

package recommendation;

option go_package = "recommendation-service/proto";

service RecommendationService {
  rpc GetRecommendations(UserRequest) returns (ProductList);
  rpc GetSimilarProducts(ProductRequest) returns (ProductList);
}

message UserRequest {
  string user_id = 1;
  int32 limit = 2;
}

message ProductRequest {
  string product_id = 1;
  int32 limit = 2;
}

message ProductList {
  repeated string product_ids = 1;
}
```

- [ ] **Step 2: Install protoc plugins (one-time setup)**

```bash
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
```

If `protoc` is not installed:
```bash
# macOS
brew install protobuf

# Linux (Ubuntu/Debian)
apt-get install -y protobuf-compiler
```

- [ ] **Step 3: Generate Go code from proto**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/demo-services/recommendation-service
protoc \
  --go_out=. \
  --go_opt=paths=source_relative \
  --go-grpc_out=. \
  --go-grpc_opt=paths=source_relative \
  proto/recommendation.proto
```

Expected: Creates `proto/recommendation.pb.go` and `proto/recommendation_grpc.pb.go`

- [ ] **Step 4: Build proto package to verify**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/demo-services/recommendation-service
go build ./proto/...
```

Expected: No errors.

- [ ] **Step 5: Commit generated files**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh
git add demo-services/recommendation-service/proto/
git commit -m "feat(recommendation-service): add proto definition and generated gRPC code"
```

---

## Task 7: Recommendation Service — Neo4j Graph + Kafka Consumer

**Files:**
- Create: `demo-services/recommendation-service/graph/client.go`
- Create: `demo-services/recommendation-service/kafka/consumer.go`

- [ ] **Step 1: Create graph/client.go**

Create `demo-services/recommendation-service/graph/client.go`:

```go
package graph

import (
	"context"
	"fmt"
	"os"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

type Client struct {
	driver neo4j.DriverWithContext
}

func NewClient() (*Client, error) {
	uri := os.Getenv("NEO4J_URI")
	if uri == "" {
		uri = "bolt://neo4j:7687"
	}
	user := os.Getenv("NEO4J_USER")
	if user == "" {
		user = "neo4j"
	}
	password := os.Getenv("NEO4J_PASSWORD")
	if password == "" {
		password = "testmesh"
	}

	driver, err := neo4j.NewDriverWithContext(uri, neo4j.BasicAuth(user, password, ""))
	if err != nil {
		return nil, fmt.Errorf("failed to create neo4j driver: %w", err)
	}
	return &Client{driver: driver}, nil
}

func (c *Client) Close(ctx context.Context) error {
	return c.driver.Close(ctx)
}

// CreatePurchasedEdges creates PURCHASED relationship edges. Called from the Kafka consumer.
func (c *Client) CreatePurchasedEdges(ctx context.Context, orderID, userID string, productIDs []string) error {
	session := c.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(ctx)

	_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		for _, pid := range productIDs {
			_, err := tx.Run(ctx,
				`MERGE (u:User {id: $user_id})
				 MERGE (p:Product {id: $product_id})
				 MERGE (u)-[r:PURCHASED {order_id: $order_id}]->(p)`,
				map[string]any{
					"user_id":    userID,
					"product_id": pid,
					"order_id":   orderID,
				},
			)
			if err != nil {
				return nil, err
			}
		}
		return nil, nil
	})
	return err
}

// GetRecommendationsForUser returns product IDs purchased by users who also purchased
// products this user bought (collaborative filtering). Excludes already-purchased products.
func (c *Client) GetRecommendationsForUser(ctx context.Context, userID string, limit int) ([]string, error) {
	session := c.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	result, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		r, err := tx.Run(ctx,
			`MATCH (u:User {id: $user_id})-[:PURCHASED]->(p:Product)<-[:PURCHASED]-(other:User)
			 MATCH (other)-[:PURCHASED]->(rec:Product)
			 WHERE NOT (u)-[:PURCHASED]->(rec)
			 RETURN rec.id AS product_id, count(*) AS score
			 ORDER BY score DESC
			 LIMIT $limit`,
			map[string]any{"user_id": userID, "limit": int64(limit)},
		)
		if err != nil {
			return nil, err
		}
		records, err := r.Collect(ctx)
		return records, err
	})
	if err != nil {
		return nil, err
	}

	var ids []string
	for _, rec := range result.([]*neo4j.Record) {
		if pid, ok := rec.Get("product_id"); ok {
			ids = append(ids, pid.(string))
		}
	}
	return ids, nil
}

// GetSimilarProducts returns products frequently purchased together with a given product.
func (c *Client) GetSimilarProducts(ctx context.Context, productID string, limit int) ([]string, error) {
	session := c.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	result, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		r, err := tx.Run(ctx,
			`MATCH (p:Product {id: $product_id})<-[:PURCHASED]-(u:User)-[:PURCHASED]->(other:Product)
			 WHERE other.id <> $product_id
			 RETURN other.id AS product_id, count(*) AS score
			 ORDER BY score DESC
			 LIMIT $limit`,
			map[string]any{"product_id": productID, "limit": int64(limit)},
		)
		if err != nil {
			return nil, err
		}
		records, err := r.Collect(ctx)
		return records, err
	})
	if err != nil {
		return nil, err
	}

	var ids []string
	for _, rec := range result.([]*neo4j.Record) {
		if pid, ok := rec.Get("product_id"); ok {
			ids = append(ids, pid.(string))
		}
	}
	return ids, nil
}
```

- [ ] **Step 2: Create kafka/consumer.go**

Create `demo-services/recommendation-service/kafka/consumer.go`:

```go
package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"recommendation-service/graph"
	"strings"

	"github.com/IBM/sarama"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
)

// OrderPlacedEvent mirrors the event published by order-service.
type OrderPlacedEvent struct {
	EventType string      `json:"event_type"`
	OrderID   string      `json:"order_id"`
	UserID    string      `json:"user_id"`
	Items     []OrderItem `json:"items"`
	Total     float64     `json:"total"`
}

type OrderItem struct {
	ProductID string  `json:"product_id"`
	Quantity  int     `json:"quantity"`
	Price     float64 `json:"price"`
}

type Consumer struct {
	consumer    sarama.ConsumerGroup
	graphClient *graph.Client
}

func NewConsumer(graphClient *graph.Client) (*Consumer, error) {
	brokers := strings.Split(os.Getenv("KAFKA_BROKERS"), ",")

	config := sarama.NewConfig()
	config.Consumer.Return.Errors = true
	config.Consumer.Offsets.Initial = sarama.OffsetNewest

	consumer, err := sarama.NewConsumerGroup(brokers, "recommendation-service", config)
	if err != nil {
		return nil, fmt.Errorf("failed to create kafka consumer group: %w", err)
	}

	return &Consumer{consumer: consumer, graphClient: graphClient}, nil
}

func (c *Consumer) Start(ctx context.Context) {
	handler := &consumerGroupHandler{graphClient: c.graphClient}

	go func() {
		for {
			if err := c.consumer.Consume(ctx, []string{"order.placed"}, handler); err != nil {
				log.Printf("kafka consumer error: %v", err)
			}
			if ctx.Err() != nil {
				return
			}
		}
	}()

	go func() {
		for err := range c.consumer.Errors() {
			log.Printf("kafka error: %v", err)
		}
	}()
}

func (c *Consumer) Close() error {
	return c.consumer.Close()
}

type consumerGroupHandler struct {
	graphClient *graph.Client
}

func (h *consumerGroupHandler) Setup(sarama.ConsumerGroupSession) error   { return nil }
func (h *consumerGroupHandler) Cleanup(sarama.ConsumerGroupSession) error { return nil }

func (h *consumerGroupHandler) ConsumeClaim(session sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	tracer := otel.Tracer("recommendation-service")

	for msg := range claim.Messages() {
		// Extract OTel trace context from headers
		carrier := propagation.MapCarrier{}
		for _, header := range msg.Headers {
			carrier[string(header.Key)] = string(header.Value)
		}
		ctx := otel.GetTextMapPropagator().Extract(context.Background(), carrier)
		_, span := tracer.Start(ctx, "kafka.consume order.placed", trace.WithSpanKind(trace.SpanKindConsumer))

		var event OrderPlacedEvent
		if err := json.Unmarshal(msg.Value, &event); err != nil {
			log.Printf("failed to unmarshal order.placed: %v", err)
			span.End()
			session.MarkMessage(msg, "")
			continue
		}

		var productIDs []string
		for _, item := range event.Items {
			productIDs = append(productIDs, item.ProductID)
		}

		if h.graphClient != nil && len(productIDs) > 0 {
			if err := h.graphClient.CreatePurchasedEdges(ctx, event.OrderID, event.UserID, productIDs); err != nil {
				log.Printf("failed to create graph edges for order %s: %v", event.OrderID, err)
			}
		}

		span.End()
		session.MarkMessage(msg, "")
	}
	return nil
}
```

- [ ] **Step 3: Build to verify**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/demo-services/recommendation-service
go build ./graph/... ./kafka/...
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh
git add demo-services/recommendation-service/graph/ demo-services/recommendation-service/kafka/
git commit -m "feat(recommendation-service): Neo4j graph client + Kafka consumer for order.placed"
```

---

## Task 8: Recommendation Service — Handlers + main.go

**Files:**
- Create: `demo-services/recommendation-service/handlers/grpc.go`
- Create: `demo-services/recommendation-service/handlers/http.go`
- Create: `demo-services/recommendation-service/main.go`

- [ ] **Step 1: Create handlers/grpc.go**

Create `demo-services/recommendation-service/handlers/grpc.go`:

```go
package handlers

import (
	"context"
	"recommendation-service/graph"
	pb "recommendation-service/proto"
)

// GRPCHandler implements the RecommendationService gRPC interface.
type GRPCHandler struct {
	pb.UnimplementedRecommendationServiceServer
	graphClient *graph.Client
}

func NewGRPCHandler(graphClient *graph.Client) *GRPCHandler {
	return &GRPCHandler{graphClient: graphClient}
}

func (h *GRPCHandler) GetRecommendations(ctx context.Context, req *pb.UserRequest) (*pb.ProductList, error) {
	limit := int(req.Limit)
	if limit <= 0 {
		limit = 10
	}

	ids, err := h.graphClient.GetRecommendationsForUser(ctx, req.UserId, limit)
	if err != nil {
		return &pb.ProductList{ProductIds: []string{}}, nil
	}
	if ids == nil {
		ids = []string{}
	}
	return &pb.ProductList{ProductIds: ids}, nil
}

func (h *GRPCHandler) GetSimilarProducts(ctx context.Context, req *pb.ProductRequest) (*pb.ProductList, error) {
	limit := int(req.Limit)
	if limit <= 0 {
		limit = 10
	}

	ids, err := h.graphClient.GetSimilarProducts(ctx, req.ProductId, limit)
	if err != nil {
		return &pb.ProductList{ProductIds: []string{}}, nil
	}
	if ids == nil {
		ids = []string{}
	}
	return &pb.ProductList{ProductIds: ids}, nil
}
```

- [ ] **Step 2: Create handlers/http.go**

Create `demo-services/recommendation-service/handlers/http.go`:

```go
package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// HTTPHandler wraps GRPCHandler to expose REST fallback endpoints.
type HTTPHandler struct {
	grpc *GRPCHandler
}

func NewHTTPHandler(grpc *GRPCHandler) *HTTPHandler {
	return &HTTPHandler{grpc: grpc}
}

func (h *HTTPHandler) GetRecommendations(c *gin.Context) {
	userID := c.Param("user_id")
	limit := 10
	if l := c.Query("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 {
			limit = n
		}
	}

	ids, err := h.grpc.graphClient.GetRecommendationsForUser(c.Request.Context(), userID, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if ids == nil {
		ids = []string{}
	}
	c.JSON(http.StatusOK, gin.H{"user_id": userID, "product_ids": ids})
}
```

- [ ] **Step 3: Create main.go**

Create `demo-services/recommendation-service/main.go`:

```go
package main

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"recommendation-service/database"
	"recommendation-service/graph"
	"recommendation-service/handlers"
	"recommendation-service/kafka"
	serviceOtel "recommendation-service/otel"
	pb "recommendation-service/proto"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"google.golang.org/grpc"
)

func main() {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	db, err := database.InitDB()
	if err != nil {
		logger.Fatal("failed to connect to database", zap.Error(err))
	}
	sqlDB, _ := db.DB()
	defer sqlDB.Close()

	if err := database.RunMigrations(db); err != nil {
		logger.Fatal("failed to run migrations", zap.Error(err))
	}

	shutdownTracer, err := serviceOtel.InitTracer("recommendation-service")
	if err != nil {
		logger.Warn("failed to init tracer", zap.Error(err))
	} else {
		defer shutdownTracer(context.Background())
	}

	graphClient, err := graph.NewClient()
	if err != nil {
		logger.Fatal("failed to connect to neo4j", zap.Error(err))
	}
	defer graphClient.Close(context.Background())

	kafkaConsumer, err := kafka.NewConsumer(graphClient)
	if err != nil {
		logger.Warn("kafka unavailable, consumer disabled", zap.Error(err))
	} else {
		defer kafkaConsumer.Close()
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		kafkaConsumer.Start(ctx)
	}

	grpcHandler := handlers.NewGRPCHandler(graphClient)
	httpHandler := handlers.NewHTTPHandler(grpcHandler)

	// gRPC server on port 5005
	grpcPort := os.Getenv("GRPC_PORT")
	if grpcPort == "" {
		grpcPort = "5005"
	}
	grpcServer := grpc.NewServer()
	pb.RegisterRecommendationServiceServer(grpcServer, grpcHandler)

	go func() {
		lis, err := net.Listen("tcp", fmt.Sprintf(":%s", grpcPort))
		if err != nil {
			logger.Fatal("failed to listen for gRPC", zap.Error(err))
		}
		logger.Info("recommendation-service gRPC starting", zap.String("port", grpcPort))
		if err := grpcServer.Serve(lis); err != nil {
			logger.Error("gRPC server error", zap.Error(err))
		}
	}()

	// HTTP server on port 5006
	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(serviceOtel.Middleware("recommendation-service"))

	router.GET("/health", func(c *gin.Context) {
		if err := sqlDB.Ping(); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unhealthy"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "recommendation-service"})
	})

	api := router.Group("/api/v1")
	{
		api.GET("/recommendations/:user_id", httpHandler.GetRecommendations)
	}

	httpPort := os.Getenv("PORT")
	if httpPort == "" {
		httpPort = "5006"
	}
	srv := &http.Server{Addr: fmt.Sprintf(":%s", httpPort), Handler: router}

	go func() {
		logger.Info("recommendation-service HTTP starting", zap.String("port", httpPort))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("HTTP server error", zap.Error(err))
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("shutting down recommendation-service")
	grpcServer.GracefulStop()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
}
```

- [ ] **Step 4: Build the full service**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/demo-services/recommendation-service
go build ./...
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh
git add demo-services/recommendation-service/
git commit -m "feat(recommendation-service): gRPC+HTTP handlers and main.go"
```

---

## Task 9: docker-compose.services.yml — Wire Everything

**Files:**
- Modify: `docker-compose.services.yml`

- [ ] **Step 1: Add NEO4J env vars to order-service**

In `docker-compose.services.yml`, in the `order-service` environment block, add:

```yaml
      NEO4J_URI: ${NEO4J_URI:-bolt://neo4j:7687}
      NEO4J_USER: ${NEO4J_USER:-neo4j}
      NEO4J_PASSWORD: ${NEO4J_PASSWORD:-testmesh}
```

- [ ] **Step 2: Add MINIO env vars to product-service**

In the `product-service` environment block, add:

```yaml
      MINIO_ENDPOINT: ${MINIO_ENDPOINT:-minio:9000}
      MINIO_ACCESS_KEY: ${MINIO_ACCESS_KEY:-minioadmin}
      MINIO_SECRET_KEY: ${MINIO_SECRET_KEY:-minioadmin}
```

- [ ] **Step 3: Add recommendation-service**

Add the following service to `docker-compose.services.yml` (before the `networks:` section):

```yaml
  # Recommendation Service (gRPC :5005, HTTP :5006)
  recommendation-service:
    build:
      context: ./demo-services/recommendation-service
      dockerfile: Dockerfile
    container_name: testmesh-recommendation-service
    ports:
      - "${RECOMMENDATION_GRPC_PORT:-5005}:5005"
      - "${RECOMMENDATION_HTTP_PORT:-5006}:5006"
    environment:
      GRPC_PORT: 5005
      PORT: 5006
      DB_HOST: ${DATABASE_HOST:-postgres}
      DB_PORT: ${DATABASE_PORT:-5432}
      DB_USER: ${DATABASE_USER:-root}
      DB_PASSWORD: ${DATABASE_PASSWORD:-admin}
      DB_NAME: ${DATABASE_DBNAME:-postgres}
      DB_SCHEMA: recommendation_service
      DB_SSLMODE: ${DATABASE_SSLMODE:-disable}
      KAFKA_BROKERS: ${KAFKA_BROKERS:-kafka:9092}
      NEO4J_URI: ${NEO4J_URI:-bolt://neo4j:7687}
      NEO4J_USER: ${NEO4J_USER:-neo4j}
      NEO4J_PASSWORD: ${NEO4J_PASSWORD:-testmesh}
      OTEL_EXPORTER_OTLP_ENDPOINT: ${OTEL_EXPORTER_OTLP_ENDPOINT:-http://otel-collector:4318}
    networks:
      - local-infra
    depends_on:
      - order-service
```

- [ ] **Step 4: Build the updated docker-compose to verify**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh
docker-compose -f docker-compose.services.yml build --no-cache recommendation-service
```

Expected: Build succeeds with `Successfully built ...`

- [ ] **Step 5: Smoke test all 5 services**

```bash
docker-compose -f docker-compose.services.yml up -d
sleep 10
curl -s http://localhost:5001/health | grep healthy
curl -s http://localhost:5002/health | grep healthy
curl -s http://localhost:5003/health | grep healthy
curl -s http://localhost:5004/health | grep healthy
curl -s http://localhost:5006/health | grep healthy
```

Expected: Each returns `{"status":"healthy",...}`

- [ ] **Step 6: Commit**

```bash
git add docker-compose.services.yml
git commit -m "feat: add Neo4j/MinIO env vars and recommendation-service to docker-compose"
```
