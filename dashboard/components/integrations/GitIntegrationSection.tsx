'use client';

import { useState } from 'react';
import { useIntegrations, useCreateIntegration, useUpdateSecrets } from '@/lib/hooks/useIntegrations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Copy, CheckCircle, XCircle, Loader2, AlertCircle, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { TriggerRulesTable } from './TriggerRulesTable';

export function GitIntegrationSection() {
  const { data, isLoading } = useIntegrations({ type: 'git' });
  const createIntegration = useCreateIntegration();
  const updateSecrets = useUpdateSecrets();
  const { toast } = useToast();

  const [webhookSecret, setWebhookSecret] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const integration = data?.integrations?.find(i => i.provider === 'github');
  const isConfigured = !!integration;

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/v1/webhooks/github`
    : '';

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
        await updateSecrets.mutateAsync({
          id: integration.id,
          data: {
            secrets: { webhook_secret: webhookSecret },
          },
        });

        toast({
          title: 'Webhook updated',
          description: 'GitHub webhook secret has been updated',
        });
      } else {
        // Create new integration
        await createIntegration.mutateAsync({
          name: 'GitHub Webhooks',
          type: 'git',
          provider: 'github',
          config: {
            signature_header: 'X-Hub-Signature-256',
          },
          secrets: {
            webhook_secret: webhookSecret,
          },
        });

        toast({
          title: 'Webhook enabled',
          description: 'GitHub webhook integration has been configured',
        });
      }

      setWebhookSecret('');
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
          {!isConfigured ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Generate a webhook secret to enable GitHub integration. This secret will be used
                to verify webhook signatures from GitHub.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Webhook URL</Label>
                <div className="flex gap-2">
                  <Input
                    value={webhookUrl}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(webhookUrl, 'Webhook URL')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

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
            </div>
          )}

          {!isConfigured && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="webhook-secret">Webhook Secret</Label>
                <div className="flex gap-2">
                  <Input
                    id="webhook-secret"
                    type="password"
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                    placeholder="Enter or generate a secret"
                  />
                  <Button
                    variant="outline"
                    onClick={generateSecret}
                  >
                    Generate
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This secret will be used to verify webhook requests from GitHub
                </p>
              </div>

              <Button
                onClick={handleEnableWebhook}
                disabled={!webhookSecret || isGenerating}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enabling...
                  </>
                ) : (
                  'Enable Webhook'
                )}
              </Button>
            </div>
          )}

          {isConfigured && (
            <div className="pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  generateSecret();
                }}
              >
                Regenerate Secret
              </Button>
              {webhookSecret && (
                <div className="mt-4 space-y-2">
                  <Label>New Secret (update in GitHub)</Label>
                  <div className="flex gap-2">
                    <Input
                      value={webhookSecret}
                      readOnly
                      type="password"
                      className="font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(webhookSecret, 'Secret')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleEnableWebhook}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      'Save New Secret'
                    )}
                  </Button>
                </div>
              )}
            </div>
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
    </div>
  );
}
