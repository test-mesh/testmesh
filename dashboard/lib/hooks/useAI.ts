import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aiApi } from '../api/ai';
import type {
  GenerateFlowRequest,
  ImportOpenAPIRequest,
  AnalyzeCoverageRequest,
  SuggestionStatus,
  AIProviderType,
  GenerationStatus,
} from '../api/types';

// Query keys
export const aiKeys = {
  all: ['ai'] as const,
  providers: () => [...aiKeys.all, 'providers'] as const,
  usage: () => [...aiKeys.all, 'usage'] as const,
  suggestions: () => [...aiKeys.all, 'suggestions'] as const,
  suggestionsList: (flowId: string, status?: SuggestionStatus) =>
    [...aiKeys.suggestions(), 'list', flowId, status] as const,
  suggestionDetail: (id: string) => [...aiKeys.suggestions(), 'detail', id] as const,
  generationHistory: () => [...aiKeys.all, 'generation-history'] as const,
  generationHistoryList: (filters: Record<string, any>) =>
    [...aiKeys.generationHistory(), 'list', filters] as const,
  generationHistoryDetail: (id: string) => [...aiKeys.generationHistory(), 'detail', id] as const,
  importHistory: () => [...aiKeys.all, 'import-history'] as const,
  importHistoryList: (filters: Record<string, any>) =>
    [...aiKeys.importHistory(), 'list', filters] as const,
  importHistoryDetail: (id: string) => [...aiKeys.importHistory(), 'detail', id] as const,
  coverageAnalysis: () => [...aiKeys.all, 'coverage-analysis'] as const,
  coverageAnalysisList: (filters: Record<string, any>) =>
    [...aiKeys.coverageAnalysis(), 'list', filters] as const,
  coverageAnalysisDetail: (id: string) => [...aiKeys.coverageAnalysis(), 'detail', id] as const,
};

// Provider hooks
export function useAIProviders() {
  return useQuery({
    queryKey: aiKeys.providers(),
    queryFn: () => aiApi.getProviders(),
  });
}

export function useAIUsage() {
  return useQuery({
    queryKey: aiKeys.usage(),
    queryFn: () => aiApi.getUsage(),
  });
}

// Generation hooks
export function useGenerateFlow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: GenerateFlowRequest) => aiApi.generate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiKeys.usage() });
    },
  });
}

// Import hooks
export function useImportOpenAPI() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ImportOpenAPIRequest) => aiApi.importOpenAPI(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      queryClient.invalidateQueries({ queryKey: aiKeys.usage() });
    },
  });
}

export function useImportPostman() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { collection: string; provider?: AIProviderType; model?: string; create_flows?: boolean }) =>
      aiApi.importPostman(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      queryClient.invalidateQueries({ queryKey: aiKeys.usage() });
    },
  });
}

export function useImportPact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { contract: string; provider?: AIProviderType; model?: string; create_flows?: boolean }) =>
      aiApi.importPact(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      queryClient.invalidateQueries({ queryKey: aiKeys.usage() });
    },
  });
}

// Coverage hooks
export function useAnalyzeCoverage() {
  return useMutation({
    mutationFn: (data: AnalyzeCoverageRequest) => aiApi.analyzeCoverage(data),
  });
}

// Self-healing hooks
export function useAnalyzeFailure() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (executionId: string) => aiApi.analyzeFailure(executionId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: aiKeys.suggestionsList(data.flow_id),
      });
    },
  });
}

export function useSuggestions(flowId: string, status?: SuggestionStatus) {
  return useQuery({
    queryKey: aiKeys.suggestionsList(flowId, status),
    queryFn: () => aiApi.listSuggestions({ flow_id: flowId, status }),
    enabled: !!flowId,
  });
}

export function useSuggestion(id: string) {
  return useQuery({
    queryKey: aiKeys.suggestionDetail(id),
    queryFn: () => aiApi.getSuggestion(id),
    enabled: !!id,
  });
}

export function useApplySuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => aiApi.applySuggestion(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: aiKeys.suggestions() });
      queryClient.invalidateQueries({ queryKey: ['flows', 'detail', data.flow_id] });
    },
  });
}

export function useAcceptSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => aiApi.acceptSuggestion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiKeys.suggestions() });
    },
  });
}

export function useRejectSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => aiApi.rejectSuggestion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiKeys.suggestions() });
    },
  });
}

export function useDeleteSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => aiApi.deleteSuggestion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiKeys.suggestions() });
    },
  });
}

// Generation History hooks
export function useGenerationHistory(params?: {
  status?: GenerationStatus;
  provider?: AIProviderType;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: aiKeys.generationHistoryList(params || {}),
    queryFn: () => aiApi.listGenerationHistory(params),
  });
}

export function useGenerationHistoryDetail(id: string) {
  return useQuery({
    queryKey: aiKeys.generationHistoryDetail(id),
    queryFn: () => aiApi.getGenerationHistory(id),
    enabled: !!id,
  });
}

// Import History hooks
export function useImportHistory(params?: {
  source_type?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: aiKeys.importHistoryList(params || {}),
    queryFn: () => aiApi.listImportHistory(params),
  });
}

export function useImportHistoryDetail(id: string) {
  return useQuery({
    queryKey: aiKeys.importHistoryDetail(id),
    queryFn: () => aiApi.getImportHistory(id),
    enabled: !!id,
  });
}

// Coverage Analysis hooks
export function useCoverageAnalyses(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: aiKeys.coverageAnalysisList(params || {}),
    queryFn: () => aiApi.listCoverageAnalyses(params),
  });
}

export function useCoverageAnalysisDetail(id: string) {
  return useQuery({
    queryKey: aiKeys.coverageAnalysisDetail(id),
    queryFn: () => aiApi.getCoverageAnalysis(id),
    enabled: !!id,
  });
}
