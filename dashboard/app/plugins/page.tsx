'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  usePlugins,
  useEnablePlugin,
  useDisablePlugin,
  useLoadPlugin,
  useUnloadPlugin,
  useDiscoverPlugins,
  useInstallPlugin,
  useUninstallPlugin,
} from '@/lib/hooks/usePlugins';
import type { Plugin } from '@/lib/api/plugins';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Eye,
  Trash2,
  X,
  Search,
  Puzzle,
  RefreshCw,
  Download,
  FolderSearch,
  Package,
  Database,
  MessageSquare,
  Globe,
  Mail,
  Cloud,
  CheckCircle2,
} from 'lucide-react';

// Available plugins in the marketplace
// This could be fetched from an API in production
interface MarketplacePlugin {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  type: 'action' | 'auth' | 'exporter' | 'importer' | 'reporter';
  icon: React.ComponentType<{ className?: string }>;
  source: string; // Installation path/URL
  tags: string[];
  downloads?: number;
  comingSoon?: boolean;
}

// Built-in native plugins (Go) - always available, no installation needed
interface NativePlugin {
  id: string;
  name: string;
  description: string;
  version: string;
  type: 'action';
  icon: React.ComponentType<{ className?: string }>;
  actions: string[];
}

const nativePlugins: NativePlugin[] = [
  {
    id: 'kafka',
    name: 'Apache Kafka',
    description: 'Produce and consume messages, manage topics, and test event-driven architectures',
    version: '1.0.0',
    type: 'action',
    icon: MessageSquare,
    actions: ['kafka.produce', 'kafka.consume', 'kafka.admin.topics', 'kafka.admin.createTopic', 'kafka.admin.deleteTopic'],
  },
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    description: 'Execute SQL queries, manage transactions, and validate database state',
    version: '1.0.0',
    type: 'action',
    icon: Database,
    actions: ['postgresql.query', 'postgresql.insert', 'postgresql.update', 'postgresql.delete', 'postgresql.assert', 'postgresql.transaction'],
  },
];

// External plugins - available in marketplace
const marketplacePlugins: MarketplacePlugin[] = [
  {
    id: 'redis',
    name: 'Redis',
    description: 'Key-value store, hashes, lists, sets, pub/sub - example Go plugin',
    version: '1.0.0',
    author: 'TestMesh',
    type: 'action',
    icon: Database,
    source: '../plugins/redis',
    tags: ['cache', 'nosql', 'golang', 'example'],
    downloads: 1024,
  },
  {
    id: 'scraper',
    name: 'Web Scraper',
    description: 'HTML parsing and data extraction using cheerio - example Node.js plugin',
    version: '1.0.0',
    author: 'TestMesh',
    type: 'action',
    icon: Globe,
    source: '../plugins/scraper',
    tags: ['html', 'parsing', 'nodejs', 'example'],
    downloads: 756,
  },
  {
    id: 'testmesh-plugin-mongodb',
    name: 'MongoDB',
    description: 'Document operations, aggregation pipelines, and NoSQL testing',
    version: '1.0.0',
    author: 'TestMesh',
    type: 'action',
    icon: Database,
    source: '../plugins/mongodb',
    tags: ['database', 'nosql', 'documents'],
    downloads: 743,
    comingSoon: true,
  },
  {
    id: 'testmesh-plugin-smtp',
    name: 'SMTP Email',
    description: 'Send test emails and verify email delivery in your test flows',
    version: '1.0.0',
    author: 'TestMesh',
    type: 'action',
    icon: Mail,
    source: '../plugins/smtp',
    tags: ['email', 'notifications'],
    downloads: 512,
    comingSoon: true,
  },
  {
    id: 'testmesh-plugin-s3',
    name: 'AWS S3',
    description: 'Upload, download, and manage files in S3-compatible storage',
    version: '1.0.0',
    author: 'TestMesh',
    type: 'action',
    icon: Cloud,
    source: '../plugins/s3',
    tags: ['storage', 'aws', 'files'],
    downloads: 634,
    comingSoon: true,
  },
];

