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
	// Express: app.get('/path', handler) / router.post('/path', handler)
	expressRouteRegex = regexp.MustCompile(`\.(get|post|put|delete|patch|options|head|all)\s*\(\s*['"]([^'"]+)['"]`)
	// Fastify: fastify.get('/path', handler)
	fastifyRouteRegex = regexp.MustCompile(`\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]`)
	// NestJS: @Get('/path'), @Post('/path')
	nestjsDecoratorRegex = regexp.MustCompile(`@(Get|Post|Put|Delete|Patch|Options|Head)\s*\(\s*['"]([^'"]*)['"]\s*\)`)
	// NestJS: @Controller('path')
	nestjsControllerRegex = regexp.MustCompile(`@Controller\s*\(\s*['"]([^'"]*)['"]\s*\)`)
	// Next.js API routes: export default / export async function
	nextjsAPIRegex = regexp.MustCompile(`export\s+(?:default\s+)?(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)`)

	// KafkaJS: producer.send({ topic: 'name' })
	kafkajsTopicRegex    = regexp.MustCompile(`topic:\s*['"]([^'"]+)['"]`)
	kafkajsProducerRegex = regexp.MustCompile(`producer\.send`)
	kafkajsConsumerRegex = regexp.MustCompile(`consumer\.subscribe|consumer\.run`)

	// Prisma: prisma.user.findMany() / prisma.$queryRaw
	prismaModelRegex = regexp.MustCompile(`prisma\.(\w+)\.(?:findMany|findFirst|findUnique|create|update|delete|upsert|count|aggregate)`)
	// TypeORM: getRepository(User) / @Entity('users')
	typeormEntityRegex = regexp.MustCompile(`@Entity\s*\(\s*['"]([^'"]+)['"]`)
	// Sequelize: sequelize.define('User', {})
	sequelizeModelRegex = regexp.MustCompile(`\.define\s*\(\s*['"](\w+)['"]`)

	// gRPC-js: new grpc.Server() / loadPackageDefinition
	grpcJSServiceRegex = regexp.MustCompile(`addService\s*\(\s*(\w+)`)
	grpcJSClientRegex  = regexp.MustCompile(`new\s+(\w+)Client\s*\(`)

	// Redis: redis.get('key'), redis.set('key')
	ioredisRegex = regexp.MustCompile(`(?:redis|client)\.(get|set|del|hget|hset|lpush|rpush|sadd|zadd)\s*\(\s*['"]([^'"]+)['"]`)

	// fetch() / axios calls
	fetchRegex = regexp.MustCompile(`fetch\s*\(\s*['"]([^'"]+)['"]`)
	axiosRegex = regexp.MustCompile(`axios\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]`)

	// WebSocket
	wsRegex = regexp.MustCompile(`new\s+WebSocket\s*\(\s*['"]([^'"]+)['"]`)
)

// TypeScriptScanner detects patterns in TypeScript/JavaScript source files.
type TypeScriptScanner struct {
	logger *zap.Logger
}

func NewTypeScriptScanner(logger *zap.Logger) *TypeScriptScanner {
	return &TypeScriptScanner{logger: logger}
}

func (s *TypeScriptScanner) Capabilities() scanner.ScannerCapabilities {
	return scanner.ScannerCapabilities{
		Name:         "typescript",
		Layer:        graph.SourceLayerCode,
		FilePatterns: []string{"*.ts", "*.tsx", "*.js", "*.jsx", "*.mjs"},
		Description:  "Detects TypeScript/JavaScript HTTP routes, Kafka, gRPC, database, and Redis patterns",
	}
}

