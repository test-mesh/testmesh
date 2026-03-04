package async

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"time"

	"github.com/IBM/sarama"
)

// KafkaConsumerConfig defines configuration for Kafka consumer action
type KafkaConsumerConfig struct {
	Brokers       []string          `yaml:"brokers" json:"brokers"`
	Topic         string            `yaml:"topic" json:"topic"`
	GroupID       string            `yaml:"group_id" json:"group_id"`
	Timeout       string            `yaml:"timeout" json:"timeout"`
	Count         int               `yaml:"count" json:"count"`
	Filter        *MessageFilter    `yaml:"filter,omitempty" json:"filter,omitempty"`
	FromBeginning bool              `yaml:"from_beginning" json:"from_beginning"`
	SASL          *SASLConfig       `yaml:"sasl,omitempty" json:"sasl,omitempty"`
	TLS           *TLSConfig        `yaml:"tls,omitempty" json:"tls,omitempty"`
}

// MessageFilter defines filtering criteria for messages
type MessageFilter struct {
	Key        string            `yaml:"key,omitempty" json:"key,omitempty"`
	KeyPattern string            `yaml:"key_pattern,omitempty" json:"key_pattern,omitempty"`
	Headers    map[string]string `yaml:"headers,omitempty" json:"headers,omitempty"`
	JSONPath   string            `yaml:"json_path,omitempty" json:"json_path,omitempty"`
	JSONValue  interface{}       `yaml:"json_value,omitempty" json:"json_value,omitempty"`
}

// SASLConfig defines SASL authentication
type SASLConfig struct {
	Mechanism string `yaml:"mechanism" json:"mechanism"`
	Username  string `yaml:"username" json:"username"`
	Password  string `yaml:"password" json:"password"`
}

// TLSConfig defines TLS configuration
type TLSConfig struct {
	Enabled            bool   `yaml:"enabled" json:"enabled"`
	InsecureSkipVerify bool   `yaml:"insecure_skip_verify" json:"insecure_skip_verify"`
	CertFile           string `yaml:"cert_file,omitempty" json:"cert_file,omitempty"`
	KeyFile            string `yaml:"key_file,omitempty" json:"key_file,omitempty"`
	CAFile             string `yaml:"ca_file,omitempty" json:"ca_file,omitempty"`
}

// KafkaMessage represents a consumed message
type KafkaMessage struct {
	Topic     string            `json:"topic"`
	Partition int32             `json:"partition"`
	Offset    int64             `json:"offset"`
	Key       string            `json:"key"`
	Value     string            `json:"value"`
	Headers   map[string]string `json:"headers"`
	Timestamp time.Time         `json:"timestamp"`
	JSON      interface{}       `json:"json,omitempty"`
}

// KafkaConsumerResult holds the result of consuming
type KafkaConsumerResult struct {
	Success  bool            `json:"success"`
	Messages []KafkaMessage  `json:"messages"`
	Count    int             `json:"count"`
	Duration int64           `json:"duration_ms"`
	Error    string          `json:"error,omitempty"`
}

// KafkaConsumer handles consuming messages from Kafka
type KafkaConsumer struct {
	config *KafkaConsumerConfig
}

// NewKafkaConsumer creates a new Kafka consumer
func NewKafkaConsumer(config *KafkaConsumerConfig) *KafkaConsumer {
	return &KafkaConsumer{config: config}
}

