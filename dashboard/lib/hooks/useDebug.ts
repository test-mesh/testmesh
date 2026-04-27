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
    queryKey: debugKeys.session(executionId!),
    queryFn: () => debugApi.getSession(executionId!),
    enabled: !!executionId,
    refetchInterval: 2000,
  });
}

export function useDebugState(executionId: string | undefined) {
  return useQuery({
    queryKey: debugKeys.state(executionId!),
    queryFn: () => debugApi.getState(executionId!),
    enabled: !!executionId,
    refetchInterval: 2000,
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: debugKeys.sessions() }); },
  });
}

export function useAddBreakpoint(executionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AddBreakpointRequest) => debugApi.addBreakpoint(executionId, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: debugKeys.breakpoints(executionId) }); },
  });
}

export function useRemoveBreakpoint(executionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (breakpointId: string) => debugApi.removeBreakpoint(executionId, breakpointId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: debugKeys.breakpoints(executionId) }); },
  });
}

export function useToggleBreakpoint(executionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (breakpointId: string) => debugApi.toggleBreakpoint(executionId, breakpointId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: debugKeys.breakpoints(executionId) }); },
  });
}

export function usePause(executionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => debugApi.pause(executionId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: debugKeys.session(executionId) }); },
  });
}

export function useResume(executionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => debugApi.resume(executionId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: debugKeys.session(executionId) }); },
  });
}

export function useStepOver(executionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => debugApi.stepOver(executionId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: debugKeys.session(executionId) }); },
  });
}

export function useStop(executionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => debugApi.stop(executionId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: debugKeys.sessions() }); },
  });
}
