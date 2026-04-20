package telemetry

import (
	"context"
	"encoding/hex"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/graph"
	"go.uber.org/zap"
	coltracepb "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	commonpb "go.opentelemetry.io/proto/otlp/common/v1"
	tracepb "go.opentelemetry.io/proto/otlp/trace/v1"
)

const (
	maxBufferedTraces  = 10000
	traceFlushInterval = 5 * time.Second
	traceIdleTimeout   = 30 * time.Second
)

// traceAggregation tracks when a trace was last updated.
type traceAggregation struct {
	WorkspaceID uuid.UUID
	LastUpdated time.Time
}

// SpanProcessor converts OTLP spans, stores them, and detects trace completeness.
type SpanProcessor struct {
	repo   *TelemetryRepository
	logger *zap.Logger

	mu          sync.Mutex
	traceBuffer map[string]*traceAggregation // traceID -> aggregation

	discoveryCh chan TraceCompletion
	scanCh      chan SpanBatch

	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// TraceCompletion is emitted when a trace has no new spans for traceIdleTimeout.
type TraceCompletion struct {
	WorkspaceID uuid.UUID
	TraceID     string
}

// SpanBatch is a batch of spans dispatched for graph scanning.
type SpanBatch struct {
	WorkspaceID uuid.UUID
	Spans       []Span
}

// NewSpanProcessor creates a new SpanProcessor.
func NewSpanProcessor(repo *TelemetryRepository, logger *zap.Logger) *SpanProcessor {
	return &SpanProcessor{
		repo:        repo,
		logger:      logger,
		traceBuffer: make(map[string]*traceAggregation),
		discoveryCh: make(chan TraceCompletion, 256),
		scanCh:      make(chan SpanBatch, 256),
	}
}

// DiscoveryChan returns the channel emitting completed traces.
func (p *SpanProcessor) DiscoveryChan() <-chan TraceCompletion {
	return p.discoveryCh
}

// ScanChan returns the channel emitting span batches for graph scanning.
func (p *SpanProcessor) ScanChan() <-chan SpanBatch {
	return p.scanCh
}

// Start begins the background trace completeness checker.
func (p *SpanProcessor) Start(ctx context.Context) {
	ctx, p.cancel = context.WithCancel(ctx)
	p.wg.Add(1)
	go p.flushLoop(ctx)
}

// Stop stops the processor and waits for the background goroutine.
func (p *SpanProcessor) Stop() {
	if p.cancel != nil {
		p.cancel()
	}
	p.wg.Wait()
	close(p.discoveryCh)
	close(p.scanCh)
}

// ProcessOTLP converts an OTLP ExportTraceServiceRequest into Span models,
// stores them, and buffers traces for completeness detection.
func (p *SpanProcessor) ProcessOTLP(ctx context.Context, workspaceID uuid.UUID, req *coltracepb.ExportTraceServiceRequest) error {
	var spans []Span

	for _, rs := range req.GetResourceSpans() {
		serviceName := extractServiceName(rs)
		resourceAttrs := extractAttributes(rs.GetResource().GetAttributes())

		for _, ss := range rs.GetScopeSpans() {
			for _, s := range ss.GetSpans() {
				span := convertOTLPSpan(workspaceID, serviceName, resourceAttrs, s)
				spans = append(spans, span)
			}
		}
	}

	if len(spans) == 0 {
		return nil
	}

	// Drop monitoring-scraper spans before persisting. They generate high-frequency
	// unique traces that would pollute discovered_flows, coverage gaps, and the
	// LLM pipeline with zero test value.
	filtered := spans[:0]
	for _, s := range spans {
		if !isBotSpan(s) {
			filtered = append(filtered, s)
		}
	}
	spans = filtered

	if len(spans) == 0 {
		return nil
	}

	// Persist spans immediately
	if err := p.repo.InsertSpans(ctx, spans); err != nil {
		return err
	}

	// Buffer traces for completeness detection
	p.bufferTraces(workspaceID, spans)

	// Dispatch to scan channel for graph enrichment
	select {
	case p.scanCh <- SpanBatch{WorkspaceID: workspaceID, Spans: spans}:
	default:
		p.logger.Warn("scan channel full, dropping batch",
			zap.Int("span_count", len(spans)))
	}

	return nil
}

func (p *SpanProcessor) bufferTraces(workspaceID uuid.UUID, spans []Span) {
	p.mu.Lock()
	defer p.mu.Unlock()

	now := time.Now()
	for _, s := range spans {
		key := s.TraceID
		if _, ok := p.traceBuffer[key]; !ok {
			// Evict oldest if buffer is full
			if len(p.traceBuffer) >= maxBufferedTraces {
				p.evictOldest()
			}
		}
		p.traceBuffer[key] = &traceAggregation{
			WorkspaceID: workspaceID,
			LastUpdated: now,
		}
	}
}

func (p *SpanProcessor) evictOldest() {
	var oldestKey string
	var oldestTime time.Time
	first := true
	for k, v := range p.traceBuffer {
		if first || v.LastUpdated.Before(oldestTime) {
			oldestKey = k
			oldestTime = v.LastUpdated
			first = false
		}
	}
	if oldestKey != "" {
		delete(p.traceBuffer, oldestKey)
	}
}

func (p *SpanProcessor) flushLoop(ctx context.Context) {
	defer p.wg.Done()
	ticker := time.NewTicker(traceFlushInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.flushCompletedTraces()
		}
	}
}

