package telemetry

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/ai"
	"go.uber.org/zap"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// GORMExecRepoAdapter implements ExecRepoReader on top of a *gorm.DB instance.
// It is instantiated in routes.go so the telemetry package avoids a direct import
// of the storage/repository package.
type GORMExecRepoAdapter struct {
	db *gorm.DB
}

// NewGORMExecRepoAdapter creates an ExecRepoReader backed by GORM.
func NewGORMExecRepoAdapter(db *gorm.DB) *GORMExecRepoAdapter {
	return &GORMExecRepoAdapter{db: db}
}

func (a *GORMExecRepoAdapter) GetByTraceID(ctx context.Context, traceID string) (*execRecord, error) {
	// executions.executions has a trace_id column; join flows to get workspace_id.
	type row struct {
		ID          uuid.UUID `gorm:"column:id"`
		FlowID      uuid.UUID `gorm:"column:flow_id"`
		Status      string    `gorm:"column:status"`
		WorkspaceID uuid.UUID `gorm:"column:workspace_id"`
	}
	var r row
	err := a.db.WithContext(ctx).
		Raw(`SELECT e.id, e.flow_id, e.status, f.workspace_id
			   FROM executions.executions e
			   JOIN flows f ON f.id = e.flow_id
			  WHERE e.trace_id = ?
			  LIMIT 1`, traceID).
		Scan(&r).Error
	if err != nil {
		return nil, err
	}
	if r.ID == uuid.Nil {
		return nil, gorm.ErrRecordNotFound
	}
	return &execRecord{
		ID:          r.ID,
		FlowID:      r.FlowID,
		Status:      r.Status,
		WorkspaceID: r.WorkspaceID,
	}, nil
}

func (a *GORMExecRepoAdapter) GetSteps(ctx context.Context, execID uuid.UUID) ([]stepRecord, error) {
	type row struct {
		StepID       string    `gorm:"column:step_id"`
		StepName     string    `gorm:"column:step_name"`
		Action       string    `gorm:"column:action"`
		Status       string    `gorm:"column:status"`
		ErrorMessage string    `gorm:"column:error_message"`
		Output       []byte    `gorm:"column:output"`
		StartedAt    *time.Time `gorm:"column:started_at"`
		FinishedAt   *time.Time `gorm:"column:finished_at"`
	}
	var rows []row
	err := a.db.WithContext(ctx).
		Raw(`SELECT step_id, step_name, action, status, error_message, output, started_at, finished_at
			   FROM executions.execution_steps
			  WHERE execution_id = ?
			  ORDER BY created_at ASC`, execID).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	records := make([]stepRecord, 0, len(rows))
	for _, r := range rows {
		var output map[string]interface{}
		if len(r.Output) > 0 {
			_ = json.Unmarshal(r.Output, &output)
		}
		records = append(records, stepRecord{
			StepID:       r.StepID,
			StepName:     r.StepName,
			Action:       r.Action,
			Status:       r.Status,
			ErrorMessage: r.ErrorMessage,
			Output:       output,
			StartedAt:    r.StartedAt,
			FinishedAt:   r.FinishedAt,
		})
	}
	return records, nil
}

func (a *GORMExecRepoAdapter) GetFlowYAML(ctx context.Context, flowID uuid.UUID) (string, error) {
	var defJSON []byte
	err := a.db.WithContext(ctx).
		Raw(`SELECT definition FROM flows WHERE id = ? LIMIT 1`, flowID).
		Scan(&defJSON).Error
	if err != nil {
		return "", err
	}
	if len(defJSON) == 0 {
		return "", fmt.Errorf("flow %s not found", flowID)
	}
	// The definition is stored as JSONB; return it as pretty-printed JSON so the LLM can read it.
	var pretty interface{}
	if err := json.Unmarshal(defJSON, &pretty); err != nil {
		return string(defJSON), nil
	}
	out, _ := json.MarshalIndent(pretty, "", "  ")
	return string(out), nil
}

