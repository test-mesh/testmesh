package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/test-mesh/testmesh/internal/storage/models"
	"github.com/test-mesh/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gopkg.in/yaml.v3"
	"gorm.io/gorm"
)

// Generator handles AI-powered flow generation
type Generator struct {
	db           *gorm.DB
	providers    *ProviderManager
	flowRepo     *repository.FlowRepository
	envRepo      *repository.EnvironmentRepository
	logger       *zap.Logger
	systemPrompt string
}

// NewGenerator creates a new AI flow generator
func NewGenerator(
	db *gorm.DB,
	providers *ProviderManager,
	flowRepo *repository.FlowRepository,
	envRepo *repository.EnvironmentRepository,
	logger *zap.Logger,
) *Generator {
	return &Generator{
		db:           db,
		providers:    providers,
		flowRepo:     flowRepo,
		envRepo:      envRepo,
		logger:       logger,
		systemPrompt: flowGenerationSystemPrompt,
	}
}

// GenerateFromPrompt generates a test flow from natural language
func (g *Generator) GenerateFromPrompt(ctx context.Context, prompt string, opts GenerateOptions) (*GenerationResult, error) {
	// Get provider
	provider, err := g.getProvider(opts.Provider)
	if err != nil {
		return nil, err
	}

	// Create generation history record
	history := &models.GenerationHistory{
		Provider: provider.Name(),
		Model:    opts.Model,
		Prompt:   prompt,
		Status:   models.GenerationStatusProcessing,
		Metadata: models.GenerationMeta{
			Temperature:  opts.Temperature,
			MaxTokens:    opts.MaxTokens,
			SystemPrompt: g.systemPrompt,
			SourceType:   "prompt",
		},
	}
	g.db.Create(history)

	// Build the full prompt
	fullPrompt := fmt.Sprintf(`Generate a TestMesh flow YAML for the following requirement:

%s

%s`, prompt, flowYAMLInstructions)

	// Generate using AI
	resp, err := provider.Generate(ctx, GenerateRequest{
		Prompt:       fullPrompt,
		SystemPrompt: g.systemPrompt,
		MaxTokens:    opts.MaxTokens,
		Temperature:  opts.Temperature,
		Model:        opts.Model,
	})
	if err != nil {
		history.Status = models.GenerationStatusFailed
		history.Error = err.Error()
		g.db.Save(history)
		return nil, err
	}

	// Extract YAML from response
	yamlContent := extractYAML(resp.Content)
	if yamlContent == "" {
		history.Status = models.GenerationStatusFailed
		history.Error = "no valid YAML found in response"
		g.db.Save(history)
		return nil, fmt.Errorf("no valid YAML found in AI response")
	}

	// Validate the YAML
	var flowDef models.FlowDefinition
	if err := yaml.Unmarshal([]byte(yamlContent), &flowDef); err != nil {
		history.Status = models.GenerationStatusFailed
		history.Error = fmt.Sprintf("invalid YAML: %v", err)
		g.db.Save(history)
		return nil, fmt.Errorf("generated YAML is invalid: %w", err)
	}

	// Update history
	history.Status = models.GenerationStatusCompleted
	history.GeneratedYAML = yamlContent
	history.TokensUsed = resp.TokensUsed
	history.LatencyMs = resp.LatencyMs
	g.db.Save(history)

	return &GenerationResult{
		HistoryID:    history.ID,
		YAML:         yamlContent,
		FlowDef:      &flowDef,
		TokensUsed:   resp.TokensUsed,
		LatencyMs:    resp.LatencyMs,
		Provider:     provider.Name(),
		Model:        resp.Model,
	}, nil
}

