package flow

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/graph"
	"github.com/test-mesh/testmesh/internal/graph/scanner"
	"go.uber.org/zap"
	"gopkg.in/yaml.v3"
)

// Scanner parses YAML test flows and creates tested_by edges linking
// flow steps to graph nodes discovered by other scanners.
type Scanner struct {
	logger *zap.Logger
}

func New(logger *zap.Logger) *Scanner {
	return &Scanner{logger: logger}
}

func (s *Scanner) Capabilities() scanner.ScannerCapabilities {
	return scanner.ScannerCapabilities{
		Name:  "flow",
		Layer: graph.SourceLayerFlow,
		FilePatterns: []string{
			"*.yaml",
			"*.yml",
		},
		Description: "Parses YAML test flows to discover tested endpoints, databases, and message topics",
	}
}

func (s *Scanner) Scan(ctx context.Context, input scanner.ScanInput) (*scanner.ScannerOutput, error) {
	output := &scanner.ScannerOutput{}

	files, err := scanner.WalkFiles(input.RepoPath, s.Capabilities().FilePatterns, input.Config)
	if err != nil {
		return nil, fmt.Errorf("walk files: %w", err)
	}

	for _, file := range files {
		select {
		case <-ctx.Done():
			return output, ctx.Err()
		default:
		}

		relPath := scanner.RelPath(input.RepoPath, file)
		result := s.parseFlow(file, relPath)
		if result != nil {
			output.Merge(result)
		}
	}

	s.logger.Info("Flow scan complete",
		zap.Int("nodes", len(output.Nodes)),
		zap.Int("edges", len(output.Edges)),
	)

	return output, nil
}

func (s *Scanner) ScanDiff(ctx context.Context, input scanner.DiffInput) (*scanner.ScannerOutput, error) {
	return s.Scan(ctx, input.ScanInput)
}

// FlowFile represents the structure of a TestMesh YAML flow.
type FlowFile struct {
	Flow struct {
		Name        string            `yaml:"name"`
		Description string            `yaml:"description"`
		Env         map[string]string `yaml:"env"`
		Setup       []FlowStep        `yaml:"setup"`
		Steps       []FlowStep        `yaml:"steps"`
		Teardown    []FlowStep        `yaml:"teardown"`
	} `yaml:"flow"`
}

// FlowStep represents a single step in a flow.
type FlowStep struct {
	ID     string         `yaml:"id"`
	Action string         `yaml:"action"`
	Config map[string]any `yaml:"config"`
	Assert []any          `yaml:"assert"`
	Output map[string]any `yaml:"output"`
}

func (s *Scanner) parseFlow(filePath, relPath string) *scanner.ScannerOutput {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil
	}

	var flow FlowFile
	if err := yaml.Unmarshal(data, &flow); err != nil {
		return nil
	}

	// Skip files that aren't TestMesh flows
	if flow.Flow.Name == "" && len(flow.Flow.Steps) == 0 {
		return nil
	}

	output := &scanner.ScannerOutput{}

	// Collect all steps (setup + steps + teardown)
	allSteps := make([]FlowStep, 0, len(flow.Flow.Setup)+len(flow.Flow.Steps)+len(flow.Flow.Teardown))
	allSteps = append(allSteps, flow.Flow.Setup...)
	allSteps = append(allSteps, flow.Flow.Steps...)
	allSteps = append(allSteps, flow.Flow.Teardown...)

	// Analyze each step for testable references
	for _, step := range allSteps {
		refs := s.extractReferences(step, flow.Flow.Env)
		for _, ref := range refs {
			ref.SourceFile = relPath
			ref.FlowName = flow.Flow.Name
			output.Nodes = append(output.Nodes, ref.Node)
		}
	}

	// Extract env var references
	for name, value := range flow.Flow.Env {
		if looksLikeURL(value) {
			host, _, _ := parseEndpointURL(value)
			if host != "" {
				output.Nodes = append(output.Nodes, graph.GraphNode{
					ID:   uuid.New(),
					Type: graph.NodeTypeEnvironment,
					Name: name,
					Metadata: graph.JSONMap{
						"source":  "flow",
						"flow":    flow.Flow.Name,
						"value":   value,
						"host":    host,
					},
					SourceFile: relPath,
					Confidence: 0.7,
					Version:    1,
				})
			}
		}

		if looksLikeConnectionString(value) {
			output.Nodes = append(output.Nodes, graph.GraphNode{
				ID:   uuid.New(),
				Type: graph.NodeTypeEnvironment,
				Name: name,
				Metadata: graph.JSONMap{
					"source": "flow",
					"flow":   flow.Flow.Name,
					"type":   "connection_string",
				},
				SourceFile: relPath,
				Confidence: 0.7,
				Version:    1,
			})
		}
	}

	return output
}

