import { apiClient } from './client';

// Types
export interface Schedule {
  id: string;
  name: string;
  description?: string;
  flow_id: string;
  flow?: {
    id: string;
    name: string;
  };
  cron_expr: string;
  timezone: string;
  status: ScheduleStatus;
  environment?: Record<string, any>;
  notify_on_failure: boolean;
  notify_on_success: boolean;
  notify_emails?: string[];
  max_retries: number;
  retry_delay: string;
  allow_overlap: boolean;
  next_run_at?: string;
  last_run_at?: string;
  last_run_id?: string;
  last_run_result?: string;
  tags?: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type ScheduleStatus = 'active' | 'paused' | 'disabled';

export interface ScheduleRun {
  id: string;
  schedule_id: string;
  execution_id?: string;
  status: string;
  result?: string;
  error?: string;
  retry_count: number;
  scheduled_at: string;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  created_at: string;
}

export interface ScheduleStats {
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  skipped_runs: number;
  avg_duration_ms: number;
}

export interface CreateScheduleRequest {
  name: string;
  description?: string;
  flow_id: string;
  cron_expr: string;
  timezone?: string;
  environment?: Record<string, any>;
  notify_on_failure?: boolean;
  notify_on_success?: boolean;
  notify_emails?: string[];
  max_retries?: number;
  retry_delay?: string;
  allow_overlap?: boolean;
  tags?: string[];
}

export interface ScheduleListParams {
  status?: ScheduleStatus;
  flow_id?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface CronPreset {
  name: string;
  expr: string;
}

export interface TimezoneOption {
  id: string;
  name: string;
}

export interface ValidateCronRequest {
  cron_expr: string;
  timezone?: string;
  count?: number;
}

export interface ValidateCronResponse {
  valid: boolean;
  error?: string;
  next_run_times?: string[];
}

// API functions
export async function createSchedule(data: CreateScheduleRequest): Promise<Schedule> {
  const response = await apiClient.post('/api/v1/schedules', data);
  return response.data;
}

export async function getSchedules(params?: ScheduleListParams): Promise<{
  schedules: Schedule[];
  total: number;
  page: number;
  page_size: number;
}> {
  const response = await apiClient.get('/api/v1/schedules', { params });
  return response.data;
}

export async function getSchedule(id: string): Promise<Schedule> {
  const response = await apiClient.get(`/api/v1/schedules/${id}`);
  return response.data;
}

export async function updateSchedule(id: string, data: CreateScheduleRequest): Promise<Schedule> {
  const response = await apiClient.put(`/api/v1/schedules/${id}`, data);
  return response.data;
}

export async function deleteSchedule(id: string): Promise<void> {
  await apiClient.delete(`/api/v1/schedules/${id}`);
}

export async function pauseSchedule(id: string): Promise<void> {
  await apiClient.post(`/api/v1/schedules/${id}/pause`);
}

export async function resumeSchedule(id: string): Promise<void> {
  await apiClient.post(`/api/v1/schedules/${id}/resume`);
}

export async function triggerSchedule(id: string): Promise<{ message: string; run: ScheduleRun }> {
  const response = await apiClient.post(`/api/v1/schedules/${id}/trigger`);
  return response.data;
}

export async function getScheduleRuns(id: string, limit?: number): Promise<{
  runs: ScheduleRun[];
  total: number;
}> {
  const response = await apiClient.get(`/api/v1/schedules/${id}/runs`, {
    params: { limit },
  });
  return response.data;
}

export async function getScheduleStats(id: string, days?: number): Promise<ScheduleStats> {
  const response = await apiClient.get(`/api/v1/schedules/${id}/stats`, {
    params: { days },
  });
  return response.data;
}

export async function validateCron(data: ValidateCronRequest): Promise<ValidateCronResponse> {
  const response = await apiClient.post('/api/v1/schedules/validate-cron', data);
  return response.data;
}

export async function getCronPresets(): Promise<{ presets: CronPreset[] }> {
  const response = await apiClient.get('/api/v1/schedules/presets');
  return response.data;
}

export async function getTimezones(): Promise<{ timezones: TimezoneOption[] }> {
  const response = await apiClient.get('/api/v1/schedules/timezones');
  return response.data;
}

// Helper function to describe cron expression in human-readable format
export function describeCron(cronExpr: string): string {
  const parts = cronExpr.split(' ');

  // Handle common patterns
  if (cronExpr === '* * * * *') return 'Every minute';
  if (cronExpr === '*/5 * * * *') return 'Every 5 minutes';
  if (cronExpr === '*/15 * * * *') return 'Every 15 minutes';
  if (cronExpr === '*/30 * * * *') return 'Every 30 minutes';
  if (cronExpr === '0 * * * *') return 'Every hour';
  if (cronExpr === '0 */6 * * *') return 'Every 6 hours';
  if (cronExpr === '0 */12 * * *') return 'Every 12 hours';
  if (cronExpr === '0 0 * * *') return 'Daily at midnight';
  if (cronExpr === '0 12 * * *') return 'Daily at noon';
  if (cronExpr === '0 9 * * 1-5') return 'Weekdays at 9:00 AM';
  if (cronExpr === '0 0 * * 1') return 'Weekly on Monday';
  if (cronExpr === '0 0 1 * *') return 'Monthly on the 1st';

  // Basic parsing for other patterns
  if (parts.length >= 5) {
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    if (minute.startsWith('*/')) {
      const interval = minute.substring(2);
      return `Every ${interval} minutes`;
    }

    if (hour.startsWith('*/')) {
      const interval = hour.substring(2);
      return `Every ${interval} hours`;
    }

    if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return `Daily at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
    }
  }

  return cronExpr; // Return original if we can't parse it
}
