package mcpserver

import (
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/test-mesh/testmesh/internal/plugins"
	"github.com/test-mesh/testmesh/internal/runner"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"go.uber.org/zap"
	"gopkg.in/yaml.v3"
)

// ---------------------------------------------------------------------------
// get_testing_guide
// ---------------------------------------------------------------------------

func toolGetTestingGuide() (*mcp.CallToolResult, error) {
	return toolContent(TestingGuideContent()), nil
}

// ---------------------------------------------------------------------------
// generate_test_plan
// ---------------------------------------------------------------------------

func toolGenerateTestPlan(args map[string]any) (*mcp.CallToolResult, error) {
	workspaceDir, _ := args["workspace_dir"].(string)
	if workspaceDir == "" {
		return toolError("workspace_dir is required"), nil
	}

	prompt := strArg(args, "prompt")
	flowsDir := strArg(args, "flows_dir")

	abs, err := filepath.Abs(workspaceDir)
	if err != nil {
		return toolError("invalid workspace_dir: " + err.Error()), nil
	}

	var sb strings.Builder

	// 1. Docker-compose discovery if available
	composePath := ""
	for _, candidate := range []string{
		filepath.Join(abs, "docker-compose.yml"),
		filepath.Join(abs, "docker-compose.yaml"),
		filepath.Join(abs, "docker-compose.services.yml"),
	} {
		if _, err := os.Stat(candidate); err == nil {
			composePath = candidate
			break
		}
	}

	if composePath != "" {
		report, err := DiscoverFromDockerCompose(composePath)
		if err == nil {
			sb.WriteString("# Infrastructure Discovery\n\n")
			sb.WriteString(report)
			sb.WriteString("\n---\n\n")
		}
	}

	// 2. Source analysis
	workspace, err := AnalyzeWorkspace(abs)
	if err != nil {
		if sb.Len() == 0 {
			return toolError("workspace analysis failed: " + err.Error()), nil
		}
	}

	if workspace != nil {
		sb.WriteString("# Service Inventory\n\n")
		sb.WriteString(fmt.Sprintf("Workspace: %s\n", workspace.RootDir))
		sb.WriteString(fmt.Sprintf("Services: %d\n", len(workspace.Services)))
		sb.WriteString(fmt.Sprintf("Dependencies: %d\n\n", len(workspace.Dependencies)))

		totalEndpoints := 0
		for _, svc := range workspace.Services {
			sb.WriteString(fmt.Sprintf("## %s (%s)\n", svc.ServiceName, svc.Language))
			sb.WriteString(fmt.Sprintf("  Base URL: %s\n", svc.BaseURL))
			sb.WriteString(fmt.Sprintf("  Endpoints: %d\n", len(svc.Endpoints)))
			totalEndpoints += len(svc.Endpoints)

			for _, ep := range svc.Endpoints {
				sb.WriteString(fmt.Sprintf("    %s %s\n", ep.Method, ep.Path))
			}

			if len(svc.KafkaTopics) > 0 {
				sb.WriteString(fmt.Sprintf("  Kafka topics: %d\n", len(svc.KafkaTopics)))
				for _, t := range svc.KafkaTopics {
					sb.WriteString(fmt.Sprintf("    %s (%s)\n", t.Name, t.Direction))
				}
			}
			if len(svc.DBSchemas) > 0 {
				sb.WriteString(fmt.Sprintf("  DB schemas: %s\n", strings.Join(svc.DBSchemas, ", ")))
			}
			if len(svc.RedisKeyPatterns) > 0 {
				sb.WriteString(fmt.Sprintf("  Redis keys: %d patterns\n", len(svc.RedisKeyPatterns)))
			}
			if len(svc.InterServiceCalls) > 0 {
				sb.WriteString("  Inter-service calls:\n")
				for _, c := range svc.InterServiceCalls {
					sb.WriteString(fmt.Sprintf("    %s %s → %s\n", c.Method, c.PathTemplate, c.ToService))
				}
			}
			sb.WriteString("\n")
		}

		sb.WriteString(fmt.Sprintf("**Total endpoints discovered: %d**\n\n", totalEndpoints))

		// Dependency graph
		if len(workspace.Dependencies) > 0 {
			sb.WriteString("## Service Dependencies\n\n")
			for _, dep := range workspace.Dependencies {
				sb.WriteString(fmt.Sprintf("  %s → %s (via %s: %s)\n", dep.From, dep.To, dep.Via, dep.Detail))
			}
			sb.WriteString("\n")
		}

		// Coverage assessment
		sb.WriteString(generateCoverageAssessment(workspace))
	}

	// 3. Existing flow coverage
	if flowsDir != "" {
		flowsAbs, err := filepath.Abs(flowsDir)
		if err == nil {
			existing := discoverExistingFlows(flowsAbs)
			if len(existing) > 0 {
				sb.WriteString("\n# Existing Flow Coverage\n\n")
				sb.WriteString(fmt.Sprintf("Found %d existing flow(s):\n", len(existing)))
				for _, ef := range existing {
					sb.WriteString(fmt.Sprintf("  - %s: %s\n", ef.relPath, ef.flowName))
					if len(ef.endpoints) > 0 {
						for _, ep := range ef.endpoints {
							sb.WriteString(fmt.Sprintf("      tests: %s\n", ep))
						}
					}
				}
				sb.WriteString("\n")
			}
		}
	}

	// 4. User prompt context
	if prompt != "" {
		sb.WriteString("# User Requirements\n\n")
		sb.WriteString(prompt)
		sb.WriteString("\n\n")
	}

	// 5. Test plan YAML schema reference
	sb.WriteString("# Test Plan Schema\n\n")
	sb.WriteString("Use this schema to create your test plan YAML:\n\n")
	sb.WriteString("```yaml\n")
	sb.WriteString(`version: "1"
name: "<suite-name>"
generated: "<ISO 8601 timestamp>"
workspace_analysis: "<path to workspace analysis>"

services:
  - name: "<service-name>"
    endpoints_discovered: <int>
    flows:
      - id: "<kebab-case-id>"
        category: happy-path | error-handling | cross-service | edge-case
        priority: critical | high | medium
        action: "<what the flow tests>"
        status: pending
        file: "<relative path to flow YAML>"
        depends_on: ["<flow-id>"]  # optional

summary:
  total_flows: <int>
  by_category: { happy-path: <n>, error-handling: <n>, cross-service: <n>, edge-case: <n> }
  by_priority: { critical: <n>, high: <n>, medium: <n> }
  by_status: { pending: <n> }
`)
	sb.WriteString("```\n\n")
	sb.WriteString("After creating the plan, generate each flow using `generate_flow` for context, then `write_flow` to save, and `validate_flow` to check.\n")

	return toolContent(sb.String()), nil
}

