package ai

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/test-mesh/testmesh/internal/storage/models"
	"github.com/test-mesh/testmesh/internal/storage/repository"
	"go.uber.org/zap"
	"gopkg.in/yaml.v3"
	"gorm.io/gorm"
)

// DiffAnalyzer analyzes code changes and generates flow adaptation suggestions
type DiffAnalyzer struct {
	db           *gorm.DB
	providers    *ProviderManager
	flowRepo     *repository.FlowRepository
	repoLinkRepo *repository.RepositoryLinkRepository
	logger       *zap.Logger
}

// NewDiffAnalyzer creates a new diff analyzer
func NewDiffAnalyzer(
	db *gorm.DB,
	providers *ProviderManager,
	flowRepo *repository.FlowRepository,
	repoLinkRepo *repository.RepositoryLinkRepository,
	logger *zap.Logger,
) *DiffAnalyzer {
	return &DiffAnalyzer{
		db:           db,
		providers:    providers,
		flowRepo:     flowRepo,
		repoLinkRepo: repoLinkRepo,
		logger:       logger,
	}
}

// AnalyzeCodeChange analyzes a code diff and generates code_sync suggestions for affected flows
func (a *DiffAnalyzer) AnalyzeCodeChange(
	ctx context.Context,
	link *models.RepositoryLink,
	commitSHA string,
	diff string,
	changedFiles []string,
) ([]*models.Suggestion, error) {
	// Step 1: Determine which services were affected by the changed files
	affectedServices := a.matchServices(changedFiles, link.ServiceMappings)
	if len(affectedServices) == 0 {
		a.logger.Info("No service mappings matched changed files, skipping diff analysis",
			zap.String("commit_sha", commitSHA),
			zap.Int("changed_files", len(changedFiles)),
		)
		return nil, nil
	}

	a.logger.Info("Affected services detected",
		zap.String("commit_sha", commitSHA),
		zap.Strings("services", affectedServices),
	)

	// Step 2: Find flows tagged with any of the affected services
	flows, _, err := a.flowRepo.List(link.WorkspaceID, "", nil, 1000, 0)
	if err != nil {
		return nil, fmt.Errorf("failed to list flows: %w", err)
	}

	var affectedFlows []models.Flow
	for _, flow := range flows {
		if a.flowUsesService(flow, affectedServices) {
			affectedFlows = append(affectedFlows, flow)
		}
	}

	if len(affectedFlows) == 0 {
		a.logger.Info("No flows tagged with affected services",
			zap.Strings("services", affectedServices),
		)
		return nil, nil
	}

	// Step 3: Get AI provider
	provider, err := a.providers.GetPrimaryProvider()
	if err != nil {
		return nil, fmt.Errorf("no AI provider available: %w", err)
	}

	// Step 4: For each affected flow, generate code_sync suggestions
	var allSuggestions []*models.Suggestion
	for i := range affectedFlows {
		flow := &affectedFlows[i]

		flowYAML, err := yaml.Marshal(flow.Definition)
		if err != nil {
			a.logger.Error("Failed to marshal flow", zap.String("flow_id", flow.ID.String()), zap.Error(err))
			continue
		}

		prompt := buildCodeSyncPrompt(flow, string(flowYAML), diff, changedFiles, affectedServices)

		resp, err := provider.Generate(ctx, GenerateRequest{
			Prompt:       prompt,
			SystemPrompt: codeSyncSystemPrompt,
			MaxTokens:    4096,
			Temperature:  0.2,
		})
		if err != nil {
			a.logger.Error("AI generation failed for flow",
				zap.String("flow_id", flow.ID.String()),
				zap.Error(err),
			)
			continue
		}

		// Parse suggestions using the same pattern as self_healing.go
		suggestions := parseDiffSuggestions(resp.Content, flow)

		for _, suggestion := range suggestions {
			suggestion.FlowID = flow.ID
			suggestion.Type = models.SuggestionTypeCodeSync
			suggestion.OriginalYAML = string(flowYAML)
			suggestion.Status = models.SuggestionStatusPending
			suggestion.CommitSHA = commitSHA
			suggestion.ChangedFiles = changedFiles

			if err := a.db.Create(suggestion).Error; err != nil {
				a.logger.Error("Failed to save code_sync suggestion", zap.Error(err))
				continue
			}
			allSuggestions = append(allSuggestions, suggestion)
		}
	}

	return allSuggestions, nil
}

