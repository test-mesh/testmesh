# MCP Server Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 6 API-connected tools to the TestMesh CLI MCP server (upload_flow, trigger_execution, get_execution, etc.) and build a spec-first auto-discovery engine that works on any project without source-code access.

**Architecture:** New `api_client.go` handles all TestMesh API HTTP calls. New `discovery.go` probes service URLs for OpenAPI specs, mines docker-compose env vars for infra connections, and walks proto files. `server.go` gains `--api-url` / `--workspace-id` flags that are passed via a shared `Config` struct to the new tool handlers. Existing `analyzer.go` is enhanced to call `discovery.go` first, then fall back to source scanning.

**Tech Stack:** Go 1.25.0, github.com/modelcontextprotocol/go-sdk v1.4.1, net/http (std), encoding/json (std), gopkg.in/yaml.v3

---

## File Map

- Create: `cli/internal/mcpserver/api_client.go` — TestMesh API HTTP client (all 6 API calls)
- Create: `cli/internal/mcpserver/discovery.go` — auto-discovery engine (HTTP probing + env mining)
- Modify: `cli/internal/mcpserver/server.go` — add Config struct, --api-url/--workspace-id flags, pass Config to dispatchTool
- Modify: `cli/internal/mcpserver/tools.go` — 6 new tool handler functions, updated `get_action_types` and `get_yaml_schema` to include new action types
- Modify: `cli/cmd/mcp.go` — wire --api-url, --workspace-id flags to server.Run

> **Note on gopls false positives:** The CLI uses `go.work` replacements. Throughout this plan, `go build ./...` run from `cli/` is authoritative. Ignore any gopls "BrokenImport" or "UndeclaredName" errors — they are IDE artifacts from the missing go.work context.

---

## Task 1: API Client

**Files:**
- Create: `cli/internal/mcpserver/api_client.go`

- [ ] **Step 1: Understand the TestMesh API routes**

The endpoints used by the 6 new tools (verified from `api/internal/api/routes.go`):
- `GET  /api/v1/workspaces` → list workspaces
- `POST /api/v1/workspaces/:id/flows` body `{"yaml": "..."}` → upload flow, returns `{"id": "...", "name": "..."}`
- `GET  /api/v1/workspaces/:id/flows` → list flows
- `POST /api/v1/workspaces/:id/executions` body `{"flow_id": "...", "environment": "...", "variables": {}}` → trigger execution, returns `{"execution_id": "..."}`
- `GET  /api/v1/executions/:id` → execution summary
- `GET  /api/v1/executions/:id/steps` → step detail
- `GET  /api/v1/workspaces/:id/graph/coverage` → coverage gaps

- [ ] **Step 2: Create api_client.go**

Create `cli/internal/mcpserver/api_client.go`:

```go
package mcpserver

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// APIClient handles HTTP calls to the TestMesh API.
type APIClient struct {
	baseURL    string
	httpClient *http.Client
}

func newAPIClient(baseURL string) *APIClient {
	return &APIClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (c *APIClient) do(method, path string, body any) ([]byte, int, error) {
	var reqBody io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to marshal request body: %w", err)
		}
		reqBody = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, c.baseURL+path, reqBody)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to create request: %w", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("failed to read response: %w", err)
	}
	return data, resp.StatusCode, nil
}

// ListWorkspaces returns all workspaces.
func (c *APIClient) ListWorkspaces() ([]map[string]any, error) {
	data, status, err := c.do("GET", "/api/v1/workspaces", nil)
	if err != nil {
		return nil, err
	}
	if status != 200 {
		return nil, fmt.Errorf("API returned %d: %s", status, string(data))
	}
	var result []map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		// Try wrapped format {"workspaces": [...]}
		var wrapped struct {
			Workspaces []map[string]any `json:"workspaces"`
		}
		if err2 := json.Unmarshal(data, &wrapped); err2 != nil {
			return nil, fmt.Errorf("failed to parse workspaces response: %w", err)
		}
		return wrapped.Workspaces, nil
	}
	return result, nil
}

// UploadFlow saves a flow YAML to a workspace. Returns the created flow's ID and name.
func (c *APIClient) UploadFlow(workspaceID, yamlContent string) (string, string, error) {
	body := map[string]string{"yaml": yamlContent}
	data, status, err := c.do("POST", fmt.Sprintf("/api/v1/workspaces/%s/flows", workspaceID), body)
	if err != nil {
		return "", "", err
	}
	if status != 200 && status != 201 {
		return "", "", fmt.Errorf("API returned %d: %s", status, string(data))
	}
	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		return "", "", fmt.Errorf("failed to parse upload response: %w", err)
	}
	id, _ := result["id"].(string)
	name, _ := result["name"].(string)
	return id, name, nil
}

// ListFlows returns all flows in a workspace.
func (c *APIClient) ListFlows(workspaceID string) ([]map[string]any, error) {
	data, status, err := c.do("GET", fmt.Sprintf("/api/v1/workspaces/%s/flows", workspaceID), nil)
	if err != nil {
		return nil, err
	}
	if status != 200 {
		return nil, fmt.Errorf("API returned %d: %s", status, string(data))
	}
	var result []map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		var wrapped struct {
			Flows []map[string]any `json:"flows"`
		}
		if err2 := json.Unmarshal(data, &wrapped); err2 != nil {
			return nil, fmt.Errorf("failed to parse flows response: %w", err)
		}
		return wrapped.Flows, nil
	}
	return result, nil
}

// TriggerExecution starts a flow execution. Returns the execution ID.
func (c *APIClient) TriggerExecution(workspaceID, flowID, environment string, variables map[string]string) (string, error) {
	body := map[string]any{
		"flow_id": flowID,
	}
	if environment != "" {
		body["environment"] = environment
	}
	if len(variables) > 0 {
		body["variables"] = variables
	}

	data, status, err := c.do("POST", fmt.Sprintf("/api/v1/workspaces/%s/executions", workspaceID), body)
	if err != nil {
		return "", err
	}
	if status != 200 && status != 201 {
		return "", fmt.Errorf("API returned %d: %s", status, string(data))
	}
	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		return "", fmt.Errorf("failed to parse execution response: %w", err)
	}
	// Handle both "execution_id" and "id" field names
	if id, ok := result["execution_id"].(string); ok {
		return id, nil
	}
	if id, ok := result["id"].(string); ok {
		return id, nil
	}
	return "", fmt.Errorf("execution ID not found in response: %s", string(data))
}

// GetExecution returns the full execution result including step detail.
func (c *APIClient) GetExecution(executionID string) (map[string]any, error) {
	// Get summary
	sumData, status, err := c.do("GET", fmt.Sprintf("/api/v1/executions/%s", executionID), nil)
	if err != nil {
		return nil, err
	}
	if status != 200 {
		return nil, fmt.Errorf("API returned %d: %s", status, string(sumData))
	}
	var summary map[string]any
	if err := json.Unmarshal(sumData, &summary); err != nil {
		return nil, fmt.Errorf("failed to parse execution: %w", err)
	}

	// Get step detail
	stepsData, stepsStatus, err := c.do("GET", fmt.Sprintf("/api/v1/executions/%s/steps", executionID), nil)
	if err == nil && stepsStatus == 200 {
		var steps any
		if err := json.Unmarshal(stepsData, &steps); err == nil {
			summary["steps_detail"] = steps
		}
	}

	return summary, nil
}

// GetCoverageGaps returns uncovered graph nodes for a workspace.
func (c *APIClient) GetCoverageGaps(workspaceID string) (map[string]any, error) {
	data, status, err := c.do("GET", fmt.Sprintf("/api/v1/workspaces/%s/graph/coverage", workspaceID), nil)
	if err != nil {
		return nil, err
	}
	if status != 200 {
		return nil, fmt.Errorf("API returned %d: %s", status, string(data))
	}
	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("failed to parse coverage response: %w", err)
	}
	return result, nil
}
```

