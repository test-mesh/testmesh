package tracing

import (
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/propagation"
	semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
	"go.opentelemetry.io/otel/trace"
)

// Middleware returns a Gin middleware for tracing HTTP requests
func Middleware(serviceName string) gin.HandlerFunc {
	tracer := otel.Tracer(serviceName)

	return func(c *gin.Context) {
		// Extract context from incoming request
		ctx := otel.GetTextMapPropagator().Extract(c.Request.Context(), propagation.HeaderCarrier(c.Request.Header))

		// Start span
		spanName := fmt.Sprintf("%s %s", c.Request.Method, c.FullPath())
		if c.FullPath() == "" {
			spanName = fmt.Sprintf("%s %s", c.Request.Method, c.Request.URL.Path)
		}

		ctx, span := tracer.Start(ctx, spanName,
			trace.WithSpanKind(trace.SpanKindServer),
			trace.WithAttributes(
				semconv.HTTPMethod(c.Request.Method),
				semconv.HTTPRoute(c.FullPath()),
				semconv.HTTPURL(c.Request.URL.String()),
				semconv.HTTPScheme(c.Request.URL.Scheme),
				semconv.HTTPUserAgent(c.Request.UserAgent()),
				semconv.HTTPRequestContentLength(int(c.Request.ContentLength)),
				semconv.NetHostName(c.Request.Host),
			),
		)
		defer span.End()

		// Store span in context
		c.Request = c.Request.WithContext(ctx)

		// Record start time
		start := time.Now()

		// Process request
		c.Next()

		// Record response attributes
		status := c.Writer.Status()
		span.SetAttributes(
			semconv.HTTPStatusCode(status),
			semconv.HTTPResponseContentLength(c.Writer.Size()),
			attribute.Int64("http.duration_ms", time.Since(start).Milliseconds()),
		)

		// Set span status based on HTTP status
		if status >= 400 {
			span.SetStatus(1, fmt.Sprintf("HTTP %d", status))
		}

		// Record errors
		if len(c.Errors) > 0 {
			for _, err := range c.Errors {
				span.RecordError(err.Err)
			}
		}
	}
}

// InjectHeaders injects trace context into outgoing HTTP headers
func InjectHeaders(ctx gin.Context, headers map[string]string) {
	carrier := propagation.MapCarrier(headers)
	otel.GetTextMapPropagator().Inject(ctx.Request.Context(), carrier)
}

// ExtractTraceID extracts the trace ID from context
func ExtractTraceID(c *gin.Context) string {
	span := trace.SpanFromContext(c.Request.Context())
	if span.SpanContext().IsValid() {
		return span.SpanContext().TraceID().String()
	}
	return ""
}

// ExtractSpanID extracts the span ID from context
func ExtractSpanID(c *gin.Context) string {
	span := trace.SpanFromContext(c.Request.Context())
	if span.SpanContext().IsValid() {
		return span.SpanContext().SpanID().String()
	}
	return ""
}

// AddRequestID adds request ID to response headers and span
func AddRequestID(c *gin.Context, requestID string) {
	c.Header("X-Request-ID", requestID)
	span := trace.SpanFromContext(c.Request.Context())
	span.SetAttributes(attribute.String("request.id", requestID))
}

// TraceContext holds trace context information
type TraceContext struct {
	TraceID   string `json:"trace_id"`
	SpanID    string `json:"span_id"`
	RequestID string `json:"request_id"`
}

// GetTraceContext returns the current trace context
func GetTraceContext(c *gin.Context) TraceContext {
	return TraceContext{
		TraceID:   ExtractTraceID(c),
		SpanID:    ExtractSpanID(c),
		RequestID: c.GetString("request_id"),
	}
}
