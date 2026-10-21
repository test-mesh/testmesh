package actions

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/test-mesh/testmesh/internal/runner/actions/async"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	"go.uber.org/zap"
)

// KafkaConsumerHandler handles the kafka_consumer action type.
type KafkaConsumerHandler struct {
	logger *zap.Logger
}

// NewKafkaConsumerHandler creates a new KafkaConsumerHandler.
func NewKafkaConsumerHandler(logger *zap.Logger) *KafkaConsumerHandler {
	return &KafkaConsumerHandler{logger: logger}
}

// Execute runs the kafka consumer action.
func (h *KafkaConsumerHandler) Execute(ctx context.Context, config map[string]interface{}) (models.OutputData, error) {
	cfg, err := parseKafkaConsumerConfig(config)
	if err != nil {
		return nil, fmt.Errorf("invalid kafka_consumer config: %w", err)
	}

	if len(cfg.Brokers) == 0 {
		return nil, fmt.Errorf("brokers is required")
	}
	if cfg.Topic == "" {
		return nil, fmt.Errorf("topic is required")
	}

	h.logger.Info("Starting Kafka consumer",
		zap.Strings("brokers", cfg.Brokers),
		zap.String("topic", cfg.Topic),
		zap.String("group_id", cfg.GroupID),
		zap.String("timeout", cfg.Timeout),
		zap.Int("count", cfg.Count),
	)

	consumer := async.NewKafkaConsumer(cfg)
	result, err := consumer.Consume(ctx)
	if err != nil {
		return nil, fmt.Errorf("kafka consume failed: %w", err)
	}

	h.logger.Info("Kafka consumer finished",
		zap.Int("messages", result.Count),
		zap.Int("scanned", result.Scanned),
		zap.Int64("duration_ms", result.Duration),
	)

	// Extract trace context from first consumed message headers (if present)
	// This links the consumer span to the producer's trace
	if len(result.Messages) > 0 && len(result.Messages[0].Headers) > 0 {
		carrier := make(propagation.MapCarrier)
		for k, v := range result.Messages[0].Headers {
			carrier[k] = v
		}
		// Extract trace context to link consumer to producer trace
		_ = otel.GetTextMapPropagator().Extract(ctx, carrier)
	}

	msgs := toPlainSlice(result.Messages)
	output := models.OutputData{
		"success":     result.Success,
		"messages":    msgs,
		"count":       result.Count,
		"scanned":     result.Scanned,
		"timed_out":   result.TimedOut,
		"duration_ms": result.Duration,
	}
	if len(msgs) > 0 {
		// Shortcuts for the common single-event case:
		//   message.key, message.headers, ...  and  event.<field> for JSON payloads
		first := msgs[0].(map[string]interface{})
		output["message"] = first
		if payload, ok := first["json"]; ok {
			output["event"] = payload
		} else {
			output["event"] = first["value"]
		}
	}

	if result.TimedOut && failOnTimeout(config, cfg) {
		return output, timeoutError(cfg, result)
	}

	return output, nil
}

// failOnTimeout decides whether receiving fewer than count messages is an
// error. It defaults to true when the step waits for a specific event (any
// match/filter criteria) and false otherwise, so plain "drain the topic"
// steps keep asserting on count themselves.
func failOnTimeout(config map[string]interface{}, cfg *async.KafkaConsumerConfig) bool {
	if v, ok := config["fail_on_timeout"].(bool); ok {
		return v
	}
	return !cfg.Filter.IsEmpty()
}

