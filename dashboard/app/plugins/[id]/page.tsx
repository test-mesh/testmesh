'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  usePlugin,
  usePluginInfo,
  useEnablePlugin,
  useDisablePlugin,
  useLoadPlugin,
  useUnloadPlugin,
  useUninstallPlugin,
} from '@/lib/hooks/usePlugins';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  ArrowLeft,
  Puzzle,
  Play,
  Square,
  Trash2,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';

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
    if (plugin.enabled) {
      disablePlugin.mutate(plugin.manifest.id);
    } else {
      enablePlugin.mutate(plugin.manifest.id);
    }
  };

  const handleLoad = async () => {
    if (!plugin) return;
    loadPlugin.mutate(plugin.manifest.id);
  };

  const handleUnload = async () => {
    if (!plugin) return;
    unloadPlugin.mutate(plugin.manifest.id);
  };

  const handleUninstall = async () => {
    if (!plugin) return;
    if (confirm('Are you sure you want to uninstall this plugin? This action cannot be undone.')) {
      await uninstallPlugin.mutateAsync(plugin.manifest.id);
      router.push('/plugins');
    }
  };

  const getStatusBadge = () => {
    if (!plugin) return null;
    if (plugin.error) {
      return (
        <Badge variant="destructive">
          <AlertCircle className="w-3 h-3 mr-1" />
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

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">Loading plugin...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !plugin) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Plugin Not Found</CardTitle>
            <CardDescription>
              The requested plugin could not be found.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/plugins">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Plugins
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <Link href="/plugins" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" />
          Back to Plugins
        </Link>

        <div className="flex justify-between items-start">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
              <Puzzle className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">{plugin.manifest.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-sm text-muted-foreground">{plugin.manifest.id}</code>
                <span className="text-muted-foreground">v{plugin.manifest.version}</span>
                {getStatusBadge()}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 mr-4">
              <span className="text-sm text-muted-foreground">Enabled</span>
              <Switch
                checked={plugin.enabled}
                onCheckedChange={handleToggleEnabled}
                disabled={enablePlugin.isPending || disablePlugin.isPending}
              />
            </div>
            {plugin.loaded ? (
              <Button
                variant="outline"
                onClick={handleUnload}
                disabled={unloadPlugin.isPending}
              >
                <Square className="w-4 h-4 mr-2" />
                Stop
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={handleLoad}
                disabled={loadPlugin.isPending || !plugin.enabled}
              >
                <Play className="w-4 h-4 mr-2" />
                Start
              </Button>
            )}
            <Button
              variant="destructive"
              onClick={handleUninstall}
              disabled={uninstallPlugin.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Uninstall
            </Button>
          </div>
        </div>
      </div>

      {plugin.error && (
        <Card className="mb-6 border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Plugin Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <code className="text-sm bg-destructive/10 p-4 block rounded">
              {plugin.error}
            </code>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {plugin.manifest.description && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Description</h4>
                <p className="mt-1">{plugin.manifest.description}</p>
              </div>
            )}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">Type</h4>
              <Badge variant="secondary" className="mt-1 capitalize">
                {plugin.manifest.type}
              </Badge>
            </div>
            {plugin.manifest.author && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Author</h4>
                <p className="mt-1">{plugin.manifest.author}</p>
              </div>
            )}
            {plugin.manifest.homepage && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Homepage</h4>
                <a
                  href={plugin.manifest.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 text-primary hover:underline inline-flex items-center gap-1"
                >
                  {plugin.manifest.homepage}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">Entry Point</h4>
              <code className="mt-1 text-sm bg-muted px-2 py-1 rounded">
                {plugin.manifest.entry_point}
              </code>
            </div>
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">Path</h4>
              <code className="mt-1 text-sm bg-muted px-2 py-1 rounded break-all">
                {plugin.path}
              </code>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
            <CardDescription>
              Custom actions provided by this plugin
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pluginInfo?.actions && pluginInfo.actions.length > 0 ? (
              <div className="space-y-3">
                {pluginInfo.actions.map((action) => (
                  <div key={action.id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <code className="text-sm font-medium">{action.id}</code>
                    </div>
                    {action.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {action.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">
                {plugin.loaded
                  ? 'No actions available'
                  : 'Start the plugin to see available actions'}
              </p>
            )}
          </CardContent>
        </Card>

        {plugin.manifest.permissions && plugin.manifest.permissions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Permissions</CardTitle>
              <CardDescription>
                Capabilities required by this plugin
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {plugin.manifest.permissions.map((permission) => (
                  <Badge key={permission} variant="outline">
                    {permission}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {plugin.manifest.config && Object.keys(plugin.manifest.config).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>
                Plugin configuration options
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="text-sm bg-muted p-4 rounded overflow-auto">
                {JSON.stringify(plugin.manifest.config, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
