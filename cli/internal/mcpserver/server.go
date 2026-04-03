// Package mcpserver implements a Model Context Protocol (MCP) server over stdio.
// It exposes TestMesh capabilities as MCP tools that AI clients (e.g. Claude Code)
// can call to analyze services and generate/run/validate E2E test flows.
package mcpserver

import (
	"context"
	"encoding/json"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Config holds runtime configuration for the MCP server.
type Config struct {
	APIURL      string // TestMesh API base URL, e.g. http://localhost:5016
	WorkspaceID string // Default workspace ID (auto-discovered if empty)
}

// Run starts the TestMesh MCP server over stdio using the official Go MCP SDK.
func Run(cfg Config) error {
	s := mcp.NewServer(&mcp.Implementation{
		Name:    "testmesh",
		Version: "1.0.0",
	}, nil)

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

	return s.Run(context.Background(), &mcp.StdioTransport{})
}

// makeHandler returns a ToolHandler that parses raw JSON arguments and
// delegates to the named tool implementation.
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

// dispatchTool routes a tool call to its implementation.
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
	case "get_testing_guide":
		return toolGetTestingGuide()
	case "generate_test_plan":
		return toolGenerateTestPlan(args)
	case "generate_flow":
		return toolGenerateFlow(args)
	case "run_suite":
		return toolRunSuite(args)
	default:
		return toolError("unknown tool: " + name), nil
	}
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

