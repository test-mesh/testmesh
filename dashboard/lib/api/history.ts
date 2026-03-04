import { apiClient } from './client';

// History types
export interface RequestHistory {
  id: string;
  flow_id?: string;
  collection_id?: string;
  method: string;
  url: string;
  request: RequestHistoryData;
  response?: ResponseHistoryData;
  status_code: number;
  duration_ms: number;
  size_bytes: number;
  error?: string;
  tags: string[];
  saved_at?: string;
  created_at: string;
}

export interface RequestHistoryData {
  method: string;
  url: string;
  headers?: Record<string, string>;
  query_params?: Record<string, string>;
  body?: string;
  body_type?: string;
  auth?: RequestHistoryAuth;
}

export interface RequestHistoryAuth {
  type: string;
  prefix?: string;
  key?: string;
  in?: string;
}

export interface ResponseHistoryData {
  status_code: number;
  status_text: string;
  headers?: Record<string, string>;
  body?: string;
  body_text?: string;
  size_bytes: number;
  time_ms: number;
  cookies?: Record<string, string>;
}

export interface HistoryFilter {
  method?: string;
  url?: string;
  status?: number;
  flow_id?: string;
  collection_id?: string;
  saved?: boolean;
  start_date?: string;
  end_date?: string;
  tags?: string[];
}

export interface HistoryStats {
  total_requests: number;
  saved_requests: number;
  today_requests: number;
  method_distribution: Record<string, number>;
}

export interface ListHistoryResponse {
  history: RequestHistory[];
  total: number;
  limit: number;
  offset: number;
}

// Create history entry
export async function createHistory(data: {
  method: string;
  url: string;
  request: RequestHistoryData;
  response?: ResponseHistoryData;
  status_code?: number;
  duration_ms?: number;
  size_bytes?: number;
  error?: string;
  tags?: string[];
  flow_id?: string;
  collection_id?: string;
}): Promise<RequestHistory> {
  const response = await apiClient.post('/api/v1/history', data);
  return response.data;
}

// List history entries
export async function listHistory(
  filter?: HistoryFilter,
  limit = 50,
  offset = 0
): Promise<ListHistoryResponse> {
  const params: Record<string, any> = { limit, offset };

  if (filter) {
    if (filter.method) params.method = filter.method;
    if (filter.url) params.url = filter.url;
    if (filter.status) params.status = filter.status;
    if (filter.flow_id) params.flow_id = filter.flow_id;
    if (filter.collection_id) params.collection_id = filter.collection_id;
    if (filter.saved) params.saved = 'true';
    if (filter.start_date) params.start_date = filter.start_date;
    if (filter.end_date) params.end_date = filter.end_date;
    if (filter.tags?.length) params.tags = filter.tags;
  }

  const response = await apiClient.get('/api/v1/history', { params });
  return response.data;
}

// Get single history entry
export async function getHistory(id: string): Promise<RequestHistory> {
  const response = await apiClient.get(`/api/v1/history/${id}`);
  return response.data;
}

// Get history stats
export async function getHistoryStats(): Promise<HistoryStats> {
  const response = await apiClient.get('/api/v1/history/stats');
  return response.data;
}

// Save history entry (mark as saved)
export async function saveHistory(id: string): Promise<void> {
  await apiClient.post(`/api/v1/history/${id}/save`);
}

// Unsave history entry
export async function unsaveHistory(id: string): Promise<void> {
  await apiClient.post(`/api/v1/history/${id}/unsave`);
}

// Delete history entry
export async function deleteHistory(id: string): Promise<void> {
  await apiClient.delete(`/api/v1/history/${id}`);
}

// Clear all history
export async function clearHistory(keepSaved = true): Promise<{ deleted: number }> {
  const response = await apiClient.delete('/api/v1/history', {
    params: { keep_saved: keepSaved ? 'true' : 'false' },
  });
  return response.data;
}

// Add tag to history entry
export async function addHistoryTag(id: string, tag: string): Promise<void> {
  await apiClient.post(`/api/v1/history/${id}/tags`, { tag });
}

// Remove tag from history entry
export async function removeHistoryTag(id: string, tag: string): Promise<void> {
  await apiClient.delete(`/api/v1/history/${id}/tags/${encodeURIComponent(tag)}`);
}
