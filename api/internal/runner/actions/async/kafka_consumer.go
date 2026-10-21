package async

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/IBM/sarama"
	"github.com/tidwall/gjson"
)

// Start positions for group-less consumption.
const (
	StartFromTimestamp = "timestamp" // first message at or after Since
	StartFromEarliest  = "earliest"  // beginning of the topic
	StartFromLatest    = "latest"    // only messages produced after the consumer starts
)

// ClockSkewAllowance is subtracted from Since so that events stamped by a
// producer whose clock runs slightly behind the test runner are not missed.
const ClockSkewAllowance = 2 * time.Second

// maxUnmatchedSamples is how many non-matching messages are kept for diagnostics.
const maxUnmatchedSamples = 3

// KafkaConsumerConfig defines configuration for Kafka consumer action
type KafkaConsumerConfig struct {
	Brokers []string `yaml:"brokers" json:"brokers"`
	Topic   string   `yaml:"topic" json:"topic"`
	// GroupID switches to consumer-group mode (committed offsets, rebalancing).
	// When empty, partitions are read directly starting at StartFrom.
	GroupID         string         `yaml:"group_id" json:"group_id"`
	Timeout         string         `yaml:"timeout" json:"timeout"`
	Count           int            `yaml:"count" json:"count"`
	Filter          *MessageFilter `yaml:"filter,omitempty" json:"filter,omitempty"`
	FromBeginning   bool           `yaml:"from_beginning" json:"from_beginning"`
	AutoOffsetReset string         `yaml:"auto_offset_reset" json:"auto_offset_reset"` // "earliest" | "latest"
	StartFrom       string         `yaml:"-" json:"-"`
	Since           time.Time      `yaml:"-" json:"-"`
	SASL            *SASLConfig    `yaml:"sasl,omitempty" json:"sasl,omitempty"`
	TLS             *TLSConfig     `yaml:"tls,omitempty" json:"tls,omitempty"`
}

// MessageFilter defines filtering criteria for messages
type MessageFilter struct {
	Key        string            `yaml:"key,omitempty" json:"key,omitempty"`
	KeyPattern string            `yaml:"key_pattern,omitempty" json:"key_pattern,omitempty"`
	Headers    map[string]string `yaml:"headers,omitempty" json:"headers,omitempty"`
	JSONPath   string            `yaml:"json_path,omitempty" json:"json_path,omitempty"`
	JSONValue  interface{}       `yaml:"json_value,omitempty" json:"json_value,omitempty"`
	// Match maps JSON paths in the message value (e.g. "order_id",
	// "items.0.sku") to the values they must equal.
	Match map[string]interface{} `yaml:"match,omitempty" json:"match,omitempty"`
}

// IsEmpty reports whether the filter has no criteria.
func (f *MessageFilter) IsEmpty() bool {
	return f == nil || (f.Key == "" && f.KeyPattern == "" && len(f.Headers) == 0 && f.JSONPath == "" && len(f.Match) == 0)
}

// Describe renders the filter criteria for error messages.
func (f *MessageFilter) Describe() string {
	if f.IsEmpty() {
		return "any message"
	}
	var parts []string
	if f.Key != "" {
		parts = append(parts, fmt.Sprintf("key=%q", f.Key))
	}
	if f.KeyPattern != "" {
		parts = append(parts, fmt.Sprintf("key~%q", f.KeyPattern))
	}
	for k, v := range f.Headers {
		parts = append(parts, fmt.Sprintf("header %s=%q", k, v))
	}
	if f.JSONPath != "" {
		parts = append(parts, fmt.Sprintf("%s=%v", f.JSONPath, f.JSONValue))
	}
	for k, v := range f.Match {
		parts = append(parts, fmt.Sprintf("%s=%v", k, v))
	}
	sort.Strings(parts)
	return strings.Join(parts, ", ")
}

// Matches reports whether the message satisfies every criterion.
func (f *MessageFilter) Matches(msg KafkaMessage) bool {
	if f == nil {
		return true
	}

	if f.Key != "" && msg.Key != f.Key {
		return false
	}

	if f.KeyPattern != "" {
		matched, _ := regexp.MatchString(f.KeyPattern, msg.Key)
		if !matched {
			return false
		}
	}

	for key, value := range f.Headers {
		if msg.Headers[key] != value {
			return false
		}
	}

	if f.JSONPath != "" && !jsonFieldEquals(msg.Value, f.JSONPath, f.JSONValue) {
		return false
	}

	for path, expected := range f.Match {
		if !jsonFieldEquals(msg.Value, path, expected) {
			return false
		}
	}

	return true
}

