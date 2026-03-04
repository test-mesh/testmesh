import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contractApi } from '../api/contracts';
import type { VerificationStatus } from '../api/types';

// Query keys
export const contractKeys = {
  all: ['contracts'] as const,
  lists: () => [...contractKeys.all, 'list'] as const,
  list: (filters: Record<string, any>) => [...contractKeys.lists(), filters] as const,
  details: () => [...contractKeys.all, 'detail'] as const,
  detail: (id: string) => [...contractKeys.details(), id] as const,
  versions: (consumer: string, provider: string) => [
    ...contractKeys.all,
    'versions',
    consumer,
    provider,
  ] as const,
  verifications: (id: string, filters: Record<string, any>) => [
    ...contractKeys.detail(id),
    'verifications',
    filters,
  ] as const,
  verification: (id: string) => ['verifications', id] as const,
  breakingChanges: (id: string) => [...contractKeys.detail(id), 'breaking-changes'] as const,
  interactions: (id: string, filters: Record<string, any>) => [
    ...contractKeys.detail(id),
    'interactions',
    filters,
  ] as const,
  interaction: (contractId: string, interactionId: string) => [
    ...contractKeys.detail(contractId),
    'interaction',
    interactionId,
  ] as const,
};

// Hooks for contracts
export function useContracts(params?: {
  consumer?: string;
  provider?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: contractKeys.list(params || {}),
    queryFn: () => contractApi.list(params),
  });
}

export function useContract(id: string) {
  return useQuery({
    queryKey: contractKeys.detail(id),
    queryFn: () => contractApi.get(id),
    enabled: !!id,
  });
}

export function useContractVersions(consumer: string, provider: string) {
  return useQuery({
    queryKey: contractKeys.versions(consumer, provider),
    queryFn: () => contractApi.getVersions(consumer, provider),
    enabled: !!consumer && !!provider,
  });
}

export function useContractVerifications(
  contractId: string,
  params?: {
    status?: VerificationStatus;
    limit?: number;
    offset?: number;
  }
) {
  return useQuery({
    queryKey: contractKeys.verifications(contractId, params || {}),
    queryFn: () => contractApi.getVerifications(contractId, params),
    enabled: !!contractId,
  });
}

export function useVerification(id: string) {
  return useQuery({
    queryKey: contractKeys.verification(id),
    queryFn: () => contractApi.getVerification(id),
    enabled: !!id,
  });
}

export function useContractBreakingChanges(contractId: string) {
  return useQuery({
    queryKey: contractKeys.breakingChanges(contractId),
    queryFn: () => contractApi.getBreakingChanges(contractId),
    enabled: !!contractId,
  });
}

export function useImportPact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (pactJson: string) => contractApi.importPact(pactJson),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contractKeys.lists() });
    },
  });
}

export function useDeleteContract() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => contractApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contractKeys.lists() });
    },
  });
}

export function useDetectBreakingChanges() {
  return useMutation({
    mutationFn: ({ oldContractId, newContractId }: { oldContractId: string; newContractId: string }) =>
      contractApi.detectBreakingChanges(oldContractId, newContractId),
  });
}

export function useExportPact() {
  return useMutation({
    mutationFn: async (id: string) => {
      const blob = await contractApi.exportPact(id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contract-${id}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
  });
}

// Interaction hooks
export function useContractInteractions(
  contractId: string,
  params?: { limit?: number; offset?: number }
) {
  return useQuery({
    queryKey: contractKeys.interactions(contractId, params || {}),
    queryFn: () => contractApi.listInteractions(contractId, params),
    enabled: !!contractId,
  });
}

export function useContractInteraction(contractId: string, interactionId: string) {
  return useQuery({
    queryKey: contractKeys.interaction(contractId, interactionId),
    queryFn: () => contractApi.getInteraction(contractId, interactionId),
    enabled: !!contractId && !!interactionId,
  });
}

export function useDeleteInteraction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ contractId, interactionId }: { contractId: string; interactionId: string }) =>
      contractApi.deleteInteraction(contractId, interactionId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: contractKeys.interactions(variables.contractId, {}),
      });
      queryClient.invalidateQueries({ queryKey: contractKeys.detail(variables.contractId) });
    },
  });
}

// Verification mutation hooks
export function useCreateVerification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { contract_id: string; provider_version: string; execution_id?: string }) =>
      contractApi.createVerification(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: contractKeys.verifications(variables.contract_id, {}),
      });
    },
  });
}

export function useUpdateVerification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { status?: VerificationStatus; results?: any };
    }) => contractApi.updateVerification(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: contractKeys.verification(data.id) });
      queryClient.invalidateQueries({
        queryKey: contractKeys.verifications(data.contract_id, {}),
      });
    },
  });
}
