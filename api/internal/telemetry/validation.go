package telemetry

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/expr-lang/expr"
	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/graph"
	"go.uber.org/zap"
)

// TraceValidator validates execution traces against expected paths and assertions.
type TraceValidator struct {
	repo      *TelemetryRepository
	discovery *FlowDiscovery
	logger    *zap.Logger
}

// NewTraceValidator creates a new TraceValidator.
func NewTraceValidator(repo *TelemetryRepository, discovery *FlowDiscovery, logger *zap.Logger) *TraceValidator {
	return &TraceValidator{repo: repo, discovery: discovery, logger: logger}
}

// ValidateExecution runs all validation layers against an execution's trace.
func (v *TraceValidator) ValidateExecution(ctx context.Context, workspaceID uuid.UUID, executionID uuid.UUID, traceID string) (*TraceValidationResult, error) {
	spans, err := v.repo.GetSpansByTraceID(ctx, workspaceID, traceID)
	if err != nil {
		return nil, fmt.Errorf("failed to get spans: %w", err)
	}

	result := &TraceValidationResult{
		ExecutionID: executionID,
		WorkspaceID: workspaceID,
		TraceID:     traceID,
		Status:      "passed",
		PathMatch:   true,
		CreatedAt:   time.Now().UTC(),
	}

	if len(spans) == 0 {
		result.Status = "partial"
		result.PathMatch = false
		result.MissingNodes = graph.JSONArray{map[string]any{"message": "no spans found for trace"}}
		return result, v.repo.CreateValidationResult(ctx, result)
	}

	// Layer 1: Path Correctness
	v.validatePath(ctx, workspaceID, spans, result)

	// Layer 2: Performance
	v.validatePerformance(ctx, workspaceID, spans, result)

	// Layer 3: Behavioral Assertions (trace_assert from flow YAML)
	// These are evaluated if the spans contain testmesh assertion events
	v.validateAssertions(spans, result)

	// Determine overall status
	if len(result.MissingNodes) > 0 || len(result.UnexpectedNodes) > 0 || len(result.OrderViolations) > 0 {
		result.Status = "failed"
		result.PathMatch = false
	}
	if len(result.SlowSpans) > 0 || len(result.ErrorSpans) > 0 {
		if result.Status != "failed" {
			result.Status = "failed"
		}
	}
	if len(result.FailedAssertions) > 0 {
		result.Status = "failed"
	}

	if err := v.repo.CreateValidationResult(ctx, result); err != nil {
		return nil, fmt.Errorf("failed to store validation result: %w", err)
	}

	return result, nil
}

// validatePath compares actual trace path against discovered flow baseline.
func (v *TraceValidator) validatePath(ctx context.Context, workspaceID uuid.UUID, spans []Span, result *TraceValidationResult) {
	// Build actual path from spans
	tree := buildSpanTree(spans)
	if tree == nil {
		return
	}
	actualPath := walkGraphPath(tree)
	fingerprint := computeFingerprint(actualPath)

	// Look up the baseline flow by fingerprint
	baseline, err := v.repo.GetFlowByFingerprint(ctx, workspaceID, fingerprint)
	if err != nil || baseline == nil {
		// No baseline found - can't validate path
		return
	}

	// Compare actual vs baseline
	actualSet := make(map[string]bool)
	for _, p := range actualPath {
		actualSet[p.Type+":"+p.Identifier] = true
	}

	baselineSet := make(map[string]bool)
	for _, item := range baseline.GraphPath {
		if m, ok := item.(map[string]any); ok {
			t, _ := m["type"].(string)
			id, _ := m["identifier"].(string)
			key := t + ":" + id
			baselineSet[key] = true
		}
	}

	// Find missing nodes (in baseline but not in actual)
	for key := range baselineSet {
		if !actualSet[key] {
			parts := strings.SplitN(key, ":", 2)
			result.MissingNodes = append(result.MissingNodes, map[string]any{
				"type":       parts[0],
				"identifier": parts[1],
			})
		}
	}

	// Find unexpected nodes (in actual but not in baseline)
	for key := range actualSet {
		if !baselineSet[key] {
			parts := strings.SplitN(key, ":", 2)
			result.UnexpectedNodes = append(result.UnexpectedNodes, map[string]any{
				"type":       parts[0],
				"identifier": parts[1],
			})
		}
	}
}