// jsonFieldEquals compares the value at path in a JSON document with expected.
// Values are compared by their string form so "42" (from a template) matches 42.
func jsonFieldEquals(document, path string, expected interface{}) bool {
	path = strings.TrimPrefix(strings.TrimPrefix(path, "$"), ".")
	if path == "" || !gjson.Valid(document) {
		return false
	}
	actual := gjson.Get(document, path)
	if !actual.Exists() {
		return expected == nil
	}
	if expected == nil {
		return actual.Type == gjson.Null
	}
	return actual.String() == fmt.Sprint(expected)
}

// SASLConfig defines SASL authentication
type SASLConfig struct {
	Mechanism string `yaml:"mechanism" json:"mechanism"`
	Username  string `yaml:"username" json:"username"`
	Password  string `yaml:"password" json:"password"`
}

// TLSConfig defines TLS configuration
type TLSConfig struct {
	Enabled            bool   `yaml:"enabled" json:"enabled"`
	InsecureSkipVerify bool   `yaml:"insecure_skip_verify" json:"insecure_skip_verify"`
	CertFile           string `yaml:"cert_file,omitempty" json:"cert_file,omitempty"`
	KeyFile            string `yaml:"key_file,omitempty" json:"key_file,omitempty"`
	CAFile             string `yaml:"ca_file,omitempty" json:"ca_file,omitempty"`
}

// KafkaMessage represents a consumed message
type KafkaMessage struct {
	Topic     string            `json:"topic"`
	Partition int32             `json:"partition"`
	Offset    int64             `json:"offset"`
	Key       string            `json:"key"`
	Value     string            `json:"value"`
	Headers   map[string]string `json:"headers"`
	Timestamp time.Time         `json:"timestamp"`
	JSON      interface{}       `json:"json,omitempty"`
}

// KafkaConsumerResult holds the result of consuming
type KafkaConsumerResult struct {
	Success  bool           `json:"success"`
	Messages []KafkaMessage `json:"messages"`
	Count    int            `json:"count"`
	Duration int64          `json:"duration_ms"`
	Error    string         `json:"error,omitempty"`
	// Scanned counts every message read from the topic, matching or not.
	Scanned int `json:"scanned"`
	// Unmatched holds the most recent messages that were read but rejected
	// by the filter, to explain why a wait timed out.
	Unmatched []KafkaMessage `json:"unmatched,omitempty"`
	// TimedOut is true when the timeout expired before Count messages matched.
	TimedOut bool `json:"timed_out"`
}

// KafkaConsumer handles consuming messages from Kafka
type KafkaConsumer struct {
	config *KafkaConsumerConfig
}

// NewKafkaConsumer creates a new Kafka consumer
func NewKafkaConsumer(config *KafkaConsumerConfig) *KafkaConsumer {
	return &KafkaConsumer{config: config}
}

// Consume consumes messages from Kafka
func (kc *KafkaConsumer) Consume(ctx context.Context) (*KafkaConsumerResult, error) {
	start := time.Now()
	result := &KafkaConsumerResult{
		Messages: make([]KafkaMessage, 0),
	}

	// Parse timeout
	timeout := 30 * time.Second
	if kc.config.Timeout != "" {
		if parsed, err := time.ParseDuration(kc.config.Timeout); err == nil {
			timeout = parsed
		}
	}

	// Create context with timeout
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	saramaConfig, err := kc.saramaConfig()
	if err != nil {
		result.Error = err.Error()
		return result, err
	}

	col := newCollector(kc.config.Filter, kc.config.Count)

	if kc.config.GroupID != "" {
		err = kc.consumeGroup(ctx, saramaConfig, col)
	} else {
		err = kc.consumeDirect(ctx, saramaConfig, col)
	}
	if err != nil {
		result.Error = err.Error()
		return result, err
	}

	col.fill(result)
	result.Duration = time.Since(start).Milliseconds()
	result.Success = true

	return result, nil
}

