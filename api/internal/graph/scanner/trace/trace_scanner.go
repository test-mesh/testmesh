package trace

import (
	"context"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/graph"
	"github.com/test-mesh/testmesh/internal/graph/scanner"
	"github.com/test-mesh/testmesh/internal/telemetry"
	"go.uber.org/zap"
)

var tableNameRe = regexp.MustCompile(`(?i)\b(?:FROM|INTO|UPDATE|JOIN)\s+` + "`?" + `([a-zA-Z_][a-zA-Z0-9_.]+)` + "`?")

// edgeAgg accumulates metrics for a deduplicated edge during span-to-graph mapping.
type edgeAgg struct {
	edge       graph.GraphEdge
	callCount  int
	totalMs    int64
	errorCount int
}

// TraceScanner implements scanner.Scanner to map OTLP spans to graph nodes and edges.
type TraceScanner struct {
	repo   *telemetry.TelemetryRepository
	logger *zap.Logger
}

// New creates a new TraceScanner.
func New(repo *telemetry.TelemetryRepository, logger *zap.Logger) *TraceScanner {
	return &TraceScanner{repo: repo, logger: logger}
}

// Capabilities implements scanner.Scanner.
func (s *TraceScanner) Capabilities() scanner.ScannerCapabilities {
	return scanner.ScannerCapabilities{
		Name:        "trace",
		Layer:       graph.SourceLayerRuntime,
		Description: "Maps OTLP spans to graph nodes and edges based on runtime telemetry",
	}
}

// Scan performs a full scan by querying all spans for the workspace.
func (s *TraceScanner) Scan(ctx context.Context, input scanner.ScanInput) (*scanner.ScannerOutput, error) {
	spans, err := s.repo.QuerySpans(ctx, telemetry.SpanFilter{
		WorkspaceID: input.WorkspaceID,
		Limit:       10000,
	})
	if err != nil {
		return nil, err
	}
	return s.mapSpansToGraph(input.WorkspaceID, spans), nil
}

// ScanDiff performs an incremental scan using only recent spans.
func (s *TraceScanner) ScanDiff(ctx context.Context, input scanner.DiffInput) (*scanner.ScannerOutput, error) {
	since := time.Now().Add(-5 * time.Minute)
	spans, err := s.repo.QuerySpans(ctx, telemetry.SpanFilter{
		WorkspaceID: input.WorkspaceID,
		Since:       &since,
		Limit:       10000,
	})
	if err != nil {
		return nil, err
	}
	return s.mapSpansToGraph(input.WorkspaceID, spans), nil
}

// ScanSpans maps a batch of spans directly (used by the processor pipeline).
func (s *TraceScanner) ScanSpans(workspaceID uuid.UUID, spans []telemetry.Span) *scanner.ScannerOutput {
	return s.mapSpansToGraph(workspaceID, spans)
}

