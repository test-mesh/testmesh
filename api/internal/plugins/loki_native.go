// api/internal/plugins/loki_native.go
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

// LokiNativePlugin provides native Grafana Loki integration.
// Actions: loki.query, loki.assert
type LokiNativePlugin struct {
	logger *zap.Logger
}

func NewLokiNativePlugin(logger *zap.Logger) *LokiNativePlugin {
	return &LokiNativePlugin{logger: logger}
}

func (p *LokiNativePlugin) Name() string { return "loki" }

func (p *LokiNativePlugin) Execute(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	action, _ := config["_action"].(string)
	switch action {
	case "loki.query":
		return p.query(ctx, config)
	case "loki.assert":
		return p.assert(ctx, config)
	default:
		return nil, fmt.Errorf("unknown loki action: %s", action)
	}
}

type lokiQueryRangeResponse struct {
	Data struct {
		ResultType string `json:"resultType"`
		Result     []struct {
			Values [][2]string `json:"values"`
		} `json:"result"`
	} `json:"data"`
}

func (p *LokiNativePlugin) query(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	lokiURL, ok := config["url"].(string)
	if !ok || lokiURL == "" {
		return nil, fmt.Errorf("loki.query: url is required")
	}
	logql, ok := config["query"].(string)
	if !ok || logql == "" {
		return nil, fmt.Errorf("loki.query: query is required")
	}

	limit := 100
	if l, ok := config["limit"].(float64); ok {
		limit = int(l)
	}

	end := time.Now()
	start := end.Add(-5 * time.Minute)

	if s, ok := config["start"].(string); ok && s != "" && s != "now" {
		if d, err := time.ParseDuration(s); err == nil {
			start = end.Add(d)
		} else if t, err := time.Parse(time.RFC3339, s); err == nil {
			start = t
		}
	}
	if e, ok := config["end"].(string); ok && e != "" && e != "now" {
		if t, err := time.Parse(time.RFC3339, e); err == nil {
			end = t
		}
	}

	params := url.Values{
		"query": {logql},
		"start": {fmt.Sprintf("%d", start.UnixNano())},
		"end":   {fmt.Sprintf("%d", end.UnixNano())},
		"limit": {fmt.Sprintf("%d", limit)},
	}

	apiURL := strings.TrimRight(lokiURL, "/") + "/loki/api/v1/query_range?" + params.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("loki.query: build request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("loki.query: http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("loki.query: HTTP %d", resp.StatusCode)
	}

	var result lokiQueryRangeResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("loki.query: decode: %w", err)
	}

	var lines []string
	for _, stream := range result.Data.Result {
		for _, v := range stream.Values {
			lines = append(lines, v[1])
		}
	}
	if lines == nil {
		lines = []string{}
	}

	p.logger.Info("loki.query", zap.String("query", logql), zap.Int("lines", len(lines)))
	return map[string]interface{}{"lines": lines, "count": len(lines)}, nil
}

func (p *LokiNativePlugin) assert(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	withinStr, _ := config["within"].(string)
	deadline := time.Now().Add(10 * time.Second)
	if withinStr != "" {
		if d, err := time.ParseDuration(withinStr); err == nil {
			deadline = time.Now().Add(d)
		}
	}

	var result map[string]interface{}
	var lastErr error

	for time.Now().Before(deadline) {
		result, lastErr = p.query(ctx, config)
		if lastErr == nil {
			count, _ := result["count"].(int)
			if count > 0 {
				break
			}
		}
		time.Sleep(500 * time.Millisecond)
	}
	if lastErr != nil {
		return nil, lastErr
	}

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
			return nil, fmt.Errorf("loki.assert: %w", err)
		}
	}

	return result, nil
}