// saramaConfig builds the client configuration including SASL and TLS.
func (kc *KafkaConsumer) saramaConfig() (*sarama.Config, error) {
	saramaConfig := sarama.NewConfig()
	saramaConfig.Consumer.Return.Errors = true
	saramaConfig.Consumer.Offsets.Initial = sarama.OffsetNewest
	if kc.config.FromBeginning || kc.config.AutoOffsetReset == "earliest" {
		saramaConfig.Consumer.Offsets.Initial = sarama.OffsetOldest
	}

	// Configure SASL if provided
	if kc.config.SASL != nil {
		saramaConfig.Net.SASL.Enable = true
		saramaConfig.Net.SASL.User = kc.config.SASL.Username
		saramaConfig.Net.SASL.Password = kc.config.SASL.Password
		switch kc.config.SASL.Mechanism {
		case "PLAIN":
			saramaConfig.Net.SASL.Mechanism = sarama.SASLTypePlaintext
		case "SCRAM-SHA-256":
			saramaConfig.Net.SASL.Mechanism = sarama.SASLTypeSCRAMSHA256
			saramaConfig.Net.SASL.SCRAMClientGeneratorFunc = func() sarama.SCRAMClient {
				return &XDGSCRAMClient{HashGeneratorFcn: SHA256}
			}
		case "SCRAM-SHA-512":
			saramaConfig.Net.SASL.Mechanism = sarama.SASLTypeSCRAMSHA512
			saramaConfig.Net.SASL.SCRAMClientGeneratorFunc = func() sarama.SCRAMClient {
				return &XDGSCRAMClient{HashGeneratorFcn: SHA512}
			}
		}
	}

	// Configure TLS if provided
	if kc.config.TLS != nil && kc.config.TLS.Enabled {
		tlsCfg := &tls.Config{
			InsecureSkipVerify: kc.config.TLS.InsecureSkipVerify,
		}
		if kc.config.TLS.CertFile != "" && kc.config.TLS.KeyFile != "" {
			cert, err := tls.LoadX509KeyPair(kc.config.TLS.CertFile, kc.config.TLS.KeyFile)
			if err != nil {
				return nil, fmt.Errorf("failed to load TLS cert/key: %w", err)
			}
			tlsCfg.Certificates = []tls.Certificate{cert}
		}
		if kc.config.TLS.CAFile != "" {
			caPEM, err := os.ReadFile(kc.config.TLS.CAFile)
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

	return saramaConfig, nil
}

// consumeGroup reads through a consumer group, honouring committed offsets.
func (kc *KafkaConsumer) consumeGroup(ctx context.Context, saramaConfig *sarama.Config, col *collector) error {
	group, err := sarama.NewConsumerGroup(kc.config.Brokers, kc.config.GroupID, saramaConfig)
	if err != nil {
		return fmt.Errorf("failed to create consumer group: %w", err)
	}
	defer group.Close()

	handler := &consumerHandler{col: col}

	go func() {
		for {
			if err := group.Consume(ctx, []string{kc.config.Topic}, handler); err != nil {
				return
			}
			if ctx.Err() != nil {
				return
			}
		}
	}()

	select {
	case <-col.done:
	case <-ctx.Done():
	}
	return nil
}

// consumeDirect reads every partition of the topic without a consumer group,
// starting at the configured position. There is no rebalance delay and no
// committed state, so repeated test runs never interfere with each other.
func (kc *KafkaConsumer) consumeDirect(ctx context.Context, saramaConfig *sarama.Config, col *collector) error {
	client, err := sarama.NewClient(kc.config.Brokers, saramaConfig)
	if err != nil {
		return fmt.Errorf("failed to connect to Kafka brokers %v: %w", kc.config.Brokers, err)
	}
	defer client.Close()

	partitions, err := waitForPartitions(ctx, client, kc.config.Topic)
	if err != nil {
		if ctx.Err() != nil {
			// The topic never appeared — report it as a timeout with nothing read.
			return nil
		}
		return err
	}

	consumer, err := sarama.NewConsumerFromClient(client)
	if err != nil {
		return fmt.Errorf("failed to create consumer: %w", err)
	}
	defer consumer.Close()

	var wg sync.WaitGroup
	for _, partition := range partitions {
		offset, err := kc.startOffset(client, partition)
		if err != nil {
			return fmt.Errorf("failed to resolve start offset for %s/%d: %w", kc.config.Topic, partition, err)
		}
		pc, err := consumer.ConsumePartition(kc.config.Topic, partition, offset)
		if err != nil {
			return fmt.Errorf("failed to consume %s/%d: %w", kc.config.Topic, partition, err)
		}
		defer pc.AsyncClose()

		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case msg, ok := <-pc.Messages():
					if !ok {
						return
					}
					col.offer(convertMessage(msg))
				case <-col.done:
					return
				case <-ctx.Done():
					return
				}
			}
		}()
	}

	select {
	case <-col.done:
	case <-ctx.Done():
	}
	wg.Wait()
	return nil
}

