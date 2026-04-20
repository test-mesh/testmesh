# Tracing Integration — Write & Fix Tests from Real Traffic

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let teams already using OTel send spans to TestMesh and get AI-generated test flows, automatic repair suggestions on failures, and a coverage gap surface — all driven by real trace data.

**Architecture:** Extend the existing `SpanProcessor → discoveryCh` goroutine into a proper `TraceEnrichmentWorker` that runs four jobs per completed trace: flow discovery (existing), coverage gap indexing, execution linking + repair queuing, and LLM trace summarization. On-demand actions (generate flow, view repair suggestion, coverage gaps list) read pre-computed data so LLM latency is hidden from users.

**Tech Stack:** Go (Gin, GORM, zap), PostgreSQL (raw SQL migrations in `database.go`), existing `ai.ProviderManager` for LLM calls, Next.js + React Query (dashboard).

---

## File Map

**New — backend:**
- `api/internal/telemetry/enrichment.go` — `TraceEnrichmentWorker` (replaces ad-hoc goroutine in routes.go)
- `api/internal/telemetry/insights.go` — `TraceInsightCache`: span summary extraction + LLM generation
- `api/internal/telemetry/coverage.go` — `CoverageIndexer`: gap detection + gap marking
- `api/internal/telemetry/repair_analyzer.go` — `RepairAnalyzer`: execution linking + LLM repair
- `api/internal/storage/models/api_keys.go` — `WorkspaceAPIKey` model
- `api/internal/storage/repository/api_keys.go` — `APIKeyRepository`

**Modified — backend:**
- `api/internal/telemetry/receiver.go` — add API key auth + extra content-types + OTLP error responses
- `api/internal/telemetry/handlers.go` — add generate-flow, coverage-gaps, repair-suggestions endpoints
- `api/internal/api/routes.go` — wire `TraceEnrichmentWorker`, pass `aiProviders` to telemetry
- `api/internal/shared/database/database.go` — migrations for 4 new tables

**New — dashboard:**
- `dashboard/app/coverage/page.tsx` — Coverage page
- `dashboard/lib/hooks/useCoverage.ts` — React Query hooks for coverage gaps
- `dashboard/components/traces/RepairSuggestionCard.tsx` — repair suggestion card component

**Modified — dashboard:**
- `dashboard/app/executions/[id]/page.tsx` — add repair suggestion card
- `dashboard/lib/api/client.ts` — add coverage + repair API calls
- `dashboard/lib/api/types.ts` — add new types
- `dashboard/components/layout/Sidebar.tsx` (or equivalent) — add Coverage nav link

---

## Task 1: WorkspaceAPIKey model, repository, and migration

**Files:**
- Create: `api/internal/storage/models/api_keys.go`
- Create: `api/internal/storage/repository/api_keys.go`
- Modify: `api/internal/shared/database/database.go`

- [ ] **Step 1: Write failing test for API key repository**

```go
// api/internal/storage/repository/api_keys_test.go
package repository_test

import (
	"context"
	"testing"
	"github.com/test-mesh/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAPIKeyRepository_CreateAndResolve(t *testing.T) {
	// Uses a real DB; skip if not available
	db := testDB(t)
	repo := repository.NewAPIKeyRepository(db)
	wsID := uuid.MustParse("00000000-0000-0000-0000-000000000001")

	key, plaintext, err := repo.Create(context.Background(), wsID, "test-key")
	require.NoError(t, err)
	assert.NotEmpty(t, plaintext)
	assert.Equal(t, "tm_live_", plaintext[:8])

	resolved, err := repo.ResolveKey(context.Background(), plaintext)
	require.NoError(t, err)
	assert.Equal(t, wsID, resolved)

	err = repo.Revoke(context.Background(), key.ID)
	require.NoError(t, err)

	_, err = repo.ResolveKey(context.Background(), plaintext)
	assert.Error(t, err)
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api && go test ./internal/storage/repository/... -run TestAPIKeyRepository -v
```
Expected: compile error — `NewAPIKeyRepository` not defined.

- [ ] **Step 3: Create the model**

```go
// api/internal/storage/models/api_keys.go
package models

import (
	"time"
	"github.com/google/uuid"
)

// WorkspaceAPIKey is a long-lived token for sending spans to TestMesh.
type WorkspaceAPIKey struct {
	ID          uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID uuid.UUID  `gorm:"type:uuid;not null;index" json:"workspace_id"`
	Name        string     `gorm:"not null" json:"name"`
	KeyHash     string     `gorm:"not null" json:"-"`
	Prefix      string     `gorm:"size:12;not null" json:"prefix"` // e.g. "tm_live_abc1"
	LastUsedAt  *time.Time `json:"last_used_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	RevokedAt   *time.Time `json:"revoked_at,omitempty"`
}

func (WorkspaceAPIKey) TableName() string { return "workspace_api_keys" }
```

- [ ] **Step 4: Create the repository**

```go
// api/internal/storage/repository/api_keys.go
package repository

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type APIKeyRepository struct {
	db *gorm.DB
}

func NewAPIKeyRepository(db *gorm.DB) *APIKeyRepository {
	return &APIKeyRepository{db: db}
}

// Create generates a new API key, stores its hash, and returns the plaintext once.
func (r *APIKeyRepository) Create(ctx context.Context, workspaceID uuid.UUID, name string) (*models.WorkspaceAPIKey, string, error) {
	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		return nil, "", fmt.Errorf("generate key bytes: %w", err)
	}
	plaintext := "tm_live_" + hex.EncodeToString(raw)
	prefix := plaintext[:12]

	hash, err := bcrypt.GenerateFromPassword([]byte(plaintext), bcrypt.DefaultCost)
	if err != nil {
		return nil, "", fmt.Errorf("hash key: %w", err)
	}

	key := &models.WorkspaceAPIKey{
		WorkspaceID: workspaceID,
		Name:        name,
		KeyHash:     string(hash),
		Prefix:      prefix,
	}
	if err := r.db.WithContext(ctx).Create(key).Error; err != nil {
		return nil, "", fmt.Errorf("insert key: %w", err)
	}
	return key, plaintext, nil
}

// ResolveKey validates a plaintext API key and returns the workspace ID.
// Returns error if key not found, revoked, or hash mismatch.
func (r *APIKeyRepository) ResolveKey(ctx context.Context, plaintext string) (uuid.UUID, error) {
	if len(plaintext) < 12 {
		return uuid.Nil, fmt.Errorf("invalid key format")
	}
	prefix := plaintext[:12]

	var key models.WorkspaceAPIKey
	err := r.db.WithContext(ctx).
		Where("prefix = ? AND revoked_at IS NULL", prefix).
		First(&key).Error
	if err != nil {
		return uuid.Nil, fmt.Errorf("key not found")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(key.KeyHash), []byte(plaintext)); err != nil {
		return uuid.Nil, fmt.Errorf("invalid key")
	}

	// Update last_used_at async — fire and forget
	now := time.Now()
	go r.db.Model(&key).Update("last_used_at", now) //nolint:errcheck

	return key.WorkspaceID, nil
}

// Revoke marks a key as revoked.
func (r *APIKeyRepository) Revoke(ctx context.Context, keyID uuid.UUID) error {
	now := time.Now()
	return r.db.WithContext(ctx).Model(&models.WorkspaceAPIKey{}).
		Where("id = ?", keyID).
		Update("revoked_at", now).Error
}

// ListForWorkspace returns all non-revoked keys for a workspace (without hashes).
func (r *APIKeyRepository) ListForWorkspace(ctx context.Context, workspaceID uuid.UUID) ([]models.WorkspaceAPIKey, error) {
	var keys []models.WorkspaceAPIKey
	err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND revoked_at IS NULL", workspaceID).
		Order("created_at DESC").
		Find(&keys).Error
	return keys, err
}
```

- [ ] **Step 5: Add migration in database.go**

Find the end of the existing `AutoMigrate` function in `api/internal/shared/database/database.go` (before the final `return nil`). Add:

```go
	// workspace_api_keys — long-lived tokens for OTLP ingest auth
	db.Exec(`
		CREATE TABLE IF NOT EXISTS workspace_api_keys (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			key_hash TEXT NOT NULL,
			prefix VARCHAR(12) NOT NULL,
			last_used_at TIMESTAMP WITH TIME ZONE,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			revoked_at TIMESTAMP WITH TIME ZONE
		);
		CREATE INDEX IF NOT EXISTS idx_api_keys_workspace_id ON workspace_api_keys(workspace_id);
		CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON workspace_api_keys(prefix);
	`)
```

- [ ] **Step 6: Add bcrypt dependency**

```bash
cd api && go get golang.org/x/crypto/bcrypt && go mod tidy
```

- [ ] **Step 7: Run test to verify it passes**

```bash
cd api && go test ./internal/storage/repository/... -run TestAPIKeyRepository -v
```
Expected: PASS (requires running postgres — skip with `-short` if no DB available).

- [ ] **Step 8: Verify build**

```bash
cd api && go build ./...
```
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
cd api && git add internal/storage/models/api_keys.go internal/storage/repository/api_keys.go internal/storage/repository/api_keys_test.go internal/shared/database/database.go go.mod go.sum
git commit -m "feat: workspace API keys for OTLP ingest auth"
```

---

## Task 2: Receiver — API key auth, content-type robustness, OTLP error responses

**Files:**
- Modify: `api/internal/telemetry/receiver.go`

- [ ] **Step 1: Write failing test**

```go
// api/internal/telemetry/receiver_test.go
package telemetry_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestOTLPReceiver_MissingAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	// processor = nil intentional — auth check happens before processing
	recv := &OTLPReceiverTestHarness{}
	r.POST("/otlp/v1/traces", recv.HandleTraces)

	req := httptest.NewRequest(http.MethodPost, "/otlp/v1/traces", strings.NewReader(""))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && go test ./internal/telemetry/... -run TestOTLPReceiver -v
```
Expected: compile error.

- [ ] **Step 3: Update receiver.go**

Replace the full content of `api/internal/telemetry/receiver.go`:

