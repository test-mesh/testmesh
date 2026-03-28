package spec

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/graph"
	"github.com/test-mesh/testmesh/internal/graph/scanner"
	"go.uber.org/zap"
	"gopkg.in/yaml.v3"
)

// Scanner discovers API specifications from OpenAPI, gRPC .proto, AsyncAPI, Avro, and GraphQL files.
type Scanner struct {
	logger *zap.Logger
}

func New(logger *zap.Logger) *Scanner {
	return &Scanner{logger: logger}
}

func (s *Scanner) Capabilities() scanner.ScannerCapabilities {
	return scanner.ScannerCapabilities{
		Name:  "spec",
		Layer: graph.SourceLayerSpec,
		FilePatterns: []string{
			"*openapi*",
			"*swagger*",
			"*.proto",
			"*asyncapi*",
			"*.avsc",
			"*.graphql",
			"*.gql",
		},
		Description: "Discovers API endpoints from OpenAPI, gRPC, AsyncAPI, Avro, and GraphQL specifications",
	}
}

func (s *Scanner) Scan(ctx context.Context, input scanner.ScanInput) (*scanner.ScannerOutput, error) {
	output := &scanner.ScannerOutput{}

	files, err := scanner.WalkFiles(input.RepoPath, nil, input.Config)
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
		name := strings.ToLower(filepath.Base(file))
		ext := filepath.Ext(name)

		switch {
		case isOpenAPIFile(name, file):
			result := s.parseOpenAPI(file, relPath)
			output.Merge(result)
		case ext == ".proto":
			result := s.parseProto(file, relPath)
			output.Merge(result)
		case isAsyncAPIFile(name):
			result := s.parseAsyncAPI(file, relPath)
			output.Merge(result)
		case ext == ".avsc":
			result := s.parseAvro(file, relPath)
			output.Merge(result)
		case ext == ".graphql" || ext == ".gql":
			result := s.parseGraphQL(file, relPath)
			output.Merge(result)
		}
	}

	s.logger.Info("Spec scan complete",
		zap.Int("nodes", len(output.Nodes)),
		zap.Int("edges", len(output.Edges)),
	)

	return output, nil
}

func (s *Scanner) ScanDiff(ctx context.Context, input scanner.DiffInput) (*scanner.ScannerOutput, error) {
	return s.Scan(ctx, input.ScanInput)
}

// --- OpenAPI/Swagger Parser ---

func (s *Scanner) parseOpenAPI(filePath, relPath string) *scanner.ScannerOutput {
	output := &scanner.ScannerOutput{}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return output
	}

	var spec struct {
		OpenAPI string `yaml:"openapi" json:"openapi"`
		Swagger string `yaml:"swagger" json:"swagger"`
		Info    struct {
			Title   string `yaml:"title" json:"title"`
			Version string `yaml:"version" json:"version"`
		} `yaml:"info" json:"info"`
		Servers []struct {
			URL string `yaml:"url" json:"url"`
		} `yaml:"servers" json:"servers"`
		Paths map[string]map[string]struct {
			OperationID string   `yaml:"operationId" json:"operationId"`
			Summary     string   `yaml:"summary" json:"summary"`
			Tags        []string `yaml:"tags" json:"tags"`
			Parameters  []struct {
				Name     string `yaml:"name" json:"name"`
				In       string `yaml:"in" json:"in"`
				Required bool   `yaml:"required" json:"required"`
			} `yaml:"parameters" json:"parameters"`
			RequestBody struct {
				Content map[string]struct {
					Schema map[string]any `yaml:"schema" json:"schema"`
				} `yaml:"content" json:"content"`
			} `yaml:"requestBody" json:"requestBody"`
			Responses map[string]struct {
				Description string `yaml:"description" json:"description"`
			} `yaml:"responses" json:"responses"`
		} `yaml:"paths" json:"paths"`
	}

	// Try YAML first, then JSON
	if err := yaml.Unmarshal(data, &spec); err != nil {
		if err := json.Unmarshal(data, &spec); err != nil {
			output.Warnings = append(output.Warnings, scanner.ScanWarning{
				File: relPath, Message: fmt.Sprintf("failed to parse OpenAPI spec: %v", err), Level: "warn",
			})
			return output
		}
	}

	if spec.OpenAPI == "" && spec.Swagger == "" {
		return output // Not an OpenAPI file
	}

	// Create a service node for the API
	serviceName := strings.ToLower(strings.ReplaceAll(spec.Info.Title, " ", "-"))
	if serviceName == "" {
		serviceName = strings.TrimSuffix(filepath.Base(relPath), filepath.Ext(relPath))
	}

	serviceID := uuid.New()
	output.Nodes = append(output.Nodes, graph.GraphNode{
		ID:      serviceID,
		Type:    graph.NodeTypeService,
		Name:    serviceName,
		Service: serviceName,
		Metadata: graph.JSONMap{
			"source":  "openapi",
			"version": spec.Info.Version,
			"title":   spec.Info.Title,
		},
		SourceFile: relPath,
		Confidence: 0.95,
		Version:    1,
	})

	// Create endpoint nodes
	for path, methods := range spec.Paths {
		for method, operation := range methods {
			method = strings.ToUpper(method)
			if method == "PARAMETERS" || method == "SERVERS" {
				continue
			}

			endpointName := operation.OperationID
			if endpointName == "" {
				endpointName = fmt.Sprintf("%s %s", method, path)
			}

			endpointID := uuid.New()
			metadata := graph.JSONMap{
				"source":  "openapi",
				"method":  method,
				"path":    path,
			}
			if operation.Summary != "" {
				metadata["description"] = operation.Summary
			}
			if len(operation.Tags) > 0 {
				metadata["tags"] = operation.Tags
			}

			output.Nodes = append(output.Nodes, graph.GraphNode{
				ID:         endpointID,
				Type:       graph.NodeTypeAPIEndpoint,
				Name:       endpointName,
				Service:    serviceName,
				Tags:       graph.StringArray(operation.Tags),
				Metadata:   metadata,
				SourceFile: relPath,
				Confidence: 0.95,
				Version:    1,
			})

			// Service exposes endpoint
			output.Edges = append(output.Edges, graph.GraphEdge{
				ID:         uuid.New(),
				Type:       graph.EdgeTypeExposes,
				FromNodeID: serviceID,
				ToNodeID:   endpointID,
				Properties: graph.JSONMap{"method": method, "path": path},
				Confidence: 0.95,
			})
		}
	}

	return output
}

