package plugins

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/IBM/sarama"
	"go.uber.org/zap"
)

// KafkaNativePlugin provides native Kafka integration
type KafkaNativePlugin struct {
	logger *zap.Logger
}

// NewKafkaNativePlugin creates a new Kafka plugin
func NewKafkaNativePlugin(logger *zap.Logger) *KafkaNativePlugin {
	return &KafkaNativePlugin{logger: logger}
}

// Name returns the plugin name
func (p *KafkaNativePlugin) Name() string {
	return "kafka"
}

// Execute runs a Kafka action
func (p *KafkaNativePlugin) Execute(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	action, _ := config["_action"].(string)

	switch action {
	case "kafka.produce":
		return p.produce(ctx, config)
	case "kafka.consume":
		return p.consume(ctx, config)
	case "kafka.admin.topics":
		return p.listTopics(ctx, config)
	case "kafka.admin.createTopic":
		return p.createTopic(ctx, config)
	case "kafka.admin.deleteTopic":
		return p.deleteTopic(ctx, config)
	default:
		return nil, fmt.Errorf("unknown action: %s", action)
	}
}

func (p *KafkaNativePlugin) getBrokers(config map[string]interface{}) []string {
	brokers := "localhost:9092"
	if b, ok := config["brokers"].(string); ok {
		brokers = b
	}
	return strings.Split(brokers, ",")
}

func (p *KafkaNativePlugin) getSaramaConfig(config map[string]interface{}) *sarama.Config {
	cfg := sarama.NewConfig()
	cfg.Producer.Return.Successes = true
	cfg.Producer.RequiredAcks = sarama.WaitForAll
	cfg.Consumer.Return.Errors = true

	if timeout, ok := config["connectionTimeout"].(float64); ok {
		cfg.Net.DialTimeout = time.Duration(timeout) * time.Millisecond
	}

	return cfg
}

// produce sends messages to a Kafka topic
func (p *KafkaNativePlugin) produce(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	brokers := p.getBrokers(config)
	topic, _ := config["topic"].(string)
	if topic == "" {
		return nil, fmt.Errorf("topic is required")
	}

	cfg := p.getSaramaConfig(config)
	producer, err := sarama.NewSyncProducer(brokers, cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create producer: %w", err)
	}
	defer producer.Close()

	p.logger.Info("Connected to Kafka", zap.Strings("brokers", brokers), zap.String("topic", topic))

	var messages []map[string]interface{}
	if msgs, ok := config["messages"].([]interface{}); ok {
		for _, m := range msgs {
			if msg, ok := m.(map[string]interface{}); ok {
				messages = append(messages, msg)
			}
		}
	} else {
		// Single message mode
		messages = []map[string]interface{}{config}
	}

	var results []map[string]interface{}
	for _, msg := range messages {
		key := ""
		if k, ok := msg["key"].(string); ok {
			key = k
		}

		value := ""
		if v, ok := msg["value"].(string); ok {
			value = v
		} else if v, ok := msg["value"]; ok {
			value = fmt.Sprintf("%v", v)
		}

		producerMsg := &sarama.ProducerMessage{
			Topic: topic,
			Value: sarama.StringEncoder(value),
		}
		if key != "" {
			producerMsg.Key = sarama.StringEncoder(key)
		}

		partition, offset, err := producer.SendMessage(producerMsg)
		if err != nil {
			return nil, fmt.Errorf("failed to send message: %w", err)
		}

		results = append(results, map[string]interface{}{
			"partition": partition,
			"offset":    offset,
		})
	}

	p.logger.Info("Produced messages", zap.Int("count", len(results)), zap.String("topic", topic))

	return map[string]interface{}{
		"topic":         topic,
		"messages_sent": len(results),
		"partitions":    results,
	}, nil
}

