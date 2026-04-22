import { apiClient } from './client';
import { getActiveWorkspaceId } from '@/lib/hooks/useWorkspaces';

// Types
export interface SuiteFlow {
  id: string;
  suite_id: string;
  flow_id: string;
  order: number;
  parallel: boolean;
  flow?: { id: string; name: string; tags: string[] };
}

export interface Suite {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  tags: string[];
  flows: SuiteFlow[];
  created_at: string;
  updated_at: string;
}

export type SuiteRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TriggerType = 'manual' | 'schedule' | 'webhook' | 'argocd' | 'api';

export interface SuiteRun {
  id: string;
  suite_id: string;
  status: SuiteRunStatus;
  trigger_type: TriggerType;
  trigger_ref: string;
  environment: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number;
  total_flows: number;
  passed_flows: number;
  failed_flows: number;
  error: string;
  created_at: string;
}

export interface CreateSuiteRequest {
  name: string;
  description?: string;
  tags?: string[];
  flows: Array<{ flow_id: string; order: number; parallel: boolean }>;
}

export interface SuiteListParams {
  search?: string;
  limit?: number;
  offset?: number;
}

// Helper to build workspace-scoped suites URL
function suitesUrl(path: string = ''): string {
  const wsId = getActiveWorkspaceId();
  if (!wsId) throw new Error('No active workspace selected');
  return `/api/v1/workspaces/${wsId}/suites${path}`;
}

// API functions
export const suiteApi = {
  list: async (params?: SuiteListParams): Promise<{ suites: Suite[]; total: number }> => {
    const response = await apiClient.get(suitesUrl(), { params });
    return response.data;
  },

  get: async (suiteId: string): Promise<Suite> => {
    const response = await apiClient.get(suitesUrl(`/${suiteId}`));
    return response.data;
  },

  create: async (data: CreateSuiteRequest): Promise<Suite> => {
    const response = await apiClient.post(suitesUrl(), data);
    return response.data;
  },

  update: async (suiteId: string, data: CreateSuiteRequest): Promise<Suite> => {
    const response = await apiClient.put(suitesUrl(`/${suiteId}`), data);
    return response.data;
  },

  delete: async (suiteId: string): Promise<void> => {
    await apiClient.delete(suitesUrl(`/${suiteId}`));
  },

  run: async (suiteId: string): Promise<{ run: SuiteRun }> => {
    const response = await apiClient.post(suitesUrl(`/${suiteId}/run`));
    return response.data;
  },

  listRuns: async (
    suiteId: string,
    params?: { limit?: number; offset?: number }
  ): Promise<{ runs: SuiteRun[]; total: number }> => {
    const response = await apiClient.get(suitesUrl(`/${suiteId}/runs`), { params });
    return response.data;
  },

  getRun: async (suiteId: string, runId: string): Promise<SuiteRun> => {
    const response = await apiClient.get(suitesUrl(`/${suiteId}/runs/${runId}`));
    return response.data;
  },
};
