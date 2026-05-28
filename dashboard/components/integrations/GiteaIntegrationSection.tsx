'use client';

import { useState } from 'react';
import { useIntegrations, useCreateIntegration, useUpdateSecrets } from '@/lib/hooks/useIntegrations';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Copy, CheckCircle, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { TriggerRulesTable } from './TriggerRulesTable';
import { WebhookDeliveryLog } from './WebhookDeliveryLog';

export function GiteaIntegrationSection() {
  const { data, isLoading } = useIntegrations({ type: 'git' });
  const createIntegration = useCreateIntegration();
  const updateSecrets = useUpdateSecrets();
  const { toast } = useToast();

  const [webhookSecret, setWebhookSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [baseURL, setBaseURL] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const integration = data?.integrations?.find(i => i.provider === 'gitea');
  const isConfigured = !!integration;

  const webhookUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5016'}/api/v1/webhooks/gitea`;

  const generateSecret = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    setWebhookSecret(Array.from(array, b => b.toString(16).padStart(2, '0')).join(''));
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied!', description: `${label} copied to clipboard` });
  };

  const handleSave = async () => {
    if (!webhookSecret) {
      toast({ title: 'Missing secret', description: 'Please generate or enter a webhook secret', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      const secrets: Record<string, string> = { webhook_secret: webhookSecret };
      if (accessToken) secrets['access_token'] = accessToken;

      if (isConfigured && integration) {
        await updateSecrets.mutateAsync({ id: integration.id, data: { secrets } });
        toast({ title: 'Gitea webhook updated', description: 'Gitea webhook configuration has been updated' });
      } else {
        await createIntegration.mutateAsync({
          name: 'Gitea Webhooks',
          type: 'git',
          provider: 'gitea',
          config: { signature_header: 'X-Gitea-Signature', base_url: baseURL || undefined },
          secrets,
        });
        toast({ title: 'Gitea webhook enabled', description: 'Gitea webhook integration has been configured' });
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
              <p className="text-sm font-semibold text-[#c8dce8]">Gitea Webhook Configuration</p>
              <p className="text-xs text-[#4a6480] mt-0.5">
                Set up Gitea webhooks to trigger tests automatically on push and pull request events
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
                Configure a webhook secret to enable Gitea integration. The secret verifies that
                webhook requests originate from your Gitea instance.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            {!isConfigured && (
              <div className="space-y-2">
                <Label htmlFor="gitea-base-url">Gitea Base URL</Label>
                <Input
                  id="gitea-base-url"
                  value={baseURL}
                  onChange={e => setBaseURL(e.target.value)}
                  placeholder="https://gitea.example.com (leave blank for gitea.com)"
                />
                <p className="text-xs text-[#4a6480]">Required for self-hosted Gitea instances</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="gitea-webhook-secret">{isConfigured ? 'New Webhook Secret' : 'Webhook Secret'}</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="gitea-webhook-secret"
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
                  ? 'Enter a new secret to rotate it, then update the value in Gitea'
                  : 'Used to verify webhook signatures via X-Gitea-Signature header'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gitea-access-token">Personal Access Token (optional)</Label>
              <Input
                id="gitea-access-token"
                type="password"
                value={accessToken}
                onChange={e => setAccessToken(e.target.value)}
                placeholder="gitea_pat_... (required for diff analysis)"
              />
              <p className="text-xs text-[#4a6480]">
                Required to fetch code diffs for AI-powered test adaptation (code_sync suggestions)
              </p>
            </div>

            <button
              onClick={handleSave}
              disabled={!webhookSecret || isSaving}
              className="flex items-center gap-2 h-9 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
            >
              {isSaving ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />{isConfigured ? 'Updating...' : 'Enabling...'}</>
              ) : (
                isConfigured ? 'Save Changes' : 'Enable Webhook'
              )}
            </button>
          </div>

          {isConfigured && (
            <Alert>
              <AlertDescription className="space-y-2">
                <p className="font-medium text-sm">To configure webhooks in Gitea:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs text-[#7fa8c8]">
                  <li>Go to your repository Settings → Webhooks → Add Webhook → Gitea</li>
                  <li>Paste the Webhook URL above as the Target URL</li>
                  <li>Set Content type to <strong className="text-[#c8dce8]">application/json</strong></li>
                  <li>Enter the webhook secret you configured</li>
                  <li>Choose Trigger events: <strong className="text-[#c8dce8]">Push</strong> and <strong className="text-[#c8dce8]">Pull Request</strong></li>
                  <li>Click <strong className="text-[#c8dce8]">Add Webhook</strong></li>
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
