package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/georgi-georgiev/testmesh/internal/storage/models"
	"github.com/georgi-georgiev/testmesh/internal/storage/repository"
	"github.com/google/uuid"
	"github.com/sergi/go-diff/diffmatchpatch"
	"go.uber.org/zap"
	"gopkg.in/yaml.v3"
	"gorm.io/gorm"
)

// SelfHealingEngine analyzes failures and suggests fixes
type SelfHealingEngine struct {
	db        *gorm.DB
	providers *ProviderManager
	flowRepo  *repository.FlowRepository
	execRepo  *repository.ExecutionRepository
	logger    *zap.Logger
}

// NewSelfHealingEngine creates a new self-healing engine
func NewSelfHealingEngine(
	db *gorm.DB,
	providers *ProviderManager,
	flowRepo *repository.FlowRepository,
	execRepo *repository.ExecutionRepository,
	logger *zap.Logger,
) *SelfHealingEngine {
	return &SelfHealingEngine{
		db:        db,
		providers: providers,
		flowRepo:  flowRepo,
		execRepo:  execRepo,
		logger:    logger,
	}
}

// AnalyzeFailure analyzes a failed execution and suggests fixes
func (e *SelfHealingEngine) AnalyzeFailure(ctx context.Context, executionID uuid.UUID, workspaceID uuid.UUID) (*SuggestionResult, error) {
	// Fetch execution with details
	execution, err := e.execRepo.GetByID(executionID)
	if err != nil {
		return nil, fmt.Errorf("execution not found: %w", err)
	}

	if execution.Status != models.ExecutionStatusFailed {
		return nil, fmt.Errorf("execution is not failed, status: %s", execution.Status)
	}

	// Fetch flow
	flow, err := e.flowRepo.GetByID(execution.FlowID, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("flow not found: %w", err)
	}

	// Fetch execution steps
	steps, err := e.execRepo.GetSteps(executionID)
	if err != nil {
		return nil, fmt.Errorf("failed to get execution steps: %w", err)
	}

	// Find failed steps
	var failedSteps []models.ExecutionStep
	for _, step := range steps {
		if step.Status == models.StepStatusFailed {
			failedSteps = append(failedSteps, step)
		}
	}

	if len(failedSteps) == 0 {
		return nil, fmt.Errorf("no failed steps found in execution")
	}

	// Get AI provider
	provider, err := e.providers.GetPrimaryProvider()
	if err != nil {
		return nil, err
	}

	// Convert flow definition to YAML for analysis
	flowYAML, err := yaml.Marshal(flow.Definition)
	if err != nil {
		return nil, fmt.Errorf("failed to serialize flow: %w", err)
	}

	// Build analysis prompt
	prompt := e.buildAnalysisPrompt(flow, failedSteps, string(flowYAML))

	// Generate analysis
	resp, err := provider.Generate(ctx, GenerateRequest{
		Prompt:       prompt,
		SystemPrompt: selfHealingSystemPrompt,
		MaxTokens:    4096,
		Temperature:  0.3,
	})
	if err != nil {
		return nil, fmt.Errorf("AI analysis failed: %w", err)
	}

	// Parse suggestions from response
	suggestions := e.parseSuggestions(resp.Content, flow, execution)

	// Save suggestions to database
	var savedSuggestions []*models.Suggestion
	for _, suggestion := range suggestions {
		suggestion.FlowID = flow.ID
		suggestion.ExecutionID = &executionID
		suggestion.OriginalYAML = string(flowYAML)
		suggestion.Status = models.SuggestionStatusPending

		// Generate diff
		if suggestion.SuggestedYAML != "" {
			suggestion.DiffPatch = e.generateDiff(string(flowYAML), suggestion.SuggestedYAML)
		}

		if err := e.db.Create(suggestion).Error; err != nil {
			e.logger.Error("Failed to save suggestion", zap.Error(err))
			continue
		}
		savedSuggestions = append(savedSuggestions, suggestion)
	}

	return &SuggestionResult{
		ExecutionID:   executionID,
		FlowID:        flow.ID,
		Suggestions:   savedSuggestions,
		AnalysisNotes: e.extractAnalysisNotes(resp.Content),
	}, nil
}

// GetSuggestions retrieves suggestions for a flow
func (e *SelfHealingEngine) GetSuggestions(flowID uuid.UUID, status models.SuggestionStatus) ([]*models.Suggestion, error) {
	var suggestions []*models.Suggestion
	query := e.db.Where("flow_id = ?", flowID)
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if err := query.Order("created_at DESC").Find(&suggestions).Error; err != nil {
		return nil, err
	}
	return suggestions, nil
}

