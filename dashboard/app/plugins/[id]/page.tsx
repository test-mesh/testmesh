'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  usePlugin, usePluginInfo, useEnablePlugin, useDisablePlugin,
  useLoadPlugin, useUnloadPlugin, useUninstallPlugin,
} from '@/lib/hooks/usePlugins';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Puzzle, Play, Square, Trash2, ExternalLink, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PluginDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function PluginDetailPage({ params }: PluginDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();

  const { data: plugin, isLoading, error } = usePlugin(id);
  const { data: pluginInfo } = usePluginInfo(id);

  const enablePlugin = useEnablePlugin();
  const disablePlugin = useDisablePlugin();
  const loadPlugin = useLoadPlugin();
  const unloadPlugin = useUnloadPlugin();
  const uninstallPlugin = useUninstallPlugin();

  const handleToggleEnabled = async () => {
    if (!plugin) return;
    if (plugin.enabled) disablePlugin.mutate(plugin.manifest.id);
    else enablePlugin.mutate(plugin.manifest.id);
  };

  const handleUninstall = async () => {
    if (!plugin) return;
    if (confirm('Are you sure you want to uninstall this plugin? This action cannot be undone.')) {
      await uninstallPlugin.mutateAsync(plugin.manifest.id);
      router.push('/plugins');
    }
  };

  const statusStyle = plugin?.error
    ? 'bg-red-400/10 text-red-400 border-red-400/30'
    : plugin?.loaded
    ? 'bg-teal-400/10 text-teal-400 border-teal-400/30'
    : 'bg-[#1a2d3d] text-[#4a7a96] border-[#2a3d52]';

  const statusLabel = plugin?.error ? 'Error' : plugin?.loaded ? 'Running' : 'Stopped';

  if (isLoading) {
    return (
      <div className="px-6 py-6">
        <div className="h-6 w-48 rounded bg-[#1a2d3d] animate-pulse mb-6" />
        <div className="grid grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => <div key={i} className="h-48 rounded-xl bg-[#0f1923] border border-[#1e2d3d] animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (error || !plugin) {
    return (
      <div className="px-6 py-6 space-y-5">
        <Link href="/plugins" className="inline-flex items-center gap-1.5 text-xs text-[#4a6480] hover:text-[#7fa8c8] transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Plugins
        </Link>
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-6">
          <p className="text-sm font-semibold text-[#c8dce8] mb-1">Plugin Not Found</p>
          <p className="text-xs text-[#4a6480]">The requested plugin could not be found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/plugins" className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-[#1a2d3d]">
            <Puzzle className="w-4 h-4 text-[#4a7a96]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[#c8dce8]">{plugin.manifest.name}</h1>
            <div className="flex items-center gap-2">
              <code className="text-[10px] text-[#4a6480]">{plugin.manifest.id}</code>
              <span className="text-[10px] text-[#3d5670]">v{plugin.manifest.version}</span>
              <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded border', statusStyle)}>{statusLabel}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 pr-2 border-r border-[#1e2d3d]">
            <span className="text-[11px] text-[#4a6480]">Enabled</span>
            <Switch
              checked={plugin.enabled}
              onCheckedChange={handleToggleEnabled}
              disabled={enablePlugin.isPending || disablePlugin.isPending}
            />
          </div>
          {plugin.loaded ? (
            <button
              onClick={() => unloadPlugin.mutate(plugin.manifest.id)}
              disabled={unloadPlugin.isPending}
              className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-[#0f1923] border border-[#1e2d3d] text-[#7fa8c8] hover:border-[#2a3d52] disabled:opacity-50 transition-colors"
            >
              <Square className="w-3 h-3" />Stop
            </button>
          ) : (
            <button
              onClick={() => loadPlugin.mutate(plugin.manifest.id)}
              disabled={loadPlugin.isPending || !plugin.enabled}
              className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-[#0f1923] border border-[#1e2d3d] text-[#7fa8c8] hover:border-[#2a3d52] disabled:opacity-50 transition-colors"
            >
              <Play className="w-3 h-3" />Start
            </button>
          )}
          <button
            onClick={handleUninstall}
            disabled={uninstallPlugin.isPending}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-red-400/5 border border-red-400/20 text-red-400 hover:bg-red-400/10 hover:border-red-400/30 disabled:opacity-50 transition-colors"
          >
            <Trash2 className="w-3 h-3" />Uninstall
          </button>
        </div>
      </div>

      {plugin.error && (
        <div className="rounded-xl bg-red-400/5 border border-red-400/20 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-red-400/10 flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-red-400" />
            <span className="text-[11px] font-semibold text-red-400">Plugin Error</span>
          </div>
          <div className="p-4">
            <code className="text-xs font-mono text-red-400/80">{plugin.error}</code>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Details */}
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2332]">
            <span className="text-[11px] font-semibold text-[#c8dce8]">Details</span>
          </div>
          <div className="p-4 space-y-3">
            {plugin.manifest.description && (
              <div>
                <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-1">Description</p>
                <p className="text-xs text-[#c8dce8]">{plugin.manifest.description}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-1">Type</p>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#1a2d3d] text-[#4a7a96] capitalize">{plugin.manifest.type}</span>
            </div>
            {plugin.manifest.author && (
              <div>
                <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-1">Author</p>
                <p className="text-xs text-[#c8dce8]">{plugin.manifest.author}</p>
              </div>
            )}
            {plugin.manifest.homepage && (
              <div>
                <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-1">Homepage</p>
                <a href={plugin.manifest.homepage} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-400 hover:text-teal-300 inline-flex items-center gap-1 transition-colors">
                  {plugin.manifest.homepage} <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
            <div>
              <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-1">Entry Point</p>
              <code className="text-[10px] font-mono bg-[#0b0f18] border border-[#1a2332] px-2 py-0.5 rounded text-[#7fa8c8]">{plugin.manifest.entry_point}</code>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-1">Path</p>
              <code className="text-[10px] font-mono bg-[#0b0f18] border border-[#1a2332] px-2 py-0.5 rounded text-[#7fa8c8] break-all block">{plugin.path}</code>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2332]">
            <span className="text-[11px] font-semibold text-[#c8dce8]">Actions</span>
            <span className="text-[10px] text-[#4a6480] ml-2">Custom actions provided by this plugin</span>
          </div>
          <div className="p-4">
            {pluginInfo?.actions && pluginInfo.actions.length > 0 ? (
              <div className="space-y-2">
                {pluginInfo.actions.map((action) => (
                  <div key={action.id} className="rounded-lg border border-[#1e2d3d] bg-[#0b0f18] p-2.5">
                    <code className="text-xs font-mono font-semibold text-teal-400">{action.id}</code>
                    {action.description && <p className="text-[10px] text-[#4a6480] mt-0.5">{action.description}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#4a6480]">
                {plugin.loaded ? 'No actions available' : 'Start the plugin to see available actions'}
              </p>
            )}
          </div>
        </div>

        {/* Permissions */}
        {plugin.manifest.permissions && plugin.manifest.permissions.length > 0 && (
          <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[#1a2332]">
              <span className="text-[11px] font-semibold text-[#c8dce8]">Permissions</span>
              <span className="text-[10px] text-[#4a6480] ml-2">Capabilities required by this plugin</span>
            </div>
            <div className="p-4">
              <div className="flex flex-wrap gap-1.5">
                {plugin.manifest.permissions.map((permission) => (
                  <span key={permission} className="text-[10px] px-2 py-0.5 rounded bg-[#1a2d3d] text-[#4a7a96] border border-[#2a3d52]">{permission}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Configuration */}
        {plugin.manifest.config && Object.keys(plugin.manifest.config).length > 0 && (
          <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[#1a2332]">
              <span className="text-[11px] font-semibold text-[#c8dce8]">Configuration</span>
            </div>
            <div className="p-4 overflow-auto">
              <pre className="text-[10px] font-mono text-[#7fa8c8]">{JSON.stringify(plugin.manifest.config, null, 2)}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
