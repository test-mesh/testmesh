import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { integrationsApi, gitTriggerRulesApi, type SystemIntegration, type GitTriggerRule, type CreateIntegrationRequest, type UpdateIntegrationRequest, type UpdateSecretsRequest, type CreateGitTriggerRuleRequest, type UpdateGitTriggerRuleRequest } from '../api/integrations';

// Query keys
export const integrationKeys = {
  all: ['integrations'] as const,
  lists: () => [...integrationKeys.all, 'list'] as const,
  list: (params?: { type?: string; status?: string }) => [...integrationKeys.lists(), params] as const,
  details: () => [...integrationKeys.all, 'detail'] as const,
  detail: (id: string) => [...integrationKeys.details(), id] as const,
  secrets: (id: string) => [...integrationKeys.detail(id), 'secrets'] as const,
};

export const gitTriggerRuleKeys = {
  all: ['git-trigger-rules'] as const,
  lists: () => [...gitTriggerRuleKeys.all, 'list'] as const,
  list: (workspaceId: string) => [...gitTriggerRuleKeys.lists(), workspaceId] as const,
  details: () => [...gitTriggerRuleKeys.all, 'detail'] as const,
  detail: (workspaceId: string, id: string) => [...gitTriggerRuleKeys.details(), workspaceId, id] as const,
};

// Integration Hooks
export function useIntegrations(params?: { type?: string; status?: string }) {
  return useQuery({
    queryKey: integrationKeys.list(params),
    queryFn: () => integrationsApi.list(params),
  });
}

export function useIntegration(id: string) {
  return useQuery({
    queryKey: integrationKeys.detail(id),
    queryFn: () => integrationsApi.get(id),
    enabled: !!id,
  });
}

export function useIntegrationSecrets(id: string) {
  return useQuery({
    queryKey: integrationKeys.secrets(id),
    queryFn: () => integrationsApi.getSecrets(id),
    enabled: !!id,
  });
}

export function useCreateIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateIntegrationRequest) => integrationsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: integrationKeys.lists() });
    },
  });
}

export function useUpdateIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateIntegrationRequest }) =>
      integrationsApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: integrationKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: integrationKeys.lists() });
    },
  });
}

export function useDeleteIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => integrationsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: integrationKeys.lists() });
    },
  });
}

export function useTestConnection() {
  return useMutation({
    mutationFn: (id: string) => integrationsApi.testConnection(id),
  });
}

export function useUpdateSecrets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSecretsRequest }) =>
      integrationsApi.updateSecrets(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: integrationKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: integrationKeys.secrets(id) });
    },
  });
}

// Git Trigger Rule Hooks
export function useGitTriggerRules(workspaceId: string) {
  return useQuery({
    queryKey: gitTriggerRuleKeys.list(workspaceId),
    queryFn: () => gitTriggerRulesApi.list(workspaceId),
    enabled: !!workspaceId,
  });
}

export function useGitTriggerRule(workspaceId: string, id: string) {
  return useQuery({
    queryKey: gitTriggerRuleKeys.detail(workspaceId, id),
    queryFn: () => gitTriggerRulesApi.get(workspaceId, id),
    enabled: !!workspaceId && !!id,
  });
}

export function useCreateGitTriggerRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ workspaceId, data }: { workspaceId: string; data: CreateGitTriggerRuleRequest }) =>
      gitTriggerRulesApi.create(workspaceId, data),
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: gitTriggerRuleKeys.list(workspaceId) });
    },
  });
}

export function useUpdateGitTriggerRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ workspaceId, id, data }: { workspaceId: string; id: string; data: UpdateGitTriggerRuleRequest }) =>
      gitTriggerRulesApi.update(workspaceId, id, data),
    onSuccess: (_, { workspaceId, id }) => {
      queryClient.invalidateQueries({ queryKey: gitTriggerRuleKeys.detail(workspaceId, id) });
      queryClient.invalidateQueries({ queryKey: gitTriggerRuleKeys.list(workspaceId) });
    },
  });
}

export function useDeleteGitTriggerRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ workspaceId, id }: { workspaceId: string; id: string }) =>
      gitTriggerRulesApi.delete(workspaceId, id),
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: gitTriggerRuleKeys.list(workspaceId) });
    },
  });
}
