package code

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/graph"
	"github.com/test-mesh/testmesh/internal/graph/scanner"
	"github.com/test-mesh/testmesh/internal/graph/scanner/code/patterns"
	"go.uber.org/zap"
)

var (
	// Spring Boot: @GetMapping("/path"), @PostMapping("/path")
	springMappingRegex = regexp.MustCompile(`@(Get|Post|Put|Delete|Patch|Request)Mapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']`)
	// Spring Boot: @RequestMapping("/base")
	springRequestMappingRegex = regexp.MustCompile(`@RequestMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']`)
	// Spring Boot: @RestController
	springControllerRegex = regexp.MustCompile(`@(?:Rest)?Controller`)

	// Kafka: @KafkaListener(topics = "topic")
	kafkaListenerRegex = regexp.MustCompile(`@KafkaListener\s*\([^)]*topics?\s*=\s*["']([^"']+)["']`)
	// KafkaTemplate: kafkaTemplate.send("topic", ...)
	kafkaTemplateRegex = regexp.MustCompile(`kafkaTemplate\.send\s*\(\s*["']([^"']+)["']`)

	// JPA: @Entity / @Table(name = "users")
	jpaEntityRegex = regexp.MustCompile(`@Entity`)
	jpaTableRegex  = regexp.MustCompile(`@Table\s*\(\s*(?:name\s*=\s*)?["']([^"']+)["']`)
	// JPA class name fallback
	jpaClassRegex = regexp.MustCompile(`public\s+class\s+(\w+)\s+`)

	// gRPC Java: extends ...ImplBase / newBlockingStub(channel)
	javaGRPCServerRegex = regexp.MustCompile(`extends\s+(\w+)Grpc\.(\w+)ImplBase`)
	javaGRPCClientRegex = regexp.MustCompile(`(\w+)Grpc\.newBlockingStub`)

	// Java HTTP client: HttpClient, RestTemplate, WebClient
	restTemplateRegex = regexp.MustCompile(`(?:restTemplate|webClient)\.\w+\s*\(\s*["']([^"']+)["']`)

	// Redis: redisTemplate.opsForValue().get("key")
	javaRedisRegex = regexp.MustCompile(`redisTemplate\.(?:opsFor\w+\(\)\.)?(?:get|set|delete)\s*\(\s*["']([^"']+)["']`)
)

// JavaScanner detects patterns in Java source files.
type JavaScanner struct {
	logger *zap.Logger
}

func NewJavaScanner(logger *zap.Logger) *JavaScanner {
	return &JavaScanner{logger: logger}
}

func (s *JavaScanner) Capabilities() scanner.ScannerCapabilities {
	return scanner.ScannerCapabilities{
		Name:         "java",
		Layer:        graph.SourceLayerCode,
		FilePatterns: []string{"*.java"},
		Description:  "Detects Java HTTP routes, Kafka, gRPC, database, and Redis patterns",
	}
}

func (s *JavaScanner) Scan(ctx context.Context, input scanner.ScanInput) (*scanner.ScannerOutput, error) {
	output := &scanner.ScannerOutput{}

	files, err := scanner.WalkFiles(input.RepoPath, s.Capabilities().FilePatterns, input.Config)
	if err != nil {
		return nil, err
	}

	serviceName := detectJavaServiceName(input.RepoPath)
	var serviceID uuid.UUID
	if serviceName != "" {
		serviceID = uuid.New()
		output.Nodes = append(output.Nodes, graph.GraphNode{
			ID: serviceID, Type: graph.NodeTypeService, Name: serviceName,
			Service: serviceName, Metadata: graph.JSONMap{"source": "code", "language": "java"},
			Confidence: 0.85, Version: 1,
		})
	}

	for _, file := range files {
		select {
		case <-ctx.Done():
			return output, ctx.Err()
		default:
		}

		relPath := scanner.RelPath(input.RepoPath, file)
		content := scanner.ReadFileString(file)
		if content == "" || strings.Contains(relPath, "test/") ||
			strings.Contains(relPath, "Test.java") || strings.Contains(relPath, "target/") {
			continue
		}

		s.scanJavaFile(content, relPath, serviceName, serviceID, output)
	}

	return output, nil
}

