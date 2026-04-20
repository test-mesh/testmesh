import { useMutation, useQuery } from '@tanstack/react-query';
import { telemetryApi } from '../api/client';

export const coverageKeys = {
  all: ['coverage'] as const,
  gaps: (workspaceId: string, params?: object) => [...coverageKeys.all, 'gaps', workspaceId, params] as const,
};

export function useCoverageGaps(workspaceId: string | null, params?: {
  uncovered?: boolean;
  sort?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: coverageKeys.gaps(workspaceId ?? '', params),
    queryFn: () => telemetryApi.getCoverageGaps(workspaceId!, params),
    enabled: !!workspaceId,
  });
}

export function useGenerateFlow() {
  return useMutation({
    mutationFn: ({ workspaceId, traceId }: { workspaceId: string; traceId: string }) =>
      telemetryApi.generateFlow(workspaceId, traceId),
  });
}
