package mcpserver

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
)

// AnalysisReportOptions controls analysis report generation.
type AnalysisReportOptions struct {
	DBConnection string
	KafkaBrokers string
	RedisAddr    string
	ServiceURLs  map[string]string
	OutputPath   string
}

// GenerateE2EAnalysisReport returns a rich analysis report for LLM-driven flow generation.
// It does NOT generate YAML — that is the LLM's job.
func GenerateE2EAnalysisReport(workspace *WorkspaceAnalysis, opts AnalysisReportOptions) string {
	var b strings.Builder

	// Build HTTP deps for topo sort.
	httpDeps := map[string][]string{}
	for _, dep := range workspace.Dependencies {
		if dep.Via == "http" {
			httpDeps[dep.From] = append(httpDeps[dep.From], dep.To)
		}
	}
	sorted := topoSortServices(workspace.Services, httpDeps)

	urlFor := func(svc *ServiceAnalysis) string {
		if opts.ServiceURLs != nil {
			if u := opts.ServiceURLs[svc.ServiceName]; u != "" {
				return u
			}
		}
		return svc.BaseURL
	}

	b.WriteString("# TestMesh E2E Analysis Report\n\n")
	b.WriteString("This report contains everything needed to write a complete, accurate E2E test flow.\n")
	b.WriteString("You are the flow author — use this analysis to write YAML, not a template.\n\n")

	// ── SECTION 1: Infrastructure ──────────────────────────────────────────
	b.WriteString("## INFRASTRUCTURE\n\n")
	if opts.DBConnection != "" {
		b.WriteString(fmt.Sprintf("Database: %s\n", opts.DBConnection))
	}
	if opts.KafkaBrokers != "" {
		b.WriteString(fmt.Sprintf("Kafka: %s\n", opts.KafkaBrokers))
	}
	if opts.RedisAddr != "" {
		b.WriteString(fmt.Sprintf("Redis: %s\n", opts.RedisAddr))
	}
	for svc, url := range opts.ServiceURLs {
		b.WriteString(fmt.Sprintf("Service %s: %s\n", svc, url))
	}
	if opts.OutputPath != "" {
		b.WriteString(fmt.Sprintf("\n⚠️  OUTPUT: When you have generated the complete YAML flow, write it to: %s\n", opts.OutputPath))
	}
	b.WriteString("\n")

	// ── SECTION 2: Dependency Graph ────────────────────────────────────────
	b.WriteString("## DEPENDENCY GRAPH\n\n")
	b.WriteString("EXECUTION ORDER (dependencies must be created before dependents):\n")
	for i, svc := range sorted {
		b.WriteString(fmt.Sprintf("  %d. %s (%s)\n", i+1, svc.ServiceName, urlFor(svc)))
	}
	b.WriteString("\nINTER-SERVICE CALLS:\n")
	for _, dep := range workspace.Dependencies {
		if dep.Via == "http" {
			b.WriteString(fmt.Sprintf("  %s → HTTP → %s  (via env: %s)\n", dep.From, dep.To, dep.Detail))
		}
	}
	for _, dep := range workspace.Dependencies {
		if dep.Via == "kafka" {
			b.WriteString(fmt.Sprintf("  %s → Kafka topic '%s' → %s\n", dep.From, dep.Detail, dep.To))
		}
	}
	b.WriteString("\n")

	// ── SECTION 3: Service + Endpoint Catalog ─────────────────────────────
	b.WriteString("## SERVICES\n\n")
	for _, svc := range sorted {
		b.WriteString(fmt.Sprintf("### %s\n", svc.ServiceName))
		b.WriteString(fmt.Sprintf("  URL: %s\n", urlFor(svc)))
		if len(svc.DBSchemas) > 0 {
			b.WriteString(fmt.Sprintf("  DB schemas: %s\n", strings.Join(svc.DBSchemas, ", ")))
		}
		if len(svc.RedisKeyPatterns) > 0 {
			for _, kp := range svc.RedisKeyPatterns {
				b.WriteString(fmt.Sprintf("  Redis cache key: %s  (set on CREATE)\n", kp.KeyFormat))
			}
		}
		if len(svc.InterServiceCalls) > 0 {
			b.WriteString("  Outbound calls:\n")
			for _, call := range svc.InterServiceCalls {
				b.WriteString(fmt.Sprintf("    %s %s on %s\n", call.Method, call.PathTemplate, call.ToService))
			}
		}
		b.WriteString("\n")

		// Endpoints
		if len(svc.Endpoints) > 0 {
			b.WriteString("  ENDPOINTS:\n")
			for _, ep := range svc.Endpoints {
				b.WriteString(fmt.Sprintf("    %s %s\n", ep.Method, ep.Path))
				if ep.RequestSchema != nil {
					b.WriteString(fmt.Sprintf("      Request body (%s):\n", ep.RequestSchema.StructName))
					for _, f := range ep.RequestSchema.Fields {
						req := ""
						if f.Required {
							req = " (required)"
						}
						if f.IsArray {
							b.WriteString(fmt.Sprintf("        %s: []object%s\n", f.JSONName, req))
							for _, item := range f.Items {
								itemReq := ""
								if item.Required {
									itemReq = " (required)"
								}
								b.WriteString(fmt.Sprintf("          - %s: %s%s\n", item.JSONName, item.GoType, itemReq))
							}
						} else {
							b.WriteString(fmt.Sprintf("        %s: %s%s\n", f.JSONName, f.GoType, req))
						}
					}
				} else if len(ep.PathParams) > 0 {
					b.WriteString(fmt.Sprintf("      Path params: %s\n", strings.Join(ep.PathParams, ", ")))
				}
			}
			b.WriteString("\n")
		}

		// Models (DB tables)
		if len(svc.Models) > 0 {
			b.WriteString("  DATABASE TABLES:\n")
			for _, m := range svc.Models {
				if m.Table == "" {
					continue
				}
				b.WriteString(fmt.Sprintf("    %s  → fields: %s\n", m.Table, strings.Join(m.Fields, ", ")))
			}
			b.WriteString("\n")
		}

		// Kafka
		if len(svc.KafkaTopics) > 0 {
			b.WriteString("  KAFKA TOPICS:\n")
			for _, topic := range svc.KafkaTopics {
				b.WriteString(fmt.Sprintf("    [%s] %s\n", strings.ToUpper(topic.Direction), topic.Name))
				if topic.MessageSchema != nil {
					if topic.MessageSchema.EventType != "" {
						b.WriteString(fmt.Sprintf("      event_type: \"%s\"\n", topic.MessageSchema.EventType))
					}
					for _, f := range topic.MessageSchema.Fields {
						b.WriteString(fmt.Sprintf("      %s: %s\n", f.JSONName, f.GoType))
					}
				}
			}
			b.WriteString("\n")
		}
	}

	// ── SECTION 4: Testing Guidance ────────────────────────────────────────
	b.WriteString("## WHAT TO TEST\n\n")

	b.WriteString("### Happy path (recommended complete flow):\n")
	step := 1
	for _, svc := range sorted {
		hasPOST := false
		for _, ep := range svc.Endpoints {
			if ep.Method == "POST" && !isAuthPath(ep.Path) && ep.Path != "/health" {
				hasPOST = true
				base := epBasePath(ep.Path)
				rName := epResourceName(base)
				idVar := rName + "_id"
				b.WriteString(fmt.Sprintf("  %d. POST %s%s → capture %s\n", step, urlFor(svc), ep.Path, idVar))
				if len(svc.RedisKeyPatterns) > 0 {
					for _, kp := range svc.RedisKeyPatterns {
						if strings.EqualFold(kp.Prefix, rName) {
							b.WriteString(fmt.Sprintf("     → verify Redis key: %s\n", strings.Replace(kp.KeyFormat, "%s", "{"+idVar+"}", 1)))
						}
					}
				}
				for _, topic := range svc.KafkaTopics {
					if topic.Direction == "produce" && isCreationTopic(topic.Name) {
						b.WriteString(fmt.Sprintf("     → verify Kafka: %s published\n", topic.Name))
					}
				}
				if len(svc.DBSchemas) > 0 {
					for _, m := range svc.Models {
						if m.Table != "" && isPrimaryModel(m, svc) {
							b.WriteString(fmt.Sprintf("     → verify DB: SELECT FROM %s WHERE id = '{%s}'\n", m.Table, idVar))
						}
					}
				}
				step++
				break
			}
		}
		if !hasPOST {
			b.WriteString(fmt.Sprintf("  (note: %s has no create endpoint — it is driven by Kafka events)\n", svc.ServiceName))
		}
	}
	b.WriteString("\n")

	b.WriteString("### Kafka async effects (poll with db_poll, timeout 15s):\n")
	for _, dep := range workspace.Dependencies {
		if dep.Via != "kafka" {
			continue
		}
		toSvc := findServiceByName(workspace, dep.To)
		if toSvc == nil {
			continue
		}
		for _, m := range toSvc.Models {
			if m.Table == "" {
				continue
			}
			b.WriteString(fmt.Sprintf("  - poll %s for records triggered by '%s' event\n", m.Table, dep.Detail))
			break
		}
	}
	b.WriteString("\n")

	b.WriteString("### Validation errors to test:\n")
	for _, svc := range sorted {
		for _, ep := range svc.Endpoints {
			if ep.Method == "POST" && ep.RequestSchema != nil {
				for _, f := range ep.RequestSchema.Fields {
					if f.Required {
						b.WriteString(fmt.Sprintf("  - POST %s without '%s' → expect 400\n", ep.Path, f.JSONName))
						break
					}
				}
				if len(svc.InterServiceCalls) > 0 {
					b.WriteString(fmt.Sprintf("  - POST %s with non-existent dependency IDs (use UUID zeros) → expect 400\n", ep.Path))
				}
				break
			}
		}
	}

	// ── SECTION 5: TestMesh YAML Quick Reference ───────────────────────────
	b.WriteString("\n## TESTMESH YAML QUICK REFERENCE\n\n")

	b.WriteString("### Flow structure:\n```yaml\nflow:\n  name: \"My E2E Test\"\n  env_file: ../../.env.test   # USER_SERVICE_URL, DB_URL, KAFKA_BROKERS, REDIS_HOST, REDIS_PORT\n  steps:\n    - id: step_id\n      action: http_request\n      config:\n        method: POST\n        url: ${USER_SERVICE_URL}/api/v1/users\n        headers:\n          Content-Type: application/json\n        body:\n          name: \"Test User {{RANDOM_ID}}\"\n          email: \"test-{{RANDOM_ID}}@example.com\"\n      assert:\n        - \"status == 201\"\n        - \"body.id != nil\"\n      output:\n        user_id: \"$.body.id\"\n```\n\n")

	b.WriteString("### Available actions:\n")
	b.WriteString("- `http_request`: method, url, headers, body, timeout\n")
	b.WriteString("- `database_query`: connection, query → asserts: row_count, rows[0].field\n")
	b.WriteString("- `db_poll`: connection, query, interval, timeout → polls until len(rows)>0\n")
	b.WriteString("- `kafka_consumer`: brokers (list), topic, timeout, count, group_id, auto_offset_reset, from_beginning\n")
	b.WriteString("  → asserts: len(messages) > 0\n")
	b.WriteString("- `redis.get`: host, port, key → asserts: value != nil\n")
	b.WriteString("- `delay`: duration (e.g. \"2s\")\n")
	b.WriteString("- `log`: message\n\n")

	b.WriteString("### Template variables:\n")
	b.WriteString("- `{{RANDOM_ID}}` - random UUID generated at runtime\n")
	b.WriteString("- `{{variable_name}}` - value captured from a previous step's output\n\n")

	b.WriteString("### database_query assertions:\n")
	b.WriteString("- `row_count == 1` means exactly 1 row was returned by the SELECT\n")
	b.WriteString("- Use `SELECT * FROM table WHERE id = '{{id}}'` (NOT COUNT!) so row_count is meaningful\n")
	b.WriteString("- Access fields: `first_row.name`, `rows[0].status`\n\n")

	b.WriteString("### db_poll — wait for async events:\n")
	b.WriteString("```yaml\n- id: wait_for_notification\n  action: db_poll\n  config:\n    connection: \"postgres://...\"\n    query: \"SELECT id FROM notification_service.notifications WHERE user_id = '{{user_id}}' LIMIT 1\"\n    interval: \"1s\"\n    timeout: \"15s\"\n```\n\n")

	b.WriteString("### kafka_consumer — unique group per run (prevents catching old messages):\n")
	b.WriteString("```yaml\n- id: verify_kafka_event\n  action: kafka_consumer\n  config:\n    brokers:\n      - localhost:9092\n    topic: \"user.created\"\n    group_id: \"testmesh-e2e-{{RANDOM_ID}}\"\n    auto_offset_reset: \"earliest\"\n    from_beginning: true\n    timeout: \"10s\"\n    count: 1\n  assert:\n    - \"len(messages) > 0\"\n```\n\n")

	return b.String()
}