// StepReference represents a detected reference to a graph node from a flow step.
type StepReference struct {
	Node       graph.GraphNode
	StepID     string
	FlowName   string
	SourceFile string
}

var envVarRegex = regexp.MustCompile(`\$\{(\w+)\}`)

func (s *Scanner) extractReferences(step FlowStep, envVars map[string]string) []StepReference {
	var refs []StepReference

	switch step.Action {
	case "http_request":
		ref := s.extractHTTPRef(step, envVars)
		if ref != nil {
			refs = append(refs, *ref)
		}

	case "database_query":
		ref := s.extractDBRef(step, envVars)
		if ref != nil {
			refs = append(refs, *ref)
		}

	case "kafka_producer", "kafka_publish":
		ref := s.extractKafkaRef(step, envVars, "publishes")
		if ref != nil {
			refs = append(refs, *ref)
		}

	case "kafka_consumer", "kafka_subscribe":
		ref := s.extractKafkaRef(step, envVars, "consumes")
		if ref != nil {
			refs = append(refs, *ref)
		}

	case "grpc_call":
		ref := s.extractGRPCRef(step, envVars)
		if ref != nil {
			refs = append(refs, *ref)
		}

	case "redis_get", "redis_set", "redis_del", "redis_command":
		ref := s.extractRedisRef(step, envVars)
		if ref != nil {
			refs = append(refs, *ref)
		}

	case "websocket_connect", "websocket_send":
		ref := s.extractWebSocketRef(step, envVars)
		if ref != nil {
			refs = append(refs, *ref)
		}
	}

	return refs
}

func (s *Scanner) extractHTTPRef(step FlowStep, envVars map[string]string) *StepReference {
	rawURL, _ := step.Config["url"].(string)
	if rawURL == "" {
		return nil
	}

	// Resolve env vars in URL
	resolved := resolveEnvVars(rawURL, envVars)
	host, path, method := parseEndpointURL(resolved)
	if method == "" {
		if m, ok := step.Config["method"].(string); ok {
			method = strings.ToUpper(m)
		}
	}

	name := fmt.Sprintf("%s %s", method, path)
	if name == " " {
		name = resolved
	}

	return &StepReference{
		StepID: step.ID,
		Node: graph.GraphNode{
			ID:   uuid.New(),
			Type: graph.NodeTypeAPIEndpoint,
			Name: name,
			Metadata: graph.JSONMap{
				"source": "flow",
				"method": method,
				"path":   path,
				"host":   host,
				"url":    rawURL,
			},
			Confidence: 0.8,
			Version:    1,
		},
	}
}

func (s *Scanner) extractDBRef(step FlowStep, envVars map[string]string) *StepReference {
	query, _ := step.Config["query"].(string)
	if query == "" {
		return nil
	}

	// Extract table names from SQL
	tables := extractSQLTables(query)
	if len(tables) == 0 {
		return nil
	}

	return &StepReference{
		StepID: step.ID,
		Node: graph.GraphNode{
			ID:   uuid.New(),
			Type: graph.NodeTypeTable,
			Name: tables[0], // Primary table
			Metadata: graph.JSONMap{
				"source":     "flow",
				"tables":     tables,
				"query_type": detectSQLType(query),
			},
			Confidence: 0.8,
			Version:    1,
		},
	}
}

func (s *Scanner) extractKafkaRef(step FlowStep, envVars map[string]string, direction string) *StepReference {
	topic, _ := step.Config["topic"].(string)
	if topic == "" {
		return nil
	}

	topic = resolveEnvVars(topic, envVars)

	return &StepReference{
		StepID: step.ID,
		Node: graph.GraphNode{
			ID:   uuid.New(),
			Type: graph.NodeTypeTopic,
			Name: topic,
			Metadata: graph.JSONMap{
				"source":    "flow",
				"direction": direction,
			},
			Confidence: 0.8,
			Version:    1,
		},
	}
}

