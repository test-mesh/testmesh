# GitHub + LLM + Embeddings Integration Design

**Date**: 2026-03-28
**Status**: Approved
**Scope**: Full integration of GitHub PR write-back, workspace-level LLM provider routing, and embedding-based semantic search

## Motivation

TestMesh has substantial infrastructure for GitHub webhooks, LLM providers, diff analysis, and self-healing — but the "last mile" pieces are missing. Specifically:

- **GitHub**: Webhooks receive events and analyze diffs, but results are never written back to PRs (no comments, status checks, or fix PRs)
- **LLM**: Three providers are fully implemented, but selection is global — no workspace or agent-level routing, and keys are configured via env vars only
- **Embeddings**: No semantic search capability — agents can only find related entities through explicit graph edges or tag matching

This design completes these systems so that the end-to-end flow works: a PR opens → agents analyze → results appear on the PR → fixes are suggested or auto-applied.

## Implementation Sequence

Use-case driven (Approach C): build toward a working PR review flow first, then layer on embeddings.

1. Encrypted key store (extending existing)
2. GitHub PR write-back + LLM provider wiring
3. Auto-PR creation from self-healing suggestions
4. Embedding infrastructure
5. Embedding consumers

Each step is independently testable and shippable.

---

## 1. Encrypted Key Store (Extending Existing)

### Context

`IntegrationSecret` already handles AES-256 encryption with per-secret nonces. `SystemIntegration` models providers (ai_provider, git) with configs. The gap is workspace scoping — currently integrations are global.

### Changes

#### 1a. Add `WorkspaceID` to `SystemIntegration`

```go
type SystemIntegration struct {
    // ... existing fields ...
    WorkspaceID *uuid.UUID `json:"workspace_id,omitempty"` // nil = global default, set = workspace-specific
}
```

A nullable column. Global integrations (nil) serve as defaults. Workspace-specific integrations override the global for that workspace.

#### 1b. Provider resolution order

```
workspace-specific integration → global integration → env var fallback
```

The existing `IntegrationProvider` interface (which has `GetAIIntegrations()`) is extended with a workspace-scoped method:

```go
type IntegrationProvider interface {
    GetAIIntegrations() ([]*IntegrationData, error)                              // existing
    GetAIIntegrationsForWorkspace(workspaceID uuid.UUID) ([]*IntegrationData, error) // new
}
```

`ProviderManager` gets a new method `LoadForWorkspace(repo IntegrationProvider, workspaceID uuid.UUID)` that calls `GetAIIntegrationsForWorkspace` and layers workspace-specific providers on top of the global ones.

#### 1c. Dashboard UI

Under workspace settings, an "Integrations" page:

- List configured integrations (GitHub, OpenAI, Anthropic, etc.)
- Add/edit/delete integrations with provider-specific forms
- Secrets are never returned to the frontend — only a `"configured": true` flag
- Test connection button uses existing `LastTestAt`/`LastTestStatus` fields

### No new tables needed

Just a nullable `workspace_id` column on `system_integrations`.

---

## 2. GitHub PR Write-Back

### Context

`GitProvider` interface currently only reads (diffs, file lists). Write methods are needed for commenting, status checks, and PR creation.

### 2a. Extended `GitProvider` interface

```go
type GitProvider interface {
    // Existing (read)
    FetchDiff(ctx context.Context, repo, beforeSHA, afterSHA string) (string, []string, error)
    ListRepositories(ctx context.Context, search string) ([]Repository, error)
    Name() string

    // New (write)
    CreatePRComment(ctx context.Context, repo string, prNumber int, body string) error
    CreateCommitStatus(ctx context.Context, repo, sha string, status CommitStatus) error
    CreatePullRequest(ctx context.Context, repo string, pr PullRequestCreate) (*PullRequest, error)
    CreateBranch(ctx context.Context, repo, branchName, fromSHA string) error
    PushFileChanges(ctx context.Context, repo, branch, message string, files []FileChange) (*string, error)
}
```

Supporting types:

```go
type CommitStatus struct {
    State       string // pending, success, failure, error
    Context     string // "testmesh/analysis", "testmesh/self-healing"
    Description string
    TargetURL   string // link back to dashboard
}

type PullRequestCreate struct {
    Title  string
    Body   string
    Head   string // source branch
    Base   string // target branch
}

type PullRequest struct {
    Number  int
    HTMLURL string
}

type FileChange struct {
    Path    string
    Content string
}
```

