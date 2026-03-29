import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listDatasets,
  getDataset,
  uploadDataset,
  getDatasetContent,
  deleteDataset,
} from '@/lib/api/datasets';

export function useDatasets(params?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ['datasets', params],
    queryFn: () => listDatasets(params),
  });
}

export function useDataset(id: string) {
  return useQuery({
    queryKey: ['datasets', id],
    queryFn: () => getDataset(id),
    enabled: !!id,
  });
}

export function useDatasetContent(id: string) {
  return useQuery({
    queryKey: ['datasets', id, 'content'],
    queryFn: () => getDatasetContent(id),
    enabled: !!id,
  });
}

export function useUploadDataset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, name, description }: { file: File; name?: string; description?: string }) =>
      uploadDataset(file, name, description),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
    },
  });
}

export function useDeleteDataset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDataset(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
    },
  });
}
