import { apiClient } from './client';

// ── Types ────────────────────────────────────────────────────────────────────

export interface GraphRepo {
  id: string;
  workspace_id: string;
  name: string;
  url: string;
  branch: string;
  scan_config?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateRepoRequest {
  name: string;
  url: string;
  branch: string;
  pat?: string;
  ssh_key?: string;
  scan_config?: Record<string, unknown>;
}

export interface UpdateRepoRequest {
  name?: string;
  url?: string;
  branch?: string;
  pat?: string;
  ssh_key?: string;
  scan_config?: Record<string, unknown>;
}

export interface GraphNode {
  id: string;
  workspace_id: string;
  repo_id?: string;
  type: string;
  name: string;
  service: string;
  source_layer: string;
  source_file: string;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  from_id: string;
  to_id: string;
  relationship: string;
  weight: number;
}

export interface GraphStats {
  total_nodes: number;
  total_edges: number;
  service_count: number;
  coverage_percent: number;
  conflict_count: number;
  nodes_by_type: Record<string, number>;
}

export interface GraphConflict {
  id: string;
  type: string;
  node_ids: string[];
  resolution: string;
  details: Record<string, unknown>;
}

export interface ListNodesParams {
  type?: string;
  service?: string;
  search?: string;
  source_layer?: string;
  limit?: number;
  offset?: number;
}

export interface ListNodesResponse {
  nodes: GraphNode[];
  total: number;
}

export interface ScanResult {
  status: string;
  nodes_added: number;
  edges_added: number;
  duration_ms: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const base = '/api/v1/graph';

// ── API ───────────────────────────────────────────────────────────────────────

export const graphApi = {
  // Stats
  getStats: async (): Promise<GraphStats> => {
    const res = await apiClient.get(`${base}/stats`);
    return res.data;
  },

  clearGraph: async (): Promise<void> => {
    await apiClient.delete(`${base}`);
  },

  // Repos
  listRepos: async (): Promise<{ repos: GraphRepo[]; total: number }> => {
    const res = await apiClient.get(`${base}/repos`);
    return res.data;
  },

  createRepo: async (req: CreateRepoRequest): Promise<GraphRepo> => {
    const res = await apiClient.post(`${base}/repos`, req);
    return res.data;
  },

  updateRepo: async (id: string, req: UpdateRepoRequest): Promise<GraphRepo> => {
    const res = await apiClient.put(`${base}/repos/${id}`, req);
    return res.data;
  },

  deleteRepo: async (id: string): Promise<void> => {
    await apiClient.delete(`${base}/repos/${id}`);
  },

  triggerRepoScan: async (id: string): Promise<ScanResult> => {
    const res = await apiClient.post(`${base}/repos/${id}/scan`, {});
    return res.data;
  },

  // Nodes
  listNodes: async (params: ListNodesParams): Promise<ListNodesResponse> => {
    const res = await apiClient.get(`${base}/nodes`, { params });
    return res.data;
  },

  getNode: async (nodeId: string): Promise<{ node: GraphNode; edges: GraphEdge[] }> => {
    const res = await apiClient.get(`${base}/nodes/${nodeId}`);
    return res.data;
  },

  getNodeDependencies: async (nodeId: string, depth = 2): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> => {
    const res = await apiClient.get(`${base}/nodes/${nodeId}/dependencies`, { params: { depth } });
    return res.data;
  },

  searchNodes: async (query: string, limit = 20): Promise<{ nodes: GraphNode[]; total: number }> => {
    const res = await apiClient.post(`${base}/search`, { query, limit });
    return res.data;
  },

  // Coverage
  getCoverage: async (): Promise<{ uncovered_nodes: GraphNode[]; uncovered_count: number; coverage_percent: number }> => {
    const res = await apiClient.get(`${base}/coverage`);
    return res.data;
  },

  // Conflicts
  listConflicts: async (): Promise<{ conflicts: GraphConflict[]; total: number }> => {
    const res = await apiClient.get(`${base}/conflicts`);
    return res.data;
  },

  resolveConflict: async (id: string, resolution: string): Promise<void> => {
    await apiClient.post(`${base}/conflicts/${id}/resolve`, { resolution });
  },
};
