// Package mcpserver implements a Model Context Protocol (MCP) server over stdio.
// It exposes TestMesh capabilities as MCP tools that AI clients (e.g. Claude Code)
// can call to analyze services and generate/run/validate E2E test flows.
package mcpserver

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
)

const protocolVersion = "2024-11-05"

// rpcRequest is an incoming JSON-RPC 2.0 message.
type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      interface{}     `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

// rpcResponse is an outgoing JSON-RPC 2.0 message.
type rpcResponse struct {
	JSONRPC string      `json:"jsonrpc"`
	ID      interface{} `json:"id,omitempty"`
	Result  interface{} `json:"result,omitempty"`
	Error   *rpcError   `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// Run starts the MCP server, reading from stdin and writing to stdout.
func Run() error {
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	encoder := json.NewEncoder(os.Stdout)

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var req rpcRequest
		if err := json.Unmarshal(line, &req); err != nil {
			writeError(encoder, nil, -32700, "Parse error")
			continue
		}

		// Notifications (no id) do not get a response.
		if req.ID == nil {
			continue
		}

		result, rpcErr := dispatch(req.Method, req.Params)
		if rpcErr != nil {
			_ = encoder.Encode(rpcResponse{
				JSONRPC: "2.0",
				ID:      req.ID,
				Error:   rpcErr,
			})
			continue
		}

		_ = encoder.Encode(rpcResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result:  result,
		})
	}

	return scanner.Err()
}

func writeError(enc *json.Encoder, id interface{}, code int, msg string) {
	_ = enc.Encode(rpcResponse{
		JSONRPC: "2.0",
		ID:      id,
		Error:   &rpcError{Code: code, Message: msg},
	})
}

// dispatch routes a method to the correct handler.
func dispatch(method string, params json.RawMessage) (interface{}, *rpcError) {
	switch method {
	case "initialize":
		return handleInitialize(params)
	case "tools/list":
		return handleToolsList()
	case "tools/call":
		return handleToolsCall(params)
	default:
		return nil, &rpcError{Code: -32601, Message: fmt.Sprintf("Method not found: %s", method)}
	}
}

// ---------------------------------------------------------------------------
// initialize
// ---------------------------------------------------------------------------

func handleInitialize(_ json.RawMessage) (interface{}, *rpcError) {
	return map[string]interface{}{
		"protocolVersion": protocolVersion,
		"capabilities": map[string]interface{}{
			"tools": map[string]interface{}{},
		},
		"serverInfo": map[string]interface{}{
			"name":    "testmesh",
			"version": "1.0.0",
		},
	}, nil
}

// ---------------------------------------------------------------------------
// tools/list
// ---------------------------------------------------------------------------

func handleToolsList() (interface{}, *rpcError) {
	return map[string]interface{}{
		"tools": toolDefinitions(),
	}, nil
}

