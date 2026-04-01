package mcpserver

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/test-mesh/testmesh/internal/plugins"
	"github.com/test-mesh/testmesh/internal/runner"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"go.uber.org/zap"
	"gopkg.in/yaml.v3"
)

// defaultPluginDir returns the user-level plugin installation directory.
func defaultPluginDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(os.TempDir(), "testmesh", "plugins")
	}
	return filepath.Join(home, ".testmesh", "plugins")
}

func toolContent(text string) *mcp.CallToolResult {
	return &mcp.CallToolResult{
		Content: []mcp.Content{&mcp.TextContent{Text: text}},
	}
}

func toolError(msg string) *mcp.CallToolResult {
	return &mcp.CallToolResult{
		Content: []mcp.Content{&mcp.TextContent{Text: "ERROR: " + msg}},
		IsError: true,
	}
}

// ---------------------------------------------------------------------------
// analyze_service
// ---------------------------------------------------------------------------

func toolAnalyzeService(args map[string]any) (*mcp.CallToolResult, error) {
	path, _ := args["path"].(string)
	if path == "" {
		return toolError("path is required"), nil
	}

	analysis, err := AnalyzeService(path)
	if err != nil {
		return toolError(err.Error()), nil
	}

	workspace := &WorkspaceAnalysis{
		RootDir:  path,
		Services: []*ServiceAnalysis{analysis},
	}
	opts := AnalysisReportOptions{
		DBConnection: strArg(args, "db_connection"),
		KafkaBrokers: strArg(args, "kafka_brokers"),
		RedisAddr:    strArg(args, "redis_addr"),
	}
	return toolContent(GenerateE2EAnalysisReport(workspace, opts)), nil
}

// ---------------------------------------------------------------------------
// write_flow
// ---------------------------------------------------------------------------

func toolWriteFlow(args map[string]any) (*mcp.CallToolResult, error) {
	path, _ := args["path"].(string)
	content, _ := args["yaml_content"].(string)
	if path == "" {
		return toolError("path is required"), nil
	}
	if content == "" {
		return toolError("yaml_content is required"), nil
	}

	// Basic structural validation before writing.
	var raw map[string]any
	if err := yaml.Unmarshal([]byte(content), &raw); err != nil {
		return toolError("invalid YAML: " + err.Error()), nil
	}
	if _, hasFlow := raw["flow"]; !hasFlow {
		return toolError("missing 'flow:' root key"), nil
	}

	var flowWrapper struct {
		Flow struct {
			Name  string           `yaml:"name"`
			Steps []map[string]any `yaml:"steps"`
		} `yaml:"flow"`
	}
	_ = yaml.Unmarshal([]byte(content), &flowWrapper)
	if flowWrapper.Flow.Name == "" {
		return toolError("flow.name is required"), nil
	}
	if len(flowWrapper.Flow.Steps) == 0 {
		return toolError("flow.steps must have at least one step"), nil
	}

	abs, err := filepath.Abs(path)
	if err != nil {
		return toolError("invalid path: " + err.Error()), nil
	}
	if err := os.MkdirAll(filepath.Dir(abs), 0755); err != nil {
		return toolError("failed to create directory: " + err.Error()), nil
	}
	if err := os.WriteFile(abs, []byte(content), 0644); err != nil {
		return toolError("failed to write file: " + err.Error()), nil
	}

	return toolContent(fmt.Sprintf("✅ Saved %q → %s (%d steps)", flowWrapper.Flow.Name, abs, len(flowWrapper.Flow.Steps))), nil
}

// ---------------------------------------------------------------------------
// run_flow
// ---------------------------------------------------------------------------