// ImportFromOpenAPI generates flows from an OpenAPI specification
func (g *Generator) ImportFromOpenAPI(ctx context.Context, spec string, opts ImportOptions) (*ImportResult, error) {
	provider, err := g.getProvider(opts.Provider)
	if err != nil {
		return nil, err
	}

	// Parse OpenAPI to extract endpoints (supports both OpenAPI 3.x and Swagger 2.0)
	var openAPI struct {
		Info struct {
			Title       string `json:"title" yaml:"title"`
			Version     string `json:"version" yaml:"version"`
			Description string `json:"description" yaml:"description"`
		} `json:"info" yaml:"info"`
		// OpenAPI 3.x
		Servers []struct {
			URL string `json:"url" yaml:"url"`
		} `json:"servers" yaml:"servers"`
		// Swagger 2.0
		Host     string `json:"host" yaml:"host"`
		BasePath string `json:"basePath" yaml:"basePath"`
		Schemes  []string `json:"schemes" yaml:"schemes"`
		Paths map[string]map[string]struct {
			OperationID string   `json:"operationId" yaml:"operationId"`
			Summary     string   `json:"summary" yaml:"summary"`
			Description string   `json:"description" yaml:"description"`
			Tags        []string `json:"tags" yaml:"tags"`
		} `json:"paths" yaml:"paths"`
	}

	// Try JSON first, then YAML
	if err := json.Unmarshal([]byte(spec), &openAPI); err != nil {
		if err := yaml.Unmarshal([]byte(spec), &openAPI); err != nil {
			return nil, fmt.Errorf("failed to parse OpenAPI spec: %w", err)
		}
	}

	// Derive base URL: prefer OpenAPI 3.x servers, fall back to Swagger 2.0 host
	baseURL := ""
	if len(openAPI.Servers) > 0 {
		baseURL = openAPI.Servers[0].URL
	} else if openAPI.Host != "" {
		scheme := "https"
		if len(openAPI.Schemes) > 0 {
			scheme = openAPI.Schemes[0]
		}
		baseURL = scheme + "://" + openAPI.Host + openAPI.BasePath
	}

	serviceVarName := deriveServiceVarName(openAPI.Info.Title)

	// Create import history
	importHistory := &models.ImportHistory{
		SourceType:    models.ImportSourceOpenAPI,
		SourceName:    openAPI.Info.Title,
		SourceContent: spec,
		Status:        models.ImportStatusProcessing,
		Metadata: models.ImportMeta{
			Version:     openAPI.Info.Version,
			Title:       openAPI.Info.Title,
			Description: openAPI.Info.Description,
		},
	}
	g.db.Create(importHistory)

	// Count endpoints
	endpointCount := 0
	for _, methods := range openAPI.Paths {
		endpointCount += len(methods)
	}
	importHistory.Metadata.EndpointCount = endpointCount

	// Build prompt for flow generation
	prompt := fmt.Sprintf(`Generate TestMesh flow YAML files for the following OpenAPI specification.
Create a separate flow for each endpoint or logical grouping of related endpoints.

API: %s (v%s)
Description: %s
Base URL: %s

Endpoints:
`, openAPI.Info.Title, openAPI.Info.Version, openAPI.Info.Description, baseURL)

	for path, methods := range openAPI.Paths {
		for method, op := range methods {
			prompt += fmt.Sprintf("- %s %s: URL = {{%s}}%s — %s\n", strings.ToUpper(method), path, serviceVarName, path, op.Summary)
		}
	}

	prompt += "\n" + flowYAMLInstructions + fmt.Sprintf(`

Generate flows that:
1. Test each endpoint with valid inputs
2. Include appropriate assertions for status codes and response structure
3. Use meaningful names based on the operation
4. Group related operations into logical flows where appropriate
5. CRITICAL: Use {{%s}} as the base URL in all http_request URLs (e.g. url: "{{%s}}/path"). Do NOT use the literal string "%s" or {{base_url}} or any other placeholder.`, serviceVarName, serviceVarName, baseURL)

	// Generate flows
	resp, err := provider.Generate(ctx, GenerateRequest{
		Prompt:       prompt,
		SystemPrompt: g.systemPrompt,
		MaxTokens:    8192,
		Temperature:  0.5,
		Model:        opts.Model,
	})
	if err != nil {
		importHistory.Status = models.ImportStatusFailed
		importHistory.Error = err.Error()
		g.db.Save(importHistory)
		return nil, err
	}

	// Extract all YAML blocks
	yamlBlocks := extractMultipleYAML(resp.Content)
	if len(yamlBlocks) == 0 {
		importHistory.Status = models.ImportStatusFailed
		importHistory.Error = "no valid YAML found in response"
		g.db.Save(importHistory)
		return nil, fmt.Errorf("no valid YAML found in AI response")
	}

	// Create flows
	var flowIDs []string
	var flows []*models.Flow
	for _, yamlContent := range yamlBlocks {
		var flowDef models.FlowDefinition
		if err := yaml.Unmarshal([]byte(yamlContent), &flowDef); err != nil {
			g.logger.Warn("Skipping invalid YAML block", zap.Error(err))
			continue
		}

		flow := &models.Flow{
			Name:        flowDef.Name,
			Description: flowDef.Description,
			Suite:       flowDef.Suite,
			Tags:        flowDef.Tags,
			Definition:  flowDef,
			Environment: "default",
		}

		if opts.CreateFlows {
			if err := g.flowRepo.Create(flow, opts.WorkspaceID); err != nil {
				g.logger.Error("Failed to create flow", zap.Error(err))
				continue
			}
		}

		flows = append(flows, flow)
		flowIDs = append(flowIDs, flow.ID.String())
	}

	// Update import history
	importHistory.Status = models.ImportStatusCompleted
	importHistory.FlowsGenerated = len(flows)
	importHistory.FlowIDs = flowIDs
	g.db.Save(importHistory)

	// Add the service URL variable to all workspace environments that don't already have it
	if baseURL != "" && opts.WorkspaceID != uuid.Nil {
		g.upsertEnvVariable(opts.WorkspaceID, serviceVarName, baseURL)
	}

	return &ImportResult{
		ImportID:        importHistory.ID,
		FlowsGenerated:  len(flows),
		Flows:           flows,
		FlowIDs:         flowIDs,
		DetectedBaseURL: baseURL,
		ServiceVarName:  serviceVarName,
	}, nil
}

