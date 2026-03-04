import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { flowApi } from '../api/client';
import type { Flow, CreateFlowRequest, UpdateFlowRequest } from '../api/types';

// Query keys
export const flowKeys = {
  all: ['flows'] as const,
  lists: () => [...flowKeys.all, 'list'] as const,
  list: (filters: Record<string, any>) => [...flowKeys.lists(), filters] as const,
  details: () => [...flowKeys.all, 'detail'] as const,
  detail: (id: string) => [...flowKeys.details(), id] as const,
};

// Hooks for flows
export function useFlows(params?: { suite?: string; tags?: string[]; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: flowKeys.list(params || {}),
    queryFn: () => flowApi.list(params),
  });
}

export function useFlow(id: string) {
  return useQuery({
    queryKey: flowKeys.detail(id),
    queryFn: () => flowApi.get(id),
    enabled: !!id,
  });
}

export function useCreateFlow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateFlowRequest) => flowApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: flowKeys.lists() });
    },
  });
}

export function useUpdateFlow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateFlowRequest }) =>
      flowApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: flowKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: flowKeys.lists() });
    },
  });
}

export function useDeleteFlow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => flowApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: flowKeys.lists() });
    },
  });
}
