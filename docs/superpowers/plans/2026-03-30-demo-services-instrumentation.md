# Demo Services Instrumentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instrument all four demo services with Prometheus metrics, structured zap logging, OTLP log export, and update the OTel endpoint from `testmesh-api:5016` to `otel-collector:4318`.

**Architecture:** Each service gets a new `metrics/` package exposing a Prometheus collector and Gin middleware. `main.go` is updated to init metrics, swap stdlib `log` for `zap`, and add the OTLP logs exporter alongside the existing trace exporter. All four services are identical in structure — user-service is shown in full; the other three follow the same pattern.

**Tech Stack:** Go 1.23, `go.uber.org/zap`, `github.com/prometheus/client_golang`, `go.opentelemetry.io/otel/exporters/otlp/otlplogs`, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-03-30-observability-storage-graph-actions-design.md` § Demo Service Instrumentation

**Prerequisite:** Plan 1 (LGTM Infra) must be complete — `otel-collector` must be running on `local-infra` network.

---

## File Map

```
demo-services/user-service/
  metrics/metrics.go      NEW — Prometheus collector + Gin middleware
  otel/otel.go            MODIFIED — add OTLP logs exporter, update default endpoint
  main.go                 MODIFIED — init metrics, swap log→zap, register /metrics route
  go.mod                  MODIFIED — add zap, prometheus/client_golang, otel logs SDK
  go.sum                  MODIFIED — updated checksums

demo-services/product-service/    (same changes as user-service)
demo-services/order-service/      (same changes as user-service)
demo-services/notification-service/ (same changes as user-service)

docker-compose.services.yml       MODIFIED — OTEL_EXPORTER_OTLP_ENDPOINT → otel-collector:4318
```

---

## Task 1: Add Dependencies to user-service

**Files:**
- Modify: `demo-services/user-service/go.mod`

- [ ] **Step 1: Add dependencies**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/demo-services/user-service
go get go.uber.org/zap@latest
go get github.com/prometheus/client_golang@latest
go get go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp@latest
go get go.opentelemetry.io/otel/exporters/otlp/otlplogs/otlploghttp@latest
go get go.opentelemetry.io/otel/sdk/log@latest
go get go.uber.org/zap/exp/zapslog@latest
```

- [ ] **Step 2: Verify build still compiles**

```bash
go build ./...
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add go.mod go.sum
git commit -m "chore(user-service): add zap, prometheus, otel logs deps"
```

---

## Task 2: Prometheus Metrics Package — user-service

**Files:**
- Create: `demo-services/user-service/metrics/metrics.go`

- [ ] **Step 1: Write failing test**

```go
// demo-services/user-service/metrics/metrics_test.go
package metrics

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestMiddlewareRecordsRequests(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(Middleware("user-service"))
	r.GET("/health", func(c *gin.Context) { c.Status(200) })

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/health", nil)
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	// If we get here without panic, the middleware works
}

func TestHandlerExposesMetrics(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/metrics", Handler())

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/metrics", nil)
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	body := w.Body.String()
	if len(body) == 0 {
		t.Error("expected non-empty metrics response")
	}
}
```

- [ ] **Step 2: Run tests — confirm compile error**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/demo-services/user-service
go test ./metrics/ -v
```

Expected: compile error — package `metrics` doesn't exist.

- [ ] **Step 3: Implement metrics.go**

```go
// demo-services/user-service/metrics/metrics.go
package metrics

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"net/http"
)

var (
	requestsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "http_requests_total",
		Help: "Total number of HTTP requests.",
	}, []string{"service", "method", "route", "status"})

	requestDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "http_request_duration_seconds",
		Help:    "HTTP request duration in seconds.",
		Buckets: prometheus.DefBuckets,
	}, []string{"service", "method", "route"})

	requestsInFlight = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "http_requests_in_flight",
		Help: "Current number of in-flight HTTP requests.",
	}, []string{"service"})
)

// Middleware returns a Gin middleware that records Prometheus metrics.
func Middleware(serviceName string) gin.HandlerFunc {
	return func(c *gin.Context) {
		route := c.FullPath()
		if route == "" {
			route = c.Request.URL.Path
		}

		requestsInFlight.WithLabelValues(serviceName).Inc()
		start := time.Now()

		c.Next()

		requestsInFlight.WithLabelValues(serviceName).Dec()
		status := strconv.Itoa(c.Writer.Status())
		requestsTotal.WithLabelValues(serviceName, c.Request.Method, route, status).Inc()
		requestDuration.WithLabelValues(serviceName, c.Request.Method, route).Observe(time.Since(start).Seconds())
	}
}

// Handler returns a Gin handler that exposes Prometheus metrics.
func Handler() gin.HandlerFunc {
	h := promhttp.Handler()
	return func(c *gin.Context) {
		h.ServeHTTP(c.Writer, c.Request)
	}
}
```

- [ ] **Step 4: Run tests — should pass**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/demo-services/user-service
go test ./metrics/ -v
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add metrics/
git commit -m "feat(user-service): add prometheus metrics package"
```

