package ai

import (
	"context"
	"fmt"
)

// CoverageAgent identifies untested nodes and suggests flows to improve coverage.
// Uses GetUncoveredNodes and GetSystemFlows to find untested paths.
type CoverageAgent struct{}

func NewCoverageAgent() *CoverageAgent { return &CoverageAgent{} }

func (a *CoverageAgent) Name() string { return "coverage" }

func (a *CoverageAgent) Run(ctx context.Context, ac *AgentContext, params map[string]any) (*AgentResult, error) {
	result := &AgentResult{
		AgentName:  a.Name(),
		Success:    true,
		Confidence: 0.85,
	}

	stats, err := ac.GetGraphStats(ctx)
	if err != nil {
		return nil, fmt.Errorf("get stats: %w", err)
	}

	uncovered, err := ac.GetUncoveredNodes(ctx)
	if err != nil {
		return nil, fmt.Errorf("get uncovered: %w", err)
	}

	// Group uncovered nodes by type for actionable findings
	byType := make(map[string]int)
	for _, node := range uncovered {
		byType[string(node.Type)]++
		nodeID := node.ID
		severity := "info"
		if node.Type == "api_endpoint" || node.Type == "service" {
			severity = "warning"
		}
		result.Findings = append(result.Findings, Finding{
			Type:        "uncovered",
			Severity:    severity,
			Title:       fmt.Sprintf("Untested: %s", FormatNodeRef(node)),
			Description: fmt.Sprintf("Node %s has no flows covering it", node.Name),
			NodeID:      &nodeID,
		})
	}

	// Suggest generating flows for critical uncovered endpoints
	endpointCount := byType["api_endpoint"]
	if endpointCount > 0 {
		result.Actions = append(result.Actions, Action{
			Type:        "generate_flows",
			Description: fmt.Sprintf("Generate test flows for %d uncovered API endpoints", endpointCount),
			Status:      "suggested",
			Metadata:    map[string]any{"type": "api_endpoint", "count": endpointCount},
		})
	}

	result.Summary = fmt.Sprintf("Coverage: %.0f%% (%d/%d nodes tested, %d uncovered)",
		stats.CoveragePercent,
		stats.TotalNodes-stats.UncoveredCount,
		stats.TotalNodes,
		stats.UncoveredCount,
	)

	return result, nil
}
