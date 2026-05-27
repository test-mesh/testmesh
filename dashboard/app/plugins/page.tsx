'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  usePlugins, useNativePlugins, useEnablePlugin, useDisablePlugin,
  useLoadPlugin, useUnloadPlugin, useDiscoverPlugins, useInstallPlugin, useUninstallPlugin,
} from '@/lib/hooks/usePlugins';
import type { Plugin } from '@/lib/api/plugins';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Eye, Trash2, X, Search, Puzzle, RefreshCw, Download, FolderSearch, Package,
  Database, MessageSquare, Globe, Mail, Cloud, CheckCircle2, Share2, HardDrive,
  Activity, FileText, BarChart2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MarketplacePlugin {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  type: string;
  icon: React.ComponentType<{ className?: string }>;
  source: string;
  tags: string[];
  downloads?: number;
  comingSoon?: boolean;
}

interface NativePluginMeta {
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  actions: string[];
}

const nativePluginMeta: Record<string, NativePluginMeta> = {
  kafka:      { name: 'Apache Kafka',  description: 'Produce and consume messages, manage topics, and test event-driven architectures',                 icon: MessageSquare, actions: ['kafka.produce', 'kafka.consume', 'kafka.admin.topics', 'kafka.admin.createTopic', 'kafka.admin.deleteTopic'] },
  postgresql: { name: 'PostgreSQL',   description: 'Execute SQL queries, manage transactions, and validate database state',                              icon: Database,      actions: ['postgresql.query', 'postgresql.insert', 'postgresql.update', 'postgresql.delete', 'postgresql.assert', 'postgresql.transaction'] },
  redis:      { name: 'Redis',        description: 'Get, set, delete and check keys in Redis — built-in cache validation for test flows',                icon: Database,      actions: ['redis.get', 'redis.set', 'redis.del', 'redis.exists'] },
  neo4j:      { name: 'Neo4j',        description: 'Run Cypher queries and assert on graph data — query nodes, relationships, and paths',                icon: Share2,        actions: ['neo4j.query', 'neo4j.assert'] },
  minio:      { name: 'MinIO / S3',   description: 'Upload, download, delete, and assert on objects in MinIO or any S3-compatible store',               icon: HardDrive,     actions: ['minio.put', 'minio.get', 'minio.delete', 'minio.assert'] },
  otel:       { name: 'OTel / Tempo', description: 'Inject W3C trace context and assert on spans in Grafana Tempo',                                     icon: Activity,      actions: ['otel.inject', 'otel.assert'] },
  loki:       { name: 'Grafana Loki', description: 'Query and assert on log lines using LogQL — verify your services log what they should',             icon: FileText,      actions: ['loki.query', 'loki.assert'] },
  prometheus: { name: 'Prometheus',   description: 'Run PromQL queries and assert on metric values — capture baselines and verify deltas',              icon: BarChart2,     actions: ['prometheus.query', 'prometheus.assert'] },
};

const marketplacePlugins: MarketplacePlugin[] = [
  { id: 'scraper',               name: 'Web Scraper', description: 'HTML parsing and data extraction using cheerio - example Node.js plugin', version: '1.0.0', author: 'TestMesh', type: 'action', icon: Globe,     source: '../plugins/scraper',  tags: ['html', 'parsing', 'nodejs', 'example'], downloads: 756 },
  { id: 'testmesh-plugin-mongodb', name: 'MongoDB',  description: 'Document operations, aggregation pipelines, and NoSQL testing',            version: '1.0.0', author: 'TestMesh', type: 'action', icon: Database, source: '../plugins/mongodb', tags: ['database', 'nosql', 'documents'], downloads: 743, comingSoon: true },
  { id: 'testmesh-plugin-smtp',  name: 'SMTP Email', description: 'Send test emails and verify email delivery in your test flows',             version: '1.0.0', author: 'TestMesh', type: 'action', icon: Mail,     source: '../plugins/smtp',    tags: ['email', 'notifications'], downloads: 512, comingSoon: true },
  { id: 'testmesh-plugin-s3',    name: 'AWS S3',     description: 'Upload, download, and manage files in S3-compatible storage',               version: '1.0.0', author: 'TestMesh', type: 'action', icon: Cloud,    source: '../plugins/s3',      tags: ['storage', 'aws', 'files'], downloads: 634, comingSoon: true },
];

