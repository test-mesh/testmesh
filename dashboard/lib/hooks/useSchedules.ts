import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSchedules,
  getSchedule,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  pauseSchedule,
  resumeSchedule,
  triggerSchedule,
  getScheduleRuns,
  getScheduleStats,
  validateCron,
  getCronPresets,
  getTimezones,
  type Schedule,
  type ScheduleRun,
  type ScheduleStats,
  type CreateScheduleRequest,
  type ScheduleListParams,
  type ValidateCronRequest,
  type ValidateCronResponse,
  type CronPreset,
  type TimezoneOption,
} from '../api/schedules';

// Query keys
export const scheduleKeys = {
  all: ['schedules'] as const,
  lists: () => [...scheduleKeys.all, 'list'] as const,
  list: (params?: ScheduleListParams) => [...scheduleKeys.lists(), params] as const,
  details: () => [...scheduleKeys.all, 'detail'] as const,
  detail: (id: string) => [...scheduleKeys.details(), id] as const,
  runs: (id: string) => [...scheduleKeys.detail(id), 'runs'] as const,
  stats: (id: string, days?: number) => [...scheduleKeys.detail(id), 'stats', days] as const,
  presets: () => [...scheduleKeys.all, 'presets'] as const,
  timezones: () => [...scheduleKeys.all, 'timezones'] as const,
};

// Hooks
export function useSchedules(params?: ScheduleListParams) {
  return useQuery({
    queryKey: scheduleKeys.list(params),
    queryFn: () => getSchedules(params),
  });
}

export function useSchedule(id: string) {
  return useQuery({
    queryKey: scheduleKeys.detail(id),
    queryFn: () => getSchedule(id),
    enabled: !!id,
  });
}

export function useScheduleRuns(id: string, limit?: number) {
  return useQuery({
    queryKey: scheduleKeys.runs(id),
    queryFn: () => getScheduleRuns(id, limit),
    enabled: !!id,
  });
}

export function useScheduleStats(id: string, days?: number) {
  return useQuery({
    queryKey: scheduleKeys.stats(id, days),
    queryFn: () => getScheduleStats(id, days),
    enabled: !!id,
  });
}

export function useCronPresets() {
  return useQuery({
    queryKey: scheduleKeys.presets(),
    queryFn: getCronPresets,
    staleTime: Infinity, // Presets don't change
  });
}

export function useTimezones() {
  return useQuery({
    queryKey: scheduleKeys.timezones(),
    queryFn: getTimezones,
    staleTime: Infinity, // Timezones don't change
  });
}

export function useCreateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateScheduleRequest) => createSchedule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scheduleKeys.lists() });
    },
  });
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateScheduleRequest }) =>
      updateSchedule(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: scheduleKeys.lists() });
      queryClient.invalidateQueries({ queryKey: scheduleKeys.detail(variables.id) });
    },
  });
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteSchedule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scheduleKeys.lists() });
    },
  });
}

export function usePauseSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => pauseSchedule(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: scheduleKeys.lists() });
      queryClient.invalidateQueries({ queryKey: scheduleKeys.detail(id) });
    },
  });
}

export function useResumeSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => resumeSchedule(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: scheduleKeys.lists() });
      queryClient.invalidateQueries({ queryKey: scheduleKeys.detail(id) });
    },
  });
}

export function useTriggerSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => triggerSchedule(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: scheduleKeys.runs(id) });
      queryClient.invalidateQueries({ queryKey: scheduleKeys.stats(id) });
    },
  });
}

export function useValidateCron() {
  return useMutation({
    mutationFn: (data: ValidateCronRequest) => validateCron(data),
  });
}
