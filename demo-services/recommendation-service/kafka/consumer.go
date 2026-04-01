package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"recommendation-service/graph"
	"strings"

	"github.com/IBM/sarama"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
	"go.uber.org/zap"
)

// OrderPlacedEvent mirrors the event published by order-service.
type OrderPlacedEvent struct {
	EventType string      `json:"event_type"`
	OrderID   string      `json:"order_id"`
	UserID    string      `json:"user_id"`
	Items     []OrderItem `json:"items"`
	Total     float64     `json:"total"`
}

type OrderItem struct {
	ProductID string  `json:"product_id"`
	Quantity  int     `json:"quantity"`
	Price     float64 `json:"price"`
}

type Consumer struct {
	consumer    sarama.ConsumerGroup
	graphClient *graph.Client
	logger      *zap.Logger
}

func NewConsumer(graphClient *graph.Client, logger *zap.Logger) (*Consumer, error) {
	brokers := strings.Split(os.Getenv("KAFKA_BROKERS"), ",")
	if brokers[0] == "" {
		brokers = []string{"kafka:9092"}
	}

	config := sarama.NewConfig()
	config.Consumer.Return.Errors = true
	config.Consumer.Offsets.Initial = sarama.OffsetNewest

	consumer, err := sarama.NewConsumerGroup(brokers, "recommendation-service", config)
	if err != nil {
		return nil, fmt.Errorf("failed to create kafka consumer group: %w", err)
	}

	return &Consumer{consumer: consumer, graphClient: graphClient, logger: logger}, nil
}

func (c *Consumer) Start(ctx context.Context) {
	handler := &consumerGroupHandler{graphClient: c.graphClient, logger: c.logger}

	go func() {
		for {
			if err := c.consumer.Consume(ctx, []string{"order.placed"}, handler); err != nil {
				c.logger.Error("kafka consumer error", zap.Error(err))
			}
			if ctx.Err() != nil {
				return
			}
		}
	}()

	go func() {
		for err := range c.consumer.Errors() {
			c.logger.Error("kafka error", zap.Error(err))
		}
	}()
}

func (c *Consumer) Close() error {
	return c.consumer.Close()
}

type consumerGroupHandler struct {
	graphClient *graph.Client
	logger      *zap.Logger
}

func (h *consumerGroupHandler) Setup(sarama.ConsumerGroupSession) error   { return nil }
func (h *consumerGroupHandler) Cleanup(sarama.ConsumerGroupSession) error { return nil }

func (h *consumerGroupHandler) ConsumeClaim(session sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	tracer := otel.Tracer("recommendation-service")

	for msg := range claim.Messages() {
		// Extract OTel trace context from headers
		carrier := propagation.MapCarrier{}
		for _, header := range msg.Headers {
			carrier[string(header.Key)] = string(header.Value)
		}
		ctx := otel.GetTextMapPropagator().Extract(context.Background(), carrier)
		_, span := tracer.Start(ctx, "kafka.consume order.placed", trace.WithSpanKind(trace.SpanKindConsumer))

		var event OrderPlacedEvent
		if err := json.Unmarshal(msg.Value, &event); err != nil {
			h.logger.Error("failed to unmarshal order.placed", zap.Error(err))
			span.End()
			session.MarkMessage(msg, "")
			continue
		}

		var productIDs []string
		for _, item := range event.Items {
			productIDs = append(productIDs, item.ProductID)
		}

		if h.graphClient != nil && len(productIDs) > 0 {
			if err := h.graphClient.CreatePurchasedEdges(ctx, event.OrderID, event.UserID, productIDs); err != nil {
				h.logger.Error("failed to create graph edges", zap.String("order_id", event.OrderID), zap.Error(err))
			}
		}

		span.End()
		session.MarkMessage(msg, "")
	}
	return nil
}