GitHub implementation uses REST API endpoints:

- `POST /repos/{owner}/{repo}/issues/{pr}/comments` — PR comments
- `POST /repos/{owner}/{repo}/statuses/{sha}` — commit statuses
- `POST /repos/{owner}/{repo}/pulls` — create PR
- `POST /repos/{owner}/{repo}/git/refs` — create branch
- `PushFileChanges` uses the low-level Git Data API for atomic multi-file commits:
  1. `POST /repos/{owner}/{repo}/git/trees` — create tree with all file changes
  2. `POST /repos/{owner}/{repo}/git/commits` — create commit referencing the tree
  3. `PATCH /repos/{owner}/{repo}/git/refs/{ref}` — update branch ref to new commit

  This ensures auto-PR fixes with multiple file changes are committed atomically (the Contents API only supports single-file updates).

Gitea/GitLab get stub implementations returning `ErrNotSupported` initially.

### 2b. Webhook handler flow (PR events)

Updated flow for `pull_request` events:

```
PR opened/updated
  → verify signature (existing)
  → log delivery (existing)
  → match trigger rules, run flows (existing)
  → set commit status: "pending" (NEW)
  → fetch diff via GitProvider (existing)
  → run DiffAnalyzer on changed files (existing)
  → run relevant AI agents: impact, coverage (NEW)
  → post analysis as PR comment (NEW)
  → set commit status: "success/failure" (NEW)
  → if self-healing suggestions generated:
      → comment-only mode: post suggestions as PR comment with code blocks (NEW)
      → auto-PR mode: create fix branch + PR (NEW — see Section 3)
```

### 2c. PR comment format

```markdown
## TestMesh Analysis

**Impact**: 3 services affected (order-service, notification-service, user-service)
**Coverage**: 2 flows cover changed paths, 1 gap detected

### Suggestions
| # | Type | Confidence | Description |
|---|------|-----------|-------------|
| 1 | fix | 92% | Update order flow assertions for new response field |

> 💡 1 suggestion can be auto-applied. Reply `/testmesh apply 1` or configure auto-apply in workspace settings.
```

### 2d. Workspace-level PR configuration

Embedded in `models.IntegrationConfig` (the GORM model struct in `storage/models/integration.go`):

```go
type IntegrationConfig struct {
    // ... existing fields (Model, Endpoint, Temperature, etc.) ...

    // PR write-back (new)
    PR PRIntegrationConfig `json:"pr,omitempty"`
}

type PRIntegrationConfig struct {
    CommentOnPR     bool    `json:"comment_on_pr"`      // default: true
    SetStatusChecks bool    `json:"set_status_checks"`   // default: true
    AutoPREnabled   bool    `json:"auto_pr_enabled"`     // default: false
    AutoPRThreshold float64 `json:"auto_pr_threshold"`   // min confidence for auto-PR (e.g., 0.9)
}
```

**Relationship to `RepositoryLink.AutoApplyThreshold`**: The existing `AutoApplyThreshold` on `RepositoryLink` controls **in-database flow updates** (the existing `ApplySuggestion` path — modifies the flow YAML stored in TestMesh). The new `PRIntegrationConfig.AutoPRThreshold` controls **git-based PR creation** (the new `CreateFixPR` path — writes changes back to the repository). These are complementary: one keeps TestMesh flows in sync, the other keeps the source repo in sync.

---

## 3. Auto-PR Creation from Self-Healing

When `AutoPREnabled` is true and a suggestion's confidence exceeds `AutoPRThreshold`:

1. Create branch: `testmesh/fix/{suggestion-id-short}` from the PR's head SHA
2. Apply `SuggestedYAML` changes via `PushFileChanges`
3. Create PR targeting the original PR's branch with:
   - Title: `fix: {suggestion.Title}`
   - Body: suggestion reasoning, confidence score, link to original PR
4. Post a comment on the original PR linking to the fix PR

The `SelfHealingEngine` already has `ApplySuggestion` which modifies the flow YAML in the database. The new path is similar but writes to git instead:

```go
func (e *SelfHealingEngine) CreateFixPR(
    ctx context.Context,
    suggestion *models.Suggestion,
    gitProvider git.GitProvider,
    repo string,
    baseBranch string,
) (*git.PullRequest, error)
```

---

## 4. LLM Provider Workspace + Agent-Level Routing

### 4a. New model: `WorkspaceAIConfig`

