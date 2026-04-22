import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  suiteApi,
  type Suite,
  type SuiteRun,
  type CreateSuiteRequest,
  type SuiteListParams,
} from '../api/suites';

// Query keys
export const suiteKeys = {
  all: ['suites'] as const,
  lists: () => [...suiteKeys.all, 'list'] as const,
  list: (params?: SuiteListParams) => [...suiteKeys.lists(), params] as const,
  details: () => [...suiteKeys.all, 'detail'] as const,
  detail: (id: string) => [...suiteKeys.details(), id] as const,
  runs: (id: string) => [...suiteKeys.detail(id), 'runs'] as const,
  run: (suiteId: string, runId: string) => [...suiteKeys.runs(suiteId), runId] as const,
};

// Hooks
export function useSuites(params?: SuiteListParams) {
  return useQuery({
    queryKey: suiteKeys.list(params),
    queryFn: () => suiteApi.list(params),
  });
}

export function useSuite(id: string) {
  return useQuery({
    queryKey: suiteKeys.detail(id),
    queryFn: () => suiteApi.get(id),
    enabled: !!id,
  });
}

export function useSuiteRuns(suiteId: string, limit?: number) {
  return useQuery({
    queryKey: suiteKeys.runs(suiteId),
    queryFn: () => suiteApi.listRuns(suiteId, { limit }),
    enabled: !!suiteId,
  });
}

export function useCreateSuite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSuiteRequest) => suiteApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: suiteKeys.lists() });
    },
  });
}

export function useUpdateSuite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateSuiteRequest }) =>
      suiteApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: suiteKeys.lists() });
      queryClient.invalidateQueries({ queryKey: suiteKeys.detail(variables.id) });
    },
  });
}

export function useDeleteSuite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => suiteApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: suiteKeys.lists() });
    },
  });
}

export function useRunSuite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => suiteApi.run(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: suiteKeys.runs(id) });
    },
  });
}
