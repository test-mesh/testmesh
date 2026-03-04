import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listHistory,
  getHistory,
  getHistoryStats,
  createHistory,
  saveHistory,
  unsaveHistory,
  deleteHistory,
  clearHistory,
  addHistoryTag,
  removeHistoryTag,
  type HistoryFilter,
  type RequestHistoryData,
  type ResponseHistoryData,
} from '@/lib/api/history';

// Query keys
export const historyKeys = {
  all: ['history'] as const,
  lists: () => [...historyKeys.all, 'list'] as const,
  list: (filter?: HistoryFilter, limit?: number, offset?: number) =>
    [...historyKeys.lists(), { filter, limit, offset }] as const,
  details: () => [...historyKeys.all, 'detail'] as const,
  detail: (id: string) => [...historyKeys.details(), id] as const,
  stats: () => [...historyKeys.all, 'stats'] as const,
};

// List history
export function useHistory(filter?: HistoryFilter, limit = 50, offset = 0) {
  return useQuery({
    queryKey: historyKeys.list(filter, limit, offset),
    queryFn: () => listHistory(filter, limit, offset),
  });
}

// Get single history entry
export function useHistoryEntry(id: string) {
  return useQuery({
    queryKey: historyKeys.detail(id),
    queryFn: () => getHistory(id),
    enabled: !!id,
  });
}

// Get history stats
export function useHistoryStats() {
  return useQuery({
    queryKey: historyKeys.stats(),
    queryFn: getHistoryStats,
  });
}

// Create history entry mutation
export function useCreateHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
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
    }) => createHistory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: historyKeys.all });
    },
  });
}

// Save history entry mutation
export function useSaveHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => saveHistory(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: historyKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: historyKeys.lists() });
      queryClient.invalidateQueries({ queryKey: historyKeys.stats() });
    },
  });
}

// Unsave history entry mutation
export function useUnsaveHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => unsaveHistory(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: historyKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: historyKeys.lists() });
      queryClient.invalidateQueries({ queryKey: historyKeys.stats() });
    },
  });
}

// Delete history entry mutation
export function useDeleteHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteHistory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: historyKeys.all });
    },
  });
}

// Clear all history mutation
export function useClearHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (keepSaved: boolean = true) => clearHistory(keepSaved),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: historyKeys.all });
    },
  });
}

// Add tag mutation
export function useAddHistoryTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, tag }: { id: string; tag: string }) => addHistoryTag(id, tag),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: historyKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: historyKeys.lists() });
    },
  });
}

// Remove tag mutation
export function useRemoveHistoryTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, tag }: { id: string; tag: string }) => removeHistoryTag(id, tag),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: historyKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: historyKeys.lists() });
    },
  });
}
