package mcpserver

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// DiscoveredService holds everything auto-discovered about a single service.
type DiscoveredService struct {
	Name         string
	BaseURL      string
	HealthURL    string
	OpenAPISpec  map[string]any // parsed OpenAPI/Swagger JSON, nil if not found
	Endpoints    []DiscoveredEndpoint
	DBTables     []string
	RedisKeys    []string
	KafkaTopics  []string
	Neo4jLabels  []string
	MinioBuckets []string
	GRPCMethods  []string // from .proto files
}

type DiscoveredEndpoint struct {
	Method  string
	Path    string
	Summary string
}

var openAPIProbes = []string{
	"/openapi.json",
	"/swagger.json",
	"/api-docs",
	"/v1/openapi.json",
	"/api/v1/openapi.json",
	"/swagger/v1/swagger.json",
	"/docs/openapi.json",
	"/openapi/v3/api-docs",
}

var healthProbes = []string{
	"/health",
	"/healthz",
	"/ping",
	"/status",
	"/ready",
	"/live",
}

var httpProbeClient = &http.Client{Timeout: 3 * time.Second}

var validHTTPMethods = map[string]bool{
	"GET": true, "POST": true, "PUT": true, "PATCH": true,
	"DELETE": true, "HEAD": true, "OPTIONS": true, "TRACE": true,
}

var envSubstRe = regexp.MustCompile(`^\$\{([^:}]+)(?::-([^}]*))?\}$`)

// DiscoverService probes a service URL and returns what it finds.
func DiscoverService(baseURL, name string) *DiscoveredService {
	svc := &DiscoveredService{
		Name:    name,
		BaseURL: baseURL,
	}

	// 1. Probe OpenAPI spec
	for _, path := range openAPIProbes {
		resp, err := httpProbeClient.Get(baseURL + path)
		if err != nil {
			continue
		}
		if resp.StatusCode == 200 {
			data, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
			resp.Body.Close()
			if err != nil {
				continue
			}
			var spec map[string]any
			if err := json.Unmarshal(data, &spec); err != nil {
				continue
			}
			svc.OpenAPISpec = spec
			svc.Endpoints = extractEndpointsFromOpenAPI(spec)
			break
		} else {
			resp.Body.Close()
		}
	}

	// 2. Probe health endpoint
	for _, path := range healthProbes {
		resp, err := httpProbeClient.Get(baseURL + path)
		if err != nil {
			continue
		}
		resp.Body.Close()
		if resp.StatusCode < 400 {
			svc.HealthURL = baseURL + path
			break
		}
	}

	return svc
}

func extractEndpointsFromOpenAPI(spec map[string]any) []DiscoveredEndpoint {
	var endpoints []DiscoveredEndpoint

	paths, _ := spec["paths"].(map[string]any)
	for path, methods := range paths {
		methodMap, _ := methods.(map[string]any)
		for method, opRaw := range methodMap {
			method = strings.ToUpper(method)
			if !validHTTPMethods[method] {
				continue
			}
			op, _ := opRaw.(map[string]any)
			summary, _ := op["summary"].(string)
			endpoints = append(endpoints, DiscoveredEndpoint{
				Method:  method,
				Path:    path,
				Summary: summary,
			})
		}
	}
	return endpoints
}

// DockerComposeService represents a single service in docker-compose.
type DockerComposeService struct {
	Name        string
	Image       string
	Ports       []string
	Environment map[string]string
	BuildCtx    string
}

// ParseDockerCompose reads a docker-compose file and returns service configs.
func ParseDockerCompose(composePath string) ([]DockerComposeService, error) {
	data, err := os.ReadFile(composePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read docker-compose: %w", err)
	}

	var raw struct {
		Services map[string]struct {
			Image       string    `yaml:"image"`
			Ports       []string  `yaml:"ports"`
			Environment yaml.Node `yaml:"environment"`
			Build       yaml.Node `yaml:"build"`
		} `yaml:"services"`
	}

	if err := yaml.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse docker-compose: %w", err)
	}

	var services []DockerComposeService
	for name, svc := range raw.Services {
		env := parseEnvNode(&svc.Environment)
		buildCtx := ""
		if svc.Build.Kind == yaml.ScalarNode {
			buildCtx = svc.Build.Value
		} else if svc.Build.Kind == yaml.MappingNode {
			for i := 0; i < len(svc.Build.Content)-1; i += 2 {
				if svc.Build.Content[i].Value == "context" {
					buildCtx = svc.Build.Content[i+1].Value
					break
				}
			}
		}
		services = append(services, DockerComposeService{
			Name:        name,
			Image:       svc.Image,
			Ports:       svc.Ports,
			Environment: env,
			BuildCtx:    buildCtx,
		})
	}
	return services, nil
}

// resolveEnvSubst resolves ${VAR:-default} — returns os.Getenv(VAR) if set, else default.
func resolveEnvSubst(val string) string {
	if !strings.HasPrefix(val, "${") {
		return val
	}
	// Match ${VAR:-default} or ${VAR}
	m := envSubstRe.FindStringSubmatch(val)
	if m == nil {
		return val
	}
	varName := m[1]
	defaultVal := m[2]
	if v := os.Getenv(varName); v != "" {
		return v
	}
	return defaultVal
}

