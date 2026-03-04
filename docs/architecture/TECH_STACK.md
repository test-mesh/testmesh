# TestMesh Tech Stack & Implementation Details

## Technology Decisions

### Primary Language: Go vs TypeScript/Node.js

**Recommendation: Go for services, TypeScript for CLI and dashboard**

#### Go Advantages (Recommended for Backend Services)
- **Performance**: Compiled language, better CPU and memory efficiency
- **Concurrency**: Built-in goroutines for parallel test execution
- **Static typing**: Catch errors at compile time
- **Single binary**: Easy deployment, no runtime dependencies
- **Fast startup**: Critical for CLI tool responsiveness
- **Lower resource usage**: Important for cost-effective scaling

#### TypeScript/Node.js Advantages
- **Ecosystem**: Rich package ecosystem (npm)
- **JSON handling**: Native JSON support
- **Rapid development**: Faster iteration for prototyping
- **Developer familiarity**: Larger developer pool

#### Decision Matrix
| Component | Language | Reason |
|-----------|----------|--------|
| API Gateway | Go | Performance, static typing |
| Test Runner | Go | Concurrency, resource efficiency |
| Scheduler | Go | Reliability, low resource usage |
| Result Store API | Go | Performance, query handling |
| CLI Tool | Go | Fast startup, single binary |
| Web Dashboard | TypeScript | Rich UI ecosystem |
| Plugins | Both | Support both ecosystems |

## Backend Services Stack

### API Gateway

**Framework**: Gin (Go)

```go
// Example structure
package main

import (
    "github.com/gin-gonic/gin"
    "github.com/testmesh/api-gateway/middleware"
    "github.com/testmesh/api-gateway/handlers"
)

func main() {
    r := gin.Default()

    // Middleware
    r.Use(middleware.RequestID())
    r.Use(middleware.Logger())
    r.Use(middleware.Auth())
    r.Use(middleware.RateLimit())

    // API routes
    v1 := r.Group("/api/v1")
    {
        v1.POST("/tests", handlers.CreateTest)
        v1.GET("/tests", handlers.ListTests)
        v1.POST("/executions", handlers.TriggerExecution)
        // ... more routes
    }

    r.Run(":5016")
}
```

**Key Libraries**:
- `gin-gonic/gin` - Web framework
- `golang-jwt/jwt` - JWT authentication
- `go-redis/redis` - Redis client
- `lib/pq` - PostgreSQL driver
- `go-redis/redis` - Redis Streams client
- `uber-go/zap` - Structured logging
- `spf13/viper` - Configuration management

### Test Runner Service

**Structure**:
```go
// services/test-runner/runner/executor.go
package runner

type TestExecutor struct {
    db          *sql.DB
    redis       *redis.Client
    artifactStore ArtifactStore
    plugins     *PluginRegistry
}

func (e *TestExecutor) Execute(ctx context.Context, test Test) (*ExecutionResult, error) {
    // Create execution context
    execCtx := NewExecutionContext(test)

    // Run setup hooks
    if err := e.runSetup(ctx, execCtx); err != nil {
        return nil, err
    }

    // Execute steps
    result := &ExecutionResult{}
    for i, step := range test.Steps {
        stepResult, err := e.executeStep(ctx, execCtx, step)
        result.Steps = append(result.Steps, stepResult)

        if err != nil {
            result.Status = StatusFailed
            result.Error = err.Error()
            break
        }
    }

    // Run teardown hooks
    if err := e.runTeardown(ctx, execCtx); err != nil {
        log.Warn("Teardown failed", zap.Error(err))
    }

    return result, nil
}

func (e *TestExecutor) executeStep(ctx context.Context, execCtx *ExecutionContext, step Step) (*StepResult, error) {
    // Get action handler
    handler, err := e.plugins.GetActionHandler(step.Action)
    if err != nil {
        return nil, err
    }

    // Execute with timeout
    ctx, cancel := context.WithTimeout(ctx, step.Timeout)
    defer cancel()

    // Execute with retry
    var result *ActionResult
    retryConfig := step.GetRetryConfig()

    err = retry.Do(
        func() error {
            var err error
            result, err = handler.Execute(ctx, step.Config, execCtx)
            return err
        },
        retry.Attempts(retryConfig.Attempts),
        retry.Delay(retryConfig.Delay),
        retry.Context(ctx),
    )

    if err != nil {
        return &StepResult{
            Status: StatusFailed,
            Error:  err.Error(),
        }, err
    }

    // Evaluate assertions
    for _, assertion := range step.Assertions {
        if err := e.evaluateAssertion(assertion, result, execCtx); err != nil {
            return &StepResult{
                Status: StatusFailed,
                Error:  fmt.Sprintf("Assertion failed: %v", err),
            }, err
        }
    }

    // Save output to context
    if step.Save != nil {
        for key, path := range step.Save {
            value, err := jsonpath.Get(path, result.Output)
            if err != nil {
                return nil, err
            }
            execCtx.Set(key, value)
        }
    }

    return &StepResult{
        Status: StatusPassed,
        Output: result.Output,
    }, nil
}
```