// existingFlow holds metadata about a flow file found on disk.
type existingFlow struct {
	relPath   string
	flowName  string
	endpoints []string // "METHOD /path" strings found in the flow
}

// discoverExistingFlows walks a directory and extracts metadata from flow YAML files.
func discoverExistingFlows(dir string) []existingFlow {
	var flows []existingFlow
	_ = filepath.Walk(dir, func(p string, fi os.FileInfo, err error) error {
		if err != nil || fi.IsDir() {
			return nil
		}
		if !strings.HasSuffix(p, ".yaml") && !strings.HasSuffix(p, ".yml") {
			return nil
		}
		data, err := os.ReadFile(p)
		if err != nil || !strings.Contains(string(data), "flow:") {
			return nil
		}

		var wrapper struct {
			Flow struct {
				Name  string           `yaml:"name"`
				Steps []map[string]any `yaml:"steps"`
			} `yaml:"flow"`
		}
		if yaml.Unmarshal(data, &wrapper) != nil || wrapper.Flow.Name == "" {
			return nil
		}

		rel, _ := filepath.Rel(dir, p)
		ef := existingFlow{
			relPath:  rel,
			flowName: wrapper.Flow.Name,
		}

		// Extract tested endpoints from http_request steps.
		for _, step := range wrapper.Flow.Steps {
			action, _ := step["action"].(string)
			if action != "http_request" {
				continue
			}
			cfg, _ := step["config"].(map[string]any)
			if cfg == nil {
				continue
			}
			method, _ := cfg["method"].(string)
			url, _ := cfg["url"].(string)
			if method != "" && url != "" {
				ef.endpoints = append(ef.endpoints, method+" "+url)
			}
		}

		flows = append(flows, ef)
		return nil
	})
	return flows
}

// ---------------------------------------------------------------------------
// generate_flow
// ---------------------------------------------------------------------------

