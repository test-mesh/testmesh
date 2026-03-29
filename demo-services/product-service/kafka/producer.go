package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/IBM/sarama"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
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

func (p *Producer) PublishProductCreated(ctx context.Context, productID, name string, price float64, inventory int) error {
	event := map[string]interface{}{
		"event_type": "product.created",
		"product_id": productID,
		"name":       name,
		"price":      price,
		"inventory":  inventory,
	}

	return p.publish(ctx, "product.created", event)
}

func (p *Producer) PublishInventoryChanged(ctx context.Context, productID string, oldInventory, newInventory int) error {
	event := map[string]interface{}{
		"event_type":    "product.inventory.changed",
		"product_id":    productID,
		"old_inventory": oldInventory,
		"new_inventory": newInventory,
	}

	return p.publish(ctx, "product.inventory.changed", event)
}

func (p *Producer) publish(ctx context.Context, topic string, event interface{}) error {
	data, err := json.Marshal(event)
	if err != nil {
		return err
	}

	// Inject trace context into Kafka message headers
	carrier := propagation.MapCarrier{}
	otel.GetTextMapPropagator().Inject(ctx, carrier)

	var headers []sarama.RecordHeader
	for k, v := range carrier {
		headers = append(headers, sarama.RecordHeader{
			Key:   []byte(k),
			Value: []byte(v),
		})
	}

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