export default function PluginsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [installSource, setInstallSource] = useState('');
  const [activeTab, setActiveTab] = useState<'installed' | 'marketplace'>('installed');
  const [installingPlugin, setInstallingPlugin] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = usePlugins({
    type: typeFilter || undefined,
  });

  const enablePlugin = useEnablePlugin();
  const disablePlugin = useDisablePlugin();
  const loadPlugin = useLoadPlugin();
  const unloadPlugin = useUnloadPlugin();
  const discoverPlugins = useDiscoverPlugins();
  const installPlugin = useInstallPlugin();
  const uninstallPlugin = useUninstallPlugin();

  const handleToggleEnabled = async (plugin: Plugin) => {
    if (plugin.enabled) {
      // Disable: first unload, then disable
      await unloadPlugin.mutateAsync(plugin.manifest.id);
      disablePlugin.mutate(plugin.manifest.id);
    } else {
      // Enable: first enable, then load
      await enablePlugin.mutateAsync(plugin.manifest.id);
      loadPlugin.mutate(plugin.manifest.id);
    }
  };

  const handleDiscover = async () => {
    await discoverPlugins.mutateAsync();
    refetch();
  };

  const handleInstall = async () => {
    if (!installSource.trim()) return;
    try {
      await installPlugin.mutateAsync({ source: installSource.trim() });
      setInstallDialogOpen(false);
      setInstallSource('');
    } catch (err) {
      // Error is handled by React Query
    }
  };

  const handleUninstall = async (id: string) => {
    if (confirm('Are you sure you want to uninstall this plugin?')) {
      uninstallPlugin.mutate(id);
    }
  };

  const handleMarketplaceInstall = async (plugin: MarketplacePlugin) => {
    setInstallingPlugin(plugin.id);
    try {
      await installPlugin.mutateAsync({ source: plugin.source });
      refetch();
    } catch (err) {
      // Error handled by React Query
    } finally {
      setInstallingPlugin(null);
    }
  };

  const plugins = data?.plugins || [];

  // Check which marketplace plugins are already installed
  const installedPluginIds = new Set(plugins.map(p => p.manifest.id));

  // Filter marketplace plugins by search
  const filteredMarketplacePlugins = marketplacePlugins.filter((plugin) => {
    const matchesSearch =
      plugin.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      plugin.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      plugin.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      plugin.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType = !typeFilter || plugin.type === typeFilter;

    return matchesSearch && matchesType;
  });
  const filteredPlugins = plugins.filter((plugin) => {
    const matchesSearch =
      plugin.manifest.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      plugin.manifest.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      plugin.manifest.description?.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesSearch;
  });

  const hasActiveFilters = searchQuery || typeFilter;
  const clearFilters = () => {
    setSearchQuery('');
    setTypeFilter('');
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      action: 'bg-blue-500',
      auth: 'bg-green-500',
      exporter: 'bg-purple-500',
      importer: 'bg-orange-500',
      reporter: 'bg-pink-500',
    };

    return (
      <Badge variant="secondary" className="capitalize">
        <span className={`w-2 h-2 rounded-full ${colors[type] || 'bg-gray-500'} mr-2`} />
        {type}
      </Badge>
    );
  };

  const getStatusBadge = (plugin: Plugin) => {
    if (plugin.error) {
      return (
        <Badge variant="destructive" title={plugin.error}>
          Error
        </Badge>
      );
    }
    if (plugin.loaded) {
      return (
        <Badge variant="default" className="bg-green-500">
          Running
        </Badge>
      );
    }
    return <Badge variant="secondary">Stopped</Badge>;
  };

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Error Loading Plugins</CardTitle>
            <CardDescription>
              {error instanceof Error ? error.message : 'An error occurred'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Puzzle className="w-8 h-8" />
            Plugins
          </h1>
          <p className="text-muted-foreground mt-1">
            Extend TestMesh with custom actions, integrations, and more
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleDiscover}
            disabled={discoverPlugins.isPending}
          >
            <FolderSearch className="w-4 h-4 mr-2" />
            {discoverPlugins.isPending ? 'Scanning...' : 'Discover'}
          </Button>

          <Dialog open={installDialogOpen} onOpenChange={setInstallDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Install from Path
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Install Plugin</DialogTitle>
                <DialogDescription>
                  Enter the path to a plugin directory to install it.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Input
                  placeholder="/path/to/plugin or https://..."
                  value={installSource}
                  onChange={(e) => setInstallSource(e.target.value)}
                />
                <p className="text-sm text-muted-foreground mt-2">
                  The plugin directory must contain a valid manifest.json file.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInstallDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleInstall}
                  disabled={!installSource.trim() || installPlugin.isPending}
                >
                  {installPlugin.isPending ? 'Installing...' : 'Install'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'installed' | 'marketplace')}>
        <TabsList className="mb-6">
          <TabsTrigger value="installed" className="gap-2">
            <Package className="w-4 h-4" />
            Installed ({plugins.length})
          </TabsTrigger>
          <TabsTrigger value="marketplace" className="gap-2">
            <Download className="w-4 h-4" />
            Marketplace
          </TabsTrigger>
        </TabsList>

        <TabsContent value="installed">
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search plugins by name, ID, or description..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="px-3 py-2 border rounded-md bg-background"
                  >
                    <option value="">All Types</option>
                    <option value="action">Action</option>
                    <option value="auth">Auth</option>
                    <option value="exporter">Exporter</option>
                    <option value="importer">Importer</option>
                    <option value="reporter">Reporter</option>
                  </select>
                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={clearFilters}
                      title="Clear filters"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                {hasActiveFilters && (
                  <div className="flex gap-2 items-center text-sm text-muted-foreground">
                    <span>Active filters:</span>
                    {searchQuery && (
                      <Badge variant="secondary" className="gap-1">
                        Search: {searchQuery}
                        <button
                          onClick={() => setSearchQuery('')}
                          className="ml-1 hover:text-foreground"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    )}
                    {typeFilter && (
                      <Badge variant="secondary" className="gap-1">
                        Type: {typeFilter}
                        <button
                          onClick={() => setTypeFilter('')}
                          className="ml-1 hover:text-foreground"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  Loading plugins...
                </div>
              </CardContent>
            </Card>
          ) : filteredPlugins.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center">
                  <Puzzle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground mb-4">
                    {plugins.length === 0
                      ? 'No plugins installed'
                      : 'No plugins match your search'}
                  </p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Browse the <Button variant="link" className="p-0 h-auto" onClick={() => setActiveTab('marketplace')}>Marketplace</Button> to discover plugins, or click &quot;Discover&quot; to scan your local plugin directory.
                  </p>
                  <div className="flex justify-center gap-2">
                    <Button onClick={() => setActiveTab('marketplace')}>
                      <Download className="w-4 h-4 mr-2" />
                      Browse Marketplace
                    </Button>
                    <Button variant="outline" onClick={handleDiscover}>
                      <FolderSearch className="w-4 h-4 mr-2" />
                      Discover Local
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plugin</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Enabled</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPlugins.map((plugin) => (
                    <TableRow key={plugin.manifest.id}>
                      <TableCell>
                        <Link
                          href={`/plugins/${plugin.manifest.id}`}
                          className="font-medium hover:underline"
                        >
                          {plugin.manifest.name}
                        </Link>
                        {plugin.manifest.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {plugin.manifest.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>{getTypeBadge(plugin.manifest.type)}</TableCell>
                      <TableCell>
                        <code className="text-sm">{plugin.manifest.version}</code>
                      </TableCell>
                      <TableCell>{getStatusBadge(plugin)}</TableCell>
                      <TableCell>
                        <Switch
                          checked={plugin.enabled}
                          onCheckedChange={() => handleToggleEnabled(plugin)}
                          disabled={enablePlugin.isPending || disablePlugin.isPending || loadPlugin.isPending || unloadPlugin.isPending}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Link href={`/plugins/${plugin.manifest.id}`}>
                            <Button variant="ghost" size="sm">
                              <Eye className="w-4 h-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUninstall(plugin.manifest.id)}
                            disabled={uninstallPlugin.isPending}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          {data && data.total > 0 && (
            <div className="mt-4 text-sm text-muted-foreground text-center">
              Showing {filteredPlugins.length} of {data.total} plugins
            </div>
          )}
        </TabsContent>

        <TabsContent value="marketplace">
          {/* Built-in Native Plugins Section */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Package className="w-5 h-5" />
              Built-in Integrations
              <Badge variant="secondary" className="ml-2">Native Go</Badge>
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              These integrations are built into the API - no installation needed, better performance.
            </p>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
              {nativePlugins.map((plugin) => {
                const Icon = plugin.icon;
                return (
                  <Card key={plugin.id} className="border-green-500/20 bg-green-500/5">
                    <CardHeader>
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                          <Icon className="h-5 w-5 text-green-600" />
                        </div>
                        <div className="flex-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                            {plugin.name}
                            <Badge variant="outline" className="text-green-600 border-green-500">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Built-in
                            </Badge>
                          </CardTitle>
                          <CardDescription className="mt-1">
                            {plugin.description}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium">Actions:</span>{' '}
                        {plugin.actions.slice(0, 3).join(', ')}
                        {plugin.actions.length > 3 && ` +${plugin.actions.length - 3} more`}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* External Plugins Section */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Download className="w-5 h-5" />
              Marketplace Plugins
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Installable plugins written in Go or Node.js. Use these as examples for creating your own plugins.
            </p>
          </div>

          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search available plugins..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="px-3 py-2 border rounded-md bg-background"
                >
                  <option value="">All Types</option>
                  <option value="action">Action</option>
                  <option value="auth">Auth</option>
                  <option value="exporter">Exporter</option>
                  <option value="importer">Importer</option>
                  <option value="reporter">Reporter</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredMarketplacePlugins.map((plugin) => {
              const Icon = plugin.icon;
              const isInstalled = installedPluginIds.has(plugin.id);

              return (
                <Card key={plugin.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-lg flex items-center gap-2">
                          {plugin.name}
                          {isInstalled && (
                            <Badge variant="secondary" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Installed
                            </Badge>
                          )}
                          {plugin.comingSoon && !isInstalled && (
                            <Badge variant="outline" className="text-muted-foreground">
                              Soon
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {plugin.description}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <div className="flex flex-wrap gap-1 mb-3">
                      {plugin.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>v{plugin.version}</span>
                      <span>by {plugin.author}</span>
                    </div>
                    {plugin.downloads && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {plugin.downloads.toLocaleString()} installs
                      </div>
                    )}
                  </CardContent>
                  <div className="p-4 pt-0">
                    {isInstalled ? (
                      <Button variant="outline" className="w-full" asChild>
                        <Link href={`/plugins/${plugin.id}`}>
                          <Eye className="w-4 h-4 mr-2" />
                          View Plugin
                        </Link>
                      </Button>
                    ) : plugin.comingSoon ? (
                      <Button variant="outline" className="w-full" disabled>
                        Coming Soon
                      </Button>
                    ) : (
                      <Button
                        className="w-full"
                        onClick={() => handleMarketplaceInstall(plugin)}
                        disabled={installingPlugin === plugin.id}
                      >
                        {installingPlugin === plugin.id ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            Installing...
                          </>
                        ) : (
                          <>
                            <Download className="w-4 h-4 mr-2" />
                            Install
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          {filteredMarketplacePlugins.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  No plugins match your search criteria
                </p>
              </CardContent>
            </Card>
          )}

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Looking for a specific plugin?{' '}
            <Button variant="link" className="p-0 h-auto" onClick={() => setInstallDialogOpen(true)}>
              Install from path or URL
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
