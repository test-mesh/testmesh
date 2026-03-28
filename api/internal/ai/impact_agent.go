package ai

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

// ImpactAgent analyzes the ripple effect of changes across the graph.
// It answers: "if these nodes changed, what flows are affected?"
type ImpactAgent struct{}

func NewImpactAgent() *ImpactAgent { return &ImpactAgent{} }

func (a *ImpactAgent) Name() string { return "impact" }

func (a *ImpactAgent) Run(ctx context.Context, ac *AgentContext, params map[string]any) (*AgentResult, error) {
	result := &AgentResult{
		AgentName: a.Name(),
		Success:   true,
	}

	// Parse changed node IDs (JSON arrays unmarshal as []interface{}, not []string)
	var nodeIDStrs []string
	if raw, ok := params["node_ids"].([]interface{}); ok {
		for _, v := range raw {
			if s, ok := v.(string); ok {
				nodeIDStrs = append(nodeIDStrs, s)
			}
		}
	} else if strs, ok := params["node_ids"].([]string); ok {
		nodeIDStrs = strs
	}
	if len(nodeIDStrs) == 0 {
		result.Summary = "No changed nodes provided"
		result.Confidence = 0.5
		return result, nil
	}

	var nodeIDs []uuid.UUID
	for _, idStr := range nodeIDStrs {
		id, err := uuid.Parse(idStr)
		if err != nil {
			continue
		}
		nodeIDs = append(nodeIDs, id)
	}

	report, err := ac.GetImpact(ctx, nodeIDs)
	if err != nil {
		return nil, fmt.Errorf("impact analysis: %w", err)
	}

	// Build findings from affected nodes
	for _, affected := range report.AffectedNodes {
		result.Findings = append(result.Findings, Finding{
			Type:        "affected_node",
			Severity:    "info",
			Title:       fmt.Sprintf("Affected: %s", FormatNodeRef(affected)),
			Description: fmt.Sprintf("Node %s may be impacted by the change", affected.Name),
			NodeID:      &affected.ID,
		})
	}

	// Build findings from affected flows
	for _, flow := range report.AffectedFlows {
		severity := "info"
		if flow.Relevance >= 0.8 {
			severity = "critical"
		} else if flow.Relevance >= 0.5 {
			severity = "warning"
		}
		flowID := flow.FlowID
		result.Findings = append(result.Findings, Finding{
			Type:        "affected_flow",
			Severity:    severity,
			Title:       fmt.Sprintf("Flow %q affected (%.0f%% relevance)", flow.FlowName, flow.Relevance*100),
			Description: flow.Reason,
			NodeID:      &flowID,
			Metadata:    map[string]any{"relevance": flow.Relevance},
		})
	}

	// Suggest re-running affected flows
	if len(report.AffectedFlows) > 0 {
		result.Actions = append(result.Actions, Action{
			Type:        "rerun_flows",
			Description: fmt.Sprintf("Re-run %d affected flows to verify changes", len(report.AffectedFlows)),
			Status:      "suggested",
		})
	}

	result.Summary = fmt.Sprintf("Impact: %d nodes affected, %d flows impacted",
		len(report.AffectedNodes), len(report.AffectedFlows))
	result.Confidence = 0.85

	return result, nil
}