func toolGenerateFlow(args map[string]any) (*mcp.CallToolResult, error) {
	workspaceDir, _ := args["workspace_dir"].(string)
	if workspaceDir == "" {
		return toolError("workspace_dir is required"), nil
	}
	serviceName, _ := args["service_name"].(string)
	if serviceName == "" {
		return toolError("service_name is required"), nil
	}
	category, _ := args["category"].(string)
	if category == "" {
		return toolError("category is required"), nil
	}
	validCategories := map[string]bool{
		"happy-path": true, "error-handling": true, "cross-service": true, "edge-case": true,
	}
	if !validCategories[category] {
		return toolError("category must be one of: happy-path, error-handling, cross-service, edge-case"), nil
	}
	actionDesc, _ := args["action_description"].(string)
	if actionDesc == "" {
		return toolError("action_description is required"), nil
	}
	siblingDir := strArg(args, "sibling_flows_dir")

	abs, err := filepath.Abs(workspaceDir)
	if err != nil {
		return toolError("invalid workspace_dir: " + err.Error()), nil
	}

	// Analyze workspace to find the target service.
	workspace, err := AnalyzeWorkspace(abs)
	if err != nil {
		return toolError("workspace analysis failed: " + err.Error()), nil
	}

	var targetService *ServiceAnalysis
	for _, svc := range workspace.Services {
		if strings.EqualFold(svc.ServiceName, serviceName) {
			targetService = svc
			break
		}
	}

	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("# Flow Generation Context: %s\n\n", actionDesc))
	sb.WriteString(fmt.Sprintf("**Service:** %s\n", serviceName))
	sb.WriteString(fmt.Sprintf("**Category:** %s\n", category))
	sb.WriteString(fmt.Sprintf("**Action:** %s\n\n", actionDesc))

	// Service-specific details
	if targetService != nil {
		sb.WriteString("## Service Details\n\n")
		sb.WriteString(fmt.Sprintf("Language: %s\n", targetService.Language))
		sb.WriteString(fmt.Sprintf("Base URL: %s\n", targetService.BaseURL))
		sb.WriteString(fmt.Sprintf("Endpoints: %d\n\n", len(targetService.Endpoints)))

		for _, ep := range targetService.Endpoints {
			sb.WriteString(fmt.Sprintf("  %s %s", ep.Method, ep.Path))
			if ep.RequestSchema != nil {
				sb.WriteString(fmt.Sprintf(" → body: %s {", ep.RequestSchema.StructName))
				for i, f := range ep.RequestSchema.Fields {
					if i > 0 {
						sb.WriteString(", ")
					}
					req := ""
					if f.Required {
						req = " (required)"
					}
					sb.WriteString(fmt.Sprintf("%s: %s%s", f.JSONName, f.GoType, req))
				}
				sb.WriteString("}")
			}
			sb.WriteString("\n")
		}

		if len(targetService.DBSchemas) > 0 {
			sb.WriteString(fmt.Sprintf("\nDB schemas: %s\n", strings.Join(targetService.DBSchemas, ", ")))
		}
		if len(targetService.Models) > 0 {
			sb.WriteString("\nDB models:\n")
			for _, m := range targetService.Models {
				table := m.Table
				if table == "" {
					table = "(no table override)"
				}
				sb.WriteString(fmt.Sprintf("  %s → %s  fields: %s\n", m.Name, table, strings.Join(m.Fields, ", ")))
			}
		}
		if len(targetService.KafkaTopics) > 0 {
			sb.WriteString("\nKafka topics:\n")
			for _, t := range targetService.KafkaTopics {
				sb.WriteString(fmt.Sprintf("  %s (%s)\n", t.Name, t.Direction))
				if t.MessageSchema != nil {
					sb.WriteString("    schema: {")
					for i, f := range t.MessageSchema.Fields {
						if i > 0 {
							sb.WriteString(", ")
						}
						sb.WriteString(fmt.Sprintf("%s: %s", f.JSONName, f.GoType))
					}
					sb.WriteString("}\n")
				}
			}
		}
		if len(targetService.RedisKeyPatterns) > 0 {
			sb.WriteString("\nRedis key patterns:\n")
			for _, p := range targetService.RedisKeyPatterns {
				sb.WriteString(fmt.Sprintf("  %s (%s)\n", p.KeyFormat, p.Operation))
			}
		}
		if len(targetService.InterServiceCalls) > 0 {
			sb.WriteString("\nInter-service calls:\n")
			for _, c := range targetService.InterServiceCalls {
				sb.WriteString(fmt.Sprintf("  %s %s → %s\n", c.Method, c.PathTemplate, c.ToService))
			}
		}
		sb.WriteString("\n")
	} else {
		sb.WriteString(fmt.Sprintf("## Note\n\nService %q not found in workspace analysis. Available services:\n", serviceName))
		if workspace != nil {
			for _, svc := range workspace.Services {
				sb.WriteString(fmt.Sprintf("  - %s\n", svc.ServiceName))
			}
		}
		sb.WriteString("\nThis may be a cross-service (e2e) flow. Use information from all services as needed.\n\n")
	}

	// Category-specific guidance from the testing guide
	sb.WriteString("## Category Guidance\n\n")
	switch category {
	case "happy-path":
		sb.WriteString(`Write a flow that exercises the standard success path:
- Use valid input data for all required fields
- Assert successful status codes (200, 201)
- Assert response body contains expected fields and values
- Verify side effects: database records created, Kafka events published, cache updated
- Capture IDs via output blocks for use in verification steps
- Include setup/teardown to ensure idempotency
`)
	case "error-handling":
		sb.WriteString(`Write a flow that verifies proper error responses:
- Test missing required fields → expect 400
- Test invalid field values → expect 400
- Test not-found resources → expect 404 (use zero UUID: 00000000-0000-0000-0000-000000000000)
- Test unauthorized access → expect 401/403
- Assert error response includes meaningful error message
- No setup/teardown typically needed for error cases
`)
	case "cross-service":
		sb.WriteString(`Write a flow that spans multiple services:
- Create prerequisite data in upstream services first (user, product)
- Chain IDs using output/{{variable}} between steps
- Verify the full journey: HTTP responses → Kafka events → DB state → notifications
- Use db_poll for async verification instead of fixed delays
- Include comprehensive setup that cleans in reverse dependency order
- This flow likely depends on other flows existing first
`)
	case "edge-case":
		sb.WriteString(`Write a flow that tests edge conditions:
- Idempotency: send same request twice, verify no duplicates
- Concurrency: multiple writes to same resource
- Boundary values: empty strings, zero values, max lengths
- Timeout handling: slow responses, connection issues
- State transitions: verify invalid transitions are rejected
`)
	}

	// Sibling flow summaries for naming/convention consistency
	if siblingDir != "" {
		siblings := loadSiblingFlows(siblingDir, 3)
		if len(siblings) > 0 {
			sb.WriteString("\n## Sibling Flow Examples\n\n")
			sb.WriteString("Follow these existing flows for naming and convention consistency:\n\n")
			for _, s := range siblings {
				sb.WriteString(fmt.Sprintf("### %s\n```yaml\n%s\n```\n\n", s.name, s.summary))
			}
		}
	}

	// YAML schema excerpt
	sb.WriteString("## YAML Schema Quick Reference\n\n")
	sb.WriteString("```yaml\nflow:\n  name: \"Flow Name\"\n  setup: []     # optional cleanup steps\n  steps:\n    - id: step_id\n      action: http_request | database_query | kafka_consumer | db_poll | delay | log\n      config: { ... }\n      assert: [\"expr\"]\n      output: { var: \"$.body.field\" }\n  teardown: []  # optional restore steps\n```\n\n")
	sb.WriteString("After writing the flow YAML, call `write_flow` to save it, then `validate_flow` to check it.\n")

	return toolContent(sb.String()), nil
}

// siblingFlow holds a summary of an existing flow file.
type siblingFlow struct {
	name    string
	summary string // abbreviated YAML showing structure
}

// loadSiblingFlows reads up to maxCount sibling flows and returns summaries.
func loadSiblingFlows(dir string, maxCount int) []siblingFlow {
	var siblings []siblingFlow
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}

	for _, entry := range entries {
		if len(siblings) >= maxCount {
			break
		}
		if entry.IsDir() || (!strings.HasSuffix(entry.Name(), ".yaml") && !strings.HasSuffix(entry.Name(), ".yml")) {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil || !strings.Contains(string(data), "flow:") {
			continue
		}

		// Truncate to first 40 lines for summary.
		lines := strings.Split(string(data), "\n")
		if len(lines) > 40 {
			lines = append(lines[:40], "# ... (truncated)")
		}

		siblings = append(siblings, siblingFlow{
			name:    entry.Name(),
			summary: strings.Join(lines, "\n"),
		})
	}
	return siblings
}

