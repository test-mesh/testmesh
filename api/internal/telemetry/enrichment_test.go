package telemetry_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/test-mesh/testmesh/internal/telemetry"
	"go.uber.org/zap"
)

type stubDiscovery struct{ onProcess func(string) }

func (s *stubDiscovery) ProcessCompletedTrace(ctx context.Context, wsID uuid.UUID, traceID string) error {
	if s.onProcess != nil {
		s.onProcess(traceID)
	}
	return nil
}

type stubCoverage struct{ onUpdate func(string) }

func (s *stubCoverage) Update(ctx context.Context, wsID uuid.UUID, traceID string) error {
	if s.onUpdate != nil {
		s.onUpdate(traceID)
	}
	return nil
}

type stubLinker struct{ onLink func(string) }

func (s *stubLinker) LinkTrace(ctx context.Context, wsID uuid.UUID, traceID string) error {
	if s.onLink != nil {
		s.onLink(traceID)
	}
	return nil
}

type stubInsights struct{ onSummarize func(string) }

func (s *stubInsights) Summarize(ctx context.Context, wsID uuid.UUID, traceID string) error {
	if s.onSummarize != nil {
		s.onSummarize(traceID)
	}
	return nil
}

func TestTraceEnrichmentWorker_ProcessesCompletedTrace(t *testing.T) {
	called := make(chan string, 4)

	discovery := &stubDiscovery{onProcess: func(traceID string) { called <- "discovery:" + traceID }}
	coverage := &stubCoverage{onUpdate: func(traceID string) { called <- "coverage:" + traceID }}
	linker := &stubLinker{onLink: func(traceID string) { called <- "linker:" + traceID }}
	insights := &stubInsights{onSummarize: func(traceID string) { called <- "insights:" + traceID }}

	ch := make(chan telemetry.TraceCompletion, 1)

	logger, _ := zap.NewDevelopment()
	w := telemetry.NewTraceEnrichmentWorker(discovery, coverage, linker, insights, ch, logger)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	w.Start(ctx)

	wsID := uuid.New()
	ch <- telemetry.TraceCompletion{WorkspaceID: wsID, TraceID: "abc123"}

	received := map[string]bool{}
	for i := 0; i < 4; i++ {
		select {
		case v := <-called:
			received[v] = true
		case <-time.After(time.Second):
			t.Fatal("timed out waiting for worker to process trace")
		}
	}

	assert.True(t, received["discovery:abc123"])
	assert.True(t, received["coverage:abc123"])
	assert.True(t, received["linker:abc123"])
	assert.True(t, received["insights:abc123"])
}