// startOffset resolves where to begin reading a partition.
func (kc *KafkaConsumer) startOffset(client sarama.Client, partition int32) (int64, error) {
	switch kc.config.StartFrom {
	case StartFromEarliest:
		return sarama.OffsetOldest, nil
	case StartFromTimestamp:
		since := kc.config.Since.Add(-ClockSkewAllowance).UnixMilli()
		offset, err := client.GetOffset(kc.config.Topic, partition, since)
		if err != nil {
			return 0, err
		}
		if offset >= 0 {
			return offset, nil
		}
		// No message at or after the timestamp yet: start at the next offset to
		// be written. Resolving it explicitly (instead of OffsetNewest) closes the
		// gap between this lookup and the partition consumer starting.
		return client.GetOffset(kc.config.Topic, partition, sarama.OffsetNewest)
	default:
		return client.GetOffset(kc.config.Topic, partition, sarama.OffsetNewest)
	}
}

// waitForPartitions returns the topic's partitions, waiting for topics that
// are auto-created by the first produce.
func waitForPartitions(ctx context.Context, client sarama.Client, topic string) ([]int32, error) {
	for {
		partitions, err := client.Partitions(topic)
		if err == nil && len(partitions) > 0 {
			return partitions, nil
		}
		if err != nil && !errors.Is(err, sarama.ErrUnknownTopicOrPartition) {
			return nil, fmt.Errorf("failed to list partitions for topic %q: %w", topic, err)
		}
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("topic %q does not exist: %w", topic, ctx.Err())
		case <-time.After(250 * time.Millisecond):
		}
		_ = client.RefreshMetadata(topic)
	}
}

func convertMessage(msg *sarama.ConsumerMessage) KafkaMessage {
	kafkaMsg := KafkaMessage{
		Topic:     msg.Topic,
		Partition: msg.Partition,
		Offset:    msg.Offset,
		Key:       string(msg.Key),
		Value:     string(msg.Value),
		Headers:   make(map[string]string),
		Timestamp: msg.Timestamp,
	}

	for _, header := range msg.Headers {
		kafkaMsg.Headers[string(header.Key)] = string(header.Value)
	}

	var jsonValue interface{}
	if json.Unmarshal(msg.Value, &jsonValue) == nil {
		kafkaMsg.JSON = jsonValue
	}

	return kafkaMsg
}

// collector gathers matching messages from concurrent partition readers.
type collector struct {
	filter   *MessageFilter
	maxCount int

	mu        sync.Mutex
	messages  []KafkaMessage
	scanned   int
	unmatched []KafkaMessage

	done     chan struct{}
	doneOnce sync.Once
}

func newCollector(filter *MessageFilter, maxCount int) *collector {
	return &collector{
		filter:   filter,
		maxCount: maxCount,
		messages: make([]KafkaMessage, 0),
		done:     make(chan struct{}),
	}
}

// offer records a message and reports whether enough messages have matched.
func (c *collector) offer(msg KafkaMessage) bool {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.maxCount > 0 && len(c.messages) >= c.maxCount {
		return true
	}

	c.scanned++
	if !c.filter.Matches(msg) {
		c.unmatched = append(c.unmatched, msg)
		if len(c.unmatched) > maxUnmatchedSamples {
			c.unmatched = c.unmatched[1:]
		}
		return false
	}

	c.messages = append(c.messages, msg)
	if c.maxCount > 0 && len(c.messages) >= c.maxCount {
		c.doneOnce.Do(func() { close(c.done) })
		return true
	}
	return false
}

func (c *collector) fill(result *KafkaConsumerResult) {
	c.mu.Lock()
	defer c.mu.Unlock()

	sort.SliceStable(c.messages, func(i, j int) bool {
		return c.messages[i].Timestamp.Before(c.messages[j].Timestamp)
	})
	result.Messages = c.messages
	result.Count = len(c.messages)
	result.Scanned = c.scanned
	result.Unmatched = c.unmatched
	result.TimedOut = c.maxCount > 0 && len(c.messages) < c.maxCount
}

type consumerHandler struct {
	col *collector
}

func (h *consumerHandler) Setup(_ sarama.ConsumerGroupSession) error   { return nil }
func (h *consumerHandler) Cleanup(_ sarama.ConsumerGroupSession) error { return nil }

func (h *consumerHandler) ConsumeClaim(session sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	for msg := range claim.Messages() {
		done := h.col.offer(convertMessage(msg))
		session.MarkMessage(msg, "")
		if done {
			return nil
		}
	}
	return nil
}
