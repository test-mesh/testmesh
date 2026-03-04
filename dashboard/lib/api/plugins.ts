import { apiClient } from './client';

// Plugin Types
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  type: 'action' | 'auth' | 'exporter' | 'importer' | 'reporter';
  entry_point: string;
  config?: Record<string, unknown>;
  permissions?: string[];
}

export interface Plugin {
  manifest: PluginManifest;
  path: string;
  enabled: boolean;
  loaded: boolean;
  error?: string;
}

export interface ListPluginsResponse {
  plugins: Plugin[];
  total: number;
}

export interface InstallPluginRequest {
  source: string; // Path or URL
}

export interface PluginAction {
  id: string;
  name: string;
  description: string;
  schema?: Record<string, unknown>;
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  actions: PluginAction[];
}

// Plugin API
export const pluginApi = {
  /**
   * List all plugins
   */
  list: async (params?: {
    type?: string;
    enabled?: boolean;
  }): Promise<ListPluginsResponse> => {
    const response = await apiClient.get<ListPluginsResponse>('/api/v1/plugins', {
      params,
    });
    return response.data;
  },

  /**
   * Get a specific plugin
   */
  get: async (id: string): Promise<Plugin> => {
    const response = await apiClient.get<Plugin>(`/api/v1/plugins/${id}`);
    return response.data;
  },

  /**
   * Enable a plugin
   */
  enable: async (id: string): Promise<Plugin> => {
    const response = await apiClient.post<Plugin>(`/api/v1/plugins/${id}/enable`);
    return response.data;
  },

  /**
   * Disable a plugin
   */
  disable: async (id: string): Promise<Plugin> => {
    const response = await apiClient.post<Plugin>(`/api/v1/plugins/${id}/disable`);
    return response.data;
  },

  /**
   * Load a plugin (start its process)
   */
  load: async (id: string): Promise<Plugin> => {
    const response = await apiClient.post<Plugin>(`/api/v1/plugins/${id}/load`);
    return response.data;
  },

  /**
   * Unload a plugin (stop its process)
   */
  unload: async (id: string): Promise<Plugin> => {
    const response = await apiClient.post<Plugin>(`/api/v1/plugins/${id}/unload`);
    return response.data;
  },

  /**
   * Install a plugin from source
   */
  install: async (data: InstallPluginRequest): Promise<Plugin> => {
    const response = await apiClient.post<Plugin>('/api/v1/plugins/install', data);
    return response.data;
  },

  /**
   * Uninstall a plugin
   */
  uninstall: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/plugins/${id}`);
  },

  /**
   * Discover plugins in the plugin directory
   */
  discover: async (): Promise<ListPluginsResponse> => {
    const response = await apiClient.post<ListPluginsResponse>('/api/v1/plugins/discover');
    return response.data;
  },

  /**
   * Get plugin info (available actions, etc.)
   */
  getInfo: async (id: string): Promise<PluginInfo> => {
    const response = await apiClient.get<PluginInfo>(`/api/v1/plugins/${id}/info`);
    return response.data;
  },

  /**
   * Get available plugin types
   */
  getTypes: async (): Promise<string[]> => {
    const response = await apiClient.get<string[]>('/api/v1/plugins/types');
    return response.data;
  },
};

export default pluginApi;
