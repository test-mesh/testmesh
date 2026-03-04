import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reportsApi, analyticsApi } from '../api/reports';
import type {
  Report,
  GenerateReportRequest,
  ReportFormat,
  ReportStatus,
} from '../api/types';

// Query keys
export const reportKeys = {
  all: ['reports'] as const,
  lists: () => [...reportKeys.all, 'list'] as const,
  list: (filters: Record<string, any>) => [...reportKeys.lists(), filters] as const,
  details: () => [...reportKeys.all, 'detail'] as const,
  detail: (id: string) => [...reportKeys.details(), id] as const,
};

export const analyticsKeys = {
  all: ['analytics'] as const,
  metrics: () => [...analyticsKeys.all, 'metrics'] as const,
  metricsWithFilters: (filters: Record<string, any>) => [...analyticsKeys.metrics(), filters] as const,
  flakiness: () => [...analyticsKeys.all, 'flakiness'] as const,
  flakinessWithFilters: (filters: Record<string, any>) => [...analyticsKeys.flakiness(), filters] as const,
  trends: () => [...analyticsKeys.all, 'trends'] as const,
  trendsWithFilters: (filters: Record<string, any>) => [...analyticsKeys.trends(), filters] as const,
  steps: () => [...analyticsKeys.all, 'steps'] as const,
  stepsWithFilters: (filters: Record<string, any>) => [...analyticsKeys.steps(), filters] as const,
};

// Reports hooks
export function useReports(params?: {
  format?: ReportFormat;
  status?: ReportStatus;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: reportKeys.list(params || {}),
    queryFn: () => reportsApi.list(params),
  });
}

export function useReport(id: string) {
  return useQuery({
    queryKey: reportKeys.detail(id),
    queryFn: () => reportsApi.get(id),
    enabled: !!id,
    refetchInterval: (query) => {
      // Poll while report is generating
      const data = query.state.data as Report | undefined;
      if (data?.status === 'pending' || data?.status === 'generating') {
        return 2000;
      }
      return false;
    },
  });
}

export function useGenerateReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: GenerateReportRequest) => reportsApi.generate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportKeys.lists() });
    },
  });
}

export function useDownloadReport() {
  return useMutation({
    mutationFn: async ({ id, filename }: { id: string; filename: string }) => {
      const blob = await reportsApi.download(id);
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    },
  });
}

export function useDeleteReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => reportsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportKeys.lists() });
    },
  });
}

// Analytics hooks
export function useMetrics(params?: {
  start_date?: string;
  end_date?: string;
  environment?: string;
}) {
  return useQuery({
    queryKey: analyticsKeys.metricsWithFilters(params || {}),
    queryFn: () => analyticsApi.getMetrics(params),
  });
}

export function useFlakiness(params?: {
  flow_id?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: analyticsKeys.flakinessWithFilters(params || {}),
    queryFn: () => analyticsApi.getFlakiness(params),
  });
}

export function useTrends(params?: {
  start_date?: string;
  end_date?: string;
  environment?: string;
  group_by?: 'day' | 'week' | 'month';
}) {
  return useQuery({
    queryKey: analyticsKeys.trendsWithFilters(params || {}),
    queryFn: () => analyticsApi.getTrends(params),
  });
}

export function useStepPerformance(params?: {
  flow_id?: string;
  action?: string;
  start_date?: string;
  end_date?: string;
}) {
  return useQuery({
    queryKey: analyticsKeys.stepsWithFilters(params || {}),
    queryFn: () => analyticsApi.getStepPerformance(params),
  });
}

export function useTriggerAggregation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data?: { start_date?: string; end_date?: string }) =>
      analyticsApi.triggerAggregation(data),
    onSuccess: () => {
      // Invalidate all analytics queries
      queryClient.invalidateQueries({ queryKey: analyticsKeys.all });
    },
  });
}
