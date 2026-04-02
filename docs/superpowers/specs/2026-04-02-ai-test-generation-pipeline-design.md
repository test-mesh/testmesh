# AI-Powered Test Generation Pipeline

**Date:** 2026-04-02
**Status:** Draft
**Scope:** Full vision — MCP foundation, pipeline engine, autonomous agent loop

## Problem

When an external user opens a project in Claude Code and asks for comprehensive e2e tests, the AI assistant suggests frameworks like Playwright. If the user chooses TestMesh, the AI must be able to write production-ready, validated, runnable flows — but today:

1. **Discovery → Generation is disconnected** — the discovery engine finds endpoints/services, but generation doesn't consume that analysis to systematically produce flows for everything found.
2. **Single-flow generation** — `generate` produces one flow per prompt, not a comprehensive suite covering happy paths, error cases, cross-service journeys, and edge cases.
3. **Validation is shallow** — flows validate structurally but don't verify they'll actually run against live services.
4. **No orchestration** — there's no workflow that chains discover → generate suite → validate → execute → repair without manual driving.
5. **No continuous coverage** — generated flows become stale as services change.

## Goal

A user types a prompt, TestMesh discovers the project, generates a comprehensive test suite organized by service and category, validates and executes flows in tiers, auto-repairs failures, reports coverage gaps, and iteratively fills them. The cloud/paid tier extends this into a continuous loop that monitors for changes and keeps coverage current.

## Architecture: Three Layers

```
┌──────────────────────────────────────────────────────────────────────┐
│ Layer 1: MCP Foundation (Free, Local)                                │
│  AI learns TestMesh via tools → discovers workspace → generates plan │
│  → iterates flows → validates → executes → reports                   │
├──────────────────────────────────────────────────────────────────────┤
│ Layer 2: Pipeline Engine (Local + API)                               │
│  testmesh pipeline → deterministic, CI-friendly                      │
│  Stages: Discover → Plan → Generate → Validate → Execute → Report   │
│  Repair loop with auto-fix (max 3 iterations)                        │
├──────────────────────────────────────────────────────────────────────┤
│ Layer 3: Autonomous Agent Loop (Cloud, Paid)                         │
│  Self-hosted agent + Watcher mode                                    │
│  Triggers: Git polling, webhooks, scheduled scan                     │
│  Loop: Detect → Analyze → Act → Report                              │
│  PR comments, commit status, coverage alerts                         │
└──────────────────────────────────────────────────────────────────────┘
```

The **test plan** is the connective tissue across all layers — created in Layer 1, executed in Layer 2, maintained in Layer 3.

---

## Layer 1: Intelligent MCP Foundation

### Purpose

