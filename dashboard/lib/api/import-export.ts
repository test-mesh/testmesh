import { apiClient } from './client';
import type { FlowDefinition } from './types';

// Import types
export type ImportType = 'har' | 'curl' | 'postman';

export interface ImportStats {
  total_requests: number;
  successful_flows: number;
  skipped_requests: number;
}

export interface ImportResult {
  flows: FlowDefinition[];
  warnings?: string[];
  errors?: string[];
  stats: ImportStats;
}

export interface ImportFlowsRequest {
  flows: FlowDefinition[];
  suite?: string;
  tags?: string[];
  collection_id?: string;
}

export interface ImportFlowsResponse {
  created: string[];
  errors: string[];
  stats: {
    total: number;
    succeeded: number;
    failed: number;
  };
}

// Export types
export type ExportFormat = 'postman' | 'openapi' | 'har' | 'testmesh';

export interface ExportRequest {
  flow_ids: string[];
  format: ExportFormat;
  include_tests?: boolean;
  include_env?: boolean;
}

export interface ExportResult {
  format: ExportFormat;
  content: string;
  filename: string;
  mime_type: string;
}

// Parse import content (preview without saving)
export async function parseImport(type: ImportType, content: string): Promise<ImportResult> {
  const response = await apiClient.post('/api/v1/import/parse', {
    type,
    content,
    preview: true,
  });
  return response.data;
}

// Import flows (save to database)
export async function importFlows(data: ImportFlowsRequest): Promise<ImportFlowsResponse> {
  const response = await apiClient.post('/api/v1/import', data);
  return response.data;
}

// Export flows
export async function exportFlows(data: ExportRequest): Promise<ExportResult> {
  const response = await apiClient.post('/api/v1/export', data);
  return response.data;
}

// Download exported file
export function getExportDownloadUrl(flowIds: string[], format: ExportFormat): string {
  const params = new URLSearchParams();
  flowIds.forEach((id) => params.append('flow_ids', id));
  params.append('format', format);
  return `/api/v1/export/download?${params.toString()}`;
}

// Helper to download content as file
export function downloadAsFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Convenience functions

// Parse HAR file
export async function parseHAR(content: string): Promise<ImportResult> {
  return parseImport('har', content);
}

// Parse cURL command
export async function parseCURL(command: string): Promise<ImportResult> {
  return parseImport('curl', command);
}

// Parse Postman collection
export async function parsePostman(content: string): Promise<ImportResult> {
  return parseImport('postman', content);
}

// Export to Postman
export async function exportToPostman(flowIds: string[]): Promise<ExportResult> {
  return exportFlows({ flow_ids: flowIds, format: 'postman' });
}

// Export to OpenAPI
export async function exportToOpenAPI(flowIds: string[]): Promise<ExportResult> {
  return exportFlows({ flow_ids: flowIds, format: 'openapi' });
}

// Export to HAR
export async function exportToHAR(flowIds: string[]): Promise<ExportResult> {
  return exportFlows({ flow_ids: flowIds, format: 'har' });
}

// Export to TestMesh native format
export async function exportToTestMesh(flowIds: string[]): Promise<ExportResult> {
  return exportFlows({ flow_ids: flowIds, format: 'testmesh' });
}

// Export and download
export async function exportAndDownload(flowIds: string[], format: ExportFormat) {
  const result = await exportFlows({ flow_ids: flowIds, format });
  downloadAsFile(result.content, result.filename, result.mime_type);
}
