import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { integrationsApi, gitTriggerRulesApi, repositoryLinksApi, type SystemIntegration, type GitTriggerRule, type RepositoryLink, type CreateIntegrationRequest, type UpdateIntegrationRequest, type UpdateSecretsRequest, type CreateGitTriggerRuleRequest, type UpdateGitTriggerRuleRequest, type CreateRepositoryLinkRequest, type UpdateRepositoryLinkRequest } from '../api/integrations';
export type { GitRepository } from '../api/integrations';

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

export function useGitRepositories(integrationId: string, search?: string) {
  return useQuery({
    queryKey: ['git-repos', integrationId, search],
    queryFn: () => integrationsApi.listRepos(integrationId, search),
    enabled: !!integrationId,
    staleTime: 60_000,
    retry: false,
  });
}

// Repository Link Query Keys
export const repositoryLinkKeys = {
  all: ['repository-links'] as const,
  lists: () => [...repositoryLinkKeys.all, 'list'] as const,
  list: (workspaceId: string) => [...repositoryLinkKeys.lists(), workspaceId] as const,
  details: () => [...repositoryLinkKeys.all, 'detail'] as const,
  detail: (workspaceId: string, id: string) => [...repositoryLinkKeys.details(), workspaceId, id] as const,
};

// Repository Link Hooks
export function useRepositoryLinks(workspaceId: string) {
  return useQuery({
    queryKey: repositoryLinkKeys.list(workspaceId),
    queryFn: () => repositoryLinksApi.list(workspaceId),
    enabled: !!workspaceId,
  });
}

export function useCreateRepositoryLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workspaceId, data }: { workspaceId: string; data: CreateRepositoryLinkRequest }) =>
      repositoryLinksApi.create(workspaceId, data),
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: repositoryLinkKeys.list(workspaceId) });
    },
  });
}

export function useUpdateRepositoryLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workspaceId, linkId, data }: { workspaceId: string; linkId: string; data: UpdateRepositoryLinkRequest }) =>
      repositoryLinksApi.update(workspaceId, linkId, data),
    onSuccess: (_, { workspaceId, linkId }) => {
      queryClient.invalidateQueries({ queryKey: repositoryLinkKeys.detail(workspaceId, linkId) });
      queryClient.invalidateQueries({ queryKey: repositoryLinkKeys.list(workspaceId) });
    },
  });
}

export function useDeleteRepositoryLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workspaceId, linkId }: { workspaceId: string; linkId: string }) =>
      repositoryLinksApi.delete(workspaceId, linkId),
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries({ queryKey: repositoryLinkKeys.list(workspaceId) });
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
