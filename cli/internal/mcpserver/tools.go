package mcpserver

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/test-mesh/testmesh/internal/plugins"
	"github.com/test-mesh/testmesh/internal/runner"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"go.uber.org/zap"
	"gopkg.in/yaml.v3"
)

// toolContent wraps tool call results in the MCP content format.
func toolContent(text string) map[string]interface{} {
	return map[string]interface{}{
		"content": []map[string]interface{}{
			{"type": "text", "text": text},
		},
	}
}

func toolError(msg string) map[string]interface{} {
	return map[string]interface{}{
		"content": []map[string]interface{}{
			{"type": "text", "text": "ERROR: " + msg},
		},
		"isError": true,
	}
}

// ---------------------------------------------------------------------------
// tools/call dispatcher
// ---------------------------------------------------------------------------

func handleToolsCall(params json.RawMessage) (interface{}, *rpcError) {
	var p struct {
		Name      string                 `json:"name"`
		Arguments map[string]interface{} `json:"arguments"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, &rpcError{Code: -32602, Message: "Invalid params: " + err.Error()}
	}

	switch p.Name {
	case "analyze_service":
		return toolAnalyzeService(p.Arguments)
	case "generate_flow":
		return toolGenerateFlow(p.Arguments)
	case "run_flow":
		return toolRunFlow(p.Arguments)
	case "validate_flow":
		return toolValidateFlow(p.Arguments)
	case "list_flows":
		return toolListFlows(p.Arguments)
	case "get_action_types":
		return toolGetActionTypes()
	case "analyze_workspace":
		return toolAnalyzeWorkspace(p.Arguments)
	case "generate_e2e_flow":
		return toolGenerateE2EFlow(p.Arguments)
	default:
		return nil, &rpcError{Code: -32601, Message: "Unknown tool: " + p.Name}
	}
}

// ---------------------------------------------------------------------------
// analyze_service
// ---------------------------------------------------------------------------

func toolAnalyzeService(args map[string]interface{}) (interface{}, *rpcError) {
	path, _ := args["path"].(string)
	if path == "" {
		return toolError("path is required"), nil
	}

	analysis, err := AnalyzeService(path)
	if err != nil {
		return toolError(err.Error()), nil
	}

	out, err := json.MarshalIndent(analysis, "", "  ")
	if err != nil {
		return toolError("failed to marshal analysis: " + err.Error()), nil
	}

	return toolContent(string(out)), nil
}

// ---------------------------------------------------------------------------
// generate_flow
// ---------------------------------------------------------------------------

func toolGenerateFlow(args map[string]interface{}) (interface{}, *rpcError) {
	servicePath, _ := args["service_path"].(string)
	if servicePath == "" {
		return toolError("service_path is required"), nil
	}

	analysis, err := AnalyzeService(servicePath)
	if err != nil {
		return toolError("failed to analyze service: " + err.Error()), nil
	}

	opts := GenerateFlowOptions{
		FlowName:     strArg(args, "flow_name"),
		BaseURL:      strArg(args, "base_url"),
		DBConnection: strArg(args, "db_connection"),
		KafkaBrokers: strArg(args, "kafka_brokers"),
		RedisAddr:    strArg(args, "redis_addr"),
		Focus:        strArg(args, "focus"),
	}

	generatedYAML := GenerateFlow(analysis, opts)

	outputPath := strArg(args, "output_path")
	var savedMsg string
	if outputPath != "" {
		abs, err := filepath.Abs(outputPath)
		if err != nil {
			return toolError("invalid output_path: " + err.Error()), nil
		}
		if err := os.MkdirAll(filepath.Dir(abs), 0755); err != nil {
			return toolError("failed to create output directory: " + err.Error()), nil
		}
		if err := os.WriteFile(abs, []byte(generatedYAML), 0644); err != nil {
			return toolError("failed to write file: " + err.Error()), nil
		}
		savedMsg = fmt.Sprintf("\nSaved to: %s", abs)
	}

	summary := fmt.Sprintf(
		"Generated flow for %s (%s)\nEndpoints found: %d | Models: %d | Kafka topics: %d%s\n\n---\n\n%s",
		analysis.ServiceName,
		analysis.Language,
		len(analysis.Endpoints),
		len(analysis.Models),
		len(analysis.KafkaTopics),
		savedMsg,
		generatedYAML,
	)

	return toolContent(summary), nil
}

// ---------------------------------------------------------------------------
// run_flow
// ---------------------------------------------------------------------------

func toolRunFlow(args map[string]interface{}) (interface{}, *rpcError) {
	yamlContent, _ := args["yaml_content"].(string)
	filePath, _ := args["file_path"].(string)

	if yamlContent == "" && filePath == "" {
		return toolError("provide yaml_content or file_path"), nil
	}

	if yamlContent == "" {
		data, err := os.ReadFile(filePath)
		if err != nil {
			return toolError("failed to read file: " + err.Error()), nil
		}
		yamlContent = string(data)
	}

	var flowWrapper struct {
		Flow models.FlowDefinition `yaml:"flow"`
	}
	if err := yaml.Unmarshal([]byte(yamlContent), &flowWrapper); err != nil {
		return toolError("invalid YAML: " + err.Error()), nil
	}
	if flowWrapper.Flow.Name == "" {
		return toolError("invalid flow: missing 'flow:' root key or flow.name"), nil
	}

	logger := zap.NewNop()
	registry := plugins.NewRegistry("", logger)
	registry.RegisterAction("redis", plugins.NewRedisNativePlugin(logger))
	registry.RegisterAction("kafka", plugins.NewKafkaNativePlugin(logger))
	registry.RegisterAction("postgresql", plugins.NewPostgreSQLNativePlugin(logger))

	exec := runner.NewExecutor(nil, logger, nil, nil)
	exec.SetPluginRegistry(registry)
	result, err := exec.ExecuteInline(&flowWrapper.Flow, nil)
	if err != nil {
		return toolContent(fmt.Sprintf("Execution error: %v", err)), nil
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Flow: %s\n", flowWrapper.Flow.Name))
	sb.WriteString(fmt.Sprintf("Status: %s\n", result.Status))
	sb.WriteString(fmt.Sprintf("Steps: %d total, %d passed, %d failed\n", result.TotalSteps, result.Passed, result.Failed))
	sb.WriteString(fmt.Sprintf("Duration: %dms\n\n", result.DurationMs))

	for _, s := range result.Steps {
		icon := "✅"
		if s.Status != "passed" {
			icon = "❌"
		}
		sb.WriteString(fmt.Sprintf("%s %s (%s) — %dms\n", icon, s.StepID, s.Action, s.DurationMs))
		if s.Error != "" {
			sb.WriteString(fmt.Sprintf("   Error: %s\n", s.Error))
		}
	}

	if result.Error != "" {
		sb.WriteString(fmt.Sprintf("\nFlow error: %s\n", result.Error))
	}

	return toolContent(sb.String()), nil
}

// ---------------------------------------------------------------------------
// validate_flow
// ---------------------------------------------------------------------------

func toolValidateFlow(args map[string]interface{}) (interface{}, *rpcError) {
	yamlContent, _ := args["yaml_content"].(string)
	filePath, _ := args["file_path"].(string)

	if yamlContent == "" && filePath == "" {
		return toolError("provide yaml_content or file_path"), nil
	}

	if yamlContent == "" {
		data, err := os.ReadFile(filePath)
		if err != nil {
			return toolError("failed to read file: " + err.Error()), nil
		}
		yamlContent = string(data)
	}

	var flowWrapper struct {
		Flow struct {
			Name     string                   `yaml:"name"`
			Steps    []map[string]interface{} `yaml:"steps"`
			Setup    []map[string]interface{} `yaml:"setup"`
			Teardown []map[string]interface{} `yaml:"teardown"`
		} `yaml:"flow"`
	}

	if err := yaml.Unmarshal([]byte(yamlContent), &flowWrapper); err != nil {
		return toolContent(fmt.Sprintf("❌ Invalid YAML: %v", err)), nil
	}

	var raw map[string]interface{}
	_ = yaml.Unmarshal([]byte(yamlContent), &raw)
	if _, hasFlow := raw["flow"]; !hasFlow {
		return toolContent("❌ Missing 'flow:' root key"), nil
	}

	var errs []string
	flow := flowWrapper.Flow

	if flow.Name == "" {
		errs = append(errs, "flow.name is required")
	}
	if len(flow.Steps) == 0 {
		errs = append(errs, "flow.steps must have at least one step")
	}

	validActions := map[string]bool{
		"http_request": true, "database_query": true, "kafka_producer": true, "kafka_consumer": true,
		"delay": true, "log": true, "assert": true, "transform": true, "condition": true,
		"for_each": true, "mock_server_start": true, "mock_server_stop": true,
		"mock_server_configure": true, "contract_generate": true, "contract_verify": true,
		"websocket": true, "grpc": true, "wait_for": true, "db_poll": true, "mcp": true,
	}

	checkSteps := func(steps []map[string]interface{}, phase string) {
		for i, s := range steps {
			action, _ := s["action"].(string)
			if action == "" {
				errs = append(errs, fmt.Sprintf("%s step %d: action is required", phase, i+1))
				continue
			}
			if !validActions[action] {
				errs = append(errs, fmt.Sprintf("%s step %d: unknown action %q", phase, i+1, action))
			}
			id, _ := s["id"].(string)
			if id == "" {
				errs = append(errs, fmt.Sprintf("%s step %d (%s): id is required", phase, i+1, action))
			}
		}
	}

	checkSteps(flow.Setup, "setup")
	checkSteps(flow.Steps, "steps")
	checkSteps(flow.Teardown, "teardown")

	if len(errs) > 0 {
		return toolContent(fmt.Sprintf("❌ Validation failed (%d errors):\n• %s", len(errs), strings.Join(errs, "\n• "))), nil
	}

	return toolContent(fmt.Sprintf("✅ Valid flow: %q\n   %d setup, %d steps, %d teardown",
		flow.Name, len(flow.Setup), len(flow.Steps), len(flow.Teardown))), nil
}

// ---------------------------------------------------------------------------
// list_flows
// ---------------------------------------------------------------------------

func toolListFlows(args map[string]interface{}) (interface{}, *rpcError) {
	dir, _ := args["directory"].(string)
	if dir == "" {
		return toolError("directory is required"), nil
	}

	abs, err := filepath.Abs(dir)
	if err != nil {
		return toolError("invalid path: " + err.Error()), nil
	}

	var flows []string
	_ = filepath.Walk(abs, func(p string, fi os.FileInfo, err error) error {
		if err != nil || fi.IsDir() {
			return nil
		}
		if strings.HasSuffix(p, ".yaml") || strings.HasSuffix(p, ".yml") {
			rel, _ := filepath.Rel(abs, p)
			// Quick check: is it a flow file?
			data, err := os.ReadFile(p)
			if err != nil {
				return nil
			}
			if strings.Contains(string(data), "flow:") {
				flows = append(flows, rel)
			}
		}
		return nil
	})

	if len(flows) == 0 {
		return toolContent(fmt.Sprintf("No flow files found in %s", abs)), nil
	}

	return toolContent(fmt.Sprintf("Found %d flow(s) in %s:\n%s", len(flows), abs, strings.Join(flows, "\n"))), nil
}

// ---------------------------------------------------------------------------
// get_action_types
// ---------------------------------------------------------------------------

func toolGetActionTypes() (interface{}, *rpcError) {
	actions := map[string]interface{}{
		"http_request": map[string]interface{}{
			"description": "Make HTTP requests (GET, POST, PUT, PATCH, DELETE)",
			"required":    []string{"url"},
			"optional":    []string{"method", "headers", "body", "timeout"},
		},
		"database_query": map[string]interface{}{
			"description": "Execute SQL queries against a database",
			"required":    []string{"connection", "query"},
			"optional":    []string{"params"},
		},
		"kafka_producer": map[string]interface{}{
			"description": "Produce a message to a Kafka topic",
			"required":    []string{"brokers", "topic"},
			"optional":    []string{"key", "value", "headers"},
		},
		"kafka_consumer": map[string]interface{}{
			"description": "Consume messages from a Kafka topic",
			"required":    []string{"brokers", "topic"},
			"optional":    []string{"group_id", "timeout", "expected_count", "auto_offset_reset", "from_beginning"},
		},
		"grpc": map[string]interface{}{
			"description": "Make a gRPC call",
			"required":    []string{"host", "method"},
			"optional":    []string{"request", "metadata", "timeout"},
		},
		"websocket": map[string]interface{}{
			"description": "Connect to a WebSocket and send/receive messages",
			"required":    []string{"url"},
			"optional":    []string{"message", "timeout"},
		},
		"delay": map[string]interface{}{
			"description": "Wait for a duration",
			"required":    []string{"duration"},
		},
		"log": map[string]interface{}{
			"description": "Log a message during execution",
			"optional":    []string{"message", "level"},
		},
		"assert": map[string]interface{}{
			"description": "Assert conditions on variables",
			"optional":    []string{"conditions"},
		},
		"transform": map[string]interface{}{
			"description": "Transform data and store in variables",
		},
		"condition": map[string]interface{}{
			"description": "Conditional branching (if/else)",
		},
		"for_each": map[string]interface{}{
			"description": "Loop over an array and execute steps",
		},
		"wait_for": map[string]interface{}{
			"description": "Wait for a condition to become true",
		},
		"db_poll": map[string]interface{}{
			"description": "Poll a database query until condition is met",
			"required":    []string{"connection", "query"},
			"optional":    []string{"interval", "timeout", "condition"},
		},
		"mock_server_start": map[string]interface{}{
			"description": "Start a mock HTTP server",
		},
		"mock_server_stop": map[string]interface{}{
			"description": "Stop a mock HTTP server",
		},
		"mock_server_configure": map[string]interface{}{
			"description": "Configure mock server response rules",
		},
		"mcp": map[string]interface{}{
			"description": "Call an external MCP tool",
			"required":    []string{"server_url", "tool"},
			"optional":    []string{"arguments"},
		},
		// Native plugin actions (prefix-routed to built-in plugins)
		"redis.get": map[string]interface{}{
			"description": "Get a value from Redis by key",
			"required":    []string{"key"},
			"optional":    []string{"host", "port"},
		},
		"redis.set": map[string]interface{}{
			"description": "Set a key in Redis",
			"required":    []string{"key", "value"},
			"optional":    []string{"host", "port", "ttl"},
		},
		"redis.del": map[string]interface{}{
			"description": "Delete a key from Redis",
			"required":    []string{"key"},
			"optional":    []string{"host", "port"},
		},
		"redis.exists": map[string]interface{}{
			"description": "Check if a Redis key exists",
			"required":    []string{"key"},
			"optional":    []string{"host", "port"},
		},
	}

	out, _ := json.MarshalIndent(actions, "", "  ")
	return toolContent(string(out)), nil
}

// ---------------------------------------------------------------------------
// analyze_workspace
// ---------------------------------------------------------------------------

func toolAnalyzeWorkspace(args map[string]interface{}) (interface{}, *rpcError) {
	directory, _ := args["directory"].(string)
	if directory == "" {
		return toolError("directory is required"), nil
	}

	workspace, err := AnalyzeWorkspace(directory)
	if err != nil {
		return toolError(err.Error()), nil
	}

	out, err := json.MarshalIndent(workspace, "", "  ")
	if err != nil {
		return toolError("failed to marshal analysis: " + err.Error()), nil
	}

	summary := fmt.Sprintf("Found %d services, %d dependencies\n\n%s",
		len(workspace.Services), len(workspace.Dependencies), string(out))

	return toolContent(summary), nil
}

// ---------------------------------------------------------------------------
// generate_e2e_flow
// ---------------------------------------------------------------------------

func toolGenerateE2EFlow(args map[string]interface{}) (interface{}, *rpcError) {
	workspacePath, _ := args["workspace_path"].(string)
	if workspacePath == "" {
		return toolError("workspace_path is required"), nil
	}

	workspace, err := AnalyzeWorkspace(workspacePath)
	if err != nil {
		return toolError("failed to analyze workspace: " + err.Error()), nil
	}

	// Convert service_urls from map[string]interface{} to map[string]string.
	var serviceURLs map[string]string
	if raw, ok := args["service_urls"].(map[string]interface{}); ok && len(raw) > 0 {
		serviceURLs = make(map[string]string, len(raw))
		for k, v := range raw {
			if s, ok := v.(string); ok {
				serviceURLs[k] = s
			}
		}
	}

	opts := GenerateFlowOptions{
		FlowName:     strArg(args, "flow_name"),
		DBConnection: strArg(args, "db_connection"),
		KafkaBrokers: strArg(args, "kafka_brokers"),
		RedisAddr:    strArg(args, "redis_addr"),
		Focus:        strArg(args, "focus"),
		ServiceURLs:  serviceURLs,
	}

	generatedYAML := GenerateWorkspaceFlow(workspace, opts)

	outputPath := strArg(args, "output_path")
	var savedMsg string
	if outputPath != "" {
		abs, err := filepath.Abs(outputPath)
		if err != nil {
			return toolError("invalid output_path: " + err.Error()), nil
		}
		if err := os.MkdirAll(filepath.Dir(abs), 0755); err != nil {
			return toolError("failed to create output directory: " + err.Error()), nil
		}
		if err := os.WriteFile(abs, []byte(generatedYAML), 0644); err != nil {
			return toolError("failed to write file: " + err.Error()), nil
		}
		savedMsg = fmt.Sprintf("\nSaved to: %s", abs)
	}

	summary := fmt.Sprintf(
		"Generated E2E flow for workspace %s\nServices: %d | Dependencies: %d%s\n\n---\n\n%s",
		workspace.RootDir,
		len(workspace.Services),
		len(workspace.Dependencies),
		savedMsg,
		generatedYAML,
	)

	return toolContent(summary), nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func strArg(args map[string]interface{}, key string) string {
	v, _ := args[key].(string)
	return v
}