// validatePerformance checks span durations against thresholds and finds error spans.
func (v *TraceValidator) validatePerformance(ctx context.Context, workspaceID uuid.UUID, spans []Span, result *TraceValidationResult) {
	settings, err := v.repo.GetTraceSettings(ctx, workspaceID)
	if err != nil {
		v.logger.Warn("failed to get trace settings for validation", zap.Error(err))
		settings = &TraceSettings{DefaultTimeoutMs: 30000}
	}

	for _, span := range spans {
		// Check for error spans
		if span.StatusCode == "error" {
			result.ErrorSpans = append(result.ErrorSpans, map[string]any{
				"service":        span.Service,
				"operation":      span.Operation,
				"status_message": span.StatusMessage,
				"duration_ms":    span.DurationMs,
				"span_id":        span.SpanID,
			})
		}

		// Check for slow spans
		// First try P95 baseline, then fall back to workspace default
		threshold := float64(settings.DefaultTimeoutMs)
		if p95, err := v.repo.ComputeP95Duration(ctx, workspaceID, span.Service, span.Operation); err == nil && p95 > 0 {
			threshold = p95 * 1.5 // Flag if >150% of P95
		}

		if float64(span.DurationMs) > threshold {
			result.SlowSpans = append(result.SlowSpans, map[string]any{
				"service":      span.Service,
				"operation":    span.Operation,
				"duration_ms":  span.DurationMs,
				"threshold_ms": threshold,
				"span_id":      span.SpanID,
			})
		}
	}
}

// validateAssertions evaluates trace_assert expressions from span events.
func (v *TraceValidator) validateAssertions(spans []Span, result *TraceValidationResult) {
	// Build trace context for expression evaluation
	traceCtx := buildTraceExprContext(spans)

	// Find assertion events in spans
	for _, span := range spans {
		for _, event := range span.Events {
			eventMap, ok := event.(map[string]any)
			if !ok {
				continue
			}
			if eventMap["name"] != "trace_assert" {
				continue
			}
			attrs, ok := eventMap["attributes"].(map[string]any)
			if !ok {
				continue
			}
			expression, ok := attrs["expression"].(string)
			if !ok || expression == "" {
				continue
			}

			// Evaluate expression using expr-lang
			program, err := expr.Compile(expression)
			if err != nil {
				result.FailedAssertions = append(result.FailedAssertions, map[string]any{
					"expression": expression,
					"error":      fmt.Sprintf("compile error: %s", err),
					"service":    span.Service,
					"operation":  span.Operation,
				})
				continue
			}

			output, err := expr.Run(program, traceCtx)
			if err != nil {
				result.FailedAssertions = append(result.FailedAssertions, map[string]any{
					"expression": expression,
					"error":      fmt.Sprintf("evaluation error: %s", err),
					"service":    span.Service,
					"operation":  span.Operation,
				})
				continue
			}

			if passed, ok := output.(bool); !ok || !passed {
				result.FailedAssertions = append(result.FailedAssertions, map[string]any{
					"expression": expression,
					"actual":     fmt.Sprintf("%v", output),
					"service":    span.Service,
					"operation":  span.Operation,
				})
			}
		}
	}
}

// buildTraceExprContext builds the context map for trace assertion expressions.
func buildTraceExprContext(spans []Span) map[string]any {
	ctx := map[string]any{
		"trace": map[string]any{
			"span_count": len(spans),
		},
	}

	// Build span list and service map
	spanList := make([]map[string]any, len(spans))
	serviceSpans := make(map[string][]map[string]any)

	var totalDuration int64
	var errorCount int

	for i, s := range spans {
		spanData := map[string]any{
			"service":      s.Service,
			"operation":    s.Operation,
			"duration_ms":  s.DurationMs,
			"status_code":  s.StatusCode,
			"kind":         s.Kind,
			"attributes":   map[string]any(s.Attributes),
		}
		spanList[i] = spanData
		serviceSpans[s.Service] = append(serviceSpans[s.Service], spanData)
		totalDuration += s.DurationMs
		if s.StatusCode == "error" {
			errorCount++
		}
	}

	traceMap := ctx["trace"].(map[string]any)
	traceMap["spans"] = spanList
	traceMap["duration_ms"] = totalDuration
	traceMap["error_count"] = errorCount
	traceMap["services"] = serviceSpans

	return ctx
}
