'use client';

import { useState } from 'react';
import { useIntegrations, useCreateIntegration, useUpdateIntegration, useUpdateSecrets, useTestConnection, useDeleteIntegration } from '@/lib/hooks/useIntegrations';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
          data: { name, config: { channel, notify_on_events: selectedEvents } },
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
    return (
      <div className="flex items-center gap-2 text-[#4a6480] text-xs">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isConfigured && (
        <Alert variant={integration.status === 'active' ? 'default' : 'destructive'}>
          {integration.status === 'active' ? (
            <CheckCircle className="h-4 w-4 text-teal-400" />
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
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              integration.status === 'active'
                ? 'bg-teal-400/10 text-teal-400'
                : 'bg-red-400/10 text-red-400'
            }`}>
              {integration.status}
            </span>
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
            {isConfigured && <span className="ml-2 text-xs text-[#4a6480]">(enter new URL to update)</span>}
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
            <button
              type="button"
              onClick={() => setShowWebhook(s => !s)}
              className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
            >
              {showWebhook ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </button>
          </div>
          <p className="text-xs text-[#4a6480]">
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
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 h-9 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
        >
          {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {isConfigured ? 'Update' : 'Enable Slack'}
        </button>

        {isConfigured && (
          <>
            <button
              onClick={handleTest}
              disabled={isTesting}
              className="flex items-center gap-2 h-9 px-4 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-xs text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] disabled:opacity-50 transition-colors"
            >
              {isTesting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Test Connection
            </button>
            <button
              onClick={handleDelete}
              title="Remove integration"
              className="flex items-center justify-center h-9 w-9 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-red-400 hover:border-red-400/30 hover:bg-red-400/5 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