```go
package telemetry

import (
	"compress/gzip"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"
	coltracepb "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	"google.golang.org/protobuf/proto"
)

// OTLPReceiver handles incoming OTLP trace data.
type OTLPReceiver struct {
	processor  *SpanProcessor
	keyRepo    APIKeyResolver
	logger     *zap.Logger
}

// APIKeyResolver resolves a Bearer token to a workspace ID.
// Implemented by APIKeyRepository; nil disables key auth.
type APIKeyResolver interface {
	ResolveKey(ctx interface{ Value(any) any }, token string) (uuid.UUID, error)
}

// NewOTLPReceiver creates a new OTLPReceiver.
// keyRepo may be nil — in that case only X-Workspace-ID header auth is accepted.
func NewOTLPReceiver(processor *SpanProcessor, keyRepo APIKeyResolver, logger *zap.Logger) *OTLPReceiver {
	return &OTLPReceiver{
		processor: processor,
		keyRepo:   keyRepo,
		logger:    logger,
	}
}

// HandleTraces is the Gin handler for POST /otlp/v1/traces.
func (r *OTLPReceiver) HandleTraces(c *gin.Context) {
	workspaceID, err := r.resolveWorkspace(c)
	if err != nil {
		r.otlpError(c, http.StatusBadRequest, err.Error())
		return
	}

	body, err := r.readBody(c)
	if err != nil {
		r.otlpError(c, http.StatusBadRequest, err.Error())
		return
	}

	var req coltracepb.ExportTraceServiceRequest
	if err := proto.Unmarshal(body, &req); err != nil {
		r.logger.Error("failed to unmarshal OTLP request", zap.Error(err))
		r.otlpError(c, http.StatusBadRequest, "invalid OTLP protobuf payload")
		return
	}

	if err := r.processor.ProcessOTLP(c.Request.Context(), workspaceID, &req); err != nil {
		r.logger.Error("failed to process OTLP spans",
			zap.String("workspace_id", workspaceID.String()),
			zap.Error(err))
		r.otlpError(c, http.StatusInternalServerError, "failed to process spans")
		return
	}

	// OTLP convention: return empty response on success
	resp := &coltracepb.ExportTraceServiceResponse{}
	out, _ := proto.Marshal(resp)
	c.Data(http.StatusOK, "application/x-protobuf", out)
}

// resolveWorkspace extracts workspace ID from X-Workspace-ID header or Bearer token.
func (r *OTLPReceiver) resolveWorkspace(c *gin.Context) (uuid.UUID, error) {
	// Option 1: explicit UUID header (local dev / trusted network)
	if wsIDStr := c.GetHeader("X-Workspace-ID"); wsIDStr != "" {
		id, err := uuid.Parse(wsIDStr)
		if err != nil {
			return uuid.Nil, fmt.Errorf("invalid X-Workspace-ID")
		}
		return id, nil
	}

	// Option 2: Bearer API key
	if authHeader := c.GetHeader("Authorization"); strings.HasPrefix(authHeader, "Bearer ") {
		token := strings.TrimPrefix(authHeader, "Bearer ")
		if r.keyRepo == nil {
			return uuid.Nil, fmt.Errorf("API key auth not configured")
		}
		id, err := r.keyRepo.ResolveKey(c.Request.Context(), token)
		if err != nil {
			return uuid.Nil, fmt.Errorf("invalid API key")
		}
		return id, nil
	}

	return uuid.Nil, fmt.Errorf("X-Workspace-ID header or Authorization: Bearer token required")
}

// readBody reads and optionally decompresses the request body.
func (r *OTLPReceiver) readBody(c *gin.Context) ([]byte, error) {
	reader := c.Request.Body
	if strings.EqualFold(c.GetHeader("Content-Encoding"), "gzip") {
		gz, err := gzip.NewReader(reader)
		if err != nil {
			return nil, fmt.Errorf("failed to decompress gzip body")
		}
		defer gz.Close()
		reader = gz
	}
	return io.ReadAll(reader)
}

// otlpError returns an OTLP-conformant protobuf error response.
func (r *OTLPReceiver) otlpError(c *gin.Context, status int, msg string) {
	resp := &coltracepb.ExportTraceServiceResponse{}
	out, _ := proto.Marshal(resp)
	r.logger.Warn("OTLP request rejected", zap.Int("status", status), zap.String("reason", msg))
	c.Data(status, "application/x-protobuf", out)
}
```

- [ ] **Step 4: Add missing import**

The `resolveWorkspace` method uses `fmt` — add it to the import block:

```go
import (
	"compress/gzip"
	"fmt"
	"io"
	"net/http"
	"strings"
	...
)
```

- [ ] **Step 5: Update the NewOTLPReceiver call in routes.go**

In `api/internal/api/routes.go`, find the line:
```go
otlpReceiver := telemetry.NewOTLPReceiver(spanProcessor, logger)
```
Replace with:
```go
apiKeyRepo := repository.NewAPIKeyRepository(db)
otlpReceiver := telemetry.NewOTLPReceiver(spanProcessor, apiKeyRepo, logger)
```

- [ ] **Step 6: Verify build**

```bash
cd api && go build ./...
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd api && git add internal/telemetry/receiver.go internal/api/routes.go
git commit -m "feat: OTLP receiver — API key auth, OTLP error responses"
```

---

## Task 3: DB migrations for telemetry new tables

**Files:**
- Modify: `api/internal/shared/database/database.go`

- [ ] **Step 1: Add telemetry schema creation** (it likely exists already — add `IF NOT EXISTS`):

Find the schema creation block in `AutoMigrate` and add if not present:
```go
if err := db.Exec("CREATE SCHEMA IF NOT EXISTS telemetry").Error; err != nil {
    return err
}
```

- [ ] **Step 2: Add the four new table migrations**

After the existing telemetry table migrations (search for `telemetry.spans` to find placement), add:

```go
	// telemetry.trace_insights — LLM-generated per-trace summaries and YAML flows
	db.Exec(`
		CREATE TABLE IF NOT EXISTS telemetry.trace_insights (
			trace_id TEXT PRIMARY KEY,
			workspace_id UUID NOT NULL,
			span_summary JSONB NOT NULL DEFAULT '[]',
			inferred_intent TEXT NOT NULL DEFAULT '',
			generated_yaml TEXT NOT NULL DEFAULT '',
			confidence FLOAT NOT NULL DEFAULT 0,
			coverage JSONB NOT NULL DEFAULT '[]',
			llm_model TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_trace_insights_workspace_id ON telemetry.trace_insights(workspace_id);
	`)

	// telemetry.repair_suggestions — AI-generated repair suggestions for failed executions
	db.Exec(`
		CREATE TABLE IF NOT EXISTS telemetry.repair_suggestions (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			execution_id UUID NOT NULL,
			workspace_id UUID NOT NULL,
			step_id TEXT NOT NULL DEFAULT '',
			diagnosis TEXT NOT NULL DEFAULT '',
			yaml_diff TEXT NOT NULL DEFAULT '',
			fixed_yaml TEXT NOT NULL DEFAULT '',
			confidence FLOAT NOT NULL DEFAULT 0,
			status TEXT NOT NULL DEFAULT 'pending',
			applied_at TIMESTAMP WITH TIME ZONE,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_repair_suggestions_execution_id ON telemetry.repair_suggestions(execution_id);
		CREATE INDEX IF NOT EXISTS idx_repair_suggestions_workspace_id ON telemetry.repair_suggestions(workspace_id);
	`)

	// telemetry.coverage_gaps — real-traffic endpoints without test coverage
	db.Exec(`
		CREATE TABLE IF NOT EXISTS telemetry.coverage_gaps (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			workspace_id UUID NOT NULL,
			service TEXT NOT NULL,
			operation TEXT NOT NULL DEFAULT '',
			method TEXT NOT NULL DEFAULT '',
			route TEXT NOT NULL DEFAULT '',
			occurrence_count INTEGER NOT NULL DEFAULT 1,
			error_count INTEGER NOT NULL DEFAULT 0,
			avg_latency_ms FLOAT NOT NULL DEFAULT 0,
			last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			risk_score FLOAT NOT NULL DEFAULT 0,
			has_test_flow BOOLEAN NOT NULL DEFAULT false,
			sample_trace_id TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			UNIQUE (workspace_id, service, method, route)
		);
		CREATE INDEX IF NOT EXISTS idx_coverage_gaps_workspace_id ON telemetry.coverage_gaps(workspace_id);
		CREATE INDEX IF NOT EXISTS idx_coverage_gaps_risk_score ON telemetry.coverage_gaps(risk_score DESC);
	`)
```

- [ ] **Step 3: Verify build and migration**

```bash
cd api && go build ./... && go run main.go &
sleep 3 && kill %1
```
Expected: starts without error, migrations run silently.

- [ ] **Step 4: Commit**

```bash
cd api && git add internal/shared/database/database.go
git commit -m "feat: telemetry schema migrations — trace_insights, repair_suggestions, coverage_gaps"
```

---

## Task 4: TraceEnrichmentWorker

**Files:**
- Create: `api/internal/telemetry/enrichment.go`
- Modify: `api/internal/api/routes.go`

- [ ] **Step 1: Write failing test**

```go
// api/internal/telemetry/enrichment_test.go
package telemetry_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestTraceEnrichmentWorker_ProcessesCompletedTrace(t *testing.T) {
	called := make(chan string, 4)

	discovery := &stubDiscovery{onProcess: func(traceID string) { called <- "discovery:" + traceID }}
	coverage := &stubCoverage{onUpdate: func(traceID string) { called <- "coverage:" + traceID }}
	linker := &stubLinker{onLink: func(traceID string) { called <- "linker:" + traceID }}
	insights := &stubInsights{onSummarize: func(traceID string) { called <- "insights:" + traceID }}

	ch := make(chan TraceCompletion, 1)
	w := NewTraceEnrichmentWorker(discovery, coverage, linker, insights, ch)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	w.Start(ctx)

	wsID := uuid.New()
	ch <- TraceCompletion{WorkspaceID: wsID, TraceID: "abc123"}

	received := map[string]bool{}
	for i := 0; i < 4; i++ {
		select {
		case v := <-called:
			received[v] = true
		case <-time.After(time.Second):
			t.Fatal("timed out waiting for worker to process trace")
		}
	}

	assert.True(t, received["discovery:abc123"])
	assert.True(t, received["coverage:abc123"])
	assert.True(t, received["linker:abc123"])
	assert.True(t, received["insights:abc123"])
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && go test ./internal/telemetry/... -run TestTraceEnrichmentWorker -v
```
Expected: compile error.

- [ ] **Step 3: Create enrichment.go**

```go
// api/internal/telemetry/enrichment.go
package telemetry

import (
	"context"
	"sync"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

// DiscoveryRunner processes a completed trace for flow pattern discovery.
type DiscoveryRunner interface {
	ProcessCompletedTrace(ctx context.Context, workspaceID uuid.UUID, traceID string) error
}

// CoverageRunner updates the coverage gap index from a completed trace.
type CoverageRunner interface {
	Update(ctx context.Context, workspaceID uuid.UUID, traceID string) error
}

// LinkerRunner links completed traces to failed executions and queues repair.
type LinkerRunner interface {
	LinkTrace(ctx context.Context, workspaceID uuid.UUID, traceID string) error
}

// InsightsRunner summarizes a trace into a cached LLM insight.
type InsightsRunner interface {
	Summarize(ctx context.Context, workspaceID uuid.UUID, traceID string) error
}

// TraceEnrichmentWorker consumes TraceCompletion events and runs all enrichment jobs.
// It replaces the ad-hoc goroutine in routes.go that only ran FlowDiscovery.
type TraceEnrichmentWorker struct {
	discovery DiscoveryRunner
	coverage  CoverageRunner
	linker    LinkerRunner
	insights  InsightsRunner
	ch        <-chan TraceCompletion
	logger    *zap.Logger

	// goroutine pool for LLM-heavy insights (size 4)
	insightsSem chan struct{}
	wg          sync.WaitGroup
}

// NewTraceEnrichmentWorker creates a new worker. logger may be nil (uses nop).
func NewTraceEnrichmentWorker(
	discovery DiscoveryRunner,
	coverage CoverageRunner,
	linker LinkerRunner,
	insights InsightsRunner,
	ch <-chan TraceCompletion,
	logger ...*zap.Logger,
) *TraceEnrichmentWorker {
	var log *zap.Logger
	if len(logger) > 0 && logger[0] != nil {
		log = logger[0]
	} else {
		log, _ = zap.NewNop().Sugar().Desugar().(*zap.Logger)
		log = zap.NewNop()
	}
	return &TraceEnrichmentWorker{
		discovery:   discovery,
		coverage:    coverage,
		linker:      linker,
		insights:    insights,
		ch:          ch,
		logger:      log,
		insightsSem: make(chan struct{}, 4),
	}
}

// Start begins consuming from the channel until ctx is cancelled.
func (w *TraceEnrichmentWorker) Start(ctx context.Context) {
	go func() {
		for {
			select {
			case <-ctx.Done():
				w.wg.Wait()
				return
			case tc, ok := <-w.ch:
				if !ok {
					w.wg.Wait()
					return
				}
				w.process(ctx, tc)
			}
		}
	}()
}

func (w *TraceEnrichmentWorker) process(ctx context.Context, tc TraceCompletion) {
	if err := w.discovery.ProcessCompletedTrace(ctx, tc.WorkspaceID, tc.TraceID); err != nil {
		w.logger.Warn("flow discovery failed", zap.String("trace_id", tc.TraceID), zap.Error(err))
	}

	if err := w.coverage.Update(ctx, tc.WorkspaceID, tc.TraceID); err != nil {
		w.logger.Warn("coverage update failed", zap.String("trace_id", tc.TraceID), zap.Error(err))
	}

	if err := w.linker.LinkTrace(ctx, tc.WorkspaceID, tc.TraceID); err != nil {
		w.logger.Warn("execution linker failed", zap.String("trace_id", tc.TraceID), zap.Error(err))
	}

	// Insights is LLM-heavy — run in goroutine pool
	w.wg.Add(1)
	w.insightsSem <- struct{}{}
	go func(wsID uuid.UUID, traceID string) {
		defer w.wg.Done()
		defer func() { <-w.insightsSem }()
		if err := w.insights.Summarize(ctx, wsID, traceID); err != nil {
			w.logger.Warn("trace insights failed", zap.String("trace_id", traceID), zap.Error(err))
		}
	}(tc.WorkspaceID, tc.TraceID)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd api && go test ./internal/telemetry/... -run TestTraceEnrichmentWorker -v
```
Expected: PASS.

- [ ] **Step 5: Wire TraceEnrichmentWorker in routes.go**

In `api/internal/api/routes.go`, find the existing ad-hoc goroutine (around line 246):

```go
// Wire flow discovery: completed traces → discover flow patterns
go func() {
    for tc := range spanProcessor.DiscoveryChan() {
        if err := flowDiscovery.ProcessCompletedTrace(context.Background(), tc.WorkspaceID, tc.TraceID); err != nil {
            logger.Warn("flow discovery failed", ...)
        }
    }
}()
```

Replace that entire block with:

```go
// Wire TraceEnrichmentWorker: replaces ad-hoc discovery goroutine
// Coverage, linker, and insights are stubs until their tasks are implemented.
coverageIndexer := telemetry.NewCoverageIndexer(telemetryRepo, flowRepo, logger)
executionLinker := telemetry.NewExecutionLinker(telemetryRepo, executionRepo, aiProviders, logger)
traceInsightCache := telemetry.NewTraceInsightCache(telemetryRepo, flowRepo, aiProviders, logger)
enrichmentWorker := telemetry.NewTraceEnrichmentWorker(
    flowDiscovery,
    coverageIndexer,
    executionLinker,
    traceInsightCache,
    spanProcessor.DiscoveryChan(),
    logger,
)
enrichmentWorker.Start(context.Background())
```

Note: `NewCoverageIndexer`, `NewExecutionLinker`, `NewTraceInsightCache` will be created in Tasks 5–7 below. For now add stub implementations to make the build pass:

```go
// api/internal/telemetry/stubs.go  (temporary — deleted in Task 7)
package telemetry

import (
	"context"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

type CoverageIndexer struct{ logger *zap.Logger }
func NewCoverageIndexer(_ *TelemetryRepository, _ interface{}, logger *zap.Logger) *CoverageIndexer {
	return &CoverageIndexer{logger: logger}
}
func (c *CoverageIndexer) Update(ctx context.Context, wsID uuid.UUID, traceID string) error { return nil }

type ExecutionLinker struct{ logger *zap.Logger }
func NewExecutionLinker(_ *TelemetryRepository, _ interface{}, _ interface{}, logger *zap.Logger) *ExecutionLinker {
	return &ExecutionLinker{logger: logger}
}
func (e *ExecutionLinker) LinkTrace(ctx context.Context, wsID uuid.UUID, traceID string) error { return nil }

type TraceInsightCache struct{ logger *zap.Logger }
func NewTraceInsightCache(_ *TelemetryRepository, _ interface{}, _ interface{}, logger *zap.Logger) *TraceInsightCache {
	return &TraceInsightCache{logger: logger}
}
func (t *TraceInsightCache) Summarize(ctx context.Context, wsID uuid.UUID, traceID string) error { return nil }
```

- [ ] **Step 6: Verify build**

```bash
cd api && go build ./...
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd api && git add internal/telemetry/enrichment.go internal/telemetry/enrichment_test.go internal/telemetry/stubs.go internal/api/routes.go
git commit -m "feat: TraceEnrichmentWorker replaces ad-hoc discovery goroutine"
```

---

## Task 5: CoverageIndexer

**Files:**
- Create: `api/internal/telemetry/coverage.go`
- Delete: stub from `api/internal/telemetry/stubs.go`

- [ ] **Step 1: Write failing test**

```go
// api/internal/telemetry/coverage_test.go
package telemetry_test

import (
	"context"
	"testing"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCoverageIndexer_Update_UpsertsCoverageGap(t *testing.T) {
	db := testDB(t)
	repo := NewTelemetryRepository(db, zapNop())
	wsID := uuid.MustParse("00000000-0000-0000-0000-000000000001")

	// Insert a span with http.method + http.route attributes
	span := Span{
		WorkspaceID: wsID,
		TraceID:     "trace001",
		SpanID:      "span001",
		Service:     "order-service",
		Operation:   "POST /orders",
		StatusCode:  "ok",
		DurationMs:  45,
		Attributes: graph.JSONMap{
			"http.method": "POST",
			"http.route":  "/orders",
		},
		IsTestGenerated: false,
		StartTime:       time.Now(),
		EndTime:         time.Now().Add(45 * time.Millisecond),
	}
	require.NoError(t, repo.InsertSpans(context.Background(), []Span{span}))

	indexer := NewCoverageIndexer(repo, nil, zapNop())
	err := indexer.Update(context.Background(), wsID, "trace001")
	require.NoError(t, err)

	gaps, err := repo.ListCoverageGaps(context.Background(), wsID, false, "risk_score", 50, 0)
	require.NoError(t, err)
	require.Len(t, gaps, 1)
	assert.Equal(t, "order-service", gaps[0].Service)
	assert.Equal(t, "POST", gaps[0].Method)
	assert.Equal(t, "/orders", gaps[0].Route)
	assert.Equal(t, 1, gaps[0].OccurrenceCount)
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && go test ./internal/telemetry/... -run TestCoverageIndexer -v
```
Expected: compile error.

- [ ] **Step 3: Create coverage.go**

```go
// api/internal/telemetry/coverage.go
package telemetry

import (
	"context"
	"math"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// CoverageGap represents an endpoint seen in real traffic with no test flow.
type CoverageGap struct {
	ID              uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WorkspaceID     uuid.UUID `gorm:"type:uuid;not null;index" json:"workspace_id"`
	Service         string    `gorm:"not null" json:"service"`
	Operation       string    `json:"operation"`
	Method          string    `json:"method"`
	Route           string    `json:"route"`
	OccurrenceCount int       `gorm:"default:1" json:"occurrence_count"`
	ErrorCount      int       `gorm:"default:0" json:"error_count"`
	AvgLatencyMs    float64   `gorm:"default:0" json:"avg_latency_ms"`
	LastSeenAt      time.Time `json:"last_seen_at"`
	RiskScore       float64   `gorm:"default:0" json:"risk_score"`
	HasTestFlow     bool      `gorm:"default:false" json:"has_test_flow"`
	SampleTraceID   string    `json:"sample_trace_id"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

func (CoverageGap) TableName() string { return "telemetry.coverage_gaps" }

// FlowRepo is the subset of flow repository used by CoverageIndexer.
type FlowRepo interface {
	GetAll(workspaceID uuid.UUID) ([]interface{ GetStepURLs() []string }, error)
}

// CoverageIndexer maintains the coverage_gaps table from incoming traces.
type CoverageIndexer struct {
	repo   *TelemetryRepository
	db     *gorm.DB
	logger *zap.Logger
}

func NewCoverageIndexer(repo *TelemetryRepository, _ interface{}, logger *zap.Logger) *CoverageIndexer {
	return &CoverageIndexer{repo: repo, db: repo.db, logger: logger}
}

// Update extracts endpoints from the trace and upserts coverage_gaps rows.
func (c *CoverageIndexer) Update(ctx context.Context, workspaceID uuid.UUID, traceID string) error {
	spans, err := c.repo.GetSpansByTraceID(ctx, workspaceID, traceID)
	if err != nil {
		return err
	}

	now := time.Now().UTC()

	for _, s := range spans {
		if s.IsTestGenerated {
			continue
		}

		method := getStringAttrMap(s.Attributes, "http.method")
		route := getStringAttrMap(s.Attributes, "http.route")
		if method == "" || route == "" {
			continue // only track HTTP endpoints
		}

		isError := s.StatusCode == "error"
		errorInc := 0
		if isError {
			errorInc = 1
		}

		// Upsert: on conflict increment counts and recalculate rolling avg latency
		err := c.db.WithContext(ctx).Exec(`
			INSERT INTO telemetry.coverage_gaps
				(workspace_id, service, operation, method, route, occurrence_count, error_count,
				 avg_latency_ms, last_seen_at, sample_trace_id, risk_score, updated_at)
			VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 0, ?)
			ON CONFLICT (workspace_id, service, method, route) DO UPDATE SET
				occurrence_count = telemetry.coverage_gaps.occurrence_count + 1,
				error_count      = telemetry.coverage_gaps.error_count + EXCLUDED.error_count,
				avg_latency_ms   = (telemetry.coverage_gaps.avg_latency_ms *
				                    telemetry.coverage_gaps.occurrence_count + EXCLUDED.avg_latency_ms)
				                   / (telemetry.coverage_gaps.occurrence_count + 1),
				last_seen_at     = EXCLUDED.last_seen_at,
				sample_trace_id  = EXCLUDED.sample_trace_id,
				updated_at       = EXCLUDED.updated_at
		`,
			workspaceID, s.Service, s.Operation, method, route,
			errorInc, float64(s.DurationMs), now, traceID, now, now,
		).Error
		if err != nil {
			c.logger.Warn("failed to upsert coverage gap",
				zap.String("service", s.Service), zap.Error(err))
			continue
		}

		// Recompute risk score separately (needs updated counts)
		c.recomputeRisk(ctx, workspaceID, s.Service, method, route)
	}

	return nil
}

func (c *CoverageIndexer) recomputeRisk(ctx context.Context, wsID uuid.UUID, service, method, route string) {
	var gap CoverageGap
	if err := c.db.WithContext(ctx).
		Where("workspace_id = ? AND service = ? AND method = ? AND route = ?",
			wsID, service, method, route).
		First(&gap).Error; err != nil {
		return
	}

	errorRate := 0.0
	if gap.OccurrenceCount > 0 {
		errorRate = float64(gap.ErrorCount) / float64(gap.OccurrenceCount)
	}
	freqScore := math.Min(float64(gap.OccurrenceCount)/1000.0, 1.0)
	latScore := math.Min(gap.AvgLatencyMs/10000.0, 1.0)
	risk := 0.3*freqScore + 0.5*errorRate + 0.2*latScore

	c.db.WithContext(ctx).Model(&gap).Update("risk_score", risk) //nolint:errcheck
}

// MarkFlowCoverage sets has_test_flow=true for any gap whose method+route
// matches a step URL in the given flow definition.
func (c *CoverageIndexer) MarkFlowCoverage(ctx context.Context, workspaceID uuid.UUID, stepURLs []stepURL) error {
	for _, su := range stepURLs {
		c.db.WithContext(ctx).
			Model(&CoverageGap{}).
			Where("workspace_id = ? AND method = ? AND route = ?", workspaceID, su.Method, su.Route).
			Update("has_test_flow", true) //nolint:errcheck
	}
	return nil
}

type stepURL struct {
	Method string
	Route  string
}
```

- [ ] **Step 4: Add `ListCoverageGaps` to TelemetryRepository**

In `api/internal/telemetry/repository.go`, add:

```go
func (r *TelemetryRepository) ListCoverageGaps(ctx context.Context, workspaceID uuid.UUID, uncoveredOnly bool, sort string, limit, offset int) ([]CoverageGap, error) {
	q := r.db.WithContext(ctx).Where("workspace_id = ?", workspaceID)
	if uncoveredOnly {
		q = q.Where("has_test_flow = false")
	}
	allowedSort := map[string]bool{"risk_score": true, "last_seen_at": true, "occurrence_count": true}
	if !allowedSort[sort] {
		sort = "risk_score"
	}
	q = q.Order(sort + " DESC").Limit(limit).Offset(offset)
	var gaps []CoverageGap
	return gaps, q.Find(&gaps).Error
}

func (r *TelemetryRepository) CountCoverageGaps(ctx context.Context, workspaceID uuid.UUID, uncoveredOnly bool) (int64, error) {
	q := r.db.WithContext(ctx).Model(&CoverageGap{}).Where("workspace_id = ?", workspaceID)
	if uncoveredOnly {
		q = q.Where("has_test_flow = false")
	}
	var count int64
	return count, q.Count(&count).Error
}
```

- [ ] **Step 5: Remove CoverageIndexer stub from stubs.go**

Delete the `CoverageIndexer` struct, `NewCoverageIndexer`, and `Update` stub from `api/internal/telemetry/stubs.go`.

- [ ] **Step 6: Run tests**

```bash
cd api && go test ./internal/telemetry/... -run TestCoverageIndexer -v
```
Expected: PASS.

- [ ] **Step 7: Verify build**

```bash
cd api && go build ./...
```

- [ ] **Step 8: Commit**

```bash
cd api && git add internal/telemetry/coverage.go internal/telemetry/coverage_test.go internal/telemetry/repository.go internal/telemetry/stubs.go
git commit -m "feat: CoverageIndexer — tracks untested endpoints from real traces"
```

---

## Task 6: TraceInsightCache — span extraction + LLM generation

**Files:**
- Create: `api/internal/telemetry/insights.go`
- Modify: `api/internal/telemetry/stubs.go` (remove TraceInsightCache stub)

- [ ] **Step 1: Write failing test**

```go
// api/internal/telemetry/insights_test.go
package telemetry_test

import (
	"context"
	"testing"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTraceInsightCache_ExtractSpanSummary(t *testing.T) {
	spans := []Span{
		{
			Service:    "order-service",
			Operation:  "POST /orders",
			Kind:       "server",
			StatusCode: "ok",
			DurationMs: 45,
			Attributes: graph.JSONMap{
				"http.method":        "POST",
				"http.route":         "/orders",
				"http.status_code":   float64(201),
				"http.response.body": `{"id":"ord_123"}`,
			},
			StartTime: time.Now(),
		},
		{
			Service:    "user-service",
			Operation:  "GET /users/:id",
			Kind:       "server",
			StatusCode: "ok",
			DurationMs: 12,
			Attributes: graph.JSONMap{
				"http.method":      "GET",
				"http.route":       "/users/:id",
				"http.status_code": float64(200),
			},
			StartTime: time.Now().Add(5 * time.Millisecond),
		},
	}

	cache := &TraceInsightCache{}
	summary := cache.extractSpanSummary(spans)

	require.Len(t, summary, 2)
	assert.Equal(t, "order-service", summary[0]["service"])
	assert.Equal(t, "POST", summary[0]["http_method"])
	assert.Equal(t, `{"id":"ord_123"}`, summary[0]["response_body_sample"])
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && go test ./internal/telemetry/... -run TestTraceInsightCache -v
```
Expected: compile error.

- [ ] **Step 3: Create insights.go**

```go
// api/internal/telemetry/insights.go
package telemetry

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/ai"
	"github.com/test-mesh/testmesh/internal/graph"
	"go.uber.org/zap"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// TraceInsight stores a per-trace LLM summary and generated YAML flow.
type TraceInsight struct {
	TraceID        string          `gorm:"primaryKey" json:"trace_id"`
	WorkspaceID    uuid.UUID       `gorm:"type:uuid;not null;index" json:"workspace_id"`
	SpanSummary    graph.JSONArray `gorm:"type:jsonb;default:'[]'" json:"span_summary"`
	InferredIntent string          `json:"inferred_intent"`
	GeneratedYAML  string          `json:"generated_yaml"`
	Confidence     float64         `json:"confidence"`
	Coverage       graph.JSONArray `gorm:"type:jsonb;default:'[]'" json:"coverage"`
	LLMModel       string          `json:"llm_model"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

func (TraceInsight) TableName() string { return "telemetry.trace_insights" }

// TraceInsightCache summarizes traces using LLM and caches results.
type TraceInsightCache struct {
	repo      *TelemetryRepository
	db        *gorm.DB
	flowRepo  flowLister
	providers *ai.ProviderManager
	logger    *zap.Logger
}

type flowLister interface {
	ListByWorkspace(workspaceID uuid.UUID, limit, offset int) (interface{}, error)
}

func NewTraceInsightCache(repo *TelemetryRepository, flowRepo interface{}, providers *ai.ProviderManager, logger *zap.Logger) *TraceInsightCache {
	return &TraceInsightCache{
		repo:      repo,
		db:        repo.db,
		providers: providers,
		logger:    logger,
	}
}

// Summarize builds a TraceInsight for the trace. Idempotent — skips if already cached.
func (c *TraceInsightCache) Summarize(ctx context.Context, workspaceID uuid.UUID, traceID string) error {
	// Check cache first
	var existing TraceInsight
	if err := c.db.WithContext(ctx).Where("trace_id = ?", traceID).First(&existing).Error; err == nil {
		return nil // already computed
	}

	spans, err := c.repo.GetSpansByTraceID(ctx, workspaceID, traceID)
	if err != nil {
		return fmt.Errorf("get spans: %w", err)
	}
	if len(spans) == 0 {
		return nil
	}

	// Filter out TestMesh-generated spans
	var realSpans []Span
	for _, s := range spans {
		if !s.IsTestGenerated {
			realSpans = append(realSpans, s)
		}
	}
	if len(realSpans) == 0 {
		return nil
	}

	summary := c.extractSpanSummary(realSpans)
	variables := c.extractVariables(realSpans)

	provider, err := c.providers.GetPrimaryProvider()
	if err != nil {
		c.logger.Warn("no AI provider configured, skipping trace insight", zap.String("trace_id", traceID))
		return nil
	}

	summaryJSON, _ := json.MarshalIndent(summary, "", "  ")
	variablesNote := ""
	if len(variables) > 0 {
		vJSON, _ := json.Marshal(variables)
		variablesNote = fmt.Sprintf("\n\nDetected variable flows (use these for output: extraction):\n%s", string(vJSON))
	}

	prompt := fmt.Sprintf(`You are generating a TestMesh YAML integration test from a real production trace.

Trace summary (ordered service calls):
%s%s

Generate a complete TestMesh YAML flow that:
1. Tests this interaction end-to-end
2. Uses variable extraction (output: blocks) where values flow between steps
3. Includes status code assertions on every HTTP step (assert: - status == NNN)
4. Includes response body assertions for key fields using JSONPath (assert: - $.body.id != "")
5. Uses {{base_url}} and {{api_key}} as placeholders for configuration
6. Has a clear name and description

Return ONLY valid JSON (no markdown):
{"yaml": "...", "confidence": 0.0, "intent": "one sentence", "coverage": [{"method":"POST","route":"/orders","service":"order-service"}]}`,
		string(summaryJSON), variablesNote)

	resp, err := provider.Generate(ctx, ai.GenerateRequest{
		Prompt:      prompt,
		MaxTokens:   4096,
		Temperature: 0.2,
	})
	if err != nil {
		return fmt.Errorf("LLM generate: %w", err)
	}

	var result struct {
		YAML       string                   `json:"yaml"`
		Confidence float64                  `json:"confidence"`
		Intent     string                   `json:"intent"`
		Coverage   []map[string]interface{} `json:"coverage"`
	}

	// Strip markdown code fences if present
	content := strings.TrimSpace(resp.Content)
	if idx := strings.Index(content, "{"); idx > 0 {
		content = content[idx:]
	}
	if idx := strings.LastIndex(content, "}"); idx >= 0 && idx < len(content)-1 {
		content = content[:idx+1]
	}

	if err := json.Unmarshal([]byte(content), &result); err != nil {
		c.logger.Warn("failed to parse LLM response for trace insight",
			zap.String("trace_id", traceID),
			zap.String("content", content[:min(200, len(content))]),
			zap.Error(err))
		return nil
	}

	coverageJSON := make(graph.JSONArray, len(result.Coverage))
	for i, cv := range result.Coverage {
		coverageJSON[i] = cv
	}

	insight := &TraceInsight{
		TraceID:        traceID,
		WorkspaceID:    workspaceID,
		SpanSummary:    summaryAsJSONArray(summary),
		InferredIntent: result.Intent,
		GeneratedYAML:  result.YAML,
		Confidence:     result.Confidence,
		Coverage:       coverageJSON,
		LLMModel:       resp.Model,
		CreatedAt:      time.Now().UTC(),
		UpdatedAt:      time.Now().UTC(),
	}

	return c.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "trace_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"generated_yaml", "inferred_intent", "confidence", "coverage", "llm_model", "updated_at"}),
		}).
		Create(insight).Error
}

// extractSpanSummary converts spans into a prompt-friendly ordered summary.
func (c *TraceInsightCache) extractSpanSummary(spans []Span) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(spans))
	for _, s := range spans {
		entry := map[string]interface{}{
			"service":     s.Service,
			"operation":   s.Operation,
			"kind":        s.Kind,
			"status_code": s.StatusCode,
			"duration_ms": s.DurationMs,
		}
		if m := getStringAttrMap(s.Attributes, "http.method"); m != "" {
			entry["http_method"] = m
		}
		if r := getStringAttrMap(s.Attributes, "http.route"); r != "" {
			entry["http_route"] = r
		}
		if st := getAttrInt(s.Attributes, "http.status_code"); st != 0 {
			entry["http_status"] = st
		}
		if body := getStringAttrMap(s.Attributes, "http.request.body"); body != "" {
			if len(body) > 2048 {
				body = body[:2048]
			}
			entry["request_body_sample"] = body
		}
		if body := getStringAttrMap(s.Attributes, "http.response.body"); body != "" {
			if len(body) > 2048 {
				body = body[:2048]
			}
			entry["response_body_sample"] = body
		}
		out = append(out, entry)
	}
	return out
}

type variableFlow struct {
	SourceStep    int    `json:"source_step"`
	SourceField   string `json:"source_field"`
	TargetStep    int    `json:"target_step"`
	JSONPathExpr  string `json:"jsonpath"`
	PlaceholderName string `json:"var_name"`
}

// extractVariables detects when a response field value appears in a later span's URL.
func (c *TraceInsightCache) extractVariables(spans []Span) []variableFlow {
	var flows []variableFlow
	for i, src := range spans {
		respBody := getStringAttrMap(src.Attributes, "http.response.body")
		if respBody == "" {
			continue
		}
		var respMap map[string]interface{}
		if err := json.Unmarshal([]byte(respBody), &respMap); err != nil {
			continue
		}
		for field, val := range respMap {
			strVal, ok := val.(string)
			if !ok || strVal == "" {
				continue
			}
			for j := i + 1; j < len(spans); j++ {
				url := getStringAttrMap(spans[j].Attributes, "http.route")
				if strings.Contains(url, strVal) {
					flows = append(flows, variableFlow{
						SourceStep:      i + 1,
						SourceField:     field,
						TargetStep:      j + 1,
						JSONPathExpr:    "$.body." + field,
						PlaceholderName: field,
					})
				}
			}
		}
	}
	return flows
}

// GetInsight retrieves a cached insight, or nil if not found.
func (c *TraceInsightCache) GetInsight(ctx context.Context, traceID string) (*TraceInsight, error) {
	var insight TraceInsight
	err := c.db.WithContext(ctx).Where("trace_id = ?", traceID).First(&insight).Error
	if err != nil {
		return nil, err
	}
	return &insight, nil
}

func summaryAsJSONArray(summary []map[string]interface{}) graph.JSONArray {
	out := make(graph.JSONArray, len(summary))
	for i, m := range summary {
		out[i] = m
	}
	return out
}

func getAttrInt(attrs graph.JSONMap, key string) int64 {
	if v, ok := attrs[key]; ok {
		switch n := v.(type) {
		case float64:
			return int64(n)
		case int64:
			return n
		}
	}
	return 0
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
```

- [ ] **Step 4: Remove TraceInsightCache stub from stubs.go**

Delete the `TraceInsightCache` struct and its methods from `api/internal/telemetry/stubs.go`.

- [ ] **Step 5: Run test**

```bash
cd api && go test ./internal/telemetry/... -run TestTraceInsightCache -v
```
Expected: PASS.

- [ ] **Step 6: Verify build**

```bash
cd api && go build ./...
```

- [ ] **Step 7: Commit**

```bash
cd api && git add internal/telemetry/insights.go internal/telemetry/insights_test.go internal/telemetry/stubs.go
git commit -m "feat: TraceInsightCache — LLM trace summarization and YAML generation"
```

---

## Task 7: Generate-flow API endpoint

**Files:**
- Modify: `api/internal/telemetry/handlers.go`
- Modify: `api/internal/api/routes.go`

- [ ] **Step 1: Add GenerateFlow handler to TelemetryHandler**

In `api/internal/telemetry/handlers.go`, add `insightCache *TraceInsightCache` field to `TelemetryHandler` and update the constructor:

```go
type TelemetryHandler struct {
	repo        *TelemetryRepository
	discovery   *FlowDiscovery
	validator   *TraceValidator
	rootcause   *RootCauseAnalyzer
	insights    *TraceInsightCache   // new
	coverage    *CoverageIndexer     // new
	logger      *zap.Logger
}

func NewTelemetryHandler(
	repo *TelemetryRepository,
	discovery *FlowDiscovery,
	validator *TraceValidator,
	rootcause *RootCauseAnalyzer,
	insights *TraceInsightCache,
	coverage *CoverageIndexer,
	logger *zap.Logger,
) *TelemetryHandler {
	return &TelemetryHandler{
		repo: repo, discovery: discovery, validator: validator,
		rootcause: rootcause, insights: insights, coverage: coverage, logger: logger,
	}
}
```

- [ ] **Step 2: Add GenerateFlow handler**

Still in `handlers.go`, add:

```go
// GenerateFlow handles POST /workspaces/:workspace_id/telemetry/traces/:trace_id/generate-flow
func (h *TelemetryHandler) GenerateFlow(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workspace_id"})
		return
	}
	traceID := c.Param("trace_id")
	if traceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "trace_id required"})
		return
	}

	// Fast path: return cached insight
	insight, err := h.insights.GetInsight(c.Request.Context(), traceID)
	if err == nil && insight.GeneratedYAML != "" {
		c.JSON(http.StatusOK, gin.H{
			"yaml":       insight.GeneratedYAML,
			"confidence": insight.Confidence,
			"intent":     insight.InferredIntent,
			"coverage":   insight.Coverage,
			"cached":     true,
		})
		return
	}

	// Slow path: compute now
	if err := h.insights.Summarize(c.Request.Context(), workspaceID, traceID); err != nil {
		h.logger.Error("failed to generate trace insight", zap.String("trace_id", traceID), zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate flow"})
		return
	}

	insight, err = h.insights.GetInsight(c.Request.Context(), traceID)
	if err != nil || insight.GeneratedYAML == "" {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "could not generate YAML — ensure AI provider is configured"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"yaml":       insight.GeneratedYAML,
		"confidence": insight.Confidence,
		"intent":     insight.InferredIntent,
		"coverage":   insight.Coverage,
		"cached":     false,
	})
}

// ListCoverageGaps handles GET /workspaces/:workspace_id/telemetry/coverage-gaps
func (h *TelemetryHandler) ListCoverageGaps(c *gin.Context) {
	workspaceID, err := uuid.Parse(c.Param("workspace_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workspace_id"})
		return
	}

	uncoveredOnly := c.DefaultQuery("uncovered", "true") == "true"
	sort := c.DefaultQuery("sort", "risk_score")
	limit := 50
	offset := 0
	if v, _ := strconv.Atoi(c.Query("limit")); v > 0 {
		limit = v
	}
	if v, _ := strconv.Atoi(c.Query("offset")); v >= 0 {
		offset = v
	}

	gaps, err := h.repo.ListCoverageGaps(c.Request.Context(), workspaceID, uncoveredOnly, sort, limit, offset)
	if err != nil {
		h.logger.Error("failed to list coverage gaps", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list gaps"})
		return
	}
	total, _ := h.repo.CountCoverageGaps(c.Request.Context(), workspaceID, false)
	uncovTotal, _ := h.repo.CountCoverageGaps(c.Request.Context(), workspaceID, true)

	c.JSON(http.StatusOK, gin.H{
		"gaps":            gaps,
		"total":           total,
		"uncovered_count": uncovTotal,
	})
}
```

- [ ] **Step 3: Update routes.go — pass insights + coverage to handler and add routes**

In `routes.go`, update the `NewTelemetryHandler` call:
```go
telemetryHandler := telemetry.NewTelemetryHandler(telemetryRepo, flowDiscovery, traceValidator, rootCauseAnalyzer, traceInsightCache, coverageIndexer, logger)
```

Find the workspace API routes section and add under telemetry routes:
```go
ws.POST("/telemetry/traces/:trace_id/generate-flow", telemetryHandler.GenerateFlow)
ws.GET("/telemetry/coverage-gaps", telemetryHandler.ListCoverageGaps)
```

- [ ] **Step 4: Delete stubs.go** (should now be empty of stubs after Tasks 5 and 6)

```bash
rm api/internal/telemetry/stubs.go
```

- [ ] **Step 5: Verify build**

```bash
cd api && go build ./...
```

- [ ] **Step 6: Smoke test the endpoint**

```bash
curl -s -X POST "http://localhost:5016/api/v1/workspaces/00000000-0000-0000-0000-000000000001/telemetry/traces/REPLACE_WITH_REAL_TRACE_ID/generate-flow" | jq .
```
Expected: `{"yaml": "flow:\n  name: ...", "confidence": 0.8, "cached": false}` or `{"error": "could not generate YAML — ensure AI provider is configured"}` if no AI key set.

- [ ] **Step 7: Commit**

```bash
cd api && git add internal/telemetry/handlers.go internal/api/routes.go
git add -u internal/telemetry/stubs.go  # delete
git commit -m "feat: generate-flow and coverage-gaps API endpoints"
```

---

## Task 8: RepairAnalyzer — execution linker + LLM repair

**Files:**
- Create: `api/internal/telemetry/repair_analyzer.go`
- Modify: `api/internal/telemetry/stubs.go` → delete ExecutionLinker stub

- [ ] **Step 1: Write failing test**

```go
// api/internal/telemetry/repair_analyzer_test.go
package telemetry_test

import (
	"context"
	"testing"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestRepairAnalyzer_NoMatchingExecution(t *testing.T) {
	db := testDB(t)
	repo := NewTelemetryRepository(db, zapNop())
	execRepo := stubExecRepo{byTraceID: nil}
	a := NewExecutionLinker(repo, execRepo, nil, zapNop())

	// Trace with no matching execution — should not error
	err := a.LinkTrace(context.Background(), uuid.New(), "nonexistent-trace")
	assert.NoError(t, err)
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && go test ./internal/telemetry/... -run TestRepairAnalyzer -v
```
Expected: compile error.

- [ ] **Step 3: Create repair_analyzer.go**

```go
// api/internal/telemetry/repair_analyzer.go
package telemetry

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/ai"
	"github.com/test-mesh/testmesh/internal/graph"
	"go.uber.org/zap"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// RepairSuggestion is an AI-generated fix for a failed execution step.
type RepairSuggestion struct {
	ID          uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	ExecutionID uuid.UUID  `gorm:"type:uuid;not null;index" json:"execution_id"`
	WorkspaceID uuid.UUID  `gorm:"type:uuid;not null;index" json:"workspace_id"`
	StepID      string     `json:"step_id"`
	Diagnosis   string     `json:"diagnosis"`
	YAMLDiff    string     `json:"yaml_diff"`
	FixedYAML   string     `json:"fixed_yaml"`
	Confidence  float64    `json:"confidence"`
	Status      string     `gorm:"default:'pending'" json:"status"` // pending | accepted | dismissed
	AppliedAt   *time.Time `json:"applied_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

func (RepairSuggestion) TableName() string { return "telemetry.repair_suggestions" }

// ExecRepoReader provides the execution-side data needed by RepairAnalyzer.
type ExecRepoReader interface {
	GetByTraceID(ctx context.Context, traceID string) (execRecord, error)
	GetSteps(execID uuid.UUID) ([]stepRecord, error)
	GetFlowYAML(flowID uuid.UUID) (string, error)
}

type execRecord struct {
	ID      uuid.UUID
	FlowID  uuid.UUID
	Status  string
	WorkspaceID uuid.UUID
}

type stepRecord struct {
	StepID      string
	StepName    string
	Action      string
	Status      string
	ErrorMessage string
	Output      map[string]interface{}
	StartedAt   *time.Time
	FinishedAt  *time.Time
}

// ExecutionLinker links completed traces to failed executions and queues repair.
type ExecutionLinker struct {
	repo      *TelemetryRepository
	execRepo  ExecRepoReader
	providers *ai.ProviderManager
	db        *gorm.DB
	logger    *zap.Logger
}

func NewExecutionLinker(repo *TelemetryRepository, execRepo interface{}, providers interface{}, logger *zap.Logger) *ExecutionLinker {
	pm, _ := providers.(*ai.ProviderManager)
	er, _ := execRepo.(ExecRepoReader)
	return &ExecutionLinker{
		repo:      repo,
		execRepo:  er,
		providers: pm,
		db:        repo.db,
		logger:    logger,
	}
}

// LinkTrace checks if the trace belongs to a failed execution and queues repair.
func (l *ExecutionLinker) LinkTrace(ctx context.Context, workspaceID uuid.UUID, traceID string) error {
	if l.execRepo == nil {
		return nil
	}

	exec, err := l.execRepo.GetByTraceID(ctx, traceID)
	if err != nil {
		return nil // no matching execution — normal case
	}
	if exec.Status != "failed" {
		return nil // only repair failures
	}

	// Check if suggestion already exists
	var count int64
	l.db.WithContext(ctx).Model(&RepairSuggestion{}).
		Where("execution_id = ?", exec.ID).Count(&count)
	if count > 0 {
		return nil // already analyzed
	}

	// Analyze in background so we don't block the enrichment pipeline
	go func() {
		bgCtx := context.Background()
		if err := l.analyze(bgCtx, exec, traceID); err != nil {
			l.logger.Warn("repair analysis failed",
				zap.String("execution_id", exec.ID.String()),
				zap.Error(err))
		}
	}()

	return nil
}

func (l *ExecutionLinker) analyze(ctx context.Context, exec execRecord, traceID string) error {
	steps, err := l.execRepo.GetSteps(exec.ID)
	if err != nil {
		return fmt.Errorf("get steps: %w", err)
	}

	var failedSteps []stepRecord
	for _, s := range steps {
		if s.Status == "failed" {
			failedSteps = append(failedSteps, s)
		}
	}
	if len(failedSteps) == 0 {
		return nil
	}

	spans, err := l.repo.GetSpansByTraceID(ctx, exec.WorkspaceID, traceID)
	if err != nil {
		return fmt.Errorf("get spans: %w", err)
	}

	flowYAML, err := l.execRepo.GetFlowYAML(exec.FlowID)
	if err != nil {
		return fmt.Errorf("get flow yaml: %w", err)
	}

	if l.providers == nil {
		return nil
	}
	provider, err := l.providers.GetPrimaryProvider()
	if err != nil {
		return nil // no AI provider configured
	}

	// Build diff context for each failed step
	type diffCtx struct {
		Step   map[string]interface{} `json:"step"`
		Actual map[string]interface{} `json:"actual"`
		Span   map[string]interface{} `json:"span,omitempty"`
	}

	var diffs []diffCtx
	for _, fs := range failedSteps {
		dc := diffCtx{
			Step: map[string]interface{}{
				"name":   fs.StepName,
				"action": fs.Action,
				"error":  fs.ErrorMessage,
			},
			Actual: map[string]interface{}{},
		}
		if fs.Output != nil {
			dc.Actual = fs.Output
		}
		// Find matching span by URL overlap
		if matched := matchSpan(spans, fs); matched != nil {
			dc.Span = map[string]interface{}{
				"service":   matched.Service,
				"operation": matched.Operation,
				"status":    matched.StatusCode,
				"duration":  matched.DurationMs,
			}
		}
		diffs = append(diffs, dc)
	}

	diffJSON, _ := json.MarshalIndent(diffs, "", "  ")

	prompt := fmt.Sprintf(`A TestMesh flow step failed. Here is the context:

Failed steps with trace context:
%s

Current flow YAML:
%s

Produce ONLY valid JSON (no markdown):
{
  "diagnosis": "one paragraph explaining root cause",
  "yaml_diff": "human-readable unified diff showing the change (--- a/flow.yaml, +++ b/flow.yaml format)",
  "fixed_yaml": "complete updated flow YAML with only the failing step(s) changed",
  "step_id": "the step ID that failed",
  "confidence": 0.0
}`, string(diffJSON), flowYAML)

	resp, err := provider.Generate(ctx, ai.GenerateRequest{
		Prompt:      prompt,
		MaxTokens:   4096,
		Temperature: 0.1,
	})
	if err != nil {
		return fmt.Errorf("LLM call: %w", err)
	}

	content := strings.TrimSpace(resp.Content)
	if idx := strings.Index(content, "{"); idx > 0 {
		content = content[idx:]
	}
	if idx := strings.LastIndex(content, "}"); idx >= 0 && idx < len(content)-1 {
		content = content[:idx+1]
	}

	var result struct {
		Diagnosis  string  `json:"diagnosis"`
		YAMLDiff   string  `json:"yaml_diff"`
		FixedYAML  string  `json:"fixed_yaml"`
		StepID     string  `json:"step_id"`
		Confidence float64 `json:"confidence"`
	}
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		l.logger.Warn("failed to parse repair LLM response", zap.Error(err))
		return nil
	}

	suggestion := &RepairSuggestion{
		ExecutionID: exec.ID,
		WorkspaceID: exec.WorkspaceID,
		StepID:      result.StepID,
		Diagnosis:   result.Diagnosis,
		YAMLDiff:    result.YAMLDiff,
		FixedYAML:   result.FixedYAML,
		Confidence:  result.Confidence,
		Status:      "pending",
		CreatedAt:   time.Now().UTC(),
	}

	return l.db.WithContext(ctx).
		Clauses(clause.OnConflict{DoNothing: true}).
		Create(suggestion).Error
}

func matchSpan(spans []Span, step stepRecord) *Span {
	stepURL := ""
	if v, ok := step.Output["url"].(string); ok {
		stepURL = v
	}
	stepMethod := ""
	if v, ok := step.Output["method"].(string); ok {
		stepMethod = v
	}

	for i := range spans {
		s := &spans[i]
		if s.IsTestGenerated {
			continue
		}
		spanMethod := getStringAttrMap(s.Attributes, "http.method")
		spanRoute := getStringAttrMap(s.Attributes, "http.route")
		if stepMethod != "" && spanMethod != "" && !strings.EqualFold(stepMethod, spanMethod) {
			continue
		}
		if stepURL != "" && spanRoute != "" && strings.Contains(stepURL, strings.TrimRight(spanRoute, "/:id")) {
			return s
		}
	}
	return nil
}
```

- [ ] **Step 4: Add repair suggestion repository methods to TelemetryRepository**

In `api/internal/telemetry/repository.go`, add:

```go
func (r *TelemetryRepository) GetRepairSuggestions(ctx context.Context, executionID uuid.UUID) ([]RepairSuggestion, error) {
	var suggestions []RepairSuggestion
	err := r.db.WithContext(ctx).
		Where("execution_id = ?", executionID).
		Order("created_at DESC").
		Find(&suggestions).Error
	return suggestions, err
}

func (r *TelemetryRepository) ApplyRepairSuggestion(ctx context.Context, suggestionID uuid.UUID) (*RepairSuggestion, error) {
	var s RepairSuggestion
	if err := r.db.WithContext(ctx).Where("id = ?", suggestionID).First(&s).Error; err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	s.Status = "accepted"
	s.AppliedAt = &now
	return &s, r.db.WithContext(ctx).Save(&s).Error
}

func (r *TelemetryRepository) DismissRepairSuggestion(ctx context.Context, suggestionID uuid.UUID) error {
	return r.db.WithContext(ctx).Model(&RepairSuggestion{}).
		Where("id = ?", suggestionID).
		Update("status", "dismissed").Error
}
```

- [ ] **Step 5: Remove ExecutionLinker stub from stubs.go** (file should now be empty — delete it)

```bash
rm api/internal/telemetry/stubs.go 2>/dev/null || true
```

- [ ] **Step 6: Run test**

```bash
cd api && go test ./internal/telemetry/... -run TestRepairAnalyzer -v
```
Expected: PASS.

- [ ] **Step 7: Verify build**

```bash
cd api && go build ./...
```

- [ ] **Step 8: Commit**

```bash
cd api && git add internal/telemetry/repair_analyzer.go internal/telemetry/repair_analyzer_test.go internal/telemetry/repository.go
git commit -m "feat: RepairAnalyzer — AI-powered repair suggestions for failed executions"
```

---

## Task 9: Repair suggestion API endpoints

**Files:**
- Modify: `api/internal/telemetry/handlers.go`
- Modify: `api/internal/api/routes.go`

- [ ] **Step 1: Add repair handlers to TelemetryHandler**

Add `repairRepo repairReader` field to `TelemetryHandler` (where `repairReader` is the subset of TelemetryRepository for repair). Update constructor to accept it.

Add handlers in `handlers.go`:

```go
// ListRepairSuggestions handles GET /executions/:id/repair-suggestions
func (h *TelemetryHandler) ListRepairSuggestions(c *gin.Context) {
	execID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid execution id"})
		return
	}
	suggestions, err := h.repo.GetRepairSuggestions(c.Request.Context(), execID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get suggestions"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"suggestions": suggestions})
}

// ApplyRepairSuggestion handles POST /executions/:id/repair-suggestions/:sid/apply
func (h *TelemetryHandler) ApplyRepairSuggestion(c *gin.Context) {
	execID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid execution id"})
		return
	}
	sidStr := c.Param("sid")
	sid, err := uuid.Parse(sidStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid suggestion id"})
		return
	}

	suggestion, err := h.repo.ApplyRepairSuggestion(c.Request.Context(), sid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to apply suggestion"})
		return
	}
	if suggestion.FixedYAML == "" {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "suggestion has no fixed YAML"})
		return
	}

	// Load the execution to find the flow
	exec, err := h.execRepo.GetByID(execID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "execution not found"})
		return
	}

	// Update flow definition
	if err := h.flowRepo.UpdateDefinitionYAML(c.Request.Context(), exec.FlowID, suggestion.FixedYAML); err != nil {
		h.logger.Error("failed to apply fixed YAML to flow", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update flow definition"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"flow_id":  exec.FlowID,
		"redirect": "/flows/" + exec.FlowID.String(),
	})
}