func (s *JavaScanner) ScanDiff(ctx context.Context, input scanner.DiffInput) (*scanner.ScannerOutput, error) {
	return s.Scan(ctx, input.ScanInput)
}

func (s *JavaScanner) scanJavaFile(content, relPath, serviceName string, serviceID uuid.UUID, output *scanner.ScannerOutput) {
	// Spring Boot controller base path
	basePath := ""
	if match := springRequestMappingRegex.FindStringSubmatch(content); len(match) > 1 {
		basePath = "/" + strings.Trim(match[1], "/")
	}

	// Spring endpoint mappings
	if springControllerRegex.MatchString(content) {
		for _, match := range springMappingRegex.FindAllStringSubmatch(content, -1) {
			method := strings.ToUpper(match[1])
			if method == "REQUEST" {
				method = "*"
			}
			path := basePath + "/" + strings.TrimLeft(match[2], "/")
			addJavaEndpoint(output, method, path, relPath, serviceName, serviceID, "spring")
		}
	}

	// Kafka listener (consumer)
	for _, match := range kafkaListenerRegex.FindAllStringSubmatch(content, -1) {
		addJavaTopicEdge(output, match[1], relPath, serviceName, serviceID, graph.EdgeTypeConsumes)
	}

	// Kafka producer
	for _, match := range kafkaTemplateRegex.FindAllStringSubmatch(content, -1) {
		addJavaTopicEdge(output, match[1], relPath, serviceName, serviceID, graph.EdgeTypePublishes)
	}

	// JPA entities
	if jpaEntityRegex.MatchString(content) {
		tableName := ""
		if match := jpaTableRegex.FindStringSubmatch(content); len(match) > 1 {
			tableName = match[1]
		} else if match := jpaClassRegex.FindStringSubmatch(content); len(match) > 1 {
			tableName = strings.ToLower(match[1])
		}
		if tableName != "" {
			addJavaTableNode(output, tableName, relPath, serviceName, serviceID)
		}
	}

	// gRPC server
	for _, match := range javaGRPCServerRegex.FindAllStringSubmatch(content, -1) {
		methodID := uuid.New()
		output.Nodes = append(output.Nodes, graph.GraphNode{
			ID: methodID, Type: graph.NodeTypeGRPCMethod, Name: match[1],
			Service: serviceName, SourceFile: relPath,
			Metadata: graph.JSONMap{"source": "code", "language": "java", "role": "server"},
			Confidence: 0.85, Version: 1,
		})
		if serviceID != uuid.Nil {
			output.Edges = append(output.Edges, graph.GraphEdge{
				ID: uuid.New(), Type: graph.EdgeTypeExposes, FromNodeID: serviceID, ToNodeID: methodID, Confidence: 0.85,
			})
		}
	}

	// gRPC client
	for _, match := range javaGRPCClientRegex.FindAllStringSubmatch(content, -1) {
		clientID := uuid.New()
		output.Nodes = append(output.Nodes, graph.GraphNode{
			ID: clientID, Type: graph.NodeTypeGRPCMethod, Name: match[1],
			SourceFile: relPath,
			Metadata:   graph.JSONMap{"source": "code", "language": "java", "role": "client"},
			Confidence: 0.75, Version: 1,
		})
		if serviceID != uuid.Nil {
			output.Edges = append(output.Edges, graph.GraphEdge{
				ID: uuid.New(), Type: graph.EdgeTypeCalls, FromNodeID: serviceID, ToNodeID: clientID, Confidence: 0.75,
			})
		}
	}

	// HTTP client calls (RestTemplate, WebClient)
	for _, match := range restTemplateRegex.FindAllStringSubmatch(content, -1) {
		if patterns.IsExternalURL(match[1]) {
			addExternalCall(output, match[1], relPath, serviceName, serviceID, "java")
		}
	}

	// Redis
	for _, match := range javaRedisRegex.FindAllStringSubmatch(content, -1) {
		output.Nodes = append(output.Nodes, graph.GraphNode{
			ID: uuid.New(), Type: graph.NodeTypeRedisKeyPattern, Name: match[1],
			Service: serviceName, SourceFile: relPath,
			Metadata: graph.JSONMap{"source": "code", "language": "java"}, Confidence: 0.7, Version: 1,
		})
	}
}