**Key Libraries**:
- `uber-go/zap` - Logging
- `avast/retry-go` - Retry logic
- `ohler55/ojg` - JSONPath
- `playwright-community/playwright-go` - Browser automation
- `jackc/pgx` - PostgreSQL driver

### Database Layer

**ORM**: GORM (Go)

```go
// models/test.go
package models

import (
    "time"
    "gorm.io/gorm"
    "github.com/google/uuid"
)

type Test struct {
    ID          uuid.UUID      `gorm:"type:uuid;primary_key"`
    Name        string         `gorm:"not null"`
    Suite       string         `gorm:"index"`
    Tags        []string       `gorm:"type:text[]"`
    Definition  JSON           `gorm:"type:jsonb"`
    Environment string         `gorm:"index"`
    CreatedAt   time.Time
    UpdatedAt   time.Time
    CreatedBy   string
    Version     int            `gorm:"default:1"`

    Executions  []Execution    `gorm:"foreignKey:TestID"`
}

type Execution struct {
    ID          uuid.UUID      `gorm:"type:uuid;primary_key"`
    TestID      uuid.UUID      `gorm:"type:uuid;not null;index"`
    Status      string         `gorm:"not null;index"`
    Environment string         `gorm:"not null"`
    StartedAt   *time.Time
    FinishedAt  *time.Time
    DurationMs  *int
    TriggerType string
    TriggeredBy string
    Context     JSON           `gorm:"type:jsonb"`
    Error       string

    Test        Test           `gorm:"foreignKey:TestID"`
    Steps       []ExecutionStep `gorm:"foreignKey:ExecutionID"`
    Artifacts   []Artifact     `gorm:"foreignKey:ExecutionID"`
}

// Repository pattern
type TestRepository struct {
    db *gorm.DB
}

func (r *TestRepository) Create(test *Test) error {
    test.ID = uuid.New()
    return r.db.Create(test).Error
}

func (r *TestRepository) FindByID(id uuid.UUID) (*Test, error) {
    var test Test
    err := r.db.Preload("Executions").First(&test, "id = ?", id).Error
    return &test, err
}

func (r *TestRepository) List(filters TestFilters) ([]Test, error) {
    var tests []Test
    query := r.db.Model(&Test{})

    if filters.Suite != "" {
        query = query.Where("suite = ?", filters.Suite)
    }
    if len(filters.Tags) > 0 {
        query = query.Where("tags @> ?", pq.Array(filters.Tags))
    }

    err := query.Find(&tests).Error
    return tests, err
}
```

**Migrations**: golang-migrate

```go
// migrations/000001_initial_schema.up.sql
CREATE TABLE tests (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    suite VARCHAR(100),
    tags TEXT[],
    definition JSONB NOT NULL,
    environment VARCHAR(50),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    created_by VARCHAR(100),
    version INT NOT NULL DEFAULT 1
);

CREATE INDEX idx_tests_suite ON tests(suite);
CREATE INDEX idx_tests_environment ON tests(environment);
CREATE INDEX idx_tests_tags ON tests USING GIN(tags);

// migrations/000001_initial_schema.down.sql
DROP TABLE IF EXISTS tests CASCADE;
```

