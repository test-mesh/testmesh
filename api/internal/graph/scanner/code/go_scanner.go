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

// Go framework-specific patterns
var (
	// Gin routes: router.GET("/path", handler)
	ginRouteRegex = regexp.MustCompile(`\.(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD|Any)\s*\(\s*"([^"]+)"`)
	// Echo routes: e.GET("/path", handler)
	echoRouteRegex = regexp.MustCompile(`\.(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\s*\(\s*"([^"]+)"`)
	// Chi routes: r.Get("/path", handler)
	chiRouteRegex = regexp.MustCompile(`\.(Get|Post|Put|Delete|Patch|Options|Head)\s*\(\s*"([^"]+)"`)
	// net/http: http.HandleFunc("/path", handler)
	netHTTPRegex = regexp.MustCompile(`(?:HandleFunc|Handle)\s*\(\s*"([^"]+)"`)
	// Gin group: v1 := router.Group("/api/v1")
	ginGroupRegex = regexp.MustCompile(`\.Group\s*\(\s*"([^"]+)"`)

	// Kafka Sarama: producer.SendMessage / consumer.ConsumePartition
	saramaProducerRegex = regexp.MustCompile(`(?:SendMessage|SendMessages)\s*\(`)
	saramaConsumerRegex = regexp.MustCompile(`(?:ConsumePartition|Consume)\s*\(`)
	saramaTopicRegex    = regexp.MustCompile(`(?:Topic|topic)\s*[:=]\s*"([^"]+)"`)

	// GORM: db.Table("name") or TableName()
	gormTableRegex = regexp.MustCompile(`\.Table\s*\(\s*"([^"]+)"`)
	gormModelRegex = regexp.MustCompile(`func\s+\(\w+\s+\w+\)\s+TableName\s*\(\)\s*string\s*\{\s*return\s+"([^"]+)"`)

	// gRPC
	grpcServerRegex  = regexp.MustCompile(`Register(\w+)Server\s*\(`)
	grpcClientRegex  = regexp.MustCompile(`New(\w+)Client\s*\(`)
	grpcServiceRegex = regexp.MustCompile(`pb\.Register(\w+)Server`)

	// Redis
	goRedisRegex = regexp.MustCompile(`\.(Get|Set|Del|HGet|HSet|LPush|RPush|SAdd|ZAdd)\s*\(`)

	// http.Get/Post/etc client calls
	httpClientRegex = regexp.MustCompile(`http\.(Get|Post|Head|PostForm)\s*\(\s*"?([^",\s]+)`)

	// Service detection: func main()
	goMainRegex    = regexp.MustCompile(`func\s+main\s*\(\s*\)`)
	goPackageRegex = regexp.MustCompile(`package\s+(\w+)`)
)

// GoScanner detects patterns in Go source files.
type GoScanner struct {
	logger *zap.Logger
}

func NewGoScanner(logger *zap.Logger) *GoScanner {
	return &GoScanner{logger: logger}
}

func (s *GoScanner) Capabilities() scanner.ScannerCapabilities {
	return scanner.ScannerCapabilities{
		Name:         "go",
		Layer:        graph.SourceLayerCode,
		FilePatterns: []string{"*.go"},
		Description:  "Detects Go HTTP routes, Kafka, gRPC, database, and Redis patterns",
	}
}