func (s *Scanner) extractGRPCRef(step FlowStep, envVars map[string]string) *StepReference {
	method, _ := step.Config["method"].(string)
	service, _ := step.Config["service"].(string)
	if method == "" && service == "" {
		return nil
	}

	name := method
	if service != "" && method != "" {
		name = fmt.Sprintf("%s/%s", service, method)
	}

	return &StepReference{
		StepID: step.ID,
		Node: graph.GraphNode{
			ID:   uuid.New(),
			Type: graph.NodeTypeGRPCMethod,
			Name: name,
			Metadata: graph.JSONMap{
				"source": "flow",
			},
			Confidence: 0.8,
			Version:    1,
		},
	}
}

func (s *Scanner) extractRedisRef(step FlowStep, envVars map[string]string) *StepReference {
	key, _ := step.Config["key"].(string)
	if key == "" {
		return nil
	}

	// Generalize key to pattern (replace specific IDs with *)
	pattern := generalizeRedisKey(resolveEnvVars(key, envVars))

	return &StepReference{
		StepID: step.ID,
		Node: graph.GraphNode{
			ID:   uuid.New(),
			Type: graph.NodeTypeRedisKeyPattern,
			Name: pattern,
			Metadata: graph.JSONMap{
				"source":      "flow",
				"original_key": key,
			},
			Confidence: 0.7,
			Version:    1,
		},
	}
}

func (s *Scanner) extractWebSocketRef(step FlowStep, envVars map[string]string) *StepReference {
	wsURL, _ := step.Config["url"].(string)
	if wsURL == "" {
		return nil
	}

	return &StepReference{
		StepID: step.ID,
		Node: graph.GraphNode{
			ID:   uuid.New(),
			Type: graph.NodeTypeWebSocket,
			Name: resolveEnvVars(wsURL, envVars),
			Metadata: graph.JSONMap{
				"source": "flow",
				"url":    wsURL,
			},
			Confidence: 0.8,
			Version:    1,
		},
	}
}

// --- Helpers ---

func resolveEnvVars(s string, envVars map[string]string) string {
	return envVarRegex.ReplaceAllStringFunc(s, func(match string) string {
		varName := match[2 : len(match)-1] // Strip ${ and }
		if val, ok := envVars[varName]; ok {
			return val
		}
		return match
	})
}

func parseEndpointURL(rawURL string) (host, path, method string) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "", "", ""
	}
	return parsed.Host, parsed.Path, ""
}

var (
	sqlTableRegex = regexp.MustCompile(`(?i)(?:FROM|INTO|UPDATE|JOIN|TABLE)\s+([a-zA-Z_][\w.]*(?:\s*,\s*[a-zA-Z_][\w.]*)*)`)
)

func extractSQLTables(query string) []string {
	seen := make(map[string]bool)
	var tables []string

	for _, match := range sqlTableRegex.FindAllStringSubmatch(query, -1) {
		for _, tablePart := range strings.Split(match[1], ",") {
			table := strings.TrimSpace(tablePart)
			table = strings.Split(table, " ")[0] // Remove alias
			if table != "" && !seen[table] {
				seen[table] = true
				tables = append(tables, table)
			}
		}
	}

	return tables
}

func detectSQLType(query string) string {
	upper := strings.TrimSpace(strings.ToUpper(query))
	switch {
	case strings.HasPrefix(upper, "SELECT"):
		return "read"
	case strings.HasPrefix(upper, "INSERT"):
		return "write"
	case strings.HasPrefix(upper, "UPDATE"):
		return "write"
	case strings.HasPrefix(upper, "DELETE"):
		return "write"
	case strings.HasPrefix(upper, "CREATE"):
		return "ddl"
	default:
		return "unknown"
	}
}

func looksLikeURL(s string) bool {
	return strings.HasPrefix(s, "http://") || strings.HasPrefix(s, "https://") ||
		strings.HasPrefix(s, "ws://") || strings.HasPrefix(s, "wss://")
}

func looksLikeConnectionString(s string) bool {
	return strings.HasPrefix(s, "postgresql://") || strings.HasPrefix(s, "postgres://") ||
		strings.HasPrefix(s, "mysql://") || strings.HasPrefix(s, "mongodb://") ||
		strings.HasPrefix(s, "redis://") || strings.HasPrefix(s, "amqp://")
}

var uuidRegex = regexp.MustCompile(`[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`)
var numericIDRegex = regexp.MustCompile(`:\d+`)

func generalizeRedisKey(key string) string {
	// Replace UUIDs with *
	key = uuidRegex.ReplaceAllString(key, "*")
	// Replace numeric IDs in patterns like user:123
	key = numericIDRegex.ReplaceAllString(key, ":*")
	return key
}
