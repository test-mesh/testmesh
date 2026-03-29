package telemetry

import (
	"context"

	"github.com/test-mesh/testmesh/internal/graph"
	"go.uber.org/zap"
)

// RootCauseAnalyzer generates structural diff reports from validation results (Tier 1).
type RootCauseAnalyzer struct {
	repo   *TelemetryRepository
	logger *zap.Logger
}

// NewRootCauseAnalyzer creates a new RootCauseAnalyzer.
func NewRootCauseAnalyzer(repo *TelemetryRepository, logger *zap.Logger) *RootCauseAnalyzer {
	return &RootCauseAnalyzer{repo: repo, logger: logger}
}

// GenerateStructuralDiff builds a Tier 1 root cause diff from a validation result.
func (a *RootCauseAnalyzer) GenerateStructuralDiff(ctx context.Context, result *TraceValidationResult) (graph.JSONMap, error) {
	diff := graph.JSONMap{}

	// Path diff
	if len(result.MissingNodes) > 0 || len(result.UnexpectedNodes) > 0 || len(result.OrderViolations) > 0 {
		diff["path_diff"] = graph.JSONMap{
			"missing_nodes":    result.MissingNodes,
			"unexpected_nodes": result.UnexpectedNodes,
			"order_violations": result.OrderViolations,
		}
	}

	// Error chain: find the first error span and all spans affected by it
	if len(result.ErrorSpans) > 0 {
		errorChain := make(graph.JSONArray, 0)
		// Get the spans from the trace to build the error chain
		spans, err := a.repo.GetSpansByTraceID(ctx, result.WorkspaceID, result.TraceID)
		if err == nil && len(spans) > 0 {
			errorChain = buildErrorChain(spans)
		}
		diff["error_chain"] = errorChain
	}

	// Performance breaches
	if len(result.SlowSpans) > 0 {
		diff["performance_breaches"] = result.SlowSpans
	}

	// Failed assertions
	if len(result.FailedAssertions) > 0 {
		diff["failed_assertions"] = result.FailedAssertions
	}

	// Store the diff in the validation result
	result.RootCauseDiff = diff
	if err := a.repo.CreateValidationResult(ctx, result); err != nil {
		return nil, err
	}

	return diff, nil
}

// buildErrorChain walks from the first error span to find all affected child spans.
func buildErrorChain(spans []Span) graph.JSONArray {
	// Build parent-child map
	childrenOf := make(map[string][]int)
	spanIndex := make(map[string]int)
	for i, s := range spans {
		spanIndex[s.SpanID] = i
		if s.ParentSpanID != "" {
			childrenOf[s.ParentSpanID] = append(childrenOf[s.ParentSpanID], i)
		}
	}

	// Find the first error span (earliest start time)
	firstErrorIdx := -1
	for i, s := range spans {
		if s.StatusCode == "error" {
			if firstErrorIdx == -1 || s.StartTime.Before(spans[firstErrorIdx].StartTime) {
				firstErrorIdx = i
			}
		}
	}

	if firstErrorIdx == -1 {
		return graph.JSONArray{}
	}

	// Walk children of the error span
	chain := graph.JSONArray{}
	var walk func(idx int)
	walk = func(idx int) {
		s := spans[idx]
		chain = append(chain, map[string]any{
			"service":        s.Service,
			"operation":      s.Operation,
			"status_code":    s.StatusCode,
			"status_message": s.StatusMessage,
			"duration_ms":    s.DurationMs,
			"span_id":        s.SpanID,
			"is_root_error":  idx == firstErrorIdx,
		})
		for _, childIdx := range childrenOf[s.SpanID] {
			walk(childIdx)
		}
	}
	walk(firstErrorIdx)

	return chain
}
