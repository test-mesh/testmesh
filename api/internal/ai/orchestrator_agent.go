package ai

import (
	"context"
	"fmt"
)

// OrchestratorAgent coordinates other agents based on graph events.
// It decides which agents to invoke when the graph changes, executions complete, or PRs open.
type OrchestratorAgent struct{}

func NewOrchestratorAgent() *OrchestratorAgent { return &OrchestratorAgent{} }

func (a *OrchestratorAgent) Name() string { return "orchestrator" }

func (a *OrchestratorAgent) Run(ctx context.Context, ac *AgentContext, params map[string]any) (*AgentResult, error) {
	event, _ := params["event"].(string)

	result := &AgentResult{
		AgentName:  a.Name(),
		Success:    true,
		Confidence: 0.9,
	}

	stats, err := ac.GetGraphStats(ctx)
	if err != nil {
		return nil, fmt.Errorf("get stats: %w", err)
	}

	switch event {
	case "graph.updated":
		// Check what needs attention after a graph update
		uncovered, _ := ac.GetUncoveredNodes(ctx)
		if len(uncovered) > 0 {
			result.Actions = append(result.Actions, Action{
				Type:        "invoke_agent",
				Description: fmt.Sprintf("Coverage agent: %d uncovered nodes found", len(uncovered)),
				Status:      "suggested",
				Metadata:    map[string]any{"agent": "coverage", "uncovered_count": len(uncovered)},
			})
		}
		if stats.ConflictCount > 0 {
			result.Findings = append(result.Findings, Finding{
				Type:     "conflicts",
				Severity: "warning",
				Title:    fmt.Sprintf("%d merge conflicts need resolution", stats.ConflictCount),
			})
		}
		result.Summary = fmt.Sprintf("Graph updated: %d nodes, %d edges, %.0f%% coverage", stats.TotalNodes, stats.TotalEdges, stats.CoveragePercent)

	case "execution.complete":
		// After execution, check for flakiness and diagnosis opportunities
		result.Actions = append(result.Actions, Action{
			Type:        "invoke_agent",
			Description: "Feed execution results to runtime scanner and flakiness detector",
			Status:      "suggested",
			Metadata:    map[string]any{"agents": []string{"flakiness", "diagnosis", "repair"}},
		})
		result.Summary = "Execution complete — runtime scanner, flakiness, and diagnosis agents suggested"

	case "pr.opened":
		// For PRs, run impact analysis and suggest test generation
		result.Actions = append(result.Actions, Action{
			Type:        "invoke_agent",
			Description: "Run impact analysis and code scanner on changed files",
			Status:      "suggested",
			Metadata:    map[string]any{"agents": []string{"impact", "generation"}},
		})
		result.Summary = "PR opened — impact and generation agents suggested"

	default:
		result.Summary = fmt.Sprintf("Graph stats: %d nodes, %d edges, %d services, %.0f%% coverage",
			stats.TotalNodes, stats.TotalEdges, stats.ServiceCount, stats.CoveragePercent)
	}

	return result, nil
}
