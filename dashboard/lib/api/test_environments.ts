import { apiClient } from './client';
import { getActiveWorkspaceId } from '@/lib/hooks/useWorkspaces';

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

// Helper to build workspace-scoped test environments URL
function testEnvsUrl(path: string = ''): string {
  const wsId = getActiveWorkspaceId();
  if (!wsId) throw new Error('No active workspace selected');
  return `/api/v1/workspaces/${wsId}/test-environments${path}`;
}

// API functions
export const testEnvironmentApi = {
  list: async (): Promise<{ environments: TestEnvironment[]; total: number }> => {
    const response = await apiClient.get(testEnvsUrl());
    return response.data;
  },

  create: async (data: CreateTestEnvRequest): Promise<TestEnvironment> => {
    const response = await apiClient.post(testEnvsUrl(), data);
    return response.data;
  },

  destroy: async (envId: string): Promise<void> => {
    await apiClient.delete(testEnvsUrl(`/${envId}`));
  },
};
