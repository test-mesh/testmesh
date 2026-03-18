# AI Agents & LLM Integration

TestMesh has a layered AI system: a **multi-provider LLM backend**, a **self-healing engine**, a **diff analyzer**, and an **MCP server** that exposes the platform to external AI clients like Claude Code.

---

## Architecture Overview

```
External AI Clients (Claude, GPT, etc.)
        |
   MCP Server (CLI)          ← stdio transport, 10 tools
        |
   Service Analyzer          ← static analysis of Go/JS/Python services
        |
   Flow Runner               ← executes steps, captures results

Internal AI System (API)
        |
   ProviderManager           ← Anthropic, OpenAI, Local (Ollama/vLLM)
        |
   ┌────────────┬────────────────┬──────────────┐
   Generator   Analyzer    SelfHealingEngine  DiffAnalyzer
   (prompts)  (coverage)   (failure repair)  (code change impact)
        |
   GenerationHistory / Suggestion / CoverageAnalysis (DB)
```

---

## 1. LLM Providers

**Location:** `api/internal/ai/provider.go`

Three providers are supported, all implementing a common interface:

```go
type Provider interface {
    Name() string
    Generate(ctx, request) (string, error)
    IsConfigured() bool
}
```

| Provider | Model default | Notes |
|----------|--------------|-------|
| Anthropic | `claude-sonnet-4-20250514` | `x-api-key` + `anthropic-version: 2023-06-01` |
| OpenAI | `gpt-4o` | Standard chat completions |
| Local | `llama3.1` | OpenAI-compatible API (Ollama, vLLM). 300s timeout |

**ProviderManager** loads providers dynamically from the database (`system_integrations` table) and supports hot reload via `ReloadFromDatabase()`. This means you can add or swap providers through the UI without restarting the API.

**API endpoints for managing providers:**
- `GET /api/v1/admin/integrations` — list configured providers
- `POST /api/v1/admin/integrations` — add provider
- `PATCH /api/v1/admin/integrations/{id}` — update config/secrets
- `POST /api/v1/admin/integrations/{id}/test` — validate connectivity
- `POST /api/v1/admin/integrations/reload` — reload providers from DB

---

## 2. Agent Roles

### 2a. Generator Agent

**Location:** `api/internal/ai/generator.go`

Converts natural language or API specs into TestMesh flow YAML.

**Inputs:**
- Natural language prompt
- Optional: OpenAPI spec, Postman collection

**Flow:**
```
prompt → LLM → extract YAML block → validate structure → store in DB → return flow
```

**Tracked in DB:** `generation_history` table with status (`pending → processing → completed/failed`), token usage, latency, and source type.

**API endpoints:**
- `POST /api/v1/ai/generate` — generate from prompt
- `POST /api/v1/ai/import/openapi` — import OpenAPI spec
- `POST /api/v1/ai/import/postman` — import Postman collection

**CLI:**
```bash
testmesh generate "test user registration and login"
testmesh generate "test checkout" --from-api openapi.yaml -o checkout.yaml
testmesh chat                          # interactive mode
testmesh chat --context openapi.yaml   # with context
```

Chat commands: `/run`, `/save <file>`, `/clear`, `/help`, `/quit`

---

### 2b. Analyzer Agent

**Location:** `api/internal/ai/analyzer.go`

Compares existing flows against an OpenAPI spec to compute coverage.

**Output:**
- Coverage percentage per endpoint
- `covered` / `uncovered` / `partial` endpoint lists

**Stored in:** `coverage_analysis` table, linked to `import_history`.

---

### 2c. Self-Healing Engine

**Location:** `api/internal/ai/self_healing.go`

Analyzes failed executions and generates fix suggestions.

**Input data fed to LLM:**
- Failed step config
- Actual vs expected assertion results
- HTTP response / DB result / error message

**Suggestion types:**

| Type | Purpose |
|------|---------|
| `fix` | Critical structural fix |
| `optimization` | Performance improvement |
| `retry_strategy` | Add/tune retries |
| `assertion` | Fix assertion logic |
| `timeout` | Adjust timeouts |
| `code_sync` | Sync test with code change |

Each suggestion includes:
- Confidence score (0.0–1.0)
- Reasoning text
- Diff patch (ready to apply)
- Status: `pending → accepted/rejected/applied`

**Stored in:** `suggestions` table.

---

### 2d. Diff Analyzer (Impact Agent)

**Location:** `api/internal/ai/diff_analyzer.go`

Maps code changes to affected flows — the "PR impact analysis" agent.

**Flow:**
```
git diff → parse changed files → identify services → find matching flows → generate code_sync suggestions
```

This enables running only the flows affected by a PR rather than the full suite.

---

## 3. MCP Server

**Location:** `cli/internal/mcpserver/`

The CLI can run as an MCP server, exposing TestMesh capabilities to any MCP-compatible AI client (Claude Code, custom agents, etc.).

```bash
testmesh mcp    # starts MCP server over stdio
```

**Configure in Claude Code** (`~/.claude/settings.json`):
```json
{
  "mcpServers": {
    "testmesh": {
      "command": "testmesh",
      "args": ["mcp"]
    }
  }
}
```

