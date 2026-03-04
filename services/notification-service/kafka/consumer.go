package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"notification-service/models"
	"os"
	"strings"

	"github.com/IBM/sarama"
	"gorm.io/gorm"
)

type Consumer struct {
	consumer sarama.ConsumerGroup
	db       *gorm.DB
}

type UserCreatedEvent struct {
	EventType string `json:"event_type"`
	UserID    string `json:"user_id"`
	Email     string `json:"email"`
	Name      string `json:"name"`
}

type OrderPlacedEvent struct {
	EventType string  `json:"event_type"`
	OrderID   string  `json:"order_id"`
	UserID    string  `json:"user_id"`
	Total     float64 `json:"total"`
}

type OrderStatusChangedEvent struct {
	EventType string `json:"event_type"`
	OrderID   string `json:"order_id"`
	OldStatus string `json:"old_status"`
	NewStatus string `json:"new_status"`
}

func NewConsumer(db *gorm.DB) (*Consumer, error) {
	brokers := strings.Split(os.Getenv("KAFKA_BROKERS"), ",")

	config := sarama.NewConfig()
	config.Consumer.Return.Errors = true
	config.Consumer.Offsets.Initial = sarama.OffsetNewest

	consumer, err := sarama.NewConsumerGroup(brokers, "notification-service", config)
	if err != nil {
		return nil, err
	}

	return &Consumer{
		consumer: consumer,
		db:       db,
	}, nil
}

func (c *Consumer) Start(ctx context.Context) {
	topics := []string{"user.created", "order.placed", "order.status.changed"}

	handler := &consumerGroupHandler{db: c.db}

	go func() {
		for {
			if err := c.consumer.Consume(ctx, topics, handler); err != nil {
				log.Printf("Error consuming messages: %v", err)
			}

			// Check if context was cancelled
			if ctx.Err() != nil {
				return
			}
		}
	}()

	// Error handling goroutine
	go func() {
		for err := range c.consumer.Errors() {
			log.Printf("Consumer error: %v", err)
		}
	}()
}

func (c *Consumer) Close() error {
	return c.consumer.Close()
}

type consumerGroupHandler struct {
	db *gorm.DB
}

func (h *consumerGroupHandler) Setup(sarama.ConsumerGroupSession) error {
	return nil
}

func (h *consumerGroupHandler) Cleanup(sarama.ConsumerGroupSession) error {
	return nil
}

func (h *consumerGroupHandler) ConsumeClaim(session sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	for message := range claim.Messages() {
		log.Printf("Received message from topic %s: %s", message.Topic, string(message.Value))

		switch message.Topic {
		case "user.created":
			h.handleUserCreated(message.Value)
		case "order.placed":
			h.handleOrderPlaced(message.Value)
		case "order.status.changed":
			h.handleOrderStatusChanged(message.Value)
		}

		session.MarkMessage(message, "")
	}

	return nil
}

func (h *consumerGroupHandler) handleUserCreated(data []byte) {
	var event UserCreatedEvent
	if err := json.Unmarshal(data, &event); err != nil {
		log.Printf("Error unmarshaling user.created event: %v", err)
		return
	}

	notification := models.Notification{
		UserID:  event.UserID,
		Type:    "user.created",
		Message: fmt.Sprintf("Welcome %s! Your account has been created successfully.", event.Name),
		Data: models.JSONB{
			"email": event.Email,
			"name":  event.Name,
		},
	}

	if err := h.db.Create(&notification).Error; err != nil {
		log.Printf("Error creating notification: %v", err)
	} else {
		log.Printf("Created welcome notification for user %s", event.UserID)
	}
}

func (h *consumerGroupHandler) handleOrderPlaced(data []byte) {
	var event OrderPlacedEvent
	if err := json.Unmarshal(data, &event); err != nil {
		log.Printf("Error unmarshaling order.placed event: %v", err)
		return
	}

	notification := models.Notification{
		UserID:  event.UserID,
		Type:    "order.placed",
		Message: fmt.Sprintf("Your order #%s has been placed successfully! Total: $%.2f", event.OrderID, event.Total),
		Data: models.JSONB{
			"order_id": event.OrderID,
			"total":    event.Total,
		},
	}

	if err := h.db.Create(&notification).Error; err != nil {
		log.Printf("Error creating notification: %v", err)
	} else {
		log.Printf("Created order confirmation notification for user %s", event.UserID)
	}
}

func (h *consumerGroupHandler) handleOrderStatusChanged(data []byte) {
	var event OrderStatusChangedEvent
	if err := json.Unmarshal(data, &event); err != nil {
		log.Printf("Error unmarshaling order.status.changed event: %v", err)
		return
	}

	// This would need user_id from the order - for now we'll skip it
	// In a real system, we'd query the order service or include user_id in the event
	log.Printf("Order %s status changed from %s to %s", event.OrderID, event.OldStatus, event.NewStatus)
}