---

## Task 3: Switch to Zap + Update OTel Endpoint — user-service

**Files:**
- Modify: `demo-services/user-service/otel/otel.go`
- Modify: `demo-services/user-service/main.go`

- [ ] **Step 1: Update otel.go — change default endpoint and add OTLP logs exporter**

In `demo-services/user-service/otel/otel.go`, change the default endpoint:

```go
// Replace:
endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
if endpoint == "" {
    endpoint = "testmesh-api:5016"
}

// With:
endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
if endpoint == "" {
    endpoint = "otel-collector:4318"
}
```

Also remove the workspace header (it was testmesh-api-specific):
```go
// Remove these lines from the otlptracehttp.New call:
otlptracehttp.WithURLPath("/otlp/v1/traces"),
otlptracehttp.WithHeaders(map[string]string{
    "X-Workspace-ID": workspaceID,
}),

// workspaceID variable and its os.Getenv block can be removed too
```

The final `otlptracehttp.New` call should be:
```go
exporter, err := otlptracehttp.New(context.Background(),
    otlptracehttp.WithEndpoint(endpoint),
    otlptracehttp.WithInsecure(),
)
```

After the existing trace provider setup, add an OTLP logs exporter so structured logs flow to Loki via the collector. Append to `InitTracer`'s return, or export a second `InitLogger` func:

```go
// Add to otel/otel.go — new exported function
func InitLogger(ctx context.Context, serviceName, endpoint string) (*sdklog.LoggerProvider, error) {
    if endpoint == "" {
        endpoint = os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    }
    if endpoint == "" {
        endpoint = "otel-collector:4318"
    }

    logExporter, err := otlploghttp.New(ctx,
        otlploghttp.WithEndpoint(endpoint),
        otlploghttp.WithInsecure(),
    )
    if err != nil {
        return nil, err
    }

    res, _ := resource.New(ctx, resource.WithAttributes(semconv.ServiceNameKey.String(serviceName)))
    lp := sdklog.NewLoggerProvider(
        sdklog.WithProcessor(sdklog.NewBatchProcessor(logExporter)),
        sdklog.WithResource(res),
    )
    global.SetLoggerProvider(lp)
    return lp, nil
}
```

Required imports for the above:
```go
import (
    "go.opentelemetry.io/otel/exporters/otlp/otlplogs/otlploghttp"
    sdklog "go.opentelemetry.io/otel/sdk/log"
    "go.opentelemetry.io/otel/log/global"
)
```

In `main.go`, call `InitLogger` after `InitTracer` and build a zap logger wired to it:

```go
lp, err := serviceOtel.InitLogger(context.Background(), "user-service", "")
if err != nil {
    // non-fatal — fall back to plain zap
    logger, _ = zap.NewProduction()
} else {
    defer lp.Shutdown(context.Background())
    // Wire zap to OTLP log provider so every logger.Info/Warn/Error ships to Loki
    core := zapcore.NewTee(
        zapcore.NewCore(zapcore.NewJSONEncoder(zap.NewProductionEncoderConfig()), zapcore.AddSync(os.Stdout), zap.InfoLevel),
        zapslog.NewCore(lp.Logger("user-service"), &zapslog.HandlerOptions{AddSource: true}),
    )
    logger = zap.New(core)
}
```

Additional imports for `main.go`:
```go
import (
    "go.uber.org/zap/exp/zapslog"
    "go.uber.org/zap/zapcore"
)
```

- [ ] **Step 2: Update main.go — add zap logger and metrics middleware**

In `demo-services/user-service/main.go`, replace the top of `main()`:

```go
package main

import (
    "context"
    "fmt"
    "net/http"
    "os"
    "os/signal"
    "syscall"
    "time"
    "user-service/database"
    "user-service/handlers"
    "user-service/kafka"
    serviceMetrics "user-service/metrics"
    serviceOtel "user-service/otel"
    "user-service/redis"

    "github.com/gin-gonic/gin"
    "go.uber.org/zap"
)

func main() {
    // Logger
    logger, _ := zap.NewProduction()
    defer logger.Sync()

    // Database
    db, err := database.InitDB()
    if err != nil {
        logger.Fatal("failed to connect to database", zap.Error(err))
    }
    sqlDB, _ := db.DB()
    defer sqlDB.Close()

    if err := database.RunMigrations(db); err != nil {
        logger.Fatal("failed to run migrations", zap.Error(err))
    }
    logger.Info("database migrations completed")

    // OpenTelemetry
    shutdown, err := serviceOtel.InitTracer("user-service")
    if err != nil {
        logger.Warn("failed to init tracer", zap.Error(err))
    } else {
        defer shutdown(context.Background())
    }

    // Redis
    redisClient, err := redis.NewClient()
    if err != nil {
        logger.Fatal("failed to connect to redis", zap.Error(err))
    }

    // Kafka
    kafkaProducer, err := kafka.NewProducer()
    if err != nil {
        logger.Fatal("failed to create kafka producer", zap.Error(err))
    }
    defer kafkaProducer.Close()

    // Router
    r := gin.New()
    r.Use(gin.Recovery())
    r.Use(serviceOtel.Middleware("user-service"))
    r.Use(serviceMetrics.Middleware("user-service"))

    // Routes
    userHandler := handlers.NewUserHandler(db, redisClient, kafkaProducer)
    r.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "healthy"}) })
    r.GET("/metrics", serviceMetrics.Handler())
    r.POST("/users", userHandler.CreateUser)
    r.GET("/users/:id", userHandler.GetUser)
    r.GET("/users", userHandler.ListUsers)

    // Auth routes (if auth handler exists)
    authHandler := handlers.NewAuthHandler(db)
    r.POST("/auth/login", authHandler.Login)

    port := os.Getenv("PORT")
    if port == "" {
        port = "5001"
    }

    srv := &http.Server{Addr: ":" + port, Handler: r}

    go func() {
        logger.Info("user-service starting", zap.String("port", port))
        if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            logger.Fatal("server error", zap.Error(err))
        }
    }()

    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit

    logger.Info("shutting down")
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    srv.Shutdown(ctx)
}
```

