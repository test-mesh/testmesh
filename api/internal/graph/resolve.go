package graph

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

// GraphResolver resolves graph references in flow step configs to concrete values.
// It handles the `service:` and `endpoint:` config keys that reference graph nodes.
type GraphResolver struct {
	engine Engine
	logger *zap.Logger
}

// NewGraphResolver creates a graph resolver.
func NewGraphResolver(engine Engine, logger *zap.Logger) *GraphResolver {
	return &GraphResolver{
		engine: engine,
		logger: logger,
	}
}

// ResolveStep processes a step config and replaces graph references with concrete values.
// Returns the resolved config. The original config is not modified.
//
// Resolution precedence:
//  1. Explicit env var ({{ORDER_SERVICE_URL}}) — handled by executor, not us
//  2. Environment-scoped graph resolution — graph knows staging vs prod
//  3. Infra-layer default (Docker/K8s service name) — fallback
//  4. Error with helpful message — nothing found
func (r *GraphResolver) ResolveStep(ctx context.Context, workspaceID uuid.UUID, config map[string]any, environment string) (map[string]any, error) {
	if config == nil {
		return config, nil
	}

	resolved := copyMap(config)

	// Check for graph-aware `service` key
	serviceName, hasService := resolved["service"].(string)
	endpointRef, hasEndpoint := resolved["endpoint"].(string)

	if !hasService && !hasEndpoint {
		return resolved, nil // No graph references
	}

	// Resolve service → URL
	if hasService {
		url, err := r.resolveServiceURL(ctx, workspaceID, serviceName, environment)
		if err != nil {
			return nil, fmt.Errorf("graph resolution failed for service %q: %w", serviceName, err)
		}

		// If endpoint is also specified, build the full URL
		if hasEndpoint {
			method, path := parseEndpointRef(endpointRef)
			if method != "" {
				resolved["method"] = method
			}
			resolved["url"] = url + path
		} else {
			// Just set base URL — the url key from existing config takes precedence
			if _, hasURL := resolved["url"]; !hasURL {
				resolved["url"] = url
			}
		}

		// Remove the graph-specific keys — action handlers don't know about them
		delete(resolved, "service")
		delete(resolved, "endpoint")
	}

	return resolved, nil
}

// ValidateGraphRequirements checks that all required graph nodes exist before running a flow.
// Called when flow has a `graph.require` section.
func (r *GraphResolver) ValidateGraphRequirements(ctx context.Context, workspaceID uuid.UUID, requirements []map[string]string) error {
	for _, req := range requirements {
		if serviceName, ok := req["service"]; ok {
			nodes, _, err := r.engine.FindNodes(ctx, NodeFilter{
				WorkspaceID: workspaceID,
				Types:       []NodeType{NodeTypeService},
				Search:      serviceName,
				Limit:       1,
			})
			if err != nil || len(nodes) == 0 {
				return fmt.Errorf("required service %q not found in graph", serviceName)
			}
		}

		if topicName, ok := req["topic"]; ok {
			nodes, _, err := r.engine.FindNodes(ctx, NodeFilter{
				WorkspaceID: workspaceID,
				Types:       []NodeType{NodeTypeTopic},
				Search:      topicName,
				Limit:       1,
			})
			if err != nil || len(nodes) == 0 {
				return fmt.Errorf("required topic %q not found in graph", topicName)
			}
		}

		if dbName, ok := req["database"]; ok {
			nodes, _, err := r.engine.FindNodes(ctx, NodeFilter{
				WorkspaceID: workspaceID,
				Types:       []NodeType{NodeTypeDatabase},
				Search:      dbName,
				Limit:       1,
			})
			if err != nil || len(nodes) == 0 {
				return fmt.Errorf("required database %q not found in graph", dbName)
			}
		}
	}
	return nil
}

// resolveServiceURL finds the URL for a service by searching the graph.
func (r *GraphResolver) resolveServiceURL(ctx context.Context, workspaceID uuid.UUID, serviceName, environment string) (string, error) {
	// Search for service nodes matching the name
	nodes, _, err := r.engine.FindNodes(ctx, NodeFilter{
		WorkspaceID: workspaceID,
		Types:       []NodeType{NodeTypeService},
		Search:      serviceName,
		Limit:       10,
	})
	if err != nil {
		return "", fmt.Errorf("search failed: %w", err)
	}

	if len(nodes) == 0 {
		return "", fmt.Errorf("service %q not found in graph — run a scan first", serviceName)
	}

	// Find the best match
	var bestNode *GraphNode
	for i := range nodes {
		node := &nodes[i]
		// Exact name match takes priority
		if strings.EqualFold(node.Name, serviceName) || strings.EqualFold(node.Service, serviceName) {
			bestNode = node
			break
		}
	}

	if bestNode == nil {
		bestNode = &nodes[0] // Use first result
	}

	// Extract URL from metadata
	// Priority: environment-specific → metadata.url → metadata.ports → infra defaults
	if bestNode.Metadata != nil {
		// Check for environment-specific URLs
		if environment != "" {
			if envURLs, ok := bestNode.Metadata["urls"].(map[string]any); ok {
				if url, ok := envURLs[environment].(string); ok {
					return url, nil
				}
			}
		}

		// Check for a direct URL
		if url, ok := bestNode.Metadata["url"].(string); ok {
			return url, nil
		}

		// Build URL from ports
		if ports, ok := bestNode.Metadata["ports"].([]any); ok && len(ports) > 0 {
			port := fmt.Sprintf("%v", ports[0])
			// Extract host port from "host:container" format
			if parts := strings.Split(port, ":"); len(parts) >= 1 {
				hostPort := parts[0]
				return fmt.Sprintf("http://%s:%s", bestNode.Name, hostPort), nil
			}
		}
	}

	// Default: use service name as hostname (Docker networking)
	return fmt.Sprintf("http://%s", bestNode.Name), nil
}

// parseEndpointRef parses "POST /api/v1/orders" into method and path.
func parseEndpointRef(ref string) (method, path string) {
	parts := strings.SplitN(strings.TrimSpace(ref), " ", 2)
	if len(parts) == 2 {
		return strings.ToUpper(parts[0]), parts[1]
	}
	// No method specified — just a path
	if strings.HasPrefix(parts[0], "/") {
		return "", parts[0]
	}
	return "", "/" + parts[0]
}

func copyMap(m map[string]any) map[string]any {
	result := make(map[string]any, len(m))
	for k, v := range m {
		result[k] = v
	}
	return result
}
