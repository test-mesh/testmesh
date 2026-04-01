package async

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/IBM/sarama"
)

// KafkaProducerConfig defines configuration for the Kafka producer action.
type KafkaProducerConfig struct {
	Brokers   []string    `yaml:"brokers" json:"brokers"`
	Topic     string      `yaml:"topic" json:"topic"`
	Key       string      `yaml:"key,omitempty" json:"key,omitempty"`
	Payload   interface{} `yaml:"payload" json:"payload"`
	Headers   map[string]string `yaml:"headers,omitempty" json:"headers,omitempty"`
	SASL        *SASLConfig `yaml:"sasl,omitempty" json:"sasl,omitempty"`
	TLS         *TLSConfig  `yaml:"tls,omitempty" json:"tls,omitempty"`
	Compression string      `yaml:"compression,omitempty" json:"compression,omitempty"` // none|gzip|snappy|lz4
}

// KafkaProducerResult holds the result of producing a message.
type KafkaProducerResult struct {
	Success   bool   `json:"success"`
	Topic     string `json:"topic"`
	Partition int32  `json:"partition"`
	Offset    int64  `json:"offset"`
	Key       string `json:"key"`
	Duration  int64  `json:"duration_ms"`
}

// KafkaProducer produces messages to Kafka.
type KafkaProducer struct {
	config *KafkaProducerConfig
}

// NewKafkaProducer creates a new Kafka producer.
func NewKafkaProducer(config *KafkaProducerConfig) *KafkaProducer {
	return &KafkaProducer{config: config}
}

// Produce sends a single message to the configured topic.
func (kp *KafkaProducer) Produce(_ context.Context) (*KafkaProducerResult, error) {
	start := time.Now()

	saramaConfig := sarama.NewConfig()
	saramaConfig.Producer.Return.Successes = true
	saramaConfig.Producer.Return.Errors = true
	saramaConfig.Producer.RequiredAcks = sarama.WaitForAll

	// Compression
	switch kp.config.Compression {
	case "gzip":
		saramaConfig.Producer.Compression = sarama.CompressionGZIP
	case "snappy":
		saramaConfig.Producer.Compression = sarama.CompressionSnappy
	case "lz4":
		saramaConfig.Producer.Compression = sarama.CompressionLZ4
	default:
		saramaConfig.Producer.Compression = sarama.CompressionNone
	}

	// SASL
	if kp.config.SASL != nil {
		saramaConfig.Net.SASL.Enable = true
		saramaConfig.Net.SASL.User = kp.config.SASL.Username
		saramaConfig.Net.SASL.Password = kp.config.SASL.Password
		switch kp.config.SASL.Mechanism {
		case "PLAIN":
			saramaConfig.Net.SASL.Mechanism = sarama.SASLTypePlaintext
		case "SCRAM-SHA-256":
			saramaConfig.Net.SASL.Mechanism = sarama.SASLTypeSCRAMSHA256
		case "SCRAM-SHA-512":
			saramaConfig.Net.SASL.Mechanism = sarama.SASLTypeSCRAMSHA512
		}
	}

	// TLS
	if kp.config.TLS != nil && kp.config.TLS.Enabled {
		tlsCfg := &tls.Config{
			InsecureSkipVerify: kp.config.TLS.InsecureSkipVerify,
		}
		if kp.config.TLS.CertFile != "" && kp.config.TLS.KeyFile != "" {
			cert, err := tls.LoadX509KeyPair(kp.config.TLS.CertFile, kp.config.TLS.KeyFile)
			if err != nil {
				return nil, fmt.Errorf("failed to load TLS cert/key: %w", err)
			}
			tlsCfg.Certificates = []tls.Certificate{cert}
		}
		if kp.config.TLS.CAFile != "" {
			caPEM, err := os.ReadFile(kp.config.TLS.CAFile)
			if err != nil {
				return nil, fmt.Errorf("failed to read CA file: %w", err)
			}
			pool := x509.NewCertPool()
			if !pool.AppendCertsFromPEM(caPEM) {
				return nil, fmt.Errorf("failed to parse CA certificate")
			}
			tlsCfg.RootCAs = pool
		}
		saramaConfig.Net.TLS.Enable = true
		saramaConfig.Net.TLS.Config = tlsCfg
	}

	producer, err := sarama.NewSyncProducer(kp.config.Brokers, saramaConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create producer: %w", err)
	}
	defer producer.Close()

	// Serialize payload to JSON if it's not already a string.
	var valueBytes []byte
	switch v := kp.config.Payload.(type) {
	case string:
		valueBytes = []byte(v)
	default:
		valueBytes, err = json.Marshal(v)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal payload: %w", err)
		}
	}

	msg := &sarama.ProducerMessage{
		Topic: kp.config.Topic,
		Value: sarama.ByteEncoder(valueBytes),
	}

	if kp.config.Key != "" {
		msg.Key = sarama.StringEncoder(kp.config.Key)
	}

	for k, v := range kp.config.Headers {
		msg.Headers = append(msg.Headers, sarama.RecordHeader{
			Key:   []byte(k),
			Value: []byte(v),
		})
	}

	partition, offset, err := producer.SendMessage(msg)
	if err != nil {
		return nil, fmt.Errorf("failed to send message: %w", err)
	}

	return &KafkaProducerResult{
		Success:   true,
		Topic:     kp.config.Topic,
		Partition: partition,
		Offset:    offset,
		Key:       kp.config.Key,
		Duration:  time.Since(start).Milliseconds(),
	}, nil
}
