import { apiClient } from './client';

// Load testing types
export interface LoadTestConfig {
  flow_ids: string[];
  virtual_users: number;
  duration_sec: number;
  ramp_up_sec?: number;
  ramp_down_sec?: number;
  think_time_ms?: number;
  variables?: Record<string, string>;
  environment?: string;
}

export interface ResponseTimeMetrics {
  min_ms: number;
  max_ms: number;
  avg_ms: number;
  median_ms: number;
  p90_ms: number;
  p95_ms: number;
  p99_ms: number;
}

export interface ThroughputMetrics {
  requests_per_second: number;
  bytes_sent: number;
  bytes_received: number;
}

export interface LoadTestMetrics {
  response_times: ResponseTimeMetrics;
  throughput: ThroughputMetrics;
  error_rate: number;
  active_vus: number;
}

export interface TimelinePoint {
  timestamp: string;
  active_vus: number;
  requests_per_second: number;
  avg_response_time_ms: number;
  error_rate: number;
}

export interface LoadTestError {
  timestamp: string;
  flow_id: string;
  flow_name: string;
  error: string;
  count: number;
}

export interface LoadTestResult {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  started_at: string;
  finished_at?: string;
  duration_ms: number;
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  requests_per_second: number;
  metrics: LoadTestMetrics;
  timeline: TimelinePoint[];
  errors?: LoadTestError[];
}

export interface StartLoadTestResponse {
  id: string;
  status: string;
  message: string;
}

export interface ListLoadTestsResponse {
  tests: LoadTestResult[];
  total: number;
}

// API functions

export async function startLoadTest(config: LoadTestConfig): Promise<StartLoadTestResponse> {
  const response = await apiClient.post('/api/v1/load-tests', config);
  return response.data;
}

export async function getLoadTest(id: string): Promise<LoadTestResult> {
  const response = await apiClient.get(`/api/v1/load-tests/${id}`);
  return response.data;
}

export async function listLoadTests(): Promise<ListLoadTestsResponse> {
  const response = await apiClient.get('/api/v1/load-tests');
  return response.data;
}

export async function stopLoadTest(id: string): Promise<{ message: string; status: string }> {
  const response = await apiClient.post(`/api/v1/load-tests/${id}/stop`);
  return response.data;
}

export async function getLoadTestMetrics(id: string): Promise<LoadTestMetrics> {
  const response = await apiClient.get(`/api/v1/load-tests/${id}/metrics`);
  return response.data;
}

export async function getLoadTestTimeline(id: string): Promise<{ timeline: TimelinePoint[] }> {
  const response = await apiClient.get(`/api/v1/load-tests/${id}/timeline`);
  return response.data;
}
