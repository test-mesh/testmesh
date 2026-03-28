package infra

import (
	"context"
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

// Scanner discovers infrastructure nodes from Docker Compose, Kubernetes, Terraform, and Helm files.
type Scanner struct {
	logger *zap.Logger
}

func New(logger *zap.Logger) *Scanner {
	return &Scanner{logger: logger}
}

func (s *Scanner) Capabilities() scanner.ScannerCapabilities {
	return scanner.ScannerCapabilities{
		Name:  "infra",
		Layer: graph.SourceLayerInfra,
		FilePatterns: []string{
			"*docker-compose*.yml",
			"*docker-compose*.yaml",
			"*Dockerfile*",
			"*.tf",
			"**/k8s/**",
			"**/kubernetes/**",
			"**/deploy/**",
			"**/helm/**",
			"**/charts/**",
			"*values*.yaml",
			"*values*.yml",
		},
		Description: "Discovers services, databases, and infrastructure from Docker Compose, Kubernetes, Terraform, and Helm files",
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
		name := filepath.Base(file)

		switch {
		case isDockerCompose(name):
			result := s.parseDockerCompose(file, relPath)
			output.Merge(result)
		case strings.HasSuffix(name, ".tf"):
			result := s.parseTerraform(file, relPath)
			output.Merge(result)
		case isKubernetesManifest(file, relPath):
			result := s.parseKubernetes(file, relPath)
			output.Merge(result)
		case isHelmValues(name, relPath):
			result := s.parseHelmValues(file, relPath)
			output.Merge(result)
		}
	}

	s.logger.Info("Infra scan complete",
		zap.Int("nodes", len(output.Nodes)),
		zap.Int("edges", len(output.Edges)),
	)

	return output, nil
}

func (s *Scanner) ScanDiff(ctx context.Context, input scanner.DiffInput) (*scanner.ScannerOutput, error) {
	// For infra files, a diff scan re-scans the full file since they're declarative
	return s.Scan(ctx, input.ScanInput)
}

// --- Docker Compose Parser ---

func (s *Scanner) parseDockerCompose(filePath, relPath string) *scanner.ScannerOutput {
	output := &scanner.ScannerOutput{}

	data, err := os.ReadFile(filePath)
	if err != nil {
		output.Warnings = append(output.Warnings, scanner.ScanWarning{
			File: relPath, Message: fmt.Sprintf("failed to read: %v", err), Level: "warn",
		})
		return output
	}

	var compose struct {
		Services map[string]struct {
			Image       string            `yaml:"image"`
			Build       any               `yaml:"build"`
			Ports       []string          `yaml:"ports"`
			DependsOn   any               `yaml:"depends_on"`
			Environment any               `yaml:"environment"`
			Volumes     []string          `yaml:"volumes"`
			Networks    any               `yaml:"networks"`
		} `yaml:"services"`
	}

	if err := yaml.Unmarshal(data, &compose); err != nil {
		output.Warnings = append(output.Warnings, scanner.ScanWarning{
			File: relPath, Message: fmt.Sprintf("invalid docker-compose: %v", err), Level: "warn",
		})
		return output
	}

	serviceNodes := make(map[string]uuid.UUID)

	for name, svc := range compose.Services {
		nodeType := classifyDockerService(name, svc.Image)
		nodeID := uuid.New()

		metadata := graph.JSONMap{
			"source": "docker-compose",
		}
		if svc.Image != "" {
			metadata["image"] = svc.Image
		}
		if len(svc.Ports) > 0 {
			metadata["ports"] = svc.Ports
		}

		// Extract environment variables
		envVars := extractEnvVars(svc.Environment)
		if len(envVars) > 0 {
			metadata["env_vars"] = envVars
		}

		node := graph.GraphNode{
			ID:         nodeID,
			Type:       nodeType,
			Name:       name,
			Service:    name,
			SourceFile: relPath,
			Metadata:   metadata,
			Confidence: 0.9,
			Version:    1,
		}
		output.Nodes = append(output.Nodes, node)
		serviceNodes[name] = nodeID

		// Create database/table nodes for known DB images
		if dbNodes := s.createDBNodes(name, svc.Image, envVars, relPath); dbNodes != nil {
			output.Merge(dbNodes)
		}
	}

	// Create depends_on edges
	for name, svc := range compose.Services {
		fromID, ok := serviceNodes[name]
		if !ok {
			continue
		}

		deps := extractDependsOn(svc.DependsOn)
		for _, dep := range deps {
			toID, ok := serviceNodes[dep]
			if !ok {
				continue
			}
			output.Edges = append(output.Edges, graph.GraphEdge{
				ID:         uuid.New(),
				Type:       graph.EdgeTypeDependsOn,
				FromNodeID: fromID,
				ToNodeID:   toID,
				Properties: graph.JSONMap{"source": "docker-compose"},
				Confidence: 1.0,
			})
		}
	}

	return output
}

// --- Kubernetes Parser ---

func (s *Scanner) parseKubernetes(filePath, relPath string) *scanner.ScannerOutput {
	output := &scanner.ScannerOutput{}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return output
	}

	// Kubernetes files can contain multiple documents
	docs := strings.Split(string(data), "\n---")
	for _, doc := range docs {
		doc = strings.TrimSpace(doc)
		if doc == "" {
			continue
		}

		var manifest struct {
			APIVersion string `yaml:"apiVersion"`
			Kind       string `yaml:"kind"`
			Metadata   struct {
				Name      string            `yaml:"name"`
				Namespace string            `yaml:"namespace"`
				Labels    map[string]string  `yaml:"labels"`
			} `yaml:"metadata"`
			Spec struct {
				Replicas *int `yaml:"replicas"`
				Template struct {
					Spec struct {
						Containers []struct {
							Name  string `yaml:"name"`
							Image string `yaml:"image"`
							Ports []struct {
								ContainerPort int    `yaml:"containerPort"`
								Protocol      string `yaml:"protocol"`
							} `yaml:"ports"`
							Env []struct {
								Name  string `yaml:"name"`
								Value string `yaml:"value"`
							} `yaml:"env"`
						} `yaml:"containers"`
					} `yaml:"spec"`
				} `yaml:"template"`
				Rules []struct {
					Host string `yaml:"host"`
					HTTP struct {
						Paths []struct {
							Path    string `yaml:"path"`
							Backend struct {
								Service struct {
									Name string `yaml:"name"`
								} `yaml:"service"`
							} `yaml:"backend"`
						} `yaml:"paths"`
					} `yaml:"http"`
				} `yaml:"rules"`
				Schedule string `yaml:"schedule"`
			} `yaml:"spec"`
		}

		if err := yaml.Unmarshal([]byte(doc), &manifest); err != nil {
			continue
		}

		switch manifest.Kind {
		case "Deployment", "StatefulSet", "DaemonSet":
			for _, container := range manifest.Spec.Template.Spec.Containers {
				nodeType := classifyDockerService(container.Name, container.Image)
				metadata := graph.JSONMap{
					"source":    "kubernetes",
					"kind":      manifest.Kind,
					"namespace": manifest.Metadata.Namespace,
					"image":     container.Image,
				}
				if manifest.Spec.Replicas != nil {
					metadata["replicas"] = *manifest.Spec.Replicas
				}

				output.Nodes = append(output.Nodes, graph.GraphNode{
					ID:         uuid.New(),
					Type:       nodeType,
					Name:       manifest.Metadata.Name,
					Service:    manifest.Metadata.Name,
					SourceFile: relPath,
					Metadata:   metadata,
					Confidence: 0.9,
					Version:    1,
				})
			}

		case "Service":
			output.Nodes = append(output.Nodes, graph.GraphNode{
				ID:         uuid.New(),
				Type:       graph.NodeTypeService,
				Name:       manifest.Metadata.Name,
				Service:    manifest.Metadata.Name,
				SourceFile: relPath,
				Metadata: graph.JSONMap{
					"source":    "kubernetes",
					"kind":      "Service",
					"namespace": manifest.Metadata.Namespace,
				},
				Confidence: 0.8,
				Version:    1,
			})

		case "Ingress":
			for _, rule := range manifest.Spec.Rules {
				for _, path := range rule.HTTP.Paths {
					output.Nodes = append(output.Nodes, graph.GraphNode{
						ID:   uuid.New(),
						Type: graph.NodeTypeAPIEndpoint,
						Name: fmt.Sprintf("%s%s", rule.Host, path.Path),
						Metadata: graph.JSONMap{
							"source":  "kubernetes",
							"kind":    "Ingress",
							"host":    rule.Host,
							"path":    path.Path,
							"backend": path.Backend.Service.Name,
						},
						SourceFile: relPath,
						Confidence: 0.8,
						Version:    1,
					})
				}
			}

		case "CronJob":
			output.Nodes = append(output.Nodes, graph.GraphNode{
				ID:      uuid.New(),
				Type:    graph.NodeTypeJob,
				Name:    manifest.Metadata.Name,
				Service: manifest.Metadata.Name,
				Metadata: graph.JSONMap{
					"source":   "kubernetes",
					"kind":     "CronJob",
					"schedule": manifest.Spec.Schedule,
				},
				SourceFile: relPath,
				Confidence: 0.9,
				Version:    1,
			})
		}
	}

	return output
}

