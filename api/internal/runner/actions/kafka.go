package actions

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/georgi-georgiev/testmesh/internal/runner/actions/async"
	"github.com/georgi-georgiev/testmesh/internal/storage/models"
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
		zap.Int64("duration_ms", result.Duration),
	)

	// Convert messages to a plain interface slice for OutputData
	msgs := make([]interface{}, len(result.Messages))
	for i, m := range result.Messages {
		b, _ := json.Marshal(m)
		var v interface{}
		_ = json.Unmarshal(b, &v)
		msgs[i] = v
	}

	return models.OutputData{
		"success":     result.Success,
		"messages":    msgs,
		"count":       result.Count,
		"duration_ms": result.Duration,
	}, nil
}

// parseKafkaConsumerConfig converts a generic config map to KafkaConsumerConfig.
func parseKafkaConsumerConfig(config map[string]interface{}) (*async.KafkaConsumerConfig, error) {
	cfg := &async.KafkaConsumerConfig{
		Count:   1,
		Timeout: "30s",
		GroupID: "testmesh",
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

	return cfg, nil
}
