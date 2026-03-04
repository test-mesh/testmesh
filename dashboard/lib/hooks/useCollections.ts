import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listCollections,
  getCollectionTree,
  searchCollections,
  getCollection,
  createCollection,
  updateCollection,
  deleteCollection,
  getCollectionChildren,
  getCollectionFlows,
  addFlowToCollection,
  removeFlowFromCollection,
  getCollectionAncestors,
  moveCollection,
  duplicateCollection,
  reorderCollectionItems,
} from '@/lib/api/collections';
import type {
  CreateCollectionRequest,
  UpdateCollectionRequest,
  AddFlowToCollectionRequest,
  MoveCollectionRequest,
  ReorderItemsRequest,
} from '@/lib/api/types';

// Query keys
export const collectionKeys = {
  all: ['collections'] as const,
  lists: () => [...collectionKeys.all, 'list'] as const,
  list: (params: Record<string, unknown>) => [...collectionKeys.lists(), params] as const,
  tree: () => [...collectionKeys.all, 'tree'] as const,
  search: (query: string) => [...collectionKeys.all, 'search', query] as const,
  details: () => [...collectionKeys.all, 'detail'] as const,
  detail: (id: string) => [...collectionKeys.details(), id] as const,
  children: (id: string) => [...collectionKeys.detail(id), 'children'] as const,
  flows: (id: string) => [...collectionKeys.detail(id), 'flows'] as const,
  ancestors: (id: string) => [...collectionKeys.detail(id), 'ancestors'] as const,
};

// List collections
export function useCollections(limit = 50, offset = 0) {
  return useQuery({
    queryKey: collectionKeys.list({ limit, offset }),
    queryFn: () => listCollections(limit, offset),
  });
}

// Get collection tree
export function useCollectionTree() {
  return useQuery({
    queryKey: collectionKeys.tree(),
    queryFn: getCollectionTree,
  });
}

// Search collections
export function useSearchCollections(query: string) {
  return useQuery({
    queryKey: collectionKeys.search(query),
    queryFn: () => searchCollections(query),
    enabled: query.length > 0,
  });
}

// Get single collection
export function useCollection(id: string) {
  return useQuery({
    queryKey: collectionKeys.detail(id),
    queryFn: () => getCollection(id),
    enabled: !!id,
  });
}

// Get collection children
export function useCollectionChildren(id: string) {
  return useQuery({
    queryKey: collectionKeys.children(id),
    queryFn: () => getCollectionChildren(id),
    enabled: !!id,
  });
}

// Get collection flows
export function useCollectionFlows(id: string) {
  return useQuery({
    queryKey: collectionKeys.flows(id),
    queryFn: () => getCollectionFlows(id),
    enabled: !!id,
  });
}

// Get collection ancestors
export function useCollectionAncestors(id: string) {
  return useQuery({
    queryKey: collectionKeys.ancestors(id),
    queryFn: () => getCollectionAncestors(id),
    enabled: !!id,
  });
}

// Create collection mutation
export function useCreateCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCollectionRequest) => createCollection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: collectionKeys.all });
    },
  });
}

// Update collection mutation
export function useUpdateCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCollectionRequest }) =>
      updateCollection(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: collectionKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: collectionKeys.tree() });
    },
  });
}

// Delete collection mutation
export function useDeleteCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteCollection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: collectionKeys.all });
    },
  });
}

// Add flow to collection mutation
export function useAddFlowToCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ collectionId, data }: { collectionId: string; data: AddFlowToCollectionRequest }) =>
      addFlowToCollection(collectionId, data),
    onSuccess: (_, { collectionId }) => {
      queryClient.invalidateQueries({ queryKey: collectionKeys.flows(collectionId) });
      queryClient.invalidateQueries({ queryKey: collectionKeys.tree() });
    },
  });
}

// Remove flow from collection mutation
export function useRemoveFlowFromCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ collectionId, flowId }: { collectionId: string; flowId: string }) =>
      removeFlowFromCollection(collectionId, flowId),
    onSuccess: (_, { collectionId }) => {
      queryClient.invalidateQueries({ queryKey: collectionKeys.flows(collectionId) });
      queryClient.invalidateQueries({ queryKey: collectionKeys.tree() });
    },
  });
}

// Move collection mutation
export function useMoveCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: MoveCollectionRequest }) =>
      moveCollection(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: collectionKeys.all });
    },
  });
}

// Duplicate collection mutation
export function useDuplicateCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => duplicateCollection(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: collectionKeys.all });
    },
  });
}

// Reorder items mutation
export function useReorderCollectionItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ collectionId, data }: { collectionId: string; data: ReorderItemsRequest }) =>
      reorderCollectionItems(collectionId, data),
    onSuccess: (_, { collectionId }) => {
      queryClient.invalidateQueries({ queryKey: collectionKeys.detail(collectionId) });
      queryClient.invalidateQueries({ queryKey: collectionKeys.tree() });
    },
  });
}
