import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  addTags,
  removeTags,
  moveFlows,
  deleteFlows,
  duplicateFlows,
  exportFlows,
  findReplace,
  type BulkTagRequest,
  type BulkMoveRequest,
  type BulkDeleteRequest,
  type FindReplaceRequest,
} from '@/lib/api/bulk';

// Import flow query keys for cache invalidation
import { flowKeys } from './useFlows';

// Add tags mutation
export function useBulkAddTags() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BulkTagRequest) => addTags(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: flowKeys.lists() });
    },
  });
}

// Remove tags mutation
export function useBulkRemoveTags() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BulkTagRequest) => removeTags(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: flowKeys.lists() });
    },
  });
}

// Move flows mutation
export function useBulkMoveFlows() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BulkMoveRequest) => moveFlows(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: flowKeys.lists() });
    },
  });
}

// Delete flows mutation
export function useBulkDeleteFlows() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BulkDeleteRequest) => deleteFlows(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: flowKeys.lists() });
    },
  });
}

// Duplicate flows mutation
export function useBulkDuplicateFlows() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BulkDeleteRequest) => duplicateFlows(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: flowKeys.lists() });
    },
  });
}

// Export flows mutation (doesn't invalidate cache)
export function useBulkExportFlows() {
  return useMutation({
    mutationFn: (data: BulkDeleteRequest) => exportFlows(data),
  });
}

// Find and replace mutation
export function useFindReplace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: FindReplaceRequest) => findReplace(data),
    onSuccess: (result) => {
      // Only invalidate if we actually made replacements
      if (!result.preview && result.result.succeeded > 0) {
        queryClient.invalidateQueries({ queryKey: flowKeys.lists() });
      }
    },
  });
}

// Convenience hooks

// Hook for adding a single tag to multiple flows
export function useAddTagToFlows() {
  const mutation = useBulkAddTags();

  return {
    ...mutation,
    addTag: (flowIds: string[], tag: string) =>
      mutation.mutate({ flow_ids: flowIds, tags: [tag] }),
    addTagAsync: (flowIds: string[], tag: string) =>
      mutation.mutateAsync({ flow_ids: flowIds, tags: [tag] }),
  };
}

// Hook for removing a single tag from multiple flows
export function useRemoveTagFromFlows() {
  const mutation = useBulkRemoveTags();

  return {
    ...mutation,
    removeTag: (flowIds: string[], tag: string) =>
      mutation.mutate({ flow_ids: flowIds, tags: [tag] }),
    removeTagAsync: (flowIds: string[], tag: string) =>
      mutation.mutateAsync({ flow_ids: flowIds, tags: [tag] }),
  };
}

// Hook for moving flows to a collection
export function useMoveToCollection() {
  const mutation = useBulkMoveFlows();

  return {
    ...mutation,
    moveToCollection: (flowIds: string[], collectionId: string) =>
      mutation.mutate({ flow_ids: flowIds, collection_id: collectionId }),
    moveToCollectionAsync: (flowIds: string[], collectionId: string) =>
      mutation.mutateAsync({ flow_ids: flowIds, collection_id: collectionId }),
    removeFromCollection: (flowIds: string[]) =>
      mutation.mutate({ flow_ids: flowIds, collection_id: '' }),
    removeFromCollectionAsync: (flowIds: string[]) =>
      mutation.mutateAsync({ flow_ids: flowIds, collection_id: '' }),
  };
}