func (s *TraceScanner) mapSpansToGraph(workspaceID uuid.UUID, spans []telemetry.Span) *scanner.ScannerOutput {
	output := &scanner.ScannerOutput{}

	// Build a map of spanID -> span for parent lookups
	spanMap := make(map[string]*telemetry.Span, len(spans))
	for i := range spans {
		spanMap[spans[i].SpanID] = &spans[i]
	}

	// Track nodes by key to dedup
	nodeMap := make(map[string]*graph.GraphNode)
	// Track edges by key to dedup and accumulate metrics
	edgeMap := make(map[string]*edgeAgg)

	now := time.Now().UTC()

	for i := range spans {
		span := &spans[i]

		// --- Node mapping ---
		// Service node
		serviceKey := "service:" + span.Service
		if _, ok := nodeMap[serviceKey]; !ok {
			nodeMap[serviceKey] = &graph.GraphNode{
				ID:          uuid.New(),
				WorkspaceID: workspaceID,
				Type:        graph.NodeTypeService,
				Name:        span.Service,
				Service:     span.Service,
				SourceLayer: graph.SourceLayerRuntime,
				Metadata: graph.JSONMap{
					"observed_request_count": 0,
					"observed_error_count":   0,
				},
				Confidence: 1.0,
			}
		}
		svcNode := nodeMap[serviceKey]
		incrMetadata(svcNode, "observed_request_count", 1)
		if span.StatusCode == "error" {
			incrMetadata(svcNode, "observed_error_count", 1)
		}

		// API endpoint node (from http.route or http.target)
		if httpRoute := getStringAttr(span.Attributes, "http.route"); httpRoute != "" {
			method := getStringAttr(span.Attributes, "http.method")
			endpointName := httpRoute
			if method != "" {
				endpointName = method + " " + httpRoute
			}
			epKey := "api_endpoint:" + span.Service + ":" + endpointName
			if _, ok := nodeMap[epKey]; !ok {
				nodeMap[epKey] = &graph.GraphNode{
					ID:          uuid.New(),
					WorkspaceID: workspaceID,
					Type:        graph.NodeTypeAPIEndpoint,
					Name:        endpointName,
					Service:     span.Service,
					SourceLayer: graph.SourceLayerRuntime,
					Metadata:    graph.JSONMap{},
					Confidence:  1.0,
				}
			}

			// Edge: service exposes endpoint
			if span.Kind == "server" {
				addEdge(edgeMap, workspaceID, svcNode.ID, nodeMap[epKey].ID,
					graph.EdgeTypeExposes, span.DurationMs, span.StatusCode == "error", now)
			}
		}

		// Database node (from db.system + db.name)
		if dbSystem := getStringAttr(span.Attributes, "db.system"); dbSystem != "" {
			dbName := getStringAttr(span.Attributes, "db.name")
			if dbName == "" {
				dbName = dbSystem
			}
			dbKey := "database:" + dbSystem + ":" + dbName
			if _, ok := nodeMap[dbKey]; !ok {
				nodeMap[dbKey] = &graph.GraphNode{
					ID:          uuid.New(),
					WorkspaceID: workspaceID,
					Type:        graph.NodeTypeDatabase,
					Name:        dbName,
					Service:     span.Service,
					SourceLayer: graph.SourceLayerRuntime,
					Metadata:    graph.JSONMap{"db.system": dbSystem},
					Confidence:  1.0,
				}
			}

			// Table node from SQL statement
			if stmt := getStringAttr(span.Attributes, "db.statement"); stmt != "" {
				tableName := extractTableName(stmt)
				if tableName != "" {
					tableKey := "table:" + dbName + ":" + tableName
					if _, ok := nodeMap[tableKey]; !ok {
						nodeMap[tableKey] = &graph.GraphNode{
							ID:          uuid.New(),
							WorkspaceID: workspaceID,
							Type:        graph.NodeTypeTable,
							Name:        tableName,
							Service:     span.Service,
							SourceLayer: graph.SourceLayerRuntime,
							Metadata:    graph.JSONMap{"database": dbName},
							Confidence:  0.8,
						}
					}
				}

				// Edge: service reads/writes database
				edgeType := classifyDBOperation(stmt)
				addEdge(edgeMap, workspaceID, svcNode.ID, nodeMap[dbKey].ID,
					edgeType, span.DurationMs, span.StatusCode == "error", now)
			}
		}

		// Messaging/Topic node (from messaging.system + messaging.destination.name)
		if msgSystem := getStringAttr(span.Attributes, "messaging.system"); msgSystem != "" {
			dest := getStringAttr(span.Attributes, "messaging.destination.name")
			if dest == "" {
				dest = getStringAttr(span.Attributes, "messaging.destination")
			}
			if dest != "" {
				topicKey := "topic:" + msgSystem + ":" + dest
				if _, ok := nodeMap[topicKey]; !ok {
					nodeMap[topicKey] = &graph.GraphNode{
						ID:          uuid.New(),
						WorkspaceID: workspaceID,
						Type:        graph.NodeTypeTopic,
						Name:        dest,
						SourceLayer: graph.SourceLayerRuntime,
						Metadata:    graph.JSONMap{"messaging.system": msgSystem},
						Confidence:  1.0,
					}
				}

				// Edge: publishes or consumes
				if span.Kind == "producer" {
					addEdge(edgeMap, workspaceID, svcNode.ID, nodeMap[topicKey].ID,
						graph.EdgeTypePublishes, span.DurationMs, span.StatusCode == "error", now)
				} else if span.Kind == "consumer" {
					addEdge(edgeMap, workspaceID, nodeMap[topicKey].ID, svcNode.ID,
						graph.EdgeTypeConsumes, span.DurationMs, span.StatusCode == "error", now)
				}
			}
		}

		// --- Cross-service edge mapping ---
		// If span has a parent in a different service, create a "calls" edge
		if span.ParentSpanID != "" {
			if parentSpan, ok := spanMap[span.ParentSpanID]; ok {
				if parentSpan.Service != span.Service {
					parentSvcKey := "service:" + parentSpan.Service
					if parentNode, ok := nodeMap[parentSvcKey]; ok {
						addEdge(edgeMap, workspaceID, parentNode.ID, svcNode.ID,
							graph.EdgeTypeCalls, span.DurationMs, span.StatusCode == "error", now)
					}
				}
			}
		}
	}

	// Collect nodes
	for _, n := range nodeMap {
		output.Nodes = append(output.Nodes, *n)
	}

	// Collect edges with accumulated metrics
	for _, ea := range edgeMap {
		avgMs := float64(0)
		if ea.callCount > 0 {
			avgMs = float64(ea.totalMs) / float64(ea.callCount)
		}
		ea.edge.Properties["call_count"] = ea.callCount
		ea.edge.Properties["avg_duration_ms"] = avgMs
		ea.edge.Properties["error_count"] = ea.errorCount
		output.Edges = append(output.Edges, ea.edge)
	}

	return output
}