// --- gRPC Proto Parser ---

var (
	protoPackageRegex = regexp.MustCompile(`package\s+(\S+)\s*;`)
	protoServiceRegex = regexp.MustCompile(`service\s+(\w+)\s*\{`)
	protoRPCRegex     = regexp.MustCompile(`rpc\s+(\w+)\s*\(\s*(\w+)\s*\)\s+returns\s+\(\s*(\w+)\s*\)`)
)

func (s *Scanner) parseProto(filePath, relPath string) *scanner.ScannerOutput {
	output := &scanner.ScannerOutput{}

	content := scanner.ReadFileString(filePath)
	if content == "" {
		return output
	}

	// Extract package name
	packageName := ""
	if match := protoPackageRegex.FindStringSubmatch(content); len(match) > 1 {
		packageName = match[1]
	}

	// Extract services
	serviceMatches := protoServiceRegex.FindAllStringSubmatch(content, -1)
	for _, svcMatch := range serviceMatches {
		serviceName := svcMatch[1]
		serviceID := uuid.New()

		output.Nodes = append(output.Nodes, graph.GraphNode{
			ID:      serviceID,
			Type:    graph.NodeTypeService,
			Name:    serviceName,
			Service: serviceName,
			Metadata: graph.JSONMap{
				"source":  "grpc",
				"package": packageName,
			},
			SourceFile: relPath,
			Confidence: 0.95,
			Version:    1,
		})

		// Extract RPCs within this service
		for _, rpcMatch := range protoRPCRegex.FindAllStringSubmatch(content, -1) {
			methodName := rpcMatch[1]
			requestType := rpcMatch[2]
			responseType := rpcMatch[3]

			methodID := uuid.New()
			fullMethod := fmt.Sprintf("%s/%s", serviceName, methodName)

			output.Nodes = append(output.Nodes, graph.GraphNode{
				ID:      methodID,
				Type:    graph.NodeTypeGRPCMethod,
				Name:    fullMethod,
				Service: serviceName,
				Metadata: graph.JSONMap{
					"source":        "grpc",
					"package":       packageName,
					"request_type":  requestType,
					"response_type": responseType,
				},
				SourceFile: relPath,
				Confidence: 0.95,
				Version:    1,
			})

			output.Edges = append(output.Edges, graph.GraphEdge{
				ID:         uuid.New(),
				Type:       graph.EdgeTypeExposes,
				FromNodeID: serviceID,
				ToNodeID:   methodID,
				Confidence: 0.95,
			})
		}
	}

	return output
}

// --- AsyncAPI Parser ---