### Tools Exposed

| Tool | Purpose |
|------|---------|
| `analyze_service` | Static analysis of a single service — extracts endpoints, models, Kafka topics, Redis keys, env vars |
| `analyze_workspace` | Multi-service analysis — builds dependency graph, returns topologically sorted execution order |
| `read_flow` | Read a flow YAML from disk |
| `write_flow` | Write flow YAML to disk (validates before saving) |
| `validate_flow` | Validate YAML — checks structure, action types, variable dependencies, undefined references |
| `run_step` | Execute a single action step in isolation (good for debugging SQL, HTTP, Redis) |
| `run_flow` | Execute a complete flow, returns per-step results with durations and pass/fail status |
| `list_flows` | List flow files in a directory |
| `get_yaml_schema` | Full YAML schema reference with all action types and examples |
| `get_action_types` | JSON schema for each action type (required/optional fields) |

### Service Analyzer

**Location:** `cli/internal/mcpserver/analyzer.go`

Supports Go, JavaScript/TypeScript, and Python. Extracts:

**Go:**
- Gin routes (regex-based)
- GORM model fields and table names
- Kafka topics (string literals)
- Redis key patterns (`fmt.Sprintf` patterns)
- Inter-service HTTP calls (from `clients/` files)
- gRPC methods
- Environment variables (`os.Getenv`, `viper.GetString`)
- Port detection (prioritizes `main.go`)

**JavaScript/TypeScript:**
- Express routes
- Environment variables
- Port detection

**Python:**
- Flask and FastAPI routes
- Environment variables
- Port detection

**Workspace analysis** detects service dependencies via:
- HTTP: `*_SERVICE_URL` environment variables
- Kafka: producer → consumer topic relationships

Then topologically sorts services so flows can be generated in the right execution order.

---

## 4. MCP Client (flows calling external MCP servers)

**Location:** `api/internal/mcp/client.go`
**Action handler:** `api/internal/runner/actions/mcp.go`

Flows can invoke tools on external MCP servers as steps:

```yaml
- id: call_external_agent
  action: mcp_call
  config:
    server_url: "http://my-mcp-server:8080"
    tool: analyze_code
    arguments:
      path: "./src"
  assert:
    - not_error
    - contains: "functions"
```

The client implements the MCP JSON-RPC protocol: `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`, `prompts/get`. Connections are pooled by `server_url + api_key`.

---

## 5. Data Models

```
system_integrations     AI provider configs (type, provider, model, secrets)
generation_history      Per-generation record (prompt, tokens, latency, status)
suggestions             AI-generated fixes (type, confidence, diff, status)
import_history          OpenAPI/Postman import records
coverage_analysis       Endpoint coverage results per import
```

---

## 6. Dashboard AI UX Strategy

**Decision: no chat UI in the dashboard.**

A free-form chat interface is not the right AI surface for the dashboard for these reasons:

- The CLI already provides `testmesh chat` for conversational test creation
- The MCP server integration means developers interact with TestMesh through Claude Code, Cursor, or other tools they live in — adding a competing chat surface creates confusion, not value
- Chat UIs require significant engineering (streaming, context management, conversation history, tool calls) for uncertain ROI — most users ignore them
- Non-technical stakeholders (QA leads, PMs) benefit more from guided actions than open-ended prompts

**What to build instead: contextual AI actions**

Inline AI buttons tied to what the user is already looking at:

| Location | Action | Trigger |
|----------|--------|---------|
| Flow editor | "Generate test" | Empty or new flow |
| Flow editor | "Improve this step" | Step selected |
| Failed execution | "Explain this failure" | Step failed |
| Failed assertion | "Suggest fix" | Assertion failed |
| Flow list | "Generate from spec" | Import button |

These are one-click, have full context (the user is already looking at the relevant object), and surface the AI capability exactly when it's needed — without requiring the user to know how to prompt.

The dashboard AI should feel like a **smart assistant embedded in the workflow**, not a chatbot in a sidebar.

---

## 7. Roadmap Gaps (vs. "Autonomous QA" vision)

Current state vs. what's needed to reach full autonomy:

| Capability | Status | Notes |
|-----------|--------|-------|
| Multi-provider LLM | ✅ Done | Anthropic, OpenAI, Local |
| Flow generation from prompt | ✅ Done | |
| OpenAPI import | ✅ Done | |
| Self-healing suggestions | ✅ Done | Manual approval required |
| Code diff → impact analysis | ✅ Done | |
| MCP server (AI client integration) | ✅ Done | 10 tools |
| Static service analysis | ✅ Done | Go/JS/Python |
| Auto-apply self-healing patches | ⬜ Not done | Requires confidence threshold + approval flow |
| Orchestrator agent | ⬜ Not done | Coordinates repo→flow→repair pipeline |
| PR-triggered test selection | ⬜ Not done | DiffAnalyzer exists, CI hook missing |
| UI test generation (browser) | ⬜ Not done | Current focus is API/integration |
| Flakiness detection | ⬜ Not done | Execution history exists, analysis agent missing |