// GenerateFlowOptions controls what gets included in the generated flow.
type GenerateFlowOptions struct {
	FlowName     string
	BaseURL      string
	DBConnection string
	KafkaBrokers string
	RedisAddr    string // host:port, e.g. "localhost:6379"
	Focus        string // "crud" | "events" | "errors" | "full"
	ServiceURLs  map[string]string
}

// GenerateFlow produces a YAML flow string from a ServiceAnalysis.
func GenerateFlow(analysis *ServiceAnalysis, opts GenerateFlowOptions) string {
	if opts.FlowName == "" {
		opts.FlowName = "E2E Test: " + analysis.ServiceName
	}
	if opts.BaseURL == "" {
		opts.BaseURL = analysis.BaseURL
	}
	if opts.Focus == "" {
		opts.Focus = "full"
	}

	var b strings.Builder

	b.WriteString("flow:\n")
	b.WriteString(fmt.Sprintf("  name: %q\n", opts.FlowName))
	b.WriteString(fmt.Sprintf("  description: \"Auto-generated E2E flow for %s. Covers HTTP endpoints, database state, and event verification.\"\n", analysis.ServiceName))
	b.WriteString("\n")

	// Setup phase.
	setup := buildSetupSteps(analysis, opts)
	if len(setup) > 0 {
		b.WriteString("  setup:\n")
		for _, s := range setup {
			b.WriteString(s)
		}
		b.WriteString("\n")
	}

	// Main steps.
	b.WriteString("  steps:\n")

	// Health check.
	b.WriteString(flowStep("health_check", "http_request", map[string]any{
		"method": "GET",
		"url":    opts.BaseURL + "/health",
	}, []string{"status == 200"}, nil))

	for _, s := range buildEndpointSteps(analysis, opts) {
		b.WriteString(s)
	}

	if (opts.Focus == "full" || opts.Focus == "crud") && opts.DBConnection != "" {
		for _, s := range buildDBVerificationSteps(analysis, opts) {
			b.WriteString(s)
		}
	}

	if (opts.Focus == "full" || opts.Focus == "events") && opts.KafkaBrokers != "" {
		for _, s := range buildKafkaVerificationSteps(analysis, opts) {
			b.WriteString(s)
		}
	}

	if opts.Focus == "full" || opts.Focus == "errors" {
		for _, s := range buildErrorSteps(analysis, opts) {
			b.WriteString(s)
		}
	}

	// Teardown phase.
	teardown := buildTeardownSteps(analysis, opts)
	if len(teardown) > 0 {
		b.WriteString("\n  teardown:\n")
		for _, s := range teardown {
			b.WriteString(s)
		}
	}

	return b.String()
}

