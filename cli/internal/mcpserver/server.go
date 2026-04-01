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
