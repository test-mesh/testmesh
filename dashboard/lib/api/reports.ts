import axios from 'axios';
import type {
  Report,
  GenerateReportRequest,
  ListReportsResponse,
  GetMetricsResponse,
  GetFlakinessResponse,
  GetFlakinessHistoryResponse,
  GetTrendsResponse,
  GetStepPerformanceResponse,
  ReportFormat,
  ReportStatus,
} from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5016';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Reports API
export const reportsApi = {
  generate: async (data: GenerateReportRequest): Promise<Report> => {
    const response = await apiClient.post<Report>('/api/v1/reports/generate', data);
    return response.data;
  },

  list: async (params?: {
    format?: ReportFormat;
    status?: ReportStatus;
    limit?: number;
    offset?: number;
  }): Promise<ListReportsResponse> => {
    const response = await apiClient.get<ListReportsResponse>('/api/v1/reports', { params });
    return response.data;
  },

  get: async (id: string): Promise<Report> => {
    const response = await apiClient.get<Report>(`/api/v1/reports/${id}`);
    return response.data;
  },

  download: async (id: string): Promise<Blob> => {
    const response = await apiClient.get(`/api/v1/reports/${id}/download`, {
      responseType: 'blob',
    });
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/reports/${id}`);
  },
};

// Analytics API
export const analyticsApi = {
  getMetrics: async (params?: {
    start_date?: string;
    end_date?: string;
    environment?: string;
  }): Promise<GetMetricsResponse> => {
    const response = await apiClient.get<GetMetricsResponse>('/api/v1/analytics/metrics', { params });
    return response.data;
  },

  getFlakiness: async (params?: {
    flow_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<GetFlakinessResponse | GetFlakinessHistoryResponse> => {
    const response = await apiClient.get('/api/v1/analytics/flakiness', { params });
    return response.data;
  },

  getTrends: async (params?: {
    start_date?: string;
    end_date?: string;
    environment?: string;
    group_by?: 'day' | 'week' | 'month';
  }): Promise<GetTrendsResponse> => {
    const response = await apiClient.get<GetTrendsResponse>('/api/v1/analytics/trends', { params });
    return response.data;
  },

  getStepPerformance: async (params?: {
    flow_id?: string;
    action?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<GetStepPerformanceResponse> => {
    const response = await apiClient.get<GetStepPerformanceResponse>('/api/v1/analytics/steps', { params });
    return response.data;
  },

  triggerAggregation: async (data?: {
    start_date?: string;
    end_date?: string;
  }): Promise<{ message: string; start_date: string; end_date: string }> => {
    const response = await apiClient.post('/api/v1/analytics/aggregate', data || {});
    return response.data;
  },
};

export default {
  reports: reportsApi,
  analytics: analyticsApi,
};
