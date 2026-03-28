package ai

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

// WatchAgent monitors dependencies for regressions by correlating graph snapshots
// with deployment history. Detects structural drift and newly broken paths.
type WatchAgent struct{}

func NewWatchAgent() *WatchAgent { return &WatchAgent{} }

func (a *WatchAgent) Name() string { return "watch" }

func (a *WatchAgent) Run(ctx context.Context, ac *AgentContext, params map[string]any) (*AgentResult, error) {
	result := &AgentResult{
		AgentName:  a.Name(),
		Success:    true,
		Confidence: 0.8,
	}

	// Get recent snapshots to detect changes
	snapshots, err := ac.GetRecentHistory(ctx, 10)
	if err != nil {
		return nil, fmt.Errorf("get history: %w", err)
	}

	if len(snapshots) < 2 {
		result.Summary = "Watch: insufficient history for regression detection (need at least 2 snapshots)"
		result.Confidence = 0.4
		return result, nil
	}

	latest := snapshots[0]
	previous := snapshots[1]

	// Detect structural changes
	if latest.NodeHash != previous.NodeHash || latest.EdgeHash != previous.EdgeHash {
		nodesDelta := latest.NodeCount - previous.NodeCount
		edgesDelta := latest.EdgeCount - previous.EdgeCount

		severity := "info"
		if abs(nodesDelta) > 5 || abs(edgesDelta) > 10 {
			severity = "warning"
		}
		if abs(nodesDelta) > 20 || abs(edgesDelta) > 50 {
			severity = "critical"
		}

		result.Findings = append(result.Findings, Finding{
			Type:     "structural_drift",
			Severity: severity,
			Title:    fmt.Sprintf("Graph changed: %+d nodes, %+d edges since %s", nodesDelta, edgesDelta, truncSHA(previous.CommitSHA)),
			Description: fmt.Sprintf(
				"Between commits %s and %s: node count %d → %d, edge count %d → %d",
				truncSHA(previous.CommitSHA), truncSHA(latest.CommitSHA),
				previous.NodeCount, latest.NodeCount,
				previous.EdgeCount, latest.EdgeCount,
			),
			Metadata: map[string]any{
				"previous_commit": previous.CommitSHA,
				"latest_commit":   latest.CommitSHA,
				"nodes_delta":     nodesDelta,
				"edges_delta":     edgesDelta,
			},
		})
	}

	// Check for monotonically shrinking graph (potential regression indicator)
	if len(snapshots) >= 3 {
		shrinking := true
		for i := 0; i < len(snapshots)-1 && i < 4; i++ {
			if snapshots[i].NodeCount >= snapshots[i+1].NodeCount {
				shrinking = false
				break
			}
		}
		if shrinking {
			result.Findings = append(result.Findings, Finding{
				Type:        "regression_trend",
				Severity:    "critical",
				Title:       "Graph has been shrinking across recent commits",
				Description: "Nodes are being removed across consecutive commits — this may indicate a regression or accidental deletion",
			})
		}
	}

	// If a specific node_id is provided, watch its dependency neighborhood
	nodeIDStr, _ := params["node_id"].(string)
	if nodeIDStr != "" {
		nodeID, err := uuid.Parse(nodeIDStr)
		if err != nil {
			return nil, fmt.Errorf("invalid node_id: %w", err)
		}

		node, err := ac.Engine.GetNode(ctx, nodeID)
		if err != nil {
			return nil, fmt.Errorf("get node: %w", err)
		}

		// Check dependency health
		deps, _ := ac.GetServiceDependencies(ctx, nodeID)
		if deps != nil {
			for _, dep := range deps.Nodes {
				if dep.Confidence < 0.5 {
					depID := dep.ID
					result.Findings = append(result.Findings, Finding{
						Type:        "dependency_degraded",
						Severity:    "warning",
						Title:       fmt.Sprintf("Dependency %s has low confidence (%.0f%%)", dep.Name, dep.Confidence*100),
						Description: fmt.Sprintf("Watched node %s depends on %s which may be drifting", node.Name, dep.Name),
						NodeID:      &depID,
					})
				}
			}
		}

		// Check if any flows covering this node exist
		flowIDs, _ := ac.GetFlowsForNode(ctx, nodeID)
		if len(flowIDs) == 0 {
			result.Findings = append(result.Findings, Finding{
				Type:        "unmonitored_node",
				Severity:    "warning",
				Title:       fmt.Sprintf("Watched node %s has no test flows", node.Name),
				Description: "This node cannot be monitored for regressions without test flows",
				NodeID:      &nodeID,
			})
		}
	}

	result.Summary = fmt.Sprintf("Watch: %d findings across %d snapshots", len(result.Findings), len(snapshots))
	return result, nil
}

func truncSHA(sha string) string {
	if len(sha) > 8 {
		return sha[:8]
	}
	return sha
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}
