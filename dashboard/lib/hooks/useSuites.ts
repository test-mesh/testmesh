import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  suiteApi,
  type Suite,
  type SuiteRun,
  type CreateSuiteRequest,
  type SuiteListParams,
} from '../api/suites';
import { useActiveWorkspace } from './useWorkspaces';

// Query keys
export const suiteKeys = {
  all: ['suites'] as const,
  lists: () => [...suiteKeys.all, 'list'] as const,
  list: (workspaceId: string, params?: SuiteListParams) =>
    [...suiteKeys.lists(), workspaceId, params] as const,
  details: () => [...suiteKeys.all, 'detail'] as const,
  detail: (id: string) => [...suiteKeys.details(), id] as const,
  runs: (id: string) => [...suiteKeys.detail(id), 'runs'] as const,
  run: (suiteId: string, runId: string) => [...suiteKeys.runs(suiteId), runId] as const,
};

// Hooks
export function useSuites(params?: SuiteListParams) {
  const { activeWorkspaceId } = useActiveWorkspace();
  return useQuery({
    queryKey: suiteKeys.list(activeWorkspaceId ?? '', params),
    queryFn: () => suiteApi.list(activeWorkspaceId!, params),
    enabled: !!activeWorkspaceId,
  });
}

export function useSuite(id: string) {
  const { activeWorkspaceId } = useActiveWorkspace();
  return useQuery({
    queryKey: suiteKeys.detail(id),
    queryFn: () => suiteApi.get(activeWorkspaceId!, id),
    enabled: !!id && !!activeWorkspaceId,
  });
}

export function useSuiteRuns(suiteId: string, limit?: number) {
  const { activeWorkspaceId } = useActiveWorkspace();
  return useQuery({
    queryKey: suiteKeys.runs(suiteId),
    queryFn: () => suiteApi.listRuns(activeWorkspaceId!, suiteId, { limit }),
    enabled: !!suiteId && !!activeWorkspaceId,
  });
}

export function useCreateSuite() {
  const { activeWorkspaceId } = useActiveWorkspace();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSuiteRequest) => suiteApi.create(activeWorkspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: suiteKeys.lists() });
    },
  });
}

export function useUpdateSuite() {
  const { activeWorkspaceId } = useActiveWorkspace();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateSuiteRequest }) =>
      suiteApi.update(activeWorkspaceId!, id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: suiteKeys.lists() });
      queryClient.invalidateQueries({ queryKey: suiteKeys.detail(variables.id) });
    },
  });
}

export function useDeleteSuite() {
  const { activeWorkspaceId } = useActiveWorkspace();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => suiteApi.delete(activeWorkspaceId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: suiteKeys.lists() });
    },
  });
}

export function useRunSuite() {
  const { activeWorkspaceId } = useActiveWorkspace();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => suiteApi.run(activeWorkspaceId!, id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: suiteKeys.runs(id) });
    },
  });
}
