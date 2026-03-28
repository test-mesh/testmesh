package cloud

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/graph"
	"go.uber.org/zap"
)

// RuntimeScanner processes execution results into graph nodes and edges (Layer 5).
// Unlike static scanners, this captures what actually happens at runtime —
// real HTTP calls, database queries, Kafka messages, latencies, and error rates.
type RuntimeScanner struct {
	engine graph.Engine
	logger *zap.Logger
}

// NewRuntimeScanner creates a runtime scanner.
func NewRuntimeScanner(engine graph.Engine, logger *zap.Logger) *RuntimeScanner {
	return &RuntimeScanner{
		engine: engine,
		logger: logger,
	}
}

// ExecutionEvent represents a single action captured during flow execution.
type ExecutionEvent struct {
	FlowID      uuid.UUID      `json:"flow_id"`
	StepID      string         `json:"step_id"`
	Action      string         `json:"action"`       // http_request, database_query, kafka_producer, etc.
	WorkspaceID uuid.UUID      `json:"workspace_id"`
	Timestamp   time.Time      `json:"timestamp"`
	DurationMs  int64          `json:"duration_ms"`
	Success     bool           `json:"success"`
	Details     map[string]any `json:"details"` // action-specific details
}

// ProcessExecution ingests execution events and updates the runtime layer of the graph.
func (s *RuntimeScanner) ProcessExecution(ctx context.Context, events []ExecutionEvent) error {
	if len(events) == 0 {
		return nil
	}

	workspaceID := events[0].WorkspaceID

	for _, event := range events {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		switch event.Action {
		case "http_request":
			s.processHTTPEvent(ctx, workspaceID, event)
		case "database_query":
			s.processDatabaseEvent(ctx, workspaceID, event)
		case "kafka_producer":
			s.processKafkaProducerEvent(ctx, workspaceID, event)
		case "kafka_consumer":
			s.processKafkaConsumerEvent(ctx, workspaceID, event)
		case "grpc":
			s.processGRPCEvent(ctx, workspaceID, event)
		case "redis.get", "redis.set", "redis.del":
			s.processRedisEvent(ctx, workspaceID, event)
		case "websocket":
			s.processWebSocketEvent(ctx, workspaceID, event)
		}
	}

	return nil
}

func (s *RuntimeScanner) processHTTPEvent(ctx context.Context, workspaceID uuid.UUID, event ExecutionEvent) {
	url, _ := event.Details["url"].(string)
	method, _ := event.Details["method"].(string)
	statusCode, _ := event.Details["status_code"].(float64)

	if url == "" {
		return
	}

	// Create or update the endpoint node with runtime data
	endpointName := fmt.Sprintf("%s %s", strings.ToUpper(method), extractPath(url))
	node := &graph.GraphNode{
		ID:          uuid.New(),
		WorkspaceID: workspaceID,
		Type:        graph.NodeTypeAPIEndpoint,
		Name:        endpointName,
		SourceLayer: graph.SourceLayerRuntime,
		Metadata: graph.JSONMap{
			"source":           "runtime",
			"url":              url,
			"method":           method,
			"last_status_code": int(statusCode),
			"last_duration_ms": event.DurationMs,
			"last_success":     event.Success,
			"last_seen":        event.Timestamp.Format(time.RFC3339),
		},
		Confidence: 0.95,
		Version:    1,
	}

	if err := s.engine.UpsertNode(ctx, node); err != nil {
		s.logger.Warn("Failed to upsert runtime HTTP node", zap.Error(err))
	}
}

func (s *RuntimeScanner) processDatabaseEvent(ctx context.Context, workspaceID uuid.UUID, event ExecutionEvent) {
	query, _ := event.Details["query"].(string)
	connection, _ := event.Details["connection"].(string)

	if query == "" {
		return
	}

	// Extract table names from the query
	tables := extractTablesFromQuery(query)
	for _, table := range tables {
		node := &graph.GraphNode{
			ID:          uuid.New(),
			WorkspaceID: workspaceID,
			Type:        graph.NodeTypeTable,
			Name:        table,
			SourceLayer: graph.SourceLayerRuntime,
			Metadata: graph.JSONMap{
				"source":           "runtime",
				"connection":       connection,
				"last_duration_ms": event.DurationMs,
				"last_success":     event.Success,
				"last_seen":        event.Timestamp.Format(time.RFC3339),
			},
			Confidence: 0.95,
			Version:    1,
		}
		if err := s.engine.UpsertNode(ctx, node); err != nil {
			s.logger.Warn("Failed to upsert runtime table node", zap.Error(err))
		}
	}
}

func (s *RuntimeScanner) processKafkaProducerEvent(ctx context.Context, workspaceID uuid.UUID, event ExecutionEvent) {
	topic, _ := event.Details["topic"].(string)
	if topic == "" {
		return
	}

	node := &graph.GraphNode{
		ID:          uuid.New(),
		WorkspaceID: workspaceID,
		Type:        graph.NodeTypeTopic,
		Name:        topic,
		SourceLayer: graph.SourceLayerRuntime,
		Metadata: graph.JSONMap{
			"source":       "runtime",
			"role":         "producer",
			"last_success": event.Success,
			"last_seen":    event.Timestamp.Format(time.RFC3339),
		},
		Confidence: 0.95,
		Version:    1,
	}
	if err := s.engine.UpsertNode(ctx, node); err != nil {
		s.logger.Warn("Failed to upsert runtime topic node", zap.Error(err))
	}
}

