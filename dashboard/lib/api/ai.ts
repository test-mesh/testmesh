import axios from 'axios';
import type {
  GenerateFlowRequest,
  GenerateFlowResponse,
  ImportOpenAPIRequest,
  ImportResponse,
  AnalyzeCoverageRequest,
  AnalyzeCoverageResponse,
  AnalyzeFailureResponse,
  Suggestion,
  ListSuggestionsResponse,
  GetUsageResponse,
  AIProviderType,
  SuggestionStatus,
  GenerationStatus,
  GenerationHistory,
  ImportHistory,
  CoverageAnalysis,
  ListGenerationHistoryResponse,
  ListImportHistoryResponse,
  ListCoverageAnalysisResponse,
} from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5016';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000, // 2 minutes for AI operations
  headers: {
    'Content-Type': 'application/json',
  },
});

export const aiApi = {
  // Flow generation
  generate: async (data: GenerateFlowRequest): Promise<GenerateFlowResponse> => {
    const response = await apiClient.post<GenerateFlowResponse>('/api/v1/ai/generate', data);
    return response.data;
  },

  // Imports
  importOpenAPI: async (data: ImportOpenAPIRequest): Promise<ImportResponse> => {
    const response = await apiClient.post<ImportResponse>('/api/v1/ai/import/openapi', data);
    return response.data;
  },

  importPostman: async (data: { collection: string; provider?: AIProviderType; model?: string; create_flows?: boolean }): Promise<ImportResponse> => {
    const response = await apiClient.post<ImportResponse>('/api/v1/ai/import/postman', data);
    return response.data;
  },

  importPact: async (data: { contract: string; provider?: AIProviderType; model?: string; create_flows?: boolean }): Promise<ImportResponse> => {
    const response = await apiClient.post<ImportResponse>('/api/v1/ai/import/pact', data);
    return response.data;
  },

  // Coverage analysis
  analyzeCoverage: async (data: AnalyzeCoverageRequest): Promise<AnalyzeCoverageResponse> => {
    const response = await apiClient.post<AnalyzeCoverageResponse>('/api/v1/ai/coverage/analyze', data);
    return response.data;
  },

  // Self-healing
  analyzeFailure: async (executionId: string): Promise<AnalyzeFailureResponse> => {
    const response = await apiClient.post<AnalyzeFailureResponse>(`/api/v1/ai/analyze/${executionId}`);
    return response.data;
  },

  // Suggestions
  listSuggestions: async (params: { flow_id: string; status?: SuggestionStatus }): Promise<ListSuggestionsResponse> => {
    const response = await apiClient.get<ListSuggestionsResponse>('/api/v1/ai/suggestions', { params });
    return response.data;
  },

  getSuggestion: async (id: string): Promise<Suggestion> => {
    const response = await apiClient.get<Suggestion>(`/api/v1/ai/suggestions/${id}`);
    return response.data;
  },

  applySuggestion: async (id: string): Promise<{ suggestion_id: string; flow_id: string; success: boolean; applied_yaml: string }> => {
    const response = await apiClient.post(`/api/v1/ai/suggestions/${id}/apply`);
    return response.data;
  },

  acceptSuggestion: async (id: string): Promise<{ status: string }> => {
    const response = await apiClient.post(`/api/v1/ai/suggestions/${id}/accept`);
    return response.data;
  },

  rejectSuggestion: async (id: string): Promise<{ status: string }> => {
    const response = await apiClient.post(`/api/v1/ai/suggestions/${id}/reject`);
    return response.data;
  },

  // Usage & Providers
  getUsage: async (): Promise<GetUsageResponse> => {
    const response = await apiClient.get<GetUsageResponse>('/api/v1/ai/usage');
    return response.data;
  },

  getProviders: async (): Promise<{ providers: AIProviderType[] }> => {
    const response = await apiClient.get<{ providers: AIProviderType[] }>('/api/v1/ai/providers');
    return response.data;
  },

  // Generation History
  listGenerationHistory: async (params?: {
    status?: GenerationStatus;
    provider?: AIProviderType;
    limit?: number;
    offset?: number;
  }): Promise<ListGenerationHistoryResponse> => {
    const response = await apiClient.get<ListGenerationHistoryResponse>('/api/v1/ai/generation-history', { params });
    return response.data;
  },

  getGenerationHistory: async (id: string): Promise<GenerationHistory> => {
    const response = await apiClient.get<GenerationHistory>(`/api/v1/ai/generation-history/${id}`);
    return response.data;
  },

  // Import History
  listImportHistory: async (params?: {
    source_type?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<ListImportHistoryResponse> => {
    const response = await apiClient.get<ListImportHistoryResponse>('/api/v1/ai/import-history', { params });
    return response.data;
  },

  getImportHistory: async (id: string): Promise<ImportHistory> => {
    const response = await apiClient.get<ImportHistory>(`/api/v1/ai/import-history/${id}`);
    return response.data;
  },

  // Coverage Analysis
  listCoverageAnalyses: async (params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<ListCoverageAnalysisResponse> => {
    const response = await apiClient.get<ListCoverageAnalysisResponse>('/api/v1/ai/coverage-analysis', { params });
    return response.data;
  },

  getCoverageAnalysis: async (id: string): Promise<CoverageAnalysis> => {
    const response = await apiClient.get<CoverageAnalysis>(`/api/v1/ai/coverage-analysis/${id}`);
    return response.data;
  },

  // Delete Suggestion
  deleteSuggestion: async (id: string): Promise<{ message: string }> => {
    const response = await apiClient.delete<{ message: string }>(`/api/v1/ai/suggestions/${id}`);
    return response.data;
  },
};

export default aiApi;