// GetSuggestion retrieves a single suggestion by ID
func (e *SelfHealingEngine) GetSuggestion(id uuid.UUID) (*models.Suggestion, error) {
	var suggestion models.Suggestion
	if err := e.db.Preload("Flow").First(&suggestion, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &suggestion, nil
}

// ApplySuggestion applies an accepted suggestion to the flow
func (e *SelfHealingEngine) ApplySuggestion(ctx context.Context, suggestionID uuid.UUID, workspaceID uuid.UUID) (*ApplyResult, error) {
	// Fetch suggestion
	var suggestion models.Suggestion
	if err := e.db.First(&suggestion, "id = ?", suggestionID).Error; err != nil {
		return nil, fmt.Errorf("suggestion not found: %w", err)
	}

	if suggestion.Status != models.SuggestionStatusAccepted && suggestion.Status != models.SuggestionStatusPending {
		return nil, fmt.Errorf("suggestion cannot be applied, status: %s", suggestion.Status)
	}

	if suggestion.SuggestedYAML == "" {
		return nil, fmt.Errorf("suggestion has no suggested YAML")
	}

	// Parse suggested YAML
	var newDefinition models.FlowDefinition
	if err := yaml.Unmarshal([]byte(suggestion.SuggestedYAML), &newDefinition); err != nil {
		return nil, fmt.Errorf("invalid suggested YAML: %w", err)
	}

	// Fetch and update flow
	flow, err := e.flowRepo.GetByID(suggestion.FlowID, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("flow not found: %w", err)
	}

	// Store original for rollback
	originalYAML, _ := yaml.Marshal(flow.Definition)

	// Apply changes
	flow.Definition = newDefinition
	flow.Name = newDefinition.Name
	flow.Description = newDefinition.Description
	flow.Suite = newDefinition.Suite
	flow.Tags = newDefinition.Tags

	if err := e.flowRepo.Update(flow, workspaceID); err != nil {
		return nil, fmt.Errorf("failed to update flow: %w", err)
	}

	// Update suggestion status
	now := time.Now()
	suggestion.Status = models.SuggestionStatusApplied
	suggestion.AppliedAt = &now
	e.db.Save(&suggestion)

	return &ApplyResult{
		SuggestionID: suggestionID,
		FlowID:       flow.ID,
		OriginalYAML: string(originalYAML),
		AppliedYAML:  suggestion.SuggestedYAML,
		Success:      true,
	}, nil
}

// RejectSuggestion marks a suggestion as rejected
func (e *SelfHealingEngine) RejectSuggestion(suggestionID uuid.UUID) error {
	return e.db.Model(&models.Suggestion{}).
		Where("id = ?", suggestionID).
		Update("status", models.SuggestionStatusRejected).Error
}

// AcceptSuggestion marks a suggestion as accepted (ready to apply)
func (e *SelfHealingEngine) AcceptSuggestion(suggestionID uuid.UUID) error {
	return e.db.Model(&models.Suggestion{}).
		Where("id = ?", suggestionID).
		Update("status", models.SuggestionStatusAccepted).Error
}

// Helper methods

func (e *SelfHealingEngine) buildAnalysisPrompt(flow *models.Flow, failedSteps []models.ExecutionStep, flowYAML string) string {
	prompt := fmt.Sprintf(`Analyze this failed test flow and suggest fixes.

Flow Name: %s
Flow Description: %s

Current Flow Definition:
%s

Failed Steps:
`, flow.Name, flow.Description, flowYAML)

	for _, step := range failedSteps {
		outputJSON, _ := json.MarshalIndent(step.Output, "", "  ")
		prompt += fmt.Sprintf(`
Step: %s (%s)
Action: %s
Error: %s
Output: %s
`, step.StepName, step.StepID, step.Action, step.ErrorMessage, string(outputJSON))
	}

	prompt += `
Analyze the failures and provide:
1. Root cause analysis
2. Specific suggestions for fixes
3. For each fix, provide the updated YAML

Format your response as:
## Analysis
[Your analysis here]

## Suggestions
### Suggestion 1: [Title]
Type: [fix/optimization/retry_strategy/assertion/timeout]
Confidence: [0.0-1.0]
Description: [What this fix does]
Reasoning: [Why this should fix the issue]

` + "```yaml" + `
[Updated flow YAML]
` + "```" + `

### Suggestion 2: [Title]
...
`
	return prompt
}

func (e *SelfHealingEngine) parseSuggestions(content string, flow *models.Flow, execution *models.Execution) []*models.Suggestion {
	var suggestions []*models.Suggestion

	// Split by suggestion headers
	suggestionPattern := regexp.MustCompile(`###\s*Suggestion\s*\d+:\s*(.+)`)
	typePattern := regexp.MustCompile(`(?i)Type:\s*(\w+)`)
	confidencePattern := regexp.MustCompile(`(?i)Confidence:\s*([\d.]+)`)
	descPattern := regexp.MustCompile(`(?i)Description:\s*(.+?)(?:\n|Reasoning)`)
	reasonPattern := regexp.MustCompile(`(?i)Reasoning:\s*(.+?)(?:\n\n|` + "```)")

	matches := suggestionPattern.FindAllStringIndex(content, -1)

	for i, match := range matches {
		var endIdx int
		if i < len(matches)-1 {
			endIdx = matches[i+1][0]
		} else {
			endIdx = len(content)
		}

		section := content[match[0]:endIdx]
		titleMatch := suggestionPattern.FindStringSubmatch(section)
		if len(titleMatch) < 2 {
			continue
		}

		suggestion := &models.Suggestion{
			Title: strings.TrimSpace(titleMatch[1]),
			Type:  models.SuggestionTypeFix,
		}

		// Extract type
		if typeMatch := typePattern.FindStringSubmatch(section); len(typeMatch) > 1 {
			suggType := strings.ToLower(strings.TrimSpace(typeMatch[1]))
			switch suggType {
			case "fix":
				suggestion.Type = models.SuggestionTypeFix
			case "optimization":
				suggestion.Type = models.SuggestionTypeOptimization
			case "retry_strategy", "retry":
				suggestion.Type = models.SuggestionTypeRetryStrategy
			case "assertion":
				suggestion.Type = models.SuggestionTypeAssertion
			case "timeout":
				suggestion.Type = models.SuggestionTypeTimeout
			}
		}

		// Extract confidence
		if confMatch := confidencePattern.FindStringSubmatch(section); len(confMatch) > 1 {
			fmt.Sscanf(confMatch[1], "%f", &suggestion.Confidence)
		} else {
			suggestion.Confidence = 0.7 // Default confidence
		}

		// Extract description
		if descMatch := descPattern.FindStringSubmatch(section); len(descMatch) > 1 {
			suggestion.Description = strings.TrimSpace(descMatch[1])
		}

		// Extract reasoning
		if reasonMatch := reasonPattern.FindStringSubmatch(section); len(reasonMatch) > 1 {
			suggestion.Reasoning = strings.TrimSpace(reasonMatch[1])
		}

		// Extract YAML
		yamlContent := extractYAML(section)
		if yamlContent != "" {
			// Validate YAML
			var flowDef models.FlowDefinition
			if err := yaml.Unmarshal([]byte(yamlContent), &flowDef); err == nil {
				suggestion.SuggestedYAML = yamlContent
			}
		}

		suggestions = append(suggestions, suggestion)
	}

	return suggestions
}

func (e *SelfHealingEngine) extractAnalysisNotes(content string) string {
	// Extract the Analysis section
	analysisPattern := regexp.MustCompile(`(?s)##\s*Analysis\s*\n(.+?)(?:##|\z)`)
	if match := analysisPattern.FindStringSubmatch(content); len(match) > 1 {
		return strings.TrimSpace(match[1])
	}
	return ""
}

func (e *SelfHealingEngine) generateDiff(original, suggested string) string {
	dmp := diffmatchpatch.New()
	diffs := dmp.DiffMain(original, suggested, false)
	return dmp.DiffPrettyText(diffs)
}

// Types

// SuggestionResult holds the result of failure analysis
type SuggestionResult struct {
	ExecutionID   uuid.UUID
	FlowID        uuid.UUID
	Suggestions   []*models.Suggestion
	AnalysisNotes string
}

// ApplyResult holds the result of applying a suggestion
type ApplyResult struct {
	SuggestionID uuid.UUID
	FlowID       uuid.UUID
	OriginalYAML string
	AppliedYAML  string
	Success      bool
	Error        string
}

// Prompts

const selfHealingSystemPrompt = `You are a TestMesh flow debugging expert. Your role is to analyze failed test executions and suggest fixes.

When analyzing failures:
1. Identify the root cause based on error messages and output
2. Consider common issues like:
   - Incorrect assertions
   - Missing retry configuration for flaky operations
   - Timeout issues
   - Wrong HTTP methods or paths
   - Missing or incorrect headers
   - Data extraction issues with JSONPath
   - Environment or variable problems

3. Suggest specific, actionable fixes
4. Provide updated YAML that can be directly applied
5. Rate your confidence in each suggestion

Be precise and practical. Focus on fixes that directly address the observed failures.`