func addJavaEndpoint(output *scanner.ScannerOutput, method, path, relPath, serviceName string, serviceID uuid.UUID, framework string) {
	endpointID := uuid.New()
	output.Nodes = append(output.Nodes, graph.GraphNode{
		ID: endpointID, Type: graph.NodeTypeAPIEndpoint, Name: fmt.Sprintf("%s %s", method, path),
		Service: serviceName, SourceFile: relPath,
		Metadata:   graph.JSONMap{"source": "code", "language": "java", "framework": framework, "method": method, "path": path},
		Confidence: 0.9, Version: 1,
	})
	if serviceID != uuid.Nil {
		output.Edges = append(output.Edges, graph.GraphEdge{
			ID: uuid.New(), Type: graph.EdgeTypeExposes, FromNodeID: serviceID, ToNodeID: endpointID, Confidence: 0.9,
		})
	}
}

func addJavaTopicEdge(output *scanner.ScannerOutput, topic, relPath, serviceName string, serviceID uuid.UUID, edgeType graph.EdgeType) {
	topicID := uuid.New()
	output.Nodes = append(output.Nodes, graph.GraphNode{
		ID: topicID, Type: graph.NodeTypeTopic, Name: topic, SourceFile: relPath,
		Metadata: graph.JSONMap{"source": "code", "language": "java"}, Confidence: 0.85, Version: 1,
	})
	if serviceID != uuid.Nil {
		output.Edges = append(output.Edges, graph.GraphEdge{
			ID: uuid.New(), Type: edgeType, FromNodeID: serviceID, ToNodeID: topicID, Confidence: 0.85,
		})
	}
}

func addJavaTableNode(output *scanner.ScannerOutput, table, relPath, serviceName string, serviceID uuid.UUID) {
	tableID := uuid.New()
	output.Nodes = append(output.Nodes, graph.GraphNode{
		ID: tableID, Type: graph.NodeTypeTable, Name: table, Service: serviceName,
		SourceFile: relPath, Metadata: graph.JSONMap{"source": "code", "language": "java"},
		Confidence: 0.8, Version: 1,
	})
	if serviceID != uuid.Nil {
		output.Edges = append(output.Edges, graph.GraphEdge{
			ID: uuid.New(), Type: graph.EdgeTypeWrites, FromNodeID: serviceID, ToNodeID: tableID, Confidence: 0.8,
		})
	}
}

func detectJavaServiceName(repoPath string) string {
	// Check pom.xml for artifactId
	content := readFile(repoPath + "/pom.xml")
	if content != "" {
		nameRegex := regexp.MustCompile(`<artifactId>([^<]+)</artifactId>`)
		matches := nameRegex.FindAllStringSubmatch(content, -1)
		// Use first artifactId that isn't a parent
		for _, match := range matches {
			if !strings.Contains(match[1], "parent") && !strings.Contains(match[1], "starter") {
				return match[1]
			}
		}
	}
	// Check build.gradle
	content = readFile(repoPath + "/build.gradle")
	if content == "" {
		content = readFile(repoPath + "/build.gradle.kts")
	}
	if content != "" {
		nameRegex := regexp.MustCompile(`(?:rootProject\.name|archivesBaseName)\s*=\s*["']([^"']+)["']`)
		if match := nameRegex.FindStringSubmatch(content); len(match) > 1 {
			return match[1]
		}
	}
	return ""
}
