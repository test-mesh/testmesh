import axios from 'axios';
import type {
  MockServer,
  MockEndpoint,
  MockRequest,
  MockState,
  ListMockServersResponse,
  ListMockEndpointsResponse,
  ListMockRequestsResponse,
  ListMockStatesResponse,
  MockServerStatus,
} from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5016';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Mock Server API
export const mockServerApi = {
  // List mock servers
  list: async (params?: {
    execution_id?: string;
    status?: MockServerStatus;
    limit?: number;
    offset?: number;
  }): Promise<ListMockServersResponse> => {
    const response = await apiClient.get<ListMockServersResponse>('/api/v1/mock-servers', {
      params,
    });
    return response.data;
  },

  // Get mock server by ID
  get: async (id: string): Promise<MockServer> => {
    const response = await apiClient.get<MockServer>(`/api/v1/mock-servers/${id}`);
    return response.data;
  },

  // Create a new standalone mock server
  create: async (data: { name: string }): Promise<MockServer> => {
    const response = await apiClient.post<MockServer>('/api/v1/mock-servers', data);
    return response.data;
  },

  // Delete mock server
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/mock-servers/${id}`);
  },

  // Start a stopped mock server
  start: async (id: string): Promise<MockServer> => {
    const response = await apiClient.post<MockServer>(`/api/v1/mock-servers/${id}/start`);
    return response.data;
  },

  // Stop a running mock server
  stop: async (id: string): Promise<MockServer> => {
    const response = await apiClient.post<MockServer>(`/api/v1/mock-servers/${id}/stop`);
    return response.data;
  },

  // Get endpoints for a mock server
  getEndpoints: async (serverId: string): Promise<ListMockEndpointsResponse> => {
    const response = await apiClient.get<ListMockEndpointsResponse>(
      `/api/v1/mock-servers/${serverId}/endpoints`
    );
    return response.data;
  },

  // Create endpoint
  createEndpoint: async (serverId: string, endpoint: Partial<MockEndpoint>): Promise<MockEndpoint> => {
    const response = await apiClient.post<MockEndpoint>(
      `/api/v1/mock-servers/${serverId}/endpoints`,
      endpoint
    );
    return response.data;
  },

  // Update endpoint
  updateEndpoint: async (
    serverId: string,
    endpointId: string,
    endpoint: Partial<MockEndpoint>
  ): Promise<MockEndpoint> => {
    const response = await apiClient.put<MockEndpoint>(
      `/api/v1/mock-servers/${serverId}/endpoints/${endpointId}`,
      endpoint
    );
    return response.data;
  },

  // Delete endpoint
  deleteEndpoint: async (serverId: string, endpointId: string): Promise<void> => {
    await apiClient.delete(`/api/v1/mock-servers/${serverId}/endpoints/${endpointId}`);
  },

  // Get request logs
  getRequests: async (
    serverId: string,
    params?: {
      matched?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<ListMockRequestsResponse> => {
    const response = await apiClient.get<ListMockRequestsResponse>(
      `/api/v1/mock-servers/${serverId}/requests`,
      { params }
    );
    return response.data;
  },

  // Get server state
  getStates: async (serverId: string): Promise<ListMockStatesResponse> => {
    const response = await apiClient.get<ListMockStatesResponse>(
      `/api/v1/mock-servers/${serverId}/state`
    );
    return response.data;
  },

  // Get specific state by key
  getState: async (serverId: string, key: string): Promise<MockState> => {
    const response = await apiClient.get<MockState>(
      `/api/v1/mock-servers/${serverId}/state/${key}`
    );
    return response.data;
  },

  // Create state
  createState: async (
    serverId: string,
    data: { state_key: string; state_value: any }
  ): Promise<MockState> => {
    const response = await apiClient.post<MockState>(
      `/api/v1/mock-servers/${serverId}/state`,
      data
    );
    return response.data;
  },

  // Update state
  updateState: async (
    serverId: string,
    key: string,
    data: { state_value: any }
  ): Promise<MockState> => {
    const response = await apiClient.put<MockState>(
      `/api/v1/mock-servers/${serverId}/state/${key}`,
      data
    );
    return response.data;
  },

  // Delete state
  deleteState: async (serverId: string, key: string): Promise<void> => {
    await apiClient.delete(`/api/v1/mock-servers/${serverId}/state/${key}`);
  },

  // Get specific request by ID
  getRequest: async (serverId: string, requestId: string): Promise<MockRequest> => {
    const response = await apiClient.get<MockRequest>(
      `/api/v1/mock-servers/${serverId}/requests/${requestId}`
    );
    return response.data;
  },

  // Clear all request logs
  clearRequests: async (serverId: string): Promise<void> => {
    await apiClient.delete(`/api/v1/mock-servers/${serverId}/requests`);
  },
};

export default mockServerApi;