// parseEnvNode handles both list (`- KEY=VALUE`) and map (`KEY: VALUE`) formats.
func parseEnvNode(node *yaml.Node) map[string]string {
	env := map[string]string{}
	if node == nil || node.Kind == 0 {
		return env
	}
	switch node.Kind {
	case yaml.SequenceNode:
		for _, item := range node.Content {
			parts := strings.SplitN(item.Value, "=", 2)
			if len(parts) == 2 {
				env[parts[0]] = resolveEnvSubst(parts[1])
			}
		}
	case yaml.MappingNode:
		for i := 0; i < len(node.Content)-1; i += 2 {
			key := node.Content[i].Value
			val := resolveEnvSubst(node.Content[i+1].Value)
			env[key] = val
		}
	}
	return env
}

// WalkProtoFiles walks a directory and returns all gRPC method names found in .proto files.
func WalkProtoFiles(dir string) []string {
	var methods []string
	// Pattern: "rpc MethodName("
	rpcRe := regexp.MustCompile(`(?m)^\s*rpc\s+(\w+)\s*\(`)
	serviceRe := regexp.MustCompile(`(?m)^\s*service\s+(\w+)\s*\{`)

	_ = filepath.Walk(dir, func(path string, fi os.FileInfo, err error) error {
		if err != nil || fi.IsDir() || !strings.HasSuffix(path, ".proto") {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}
		content := string(data)

		// Extract service name for context
		serviceName := ""
		if m := serviceRe.FindStringSubmatch(content); len(m) > 1 {
			serviceName = m[1]
		}

		for _, m := range rpcRe.FindAllStringSubmatch(content, -1) {
			if len(m) > 1 {
				if serviceName != "" {
					methods = append(methods, serviceName+"/"+m[1])
				} else {
					methods = append(methods, m[1])
				}
			}
		}
		return nil
	})
	return methods
}

// ProbePostgreSQL extracts PostgreSQL connection info from env vars.
// Returns a slice with one element: the connection string + schema, for reporting.
func ProbePostgreSQL(env map[string]string) []string {
	host := firstNonEmpty(env["DB_HOST"], env["DATABASE_HOST"], "localhost")
	port := firstNonEmpty(env["DB_PORT"], env["DATABASE_PORT"], "5432")
	user := firstNonEmpty(env["DB_USER"], env["DATABASE_USER"], "postgres")
	password := firstNonEmpty(env["DB_PASSWORD"], env["DATABASE_PASSWORD"], "")
	dbname := firstNonEmpty(env["DB_NAME"], env["DATABASE_DBNAME"], "postgres")
	schema := firstNonEmpty(env["DB_SCHEMA"], "public")
	sslmode := firstNonEmpty(env["DB_SSLMODE"], "disable")

	connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		host, port, user, password, dbname, sslmode)

	return []string{fmt.Sprintf("connection_string=%s schema=%s", connStr, schema)}
}

// ProbeKafka extracts Kafka broker addresses from env and returns them.
func ProbeKafka(env map[string]string) []string {
	brokers := firstNonEmpty(env["KAFKA_BROKERS"], env["KAFKA_BOOTSTRAP_SERVERS"], "")
	if brokers == "" {
		return nil
	}
	return strings.Split(brokers, ",")
}

// ProbeRedis extracts Redis address from env.
func ProbeRedis(env map[string]string) string {
	host := firstNonEmpty(env["REDIS_HOST"], "localhost")
	port := firstNonEmpty(env["REDIS_PORT"], "6379")
	return fmt.Sprintf("%s:%s", host, port)
}

// ProbeNeo4j extracts Neo4j connection details from env.
func ProbeNeo4j(env map[string]string) (uri, user, password string) {
	uri = firstNonEmpty(env["NEO4J_URI"], env["NEO4J_BOLT_URL"], "bolt://neo4j:7687")
	user = firstNonEmpty(env["NEO4J_USER"], env["NEO4J_USERNAME"], "neo4j")
	password = firstNonEmpty(env["NEO4J_PASSWORD"], "")
	return
}

