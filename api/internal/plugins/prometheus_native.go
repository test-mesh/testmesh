// api/internal/plugins/prometheus_native.go
package plugins

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/test-mesh/testmesh/internal/runner/assertions"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// PrometheusNativePlugin provides native Prometheus integration.
// Actions: prometheus.query, prometheus.assert
type PrometheusNativePlugin struct {
	logger *zap.Logger
}

func NewPrometheusNativePlugin(logger *zap.Logger) *PrometheusNativePlugin {
	return &PrometheusNativePlugin{logger: logger}
}

func (p *PrometheusNativePlugin) Name() string { return "prometheus" }

func (p *PrometheusNativePlugin) Execute(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	action, _ := config["_action"].(string)
	switch action {
	case "prometheus.query":
		return p.query(ctx, config)
	case "prometheus.assert":
		return p.assert(ctx, config)
	default:
		return nil, fmt.Errorf("unknown prometheus action: %s", action)
	}
}

type prometheusResponse struct {
	Status string `json:"status"`
	Data   struct {
		ResultType string `json:"resultType"`
		Result     []struct {
			Metric map[string]string `json:"metric"`
			Value  [2]interface{}    `json:"value"`
		} `json:"result"`
	} `json:"data"`
}

func (p *PrometheusNativePlugin) query(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	promURL, ok := config["url"].(string)
	if !ok || promURL == "" {
		return nil, fmt.Errorf("prometheus.query: url is required")
	}
	promql, ok := config["query"].(string)
	if !ok || promql == "" {
		return nil, fmt.Errorf("prometheus.query: query is required")
	}

	queryTime := fmt.Sprintf("%d", time.Now().Unix())
	if t, ok := config["time"].(string); ok && t != "" && t != "now" {
		queryTime = t
	}

	params := url.Values{
		"query": {promql},
		"time":  {queryTime},
	}

	apiURL := strings.TrimRight(promURL, "/") + "/api/v1/query?" + params.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("prometheus.query: build request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("prometheus.query: http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("prometheus.query: HTTP %d", resp.StatusCode)
	}

	var pr prometheusResponse
	if err := json.NewDecoder(resp.Body).Decode(&pr); err != nil {
		return nil, fmt.Errorf("prometheus.query: decode: %w", err)
	}
	if pr.Status != "success" {
		return nil, fmt.Errorf("prometheus.query: status=%s", pr.Status)
	}
	if len(pr.Data.Result) == 0 {
		return map[string]interface{}{"value": nil, "metric": map[string]string{}}, nil
	}

	first := pr.Data.Result[0]
	var value float64
	if vs, ok := first.Value[1].(string); ok {
		fmt.Sscan(vs, &value)
	}

	p.logger.Info("prometheus.query", zap.String("query", promql), zap.Float64("value", value))
	return map[string]interface{}{"value": value, "metric": first.Metric}, nil
}

func (p *PrometheusNativePlugin) assert(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	withinStr, _ := config["within"].(string)
	deadline := time.Now().Add(15 * time.Second)
	if withinStr != "" {
		if d, err := time.ParseDuration(withinStr); err == nil {
			deadline = time.Now().Add(d)
		}
	}

	var exprs []string
	if raw, ok := config["assert"].([]interface{}); ok {
		for _, a := range raw {
			if s, ok := a.(string); ok {
				exprs = append(exprs, s)
			}
		}
	}

	var result map[string]interface{}
	var lastErr error

	for time.Now().Before(deadline) {
		result, lastErr = p.query(ctx, config)
		if lastErr != nil {
			time.Sleep(500 * time.Millisecond)
			continue
		}
		if len(exprs) == 0 {
			break
		}
		ev := assertions.NewEvaluator(models.OutputData(result))
		if err := ev.Evaluate(exprs); err == nil {
			return result, nil
		}
		time.Sleep(500 * time.Millisecond)
	}

	if lastErr != nil {
		return nil, lastErr
	}

	if len(exprs) > 0 {
		ev := assertions.NewEvaluator(models.OutputData(result))
		if err := ev.Evaluate(exprs); err != nil {
			return nil, fmt.Errorf("prometheus.assert: %w", err)
		}
	}

	return result, nil
}
