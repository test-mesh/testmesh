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
              <CardTitle>Argo CD Configuration</CardTitle>
              <CardDescription>
                Receive sync events from Argo CD and automatically trigger test suites after successful deployments
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
            <p className="text-xs text-muted-foreground">
              Register this URL in your <code>argocd-notifications-cm</code> ConfigMap as the TestMesh webhook endpoint
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
                  <p className="text-xs text-muted-foreground">
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                    onClick={() => setShowToken(v => !v)}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {apiToken && (
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(apiToken, 'Token')}>
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Stored encrypted. Used to fetch Argo CD application state and manage test environments.
              </p>
            </div>

            <Button
              onClick={handleSave}
              disabled={isSaving || (!isConfigured && !argoCDURL)}
            >
              {isSaving ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{isConfigured ? 'Updating...' : 'Saving...'}</>
              ) : (
                isConfigured ? 'Save Changes' : 'Save Integration'
              )}
            </Button>
          </div>

          {isConfigured && (
            <Alert>
              <AlertDescription className="space-y-2">
                <p className="font-medium">To configure Argo CD notifications:</p>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>Edit your <code>argocd-notifications-cm</code> ConfigMap</li>
                  <li>Add a webhook service pointing to the URL above</li>
                  <li>Add a trigger for <code>on-sync-succeeded</code></li>
                  <li>
                    Annotate each Argo CD Application with{' '}
                    <code>notifications.argoproj.io/subscribe.on-sync-succeeded.testmesh: &quot;&quot;</code>
                  </li>
                  <li>See the <a href="/docs/guides/gitops-integration" className="underline">GitOps Integration guide</a> for full YAML examples</li>
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
              Map Argo CD application names to suites — when a matching app syncs successfully, the linked suite runs automatically
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
