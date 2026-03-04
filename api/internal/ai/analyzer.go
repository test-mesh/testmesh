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

// Analyzer handles API coverage analysis
type Analyzer struct {
	db        *gorm.DB
	providers *ProviderManager
	flowRepo  *repository.FlowRepository
	logger    *zap.Logger
}

// NewAnalyzer creates a new coverage analyzer
func NewAnalyzer(
	db *gorm.DB,
	providers *ProviderManager,
	flowRepo *repository.FlowRepository,
	logger *zap.Logger,
) *Analyzer {
	return &Analyzer{
		db:        db,
		providers: providers,
		flowRepo:  flowRepo,
		logger:    logger,
	}
}

// AnalyzeOpenAPICoverage analyzes how well flows cover an OpenAPI specification
func (a *Analyzer) AnalyzeOpenAPICoverage(ctx context.Context, spec string, opts AnalysisOptions) (*CoverageResult, error) {
	// Parse OpenAPI spec to extract endpoints
	endpoints, specInfo, err := a.parseOpenAPI(spec)
	if err != nil {
		return nil, fmt.Errorf("failed to parse OpenAPI spec: %w", err)
	}

	// Create analysis record
	analysis := &models.CoverageAnalysis{
		SpecType:       models.ImportSourceOpenAPI,
		SpecName:       specInfo.Title,
		SpecContent:    spec,
		Status:         models.CoverageStatusAnalyzing,
		TotalEndpoints: len(endpoints),
	}
	a.db.Create(analysis)

	// Get all flows in the workspace
	flows, _, err := a.flowRepo.List(opts.WorkspaceID, "", nil, 1000, 0)
	if err != nil {
		analysis.Status = models.CoverageStatusFailed
		analysis.Error = err.Error()
		a.db.Save(analysis)
		return nil, fmt.Errorf("failed to fetch flows: %w", err)
	}

	// Extract HTTP steps from flows
	flowEndpoints := a.extractFlowEndpoints(flows)

	// Match endpoints with flows
	covered, uncovered, partial := a.matchEndpoints(endpoints, flowEndpoints, opts.BaseURL)

	// Calculate coverage
	coveredCount := len(covered)
	coveragePercent := float64(0)
	if len(endpoints) > 0 {
		coveragePercent = float64(coveredCount) / float64(len(endpoints)) * 100
	}

	// Update analysis
	analysis.Status = models.CoverageStatusCompleted
	analysis.CoveredEndpoints = coveredCount
	analysis.CoveragePercent = coveragePercent
	analysis.Results = models.CoverageResults{
		Covered:   covered,
		Uncovered: uncovered,
		Partial:   partial,
	}
	a.db.Save(analysis)

	return &CoverageResult{
		AnalysisID:       analysis.ID,
		SpecName:         specInfo.Title,
		TotalEndpoints:   len(endpoints),
		CoveredEndpoints: coveredCount,
		CoveragePercent:  coveragePercent,
		Covered:          covered,
		Uncovered:        uncovered,
		Partial:          partial,
	}, nil
}

// GenerateMissingTests uses AI to suggest tests for uncovered endpoints
func (a *Analyzer) GenerateMissingTests(ctx context.Context, analysisID string, opts GenerateOptions) (*GenerationResult, error) {
	// Fetch analysis
	var analysis models.CoverageAnalysis
	if err := a.db.First(&analysis, "id = ?", analysisID).Error; err != nil {
		return nil, fmt.Errorf("analysis not found: %w", err)
	}

	if len(analysis.Results.Uncovered) == 0 {
		return nil, fmt.Errorf("no uncovered endpoints to generate tests for")
	}

	provider, err := a.providers.GetPrimaryProvider()
	if err != nil {
		return nil, err
	}

	// Build prompt for missing tests
	prompt := fmt.Sprintf(`Generate TestMesh flow YAML files to test the following uncovered API endpoints:

API: %s

Uncovered Endpoints:
`, analysis.SpecName)

	for _, endpoint := range analysis.Results.Uncovered {
		prompt += fmt.Sprintf("- %s %s: %s\n", endpoint.Method, endpoint.Path, endpoint.Description)
	}

	prompt += `
Generate comprehensive test flows that:
1. Test each endpoint with valid inputs
2. Include assertions for status codes and response structure
3. Cover edge cases where appropriate
4. Use meaningful names based on the operation

` + flowYAMLInstructions

	resp, err := provider.Generate(ctx, GenerateRequest{
		Prompt:       prompt,
		SystemPrompt: flowGenerationSystemPrompt,
		MaxTokens:    opts.MaxTokens,
		Temperature:  opts.Temperature,
		Model:        opts.Model,
	})
	if err != nil {
		return nil, err
	}

	yamlContent := extractYAML(resp.Content)
	if yamlContent == "" {
		return nil, fmt.Errorf("no valid YAML found in AI response")
	}

	var flowDef models.FlowDefinition
	if err := yaml.Unmarshal([]byte(yamlContent), &flowDef); err != nil {
		return nil, fmt.Errorf("generated YAML is invalid: %w", err)
	}

	return &GenerationResult{
		YAML:       yamlContent,
		FlowDef:    &flowDef,
		TokensUsed: resp.TokensUsed,
		LatencyMs:  resp.LatencyMs,
		Provider:   provider.Name(),
		Model:      resp.Model,
	}, nil
}

// Helper methods

