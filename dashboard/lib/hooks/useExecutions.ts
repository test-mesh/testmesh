import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { executionApi } from '../api/client';
import type { CreateExecutionRequest, ExecutionStatus } from '../api/types';

// Query keys
export const executionKeys = {
  all: ['executions'] as const,
  lists: () => [...executionKeys.all, 'list'] as const,
  list: (filters: Record<string, any>) => [...executionKeys.lists(), filters] as const,
  details: () => [...executionKeys.all, 'detail'] as const,
  detail: (id: string) => [...executionKeys.details(), id] as const,
  steps: (id: string) => [...executionKeys.detail(id), 'steps'] as const,
  step: (executionId: string, stepId: string) => [
    ...executionKeys.steps(executionId),
    stepId,
  ] as const,
  logs: (id: string) => [...executionKeys.detail(id), 'logs'] as const,
};

// Hooks for executions
export function useExecutions(params?: { flow_id?: string; status?: ExecutionStatus; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: executionKeys.list(params || {}),
    queryFn: () => executionApi.list(params),
  });
}

export function useExecution(id: string, options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: executionKeys.detail(id),
    queryFn: () => executionApi.get(id),
    enabled: !!id,
    refetchInterval: options?.refetchInterval,
  });
}

export function useExecutionSteps(id: string) {
  return useQuery({
    queryKey: executionKeys.steps(id),
    queryFn: () => executionApi.getSteps(id),
    enabled: !!id,
  });
}

export function useExecutionLogs(id: string) {
  return useQuery({
    queryKey: executionKeys.logs(id),
    queryFn: () => executionApi.getLogs(id),
    enabled: !!id,
  });
}

export function useCreateExecution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateExecutionRequest) => executionApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: executionKeys.lists() });
    },
  });
}

export function useCancelExecution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => executionApi.cancel(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: executionKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: executionKeys.lists() });
    },
  });
}

export function useExecutionStep(executionId: string, stepId: string) {
  return useQuery({
    queryKey: executionKeys.step(executionId, stepId),
    queryFn: () => executionApi.getStep(executionId, stepId),
    enabled: !!executionId && !!stepId,
  });
}
