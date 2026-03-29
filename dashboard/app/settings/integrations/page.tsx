'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Plug, Bot, GitBranch, Bell, Plus, Trash2, CheckCircle2, XCircle, Loader2, Settings } from 'lucide-react';
import { useIntegrations, useCreateIntegration, useDeleteIntegration, useTestConnection, useUpdateSecrets } from '@/lib/hooks/useIntegrations';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CreateIntegrationRequest, IntegrationType, IntegrationProvider } from '@/lib/api/integrations';

export default function WorkspaceIntegrationsPage() {
  const [activeTab, setActiveTab] = useState('ai-providers');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newIntegration, setNewIntegration] = useState<Partial<CreateIntegrationRequest>>({});

  const { data: integrations, isLoading } = useIntegrations();
  const createMutation = useCreateIntegration();
  const deleteMutation = useDeleteIntegration();
  const testMutation = useTestConnection();

  const aiIntegrations = integrations?.integrations?.filter(i => i.type === 'ai_provider') ?? [];
  const gitIntegrations = integrations?.integrations?.filter(i => i.type === 'git') ?? [];
  const notifIntegrations = integrations?.integrations?.filter(i => i.type === 'notification') ?? [];

  const handleCreate = async () => {
    if (!newIntegration.name || !newIntegration.type || !newIntegration.provider) return;
    await createMutation.mutateAsync(newIntegration as CreateIntegrationRequest);
    setShowAddDialog(false);
    setNewIntegration({});
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <Badge variant="default" className="bg-green-600">Active</Badge>;
      case 'disabled': return <Badge variant="secondary">Disabled</Badge>;
      case 'error': return <Badge variant="destructive">Error</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const renderIntegrationCard = (integration: any) => (
    <Card key={integration.id} className="relative">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{integration.name}</CardTitle>
            {renderStatusBadge(integration.status)}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => testMutation.mutate(integration.id)}
              disabled={testMutation.isPending}
            >
              {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Test
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => deleteMutation.mutate(integration.id)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
        <CardDescription>
          Provider: {integration.provider} · Created {new Date(integration.created_at).toLocaleDateString()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground">
          {integration.last_test_status && (
            <div className="flex items-center gap-2">
              {integration.last_test_status === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
              Last tested: {integration.last_test_at ? new Date(integration.last_test_at).toLocaleString() : 'Never'}
            </div>
          )}
          {integration.config?.model && <p>Model: {integration.config.model}</p>}
          <p className="mt-1 text-xs">Secrets: configured ✓</p>
        </div>
      </CardContent>
    </Card>
  );

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="h-8 w-8" />
          <div>
            <h1 className="text-3xl font-bold">Workspace Integrations</h1>
            <p className="text-muted-foreground">
              Manage AI providers, Git integrations, and notifications for this workspace
            </p>
          </div>
        </div>

        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Add Integration</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Integration</DialogTitle>
              <DialogDescription>Configure a new integration for this workspace.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={newIntegration.name ?? ''}
                  onChange={e => setNewIntegration(p => ({ ...p, name: e.target.value }))}
                  placeholder="My OpenAI Integration"
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select
                  value={newIntegration.type ?? ''}
                  onValueChange={v => setNewIntegration(p => ({ ...p, type: v as IntegrationType }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ai_provider">AI Provider</SelectItem>
                    <SelectItem value="git">Git</SelectItem>
                    <SelectItem value="notification">Notification</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Provider</Label>
                <Select
                  value={newIntegration.provider ?? ''}
                  onValueChange={v => setNewIntegration(p => ({ ...p, provider: v as IntegrationProvider }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                  <SelectContent>
                    {newIntegration.type === 'ai_provider' && (
                      <>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="anthropic">Anthropic</SelectItem>
                        <SelectItem value="local">Local LLM</SelectItem>
                      </>
                    )}
                    {newIntegration.type === 'git' && (
                      <>
                        <SelectItem value="github">GitHub</SelectItem>
                        <SelectItem value="gitea">Gitea</SelectItem>
                        <SelectItem value="gitlab">GitLab</SelectItem>
                      </>
                    )}
                    {newIntegration.type === 'notification' && (
                      <SelectItem value="slack">Slack</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>API Key / Token</Label>
                <Input
                  type="password"
                  value={newIntegration.secrets?.api_key ?? ''}
                  onChange={e => setNewIntegration(p => ({ ...p, secrets: { ...p.secrets, api_key: e.target.value } }))}
                  placeholder="sk-..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="ai-providers" className="flex items-center gap-2">
            <Bot className="h-4 w-4" /> AI Providers ({aiIntegrations.length})
          </TabsTrigger>
          <TabsTrigger value="git" className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" /> Git ({gitIntegrations.length})
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" /> Notifications ({notifIntegrations.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai-providers" className="space-y-4 mt-4">
          {aiIntegrations.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No AI providers configured for this workspace. Add one to enable AI features.</CardContent></Card>
          ) : (
            aiIntegrations.map(renderIntegrationCard)
          )}
        </TabsContent>

        <TabsContent value="git" className="space-y-4 mt-4">
          {gitIntegrations.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No Git integrations configured.</CardContent></Card>
          ) : (
            gitIntegrations.map(renderIntegrationCard)
          )}
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4 mt-4">
          {notifIntegrations.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No notification integrations configured.</CardContent></Card>
          ) : (
            notifIntegrations.map(renderIntegrationCard)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