// toolDefinitions returns the full list of tools this server exposes.
func toolDefinitions() []map[string]any {
	infra := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"db_connection": map[string]any{
				"type":        "string",
				"description": "PostgreSQL connection string (e.g. postgres://user:pass@localhost:5432/db?sslmode=disable)",
			},
			"kafka_brokers": map[string]any{
				"type":        "string",
				"description": "Kafka broker addresses (e.g. localhost:9092)",
			},
			"redis_addr": map[string]any{
				"type":        "string",
				"description": "Redis address (e.g. localhost:6379)",
			},
		},
	}

	return []map[string]any{
		// ── Analysis ──────────────────────────────────────────────────────────
		{
			"name": "analyze_workspace",
			"description": `Analyze a directory of multiple services and return a rich report covering:
endpoints with exact request schemas, Kafka topics and message schemas, inter-service call graph,
DB table schemas, Redis key patterns, dependency execution order, and "what to test" guidance.
Start here for any multi-service project. After reading the report, decide how many flows to create
and what each covers, then call write_flow once per flow.`,
			"inputSchema": mergeSchema(infra, map[string]any{
				"workspace_path": map[string]any{
					"type":        "string",
					"description": "Path to directory containing multiple service subdirectories",
				},
			}, []string{"workspace_path"}),
		},
		{
			"name": "analyze_service",
			"description": `Analyze a single service directory (Go, Node.js, Python) and return a rich report covering:
endpoints with exact request schemas, DB tables, Kafka topics, Redis keys, and "what to test" guidance.
Use this when you only need to test one service in isolation. After reading the report,
decide how many flows to create, then call write_flow once per flow.`,
			"inputSchema": mergeSchema(infra, map[string]any{
				"path": map[string]any{
					"type":        "string",
					"description": "Path to the service directory",
				},
			}, []string{"path"}),
		},

		// ── Schema / reference ────────────────────────────────────────────────
		{
			"name":        "get_yaml_schema",
			"description": "Return the complete TestMesh YAML flow schema with examples for every action type (http_request, database_query, db_poll, kafka_consumer, redis.get, delay, log). Consult this when writing flow YAML to get correct field names and syntax.",
			"inputSchema": map[string]any{"type": "object", "properties": map[string]any{}},
		},
		{
			"name":        "get_action_types",
			"description": "Return all supported action types with their required and optional configuration fields. Use alongside get_yaml_schema when you need a quick reference of what a specific action accepts.",
			"inputSchema": map[string]any{"type": "object", "properties": map[string]any{}},
		},

		// ── AI Test Generation Pipeline ──────────────────────────────────────
		{
			"name":        "get_testing_guide",
			"description": "Return a comprehensive best-practices guide for writing TestMesh E2E flows. Covers flow organization, assertion patterns per layer (HTTP/Kafka/DB/Redis), setup/teardown for idempotency, async verification strategies (delay vs db_poll vs kafka_consumer), variable chaining, edge case patterns, and the test plan YAML schema. Read this first before generating any flows.",
			"inputSchema": map[string]any{"type": "object", "properties": map[string]any{}},
		},
		{
			"name": "generate_test_plan",
			"description": `Analyze a workspace and return structured context for creating a comprehensive test plan.
Discovers services, endpoints, infrastructure, and existing flow coverage. Returns a service inventory
with endpoint counts, a recommended coverage assessment (flows per service per category), existing flow
coverage if flows_dir is provided, and the test plan YAML schema.
Use this after analyze_workspace to plan a full test suite. You create the test plan YAML from this context.`,
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"workspace_dir": map[string]any{
						"type":        "string",
						"description": "Path to the workspace directory containing service subdirectories",
					},
					"prompt": map[string]any{
						"type":        "string",
						"description": "Optional user requirements or focus areas for the test plan",
					},
					"flows_dir": map[string]any{
						"type":        "string",
						"description": "Optional path to existing flows directory — used to assess current coverage",
					},
				},
				"required": []string{"workspace_dir"},
			},
		},
		{
			"name": "generate_flow",
			"description": `Return focused context for generating a single test flow. Includes the target service's
endpoints, DB schemas, Kafka topics, request schemas, category-specific guidance (happy-path/error-handling/
cross-service/edge-case), and sibling flow examples for convention consistency.
After reading this context, write the flow YAML, then call write_flow to save and validate_flow to check.`,
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"workspace_dir": map[string]any{
						"type":        "string",
						"description": "Path to the workspace directory",
					},
					"service_name": map[string]any{
						"type":        "string",
						"description": "Target service name (must match a directory in the workspace, or 'e2e' for cross-service)",
					},
					"category": map[string]any{
						"type":        "string",
						"description": "Flow category: happy-path, error-handling, cross-service, or edge-case",
						"enum":        []string{"happy-path", "error-handling", "cross-service", "edge-case"},
					},
					"action_description": map[string]any{
						"type":        "string",
						"description": "What this specific flow should test (e.g., 'Create user with valid data and verify DB persistence')",
					},
					"sibling_flows_dir": map[string]any{
						"type":        "string",
						"description": "Optional path to directory containing sibling flows — read for naming/convention consistency",
					},
				},
				"required": []string{"workspace_dir", "service_name", "category", "action_description"},
			},
		},
		{
			"name": "run_suite",
			"description": `Execute a suite of TestMesh flows with tiered validation. Accepts a directory of flow files or
a test plan YAML (version: "1"). Tiers:
  1 — Structural validation only (YAML syntax, action types, variable dependencies)
  2 — Connectivity probes (HTTP health checks, PostgreSQL SELECT 1, Kafka/Redis connect)
  3 — Setup-only execution (runs setup steps to verify infrastructure access)
  4 — Full execution (runs all flows end-to-end)
Returns a per-flow report with pass/fail status, failure categories, and repair hints.`,
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"path": map[string]any{
						"type":        "string",
						"description": "Path to a directory of flow files or a test plan YAML",
					},
					"tier": map[string]any{
						"type":        "number",
						"description": "Validation tier (1-4, default 1). Higher tiers include all lower tiers.",
					},
				},
				"required": []string{"path"},
			},
		},

		// ── Flow lifecycle ────────────────────────────────────────────────────
		{
			"name":        "read_flow",
			"description": "Read the YAML content of an existing flow file. Use this to inspect a flow before modifying it, or to understand what variables it captures and what it tests.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"file_path": map[string]any{"type": "string", "description": "Path to the .yaml flow file"},
				},
				"required": []string{"file_path"},
			},
		},
		{
			"name": "write_flow",
			"description": `Write a TestMesh flow YAML file to disk. Validates structure before saving.
Call once per flow — you decide how many flows to create (one per scenario, service, or concern).
Returns the saved path and step count on success, or a validation error message.`,
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"path": map[string]any{
						"type":        "string",
						"description": "Destination file path (e.g. ./flows/user-crud.yaml). Parent directories are created automatically.",
					},
					"yaml_content": map[string]any{
						"type":        "string",
						"description": "Complete TestMesh flow YAML including the 'flow:' root key.",
					},
				},
				"required": []string{"path", "yaml_content"},
			},
		},
		{
			"name":        "validate_flow",
			"description": "Validate a TestMesh flow YAML without executing it. Checks structure, known action types, required fields, step IDs, and variable dependency order (catches {{var}} used before it is captured). Accepts inline yaml_content or a file_path.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"yaml_content": map[string]any{"type": "string", "description": "Flow YAML as a string"},
					"file_path":    map[string]any{"type": "string", "description": "Path to a .yaml flow file"},
				},
			},
		},
		{
			"name": "run_step",
			"description": `Run a single action step against live infrastructure without writing a full flow.
The browser_evaluate equivalent — use this to debug a specific action in isolation:
verify a SQL query returns what you expect, check a Redis key exists, probe an HTTP endpoint's response shape.
Returns the step status, error details with actual values if assertions fail, and the full output data.`,
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"action": map[string]any{
						"type":        "string",
						"description": "Action type (e.g. http_request, database_query, redis.get, kafka_consumer)",
					},
					"config": map[string]any{
						"type":        "object",
						"description": "Action config object — same structure as in flow YAML",
					},
					"assert": map[string]any{
						"type":        "array",
						"items":       map[string]any{"type": "string"},
						"description": "Optional assertions to evaluate against the result (e.g. [\"status == 200\", \"row_count == 1\"])",
					},
					"vars": map[string]any{
						"type":        "object",
						"description": "Optional variables to inject for {{var}} template resolution (e.g. {\"user_id\": \"abc-123\"})",
					},
				},
				"required": []string{"action", "config"},
			},
		},
		{
			"name":        "run_flow",
			"description": "Execute a TestMesh flow and return per-step pass/fail results with durations and error details. Accepts inline yaml_content or a file_path.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"yaml_content": map[string]any{"type": "string", "description": "Flow YAML as a string"},
					"file_path":    map[string]any{"type": "string", "description": "Path to a .yaml flow file"},
				},
			},
		},
		{
			"name":        "list_flows",
			"description": "List all TestMesh flow YAML files found under a directory (recursive). Useful to see what flows already exist before creating new ones.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"directory": map[string]any{"type": "string", "description": "Directory to search"},
				},
				"required": []string{"directory"},
			},
		},

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
			"name":        "upload_flow",
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
			"name":        "trigger_execution",
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
	}
}

// mergeSchema builds an inputSchema object by merging extra properties into a
// base schema and setting the required array.
func mergeSchema(base map[string]any, extra map[string]any, required []string) map[string]any {
	props := map[string]any{}
	if baseProps, ok := base["properties"].(map[string]any); ok {
		for k, v := range baseProps {
			props[k] = v
		}
	}
	for k, v := range extra {
		props[k] = v
	}
	return map[string]any{
		"type":       "object",
		"properties": props,
		"required":   required,
	}
}