// ---------------------------------------------------------------------------
// Setup steps
// ---------------------------------------------------------------------------

func buildSetupSteps(analysis *ServiceAnalysis, opts GenerateFlowOptions) []string {
	var steps []string
	if len(analysis.KafkaTopics) > 0 && opts.KafkaBrokers != "" {
		steps = append(steps, flowStep(
			"setup_log",
			"log",
			map[string]any{"message": fmt.Sprintf("Starting E2E tests for %s", analysis.ServiceName)},
			nil, nil,
		))
	}
	return steps
}

// ---------------------------------------------------------------------------
// Endpoint steps
// ---------------------------------------------------------------------------

func buildEndpointSteps(analysis *ServiceAnalysis, opts GenerateFlowOptions) []string {
	var steps []string

	type endpointGroup struct {
		basePath string
		post     *Endpoint
		getAll   *Endpoint
		getOne   *Endpoint
		put      *Endpoint
		patch    *Endpoint
		delete   *Endpoint
	}

	groups := map[string]*endpointGroup{}
	var groupOrder []string

	for i := range analysis.Endpoints {
		ep := &analysis.Endpoints[i]
		if ep.Path == "/health" {
			continue
		}
		base := epBasePath(ep.Path)
		if _, ok := groups[base]; !ok {
			groups[base] = &endpointGroup{basePath: base}
			groupOrder = append(groupOrder, base)
		}
		g := groups[base]
		switch ep.Method {
		case "POST":
			g.post = ep
		case "GET":
			if len(ep.PathParams) == 0 {
				g.getAll = ep
			} else {
				g.getOne = ep
			}
		case "PUT":
			g.put = ep
		case "PATCH":
			g.patch = ep
		case "DELETE":
			g.delete = ep
		}
	}

	for _, base := range groupOrder {
		g := groups[base]
		rName := epResourceName(base)
		idVar := rName + "_id"

		if g.post != nil {
			body := inferCreateBody(analysis, rName)
			if isAuthPath(g.post.Path) {
				// Auth endpoints (login, logout, token) have different semantics — skip CRUD assertions.
				steps = append(steps, flowStep(
					rName,
					"http_request",
					map[string]any{
						"method": "POST",
						"url":    opts.BaseURL + g.post.Path,
						"headers": map[string]any{
							"Content-Type": "application/json",
						},
						"body": body,
					},
					[]string{"status < 500"},
					nil,
				))
			} else {
				steps = append(steps, flowStep(
					"create_"+rName,
					"http_request",
					map[string]any{
						"method": "POST",
						"url":    opts.BaseURL + g.post.Path,
						"headers": map[string]any{
							"Content-Type": "application/json",
						},
						"body": body,
					},
					[]string{"status == 201", "body.id != nil"},
					map[string]any{idVar: "$.body.id"},
				))
			}
		}

		if g.getAll != nil {
			authGet := isAuthPath(g.getAll.Path)
			stepID := "list_" + rName + "s"
			if authGet {
				stepID = rName
			}
			asserts := []string{"status == 200"}
			if authGet {
				asserts = []string{"status < 500"}
			}
			steps = append(steps, flowStep(
				stepID,
				"http_request",
				map[string]any{
					"method": "GET",
					"url":    opts.BaseURL + g.getAll.Path,
				},
				asserts,
				nil,
			))
		}

		if g.getOne != nil && g.post != nil {
			getPath := replaceFirstPathParam(g.getOne.Path, idVar)
			steps = append(steps, flowStep(
				"get_"+rName,
				"http_request",
				map[string]any{
					"method": "GET",
					"url":    opts.BaseURL + getPath,
				},
				[]string{"status == 200", "body.id != nil"},
				nil,
			))
		}

		updateEp := g.put
		if updateEp == nil {
			updateEp = g.patch
		}
		if updateEp != nil && g.post != nil {
			updatePath := replaceFirstPathParam(updateEp.Path, idVar)
			steps = append(steps, flowStep(
				"update_"+rName,
				"http_request",
				map[string]any{
					"method": updateEp.Method,
					"url":    opts.BaseURL + updatePath,
					"headers": map[string]any{
						"Content-Type": "application/json",
					},
					"body": inferUpdateBody(analysis, rName),
				},
				[]string{"status == 200"},
				nil,
			))
		}

		if g.delete != nil && g.post != nil {
			deletePath := replaceFirstPathParam(g.delete.Path, idVar)
			steps = append(steps, flowStep(
				"delete_"+rName,
				"http_request",
				map[string]any{
					"method": "DELETE",
					"url":    opts.BaseURL + deletePath,
				},
				[]string{"status == 200 || status == 204"},
				nil,
			))

			if g.getOne != nil {
				getPath := replaceFirstPathParam(g.getOne.Path, idVar)
				steps = append(steps, flowStep(
					"verify_"+rName+"_deleted",
					"http_request",
					map[string]any{
						"method": "GET",
						"url":    opts.BaseURL + getPath,
					},
					[]string{"status == 404"},
					nil,
				))
			}
		}
	}

	return steps
}