// ---------------------------------------------------------------------------
// run_suite
// ---------------------------------------------------------------------------

func toolRunSuite(args map[string]any) (*mcp.CallToolResult, error) {
	path, _ := args["path"].(string)
	if path == "" {
		return toolError("path is required"), nil
	}

	tier := 1
	if t, ok := args["tier"].(float64); ok && t >= 1 && t <= 4 {
		tier = int(t)
	}

	abs, err := filepath.Abs(path)
	if err != nil {
		return toolError("invalid path: " + err.Error()), nil
	}

	// Discover flow files.
	flowFiles, err := discoverFlowFiles(abs)
	if err != nil {
		return toolError(err.Error()), nil
	}
	if len(flowFiles) == 0 {
		return toolContent(fmt.Sprintf("No flow files found at %s", abs)), nil
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("# Suite Execution Report\n\n"))
	sb.WriteString(fmt.Sprintf("Path: %s\n", abs))
	sb.WriteString(fmt.Sprintf("Tier: %d\n", tier))
	sb.WriteString(fmt.Sprintf("Flows discovered: %d\n\n", len(flowFiles)))

	type flowResult struct {
		file       string
		name       string
		tier1Pass  bool
		tier1Errs  []string
		tier2Pass  bool
		tier2Errs  []string
		tier3Pass  bool
		tier3Err   string
		tier4Pass  bool
		tier4Err   string
		stepCount  int
		passed     int
		failed     int
		durationMs int64
	}

	results := make([]flowResult, len(flowFiles))

	// Parse all flows and run tier 1 (structural validation).
	for i, file := range flowFiles {
		results[i].file = file

		data, err := os.ReadFile(file)
		if err != nil {
			results[i].tier1Errs = append(results[i].tier1Errs, "failed to read: "+err.Error())
			continue
		}

		// Validate structurally using the same logic as toolValidateFlow.
		valResult, _ := toolValidateFlow(map[string]any{"yaml_content": string(data)})
		valText := ""
		if valResult != nil && len(valResult.Content) > 0 {
			if tc, ok := valResult.Content[0].(*mcp.TextContent); ok {
				valText = tc.Text
			}
		}

		// Extract flow name.
		var wrapper struct {
			Flow struct {
				Name string `yaml:"name"`
			} `yaml:"flow"`
		}
		_ = yaml.Unmarshal(data, &wrapper)
		results[i].name = wrapper.Flow.Name

		if strings.HasPrefix(valText, "✅") {
			results[i].tier1Pass = true
		} else {
			results[i].tier1Pass = false
			// Parse errors from the validation text.
			for _, line := range strings.Split(valText, "\n") {
				line = strings.TrimSpace(line)
				if strings.HasPrefix(line, "•") || strings.HasPrefix(line, "❌") {
					results[i].tier1Errs = append(results[i].tier1Errs, strings.TrimPrefix(strings.TrimPrefix(line, "•"), "❌"))
				}
			}
			if len(results[i].tier1Errs) == 0 && valText != "" {
				results[i].tier1Errs = append(results[i].tier1Errs, valText)
			}
		}
	}

	// Tier 2: Connectivity probes — extract unique infra targets from all flows,
	// probe each once, then mark flows pass/fail based on which targets they need.
	if tier >= 2 {
		// Parse all valid flows to extract infra targets.
		type parsedFlow struct {
			def  models.FlowDefinition
			data []byte
		}
		parsed := make(map[int]*parsedFlow)
		for i, file := range flowFiles {
			if !results[i].tier1Pass {
				continue
			}
			data, err := os.ReadFile(file)
			if err != nil {
				continue
			}
			var fw struct {
				Flow models.FlowDefinition `yaml:"flow"`
			}
			if err := yaml.Unmarshal(data, &fw); err != nil {
				continue
			}
			parsed[i] = &parsedFlow{def: fw.Flow, data: data}
		}

		// Collect unique targets across all flows.
		httpTargets := map[string]bool{}   // base URL → seen
		pgTargets := map[string]bool{}     // connection string → seen
		kafkaTargets := map[string]bool{}  // broker address → seen
		redisTargets := map[string]bool{}  // host:port → seen

		// Which targets does each flow need?
		flowNeeds := make(map[int]*flowTargets)

		for i, pf := range parsed {
			ft := &flowTargets{}
			allSteps := append(append(pf.def.Setup, pf.def.Steps...), pf.def.Teardown...)
			for _, step := range allSteps {
				extractInfraTargets(step, pf.def.Env, ft, httpTargets, pgTargets, kafkaTargets, redisTargets)
			}
			flowNeeds[i] = ft
		}

		// Probe all unique targets.
		probeResults := map[string]string{} // target → "" (pass) or error message

		// HTTP health probes.
		probeClient := &http.Client{Timeout: 3 * time.Second}
		for baseURL := range httpTargets {
			probeResults[baseURL] = probeHTTPHealth(probeClient, baseURL)
		}

		// PostgreSQL probes via embedded executor.
		for conn := range pgTargets {
			probeResults["pg:"+conn] = probePostgreSQL(conn)
		}

		// Kafka probes via embedded executor.
		for broker := range kafkaTargets {
			probeResults["kafka:"+broker] = probeKafka(broker)
		}

		// Redis probes via embedded executor.
		for addr := range redisTargets {
			probeResults["redis:"+addr] = probeRedis(addr)
		}

		// Map probe results back to flows.
		for i, ft := range flowNeeds {
			var errs []string
			for _, u := range ft.httpURLs {
				if msg := probeResults[u]; msg != "" {
					errs = append(errs, fmt.Sprintf("HTTP %s: %s", u, msg))
				}
			}
			for _, c := range ft.pgConns {
				if msg := probeResults["pg:"+c]; msg != "" {
					errs = append(errs, fmt.Sprintf("PostgreSQL: %s", msg))
				}
			}
			for _, b := range ft.kafkaBrkrs {
				if msg := probeResults["kafka:"+b]; msg != "" {
					errs = append(errs, fmt.Sprintf("Kafka %s: %s", b, msg))
				}
			}
			for _, a := range ft.redisAddrs {
				if msg := probeResults["redis:"+a]; msg != "" {
					errs = append(errs, fmt.Sprintf("Redis %s: %s", a, msg))
				}
			}
			if len(errs) > 0 {
				results[i].tier2Errs = errs
			} else {
				results[i].tier2Pass = true
			}
		}
	}

	// Tier 3: Setup-only execution
	if tier >= 3 {
		for i, file := range flowFiles {
			if !results[i].tier1Pass {
				continue
			}
			data, _ := os.ReadFile(file)
			var flowWrapper struct {
				Flow models.FlowDefinition `yaml:"flow"`
			}
			if err := yaml.Unmarshal(data, &flowWrapper); err != nil {
				results[i].tier3Err = "parse error: " + err.Error()
				continue
			}
			if len(flowWrapper.Flow.Setup) == 0 {
				results[i].tier3Pass = true
				continue
			}

			// Execute only setup steps.
			setupFlow := &models.FlowDefinition{
				Name:  flowWrapper.Flow.Name + " (setup only)",
				Env:   flowWrapper.Flow.Env,
				Steps: flowWrapper.Flow.Setup,
			}

			result, err := executeFlow(setupFlow)
			if err != nil {
				results[i].tier3Err = err.Error()
				continue
			}
			if result.Status == "passed" {
				results[i].tier3Pass = true
			} else {
				results[i].tier3Err = result.Error
				if results[i].tier3Err == "" && result.Failed > 0 {
					for _, s := range result.Steps {
						if s.Status != "passed" && s.Error != "" {
							results[i].tier3Err = fmt.Sprintf("step %s: %s", s.StepID, s.Error)
							break
						}
					}
				}
			}
		}
	}

	// Tier 4: Full execution
	if tier >= 4 {
		for i, file := range flowFiles {
			if !results[i].tier1Pass {
				continue
			}
			data, _ := os.ReadFile(file)
			var flowWrapper struct {
				Flow models.FlowDefinition `yaml:"flow"`
			}
			if err := yaml.Unmarshal(data, &flowWrapper); err != nil {
				results[i].tier4Err = "parse error: " + err.Error()
				continue
			}

			result, err := executeFlow(&flowWrapper.Flow)
			if err != nil {
				results[i].tier4Err = err.Error()
				continue
			}

			results[i].stepCount = result.TotalSteps
			results[i].passed = result.Passed
			results[i].failed = result.Failed
			results[i].durationMs = result.DurationMs

			if result.Status == "passed" {
				results[i].tier4Pass = true
			} else {
				results[i].tier4Err = result.Error
				if results[i].tier4Err == "" && result.Failed > 0 {
					for _, s := range result.Steps {
						if s.Status != "passed" && s.Error != "" {
							cat, hint := categorizeFailure(s.Error, s.Action)
							results[i].tier4Err = fmt.Sprintf("step %s: %s [%s] — %s", s.StepID, s.Error, cat, hint)
							break
						}
					}
				}
			}
		}
	}

	// Build report.
	totalPass := 0
	totalFail := 0

	sb.WriteString("## Results\n\n")
	for _, r := range results {
		rel, _ := filepath.Rel(abs, r.file)
		if rel == "" {
			rel = r.file
		}
		name := r.name
		if name == "" {
			name = rel
		}

		// Tier 1
		if r.tier1Pass {
			sb.WriteString(fmt.Sprintf("### ✅ %s\n", name))
			sb.WriteString(fmt.Sprintf("  File: %s\n", rel))
			sb.WriteString("  Tier 1 (Structural): PASS\n")
		} else {
			sb.WriteString(fmt.Sprintf("### ❌ %s\n", name))
			sb.WriteString(fmt.Sprintf("  File: %s\n", rel))
			sb.WriteString("  Tier 1 (Structural): FAIL\n")
			for _, e := range r.tier1Errs {
				errMsg := strings.TrimSpace(e)
				cat, hint := categorizeFailure(errMsg, "")
				sb.WriteString(fmt.Sprintf("    - %s [%s]\n      Hint: %s\n", errMsg, cat, hint))
			}
			totalFail++
			sb.WriteString("\n")
			continue
		}

		// Tier 2
		if tier >= 2 {
			if r.tier2Pass {
				sb.WriteString("  Tier 2 (Connectivity): PASS\n")
			} else if len(r.tier2Errs) > 0 {
				sb.WriteString("  Tier 2 (Connectivity): FAIL\n")
				for _, e := range r.tier2Errs {
					sb.WriteString(fmt.Sprintf("    - %s\n", e))
				}
				sb.WriteString("    Hint: Check that all target services and infrastructure are running\n")
			}
		}

		// Tier 3
		if tier >= 3 {
			if r.tier3Pass {
				sb.WriteString("  Tier 3 (Setup): PASS\n")
			} else if r.tier3Err != "" {
				cat, hint := categorizeFailure(r.tier3Err, "")
				sb.WriteString(fmt.Sprintf("  Tier 3 (Setup): FAIL — %s [%s]\n    Hint: %s\n", r.tier3Err, cat, hint))
			}
		}

		// Tier 4
		if tier >= 4 {
			if r.tier4Pass {
				sb.WriteString(fmt.Sprintf("  Tier 4 (Full): PASS — %d steps, %dms\n", r.stepCount, r.durationMs))
				totalPass++
			} else if r.tier4Err != "" {
				sb.WriteString(fmt.Sprintf("  Tier 4 (Full): FAIL — %d/%d steps passed, %dms\n", r.passed, r.stepCount, r.durationMs))
				sb.WriteString(fmt.Sprintf("    %s\n", r.tier4Err))
				totalFail++
			} else {
				totalPass++
			}
		} else {
			totalPass++
		}

		sb.WriteString("\n")
	}

	// Summary
	sb.WriteString("## Summary\n\n")
	sb.WriteString(fmt.Sprintf("Total: %d flows\n", len(results)))
	sb.WriteString(fmt.Sprintf("Passed: %d\n", totalPass))
	sb.WriteString(fmt.Sprintf("Failed: %d\n", totalFail))

	return toolContent(sb.String()), nil
}

