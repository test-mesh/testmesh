import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mockServerApi } from '../api/mocks';
import type { MockServer, MockEndpoint, MockServerStatus } from '../api/types';

// Query keys
export const mockServerKeys = {
  all: ['mockServers'] as const,
  lists: () => [...mockServerKeys.all, 'list'] as const,
  list: (filters: Record<string, any>) => [...mockServerKeys.lists(), filters] as const,
  details: () => [...mockServerKeys.all, 'detail'] as const,
  detail: (id: string) => [...mockServerKeys.details(), id] as const,
  endpoints: (id: string) => [...mockServerKeys.detail(id), 'endpoints'] as const,
  requests: (id: string, filters: Record<string, any>) => [
    ...mockServerKeys.detail(id),
    'requests',
    filters,
  ] as const,
  request: (serverId: string, requestId: string) => [
    ...mockServerKeys.detail(serverId),
    'request',
    requestId,
  ] as const,
  states: (id: string) => [...mockServerKeys.detail(id), 'states'] as const,
  state: (serverId: string, key: string) => [...mockServerKeys.states(serverId), key] as const,
};

// Hooks for mock servers
export function useMockServers(params?: {
  execution_id?: string;
  status?: MockServerStatus;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: mockServerKeys.list(params || {}),
    queryFn: () => mockServerApi.list(params),
  });
}

export function useMockServer(id: string) {
  return useQuery({
    queryKey: mockServerKeys.detail(id),
    queryFn: () => mockServerApi.get(id),
    enabled: !!id,
  });
}

export function useMockServerEndpoints(serverId: string) {
  return useQuery({
    queryKey: mockServerKeys.endpoints(serverId),
    queryFn: () => mockServerApi.getEndpoints(serverId),
    enabled: !!serverId,
  });
}

export function useMockServerRequests(
  serverId: string,
  params?: { matched?: boolean; limit?: number; offset?: number }
) {
  return useQuery({
    queryKey: mockServerKeys.requests(serverId, params || {}),
    queryFn: () => mockServerApi.getRequests(serverId, params),
    enabled: !!serverId,
    refetchInterval: 3000, // Auto-refresh every 3 seconds for request logs
  });
}

export function useMockServerStates(serverId: string) {
  return useQuery({
    queryKey: mockServerKeys.states(serverId),
    queryFn: () => mockServerApi.getStates(serverId),
    enabled: !!serverId,
  });
}

export function useCreateMockServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name: string }) => mockServerApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mockServerKeys.lists() });
    },
  });
}

export function useDeleteMockServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => mockServerApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mockServerKeys.lists() });
    },
  });
}

export function useStartMockServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => mockServerApi.start(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: mockServerKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: mockServerKeys.lists() });
    },
  });
}

export function useStopMockServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => mockServerApi.stop(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: mockServerKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: mockServerKeys.lists() });
    },
  });
}

export function useCreateMockEndpoint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ serverId, endpoint }: { serverId: string; endpoint: Partial<MockEndpoint> }) =>
      mockServerApi.createEndpoint(serverId, endpoint),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: mockServerKeys.endpoints(variables.serverId) });
    },
  });
}

export function useUpdateMockEndpoint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      serverId,
      endpointId,
      endpoint,
    }: {
      serverId: string;
      endpointId: string;
      endpoint: Partial<MockEndpoint>;
    }) => mockServerApi.updateEndpoint(serverId, endpointId, endpoint),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: mockServerKeys.endpoints(variables.serverId) });
    },
  });
}

export function useDeleteMockEndpoint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ serverId, endpointId }: { serverId: string; endpointId: string }) =>
      mockServerApi.deleteEndpoint(serverId, endpointId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: mockServerKeys.endpoints(variables.serverId) });
    },
  });
}

// State management hooks
export function useCreateMockState() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      serverId,
      data,
    }: {
      serverId: string;
      data: { state_key: string; state_value: any };
    }) => mockServerApi.createState(serverId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: mockServerKeys.states(variables.serverId) });
    },
  });
}

export function useUpdateMockState() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      serverId,
      key,
      data,
    }: {
      serverId: string;
      key: string;
      data: { state_value: any };
    }) => mockServerApi.updateState(serverId, key, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: mockServerKeys.states(variables.serverId) });
      queryClient.invalidateQueries({
        queryKey: mockServerKeys.state(variables.serverId, variables.key),
      });
    },
  });
}

export function useDeleteMockState() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ serverId, key }: { serverId: string; key: string }) =>
      mockServerApi.deleteState(serverId, key),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: mockServerKeys.states(variables.serverId) });
    },
  });
}

// Request management hooks
export function useMockServerRequest(serverId: string, requestId: string) {
  return useQuery({
    queryKey: mockServerKeys.request(serverId, requestId),
    queryFn: () => mockServerApi.getRequest(serverId, requestId),
    enabled: !!serverId && !!requestId,
  });
}

export function useClearMockRequests() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (serverId: string) => mockServerApi.clearRequests(serverId),
    onSuccess: (_, serverId) => {
      queryClient.invalidateQueries({ queryKey: mockServerKeys.requests(serverId, {}) });
    },
  });
}
