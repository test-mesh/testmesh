package code

import (
	"context"
	"fmt"
	"os"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/graph"
	"github.com/test-mesh/testmesh/internal/graph/scanner"
	"github.com/test-mesh/testmesh/internal/graph/scanner/code/patterns"
	"go.uber.org/zap"
)

var (
	// ASP.NET: [HttpGet("path")], [HttpPost("path")]
	aspnetAttributeRegex = regexp.MustCompile(`\[Http(Get|Post|Put|Delete|Patch|Options|Head)\s*\(\s*"([^"]*)"`)
	// ASP.NET: [Route("api/[controller]")]
	aspnetRouteRegex = regexp.MustCompile(`\[Route\s*\(\s*"([^"]+)"\s*\)\]`)
	// ASP.NET: [ApiController]
	aspnetControllerRegex = regexp.MustCompile(`\[ApiController\]`)
	// Minimal API: app.MapGet("/path", handler)
	minimalAPIRegex = regexp.MustCompile(`\.Map(Get|Post|Put|Delete|Patch)\s*\(\s*"([^"]+)"`)

	// Confluent.Kafka: producer.Produce / consumer.Subscribe
	dotnetKafkaProducerRegex = regexp.MustCompile(`\.Produce(?:Async)?\s*\(\s*"([^"]+)"`)
	dotnetKafkaConsumerRegex = regexp.MustCompile(`\.Subscribe\s*\(\s*(?:new\s*\[\]\s*\{\s*)?"([^"]+)"`)

	// EF Core: DbSet<Entity> / [Table("name")] / .ToTable("name")
	efCoreDbSetRegex  = regexp.MustCompile(`DbSet<(\w+)>\s+(\w+)`)
	efCoreTableRegex  = regexp.MustCompile(`\[Table\s*\(\s*"([^"]+)"\s*\)\]`)
	efCoreToTableRegex = regexp.MustCompile(`\.ToTable\s*\(\s*"([^"]+)"`)

	// gRPC C#: override ...Base / new ...Client(channel)
	dotnetGRPCServerRegex = regexp.MustCompile(`class\s+\w+\s*:\s*(\w+)\.(\w+)Base`)
	dotnetGRPCClientRegex = regexp.MustCompile(`new\s+(\w+)\.(\w+)Client\s*\(`)

	// HttpClient: httpClient.GetAsync("url")
	dotnetHTTPClientRegex = regexp.MustCompile(`(?:httpClient|_httpClient|client)\.(Get|Post|Put|Delete|Patch)(?:Async)?\s*\(\s*"([^"]+)"`)

	// Redis: cache.GetStringAsync("key"), cache.SetStringAsync("key")
	dotnetRedisRegex = regexp.MustCompile(`(?:cache|redis|_cache|_redis|db)\.(?:String)?(?:Get|Set|Delete|Hash)(?:Async)?\s*\(\s*"([^"]+)"`)
)

// DotNetScanner detects patterns in C# source files.
type DotNetScanner struct {
	logger *zap.Logger
}

func NewDotNetScanner(logger *zap.Logger) *DotNetScanner {
	return &DotNetScanner{logger: logger}
}

func (s *DotNetScanner) Capabilities() scanner.ScannerCapabilities {
	return scanner.ScannerCapabilities{
		Name:         "dotnet",
		Layer:        graph.SourceLayerCode,
		FilePatterns: []string{"*.cs"},
		Description:  "Detects C# HTTP routes, Kafka, gRPC, Entity Framework, and Redis patterns",
	}
}

