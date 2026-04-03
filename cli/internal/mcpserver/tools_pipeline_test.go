package mcpserver

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/test-mesh/testmesh/internal/storage/models"
)

func TestGetTestingGuide(t *testing.T) {
	result, err := toolGetTestingGuide()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result == nil || len(result.Content) == 0 {
		t.Fatal("expected non-empty result")
	}

	text := extractText(result)
	if text == "" {
		t.Fatal("expected non-empty text content")
	}

	// Verify key section headers are present.
	sections := []string{
		"Flow Organization",
		"Assertion Patterns",
		"Setup/Teardown",
		"Async Verification",
		"Variable Chaining",
		"Edge Case Patterns",
		"Test Plan YAML Schema",
	}
	for _, section := range sections {
		if !strings.Contains(text, section) {
			t.Errorf("guide missing section: %q", section)
		}
	}
}

func TestGenerateTestPlanContext(t *testing.T) {
	demoServices := findDemoServices(t)

	result, err := toolGenerateTestPlan(map[string]any{
		"workspace_dir": demoServices,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	text := extractText(result)
	if text == "" {
		t.Fatal("expected non-empty text content")
	}

	// Should contain service names from demo-services.
	for _, svc := range []string{"user-service", "product-service", "order-service", "notification-service"} {
		if !strings.Contains(text, svc) {
			t.Errorf("plan context missing service: %q", svc)
		}
	}

	// Should contain endpoint counts.
	if !strings.Contains(text, "Endpoints:") {
		t.Error("plan context missing endpoint information")
	}

	// Should contain coverage assessment.
	if !strings.Contains(text, "Recommended Coverage") {
		t.Error("plan context missing coverage assessment")
	}

	// Should contain test plan schema.
	if !strings.Contains(text, "Test Plan Schema") {
		t.Error("plan context missing test plan schema")
	}
}

func TestGenerateFlowContext(t *testing.T) {
	demoServices := findDemoServices(t)

	result, err := toolGenerateFlow(map[string]any{
		"workspace_dir":      demoServices,
		"service_name":       "user-service",
		"category":           "happy-path",
		"action_description": "Create a user with valid data and verify DB persistence",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	text := extractText(result)
	if text == "" {
		t.Fatal("expected non-empty text content")
	}

	// Should contain service-specific details.
	if !strings.Contains(text, "user-service") {
		t.Error("flow context missing service name")
	}
	if !strings.Contains(text, "happy-path") {
		t.Error("flow context missing category")
	}
	if !strings.Contains(text, "YAML Schema Quick Reference") {
		t.Error("flow context missing YAML schema reference")
	}
	if !strings.Contains(text, "Category Guidance") {
		t.Error("flow context missing category guidance")
	}
}

func TestGenerateFlowInvalidCategory(t *testing.T) {
	demoServices := findDemoServices(t)

	result, err := toolGenerateFlow(map[string]any{
		"workspace_dir":      demoServices,
		"service_name":       "user-service",
		"category":           "invalid-category",
		"action_description": "test",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	text := extractText(result)
	if !strings.Contains(text, "ERROR") {
		t.Error("expected error for invalid category")
	}
}

func TestRunSuiteTier1(t *testing.T) {
	examplesDir := findExamplesDir(t)

	result, err := toolRunSuite(map[string]any{
		"path": examplesDir,
		"tier": float64(1),
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	text := extractText(result)
	if text == "" {
		t.Fatal("expected non-empty result")
	}

	// Should contain suite report structure.
	if !strings.Contains(text, "Suite Execution Report") {
		t.Error("missing report header")
	}
	if !strings.Contains(text, "Flows discovered:") {
		t.Error("missing flow count")
	}
	if !strings.Contains(text, "Summary") {
		t.Error("missing summary section")
	}

	// Should report results for known flows.
	if !strings.Contains(text, "Tier 1 (Structural):") {
		t.Error("missing tier 1 results")
	}
}

func TestRunSuiteTier2(t *testing.T) {
	examplesDir := findExamplesDir(t)

	result, err := toolRunSuite(map[string]any{
		"path": examplesDir,
		"tier": float64(2),
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	text := extractText(result)
	if text == "" {
		t.Fatal("expected non-empty result")
	}

	// Should contain tier 2 connectivity results (pass or fail).
	if !strings.Contains(text, "Tier 2 (Connectivity):") {
		t.Error("missing tier 2 results")
	}
}

func TestExtractBaseURL(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"http://localhost:5001/api/v1/users", "http://localhost:5001"},
		{"https://example.com/path", "https://example.com"},
		{"http://localhost:5001", "http://localhost:5001"},
		{"{{SERVICE_URL}}/api/users", ""},    // template variable — can't probe
		{"not a url", ""},
	}
	for _, tt := range tests {
		got := extractBaseURL(tt.input)
		if got != tt.want {
			t.Errorf("extractBaseURL(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestResolveFlowEnv(t *testing.T) {
	env := map[string]interface{}{
		"DB_URL":          "postgres://root:admin@localhost:5432/db",
		"USER_SERVICE_URL": "http://localhost:5001",
	}

	tests := []struct {
		input string
		want  string
	}{
		{"${DB_URL}", "postgres://root:admin@localhost:5432/db"},
		{"${USER_SERVICE_URL}/api/v1/users", "http://localhost:5001/api/v1/users"},
		{"${MISSING:-fallback}", "fallback"},
		{"${MISSING}", "${MISSING}"},                // no default, not in env
		{"plain string", "plain string"},
	}
	for _, tt := range tests {
		got := resolveFlowEnv(tt.input, env)
		if got != tt.want {
			t.Errorf("resolveFlowEnv(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestExtractInfraTargets(t *testing.T) {
	env := map[string]interface{}{
		"DB_URL":           "postgres://root:admin@localhost:5432/db",
		"USER_SERVICE_URL": "http://localhost:5001",
		"KAFKA_BROKERS":    "localhost:9092",
	}

	steps := []struct {
		step     models.Step
		wantHTTP int
		wantPG   int
		wantKafka int
		wantRedis int
	}{
		{
			step: models.Step{
				Action: "http_request",
				Config: map[string]interface{}{"url": "${USER_SERVICE_URL}/api/v1/users", "method": "GET"},
			},
			wantHTTP: 1,
		},
		{
			step: models.Step{
				Action: "database_query",
				Config: map[string]interface{}{"connection": "${DB_URL}", "query": "SELECT 1"},
			},
			wantPG: 1,
		},
		{
			step: models.Step{
				Action: "kafka_consumer",
				Config: map[string]interface{}{"brokers": []interface{}{"localhost:9092"}, "topic": "test"},
			},
			wantKafka: 1,
		},
		{
			step: models.Step{
				Action: "redis.get",
				Config: map[string]interface{}{"host": "localhost", "port": "6379", "key": "test"},
			},
			wantRedis: 1,
		},
	}

	for _, tt := range steps {
		ft := &flowTargets{}
		httpSet := map[string]bool{}
		pgSet := map[string]bool{}
		kafkaSet := map[string]bool{}
		redisSet := map[string]bool{}

		extractInfraTargets(tt.step, env, ft, httpSet, pgSet, kafkaSet, redisSet)

		if len(ft.httpURLs) != tt.wantHTTP {
			t.Errorf("step %s: httpURLs = %d, want %d", tt.step.Action, len(ft.httpURLs), tt.wantHTTP)
		}
		if len(ft.pgConns) != tt.wantPG {
			t.Errorf("step %s: pgConns = %d, want %d", tt.step.Action, len(ft.pgConns), tt.wantPG)
		}
		if len(ft.kafkaBrkrs) != tt.wantKafka {
			t.Errorf("step %s: kafkaBrkrs = %d, want %d", tt.step.Action, len(ft.kafkaBrkrs), tt.wantKafka)
		}
		if len(ft.redisAddrs) != tt.wantRedis {
			t.Errorf("step %s: redisAddrs = %d, want %d", tt.step.Action, len(ft.redisAddrs), tt.wantRedis)
		}
	}
}

func TestCategorizeFailure(t *testing.T) {
	tests := []struct {
		errMsg   string
		action   string
		wantCat  string
	}{
		{"connection refused", "", "connectivity"},
		{"dial tcp: no such host", "", "connectivity"},
		{"timeout exceeded", "", "timing"},
		{"deadline exceeded", "", "timing"},
		{"assertion failed: expected 200 got 500", "", "assertion"},
		{"variable {{user_id}} not captured", "", "variable"},
		{"unknown action: http_rquest", "", "action"},
		{"yaml: unmarshal error", "", "syntax"},
		{"some unknown error", "", "unknown"},
	}

	for _, tt := range tests {
		cat, hint := categorizeFailure(tt.errMsg, tt.action)
		if cat != tt.wantCat {
			t.Errorf("categorizeFailure(%q) = %q, want %q", tt.errMsg, cat, tt.wantCat)
		}
		if hint == "" {
			t.Errorf("categorizeFailure(%q) returned empty hint", tt.errMsg)
		}
	}
}

func TestRepairHints(t *testing.T) {
	tests := []struct {
		errMsg   string
		step     map[string]any
		wantPart string
	}{
		{
			"uses {{user_id}} but it is not captured by any prior step",
			nil,
			"output block",
		},
		{
			"unknown action \"http_rquest\"",
			map[string]any{"action": "http_rquest"},
			"Did you mean",
		},
		{
			"step 1 (http_request): id is required",
			nil,
			"unique 'id' field",
		},
		{
			"row_count assertion failed",
			map[string]any{"action": "http_request"},
			"len(body.items)",
		},
	}

	for _, tt := range tests {
		hint := repairHint(tt.errMsg, tt.step)
		if !strings.Contains(hint, tt.wantPart) {
			t.Errorf("repairHint(%q) = %q, want to contain %q", tt.errMsg, hint, tt.wantPart)
		}
	}
}

func TestCoverageAssessment(t *testing.T) {
	demoServices := findDemoServices(t)

	workspace, err := AnalyzeWorkspace(demoServices)
	if err != nil {
		t.Fatalf("AnalyzeWorkspace failed: %v", err)
	}

	assessment := generateCoverageAssessment(workspace)
	if assessment == "" {
		t.Fatal("expected non-empty assessment")
	}

	if !strings.Contains(assessment, "Recommended Coverage") {
		t.Error("missing header")
	}

	// Should contain estimates for known services.
	for _, svc := range []string{"user-service", "product-service", "order-service"} {
		if !strings.Contains(assessment, svc) {
			t.Errorf("assessment missing service: %q", svc)
		}
	}

	// Should contain flow category breakdowns.
	if !strings.Contains(assessment, "Happy path:") {
		t.Error("missing happy path estimate")
	}
	if !strings.Contains(assessment, "Error handling:") {
		t.Error("missing error handling estimate")
	}

	// Should contain total.
	if !strings.Contains(assessment, "Total recommended:") {
		t.Error("missing total recommendation")
	}
}

func TestDiscoverFlowFilesDirectory(t *testing.T) {
	examplesDir := findExamplesDir(t)

	files, err := discoverFlowFiles(examplesDir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(files) == 0 {
		t.Error("expected at least one flow file")
	}
}

func TestDiscoverFlowFilesSingleFile(t *testing.T) {
	examplesDir := findExamplesDir(t)

	// Find a single flow file.
	files, _ := discoverFlowFiles(examplesDir)
	if len(files) == 0 {
		t.Skip("no flow files found")
	}

	result, err := discoverFlowFiles(files[0])
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result) != 1 {
		t.Errorf("expected 1 file, got %d", len(result))
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func extractText(result *mcp.CallToolResult) string {
	if result == nil || len(result.Content) == 0 {
		return ""
	}
	if tc, ok := result.Content[0].(*mcp.TextContent); ok {
		return tc.Text
	}
	return ""
}

func findDemoServices(t *testing.T) string {
	t.Helper()
	// Try relative paths from the test working directory.
	candidates := []string{
		"../../../demo-services",
		"../../../../demo-services",
		filepath.Join(os.Getenv("HOME"), "Dev/testmesh/testmesh/demo-services"),
	}
	for _, c := range candidates {
		abs, _ := filepath.Abs(c)
		if _, err := os.Stat(abs); err == nil {
			if _, err := os.Stat(filepath.Join(abs, "user-service")); err == nil {
				return abs
			}
		}
	}
	t.Skip("demo-services directory not found")
	return ""
}

func findExamplesDir(t *testing.T) string {
	t.Helper()
	candidates := []string{
		"../../../examples/microservices",
		"../../../../examples/microservices",
		filepath.Join(os.Getenv("HOME"), "Dev/testmesh/testmesh/examples/microservices"),
	}
	for _, c := range candidates {
		abs, _ := filepath.Abs(c)
		if _, err := os.Stat(abs); err == nil {
			return abs
		}
	}
	t.Skip("examples/microservices directory not found")
	return ""
}