func (p *SpanProcessor) flushCompletedTraces() {
	p.mu.Lock()
	now := time.Now()
	var completed []TraceCompletion
	for traceID, agg := range p.traceBuffer {
		if now.Sub(agg.LastUpdated) > traceIdleTimeout {
			completed = append(completed, TraceCompletion{
				WorkspaceID: agg.WorkspaceID,
				TraceID:     traceID,
			})
			delete(p.traceBuffer, traceID)
		}
	}
	p.mu.Unlock()

	for _, tc := range completed {
		select {
		case p.discoveryCh <- tc:
		default:
			p.logger.Warn("discovery channel full, dropping trace",
				zap.String("trace_id", tc.TraceID))
		}
	}
}

// convertOTLPSpan converts a protobuf span to our Span model.
func convertOTLPSpan(workspaceID uuid.UUID, serviceName string, resourceAttrs graph.JSONMap, s *tracepb.Span) Span {
	traceID := hex.EncodeToString(s.GetTraceId())
	spanID := hex.EncodeToString(s.GetSpanId())
	parentSpanID := hex.EncodeToString(s.GetParentSpanId())
	if parentSpanID == "0000000000000000" {
		parentSpanID = ""
	}

	attrs := extractAttributes(s.GetAttributes())

	startTime := time.Unix(0, int64(s.GetStartTimeUnixNano()))
	endTime := time.Unix(0, int64(s.GetEndTimeUnixNano()))
	durationMs := endTime.Sub(startTime).Milliseconds()

	statusCode := "ok"
	statusMessage := ""
	if status := s.GetStatus(); status != nil {
		switch status.GetCode() {
		case tracepb.Status_STATUS_CODE_ERROR:
			statusCode = "error"
		case tracepb.Status_STATUS_CODE_OK:
			statusCode = "ok"
		default:
			statusCode = "unset"
		}
		statusMessage = status.GetMessage()
	}

	// Detect TestMesh-generated spans
	isTestGenerated := false
	if strings.HasPrefix(s.GetName(), "testmesh.") || strings.HasPrefix(s.GetName(), "execution") || strings.HasPrefix(s.GetName(), "step.") {
		isTestGenerated = true
	}
	if v, ok := attrs["testmesh.execution.id"]; ok && v != "" {
		isTestGenerated = true
	}

	kind := spanKindString(s.GetKind())

	// Extract events
	var events graph.JSONArray
	for _, e := range s.GetEvents() {
		events = append(events, map[string]any{
			"name":       e.GetName(),
			"time":       time.Unix(0, int64(e.GetTimeUnixNano())).Format(time.RFC3339Nano),
			"attributes": extractAttributes(e.GetAttributes()),
		})
	}

	return Span{
		WorkspaceID:     workspaceID,
		TraceID:         traceID,
		SpanID:          spanID,
		ParentSpanID:    parentSpanID,
		Service:         serviceName,
		Operation:       s.GetName(),
		Kind:            kind,
		StatusCode:      statusCode,
		StatusMessage:   statusMessage,
		StartTime:       startTime,
		EndTime:         endTime,
		DurationMs:      durationMs,
		Attributes:      attrs,
		ResourceAttrs:   resourceAttrs,
		Events:          events,
		IsTestGenerated: isTestGenerated,
		CreatedAt:       time.Now().UTC(),
	}
}

func extractServiceName(rs *tracepb.ResourceSpans) string {
	if rs.GetResource() == nil {
		return "unknown"
	}
	for _, attr := range rs.GetResource().GetAttributes() {
		if attr.GetKey() == "service.name" {
			return attr.GetValue().GetStringValue()
		}
	}
	return "unknown"
}

func extractAttributes(attrs []*commonpb.KeyValue) graph.JSONMap {
	if len(attrs) == 0 {
		return graph.JSONMap{}
	}
	result := make(graph.JSONMap, len(attrs))
	for _, kv := range attrs {
		result[kv.GetKey()] = extractAttrValue(kv)
	}
	return result
}

func extractAttrValue(kv *commonpb.KeyValue) any {
	v := kv.GetValue()
	if v == nil {
		return nil
	}
	switch {
	case v.GetStringValue() != "":
		return v.GetStringValue()
	case v.GetIntValue() != 0:
		return v.GetIntValue()
	case v.GetDoubleValue() != 0:
		return v.GetDoubleValue()
	case v.GetBoolValue():
		return v.GetBoolValue()
	default:
		return v.GetStringValue()
	}
}

func spanKindString(kind tracepb.Span_SpanKind) string {
	switch kind {
	case tracepb.Span_SPAN_KIND_CLIENT:
		return "client"
	case tracepb.Span_SPAN_KIND_SERVER:
		return "server"
	case tracepb.Span_SPAN_KIND_PRODUCER:
		return "producer"
	case tracepb.Span_SPAN_KIND_CONSUMER:
		return "consumer"
	case tracepb.Span_SPAN_KIND_INTERNAL:
		return "internal"
	default:
		return "unspecified"
	}
}