// discoverFlowFiles finds all flow YAML files at the given path.
// If path is a directory, walks for .yaml files containing "flow:".
// If path is a test plan YAML (contains version: "1"), extracts flow file paths from it.
func discoverFlowFiles(path string) ([]string, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("path not found: %w", err)
	}

	if !info.IsDir() {
		// Check if it's a test plan YAML.
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("failed to read: %w", err)
		}

		var plan struct {
			Version  string `yaml:"version"`
			Services []struct {
				Flows []struct {
					File string `yaml:"file"`
				} `yaml:"flows"`
			} `yaml:"services"`
		}
		if err := yaml.Unmarshal(data, &plan); err == nil && plan.Version == "1" {
			// It's a test plan — extract flow file paths.
			dir := filepath.Dir(path)
			var files []string
			for _, svc := range plan.Services {
				for _, f := range svc.Flows {
					if f.File != "" {
						flowPath := f.File
						if !filepath.IsAbs(flowPath) {
							flowPath = filepath.Join(dir, flowPath)
						}
						if _, err := os.Stat(flowPath); err == nil {
							files = append(files, flowPath)
						}
					}
				}
			}
			return files, nil
		}

		// Single flow file.
		if strings.Contains(string(data), "flow:") {
			return []string{path}, nil
		}
		return nil, fmt.Errorf("file does not appear to be a flow or test plan: %s", path)
	}

	// Directory — walk for flow files.
	var files []string
	_ = filepath.Walk(path, func(p string, fi os.FileInfo, err error) error {
		if err != nil || fi.IsDir() {
			return nil
		}
		if !strings.HasSuffix(p, ".yaml") && !strings.HasSuffix(p, ".yml") {
			return nil
		}
		data, err := os.ReadFile(p)
		if err != nil {
			return nil
		}
		if strings.Contains(string(data), "flow:") {
			files = append(files, p)
		}
		return nil
	})
	return files, nil
}