// ImportFromPostman generates flows from a Postman collection
func (g *Generator) ImportFromPostman(ctx context.Context, collection string, opts ImportOptions) (*ImportResult, error) {
	provider, err := g.getProvider(opts.Provider)
	if err != nil {
		return nil, err
	}

	// Parse Postman collection
	var postman struct {
		Info struct {
			Name        string `json:"name"`
			Description string `json:"description"`
		} `json:"info"`
		Item []struct {
			Name    string `json:"name"`
			Request struct {
				Method string `json:"method"`
				URL    struct {
					Raw string `json:"raw"`
				} `json:"url"`
				Description string `json:"description"`
			} `json:"request"`
		} `json:"item"`
	}

	if err := json.Unmarshal([]byte(collection), &postman); err != nil {
		return nil, fmt.Errorf("failed to parse Postman collection: %w", err)
	}

	// Create import history
	importHistory := &models.ImportHistory{
		SourceType:    models.ImportSourcePostman,
		SourceName:    postman.Info.Name,
		SourceContent: collection,
		Status:        models.ImportStatusProcessing,
		Metadata: models.ImportMeta{
			Title:         postman.Info.Name,
			Description:   postman.Info.Description,
			EndpointCount: len(postman.Item),
		},
	}
	g.db.Create(importHistory)

	// Build prompt
	prompt := fmt.Sprintf(`Generate TestMesh flow YAML files from this Postman collection.

Collection: %s
Description: %s

Requests:
`, postman.Info.Name, postman.Info.Description)

	for _, item := range postman.Item {
		prompt += fmt.Sprintf("- %s %s: %s\n", item.Request.Method, item.Request.URL.Raw, item.Name)
	}

	prompt += "\n" + flowYAMLInstructions

	// Generate flows
	resp, err := provider.Generate(ctx, GenerateRequest{
		Prompt:       prompt,
		SystemPrompt: g.systemPrompt,
		MaxTokens:    8192,
		Temperature:  0.5,
		Model:        opts.Model,
	})
	if err != nil {
		importHistory.Status = models.ImportStatusFailed
		importHistory.Error = err.Error()
		g.db.Save(importHistory)
		return nil, err
	}

	yamlBlocks := extractMultipleYAML(resp.Content)
	if len(yamlBlocks) == 0 {
		importHistory.Status = models.ImportStatusFailed
		importHistory.Error = "no valid YAML found in response"
		g.db.Save(importHistory)
		return nil, fmt.Errorf("no valid YAML found in AI response")
	}

	var flowIDs []string
	var flows []*models.Flow
	for _, yamlContent := range yamlBlocks {
		var flowDef models.FlowDefinition
		if err := yaml.Unmarshal([]byte(yamlContent), &flowDef); err != nil {
			continue
		}

		flow := &models.Flow{
			Name:        flowDef.Name,
			Description: flowDef.Description,
			Suite:       flowDef.Suite,
			Tags:        flowDef.Tags,
			Definition:  flowDef,
			Environment: "default",
		}

		if opts.CreateFlows {
			if err := g.flowRepo.Create(flow, opts.WorkspaceID); err != nil {
				continue
			}
		}

		flows = append(flows, flow)
		flowIDs = append(flowIDs, flow.ID.String())
	}

	importHistory.Status = models.ImportStatusCompleted
	importHistory.FlowsGenerated = len(flows)
	importHistory.FlowIDs = flowIDs
	g.db.Save(importHistory)

	return &ImportResult{
		ImportID:       importHistory.ID,
		FlowsGenerated: len(flows),
		Flows:          flows,
		FlowIDs:        flowIDs,
	}, nil
}

