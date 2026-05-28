'use client';

import { useState } from 'react';
import { useIntegrations, useDeleteIntegration, useTestConnection } from '@/lib/hooks/useIntegrations';
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

function getStatusSpan(integration?: SystemIntegration) {
  if (!integration) {
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a2332] text-[#4a6480]">Not Configured</span>;
  }
  switch (integration.status) {
    case 'active':
      return (
        <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-teal-400/10 text-teal-400">
          <CheckCircle className="h-3 w-3" />Active
        </span>
      );
    case 'error':
      return (
        <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-red-400/10 text-red-400">
          <XCircle className="h-3 w-3" />Error
        </span>
      );
    case 'disabled':
      return <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a2332] text-[#4a6480]">Disabled</span>;
    default:
      return <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a2332] text-[#4a6480]">Unknown</span>;
  }
}

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

  const getIntegrationForProvider = (provider: IntegrationProvider) =>
    integrations.find(i => i.provider === provider);

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
      toast({ title: 'Integration deleted', description: `${integrationToDelete.name} has been removed.` });
      setDeleteDialogOpen(false);
      setIntegrationToDelete(null);
    } catch (error) {
      toast({ title: 'Delete failed', description: error instanceof Error ? error.message : 'Failed to delete integration', variant: 'destructive' });
    }
  };

  const handleTest = async (integration: SystemIntegration) => {
    try {
      const result = await testConnection.mutateAsync(integration.id);
      if (result.success) {
        toast({ title: 'Connection successful', description: result.message || 'Provider is configured correctly' });
      } else {
        toast({ title: 'Connection failed', description: result.error || 'Failed to connect to provider', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Test failed', description: error instanceof Error ? error.message : 'Failed to test connection', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#4a6480]" />
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
            <div key={provider} className="flex flex-col rounded-xl border border-[#1e2d3d] bg-[#0f1923]">
              <div className="p-5 border-b border-[#1a2332]">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-teal-400/10 p-2">
                      <Icon className="h-5 w-5 text-teal-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#c8dce8]">{name}</p>
                      {getStatusSpan(integration)}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-[#4a6480] mt-2">{description}</p>
              </div>

              <div className="p-5 flex-1">
                {integration && (
                  <div className="space-y-2">
                    {integration.config.model && (
                      <div className="flex justify-between text-xs">
                        <span className="text-[#4a6480]">Model:</span>
                        <span className="font-medium text-[#c8dce8]">{integration.config.model}</span>
                      </div>
                    )}
                    {integration.config.endpoint && (
                      <div className="flex justify-between text-xs">
                        <span className="text-[#4a6480]">Endpoint:</span>
                        <span className="font-mono text-[11px] text-[#7fa8c8]">{integration.config.endpoint}</span>
                      </div>
                    )}
                    {integration.last_test_at && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-[#4a6480]">Last tested:</span>
                        <div className="flex items-center gap-1">
                          {integration.last_test_status === 'success' ? (
                            <CheckCircle className="h-3 w-3 text-teal-400" />
                          ) : (
                            <AlertCircle className="h-3 w-3 text-red-400" />
                          )}
                          <span className="text-[11px] text-[#7fa8c8]">
                            {new Date(integration.last_test_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    )}
                    {integration.last_test_error && (
                      <div className="rounded-md bg-red-400/5 border border-red-400/20 p-2 text-xs text-red-400">
                        {integration.last_test_error}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="p-5 pt-0 flex gap-2">
                {isConfigured ? (
                  <>
                    <button
                      onClick={() => handleConfigure(provider, integration)}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-xs text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors flex-1"
                    >
                      <Settings className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleTest(integration)}
                      disabled={testConnection.isPending}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-xs text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] disabled:opacity-50 transition-colors"
                    >
                      {testConnection.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        'Test'
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(integration)}
                      className="flex items-center justify-center h-8 w-8 rounded text-[#4a6480] hover:text-red-400 hover:bg-[#1a2d3d] transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleConfigure(provider)}
                    className="flex items-center justify-center gap-2 h-8 w-full rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors"
                  >
                    Configure
                  </button>
                )}
              </div>
            </div>
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
