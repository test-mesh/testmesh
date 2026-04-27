import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  debugApi,
  type StartSessionRequest,
  type AddBreakpointRequest,
} from '../api/debug';

export const debugKeys = {
  all: ['debug'] as const,
  sessions: () => [...debugKeys.all, 'sessions'] as const,
  session: (id: string) => [...debugKeys.all, 'session', id] as const,
  state: (id: string) => [...debugKeys.all, 'state', id] as const,
  history: (id: string) => [...debugKeys.all, 'history', id] as const,
  breakpoints: (id: string) => [...debugKeys.all, 'breakpoints', id] as const,
};

export function useDebugSessions() {
  return useQuery({
    queryKey: debugKeys.sessions(),
    queryFn: () => debugApi.listSessions(),
    refetchInterval: 5000,
  });
}

export function useDebugSession(executionId: string | undefined) {
  return useQuery({
    queryKey: debugKeys.session(executionId ?? ''),
    queryFn: () => debugApi.getSession(executionId!),
    enabled: !!executionId,
    refetchInterval: (query) => {
      const state = (query.state.data as { state?: string } | undefined)?.state;
      return state === 'terminated' || state === 'idle' ? false : 2000;
    },
  });
}

export function useDebugState(executionId: string | undefined) {
  return useQuery({
    queryKey: debugKeys.state(executionId ?? ''),
    queryFn: () => debugApi.getState(executionId!),
    enabled: !!executionId,
    refetchInterval: (query) => {
      const state = (query.state.data as { state?: string } | undefined)?.state;
      return state === 'terminated' || state === 'idle' ? false : 2000;
    },
  });
}

export function useDebugHistory(executionId: string | undefined) {
  return useQuery({
    queryKey: debugKeys.history(executionId!),
    queryFn: () => debugApi.getHistory(executionId!),
    enabled: !!executionId,
  });
}

export function useBreakpoints(executionId: string | undefined) {
  return useQuery({
    queryKey: debugKeys.breakpoints(executionId!),
    queryFn: () => debugApi.listBreakpoints(executionId!),
    enabled: !!executionId,
  });
}

export function useStartDebugSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: StartSessionRequest) => debugApi.startSession(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: debugKeys.sessions() }); },
  });
}

export function useEndDebugSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (executionId: string) => debugApi.endSession(executionId),
    onSuccess: (_, executionId) => {
      queryClient.invalidateQueries({ queryKey: debugKeys.sessions() });
      queryClient.invalidateQueries({ queryKey: debugKeys.session(executionId) });
      queryClient.invalidateQueries({ queryKey: debugKeys.state(executionId) });
    },
  });
}

export function usePause() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (executionId: string) => debugApi.pause(executionId),
    onSuccess: (_, executionId) => {
      queryClient.invalidateQueries({ queryKey: debugKeys.session(executionId) });
      queryClient.invalidateQueries({ queryKey: debugKeys.state(executionId) });
    },
  });
}

export function useResume() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (executionId: string) => debugApi.resume(executionId),
    onSuccess: (_, executionId) => {
      queryClient.invalidateQueries({ queryKey: debugKeys.session(executionId) });
      queryClient.invalidateQueries({ queryKey: debugKeys.state(executionId) });
    },
  });
}

export function useStepOver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (executionId: string) => debugApi.stepOver(executionId),
    onSuccess: (_, executionId) => {
      queryClient.invalidateQueries({ queryKey: debugKeys.session(executionId) });
      queryClient.invalidateQueries({ queryKey: debugKeys.state(executionId) });
    },
  });
}

export function useStop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (executionId: string) => debugApi.stop(executionId),
    onSuccess: (_, executionId) => {
      queryClient.invalidateQueries({ queryKey: debugKeys.sessions() });
      queryClient.invalidateQueries({ queryKey: debugKeys.session(executionId) });
      queryClient.invalidateQueries({ queryKey: debugKeys.state(executionId) });
    },
  });
}

export function useAddBreakpoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ executionId, data }: { executionId: string; data: AddBreakpointRequest }) =>
      debugApi.addBreakpoint(executionId, data),
    onSuccess: (_, { executionId }) => {
      queryClient.invalidateQueries({ queryKey: debugKeys.breakpoints(executionId) });
    },
  });
}

export function useRemoveBreakpoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ executionId, breakpointId }: { executionId: string; breakpointId: string }) =>
      debugApi.removeBreakpoint(executionId, breakpointId),
    onSuccess: (_, { executionId }) => {
      queryClient.invalidateQueries({ queryKey: debugKeys.breakpoints(executionId) });
    },
  });
}

export function useToggleBreakpoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ executionId, breakpointId }: { executionId: string; breakpointId: string }) =>
      debugApi.toggleBreakpoint(executionId, breakpointId),
    onSuccess: (_, { executionId }) => {
      queryClient.invalidateQueries({ queryKey: debugKeys.breakpoints(executionId) });
    },
  });
}
