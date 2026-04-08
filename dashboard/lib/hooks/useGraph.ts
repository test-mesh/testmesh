import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  graphApi,
  type CreateRepoRequest,
  type ListNodesParams,
  type UpdateRepoRequest,
} from '@/lib/api/graph';

// ── Query key factory ─────────────────────────────────────────────────────────

export const graphKeys = {
  all: ['graph'] as const,
  stats: () => [...graphKeys.all, 'stats'] as const,
  repos: () => [...graphKeys.all, 'repos'] as const,
  edges: () => [...graphKeys.all, 'edges'] as const,
  nodes: (params: ListNodesParams) => [...graphKeys.all, 'nodes', params] as const,
  node: (id: string) => [...graphKeys.all, 'node', id] as const,
  nodeDeps: (id: string) => [...graphKeys.all, 'node', id, 'deps'] as const,
  coverage: () => [...graphKeys.all, 'coverage'] as const,
  conflicts: () => [...graphKeys.all, 'conflicts'] as const,
};

// ── Stats ─────────────────────────────────────────────────────────────────────

export function useGraphStats() {
  return useQuery({
    queryKey: graphKeys.stats(),
    queryFn: () => graphApi.getStats(),
    refetchInterval: 30_000,
  });
}

// ── Repos ─────────────────────────────────────────────────────────────────────

export function useGraphRepos() {
  return useQuery({
    queryKey: graphKeys.repos(),
    queryFn: () => graphApi.listRepos(),
  });
}

export function useCreateRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateRepoRequest) => graphApi.createRepo(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: graphKeys.repos() });
      qc.invalidateQueries({ queryKey: graphKeys.stats() });
    },
  });
}

export function useUpdateRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, req }: { id: string; req: UpdateRepoRequest }) =>
      graphApi.updateRepo(id, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: graphKeys.repos() });
    },
  });
}

export function useDeleteRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => graphApi.deleteRepo(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: graphKeys.repos() });
      qc.invalidateQueries({ queryKey: graphKeys.stats() });
    },
  });
}

export function useTriggerRepoScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => graphApi.triggerRepoScan(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: graphKeys.stats() });
      qc.invalidateQueries({ queryKey: [...graphKeys.all, 'nodes'] });
      qc.invalidateQueries({ queryKey: graphKeys.edges() });
    },
  });
}

// ── Edges ─────────────────────────────────────────────────────────────────────

export function useGraphEdges() {
  return useQuery({
    queryKey: graphKeys.edges(),
    queryFn: () => graphApi.listEdges(),
  });
}

// ── Nodes ─────────────────────────────────────────────────────────────────────

export function useGraphNodes(params: ListNodesParams) {
  return useQuery({
    queryKey: graphKeys.nodes(params),
    queryFn: () => graphApi.listNodes(params),
  });
}

export function useGraphNode(nodeId: string | null) {
  return useQuery({
    queryKey: graphKeys.node(nodeId ?? ''),
    queryFn: () => graphApi.getNode(nodeId!),
    enabled: !!nodeId,
  });
}

export function useGraphNodeDependencies(nodeId: string | null) {
  return useQuery({
    queryKey: graphKeys.nodeDeps(nodeId ?? ''),
    queryFn: () => graphApi.getNodeDependencies(nodeId!),
    enabled: !!nodeId,
  });
}

// ── Coverage ──────────────────────────────────────────────────────────────────

export function useGraphCoverage() {
  return useQuery({
    queryKey: graphKeys.coverage(),
    queryFn: () => graphApi.getCoverage(),
  });
}

// ── Conflicts ─────────────────────────────────────────────────────────────────

export function useGraphConflicts() {
  return useQuery({
    queryKey: graphKeys.conflicts(),
    queryFn: () => graphApi.listConflicts(),
  });
}

export function useResolveConflict() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, resolution }: { id: string; resolution: string }) =>
      graphApi.resolveConflict(id, resolution),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: graphKeys.conflicts() });
      qc.invalidateQueries({ queryKey: graphKeys.stats() });
    },
  });
}