// consume reads messages from a Kafka topic
func (p *KafkaNativePlugin) consume(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	brokers := p.getBrokers(config)
	topic, _ := config["topic"].(string)
	if topic == "" {
		return nil, fmt.Errorf("topic is required")
	}

	cfg := p.getSaramaConfig(config)
	cfg.Consumer.Offsets.Initial = sarama.OffsetNewest
	if fromBeginning, ok := config["fromBeginning"].(bool); ok && fromBeginning {
		cfg.Consumer.Offsets.Initial = sarama.OffsetOldest
	}

	consumer, err := sarama.NewConsumer(brokers, cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create consumer: %w", err)
	}
	defer consumer.Close()

	partitionConsumer, err := consumer.ConsumePartition(topic, 0, cfg.Consumer.Offsets.Initial)
	if err != nil {
		return nil, fmt.Errorf("failed to consume partition: %w", err)
	}
	defer partitionConsumer.Close()

	maxMessages := 10
	if max, ok := config["maxMessages"].(float64); ok {
		maxMessages = int(max)
	}

	timeout := 5 * time.Second
	if t, ok := config["timeout"].(float64); ok {
		timeout = time.Duration(t) * time.Millisecond
	}

	p.logger.Info("Consuming from topic", zap.String("topic", topic), zap.Int("maxMessages", maxMessages))

	var messages []map[string]interface{}
	timer := time.NewTimer(timeout)
	defer timer.Stop()

ConsumerLoop:
	for {
		select {
		case msg := <-partitionConsumer.Messages():
			messages = append(messages, map[string]interface{}{
				"topic":     msg.Topic,
				"partition": msg.Partition,
				"offset":    msg.Offset,
				"key":       string(msg.Key),
				"value":     string(msg.Value),
				"timestamp": msg.Timestamp.Format(time.RFC3339),
			})
			if len(messages) >= maxMessages {
				break ConsumerLoop
			}
		case <-timer.C:
			break ConsumerLoop
		case <-ctx.Done():
			break ConsumerLoop
		}
	}

	p.logger.Info("Consumed messages", zap.Int("count", len(messages)))

	return map[string]interface{}{
		"topic":             topic,
		"messages_received": len(messages),
		"messages":          messages,
	}, nil
}

// listTopics lists all Kafka topics
func (p *KafkaNativePlugin) listTopics(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	brokers := p.getBrokers(config)
	cfg := p.getSaramaConfig(config)

	admin, err := sarama.NewClusterAdmin(brokers, cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create admin client: %w", err)
	}
	defer admin.Close()

	topics, err := admin.ListTopics()
	if err != nil {
		return nil, fmt.Errorf("failed to list topics: %w", err)
	}

	var topicList []map[string]interface{}
	for name, detail := range topics {
		topicList = append(topicList, map[string]interface{}{
			"name":              name,
			"partitions":        detail.NumPartitions,
			"replicationFactor": detail.ReplicationFactor,
		})
	}

	return map[string]interface{}{
		"topics": topicList,
	}, nil
}

// createTopic creates a new Kafka topic
func (p *KafkaNativePlugin) createTopic(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	brokers := p.getBrokers(config)
	topic, _ := config["topic"].(string)
	if topic == "" {
		return nil, fmt.Errorf("topic is required")
	}

	partitions := int32(1)
	if p, ok := config["partitions"].(float64); ok {
		partitions = int32(p)
	}

	replicationFactor := int16(1)
	if r, ok := config["replicationFactor"].(float64); ok {
		replicationFactor = int16(r)
	}

	cfg := p.getSaramaConfig(config)
	admin, err := sarama.NewClusterAdmin(brokers, cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create admin client: %w", err)
	}
	defer admin.Close()

	topicDetail := &sarama.TopicDetail{
		NumPartitions:     partitions,
		ReplicationFactor: replicationFactor,
	}

	err = admin.CreateTopic(topic, topicDetail, false)
	if err != nil {
		return nil, fmt.Errorf("failed to create topic: %w", err)
	}

	p.logger.Info("Created topic", zap.String("topic", topic))

	return map[string]interface{}{
		"topic":             topic,
		"created":           true,
		"partitions":        partitions,
		"replicationFactor": replicationFactor,
	}, nil
}

// deleteTopic deletes a Kafka topic
func (p *KafkaNativePlugin) deleteTopic(ctx context.Context, config map[string]interface{}) (map[string]interface{}, error) {
	brokers := p.getBrokers(config)
	topic, _ := config["topic"].(string)
	if topic == "" {
		return nil, fmt.Errorf("topic is required")
	}

	cfg := p.getSaramaConfig(config)
	admin, err := sarama.NewClusterAdmin(brokers, cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create admin client: %w", err)
	}
	defer admin.Close()

	err = admin.DeleteTopic(topic)
	if err != nil {
		return nil, fmt.Errorf("failed to delete topic: %w", err)
	}

	p.logger.Info("Deleted topic", zap.String("topic", topic))

	return map[string]interface{}{
		"deleted": []string{topic},
	}, nil
}