// toolDefinitions returns the full list of tools this server exposes.
func toolDefinitions() []map[string]interface{} {
	return []map[string]interface{}{
		{
			"name":        "analyze_service",
			"description": "Analyze a service directory (Go, Node.js, Python) and extract HTTP endpoints, database models, Kafka topics, gRPC methods, and environment variables. Use this before generating test flows.",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"path": map[string]interface{}{
						"type":        "string",
						"description": "Absolute or relative path to the service directory to analyze",
					},
				},
				"required": []string{"path"},
			},
		},
		{
			"name":        "generate_flow",
			"description": "Generate a comprehensive E2E test flow YAML for a service. Covers happy-path CRUD, cross-service chaining, Kafka event verification, database state checks, and error scenarios.",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"service_path": map[string]interface{}{
						"type":        "string",
						"description": "Path to the service directory (will be analyzed automatically)",
					},
					"flow_name": map[string]interface{}{
						"type":        "string",
						"description": "Human-readable name for the generated flow",
					},
					"base_url": map[string]interface{}{
						"type":        "string",
						"description": "Base URL of the service under test (e.g. http://localhost:5001). If omitted, inferred from analysis.",
					},
					"db_connection": map[string]interface{}{
						"type":        "string",
						"description": "PostgreSQL connection string for database verification steps (e.g. postgres://root:admin@localhost:5432/postgres?sslmode=disable)",
					},
					"kafka_brokers": map[string]interface{}{
						"type":        "string",
						"description": "Comma-separated Kafka broker addresses for event verification (e.g. localhost:9092)",
					},
					"redis_addr": map[string]interface{}{
						"type":        "string",
						"description": "Redis address for cache verification steps (e.g. localhost:6379)",
					},
					"focus": map[string]interface{}{
						"type":        "string",
						"description": "Optional focus area: 'crud', 'events', 'errors', 'full' (default: full)",
					},
					"output_path": map[string]interface{}{
						"type":        "string",
						"description": "Optional file path to save the generated YAML (e.g. ./flows/user-service.yaml). If omitted, YAML is returned as text only.",
					},
				},
				"required": []string{"service_path"},
			},
		},
		{
			"name":        "run_flow",
			"description": "Execute a TestMesh flow. Accepts either a YAML string or a file path. Returns per-step results with pass/fail status.",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"yaml_content": map[string]interface{}{
						"type":        "string",
						"description": "Flow YAML content as a string",
					},
					"file_path": map[string]interface{}{
						"type":        "string",
						"description": "Path to a .yaml flow file",
					},
				},
			},
		},
		{
			"name":        "validate_flow",
			"description": "Validate a TestMesh flow YAML without executing it. Checks structure, action types, required fields, and template variable references.",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"yaml_content": map[string]interface{}{
						"type":        "string",
						"description": "Flow YAML content as a string",
					},
					"file_path": map[string]interface{}{
						"type":        "string",
						"description": "Path to a .yaml flow file",
					},
				},
			},
		},
		{
			"name":        "list_flows",
			"description": "List existing TestMesh flow YAML files in a directory.",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"directory": map[string]interface{}{
						"type":        "string",
						"description": "Directory path to search for flow files",
					},
				},
				"required": []string{"directory"},
			},
		},
		{
			"name":        "get_action_types",
			"description": "Return all supported TestMesh action types with their required configuration fields. Use this to understand what action types are available when writing or reviewing flows.",
			"inputSchema": map[string]interface{}{
				"type":       "object",
				"properties": map[string]interface{}{},
			},
		},
		{
			"name":        "analyze_workspace",
			"description": "Analyze a directory containing multiple services. Detects all services, their endpoints/models/kafka topics, and cross-service dependencies (HTTP calls and shared Kafka topics). Use this before generate_e2e_flow.",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"directory": map[string]interface{}{
						"type":        "string",
						"description": "Path to directory containing multiple service subdirectories",
					},
				},
				"required": []string{"directory"},
			},
		},
		{
			"name":        "generate_e2e_flow",
			"description": "Generate a cross-service E2E flow that tests inter-service communication. Automatically chains HTTP calls, injects dependency IDs, and verifies Kafka delivery via database polling.",
			"inputSchema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"workspace_path": map[string]interface{}{
						"type":        "string",
						"description": "Path to directory containing multiple services (will be analyzed automatically)",
					},
					"flow_name": map[string]interface{}{
						"type":        "string",
						"description": "Name for the generated flow",
					},
					"db_connection": map[string]interface{}{
						"type":        "string",
						"description": "PostgreSQL connection string for DB verification steps",
					},
					"kafka_brokers": map[string]interface{}{
						"type":        "string",
						"description": "Kafka broker addresses for event verification",
					},
					"redis_addr": map[string]interface{}{
						"type":        "string",
						"description": "Redis address for cache verification steps (e.g. localhost:6379)",
					},
					"service_urls": map[string]interface{}{
						"type":        "object",
						"description": "Optional per-service base URL overrides, e.g. {\"user-service\": \"http://localhost:5001\"}",
					},
					"output_path": map[string]interface{}{
						"type":        "string",
						"description": "Optional file path to save the generated YAML",
					},
					"focus": map[string]interface{}{
						"type":        "string",
						"description": "Focus: 'crud', 'events', 'errors', 'full' (default: full)",
					},
				},
				"required": []string{"workspace_path"},
			},
		},
	}
}