// DismissRepairSuggestion handles POST /executions/:id/repair-suggestions/:sid/dismiss
func (h *TelemetryHandler) DismissRepairSuggestion(c *gin.Context) {
	sid, err := uuid.Parse(c.Param("sid"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid suggestion id"})
		return
	}
	if err := h.repo.DismissRepairSuggestion(c.Request.Context(), sid); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to dismiss"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "dismissed"})
}
```

- [ ] **Step 2: Add `UpdateDefinitionYAML` to flow repository**

In `api/internal/storage/repository/flows.go`, add:

```go
func (r *FlowRepository) UpdateDefinitionYAML(ctx context.Context, flowID uuid.UUID, yamlContent string) error {
	var def models.FlowDefinition
	if err := yaml.Unmarshal([]byte(yamlContent), &def); err != nil {
		return fmt.Errorf("invalid YAML: %w", err)
	}
	return r.db.WithContext(ctx).Model(&models.Flow{}).
		Where("id = ?", flowID).
		Update("definition", def).Error
}
```

Add imports: `"context"`, `"fmt"`, `"gopkg.in/yaml.v3"` if not already present.

- [ ] **Step 3: Register routes in routes.go**

Find the execution routes section in `routes.go` and add:

```go
v1.GET("/executions/:id/repair-suggestions", telemetryHandler.ListRepairSuggestions)
v1.POST("/executions/:id/repair-suggestions/:sid/apply", telemetryHandler.ApplyRepairSuggestion)
v1.POST("/executions/:id/repair-suggestions/:sid/dismiss", telemetryHandler.DismissRepairSuggestion)
```

Also pass `execRepo` and `flowRepo` to `NewTelemetryHandler` (update call in routes.go):

```go
telemetryHandler := telemetry.NewTelemetryHandler(
    telemetryRepo, flowDiscovery, traceValidator, rootCauseAnalyzer,
    traceInsightCache, coverageIndexer,
    executionRepo, flowRepo,
    logger,
)
```

Update `TelemetryHandler` struct and constructor in `handlers.go` to add these two fields and accept them.

- [ ] **Step 4: Verify build**

```bash
cd api && go build ./...
```

- [ ] **Step 5: Commit**

```bash
cd api && git add internal/telemetry/handlers.go internal/api/routes.go internal/storage/repository/flows.go
git commit -m "feat: repair suggestion list/apply/dismiss endpoints"
```

---

## Task 10: Dashboard — types, API client, and hooks

**Files:**
- Modify: `dashboard/lib/api/types.ts`
- Modify: `dashboard/lib/api/client.ts`
- Create: `dashboard/lib/hooks/useCoverage.ts`
- Modify: `dashboard/lib/hooks/useTelemetry.ts`

- [ ] **Step 1: Add new types to types.ts**

Find the end of `dashboard/lib/api/types.ts` and add:

```typescript
export interface CoverageGap {
  id: string;
  service: string;
  method: string;
  route: string;
  occurrence_count: number;
  error_count: number;
  avg_latency_ms: number;
  last_seen_at: string;
  risk_score: number;
  has_test_flow: boolean;
  sample_trace_id: string;
}

export interface CoverageGapsResponse {
  gaps: CoverageGap[];
  total: number;
  uncovered_count: number;
}

export interface GenerateFlowResponse {
  yaml: string;
  confidence: number;
  intent: string;
  coverage: Array<{ method: string; route: string; service: string }>;
  cached: boolean;
}

export interface RepairSuggestion {
  id: string;
  execution_id: string;
  step_id: string;
  diagnosis: string;
  yaml_diff: string;
  fixed_yaml: string;
  confidence: number;
  status: 'pending' | 'accepted' | 'dismissed';
  applied_at?: string;
  created_at: string;
}
```

- [ ] **Step 2: Add API methods to client.ts**

In `dashboard/lib/api/client.ts`, add to the `telemetryApi` object (or wherever telemetry calls live):

```typescript
generateFlow: (workspaceId: string, traceId: string): Promise<GenerateFlowResponse> =>
  apiRequest(`/workspaces/${workspaceId}/telemetry/traces/${traceId}/generate-flow`, {
    method: 'POST',
  }),

getCoverageGaps: (workspaceId: string, params?: {
  uncovered?: boolean;
  sort?: string;
  limit?: number;
  offset?: number;
}): Promise<CoverageGapsResponse> => {
  const qs = new URLSearchParams();
  if (params?.uncovered !== undefined) qs.set('uncovered', String(params.uncovered));
  if (params?.sort) qs.set('sort', params.sort);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  return apiRequest(`/workspaces/${workspaceId}/telemetry/coverage-gaps?${qs}`);
},

getRepairSuggestions: (executionId: string): Promise<{ suggestions: RepairSuggestion[] }> =>
  apiRequest(`/executions/${executionId}/repair-suggestions`),

applyRepairSuggestion: (executionId: string, suggestionId: string): Promise<{ flow_id: string; redirect: string }> =>
  apiRequest(`/executions/${executionId}/repair-suggestions/${suggestionId}/apply`, { method: 'POST' }),

dismissRepairSuggestion: (executionId: string, suggestionId: string): Promise<void> =>
  apiRequest(`/executions/${executionId}/repair-suggestions/${suggestionId}/dismiss`, { method: 'POST' }),
```

- [ ] **Step 3: Create useCoverage.ts**

```typescript
// dashboard/lib/hooks/useCoverage.ts
import { useMutation, useQuery } from '@tanstack/react-query';
import { telemetryApi } from '../api/client';
import { getActiveWorkspaceId } from './useWorkspaces';

export function useCoverageGaps(params?: {
  uncovered?: boolean;
  sort?: string;
  limit?: number;
}) {
  const workspaceId = getActiveWorkspaceId();
  return useQuery({
    queryKey: ['coverage-gaps', workspaceId, params],
    queryFn: () => telemetryApi.getCoverageGaps(workspaceId ?? '', params),
    enabled: !!workspaceId,
  });
}

export function useGenerateFlow() {
  const workspaceId = getActiveWorkspaceId();
  return useMutation({
    mutationFn: (traceId: string) =>
      telemetryApi.generateFlow(workspaceId ?? '', traceId),
  });
}
```

- [ ] **Step 4: Add repair hooks to useTelemetry.ts**

In `dashboard/lib/hooks/useTelemetry.ts`, add:

```typescript
export function useRepairSuggestions(executionId: string) {
  return useQuery({
    queryKey: ['repair-suggestions', executionId],
    queryFn: () => telemetryApi.getRepairSuggestions(executionId),
    enabled: !!executionId,
    refetchInterval: (data) => {
      // Poll every 3s until a non-pending suggestion arrives
      const hasPending = data?.suggestions?.some(s => s.status === 'pending');
      return hasPending || !data ? 3000 : false;
    },
  });
}

export function useApplyRepairSuggestion() {
  return useMutation({
    mutationFn: ({ executionId, suggestionId }: { executionId: string; suggestionId: string }) =>
      telemetryApi.applyRepairSuggestion(executionId, suggestionId),
  });
}

export function useDismissRepairSuggestion() {
  return useMutation({
    mutationFn: ({ executionId, suggestionId }: { executionId: string; suggestionId: string }) =>
      telemetryApi.dismissRepairSuggestion(executionId, suggestionId),
  });
}
```

- [ ] **Step 5: Verify TypeScript build**

```bash
cd dashboard && npm run build 2>&1 | tail -20
```
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
cd dashboard && git add lib/api/types.ts lib/api/client.ts lib/hooks/useCoverage.ts lib/hooks/useTelemetry.ts
git commit -m "feat: coverage gaps and repair suggestion types, API client, hooks"
```

---

## Task 11: RepairSuggestionCard component + execution detail page

**Files:**
- Create: `dashboard/components/traces/RepairSuggestionCard.tsx`
- Modify: `dashboard/app/executions/[id]/page.tsx`

- [ ] **Step 1: Create RepairSuggestionCard.tsx**

```tsx
// dashboard/components/traces/RepairSuggestionCard.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, ChevronDown, ChevronUp, Check, X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useApplyRepairSuggestion, useDismissRepairSuggestion } from '@/lib/hooks/useTelemetry';
import type { RepairSuggestion } from '@/lib/api/types';

interface Props {
  executionId: string;
  suggestion: RepairSuggestion;
}

export function RepairSuggestionCard({ executionId, suggestion }: Props) {
  const [showDiff, setShowDiff] = useState(false);
  const router = useRouter();
  const apply = useApplyRepairSuggestion();
  const dismiss = useDismissRepairSuggestion();

  if (suggestion.status === 'dismissed') return null;

  const confidencePct = Math.round(suggestion.confidence * 100);

  const handleApply = async () => {
    const result = await apply.mutateAsync({ executionId, suggestionId: suggestion.id });
    router.push(result.redirect);
  };

  const handleDismiss = () => {
    dismiss.mutate({ executionId, suggestionId: suggestion.id });
  };

  return (
    <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20 mb-4">
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-blue-600" />
          <span className="font-semibold text-sm">Repair Suggestion</span>
          <Badge variant="outline" className="text-xs ml-auto">
            {confidencePct}% confidence
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
          {suggestion.diagnosis}
        </p>

        {suggestion.yaml_diff && (
          <div className="mb-3">
            <button
              onClick={() => setShowDiff(!showDiff)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {showDiff ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showDiff ? 'Hide diff' : 'View diff'}
            </button>
            {showDiff && (
              <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap">
                {suggestion.yaml_diff}
              </pre>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={handleApply}
            disabled={apply.isPending || suggestion.status === 'accepted'}
          >
            <Check className="w-3 h-3 mr-1" />
            Apply fix
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push(`/flows/${suggestion.step_id}`)}
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            Edit in editor
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDismiss}
            disabled={dismiss.isPending}
          >
            <X className="w-3 h-3 mr-1" />
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Add repair card to execution detail page**

In `dashboard/app/executions/[id]/page.tsx`, add the import at the top:

```typescript
import { RepairSuggestionCard } from '@/components/traces/RepairSuggestionCard';
import { useRepairSuggestions } from '@/lib/hooks/useTelemetry';
```

After the existing hooks near the top of the component (around line 105–107), add:

```typescript
const { data: repairData } = useRepairSuggestions(
  execution?.status === 'failed' && execution?.trace_id ? id : ''
);
const repairSuggestion = repairData?.suggestions?.find(s => s.status !== 'dismissed');
```

In the Results tab, inside `<TabsContent value="results">`, just before the Step Execution card (`<Card>` with `<CardTitle>Step Execution</CardTitle>`), add:

```tsx
{repairSuggestion && (
  <RepairSuggestionCard
    executionId={id}
    suggestion={repairSuggestion}
  />
)}
```

- [ ] **Step 3: Verify TypeScript build**

```bash
cd dashboard && npm run build 2>&1 | tail -20
```
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
cd dashboard && git add components/traces/RepairSuggestionCard.tsx app/executions/\[id\]/page.tsx
git commit -m "feat: repair suggestion card on failed execution detail page"
```

---

## Task 12: Coverage page UI

**Files:**
- Create: `dashboard/app/coverage/page.tsx`
- Modify: dashboard sidebar navigation (find the actual sidebar file)

- [ ] **Step 1: Find sidebar file**

```bash
find /Users/ggeorgiev/Dev/testmesh/testmesh/dashboard -name "*.tsx" | xargs grep -l "Traces\|traces" | head -5
```

- [ ] **Step 2: Create coverage page**

```tsx
// dashboard/app/coverage/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCoverageGaps, useGenerateFlow } from '@/lib/hooks/useCoverage';
import { getActiveWorkspaceId } from '@/lib/hooks/useWorkspaces';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Sparkles, AlertTriangle } from 'lucide-react';
import type { CoverageGap, GenerateFlowResponse } from '@/lib/api/types';

function RiskBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = score > 0.7 ? 'bg-red-500' : score > 0.3 ? 'bg-amber-500' : 'bg-green-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{pct}</span>
    </div>
  );
}

function GenerateFlowModal({
  result,
  onClose,
  onSave,
}: {
  result: GenerateFlowResponse;
  onClose: () => void;
  onSave: (yaml: string) => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="font-semibold">Generated Test Flow</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{result.intent}</p>
          </div>
          <Badge variant="outline">{Math.round(result.confidence * 100)}% confidence</Badge>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <pre className="text-xs font-mono bg-muted p-3 rounded overflow-x-auto whitespace-pre-wrap">
            {result.yaml}
          </pre>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => { navigator.clipboard.writeText(result.yaml); }}>
            Copy YAML
          </Button>
          <Button onClick={() => onSave(result.yaml)}>
            <Sparkles className="w-3 h-3 mr-1" />
            Save as flow
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function CoveragePage() {
  const router = useRouter();
  const workspaceId = getActiveWorkspaceId();
  const [tab, setTab] = useState<'uncovered' | 'all'>('uncovered');
  const [generatedFlow, setGeneratedFlow] = useState<GenerateFlowResponse | null>(null);
  const [generatingTraceId, setGeneratingTraceId] = useState<string | null>(null);

  const { data, isLoading } = useCoverageGaps({
    uncovered: tab === 'uncovered',
    sort: 'risk_score',
    limit: 50,
  });

  const generateFlow = useGenerateFlow();

  const handleGenerate = async (gap: CoverageGap) => {
    if (!gap.sample_trace_id) return;
    setGeneratingTraceId(gap.sample_trace_id);
    try {
      const result = await generateFlow.mutateAsync(gap.sample_trace_id);
      setGeneratedFlow(result);
    } finally {
      setGeneratingTraceId(null);
    }
  };

  const handleSaveFlow = (_yaml: string) => {
    // Navigate to new flow page with YAML pre-filled
    // For now, redirect to flows page — full editor integration is future work
    router.push('/flows/new');
    setGeneratedFlow(null);
  };

  const gaps = data?.gaps ?? [];

  return (
    <div className="container mx-auto py-8">
      {generatedFlow && (
        <GenerateFlowModal
          result={generatedFlow}
          onClose={() => setGeneratedFlow(null)}
          onSave={handleSaveFlow}
        />
      )}

      <div className="mb-6">
        <h1 className="text-3xl font-bold">Coverage Gaps</h1>
        <p className="text-muted-foreground mt-1">
          Real-traffic endpoints that have no test flow, ranked by risk.
        </p>
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-red-600">{data.uncovered_count}</div>
              <div className="text-sm text-muted-foreground">Untested endpoints</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{data.total}</div>
              <div className="text-sm text-muted-foreground">Total endpoints seen</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'uncovered' | 'all')}>
        <TabsList>
          <TabsTrigger value="uncovered">
            Uncovered
            {data?.uncovered_count ? (
              <span className="ml-1.5 text-xs bg-red-500 text-white rounded-full px-1.5">
                {data.uncovered_count}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          <Card>
            <CardHeader>
              <CardTitle>Endpoints</CardTitle>
              <CardDescription>
                Sorted by risk score — higher means more traffic, errors, or latency.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading && (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {!isLoading && gaps.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No endpoints seen yet — send traces to TestMesh to discover your coverage.
                </div>
              )}

              {gaps.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="pb-2 font-medium">Service</th>
                      <th className="pb-2 font-medium">Endpoint</th>
                      <th className="pb-2 font-medium">Calls</th>
                      <th className="pb-2 font-medium">Risk</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {gaps.map((gap) => (
                      <tr key={gap.id} className="py-2">
                        <td className="py-3 text-muted-foreground">{gap.service}</td>
                        <td className="py-3 font-mono">
                          <span className="text-xs bg-muted px-1.5 py-0.5 rounded mr-1.5">
                            {gap.method}
                          </span>
                          {gap.route}
                        </td>
                        <td className="py-3">{gap.occurrence_count.toLocaleString()}</td>
                        <td className="py-3">
                          <RiskBar score={gap.risk_score} />
                        </td>
                        <td className="py-3">
                          {gap.has_test_flow ? (
                            <Badge variant="outline" className="text-green-600 border-green-300">
                              Has test
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              No test
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          {!gap.has_test_flow && gap.sample_trace_id && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={generatingTraceId === gap.sample_trace_id}
                              onClick={() => handleGenerate(gap)}
                            >
                              {generatingTraceId === gap.sample_trace_id ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <Sparkles className="w-3 h-3 mr-1" />
                              )}
                              Generate test
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 3: Add Coverage to sidebar navigation**

Find the sidebar file identified in Step 1. Locate where "Traces" is added as a nav link and add "Coverage" immediately after it:

```tsx
{ href: '/coverage', label: 'Coverage', icon: <ShieldCheck className="w-4 h-4" /> },
```

Add `ShieldCheck` to the lucide-react import.

- [ ] **Step 4: Verify TypeScript build**

```bash
cd dashboard && npm run build 2>&1 | tail -20
```
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
cd dashboard && git add app/coverage/page.tsx
git commit -m "feat: coverage gaps page with risk ranking and generate-test action"
```

---

## Task 13: Docs

**Files:**
- Create: `testmesh/docs/guides/tracing/overview.md`
- Create: `testmesh/docs/guides/tracing/integration.md`
- Create: `testmesh/docs/guides/tracing/test-generation.md`
- Create: `testmesh/docs/guides/tracing/repair.md`

- [ ] **Step 1: Create docs directory**

```bash
mkdir -p /Users/ggeorgiev/Dev/testmesh/testmesh/docs/guides/tracing
```

- [ ] **Step 2: Create overview.md**

```markdown
# Tracing Overview

TestMesh receives OpenTelemetry spans from your services and uses them to help you write and fix tests.

## What TestMesh does with traces

```
Your services (OTel-instrumented)
  │  OTLP/HTTP
  ▼
TestMesh API  POST /otlp/v1/traces
  │
  ├── Store spans in telemetry.spans
  ├── Discover flow patterns (telemetry.discovered_flows)
  ├── Index coverage gaps (telemetry.coverage_gaps)
  ├── Link traces to failed executions → repair suggestions
  └── Summarize with LLM → generated YAML flows (telemetry.trace_insights)
```

## Sub-guides

- [Integration](./integration.md) — Send spans from your services to TestMesh
- [Test Generation](./test-generation.md) — Generate runnable YAML flows from real traces
- [Repair Suggestions](./repair.md) — Fix failing tests using trace diffs
```

- [ ] **Step 3: Create integration.md**

```markdown
# Integrating Your Services with TestMesh Tracing

## Prerequisites

Your services must already be instrumented with OpenTelemetry and export spans via OTLP.

## Direct send (recommended)

Set these environment variables on each service:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://your-testmesh-host:5016
OTEL_EXPORTER_OTLP_HEADERS="X-Workspace-ID=YOUR_WORKSPACE_UUID"
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
```

Your workspace UUID is visible in TestMesh → Settings → Workspace.

## Production: API key auth

For internet-facing deployments, use an API key instead of a bare UUID:

1. Go to Settings → API Keys → Create Key
2. Copy the key (shown once)
3. Set:

```bash
OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer tm_live_YOUR_KEY"
```

## Via OTel Collector (if you already have one)

Add an exporter to your `otel-collector.yaml`:

```yaml
exporters:
  otlphttp/testmesh:
    traces_endpoint: "http://your-testmesh-host:5016/otlp/v1/traces"
    compression: none
    headers:
      X-Workspace-ID: "YOUR_WORKSPACE_UUID"
    tls:
      insecure: true

service:
  pipelines:
    traces:
      exporters: [otlp/tempo, otlphttp/testmesh]  # fan-out to both
```

## Verify spans are arriving

1. Run your service or trigger some traffic
2. Open TestMesh → Traces — spans should appear within 30 seconds
3. Check Settings → Workspace → Span count (increments as spans arrive)

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| No spans in TestMesh | Wrong endpoint URL | Check `OTEL_EXPORTER_OTLP_ENDPOINT` includes the port |
| `400 X-Workspace-ID header is required` | Missing header | Add `X-Workspace-ID` to `OTEL_EXPORTER_OTLP_HEADERS` |
| `400 invalid OTLP protobuf payload` | Content-type mismatch | Set `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf` |
| Collector sends gzip but TestMesh rejects | Collector default | Add `compression: none` to the `otlphttp/testmesh` exporter in collector config |
| `401 invalid API key` | Key revoked or mistyped | Regenerate key in Settings → API Keys |
```

- [ ] **Step 4: Create test-generation.md**

```markdown
# Generating Tests from Traces

Once TestMesh is receiving spans from your services, you can generate runnable YAML test flows from real traces.

## How to generate a test

**From a trace:**
1. Open Traces → find a trace that represents a flow you want to test
2. Click "Generate test"
3. Review the generated YAML — TestMesh uses the actual span data (methods, URLs, status codes)
4. Click "Save as flow" to create the flow in TestMesh

**From Coverage Gaps:**
1. Open Coverage in the sidebar
2. Find an endpoint with "No test" status
3. Click "Generate test" — TestMesh uses the most recent real trace for that endpoint

**From Discovered Flows:**
1. Open Traces → Discovered Flows
2. Click "Generate test" on any discovered flow pattern

## What the generated YAML contains

- HTTP steps with method and URL derived from `http.method` and `http.route` span attributes
- Status code assertions: `assert: - status == 201`
- Response body assertions for key fields: `assert: - $.body.id != ""`
- Variable extraction where values flow between steps: `output: {order_id: $.body.id}`
- Placeholder variables `{{base_url}}`, `{{api_key}}` for environment-specific values

## Improving generation quality

The richer your span attributes, the better the generated YAML. Add these OTel attributes to improve results:

| Attribute | What it enables |
|-----------|----------------|
| `http.request.body` | Request payload in generated step |
| `http.response.body` | Response body assertions |
| `http.route` | Parameterised URL (e.g. `/orders/:id`) instead of concrete URL |
| `http.method` | Correct HTTP method in step config |

Example (Go):
```go
span.SetAttributes(
    attribute.String("http.request.body", string(bodyBytes)),
    attribute.String("http.response.body", string(respBytes)),
)
```

## Confidence score

The generated flow includes a `confidence` score (0–1). Scores below 0.6 mean:
- TestMesh could not infer request bodies (not instrumented)
- The trace had very few spans
- The AI provider could not determine inter-step variable relationships

Lower-confidence flows still run correctly but may need manual assertion tuning.
```

- [ ] **Step 5: Create repair.md**

```markdown
# Repair Suggestions

When a test execution fails and TestMesh has a trace for that execution, it automatically generates a repair suggestion.

## When repair suggestions appear

A repair suggestion card appears on the execution detail page when:
1. The execution `status` is `failed`
2. The execution has a `trace_id` (tracing is enabled and the execution produced spans)
3. An AI provider is configured in Settings → Integrations

The suggestion is computed asynchronously — it may appear 5–30 seconds after the execution completes.

## Reading the suggestion

The card shows:
- **Diagnosis**: a plain-English explanation of what diverged between what the test expected and what the service returned
- **Diff**: the specific YAML change needed (click "View diff" to expand)
- **Confidence**: how certain the AI is (0–100%). Treat anything below 50% with extra scrutiny.

## Applying a suggestion

Click **Apply fix** to:
1. Validate the fixed YAML
2. Update the flow definition
3. Redirect to the flow editor for review

The original flow definition is preserved in history — you can revert via the flow's history tab.

## Dismissing a suggestion

Click **Dismiss** to hide the card. This does not affect the flow or execution.

## Confidence guidance

| Range | What it means |
|-------|--------------|
| 80–100% | High confidence — root cause is clear from the trace |
| 50–79% | Medium confidence — plausible but review the diff before applying |
| Below 50% | Low confidence — use the diagnosis as a hint, fix manually |

## Limitations

- Repair suggestions require the failing service to be OTel-instrumented. If the service did not produce spans, TestMesh cannot match the test step to a real service call.
- The AI may suggest updating an assertion when the real fix is in the service itself (e.g., a bug in the service returning the wrong status code). Always verify whether the test needs to change or the service does.
```

- [ ] **Step 6: Commit docs**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh && git add docs/guides/tracing/
git commit -m "docs: tracing integration guides — overview, integration, test generation, repair"
```

---

## Self-review checklist

After completing all tasks, verify:

- [ ] `go build ./...` passes in `api/`
- [ ] `npm run build` passes in `dashboard/`
- [ ] `go test ./internal/telemetry/...` passes
- [ ] Sending a real trace to `POST /otlp/v1/traces` with `X-Workspace-ID` header stores spans and triggers enrichment
- [ ] `GET /api/v1/workspaces/:id/telemetry/coverage-gaps` returns data after traces arrive
- [ ] `POST .../traces/:id/generate-flow` returns YAML (requires AI provider configured)
- [ ] `/coverage` page loads and shows gaps table
- [ ] Failed execution with `trace_id` shows repair suggestion card within 30s
- [ ] Apply fix updates the flow definition and redirects