func addEdge(edgeMap map[string]*edgeAgg, workspaceID uuid.UUID, fromID, toID uuid.UUID,
	edgeType graph.EdgeType, durationMs int64, isError bool, now time.Time) {

	key := fromID.String() + "→" + toID.String() + ":" + string(edgeType)
	if ea, ok := edgeMap[key]; ok {
		ea.callCount++
		ea.totalMs += durationMs
		if isError {
			ea.errorCount++
		}
		ea.edge.Properties["last_observed_at"] = now.Format(time.RFC3339)
	} else {
		errorCount := 0
		if isError {
			errorCount = 1
		}
		edgeMap[key] = &edgeAgg{
			edge: graph.GraphEdge{
				ID:          uuid.New(),
				WorkspaceID: workspaceID,
				Type:        edgeType,
				FromNodeID:  fromID,
				ToNodeID:    toID,
				SourceLayer: graph.SourceLayerRuntime,
				Properties: graph.JSONMap{
					"last_observed_at": now.Format(time.RFC3339),
				},
				Confidence: 1.0,
			},
			callCount:  1,
			totalMs:    durationMs,
			errorCount: errorCount,
		}
	}
}

func getStringAttr(attrs graph.JSONMap, key string) string {
	if v, ok := attrs[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func extractTableName(stmt string) string {
	matches := tableNameRe.FindStringSubmatch(stmt)
	if len(matches) > 1 {
		return matches[1]
	}
	return ""
}

func classifyDBOperation(stmt string) graph.EdgeType {
	upper := strings.ToUpper(strings.TrimSpace(stmt))
	if strings.HasPrefix(upper, "SELECT") {
		return graph.EdgeTypeReads
	}
	if strings.HasPrefix(upper, "INSERT") || strings.HasPrefix(upper, "UPDATE") || strings.HasPrefix(upper, "DELETE") {
		return graph.EdgeTypeWrites
	}
	return graph.EdgeTypeReads
}

func incrMetadata(node *graph.GraphNode, key string, delta int) {
	if node.Metadata == nil {
		node.Metadata = graph.JSONMap{}
	}
	current := 0
	if v, ok := node.Metadata[key]; ok {
		switch c := v.(type) {
		case int:
			current = c
		case float64:
			current = int(c)
		}
	}
	node.Metadata[key] = current + delta
}
