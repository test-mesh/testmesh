'use client';

import { useState } from 'react';
import { useIntegrations, useCreateIntegration, useUpdateSecrets, useGitHubAppStatus, useGitHubInstallations, useGitHubAuthorize } from '@/lib/hooks/useIntegrations';
import { useActiveWorkspace } from '@/lib/hooks/useWorkspaces';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Copy, CheckCircle, XCircle, Loader2, AlertCircle, Plus, Eye, EyeOff } from 'lucide-react';
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
    toast({
      title: 'Copied!',
      description: `${label} copied to clipboard`,
    });
  };

  const handleEnableWebhook = async () => {
    if (!webhookSecret) {
      toast({
        title: 'Missing secret',
        description: 'Please generate or enter a webhook secret',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);

    try {
      if (isConfigured && integration) {
        // Update existing integration
        const secrets: Record<string, string> = { webhook_secret: webhookSecret };
        if (accessToken) secrets['access_token'] = accessToken;
        await updateSecrets.mutateAsync({
          id: integration.id,
          data: { secrets },
        });

        toast({
          title: 'Webhook updated',
          description: 'GitHub webhook secret has been updated',
        });
      } else {
        // Create new integration
        const secrets: Record<string, string> = { webhook_secret: webhookSecret };
        if (accessToken) secrets['access_token'] = accessToken;
        await createIntegration.mutateAsync({
          name: 'GitHub Webhooks',
          type: 'git',
          provider: 'github',
          config: { signature_header: 'X-Hub-Signature-256' },
          secrets,
        });

        toast({
          title: 'Webhook enabled',
          description: 'GitHub webhook integration has been configured',
        });
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
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isAppConfigured && (
        <Card>
          <CardHeader>
            <CardTitle>Connect with GitHub</CardTitle>
            <CardDescription>
              Authorize TestMesh to access your GitHub repositories via the GitHub App.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isConfigured && integration?.config?.github_user_login ? (
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm">
                  Connected as <strong>{integration.config.github_user_login}</strong>
                </span>
              </div>
            ) : null}
            <Button
              onClick={() => authorize.mutate()}
              disabled={authorize.isPending}
              variant={isConfigured ? 'outline' : 'default'}
            >
              {authorize.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isConfigured ? 'Reconnect with GitHub' : 'Connect with GitHub'}
            </Button>
            {installations.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">App installed on:</p>
                {installations.map(inst => (
                  <div key={inst.id} className="flex items-center gap-2 text-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={inst.avatar_url} alt={inst.login} className="h-5 w-5 rounded-full" />
                    <span>{inst.login}</span>
                    <Badge variant="secondary">{inst.type}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Webhook Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Webhook Configuration</CardTitle>
              <CardDescription>
                Set up GitHub webhooks to trigger tests automatically
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
                Generate a webhook secret to enable GitHub integration. This secret will be used
                to verify webhook signatures from GitHub.
              </AlertDescription>
            </Alert>
          )}

          {/* Secret input — always visible so user can regenerate or enter manually */}
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
            <p className="text-xs text-muted-foreground">
              Required to browse repositories when adding a repository link. Needs <code className="bg-muted px-1 rounded">repo</code> scope.
            </p>
          </div>

          <Button onClick={handleEnableWebhook} disabled={!webhookSecret || isGenerating}>
            {isGenerating ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{isConfigured ? 'Updating...' : 'Enabling...'}</>
            ) : (
              isConfigured ? 'Save New Secret' : 'Enable Webhook'
            )}
          </Button>

          {isConfigured && (
            <Alert>
              <AlertDescription className="space-y-2">
                <p className="font-medium">To configure webhooks in GitHub:</p>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>Go to your repository Settings → Webhooks → Add webhook</li>
                  <li>Paste the Webhook URL above</li>
                  <li>Select <strong>application/json</strong> as Content type</li>
                  <li>Enter the webhook secret you configured</li>
                  <li>Choose events: <strong>Pushes</strong> and <strong>Pull requests</strong></li>
                  <li>Click <strong>Add webhook</strong></li>
                </ol>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Trigger Rules */}
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

      {isConfigured && integration && (
        <WebhookDeliveryLog integrationId={integration.id} />
      )}
    </div>
  );
}