// ProbeMinio extracts MinIO connection details from env.
func ProbeMinio(env map[string]string) (endpoint, accessKey, secretKey string) {
	endpoint = firstNonEmpty(env["MINIO_ENDPOINT"], "minio:9000")
	accessKey = firstNonEmpty(env["MINIO_ACCESS_KEY"], env["MINIO_ROOT_USER"], "minioadmin")
	secretKey = firstNonEmpty(env["MINIO_SECRET_KEY"], env["MINIO_ROOT_PASSWORD"], "minioadmin")
	return
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

// DiscoverFromDockerCompose parses a docker-compose file and produces a discovery
// report for all services including inferred infrastructure connections.
func DiscoverFromDockerCompose(composePath string) (string, error) {
	services, err := ParseDockerCompose(composePath)
	if err != nil {
		return "", err
	}

	composeDir := filepath.Dir(composePath)
	var sb strings.Builder
	sb.WriteString("# Auto-Discovery Report\n")
	sb.WriteString(fmt.Sprintf("Source: %s\n", composePath))
	sb.WriteString(fmt.Sprintf("Services found: %d\n\n", len(services)))

	for _, svc := range services {
		sb.WriteString(fmt.Sprintf("## Service: %s\n", svc.Name))

		// Extract port bindings for HTTP probing
		for _, portBinding := range svc.Ports {
			parts := strings.Split(portBinding, ":")
			if len(parts) >= 2 {
				hostPort := strings.TrimPrefix(parts[0], "${")
				// Clean up ${VAR:-port}:containerPort format
				if idx := strings.Index(hostPort, ":-"); idx != -1 {
					hostPort = hostPort[idx+2:]
					hostPort = strings.TrimSuffix(hostPort, "}")
				}
				sb.WriteString(fmt.Sprintf("  Port: %s → container %s\n", hostPort, parts[len(parts)-1]))
			}
		}

		// Walk .proto files if build context is known
		if svc.BuildCtx != "" {
			buildDir := svc.BuildCtx
			if !filepath.IsAbs(buildDir) {
				buildDir = filepath.Join(composeDir, buildDir)
			}
			methods := WalkProtoFiles(buildDir)
			if len(methods) > 0 {
				sb.WriteString(fmt.Sprintf("  gRPC methods: %s\n", strings.Join(methods, ", ")))
			}
		}

		// Infer infrastructure from env vars
		env := svc.Environment

		if brokers := ProbeKafka(env); len(brokers) > 0 {
			sb.WriteString(fmt.Sprintf("  Kafka brokers: %s\n", strings.Join(brokers, ", ")))
		}

		if _, ok := env["REDIS_HOST"]; ok {
			sb.WriteString(fmt.Sprintf("  Redis: %s\n", ProbeRedis(env)))
		}

		if _, hasDBHost := env["DB_HOST"]; hasDBHost {
			infos := ProbePostgreSQL(env)
			sb.WriteString(fmt.Sprintf("  PostgreSQL: %s\n", strings.Join(infos, " ")))
		}

		if _, hasNeo4j := env["NEO4J_URI"]; hasNeo4j {
			uri, user, _ := ProbeNeo4j(env)
			sb.WriteString(fmt.Sprintf("  Neo4j: %s (user=%s)\n", uri, user))
		}

		if _, hasMinio := env["MINIO_ENDPOINT"]; hasMinio {
			endpoint, accessKey, _ := ProbeMinio(env)
			sb.WriteString(fmt.Sprintf("  MinIO: %s (access_key=%s)\n", endpoint, accessKey))
		}

		sb.WriteString("\n")
	}

	return sb.String(), nil
}

// DiscoveryReport produces a human-readable discovery report for a service.
func DiscoveryReport(svc *DiscoveredService) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("## Service: %s\n", svc.Name))
	sb.WriteString(fmt.Sprintf("URL: %s\n", svc.BaseURL))
	if svc.HealthURL != "" {
		sb.WriteString(fmt.Sprintf("Health: %s ✅\n", svc.HealthURL))
	}

	if len(svc.Endpoints) > 0 {
		sb.WriteString(fmt.Sprintf("\n### HTTP Endpoints (%d from OpenAPI)\n", len(svc.Endpoints)))
		for _, ep := range svc.Endpoints {
			sb.WriteString(fmt.Sprintf("  %s %s", ep.Method, ep.Path))
			if ep.Summary != "" {
				sb.WriteString(fmt.Sprintf(" — %s", ep.Summary))
			}
			sb.WriteString("\n")
		}
	} else {
		sb.WriteString("\n### HTTP Endpoints\n  (no OpenAPI spec found — use analyze_service for source-based discovery)\n")
	}

	if len(svc.DBTables) > 0 {
		sb.WriteString(fmt.Sprintf("\n### DB Tables (%d)\n", len(svc.DBTables)))
		for _, t := range svc.DBTables {
			sb.WriteString(fmt.Sprintf("  %s\n", t))
		}
	}

	if len(svc.KafkaTopics) > 0 {
		sb.WriteString("\n### Kafka Topics\n")
		for _, t := range svc.KafkaTopics {
			sb.WriteString(fmt.Sprintf("  %s\n", t))
		}
	}

	if len(svc.Neo4jLabels) > 0 {
		sb.WriteString("\n### Neo4j Labels\n")
		for _, l := range svc.Neo4jLabels {
			sb.WriteString(fmt.Sprintf("  %s\n", l))
		}
	}

	if len(svc.MinioBuckets) > 0 {
		sb.WriteString("\n### MinIO Buckets\n")
		for _, b := range svc.MinioBuckets {
			sb.WriteString(fmt.Sprintf("  %s\n", b))
		}
	}

	if len(svc.GRPCMethods) > 0 {
		sb.WriteString(fmt.Sprintf("\n### gRPC Methods (%d)\n", len(svc.GRPCMethods)))
		for _, m := range svc.GRPCMethods {
			sb.WriteString(fmt.Sprintf("  %s\n", m))
		}
	}

	return sb.String()
}
