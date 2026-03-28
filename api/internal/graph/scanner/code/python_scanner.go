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
	// FastAPI: @app.get("/path") / @router.post("/path")
	fastapiRouteRegex = regexp.MustCompile(`@\w+\.(get|post|put|delete|patch|options|head)\s*\(\s*["']([^"']+)["']`)
	// Flask: @app.route("/path", methods=["GET"])
	flaskRouteRegex = regexp.MustCompile(`@\w+\.route\s*\(\s*["']([^"']+)["']`)
	flaskMethodRegex = regexp.MustCompile(`methods\s*=\s*\[([^\]]+)\]`)
	// Django: path('url/', view)
	djangoPathRegex = regexp.MustCompile(`path\s*\(\s*["']([^"']+)["']`)
	// Django URL patterns: url(r'^api/', include(...))
	djangoURLRegex = regexp.MustCompile(`url\s*\(\s*r?["']([^"']+)["']`)

	// Kafka Python: producer.send('topic'), consumer.subscribe(['topic'])
	pyKafkaProducerRegex = regexp.MustCompile(`(?:producer|kafka_producer)\.send\s*\(\s*["']([^"']+)["']`)
	pyKafkaConsumerRegex = regexp.MustCompile(`(?:consumer|kafka_consumer)\.subscribe\s*\(\s*\[["']([^"']+)["']`)

	// SQLAlchemy: __tablename__ = 'users'
	sqlalchemyTableRegex = regexp.MustCompile(`__tablename__\s*=\s*["']([^"']+)["']`)
	// Django model: class User(models.Model): ... class Meta: db_table = 'users'
	djangoModelRegex  = regexp.MustCompile(`class\s+(\w+)\s*\(\s*(?:models\.Model|AbstractUser)`)
	djangoDBTableRegex = regexp.MustCompile(`db_table\s*=\s*["']([^"']+)["']`)

	// gRPC Python: servicer
	pyGRPCServicerRegex = regexp.MustCompile(`class\s+(\w+Servicer)\s*\(`)
	pyGRPCStubRegex     = regexp.MustCompile(`(\w+)Stub\s*\(`)

	// Python requests: requests.get('url')
	pyRequestsRegex = regexp.MustCompile(`requests\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']`)
	// httpx: httpx.get('url')
	pyHTTPXRegex = regexp.MustCompile(`httpx\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']`)

	// Redis Python: redis.get('key'), redis.set('key', value)
	pyRedisRegex = regexp.MustCompile(`(?:redis|r|cache)\.(get|set|delete|hget|hset)\s*\(\s*["']([^"']+)["']`)
)

// PythonScanner detects patterns in Python source files.
type PythonScanner struct {
	logger *zap.Logger
}

func NewPythonScanner(logger *zap.Logger) *PythonScanner {
	return &PythonScanner{logger: logger}
}

func (s *PythonScanner) Capabilities() scanner.ScannerCapabilities {
	return scanner.ScannerCapabilities{
		Name:         "python",
		Layer:        graph.SourceLayerCode,
		FilePatterns: []string{"*.py"},
		Description:  "Detects Python HTTP routes, Kafka, gRPC, database, and Redis patterns",
	}
}

