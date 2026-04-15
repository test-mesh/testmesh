import { apiClient } from './client';

// Types
export interface SystemIntegration {
  id: string;
  name: string;
  type: IntegrationType;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  config: IntegrationConfig;
  last_test_at?: string;
  last_test_status?: string;
  last_test_error?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export type IntegrationType = 'ai_provider' | 'git' | 'notification';
export type IntegrationProvider = 'openai' | 'anthropic' | 'local' | 'github' | 'gitea' | 'gitlab' | 'slack';
export type IntegrationStatus = 'active' | 'disabled' | 'error';

export interface IntegrationConfig {
  model?: string;
  endpoint?: string;
  temperature?: number;
  max_tokens?: number;
  signature_header?: string;
  base_url?: string; // Gitea: self-hosted base URL
  // Slack config
  channel?: string;
  notify_on_events?: string[];
  github_installation_id?: number;
  github_user_login?: string;
}

export interface ServicePathMapping {
  service_name: string;
  path_patterns: string[]; // globs e.g. ["api/user-service/**"]
}

export interface RepositoryLink {
  id: string;
  workspace_id: string;
  integration_id: string;
  repository: string; // "owner/repo"
  default_branch: string;
  service_mappings: ServicePathMapping[];
  auto_adapt: boolean;
  auto_apply_threshold: number; // 0=manual, 0.9=apply if >=90%
  created_at: string;
  updated_at: string;
  integration?: SystemIntegration;
}

export interface CreateRepositoryLinkRequest {
  integration_id: string;
  repository: string;
  default_branch?: string;
  service_mappings?: ServicePathMapping[];
  auto_adapt?: boolean;
  auto_apply_threshold?: number;
}

export interface UpdateRepositoryLinkRequest {
  default_branch?: string;
  service_mappings?: ServicePathMapping[];
  auto_adapt?: boolean;
  auto_apply_threshold?: number;
}

export interface GitRepository {
  full_name: string;
  name: string;
  description: string;
  private: boolean;
  html_url: string;
}

export interface GitHubInstallation {
  id: number;
  login: string;
  avatar_url: string;
  type: string;
}

export interface GitHubAppStatus {
  configured: boolean;
  client_id: string;
}

export interface CreateIntegrationRequest {
  name: string;
  type: IntegrationType;
  provider: IntegrationProvider;
  config?: IntegrationConfig;
  secrets?: Record<string, string>;
}

export interface UpdateIntegrationRequest {
  name?: string;
  status?: IntegrationStatus;
  config?: IntegrationConfig;
}

export interface UpdateSecretsRequest {
  secrets: Record<string, string>;
}

export interface TestConnectionResponse {
  success: boolean;
  message?: string;
  error?: string;
  tested_at: string;
}

export interface GitTriggerRule {
  id: string;
  workspace_id: string;
  integration_id: string;
  name: string;
  repository: string;
  branch_filter: string;
  event_types: string[];
  trigger_mode: TriggerMode;
  schedule_id?: string;
  flow_id?: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  integration?: SystemIntegration;
  schedule?: {
    id: string;
    name: string;
  };
  flow?: {
    id: string;
    name: string;
  };
}

export type TriggerMode = 'schedule' | 'direct';

export interface CreateGitTriggerRuleRequest {
  integration_id: string;
  name: string;
  repository: string;
  branch_filter?: string;
  event_types?: string[];
  trigger_mode: TriggerMode;
  schedule_id?: string;
  flow_id?: string;
  enabled?: boolean;
}

export interface UpdateGitTriggerRuleRequest {
  name?: string;
  branch_filter?: string;
  event_types?: string[];
  trigger_mode?: TriggerMode;
  schedule_id?: string;
  flow_id?: string;
  enabled?: boolean;
}

export interface WebhookDelivery {
  id: string;
  integration_id: string;
  workspace_id?: string;
  event_type: string;
  repository?: string;
  branch?: string;
  commit_sha?: string;
  payload: Record<string, any>;
  signature?: string;
  status: WebhookDeliveryStatus;
  error?: string;
  triggered_runs?: string[];
  received_at: string;
  processed_at?: string;
}

export type WebhookDeliveryStatus = 'success' | 'failed' | 'rejected';

// API functions
export const integrationsApi = {
  // System integrations (admin only)
  list: async (params?: { type?: string; status?: string }) => {
    const response = await apiClient.get<{ integrations: SystemIntegration[]; total: number }>('/api/v1/integrations', { params });
    return response.data;
  },

  create: async (data: CreateIntegrationRequest) => {
    const response = await apiClient.post<SystemIntegration>('/api/v1/integrations', data);
    return response.data;
  },

  get: async (id: string) => {
    const response = await apiClient.get<SystemIntegration>(`/api/v1/integrations/${id}`);
    return response.data;
  },

  update: async (id: string, data: UpdateIntegrationRequest) => {
    const response = await apiClient.put<SystemIntegration>(`/api/v1/integrations/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    await apiClient.delete(`/api/v1/integrations/${id}`);
  },

  testConnection: async (id: string) => {
    const response = await apiClient.post<TestConnectionResponse>(`/api/v1/integrations/${id}/test`);
    return response.data;
  },

  getSecrets: async (id: string) => {
    const response = await apiClient.get<{ integration_id: string; secret_keys: string[]; secrets: Record<string, string> }>(`/api/v1/integrations/${id}/secrets`);
    return response.data;
  },

  updateSecrets: async (id: string, data: UpdateSecretsRequest) => {
    await apiClient.put(`/api/v1/integrations/${id}/secrets`, data);
  },

  listRepos: async (id: string, search?: string) => {
    const response = await apiClient.get<{ repositories: GitRepository[]; total: number }>(
      `/api/v1/integrations/${id}/repos`,
      { params: search ? { search } : undefined }
    );
    return response.data;
  },
};

export const repositoryLinksApi = {
  list: async (workspaceId: string) => {
    const response = await apiClient.get<{ repository_links: RepositoryLink[]; total: number }>(
      `/api/v1/workspaces/${workspaceId}/repository-links`
    );
    return response.data;
  },

  create: async (workspaceId: string, data: CreateRepositoryLinkRequest) => {
    const response = await apiClient.post<RepositoryLink>(
      `/api/v1/workspaces/${workspaceId}/repository-links`,
      data
    );
    return response.data;
  },

  get: async (workspaceId: string, linkId: string) => {
    const response = await apiClient.get<RepositoryLink>(
      `/api/v1/workspaces/${workspaceId}/repository-links/${linkId}`
    );
    return response.data;
  },

  update: async (workspaceId: string, linkId: string, data: UpdateRepositoryLinkRequest) => {
    const response = await apiClient.put<RepositoryLink>(
      `/api/v1/workspaces/${workspaceId}/repository-links/${linkId}`,
      data
    );
    return response.data;
  },

  delete: async (workspaceId: string, linkId: string) => {
    await apiClient.delete(`/api/v1/workspaces/${workspaceId}/repository-links/${linkId}`);
  },
};

export const gitTriggerRulesApi = {
  // Git trigger rules (workspace-scoped)
  list: async (workspaceId: string) => {
    const response = await apiClient.get<{ rules: GitTriggerRule[]; total: number }>(`/api/v1/workspaces/${workspaceId}/git-trigger-rules`);
    return response.data;
  },

  create: async (workspaceId: string, data: CreateGitTriggerRuleRequest) => {
    const response = await apiClient.post<GitTriggerRule>(`/api/v1/workspaces/${workspaceId}/git-trigger-rules`, data);
    return response.data;
  },

  get: async (workspaceId: string, id: string) => {
    const response = await apiClient.get<GitTriggerRule>(`/api/v1/workspaces/${workspaceId}/git-trigger-rules/${id}`);
    return response.data;
  },

  update: async (workspaceId: string, id: string, data: UpdateGitTriggerRuleRequest) => {
    const response = await apiClient.put<GitTriggerRule>(`/api/v1/workspaces/${workspaceId}/git-trigger-rules/${id}`, data);
    return response.data;
  },

  delete: async (workspaceId: string, id: string) => {
    await apiClient.delete(`/api/v1/workspaces/${workspaceId}/git-trigger-rules/${id}`);
  },
};

export const githubOAuthApi = {
  appStatus: async () => {
    const response = await apiClient.get<GitHubAppStatus>('/api/v1/github/app/status');
    return response.data;
  },
  authorize: async (workspaceId: string) => {
    const response = await apiClient.get<{ url: string }>(`/api/v1/workspaces/${workspaceId}/github/oauth/authorize`);
    return response.data;
  },
  listInstallations: async (workspaceId: string) => {
    const response = await apiClient.get<{ installations: GitHubInstallation[] }>(`/api/v1/workspaces/${workspaceId}/github/installations`);
    return response.data;
  },
};
