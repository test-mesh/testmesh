import { apiClient } from './client';

// Types
export type TestEnvState = 'cold' | 'provisioning' | 'warm' | 'running' | 'cooling' | 'destroyed';

export const TEST_ENV_STATE_COLORS: Record<TestEnvState, string> = {
  cold: 'gray',
  provisioning: 'blue',
  warm: 'green',
  running: 'yellow',
  cooling: 'orange',
  destroyed: 'red',
};

export interface TestEnvironment {
  id: string;
  workspace_id: string;
  name: string;
  context: string;
  namespace: string;
  provider: 'argocd' | string;
  provider_app_name: string;
  state: TestEnvState;
  ttl_minutes: number;
  last_used_at: string | null;
  created_at: string;
}

export interface CreateTestEnvRequest {
  name: string;
  context: string;
  namespace?: string;
  provider?: string;
  provider_app_name?: string;
  ttl_minutes?: number;
}

function testEnvsUrl(workspaceId: string, path: string = ''): string {
  return `/api/v1/workspaces/${workspaceId}/test-environments${path}`;
}

// API functions
export const testEnvironmentApi = {
  list: async (workspaceId: string): Promise<{ environments: TestEnvironment[]; total: number }> => {
    const response = await apiClient.get(testEnvsUrl(workspaceId));
    return response.data;
  },

  create: async (workspaceId: string, data: CreateTestEnvRequest): Promise<TestEnvironment> => {
    const response = await apiClient.post(testEnvsUrl(workspaceId), data);
    return response.data;
  },

  destroy: async (workspaceId: string, envId: string): Promise<void> => {
    await apiClient.delete(testEnvsUrl(workspaceId, `/${envId}`));
  },
};