func (s *RuntimeScanner) processKafkaConsumerEvent(ctx context.Context, workspaceID uuid.UUID, event ExecutionEvent) {
	topic, _ := event.Details["topic"].(string)
	if topic == "" {
		return
	}

	node := &graph.GraphNode{
		ID:          uuid.New(),
		WorkspaceID: workspaceID,
		Type:        graph.NodeTypeTopic,
		Name:        topic,
		SourceLayer: graph.SourceLayerRuntime,
		Metadata: graph.JSONMap{
			"source":       "runtime",
			"role":         "consumer",
			"last_success": event.Success,
			"last_seen":    event.Timestamp.Format(time.RFC3339),
		},
		Confidence: 0.95,
		Version:    1,
	}
	if err := s.engine.UpsertNode(ctx, node); err != nil {
		s.logger.Warn("Failed to upsert runtime topic node", zap.Error(err))
	}
}

func (s *RuntimeScanner) processGRPCEvent(ctx context.Context, workspaceID uuid.UUID, event ExecutionEvent) {
	method, _ := event.Details["method"].(string)
	host, _ := event.Details["host"].(string)

	if method == "" {
		return
	}

	node := &graph.GraphNode{
		ID:          uuid.New(),
		WorkspaceID: workspaceID,
		Type:        graph.NodeTypeGRPCMethod,
		Name:        method,
		SourceLayer: graph.SourceLayerRuntime,
		Metadata: graph.JSONMap{
			"source":           "runtime",
			"host":             host,
			"last_duration_ms": event.DurationMs,
			"last_success":     event.Success,
			"last_seen":        event.Timestamp.Format(time.RFC3339),
		},
		Confidence: 0.95,
		Version:    1,
	}
	if err := s.engine.UpsertNode(ctx, node); err != nil {
		s.logger.Warn("Failed to upsert runtime gRPC node", zap.Error(err))
	}
}

func (s *RuntimeScanner) processRedisEvent(ctx context.Context, workspaceID uuid.UUID, event ExecutionEvent) {
	key, _ := event.Details["key"].(string)
	if key == "" {
		return
	}

	node := &graph.GraphNode{
		ID:          uuid.New(),
		WorkspaceID: workspaceID,
		Type:        graph.NodeTypeRedisKeyPattern,
		Name:        key,
		SourceLayer: graph.SourceLayerRuntime,
		Metadata: graph.JSONMap{
			"source":       "runtime",
			"last_success": event.Success,
			"last_seen":    event.Timestamp.Format(time.RFC3339),
		},
		Confidence: 0.95,
		Version:    1,
	}
	if err := s.engine.UpsertNode(ctx, node); err != nil {
		s.logger.Warn("Failed to upsert runtime redis node", zap.Error(err))
	}
}

func (s *RuntimeScanner) processWebSocketEvent(ctx context.Context, workspaceID uuid.UUID, event ExecutionEvent) {
	url, _ := event.Details["url"].(string)
	if url == "" {
		return
	}

	node := &graph.GraphNode{
		ID:          uuid.New(),
		WorkspaceID: workspaceID,
		Type:        graph.NodeTypeWebSocket,
		Name:        url,
		SourceLayer: graph.SourceLayerRuntime,
		Metadata: graph.JSONMap{
			"source":       "runtime",
			"last_success": event.Success,
			"last_seen":    event.Timestamp.Format(time.RFC3339),
		},
		Confidence: 0.9,
		Version:    1,
	}
	if err := s.engine.UpsertNode(ctx, node); err != nil {
		s.logger.Warn("Failed to upsert runtime websocket node", zap.Error(err))
	}
}

// extractPath returns the path component from a URL.
func extractPath(url string) string {
	// Remove scheme
	if idx := strings.Index(url, "://"); idx >= 0 {
		url = url[idx+3:]
	}
	// Remove host
	if idx := strings.Index(url, "/"); idx >= 0 {
		return url[idx:]
	}
	return "/"
}

// extractTablesFromQuery extracts table names from SQL queries.
func extractTablesFromQuery(query string) []string {
	query = strings.ToUpper(query)
	var tables []string
	keywords := []string{"FROM ", "INTO ", "UPDATE ", "JOIN ", "TABLE "}

	for _, kw := range keywords {
		idx := 0
		for {
			pos := strings.Index(query[idx:], kw)
			if pos < 0 {
				break
			}
			pos += idx + len(kw)
			// Extract the next word as table name
			end := pos
			for end < len(query) && query[end] != ' ' && query[end] != '(' && query[end] != ';' && query[end] != '\n' {
				end++
			}
			table := strings.TrimSpace(query[pos:end])
			table = strings.ToLower(table)
			if table != "" && !strings.HasPrefix(table, "(") && !strings.HasPrefix(table, "--") {
				tables = append(tables, table)
			}
			idx = end
		}
	}

	return tables
}