func (s *DotNetScanner) Scan(ctx context.Context, input scanner.ScanInput) (*scanner.ScannerOutput, error) {
	output := &scanner.ScannerOutput{}

	files, err := scanner.WalkFiles(input.RepoPath, s.Capabilities().FilePatterns, input.Config)
	if err != nil {
		return nil, err
	}

	serviceName := detectDotNetServiceName(input.RepoPath)
	var serviceID uuid.UUID
	if serviceName != "" {
		serviceID = uuid.New()
		output.Nodes = append(output.Nodes, graph.GraphNode{
			ID: serviceID, Type: graph.NodeTypeService, Name: serviceName,
			Service: serviceName, Metadata: graph.JSONMap{"source": "code", "language": "csharp"},
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
		if content == "" || strings.Contains(relPath, "obj/") ||
			strings.Contains(relPath, "bin/") || strings.Contains(relPath, "Test") {
			continue
		}

		s.scanDotNetFile(content, relPath, serviceName, serviceID, output)
	}

	return output, nil
}

func (s *DotNetScanner) ScanDiff(ctx context.Context, input scanner.DiffInput) (*scanner.ScannerOutput, error) {
	return s.Scan(ctx, input.ScanInput)
}

func (s *DotNetScanner) scanDotNetFile(content, relPath, serviceName string, serviceID uuid.UUID, output *scanner.ScannerOutput) {
	// ASP.NET controller base route
	basePath := ""
	if match := aspnetRouteRegex.FindStringSubmatch(content); len(match) > 1 {
		basePath = "/" + strings.Trim(match[1], "/")
		basePath = strings.Replace(basePath, "[controller]", extractControllerName(content), 1)
	}

	// ASP.NET attribute-based routing
	if aspnetControllerRegex.MatchString(content) {
		for _, match := range aspnetAttributeRegex.FindAllStringSubmatch(content, -1) {
			method := strings.ToUpper(match[1])
			path := basePath
			if match[2] != "" {
				path = basePath + "/" + strings.TrimLeft(match[2], "/")
			}
			addDotNetEndpoint(output, method, path, relPath, serviceName, serviceID, "aspnet")
		}
	}

	// Minimal APIs
	for _, match := range minimalAPIRegex.FindAllStringSubmatch(content, -1) {
		addDotNetEndpoint(output, strings.ToUpper(match[1]), match[2], relPath, serviceName, serviceID, "minimal-api")
	}

	// Kafka producer
	for _, match := range dotnetKafkaProducerRegex.FindAllStringSubmatch(content, -1) {
		addDotNetTopicEdge(output, match[1], relPath, serviceName, serviceID, graph.EdgeTypePublishes)
	}

	// Kafka consumer
	for _, match := range dotnetKafkaConsumerRegex.FindAllStringSubmatch(content, -1) {
		addDotNetTopicEdge(output, match[1], relPath, serviceName, serviceID, graph.EdgeTypeConsumes)
	}

	// EF Core DbSet (table detection)
	for _, match := range efCoreDbSetRegex.FindAllStringSubmatch(content, -1) {
		tableName := strings.ToLower(match[2]) // property name as table
		addDotNetTableNode(output, tableName, relPath, serviceName, serviceID)
	}

	// EF Core explicit table names
	for _, match := range efCoreTableRegex.FindAllStringSubmatch(content, -1) {
		addDotNetTableNode(output, match[1], relPath, serviceName, serviceID)
	}
	for _, match := range efCoreToTableRegex.FindAllStringSubmatch(content, -1) {
		addDotNetTableNode(output, match[1], relPath, serviceName, serviceID)
	}

	// gRPC server
	for _, match := range dotnetGRPCServerRegex.FindAllStringSubmatch(content, -1) {
		methodID := uuid.New()
		output.Nodes = append(output.Nodes, graph.GraphNode{
			ID: methodID, Type: graph.NodeTypeGRPCMethod, Name: match[1],
			Service: serviceName, SourceFile: relPath,
			Metadata: graph.JSONMap{"source": "code", "language": "csharp", "role": "server"},
			Confidence: 0.85, Version: 1,
		})
		if serviceID != uuid.Nil {
			output.Edges = append(output.Edges, graph.GraphEdge{
				ID: uuid.New(), Type: graph.EdgeTypeExposes, FromNodeID: serviceID, ToNodeID: methodID, Confidence: 0.85,
			})
		}
	}

	// gRPC client
	for _, match := range dotnetGRPCClientRegex.FindAllStringSubmatch(content, -1) {
		clientID := uuid.New()
		output.Nodes = append(output.Nodes, graph.GraphNode{
			ID: clientID, Type: graph.NodeTypeGRPCMethod, Name: match[1],
			SourceFile: relPath,
			Metadata:   graph.JSONMap{"source": "code", "language": "csharp", "role": "client"},
			Confidence: 0.75, Version: 1,
		})
		if serviceID != uuid.Nil {
			output.Edges = append(output.Edges, graph.GraphEdge{
				ID: uuid.New(), Type: graph.EdgeTypeCalls, FromNodeID: serviceID, ToNodeID: clientID, Confidence: 0.75,
			})
		}
	}

	// HTTP client calls
	for _, match := range dotnetHTTPClientRegex.FindAllStringSubmatch(content, -1) {
		if patterns.IsExternalURL(match[2]) {
			addExternalCall(output, match[2], relPath, serviceName, serviceID, "csharp")
		}
	}

	// Redis
	for _, match := range dotnetRedisRegex.FindAllStringSubmatch(content, -1) {
		output.Nodes = append(output.Nodes, graph.GraphNode{
			ID: uuid.New(), Type: graph.NodeTypeRedisKeyPattern, Name: match[1],
			Service: serviceName, SourceFile: relPath,
			Metadata: graph.JSONMap{"source": "code", "language": "csharp"}, Confidence: 0.7, Version: 1,
		})
	}
}

func extractControllerName(content string) string {
	re := regexp.MustCompile(`class\s+(\w+)Controller`)
	if match := re.FindStringSubmatch(content); len(match) > 1 {
		return strings.ToLower(match[1])
	}
	return ""
}

func addDotNetEndpoint(output *scanner.ScannerOutput, method, path, relPath, serviceName string, serviceID uuid.UUID, framework string) {
	endpointID := uuid.New()
	output.Nodes = append(output.Nodes, graph.GraphNode{
		ID: endpointID, Type: graph.NodeTypeAPIEndpoint, Name: fmt.Sprintf("%s %s", method, path),
		Service: serviceName, SourceFile: relPath,
		Metadata:   graph.JSONMap{"source": "code", "language": "csharp", "framework": framework, "method": method, "path": path},
		Confidence: 0.9, Version: 1,
	})
	if serviceID != uuid.Nil {
		output.Edges = append(output.Edges, graph.GraphEdge{
			ID: uuid.New(), Type: graph.EdgeTypeExposes, FromNodeID: serviceID, ToNodeID: endpointID, Confidence: 0.9,
		})
	}
}

func addDotNetTopicEdge(output *scanner.ScannerOutput, topic, relPath, serviceName string, serviceID uuid.UUID, edgeType graph.EdgeType) {
	topicID := uuid.New()
	output.Nodes = append(output.Nodes, graph.GraphNode{
		ID: topicID, Type: graph.NodeTypeTopic, Name: topic, SourceFile: relPath,
		Metadata: graph.JSONMap{"source": "code", "language": "csharp"}, Confidence: 0.85, Version: 1,
	})
	if serviceID != uuid.Nil {
		output.Edges = append(output.Edges, graph.GraphEdge{
			ID: uuid.New(), Type: edgeType, FromNodeID: serviceID, ToNodeID: topicID, Confidence: 0.85,
		})
	}
}

func addDotNetTableNode(output *scanner.ScannerOutput, table, relPath, serviceName string, serviceID uuid.UUID) {
	tableID := uuid.New()
	output.Nodes = append(output.Nodes, graph.GraphNode{
		ID: tableID, Type: graph.NodeTypeTable, Name: table, Service: serviceName,
		SourceFile: relPath, Metadata: graph.JSONMap{"source": "code", "language": "csharp"},
		Confidence: 0.8, Version: 1,
	})
	if serviceID != uuid.Nil {
		output.Edges = append(output.Edges, graph.GraphEdge{
			ID: uuid.New(), Type: graph.EdgeTypeWrites, FromNodeID: serviceID, ToNodeID: tableID, Confidence: 0.8,
		})
	}
}

func detectDotNetServiceName(repoPath string) string {
	entries, err := os.ReadDir(repoPath)
	if err != nil {
		return ""
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".csproj") {
			return strings.TrimSuffix(e.Name(), ".csproj")
		}
	}
	return ""
}