// executeFlow creates an embedded executor and runs a flow definition.
func executeFlow(flow *models.FlowDefinition) (*runner.InlineResult, error) {
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
	return exec.ExecuteInline(flow, nil)
}

// ---------------------------------------------------------------------------
// categorizeFailure classifies an error string into a category and repair hint.
// ---------------------------------------------------------------------------

func categorizeFailure(errMsg string, action string) (category, hint string) {
	lower := strings.ToLower(errMsg)

	switch {
	case strings.Contains(lower, "timeout") || strings.Contains(lower, "timed out") ||
		strings.Contains(lower, "deadline exceeded"):
		return "timing", "Increase the timeout/delay duration, or switch from delay to db_poll for more reliable async verification"

	case strings.Contains(lower, "connection refused") || strings.Contains(lower, "no such host") ||
		strings.Contains(lower, "dial tcp") || strings.Contains(lower, "connect:") ||
		strings.Contains(lower, "no route to host"):
		return "connectivity", "Check that the target service is running and accessible at the configured URL/host"

	case strings.Contains(lower, "assertion failed") || strings.Contains(lower, "assert") ||
		strings.Contains(lower, "expected") || strings.Contains(lower, "got"):
		return "assertion", "Check that expected values match the actual service response — the API may return different field names or values"

	case strings.Contains(lower, "not captured") || strings.Contains(lower, "undefined") ||
		strings.Contains(lower, "{{"):
		return "variable", "Add an output block to the prior step that captures the required variable: output: { var_name: \"$.body.field\" }"

	case strings.Contains(lower, "unknown action") || strings.Contains(lower, "unsupported action"):
		return "action", "Check the action type is valid — use get_action_types to see all supported actions"

	case strings.Contains(lower, "yaml") || strings.Contains(lower, "unmarshal") ||
		strings.Contains(lower, "parse"):
		return "syntax", "Fix the YAML syntax — check indentation, quoting, and field names"

	default:
		return "unknown", "Inspect the error details and check service logs for more context"
	}
}

// ---------------------------------------------------------------------------
// generateCoverageAssessment estimates the number of flows needed per service.
// ---------------------------------------------------------------------------