// Helper methods

func (g *Generator) getProvider(providerName models.AIProviderType) (Provider, error) {
	if providerName != "" {
		return g.providers.GetProvider(providerName)
	}
	return g.providers.GetPrimaryProvider()
}

func extractYAML(content string) string {
	// Try to extract YAML from markdown code blocks
	re := regexp.MustCompile("```(?:yaml|yml)?\\s*\\n([\\s\\S]*?)\\n```")
	matches := re.FindStringSubmatch(content)
	if len(matches) > 1 {
		return strings.TrimSpace(matches[1])
	}

	// If no code block, check if the entire content is YAML
	if strings.Contains(content, "name:") && strings.Contains(content, "steps:") {
		return strings.TrimSpace(content)
	}

	return ""
}

func extractMultipleYAML(content string) []string {
	var results []string

	// Extract all code blocks
	re := regexp.MustCompile("```(?:yaml|yml)?\\s*\\n([\\s\\S]*?)\\n```")
	matches := re.FindAllStringSubmatch(content, -1)
	for _, match := range matches {
		if len(match) > 1 {
			results = append(results, splitYAMLDocuments(match[1])...)
		}
	}

	// If no code blocks found, try the entire content
	if len(results) == 0 && strings.Contains(content, "name:") && strings.Contains(content, "steps:") {
		results = append(results, splitYAMLDocuments(content)...)
	}

	return results
}

// upsertEnvVariable adds key=value to all environments in a workspace that don't already have that key.
func (g *Generator) upsertEnvVariable(workspaceID uuid.UUID, key, value string) {
	if g.envRepo == nil || workspaceID == uuid.Nil || key == "" || value == "" {
		return
	}
	envs, _, err := g.envRepo.List(workspaceID, nil)
	if err != nil {
		g.logger.Warn("Failed to list environments for env var upsert", zap.Error(err))
		return
	}
	for _, env := range envs {
		alreadySet := false
		for _, v := range env.Variables {
			if v.Key == key {
				alreadySet = true
				break
			}
		}
		if alreadySet {
			continue
		}
		env.Variables = append(env.Variables, models.EnvironmentVariable{
			Key:     key,
			Value:   value,
			Enabled: true,
		})
		if err := g.envRepo.Update(env, workspaceID); err != nil {
			g.logger.Warn("Failed to upsert env variable", zap.String("env", env.Name), zap.Error(err))
		}
	}
}