**Key Libraries**:
- `gorm.io/gorm` - ORM
- `gorm.io/driver/postgres` - PostgreSQL driver
- `golang-migrate/migrate` - Database migrations

### Caching Layer: Redis

```go
// cache/redis.go
package cache

import (
    "context"
    "encoding/json"
    "time"
    "github.com/go-redis/redis/v8"
)

type RedisCache struct {
    client *redis.Client
}

func NewRedisCache(addr string) *RedisCache {
    return &RedisCache{
        client: redis.NewClient(&redis.Options{
            Addr: addr,
            DB:   0,
        }),
    }
}

func (c *RedisCache) Set(ctx context.Context, key string, value interface{}, ttl time.Duration) error {
    data, err := json.Marshal(value)
    if err != nil {
        return err
    }
    return c.client.Set(ctx, key, data, ttl).Err()
}

func (c *RedisCache) Get(ctx context.Context, key string, dest interface{}) error {
    data, err := c.client.Get(ctx, key).Bytes()
    if err != nil {
        return err
    }
    return json.Unmarshal(data, dest)
}

// Distributed locking
func (c *RedisCache) Lock(ctx context.Context, key string, ttl time.Duration) (bool, error) {
    return c.client.SetNX(ctx, key, "locked", ttl).Result()
}

func (c *RedisCache) Unlock(ctx context.Context, key string) error {
    return c.client.Del(ctx, key).Err()
}
```

### Message Queue: Redis Streams

**Why Redis Streams over RabbitMQ?**
- We're already using Redis for caching - reuse existing infrastructure
- Simpler deployment and operations
- Redis Streams provides similar features: persistence, consumer groups, acknowledgments
- Good enough for small to medium workloads

```go
// queue/redis_streams.go
package queue

import (
    "context"
    "encoding/json"
    "github.com/go-redis/redis/v8"
)

type RedisStreams struct {
    client *redis.Client
    stream string
}

func NewRedisStreams(client *redis.Client, stream string) *RedisStreams {
    return &RedisStreams{
        client: client,
        stream: stream,
    }
}

// Publish adds a message to the stream
func (q *RedisStreams) Publish(ctx context.Context, message interface{}) error {
    body, err := json.Marshal(message)
    if err != nil {
        return err
    }

    return q.client.XAdd(ctx, &redis.XAddArgs{
        Stream: q.stream,
        Values: map[string]interface{}{
            "data": string(body),
        },
    }).Err()
}

// Consume reads messages from the stream using consumer groups
func (q *RedisStreams) Consume(ctx context.Context, group, consumer string, handler func([]byte) error) error {
    // Create consumer group if it doesn't exist
    q.client.XGroupCreateMkStream(ctx, q.stream, group, "0")

    for {
        select {
        case <-ctx.Done():
            return ctx.Err()
        default:
            // Read from stream
            streams, err := q.client.XReadGroup(ctx, &redis.XReadGroupArgs{
                Group:    group,
                Consumer: consumer,
                Streams:  []string{q.stream, ">"},
                Count:    1,
                Block:    0, // Block indefinitely
            }).Result()

            if err != nil {
                continue
            }

            for _, stream := range streams {
                for _, message := range stream.Messages {
                    if data, ok := message.Values["data"].(string); ok {
                        if err := handler([]byte(data)); err != nil {
                            // On error, leave message unacknowledged for retry
                            continue
                        }
                        // Acknowledge successful processing
                        q.client.XAck(ctx, q.stream, group, message.ID)
                    }
                }
            }
        }
    }
}
```

## Frontend Stack

### Web Dashboard

**Framework**: Next.js 16 (App Router) + TypeScript + Turbopack

```typescript
// web/dashboard/app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'TestMesh - E2E Integration Testing Platform',
  description: 'Visual flow-based testing for modern APIs and microservices',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

```typescript
// web/dashboard/app/providers.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

