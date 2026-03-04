import { apiClient } from './client';

// Runner types
export interface DataSource {
  type: 'csv' | 'json' | 'inline';
  content?: string;
  data?: DataRow[];
}

export type DataRow = Record<string, any>;

export interface CollectionRunConfig {
  flow_ids: string[];
  data_source?: DataSource;
  iterations?: number;
  delay_ms?: number;
  stop_on_error?: boolean;
  parallel?: number;
  variables?: Record<string, string>;
  variable_mapping?: Record<string, string>;
  environment?: string;
}

export interface CollectionRunResult {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  total_iterations: number;
  completed_iterations: number;
  passed_iterations: number;
  failed_iterations: number;
  iteration_results: IterationResult[];
  started_at: string;
  finished_at?: string;
  duration_ms: number;
  error?: string;
}

export interface IterationResult {
  iteration: number;
  data_row?: DataRow;
  flow_results: FlowRunResult[];
  status: 'passed' | 'failed';
  started_at: string;
  finished_at: string;
  duration_ms: number;
  error?: string;
}

export interface FlowRunResult {
  flow_id: string;
  flow_name: string;
  execution_id: string;
  status: string;
  duration_ms: number;
  error?: string;
}

export interface ParseDataResponse {
  columns: string[];
  preview: DataRow[];
  total_rows: number;
}

// Run a collection with data
export async function runCollection(config: CollectionRunConfig): Promise<CollectionRunResult> {
  const response = await apiClient.post('/runner/run', config);
  return response.data;
}

// Parse a data file
export async function parseDataFile(
  type: 'csv' | 'json',
  content: string
): Promise<ParseDataResponse> {
  const response = await apiClient.post('/runner/parse-data', { type, content });
  return response.data;
}
