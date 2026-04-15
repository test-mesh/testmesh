import { useMutation, useQuery } from '@tanstack/react-query';
import { telemetryApi } from '../api/client';

// Query keys
export const telemetryKeys = {
  all: ['telemetry'] as const,
  traceValidation: (executionId: string) => [...telemetryKeys.all, 'validation', executionId] as const,
  spans: (params: Record<string, unknown>) => [...telemetryKeys.all, 'spans', params] as const,
  discoveredFlows: (params?: { drifted?: boolean }) => [...telemetryKeys.all, 'discovered-flows', params] as const,
  driftAlerts: () => [...telemetryKeys.all, 'drift-alerts'] as const,
};

// Hooks for telemetry data
export function useTraceValidation(executionId: string) {
  return useQuery({
    queryKey: telemetryKeys.traceValidation(executionId),
    queryFn: () => telemetryApi.getTraceValidation(executionId),
    enabled: !!executionId,
    retry: false, // Don't retry — trace validation may not exist for all executions
  });
}

export function useSpans(params?: {
  trace_id?: string;
  service?: string;
  operation?: string;
  status?: string;
}) {
  return useQuery({
    queryKey: telemetryKeys.spans(params || {}),
    queryFn: () => telemetryApi.getSpans(params),
    enabled: !!(params?.trace_id || params?.service || params?.operation),
  });
}

export function useDiscoveredFlows(params?: { drifted?: boolean }) {
  return useQuery({
    queryKey: telemetryKeys.discoveredFlows(params),
    queryFn: () => telemetryApi.getDiscoveredFlows(params),
  });
}

export function useDriftAlerts() {
  return useQuery({
    queryKey: telemetryKeys.driftAlerts(),
    queryFn: () => telemetryApi.getDriftAlerts(),
  });
}

export function useExportDiscoveredFlow() {
  return useMutation({
    mutationFn: (flowId: string) => telemetryApi.exportDiscoveredFlow(flowId),
  });
}