// matchServices returns the list of service names whose path patterns match any changed file
func (a *DiffAnalyzer) matchServices(changedFiles []string, mappings []models.ServicePathMapping) []string {
	serviceSet := map[string]bool{}
	for _, mapping := range mappings {
		for _, file := range changedFiles {
			for _, pattern := range mapping.PathPatterns {
				matched, err := filepath.Match(pattern, file)
				if err != nil {
					a.logger.Warn("Invalid path pattern", zap.String("pattern", pattern), zap.Error(err))
					continue
				}
				if matched {
					serviceSet[mapping.ServiceName] = true
					break
				}
				// Also handle prefix matching for directory patterns (e.g., "api/user-service/**")
				if strings.HasSuffix(pattern, "/**") {
					prefix := strings.TrimSuffix(pattern, "/**")
					if strings.HasPrefix(file, prefix+"/") || file == prefix {
						serviceSet[mapping.ServiceName] = true
						break
					}
				}
			}
		}
	}

	services := make([]string, 0, len(serviceSet))
	for svc := range serviceSet {
		services = append(services, svc)
	}
	return services
}

// flowUsesService checks if a flow is tagged with any of the given service names
func (a *DiffAnalyzer) flowUsesService(flow models.Flow, services []string) bool {
	for _, tag := range flow.Tags {
		for _, svc := range services {
			if tag == "service:"+svc {
				return true
			}
		}
	}
	return false
}

func buildCodeSyncPrompt(flow *models.Flow, flowYAML, diff string, changedFiles, affectedServices []string) string {
	return fmt.Sprintf(`Code has changed in the repository. Analyze whether the following test flow needs to be updated to match the new API contract or behavior.

Flow Name: %s
Flow Description: %s
Affected Services: %s
Changed Files: %s

Current Flow Definition:
%s

Code Diff:
%s

Analyze the diff and determine if the flow needs updating. If the API endpoints, request/response formats, data structures, or behavior have changed in ways that affect this test, suggest the necessary updates.

Format your response as:
## Analysis
[Your analysis of how the code changes affect this test flow]

## Suggestions
### Suggestion 1: [Title]
Type: code_sync
Confidence: [0.0-1.0]
Description: [What needs to change and why]
Reasoning: [How the code change affects this test]

`+"```yaml"+`
[Updated flow YAML if changes are needed]
`+"```"+`

If no changes are needed, say so in the Analysis section and provide no Suggestions.
`,
		flow.Name,
		flow.Description,
		strings.Join(affectedServices, ", "),
		strings.Join(changedFiles, ", "),
		flowYAML,
		diff,
	)
}

func parseDiffSuggestions(content string, flow *models.Flow) []*models.Suggestion {
	// Reuse the same parsing logic pattern from self_healing.go
	// but always set type to code_sync (handled by caller)
	engine := &SelfHealingEngine{}
	suggestions := engine.parseSuggestions(content, flow, nil)
	return suggestions
}

const codeSyncSystemPrompt = `You are a TestMesh test flow expert specializing in keeping tests synchronized with code changes.

When analyzing code diffs:
1. Identify API contract changes (new/removed/renamed endpoints, changed request/response schemas)
2. Detect data structure changes that affect test assertions or data extraction
3. Note environment or configuration changes that affect test setup
4. Assess whether the test flow still accurately tests the new behavior

Focus on:
- HTTP endpoint path or method changes
- Request body schema changes (new required fields, renamed fields, type changes)
- Response schema changes that break assertions or variable extraction
- Authentication or header requirement changes
- Status code changes

Be precise. Only suggest changes that are directly necessitated by the code diff.
Rate confidence based on how certain you are that the test needs updating.`