func generateCoverageAssessment(workspace *WorkspaceAnalysis) string {
	if workspace == nil || len(workspace.Services) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString("# Recommended Coverage Assessment\n\n")

	totalEndpoints := 0
	totalFlows := 0

	type serviceEstimate struct {
		name       string
		endpoints  int
		happyPath  int
		errorCases int
		edgeCases  int
		total      int
	}
	var estimates []serviceEstimate

	for _, svc := range workspace.Services {
		est := serviceEstimate{
			name:      svc.ServiceName,
			endpoints: len(svc.Endpoints),
		}
		totalEndpoints += len(svc.Endpoints)

		for _, ep := range svc.Endpoints {
			switch ep.Method {
			case "POST":
				est.happyPath++   // create happy path
				est.errorCases++  // validation error (missing fields → 400)
				est.edgeCases++   // idempotency (duplicate → 409)
			case "GET":
				est.happyPath++   // get happy path
				if len(ep.PathParams) > 0 {
					est.errorCases++ // not-found → 404
				}
			case "PUT", "PATCH":
				est.happyPath++   // update happy path
				est.errorCases++  // validation error
				est.edgeCases++   // concurrent update
			case "DELETE":
				est.happyPath++   // delete happy path
				est.errorCases++  // not-found → 404
			default:
				est.happyPath++
			}
		}

		est.total = est.happyPath + est.errorCases + est.edgeCases
		totalFlows += est.total
		estimates = append(estimates, est)
	}

	// Cross-service flows from dependency count.
	crossServiceFlows := len(workspace.Dependencies)
	if crossServiceFlows > 0 {
		totalFlows += crossServiceFlows
	}

	for _, est := range estimates {
		sb.WriteString(fmt.Sprintf("## %s (%d endpoints)\n", est.name, est.endpoints))
		sb.WriteString(fmt.Sprintf("  Happy path: %d flows\n", est.happyPath))
		sb.WriteString(fmt.Sprintf("  Error handling: %d flows\n", est.errorCases))
		sb.WriteString(fmt.Sprintf("  Edge cases: %d flows\n", est.edgeCases))
		sb.WriteString(fmt.Sprintf("  **Subtotal: %d flows**\n\n", est.total))
	}

	if crossServiceFlows > 0 {
		sb.WriteString(fmt.Sprintf("## Cross-Service (e2e)\n"))
		sb.WriteString(fmt.Sprintf("  Cross-service journeys: %d flows (from %d inter-service dependencies)\n\n", crossServiceFlows, len(workspace.Dependencies)))
	}

	sb.WriteString(fmt.Sprintf("**Total recommended: ~%d flows across %d services and %d endpoints**\n\n", totalFlows, len(workspace.Services), totalEndpoints))

	return sb.String()
}

// ---------------------------------------------------------------------------
// repairHint returns a context-aware repair hint for a validation error.
// ---------------------------------------------------------------------------

func repairHint(errMsg string, step map[string]any) string {
	lower := strings.ToLower(errMsg)

	// Missing variable reference.
	if strings.Contains(lower, "{{") && strings.Contains(lower, "not captured") {
		return "Add an output block to a prior step that captures this variable: output: { var_name: \"$.body.field\" }"
	}

	// Unknown action.
	if strings.Contains(lower, "unknown action") {
		action, _ := step["action"].(string)
		suggestions := suggestSimilarActions(action)
		if suggestions != "" {
			return fmt.Sprintf("Unknown action %q. Did you mean: %s?", action, suggestions)
		}
		return "Check action type — use get_action_types to see all supported actions"
	}

	// Missing id.
	if strings.Contains(lower, "id is required") {
		return "Each step requires a unique 'id' field with a snake_case identifier"
	}

	// row_count with http_request.
	if strings.Contains(lower, "row_count") {
		action, _ := step["action"].(string)
		if action == "http_request" {
			return "Use len(body.items) for HTTP responses; row_count is for database_query actions"
		}
	}

	// Default to categorized hint.
	_, hint := categorizeFailure(errMsg, "")
	return hint
}

// suggestSimilarActions returns a comma-separated list of valid actions similar to the given one.
func suggestSimilarActions(action string) string {
	validActions := []string{
		"http_request", "database_query", "kafka_producer", "kafka_consumer",
		"delay", "log", "assert", "transform", "condition", "for_each",
		"mock_server_start", "mock_server_stop", "mock_server_configure",
		"contract_generate", "contract_verify", "websocket", "grpc",
		"wait_for", "db_poll", "mcp",
	}

	lower := strings.ToLower(action)
	var similar []string
	for _, valid := range validActions {
		// Simple substring match for suggestions.
		if strings.Contains(valid, lower) || strings.Contains(lower, strings.Split(valid, "_")[0]) {
			similar = append(similar, valid)
		}
	}
	if len(similar) > 3 {
		similar = similar[:3]
	}
	return strings.Join(similar, ", ")
}

// ---------------------------------------------------------------------------
// Tier 2: Infrastructure target extraction and connectivity probing
// ---------------------------------------------------------------------------

// reEnvRef matches ${VAR} or ${VAR:-default} references in flow configs.
var reEnvRef = regexp.MustCompile(`\$\{([^}:]+)(?::-([^}]*))?\}`)

// resolveFlowEnv resolves a string that may contain ${VAR} references using the flow's env map.
func resolveFlowEnv(s string, env map[string]interface{}) string {
	return reEnvRef.ReplaceAllStringFunc(s, func(match string) string {
		m := reEnvRef.FindStringSubmatch(match)
		if m == nil {
			return match
		}
		varName := m[1]
		defaultVal := m[2]
		if v, ok := env[varName]; ok {
			return fmt.Sprintf("%v", v)
		}
		if defaultVal != "" {
			return defaultVal
		}
		return match
	})
}

// extractBaseURL extracts the scheme+host+port from a URL string.
func extractBaseURL(rawURL string) string {
	// Skip template variables — can't probe {{var}}-based URLs.
	if strings.Contains(rawURL, "{{") {
		return ""
	}
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Host == "" {
		return ""
	}
	return parsed.Scheme + "://" + parsed.Host
}

// extractInfraTargets extracts infrastructure targets (HTTP URLs, PG connections,
// Kafka brokers, Redis addresses) from a single flow step and its env map.
// It populates both the per-flow targets (ft) and the global dedup sets.
type flowTargets struct {
	httpURLs   []string
	pgConns    []string
	kafkaBrkrs []string
	redisAddrs []string
}

