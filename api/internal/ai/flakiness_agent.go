package ai

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

// FlakinessAgent detects flaky tests by correlating failures with external dependencies.
// Uses graph dependencies and runtime layer latency data.
type FlakinessAgent struct{}

func NewFlakinessAgent() *FlakinessAgent { return &FlakinessAgent{} }

func (a *FlakinessAgent) Name() string { return "flakiness" }

func (a *FlakinessAgent) Run(ctx context.Context, ac *AgentContext, params map[string]any) (*AgentResult, error) {
	result := &AgentResult{
		AgentName:  a.Name(),
		Success:    true,
		Confidence: 0.75,
	}

	// Get the node to analyze for flakiness
	nodeIDStr, _ := params["node_id"].(string)
	if nodeIDStr == "" {
		// Analyze all services for flakiness indicators
		services, err := ac.GetAllServices(ctx)
		if err != nil {
			return nil, fmt.Errorf("get services: %w", err)
		}

		for _, svc := range services {
			deps, err := ac.GetServiceDependencies(ctx, svc.ID)
			if err != nil || deps == nil {
				continue
			}

			// Check for external dependencies (common flakiness source)
			externalCount := 0
			for _, dep := range deps.Nodes {
				if dep.Type == "external" {
					externalCount++
					depID := dep.ID
					result.Findings = append(result.Findings, Finding{
						Type:        "external_dependency",
						Severity:    "warning",
						Title:       fmt.Sprintf("%s depends on external: %s", svc.Name, dep.Name),
						Description: "External dependencies are common sources of flakiness — consider mocking in tests",
						NodeID:      &depID,
					})
				}
			}

			if externalCount > 2 {
				svcID := svc.ID
				result.Findings = append(result.Findings, Finding{
					Type:        "high_external_count",
					Severity:    "critical",
					Title:       fmt.Sprintf("%s has %d external dependencies", svc.Name, externalCount),
					Description: "Services with many external dependencies are more likely to have flaky tests",
					NodeID:      &svcID,
				})
			}
		}

		result.Summary = fmt.Sprintf("Flakiness scan: analyzed %d services, %d findings", len(services), len(result.Findings))
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

	deps, _ := ac.GetServiceDependencies(ctx, nodeID)
	if deps != nil {
		for _, dep := range deps.Nodes {
			if dep.Type == "external" || dep.Type == "database" || dep.Type == "topic" {
				depID := dep.ID
				result.Findings = append(result.Findings, Finding{
					Type:        "flakiness_risk",
					Severity:    "warning",
					Title:       fmt.Sprintf("Dependency on %s (%s) may cause flakiness", dep.Name, dep.Type),
					Description: "Consider adding retry logic, timeouts, or mocks for this dependency",
					NodeID:      &depID,
				})
			}
		}
	}

	result.Summary = fmt.Sprintf("Flakiness analysis for %s: %d risk factors", FormatNodeRef(*node), len(result.Findings))
	return result, nil
}
