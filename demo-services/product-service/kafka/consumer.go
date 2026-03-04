package kafka

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"strings"

	"github.com/IBM/sarama"
	"gorm.io/gorm"
	"product-service/models"
)

type Consumer struct {
	consumer sarama.ConsumerGroup
	db       *gorm.DB
}

type OrderPlacedEvent struct {
	EventType string `json:"event_type"`
	OrderID   string `json:"order_id"`
	UserID    string `json:"user_id"`
	Items     []struct {
		ProductID string `json:"product_id"`
		Quantity  int    `json:"quantity"`
	} `json:"items"`
}

func NewConsumer(db *gorm.DB) (*Consumer, error) {
	brokers := strings.Split(os.Getenv("KAFKA_BROKERS"), ",")

	config := sarama.NewConfig()
	config.Consumer.Return.Errors = true
	config.Consumer.Offsets.Initial = sarama.OffsetNewest

	consumer, err := sarama.NewConsumerGroup(brokers, "product-service", config)
	if err != nil {
		return nil, err
	}

	return &Consumer{
		consumer: consumer,
		db:       db,
	}, nil
}

func (c *Consumer) Start(ctx context.Context) {
	topics := []string{"order.placed"}

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
		var event OrderPlacedEvent
		if err := json.Unmarshal(message.Value, &event); err != nil {
			log.Printf("Error unmarshaling message: %v", err)
			session.MarkMessage(message, "")
			continue
		}

		// Update inventory for each item
		for _, item := range event.Items {
			var product models.Product
			if err := h.db.First(&product, "id = ?", item.ProductID).Error; err != nil {
				log.Printf("Error finding product %s: %v", item.ProductID, err)
				continue
			}

			// Decrease inventory
			newInventory := product.Inventory - item.Quantity
			if newInventory < 0 {
				newInventory = 0
			}

			if err := h.db.Model(&product).Update("inventory", newInventory).Error; err != nil {
				log.Printf("Error updating inventory for product %s: %v", item.ProductID, err)
			} else {
				log.Printf("Updated inventory for product %s: %d -> %d", item.ProductID, product.Inventory, newInventory)
			}
		}

		session.MarkMessage(message, "")
	}

	return nil
}
