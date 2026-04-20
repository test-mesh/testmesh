package telemetry

import (
	"context"
	"sync"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

// DiscoveryRunner processes a completed trace for flow pattern discovery.
type DiscoveryRunner interface {
	ProcessCompletedTrace(ctx context.Context, workspaceID uuid.UUID, traceID string) error
}

// CoverageRunner updates the coverage gap index from a completed trace.
type CoverageRunner interface {
	Update(ctx context.Context, workspaceID uuid.UUID, traceID string) error
}

// LinkerRunner links completed traces to failed executions and queues repair.
type LinkerRunner interface {
	LinkTrace(ctx context.Context, workspaceID uuid.UUID, traceID string) error
}

// InsightsRunner summarizes a trace into a cached LLM insight.
type InsightsRunner interface {
	Summarize(ctx context.Context, workspaceID uuid.UUID, traceID string) error
}

// TraceEnrichmentWorker consumes TraceCompletion events and runs all enrichment jobs.
type TraceEnrichmentWorker struct {
	discovery   DiscoveryRunner
	coverage    CoverageRunner
	linker      LinkerRunner
	insights    InsightsRunner
	ch          <-chan TraceCompletion
	logger      *zap.Logger
	insightsSem chan struct{}
	wg          sync.WaitGroup
}

// NewTraceEnrichmentWorker creates a new worker. logger is required.
func NewTraceEnrichmentWorker(
	discovery DiscoveryRunner,
	coverage CoverageRunner,
	linker LinkerRunner,
	insights InsightsRunner,
	ch <-chan TraceCompletion,
	logger *zap.Logger,
) *TraceEnrichmentWorker {
	return &TraceEnrichmentWorker{
		discovery:   discovery,
		coverage:    coverage,
		linker:      linker,
		insights:    insights,
		ch:          ch,
		logger:      logger,
		insightsSem: make(chan struct{}, 4),
	}
}

// Start begins consuming from the channel until ctx is cancelled.
func (w *TraceEnrichmentWorker) Start(ctx context.Context) {
	go func() {
		for {
			select {
			case <-ctx.Done():
				w.wg.Wait()
				return
			case tc, ok := <-w.ch:
				if !ok {
					w.wg.Wait()
					return
				}
				w.process(ctx, tc)
			}
		}
	}()
}

func (w *TraceEnrichmentWorker) process(ctx context.Context, tc TraceCompletion) {
	if err := w.discovery.ProcessCompletedTrace(ctx, tc.WorkspaceID, tc.TraceID); err != nil {
		w.logger.Warn("flow discovery failed", zap.String("trace_id", tc.TraceID), zap.Error(err))
	}

	if err := w.coverage.Update(ctx, tc.WorkspaceID, tc.TraceID); err != nil {
		w.logger.Warn("coverage update failed", zap.String("trace_id", tc.TraceID), zap.Error(err))
	}

	if err := w.linker.LinkTrace(ctx, tc.WorkspaceID, tc.TraceID); err != nil {
		w.logger.Warn("execution linker failed", zap.String("trace_id", tc.TraceID), zap.Error(err))
	}

	// Insights is LLM-heavy — run in goroutine pool (size 4)
	w.wg.Add(1)
	w.insightsSem <- struct{}{}
	go func(wsID uuid.UUID, traceID string) {
		defer w.wg.Done()
		defer func() { <-w.insightsSem }()
		if err := w.insights.Summarize(ctx, wsID, traceID); err != nil {
			w.logger.Warn("trace insights failed", zap.String("trace_id", traceID), zap.Error(err))
		}
	}(tc.WorkspaceID, tc.TraceID)
}