// --- Terraform Parser ---

var (
	tfResourceRegex = regexp.MustCompile(`resource\s+"(\w+)"\s+"(\w+)"\s*\{`)
	tfModuleRegex   = regexp.MustCompile(`module\s+"(\w+)"\s*\{`)
	tfVarRefRegex   = regexp.MustCompile(`var\.(\w+)`)
)

func (s *Scanner) parseTerraform(filePath, relPath string) *scanner.ScannerOutput {
	output := &scanner.ScannerOutput{}

	content := scanner.ReadFileString(filePath)
	if content == "" {
		return output
	}

	// Extract resources
	for _, match := range tfResourceRegex.FindAllStringSubmatch(content, -1) {
		resourceType := match[1]
		resourceName := match[2]

		nodeType, nodeName := classifyTerraformResource(resourceType, resourceName)
		if nodeType == "" {
			continue
		}

		output.Nodes = append(output.Nodes, graph.GraphNode{
			ID:   uuid.New(),
			Type: nodeType,
			Name: nodeName,
			Metadata: graph.JSONMap{
				"source":         "terraform",
				"resource_type":  resourceType,
				"resource_name":  resourceName,
			},
			SourceFile: relPath,
			Confidence: 0.85,
			Version:    1,
		})
	}

	return output
}