const TYPE_COLORS: Record<string, string> = {
  action:   'bg-teal-400/10 text-teal-400',
  auth:     'bg-teal-400/10 text-teal-400',
  exporter: 'bg-purple-400/10 text-purple-400',
  importer: 'bg-orange-400/10 text-orange-400',
  reporter: 'bg-pink-400/10 text-pink-400',
};

const STATUS_STYLES: Record<string, string> = {
  running: 'bg-teal-400/10 text-teal-400 border-teal-400/30',
  stopped: 'bg-[#1a2d3d] text-[#4a7a96] border-[#2a3d52]',
  error:   'bg-red-400/10 text-red-400 border-red-400/30',
};

function getStatusStyle(plugin: Plugin) {
  if (plugin.error) return STATUS_STYLES.error;
  if (plugin.loaded) return STATUS_STYLES.running;
  return STATUS_STYLES.stopped;
}

function getStatusLabel(plugin: Plugin) {
  if (plugin.error) return 'Error';
  if (plugin.loaded) return 'Running';
  return 'Stopped';
}

const pillBtn = (active: boolean) => cn(
  'h-7 px-3 rounded-lg text-xs font-medium border transition-colors',
  active
    ? 'bg-teal-400/15 text-teal-400 border-teal-400/30'
    : 'text-[#4a6480] bg-[#0f1923] border-[#1e2d3d] hover:border-[#2a3d52] hover:text-[#7fa8c8]'
);

