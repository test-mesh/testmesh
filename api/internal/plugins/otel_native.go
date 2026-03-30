// api/internal/plugins/otel_native.go
package plugins

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"go.opentelemetry.io/otel/propagation"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
	"go.uber.org/zap"

	"github.com/test-mesh/testmesh/internal/runner/assertions"
	"github.com/test-mesh/testmesh/internal/storage/models"
)

// OtelNativePlugin provides OTel trace context injection and Tempo span assertion.
// Actions: otel.inject, otel.assert
type OtelNativePlugin struct {
	logger     *zap.Logger
	tracer     trace.Tracer
	propagator propagation.TextMapPropagator
}

func NewOtelNativePlugin(logger *zap.Logger) *OtelNativePlugin {
	tp := sdktrace.NewTracerProvider()
	tracer := tp.Tracer("testmesh-flow")
	prop := propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	)
	return &OtelNativePlugin{logger: logger, tracer: tracer, propagator: prop}
}

func (p *OtelNativePlugin) Name() string { return "otel" }

func (p *OtelNativePlugin) Execute(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	action, _ := config["_action"].(string)
	switch action {
	case "otel.inject":
		return p.inject(ctx, config)
	case "otel.assert":
		return p.assert(ctx, config)
	default:
		return nil, fmt.Errorf("unknown otel action: %s", action)
	}
}

func (p *OtelNativePlugin) inject(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	spanName, _ := config["span_name"].(string)
	if spanName == "" {
		spanName = "testmesh-step"
	}

	_, span := p.tracer.Start(ctx, spanName)
	defer span.End()

	sc := span.SpanContext()

	carrier := make(propagation.MapCarrier)
	p.propagator.Inject(
		trace.ContextWithSpan(ctx, span),
		carrier,
	)

	traceparent := carrier["traceparent"]
	tracestate := carrier["tracestate"]

	p.logger.Info("otel.inject",
		zap.String("trace_id", sc.TraceID().String()),
		zap.String("span_id", sc.SpanID().String()),
	)

	return map[string]interface{}{
		"traceparent": traceparent,
		"tracestate":  tracestate,
		"trace_id":    sc.TraceID().String(),
		"span_id":     sc.SpanID().String(),
	}, nil
}

type tempoTrace struct {
	Batches []struct {
		Resource struct {
			Attributes []tempoAttr `json:"attributes"`
		} `json:"resource"`
		ScopeSpans []struct {
			Spans []struct {
				TraceID           string     `json:"traceId"`
				SpanID            string     `json:"spanId"`
				Name              string     `json:"name"`
				StartTimeUnixNano string     `json:"startTimeUnixNano"`
				EndTimeUnixNano   string     `json:"endTimeUnixNano"`
				Status            struct {
					Code string `json:"code"`
				} `json:"status"`
				Attributes []tempoAttr `json:"attributes"`
			} `json:"spans"`
		} `json:"scopeSpans"`
	} `json:"batches"`
}

type tempoAttr struct {
	Key   string `json:"key"`
	Value struct {
		StringValue string  `json:"stringValue"`
		IntValue    string  `json:"intValue"`
		BoolValue   bool    `json:"boolValue"`
		DoubleValue float64 `json:"doubleValue"`
	} `json:"value"`
}

func (p *OtelNativePlugin) assert(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	backendURL, ok := config["backend_url"].(string)
	if !ok || backendURL == "" {
		return nil, fmt.Errorf("otel.assert: backend_url is required")
	}

	traceID, _ := config["trace_id"].(string)
	service, _ := config["service"].(string)
	operation, _ := config["operation"].(string)

	if traceID == "" && service == "" {
		return nil, fmt.Errorf("otel.assert: trace_id or service is required")
	}

	withinStr, _ := config["within"].(string)
	deadline := time.Now().Add(10 * time.Second)
	if withinStr != "" {
		if d, err := time.ParseDuration(withinStr); err == nil {
			deadline = time.Now().Add(d)
		}
	}

	var spans []map[string]interface{}
	var lastErr error

	for time.Now().Before(deadline) {
		spans, lastErr = p.fetchSpans(ctx, backendURL, traceID, service, operation)
		if lastErr == nil && len(spans) > 0 {
			break
		}
		time.Sleep(500 * time.Millisecond)
	}
	if lastErr != nil {
		return nil, fmt.Errorf("otel.assert: fetch spans: %w", lastErr)
	}

	result := map[string]interface{}{"spans": spans}

	var exprs []string
	if raw, ok := config["assert"].([]interface{}); ok {
		for _, a := range raw {
			if s, ok := a.(string); ok {
				exprs = append(exprs, s)
			}
		}
	}
	if len(exprs) > 0 {
		ev := assertions.NewEvaluator(models.OutputData(result))
		if err := ev.Evaluate(exprs); err != nil {
			return nil, fmt.Errorf("otel.assert: %w", err)
		}
	}

	return result, nil
}

func (p *OtelNativePlugin) fetchSpans(ctx context.Context, backendURL, traceID, service, operation string) ([]map[string]interface{}, error) {
	var apiURL string
	if traceID != "" {
		apiURL = strings.TrimRight(backendURL, "/") + "/api/traces/" + traceID
	} else {
		params := url.Values{}
		if service != "" {
			params.Set("tags", "service.name="+service)
		}
		if operation != "" {
			params.Set("tags", params.Get("tags")+" span.name="+operation)
		}
		apiURL = strings.TrimRight(backendURL, "/") + "/api/search?" + params.Encode()
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, nil
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tempo returned HTTP %d", resp.StatusCode)
	}

	var tr tempoTrace
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil {
		return nil, fmt.Errorf("decode tempo response: %w", err)
	}

	var spans []map[string]interface{}
	for _, batch := range tr.Batches {
		svcName := ""
		for _, attr := range batch.Resource.Attributes {
			if attr.Key == "service.name" {
				svcName = attr.Value.StringValue
			}
		}
		for _, ss := range batch.ScopeSpans {
			for _, s := range ss.Spans {
				attrs := make(map[string]interface{})
				for _, attr := range s.Attributes {
					attrs[attr.Key] = attr.Value.StringValue
				}

				start, _ := strToNano(s.StartTimeUnixNano)
				end, _ := strToNano(s.EndTimeUnixNano)
				durationMs := int64(0)
				if end > start {
					durationMs = (end - start) / 1_000_000
				}

				status := strings.ToLower(s.Status.Code)
				if status == "" || status == "status_code_unset" {
					status = "ok"
				}

				spans = append(spans, map[string]interface{}{
					"trace_id":    s.TraceID,
					"span_id":     s.SpanID,
					"service":     svcName,
					"operation":   s.Name,
					"duration_ms": durationMs,
					"status":      status,
					"attributes":  attrs,
				})
			}
		}
	}
	return spans, nil
}

func strToNano(s string) (int64, error) {
	var n int64
	_, err := fmt.Sscan(s, &n)
	return n, err
}