// Consume consumes messages from Kafka
func (kc *KafkaConsumer) Consume(ctx context.Context) (*KafkaConsumerResult, error) {
	start := time.Now()
	result := &KafkaConsumerResult{
		Messages: make([]KafkaMessage, 0),
	}

	// Parse timeout
	timeout := 30 * time.Second
	if kc.config.Timeout != "" {
		if parsed, err := time.ParseDuration(kc.config.Timeout); err == nil {
			timeout = parsed
		}
	}

	// Create context with timeout
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// Configure Sarama
	saramaConfig := sarama.NewConfig()
	saramaConfig.Consumer.Return.Errors = true
	saramaConfig.Consumer.Offsets.Initial = sarama.OffsetNewest
	if kc.config.FromBeginning {
		saramaConfig.Consumer.Offsets.Initial = sarama.OffsetOldest
	}

	// Configure SASL if provided
	if kc.config.SASL != nil {
		saramaConfig.Net.SASL.Enable = true
		saramaConfig.Net.SASL.User = kc.config.SASL.Username
		saramaConfig.Net.SASL.Password = kc.config.SASL.Password
		switch kc.config.SASL.Mechanism {
		case "PLAIN":
			saramaConfig.Net.SASL.Mechanism = sarama.SASLTypePlaintext
		case "SCRAM-SHA-256":
			saramaConfig.Net.SASL.Mechanism = sarama.SASLTypeSCRAMSHA256
		case "SCRAM-SHA-512":
			saramaConfig.Net.SASL.Mechanism = sarama.SASLTypeSCRAMSHA512
		}
	}

	// Configure TLS if provided
	if kc.config.TLS != nil && kc.config.TLS.Enabled {
		saramaConfig.Net.TLS.Enable = true
	}

	// Create consumer group
	group, err := sarama.NewConsumerGroup(kc.config.Brokers, kc.config.GroupID, saramaConfig)
	if err != nil {
		result.Error = fmt.Sprintf("failed to create consumer group: %v", err)
		return result, err
	}
	defer group.Close()

	// Create handler
	handler := &consumerHandler{
		filter:   kc.config.Filter,
		maxCount: kc.config.Count,
		messages: make([]KafkaMessage, 0),
		done:     make(chan struct{}),
	}

	// Consume
	go func() {
		for {
			if err := group.Consume(ctx, []string{kc.config.Topic}, handler); err != nil {
				return
			}
			if ctx.Err() != nil {
				return
			}
		}
	}()

	// Wait for completion or timeout
	select {
	case <-handler.done:
	case <-ctx.Done():
	}

	result.Messages = handler.messages
	result.Count = len(handler.messages)
	result.Duration = time.Since(start).Milliseconds()
	result.Success = true

	return result, nil
}

type consumerHandler struct {
	filter   *MessageFilter
	maxCount int
	messages []KafkaMessage
	done     chan struct{}
}

func (h *consumerHandler) Setup(_ sarama.ConsumerGroupSession) error   { return nil }
func (h *consumerHandler) Cleanup(_ sarama.ConsumerGroupSession) error { return nil }

func (h *consumerHandler) ConsumeClaim(session sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	for msg := range claim.Messages() {
		kafkaMsg := KafkaMessage{
			Topic:     msg.Topic,
			Partition: msg.Partition,
			Offset:    msg.Offset,
			Key:       string(msg.Key),
			Value:     string(msg.Value),
			Headers:   make(map[string]string),
			Timestamp: msg.Timestamp,
		}

		// Extract headers
		for _, header := range msg.Headers {
			kafkaMsg.Headers[string(header.Key)] = string(header.Value)
		}

		// Try to parse JSON
		var jsonValue interface{}
		if json.Unmarshal(msg.Value, &jsonValue) == nil {
			kafkaMsg.JSON = jsonValue
		}

		// Apply filter
		if h.filter != nil && !h.matchesFilter(kafkaMsg) {
			session.MarkMessage(msg, "")
			continue
		}

		h.messages = append(h.messages, kafkaMsg)
		session.MarkMessage(msg, "")

		// Check if we've reached the count
		if h.maxCount > 0 && len(h.messages) >= h.maxCount {
			close(h.done)
			return nil
		}
	}
	return nil
}

func (h *consumerHandler) matchesFilter(msg KafkaMessage) bool {
	if h.filter == nil {
		return true
	}

	// Filter by key
	if h.filter.Key != "" && msg.Key != h.filter.Key {
		return false
	}

	// Filter by key pattern
	if h.filter.KeyPattern != "" {
		matched, _ := regexp.MatchString(h.filter.KeyPattern, msg.Key)
		if !matched {
			return false
		}
	}

	// Filter by headers
	for key, value := range h.filter.Headers {
		if msg.Headers[key] != value {
			return false
		}
	}

	return true
}