// deriveServiceVarName converts an API title to a snake_case environment variable name.
// e.g. "Spider Service" → "spider_service_url", "My REST API v2" → "my_rest_api_v2_url"
func deriveServiceVarName(title string) string {
	lower := strings.ToLower(title)
	re := regexp.MustCompile(`[^a-z0-9]+`)
	slug := strings.Trim(re.ReplaceAllString(lower, "_"), "_")
	if slug == "" {
		slug = "service"
	}
	return slug + "_url"
}

// splitYAMLDocuments splits a string containing multiple YAML documents separated by "---"
func splitYAMLDocuments(content string) []string {
	var results []string
	// Split on YAML document separator
	docs := regexp.MustCompile(`(?m)^---\s*$`).Split(content, -1)
	for _, doc := range docs {
		doc = strings.TrimSpace(doc)
		if doc != "" && strings.Contains(doc, "steps:") {
			results = append(results, doc)
		}
	}
	// If no separator found, return the whole content as-is
	if len(results) == 0 {
		content = strings.TrimSpace(content)
		if content != "" {
			results = append(results, content)
		}
	}
	return results
}

// Types

// GenerateOptions configures flow generation
type GenerateOptions struct {
	Provider    models.AIProviderType
	Model       string
	MaxTokens   int
	Temperature float64
}

// GenerationResult holds the result of flow generation
type GenerationResult struct {
	HistoryID  uuid.UUID
	YAML       string
	FlowDef    *models.FlowDefinition
	TokensUsed int
	LatencyMs  int64
	Provider   models.AIProviderType
	Model      string
}

// ImportOptions configures import operations
type ImportOptions struct {
	Provider    models.AIProviderType
	Model       string
	CreateFlows bool      // If true, creates flows in database
	WorkspaceID uuid.UUID // Workspace to create flows in
}

// ImportResult holds the result of an import operation
type ImportResult struct {
	ImportID        uuid.UUID
	FlowsGenerated  int
	Flows           []*models.Flow
	FlowIDs         []string
	DetectedBaseURL string
	ServiceVarName  string
}

// Prompts