// ---------------------------------------------------------------------------
// DB verification steps
// ---------------------------------------------------------------------------

func buildDBVerificationSteps(analysis *ServiceAnalysis, opts GenerateFlowOptions) []string {
	var steps []string
	for _, m := range analysis.Models {
		if m.Table == "" {
			continue
		}
		stepID := "verify_db_" + camelToSnake(m.Name)
		steps = append(steps, flowStep(
			stepID,
			"database_query",
			map[string]any{
				"connection": opts.DBConnection,
				"query":      fmt.Sprintf("SELECT id FROM %s LIMIT 5", m.Table),
			},
			[]string{"row_count >= 1"},
			nil,
		))
	}
	return steps
}

// ---------------------------------------------------------------------------
// Kafka verification steps
// ---------------------------------------------------------------------------

func buildKafkaVerificationSteps(analysis *ServiceAnalysis, opts GenerateFlowOptions) []string {
	var steps []string
	for _, topic := range analysis.KafkaTopics {
		if topic.Direction != "produce" {
			continue
		}
		stepID := "verify_event_" + strings.ReplaceAll(strings.ReplaceAll(topic.Name, ".", "_"), "-", "_")
		steps = append(steps, flowStep(
			stepID,
			"kafka_consumer",
			map[string]any{
				"brokers":           opts.KafkaBrokers,
				"topic":             topic.Name,
				"group_id":          "testmesh-e2e-verifier",
				"timeout":           "10s",
				"auto_offset_reset": "earliest",
			},
			[]string{"len(messages) > 0"},
			nil,
		))
	}
	return steps
}

// ---------------------------------------------------------------------------
// Error scenario steps
// ---------------------------------------------------------------------------

func buildErrorSteps(analysis *ServiceAnalysis, opts GenerateFlowOptions) []string {
	var steps []string

	seen := map[string]bool{}
	for _, ep := range analysis.Endpoints {
		if ep.Method == "GET" && len(ep.PathParams) > 0 {
			rName := epResourceName(epBasePath(ep.Path))
			if seen[rName] {
				continue
			}
			seen[rName] = true
			getPath := replaceAllPathParams(ep.Path, "00000000-0000-0000-0000-000000000000")
			steps = append(steps, flowStep(
				"not_found_"+rName,
				"http_request",
				map[string]any{
					"method": "GET",
					"url":    opts.BaseURL + getPath,
				},
				[]string{"status == 404 || status == 400"},
				nil,
			))
		}
	}

	for _, ep := range analysis.Endpoints {
		if ep.Method == "POST" && ep.HasBody {
			rName := epResourceName(epBasePath(ep.Path))
			steps = append(steps, flowStep(
				"bad_request_"+rName,
				"http_request",
				map[string]any{
					"method":  "POST",
					"url":     opts.BaseURL + ep.Path,
					"headers": map[string]any{"Content-Type": "application/json"},
					"body":    map[string]any{},
				},
				[]string{"status == 400 || status == 422"},
				nil,
			))
			break
		}
	}

	return steps
}

// ---------------------------------------------------------------------------
// Teardown steps
// ---------------------------------------------------------------------------

func buildTeardownSteps(_ *ServiceAnalysis, _ GenerateFlowOptions) []string {
	return nil
}

// ---------------------------------------------------------------------------
// YAML rendering helpers
// ---------------------------------------------------------------------------

// flowStep renders a single flow step as YAML.
func flowStep(id, action string, config map[string]any, assert []string, output map[string]any) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("    - id: %s\n", id))
	b.WriteString(fmt.Sprintf("      action: %s\n", action))

	if len(config) > 0 {
		b.WriteString("      config:\n")
		writeYAMLMap(&b, config, 8)
	}

	if len(assert) > 0 {
		b.WriteString("      assert:\n")
		for _, a := range assert {
			b.WriteString(fmt.Sprintf("        - %q\n", a))
		}
	}

	if len(output) > 0 {
		b.WriteString("      output:\n")
		for k, v := range output {
			b.WriteString(fmt.Sprintf("        %s: %q\n", k, v))
		}
	}

	b.WriteString("\n")
	return b.String()
}

func writeYAMLMap(b *strings.Builder, m map[string]any, indent int) {
	prefix := strings.Repeat(" ", indent)
	for k, v := range m {
		switch val := v.(type) {
		case map[string]any:
			b.WriteString(fmt.Sprintf("%s%s:\n", prefix, k))
			writeYAMLMap(b, val, indent+2)
		case []any:
			b.WriteString(fmt.Sprintf("%s%s:\n", prefix, k))
			writeYAMLSlice(b, val, indent+2)
		case string:
			b.WriteString(fmt.Sprintf("%s%s: %q\n", prefix, k, val))
		case int, int64, float64, bool:
			b.WriteString(fmt.Sprintf("%s%s: %v\n", prefix, k, val))
		default:
			b.WriteString(fmt.Sprintf("%s%s: %q\n", prefix, k, fmt.Sprintf("%v", val)))
		}
	}
}

func writeYAMLSlice(b *strings.Builder, items []any, indent int) {
	prefix := strings.Repeat(" ", indent)
	for _, item := range items {
		switch val := item.(type) {
		case map[string]any:
			first := true
			for k, v := range val {
				if first {
					b.WriteString(fmt.Sprintf("%s- %s: ", prefix, k))
					first = false
				} else {
					b.WriteString(fmt.Sprintf("%s  %s: ", prefix, k))
				}
				switch sv := v.(type) {
				case string:
					b.WriteString(fmt.Sprintf("%q\n", sv))
				default:
					b.WriteString(fmt.Sprintf("%v\n", sv))
				}
			}
		default:
			b.WriteString(fmt.Sprintf("%s- %v\n", prefix, val))
		}
	}
}