func (s *PythonScanner) Scan(ctx context.Context, input scanner.ScanInput) (*scanner.ScannerOutput, error) {
	output := &scanner.ScannerOutput{}

	files, err := scanner.WalkFiles(input.RepoPath, s.Capabilities().FilePatterns, input.Config)
	if err != nil {
		return nil, err
	}

	serviceName := detectPythonServiceName(input.RepoPath)
	var serviceID uuid.UUID
	if serviceName != "" {
		serviceID = uuid.New()
		output.Nodes = append(output.Nodes, graph.GraphNode{
			ID: serviceID, Type: graph.NodeTypeService, Name: serviceName,
			Service: serviceName, Metadata: graph.JSONMap{"source": "code", "language": "python"},
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
		if content == "" || strings.Contains(relPath, "__pycache__/") ||
			strings.Contains(relPath, "test_") || strings.Contains(relPath, "_test.py") ||
			strings.Contains(relPath, ".venv/") {
			continue
		}

		s.scanPythonFile(content, relPath, serviceName, serviceID, output)
	}

	return output, nil
}

func (s *PythonScanner) ScanDiff(ctx context.Context, input scanner.DiffInput) (*scanner.ScannerOutput, error) {
	return s.Scan(ctx, input.ScanInput)
}

func (s *PythonScanner) scanPythonFile(content, relPath, serviceName string, serviceID uuid.UUID, output *scanner.ScannerOutput) {
	// FastAPI routes
	for _, match := range fastapiRouteRegex.FindAllStringSubmatch(content, -1) {
		addPyEndpoint(output, strings.ToUpper(match[1]), match[2], relPath, serviceName, serviceID, "fastapi")
	}

	// Flask routes
	for _, match := range flaskRouteRegex.FindAllStringSubmatch(content, -1) {
		method := "GET"
		if methodMatch := flaskMethodRegex.FindStringSubmatch(content); len(methodMatch) > 1 {
			method = strings.Trim(methodMatch[1], " '\"")
		}
		addPyEndpoint(output, method, match[1], relPath, serviceName, serviceID, "flask")
	}

	// Django URL patterns
	for _, match := range djangoPathRegex.FindAllStringSubmatch(content, -1) {
		addPyEndpoint(output, "*", "/"+match[1], relPath, serviceName, serviceID, "django")
	}
	for _, match := range djangoURLRegex.FindAllStringSubmatch(content, -1) {
		path := strings.TrimLeft(match[1], "^")
		path = strings.TrimRight(path, "$")
		addPyEndpoint(output, "*", "/"+path, relPath, serviceName, serviceID, "django")
	}

	// Kafka
	for _, match := range pyKafkaProducerRegex.FindAllStringSubmatch(content, -1) {
		addPyTopicEdge(output, match[1], relPath, serviceName, serviceID, graph.EdgeTypePublishes)
	}
	for _, match := range pyKafkaConsumerRegex.FindAllStringSubmatch(content, -1) {
		addPyTopicEdge(output, match[1], relPath, serviceName, serviceID, graph.EdgeTypeConsumes)
	}

	// SQLAlchemy tables
	for _, match := range sqlalchemyTableRegex.FindAllStringSubmatch(content, -1) {
		addPyTableNode(output, match[1], relPath, serviceName, serviceID)
	}

	// Django models
	for _, match := range djangoModelRegex.FindAllStringSubmatch(content, -1) {
		tableName := strings.ToLower(match[1])
		// Check for explicit db_table
		if dbMatch := djangoDBTableRegex.FindStringSubmatch(content); len(dbMatch) > 1 {
			tableName = dbMatch[1]
		}
		addPyTableNode(output, tableName, relPath, serviceName, serviceID)
	}

	// gRPC
	for _, match := range pyGRPCServicerRegex.FindAllStringSubmatch(content, -1) {
		output.Nodes = append(output.Nodes, graph.GraphNode{
			ID: uuid.New(), Type: graph.NodeTypeGRPCMethod, Name: match[1],
			Service: serviceName, SourceFile: relPath,
			Metadata: graph.JSONMap{"source": "code", "language": "python", "role": "server"},
			Confidence: 0.85, Version: 1,
		})
	}
	for _, match := range pyGRPCStubRegex.FindAllStringSubmatch(content, -1) {
		clientID := uuid.New()
		output.Nodes = append(output.Nodes, graph.GraphNode{
			ID: clientID, Type: graph.NodeTypeGRPCMethod, Name: match[1],
			SourceFile: relPath, Metadata: graph.JSONMap{"source": "code", "language": "python", "role": "client"},
			Confidence: 0.75, Version: 1,
		})
		if serviceID != uuid.Nil {
			output.Edges = append(output.Edges, graph.GraphEdge{
				ID: uuid.New(), Type: graph.EdgeTypeCalls, FromNodeID: serviceID, ToNodeID: clientID, Confidence: 0.75,
			})
		}
	}

	// HTTP client calls
	for _, match := range pyRequestsRegex.FindAllStringSubmatch(content, -1) {
		if patterns.IsExternalURL(match[2]) {
			addExternalCall(output, match[2], relPath, serviceName, serviceID, "python")
		}
	}
	for _, match := range pyHTTPXRegex.FindAllStringSubmatch(content, -1) {
		if patterns.IsExternalURL(match[2]) {
			addExternalCall(output, match[2], relPath, serviceName, serviceID, "python")
		}
	}

	// Redis
	for _, match := range pyRedisRegex.FindAllStringSubmatch(content, -1) {
		output.Nodes = append(output.Nodes, graph.GraphNode{
			ID: uuid.New(), Type: graph.NodeTypeRedisKeyPattern, Name: match[2],
			Service: serviceName, SourceFile: relPath,
			Metadata: graph.JSONMap{"source": "code", "language": "python"}, Confidence: 0.7, Version: 1,
		})
	}
}

func addPyEndpoint(output *scanner.ScannerOutput, method, path, relPath, serviceName string, serviceID uuid.UUID, framework string) {
	endpointID := uuid.New()
	output.Nodes = append(output.Nodes, graph.GraphNode{
		ID: endpointID, Type: graph.NodeTypeAPIEndpoint, Name: fmt.Sprintf("%s %s", method, path),
		Service: serviceName, SourceFile: relPath,
		Metadata:   graph.JSONMap{"source": "code", "language": "python", "framework": framework, "method": method, "path": path},
		Confidence: 0.9, Version: 1,
	})
	if serviceID != uuid.Nil {
		output.Edges = append(output.Edges, graph.GraphEdge{
			ID: uuid.New(), Type: graph.EdgeTypeExposes, FromNodeID: serviceID, ToNodeID: endpointID, Confidence: 0.9,
		})
	}
}

func addPyTopicEdge(output *scanner.ScannerOutput, topic, relPath, serviceName string, serviceID uuid.UUID, edgeType graph.EdgeType) {
	topicID := uuid.New()
	output.Nodes = append(output.Nodes, graph.GraphNode{
		ID: topicID, Type: graph.NodeTypeTopic, Name: topic, SourceFile: relPath,
		Metadata: graph.JSONMap{"source": "code", "language": "python"}, Confidence: 0.85, Version: 1,
	})
	if serviceID != uuid.Nil {
		output.Edges = append(output.Edges, graph.GraphEdge{
			ID: uuid.New(), Type: edgeType, FromNodeID: serviceID, ToNodeID: topicID, Confidence: 0.85,
		})
	}
}

func addPyTableNode(output *scanner.ScannerOutput, table, relPath, serviceName string, serviceID uuid.UUID) {
	tableID := uuid.New()
	output.Nodes = append(output.Nodes, graph.GraphNode{
		ID: tableID, Type: graph.NodeTypeTable, Name: table, Service: serviceName,
		SourceFile: relPath, Metadata: graph.JSONMap{"source": "code", "language": "python"},
		Confidence: 0.8, Version: 1,
	})
	if serviceID != uuid.Nil {
		output.Edges = append(output.Edges, graph.GraphEdge{
			ID: uuid.New(), Type: graph.EdgeTypeWrites, FromNodeID: serviceID, ToNodeID: tableID, Confidence: 0.8,
		})
	}
}

func detectPythonServiceName(repoPath string) string {
	// Check pyproject.toml for name
	content := readFile(repoPath + "/pyproject.toml")
	if content != "" {
		nameRegex := regexp.MustCompile(`name\s*=\s*"([^"]+)"`)
		if match := nameRegex.FindStringSubmatch(content); len(match) > 1 {
			return match[1]
		}
	}
	// Check setup.py
	content = readFile(repoPath + "/setup.py")
	if content != "" {
		nameRegex := regexp.MustCompile(`name\s*=\s*["']([^"']+)["']`)
		if match := nameRegex.FindStringSubmatch(content); len(match) > 1 {
			return match[1]
		}
	}
	return ""
}
