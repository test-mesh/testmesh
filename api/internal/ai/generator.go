package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
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
	logger       *zap.Logger
	systemPrompt string
}

// NewGenerator creates a new AI flow generator
func NewGenerator(
	db *gorm.DB,
	providers *ProviderManager,
	flowRepo *repository.FlowRepository,
	logger *zap.Logger,
) *Generator {
	return &Generator{
		db:           db,
		providers:    providers,
		flowRepo:     flowRepo,
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

	// Parse OpenAPI to extract endpoints
	var openAPI struct {
		Info struct {
			Title       string `json:"title" yaml:"title"`
			Version     string `json:"version" yaml:"version"`
			Description string `json:"description" yaml:"description"`
		} `json:"info" yaml:"info"`
		Servers []struct {
			URL string `json:"url" yaml:"url"`
		} `json:"servers" yaml:"servers"`
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

Endpoints:
`, openAPI.Info.Title, openAPI.Info.Version, openAPI.Info.Description)

	for path, methods := range openAPI.Paths {
		for method, op := range methods {
			prompt += fmt.Sprintf("- %s %s: %s\n", strings.ToUpper(method), path, op.Summary)
		}
	}

	prompt += "\n" + flowYAMLInstructions + `

Generate flows that:
1. Test each endpoint with valid inputs
2. Include appropriate assertions for status codes and response structure
3. Use meaningful names based on the operation
4. Group related operations into logical flows where appropriate`

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

	return &ImportResult{
		ImportID:       importHistory.ID,
		FlowsGenerated: len(flows),
		Flows:          flows,
		FlowIDs:        flowIDs,
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

// ImportFromPact generates flows from a Pact contract
func (g *Generator) ImportFromPact(ctx context.Context, pact string, opts ImportOptions) (*ImportResult, error) {
	provider, err := g.getProvider(opts.Provider)
	if err != nil {
		return nil, err
	}

	// Parse Pact contract
	var pactContract struct {
		Consumer struct {
			Name string `json:"name"`
		} `json:"consumer"`
		Provider struct {
			Name string `json:"name"`
		} `json:"provider"`
		Interactions []struct {
			Description   string `json:"description"`
			ProviderState string `json:"providerState"`
			Request       struct {
				Method string `json:"method"`
				Path   string `json:"path"`
			} `json:"request"`
			Response struct {
				Status int `json:"status"`
			} `json:"response"`
		} `json:"interactions"`
	}

	if err := json.Unmarshal([]byte(pact), &pactContract); err != nil {
		return nil, fmt.Errorf("failed to parse Pact contract: %w", err)
	}

	name := fmt.Sprintf("%s -> %s", pactContract.Consumer.Name, pactContract.Provider.Name)

	importHistory := &models.ImportHistory{
		SourceType:    models.ImportSourcePact,
		SourceName:    name,
		SourceContent: pact,
		Status:        models.ImportStatusProcessing,
		Metadata: models.ImportMeta{
			Title:         name,
			EndpointCount: len(pactContract.Interactions),
		},
	}
	g.db.Create(importHistory)

	prompt := fmt.Sprintf(`Generate TestMesh flow YAML files from this Pact contract.

Consumer: %s
Provider: %s

Interactions:
`, pactContract.Consumer.Name, pactContract.Provider.Name)

	for _, interaction := range pactContract.Interactions {
		prompt += fmt.Sprintf("- %s %s: %s (expect status %d)\n",
			interaction.Request.Method,
			interaction.Request.Path,
			interaction.Description,
			interaction.Response.Status)
	}

	prompt += "\n" + flowYAMLInstructions

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
			results = append(results, strings.TrimSpace(match[1]))
		}
	}

	// If no code blocks found, try the entire content
	if len(results) == 0 && strings.Contains(content, "name:") && strings.Contains(content, "steps:") {
		results = append(results, strings.TrimSpace(content))
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
	ImportID       uuid.UUID
	FlowsGenerated int
	Flows          []*models.Flow
	FlowIDs        []string
}

// Prompts

const flowGenerationSystemPrompt = `You are a TestMesh flow generator. You create YAML test flow definitions for API testing.

TestMesh flows use a declarative YAML format with the following structure:
- name: The flow name
- description: What the flow tests
- suite: Optional test suite grouping
- tags: List of tags for filtering
- steps: List of test steps

Each step has:
- id: Unique identifier for the step
- action: The action type (http, assert, wait, transform, etc.)
- name: Human-readable name
- config: Action-specific configuration
- assert: List of assertions (for http steps)
- output: Variables to extract from the response

Available actions:
- http: Make HTTP requests (method, url, headers, body, timeout)
- assert: Validate values (type, actual, expected, operator)
- wait: Add delays (duration)
- transform: Transform data (input, operations, output)

Generate valid, well-structured YAML that follows best practices for API testing.`

const flowYAMLInstructions = `
Output the flow as valid YAML with these requirements:
1. Use proper YAML syntax with correct indentation
2. Include meaningful names and descriptions
3. Add appropriate assertions for status codes and response validation
4. Use template syntax {{var}} for dynamic values
5. Wrap the YAML in a code block with triple backticks and 'yaml' language identifier
`