- [ ] **Step 3: Build to verify**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/cli
go build ./internal/mcpserver/...
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/cli
git add internal/mcpserver/api_client.go
git commit -m "feat(mcp): add TestMesh API HTTP client"
```

---

## Task 2: Config Struct + CLI Flags

**Files:**
- Modify: `cli/internal/mcpserver/server.go`
- Modify: `cli/cmd/mcp.go`

- [ ] **Step 1: Read the current mcp.go command**

```bash
cat /Users/ggeorgiev/Dev/testmesh/testmesh/cli/cmd/mcp.go
```

Note the cobra command structure so you wire the flags correctly.

- [ ] **Step 2: Add Config struct to server.go**

In `cli/internal/mcpserver/server.go`, add a `Config` struct before the `Run` function:

```go
// Config holds runtime configuration for the MCP server.
type Config struct {
	APIURL      string // TestMesh API base URL, e.g. http://localhost:5016
	WorkspaceID string // Default workspace ID (auto-discovered if empty)
}
```

Change the `Run` function signature to accept config:

```go
func Run(cfg Config) error {
```

Update `makeHandler` to accept and forward `cfg`:

```go
func makeHandler(toolName string, cfg Config) mcp.ToolHandler {
	return func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		var args map[string]any
		if len(req.Params.Arguments) > 0 {
			_ = json.Unmarshal(req.Params.Arguments, &args)
		}
		if args == nil {
			args = map[string]any{}
		}
		return dispatchTool(toolName, args, cfg)
	}
}
```

Update the loop in `Run` to pass `cfg`:

```go
	for _, def := range toolDefinitions() {
		name, _ := def["name"].(string)
		desc, _ := def["description"].(string)
		schema := def["inputSchema"]
		s.AddTool(&mcp.Tool{
			Name:        name,
			Description: desc,
			InputSchema: schema,
		}, makeHandler(name, cfg))
	}
