package telemetry

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/ai"
	"github.com/test-mesh/testmesh/internal/graph"
	"go.uber.org/zap"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// TraceInsight stores a per-trace LLM summary and generated YAML flow.
type TraceInsight struct {
	TraceID        string          `gorm:"primaryKey" json:"trace_id"`
	WorkspaceID    uuid.UUID       `gorm:"type:uuid;not null;index" json:"workspace_id"`
	SpanSummary    graph.JSONArray `gorm:"type:jsonb;default:'[]'" json:"span_summary"`
	InferredIntent string          `json:"inferred_intent"`
	GeneratedYAML  string          `json:"generated_yaml"`
	Confidence     float64         `json:"confidence"`
	Coverage       graph.JSONArray `gorm:"type:jsonb;default:'[]'" json:"coverage"`
	LLMModel       string          `json:"llm_model"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

func (TraceInsight) TableName() string { return "telemetry.trace_insights" }

// TraceInsightCache generates and caches per-trace LLM summaries and YAML flows.
type TraceInsightCache struct {
	repo      *TelemetryRepository
	db        *gorm.DB
	providers *ai.ProviderManager
	logger    *zap.Logger
}

// NewTraceInsightCache creates a new TraceInsightCache.
func NewTraceInsightCache(repo *TelemetryRepository, _ interface{}, providers interface{}, logger *zap.Logger) *TraceInsightCache {
	pm, _ := providers.(*ai.ProviderManager)
	return &TraceInsightCache{
		repo:      repo,
		db:        repo.db,
		providers: pm,
		logger:    logger,
	}
}

// Summarize generates an LLM summary and YAML flow for a trace, caching the result.
func (c *TraceInsightCache) Summarize(ctx context.Context, workspaceID uuid.UUID, traceID string) error {
	// Skip if already cached
	var existing TraceInsight
	if err := c.db.WithContext(ctx).Where("workspace_id = ? AND trace_id = ?", workspaceID, traceID).First(&existing).Error; err == nil {
		return nil
	}

	spans, err := c.repo.GetSpansByTraceID(ctx, workspaceID, traceID)
	if err != nil {
		return fmt.Errorf("get spans: %w", err)
	}
	if len(spans) == 0 {
		return nil
	}

	var realSpans []Span
	for _, s := range spans {
		if !s.IsTestGenerated {
			realSpans = append(realSpans, s)
		}
	}
	if len(realSpans) == 0 {
		return nil
	}

	if c.providers == nil {
		c.logger.Warn("no AI provider configured, skipping trace insight", zap.String("trace_id", traceID))
		return nil
	}
	provider, err := c.providers.GetPrimaryProvider()
	if err != nil {
		c.logger.Warn("no AI provider available, skipping trace insight", zap.String("trace_id", traceID))
		return nil
	}

	summary := c.extractSpanSummary(realSpans)
	variables := c.extractVariables(realSpans)

	summaryJSON, _ := json.MarshalIndent(summary, "", "  ")
	variablesNote := ""
	if len(variables) > 0 {
		vJSON, _ := json.Marshal(variables)
		variablesNote = fmt.Sprintf("\n\nDetected variable flows:\n%s", string(vJSON))
	}

	prompt := fmt.Sprintf(`You are generating a TestMesh YAML integration test from a real production trace.

Trace summary (ordered service calls):
%s%s

Generate a complete TestMesh YAML flow that:
1. Tests this interaction end-to-end
2. Uses variable extraction (output: blocks) where values flow between steps
3. Includes status code assertions on every HTTP step (assert: - status == NNN)
4. Includes response body assertions for key fields using JSONPath (assert: - $.body.id != "")
5. Uses {{base_url}} and {{api_key}} as placeholders
6. Has a clear name and description

Return ONLY valid JSON (no markdown):
{"yaml": "...", "confidence": 0.0, "intent": "one sentence", "coverage": [{"method":"POST","route":"/orders","service":"order-service"}]}`,
		string(summaryJSON), variablesNote)

	resp, err := provider.Generate(ctx, ai.GenerateRequest{
		Prompt:      prompt,
		MaxTokens:   4096,
		Temperature: 0.2,
	})
	if err != nil {
		return fmt.Errorf("LLM generate: %w", err)
	}

	var result struct {
		YAML       string                   `json:"yaml"`
		Confidence float64                  `json:"confidence"`
		Intent     string                   `json:"intent"`
		Coverage   []map[string]interface{} `json:"coverage"`
	}

	content := strings.TrimSpace(resp.Content)
	if idx := strings.Index(content, "{"); idx > 0 {
		content = content[idx:]
	}
	if idx := strings.LastIndex(content, "}"); idx >= 0 && idx < len(content)-1 {
		content = content[:idx+1]
	}

	if err := json.Unmarshal([]byte(content), &result); err != nil {
		c.logger.Warn("failed to parse LLM response for trace insight",
			zap.String("trace_id", traceID),
			zap.Error(err))
		return nil
	}

	coverageJSON := make(graph.JSONArray, len(result.Coverage))
	for i, cv := range result.Coverage {
		coverageJSON[i] = cv
	}

	insight := &TraceInsight{
		TraceID:        traceID,
		WorkspaceID:    workspaceID,
		SpanSummary:    summaryAsJSONArray(summary),
		InferredIntent: result.Intent,
		GeneratedYAML:  result.YAML,
		Confidence:     result.Confidence,
		Coverage:       coverageJSON,
		LLMModel:       resp.Model,
		CreatedAt:      time.Now().UTC(),
		UpdatedAt:      time.Now().UTC(),
	}

	return c.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "trace_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"generated_yaml", "inferred_intent", "confidence", "coverage", "llm_model", "updated_at"}),
		}).
		Create(insight).Error
}

// GetInsight retrieves a cached trace insight by workspace and trace ID.
func (c *TraceInsightCache) GetInsight(ctx context.Context, workspaceID uuid.UUID, traceID string) (*TraceInsight, error) {
	var insight TraceInsight
	err := c.db.WithContext(ctx).Where("workspace_id = ? AND trace_id = ?", workspaceID, traceID).First(&insight).Error
	if err != nil {
		return nil, err
	}
	return &insight, nil
}

// extractSpanSummary builds a deterministic summary slice from spans (no LLM).
func (c *TraceInsightCache) extractSpanSummary(spans []Span) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(spans))
	for _, s := range spans {
		entry := map[string]interface{}{
			"service":     s.Service,
			"operation":   s.Operation,
			"kind":        s.Kind,
			"status_code": s.StatusCode,
			"duration_ms": s.DurationMs,
		}
		if m := getStringAttrMap(s.Attributes, "http.method"); m != "" {
			entry["http_method"] = m
		}
		if r := getStringAttrMap(s.Attributes, "http.route"); r != "" {
			entry["http_route"] = r
		}
		if st := getAttrInt(s.Attributes, "http.status_code"); st != 0 {
			entry["http_status"] = st
		}
		if body := getStringAttrMap(s.Attributes, "http.request.body"); body != "" {
			if len(body) > 2048 {
				body = body[:2048]
			}
			entry["request_body_sample"] = body
		}
		if body := getStringAttrMap(s.Attributes, "http.response.body"); body != "" {
			if len(body) > 2048 {
				body = body[:2048]
			}
			entry["response_body_sample"] = body
		}
		out = append(out, entry)
	}
	return out
}

// variableFlow describes a detected data dependency between two span steps.
type variableFlow struct {
	SourceStep      int    `json:"source_step"`
	SourceField     string `json:"source_field"`
	TargetStep      int    `json:"target_step"`
	JSONPathExpr    string `json:"jsonpath"`
	PlaceholderName string `json:"var_name"`
}

// extractVariables detects when a response field appears in a later request URL.
func (c *TraceInsightCache) extractVariables(spans []Span) []variableFlow {
	var flows []variableFlow
	for i, src := range spans {
		respBody := getStringAttrMap(src.Attributes, "http.response.body")
		if respBody == "" {
			continue
		}
		var respMap map[string]interface{}
		if err := json.Unmarshal([]byte(respBody), &respMap); err != nil {
			continue
		}
		for field, val := range respMap {
			strVal, ok := val.(string)
			if !ok || strVal == "" {
				continue
			}
			for j := i + 1; j < len(spans); j++ {
				url := getStringAttrMap(spans[j].Attributes, "http.route")
				if strings.Contains(url, strVal) {
					flows = append(flows, variableFlow{
						SourceStep:      i + 1,
						SourceField:     field,
						TargetStep:      j + 1,
						JSONPathExpr:    "$.body." + field,
						PlaceholderName: field,
					})
				}
			}
		}
	}
	return flows
}

// summaryAsJSONArray converts a []map[string]interface{} to graph.JSONArray.
func summaryAsJSONArray(summary []map[string]interface{}) graph.JSONArray {
	out := make(graph.JSONArray, len(summary))
	for i, m := range summary {
		out[i] = m
	}
	return out
}

// getAttrInt reads an integer attribute from a JSONMap.
func getAttrInt(attrs graph.JSONMap, key string) int64 {
	if v, ok := attrs[key]; ok {
		switch n := v.(type) {
		case float64:
			return int64(n)
		case int64:
			return n
		}
	}
	return 0
}
