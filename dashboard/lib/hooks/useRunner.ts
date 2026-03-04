import { useMutation } from '@tanstack/react-query';
import { runCollection, parseDataFile, type CollectionRunConfig } from '@/lib/api/runner';

// Run collection mutation
export function useRunCollection() {
  return useMutation({
    mutationFn: (config: CollectionRunConfig) => runCollection(config),
  });
}

// Parse data file mutation
export function useParseDataFile() {
  return useMutation({
    mutationFn: ({ type, content }: { type: 'csv' | 'json'; content: string }) =>
      parseDataFile(type, content),
  });
}
