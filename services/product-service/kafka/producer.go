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

func (p *Producer) PublishProductCreated(productID, name string, price float64, inventory int) error {
	event := map[string]interface{}{
		"event_type": "product.created",
		"product_id": productID,
		"name":       name,
		"price":      price,
		"inventory":  inventory,
	}

	return p.publish("product.created", event)
}

func (p *Producer) PublishInventoryChanged(productID string, oldInventory, newInventory int) error {
	event := map[string]interface{}{
		"event_type":    "product.inventory.changed",
		"product_id":    productID,
		"old_inventory": oldInventory,
		"new_inventory": newInventory,
	}

	return p.publish("product.inventory.changed", event)
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