func (s *TypeScriptScanner) Scan(ctx context.Context, input scanner.ScanInput) (*scanner.ScannerOutput, error) {
	output := &scanner.ScannerOutput{}

	files, err := scanner.WalkFiles(input.RepoPath, s.Capabilities().FilePatterns, input.Config)
	if err != nil {
		return nil, err
	}

	serviceName := detectTSServiceName(input.RepoPath)
	var serviceID uuid.UUID
	if serviceName != "" {
		serviceID = uuid.New()
		output.Nodes = append(output.Nodes, graph.GraphNode{
			ID: serviceID, Type: graph.NodeTypeService, Name: serviceName,
			Service: serviceName, SourceFile: "package.json",
			Metadata: graph.JSONMap{"source": "code", "language": "typescript"}, Confidence: 0.9, Version: 1,
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
		if content == "" || strings.Contains(relPath, "node_modules/") ||
			strings.Contains(relPath, ".test.") || strings.Contains(relPath, ".spec.") {
			continue
		}

		s.scanTSFile(content, relPath, serviceName, serviceID, output)
	}

	return output, nil
}

func (s *TypeScriptScanner) ScanDiff(ctx context.Context, input scanner.DiffInput) (*scanner.ScannerOutput, error) {
	return s.Scan(ctx, input.ScanInput)
}

func (s *TypeScriptScanner) scanTSFile(content, relPath, serviceName string, serviceID uuid.UUID, output *scanner.ScannerOutput) {
	// Express/Fastify routes
	for _, match := range expressRouteRegex.FindAllStringSubmatch(content, -1) {
		addTSEndpoint(output, strings.ToUpper(match[1]), match[2], relPath, serviceName, serviceID, "express")
	}

	// NestJS decorators
	controllerPath := ""
	if match := nestjsControllerRegex.FindStringSubmatch(content); len(match) > 1 {
		controllerPath = "/" + strings.Trim(match[1], "/")
	}
	for _, match := range nestjsDecoratorRegex.FindAllStringSubmatch(content, -1) {
		path := controllerPath + "/" + strings.TrimLeft(match[2], "/")
		addTSEndpoint(output, strings.ToUpper(match[1]), path, relPath, serviceName, serviceID, "nestjs")
	}

	// Next.js API routes (file-based routing)
	if strings.Contains(relPath, "api/") || strings.Contains(relPath, "app/") {
		for _, match := range nextjsAPIRegex.FindAllStringSubmatch(content, -1) {
			// Derive path from file path
			path := deriveNextJSPath(relPath)
			addTSEndpoint(output, match[1], path, relPath, serviceName, serviceID, "nextjs")
		}
	}

	// KafkaJS
	if kafkajsProducerRegex.MatchString(content) {
		for _, match := range kafkajsTopicRegex.FindAllStringSubmatch(content, -1) {
			addTSTopicEdge(output, match[1], relPath, serviceName, serviceID, graph.EdgeTypePublishes)
		}
	}
	if kafkajsConsumerRegex.MatchString(content) {
		for _, match := range kafkajsTopicRegex.FindAllStringSubmatch(content, -1) {
			addTSTopicEdge(output, match[1], relPath, serviceName, serviceID, graph.EdgeTypeConsumes)
		}
	}

	// Prisma models
	for _, match := range prismaModelRegex.FindAllStringSubmatch(content, -1) {
		addTSTableNode(output, match[1], relPath, serviceName, serviceID)
	}

	// TypeORM entities
	for _, match := range typeormEntityRegex.FindAllStringSubmatch(content, -1) {
		addTSTableNode(output, match[1], relPath, serviceName, serviceID)
	}

	// Sequelize models
	for _, match := range sequelizeModelRegex.FindAllStringSubmatch(content, -1) {
		addTSTableNode(output, match[1], relPath, serviceName, serviceID)
	}

	// gRPC
	for _, match := range grpcJSServiceRegex.FindAllStringSubmatch(content, -1) {
		methodID := uuid.New()
		output.Nodes = append(output.Nodes, graph.GraphNode{
			ID: methodID, Type: graph.NodeTypeGRPCMethod, Name: match[1],
			Service: serviceName, SourceFile: relPath,
			Metadata: graph.JSONMap{"source": "code", "language": "typescript", "role": "server"},
			Confidence: 0.85, Version: 1,
		})
	}
	for _, match := range grpcJSClientRegex.FindAllStringSubmatch(content, -1) {
		clientID := uuid.New()
		output.Nodes = append(output.Nodes, graph.GraphNode{
			ID: clientID, Type: graph.NodeTypeGRPCMethod, Name: match[1],
			SourceFile: relPath,
			Metadata:   graph.JSONMap{"source": "code", "language": "typescript", "role": "client"},
			Confidence: 0.75, Version: 1,
		})
		if serviceID != uuid.Nil {
			output.Edges = append(output.Edges, graph.GraphEdge{
				ID: uuid.New(), Type: graph.EdgeTypeCalls,
				FromNodeID: serviceID, ToNodeID: clientID, Confidence: 0.75,
			})
		}
	}

	// Redis
	for _, match := range ioredisRegex.FindAllStringSubmatch(content, -1) {
		output.Nodes = append(output.Nodes, graph.GraphNode{
			ID: uuid.New(), Type: graph.NodeTypeRedisKeyPattern, Name: match[2],
			Service: serviceName, SourceFile: relPath,
			Metadata: graph.JSONMap{"source": "code", "language": "typescript"}, Confidence: 0.7, Version: 1,
		})
	}

	// External HTTP calls (fetch, axios)
	for _, match := range fetchRegex.FindAllStringSubmatch(content, -1) {
		if patterns.IsExternalURL(match[1]) {
			addExternalCall(output, match[1], relPath, serviceName, serviceID, "typescript")
		}
	}
	for _, match := range axiosRegex.FindAllStringSubmatch(content, -1) {
		if patterns.IsExternalURL(match[2]) {
			addExternalCall(output, match[2], relPath, serviceName, serviceID, "typescript")
		}
	}

	// WebSocket
	for _, match := range wsRegex.FindAllStringSubmatch(content, -1) {
		output.Nodes = append(output.Nodes, graph.GraphNode{
			ID: uuid.New(), Type: graph.NodeTypeWebSocket, Name: match[1],
			Service: serviceName, SourceFile: relPath,
			Metadata: graph.JSONMap{"source": "code", "language": "typescript"}, Confidence: 0.8, Version: 1,
		})
	}
}

func addTSEndpoint(output *scanner.ScannerOutput, method, path, relPath, serviceName string, serviceID uuid.UUID, framework string) {
	endpointID := uuid.New()
	output.Nodes = append(output.Nodes, graph.GraphNode{
		ID: endpointID, Type: graph.NodeTypeAPIEndpoint, Name: fmt.Sprintf("%s %s", method, path),
		Service: serviceName, SourceFile: relPath,
		Metadata:   graph.JSONMap{"source": "code", "language": "typescript", "framework": framework, "method": method, "path": path},
		Confidence: 0.9, Version: 1,
	})
	if serviceID != uuid.Nil {
		output.Edges = append(output.Edges, graph.GraphEdge{
			ID: uuid.New(), Type: graph.EdgeTypeExposes,
			FromNodeID: serviceID, ToNodeID: endpointID, Confidence: 0.9,
		})
	}
}

func addTSTopicEdge(output *scanner.ScannerOutput, topic, relPath, serviceName string, serviceID uuid.UUID, edgeType graph.EdgeType) {
	topicID := uuid.New()
	output.Nodes = append(output.Nodes, graph.GraphNode{
		ID: topicID, Type: graph.NodeTypeTopic, Name: topic,
		SourceFile: relPath, Metadata: graph.JSONMap{"source": "code", "language": "typescript"},
		Confidence: 0.85, Version: 1,
	})
	if serviceID != uuid.Nil {
		output.Edges = append(output.Edges, graph.GraphEdge{
			ID: uuid.New(), Type: edgeType, FromNodeID: serviceID, ToNodeID: topicID, Confidence: 0.85,
		})
	}
}

func addTSTableNode(output *scanner.ScannerOutput, table, relPath, serviceName string, serviceID uuid.UUID) {
	tableID := uuid.New()
	output.Nodes = append(output.Nodes, graph.GraphNode{
		ID: tableID, Type: graph.NodeTypeTable, Name: table, Service: serviceName,
		SourceFile: relPath, Metadata: graph.JSONMap{"source": "code", "language": "typescript"},
		Confidence: 0.8, Version: 1,
	})
	if serviceID != uuid.Nil {
		output.Edges = append(output.Edges, graph.GraphEdge{
			ID: uuid.New(), Type: graph.EdgeTypeWrites, FromNodeID: serviceID, ToNodeID: tableID, Confidence: 0.8,
		})
	}
}

func addExternalCall(output *scanner.ScannerOutput, url, relPath, serviceName string, serviceID uuid.UUID, language string) {
	externalID := uuid.New()
	output.Nodes = append(output.Nodes, graph.GraphNode{
		ID: externalID, Type: graph.NodeTypeExternal, Name: url, SourceFile: relPath,
		Metadata: graph.JSONMap{"source": "code", "language": language}, Confidence: 0.7, Version: 1,
	})
	if serviceID != uuid.Nil {
		output.Edges = append(output.Edges, graph.GraphEdge{
			ID: uuid.New(), Type: graph.EdgeTypeCalls, FromNodeID: serviceID, ToNodeID: externalID, Confidence: 0.7,
		})
	}
}

func detectTSServiceName(repoPath string) string {
	content := readFile(repoPath + "/package.json")
	if content == "" {
		return ""
	}
	nameRegex := regexp.MustCompile(`"name"\s*:\s*"([^"]+)"`)
	if match := nameRegex.FindStringSubmatch(content); len(match) > 1 {
		return match[1]
	}
	return ""
}

func deriveNextJSPath(filePath string) string {
	// Convert file path like "app/api/users/route.ts" → "/api/users"
	path := filePath
	path = strings.TrimSuffix(path, ".ts")
	path = strings.TrimSuffix(path, ".tsx")
	path = strings.TrimSuffix(path, ".js")
	path = strings.TrimSuffix(path, "/route")
	path = strings.TrimSuffix(path, "/page")

	if idx := strings.Index(path, "api/"); idx >= 0 {
		return "/" + path[idx:]
	}
	return "/" + path
}