func toolRunFlow(args map[string]any) (*mcp.CallToolResult, error) {
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
	pDir := defaultPluginDir()
	registry := plugins.NewRegistry(pDir, logger)
	registry.RegisterAction("redis", plugins.NewRedisNativePlugin(logger))
	registry.RegisterAction("kafka", plugins.NewKafkaNativePlugin(logger))
	registry.RegisterAction("postgresql", plugins.NewPostgreSQLNativePlugin(logger))
	_ = registry.Discover()
	_ = registry.LoadAll()

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

func toolValidateFlow(args map[string]any) (*mcp.CallToolResult, error) {
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
			Steps    []map[string]any `yaml:"steps"`
			Setup    []map[string]any `yaml:"setup"`
			Teardown []map[string]any `yaml:"teardown"`
		} `yaml:"flow"`
	}

	if err := yaml.Unmarshal([]byte(yamlContent), &flowWrapper); err != nil {
		return toolContent(fmt.Sprintf("❌ Invalid YAML: %v", err)), nil
	}

	var raw map[string]any
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

	// defined tracks variables available at each point in execution.
	// Pre-seed with RANDOM_ID which is always available.
	defined := map[string]string{"RANDOM_ID": "built-in"}

	reTemplateVar := regexp.MustCompile(`\{\{(\w+)\}\}`)

	checkSteps := func(steps []map[string]any, phase string) {
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

			// Check that all {{var}} references in config are defined by prior steps.
			if cfg, ok := s["config"]; ok {
				cfgBytes, _ := json.Marshal(cfg)
				for _, m := range reTemplateVar.FindAllStringSubmatch(string(cfgBytes), -1) {
					varName := m[1]
					if _, ok := defined[varName]; !ok {
						errs = append(errs, fmt.Sprintf("%s step %d (%s): uses {{%s}} but it is not captured by any prior step's output", phase, i+1, id, varName))
					}
				}
			}

			// Check assert expressions for basic syntax (must not be empty strings).
			if assertRaw, ok := s["assert"].([]any); ok {
				for j, a := range assertRaw {
					expr, _ := a.(string)
					if strings.TrimSpace(expr) == "" {
						errs = append(errs, fmt.Sprintf("%s step %d (%s): assert[%d] is empty", phase, i+1, id, j))
					}
				}
			}

			// Register variables captured by this step's output block.
			if outputRaw, ok := s["output"].(map[string]any); ok {
				for varName := range outputRaw {
					defined[varName] = fmt.Sprintf("%s.%s", phase, id)
				}
			}
		}
	}

	checkSteps(flow.Setup, "setup")
	checkSteps(flow.Steps, "steps")
	checkSteps(flow.Teardown, "teardown")

	if len(errs) > 0 {
		return toolContent(fmt.Sprintf("❌ Validation failed (%d errors):\n• %s", len(errs), strings.Join(errs, "\n• "))), nil
	}

	var notes []string
	notes = append(notes, fmt.Sprintf("✅ Valid flow: %q", flow.Name))
	notes = append(notes, fmt.Sprintf("   %d setup, %d steps, %d teardown", len(flow.Setup), len(flow.Steps), len(flow.Teardown)))
	if len(defined) > 1 { // more than just RANDOM_ID
		var captured []string
		for k, src := range defined {
			if k != "RANDOM_ID" {
				captured = append(captured, fmt.Sprintf("%s (from %s)", k, src))
			}
		}
		sort.Strings(captured)
		notes = append(notes, fmt.Sprintf("   Captured variables: %s", strings.Join(captured, ", ")))
	}
	return toolContent(strings.Join(notes, "\n")), nil
}

// ---------------------------------------------------------------------------
// read_flow
// ---------------------------------------------------------------------------

func toolReadFlow(args map[string]any) (*mcp.CallToolResult, error) {
	filePath, _ := args["file_path"].(string)
	if filePath == "" {
		return toolError("file_path is required"), nil
	}
	abs, err := filepath.Abs(filePath)
	if err != nil {
		return toolError("invalid path: " + err.Error()), nil
	}
	data, err := os.ReadFile(abs)
	if err != nil {
		return toolError("failed to read file: " + err.Error()), nil
	}
	return toolContent(fmt.Sprintf("# %s\n\n```yaml\n%s\n```", abs, string(data))), nil
}

// ---------------------------------------------------------------------------
// run_step
// ---------------------------------------------------------------------------

