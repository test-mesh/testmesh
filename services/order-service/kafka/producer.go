package kafka

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/IBM/sarama"
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

func (p *Producer) PublishOrderPlaced(orderID, userID string, items []OrderItem, total float64) error {
	event := map[string]interface{}{
		"event_type": "order.placed",
		"order_id":   orderID,
		"user_id":    userID,
		"items":      items,
		"total":      total,
	}

	return p.publish("order.placed", event)
}

func (p *Producer) PublishOrderStatusChanged(orderID, oldStatus, newStatus string) error {
	event := map[string]interface{}{
		"event_type": "order.status.changed",
		"order_id":   orderID,
		"old_status": oldStatus,
		"new_status": newStatus,
	}

	return p.publish("order.status.changed", event)
}

func (p *Producer) publish(topic string, event interface{}) error {
	data, err := json.Marshal(event)
	if err != nil {
		return err
	}

	msg := &sarama.ProducerMessage{
		Topic: topic,
		Value: sarama.ByteEncoder(data),
	}

	_, _, err = p.producer.SendMessage(msg)
	return err
}

func (p *Producer) Close() error {
	return p.producer.Close()
}
