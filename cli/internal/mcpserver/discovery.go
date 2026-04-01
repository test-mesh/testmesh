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
	re := regexp.MustCompile(`^\$\{([^:}]+)(?::-([^}]*))?\}$`)
	m := re.FindStringSubmatch(val)
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
