package ai

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/graph"
	"github.com/test-mesh/testmesh/internal/graph/cloud"
	"go.uber.org/zap"
)

// AgentContext provides graph access and shared utilities for all cloud AI agents.
// Every agent receives an AgentContext and uses it to query/update the system graph.
type AgentContext struct {
	Engine         graph.Engine
	RuntimeScanner *cloud.RuntimeScanner
	HistoryScanner *cloud.HistoryScanner
	WorkspaceID    uuid.UUID
	Logger         *zap.Logger
	Providers      *ProviderManager  // workspace-resolved AI providers (nil if not configured)
	SemanticSearch *SemanticSearch   // semantic vector search (nil if embeddings not configured)
}

// NewAgentContext creates an agent context for a workspace.
func NewAgentContext(engine graph.Engine, runtime *cloud.RuntimeScanner, history *cloud.HistoryScanner, workspaceID uuid.UUID, logger *zap.Logger, opts ...AgentContextOption) *AgentContext {
	ac := &AgentContext{
		Engine:         engine,
		RuntimeScanner: runtime,
		HistoryScanner: history,
		WorkspaceID:    workspaceID,
		Logger:         logger,
	}
	for _, opt := range opts {
		opt(ac)
	}
	return ac
}

// AgentContextOption configures optional AgentContext fields
type AgentContextOption func(*AgentContext)

// WithProviders sets the AI provider manager on the context
func WithProviders(pm *ProviderManager) AgentContextOption {
	return func(ac *AgentContext) { ac.Providers = pm }
}

// WithSemanticSearch sets the semantic search engine on the context
func WithSemanticSearch(ss *SemanticSearch) AgentContextOption {
	return func(ac *AgentContext) { ac.SemanticSearch = ss }
}

// GetServiceDependencies returns all dependencies of a service node (1-hop).
func (ac *AgentContext) GetServiceDependencies(ctx context.Context, serviceID uuid.UUID) (*graph.Subgraph, error) {
	return ac.Engine.GetDependencies(ctx, serviceID, 1)
}

// GetServiceDependents returns all nodes that depend on a service (1-hop).
func (ac *AgentContext) GetServiceDependents(ctx context.Context, serviceID uuid.UUID) (*graph.Subgraph, error) {
	return ac.Engine.GetDependents(ctx, serviceID, 1)
}

// GetAllServices returns all service nodes in the workspace.
func (ac *AgentContext) GetAllServices(ctx context.Context) ([]graph.GraphNode, error) {
	nodes, _, err := ac.Engine.FindNodes(ctx, graph.NodeFilter{
		WorkspaceID: ac.WorkspaceID,
		Types:       []graph.NodeType{graph.NodeTypeService},
		Limit:       1000,
	})
	return nodes, err
}

// GetUncoveredNodes returns nodes not linked to any flow via tested_by edges.
func (ac *AgentContext) GetUncoveredNodes(ctx context.Context) ([]graph.GraphNode, error) {
	return ac.Engine.GetUncoveredNodes(ctx, ac.WorkspaceID)
}

// GetGraphStats returns summary statistics for the workspace graph.
func (ac *AgentContext) GetGraphStats(ctx context.Context) (*graph.GraphStats, error) {
	return ac.Engine.GetGraphStats(ctx, ac.WorkspaceID)
}

// GetContracts returns all inferred contracts.
func (ac *AgentContext) GetContracts(ctx context.Context) ([]graph.Contract, error) {
	return ac.Engine.GetContracts(ctx, ac.WorkspaceID)
}

// FindNodesByName searches for nodes matching a name.
func (ac *AgentContext) FindNodesByName(ctx context.Context, query string, limit int) ([]graph.GraphNode, error) {
	nodes, _, err := ac.Engine.FindNodes(ctx, graph.NodeFilter{
		WorkspaceID: ac.WorkspaceID,
		Search:      query,
		Limit:       limit,
	})
	return nodes, err
}

// GetImpact calculates the blast radius of changed nodes.
func (ac *AgentContext) GetImpact(ctx context.Context, nodeIDs []uuid.UUID) (*graph.ImpactReport, error) {
	return ac.Engine.GetImpact(ctx, nodeIDs)
}

// GetSystemFlows discovers end-to-end paths from an entry point.
func (ac *AgentContext) GetSystemFlows(ctx context.Context, entryID uuid.UUID) ([]graph.SystemFlow, error) {
	return ac.Engine.GetSystemFlows(ctx, entryID)
}

// GetFlowsForNode returns flow IDs that test a given node.
func (ac *AgentContext) GetFlowsForNode(ctx context.Context, nodeID uuid.UUID) ([]uuid.UUID, error) {
	return ac.Engine.GetFlowsForNode(ctx, nodeID)
}

// GetRecentHistory returns recent graph snapshots for deployment correlation.
func (ac *AgentContext) GetRecentHistory(ctx context.Context, limit int) ([]cloud.GraphSnapshot, error) {
	return ac.HistoryScanner.GetHistory(ctx, ac.WorkspaceID, limit)
}

// AgentResult is the standard return type for agent invocations.
type AgentResult struct {
	AgentName    string         `json:"agent_name"`
	Success      bool           `json:"success"`
	Summary      string         `json:"summary"`
	Findings     []Finding      `json:"findings,omitempty"`
	Actions      []Action       `json:"actions,omitempty"`
	Confidence   float64        `json:"confidence"`
	Error        string         `json:"error,omitempty"`
}

// Finding is a single insight discovered by an agent.
type Finding struct {
	Type        string         `json:"type"`
	Severity    string         `json:"severity"` // info, warning, critical
	Title       string         `json:"title"`
	Description string         `json:"description"`
	NodeID      *uuid.UUID     `json:"node_id,omitempty"`
	Metadata    map[string]any `json:"metadata,omitempty"`
}

// Action is a recommended or taken action.
type Action struct {
	Type        string         `json:"type"`
	Description string         `json:"description"`
	Status      string         `json:"status"` // suggested, applied, failed
	Metadata    map[string]any `json:"metadata,omitempty"`
}

// Agent is the interface all cloud AI agents implement.
type Agent interface {
	Name() string
	Run(ctx context.Context, ac *AgentContext, params map[string]any) (*AgentResult, error)
}

// FormatNodeRef returns a human-readable reference to a node for agent output.
func FormatNodeRef(node graph.GraphNode) string {
	if node.Service != "" {
		return fmt.Sprintf("%s (%s, service: %s)", node.Name, node.Type, node.Service)
	}
	return fmt.Sprintf("%s (%s)", node.Name, node.Type)
}