// ---------------------------------------------------------------------------
// Path and resource name helpers
// ---------------------------------------------------------------------------

var rePathParam = regexp.MustCompile(`:[a-zA-Z_][a-zA-Z0-9_]*|\{[a-zA-Z_][a-zA-Z0-9_]*\}`)

// epBasePath strips path params to get the resource base path.
// /api/v1/users/:id → /api/v1/users
func epBasePath(path string) string {
	parts := strings.Split(path, "/")
	var clean []string
	for _, p := range parts {
		if strings.HasPrefix(p, ":") || (strings.HasPrefix(p, "{") && strings.HasSuffix(p, "}")) {
			break
		}
		clean = append(clean, p)
	}
	result := strings.Join(clean, "/")
	if result == "" {
		return path
	}
	return result
}

// epResourceName derives a singular resource name from a base path.
// /api/v1/users → user
func epResourceName(base string) string {
	parts := strings.Split(strings.Trim(base, "/"), "/")
	last := parts[len(parts)-1]
	if strings.HasSuffix(last, "ies") {
		return last[:len(last)-3] + "y"
	}
	if strings.HasSuffix(last, "s") && len(last) > 3 {
		return last[:len(last)-1]
	}
	if last == "" {
		return "resource"
	}
	return last
}

// replaceFirstPathParam replaces the first path parameter with a template variable.
func replaceFirstPathParam(path, varName string) string {
	replaced := false
	return rePathParam.ReplaceAllStringFunc(path, func(_ string) string {
		if !replaced {
			replaced = true
			return "{{" + varName + "}}"
		}
		return varName
	})
}

// replaceAllPathParams replaces all path parameters with a literal value.
func replaceAllPathParams(path, value string) string {
	return rePathParam.ReplaceAllString(path, value)
}

// ---------------------------------------------------------------------------
// Body inference helpers
// ---------------------------------------------------------------------------

func inferCreateBody(analysis *ServiceAnalysis, resource string) map[string]any {
	body := map[string]any{}

	for _, m := range analysis.Models {
		if strings.EqualFold(m.Name, resource) || strings.EqualFold(camelToSnake(m.Name), resource) {
			for _, f := range m.Fields {
				if f == "id" || f == "created_at" || f == "updated_at" || f == "deleted_at" {
					continue
				}
				body[f] = inferFieldValue(f, resource, m.FieldTypes[f])
			}
			return body
		}
	}

	body["name"] = fmt.Sprintf("Test %s {{RANDOM_ID}}", titleCase(resource))
	body["email"] = "test-{{RANDOM_ID}}@example.com"
	return body
}

func inferUpdateBody(analysis *ServiceAnalysis, resource string) map[string]any {
	body := inferCreateBody(analysis, resource)
	for k := range body {
		if k == "name" {
			body[k] = fmt.Sprintf("Updated %s {{RANDOM_ID}}", titleCase(resource))
		}
	}
	return body
}

func inferFieldValue(field, resource, goType string) any {
	// Use the extracted Go type first — this is the most reliable signal.
	switch {
	case isIntType(goType):
		return 1
	case isFloatType(goType):
		return 1.0
	case isBoolType(goType):
		return true
	}

	// Exact matches for universally recognizable field semantics.
	switch field {
	case "email":
		return "test-{{RANDOM_ID}}@example.com"
	case "name", "full_name", "username", "title", "label":
		return fmt.Sprintf("Test %s {{RANDOM_ID}}", titleCase(resource))
	case "password", "secret", "token", "api_key":
		return "Test@password123"
	case "phone", "phone_number", "mobile":
		return "+1-555-0100"
	case "description", "summary", "bio", "notes", "body", "content", "text", "message", "comment":
		return fmt.Sprintf("Test %s description {{RANDOM_ID}}", resource)
	case "status", "state":
		return "active"
	}

	// Suffix/prefix-based inference — generic across all domains.
	switch {
	case strings.HasSuffix(field, "_id"):
		return "{{RANDOM_ID}}"
	case strings.HasSuffix(field, "_url") || strings.HasSuffix(field, "_link") ||
		strings.HasSuffix(field, "_href") || strings.HasSuffix(field, "_src"):
		return "https://example.com"
	case strings.HasSuffix(field, "_at") || strings.HasSuffix(field, "_date") ||
		strings.HasSuffix(field, "_time"):
		return "2024-01-01T00:00:00Z"
	case strings.HasPrefix(field, "is_") || strings.HasPrefix(field, "has_") ||
		strings.HasPrefix(field, "can_") || strings.HasPrefix(field, "should_"):
		return true
	case strings.HasSuffix(field, "_enabled") || strings.HasSuffix(field, "_active") ||
		strings.HasSuffix(field, "_visible") || strings.HasSuffix(field, "_required"):
		return true
	case isNumericField(field):
		return 1
	}

	return fmt.Sprintf("test-%s-{{RANDOM_ID}}", field)
}

func isIntType(t string) bool {
	switch t {
	case "int", "int8", "int16", "int32", "int64",
		"uint", "uint8", "uint16", "uint32", "uint64":
		return true
	}
	return false
}

func isFloatType(t string) bool {
	return t == "float32" || t == "float64"
}

func isBoolType(t string) bool {
	return t == "bool"
}