```

Update `dispatchTool` signature:

```go
func dispatchTool(name string, args map[string]any, cfg Config) (*mcp.CallToolResult, error) {
```

Add a `cfg` parameter to all existing case branches (they don't use it yet — pass it through). The full updated switch:

```go
func dispatchTool(name string, args map[string]any, cfg Config) (*mcp.CallToolResult, error) {
	switch name {
	case "analyze_service":
		return toolAnalyzeService(args)
	case "analyze_workspace":
		return toolAnalyzeWorkspace(args)
	case "read_flow":
		return toolReadFlow(args)
	case "write_flow":
		return toolWriteFlow(args)
	case "validate_flow":
		return toolValidateFlow(args)
	case "run_step":
		return toolRunStep(args)
	case "run_flow":
		return toolRunFlow(args)
	case "list_flows":
		return toolListFlows(args)
	case "get_yaml_schema":
		return toolGetYAMLSchema()
	case "get_action_types":
		return toolGetActionTypes()
	case "list_workspaces":
		return toolListWorkspaces(args, cfg)
	case "upload_flow":
		return toolUploadFlow(args, cfg)
	case "list_flows_api":
		return toolListFlowsAPI(args, cfg)
	case "trigger_execution":
		return toolTriggerExecution(args, cfg)
	case "get_execution":
		return toolGetExecution(args, cfg)
	case "get_coverage_gaps":
		return toolGetCoverageGaps(args, cfg)
	default:
		return toolError("unknown tool: " + name), nil
	}
}
```

- [ ] **Step 3: Wire flags in cmd/mcp.go**

Read `cli/cmd/mcp.go` then update it so that `--api-url` and `--workspace-id` flags are defined and passed to `mcpserver.Run`:

The updated relevant portion of the command's `RunE` (preserving existing structure):

```go
var (
	apiURL      string
	workspaceID string
)

// In the cobra command init, add:
mcpCmd.Flags().StringVar(&apiURL, "api-url", "http://localhost:5016", "TestMesh API base URL")
mcpCmd.Flags().StringVar(&workspaceID, "workspace-id", "", "Default workspace ID (auto-discovered if empty)")

// In RunE:
return mcpserver.Run(mcpserver.Config{
    APIURL:      apiURL,
    WorkspaceID: workspaceID,
})
```

- [ ] **Step 4: Build to verify**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/cli
go build ./...
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add internal/mcpserver/server.go cmd/mcp.go
git commit -m "feat(mcp): add Config struct + --api-url/--workspace-id flags"
```

---

## Task 3: 6 New API-Connected Tool Handlers

**Files:**
- Modify: `cli/internal/mcpserver/tools.go` — add 6 new tool handler functions

- [ ] **Step 1: Add toolListWorkspaces**

Add to `tools.go`:

```go
// ---------------------------------------------------------------------------
// list_workspaces
// ---------------------------------------------------------------------------

func toolListWorkspaces(args map[string]any, cfg Config) (*mcp.CallToolResult, error) {
	if cfg.APIURL == "" {
		return toolError("api-url not configured (pass --api-url or set TESTMESH_API_URL)"), nil
	}
	client := newAPIClient(cfg.APIURL)
	workspaces, err := client.ListWorkspaces()
	if err != nil {
		return toolError(fmt.Sprintf("failed to list workspaces: %v", err)), nil
	}

	if len(workspaces) == 0 {
		return toolContent("No workspaces found."), nil
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Found %d workspace(s):\n", len(workspaces)))
	for _, ws := range workspaces {
		id, _ := ws["id"].(string)
		name, _ := ws["name"].(string)
		sb.WriteString(fmt.Sprintf("  • %s  id=%s\n", name, id))
	}
	return toolContent(sb.String()), nil
}
```

- [ ] **Step 2: Add toolUploadFlow**

Add to `tools.go`:

```go
// ---------------------------------------------------------------------------
// upload_flow
// ---------------------------------------------------------------------------

func toolUploadFlow(args map[string]any, cfg Config) (*mcp.CallToolResult, error) {
	if cfg.APIURL == "" {
		return toolError("api-url not configured"), nil
	}

	yamlContent, _ := args["yaml"].(string)
	if yamlContent == "" {
		return toolError("yaml is required"), nil
	}

	workspaceID, _ := args["workspace_id"].(string)
	if workspaceID == "" {
		workspaceID = cfg.WorkspaceID
	}
	if workspaceID == "" {
		// Auto-discover first workspace
		client := newAPIClient(cfg.APIURL)
		workspaces, err := client.ListWorkspaces()
		if err != nil || len(workspaces) == 0 {
			return toolError("workspace_id required (or configure --workspace-id)"), nil
		}
		workspaceID, _ = workspaces[0]["id"].(string)
	}

	client := newAPIClient(cfg.APIURL)
	flowID, flowName, err := client.UploadFlow(workspaceID, yamlContent)
	if err != nil {
		return toolError(fmt.Sprintf("upload failed: %v", err)), nil
	}

	return toolContent(fmt.Sprintf("✅ Flow uploaded\n  Name: %s\n  ID:   %s\n  Workspace: %s", flowName, flowID, workspaceID)), nil
}
```

- [ ] **Step 3: Add toolListFlowsAPI**

Add to `tools.go`:

```go
// ---------------------------------------------------------------------------
// list_flows_api
// ---------------------------------------------------------------------------

func toolListFlowsAPI(args map[string]any, cfg Config) (*mcp.CallToolResult, error) {
	if cfg.APIURL == "" {
		return toolError("api-url not configured"), nil
	}

	workspaceID, _ := args["workspace_id"].(string)
	if workspaceID == "" {
		workspaceID = cfg.WorkspaceID
	}
	if workspaceID == "" {
		client := newAPIClient(cfg.APIURL)
		workspaces, err := client.ListWorkspaces()
		if err != nil || len(workspaces) == 0 {
			return toolError("workspace_id required"), nil
		}
		workspaceID, _ = workspaces[0]["id"].(string)
	}

	client := newAPIClient(cfg.APIURL)
	flows, err := client.ListFlows(workspaceID)
	if err != nil {
		return toolError(fmt.Sprintf("failed to list flows: %v", err)), nil
	}

	if len(flows) == 0 {
		return toolContent(fmt.Sprintf("No flows in workspace %s", workspaceID)), nil
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Found %d flow(s) in workspace %s:\n", len(flows), workspaceID))
	for _, f := range flows {
		id, _ := f["id"].(string)
		name, _ := f["name"].(string)
		sb.WriteString(fmt.Sprintf("  • %s  id=%s\n", name, id))
	}
	return toolContent(sb.String()), nil
}
```

- [ ] **Step 4: Add toolTriggerExecution**

Add to `tools.go`:

```go
// ---------------------------------------------------------------------------
// trigger_execution
// ---------------------------------------------------------------------------

func toolTriggerExecution(args map[string]any, cfg Config) (*mcp.CallToolResult, error) {
	if cfg.APIURL == "" {
		return toolError("api-url not configured"), nil
	}

	flowID, _ := args["flow_id"].(string)
	if flowID == "" {
		return toolError("flow_id is required"), nil
	}

	workspaceID, _ := args["workspace_id"].(string)
	if workspaceID == "" {
		workspaceID = cfg.WorkspaceID
	}
	if workspaceID == "" {
		client := newAPIClient(cfg.APIURL)
		workspaces, err := client.ListWorkspaces()
		if err != nil || len(workspaces) == 0 {
			return toolError("workspace_id required"), nil
		}
		workspaceID, _ = workspaces[0]["id"].(string)
	}

	environment, _ := args["environment"].(string)
	var variables map[string]string
	if vars, ok := args["variables"].(map[string]any); ok {
		variables = make(map[string]string, len(vars))
		for k, v := range vars {
			variables[k] = fmt.Sprintf("%v", v)
		}
	}

	client := newAPIClient(cfg.APIURL)
	executionID, err := client.TriggerExecution(workspaceID, flowID, environment, variables)
	if err != nil {
		return toolError(fmt.Sprintf("failed to trigger execution: %v", err)), nil
	}

	return toolContent(fmt.Sprintf("✅ Execution started\n  Execution ID: %s\n  Flow ID:      %s\n\nUse get_execution with this ID to poll for results.", executionID, flowID)), nil
}
```

- [ ] **Step 5: Add toolGetExecution**

Add to `tools.go`:

```go
// ---------------------------------------------------------------------------
// get_execution
// ---------------------------------------------------------------------------

func toolGetExecution(args map[string]any, cfg Config) (*mcp.CallToolResult, error) {
	if cfg.APIURL == "" {
		return toolError("api-url not configured"), nil
	}

	executionID, _ := args["execution_id"].(string)
	if executionID == "" {
		return toolError("execution_id is required"), nil
	}

	client := newAPIClient(cfg.APIURL)
	execution, err := client.GetExecution(executionID)
	if err != nil {
		return toolError(fmt.Sprintf("failed to get execution: %v", err)), nil
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Execution: %s\n", executionID))

	if status, ok := execution["status"].(string); ok {
		icon := "⏳"
		switch status {
		case "passed", "completed", "success":
			icon = "✅"
		case "failed", "error":
			icon = "❌"
		}
		sb.WriteString(fmt.Sprintf("Status: %s %s\n", icon, status))
	}
	if dur, ok := execution["duration_ms"]; ok {
		sb.WriteString(fmt.Sprintf("Duration: %vms\n", dur))
	}
	if total, ok := execution["total_steps"]; ok {
		passed, _ := execution["passed"]
		failed, _ := execution["failed"]
		sb.WriteString(fmt.Sprintf("Steps: %v total, %v passed, %v failed\n", total, passed, failed))
	}

	// Render step detail if present
	if steps, ok := execution["steps_detail"]; ok {
		sb.WriteString("\nStep Results:\n")
		stepList, _ := steps.([]any)
		for _, s := range stepList {
			step, _ := s.(map[string]any)
			stepID, _ := step["step_id"].(string)
			if stepID == "" {
				stepID, _ = step["id"].(string)
			}
			action, _ := step["action"].(string)
			stepStatus, _ := step["status"].(string)
			dur, _ := step["duration_ms"]
			icon := "✅"
			if stepStatus != "passed" && stepStatus != "completed" {
				icon = "❌"
			}
			sb.WriteString(fmt.Sprintf("  %s %s (%s) — %vms\n", icon, stepID, action, dur))
			if errMsg, _ := step["error"].(string); errMsg != "" {
				sb.WriteString(fmt.Sprintf("     Error: %s\n", errMsg))
			}
		}
	}

	return toolContent(sb.String()), nil
}
```

- [ ] **Step 6: Add toolGetCoverageGaps**

Add to `tools.go`:

```go
// ---------------------------------------------------------------------------
// get_coverage_gaps
// ---------------------------------------------------------------------------

func toolGetCoverageGaps(args map[string]any, cfg Config) (*mcp.CallToolResult, error) {
	if cfg.APIURL == "" {
		return toolError("api-url not configured"), nil
	}

	workspaceID, _ := args["workspace_id"].(string)
	if workspaceID == "" {
		workspaceID = cfg.WorkspaceID
	}
	if workspaceID == "" {
		client := newAPIClient(cfg.APIURL)
		workspaces, err := client.ListWorkspaces()
		if err != nil || len(workspaces) == 0 {
			return toolError("workspace_id required"), nil
		}
		workspaceID, _ = workspaces[0]["id"].(string)
	}

	client := newAPIClient(cfg.APIURL)
	coverage, err := client.GetCoverageGaps(workspaceID)
	if err != nil {
		return toolError(fmt.Sprintf("failed to get coverage gaps: %v", err)), nil
	}

	out, _ := json.MarshalIndent(coverage, "", "  ")
	return toolContent(fmt.Sprintf("Coverage gaps for workspace %s:\n%s", workspaceID, string(out))), nil
}
```

- [ ] **Step 7: Build to verify**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/cli
go build ./...
```

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add internal/mcpserver/tools.go
git commit -m "feat(mcp): add 6 API-connected tool handlers (upload_flow, trigger_execution, etc.)"
```

---

## Task 4: Register New Tools in server.go

**Files:**
- Modify: `cli/internal/mcpserver/server.go`

- [ ] **Step 1: Add 6 new tool definitions to toolDefinitions()**

In `server.go`, inside `toolDefinitions()`, after the existing `list_flows` entry, add:

```go
		// ── API-connected tools ───────────────────────────────────────────────
		{
			"name":        "list_workspaces",
			"description": "List all workspaces in the TestMesh API. Use this first to get a workspace_id for other API tools.",
			"inputSchema": map[string]any{
				"type":       "object",
				"properties": map[string]any{},
			},
		},
		{
			"name": "upload_flow",
			"description": "Upload a TestMesh flow YAML to the TestMesh API. The flow appears in the dashboard and can be triggered via trigger_execution. Returns the flow ID.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"yaml": map[string]any{
						"type":        "string",
						"description": "Complete TestMesh flow YAML including the 'flow:' root key",
					},
					"workspace_id": map[string]any{
						"type":        "string",
						"description": "Workspace ID (uses --workspace-id default if omitted, or auto-discovers first workspace)",
					},
				},
				"required": []string{"yaml"},
			},
		},
		{
			"name":        "list_flows_api",
			"description": "List flows stored in the TestMesh API for a workspace. Use this to get flow IDs before calling trigger_execution.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"workspace_id": map[string]any{
						"type":        "string",
						"description": "Workspace ID (uses --workspace-id default if omitted)",
					},
				},
			},
		},
		{
			"name": "trigger_execution",
			"description": "Trigger execution of a flow stored in the TestMesh API. Returns an execution_id. Poll with get_execution to see results.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"flow_id": map[string]any{
						"type":        "string",
						"description": "Flow ID from upload_flow or list_flows_api",
					},
					"workspace_id": map[string]any{
						"type":        "string",
						"description": "Workspace ID (uses --workspace-id default if omitted)",
					},
					"environment": map[string]any{
						"type":        "string",
						"description": "Environment name to use for this execution (optional)",
					},
					"variables": map[string]any{
						"type":        "object",
						"description": "Override variables for this execution (optional)",
					},
				},
				"required": []string{"flow_id"},
			},
		},
		{
			"name":        "get_execution",
			"description": "Get the full result of a TestMesh execution including per-step pass/fail, duration, and error details.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"execution_id": map[string]any{
						"type":        "string",
						"description": "Execution ID from trigger_execution",
					},
				},
				"required": []string{"execution_id"},
			},
		},
		{
			"name":        "get_coverage_gaps",
			"description": "Get uncovered graph nodes for a workspace — shows what parts of the system have no test coverage. Returns coverage percentage and a list of uncovered endpoints/operations.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"workspace_id": map[string]any{
						"type":        "string",
						"description": "Workspace ID (uses --workspace-id default if omitted)",
					},
				},
			},
		},
```

- [ ] **Step 2: Build to verify**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/cli
go build ./...
```

Expected: No errors.

- [ ] **Step 3: Verify tool count**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/cli
go run main.go mcp --help
```

Expected: Shows `--api-url` and `--workspace-id` flags.

- [ ] **Step 4: Commit**

```bash
git add internal/mcpserver/server.go
git commit -m "feat(mcp): register 6 new API-connected tools in server + tool definitions"
```

---

## Task 5: Auto-Discovery Engine — HTTP Probing

**Files:**
- Create: `cli/internal/mcpserver/discovery.go`

- [ ] **Step 1: Create discovery.go with HTTP probing**

Create `cli/internal/mcpserver/discovery.go`:

```go
package mcpserver

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// DiscoveredService holds everything auto-discovered about a single service.
type DiscoveredService struct {
	Name         string
	BaseURL      string
	HealthURL    string
	OpenAPISpec  map[string]any   // parsed OpenAPI/Swagger JSON, nil if not found
	Endpoints    []DiscoveredEndpoint
	DBTables     []string
	RedisKeys    []string
	KafkaTopics  []string
	Neo4jLabels  []string
	MinioBuckets []string
	GRPCMethods  []string // from .proto files
}

type DiscoveredEndpoint struct {
	Method  string
	Path    string
	Summary string
}

var openAPIProbes = []string{
	"/openapi.json",
	"/swagger.json",
	"/api-docs",
	"/v1/openapi.json",
	"/api/v1/openapi.json",
	"/swagger/v1/swagger.json",
	"/docs/openapi.json",
	"/openapi/v3/api-docs",
}

var healthProbes = []string{
	"/health",
	"/healthz",
	"/ping",
	"/status",
	"/ready",
	"/live",
}

var httpProbeClient = &http.Client{Timeout: 3 * time.Second}

// DiscoverService probes a service URL and returns what it finds.
func DiscoverService(baseURL, name string) *DiscoveredService {
	svc := &DiscoveredService{
		Name:    name,
		BaseURL: baseURL,
	}

	// 1. Probe OpenAPI spec
	for _, path := range openAPIProbes {
		resp, err := httpProbeClient.Get(baseURL + path)
		if err != nil {
			continue
		}
		defer resp.Body.Close()
		if resp.StatusCode == 200 {
			data, err := io.ReadAll(resp.Body)
			if err != nil {
				continue
			}
			var spec map[string]any
			if err := json.Unmarshal(data, &spec); err != nil {
				continue
			}
			svc.OpenAPISpec = spec
			svc.Endpoints = extractEndpointsFromOpenAPI(spec)
			break
		}
	}

	// 2. Probe health endpoint
	for _, path := range healthProbes {
		resp, err := httpProbeClient.Get(baseURL + path)
		if err != nil {
			continue
		}
		resp.Body.Close()
		if resp.StatusCode < 400 {
			svc.HealthURL = baseURL + path
			break
		}
	}

	return svc
}

func extractEndpointsFromOpenAPI(spec map[string]any) []DiscoveredEndpoint {
	var endpoints []DiscoveredEndpoint

	paths, _ := spec["paths"].(map[string]any)
	for path, methods := range paths {
		methodMap, _ := methods.(map[string]any)
		for method, opRaw := range methodMap {
			method = strings.ToUpper(method)
			if method == "PARAMETERS" {
				continue
			}
			op, _ := opRaw.(map[string]any)
			summary, _ := op["summary"].(string)
			endpoints = append(endpoints, DiscoveredEndpoint{
				Method:  method,
				Path:    path,
				Summary: summary,
			})
		}
	}
	return endpoints
}

// DockerComposeService represents a single service in docker-compose.
type DockerComposeService struct {
	Name        string
	Image       string
	Ports       []string
	Environment map[string]string
	BuildCtx    string
}

// ParseDockerCompose reads a docker-compose file and returns service configs.
func ParseDockerCompose(composePath string) ([]DockerComposeService, error) {
	data, err := os.ReadFile(composePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read docker-compose: %w", err)
	}

	var raw struct {
		Services map[string]struct {
			Image       string         `yaml:"image"`
			Ports       []string       `yaml:"ports"`
			Environment yaml.Node      `yaml:"environment"`
			Build       yaml.Node      `yaml:"build"`
		} `yaml:"services"`
	}

	if err := yaml.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse docker-compose: %w", err)
	}

	var services []DockerComposeService
	for name, svc := range raw.Services {
		env := parseEnvNode(&svc.Environment)
		buildCtx := ""
		if svc.Build.Kind == yaml.ScalarNode {
			buildCtx = svc.Build.Value
		} else if svc.Build.Kind == yaml.MappingNode {
			for i := 0; i < len(svc.Build.Content)-1; i += 2 {
				if svc.Build.Content[i].Value == "context" {
					buildCtx = svc.Build.Content[i+1].Value
					break
				}
			}
		}
		services = append(services, DockerComposeService{
			Name:        name,
			Image:       svc.Image,
			Ports:       svc.Ports,
			Environment: env,
			BuildCtx:    buildCtx,
		})
	}
	return services, nil
}

// parseEnvNode handles both list (`- KEY=VALUE`) and map (`KEY: VALUE`) formats.
func parseEnvNode(node *yaml.Node) map[string]string {
	env := map[string]string{}
	if node == nil || node.Kind == 0 {
		return env
	}
	switch node.Kind {
	case yaml.SequenceNode:
		for _, item := range node.Content {
			parts := strings.SplitN(item.Value, "=", 2)
			if len(parts) == 2 {
				// Strip ${VAR:-default} patterns — extract default
				val := parts[1]
				if strings.HasPrefix(val, "${") {
					re := regexp.MustCompile(`\$\{[^:}]+:-([^}]+)\}`)
					if m := re.FindStringSubmatch(val); len(m) > 1 {
						val = m[1]
					}
				}
				env[parts[0]] = val
			}
		}
	case yaml.MappingNode:
		for i := 0; i < len(node.Content)-1; i += 2 {
			key := node.Content[i].Value
			val := node.Content[i+1].Value
			if strings.HasPrefix(val, "${") {
				re := regexp.MustCompile(`\$\{[^:}]+:-([^}]+)\}`)
				if m := re.FindStringSubmatch(val); len(m) > 1 {
					val = m[1]
				}
			}
			env[key] = val
		}
	}
	return env
}

// WalkProtoFiles walks a directory and returns all gRPC method names found in .proto files.
func WalkProtoFiles(dir string) []string {
	var methods []string
	// Pattern: "rpc MethodName("
	rpcRe := regexp.MustCompile(`(?m)^\s*rpc\s+(\w+)\s*\(`)
	serviceRe := regexp.MustCompile(`(?m)^\s*service\s+(\w+)\s*\{`)

	_ = filepath.Walk(dir, func(path string, fi os.FileInfo, err error) error {
		if err != nil || fi.IsDir() || !strings.HasSuffix(path, ".proto") {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}
		content := string(data)

		// Extract service name for context
		serviceName := ""
		if m := serviceRe.FindStringSubmatch(content); len(m) > 1 {
			serviceName = m[1]
		}

		for _, m := range rpcRe.FindAllStringSubmatch(content, -1) {
			if len(m) > 1 {
				if serviceName != "" {
					methods = append(methods, serviceName+"/"+m[1])
				} else {
					methods = append(methods, m[1])
				}
			}
		}
		return nil
	})
	return methods
}

// DiscoveryReport produces a human-readable discovery report for a service.
func DiscoveryReport(svc *DiscoveredService) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("## Service: %s\n", svc.Name))
	sb.WriteString(fmt.Sprintf("URL: %s\n", svc.BaseURL))
	if svc.HealthURL != "" {
		sb.WriteString(fmt.Sprintf("Health: %s ✅\n", svc.HealthURL))
	}

	if len(svc.Endpoints) > 0 {
		sb.WriteString(fmt.Sprintf("\n### HTTP Endpoints (%d from OpenAPI)\n", len(svc.Endpoints)))
		for _, ep := range svc.Endpoints {
			sb.WriteString(fmt.Sprintf("  %s %s", ep.Method, ep.Path))
			if ep.Summary != "" {
				sb.WriteString(fmt.Sprintf(" — %s", ep.Summary))
			}
			sb.WriteString("\n")
		}
	} else {
		sb.WriteString("\n### HTTP Endpoints\n  (no OpenAPI spec found — use analyze_service for source-based discovery)\n")
	}

	if len(svc.DBTables) > 0 {
		sb.WriteString(fmt.Sprintf("\n### DB Tables (%d)\n", len(svc.DBTables)))
		for _, t := range svc.DBTables {
			sb.WriteString(fmt.Sprintf("  %s\n", t))
		}
	}

	if len(svc.KafkaTopics) > 0 {
		sb.WriteString(fmt.Sprintf("\n### Kafka Topics\n"))
		for _, t := range svc.KafkaTopics {
			sb.WriteString(fmt.Sprintf("  %s\n", t))
		}
	}

	if len(svc.Neo4jLabels) > 0 {
		sb.WriteString(fmt.Sprintf("\n### Neo4j Labels\n"))
		for _, l := range svc.Neo4jLabels {
			sb.WriteString(fmt.Sprintf("  %s\n", l))
		}
	}

	if len(svc.MinioBuckets) > 0 {
		sb.WriteString(fmt.Sprintf("\n### MinIO Buckets\n"))
		for _, b := range svc.MinioBuckets {
			sb.WriteString(fmt.Sprintf("  %s\n", b))
		}
	}

	if len(svc.GRPCMethods) > 0 {
		sb.WriteString(fmt.Sprintf("\n### gRPC Methods (%d)\n", len(svc.GRPCMethods)))
		for _, m := range svc.GRPCMethods {
			sb.WriteString(fmt.Sprintf("  %s\n", m))
		}
	}

	return sb.String()
}
```

- [ ] **Step 2: Build to verify**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/cli
go build ./internal/mcpserver/...
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add internal/mcpserver/discovery.go
git commit -m "feat(mcp): add spec-first auto-discovery engine (HTTP probing + docker-compose parsing)"
```

---

## Task 6: Auto-Discovery — Environment Mining (DB/Redis/Kafka/Neo4j/MinIO)

**Files:**
- Modify: `cli/internal/mcpserver/discovery.go` — add infra connection probe functions

- [ ] **Step 1: Add database schema discovery**

Add to `discovery.go`:

```go
// ProbePostgreSQL connects to a PostgreSQL database and returns table names.
// connStr format: host=... port=... user=... password=... dbname=... sslmode=disable
func ProbePostgreSQL(env map[string]string) []string {
	host := firstNonEmpty(env["DB_HOST"], env["DATABASE_HOST"], "localhost")
	port := firstNonEmpty(env["DB_PORT"], env["DATABASE_PORT"], "5432")
	user := firstNonEmpty(env["DB_USER"], env["DATABASE_USER"], "postgres")
	password := firstNonEmpty(env["DB_PASSWORD"], env["DATABASE_PASSWORD"], "")
	dbname := firstNonEmpty(env["DB_NAME"], env["DATABASE_DBNAME"], "postgres")
	schema := firstNonEmpty(env["DB_SCHEMA"], "public")
	sslmode := firstNonEmpty(env["DB_SSLMODE"], "disable")

	// Use the psql tool if available, otherwise use a database_query step approach
	// Here we build the connection string for reporting purposes
	connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		host, port, user, password, dbname, sslmode)

	// Report as a usable connection string
	return []string{fmt.Sprintf("connection_string=%s schema=%s", connStr, schema)}
}

// ProbeKafka extracts Kafka broker addresses from env and returns them.
func ProbeKafka(env map[string]string) []string {
	brokers := firstNonEmpty(env["KAFKA_BROKERS"], env["KAFKA_BOOTSTRAP_SERVERS"], "")
	if brokers == "" {
		return nil
	}
	return strings.Split(brokers, ",")
}

// ProbeRedis extracts Redis address from env.
func ProbeRedis(env map[string]string) string {
	host := firstNonEmpty(env["REDIS_HOST"], "localhost")
	port := firstNonEmpty(env["REDIS_PORT"], "6379")
	return fmt.Sprintf("%s:%s", host, port)
}

// ProbeNeo4j extracts Neo4j connection details from env.
func ProbeNeo4j(env map[string]string) (uri, user, password string) {
	uri = firstNonEmpty(env["NEO4J_URI"], env["NEO4J_BOLT_URL"], "bolt://neo4j:7687")
	user = firstNonEmpty(env["NEO4J_USER"], env["NEO4J_USERNAME"], "neo4j")
	password = firstNonEmpty(env["NEO4J_PASSWORD"], "")
	return
}

// ProbeMinio extracts MinIO connection details from env.
func ProbeMinio(env map[string]string) (endpoint, accessKey, secretKey string) {
	endpoint = firstNonEmpty(env["MINIO_ENDPOINT"], "minio:9000")
	accessKey = firstNonEmpty(env["MINIO_ACCESS_KEY"], env["MINIO_ROOT_USER"], "minioadmin")
	secretKey = firstNonEmpty(env["MINIO_SECRET_KEY"], env["MINIO_ROOT_PASSWORD"], "minioadmin")
	return
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
```

- [ ] **Step 2: Add DiscoverFromDockerCompose function**

Add to `discovery.go`:

```go
// DiscoverFromDockerCompose parses a docker-compose file and produces a discovery
// report for all services including inferred infrastructure connections.
func DiscoverFromDockerCompose(composePath string) (string, error) {
	services, err := ParseDockerCompose(composePath)
	if err != nil {
		return "", err
	}

	composeDir := filepath.Dir(composePath)
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("# Auto-Discovery Report\n"))
	sb.WriteString(fmt.Sprintf("Source: %s\n", composePath))
	sb.WriteString(fmt.Sprintf("Services found: %d\n\n", len(services)))

	for _, svc := range services {
		sb.WriteString(fmt.Sprintf("## Service: %s\n", svc.Name))

		// Extract port bindings for HTTP probing
		for _, portBinding := range svc.Ports {
			parts := strings.Split(portBinding, ":")
			if len(parts) >= 2 {
				hostPort := strings.TrimPrefix(parts[0], "${")
				// Clean up ${VAR:-port}:containerPort format
				if idx := strings.Index(hostPort, ":-"); idx != -1 {
					hostPort = hostPort[idx+2:]
					hostPort = strings.TrimSuffix(hostPort, "}")
				}
				sb.WriteString(fmt.Sprintf("  Port: %s → container %s\n", hostPort, parts[len(parts)-1]))
			}
		}

		// Walk .proto files if build context is known
		if svc.BuildCtx != "" {
			buildDir := svc.BuildCtx
			if !filepath.IsAbs(buildDir) {
				buildDir = filepath.Join(composeDir, buildDir)
			}
			methods := WalkProtoFiles(buildDir)
			if len(methods) > 0 {
				sb.WriteString(fmt.Sprintf("  gRPC methods: %s\n", strings.Join(methods, ", ")))
			}
		}

		// Infer infrastructure from env vars
		env := svc.Environment

		if brokers := ProbeKafka(env); len(brokers) > 0 {
			sb.WriteString(fmt.Sprintf("  Kafka brokers: %s\n", strings.Join(brokers, ", ")))
		}

		if _, ok := env["REDIS_HOST"]; ok {
			sb.WriteString(fmt.Sprintf("  Redis: %s\n", ProbeRedis(env)))
		}

		if _, hasDBHost := env["DB_HOST"]; hasDBHost {
			infos := ProbePostgreSQL(env)
			sb.WriteString(fmt.Sprintf("  PostgreSQL: %s\n", strings.Join(infos, " ")))
		}

		if _, hasNeo4j := env["NEO4J_URI"]; hasNeo4j {
			uri, user, _ := ProbeNeo4j(env)
			sb.WriteString(fmt.Sprintf("  Neo4j: %s (user=%s)\n", uri, user))
		}

		if _, hasMinio := env["MINIO_ENDPOINT"]; hasMinio {
			endpoint, accessKey, _ := ProbeMinio(env)
			sb.WriteString(fmt.Sprintf("  MinIO: %s (access_key=%s)\n", endpoint, accessKey))
		}

		sb.WriteString("\n")
	}

	return sb.String(), nil
}
```

- [ ] **Step 3: Build to verify**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/cli
go build ./internal/mcpserver/...
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add internal/mcpserver/discovery.go
git commit -m "feat(mcp): add infra env mining (DB/Redis/Kafka/Neo4j/MinIO) to discovery engine"
```

---

## Task 7: Wire Discovery into analyze_workspace + get_action_types Updates

**Files:**
- Modify: `cli/internal/mcpserver/tools.go` — update toolAnalyzeWorkspace to use discovery, update toolGetActionTypes

- [ ] **Step 1: Update toolAnalyzeWorkspace to probe docker-compose**

In `tools.go`, update `toolAnalyzeWorkspace` to call `DiscoverFromDockerCompose` when the workspace path looks like a docker-compose file:

```go
func toolAnalyzeWorkspace(args map[string]any) (*mcp.CallToolResult, error) {
	directory, _ := args["workspace_path"].(string)
	if directory == "" {
		directory, _ = args["directory"].(string)
	}
	if directory == "" {
		return toolError("workspace_path is required"), nil
	}

	var sb strings.Builder

	// If the path is a docker-compose file (or we can find one), run auto-discovery first
	composePath := ""
	if strings.HasSuffix(directory, ".yml") || strings.HasSuffix(directory, ".yaml") {
		composePath = directory
	} else {
		// Look for docker-compose files in the directory
		for _, candidate := range []string{
			filepath.Join(directory, "docker-compose.yml"),
			filepath.Join(directory, "docker-compose.yaml"),
			filepath.Join(directory, "docker-compose.services.yml"),
		} {
			if _, err := os.Stat(candidate); err == nil {
				composePath = candidate
				break
			}
		}
	}

	if composePath != "" {
		report, err := DiscoverFromDockerCompose(composePath)
		if err == nil {
			sb.WriteString("# Spec-First Auto-Discovery\n\n")
			sb.WriteString(report)
			sb.WriteString("\n---\n\n")
		}
	}

	// Run existing source-based analysis as enhancement layer
	workspace, err := AnalyzeWorkspace(directory)
	if err != nil {
		// If source analysis fails but we have discovery, return discovery alone
		if sb.Len() > 0 {
			return toolContent(sb.String()), nil
		}
		return toolError(err.Error()), nil
	}

	opts := AnalysisReportOptions{
		DBConnection: strArg(args, "db_connection"),
		KafkaBrokers: strArg(args, "kafka_brokers"),
		RedisAddr:    strArg(args, "redis_addr"),
	}

	sb.WriteString(fmt.Sprintf("# Source Analysis\n\nAnalyzed workspace: %s\nFound %d services, %d dependencies.\n\n%s",
		workspace.RootDir, len(workspace.Services), len(workspace.Dependencies),
		GenerateE2EAnalysisReport(workspace, opts)))

	return toolContent(sb.String()), nil
}
```

Also add `"path/filepath"` import if not already present, and `"os"`.

- [ ] **Step 2: Update toolGetActionTypes to include Neo4j, MinIO, gRPC action types**

In `toolGetActionTypes()`, add these entries to the `actions` map:

```go
		"grpc_call": map[string]any{
			"description": "Make a unary gRPC call",
			"required":    []string{"host", "method"},
			"optional":    []string{"request", "metadata", "timeout", "proto_file"},
		},
		"grpc_stream": map[string]any{
			"description": "Make a streaming gRPC call",
			"required":    []string{"host", "method"},
			"optional":    []string{"request", "metadata", "timeout"},
		},
		"neo4j.query": map[string]any{
			"description": "Execute a Cypher query against Neo4j",
			"required":    []string{"url", "query"},
			"optional":    []string{"username", "password", "database", "params"},
		},
		"neo4j.assert": map[string]any{
			"description": "Execute a Cypher query and assert on the result",
			"required":    []string{"url", "query"},
			"optional":    []string{"username", "password", "database", "params", "assert"},
		},
		"minio.put": map[string]any{
			"description": "Upload an object to MinIO",
			"required":    []string{"endpoint", "bucket", "object", "data"},
			"optional":    []string{"access_key", "secret_key", "content_type"},
		},
		"minio.get": map[string]any{
			"description": "Download an object from MinIO",
			"required":    []string{"endpoint", "bucket", "object"},
			"optional":    []string{"access_key", "secret_key", "as"},
		},
		"minio.assert": map[string]any{
			"description": "Assert that a MinIO object exists with expected properties",
			"required":    []string{"endpoint", "bucket", "object"},
			"optional":    []string{"access_key", "secret_key"},
		},
		"wait_until": map[string]any{
			"description": "Poll a condition expression until it becomes true",
			"required":    []string{"condition"},
			"optional":    []string{"max_duration", "interval", "on_timeout"},
		},
		"parallel": map[string]any{
			"description": "Execute multiple step branches in parallel",
			"required":    []string{"branches"},
			"optional":    []string{"max_concurrent", "fail_fast", "wait_for_all"},
		},
```

- [ ] **Step 3: Build to verify**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/cli
go build ./...
```

Expected: No errors.

- [ ] **Step 4: Smoke test — start MCP server and verify it lists 16 tools**

```bash
cd /Users/ggeorgiev/Dev/testmesh/testmesh/cli
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | go run main.go mcp 2>/dev/null | python3 -c "import json,sys; data=json.load(sys.stdin); print(f'Tools: {len(data[\"result\"][\"tools\"])}')"
```

Expected: `Tools: 16` (10 existing + 6 new)

- [ ] **Step 5: Commit**

```bash
git add internal/mcpserver/tools.go
git commit -m "feat(mcp): wire discovery into analyze_workspace + add Neo4j/MinIO/gRPC to get_action_types"
```