const flowGenerationSystemPrompt = `You are a TestMesh flow generator. You create YAML test flow definitions for API testing.

CRITICAL: Follow this exact schema — do not deviate from the types and field names below.

## Top-level flow fields
name: string (required)
description: string (optional)
suite: string (optional)
tags: list of strings (optional)
env: map of key/value pairs (optional)
setup: list of steps (optional)
steps: list of steps (required)
teardown: list of steps (optional)

## Step fields
id: string (unique identifier)
action: string (see available actions below)
name: string (human-readable label)
description: string (optional)
config: map of key/value pairs (structure depends on action, see below)
assert: list of PLAIN STRINGS — boolean expression strings only, e.g. "response.status == 200" — NEVER objects
output: flat map where every value is a plain string JSONPath, e.g. {user_id: "$.body.id"} — NEVER nested objects
retry: {max_attempts: int, delay: "1s", backoff: "exponential"} (optional)
timeout: "30s" (optional)

## Available actions and their config fields

### http_request
config:
  method: "GET"|"POST"|"PUT"|"DELETE"|"PATCH" (required)
  url: string (required)
  headers: map[string]string (optional)
  body: any (optional, for POST/PUT/PATCH)

### database_query
config:
  connection: string (required, PostgreSQL DSN — MUST use env var reference e.g. "${DB_URL}", never hardcode)
  query: string (required, SQL query)
  params: list of values (optional, for parameterized queries)

### kafka_producer
config:
  brokers: list of strings or comma-separated string (required, e.g. ["localhost:9092"])
  topic: string (required)
  payload: any (required — the message value, NOT "value")
  key: string (optional)
  headers: map[string]string (optional)

### kafka_consumer
config:
  brokers: list of strings (required)
  topic: string (required)
  group_id: string (required)
  timeout: duration string (required, e.g. "30s")
  max_messages: int (optional)

### delay
config:
  duration: string (required, e.g. "1s", "500ms", "2m")

### assert
config:
  data: any (required, the value to assert against)
  assertions: list of strings (required, expression strings)

### transform
config:
  input: any (required)
  transforms: map where each value is a JSONPath string like "$.field"

### log
config:
  level: "debug"|"info"|"warn"|"error" (optional, default "info")
  message: string (required)
  data: any (optional)

### condition
config:
  condition: string (required, boolean expression, e.g. "{{status}} == 200")

### for_each
config:
  items: list (required, array to iterate over)
  item_name: string (optional, default "item")

## IMPORTANT RULES
1. assert on a step must be a list of plain boolean expression strings — NEVER objects or maps
2. output must be a flat map where every value is a plain string JSONPath — NEVER nested objects
3. action names are EXACTLY as listed above (e.g. http_request, NOT http; delay, NOT wait)
4. database connection is a DSN string, NOT an object
5. kafka message field is "payload", NOT "value"
6. NEVER hardcode hostnames, ports, credentials, or connection strings — ALWAYS use env var references
   - HTTP URLs: use "${SERVICE_URL}/path" not "http://localhost:5001/path"
   - DB connections: use "${DB_URL}" not "postgres://user:pass@localhost:5432/db"
   - Kafka brokers: use "${KAFKA_BROKERS}" not "localhost:9092"
   - Redis host/port: use "${REDIS_HOST}" / "${REDIS_PORT}" not "localhost"
   Preferred: use env_file: .env.test and keep infra vars in that file.
   Fallback (single flow): emit an env: block with default values for every variable used.
   env_file example:
7. Write precise assertions — shallow assertions give false confidence:
   - NEVER use permissive OR assertions: "status == 200 || status == 404" catches nothing
   - kafka_consumer: verify payload fields, not just delivery:
       WRONG:   assert: [len(messages) > 0]
       CORRECT: assert: [len(messages) == 1, messages[0].value.user_id == user_id, messages[0].value.status == "active"]
   - Cross-step comparisons: capture baseline before action, assert delta after:
       output: { count_before: "$.body.total" }  → assert: body.total == count_before + 1
   - Verify created entity fields match what was sent:
       WRONG:   assert: [status == 201, body.id != nil]
       CORRECT: assert: [status == 201, body.id != nil, body.name == name, body.email == email, body.owner_id == user_id]
     flow:
       env_file: .env.test
   .env.test template (output as a comment or separate block when generating a suite):
     # --- Service URLs ---
     CATALOG_URL=http://localhost:5580
     # --- Database connections ---
     DB_CATALOG=postgres://root:admin@localhost:5432/catalog?sslmode=disable
     # --- Infrastructure ---
     KAFKA_BROKERS=localhost:9092
     REDIS_HOST=localhost
     REDIS_PORT=6379
     # --- Kafka topics ---
     TOPIC_UPLOAD=myapp.file.uploaded

## Output variable references
Steps can reference previous step outputs using {{step_id.variable_name}} syntax.
The http_request action exposes: response.status, response.body, response.headers, response.duration_ms`

const flowYAMLInstructions = `
Output the flow as valid YAML with these requirements:
1. Use proper YAML syntax with correct indentation
2. Use exact action names: http_request, database_query, kafka_producer, kafka_consumer, delay, assert, transform, log, condition, for_each
3. assert fields must be lists of plain expression strings, e.g.:
   assert:
     - response.status == 201
     - response.body.id != ""
4. output fields must be flat string maps, e.g.:
   output:
     user_id: "$.body.id"
5. Use template syntax {{var}} for dynamic values from previous steps
6. NEVER hardcode hosts, ports, credentials, or DSNs — reference ${VAR} or {{VAR}} in config values.
   Preferred: use env_file: .env.test (shared across the suite). Fallback for standalone flows:
   include an env: block with default values for every infra variable.
   Example with env_file:
     flow:
       name: "My Flow"
       env_file: .env.test
   Example with inline env: (single flow only):
     flow:
       name: "My Flow"
       env:
         BASE_URL: "http://localhost:5001"
         DB_URL: "postgres://root:admin@localhost:5432/mydb?sslmode=disable"
         KAFKA_BROKERS: "localhost:9092"
         REDIS_HOST: "localhost"
         REDIS_PORT: "6379"
7. Wrap the YAML in a code block with triple backticks and 'yaml' language identifier
`
