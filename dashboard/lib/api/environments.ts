import { apiClient } from './client';

export interface EnvironmentVariable {
  key: string;
  value: string;
  description?: string;
  is_secret: boolean;
  enabled: boolean;
}

export interface Environment {
  id: string;
  name: string;
  description: string;
  color: string;
  is_default: boolean;
  variables: EnvironmentVariable[];
  created_at: string;
  updated_at: string;
}

export interface CreateEnvironmentRequest {
  name: string;
  description?: string;
  color?: string;
  is_default?: boolean;
  variables?: EnvironmentVariable[];
}

export interface UpdateEnvironmentRequest {
  name?: string;
  description?: string;
  color?: string;
  is_default?: boolean;
  variables?: EnvironmentVariable[];
}

export interface EnvironmentExport {
  name: string;
  description: string;
  variables: EnvironmentVariable[];
}

export const environmentApi = {
  list: async (): Promise<{ environments: Environment[]; total: number }> => {
    const response = await apiClient.get<{ environments: Environment[]; total: number }>(
      '/api/v1/environments'
    );
    return response.data;
  },

  get: async (id: string): Promise<Environment> => {
    const response = await apiClient.get<Environment>(`/api/v1/environments/${id}`);
    return response.data;
  },

  getDefault: async (): Promise<Environment | null> => {
    const response = await apiClient.get<Environment>('/api/v1/environments/default');
    return response.data.id ? response.data : null;
  },

  create: async (data: CreateEnvironmentRequest): Promise<Environment> => {
    const response = await apiClient.post<Environment>('/api/v1/environments', data);
    return response.data;
  },

  update: async (id: string, data: UpdateEnvironmentRequest): Promise<Environment> => {
    const response = await apiClient.put<Environment>(`/api/v1/environments/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/environments/${id}`);
  },

  setDefault: async (id: string): Promise<Environment> => {
    const response = await apiClient.post<Environment>(`/api/v1/environments/${id}/default`);
    return response.data;
  },

  duplicate: async (id: string, name: string): Promise<Environment> => {
    const response = await apiClient.post<Environment>(`/api/v1/environments/${id}/duplicate`, {
      name,
    });
    return response.data;
  },

  export: async (id: string, includeSecrets = false): Promise<EnvironmentExport> => {
    const response = await apiClient.get<EnvironmentExport>(
      `/api/v1/environments/${id}/export?include_secrets=${includeSecrets}`
    );
    return response.data;
  },

  import: async (data: EnvironmentExport): Promise<Environment> => {
    const response = await apiClient.post<Environment>('/api/v1/environments/import', data);
    return response.data;
  },
};