```go
type WorkspaceAIConfig struct {
    ID              uuid.UUID                `json:"id"`
    WorkspaceID     uuid.UUID                `json:"workspace_id"`
    DefaultProvider *uuid.UUID               `json:"default_provider,omitempty"` // FK to SystemIntegration
    AgentOverrides  []AgentProviderOverride   `json:"agent_overrides" gorm:"type:jsonb"`
    CreatedAt       time.Time                `json:"created_at"`
    UpdatedAt       time.Time                `json:"updated_at"`
}

type AgentProviderOverride struct {
    AgentName     string    `json:"agent_name"`     // "diagnosis", "coverage", etc.
    IntegrationID uuid.UUID `json:"integration_id"` // FK to SystemIntegration
}
```

Single row per workspace. `AgentOverrides` stored as JSONB column.

### 4b. Provider resolution chain

```
agent-specific override for this workspace
  → workspace default provider
    → global default provider
      → env var fallback
```

### 4c. New `ProviderManager` method

```go
func (pm *ProviderManager) GetProviderForAgent(
    ctx context.Context,
    workspaceID uuid.UUID,
    agentName string,
) (Provider, error)
```

Queries `WorkspaceAIConfig`, checks for agent override, falls back through the chain. Results cached per-workspace with 30s TTL.

### 4d. `AgentContext` changes

```go
type AgentContext struct {
    // ... existing fields ...
    Providers *ProviderManager // agents can request their resolved provider
}
```

Agents that need LLM access call this within their `Run` method (where `a` is the agent receiver):
```go
func (a *DiagnosisAgent) Run(ctx context.Context, ac *AgentContext, params map[string]any) (*AgentResult, error) {
    provider, err := ac.Providers.GetProviderForAgent(ctx, ac.WorkspaceID, a.Name())
    // ...
}
```

### 4e. Dashboard UI

Under workspace settings, an "AI Providers" section:

- Dropdown for workspace default provider (from configured integrations of type `ai_provider`)
- Table of agent overrides: agent name → provider dropdown
- Test button calls provider with a simple prompt to verify connectivity

---

## 5. Embedding Infrastructure

### 5a. Embedding provider

```go
// api/internal/ai/embedding.go
type EmbeddingProvider interface {
    Embed(ctx context.Context, texts []string) ([][]float32, error)
    Dimensions() int
    ModelName() string
}

type OpenAIEmbeddingProvider struct {
    apiKey string
    model  string // "text-embedding-3-small" (1536 dimensions)
}
```

Uses the workspace's OpenAI integration key. If no OpenAI integration is configured, embedding features are unavailable (graceful degradation — agents work without embeddings, just without semantic search).

### 5b. Vector store interface + pgvector

```go
// api/internal/ai/vectorstore.go
type VectorStore interface {
    Upsert(ctx context.Context, items []VectorItem) error
    Search(ctx context.Context, query []float32, opts SearchOpts) ([]SearchResult, error)
    Delete(ctx context.Context, ids []string) error
}

type VectorItem struct {
    ID        string            // "{type}:{uuid}" e.g. "node:abc-123"
    Embedding []float32
    Metadata  map[string]string // type, workspace_id, name, etc.
}

type SearchOpts struct {
    TopK        int
    MinScore    float64
    WorkspaceID *uuid.UUID
    TypeFilter  string // "node", "flow", "code"
}

type SearchResult struct {
    ID       string
    Score    float64
    Metadata map[string]string
}
```

