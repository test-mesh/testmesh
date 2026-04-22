import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  testEnvironmentApi,
  type CreateTestEnvRequest,
} from '../api/test_environments';

// Query keys
export const testEnvKeys = {
  all: ['test-environments'] as const,
  lists: () => [...testEnvKeys.all, 'list'] as const,
  list: () => [...testEnvKeys.lists()] as const,
};

// Hooks
export function useTestEnvironments() {
  return useQuery({
    queryKey: testEnvKeys.list(),
    queryFn: () => testEnvironmentApi.list(),
    refetchInterval: 10000,
  });
}

export function useCreateTestEnvironment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTestEnvRequest) => testEnvironmentApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: testEnvKeys.lists() });
    },
  });
}

export function useDestroyTestEnvironment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => testEnvironmentApi.destroy(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: testEnvKeys.lists() });
    },
  });
}
