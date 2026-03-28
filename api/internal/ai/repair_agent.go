package ai

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

// RepairAgent diagnoses failing flows and suggests fixes based on graph context.
// Uses dependencies, contracts, and drift detection to identify root causes.
type RepairAgent struct{}

func NewRepairAgent() *RepairAgent { return &RepairAgent{} }

func (a *RepairAgent) Name() string { return "repair" }

func (a *RepairAgent) Run(ctx context.Context, ac *AgentContext, params map[string]any) (*AgentResult, error) {
	result := &AgentResult{
		AgentName: a.Name(),
		Success:   true,
	}

	// Get the failing node
	nodeIDStr, _ := params["node_id"].(string)
	if nodeIDStr == "" {
		result.Summary = "No failing node specified"
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

	// Check dependencies for issues
	deps, err := ac.GetServiceDependencies(ctx, nodeID)
	if err != nil {
		ac.Logger.Warn("Failed to get dependencies", zap.Error(err))
	}

	if deps != nil {
		for _, dep := range deps.Nodes {
			if dep.Confidence < 0.5 {
				depID := dep.ID
				result.Findings = append(result.Findings, Finding{
					Type:        "low_confidence_dependency",
					Severity:    "warning",
					Title:       fmt.Sprintf("Low-confidence dependency: %s", FormatNodeRef(dep)),
					Description: fmt.Sprintf("Dependency %s has confidence %.0f%% — may indicate drift", dep.Name, dep.Confidence*100),
					NodeID:      &depID,
				})
			}
		}
	}

	// Check contracts for drift
	contracts, err := ac.GetContracts(ctx)
	if err == nil {
		for _, contract := range contracts {
			if contract.Producer.ID == nodeID || contract.Consumer.ID == nodeID {
				result.Findings = append(result.Findings, Finding{
					Type:        "contract",
					Severity:    "info",
					Title:       fmt.Sprintf("Contract: %s → %s via %s", contract.Producer.Name, contract.Consumer.Name, contract.Via.Name),
					Description: "Check if contract expectations still match actual behavior",
				})
			}
		}
	}

	result.Summary = fmt.Sprintf("Repair analysis for %s: %d findings", FormatNodeRef(*node), len(result.Findings))
	result.Confidence = 0.7

	return result, nil
}