// timeoutError explains what the consumer saw, which is usually enough to
// tell a wrong topic, a wrong match value and a missing event apart.
func timeoutError(cfg *async.KafkaConsumerConfig, result *async.KafkaConsumerResult) error {
	var b strings.Builder
	fmt.Fprintf(&b, "timed out after %s waiting for %d message(s) on topic %q matching %s: ",
		cfg.Timeout, cfg.Count, cfg.Topic, cfg.Filter.Describe())

	switch {
	case result.Scanned == 0:
		b.WriteString("no messages were published to the topic")
		if cfg.StartFrom == async.StartFromTimestamp {
			fmt.Fprintf(&b, " since %s", cfg.Since.Format(time.RFC3339))
		}
	default:
		fmt.Fprintf(&b, "%d message(s) read, %d matched", result.Scanned, result.Count)
		if len(result.Unmatched) > 0 {
			b.WriteString("; most recent non-matching:")
			for _, m := range result.Unmatched {
				fmt.Fprintf(&b, "\n    key=%q value=%s", m.Key, truncate(m.Value, 300))
			}
		}
	}
	return fmt.Errorf("%s", b.String())
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// toPlainSlice converts messages to generic maps for assertions and output paths.
func toPlainSlice(messages []async.KafkaMessage) []interface{} {
	msgs := make([]interface{}, len(messages))
	for i, m := range messages {
		b, _ := json.Marshal(m)
		var v interface{}
		_ = json.Unmarshal(b, &v)
		msgs[i] = v
	}
	return msgs
}

// parseKafkaConsumerConfig converts a generic config map to KafkaConsumerConfig.
func parseKafkaConsumerConfig(config map[string]interface{}) (*async.KafkaConsumerConfig, error) {
	cfg := &async.KafkaConsumerConfig{
		Count:   1,
		Timeout: "30s",
	}

	// brokers — []string or comma-separated string
	if v, ok := config["brokers"]; ok {
		switch b := v.(type) {
		case []interface{}:
			for _, item := range b {
				if s, ok := item.(string); ok {
					// brokers can be comma-separated themselves
					for _, part := range strings.Split(s, ",") {
						if trimmed := strings.TrimSpace(part); trimmed != "" {
							cfg.Brokers = append(cfg.Brokers, trimmed)
						}
					}
				}
			}
		case []string:
			cfg.Brokers = b
		case string:
			for _, part := range strings.Split(b, ",") {
				if trimmed := strings.TrimSpace(part); trimmed != "" {
					cfg.Brokers = append(cfg.Brokers, trimmed)
				}
			}
		}
	}

	if v, ok := config["topic"].(string); ok {
		cfg.Topic = v
	}
	if v, ok := config["group_id"].(string); ok {
		cfg.GroupID = v
	}
	if v, ok := config["timeout"].(string); ok {
		cfg.Timeout = v
	}
	if v, ok := config["count"]; ok {
		switch n := v.(type) {
		case int:
			cfg.Count = n
		case float64:
			cfg.Count = int(n)
		case int64:
			cfg.Count = int(n)
		}
	}
	if v, ok := config["from_beginning"].(bool); ok {
		cfg.FromBeginning = v
	}
	if v, ok := config["auto_offset_reset"].(string); ok {
		cfg.AutoOffsetReset = v
	}

	filter, err := parseMessageFilter(config)
	if err != nil {
		return nil, err
	}
	cfg.Filter = filter

	// Start position (group-less mode only)
	cfg.StartFrom = async.StartFromLatest
	if cfg.FromBeginning || cfg.AutoOffsetReset == "earliest" {
		cfg.StartFrom = async.StartFromEarliest
	} else if v, ok := config["since"].(string); ok && v != "" {
		startFrom, since, err := parseSince(v, time.Now())
		if err != nil {
			return nil, err
		}
		cfg.StartFrom, cfg.Since = startFrom, since
	}

	return cfg, nil
}

// parseSince interprets the `since` option:
//
//	earliest | beginning   – read the whole topic
//	latest | now           – only messages produced after the step starts
//	2026-01-02T15:04:05Z   – messages at or after a timestamp (RFC 3339)
//	5m                     – messages from the last five minutes
func parseSince(v string, now time.Time) (string, time.Time, error) {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "earliest", "beginning":
		return async.StartFromEarliest, time.Time{}, nil
	case "latest", "now":
		return async.StartFromLatest, time.Time{}, nil
	}
	if t, err := time.Parse(time.RFC3339Nano, v); err == nil {
		return async.StartFromTimestamp, t, nil
	}
	if d, err := time.ParseDuration(v); err == nil && d >= 0 {
		return async.StartFromTimestamp, now.Add(-d), nil
	}
	return "", time.Time{}, fmt.Errorf("invalid since %q: use earliest, latest, an RFC 3339 timestamp or a duration like 5m", v)
}

// parseMessageFilter reads the `match:` shorthand and the `filter:` block.
//
//	match:              # JSON payload fields that must equal these values
//	  order_id: "{{order_id}}"
//	  status: placed
//	filter:
//	  key: "{{order_id}}"
//	  headers: { event-type: OrderPlaced }
func parseMessageFilter(config map[string]interface{}) (*async.MessageFilter, error) {
	filter := &async.MessageFilter{}

	if raw, ok := config["match"]; ok && raw != nil {
		m, ok := raw.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("match must be a mapping of JSON field paths to expected values")
		}
		filter.Match = m
	}

	if raw, ok := config["filter"]; ok && raw != nil {
		m, ok := raw.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("filter must be a mapping")
		}
		if v, ok := m["key"]; ok && v != nil {
			filter.Key = fmt.Sprint(v)
		}
		if v, ok := m["key_pattern"].(string); ok {
			if _, err := regexp.Compile(v); err != nil {
				return nil, fmt.Errorf("invalid filter.key_pattern: %w", err)
			}
			filter.KeyPattern = v
		}
		if hdrs, ok := m["headers"].(map[string]interface{}); ok {
			filter.Headers = make(map[string]string, len(hdrs))
			for k, v := range hdrs {
				filter.Headers[k] = fmt.Sprint(v)
			}
		}
		if v, ok := m["json_path"].(string); ok {
			filter.JSONPath = v
			filter.JSONValue = m["json_value"]
		}
		if nested, ok := m["match"].(map[string]interface{}); ok {
			if filter.Match == nil {
				filter.Match = make(map[string]interface{}, len(nested))
			}
			for k, v := range nested {
				filter.Match[k] = v
			}
		}
	}

	if filter.IsEmpty() {
		return nil, nil
	}
	return filter, nil
}
