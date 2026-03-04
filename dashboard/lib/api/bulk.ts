import { apiClient } from './client';

// Bulk operation types

export interface BulkResult {
  total: number;
  succeeded: number;
  failed: number;
  errors?: string[];
}

export interface BulkTagRequest {
  flow_ids: string[];
  tags: string[];
}

export interface BulkMoveRequest {
  flow_ids: string[];
  collection_id: string; // Empty string to remove from collection
}

export interface BulkDeleteRequest {
  flow_ids: string[];
}

export interface FindReplaceRequest {
  flow_ids?: string[]; // Empty means all flows
  find: string;
  replace?: string;
  match_case?: boolean;
  whole_word?: boolean;
  in_field?: 'name' | 'description' | 'definition' | '';
  preview?: boolean;
}

export interface FindReplaceMatch {
  flow_id: string;
  flow_name: string;
  field: string;
  line?: number;
  context: string;
  match_text: string;
}

export interface FindReplaceResponse {
  matches: FindReplaceMatch[];
  result: BulkResult;
  preview: boolean;
}

export interface DuplicateResponse {
  result: BulkResult;
  new_flows: Array<{
    original_id: string;
    new_id: string;
    name: string;
  }>;
}

export interface ExportResponse {
  version: string;
  flows: Array<{
    id: string;
    name: string;
    description: string;
    tags: string[];
    suite: string;
    definition: any;
  }>;
  count: number;
}

// Bulk API functions

export async function addTags(data: BulkTagRequest): Promise<BulkResult> {
  const response = await apiClient.post('/api/v1/bulk/flows/tags/add', data);
  return response.data;
}

export async function removeTags(data: BulkTagRequest): Promise<BulkResult> {
  const response = await apiClient.post('/api/v1/bulk/flows/tags/remove', data);
  return response.data;
}

export async function moveFlows(data: BulkMoveRequest): Promise<BulkResult> {
  const response = await apiClient.post('/api/v1/bulk/flows/move', data);
  return response.data;
}

export async function deleteFlows(data: BulkDeleteRequest): Promise<BulkResult> {
  const response = await apiClient.post('/api/v1/bulk/flows/delete', data);
  return response.data;
}

export async function duplicateFlows(data: BulkDeleteRequest): Promise<DuplicateResponse> {
  const response = await apiClient.post('/api/v1/bulk/flows/duplicate', data);
  return response.data;
}

export async function exportFlows(data: BulkDeleteRequest): Promise<ExportResponse> {
  const response = await apiClient.post('/api/v1/bulk/flows/export', data);
  return response.data;
}

export async function findReplace(data: FindReplaceRequest): Promise<FindReplaceResponse> {
  const response = await apiClient.post('/api/v1/bulk/flows/find-replace', data);
  return response.data;
}

// Convenience functions

export async function bulkAddTag(flowIds: string[], tag: string): Promise<BulkResult> {
  return addTags({ flow_ids: flowIds, tags: [tag] });
}

export async function bulkRemoveTag(flowIds: string[], tag: string): Promise<BulkResult> {
  return removeTags({ flow_ids: flowIds, tags: [tag] });
}

export async function moveToCollection(flowIds: string[], collectionId: string): Promise<BulkResult> {
  return moveFlows({ flow_ids: flowIds, collection_id: collectionId });
}

export async function removeFromCollection(flowIds: string[]): Promise<BulkResult> {
  return moveFlows({ flow_ids: flowIds, collection_id: '' });
}

export async function previewFindReplace(find: string, options?: Partial<FindReplaceRequest>): Promise<FindReplaceResponse> {
  return findReplace({
    find,
    preview: true,
    ...options,
  });
}

export async function executeFindReplace(find: string, replace: string, options?: Partial<FindReplaceRequest>): Promise<FindReplaceResponse> {
  return findReplace({
    find,
    replace,
    preview: false,
    ...options,
  });
}
