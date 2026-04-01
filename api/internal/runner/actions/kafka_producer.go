package actions

import (
	"context"
	"fmt"
	"strings"

	"github.com/test-mesh/testmesh/internal/runner/actions/async"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	"go.uber.org/zap"
)

// KafkaProducerHandler handles the kafka_producer action type.
type KafkaProducerHandler struct {
	logger *zap.Logger
}

// NewKafkaProducerHandler creates a new KafkaProducerHandler.
func NewKafkaProducerHandler(logger *zap.Logger) *KafkaProducerHandler {
	return &KafkaProducerHandler{logger: logger}
}

// Execute produces a single message to a Kafka topic.
func (h *KafkaProducerHandler) Execute(ctx context.Context, config map[string]interface{}) (models.OutputData, error) {
	cfg, err := parseKafkaProducerConfig(config)
	if err != nil {
		return nil, fmt.Errorf("invalid kafka_producer config: %w", err)
	}

	if len(cfg.Brokers) == 0 {
		return nil, fmt.Errorf("brokers is required")
	}
	if cfg.Topic == "" {
		return nil, fmt.Errorf("topic is required")
	}
	if cfg.Payload == nil {
		return nil, fmt.Errorf("payload is required")
	}

	// Inject trace context into Kafka message headers for distributed tracing
	if cfg.Headers == nil {
		cfg.Headers = make(map[string]string)
	}
	otel.GetTextMapPropagator().Inject(ctx, propagation.MapCarrier(cfg.Headers))

	h.logger.Info("Producing Kafka message",
		zap.Strings("brokers", cfg.Brokers),
		zap.String("topic", cfg.Topic),
		zap.String("key", cfg.Key),
	)

	producer := async.NewKafkaProducer(cfg)
	result, err := producer.Produce(ctx)
	if err != nil {
		return nil, err
	}

	h.logger.Info("Kafka message produced",
		zap.String("topic", result.Topic),
		zap.Int32("partition", result.Partition),
		zap.Int64("offset", result.Offset),
		zap.Int64("duration_ms", result.Duration),
	)

	return models.OutputData{
		"success":     result.Success,
		"topic":       result.Topic,
		"partition":   result.Partition,
		"offset":      result.Offset,
		"key":         result.Key,
		"duration_ms": result.Duration,
	}, nil
}

func parseKafkaProducerConfig(config map[string]interface{}) (*async.KafkaProducerConfig, error) {
	cfg := &async.KafkaProducerConfig{}

	// brokers — []string, []interface{}, or comma-separated string
	if v, ok := config["brokers"]; ok {
		switch b := v.(type) {
		case []interface{}:
			for _, item := range b {
				if s, ok := item.(string); ok {
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
	if v, ok := config["key"].(string); ok {
		cfg.Key = v
	}
	cfg.Payload = config["payload"]

	if v, ok := config["headers"]; ok {
		if m, ok := v.(map[string]interface{}); ok {
			cfg.Headers = make(map[string]string, len(m))
			for k, val := range m {
				cfg.Headers[k] = fmt.Sprintf("%v", val)
			}
		}
	}

	if v, ok := config["compression"].(string); ok {
		cfg.Compression = v
	}

	// TLS
	if tlsRaw, ok := config["tls"].(map[string]interface{}); ok {
		tlsCfg := &async.TLSConfig{}
		if v, ok := tlsRaw["enabled"].(bool); ok {
			tlsCfg.Enabled = v
		}
		if v, ok := tlsRaw["insecure_skip_verify"].(bool); ok {
			tlsCfg.InsecureSkipVerify = v
		}
		if v, ok := tlsRaw["cert_file"].(string); ok {
			tlsCfg.CertFile = v
		}
		if v, ok := tlsRaw["key_file"].(string); ok {
			tlsCfg.KeyFile = v
		}
		if v, ok := tlsRaw["ca_file"].(string); ok {
			tlsCfg.CAFile = v
		}
		cfg.TLS = tlsCfg
	}

	return cfg, nil
}
