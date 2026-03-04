import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  startLoadTest,
  getLoadTest,
  listLoadTests,
  stopLoadTest,
  getLoadTestMetrics,
  getLoadTestTimeline,
  type LoadTestConfig,
} from '@/lib/api/load-testing';

// Query keys
export const loadTestKeys = {
  all: ['load-tests'] as const,
  lists: () => [...loadTestKeys.all, 'list'] as const,
  details: () => [...loadTestKeys.all, 'detail'] as const,
  detail: (id: string) => [...loadTestKeys.details(), id] as const,
  metrics: (id: string) => [...loadTestKeys.all, id, 'metrics'] as const,
  timeline: (id: string) => [...loadTestKeys.all, id, 'timeline'] as const,
};

// List load tests
export function useLoadTests() {
  return useQuery({
    queryKey: loadTestKeys.lists(),
    queryFn: listLoadTests,
    refetchInterval: 5000, // Refresh every 5 seconds
  });
}

// Get single load test
export function useLoadTest(id: string | undefined, options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: loadTestKeys.detail(id!),
    queryFn: () => getLoadTest(id!),
    enabled: !!id,
    refetchInterval: options?.refetchInterval ?? 2000, // Refresh every 2 seconds by default
  });
}

// Get load test metrics
export function useLoadTestMetrics(id: string | undefined) {
  return useQuery({
    queryKey: loadTestKeys.metrics(id!),
    queryFn: () => getLoadTestMetrics(id!),
    enabled: !!id,
    refetchInterval: 2000,
  });
}

// Get load test timeline
export function useLoadTestTimeline(id: string | undefined) {
  return useQuery({
    queryKey: loadTestKeys.timeline(id!),
    queryFn: () => getLoadTestTimeline(id!),
    enabled: !!id,
    refetchInterval: 2000,
  });
}

// Start load test mutation
export function useStartLoadTest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (config: LoadTestConfig) => startLoadTest(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: loadTestKeys.lists() });
    },
  });
}

// Stop load test mutation
export function useStopLoadTest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => stopLoadTest(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: loadTestKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: loadTestKeys.lists() });
    },
  });
}