// isNumericField returns true when a field name's suffix or exact value
// indicates a numeric type — without encoding any domain-specific knowledge.
func isNumericField(field string) bool {
	numericSuffixes := []string{
		"_count", "_num", "_number", "_total", "_sum",
		"_size", "_limit", "_max", "_min", "_rank",
		"_score", "_level", "_version", "_age", "_duration",
		"_timeout", "_capacity", "_weight", "_height", "_width",
		"_length", "_rate", "_ratio", "_percent", "_priority",
		"_sequence", "_index", "_position", "_order", "_offset",
	}
	for _, s := range numericSuffixes {
		if strings.HasSuffix(field, s) {
			return true
		}
	}
	numericExact := []string{
		"count", "num", "total", "sum", "size", "limit",
		"max", "min", "rank", "score", "level", "version",
		"age", "duration", "capacity", "weight", "height",
		"width", "length", "rate", "ratio", "percent",
		"priority", "sequence", "index", "position", "order", "offset",
	}
	for _, e := range numericExact {
		if field == e {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------
// Workspace (cross-service) flow generation
// ---------------------------------------------------------------------------

// GenerateWorkspaceFlow produces a cross-service E2E YAML flow from a WorkspaceAnalysis.
func GenerateWorkspaceFlow(workspace *WorkspaceAnalysis, opts GenerateFlowOptions) string {
	if opts.FlowName == "" {
		opts.FlowName = "E2E Workspace Test"
	}
	if opts.Focus == "" {
		opts.Focus = "full"
	}

	// Build HTTP deps map: serviceName → list of services it depends on via HTTP.
	httpDeps := map[string][]string{}
	for _, dep := range workspace.Dependencies {
		if dep.Via == "http" {
			httpDeps[dep.From] = append(httpDeps[dep.From], dep.To)
		}
	}

	// Build Kafka consumer tracking.
	kafkaConsumerSvcs := map[string]bool{}
	kafkaConsumerDeps := map[string][]ServiceDependency{}
	for _, dep := range workspace.Dependencies {
		if dep.Via == "kafka" {
			kafkaConsumerSvcs[dep.To] = true
			kafkaConsumerDeps[dep.To] = append(kafkaConsumerDeps[dep.To], dep)
		}
	}
	_ = kafkaConsumerDeps // may be used in future

	// trackableInitials maps output variable name → field name
	// e.g. "product_initial_inventory" → "inventory"
	trackableInitials := map[string]string{}

	// Topologically sort services so dependencies come first.
	sorted := topoSortServices(workspace.Services, httpDeps)

	// Build URL map per service.
	urlFor := func(svc *ServiceAnalysis) string {
		if opts.ServiceURLs != nil {
			if u, ok := opts.ServiceURLs[svc.ServiceName]; ok && u != "" {
				return u
			}
		}
		return svc.BaseURL
	}

	var b strings.Builder
	b.WriteString("flow:\n")
	b.WriteString(fmt.Sprintf("  name: %q\n", opts.FlowName))
	b.WriteString(fmt.Sprintf("  description: \"Auto-generated cross-service E2E flow covering %d services.\"\n", len(workspace.Services)))
	b.WriteString("\n  steps:\n")

	// Health checks for all services.
	for _, svc := range sorted {
		b.WriteString(flowStep(
			svcNameToID(svc.ServiceName)+"_health",
			"http_request",
			map[string]any{
				"method": "GET",
				"url":    urlFor(svc) + "/health",
			},
			[]string{"status == 200"},
			nil,
		))
	}

	// Track which resource IDs are available for injection.
	availableIDs := map[string]bool{}

	// Create steps per service in topological order.
	for _, svc := range sorted {
		depsOnThis := httpDeps[svc.ServiceName]

		// Find the primary POST endpoint.
		var primaryPost *Endpoint
		for i := range svc.Endpoints {
			ep := &svc.Endpoints[i]
			if ep.Method != "POST" || ep.Path == "/health" || isAuthPath(ep.Path) {
				continue
			}
			primaryPost = ep
			break
		}
		if primaryPost == nil {
			continue
		}

		base := epBasePath(primaryPost.Path)
		rName := epResourceName(base)
		idVar := rName + "_id"

		body := buildCrossServiceBody(svc, rName, depsOnThis, workspace, availableIDs)

		// Build the outputs map: always capture the ID.
		outputs := map[string]any{idVar: "$.body.id"}

		// If this service is also a Kafka consumer that UPDATES its own model,
		// capture numeric fields as trackable initials so we can detect changes.
		if kafkaConsumerSvcs[svc.ServiceName] {
			for _, m := range svc.Models {
				if !isPrimaryModel(m, svc) {
					continue
				}
				for _, f := range m.Fields {
					goType := m.FieldTypes[f]
					if f == "id" || f == "created_at" || f == "updated_at" || f == "deleted_at" {
						continue
					}
					if strings.HasSuffix(f, "_id") {
						continue
					}
					if isIntType(goType) || isFloatType(goType) {
						outVar := rName + "_initial_" + f
						outputs[outVar] = "$.body." + f
						trackableInitials[outVar] = f
					}
				}
				break
			}
		}

		// Build assertions: always check status and ID, plus verify injected dep IDs in response.
		createAsserts := []string{"status == 201", "body.id != nil"}
		for _, depName := range depsOnThis {
			depSvc := findServiceByName(workspace, depName)
			if depSvc == nil {
				continue
			}
			depIDVar := primaryResourceName(depSvc) + "_id"
			if availableIDs[depIDVar] {
				createAsserts = append(createAsserts, fmt.Sprintf(`body.%s == "{{%s}}"`, depIDVar, depIDVar))
			}
		}
		b.WriteString(flowStep(
			"create_"+svcNameToID(svc.ServiceName)+"_"+rName,
			"http_request",
			map[string]any{
				"method": "POST",
				"url":    urlFor(svc) + primaryPost.Path,
				"headers": map[string]any{
					"Content-Type": "application/json",
				},
				"body": body,
			},
			createAsserts,
			outputs,
		))

		availableIDs[idVar] = true

		// Redis cache verification: verify the resource was cached after CREATE.
		if opts.RedisAddr != "" && len(svc.RedisKeyPatterns) > 0 {
			host, port := "localhost", "6379"
			if parts := strings.SplitN(opts.RedisAddr, ":", 2); len(parts) == 2 {
				host, port = parts[0], parts[1]
			}
			for _, kp := range svc.RedisKeyPatterns {
				// Only emit for patterns whose prefix matches the created resource.
				if !strings.EqualFold(kp.Prefix, rName) && !strings.EqualFold(kp.Prefix, strings.ReplaceAll(rName, "_", "")) {
					continue
				}
				redisKey := strings.Replace(kp.KeyFormat, "%s", "{{"+idVar+"}}", 1)
				b.WriteString(flowStep(
					"verify_redis_"+svcNameToID(svc.ServiceName)+"_"+kp.Prefix,
					"redis.get",
					map[string]any{
						"host": host,
						"port": port,
						"key":  redisKey,
					},
					[]string{"value != nil"},
					nil,
				))
			}
		}

		// Kafka producer verification: verify topics triggered by a resource CREATE.
		// Skip topics that require separate triggers (status changes, logins, etc.).
		if opts.KafkaBrokers != "" {
			brokerList := strings.Split(opts.KafkaBrokers, ",")
			brokers := make([]any, len(brokerList))
			for i, br := range brokerList {
				brokers[i] = strings.TrimSpace(br)
			}
			for _, topic := range svc.KafkaTopics {
				if topic.Direction != "produce" {
					continue
				}
				if !isCreationTopic(topic.Name) {
					continue
				}
				b.WriteString(flowStep(
					"verify_kafka_"+svcNameToID(svc.ServiceName)+"_"+strings.ReplaceAll(topic.Name, ".", "_"),
					"kafka_consumer",
					map[string]any{
						"brokers":           brokers,
						"topic":             topic.Name,
						"timeout":           "10s",
						"count":             1,
						"auto_offset_reset": "earliest",
						"from_beginning":    true,
						"group_id":          "testmesh-e2e-{{RANDOM_ID}}",
					},
					[]string{"len(messages) > 0"},
					nil,
				))
			}
		}
	}

	// DB verification steps.
	if opts.DBConnection != "" {
		// --- Section A: Immediate database_query for non-Kafka-consumer-only tables ---
		for _, svc := range sorted {
			for _, m := range svc.Models {
				if m.Table == "" {
					continue
				}

				rName := primaryResourceName(svc)
				idVar := rName + "_id"
				isKafkaConsumer := kafkaConsumerSvcs[svc.ServiceName]
				hasPrimaryID := availableIDs[idVar]

				if isPrimaryModel(m, svc) {
					// Skip if this is a Kafka-only consumer with no HTTP-created resource.
					if isKafkaConsumer && !hasPrimaryID {
						continue
					}
					// For primary models with a captured ID, verify by ID.
					if hasPrimaryID {
						b.WriteString(flowStep(
							"verify_db_"+svcNameToID(svc.ServiceName)+"_"+camelToSnake(m.Name),
							"database_query",
							map[string]any{
								"connection": opts.DBConnection,
								"query":      fmt.Sprintf("SELECT id, name FROM %s WHERE id = '{{%s}}' LIMIT 1", m.Table, idVar),
							},
							[]string{"row_count == 1"},
							nil,
						))
					}
				} else {
					// Secondary model (e.g., order_items): skip if Kafka-consumer with no parent ID.
					if isKafkaConsumer && !hasPrimaryID {
						continue
					}
					// Find a FK field that references an already-captured ID.
					fkField, fkVar := findParentFKField(m, availableIDs)
					if fkField != "" {
						b.WriteString(flowStep(
							"verify_db_"+svcNameToID(svc.ServiceName)+"_"+camelToSnake(m.Name),
							"database_query",
							map[string]any{
								"connection": opts.DBConnection,
								"query":      fmt.Sprintf("SELECT id FROM %s WHERE %s = '{{%s}}' LIMIT 5", m.Table, fkField, fkVar),
							},
							[]string{"row_count >= 1"},
							nil,
						))
					}
				}
			}
		}

		// --- Section B: db_poll for Kafka consumer services only ---
		for _, svc := range sorted {
			if !kafkaConsumerSvcs[svc.ServiceName] {
				continue
			}

			rName := primaryResourceName(svc)
			idVar := rName + "_id"
			hasPrimaryID := availableIDs[idVar]

			for _, m := range svc.Models {
				if m.Table == "" {
					continue
				}
				if !isPrimaryModel(m, svc) {
					continue
				}

				if hasPrimaryID {
					// Case 1: Consumer UPDATES its own model (e.g. product decreases inventory).
					// Pick the best trackable initial field deterministically: prefer inventory-type over price-type.
					type initialCandidate struct {
						outVar    string
						fieldName string
						score     int
					}
					var candidates []initialCandidate
					expectedPrefix := rName + "_initial_"
					for outVar, fieldName := range trackableInitials {
						if !strings.HasPrefix(outVar, expectedPrefix) {
							continue
						}
						score := 0
						for _, kw := range []string{"inventory", "stock", "count", "quantity", "available"} {
							if strings.Contains(fieldName, kw) {
								score = 1
								break
							}
						}
						candidates = append(candidates, initialCandidate{outVar, fieldName, score})
					}
					sort.Slice(candidates, func(i, j int) bool {
						if candidates[i].score != candidates[j].score {
							return candidates[i].score > candidates[j].score
						}
						return candidates[i].outVar < candidates[j].outVar
					})
					if len(candidates) > 0 {
						c := candidates[0]
						b.WriteString(flowStep(
							"poll_"+svcNameToID(svc.ServiceName)+"_"+camelToSnake(m.Name),
							"db_poll",
							map[string]any{
								"connection": opts.DBConnection,
								"query":      fmt.Sprintf("SELECT id FROM %s WHERE id = '{{%s}}' AND %s < {{%s}}", m.Table, idVar, c.fieldName, c.outVar),
								"interval":   "1s",
								"timeout":    "15s",
							},
							nil,
							nil,
						))
					} else {
						// Fallback: just verify the record exists.
						b.WriteString(flowStep(
							"poll_"+svcNameToID(svc.ServiceName)+"_"+camelToSnake(m.Name),
							"db_poll",
							map[string]any{
								"connection": opts.DBConnection,
								"query":      fmt.Sprintf("SELECT id FROM %s WHERE id = '{{%s}}'", m.Table, idVar),
								"interval":   "1s",
								"timeout":    "15s",
							},
							nil,
							nil,
						))
					}
				} else {
					// Case 2: Consumer CREATES new records (e.g. notification-service).
					// Find a FK field matching an available output to scope the poll.
					fkField, fkVar := findFKFieldMatchingOutput(m, availableIDs)
					if fkField != "" {
						b.WriteString(flowStep(
							"poll_"+svcNameToID(svc.ServiceName)+"_"+camelToSnake(m.Name),
							"db_poll",
							map[string]any{
								"connection": opts.DBConnection,
								"query":      fmt.Sprintf("SELECT id FROM %s WHERE %s = '{{%s}}' LIMIT 1", m.Table, fkField, fkVar),
								"interval":   "1s",
								"timeout":    "15s",
							},
							nil,
							nil,
						))
					} else {
						// Fallback unscoped poll.
						b.WriteString(flowStep(
							"poll_"+svcNameToID(svc.ServiceName)+"_"+camelToSnake(m.Name),
							"db_poll",
							map[string]any{
								"connection": opts.DBConnection,
								"query":      fmt.Sprintf("SELECT id FROM %s LIMIT 1", m.Table),
								"interval":   "1s",
								"timeout":    "15s",
							},
							nil,
							nil,
						))
					}
				}
				break // Only process first model with a table per Kafka consumer.
			}
		}
	}

	return b.String()
}

// buildCrossServiceBody builds a POST body for svc, injecting IDs from HTTP dependencies.
func buildCrossServiceBody(svc *ServiceAnalysis, rName string, deps []string, workspace *WorkspaceAnalysis, available map[string]bool) map[string]any {
	body := inferCreateBody(svc, rName)

	if len(deps) > 0 {
		// Remove fields that are typically server-computed aggregates.
		for _, computed := range []string{"total", "subtotal", "tax", "fee", "balance", "amount_due"} {
			delete(body, computed)
		}
	}

	for _, depName := range deps {
		depSvc := findServiceByName(workspace, depName)
		if depSvc == nil {
			continue
		}
		primaryRes := primaryResourceName(depSvc)
		idVar := primaryRes + "_id"

		if !available[idVar] {
			continue
		}

		injected := false

		// Check if the main model has this field.
		for _, m := range svc.Models {
			if !strings.EqualFold(m.Name, rName) && !strings.EqualFold(camelToSnake(m.Name), rName) {
				continue
			}
			for _, f := range m.Fields {
				if f == idVar {
					body[idVar] = "{{" + idVar + "}}"
					injected = true
					break
				}
			}
			break
		}

		// Check for an items/nested model containing both {rName}_id and idVar.
		if !injected {
			for _, m := range svc.Models {
				hasOwnerRef := false
				hasDepRef := false
				for _, f := range m.Fields {
					if f == rName+"_id" {
						hasOwnerRef = true
					}
					if f == idVar {
						hasDepRef = true
					}
				}
				if hasOwnerRef && hasDepRef {
					body["items"] = []any{
						map[string]any{
							idVar:      "{{" + idVar + "}}",
							"quantity": 1,
						},
					}
					injected = true
					break
				}
			}
		}

		// Fallback: inject directly.
		if !injected {
			body[idVar] = "{{" + idVar + "}}"
		}
	}

	return body
}

// isCreationTopic returns true if a Kafka topic name suggests it's triggered by a resource creation.
// Topics like "order.placed", "user.created", "product.created" qualify.
// Topics like "order.status.changed", "user.login", "product.inventory.changed" do not.
func isCreationTopic(name string) bool {
	creationSuffixes := []string{".created", ".placed", ".registered", ".added", ".submitted", ".inserted"}
	for _, s := range creationSuffixes {
		if strings.HasSuffix(name, s) {
			return true
		}
	}
	return false
}

// primaryResourceName returns the snake_case primary resource name for a service.
func primaryResourceName(svc *ServiceAnalysis) string {
	svcBase := svc.ServiceName
	// Strip common suffixes.
	for _, suffix := range []string{"-service", "_service"} {
		if strings.HasSuffix(svcBase, suffix) {
			svcBase = svcBase[:len(svcBase)-len(suffix)]
			break
		}
	}
	// Try to match a model.
	targetModel := strings.ReplaceAll(svcBase, "-", "")
	for _, m := range svc.Models {
		if strings.EqualFold(m.Name, targetModel) || strings.EqualFold(camelToSnake(m.Name), svcBase) {
			return camelToSnake(m.Name)
		}
	}
	// Fallback: use normalized service base name.
	return strings.ReplaceAll(svcBase, "-", "_")
}

// topoSortServices sorts services so dependencies are ordered before dependents.
func topoSortServices(services []*ServiceAnalysis, httpDeps map[string][]string) []*ServiceAnalysis {
	// Build in-degree map and adjacency.
	inDegree := map[string]int{}
	nameToSvc := map[string]*ServiceAnalysis{}
	for _, svc := range services {
		inDegree[svc.ServiceName] = 0
		nameToSvc[svc.ServiceName] = svc
	}
	for from, tos := range httpDeps {
		for _, to := range tos {
			if _, ok := nameToSvc[to]; ok {
				_ = from
				inDegree[from]++ // from depends on to, so from comes after to
			}
		}
	}

	// Kahn's algorithm: services with no dependencies (in-degree 0) go first.
	var queue []string
	for name, deg := range inDegree {
		if deg == 0 {
			queue = append(queue, name)
		}
	}
	sort.Strings(queue)

	var sorted []*ServiceAnalysis
	visited := map[string]bool{}

	for len(queue) > 0 {
		name := queue[0]
		queue = queue[1:]
		if visited[name] {
			continue
		}
		visited[name] = true
		if svc, ok := nameToSvc[name]; ok {
			sorted = append(sorted, svc)
		}
		// Reduce in-degree for services that depend on this one.
		for from, tos := range httpDeps {
			for _, to := range tos {
				if to == name {
					inDegree[from]--
					if inDegree[from] == 0 {
						queue = append(queue, from)
					}
				}
			}
		}
		sort.Strings(queue)
	}

	// Append any remaining (cycles or disconnected).
	for _, svc := range services {
		if !visited[svc.ServiceName] {
			sorted = append(sorted, svc)
		}
	}

	return sorted
}

// svcNameToID converts a service name to a valid YAML step ID prefix.
func svcNameToID(name string) string {
	return strings.ReplaceAll(name, "-", "_")
}

// findServiceByName finds a service in the workspace by name, normalizing separators.
func findServiceByName(workspace *WorkspaceAnalysis, name string) *ServiceAnalysis {
	normName := strings.ReplaceAll(name, "-", "_")
	for _, svc := range workspace.Services {
		if svc.ServiceName == name {
			return svc
		}
		if strings.ReplaceAll(svc.ServiceName, "-", "_") == normName {
			return svc
		}
	}
	return nil
}

// isPrimaryModel returns true if the model is the primary resource model of the service.
func isPrimaryModel(model Model, svc *ServiceAnalysis) bool {
	rName := primaryResourceName(svc)
	normModel := strings.ToLower(strings.ReplaceAll(model.Name, "_", ""))
	normResource := strings.ToLower(strings.ReplaceAll(rName, "_", ""))
	return strings.EqualFold(camelToSnake(model.Name), rName) || normModel == normResource
}

// findParentFKField finds a FK field in a secondary model that references an available output ID.
// e.g., in OrderItem, finds "order_id" if "order_id" is in availableIDs.
func findParentFKField(model Model, availableIDs map[string]bool) (fkField, outputVar string) {
	for _, f := range model.Fields {
		if strings.HasSuffix(f, "_id") && availableIDs[f] {
			return f, f
		}
	}
	return "", ""
}

// findFKFieldMatchingOutput finds a non-self FK field in a model matching an available output.
// Used for Kafka consumer services that create records referencing producer resources.
func findFKFieldMatchingOutput(model Model, availableIDs map[string]bool) (fkField, outputVar string) {
	for _, f := range model.Fields {
		if f == "id" || !strings.HasSuffix(f, "_id") {
			continue
		}
		if availableIDs[f] {
			return f, f
		}
	}
	return "", ""
}

func isAuthPath(path string) bool {
	p := strings.ToLower(path)
	for _, seg := range []string{"auth", "login", "logout", "signin", "signup", "token", "oauth", "session"} {
		if strings.Contains(p, "/"+seg) {
			return true
		}
	}
	return false
}

func titleCase(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
