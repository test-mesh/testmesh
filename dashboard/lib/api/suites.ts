import { apiClient } from './client';

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

function suitesUrl(workspaceId: string, path: string = ''): string {
  return `/api/v1/workspaces/${workspaceId}/suites${path}`;
}

// API functions
export const suiteApi = {
  list: async (workspaceId: string, params?: SuiteListParams): Promise<{ suites: Suite[]; total: number }> => {
    const response = await apiClient.get(suitesUrl(workspaceId), { params });
    return response.data;
  },

  get: async (workspaceId: string, suiteId: string): Promise<Suite> => {
    const response = await apiClient.get(suitesUrl(workspaceId, `/${suiteId}`));
    return response.data;
  },

  create: async (workspaceId: string, data: CreateSuiteRequest): Promise<Suite> => {
    const response = await apiClient.post(suitesUrl(workspaceId), data);
    return response.data;
  },

  update: async (workspaceId: string, suiteId: string, data: CreateSuiteRequest): Promise<Suite> => {
    const response = await apiClient.put(suitesUrl(workspaceId, `/${suiteId}`), data);
    return response.data;
  },

  delete: async (workspaceId: string, suiteId: string): Promise<void> => {
    await apiClient.delete(suitesUrl(workspaceId, `/${suiteId}`));
  },

  run: async (workspaceId: string, suiteId: string): Promise<{ run: SuiteRun }> => {
    const response = await apiClient.post(suitesUrl(workspaceId, `/${suiteId}/run`));
    return response.data;
  },

  listRuns: async (
    workspaceId: string,
    suiteId: string,
    params?: { limit?: number; offset?: number }
  ): Promise<{ runs: SuiteRun[]; total: number }> => {
    const response = await apiClient.get(suitesUrl(workspaceId, `/${suiteId}/runs`), { params });
    return response.data;
  },

  getRun: async (workspaceId: string, suiteId: string, runId: string): Promise<SuiteRun> => {
    const response = await apiClient.get(suitesUrl(workspaceId, `/${suiteId}/runs/${runId}`));
    return response.data;
  },
};
