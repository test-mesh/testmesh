package tracing

import (
	"context"
	"fmt"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// ExecutionTracer provides tracing for flow executions
type ExecutionTracer struct {
	tracer trace.Tracer
}

// NewExecutionTracer creates a new execution tracer
func NewExecutionTracer() *ExecutionTracer {
	return &ExecutionTracer{
		tracer: otel.Tracer("testmesh.execution"),
	}
}

// StartExecution starts a new execution span
func (t *ExecutionTracer) StartExecution(ctx context.Context, executionID, flowID, flowName string) (context.Context, trace.Span) {
	return t.tracer.Start(ctx, "execution",
		trace.WithSpanKind(trace.SpanKindInternal),
		trace.WithAttributes(
			AttrExecutionID.String(executionID),
			AttrFlowID.String(flowID),
			AttrFlowName.String(flowName),
		),
	)
}

// StartStep starts a new step span
func (t *ExecutionTracer) StartStep(ctx context.Context, stepID, stepName, stepType string) (context.Context, trace.Span) {
	return t.tracer.Start(ctx, "step."+stepType,
		trace.WithSpanKind(trace.SpanKindInternal),
		trace.WithAttributes(
			AttrStepID.String(stepID),
			AttrStepName.String(stepName),
			AttrStepType.String(stepType),
		),
	)
}

// RecordStepResult records the result of a step
func (t *ExecutionTracer) RecordStepResult(span trace.Span, status string, duration time.Duration, err error) {
	span.SetAttributes(
		attribute.String("step.status", status),
		attribute.Int64("step.duration_ms", duration.Milliseconds()),
	)

	if err != nil {
		span.RecordError(err)
		span.SetStatus(1, err.Error())
	} else if status == "failed" {
		span.SetStatus(1, "step failed")
	}
}

// RecordHTTPRequest records HTTP request details
func (t *ExecutionTracer) RecordHTTPRequest(span trace.Span, method, url string, statusCode int, duration time.Duration) {
	span.SetAttributes(
		attribute.String("http.method", method),
		attribute.String("http.url", url),
		attribute.Int("http.status_code", statusCode),
		attribute.Int64("http.duration_ms", duration.Milliseconds()),
	)
}

// RecordDatabaseQuery records database query details
func (t *ExecutionTracer) RecordDatabaseQuery(span trace.Span, driver, query string, rowsAffected int64, duration time.Duration) {
	span.SetAttributes(
		attribute.String("db.system", driver),
		attribute.String("db.statement", truncateQuery(query)),
		attribute.Int64("db.rows_affected", rowsAffected),
		attribute.Int64("db.duration_ms", duration.Milliseconds()),
	)
}

// RecordKafkaMessage records Kafka message details
func (t *ExecutionTracer) RecordKafkaMessage(span trace.Span, topic string, partition int32, offset int64, isProducer bool) {
	operation := "receive"
	if isProducer {
		operation = "send"
	}
	span.SetAttributes(
		attribute.String("messaging.system", "kafka"),
		attribute.String("messaging.operation", operation),
		attribute.String("messaging.destination.name", topic),
		attribute.Int("messaging.kafka.partition", int(partition)),
		attribute.Int64("messaging.kafka.offset", offset),
	)
}

// RecordAssertion records assertion details
func (t *ExecutionTracer) RecordAssertion(span trace.Span, assertion string, passed bool, actual, expected interface{}) {
	span.AddEvent("assertion",
		trace.WithAttributes(
			attribute.String("assertion.expression", assertion),
			attribute.Bool("assertion.passed", passed),
			attribute.String("assertion.actual", formatValue(actual)),
			attribute.String("assertion.expected", formatValue(expected)),
		),
	)
}

// RecordVariable records variable change
func (t *ExecutionTracer) RecordVariable(ctx context.Context, name string, value interface{}) {
	span := trace.SpanFromContext(ctx)
	span.AddEvent("variable.set",
		trace.WithAttributes(
			attribute.String("variable.name", name),
			attribute.String("variable.value", formatValue(value)),
		),
	)
}

// Helper functions

func truncateQuery(query string) string {
	const maxLen = 500
	if len(query) > maxLen {
		return query[:maxLen] + "..."
	}
	return query
}

func formatValue(v interface{}) string {
	if v == nil {
		return "null"
	}
	switch val := v.(type) {
	case string:
		if len(val) > 100 {
			return val[:100] + "..."
		}
		return val
	default:
		return fmt.Sprintf("%v", v)
	}
}
