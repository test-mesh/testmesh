package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/IBM/sarama"
	"go.opentelemetry.io/otel"
)

type Producer struct {
	producer sarama.SyncProducer
}

func NewProducer() (*Producer, error) {
	brokers := strings.Split(os.Getenv("KAFKA_BROKERS"), ",")

	config := sarama.NewConfig()
	config.Producer.Return.Successes = true
	config.Producer.RequiredAcks = sarama.WaitForAll
	config.Producer.Retry.Max = 5

	producer, err := sarama.NewSyncProducer(brokers, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create Kafka producer: %w", err)
	}

	return &Producer{producer: producer}, nil
}

type OrderItem struct {
	ProductID string  `json:"product_id"`
	Quantity  int     `json:"quantity"`
	Price     float64 `json:"price"`
}

func (p *Producer) PublishOrderPlaced(ctx context.Context, orderID, userID string, items []OrderItem, total float64) error {
	event := map[string]interface{}{
		"event_type": "order.placed",
		"order_id":   orderID,
		"user_id":    userID,
		"items":      items,
		"total":      total,
	}

	return p.publish(ctx, "order.placed", event)
}

func (p *Producer) PublishOrderStatusChanged(ctx context.Context, orderID, oldStatus, newStatus string) error {
	event := map[string]interface{}{
		"event_type": "order.status.changed",
		"order_id":   orderID,
		"old_status": oldStatus,
		"new_status": newStatus,
	}

	return p.publish(ctx, "order.status.changed", event)
}

// saramaHeaderCarrier adapts sarama message headers for OpenTelemetry propagation.
type saramaHeaderCarrier struct {
	headers *[]sarama.RecordHeader
}

func (c *saramaHeaderCarrier) Get(key string) string {
	for _, h := range *c.headers {
		if string(h.Key) == key {
			return string(h.Value)
		}
	}
	return ""
}

func (c *saramaHeaderCarrier) Set(key, value string) {
	*c.headers = append(*c.headers, sarama.RecordHeader{
		Key:   []byte(key),
		Value: []byte(value),
	})
}

func (c *saramaHeaderCarrier) Keys() []string {
	keys := make([]string, len(*c.headers))
	for i, h := range *c.headers {
		keys[i] = string(h.Key)
	}
	return keys
}

func (p *Producer) publish(ctx context.Context, topic string, event interface{}) error {
	data, err := json.Marshal(event)
	if err != nil {
		return err
	}

	var headers []sarama.RecordHeader
	// Inject trace context into Kafka message headers
	otel.GetTextMapPropagator().Inject(ctx, &saramaHeaderCarrier{headers: &headers})

	msg := &sarama.ProducerMessage{
		Topic:   topic,
		Value:   sarama.ByteEncoder(data),
		Headers: headers,
	}

	_, _, err = p.producer.SendMessage(msg)
	return err
}

func (p *Producer) Close() error {
	return p.producer.Close()
}