func extractInfraTargets(
	step models.Step,
	env map[string]interface{},
	ft *flowTargets,
	httpSet, pgSet, kafkaSet, redisSet map[string]bool,
) {
	cfg := step.Config
	if cfg == nil {
		return
	}

	switch step.Action {
	case "http_request":
		rawURL, _ := cfg["url"].(string)
		rawURL = resolveFlowEnv(rawURL, env)
		base := extractBaseURL(rawURL)
		if base != "" && !httpSet[base] {
			httpSet[base] = true
			ft.httpURLs = append(ft.httpURLs, base)
		}

	case "database_query", "db_poll":
		conn, _ := cfg["connection"].(string)
		conn = resolveFlowEnv(conn, env)
		if conn != "" && !strings.Contains(conn, "{{") && !pgSet[conn] {
			pgSet[conn] = true
			ft.pgConns = append(ft.pgConns, conn)
		}

	case "kafka_producer", "kafka_consumer":
		var brokers []string
		switch b := cfg["brokers"].(type) {
		case string:
			b = resolveFlowEnv(b, env)
			brokers = strings.Split(b, ",")
		case []interface{}:
			for _, item := range b {
				if s, ok := item.(string); ok {
					brokers = append(brokers, resolveFlowEnv(s, env))
				}
			}
		}
		for _, broker := range brokers {
			broker = strings.TrimSpace(broker)
			if broker != "" && !strings.Contains(broker, "{{") && !kafkaSet[broker] {
				kafkaSet[broker] = true
				ft.kafkaBrkrs = append(ft.kafkaBrkrs, broker)
			}
		}

	default:
		// Check for redis.* actions.
		if strings.HasPrefix(step.Action, "redis.") {
			host, _ := cfg["host"].(string)
			port, _ := cfg["port"].(string)
			host = resolveFlowEnv(host, env)
			port = resolveFlowEnv(port, env)
			if host == "" {
				host = "localhost"
			}
			if port == "" {
				port = "6379"
			}
			addr := host + ":" + port
			if !strings.Contains(addr, "{{") && !redisSet[addr] {
				redisSet[addr] = true
				ft.redisAddrs = append(ft.redisAddrs, addr)
			}
		}
	}
}

// probeHTTPHealth tries health endpoints on a base URL.
// Returns "" on success, or an error message.
func probeHTTPHealth(client *http.Client, baseURL string) string {
	for _, path := range healthProbes {
		resp, err := client.Get(baseURL + path)
		if err != nil {
			continue
		}
		resp.Body.Close()
		if resp.StatusCode < 500 {
			return "" // reachable
		}
	}
	// Also try the base URL itself.
	resp, err := client.Get(baseURL + "/")
	if err != nil {
		return "connection refused or unreachable"
	}
	resp.Body.Close()
	if resp.StatusCode < 500 {
		return ""
	}
	return fmt.Sprintf("all health probes returned 5xx (last: %d)", resp.StatusCode)
}

// probePostgreSQL tests a PostgreSQL connection by running SELECT 1.
func probePostgreSQL(connStr string) string {
	flow := &models.FlowDefinition{
		Name: "pg-probe",
		Steps: []models.Step{{
			ID:     "probe",
			Action: "database_query",
			Config: map[string]interface{}{
				"connection": connStr,
				"query":      "SELECT 1",
			},
		}},
	}
	result, err := executeFlow(flow)
	if err != nil {
		return err.Error()
	}
	if result.Status != "passed" {
		if len(result.Steps) > 0 && result.Steps[0].Error != "" {
			return result.Steps[0].Error
		}
		return "probe failed"
	}
	return ""
}

// probeKafka tests Kafka broker connectivity using a consumer with a short timeout.
func probeKafka(broker string) string {
	flow := &models.FlowDefinition{
		Name: "kafka-probe",
		Steps: []models.Step{{
			ID:     "probe",
			Action: "kafka_consumer",
			Config: map[string]interface{}{
				"brokers":          []interface{}{broker},
				"topic":            "__consumer_offsets",
				"group_id":         "testmesh-probe",
				"timeout":          "3s",
				"auto_offset_reset": "latest",
			},
		}},
	}
	result, err := executeFlow(flow)
	if err != nil {
		errStr := err.Error()
		// A timeout is OK — it means we connected but there were no messages.
		if strings.Contains(strings.ToLower(errStr), "timeout") {
			return ""
		}
		return errStr
	}
	// For kafka consumer, a timeout with no messages is actually a pass
	// (means we connected to the broker).
	if result.Status == "passed" {
		return ""
	}
	if len(result.Steps) > 0 {
		stepErr := strings.ToLower(result.Steps[0].Error)
		if strings.Contains(stepErr, "timeout") || strings.Contains(stepErr, "timed out") {
			return "" // connected but no messages — that's fine
		}
		return result.Steps[0].Error
	}
	return ""
}

// probeRedis tests Redis connectivity by getting a non-existent key.
func probeRedis(addr string) string {
	parts := strings.SplitN(addr, ":", 2)
	host := parts[0]
	port := "6379"
	if len(parts) > 1 {
		port = parts[1]
	}
	flow := &models.FlowDefinition{
		Name: "redis-probe",
		Steps: []models.Step{{
			ID:     "probe",
			Action: "redis.get",
			Config: map[string]interface{}{
				"host": host,
				"port": port,
				"key":  "__testmesh_probe__",
			},
		}},
	}
	result, err := executeFlow(flow)
	if err != nil {
		return err.Error()
	}
	// A nil value response is fine — it means we connected.
	if result.Status == "passed" {
		return ""
	}
	if len(result.Steps) > 0 {
		stepErr := result.Steps[0].Error
		// "nil" or "key not found" means connected successfully.
		lower := strings.ToLower(stepErr)
		if strings.Contains(lower, "nil") || strings.Contains(lower, "not found") || strings.Contains(lower, "not exist") {
			return ""
		}
		return stepErr
	}
	return ""
}
