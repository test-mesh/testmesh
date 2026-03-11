'use client';

import { useState } from 'react';
import { useIntegrations, useCreateIntegration, useUpdateIntegration, useUpdateSecrets, useTestConnection, useDeleteIntegration } from '@/lib/hooks/useIntegrations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, Loader2, AlertCircle, Eye, EyeOff, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const EVENT_OPTIONS = [
  { value: 'execution_failed', label: 'Execution Failed' },
  { value: 'execution_passed', label: 'Execution Passed' },
  { value: 'schedule_triggered', label: 'Schedule Triggered' },
];

export function SlackIntegrationSection() {
  const { data, isLoading } = useIntegrations({ type: 'notification' });
  const createIntegration = useCreateIntegration();
  const updateIntegration = useUpdateIntegration();
  const updateSecrets = useUpdateSecrets();
  const testConnection = useTestConnection();
  const deleteIntegration = useDeleteIntegration();
  const { toast } = useToast();

  const [name, setName] = useState('Slack Alerts');
  const [webhookURL, setWebhookURL] = useState('');
  const [showWebhook, setShowWebhook] = useState(false);
  const [channel, setChannel] = useState('#alerts');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['execution_failed']);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const integration = data?.integrations?.find(i => i.provider === 'slack');
  const isConfigured = !!integration;

  const toggleEvent = (value: string) => {
    setSelectedEvents(prev =>
      prev.includes(value) ? prev.filter(e => e !== value) : [...prev, value]
    );
  };

  const handleSave = async () => {
    if (!webhookURL) {
      toast({ title: 'Missing webhook URL', description: 'Please enter a Slack Incoming Webhook URL', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      if (isConfigured && integration) {
        await updateIntegration.mutateAsync({
          id: integration.id,
          data: {
            name,
            config: { channel, notify_on_events: selectedEvents },
          },
        });
        if (webhookURL) {
          await updateSecrets.mutateAsync({ id: integration.id, data: { secrets: { webhook_url: webhookURL } } });
        }
      } else {
        await createIntegration.mutateAsync({
          name,
          type: 'notification',
          provider: 'slack',
          config: { channel, notify_on_events: selectedEvents },
          secrets: { webhook_url: webhookURL },
        });
      }
      toast({ title: 'Slack integration saved', description: 'Your Slack integration is configured.' });
      setWebhookURL('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save integration';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!isConfigured || !integration) return;
    setIsTesting(true);
    try {
      const result = await testConnection.mutateAsync(integration.id);
      if (result.success) {
        toast({ title: 'Test successful', description: result.message });
      } else {
        toast({ title: 'Test failed', description: result.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Test failed', description: 'Could not reach Slack', variant: 'destructive' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!integration) return;
    try {
      await deleteIntegration.mutateAsync(integration.id);
      toast({ title: 'Slack integration removed' });
    } catch {
      toast({ title: 'Error', description: 'Failed to remove integration', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Status banner */}
      {isConfigured && (
        <Alert variant={integration.status === 'active' ? 'default' : 'destructive'}>
          {integration.status === 'active' ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          <AlertDescription className="flex items-center justify-between">
            <span>
              Slack integration is <strong>{integration.status}</strong>
              {integration.last_test_at && (
                <> — last tested {new Date(integration.last_test_at).toLocaleString()}</>
              )}
            </span>
            <Badge variant={integration.status === 'active' ? 'default' : 'destructive'}>
              {integration.status}
            </Badge>
          </AlertDescription>
        </Alert>
      )}

      {integration?.last_test_error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{integration.last_test_error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 max-w-lg">
        <div className="space-y-1">
          <Label htmlFor="slack-name">Integration Name</Label>
          <Input
            id="slack-name"
            value={isConfigured ? integration.name : name}
            onChange={e => setName(e.target.value)}
            disabled={isConfigured}
            placeholder="Slack Alerts"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="slack-webhook">
            Incoming Webhook URL
            {isConfigured && <span className="ml-2 text-xs text-muted-foreground">(enter new URL to update)</span>}
          </Label>
          <div className="relative">
            <Input
              id="slack-webhook"
              type={showWebhook ? 'text' : 'password'}
              value={webhookURL}
              onChange={e => setWebhookURL(e.target.value)}
              placeholder="https://hooks.slack.com/services/…"
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => setShowWebhook(s => !s)}
            >
              {showWebhook ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Create an Incoming Webhook in your Slack app settings and paste the URL above.
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="slack-channel">Default Channel</Label>
          <Input
            id="slack-channel"
            value={isConfigured ? (integration.config.channel ?? channel) : channel}
            onChange={e => setChannel(e.target.value)}
            placeholder="#alerts"
          />
        </div>

        <div className="space-y-2">
          <Label>Notify On</Label>
          {EVENT_OPTIONS.map(opt => (
            <div key={opt.value} className="flex items-center gap-2">
              <Checkbox
                id={`event-${opt.value}`}
                checked={
                  isConfigured
                    ? (integration.config.notify_on_events ?? []).includes(opt.value)
                    : selectedEvents.includes(opt.value)
                }
                onCheckedChange={() => toggleEvent(opt.value)}
                disabled={isConfigured}
              />
              <Label htmlFor={`event-${opt.value}`} className="font-normal cursor-pointer">
                {opt.label}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isConfigured ? 'Update' : 'Enable Slack'}
        </Button>

        {isConfigured && (
          <>
            <Button variant="outline" onClick={handleTest} disabled={isTesting}>
              {isTesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test Connection
            </Button>
            <Button variant="destructive" size="icon" onClick={handleDelete} title="Remove integration">
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
