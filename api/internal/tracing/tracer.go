package tracing

import (
	"context"
	"fmt"
	"os"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/jaeger"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/exporters/stdout/stdouttrace"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
	"go.opentelemetry.io/otel/trace"
)

// Config holds tracing configuration
type Config struct {
	ServiceName    string
	ServiceVersion string
	Environment    string
	Enabled        bool
	Exporter       string // "jaeger", "otlp", "stdout"
	Endpoint       string
	SampleRate     float64
}

// DefaultConfig returns default tracing configuration
func DefaultConfig() *Config {
	return &Config{
		ServiceName:    "testmesh",
		ServiceVersion: "1.0.0",
		Environment:    getEnv("ENVIRONMENT", "development"),
		Enabled:        getEnvBool("OTEL_ENABLED", false),
		Exporter:       getEnv("OTEL_EXPORTER", "otlp"),
		Endpoint:       getEnv("OTEL_EXPORTER_ENDPOINT", "localhost:4317"),
		SampleRate:     1.0,
	}
}

// Tracer wraps OpenTelemetry tracer
type Tracer struct {
	config   *Config
	provider *sdktrace.TracerProvider
	tracer   trace.Tracer
}

// NewTracer creates a new tracer
func NewTracer(config *Config) (*Tracer, error) {
	if config == nil {
		config = DefaultConfig()
	}

	if !config.Enabled {
		return &Tracer{
			config: config,
			tracer: trace.NewNoopTracerProvider().Tracer(config.ServiceName),
		}, nil
	}

	// Create exporter
	exporter, err := createExporter(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create exporter: %w", err)
	}

	// Create resource
	res, err := resource.Merge(
		resource.Default(),
		resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceName(config.ServiceName),
			semconv.ServiceVersion(config.ServiceVersion),
			attribute.String("environment", config.Environment),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create resource: %w", err)
	}

	// Create sampler
	var sampler sdktrace.Sampler
	if config.SampleRate >= 1.0 {
		sampler = sdktrace.AlwaysSample()
	} else if config.SampleRate <= 0 {
		sampler = sdktrace.NeverSample()
	} else {
		sampler = sdktrace.TraceIDRatioBased(config.SampleRate)
	}

	// Create provider
	provider := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sampler),
	)

	// Set global provider
	otel.SetTracerProvider(provider)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	return &Tracer{
		config:   config,
		provider: provider,
		tracer:   provider.Tracer(config.ServiceName),
	}, nil
}

func createExporter(config *Config) (sdktrace.SpanExporter, error) {
	switch config.Exporter {
	case "jaeger":
		return jaeger.New(jaeger.WithCollectorEndpoint(
			jaeger.WithEndpoint(config.Endpoint),
		))
	case "otlp":
		client := otlptracegrpc.NewClient(
			otlptracegrpc.WithEndpoint(config.Endpoint),
			otlptracegrpc.WithInsecure(),
		)
		return otlptrace.New(context.Background(), client)
	case "stdout":
		return stdouttrace.New()
	default:
		return stdouttrace.New()
	}
}

// Shutdown shuts down the tracer
func (t *Tracer) Shutdown(ctx context.Context) error {
	if t.provider == nil {
		return nil
	}
	return t.provider.Shutdown(ctx)
}

// Start starts a new span
func (t *Tracer) Start(ctx context.Context, name string, opts ...trace.SpanStartOption) (context.Context, trace.Span) {
	return t.tracer.Start(ctx, name, opts...)
}

// StartSpan starts a new span with common attributes
func (t *Tracer) StartSpan(ctx context.Context, name string, attrs ...attribute.KeyValue) (context.Context, trace.Span) {
	return t.tracer.Start(ctx, name, trace.WithAttributes(attrs...))
}

// SpanFromContext returns the current span from context
func SpanFromContext(ctx context.Context) trace.Span {
	return trace.SpanFromContext(ctx)
}

// WithSpan wraps a function with a span
func (t *Tracer) WithSpan(ctx context.Context, name string, fn func(ctx context.Context) error, attrs ...attribute.KeyValue) error {
	ctx, span := t.StartSpan(ctx, name, attrs...)
	defer span.End()

	if err := fn(ctx); err != nil {
		span.RecordError(err)
		span.SetStatus(1, err.Error()) // Error status
		return err
	}

	return nil
}

// AddEvent adds an event to the current span
func AddEvent(ctx context.Context, name string, attrs ...attribute.KeyValue) {
	span := trace.SpanFromContext(ctx)
	span.AddEvent(name, trace.WithAttributes(attrs...))
}

// SetAttributes sets attributes on the current span
func SetAttributes(ctx context.Context, attrs ...attribute.KeyValue) {
	span := trace.SpanFromContext(ctx)
	span.SetAttributes(attrs...)
}

// RecordError records an error on the current span
func RecordError(ctx context.Context, err error) {
	span := trace.SpanFromContext(ctx)
	span.RecordError(err)
}

// Helper functions

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvBool(key string, defaultValue bool) bool {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value == "true" || value == "1" || value == "yes"
}

// Common attribute keys
var (
	AttrFlowID       = attribute.Key("testmesh.flow.id")
	AttrFlowName     = attribute.Key("testmesh.flow.name")
	AttrStepID       = attribute.Key("testmesh.step.id")
	AttrStepName     = attribute.Key("testmesh.step.name")
	AttrStepType     = attribute.Key("testmesh.step.type")
	AttrExecutionID  = attribute.Key("testmesh.execution.id")
	AttrWorkspaceID  = attribute.Key("testmesh.workspace.id")
	AttrUserID       = attribute.Key("testmesh.user.id")
)
