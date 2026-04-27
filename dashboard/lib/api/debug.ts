import { apiClient } from './client';

export interface DebugSession {
  id: string;
  execution_id: string;
  flow_id: string;
  state: 'idle' | 'running' | 'paused' | 'stepping' | 'terminated';
  current_step?: string;
  breakpoints: Breakpoint[];
  variables: Record<string, unknown>;
  step_outputs: Record<string, unknown>;
  started_at: string;
  paused_at?: string;
  step_count: number;
}

export interface Breakpoint {
  id: string;
  step_id?: string;
  type: 'step' | 'conditional' | 'error' | 'assertion';
  condition?: string;
  log_point?: string;
  enabled: boolean;
  hit_count: number;
}

export interface StepSnapshot {
  step_id: string;
  step_name: string;
  action: string;
  config: Record<string, unknown>;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  duration: number;
  captured_at: string;
  variables: Record<string, unknown>;
}

export interface DebugState {
  state: string;
  current_step?: string;
  variables: Record<string, unknown>;
  step_outputs: Record<string, unknown>;
}

export interface StartSessionRequest {
  execution_id: string;
  flow_id: string;
}

export interface AddBreakpointRequest {
  step_id?: string;
  type?: 'step' | 'conditional' | 'error' | 'assertion';
  condition?: string;
  log_point?: string;
}

export const debugApi = {
  listSessions: async () => {
    const response = await apiClient.get<{ sessions: DebugSession[] }>('/api/v1/debug/sessions');
    return response.data;
  },

  startSession: async (data: StartSessionRequest) => {
    const response = await apiClient.post<{ session: DebugSession }>('/api/v1/debug/sessions', data);
    return response.data.session;
  },

  getSession: async (executionId: string) => {
    const response = await apiClient.get<{ session: DebugSession }>(`/api/v1/debug/sessions/${executionId}`);
    return response.data.session;
  },

  endSession: async (executionId: string) => {
    await apiClient.delete(`/api/v1/debug/sessions/${executionId}`);
  },

  getState: async (executionId: string): Promise<DebugState> => {
    const response = await apiClient.get<DebugState>(`/api/v1/debug/sessions/${executionId}/state`);
    return response.data;
  },

  getHistory: async (executionId: string) => {
    const response = await apiClient.get<{ history: StepSnapshot[] }>(`/api/v1/debug/sessions/${executionId}/history`);
    return response.data.history;
  },

  listBreakpoints: async (executionId: string) => {
    const response = await apiClient.get<{ breakpoints: Breakpoint[] }>(`/api/v1/debug/sessions/${executionId}/breakpoints`);
    return response.data.breakpoints;
  },

  addBreakpoint: async (executionId: string, data: AddBreakpointRequest) => {
    const response = await apiClient.post<{ breakpoint: Breakpoint }>(`/api/v1/debug/sessions/${executionId}/breakpoints`, data);
    return response.data.breakpoint;
  },

  removeBreakpoint: async (executionId: string, breakpointId: string) => {
    await apiClient.delete(`/api/v1/debug/sessions/${executionId}/breakpoints/${breakpointId}`);
  },

  toggleBreakpoint: async (executionId: string, breakpointId: string) => {
    const response = await apiClient.post<{ breakpoint: Breakpoint }>(`/api/v1/debug/sessions/${executionId}/breakpoints/${breakpointId}/toggle`);
    return response.data.breakpoint;
  },

  pause: async (executionId: string) => {
    await apiClient.post(`/api/v1/debug/sessions/${executionId}/pause`);
  },

  resume: async (executionId: string) => {
    await apiClient.post(`/api/v1/debug/sessions/${executionId}/resume`);
  },

  stepOver: async (executionId: string) => {
    await apiClient.post(`/api/v1/debug/sessions/${executionId}/step-over`);
  },

  stop: async (executionId: string) => {
    await apiClient.post(`/api/v1/debug/sessions/${executionId}/stop`);
  },
};
