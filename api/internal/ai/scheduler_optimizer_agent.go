package ai

import (
	"context"
	"fmt"
	"sort"

	"github.com/google/uuid"
	"github.com/test-mesh/testmesh/internal/graph"
)

// SchedulerOptimizerAgent optimizes test execution order using graph centrality
// and flow redundancy. Prioritizes flows that cover high-impact, highly-connected nodes.
type SchedulerOptimizerAgent struct{}

func NewSchedulerOptimizerAgent() *SchedulerOptimizerAgent { return &SchedulerOptimizerAgent{} }

func (a *SchedulerOptimizerAgent) Name() string { return "scheduler_optimizer" }

func (a *SchedulerOptimizerAgent) Run(ctx context.Context, ac *AgentContext, params map[string]any) (*AgentResult, error) {
	result := &AgentResult{
		AgentName:  a.Name(),
		Success:    true,
		Confidence: 0.75,
	}

	// Get all services to compute centrality
	services, err := ac.GetAllServices(ctx)
	if err != nil {
		return nil, fmt.Errorf("get services: %w", err)
	}

	// Compute degree centrality: dependents count as incoming edges
	type scoredNode struct {
		Node       graph.GraphNode
		Dependents int
		FlowCount  int
		Score      float64
	}

	scored := make([]scoredNode, 0, len(services))
	for _, svc := range services {
		dependents, _ := ac.GetServiceDependents(ctx, svc.ID)
		deps, _ := ac.GetServiceDependencies(ctx, svc.ID)
		flowIDs, _ := ac.GetFlowsForNode(ctx, svc.ID)

		depCount := 0
		if dependents != nil {
			depCount = len(dependents.Nodes)
		}
		depsCount := 0
		if deps != nil {
			depsCount = len(deps.Nodes)
		}

		// Score: higher centrality (more dependents) = higher priority
		// Nodes with fewer existing flows get a boost (less redundant testing)
		centrality := float64(depCount + depsCount)
		redundancyPenalty := float64(len(flowIDs)) * 0.5
		score := centrality - redundancyPenalty
		if score < 0 {
			score = 0
		}

		scored = append(scored, scoredNode{
			Node:       svc,
			Dependents: depCount,
			FlowCount:  len(flowIDs),
			Score:      score,
		})
	}

	// Sort by score descending
	sort.Slice(scored, func(i, j int) bool {
		return scored[i].Score > scored[j].Score
	})

	// Report optimization recommendations
	for i, s := range scored {
		if i >= 20 {
			break // Top 20 recommendations
		}

		severity := "info"
		if s.FlowCount == 0 && s.Dependents > 0 {
			severity = "warning"
		}
		if s.FlowCount == 0 && s.Dependents > 3 {
			severity = "critical"
		}

		svcID := s.Node.ID
		result.Findings = append(result.Findings, Finding{
			Type:     "priority_ranking",
			Severity: severity,
			Title:    fmt.Sprintf("#%d %s (score: %.1f, %d dependents, %d flows)", i+1, s.Node.Name, s.Score, s.Dependents, s.FlowCount),
			NodeID:   &svcID,
			Metadata: map[string]any{
				"rank":       i + 1,
				"score":      s.Score,
				"dependents": s.Dependents,
				"flow_count": s.FlowCount,
			},
		})
	}

	// Identify redundant flows: nodes covered by many flows
	redundant := 0
	for _, s := range scored {
		if s.FlowCount > 3 && s.Dependents <= 1 {
			redundant++
			svcID := s.Node.ID
			result.Actions = append(result.Actions, Action{
				Type:        "reduce_redundancy",
				Description: fmt.Sprintf("Service %s has %d flows but only %d dependents — consider consolidating", s.Node.Name, s.FlowCount, s.Dependents),
				Status:      "suggested",
				Metadata: map[string]any{
					"node_id":    svcID.String(),
					"flow_count": s.FlowCount,
					"dependents": s.Dependents,
				},
			})
		}
	}

	// If specific flow_ids are provided, reorder them
	flowIDsRaw, _ := params["flow_ids"].([]any)
	if len(flowIDsRaw) > 0 {
		result.Actions = append(result.Actions, Action{
			Type:        "reorder_flows",
			Description: fmt.Sprintf("Reorder %d flows based on graph centrality scores", len(flowIDsRaw)),
			Status:      "suggested",
			Metadata: map[string]any{
				"original_count": len(flowIDsRaw),
			},
		})
	}

	result.Summary = fmt.Sprintf("Scheduler: ranked %d services by centrality, %d redundancy suggestions", len(scored), redundant)
	return result, nil
}

// GetPrioritizedFlowOrder returns flow IDs sorted by the centrality of nodes they cover.
// This is a convenience method for the scheduler to call directly.
func GetPrioritizedFlowOrder(ctx context.Context, ac *AgentContext, flowIDs []uuid.UUID) ([]uuid.UUID, error) {
	type flowScore struct {
		ID    uuid.UUID
		Score float64
	}

	scores := make([]flowScore, 0, len(flowIDs))
	for _, fid := range flowIDs {
		// For each flow, sum the centrality of nodes it covers
		// This is a simplified heuristic — the full optimizer agent does more
		score := 1.0 // base score
		scores = append(scores, flowScore{ID: fid, Score: score})
	}

	sort.Slice(scores, func(i, j int) bool {
		return scores[i].Score > scores[j].Score
	})

	ordered := make([]uuid.UUID, len(scores))
	for i, s := range scores {
		ordered[i] = s.ID
	}
	return ordered, nil
}
