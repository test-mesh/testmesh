'use client';

import { useState } from 'react';
import { useIntegrations, useDeleteIntegration, useTestConnection } from '@/lib/hooks/useIntegrations';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, Settings, Trash2, CheckCircle, XCircle, Loader2, AlertCircle, Server } from 'lucide-react';
import { AIProviderDialog } from './AIProviderDialog';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { SystemIntegration, IntegrationProvider } from '@/lib/api/integrations';

const PROVIDERS = [
  {
    provider: 'openai' as IntegrationProvider,
    name: 'OpenAI',
    description: 'GPT-4, GPT-4o, and other OpenAI models',
    icon: Bot,
  },
  {
    provider: 'anthropic' as IntegrationProvider,
    name: 'Anthropic',
    description: 'Claude Sonnet, Opus, and Haiku models',
    icon: Bot,
  },
  {
    provider: 'local' as IntegrationProvider,
    name: 'Local LLM',
    description: 'Self-hosted models (Ollama, vLLM, etc.)',
    icon: Server,
  },
];

export function AIProviderSection() {
  const { data, isLoading } = useIntegrations({ type: 'ai_provider' });
  const deleteIntegration = useDeleteIntegration();
  const testConnection = useTestConnection();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<IntegrationProvider | null>(null);
  const [selectedIntegration, setSelectedIntegration] = useState<SystemIntegration | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [integrationToDelete, setIntegrationToDelete] = useState<SystemIntegration | null>(null);

  const integrations = data?.integrations || [];

  const getIntegrationForProvider = (provider: IntegrationProvider) => {
    return integrations.find(i => i.provider === provider);
  };

  const handleConfigure = (provider: IntegrationProvider, integration?: SystemIntegration) => {
    setSelectedProvider(provider);
    setSelectedIntegration(integration || null);
    setDialogOpen(true);
  };

  const handleDelete = (integration: SystemIntegration) => {
    setIntegrationToDelete(integration);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!integrationToDelete) return;

    try {
      await deleteIntegration.mutateAsync(integrationToDelete.id);
      toast({
        title: 'Integration deleted',
        description: `${integrationToDelete.name} has been removed.`,
      });
      setDeleteDialogOpen(false);
      setIntegrationToDelete(null);
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Failed to delete integration',
        variant: 'destructive',
      });
    }
  };

  const handleTest = async (integration: SystemIntegration) => {
    try {
      const result = await testConnection.mutateAsync(integration.id);

      if (result.success) {
        toast({
          title: 'Connection successful',
          description: result.message || 'Provider is configured correctly',
        });
      } else {
        toast({
          title: 'Connection failed',
          description: result.error || 'Failed to connect to provider',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Test failed',
        description: error instanceof Error ? error.message : 'Failed to test connection',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (integration?: SystemIntegration) => {
    if (!integration) {
      return <Badge variant="outline">Not Configured</Badge>;
    }

    switch (integration.status) {
      case 'active':
        return (
          <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
            <CheckCircle className="h-3 w-3 mr-1" />
            Active
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        );
      case 'disabled':
        return <Badge variant="secondary">Disabled</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-6 md:grid-cols-3">
        {PROVIDERS.map(({ provider, name, description, icon: Icon }) => {
          const integration = getIntegrationForProvider(provider);
          const isConfigured = !!integration;

          return (
            <Card key={provider} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{name}</CardTitle>
                      {getStatusBadge(integration)}
                    </div>
                  </div>
                </div>
                <CardDescription className="mt-2">{description}</CardDescription>
              </CardHeader>

              <CardContent className="flex-1">
                {integration && (
                  <div className="space-y-2 text-sm">
                    {integration.config.model && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Model:</span>
                        <span className="font-medium">{integration.config.model}</span>
                      </div>
                    )}
                    {integration.config.endpoint && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Endpoint:</span>
                        <span className="font-mono text-xs">{integration.config.endpoint}</span>
                      </div>
                    )}
                    {integration.last_test_at && (
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Last tested:</span>
                        <div className="flex items-center gap-1">
                          {integration.last_test_status === 'success' ? (
                            <CheckCircle className="h-3 w-3 text-green-600" />
                          ) : (
                            <AlertCircle className="h-3 w-3 text-red-600" />
                          )}
                          <span className="text-xs">
                            {new Date(integration.last_test_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    )}
                    {integration.last_test_error && (
                      <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                        {integration.last_test_error}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>

              <CardFooter className="flex gap-2">
                {isConfigured ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleConfigure(provider, integration)}
                      className="flex-1"
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTest(integration)}
                      disabled={testConnection.isPending}
                    >
                      {testConnection.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Test'
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(integration)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => handleConfigure(provider)}
                    className="w-full"
                    size="sm"
                  >
                    Configure
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <AIProviderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        provider={selectedProvider}
        integration={selectedIntegration}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Integration</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{integrationToDelete?.name}</strong>?
              This will stop all AI-powered features from using this provider.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
