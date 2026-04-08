package code

import (
	"context"
	"fmt"
	"path/filepath"
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
	// Topic as argument to a publish/produce helper: .publish(ctx, "topic.name", ...)
	kafkaPublishArgRegex = regexp.MustCompile(`\.(?:publish|produce|Publish|Produce)\s*\([^,)]+,\s*"([^"]+)"`)
	// Topics in string slice literals: []string{"topic1", "topic2"}
	kafkaTopicSliceRegex  = regexp.MustCompile(`\[\]string\{([^}]+)\}`)
	kafkaQuotedStringRegex = regexp.MustCompile(`"([^"]+)"`)

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

	// Fallback URL in os.Getenv patterns:  baseURL = "http://other-service:port"
	// Catches: if baseURL == "" { baseURL = "http://user-service:5001" }
	httpFallbackURLRegex = regexp.MustCompile(`=\s*"(http://[a-z0-9][a-z0-9\-\.]*:[0-9]+)"`)

	// http.NewRequest / http.NewRequestWithContext with a dynamic URL variable
	// Catches: http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	// We detect the surrounding struct's baseURL field sourced from an env var
	httpClientStructEnvRegex = regexp.MustCompile(`os\.Getenv\s*\(\s*"([A-Z_]+_(?:SERVICE|API|SVC)_URL)")`)

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

	// Detect all Go projects — handles both single-service repos and monorepos
	// where each subdirectory has its own go.mod.
	projects := DetectProjects(input.RepoPath)
	var goProjects []DetectedProject
	for _, p := range projects {
		if p.Language == LangGo {
			goProjects = append(goProjects, p)
		}
	}

	// Partition into root vs subdir projects. If there are subdir projects,
	// skip the root scan to avoid double-scanning files.
	hasSubdirProjects := false
	for _, p := range goProjects {
		if p.Root != "." {
			hasSubdirProjects = true
			break
		}
	}

	for _, project := range goProjects {
		if project.Root == "." && hasSubdirProjects {
			// Root go.mod exists alongside subdir services — skip root to
			// avoid scanning subdir files twice.
			continue
		}

		subPath := input.RepoPath
		if project.Root != "." {
			subPath = filepath.Join(input.RepoPath, project.Root)
		}

		if err := s.scanProject(ctx, subPath, input, output); err != nil {
			return output, err
		}
	}

	// Fallback: no projects detected (e.g. partial repo) — try root as-is.
	if len(goProjects) == 0 {
		if err := s.scanProject(ctx, input.RepoPath, input, output); err != nil {
			return output, err
		}
	}

	return output, nil
}

func (s *GoScanner) scanProject(ctx context.Context, projectPath string, input scanner.ScanInput, output *scanner.ScannerOutput) error {
	files, err := scanner.WalkFiles(projectPath, s.Capabilities().FilePatterns, input.Config)
	if err != nil {
		return err
	}

	serviceName := detectGoServiceName(projectPath)
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
			return ctx.Err()
		default:
		}

		relPath := scanner.RelPath(projectPath, file)
		content := scanner.ReadFileString(file)
		if content == "" {
			continue
		}

		if strings.HasSuffix(relPath, "_test.go") || strings.Contains(relPath, "vendor/") {
			continue
		}

		s.scanGoFile(content, relPath, serviceName, serviceID, output)
	}

	return nil
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
		// Also detect topic passed as argument to helper methods: .publish(ctx, "topic.name", ...)
		for _, match := range kafkaPublishArgRegex.FindAllStringSubmatch(content, -1) {
			s.addTopicEdge(output, match[1], relPath, serviceName, serviceID, graph.EdgeTypePublishes)
		}
	}
	if saramaConsumerRegex.MatchString(content) {
		for _, match := range saramaTopicRegex.FindAllStringSubmatch(content, -1) {
			s.addTopicEdge(output, match[1], relPath, serviceName, serviceID, graph.EdgeTypeConsumes)
		}
		// Also detect topics in []string{} slice literals: []string{"topic1", "topic2"}
		for _, sliceMatch := range kafkaTopicSliceRegex.FindAllStringSubmatch(content, -1) {
			for _, strMatch := range kafkaQuotedStringRegex.FindAllStringSubmatch(sliceMatch[1], -1) {
				s.addTopicEdge(output, strMatch[1], relPath, serviceName, serviceID, graph.EdgeTypeConsumes)
			}
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

	// Detect HTTP client calls (literal URL in http.Get/Post/etc)
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

	// Detect service-to-service calls via http.Client structs with env-based URLs.
	// Pattern 1: hardcoded fallback URL — `baseURL = "http://user-service:5001"`
	// Extracts the hostname as the called service name.
	for _, match := range httpFallbackURLRegex.FindAllStringSubmatch(content, -1) {
		rawURL := match[1]
		// Extract hostname (drop scheme and port)
		host := rawURL
		if idx := strings.Index(host, "://"); idx >= 0 {
			host = host[idx+3:]
		}
		if idx := strings.LastIndex(host, ":"); idx >= 0 {
			host = host[:idx]
		}
		host = strings.TrimRight(host, "/")
		if host == "" || host == "localhost" || host == "127.0.0.1" {
			continue
		}
		targetID := uuid.New()
		output.Nodes = append(output.Nodes, graph.GraphNode{
			ID:         targetID,
			Type:       graph.NodeTypeService,
			Name:       host,
			SourceFile: relPath,
			Metadata:   graph.JSONMap{"source": "code", "language": "go", "role": "dependency", "url": rawURL},
			Confidence: 0.8,
			Version:    1,
		})
		if serviceID != uuid.Nil {
			output.Edges = append(output.Edges, graph.GraphEdge{
				ID: uuid.New(), Type: graph.EdgeTypeCalls,
				FromNodeID: serviceID, ToNodeID: targetID, Confidence: 0.8,
			})
		}
	}

	// Pattern 2: os.Getenv("OTHER_SERVICE_URL") — env var name encodes the target service.
	// e.g. "USER_SERVICE_URL" → target service "user-service"
	for _, match := range httpClientStructEnvRegex.FindAllStringSubmatch(content, -1) {
		envVar := match[1] // e.g. "USER_SERVICE_URL"
		// Strip trailing _URL/_API_URL/_SVC_URL suffix and convert to kebab-case
		name := envVar
		for _, suffix := range []string{"_SERVICE_URL", "_API_URL", "_SVC_URL", "_URL"} {
			if strings.HasSuffix(name, suffix) {
				name = strings.TrimSuffix(name, suffix)
				break
			}
		}
		name = strings.ToLower(strings.ReplaceAll(name, "_", "-"))
		if name == "" {
			continue
		}
		targetID := uuid.New()
		output.Nodes = append(output.Nodes, graph.GraphNode{
			ID:         targetID,
			Type:       graph.NodeTypeService,
			Name:       name + "-service",
			SourceFile: relPath,
			Metadata:   graph.JSONMap{"source": "code", "language": "go", "role": "dependency", "env_var": envVar},
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