func toolRunStep(args map[string]any) (*mcp.CallToolResult, error) {
	action, _ := args["action"].(string)
	if action == "" {
		return toolError("action is required"), nil
	}

	// Build a minimal single-step flow from provided args.
	// config may arrive as map[string]any (object) or as a JSON string.
	var config map[string]any
	switch v := args["config"].(type) {
	case map[string]any:
		config = v
	case string:
		_ = json.Unmarshal([]byte(v), &config)
	}
	assertRaw, _ := args["assert"].([]any)
	var asserts []string
	for _, a := range assertRaw {
		if s, ok := a.(string); ok {
			asserts = append(asserts, s)
		}
	}

	// Inject caller-supplied variables so {{var}} templates resolve.
	var vars map[string]string
	if v, ok := args["vars"].(map[string]any); ok {
		vars = make(map[string]string, len(v))
		for k, val := range v {
			vars[k] = fmt.Sprintf("%v", val)
		}
	}

	step := models.Step{
		ID:     "run_step",
		Action: action,
		Config: config,
		Assert: asserts,
	}
	flow := &models.FlowDefinition{
		Name:  "run_step",
		Steps: []models.Step{step},
	}

	logger := zap.NewNop()
	pDir := defaultPluginDir()
	registry := plugins.NewRegistry(pDir, logger)
	registry.RegisterAction("redis", plugins.NewRedisNativePlugin(logger))
	registry.RegisterAction("kafka", plugins.NewKafkaNativePlugin(logger))
	registry.RegisterAction("postgresql", plugins.NewPostgreSQLNativePlugin(logger))
	_ = registry.Discover()
	_ = registry.LoadAll()

	exec := runner.NewExecutor(nil, logger, nil, nil)
	exec.SetPluginRegistry(registry)
	result, err := exec.ExecuteInline(flow, vars)
	if err != nil {
		return toolContent(fmt.Sprintf("Execution error: %v", err)), nil
	}

	var sb strings.Builder
	if len(result.Steps) == 0 {
		return toolContent("No step result returned"), nil
	}
	sr := result.Steps[0]
	icon := "✅"
	if sr.Status != "passed" {
		icon = "❌"
	}
	sb.WriteString(fmt.Sprintf("%s %s (%s) — %dms\n", icon, sr.StepID, sr.Action, sr.DurationMs))
	if sr.Error != "" {
		sb.WriteString(fmt.Sprintf("\nError: %s\n", sr.Error))
	}
	if len(sr.Output) > 0 {
		out, _ := json.MarshalIndent(sr.Output, "", "  ")
		sb.WriteString(fmt.Sprintf("\nOutput:\n%s\n", string(out)))
	}
	return toolContent(sb.String()), nil
}

// ---------------------------------------------------------------------------
// list_flows
// ---------------------------------------------------------------------------

