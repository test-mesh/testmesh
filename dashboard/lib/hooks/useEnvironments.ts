import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  environmentApi,
  Environment,
  CreateEnvironmentRequest,
  UpdateEnvironmentRequest,
  EnvironmentExport,
} from '../api/environments';

// Query keys
export const environmentKeys = {
  all: ['environments'] as const,
  list: () => [...environmentKeys.all, 'list'] as const,
  detail: (id: string) => [...environmentKeys.all, 'detail', id] as const,
  default: () => [...environmentKeys.all, 'default'] as const,
};

// Hooks
export function useEnvironments() {
  return useQuery({
    queryKey: environmentKeys.list(),
    queryFn: () => environmentApi.list(),
  });
}

export function useEnvironment(id: string) {
  return useQuery({
    queryKey: environmentKeys.detail(id),
    queryFn: () => environmentApi.get(id),
    enabled: !!id,
  });
}

export function useDefaultEnvironment() {
  return useQuery({
    queryKey: environmentKeys.default(),
    queryFn: () => environmentApi.getDefault(),
  });
}

export function useCreateEnvironment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateEnvironmentRequest) => environmentApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: environmentKeys.all });
    },
  });
}

export function useUpdateEnvironment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateEnvironmentRequest }) =>
      environmentApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: environmentKeys.all });
      queryClient.invalidateQueries({ queryKey: environmentKeys.detail(id) });
    },
  });
}

export function useDeleteEnvironment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => environmentApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: environmentKeys.all });
    },
  });
}

export function useSetDefaultEnvironment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => environmentApi.setDefault(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: environmentKeys.all });
      queryClient.invalidateQueries({ queryKey: environmentKeys.default() });
    },
  });
}

export function useDuplicateEnvironment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      environmentApi.duplicate(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: environmentKeys.all });
    },
  });
}

export function useExportEnvironment() {
  return useMutation({
    mutationFn: ({ id, includeSecrets }: { id: string; includeSecrets?: boolean }) =>
      environmentApi.export(id, includeSecrets),
  });
}

export function useImportEnvironment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: EnvironmentExport) => environmentApi.import(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: environmentKeys.all });
    },
  });
}

// Active environment state (client-side only)
const ACTIVE_ENV_KEY = 'testmesh_active_environment';

export function getActiveEnvironmentId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACTIVE_ENV_KEY);
}

export function setActiveEnvironmentId(id: string | null): void {
  if (typeof window === 'undefined') return;
  if (id) {
    localStorage.setItem(ACTIVE_ENV_KEY, id);
  } else {
    localStorage.removeItem(ACTIVE_ENV_KEY);
  }
}

// Hook for active environment
export function useActiveEnvironment() {
  const { data: environments } = useEnvironments();
  const { data: defaultEnv } = useDefaultEnvironment();

  const activeId = getActiveEnvironmentId();

  // Find active environment or fall back to default
  const activeEnvironment = activeId
    ? environments?.environments.find((e) => e.id === activeId) || defaultEnv
    : defaultEnv;

  const setActiveEnvironment = (env: Environment | null) => {
    setActiveEnvironmentId(env?.id || null);
  };

  return {
    activeEnvironment,
    setActiveEnvironment,
    environments: environments?.environments || [],
  };
}