// --- Helm Values Parser ---

func (s *Scanner) parseHelmValues(filePath, relPath string) *scanner.ScannerOutput {
	output := &scanner.ScannerOutput{}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return output
	}

	var values map[string]any
	if err := yaml.Unmarshal(data, &values); err != nil {
		return output
	}

	// Look for common Helm value patterns
	s.extractHelmServices(values, "", relPath, output)

	return output
}

func (s *Scanner) extractHelmServices(values map[string]any, prefix, relPath string, output *scanner.ScannerOutput) {
	for key, val := range values {
		fullKey := key
		if prefix != "" {
			fullKey = prefix + "." + key
		}

		switch v := val.(type) {
		case map[string]any:
			// Check if this looks like a service definition (has image, port, etc.)
			if _, hasImage := v["image"]; hasImage {
				output.Nodes = append(output.Nodes, graph.GraphNode{
					ID:      uuid.New(),
					Type:    graph.NodeTypeService,
					Name:    key,
					Service: key,
					Metadata: graph.JSONMap{
						"source":   "helm",
						"helm_key": fullKey,
					},
					SourceFile: relPath,
					Confidence: 0.7,
					Version:    1,
				})
			}
			s.extractHelmServices(v, fullKey, relPath, output)
		}
	}
}

// --- Helpers ---

func (s *Scanner) createDBNodes(serviceName, image string, envVars map[string]string, relPath string) *scanner.ScannerOutput {
	output := &scanner.ScannerOutput{}
	nodeType := classifyDockerService(serviceName, image)

	if nodeType != graph.NodeTypeDatabase {
		return nil
	}

	// Extract database name from env vars
	dbName := ""
	for _, key := range []string{"POSTGRES_DB", "MYSQL_DATABASE", "MONGO_INITDB_DATABASE"} {
		if v, ok := envVars[key]; ok {
			dbName = v
			break
		}
	}

	if dbName != "" {
		output.Nodes = append(output.Nodes, graph.GraphNode{
			ID:      uuid.New(),
			Type:    graph.NodeTypeDatabase,
			Name:    dbName,
			Service: serviceName,
			Metadata: graph.JSONMap{
				"source":  "docker-compose",
				"db_type": detectDBType(image),
			},
			SourceFile: relPath,
			Confidence: 0.9,
			Version:    1,
		})
	}

	return output
}

func classifyDockerService(name, image string) graph.NodeType {
	lower := strings.ToLower(name + " " + image)

	switch {
	case strings.Contains(lower, "postgres") || strings.Contains(lower, "mysql") ||
		strings.Contains(lower, "mariadb") || strings.Contains(lower, "mongo") ||
		strings.Contains(lower, "cockroach") || strings.Contains(lower, "timescale"):
		return graph.NodeTypeDatabase
	case strings.Contains(lower, "redis") || strings.Contains(lower, "memcache") ||
		strings.Contains(lower, "valkey"):
		return graph.NodeTypeDatabase
	case strings.Contains(lower, "kafka") || strings.Contains(lower, "rabbitmq") ||
		strings.Contains(lower, "nats") || strings.Contains(lower, "pulsar"):
		return graph.NodeTypeQueue
	case strings.Contains(lower, "zookeeper") || strings.Contains(lower, "etcd") ||
		strings.Contains(lower, "consul"):
		return graph.NodeTypeExternal
	default:
		return graph.NodeTypeService
	}
}