func (a *Analyzer) parseOpenAPI(spec string) ([]models.EndpointCoverage, OpenAPIInfo, error) {
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
			return nil, OpenAPIInfo{}, err
		}
	}

	var endpoints []models.EndpointCoverage
	for path, methods := range openAPI.Paths {
		for method, op := range methods {
			endpoints = append(endpoints, models.EndpointCoverage{
				Method:      strings.ToUpper(method),
				Path:        path,
				OperationID: op.OperationID,
				Description: op.Summary,
			})
		}
	}

	info := OpenAPIInfo{
		Title:       openAPI.Info.Title,
		Version:     openAPI.Info.Version,
		Description: openAPI.Info.Description,
	}
	if len(openAPI.Servers) > 0 {
		info.BaseURL = openAPI.Servers[0].URL
	}

	return endpoints, info, nil
}

func (a *Analyzer) extractFlowEndpoints(flows []models.Flow) []FlowEndpoint {
	var endpoints []FlowEndpoint

	for _, flow := range flows {
		for _, step := range flow.Definition.Steps {
			if step.Action == "http" {
				endpoint := FlowEndpoint{
					FlowID:   flow.ID.String(),
					FlowName: flow.Name,
					StepID:   step.ID,
				}

				if method, ok := step.Config["method"].(string); ok {
					endpoint.Method = strings.ToUpper(method)
				}
				if url, ok := step.Config["url"].(string); ok {
					endpoint.URL = url
				}

				if endpoint.Method != "" && endpoint.URL != "" {
					endpoints = append(endpoints, endpoint)
				}
			}
		}
	}

	return endpoints
}

func (a *Analyzer) matchEndpoints(
	specEndpoints []models.EndpointCoverage,
	flowEndpoints []FlowEndpoint,
	baseURL string,
) (covered, uncovered, partial []models.EndpointCoverage) {

	for _, spec := range specEndpoints {
		matchedFlows := a.findMatchingFlows(spec, flowEndpoints, baseURL)

		endpoint := spec
		endpoint.FlowIDs = matchedFlows
		endpoint.Coverage = float64(len(matchedFlows)) / 1.0 // At least 1 test per endpoint is full coverage

		if len(matchedFlows) == 0 {
			endpoint.Coverage = 0
			uncovered = append(uncovered, endpoint)
		} else {
			endpoint.Coverage = 1.0
			covered = append(covered, endpoint)
		}
	}

	return
}

func (a *Analyzer) findMatchingFlows(spec models.EndpointCoverage, flowEndpoints []FlowEndpoint, baseURL string) []string {
	var matches []string
	seenFlows := make(map[string]bool)

	for _, fe := range flowEndpoints {
		if fe.Method != spec.Method {
			continue
		}

		// Check if URL matches the path
		if a.urlMatchesPath(fe.URL, spec.Path, baseURL) {
			if !seenFlows[fe.FlowID] {
				matches = append(matches, fe.FlowID)
				seenFlows[fe.FlowID] = true
			}
		}
	}

	return matches
}

func (a *Analyzer) urlMatchesPath(url, path, baseURL string) bool {
	// Remove base URL if present
	normalizedURL := url
	if baseURL != "" {
		normalizedURL = strings.TrimPrefix(url, baseURL)
	}

	// Remove common prefixes
	for _, prefix := range []string{"http://", "https://", "{{base_url}}", "{{baseUrl}}"} {
		normalizedURL = strings.TrimPrefix(normalizedURL, prefix)
	}

	// Extract path from URL (remove host if present)
	if idx := strings.Index(normalizedURL, "/"); idx > 0 && !strings.HasPrefix(normalizedURL, "/") {
		normalizedURL = normalizedURL[idx:]
	}

	// Normalize paths
	normalizedURL = normalizePath(normalizedURL)
	normalizedPath := normalizePath(path)

	// Direct match
	if normalizedURL == normalizedPath {
		return true
	}

	// Pattern match (handle path parameters)
	// Convert OpenAPI path params {id} to regex pattern
	pattern := regexp.MustCompile(`\{[^}]+\}`).ReplaceAllString(normalizedPath, `[^/]+`)
	pattern = "^" + pattern + "$"

	matched, _ := regexp.MatchString(pattern, normalizedURL)
	return matched
}

func normalizePath(path string) string {
	// Remove query string
	if idx := strings.Index(path, "?"); idx != -1 {
		path = path[:idx]
	}

	// Remove trailing slash
	path = strings.TrimSuffix(path, "/")

	// Ensure leading slash
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	// Replace template variables with placeholder
	path = regexp.MustCompile(`\{\{[^}]+\}\}`).ReplaceAllString(path, "{param}")

	return path
}

// Types

// AnalysisOptions configures coverage analysis
type AnalysisOptions struct {
	BaseURL     string    // Base URL to strip from flow URLs for matching
	WorkspaceID uuid.UUID // Workspace to analyze flows within
}

// CoverageResult holds the result of coverage analysis
type CoverageResult struct {
	AnalysisID       interface{}
	SpecName         string
	TotalEndpoints   int
	CoveredEndpoints int
	CoveragePercent  float64
	Covered          []models.EndpointCoverage
	Uncovered        []models.EndpointCoverage
	Partial          []models.EndpointCoverage
}

// FlowEndpoint represents an HTTP endpoint used in a flow
type FlowEndpoint struct {
	FlowID   string
	FlowName string
	StepID   string
	Method   string
	URL      string
}

// OpenAPIInfo holds basic info about an OpenAPI spec
type OpenAPIInfo struct {
	Title       string
	Version     string
	Description string
	BaseURL     string
}
