import { apiClient } from './client';
import type {
  Collection,
  CollectionTreeNode,
  CreateCollectionRequest,
  UpdateCollectionRequest,
  ListCollectionsResponse,
  GetCollectionTreeResponse,
  AddFlowToCollectionRequest,
  MoveCollectionRequest,
  ReorderItemsRequest,
  Flow,
} from './types';

// List root collections (no parent)
export async function listCollections(limit = 50, offset = 0): Promise<ListCollectionsResponse> {
  const response = await apiClient.get('/api/v1/collections', {
    params: { limit, offset },
  });
  return response.data;
}

// Get collection tree
export async function getCollectionTree(): Promise<GetCollectionTreeResponse> {
  const response = await apiClient.get('/api/v1/collections/tree');
  return response.data;
}

// Search collections
export async function searchCollections(query: string): Promise<{ collections: Collection[] }> {
  const response = await apiClient.get('/api/v1/collections/search', {
    params: { q: query },
  });
  return response.data;
}

// Get a single collection
export async function getCollection(id: string): Promise<Collection> {
  const response = await apiClient.get(`/api/v1/collections/${id}`);
  return response.data;
}

// Create a collection
export async function createCollection(data: CreateCollectionRequest): Promise<Collection> {
  const response = await apiClient.post('/api/v1/collections', data);
  return response.data;
}

// Update a collection
export async function updateCollection(
  id: string,
  data: UpdateCollectionRequest
): Promise<Collection> {
  const response = await apiClient.put(`/api/v1/collections/${id}`, data);
  return response.data;
}

// Delete a collection
export async function deleteCollection(id: string): Promise<void> {
  await apiClient.delete(`/api/v1/collections/${id}`);
}

// Get collection children
export async function getCollectionChildren(id: string): Promise<{ children: Collection[] }> {
  const response = await apiClient.get(`/api/v1/collections/${id}/children`);
  return response.data;
}

// Get collection flows
export async function getCollectionFlows(id: string): Promise<{ flows: Flow[] }> {
  const response = await apiClient.get(`/api/v1/collections/${id}/flows`);
  return response.data;
}

// Add flow to collection
export async function addFlowToCollection(
  collectionId: string,
  data: AddFlowToCollectionRequest
): Promise<void> {
  await apiClient.post(`/api/v1/collections/${collectionId}/flows`, data);
}

// Remove flow from collection
export async function removeFlowFromCollection(
  collectionId: string,
  flowId: string
): Promise<void> {
  await apiClient.delete(`/api/v1/collections/${collectionId}/flows/${flowId}`);
}

// Get collection ancestors (for breadcrumb)
export async function getCollectionAncestors(id: string): Promise<{ ancestors: Collection[] }> {
  const response = await apiClient.get(`/api/v1/collections/${id}/ancestors`);
  return response.data;
}

// Move collection to a new parent
export async function moveCollection(
  id: string,
  data: MoveCollectionRequest
): Promise<Collection> {
  const response = await apiClient.post(`/api/v1/collections/${id}/move`, data);
  return response.data;
}

// Duplicate a collection
export async function duplicateCollection(
  id: string,
  newName: string
): Promise<Collection> {
  const response = await apiClient.post(`/api/v1/collections/${id}/duplicate`, { name: newName });
  return response.data;
}

// Reorder items in a collection
export async function reorderCollectionItems(
  collectionId: string,
  data: ReorderItemsRequest
): Promise<void> {
  await apiClient.post(`/api/v1/collections/${collectionId}/reorder`, data);
}