func classifyTerraformResource(resourceType, resourceName string) (graph.NodeType, string) {
	switch {
	// AWS
	case strings.HasPrefix(resourceType, "aws_db_instance"),
		strings.HasPrefix(resourceType, "aws_rds"),
		resourceType == "aws_elasticache_cluster",
		resourceType == "aws_elasticache_replication_group":
		return graph.NodeTypeDatabase, resourceName
	case resourceType == "aws_ecs_service",
		resourceType == "aws_ecs_task_definition",
		resourceType == "aws_lambda_function":
		return graph.NodeTypeService, resourceName
	case resourceType == "aws_sqs_queue",
		resourceType == "aws_msk_cluster",
		resourceType == "aws_sns_topic":
		return graph.NodeTypeQueue, resourceName
	case resourceType == "aws_api_gateway_rest_api",
		resourceType == "aws_apigatewayv2_api",
		resourceType == "aws_lb":
		return graph.NodeTypeAPIEndpoint, resourceName

	// GCP
	case resourceType == "google_sql_database_instance",
		resourceType == "google_redis_instance":
		return graph.NodeTypeDatabase, resourceName
	case resourceType == "google_cloud_run_service",
		resourceType == "google_cloudfunctions_function":
		return graph.NodeTypeService, resourceName
	case resourceType == "google_pubsub_topic":
		return graph.NodeTypeQueue, resourceName

	// Azure
	case strings.HasPrefix(resourceType, "azurerm_mssql"),
		strings.HasPrefix(resourceType, "azurerm_cosmosdb"),
		strings.HasPrefix(resourceType, "azurerm_redis"):
		return graph.NodeTypeDatabase, resourceName
	case resourceType == "azurerm_function_app",
		resourceType == "azurerm_container_app":
		return graph.NodeTypeService, resourceName
	case resourceType == "azurerm_servicebus_queue",
		resourceType == "azurerm_eventhub":
		return graph.NodeTypeQueue, resourceName
	}

	return "", ""
}

func detectDBType(image string) string {
	lower := strings.ToLower(image)
	switch {
	case strings.Contains(lower, "postgres") || strings.Contains(lower, "timescale"):
		return "postgresql"
	case strings.Contains(lower, "mysql") || strings.Contains(lower, "mariadb"):
		return "mysql"
	case strings.Contains(lower, "mongo"):
		return "mongodb"
	case strings.Contains(lower, "redis") || strings.Contains(lower, "valkey"):
		return "redis"
	case strings.Contains(lower, "cockroach"):
		return "cockroachdb"
	default:
		return "unknown"
	}
}

func extractDependsOn(v any) []string {
	if v == nil {
		return nil
	}

	switch d := v.(type) {
	case []any:
		deps := make([]string, 0, len(d))
		for _, item := range d {
			if s, ok := item.(string); ok {
				deps = append(deps, s)
			}
		}
		return deps
	case map[string]any:
		// depends_on as map (long form with condition)
		deps := make([]string, 0, len(d))
		for name := range d {
			deps = append(deps, name)
		}
		return deps
	}
	return nil
}

func extractEnvVars(v any) map[string]string {
	if v == nil {
		return nil
	}

	result := make(map[string]string)

	switch e := v.(type) {
	case map[string]any:
		for key, val := range e {
			result[key] = fmt.Sprintf("%v", val)
		}
	case []any:
		for _, item := range e {
			if s, ok := item.(string); ok {
				parts := strings.SplitN(s, "=", 2)
				if len(parts) == 2 {
					result[parts[0]] = parts[1]
				}
			}
		}
	}

	return result
}

func isDockerCompose(name string) bool {
	lower := strings.ToLower(name)
	return strings.Contains(lower, "docker-compose") && (strings.HasSuffix(lower, ".yml") || strings.HasSuffix(lower, ".yaml"))
}

func isKubernetesManifest(filePath, relPath string) bool {
	lower := strings.ToLower(relPath)
	if !scanner.IsYAMLFile(filePath) {
		return false
	}
	return strings.Contains(lower, "k8s") ||
		strings.Contains(lower, "kubernetes") ||
		strings.Contains(lower, "deploy/") ||
		strings.Contains(lower, "manifests/")
}

func isHelmValues(name, relPath string) bool {
	lower := strings.ToLower(name)
	return (strings.Contains(lower, "values") && scanner.IsYAMLFile(name)) ||
		strings.Contains(strings.ToLower(relPath), "helm/") ||
		strings.Contains(strings.ToLower(relPath), "charts/")
}
