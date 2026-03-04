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

func (p *Producer) PublishUserCreated(userID, email, name string) error {
	event := map[string]interface{}{
		"event_type": "user.created",
		"user_id":    userID,
		"email":      email,
		"name":       name,
	}

	return p.publish("user.created", event)
}

func (p *Producer) PublishUserLogin(userID, email string) error {
	event := map[string]interface{}{
		"event_type": "user.login",
		"user_id":    userID,
		"email":      email,
	}

	return p.publish("user.login", event)
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
