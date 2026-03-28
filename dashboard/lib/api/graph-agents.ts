import { apiClient } from './client';
import { getActiveWorkspaceId } from '@/lib/hooks/useWorkspaces';

// Types
export interface AgentFinding {
  type: string;
  title: string;
  description: string;
  severity: string;
  metadata: Record<string, any>;
}

export interface AgentAction {
  type: string;
  description: string;
  metadata: Record<string, any>;
}

export interface AgentResult {
  success: boolean;
  agent_name: string;
  findings: AgentFinding[];
  actions: AgentAction[];
  summary: string;
}

export interface OrchestratorResult {
  event: string;
  agents_invoked: string[];
  results: Record<string, AgentResult>;
  summary: string;
}

export type GraphAgentName = 'coverage' | 'diagnosis' | 'flakiness' | 'generation' | 'impact' | 'repair' | 'watch' | 'scheduler_optimizer';

// Helper to build workspace-scoped graph URL
function graphUrl(path: string): string {
  const wsId = getActiveWorkspaceId();
  if (!wsId) throw new Error('No active workspace selected');
  return `/api/v1/workspaces/${wsId}/graph/cloud${path}`;
}

export const graphAgentApi = {
  list: async (): Promise<{ agents: string[] }> => {
    const response = await apiClient.get(graphUrl('/agents'));
    return response.data;
  },

  run: async (agentName: GraphAgentName, params?: Record<string, any>): Promise<AgentResult> => {
    const response = await apiClient.post(graphUrl(`/agents/${agentName}`), params || {}, {
      timeout: 120000,
    });
    return response.data;
  },

  orchestrate: async (event: string, params?: Record<string, any>): Promise<OrchestratorResult> => {
    const response = await apiClient.post(graphUrl('/agents/orchestrate'), { event, params }, {
      timeout: 120000,
    });
    return response.data;
  },

  scoreConfidence: async (nodeIds: string[]): Promise<{ scores: Record<string, { score: number; classification: string }> }> => {
    const response = await apiClient.post(graphUrl('/confidence'), { node_ids: nodeIds });
    return response.data;
  },
};