**App Router Structure**:
```
web/dashboard/app/
├── layout.tsx              # Root layout
├── page.tsx                # Dashboard home (/)
├── providers.tsx           # Client-side providers
├── (dashboard)/            # Dashboard layout group
│   ├── layout.tsx          # Dashboard layout
│   ├── flows/              # /flows
│   │   ├── page.tsx        # Flow list
│   │   ├── [id]/           # /flows/[id]
│   │   │   └── page.tsx    # Flow detail
│   │   └── new/            # /flows/new
│   │       └── page.tsx    # Create flow
│   ├── executions/         # /executions
│   │   ├── page.tsx        # Execution list
│   │   └── [id]/           # /executions/[id]
│   │       ├── page.tsx    # Execution detail
│   │       └── layout.tsx  # Tabs layout
│   ├── collections/        # /collections
│   ├── environments/       # /environments
│   └── settings/           # /settings
└── api/                    # API routes (optional)
    └── auth/
        └── route.ts        # Auth endpoints
```

**Key Libraries**:
```json
{
  "dependencies": {
    "next": "^14.1.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@tanstack/react-query": "^5.17.0",
    "axios": "^1.6.5",
    "zustand": "^4.5.0",
    "react-flow-renderer": "^11.10.0",
    "monaco-editor": "^0.45.0",
    "@monaco-editor/react": "^4.6.0",
    "recharts": "^2.10.0",
    "date-fns": "^3.2.0",
    "socket.io-client": "^4.6.0",
    "react-hook-form": "^7.49.0",
    "zod": "^3.22.0",
    "@hookform/resolvers": "^3.3.0",
    "tailwindcss": "^3.4.0",
    "tailwindcss-animate": "^1.0.7",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0",
    "lucide-react": "^0.309.0",
    "@radix-ui/react-*": "latest",
    "cmdk": "^0.2.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/react": "^18.2.48",
    "@types/react-dom": "^18.2.18",
    "typescript": "^5.3.3",
    "eslint": "^8.56.0",
    "eslint-config-next": "^14.1.0",
    "prettier": "^3.2.0",
    "prettier-plugin-tailwindcss": "^0.5.0",
    "vitest": "^1.2.0",
    "@testing-library/react": "^14.1.2",
    "@playwright/test": "^1.41.0"
  }
}
```

**API Client** (Server Actions + Client Fetch):
```typescript
// web/dashboard/lib/api/client.ts
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5016/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token
api.interceptors.request.use((config) => {
  // In Next.js, use cookies for SSR or localStorage for CSR
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// API functions
export const testsApi = {
  list: (filters?: TestFilters) =>
    api.get<Test[]>('/tests', { params: filters }),

  get: (id: string) =>
    api.get<Test>(`/tests/${id}`),

  create: (test: CreateTestInput) =>
    api.post<Test>('/tests', test),

  update: (id: string, test: UpdateTestInput) =>
    api.put<Test>(`/tests/${id}`, test),

  delete: (id: string) =>
    api.delete(`/tests/${id}`),
};

export const executionsApi = {
  list: (filters?: ExecutionFilters) =>
    api.get<Execution[]>('/executions', { params: filters }),

  get: (id: string) =>
    api.get<Execution>(`/executions/${id}`),

  trigger: (input: TriggerExecutionInput) =>
    api.post<Execution>('/executions', input),

  cancel: (id: string) =>
    api.post(`/executions/${id}/cancel`),

  logs: (id: string) =>
    api.get<LogEntry[]>(`/executions/${id}/logs`),
};
```

**WebSocket for Real-Time Updates**:
```typescript
// web/dashboard/src/hooks/useWebSocket.ts
import { useEffect, useState } from 'react';

export function useWebSocket(url: string) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => {
    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setMessages((prev) => [...prev, data]);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
    };

    setSocket(ws);

    return () => {
      ws.close();
    };
  }, [url]);

  return { socket, messages };
}

// Usage
function ExecutionDetails({ executionId }: Props) {
  const { messages } = useWebSocket(
    `ws://localhost:5016/ws/executions/${executionId}`
  );

  useEffect(() => {
    messages.forEach((msg) => {
      if (msg.type === 'step.completed') {
        // Update UI
      }
    });
  }, [messages]);

  return <div>...</div>;
}
```

## CLI Tool

**Framework**: Cobra (Go)

```go
// cli/cmd/root.go
package cmd

import (
    "github.com/spf13/cobra"
    "github.com/spf13/viper"
)