Make TestMesh a first-class testing framework that AI assistants understand deeply — not through training data (TestMesh isn't as popular as Playwright), but through MCP tools that teach patterns, serve schema, and provide contextual examples at runtime.

### New MCP Tools

#### `get_testing_guide`

Returns a structured best-practices guide covering:
- How to organize flows (by service, then category)
- What to assert at each layer (API response → Kafka events → DB state)
- Setup/teardown patterns for idempotency
- Async verification patterns (delay, polling, event consumption)
- Variable extraction and chaining between steps
- Edge case patterns (concurrency, idempotency, failure recovery, timeouts)

This is the "teach the AI to think like a test engineer" tool. Serves the latest guide dynamically so it stays current with TestMesh's capabilities.

#### `generate_test_plan`

**Input:** Workspace analysis (from `analyze_workspace`) + user prompt + optional existing flows directory.

**Output:** A structured test plan manifest:

```yaml
name: "demo-services-suite"
generated: "2026-04-02T10:00:00Z"
workspace_analysis: ".testmesh/workspace-analysis.json"

services:
  - name: user-service
    endpoints_discovered: 4
    flows:
      - id: user-create-happy
        category: happy-path
        priority: critical
        action: "POST /api/users → verify 201 + DB row + Kafka event"
        status: pending
        file: "flows/user-service/happy-paths/user-create-happy.yaml"
      - id: user-create-validation
        category: error-handling
        priority: high
        action: "POST /api/users with missing fields → verify 400 + no DB row"
        status: pending
        file: "flows/user-service/error-cases/user-create-validation.yaml"

  - name: e2e
    flows:
      - id: e2e-order-flow
        category: cross-service
        priority: critical
        depends_on: [user-create-happy, product-create-happy]
        action: "Full order lifecycle: user → product → order → events → notifications"
        status: pending
        file: "flows/e2e/order-flow/e2e-order-flow.yaml"

summary:
  total_flows: 47
  by_category:
    happy-path: 12
    error-handling: 15
    cross-service: 8
    edge-cases: 12
  by_priority:
    critical: 10
    high: 20
    medium: 17
```

**Behavior:**
- Scans existing `flows/` directory and marks already-covered endpoints as `existing` (avoids duplication).
- Orders flows by dependency (service-level before cross-service).
- Assigns priority: critical for main CRUD endpoints and core journeys, high for error handling, medium for edge cases.

#### `generate_flow`

**Input:** Single plan entry + workspace analysis + list of already-generated sibling flows + testing guide context.

**Output:** A validated YAML flow written to disk at the path specified in the plan.

**Behavior:**
- Generates with full context of what's already been generated — avoids duplicate setup, shares variable naming conventions.
- Includes setup/teardown for idempotency.
- Asserts at appropriate layers (API response, events, DB state) based on what's available in the discovered infrastructure.
- Runs `validate_flow` internally before returning.

#### `run_suite`

**Input:** Directory path or plan file path + execution tier (1-4).

**Output:** Structured results per flow:

```yaml
results:
  - flow: "user-create-happy.yaml"
    status: passed
    duration: "1.2s"
    steps: 5/5 passed
  - flow: "e2e-order-flow.yaml"
    status: failed
    duration: "4.8s"
    steps: 12/14 passed
    failure:
      step: "verify-notification-db"
      error: "assertion failed: row_count == 1, got 0"
      category: timing  # timing | assertion | connectivity | variable | unknown
      fixable: true
      hint: "Notification processing is async — increase delay from 3s to 5s or use db_poll"
```

**Execution Tiers:**
1. Dry validation — structural + variable resolution (seconds)
2. Connectivity check — can reach services, DB, Kafka (seconds)
3. Setup-only — run setup steps, verify infrastructure (30s)
4. Full execution — run all flows (minutes)

### Enhanced Existing Tools

#### `analyze_workspace` (enhanced)

Current: Returns service analysis with endpoints, DB tables, Kafka topics, etc.

Added: A **test coverage assessment** section:

```yaml
coverage_assessment:
  testable_endpoints: 20
  testable_events: 5
  testable_db_operations: 12
  recommended_categories:
    happy-path:
      description: "Success paths for all CRUD endpoints"
      estimated_flows: 12
    error-handling:
      description: "Validation errors, 404s, auth failures"
      estimated_flows: 15
    cross-service:
      description: "End-to-end journeys spanning multiple services"
      estimated_flows: 8
    edge-cases:
      description: "Concurrency, idempotency, timeouts, failure recovery"
      estimated_flows: 12
  total_estimated_flows: 47
```

#### `validate_flow` (enhanced)

Current: Returns pass/fail with error list.

Added: **Repair hints** for each error:

```yaml
errors:
  - field: "steps[3].config.url"
    error: "references {{order_id}} but no prior step captures it"
    hint: "Step 2 returns order data — add output block: order_id: $.body.id"
  - field: "steps[5].assertions[0]"
    error: "row_count is not available for http_request actions"
    hint: "Use len(body.items) for HTTP responses, row_count is for database_query"
```

### User Experience (Layer 1)

```
User: "Write comprehensive e2e tests for this project using TestMesh"

Claude Code:
  1. get_testing_guide → learns TestMesh patterns and best practices
  2. analyze_workspace → discovers 5 services, 20 endpoints, Kafka, PostgreSQL, Redis
  3. generate_test_plan → produces plan with 47 flows across 4 categories
  4. Presents plan to user:
     "Found 5 services with 20 endpoints. Here's a test plan with 47 flows:
      12 happy paths, 15 error cases, 8 cross-service journeys, 12 edge cases.
      Want me to proceed?"
  5. User approves
  6. Iterates: generate_flow per plan entry → validates → writes to disk
  7. run_suite --tier 4 → executes all flows
  8. Analyzes failures, auto-repairs (adjusts timing, fixes JSONPath, etc.)
  9. Reports: "42/47 passing. 3 auto-repaired. 2 need manual review.
     Coverage gaps detected — want me to generate those too?"
```

---

## Layer 2: Pipeline Engine

### Purpose

Make the test generation pipeline **deterministic, reproducible, and CI-friendly** — no AI in the loop needed after the plan is created.

### CLI Interface

```bash
# Full pipeline (AI-assisted plan generation)
testmesh pipeline --prompt "comprehensive tests for this project"

# From existing plan (CI-friendly, no AI needed)
testmesh pipeline --plan .testmesh/test-plan.yaml

# Individual stages
testmesh pipeline discover
testmesh pipeline plan --prompt "focus on error handling"
testmesh pipeline generate --plan .testmesh/test-plan.yaml
testmesh pipeline execute --tier 4
testmesh pipeline report

# Options
testmesh pipeline --api-url http://localhost:5016  # API-connected mode
testmesh pipeline --repair-attempts 3              # Max auto-fix iterations
testmesh pipeline --output-dir flows/              # Generated flow output
testmesh pipeline --exclude-category edge-cases    # Skip categories
```

### Pipeline Stages

#### Stage 1: Discover

- Calls `analyze_workspace` + `DiscoverFromDockerCompose()`
- When API-connected: also pulls graph data via `CoverageAgent` (`GetUncoveredNodes`, `GetGraphStats`, `GetSystemFlows`)
- Output: `.testmesh/workspace-analysis.json`

#### Stage 2: Plan

- **Local mode:** AI generates plan from workspace analysis + user prompt
- **API mode:** Additionally uses `CoverageAgent` + `GenerationAgent` to identify gaps and prioritize
- Respects existing flows — scans output directory, marks already-covered endpoints as `existing`
- Output: `.testmesh/test-plan.yaml`

#### Stage 3: Generate

- Iterates plan entries in dependency order (e.g., `user-create-happy` before `e2e-order-flow` that depends on it)
- Each flow generated with context: workspace analysis + already-generated sibling flows + testing guide
- Writes to organized directory structure: `flows/{service}/{category}/{flow-name}.yaml`
- Updates plan status: `pending` → `generated`

#### Stage 4: Validate

- Structural validation (existing `validate_flow` logic)
- Cross-flow validation: shared variables, setup/teardown consistency, no duplicate step IDs across suite
- Updates plan status: `generated` → `validated` or `invalid`

#### Stage 5: Execute (Tiered)

| Tier | What | Speed |
|------|------|-------|
| 1 | Dry validation — structural + variable resolution | Seconds |
| 2 | Connectivity — can reach services, DB, Kafka | Seconds |
| 3 | Setup-only — run setup steps, verify infrastructure works | ~30s |
| 4 | Full execution — run all flows | Minutes |

User selects tier. CI pipelines might run Tier 1-2 on every PR, Tier 4 nightly.

#### Stage 6: Repair Loop

- Collects failures from execution
- Categorizes: `fixable` vs `needs-review`
  - **Fixable:** wrong assertion value, bad JSONPath, timing issue, variable extraction mismatch
  - **Needs review:** service bug, missing endpoint, unexpected schema change
- Auto-fixes:
  - Assertion mismatches → updates expected values if actual response structure is valid
  - Timing failures → increases delay, switches to `db_poll` or retry pattern
  - Variable extraction → adjusts JSONPath based on actual response shape
- Re-validates and re-executes repaired flows
- Max 3 repair iterations per flow, then flags for manual review
- Reuses existing `DiagnosisAgent` for failure analysis and `RepairAgent` for fix suggestions

#### Stage 7: Report

Output: `.testmesh/pipeline-report.yaml`

```yaml
run_id: "2026-04-02-001"
duration: "3m42s"
plan: ".testmesh/test-plan.yaml"

results:
  total: 47
  passed: 42
  failed: 2
  repaired: 3
  skipped: 0
  needs_review: 2

coverage:
  endpoints_tested: 18/20
  services_tested: 5/5
  categories:
    happy-path: 12/12
    error-handling: 13/15
    cross-service: 8/8
    edge-cases: 9/12

gaps:
  - endpoint: "DELETE /api/users/:id"
    reason: "Endpoint not found in discovery — may not be implemented yet"
  - category: "concurrency"
    reason: "Requires parallel step execution support"

suggested_next:
  - "Generate flows for DELETE /api/users/:id"
  - "Add concurrent order placement test when parallel step support is available"
```

### Local vs API-Connected Behavior

| Capability | Local (CLI only) | API-Connected |
|---|---|---|
| Discovery | Docker Compose + HTTP probes + source analysis | + Graph engine coverage data |
| Plan generation | AI from workspace analysis | + CoverageAgent gaps + GenerationAgent priorities |
| Generation | AI with testing guide context | + Semantic search for similar patterns |
| Validation | Structural + cross-flow | Same |
| Execution | Local executor with all action handlers | + Execution history tracking |
| Repair | AI-based diagnosis | + DiagnosisAgent + RepairAgent with graph context |
| Report | File-based report | + Dashboard visualization + coverage tracking over time |

---

## Layer 3: Autonomous Agent Loop (Cloud/Paid)

### Purpose

Extend the existing self-hosted agent from a flow executor into a continuous testing intelligence that monitors for changes, detects coverage regressions, and keeps test suites current — all running inside the customer's infrastructure.

### Architecture

The self-hosted agent (`/agent/`) gains a **Watcher** mode alongside the existing **Executor** mode:

```
┌─────────────────────────────────────────────────────────┐
│  Self-Hosted Agent (customer infrastructure)             │
│                                                          │
│  ┌──────────────┐    ┌──────────────────────────────┐   │
│  │  Executor     │    │  Watcher (new)                │   │
│  │  (existing)   │    │                               │   │
│  │  - Flow jobs  │    │  - Git polling / webhooks     │   │
│  │  - Streaming  │    │  - Change detection           │   │
│  │    results    │    │  - Local pipeline execution    │   │
│  │               │    │  - Coverage monitoring         │   │
│  └──────┬────────┘    └──────────┬────────────────────┘   │
│         └────────────┬───────────┘                        │
│                      │ WebSocket                          │
└──────────────────────┼────────────────────────────────────┘
                       │
               ┌───────▼────────┐
               │  Cloud API      │
               │  - Orchestrator │
               │  - Git provider │
               │  - Graph engine │
               │  - Agents       │
               └─────────────────┘
```

### Change Detection (3 Triggers)

#### 1. Git Polling

- Agent periodically requests diff from cloud API
- Cloud uses `GitProvider.FetchDiff()` (GitHub/GitLab/Gitea — all three supported)
- Compares `HEAD` of tracked branches against last known SHA
- Extracts changed files → maps to graph nodes via `GraphNode.SourceFile`

#### 2. Webhook-Driven

- Cloud receives PR/push webhooks from git providers (existing webhook handlers)
- Triggers `OrchestratorAgent` with `pr.opened` or `code.pushed` event
- Cloud dispatches analysis job to agent via WebSocket

#### 3. Scheduled Scan

- Configurable cron (e.g., every 6 hours)
- Full workspace re-discovery + diff against last graph snapshot via `HistoryScanner`
- Catches infrastructure drift: new env vars, changed docker-compose, new .proto files

### The Watcher Loop

```
Detect Changes
    │
    ▼
ChangeAnalysisAgent (new)
    Maps git diff → affected graph nodes
    │
    ▼
Cloud Orchestrator
    Routes to: ImpactAgent + CoverageAgent
    │
    ▼
PlanUpdateAgent (new)
    Produces plan delta: re-run, repair, generate new
    │
    ▼
Agent executes pipeline (Layer 2)
    Re-runs affected flows
    Auto-repairs broken flows
    Generates new flows for gaps
    │
    ▼
Report
    PR comment (GitProvider.CreatePRComment)
    Commit status (GitProvider.CreateCommitStatus)
    Coverage update to dashboard
    Alerts if thresholds breached
```

### Example: Change Detected

```
Change: user-service/handlers.go modified
        New endpoint POST /api/users/bulk added

Cloud orchestrator:
  1. ChangeAnalysisAgent → maps handlers.go to graph nodes
     [user-service, POST /api/users, GET /api/users/:id, POST /api/users/bulk (new)]

  2. ImpactAgent → affected flows:
     [user-create-happy (1.0), user-validation (1.0), e2e-order-flow (0.7)]

  3. CoverageAgent → coverage dropped 90% → 85%
     Gap: POST /api/users/bulk has no flows

  4. PlanUpdateAgent → plan delta:
     Re-run: [user-create-happy, user-validation, e2e-order-flow]
     Generate: [users-bulk-happy, users-bulk-validation, users-bulk-edge-cases]

Agent (watcher):
  5. Re-runs 3 affected flows → 2 pass, 1 fails (assertion changed)
  6. DiagnosisAgent → response shape changed in user creation
  7. Auto-repairs → re-runs → passes
  8. Generates 3 new flows → validates → runs → all pass

Cloud:
  9. Updates graph: new tested_by edges for POST /api/users/bulk
  10. Coverage restored: 85% → 92%
  11. PR comment:
      "TestMesh: 3 existing flows verified (1 auto-repaired).
       3 new flows generated for POST /api/users/bulk.
       Coverage: 92% (+2%)"
  12. Commit status: ✅
```

### New Agents

#### `ChangeAnalysisAgent`

**Purpose:** Bridges git diff → graph nodes.

**Input:** `changed_files` (list of file paths from git diff)

**Process:**
1. For each changed file, queries `GraphNode` by `SourceFile` field
2. If no direct match, infers from path conventions (e.g., `handlers.go` in `user-service/` → user-service nodes)
3. Detects change type: new endpoint, modified handler, changed schema, infra change, deleted endpoint
4. Groups by impact category

**Output:** List of affected graph node IDs + change type annotations.

#### `PlanUpdateAgent`

**Purpose:** Given an existing test plan + change analysis, produces a plan delta — not a full regeneration.

**Input:** Current test plan + change analysis result + impact analysis result

**Process:**
1. Marks affected flows for re-execution
2. Marks flows with assertion mismatches for repair
3. Creates new plan entries for uncovered endpoints/events
4. Removes plan entries for deleted endpoints

**Output:** Plan delta (flows to re-run, repair, generate, remove).

### New WebSocket Message Types

| Message | Direction | Purpose |
|---|---|---|
| `watch_config` | Cloud → Agent | Configure: repos, branches, cron interval, coverage thresholds |
| `change_detected` | Agent → Cloud | Report detected changes for analysis |
| `analysis_result` | Cloud → Agent | Impact analysis + recommended plan delta |
| `pipeline_job` | Cloud → Agent | Full or partial pipeline execution job |
| `pipeline_progress` | Agent → Cloud | Incremental progress (per-stage, per-flow) |
| `coverage_update` | Agent → Cloud | Updated coverage metrics |

### Dashboard Integration

- **Live coverage graph** — coverage % over time, per-service breakdown
- **Change timeline** — what changed, what was affected, what was auto-repaired
- **Alert rules** — coverage drops below threshold, flows start failing, new endpoints uncovered for >N days
- **PR view** — per-PR test results, auto-generated flows, coverage delta

---

## Reuse Map

| Existing Component | Location | Reused In |
|---|---|---|
| `analyze_workspace` | `cli/internal/mcpserver/tools.go` | L1 Discover (enhanced) |
| `validate_flow` | `cli/internal/mcpserver/tools.go` | L1+L2 Validate (enhanced) |
| `DiscoverFromDockerCompose()` | `cli/internal/mcpserver/tools.go` | L2 Discover stage |
| `runner.Executor` | `api/internal/runner/` | L1+L2+L3 Execute |
| `actions.RegisterDefaults()` | `api/internal/runner/actions/` | L1+L2+L3 all protocol handlers |
| `GenerateFromPrompt()` | `api/internal/ai/generator.go` | L1+L2 Generate (wrapped with plan context) |
| `CoverageAgent` | `api/internal/ai/coverage_agent.go` | L2 Plan, L3 Loop |
| `GenerationAgent` | `api/internal/ai/generation_agent.go` | L2 Plan prioritization |
| `DiagnosisAgent` | `api/internal/ai/diagnosis_agent.go` | L2+L3 Repair |
| `RepairAgent` | `api/internal/ai/repair_agent.go` | L2+L3 Repair |
| `ImpactAgent` | `api/internal/ai/impact_agent.go` | L3 Change analysis |
| `OrchestratorAgent` | `api/internal/ai/orchestrator_agent.go` | L3 Event routing |
| `graph.Engine` | `api/internal/graph/` | L2+L3 Coverage, impact, traversal |
| `graph.MergeEngine` | `api/internal/graph/merge.go` | L3 Graph updates |
| `GitProvider` | `api/internal/git/` | L3 FetchDiff, PRComment, CommitStatus |
| `agent/connection` | `agent/internal/connection/` | L3 WebSocket + new message types |
| `agent/worker` | `agent/internal/worker/` | L3 Job execution pool |
| `HistoryScanner` | `api/internal/ai/` | L3 Graph snapshot comparison |
| `SemanticSearch` | `api/internal/ai/` | L2+L3 Similar flow detection |

---

## File Organization: Generated Flows

```
flows/
├── user-service/
│   ├── happy-paths/
│   │   ├── user-create-happy.yaml
│   │   ├── user-get-by-id.yaml
│   │   └── user-list.yaml
│   ├── error-cases/
│   │   ├── user-create-missing-fields.yaml
│   │   ├── user-get-not-found.yaml
│   │   └── user-create-duplicate-email.yaml
│   └── edge-cases/
│       ├── user-create-idempotency.yaml
│       └── user-concurrent-updates.yaml
├── product-service/
│   ├── happy-paths/
│   ├── error-cases/
│   └── edge-cases/
├── order-service/
│   ├── happy-paths/
│   ├── error-cases/
│   └── edge-cases/
├── notification-service/
│   └── ...
├── recommendation-service/
│   └── ...
└── e2e/
    ├── order-flow/
    │   └── e2e-order-flow.yaml
    ├── failure-recovery/
    │   └── e2e-order-service-down.yaml
    └── async-verification/
        └── e2e-notification-delivery.yaml
```

---

## Implementation Phases

### Phase 1: MCP Foundation (Layer 1)

**Goal:** The core "prompt → production-ready flows" experience via Claude Code.

- Implement `get_testing_guide` MCP tool
- Implement `generate_test_plan` MCP tool
- Implement `generate_flow` MCP tool (wraps existing generation with plan context)
- Implement `run_suite` MCP tool
- Enhance `analyze_workspace` with coverage assessment
- Enhance `validate_flow` with repair hints
- Define test plan YAML schema
- Test against demo-services: one prompt should produce a working suite

### Phase 2: Pipeline Engine (Layer 2)

**Goal:** Deterministic, CI-friendly pipeline that works without AI in the loop.

- Implement `testmesh pipeline` CLI command with stage subcommands
- Implement Discover, Plan, Generate, Validate stages
- Implement tiered execution (4 tiers)
- Implement pipeline report generation
- Cross-flow validation logic
- Local vs API-connected mode branching

### Phase 3: Repair Loop (Layer 2)

**Goal:** Auto-fix common failures to maximize passing flows.

- Failure categorization engine (timing, assertion, connectivity, variable, unknown)
- Auto-repair strategies per category
- Integration with DiagnosisAgent and RepairAgent (API mode)
- Re-validate → re-execute → report loop (max 3 iterations)

### Phase 4: Watcher + Change Analysis (Layer 3)

**Goal:** Self-hosted agent detects changes and triggers pipeline.

- Implement Watcher goroutine in agent
- Implement `ChangeAnalysisAgent`
- New WebSocket message types for watcher communication
- Git polling integration via cloud API + existing GitProvider
- Webhook-driven trigger path
- Scheduled scan trigger

### Phase 5: Full Cloud Integration (Layer 3)

**Goal:** PR comments, coverage dashboard, plan auto-maintenance.

- Implement `PlanUpdateAgent`
- PR comment integration via `GitProvider.CreatePRComment()`
- Commit status integration via `GitProvider.CreateCommitStatus()`
- Dashboard: live coverage tracking, change timeline, alert rules
- Coverage threshold alerting