- [ ] **Step 3: Build to verify no errors**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/demo-services/user-service
go build ./...
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add otel/otel.go main.go
git commit -m "feat(user-service): switch to zap, add metrics middleware, update otel endpoint"
```

---

## Task 4: Repeat for product-service, order-service, notification-service

Each service follows the exact same steps as Tasks 1–3. Differences:
- Service name strings: `"product-service"` / `"order-service"` / `"notification-service"`
- Port env var defaults: `5002` / `5003` / `5004`
- Route registrations differ per service (copy from existing `main.go`, just add metrics middleware and `/metrics` route)

- [ ] **Step 1: product-service — add deps, metrics package, update main.go + otel.go**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/demo-services/product-service
go get go.uber.org/zap@latest
go get github.com/prometheus/client_golang@latest
```

Create `metrics/metrics.go` — identical content to user-service's `metrics/metrics.go`.

Update `otel/otel.go` — change default endpoint `testmesh-api:5016` → `otel-collector:4318`, remove workspace headers.

Update `main.go` — add `serviceMetrics` import, `serviceMetrics.Middleware("product-service")`, `r.GET("/metrics", serviceMetrics.Handler())`, replace `log.` calls with `logger.` (zap).

```bash
go build ./...
git add .
git commit -m "feat(product-service): zap logging, prometheus metrics, update otel endpoint"
```

- [ ] **Step 2: order-service — same pattern**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/demo-services/order-service
go get go.uber.org/zap@latest
go get github.com/prometheus/client_golang@latest
```

Create `metrics/metrics.go` (identical). Update `otel/otel.go`, update `main.go`.

```bash
go build ./...
git add .
git commit -m "feat(order-service): zap logging, prometheus metrics, update otel endpoint"
```

- [ ] **Step 3: notification-service — same pattern**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/demo-services/notification-service
go get go.uber.org/zap@latest
go get github.com/prometheus/client_golang@latest
```

Create `metrics/metrics.go` (identical). Update `otel/otel.go`, update `main.go`.

```bash
go build ./...
git add .
git commit -m "feat(notification-service): zap logging, prometheus metrics, update otel endpoint"
```

---

## Task 5: Update docker-compose.services.yml

**Files:**
- Modify: `docker-compose.services.yml`

- [ ] **Step 1: Update OTEL_EXPORTER_OTLP_ENDPOINT for all 4 services**

Find every `OTEL_EXPORTER_OTLP_ENDPOINT` entry and change from `http://testmesh-api:5016` (or whatever it currently is) to `http://otel-collector:4318`.

Also ensure each service definition has no conflicting OTel endpoint env vars.

Example (repeat for all 4 services):
```yaml
environment:
  # ... existing vars ...
  OTEL_EXPORTER_OTLP_ENDPOINT: http://otel-collector:4318
```

- [ ] **Step 2: Start services and verify metrics endpoint**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh
docker-compose -f docker-compose.services.yml up --build -d

# Wait ~10s then check
curl -s http://localhost:5001/metrics | head -20
curl -s http://localhost:5002/metrics | head -20
curl -s http://localhost:5003/metrics | head -20
curl -s http://localhost:5004/metrics | head -20
```

Expected: each returns Prometheus text format with `http_requests_total`, `http_request_duration_seconds`, `http_requests_in_flight` metrics.

- [ ] **Step 3: Verify metrics appear in Prometheus**

Open http://localhost:9090 → Graph → query: `http_requests_total`

Expected: metric appears after Prometheus scrapes the services (within 15s).

- [ ] **Step 4: Verify traces appear in Tempo**

```bash
# Make a request to user-service
curl -s http://localhost:5001/health

# Open Grafana and check Tempo
# http://localhost:3002 → Explore → Tempo → Search → service.name=user-service
```

Expected: span appears in Tempo.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.services.yml
git commit -m "feat: update OTEL_EXPORTER_OTLP_ENDPOINT to otel-collector for all demo services"
```