func (s *Scanner) parseAsyncAPI(filePath, relPath string) *scanner.ScannerOutput {
	output := &scanner.ScannerOutput{}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return output
	}

	var spec struct {
		AsyncAPI string `yaml:"asyncapi" json:"asyncapi"`
		Info     struct {
			Title   string `yaml:"title" json:"title"`
			Version string `yaml:"version" json:"version"`
		} `yaml:"info" json:"info"`
		Channels map[string]struct {
			Subscribe *struct {
				OperationID string `yaml:"operationId" json:"operationId"`
				Summary     string `yaml:"summary" json:"summary"`
			} `yaml:"subscribe" json:"subscribe"`
			Publish *struct {
				OperationID string `yaml:"operationId" json:"operationId"`
				Summary     string `yaml:"summary" json:"summary"`
			} `yaml:"publish" json:"publish"`
		} `yaml:"channels" json:"channels"`
	}

	if err := yaml.Unmarshal(data, &spec); err != nil {
		return output
	}

	if spec.AsyncAPI == "" {
		return output
	}

	serviceName := strings.ToLower(strings.ReplaceAll(spec.Info.Title, " ", "-"))

	for channelName, channel := range spec.Channels {
		topicID := uuid.New()
		output.Nodes = append(output.Nodes, graph.GraphNode{
			ID:   topicID,
			Type: graph.NodeTypeTopic,
			Name: channelName,
			Metadata: graph.JSONMap{
				"source": "asyncapi",
			},
			SourceFile: relPath,
			Confidence: 0.9,
			Version:    1,
		})

		if channel.Publish != nil {
			// Service publishes to this channel
			output.Nodes = append(output.Nodes, graph.GraphNode{
				ID:      uuid.New(),
				Type:    graph.NodeTypeService,
				Name:    serviceName,
				Service: serviceName,
				Metadata: graph.JSONMap{
					"source": "asyncapi",
				},
				SourceFile: relPath,
				Confidence: 0.7,
				Version:    1,
			})
		}

		if channel.Subscribe != nil {
			// Service subscribes from this channel
			_ = channel.Subscribe
		}
	}

	return output
}

// --- Avro Schema Parser ---

func (s *Scanner) parseAvro(filePath, relPath string) *scanner.ScannerOutput {
	output := &scanner.ScannerOutput{}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return output
	}

	var schema struct {
		Type      string `json:"type"`
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
		Fields    []struct {
			Name string `json:"name"`
			Type any    `json:"type"`
		} `json:"fields"`
	}

	if err := json.Unmarshal(data, &schema); err != nil {
		return output
	}

	if schema.Type != "record" || schema.Name == "" {
		return output
	}

	// An Avro schema typically represents a message type for a topic
	output.Nodes = append(output.Nodes, graph.GraphNode{
		ID:   uuid.New(),
		Type: graph.NodeTypeTopic,
		Name: schema.Name,
		Metadata: graph.JSONMap{
			"source":    "avro",
			"namespace": schema.Namespace,
			"fields":    len(schema.Fields),
		},
		SourceFile: relPath,
		Confidence: 0.8,
		Version:    1,
	})

	return output
}

// --- GraphQL Schema Parser ---

var (
	gqlTypeRegex     = regexp.MustCompile(`type\s+(\w+)\s*(?:@\w+(?:\([^)]*\))?\s*)*\{`)
	gqlFieldRegex    = regexp.MustCompile(`\s+(\w+)(?:\([^)]*\))?\s*:\s*(\[?\w+!?\]?)`)
	gqlQueryTypes    = map[string]bool{"Query": true, "Mutation": true, "Subscription": true}
)

func (s *Scanner) parseGraphQL(filePath, relPath string) *scanner.ScannerOutput {
	output := &scanner.ScannerOutput{}

	content := scanner.ReadFileString(filePath)
	if content == "" {
		return output
	}

	typeMatches := gqlTypeRegex.FindAllStringSubmatchIndex(content, -1)
	for _, match := range typeMatches {
		typeName := content[match[2]:match[3]]

		if !gqlQueryTypes[typeName] {
			continue
		}

		// Find the body of this type (between { and })
		bodyStart := match[1]
		braceCount := 0
		bodyEnd := bodyStart
		for i := bodyStart - 1; i < len(content); i++ {
			if content[i] == '{' {
				braceCount++
			} else if content[i] == '}' {
				braceCount--
				if braceCount == 0 {
					bodyEnd = i
					break
				}
			}
		}

		body := content[bodyStart:bodyEnd]
		for _, fieldMatch := range gqlFieldRegex.FindAllStringSubmatch(body, -1) {
			fieldName := fieldMatch[1]
			fieldType := fieldMatch[2]

			endpointName := fmt.Sprintf("%s.%s", typeName, fieldName)
			output.Nodes = append(output.Nodes, graph.GraphNode{
				ID:   uuid.New(),
				Type: graph.NodeTypeAPIEndpoint,
				Name: endpointName,
				Metadata: graph.JSONMap{
					"source":      "graphql",
					"schema_type": typeName,
					"return_type": fieldType,
				},
				SourceFile: relPath,
				Confidence: 0.9,
				Version:    1,
			})
		}
	}

	return output
}

// --- Helpers ---

func isOpenAPIFile(name string, filePath string) bool {
	if strings.Contains(name, "openapi") || strings.Contains(name, "swagger") {
		return scanner.IsYAMLFile(filePath) || scanner.IsJSONFile(filePath)
	}
	// Also check file contents for openapi/swagger key
	if !scanner.IsYAMLFile(filePath) && !scanner.IsJSONFile(filePath) {
		return false
	}
	content := scanner.ReadFileString(filePath)
	return strings.Contains(content[:min(500, len(content))], "openapi") ||
		strings.Contains(content[:min(500, len(content))], "swagger")
}

func isAsyncAPIFile(name string) bool {
	return strings.Contains(name, "asyncapi")
}
