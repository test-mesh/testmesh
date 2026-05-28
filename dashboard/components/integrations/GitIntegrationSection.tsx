'use client';

import { useState } from 'react';
import { useIntegrations, useCreateIntegration, useUpdateSecrets, useGitHubAppStatus, useGitHubInstallations, useGitHubAuthorize } from '@/lib/hooks/useIntegrations';
import { useActiveWorkspace } from '@/lib/hooks/useWorkspaces';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Copy, CheckCircle, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { TriggerRulesTable } from './TriggerRulesTable';
import { WebhookDeliveryLog } from './WebhookDeliveryLog';

export function GitIntegrationSection() {
  const { activeWorkspaceId } = useActiveWorkspace();
  const workspaceId = activeWorkspaceId ?? '';

  const { data, isLoading } = useIntegrations({ type: 'git' });
  const createIntegration = useCreateIntegration();
  const updateSecrets = useUpdateSecrets();
  const { toast } = useToast();

  const [webhookSecret, setWebhookSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const integration = data?.integrations?.find(i => i.provider === 'github');
  const isConfigured = !!integration;

  const { data: appStatus } = useGitHubAppStatus();
  const isAppConfigured = appStatus?.configured ?? false;
  const { data: installationsData } = useGitHubInstallations(workspaceId, isAppConfigured);
  const authorize = useGitHubAuthorize(workspaceId);
  const installations = installationsData?.installations ?? [];

  const webhookUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5016'}/api/v1/webhooks/github`;

  const generateSecret = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const secret = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    setWebhookSecret(secret);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied!', description: `${label} copied to clipboard` });
  };

  const handleEnableWebhook = async () => {
    if (!webhookSecret) {
      toast({ title: 'Missing secret', description: 'Please generate or enter a webhook secret', variant: 'destructive' });
      return;
    }

    setIsGenerating(true);
    try {
      if (isConfigured && integration) {
        const secrets: Record<string, string> = { webhook_secret: webhookSecret };
        if (accessToken) secrets['access_token'] = accessToken;
        await updateSecrets.mutateAsync({ id: integration.id, data: { secrets } });
        toast({ title: 'Webhook updated', description: 'GitHub webhook secret has been updated' });
      } else {
        const secrets: Record<string, string> = { webhook_secret: webhookSecret };
        if (accessToken) secrets['access_token'] = accessToken;
        await createIntegration.mutateAsync({
          name: 'GitHub Webhooks',
          type: 'git',
          provider: 'github',
          config: { signature_header: 'X-Hub-Signature-256' },
          secrets,
        });
        toast({ title: 'Webhook enabled', description: 'GitHub webhook integration has been configured' });
      }

      setWebhookSecret('');
      setAccessToken('');
    } catch (error) {
      toast({
        title: 'Configuration failed',
        description: error instanceof Error ? error.message : 'Failed to configure webhook',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
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
      {isAppConfigured && (
        <div className="rounded-xl border border-[#1e2d3d] bg-[#0f1923]">
          <div className="p-5 border-b border-[#1a2332]">
            <p className="text-sm font-semibold text-[#c8dce8]">Connect with GitHub</p>
            <p className="text-xs text-[#4a6480] mt-0.5">
              Authorize TestMesh to access your GitHub repositories via the GitHub App.
            </p>
          </div>
          <div className="p-5 space-y-4">
            {isConfigured && integration?.config?.github_user_login ? (
              <div className="flex items-center gap-2 text-sm text-[#7fa8c8]">
                <CheckCircle className="h-4 w-4 text-teal-400" />
                Connected as <strong className="text-[#c8dce8]">{integration.config.github_user_login}</strong>
              </div>
            ) : null}
            <button
              onClick={() => authorize.mutate()}
              disabled={authorize.isPending}
              className={`flex items-center gap-2 h-9 px-4 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors ${
                isConfigured
                  ? 'border border-[#1e2d3d] bg-[#0f1923] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8]'
                  : 'bg-teal-400 text-[#0b0f18] hover:bg-teal-300'
              }`}
            >
              {authorize.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isConfigured ? 'Reconnect with GitHub' : 'Connect with GitHub'}
            </button>
            {installations.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-[#7fa8c8]">App installed on:</p>
                {installations.map(inst => (
                  <div key={inst.id} className="flex items-center gap-2 text-xs text-[#c8dce8]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={inst.avatar_url} alt={inst.login} className="h-5 w-5 rounded-full" />
                    <span>{inst.login}</span>
                    <span className="text-[10px] px-1 py-0.5 rounded bg-[#1a2332] text-[#4a6480]">{inst.type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-[#1e2d3d] bg-[#0f1923]">
        <div className="p-5 border-b border-[#1a2332]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#c8dce8]">Webhook Configuration</p>
              <p className="text-xs text-[#4a6480] mt-0.5">
                Set up GitHub webhooks to trigger tests automatically
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
          </div>

          {!isConfigured && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Generate a webhook secret to enable GitHub integration. This secret will be used
                to verify webhook signatures from GitHub.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="webhook-secret">{isConfigured ? 'New Webhook Secret' : 'Webhook Secret'}</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="webhook-secret"
                  type={showSecret ? 'text' : 'password'}
                  value={webhookSecret}
                  onChange={e => setWebhookSecret(e.target.value)}
                  placeholder="Enter or generate a secret"
                  className="font-mono text-sm pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(v => !v)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <button
                onClick={generateSecret}
                className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-xs text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors shrink-0"
              >
                Generate
              </button>
              {webhookSecret && (
                <button
                  onClick={() => copyToClipboard(webhookSecret, 'Secret')}
                  className="flex items-center justify-center h-9 w-9 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors shrink-0"
                >
                  <Copy className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="text-xs text-[#4a6480]">
              {isConfigured
                ? 'Enter a new secret to rotate it, then update the value in GitHub'
                : 'This secret will be used to verify webhook requests from GitHub'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="github-access-token">Personal Access Token (optional)</Label>
            <Input
              id="github-access-token"
              type="password"
              value={accessToken}
              onChange={e => setAccessToken(e.target.value)}
              placeholder="ghp_... (required to browse repositories)"
            />
            <p className="text-xs text-[#4a6480]">
              Required to browse repositories when adding a repository link. Needs <code className="px-1 py-0.5 rounded bg-[#1a2332] text-[#7fa8c8]">repo</code> scope.
            </p>
          </div>

          <button
            onClick={handleEnableWebhook}
            disabled={!webhookSecret || isGenerating}
            className="flex items-center gap-2 h-9 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
          >
            {isGenerating ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" />{isConfigured ? 'Updating...' : 'Enabling...'}</>
            ) : (
              isConfigured ? 'Save New Secret' : 'Enable Webhook'
            )}
          </button>

          {isConfigured && (
            <Alert>
              <AlertDescription className="space-y-2">
                <p className="font-medium text-sm">To configure webhooks in GitHub:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs text-[#7fa8c8]">
                  <li>Go to your repository Settings → Webhooks → Add webhook</li>
                  <li>Paste the Webhook URL above</li>
                  <li>Select <strong className="text-[#c8dce8]">application/json</strong> as Content type</li>
                  <li>Enter the webhook secret you configured</li>
                  <li>Choose events: <strong className="text-[#c8dce8]">Pushes</strong> and <strong className="text-[#c8dce8]">Pull requests</strong></li>
                  <li>Click <strong className="text-[#c8dce8]">Add webhook</strong></li>
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
              Configure which repositories and branches trigger test executions
            </p>
          </div>
          <div className="p-5">
            <TriggerRulesTable integrationId={integration.id} />
          </div>
        </div>
      )}

      {isConfigured && integration && (
        <WebhookDeliveryLog integrationId={integration.id} />
      )}
    </div>
  );
}
