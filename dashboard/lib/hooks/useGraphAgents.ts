import { useMutation, useQuery } from '@tanstack/react-query';
import { graphAgentApi, type GraphAgentName, type AgentResult, type OrchestratorResult } from '@/lib/api/graph-agents';

export function useListAgents() {
  return useQuery({
    queryKey: ['graph-agents'],
    queryFn: () => graphAgentApi.list(),
  });
}

export function useRunAgent() {
  return useMutation({
    mutationFn: ({ agent, params }: { agent: GraphAgentName; params?: Record<string, any> }) =>
      graphAgentApi.run(agent, params),
  });
}

export function useOrchestrate() {
  return useMutation({
    mutationFn: ({ event, params }: { event: string; params?: Record<string, any> }) =>
      graphAgentApi.orchestrate(event, params),
  });
}

export function useScoreConfidence() {
  return useMutation({
    mutationFn: (nodeIds: string[]) => graphAgentApi.scoreConfidence(nodeIds),
  });
}
