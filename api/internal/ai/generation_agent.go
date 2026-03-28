package ai

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/graph"
)

// GenerationAgent suggests or generates test flows based on graph structure.
// Uses node schemas, existing patterns, and uncovered nodes to create flows.
type GenerationAgent struct{}

func NewGenerationAgent() *GenerationAgent { return &GenerationAgent{} }

func (a *GenerationAgent) Name() string { return "generation" }

func (a *GenerationAgent) Run(ctx context.Context, ac *AgentContext, params map[string]any) (*AgentResult, error) {
	result := &AgentResult{
		AgentName:  a.Name(),
		Success:    true,
		Confidence: 0.7,
	}

	// Mode 1: Generate flows for a specific node
	nodeIDStr, _ := params["node_id"].(string)
	if nodeIDStr != "" {
		nodeID, err := uuid.Parse(nodeIDStr)
		if err != nil {
			return nil, fmt.Errorf("invalid node_id: %w", err)
		}
		return a.generateForNode(ctx, ac, nodeID, result)
	}

	// Mode 2: Generate flows for uncovered nodes
	uncovered, err := ac.GetUncoveredNodes(ctx)
	if err != nil {
		return nil, fmt.Errorf("get uncovered: %w", err)
	}

	// Prioritize: API endpoints first, then services, then others
	prioritized := prioritizeNodes(uncovered)

	for _, node := range prioritized {
		nodeID := node.ID
		result.Actions = append(result.Actions, Action{
			Type:        "generate_flow",
			Description: fmt.Sprintf("Generate test flow for %s", FormatNodeRef(node)),
			Status:      "suggested",
			Metadata: map[string]any{
				"node_id":   nodeID.String(),
				"node_type": string(node.Type),
				"node_name": node.Name,
				"service":   node.Service,
			},
		})
	}

	result.Summary = fmt.Sprintf("Generation: %d flow suggestions for uncovered nodes", len(result.Actions))
	return result, nil
}

func (a *GenerationAgent) generateForNode(ctx context.Context, ac *AgentContext, nodeID uuid.UUID, result *AgentResult) (*AgentResult, error) {
	node, err := ac.Engine.GetNode(ctx, nodeID)
	if err != nil {
		return nil, fmt.Errorf("get node: %w", err)
	}

	// Get the node's context: dependencies, dependents, service endpoints
	deps, _ := ac.GetServiceDependencies(ctx, nodeID)
	dependents, _ := ac.Engine.GetDependents(ctx, nodeID, 1)

	// Build generation context
	genContext := map[string]any{
		"node":       FormatNodeRef(*node),
		"node_type":  string(node.Type),
		"metadata":   node.Metadata,
		"source_file": node.SourceFile,
	}

	if deps != nil {
		depNames := make([]string, 0, len(deps.Nodes))
		for _, d := range deps.Nodes {
			depNames = append(depNames, FormatNodeRef(d))
		}
		genContext["dependencies"] = depNames
	}

	if dependents != nil {
		depNames := make([]string, 0, len(dependents.Nodes))
		for _, d := range dependents.Nodes {
			depNames = append(depNames, FormatNodeRef(d))
		}
		genContext["dependents"] = depNames
	}

	// Find existing flows that test similar nodes for pattern reference
	existingPatterns, _ := ac.FindNodesByName(ctx, node.Name, 5)
	if len(existingPatterns) > 0 {
		genContext["similar_nodes"] = len(existingPatterns)
	}

	depCount := 0
	if deps != nil {
		depCount = len(deps.Nodes)
	}

	result.Actions = append(result.Actions, Action{
		Type:        "generate_flow",
		Description: fmt.Sprintf("Generate test flow for %s with %d dependencies", FormatNodeRef(*node), depCount),
		Status:      "suggested",
		Metadata:    genContext,
	})

	result.Summary = fmt.Sprintf("Generation context prepared for %s", FormatNodeRef(*node))
	return result, nil
}

func prioritizeNodes(nodes []graph.GraphNode) []graph.GraphNode {
	var endpoints, services, others []graph.GraphNode

	for _, node := range nodes {
		switch node.Type {
		case graph.NodeTypeAPIEndpoint:
			endpoints = append(endpoints, node)
		case graph.NodeTypeService:
			services = append(services, node)
		default:
			others = append(others, node)
		}
	}

	result := make([]graph.GraphNode, 0, len(nodes))
	result = append(result, endpoints...)
	result = append(result, services...)
	result = append(result, others...)
	return result
}
