'use client';

import { useState } from 'react';
import { useIntegrations, useCreateIntegration, useUpdateSecrets } from '@/lib/hooks/useIntegrations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Copy, CheckCircle, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { TriggerRulesTable } from './TriggerRulesTable';

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
          config: {
            signature_header: 'X-Gitea-Signature',
            base_url: baseURL || undefined,
          },
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
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Gitea Webhook Configuration</CardTitle>
              <CardDescription>
                Set up Gitea webhooks to trigger tests automatically on push and pull request events
              </CardDescription>
            </div>
            {isConfigured && (
              <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                <CheckCircle className="h-3 w-3 mr-1" />
                Configured
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Webhook URL — always visible */}
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <div className="flex gap-2">
              <Input value={webhookUrl} readOnly className="font-mono text-sm" />
              <Button variant="outline" size="sm" onClick={() => copyToClipboard(webhookUrl, 'Webhook URL')}>
                <Copy className="h-4 w-4" />
              </Button>
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
                <p className="text-xs text-muted-foreground">
                  Required for self-hosted Gitea instances
                </p>
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                    onClick={() => setShowSecret(v => !v)}
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Button variant="outline" onClick={generateSecret}>Generate</Button>
                {webhookSecret && (
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(webhookSecret, 'Secret')}>
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
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
              <p className="text-xs text-muted-foreground">
                Required to fetch code diffs for AI-powered test adaptation (code_sync suggestions)
              </p>
            </div>

            <Button onClick={handleSave} disabled={!webhookSecret || isSaving}>
              {isSaving ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{isConfigured ? 'Updating...' : 'Enabling...'}</>
              ) : (
                isConfigured ? 'Save Changes' : 'Enable Webhook'
              )}
            </Button>
          </div>

          {isConfigured && (
            <Alert>
              <AlertDescription className="space-y-2">
                <p className="font-medium">To configure webhooks in Gitea:</p>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>Go to your repository Settings → Webhooks → Add Webhook → Gitea</li>
                  <li>Paste the Webhook URL above as the Target URL</li>
                  <li>Set Content type to <strong>application/json</strong></li>
                  <li>Enter the webhook secret you configured</li>
                  <li>Choose Trigger events: <strong>Push</strong> and <strong>Pull Request</strong></li>
                  <li>Click <strong>Add Webhook</strong></li>
                </ol>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {isConfigured && integration && (
        <Card>
          <CardHeader>
            <CardTitle>Trigger Rules</CardTitle>
            <CardDescription>
              Configure which repositories and branches trigger test executions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TriggerRulesTable integrationId={integration.id} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
