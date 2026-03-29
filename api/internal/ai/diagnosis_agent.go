package ai

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

// DiagnosisAgent performs deep analysis on failing nodes by tracing
// the full dependency path and correlating with recent changes from the history layer.
type DiagnosisAgent struct{}

func NewDiagnosisAgent() *DiagnosisAgent { return &DiagnosisAgent{} }

func (a *DiagnosisAgent) Name() string { return "diagnosis" }

func (a *DiagnosisAgent) Run(ctx context.Context, ac *AgentContext, params map[string]any) (*AgentResult, error) {
	result := &AgentResult{
		AgentName:  a.Name(),
		Success:    true,
		Confidence: 0.8,
	}

	nodeIDStr, _ := params["node_id"].(string)
	if nodeIDStr == "" {
		result.Summary = "No node specified for diagnosis"
		result.Confidence = 0.3
		return result, nil
	}

	nodeID, err := uuid.Parse(nodeIDStr)
	if err != nil {
		return nil, fmt.Errorf("invalid node_id: %w", err)
	}

	node, err := ac.Engine.GetNode(ctx, nodeID)
	if err != nil {
		return nil, fmt.Errorf("get node: %w", err)
	}

	// Trace full dependency path (2 hops)
	deps, _ := ac.Engine.GetDependencies(ctx, nodeID, 2)
	if deps != nil {
		result.Findings = append(result.Findings, Finding{
			Type:     "dependency_tree",
			Severity: "info",
			Title:    fmt.Sprintf("Dependency tree: %d nodes, %d edges", len(deps.Nodes), len(deps.Edges)),
			NodeID:   &nodeID,
			Metadata: map[string]any{
				"depth":      2,
				"node_count": len(deps.Nodes),
				"edge_count": len(deps.Edges),
			},
		})
	}

	// Check recent history for correlated changes
	snapshots, err := ac.GetRecentHistory(ctx, 5)
	if err == nil && len(snapshots) >= 2 {
		latest := snapshots[0]
		previous := snapshots[1]
		if latest.NodeHash != previous.NodeHash {
			result.Findings = append(result.Findings, Finding{
				Type:        "recent_change",
				Severity:    "warning",
				Title:       fmt.Sprintf("Graph structure changed between commits %s and %s", previous.CommitSHA[:8], latest.CommitSHA[:8]),
				Description: fmt.Sprintf("Node count: %d → %d, Edge count: %d → %d", previous.NodeCount, latest.NodeCount, previous.EdgeCount, latest.EdgeCount),
			})
		}
	}

	// Check for flows that test this node
	flowIDs, err := ac.GetFlowsForNode(ctx, nodeID)
	if err == nil {
		if len(flowIDs) == 0 {
			result.Findings = append(result.Findings, Finding{
				Type:        "no_test_coverage",
				Severity:    "critical",
				Title:       fmt.Sprintf("No flows test %s", node.Name),
				Description: "This node has no test coverage — failures may go undetected",
				NodeID:      &nodeID,
			})
		} else {
			result.Findings = append(result.Findings, Finding{
				Type:     "test_coverage",
				Severity: "info",
				Title:    fmt.Sprintf("%d flows test %s", len(flowIDs), node.Name),
				NodeID:   &nodeID,
			})
		}
	}

	// Search for similar past fixes using semantic search
	if ac.SemanticSearch != nil {
		// Use the first finding's description as the search query
		if len(result.Findings) > 0 {
			query := result.Findings[0].Description
			similar, err := ac.SemanticSearch.FindSimilarCode(ctx, ac.WorkspaceID, query, 3)
			if err == nil && len(similar) > 0 {
				for _, s := range similar {
					result.Findings = append(result.Findings, Finding{
						Type:        "past_fix",
						Severity:    "info",
						Title:       fmt.Sprintf("Similar past change: %s", s.Content[:min(80, len(s.Content))]),
						Description: "A similar code change was previously indexed",
						Metadata:    map[string]any{"commit_id": s.ID, "similarity": s.Score},
					})
				}
			}
		}
	}

	result.Summary = fmt.Sprintf("Diagnosis for %s: %d findings", FormatNodeRef(*node), len(result.Findings))
	return result, nil
}
