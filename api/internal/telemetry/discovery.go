package telemetry

import (
	"context"
	"crypto/sha256"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/graph"
	"go.uber.org/zap"
	"gopkg.in/yaml.v3"
)

// FlowDiscovery discovers recurring flow patterns from completed traces.
type FlowDiscovery struct {
	repo   *TelemetryRepository
	logger *zap.Logger
}

// NewFlowDiscovery creates a new FlowDiscovery.
func NewFlowDiscovery(repo *TelemetryRepository, logger *zap.Logger) *FlowDiscovery {
	return &FlowDiscovery{repo: repo, logger: logger}
}

// ProcessCompletedTrace analyzes a completed trace and discovers/updates flow patterns.
func (d *FlowDiscovery) ProcessCompletedTrace(ctx context.Context, workspaceID uuid.UUID, traceID string) error {
	spans, err := d.repo.GetSpansByTraceID(ctx, workspaceID, traceID)
	if err != nil {
		return fmt.Errorf("failed to get spans: %w", err)
	}
	if len(spans) == 0 {
		return nil
	}

	// Build span tree
	tree := buildSpanTree(spans)
	if tree == nil {
		return nil
	}

	// Walk graph path
	path := walkGraphPath(tree)
	if len(path) == 0 {
		return nil
	}

	// Compute fingerprint
	fingerprint := computeFingerprint(path)

	// Compute trace stats
	var totalDuration int64
	var errorCount int
	for _, s := range spans {
		totalDuration += s.DurationMs
		if s.StatusCode == "error" {
			errorCount++
		}
	}

	// Check if flow already exists
	existing, err := d.repo.GetFlowByFingerprint(ctx, workspaceID, fingerprint)
	if err != nil {
		return fmt.Errorf("failed to check existing flow: %w", err)
	}

	now := time.Now().UTC()
	rootSpan := spans[0]

	if existing != nil {
		// Update existing flow
		existing.OccurrenceCount++
		existing.LastSeenAt = now
		existing.SampleTraceID = traceID

		// Incremental average duration
		n := float64(existing.OccurrenceCount)
		existing.AvgDurationMs = existing.AvgDurationMs + (float64(rootSpan.DurationMs)-existing.AvgDurationMs)/n

		// Incremental error rate
		errorRateThis := float64(errorCount) / float64(len(spans))
		existing.ErrorRate = existing.ErrorRate + (errorRateThis-existing.ErrorRate)/n

		// Drift detection: compare current path to stored path
		currentPathStr := pathToString(path)
		storedPathStr := storedPathToString(existing.GraphPath)
		if currentPathStr != storedPathStr {
			existing.Drifted = true
			existing.DriftDetails = graph.JSONMap{
				"previous_path": storedPathStr,
				"current_path":  currentPathStr,
				"detected_at":   now.Format(time.RFC3339),
			}
		}

		// Recompute risk score
		existing.RiskScore = computeRiskScore(existing)
		existing.UpdatedAt = now

		return d.repo.UpsertDiscoveredFlow(ctx, existing)
	}

	// Create new flow
	pathJSON := make(graph.JSONArray, len(path))
	for i, p := range path {
		pathJSON[i] = map[string]any{
			"type":       p.Type,
			"identifier": p.Identifier,
			"service":    p.Service,
		}
	}

	flow := &DiscoveredFlow{
		WorkspaceID:     workspaceID,
		Fingerprint:     fingerprint,
		Name:            generateFlowName(rootSpan.Service, rootSpan.Operation),
		EntryService:    rootSpan.Service,
		EntryOperation:  rootSpan.Operation,
		GraphPath:       pathJSON,
		OccurrenceCount: 1,
		LastSeenAt:      now,
		AvgDurationMs:   float64(rootSpan.DurationMs),
		ErrorRate:       float64(errorCount) / float64(len(spans)),
		SampleTraceID:   traceID,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	flow.RiskScore = computeRiskScore(flow)

	return d.repo.UpsertDiscoveredFlow(ctx, flow)
}

// ComputeRiskScore computes a risk score: 0.3*frequency + 0.5*error_rate + 0.2*latency_cv
func computeRiskScore(flow *DiscoveredFlow) float64 {
	// Normalize frequency (more occurrences = more important)
	freqScore := math.Min(float64(flow.OccurrenceCount)/100.0, 1.0)
	// Error rate is already 0-1
	errorScore := flow.ErrorRate
	// Latency coefficient of variation (use a simple heuristic: high avg = high risk)
	latencyScore := math.Min(flow.AvgDurationMs/10000.0, 1.0)

	return 0.3*freqScore + 0.5*errorScore + 0.2*latencyScore
}

// ExportFlowYAML generates a YAML flow definition from a discovered flow.
func (d *FlowDiscovery) ExportFlowYAML(ctx context.Context, workspaceID uuid.UUID, flowID uuid.UUID) (string, error) {
	flow, err := d.repo.GetFlowByID(ctx, workspaceID, flowID)
	if err != nil {
		return "", fmt.Errorf("failed to get flow: %w", err)
	}
	if flow == nil {
		return "", fmt.Errorf("flow not found")
	}

	// Build YAML structure from graph path
	type stepConfig struct {
		ID     string                 `yaml:"id"`
		Name   string                 `yaml:"name"`
		Action string                 `yaml:"action"`
		Config map[string]interface{} `yaml:"config"`
	}

	type flowDef struct {
		Name        string       `yaml:"name"`
		Description string       `yaml:"description"`
		Steps       []stepConfig `yaml:"steps"`
	}

	type yamlRoot struct {
		Flow flowDef `yaml:"flow"`
	}

	steps := make([]stepConfig, 0)
	for i, pathItem := range flow.GraphPath {
		node, ok := pathItem.(map[string]any)
		if !ok {
			continue
		}
		nodeType, _ := node["type"].(string)
		identifier, _ := node["identifier"].(string)
		service, _ := node["service"].(string)

		step := stepConfig{
			ID:     fmt.Sprintf("step_%d", i+1),
			Name:   fmt.Sprintf("Call %s", identifier),
			Config: map[string]interface{}{},
		}

		switch nodeType {
		case "api_endpoint":
			step.Action = "http_request"
			parts := strings.SplitN(identifier, " ", 2)
			if len(parts) == 2 {
				step.Config["method"] = parts[0]
				step.Config["url"] = fmt.Sprintf("{{base_url}}%s", parts[1])
			} else {
				step.Config["method"] = "GET"
				step.Config["url"] = fmt.Sprintf("{{base_url}}%s", identifier)
			}
		case "topic":
			step.Action = "kafka_producer"
			step.Config["topic"] = identifier
			step.Config["brokers"] = "{{kafka_brokers}}"
			step.Config["payload"] = map[string]interface{}{}
		case "database":
			step.Action = "database_query"
			step.Config["connection_string"] = "{{db_connection}}"
			step.Config["query"] = fmt.Sprintf("SELECT 1 -- %s", identifier)
		case "service":
			step.Action = "http_request"
			step.Config["method"] = "GET"
			step.Config["url"] = fmt.Sprintf("{{%s_url}}/health", service)
			step.Name = fmt.Sprintf("Check %s health", service)
		default:
			continue
		}

		steps = append(steps, step)
	}

	root := yamlRoot{
		Flow: flowDef{
			Name:        flow.Name,
			Description: fmt.Sprintf("Auto-discovered flow (seen %d times, risk score %.2f)", flow.OccurrenceCount, flow.RiskScore),
			Steps:       steps,
		},
	}

	out, err := yaml.Marshal(root)
	if err != nil {
		return "", fmt.Errorf("failed to marshal YAML: %w", err)
	}
	return string(out), nil
}

// --- Helpers ---

type spanNode struct {
	Span     *Span
	Children []*spanNode
}

func buildSpanTree(spans []Span) *spanNode {
	if len(spans) == 0 {
		return nil
	}

	nodes := make(map[string]*spanNode, len(spans))
	for i := range spans {
		nodes[spans[i].SpanID] = &spanNode{Span: &spans[i]}
	}

	var root *spanNode
	for _, n := range nodes {
		if n.Span.ParentSpanID == "" {
			root = n
		} else if parent, ok := nodes[n.Span.ParentSpanID]; ok {
			parent.Children = append(parent.Children, n)
		}
	}

	// If no explicit root found, use first span
	if root == nil && len(spans) > 0 {
		root = nodes[spans[0].SpanID]
	}

	// Sort children by start time for deterministic paths
	var sortChildren func(n *spanNode)
	sortChildren = func(n *spanNode) {
		sort.Slice(n.Children, func(i, j int) bool {
			return n.Children[i].Span.StartTime.Before(n.Children[j].Span.StartTime)
		})
		for _, c := range n.Children {
			sortChildren(c)
		}
	}
	if root != nil {
		sortChildren(root)
	}

	return root
}

func walkGraphPath(root *spanNode) []GraphPathNode {
	if root == nil {
		return nil
	}

	var path []GraphPathNode
	visited := make(map[string]bool)

	var walk func(n *spanNode)
	walk = func(n *spanNode) {
		// Map span to graph path node
		gpn := spanToGraphPathNode(n.Span)
		key := gpn.Type + ":" + gpn.Identifier
		if !visited[key] {
			visited[key] = true
			path = append(path, gpn)
		}

		for _, child := range n.Children {
			walk(child)
		}
	}
	walk(root)

	return path
}

func spanToGraphPathNode(span *Span) GraphPathNode {
	// Determine the best graph node type based on span attributes
	if httpRoute := getStringAttrMap(span.Attributes, "http.route"); httpRoute != "" {
		method := getStringAttrMap(span.Attributes, "http.method")
		identifier := httpRoute
		if method != "" {
			identifier = method + " " + httpRoute
		}
		return GraphPathNode{Type: "api_endpoint", Identifier: identifier, Service: span.Service}
	}

	if dbSystem := getStringAttrMap(span.Attributes, "db.system"); dbSystem != "" {
		dbName := getStringAttrMap(span.Attributes, "db.name")
		if dbName == "" {
			dbName = dbSystem
		}
		return GraphPathNode{Type: "database", Identifier: dbName, Service: span.Service}
	}

	if msgDest := getStringAttrMap(span.Attributes, "messaging.destination.name"); msgDest != "" {
		return GraphPathNode{Type: "topic", Identifier: msgDest, Service: span.Service}
	}

	return GraphPathNode{Type: "service", Identifier: span.Service, Service: span.Service}
}

func getStringAttrMap(attrs graph.JSONMap, key string) string {
	if v, ok := attrs[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func computeFingerprint(path []GraphPathNode) string {
	var parts []string
	for _, p := range path {
		parts = append(parts, p.Type+":"+p.Identifier)
	}
	joined := strings.Join(parts, "→")
	h := sha256.Sum256([]byte(joined))
	return fmt.Sprintf("%x", h)
}

func generateFlowName(service, operation string) string {
	return fmt.Sprintf("%s → %s", service, operation)
}

func pathToString(path []GraphPathNode) string {
	var parts []string
	for _, p := range path {
		parts = append(parts, p.Type+":"+p.Identifier)
	}
	return strings.Join(parts, "→")
}

func storedPathToString(pathJSON graph.JSONArray) string {
	var parts []string
	for _, item := range pathJSON {
		if m, ok := item.(map[string]any); ok {
			t, _ := m["type"].(string)
			id, _ := m["identifier"].(string)
			parts = append(parts, t+":"+id)
		}
	}
	return strings.Join(parts, "→")
}