var rootCmd = &cobra.Command{
    Use:   "testmesh",
    Short: "TestMesh CLI - E2E Integration Testing",
    Long:  "TestMesh is a platform for writing and running e2e integration tests",
}

func Execute() error {
    return rootCmd.Execute()
}

func init() {
    cobra.OnInitialize(initConfig)

    rootCmd.PersistentFlags().String("config", "", "config file (default is .testmesh.yaml)")
    rootCmd.PersistentFlags().String("env", "local", "environment to use")
    rootCmd.PersistentFlags().String("log-level", "info", "log level (debug, info, warn, error)")

    viper.BindPFlag("config", rootCmd.PersistentFlags().Lookup("config"))
    viper.BindPFlag("env", rootCmd.PersistentFlags().Lookup("env"))
    viper.BindPFlag("log-level", rootCmd.PersistentFlags().Lookup("log-level"))
}

func initConfig() {
    if cfgFile := viper.GetString("config"); cfgFile != "" {
        viper.SetConfigFile(cfgFile)
    } else {
        viper.SetConfigName(".testmesh")
        viper.SetConfigType("yaml")
        viper.AddConfigPath(".")
        viper.AddConfigPath("$HOME")
    }

    viper.AutomaticEnv()

    if err := viper.ReadInConfig(); err == nil {
        fmt.Println("Using config file:", viper.ConfigFileUsed())
    }
}
```

```go
// cli/cmd/run.go
package cmd

import (
    "github.com/spf13/cobra"
    "github.com/testmesh/cli/runner"
)

var runCmd = &cobra.Command{
    Use:   "run [test-file or pattern]",
    Short: "Run tests locally",
    Args:  cobra.MinimumNArgs(1),
    RunE:  runTests,
}

func init() {
    rootCmd.AddCommand(runCmd)

    runCmd.Flags().String("suite", "", "run tests from specific suite")
    runCmd.Flags().StringSlice("tag", []string{}, "run tests with specific tags")
    runCmd.Flags().Int("parallel", 1, "number of tests to run in parallel")
    runCmd.Flags().Duration("timeout", 30*time.Second, "test timeout")
}

func runTests(cmd *cobra.Command, args []string) error {
    // Load tests
    tests, err := loader.LoadTests(args[0])
    if err != nil {
        return err
    }

    // Filter by suite/tags
    suite, _ := cmd.Flags().GetString("suite")
    tags, _ := cmd.Flags().GetStringSlice("tag")
    tests = filterTests(tests, suite, tags)

    // Create runner
    parallel, _ := cmd.Flags().GetInt("parallel")
    timeout, _ := cmd.Flags().GetDuration("timeout")

    runner := runner.New(runner.Config{
        Parallel: parallel,
        Timeout:  timeout,
    })

    // Run tests with progress indicator
    results := runner.Run(context.Background(), tests)

    // Print results
    printResults(results)

    // Exit with appropriate code
    if results.HasFailures() {
        os.Exit(1)
    }

    return nil
}
```

**Key Libraries**:
- `spf13/cobra` - CLI framework
- `spf13/viper` - Configuration management
- `fatih/color` - Colored output
- `schollz/progressbar` - Progress indicators
- `olekukonko/tablewriter` - Table output

## Observability Stack

### Logging: Zap (Go)

```go
// logger/logger.go
package logger

import (
    "go.uber.org/zap"
    "go.uber.org/zap/zapcore"
)

func NewLogger(level string) (*zap.Logger, error) {
    config := zap.Config{
        Level:       zap.NewAtomicLevelAt(parseLevel(level)),
        Development: false,
        Encoding:    "json",
        EncoderConfig: zapcore.EncoderConfig{
            TimeKey:        "timestamp",
            LevelKey:       "level",
            NameKey:        "logger",
            CallerKey:      "caller",
            MessageKey:     "message",
            StacktraceKey:  "stacktrace",
            LineEnding:     zapcore.DefaultLineEnding,
            EncodeLevel:    zapcore.LowercaseLevelEncoder,
            EncodeTime:     zapcore.ISO8601TimeEncoder,
            EncodeDuration: zapcore.SecondsDurationEncoder,
            EncodeCaller:   zapcore.ShortCallerEncoder,
        },
        OutputPaths:      []string{"stdout"},
        ErrorOutputPaths: []string{"stderr"},
    }

    return config.Build()
}