func toolListFlows(args map[string]any) (*mcp.CallToolResult, error) {
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

func toolGetActionTypes() (*mcp.CallToolResult, error) {
	actions := map[string]any{
		"http_request": map[string]any{
			"description": "Make HTTP requests (GET, POST, PUT, PATCH, DELETE)",
			"required":    []string{"url"},
			"optional":    []string{"method", "headers", "body", "timeout"},
		},
		"database_query": map[string]any{
			"description": "Execute SQL queries against a database",
			"required":    []string{"connection", "query"},
			"optional":    []string{"params"},
		},
		"kafka_producer": map[string]any{
			"description": "Produce a message to a Kafka topic",
			"required":    []string{"brokers", "topic"},
			"optional":    []string{"key", "value", "headers"},
		},
		"kafka_consumer": map[string]any{
			"description": "Consume messages from a Kafka topic",
			"required":    []string{"brokers", "topic"},
			"optional":    []string{"group_id", "timeout", "expected_count", "auto_offset_reset", "from_beginning"},
		},
		"grpc": map[string]any{
			"description": "Make a gRPC call",
			"required":    []string{"host", "method"},
			"optional":    []string{"request", "metadata", "timeout"},
		},
		"websocket": map[string]any{
			"description": "Connect to a WebSocket and send/receive messages",
			"required":    []string{"url"},
			"optional":    []string{"message", "timeout"},
		},
		"delay": map[string]any{
			"description": "Wait for a duration",
			"required":    []string{"duration"},
		},
		"log": map[string]any{
			"description": "Log a message during execution",
			"optional":    []string{"message", "level"},
		},
		"assert": map[string]any{
			"description": "Assert conditions on variables",
			"optional":    []string{"conditions"},
		},
		"transform": map[string]any{
			"description": "Transform data and store in variables",
		},
		"condition": map[string]any{
			"description": "Conditional branching (if/else)",
		},
		"for_each": map[string]any{
			"description": "Loop over an array and execute steps",
		},
		"wait_for": map[string]any{
			"description": "Wait for a condition to become true",
		},
		"db_poll": map[string]any{
			"description": "Poll a database query until condition is met",
			"required":    []string{"connection", "query"},
			"optional":    []string{"interval", "timeout", "condition"},
		},
		"mock_server_start": map[string]any{
			"description": "Start a mock HTTP server",
		},
		"mock_server_stop": map[string]any{
			"description": "Stop a mock HTTP server",
		},
		"mock_server_configure": map[string]any{
			"description": "Configure mock server response rules",
		},
		"mcp": map[string]any{
			"description": "Call an external MCP tool",
			"required":    []string{"server_url", "tool"},
			"optional":    []string{"arguments"},
		},
		// Native plugin actions (prefix-routed to built-in plugins)
		"redis.get": map[string]any{
			"description": "Get a value from Redis by key",
			"required":    []string{"key"},
			"optional":    []string{"host", "port"},
		},
		"redis.set": map[string]any{
			"description": "Set a key in Redis",
			"required":    []string{"key", "value"},
			"optional":    []string{"host", "port", "ttl"},
		},
		"redis.del": map[string]any{
			"description": "Delete a key from Redis",
			"required":    []string{"key"},
			"optional":    []string{"host", "port"},
		},
		"redis.exists": map[string]any{
			"description": "Check if a Redis key exists",
			"required":    []string{"key"},
			"optional":    []string{"host", "port"},
		},
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
	}

	out, _ := json.MarshalIndent(actions, "", "  ")
	return toolContent(string(out)), nil
}

// ---------------------------------------------------------------------------
// analyze_workspace
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// get_yaml_schema
// ---------------------------------------------------------------------------

func toolGetYAMLSchema() (*mcp.CallToolResult, error) {
	schema := `# TestMesh YAML Schema Reference

## Full Flow Structure
` + "```yaml" + `
flow:
  name: "Flow Name"                    # required
  description: "optional description"
  steps:                               # required, at least 1
    - id: step_id                      # required, unique snake_case
      action: action_type              # required
      config:                          # action-specific config
        key: value
      assert:                          # optional list of expressions
        - "status == 200"
      output:                          # optional variable capture
        var_name: "$.body.field"
  setup:                               # optional, runs before steps
    - id: setup_step
      action: log
      config:
        message: "starting"
  teardown:                            # optional, runs after steps
    - id: cleanup
      action: database_query
      config:
        connection: "postgres://..."
        query: "DELETE FROM ..."
` + "```" + `

## Action Types

### http_request
` + "```yaml" + `
- id: create_user
  action: http_request
  config:
    method: POST                       # GET POST PUT PATCH DELETE
    url: "http://localhost:5001/api/v1/users"
    headers:
      Content-Type: "application/json"
      Authorization: "Bearer {{token}}"
    body:                              # for POST/PUT/PATCH only
      name: "Test User"
      email: "test@example.com"
    timeout: "30s"                     # optional default 30s
  assert:
    - "status == 201"
    - "body.id != nil"
    - "body.email == 'test@example.com'"
  output:
    user_id: "$.body.id"              # JSONPath from response
    user_name: "$.body.name"
` + "```" + `
Assert variables: status (int), body (object), headers (map)

### database_query
` + "```yaml" + `
- id: verify_user
  action: database_query
  config:
    connection: "postgres://root:admin@localhost:5432/postgres?sslmode=disable"
    query: "SELECT id, name, email FROM user_service.users WHERE id = '{{user_id}}' LIMIT 1"
    # NOTE: Do NOT use COUNT(*) — use SELECT * so row_count reflects actual row existence
  assert:
    - "row_count == 1"                 # number of rows returned
    - "first_row.name != nil"          # access first row fields
` + "```" + `
Assert variables: row_count (int), rows (array), first_row (map), query_type

### db_poll — wait for async/eventual consistency
` + "```yaml" + `
- id: wait_notification
  action: db_poll
  config:
    connection: "postgres://..."
    query: "SELECT id FROM notification_service.notifications WHERE user_id = '{{user_id}}' LIMIT 1"
    # Query returns rows only when condition is satisfied
    # Polling stops when len(rows) > 0 (no condition field needed)
    interval: "1s"
    timeout: "15s"
` + "```" + `

### kafka_consumer
` + "```yaml" + `
- id: verify_event
  action: kafka_consumer
  config:
    brokers:
      - "localhost:9092"               # list of brokers
    topic: "user.created"
    group_id: "testmesh-e2e-{{RANDOM_ID}}"  # unique per run — prevents reading old messages
    auto_offset_reset: "earliest"
    from_beginning: true              # reads from start of topic for this group
    timeout: "10s"
    count: 1                          # how many messages to wait for
  assert:
    - "len(messages) > 0"
` + "```" + `
Assert variables: messages (array of {value, key, topic, offset})

### redis.get
` + "```yaml" + `
- id: check_cache
  action: redis.get
  config:
    host: "localhost"
    port: "6379"
    key: "user:{{user_id}}"
  assert:
    - "value != nil"
` + "```" + `

### delay
` + "```yaml" + `
- id: wait
  action: delay
  config:
    duration: "2s"
` + "```" + `

### log
` + "```yaml" + `
- id: debug_log
  action: log
  config:
    message: "user_id is {{user_id}}"
    level: "info"
` + "```" + `

## Template Variables
- {{RANDOM_ID}}     — generates a new UUID at runtime (unique per step)
- {{variable_name}} — substituted with captured output from previous steps

## Assertion Expression Syntax
Expressions use Go-like syntax evaluated with expr-lang:
- Comparison: == != < > <= >=
- Logical: && || !
- Null check: != nil, == nil
- String ops: body.status == "pending"
- Arithmetic: body.total > 0
- Array length: len(messages) > 0
- Index access: rows[0].id != nil

## Output Capture (JSONPath)
- $.body.id          → response body field
- $.body.items[0].id → nested array access
- $.status           → status code
`
	return toolContent(schema), nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func strArg(args map[string]any, key string) string {
	v, _ := args[key].(string)
	return v
}

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
		client := newAPIClient(cfg.APIURL)
		workspaces, err := client.ListWorkspaces()
		if err != nil || len(workspaces) == 0 {
			return toolError("workspace_id required (or configure --workspace-id)"), nil
		}
		workspaceID, _ = workspaces[0]["id"].(string)
		if workspaceID == "" {
			return toolError("API returned workspace without id field"), nil
		}
	}

	client := newAPIClient(cfg.APIURL)
	flowID, flowName, err := client.UploadFlow(workspaceID, yamlContent)
	if err != nil {
		return toolError(fmt.Sprintf("upload failed: %v", err)), nil
	}

	return toolContent(fmt.Sprintf("Flow uploaded successfully\n  Name: %s\n  ID:   %s\n  Workspace: %s", flowName, flowID, workspaceID)), nil
}

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
		if workspaceID == "" {
			return toolError("API returned workspace without id field"), nil
		}
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
		if workspaceID == "" {
			return toolError("API returned workspace without id field"), nil
		}
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

	return toolContent(fmt.Sprintf("Execution started\n  Execution ID: %s\n  Flow ID:      %s\n\nUse get_execution with this ID to poll for results.", executionID, flowID)), nil
}

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
		icon := "..."
		switch status {
		case "passed", "completed", "success":
			icon = "PASS"
		case "failed", "error":
			icon = "FAIL"
		}
		sb.WriteString(fmt.Sprintf("Status: [%s] %s\n", icon, status))
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
			icon := "PASS"
			if stepStatus != "passed" && stepStatus != "completed" {
				icon = "FAIL"
			}
			sb.WriteString(fmt.Sprintf("  [%s] %s (%s) — %vms\n", icon, stepID, action, dur))
			if errMsg, _ := step["error"].(string); errMsg != "" {
				sb.WriteString(fmt.Sprintf("     Error: %s\n", errMsg))
			}
		}
	}

	return toolContent(sb.String()), nil
}

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
		if workspaceID == "" {
			return toolError("API returned workspace without id field"), nil
		}
	}

	client := newAPIClient(cfg.APIURL)
	coverage, err := client.GetCoverageGaps(workspaceID)
	if err != nil {
		return toolError(fmt.Sprintf("failed to get coverage gaps: %v", err)), nil
	}

	out, _ := json.MarshalIndent(coverage, "", "  ")
	return toolContent(fmt.Sprintf("Coverage gaps for workspace %s:\n%s", workspaceID, string(out))), nil
}
