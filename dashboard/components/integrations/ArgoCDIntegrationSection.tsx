'use client';

import { useState } from 'react';
import { useIntegrations, useCreateIntegration, useUpdateSecrets } from '@/lib/hooks/useIntegrations';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Copy, CheckCircle, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { TriggerRulesTable } from './TriggerRulesTable';

export function ArgoCDIntegrationSection() {
  const { data, isLoading } = useIntegrations({ type: 'git' });
  const createIntegration = useCreateIntegration();
  const updateSecrets = useUpdateSecrets();
  const { toast } = useToast();

  const [argoCDURL, setArgoCDURL] = useState('');
  const [appFilter, setAppFilter] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const integration = data?.integrations?.find(i => i.provider === 'argocd');
  const isConfigured = !!integration;

  const webhookUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5016'}/api/v1/webhooks/argocd`;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied!', description: `${label} copied to clipboard` });
  };

  const handleSave = async () => {
    if (!argoCDURL && !isConfigured) {
      toast({ title: 'Missing URL', description: 'Please enter your Argo CD instance URL', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      const secrets: Record<string, string> = {};
      if (apiToken) secrets['token'] = apiToken;

      if (isConfigured && integration) {
        await updateSecrets.mutateAsync({ id: integration.id, data: { secrets } });
        toast({ title: 'Argo CD integration updated', description: 'API token has been rotated' });
      } else {
        await createIntegration.mutateAsync({
          name: 'Argo CD',
          type: 'git',
          provider: 'argocd',
          config: {
            argocd_url: argoCDURL,
            argocd_app_filter: appFilter || undefined,
          },
          secrets,
        });
        toast({ title: 'Argo CD integration configured', description: 'TestMesh will receive sync events from Argo CD' });
      }

      setApiToken('');
    } catch (error) {
      toast({
        title: 'Configuration failed',
        description: error instanceof Error ? error.message : 'Failed to configure Argo CD integration',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
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
    <div className="space-y-6">
      <div className="rounded-xl border border-[#1e2d3d] bg-[#0f1923]">
        <div className="p-5 border-b border-[#1a2332]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#c8dce8]">Argo CD Configuration</p>
              <p className="text-xs text-[#4a6480] mt-0.5">
                Receive sync events from Argo CD and automatically trigger test suites after successful deployments
              </p>
            </div>
            {isConfigured && (
              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-teal-400/10 text-teal-400">
                <CheckCircle className="h-3 w-3" />Configured
              </span>
            )}
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <div className="flex gap-2">
              <Input value={webhookUrl} readOnly className="font-mono text-sm" />
              <button
                onClick={() => copyToClipboard(webhookUrl, 'Webhook URL')}
                className="flex items-center justify-center h-9 w-9 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors shrink-0"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-[#4a6480]">
              Register this URL in your <code className="px-1 py-0.5 rounded bg-[#1a2332] text-[#7fa8c8]">argocd-notifications-cm</code> ConfigMap as the TestMesh webhook endpoint
            </p>
          </div>

          {!isConfigured && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Configure your Argo CD instance URL so TestMesh can interact with it. The API token is
                stored encrypted and used to fetch application state when needed.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            {!isConfigured && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="argocd-url">Argo CD URL</Label>
                  <Input
                    id="argocd-url"
                    value={argoCDURL}
                    onChange={e => setArgoCDURL(e.target.value)}
                    placeholder="https://argocd.example.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="argocd-app-filter">Application Filter (optional)</Label>
                  <Input
                    id="argocd-app-filter"
                    value={appFilter}
                    onChange={e => setAppFilter(e.target.value)}
                    placeholder="testmesh-* (glob pattern, leave blank to match all)"
                  />
                  <p className="text-xs text-[#4a6480]">
                    Only sync events from matching Argo CD application names will be processed
                  </p>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="argocd-token">{isConfigured ? 'New API Token' : 'API Token (optional)'}</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="argocd-token"
                    type={showToken ? 'text' : 'password'}
                    value={apiToken}
                    onChange={e => setApiToken(e.target.value)}
                    placeholder={isConfigured ? 'Enter new token to rotate' : 'argocd token (for API access)'}
                    className="font-mono text-sm pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(v => !v)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {apiToken && (
                  <button
                    onClick={() => copyToClipboard(apiToken, 'Token')}
                    className="flex items-center justify-center h-9 w-9 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors shrink-0"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className="text-xs text-[#4a6480]">
                Stored encrypted. Used to fetch Argo CD application state and manage test environments.
              </p>
            </div>

            <button
              onClick={handleSave}
              disabled={isSaving || (!isConfigured && !argoCDURL)}
              className="flex items-center gap-2 h-9 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
            >
              {isSaving ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />{isConfigured ? 'Updating...' : 'Saving...'}</>
              ) : (
                isConfigured ? 'Save Changes' : 'Save Integration'
              )}
            </button>
          </div>

          {isConfigured && (
            <Alert>
              <AlertDescription className="space-y-2">
                <p className="font-medium text-sm">To configure Argo CD notifications:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs text-[#7fa8c8]">
                  <li>Edit your <code className="px-1 py-0.5 rounded bg-[#1a2332]">argocd-notifications-cm</code> ConfigMap</li>
                  <li>Add a webhook service pointing to the URL above</li>
                  <li>Add a trigger for <code className="px-1 py-0.5 rounded bg-[#1a2332]">on-sync-succeeded</code></li>
                  <li>
                    Annotate each Argo CD Application with{' '}
                    <code className="px-1 py-0.5 rounded bg-[#1a2332]">notifications.argoproj.io/subscribe.on-sync-succeeded.testmesh: &quot;&quot;</code>
                  </li>
                  <li>See the <a href="/docs/guides/gitops-integration" className="text-teal-400 hover:underline">GitOps Integration guide</a> for full YAML examples</li>
                </ol>
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>

      {isConfigured && integration && (
        <div className="rounded-xl border border-[#1e2d3d] bg-[#0f1923]">
          <div className="p-5 border-b border-[#1a2332]">
            <p className="text-sm font-semibold text-[#c8dce8]">Trigger Rules</p>
            <p className="text-xs text-[#4a6480] mt-0.5">
              Map Argo CD application names to suites — when a matching app syncs successfully, the linked suite runs automatically
            </p>
          </div>
          <div className="p-5">
            <TriggerRulesTable integrationId={integration.id} />
          </div>
        </div>
      )}
    </div>
  );
}