// Usage
logger, _ := logger.NewLogger("info")
logger.Info("Test execution started",
    zap.String("test_id", testID),
    zap.String("environment", env),
)
```

### Metrics: Prometheus

```go
// metrics/prometheus.go
package metrics

import (
    "github.com/prometheus/client_golang/prometheus"
    "github.com/prometheus/client_golang/prometheus/promauto"
)

var (
    TestExecutions = promauto.NewCounterVec(
        prometheus.CounterOpts{
            Name: "testmesh_test_executions_total",
            Help: "Total number of test executions",
        },
        []string{"status", "suite"},
    )

    TestDuration = promauto.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "testmesh_test_duration_seconds",
            Help:    "Test execution duration in seconds",
            Buckets: []float64{.1, .5, 1, 2, 5, 10, 30, 60},
        },
        []string{"suite"},
    )

    ActiveTests = promauto.NewGauge(
        prometheus.GaugeOpts{
            Name: "testmesh_active_tests",
            Help: "Number of currently running tests",
        },
    )
)

// Usage
func (e *TestExecutor) Execute(test Test) {
    ActiveTests.Inc()
    defer ActiveTests.Dec()

    start := time.Now()
    result, err := e.execute(test)
    duration := time.Since(start).Seconds()

    TestDuration.WithLabelValues(test.Suite).Observe(duration)

    status := "success"
    if err != nil {
        status = "failed"
    }
    TestExecutions.WithLabelValues(status, test.Suite).Inc()
}
```

### Tracing: OpenTelemetry

```go
// tracing/tracer.go
package tracing

import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/exporters/jaeger"
    "go.opentelemetry.io/otel/sdk/resource"
    sdktrace "go.opentelemetry.io/otel/sdk/trace"
    semconv "go.opentelemetry.io/otel/semconv/v1.4.0"
)

func InitTracer(serviceName string) error {
    exporter, err := jaeger.New(jaeger.WithCollectorEndpoint())
    if err != nil {
        return err
    }

    tp := sdktrace.NewTracerProvider(
        sdktrace.WithBatcher(exporter),
        sdktrace.WithResource(resource.NewWithAttributes(
            semconv.SchemaURL,
            semconv.ServiceNameKey.String(serviceName),
        )),
    )

    otel.SetTracerProvider(tp)
    return nil
}

// Usage
import "go.opentelemetry.io/otel"

tracer := otel.Tracer("testmesh")
ctx, span := tracer.Start(ctx, "execute-test")
defer span.End()

// Execute test
result, err := executor.Execute(ctx, test)
```

## Deployment

### Docker

```dockerfile
# services/api-gateway/Dockerfile
FROM golang:1.21-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o api-gateway ./cmd/api-gateway

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/api-gateway .

EXPOSE 5016
CMD ["./api-gateway"]
```

### Kubernetes

```yaml
# infrastructure/kubernetes/api-gateway-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: testmesh-api-gateway
  namespace: testmesh
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      containers:
      - name: api-gateway
        image: testmesh/api-gateway:latest
        ports:
        - containerPort: 5016
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: testmesh-secrets
              key: database-url
        - name: REDIS_URL
          value: redis://testmesh-redis:6379
        resources:
          limits:
            cpu: "1"
            memory: 512Mi
          requests:
            cpu: "200m"
            memory: 256Mi
        livenessProbe:
          httpGet:
            path: /health
            port: 5016
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 5016
          initialDelaySeconds: 5
          periodSeconds: 5
```

## Summary

TestMesh uses a modern, scalable tech stack:

- **Go** for high-performance backend services
- **Next.js 16 + TypeScript** for rich, performant user interfaces with SSR
- **PostgreSQL + TimescaleDB** for reliable data storage
- **Redis** for caching and distributed coordination
- **Redis Streams** for asynchronous job processing
- **Kubernetes** for production deployment
- **Prometheus + Grafana** for observability

This stack provides excellent performance, developer experience, and operational excellence for a production-ready e2e testing platform.
