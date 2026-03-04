import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  parseImport,
  importFlows,
  exportFlows,
  type ImportType,
  type ImportFlowsRequest,
  type ExportRequest,
} from '@/lib/api/import-export';
import { flowKeys } from './useFlows';

// Parse import content mutation
export function useParseImport() {
  return useMutation({
    mutationFn: ({ type, content }: { type: ImportType; content: string }) =>
      parseImport(type, content),
  });
}

// Import flows mutation
export function useImportFlows() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ImportFlowsRequest) => importFlows(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: flowKeys.lists() });
    },
  });
}

// Export flows mutation
export function useExportFlows() {
  return useMutation({
    mutationFn: (data: ExportRequest) => exportFlows(data),
  });
}

// Convenience hooks

export function useParseHAR() {
  const mutation = useParseImport();
  return {
    ...mutation,
    parseHAR: (content: string) => mutation.mutate({ type: 'har', content }),
    parseHARAsync: (content: string) => mutation.mutateAsync({ type: 'har', content }),
  };
}

export function useParseCURL() {
  const mutation = useParseImport();
  return {
    ...mutation,
    parseCURL: (content: string) => mutation.mutate({ type: 'curl', content }),
    parseCURLAsync: (content: string) => mutation.mutateAsync({ type: 'curl', content }),
  };
}

export function useParsePostman() {
  const mutation = useParseImport();
  return {
    ...mutation,
    parsePostman: (content: string) => mutation.mutate({ type: 'postman', content }),
    parsePostmanAsync: (content: string) => mutation.mutateAsync({ type: 'postman', content }),
  };
}