func (s *GoScanner) Scan(ctx context.Context, input scanner.ScanInput) (*scanner.ScannerOutput, error) {
	output := &scanner.ScannerOutput{}

	files, err := scanner.WalkFiles(input.RepoPath, s.Capabilities().FilePatterns, input.Config)
	if err != nil {
		return nil, err
	}

	// First pass: detect service metadata
	serviceName := detectGoServiceName(input.RepoPath)
	var serviceID uuid.UUID
	if serviceName != "" {
		serviceID = uuid.New()
		output.Nodes = append(output.Nodes, graph.GraphNode{
			ID:         serviceID,
			Type:       graph.NodeTypeService,
			Name:       serviceName,
			Service:    serviceName,
			SourceFile: "go.mod",
			Metadata:   graph.JSONMap{"source": "code", "language": "go"},
			Confidence: 0.9,
			Version:    1,
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
		if content == "" {
			continue
		}

		// Skip test files and vendor
		if strings.HasSuffix(relPath, "_test.go") || strings.Contains(relPath, "vendor/") {
			continue
		}

		s.scanGoFile(content, relPath, serviceName, serviceID, output)
	}

	return output, nil
}

func (s *GoScanner) ScanDiff(ctx context.Context, input scanner.DiffInput) (*scanner.ScannerOutput, error) {
	return s.Scan(ctx, input.ScanInput)
}

func (s *GoScanner) scanGoFile(content, relPath, serviceName string, serviceID uuid.UUID, output *scanner.ScannerOutput) {
	// Detect HTTP routes (Gin, Echo, Chi, net/http)
	for _, match := range ginRouteRegex.FindAllStringSubmatch(content, -1) {
		s.addEndpoint(output, match[1], match[2], relPath, serviceName, serviceID, "gin")
	}
	for _, match := range chiRouteRegex.FindAllStringSubmatch(content, -1) {
		s.addEndpoint(output, strings.ToUpper(match[1]), match[2], relPath, serviceName, serviceID, "chi")
	}
	for _, match := range netHTTPRegex.FindAllStringSubmatch(content, -1) {
		s.addEndpoint(output, "*", match[1], relPath, serviceName, serviceID, "net/http")
	}

	// Detect Kafka producers/consumers
	if saramaProducerRegex.MatchString(content) {
		for _, match := range saramaTopicRegex.FindAllStringSubmatch(content, -1) {
			s.addTopicEdge(output, match[1], relPath, serviceName, serviceID, graph.EdgeTypePublishes)
		}
	}
	if saramaConsumerRegex.MatchString(content) {
		for _, match := range saramaTopicRegex.FindAllStringSubmatch(content, -1) {
			s.addTopicEdge(output, match[1], relPath, serviceName, serviceID, graph.EdgeTypeConsumes)
		}
	}

	// Detect GORM table names
	for _, match := range gormModelRegex.FindAllStringSubmatch(content, -1) {
		s.addTableNode(output, match[1], relPath, serviceName, serviceID)
	}
	for _, match := range gormTableRegex.FindAllStringSubmatch(content, -1) {
		s.addTableNode(output, match[1], relPath, serviceName, serviceID)
	}

	// Detect gRPC servers
	for _, match := range grpcServerRegex.FindAllStringSubmatch(content, -1) {
		methodName := match[1]
		methodID := uuid.New()
		output.Nodes = append(output.Nodes, graph.GraphNode{
			ID:         methodID,
			Type:       graph.NodeTypeGRPCMethod,
			Name:       methodName,
			Service:    serviceName,
			SourceFile: relPath,
			Metadata:   graph.JSONMap{"source": "code", "language": "go", "role": "server"},
			Confidence: 0.85,
			Version:    1,
		})
		if serviceID != uuid.Nil {
			output.Edges = append(output.Edges, graph.GraphEdge{
				ID: uuid.New(), Type: graph.EdgeTypeExposes,
				FromNodeID: serviceID, ToNodeID: methodID, Confidence: 0.85,
			})
		}
	}

	// Detect gRPC clients (outgoing calls)
	for _, match := range grpcClientRegex.FindAllStringSubmatch(content, -1) {
		targetService := match[1]
		targetID := uuid.New()
		output.Nodes = append(output.Nodes, graph.GraphNode{
			ID:         targetID,
			Type:       graph.NodeTypeGRPCMethod,
			Name:       targetService,
			SourceFile: relPath,
			Metadata:   graph.JSONMap{"source": "code", "language": "go", "role": "client"},
			Confidence: 0.75,
			Version:    1,
		})
		if serviceID != uuid.Nil {
			output.Edges = append(output.Edges, graph.GraphEdge{
				ID: uuid.New(), Type: graph.EdgeTypeCalls,
				FromNodeID: serviceID, ToNodeID: targetID, Confidence: 0.75,
			})
		}
	}

	// Detect Redis operations
	if goRedisRegex.MatchString(content) {
		// Look for key patterns
		keyRegex := regexp.MustCompile(`(?:Get|Set|Del|HGet|HSet)\s*\([^,]*,\s*"([^"]+)"`)
		for _, match := range keyRegex.FindAllStringSubmatch(content, -1) {
			output.Nodes = append(output.Nodes, graph.GraphNode{
				ID:         uuid.New(),
				Type:       graph.NodeTypeRedisKeyPattern,
				Name:       match[1],
				Service:    serviceName,
				SourceFile: relPath,
				Metadata:   graph.JSONMap{"source": "code", "language": "go"},
				Confidence: 0.7,
				Version:    1,
			})
		}
	}

	// Detect HTTP client calls
	for _, match := range httpClientRegex.FindAllStringSubmatch(content, -1) {
		url := match[2]
		if strings.HasPrefix(url, "http") && patterns.IsExternalURL(url) {
			externalID := uuid.New()
			output.Nodes = append(output.Nodes, graph.GraphNode{
				ID:         externalID,
				Type:       graph.NodeTypeExternal,
				Name:       url,
				SourceFile: relPath,
				Metadata:   graph.JSONMap{"source": "code", "language": "go"},
				Confidence: 0.7,
				Version:    1,
			})
			if serviceID != uuid.Nil {
				output.Edges = append(output.Edges, graph.GraphEdge{
					ID: uuid.New(), Type: graph.EdgeTypeCalls,
					FromNodeID: serviceID, ToNodeID: externalID, Confidence: 0.7,
				})
			}
		}
	}

	// Fallback: detect SQL tables from raw queries
	for _, match := range patterns.SQLTableRef.FindAllStringSubmatch(content, -1) {
		table := match[1]
		if !strings.Contains(table, "(") && !strings.HasPrefix(table, "--") {
			s.addTableNode(output, table, relPath, serviceName, serviceID)
		}
	}
}

func (s *GoScanner) addEndpoint(output *scanner.ScannerOutput, method, path, relPath, serviceName string, serviceID uuid.UUID, framework string) {
	endpointID := uuid.New()
	name := fmt.Sprintf("%s %s", method, path)

	output.Nodes = append(output.Nodes, graph.GraphNode{
		ID:         endpointID,
		Type:       graph.NodeTypeAPIEndpoint,
		Name:       name,
		Service:    serviceName,
		SourceFile: relPath,
		Metadata:   graph.JSONMap{"source": "code", "language": "go", "framework": framework, "method": method, "path": path},
		Confidence: 0.9,
		Version:    1,
	})

	if serviceID != uuid.Nil {
		output.Edges = append(output.Edges, graph.GraphEdge{
			ID: uuid.New(), Type: graph.EdgeTypeExposes,
			FromNodeID: serviceID, ToNodeID: endpointID,
			Properties: graph.JSONMap{"method": method, "path": path},
			Confidence: 0.9,
		})
	}
}

func (s *GoScanner) addTopicEdge(output *scanner.ScannerOutput, topic, relPath, serviceName string, serviceID uuid.UUID, edgeType graph.EdgeType) {
	topicID := uuid.New()
	output.Nodes = append(output.Nodes, graph.GraphNode{
		ID:         topicID,
		Type:       graph.NodeTypeTopic,
		Name:       topic,
		SourceFile: relPath,
		Metadata:   graph.JSONMap{"source": "code", "language": "go"},
		Confidence: 0.85,
		Version:    1,
	})
	if serviceID != uuid.Nil {
		output.Edges = append(output.Edges, graph.GraphEdge{
			ID: uuid.New(), Type: edgeType,
			FromNodeID: serviceID, ToNodeID: topicID, Confidence: 0.85,
		})
	}
}

func (s *GoScanner) addTableNode(output *scanner.ScannerOutput, table, relPath, serviceName string, serviceID uuid.UUID) {
	tableID := uuid.New()
	output.Nodes = append(output.Nodes, graph.GraphNode{
		ID:         tableID,
		Type:       graph.NodeTypeTable,
		Name:       table,
		Service:    serviceName,
		SourceFile: relPath,
		Metadata:   graph.JSONMap{"source": "code", "language": "go"},
		Confidence: 0.8,
		Version:    1,
	})
	if serviceID != uuid.Nil {
		output.Edges = append(output.Edges, graph.GraphEdge{
			ID: uuid.New(), Type: graph.EdgeTypeWrites,
			FromNodeID: serviceID, ToNodeID: tableID, Confidence: 0.8,
		})
	}
}

func detectGoServiceName(repoPath string) string {
	modContent := readFile(repoPath + "/go.mod")
	if modContent == "" {
		return ""
	}
	// Extract module name
	lines := strings.Split(modContent, "\n")
	for _, line := range lines {
		if strings.HasPrefix(line, "module ") {
			modulePath := strings.TrimPrefix(line, "module ")
			modulePath = strings.TrimSpace(modulePath)
			parts := strings.Split(modulePath, "/")
			return parts[len(parts)-1]
		}
	}
	return ""
}