export default function PluginsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [installSource, setInstallSource] = useState('');
  const [activeTab, setActiveTab] = useState<'installed' | 'marketplace'>('installed');
  const [installingPlugin, setInstallingPlugin] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = usePlugins({ type: typeFilter || undefined });
  const { data: nativeData } = useNativePlugins();
  const nativePluginIds = nativeData?.plugins ?? [];

  const enablePlugin = useEnablePlugin();
  const disablePlugin = useDisablePlugin();
  const loadPlugin = useLoadPlugin();
  const unloadPlugin = useUnloadPlugin();
  const discoverPlugins = useDiscoverPlugins();
  const installPlugin = useInstallPlugin();
  const uninstallPlugin = useUninstallPlugin();

  const handleToggleEnabled = async (plugin: Plugin) => {
    if (plugin.enabled) {
      await unloadPlugin.mutateAsync(plugin.manifest.id);
      disablePlugin.mutate(plugin.manifest.id);
    } else {
      await enablePlugin.mutateAsync(plugin.manifest.id);
      loadPlugin.mutate(plugin.manifest.id);
    }
  };

  const handleDiscover = async () => { await discoverPlugins.mutateAsync(); refetch(); };

  const handleInstall = async () => {
    if (!installSource.trim()) return;
    try {
      await installPlugin.mutateAsync({ source: installSource.trim() });
      setInstallDialogOpen(false);
      setInstallSource('');
    } catch {}
  };

  const handleUninstall = async (id: string) => {
    if (confirm('Are you sure you want to uninstall this plugin?')) uninstallPlugin.mutate(id);
  };

  const handleMarketplaceInstall = async (plugin: MarketplacePlugin) => {
    setInstallingPlugin(plugin.id);
    try { await installPlugin.mutateAsync({ source: plugin.source }); refetch(); } catch {} finally { setInstallingPlugin(null); }
  };

  const plugins = data?.plugins || [];
  const installedPluginIds = new Set(plugins.map(p => p.manifest.id));

  const filteredPlugins = plugins.filter((p) => {
    const q = searchQuery.toLowerCase();
    return !q || p.manifest.name.toLowerCase().includes(q) || p.manifest.id.toLowerCase().includes(q) || p.manifest.description?.toLowerCase().includes(q);
  });

  const filteredMarketplace = marketplacePlugins.filter((p) => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.tags.some(t => t.toLowerCase().includes(q));
    const matchType = !typeFilter || p.type === typeFilter;
    return matchSearch && matchType;
  });

  if (error) {
    return (
      <div className="px-6 py-6">
        <div className="rounded-xl bg-red-400/5 border border-red-400/20 p-4 text-xs text-red-400">
          {error instanceof Error ? error.message : 'An error occurred loading plugins'}
        </div>
      </div>
    );
  }

  const TYPE_OPTIONS = ['', 'action', 'auth', 'exporter', 'importer', 'reporter'];

  return (
    <div className="px-6 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Puzzle className="h-4 w-4 text-[#3d5670]" />
          <h1 className="text-xl font-semibold text-[#c8dce8]">Plugins</h1>
          <p className="text-xs text-[#3d5670] mt-0.5">Extend TestMesh with custom actions, integrations, and more</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDiscover}
            disabled={discoverPlugins.isPending}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-[#0f1923] border border-[#1e2d3d] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] disabled:opacity-50 transition-colors"
          >
            <FolderSearch className="w-3 h-3" />
            {discoverPlugins.isPending ? 'Scanning…' : 'Discover'}
          </button>
          <Dialog open={installDialogOpen} onOpenChange={setInstallDialogOpen}>
            <DialogTrigger asChild>
              <button className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-[#0f1923] border border-[#1e2d3d] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors">
                <Download className="w-3 h-3" />
                Install from Path
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Install Plugin</DialogTitle>
                <DialogDescription>Enter the path to a plugin directory to install it.</DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-2">
                <Input placeholder="/path/to/plugin or https://..." value={installSource} onChange={(e) => setInstallSource(e.target.value)} className="bg-[#0b0f18] border-[#1a2332] text-[#c8dce8] placeholder-[#3d5670]" />
                <p className="text-xs text-[#4a6480]">The plugin directory must contain a valid manifest.json file.</p>
              </div>
              <DialogFooter>
                <button onClick={() => setInstallDialogOpen(false)} className="h-8 px-4 rounded-lg text-xs font-medium bg-[#0b0f18] border border-[#1e2d3d] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors">Cancel</button>
                <button onClick={handleInstall} disabled={!installSource.trim() || installPlugin.isPending} className="h-8 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors">
                  {installPlugin.isPending ? 'Installing…' : 'Install'}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1">
        <button onClick={() => setActiveTab('installed')} className={cn(pillBtn(activeTab === 'installed'), 'flex items-center gap-1.5')}>
          <Package className="w-3 h-3" />
          Installed ({plugins.length})
        </button>
        <button onClick={() => setActiveTab('marketplace')} className={cn(pillBtn(activeTab === 'marketplace'), 'flex items-center gap-1.5')}>
          <Download className="w-3 h-3" />
          Marketplace
        </button>
      </div>

      {/* ── Installed tab ── */}
      {activeTab === 'installed' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[#3d5670]" />
              <input
                placeholder="Search plugins by name, ID, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-7 pl-7 pr-3 rounded-lg bg-[#0f1923] border border-[#1e2d3d] text-xs text-[#c8dce8] placeholder-[#3d5670] focus:outline-none focus:border-teal-400/50 transition-colors"
              />
            </div>
            <div className="flex gap-1">
              {TYPE_OPTIONS.map((type) => (
                <button key={type || 'all'} onClick={() => setTypeFilter(type)} className={pillBtn(typeFilter === type)}>
                  {type ? type.charAt(0).toUpperCase() + type.slice(1) : 'All'}
                </button>
              ))}
            </div>
            {(searchQuery || typeFilter) && (
              <button onClick={() => { setSearchQuery(''); setTypeFilter(''); }} className="flex items-center justify-center h-7 w-7 rounded-lg text-[#4a6480] hover:text-[#c8dce8] hover:bg-[#1a2d3d] transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] flex items-center justify-center py-12">
              <p className="text-xs text-[#4a6480]">Loading plugins…</p>
            </div>
          ) : filteredPlugins.length === 0 ? (
            <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] flex flex-col items-center justify-center py-16 text-center">
              <Puzzle className="w-10 h-10 mb-3 text-[#1e2d3d]" />
              <p className="text-[13px] font-semibold text-[#c8dce8] mb-1">{plugins.length === 0 ? 'No plugins installed' : 'No plugins match your search'}</p>
              <p className="text-xs text-[#4a6480] mb-4">Browse the Marketplace to discover plugins, or click &quot;Discover&quot; to scan your local directory.</p>
              <div className="flex gap-2">
                <button onClick={() => setActiveTab('marketplace')} className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors">
                  <Download className="w-3 h-3" />
                  Browse Marketplace
                </button>
                <button onClick={handleDiscover} className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-[#0f1923] border border-[#1e2d3d] text-[#7fa8c8] hover:border-[#2a3d52] transition-colors">
                  <FolderSearch className="w-3 h-3" />
                  Discover Local
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
              <div className="grid grid-cols-[2fr_1fr_auto_auto_auto_auto] gap-4 px-4 py-2.5 border-b border-[#1a2332]">
                {['Plugin', 'Type', 'Version', 'Status', 'Enabled', ''].map((h) => (
                  <span key={h} className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{h}</span>
                ))}
              </div>
              <div className="divide-y divide-[#1a2332]">
                {filteredPlugins.map((plugin) => (
                  <div key={plugin.manifest.id} className="grid grid-cols-[2fr_1fr_auto_auto_auto_auto] gap-4 px-4 py-3 items-center hover:bg-[#131b26] transition-colors group">
                    <div>
                      <Link href={`/plugins/${plugin.manifest.id}`} className="text-xs font-medium text-[#c8dce8] hover:text-teal-400 transition-colors">
                        {plugin.manifest.name}
                      </Link>
                      {plugin.manifest.description && (
                        <p className="text-[10px] text-[#4a6480] truncate">{plugin.manifest.description}</p>
                      )}
                    </div>
                    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize', TYPE_COLORS[plugin.manifest.type] ?? 'bg-[#1a2d3d] text-[#4a7a96]')}>
                      {plugin.manifest.type}
                    </span>
                    <code className="text-[10px] text-[#4a6480]">v{plugin.manifest.version}</code>
                    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded border', getStatusStyle(plugin))}>
                      {getStatusLabel(plugin)}
                    </span>
                    <Switch
                      checked={plugin.enabled}
                      onCheckedChange={() => handleToggleEnabled(plugin)}
                      disabled={enablePlugin.isPending || disablePlugin.isPending || loadPlugin.isPending || unloadPlugin.isPending}
                    />
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link href={`/plugins/${plugin.manifest.id}`} className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-teal-400 hover:bg-[#1a2d3d] transition-colors">
                        <Eye className="w-3.5 h-3.5" />
                      </Link>
                      <button onClick={() => handleUninstall(plugin.manifest.id)} disabled={uninstallPlugin.isPending} className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-red-400 hover:bg-red-400/10 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data && data.total > 0 && (
            <p className="text-xs text-[#3d5670] text-center">Showing {filteredPlugins.length} of {data.total} plugins</p>
          )}
        </div>
      )}

      {/* ── Marketplace tab ── */}
      {activeTab === 'marketplace' && (
        <div className="space-y-6">
          {/* Built-in Native Plugins */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Package className="h-4 w-4 text-[#3d5670]" />
              <h2 className="text-sm font-semibold text-[#c8dce8]">Built-in Integrations</h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-teal-400/10 text-teal-400 border border-teal-400/30">Native</span>
            </div>
            <p className="text-xs text-[#4a6480] mb-3">These integrations are built into the API — no installation needed, better performance.</p>
            <div className="grid grid-cols-3 gap-3">
              {nativePluginIds.map((id) => {
                const meta = nativePluginMeta[id];
                const Icon = meta?.icon ?? Package;
                const name = meta?.name ?? id;
                const description = meta?.description ?? `Native plugin: ${id}`;
                const actions = meta?.actions ?? [`${id}.*`];
                return (
                  <div key={id} className="rounded-xl bg-teal-400/5 border border-teal-400/20 p-3">
                    <div className="flex items-start gap-2.5 mb-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-400/10 shrink-0">
                        <Icon className="h-4 w-4 text-teal-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-xs font-semibold text-[#c8dce8]">{name}</p>
                          <span className="flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-teal-400/10 text-teal-400 border border-teal-400/30">
                            <CheckCircle2 className="h-2.5 w-2.5" />Built-in
                          </span>
                        </div>
                        <p className="text-[10px] text-[#4a6480] mt-0.5 line-clamp-2">{description}</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-[#3d5670]">
                      <span className="font-medium">Actions: </span>
                      {actions.slice(0, 3).join(', ')}{actions.length > 3 && ` +${actions.length - 3} more`}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Marketplace Plugins */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Download className="h-4 w-4 text-[#3d5670]" />
              <h2 className="text-sm font-semibold text-[#c8dce8]">Marketplace Plugins</h2>
            </div>
            <p className="text-xs text-[#4a6480] mb-3">Installable plugins written in Go or Node.js. Use these as examples for creating your own.</p>

            {/* Search */}
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[#3d5670]" />
                <input
                  placeholder="Search available plugins..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-7 pl-7 pr-3 rounded-lg bg-[#0f1923] border border-[#1e2d3d] text-xs text-[#c8dce8] placeholder-[#3d5670] focus:outline-none focus:border-teal-400/50 transition-colors"
                />
              </div>
              <div className="flex gap-1">
                {TYPE_OPTIONS.map((type) => (
                  <button key={type || 'all'} onClick={() => setTypeFilter(type)} className={pillBtn(typeFilter === type)}>
                    {type ? type.charAt(0).toUpperCase() + type.slice(1) : 'All'}
                  </button>
                ))}
              </div>
            </div>

            {filteredMarketplace.length === 0 ? (
              <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] flex flex-col items-center justify-center py-12 text-center">
                <Package className="w-10 h-10 mb-3 text-[#1e2d3d]" />
                <p className="text-xs text-[#4a6480]">No plugins match your search criteria</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {filteredMarketplace.map((plugin) => {
                  const Icon = plugin.icon;
                  const isInstalled = installedPluginIds.has(plugin.id);
                  return (
                    <div key={plugin.id} className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] flex flex-col">
                      <div className="p-3 flex-1">
                        <div className="flex items-start gap-2.5 mb-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1a2d3d] shrink-0">
                            <Icon className="h-4 w-4 text-[#4a7a96]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-xs font-semibold text-[#c8dce8]">{plugin.name}</p>
                              {isInstalled && (
                                <span className="flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-teal-400/10 text-teal-400 border border-teal-400/30">
                                  <CheckCircle2 className="h-2.5 w-2.5" />Installed
                                </span>
                              )}
                              {plugin.comingSoon && !isInstalled && (
                                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#4a7a96] border border-[#2a3d52]">Soon</span>
                              )}
                            </div>
                            <p className="text-[10px] text-[#4a6480] mt-0.5 line-clamp-2">{plugin.description}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {plugin.tags.map((tag) => (
                            <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#3d5670] border border-[#2a3d52]">{tag}</span>
                          ))}
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-[#3d5670]">
                          <span>v{plugin.version}</span>
                          <span>by {plugin.author}</span>
                        </div>
                        {plugin.downloads && (
                          <p className="text-[10px] text-[#3d5670] mt-0.5">{plugin.downloads.toLocaleString()} installs</p>
                        )}
                      </div>
                      <div className="px-3 pb-3">
                        {isInstalled ? (
                          <Link href={`/plugins/${plugin.id}`} className="w-full h-7 rounded-lg text-xs font-medium bg-[#0b0f18] border border-[#1e2d3d] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors flex items-center justify-center gap-1.5">
                            <Eye className="w-3 h-3" />View Plugin
                          </Link>
                        ) : plugin.comingSoon ? (
                          <button disabled className="w-full h-7 rounded-lg text-xs font-medium bg-[#0b0f18] border border-[#1e2d3d] text-[#3d5670] opacity-50 cursor-not-allowed">
                            Coming Soon
                          </button>
                        ) : (
                          <button
                            onClick={() => handleMarketplaceInstall(plugin)}
                            disabled={installingPlugin === plugin.id}
                            className="w-full h-7 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                          >
                            {installingPlugin === plugin.id
                              ? <><RefreshCw className="w-3 h-3 animate-spin" />Installing…</>
                              : <><Download className="w-3 h-3" />Install</>}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="text-center text-xs text-[#3d5670]">
            Looking for a specific plugin?{' '}
            <button onClick={() => setInstallDialogOpen(true)} className="text-teal-400 hover:text-teal-300 transition-colors">
              Install from path or URL
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