pgvector schema:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE embeddings (
    id           TEXT PRIMARY KEY,
    workspace_id UUID NOT NULL,
    item_type    TEXT NOT NULL,          -- "node", "flow", "code"
    embedding    vector(1536) NOT NULL,
    metadata     JSONB DEFAULT '{}',
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON embeddings (workspace_id, item_type);
```

### 5c. Embedding pipeline

```go
type EmbeddingPipeline struct {
    embedder EmbeddingProvider
    store    VectorStore
    logger   *zap.Logger
}

func (p *EmbeddingPipeline) IndexNodes(ctx context.Context, workspaceID uuid.UUID, nodes []graph.Node) error
func (p *EmbeddingPipeline) IndexFlows(ctx context.Context, workspaceID uuid.UUID, flows []models.Flow) error
func (p *EmbeddingPipeline) IndexCodeChanges(ctx context.Context, workspaceID uuid.UUID, files []CodeSnippet) error
```

Embedding requests are dispatched to a worker pool (buffered channel with 10 concurrent workers). If the queue is full, items are dropped with a warning log — they'll be re-indexed on next update. This prevents unbounded goroutine growth during large imports.

Triggers (all async — failures logged, never block primary operation):

| Source | Trigger | What gets embedded |
|--------|---------|-------------------|
| Graph nodes | Node created/updated via merge engine | Node name + type + metadata as text |
| Test flows | Flow saved/updated | Flow name + description + step summaries |
| Code files | Push webhook (after diff analysis) | Changed file paths + content snippets |

---

## 6. Embedding Consumers

### 6a. Semantic search

```go
type SemanticSearch struct {
    embedder EmbeddingProvider
    store    VectorStore
}

func (s *SemanticSearch) FindSimilarCode(ctx context.Context, workspaceID uuid.UUID, query string, topK int) ([]SearchResult, error)
func (s *SemanticSearch) FindSimilarNodes(ctx context.Context, workspaceID uuid.UUID, query string, topK int) ([]SearchResult, error)
func (s *SemanticSearch) FindSimilarFlows(ctx context.Context, workspaceID uuid.UUID, query string, topK int) ([]SearchResult, error)
```

Each method embeds the query string, then calls `store.Search` with the appropriate `TypeFilter`.

### 6b. Agent integration

```go
type AgentContext struct {
    // ... existing fields ...
    Providers      *ProviderManager
    SemanticSearch *SemanticSearch // nil if embeddings not configured
}
```

Agents check for nil before using (graceful degradation):

- **Coverage agent**: `FindSimilarFlows` to detect duplicate/overlapping test coverage
- **Impact agent**: `FindSimilarNodes` to find structurally similar services beyond direct graph edges
- **Diagnosis agent**: `FindSimilarCode` to find past fixes for similar error patterns
- **DiffAnalyzer**: `FindSimilarFlows` to broaden search for affected flows beyond tag matching

### 6c. No new API endpoints

Consumers are internal to agents. No public search API at this stage — trivial to add later if needed.

---

## Files to Create or Modify

### New files

| File | Purpose |
|------|---------|
| `api/internal/ai/embedding.go` | `EmbeddingProvider` interface + OpenAI implementation |
| `api/internal/ai/vectorstore.go` | `VectorStore` interface + pgvector implementation |
| `api/internal/ai/search.go` | `SemanticSearch` consumer |
| `api/internal/ai/embedding_pipeline.go` | `EmbeddingPipeline` async indexing |
| `api/internal/storage/models/workspace_ai_config.go` | `WorkspaceAIConfig` model |
| `dashboard/app/settings/integrations/page.tsx` | Integration management UI |
| `dashboard/app/settings/ai-providers/page.tsx` | AI provider routing UI |

### Modified files

| File | Change |
|------|--------|
| `api/internal/git/provider.go` | Add write methods to `GitProvider` interface |
| `api/internal/git/github.go` | Implement write methods (comment, status, PR, branch, push) |
| `api/internal/git/gitea.go` | Stub write methods with `ErrNotSupported` |
| `api/internal/git/gitlab.go` | Stub write methods with `ErrNotSupported` |
| `api/internal/ai/context.go` | Add `Providers` and `SemanticSearch` to `AgentContext` |
| `api/internal/ai/provider.go` | Add `GetProviderForAgent` to `ProviderManager` |
| `api/internal/ai/self_healing.go` | Add `CreateFixPR` method |
| `api/internal/api/handlers/webhooks.go` | Add PR write-back flow (status, comment, auto-PR) |
| `api/internal/api/routes.go` | Wire new services, pass to handlers |
| `api/internal/storage/models/integration.go` | Add `WorkspaceID` to `SystemIntegration`, add `PRIntegrationConfig` |
| `api/internal/graph/merge.go` | Hook embedding pipeline after node merge |
| `api/internal/shared/database/migrations.go` | pgvector extension, embeddings table, workspace_ai_config table |

---

## What This Design Does NOT Cover

- **GitLab/Gitea write-back**: Stubs only — full implementation deferred
- **Public semantic search API**: Internal to agents only for now
- **Embedding model selection**: OpenAI `text-embedding-3-small` only
- **PR review commands** (e.g., `/testmesh apply 1` in PR comments): Mentioned in comment format but implementation deferred — requires webhook parsing of issue comments
- **Rate limiting for GitHub API**: Rely on GitHub's rate limit headers + basic retry for now
