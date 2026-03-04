import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pluginApi, type Plugin, type InstallPluginRequest } from '../api/plugins';

// Query keys for plugins
export const pluginKeys = {
  all: ['plugins'] as const,
  lists: () => [...pluginKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...pluginKeys.lists(), filters] as const,
  details: () => [...pluginKeys.all, 'detail'] as const,
  detail: (id: string) => [...pluginKeys.details(), id] as const,
  info: (id: string) => [...pluginKeys.all, 'info', id] as const,
  types: () => [...pluginKeys.all, 'types'] as const,
};

/**
 * Hook to fetch all plugins
 */
export function usePlugins(params?: { type?: string; enabled?: boolean }) {
  return useQuery({
    queryKey: pluginKeys.list(params || {}),
    queryFn: () => pluginApi.list(params),
  });
}

/**
 * Hook to fetch a single plugin
 */
export function usePlugin(id: string) {
  return useQuery({
    queryKey: pluginKeys.detail(id),
    queryFn: () => pluginApi.get(id),
    enabled: !!id,
  });
}

/**
 * Hook to fetch plugin info (actions, schema, etc.)
 */
export function usePluginInfo(id: string) {
  return useQuery({
    queryKey: pluginKeys.info(id),
    queryFn: () => pluginApi.getInfo(id),
    enabled: !!id,
  });
}

/**
 * Hook to fetch available plugin types
 */
export function usePluginTypes() {
  return useQuery({
    queryKey: pluginKeys.types(),
    queryFn: () => pluginApi.getTypes(),
  });
}

/**
 * Hook to enable a plugin
 */
export function useEnablePlugin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => pluginApi.enable(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: pluginKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: pluginKeys.lists() });
    },
  });
}

/**
 * Hook to disable a plugin
 */
export function useDisablePlugin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => pluginApi.disable(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: pluginKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: pluginKeys.lists() });
    },
  });
}

/**
 * Hook to load a plugin (start its process)
 */
export function useLoadPlugin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => pluginApi.load(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: pluginKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: pluginKeys.lists() });
    },
  });
}

/**
 * Hook to unload a plugin (stop its process)
 */
export function useUnloadPlugin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => pluginApi.unload(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: pluginKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: pluginKeys.lists() });
    },
  });
}

/**
 * Hook to install a plugin
 */
export function useInstallPlugin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: InstallPluginRequest) => pluginApi.install(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pluginKeys.lists() });
    },
  });
}

/**
 * Hook to uninstall a plugin
 */
export function useUninstallPlugin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => pluginApi.uninstall(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pluginKeys.lists() });
    },
  });
}

/**
 * Hook to discover plugins in the plugin directory
 */
export function useDiscoverPlugins() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => pluginApi.discover(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pluginKeys.lists() });
    },
  });
}

/**
 * Hook to toggle plugin enabled state
 */
export function useTogglePlugin() {
  const enablePlugin = useEnablePlugin();
  const disablePlugin = useDisablePlugin();

  return useMutation({
    mutationFn: async (plugin: Plugin) => {
      if (plugin.enabled) {
        return disablePlugin.mutateAsync(plugin.manifest.id);
      } else {
        return enablePlugin.mutateAsync(plugin.manifest.id);
      }
    },
  });
}
