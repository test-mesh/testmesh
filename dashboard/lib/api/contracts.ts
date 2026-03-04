import axios from 'axios';
import type {
  Contract,
  Verification,
  Interaction,
  BreakingChange,
  ListContractsResponse,
  GetContractResponse,
  ListVerificationsResponse,
  ListBreakingChangesResponse,
  DetectBreakingChangesResponse,
  ListInteractionsResponse,
  VerificationStatus,
  VerificationResults,
} from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5016';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Contract Testing API
export const contractApi = {
  // List contracts
  list: async (params?: {
    consumer?: string;
    provider?: string;
    limit?: number;
    offset?: number;
  }): Promise<ListContractsResponse> => {
    const response = await apiClient.get<ListContractsResponse>('/api/v1/contracts', {
      params,
    });
    return response.data;
  },

  // Get contract by ID
  get: async (id: string): Promise<GetContractResponse> => {
    const response = await apiClient.get<GetContractResponse>(`/api/v1/contracts/${id}`);
    return response.data;
  },

  // Get contract versions
  getVersions: async (consumer: string, provider: string): Promise<{ versions: Contract[]; total: number }> => {
    const response = await apiClient.get<{ versions: Contract[]; total: number }>(
      '/api/v1/contracts/versions',
      {
        params: { consumer, provider },
      }
    );
    return response.data;
  },

  // Export contract as Pact JSON
  exportPact: async (id: string): Promise<Blob> => {
    const response = await apiClient.get(`/api/v1/contracts/${id}/pact`, {
      responseType: 'blob',
    });
    return response.data;
  },

  // Import Pact JSON
  importPact: async (pactJson: string): Promise<Contract> => {
    const response = await apiClient.post<Contract>('/api/v1/contracts/import', {
      pact_json: pactJson,
    });
    return response.data;
  },

  // Delete contract
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/contracts/${id}`);
  },

  // Get verifications for a contract
  getVerifications: async (
    contractId: string,
    params?: {
      status?: VerificationStatus;
      limit?: number;
      offset?: number;
    }
  ): Promise<ListVerificationsResponse> => {
    const response = await apiClient.get<ListVerificationsResponse>(
      `/api/v1/contracts/${contractId}/verifications`,
      { params }
    );
    return response.data;
  },

  // Get verification by ID
  getVerification: async (id: string): Promise<Verification> => {
    const response = await apiClient.get<Verification>(`/api/v1/verifications/${id}`);
    return response.data;
  },

  // Detect breaking changes
  detectBreakingChanges: async (
    oldContractId: string,
    newContractId: string
  ): Promise<DetectBreakingChangesResponse> => {
    const response = await apiClient.post<DetectBreakingChangesResponse>(
      '/api/v1/contracts/breaking-changes',
      {
        old_contract_id: oldContractId,
        new_contract_id: newContractId,
      }
    );
    return response.data;
  },

  // Get breaking changes for a contract
  getBreakingChanges: async (contractId: string): Promise<ListBreakingChangesResponse> => {
    const response = await apiClient.get<ListBreakingChangesResponse>(
      `/api/v1/contracts/${contractId}/breaking-changes`
    );
    return response.data;
  },

  // List interactions for a contract
  listInteractions: async (
    contractId: string,
    params?: { limit?: number; offset?: number }
  ): Promise<ListInteractionsResponse> => {
    const response = await apiClient.get<ListInteractionsResponse>(
      `/api/v1/contracts/${contractId}/interactions`,
      { params }
    );
    return response.data;
  },

  // Get specific interaction
  getInteraction: async (contractId: string, interactionId: string): Promise<Interaction> => {
    const response = await apiClient.get<Interaction>(
      `/api/v1/contracts/${contractId}/interactions/${interactionId}`
    );
    return response.data;
  },

  // Delete interaction
  deleteInteraction: async (contractId: string, interactionId: string): Promise<void> => {
    await apiClient.delete(`/api/v1/contracts/${contractId}/interactions/${interactionId}`);
  },

  // Create verification
  createVerification: async (data: {
    contract_id: string;
    provider_version: string;
    execution_id?: string;
  }): Promise<Verification> => {
    const response = await apiClient.post<Verification>('/api/v1/verifications', data);
    return response.data;
  },

  // Update verification
  updateVerification: async (
    id: string,
    data: { status?: VerificationStatus; results?: VerificationResults }
  ): Promise<Verification> => {
    const response = await apiClient.put<Verification>(`/api/v1/verifications/${id}`, data);
    return response.data;
  },
};

export default contractApi;
