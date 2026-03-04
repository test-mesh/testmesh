import axios, { AxiosInstance, AxiosError } from 'axios';
import { getStoredToken, clearStoredAuth } from '@/lib/auth/AuthContext';
import { getActiveWorkspaceId } from '@/lib/hooks/useWorkspaces';
import type {
  Flow,
  Execution,
  CreateFlowRequest,
  UpdateFlowRequest,
  ListFlowsResponse,
  CreateExecutionRequest,
  ListExecutionsResponse,
  GetStepsResponse,
  GetLogsResponse,
  HealthResponse,
  ExecutionStatus,
} from './types';

// API Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5016';

// Paths that should be workspace-scoped
const WORKSPACE_SCOPED_PATHS = ['/flows', '/collections', '/environments', '/executions'];

// Check if a path should be workspace-scoped
const isWorkspaceScopedPath = (url: string): boolean => {
  return WORKSPACE_SCOPED_PATHS.some(path => url.includes(path) && !url.includes('/workspaces'));
};

// Create axios instance with default configuration
const createAxiosInstance = (): AxiosInstance => {
  const instance = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Request interceptor - inject auth token and workspace scope
  instance.interceptors.request.use(
    (config) => {
      // Add auth token
      const token = getStoredToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      // Add admin header for development (for /admin routes)
      // TODO: In production, this should check actual user permissions
      if (config.url?.includes('/admin/')) {
        config.headers['X-Admin'] = 'true';
      }

      // Rewrite workspace-scoped paths to include workspace_id
      const workspaceId = getActiveWorkspaceId();
      if (workspaceId && config.url && isWorkspaceScopedPath(config.url)) {
        // Transform /api/v1/flows -> /api/v1/workspaces/{id}/flows
        config.url = config.url.replace(
          '/api/v1/',
          `/api/v1/workspaces/${workspaceId}/`
        );
      }

      return config;
    },
    (error) => Promise.reject(error)
  );

  // Response interceptor - handle auth errors
  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as any;

      // Handle 401 Unauthorized
      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        // Try to refresh the token
        try {
          const refreshToken = typeof window !== 'undefined'
            ? localStorage.getItem('testmesh_refresh_token')
            : null;

          if (refreshToken) {
            const response = await axios.post(`${API_BASE_URL}/api/v1/auth/refresh`, {
              refresh_token: refreshToken,
            });

            const { access_token } = response.data;
            localStorage.setItem('testmesh_auth_token', access_token);

            // Retry the original request with new token
            originalRequest.headers.Authorization = `Bearer ${access_token}`;
            return instance(originalRequest);
          }
        } catch (refreshError) {
          // Refresh failed - clear auth state and redirect to login
          clearStoredAuth();
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
        }
      }

      return Promise.reject(error);
    }
  );

  return instance;
};

// Export for use by other API modules
export const apiClient = createAxiosInstance();

// Health API
export const healthApi = {
  check: async (): Promise<HealthResponse> => {
    const response = await apiClient.get<HealthResponse>('/health');
    return response.data;
  },
};

// Flow API
export const flowApi = {
  create: async (data: CreateFlowRequest): Promise<Flow> => {
    const response = await apiClient.post<Flow>('/api/v1/flows', data);
    return response.data;
  },

  list: async (params?: {
    suite?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
  }): Promise<ListFlowsResponse> => {
    const response = await apiClient.get<ListFlowsResponse>('/api/v1/flows', {
      params,
    });
    return response.data;
  },

  get: async (id: string): Promise<Flow> => {
    const response = await apiClient.get<Flow>(`/api/v1/flows/${id}`);
    return response.data;
  },

  update: async (id: string, data: UpdateFlowRequest): Promise<Flow> => {
    const response = await apiClient.put<Flow>(`/api/v1/flows/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/flows/${id}`);
  },
};

// Execution API
export const executionApi = {
  create: async (data: CreateExecutionRequest): Promise<Execution> => {
    const response = await apiClient.post<Execution>('/api/v1/executions', data);
    return response.data;
  },

  list: async (params?: {
    flow_id?: string;
    status?: ExecutionStatus;
    limit?: number;
    offset?: number;
  }): Promise<ListExecutionsResponse> => {
    const response = await apiClient.get<ListExecutionsResponse>('/api/v1/executions', {
      params,
    });
    return response.data;
  },

  get: async (id: string): Promise<Execution> => {
    const response = await apiClient.get<Execution>(`/api/v1/executions/${id}`);
    return response.data;
  },

  cancel: async (id: string): Promise<Execution> => {
    const response = await apiClient.post<Execution>(`/api/v1/executions/${id}/cancel`);
    return response.data;
  },

  getLogs: async (id: string): Promise<GetLogsResponse> => {
    const response = await apiClient.get<GetLogsResponse>(`/api/v1/executions/${id}/logs`);
    return response.data;
  },

  getSteps: async (id: string): Promise<GetStepsResponse> => {
    const response = await apiClient.get<GetStepsResponse>(`/api/v1/executions/${id}/steps`);
    return response.data;
  },

  getStep: async (executionId: string, stepId: string): Promise<import('./types').ExecutionStep> => {
    const response = await apiClient.get<import('./types').ExecutionStep>(
      `/api/v1/executions/${executionId}/steps/${stepId}`
    );
    return response.data;
  },
};

// Export a default API object with all endpoints
const api = {
  health: healthApi,
  flows: flowApi,
  executions: executionApi,
};

export default api;
