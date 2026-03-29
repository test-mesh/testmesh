import { apiClient } from './client';

export interface Dataset {
  id: string;
  workspace_id: string;
  name: string;
  description?: string;
  file_name: string;
  file_type: 'csv' | 'json';
  mime_type: string;
  size_bytes: number;
  row_count: number;
  columns: string[];
  created_at: string;
  updated_at: string;
}

export interface ListDatasetsResponse {
  datasets: Dataset[];
  total: number;
}

export interface DatasetContent {
  content: string;
  file_type: string;
  file_name: string;
  row_count: number;
  columns: string[];
}

export async function listDatasets(params?: {
  limit?: number;
  offset?: number;
}): Promise<ListDatasetsResponse> {
  const response = await apiClient.get('/api/v1/datasets', { params });
  return response.data;
}

export async function getDataset(id: string): Promise<Dataset> {
  const response = await apiClient.get(`/api/v1/datasets/${id}`);
  return response.data;
}

export async function uploadDataset(file: File, name?: string, description?: string): Promise<Dataset> {
  const formData = new FormData();
  formData.append('file', file);
  if (name) formData.append('name', name);
  if (description) formData.append('description', description);

  const response = await apiClient.post('/api/v1/datasets/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function getDatasetContent(id: string): Promise<DatasetContent> {
  const response = await apiClient.get(`/api/v1/datasets/${id}/content`);
  return response.data;
}

export async function deleteDataset(id: string): Promise<void> {
  await apiClient.delete(`/api/v1/datasets/${id}`);
}