// RepairSuggestion is an AI-generated fix for a failed execution step.
type RepairSuggestion struct {
	ID          uuid.UUID  `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	ExecutionID uuid.UUID  `gorm:"type:uuid;not null;index" json:"execution_id"`
	WorkspaceID uuid.UUID  `gorm:"type:uuid;not null;index" json:"workspace_id"`
	StepID      string     `json:"step_id"`
	Diagnosis   string     `json:"diagnosis"`
	YAMLDiff    string     `json:"yaml_diff"`
	FixedYAML   string     `json:"fixed_yaml"`
	Confidence  float64    `json:"confidence"`
	Status      string     `gorm:"default:'pending'" json:"status"`
	AppliedAt   *time.Time `json:"applied_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

func (RepairSuggestion) TableName() string { return "telemetry.repair_suggestions" }

// ExecRepoReader is the minimal interface ExecutionLinker needs from the execution repo.
type ExecRepoReader interface {
	GetByTraceID(ctx context.Context, traceID string) (*execRecord, error)
	GetSteps(ctx context.Context, execID uuid.UUID) ([]stepRecord, error)
	GetFlowYAML(ctx context.Context, flowID uuid.UUID) (string, error)
}

type execRecord struct {
	ID          uuid.UUID
	FlowID      uuid.UUID
	Status      string
	WorkspaceID uuid.UUID
}

type stepRecord struct {
	StepID       string
	StepName     string
	Action       string
	Status       string
	ErrorMessage string
	Output       map[string]interface{}
	StartedAt    *time.Time
	FinishedAt   *time.Time
}

// ExecutionLinker bridges trace completions to execution records and triggers AI repair analysis.
type ExecutionLinker struct {
	repo      *TelemetryRepository
	execRepo  ExecRepoReader
	providers *ai.ProviderManager
	db        *gorm.DB
	logger    *zap.Logger
}

// NewExecutionLinker creates an ExecutionLinker. execRepo and providers may be nil; the linker
// degrades gracefully when they are absent.
func NewExecutionLinker(repo *TelemetryRepository, execRepo interface{}, providers interface{}, logger *zap.Logger) *ExecutionLinker {
	pm, _ := providers.(*ai.ProviderManager)
	er, _ := execRepo.(ExecRepoReader)
	return &ExecutionLinker{
		repo:      repo,
		execRepo:  er,
		providers: pm,
		db:        repo.db,
		logger:    logger,
	}
}

// LinkTrace is called after a trace completes. It looks up the matching execution and, if the
// execution failed and has not yet been analyzed, spawns a goroutine to generate repair suggestions.
func (l *ExecutionLinker) LinkTrace(ctx context.Context, workspaceID uuid.UUID, traceID string) error {
	if l.execRepo == nil {
		return nil
	}

	exec, err := l.execRepo.GetByTraceID(ctx, traceID)
	if err != nil {
		return nil // no matching execution — normal case
	}
	if exec.Status != "failed" {
		return nil
	}

	var count int64
	l.db.WithContext(ctx).Model(&RepairSuggestion{}).
		Where("execution_id = ?", exec.ID).Count(&count)
	if count > 0 {
		return nil // already analyzed
	}

	go func() {
		bgCtx := context.Background()
		if err := l.analyze(bgCtx, exec, traceID); err != nil {
			l.logger.Warn("repair analysis failed",
				zap.String("execution_id", exec.ID.String()),
				zap.Error(err))
		}
	}()

	return nil
}

func (l *ExecutionLinker) analyze(ctx context.Context, exec *execRecord, traceID string) error {
	steps, err := l.execRepo.GetSteps(ctx, exec.ID)
	if err != nil {
		return fmt.Errorf("get steps: %w", err)
	}

	var failedSteps []stepRecord
	for _, s := range steps {
		if s.Status == "failed" {
			failedSteps = append(failedSteps, s)
		}
	}
	if len(failedSteps) == 0 {
		return nil
	}

	spans, err := l.repo.GetSpansByTraceID(ctx, exec.WorkspaceID, traceID)
	if err != nil {
		return fmt.Errorf("get spans: %w", err)
	}

	flowYAML, err := l.execRepo.GetFlowYAML(ctx, exec.FlowID)
	if err != nil {
		return fmt.Errorf("get flow yaml: %w", err)
	}

	if l.providers == nil {
		return nil
	}
	provider, err := l.providers.GetPrimaryProvider()
	if err != nil {
		return nil
	}

	type diffCtx struct {
		Step   map[string]interface{} `json:"step"`
		Actual map[string]interface{} `json:"actual"`
		Span   map[string]interface{} `json:"span,omitempty"`
	}

	var diffs []diffCtx
	for _, fs := range failedSteps {
		dc := diffCtx{
			Step: map[string]interface{}{
				"name":   fs.StepName,
				"action": fs.Action,
				"error":  fs.ErrorMessage,
			},
			Actual: map[string]interface{}{},
		}
		if fs.Output != nil {
			dc.Actual = fs.Output
		}
		if matched := matchSpan(spans, fs); matched != nil {
			dc.Span = map[string]interface{}{
				"service":   matched.Service,
				"operation": matched.Operation,
				"status":    matched.StatusCode,
				"duration":  matched.DurationMs,
			}
		}
		diffs = append(diffs, dc)
	}

	diffJSON, _ := json.MarshalIndent(diffs, "", "  ")

	prompt := fmt.Sprintf(`A TestMesh flow step failed. Here is the context:

Failed steps with trace context:
%s

Current flow YAML:
%s

Produce ONLY valid JSON (no markdown):
{
  "diagnosis": "one paragraph explaining root cause",
  "yaml_diff": "human-readable unified diff showing the change",
  "fixed_yaml": "complete updated flow YAML with only the failing step(s) changed",
  "step_id": "the step ID that failed",
  "confidence": 0.0
}`, string(diffJSON), flowYAML)

	resp, err := provider.Generate(ctx, ai.GenerateRequest{
		Prompt:      prompt,
		MaxTokens:   4096,
		Temperature: 0.1,
	})
	if err != nil {
		return fmt.Errorf("LLM call: %w", err)
	}

	const maxResponseBytes = 256 * 1024 // 256 KiB
	if len(resp.Content) > maxResponseBytes {
		return fmt.Errorf("LLM response too large (%d bytes)", len(resp.Content))
	}
	content := strings.TrimSpace(resp.Content)
	if idx := strings.Index(content, "{"); idx > 0 {
		content = content[idx:]
	}
	if idx := strings.LastIndex(content, "}"); idx >= 0 && idx < len(content)-1 {
		content = content[:idx+1]
	}

	var result struct {
		Diagnosis  string  `json:"diagnosis"`
		YAMLDiff   string  `json:"yaml_diff"`
		FixedYAML  string  `json:"fixed_yaml"`
		StepID     string  `json:"step_id"`
		Confidence float64 `json:"confidence"`
	}
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		l.logger.Warn("failed to parse repair LLM response", zap.Error(err))
		return nil
	}

	suggestion := &RepairSuggestion{
		ExecutionID: exec.ID,
		WorkspaceID: exec.WorkspaceID,
		StepID:      result.StepID,
		Diagnosis:   result.Diagnosis,
		YAMLDiff:    result.YAMLDiff,
		FixedYAML:   result.FixedYAML,
		Confidence:  result.Confidence,
		Status:      "pending",
		CreatedAt:   time.Now().UTC(),
	}

	return l.db.WithContext(ctx).
		Clauses(clause.OnConflict{DoNothing: true}).
		Create(suggestion).Error
}

func matchSpan(spans []Span, step stepRecord) *Span {
	stepURL := ""
	if v, ok := step.Output["url"].(string); ok {
		stepURL = v
	}
	stepMethod := ""
	if v, ok := step.Output["method"].(string); ok {
		stepMethod = v
	}

	for i := range spans {
		s := &spans[i]
		if s.IsTestGenerated {
			continue
		}
		spanMethod := getStringAttrMap(s.Attributes, "http.method")
		spanRoute := getStringAttrMap(s.Attributes, "http.route")
		if stepMethod != "" && spanMethod != "" && !strings.EqualFold(stepMethod, spanMethod) {
			continue
		}
		if stepURL != "" && spanRoute != "" && strings.Contains(stepURL, strings.TrimSuffix(spanRoute, "/:id")) {
			return s
		}
	}
	return nil
}
