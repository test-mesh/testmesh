'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Bot, Save, Loader2, CheckCircle2, Settings } from 'lucide-react';
import { useIntegrations, useTestConnection } from '@/lib/hooks/useIntegrations';
import { apiClient } from '@/lib/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface WorkspaceAIConfig {
  workspace_id: string;
  default_provider: string;
  agent_overrides: AgentOverride[];
}

interface AgentOverride {
  agent_name: string;
  integration_id: string;
}

const AGENT_NAMES = [
  'coverage',
  'impact',
  'diagnosis',
  'repair',
  'flakiness',
  'generation',
  'watch',
  'scheduler_optimizer',
  'orchestrator',
];

export default function AIProvidersPage() {
  const { data: integrations } = useIntegrations({ type: 'ai_provider' });
  const testMutation = useTestConnection();
  const queryClient = useQueryClient();

  const aiProviders = integrations?.integrations ?? [];

  // Fetch workspace AI config
  const { data: config, isLoading } = useQuery<WorkspaceAIConfig>({
    queryKey: ['workspace-ai-config'],
    queryFn: async () => {
      const resp = await apiClient.get('/api/v1/ai-config');
      return resp.data;
    },
  });

  const [defaultProvider, setDefaultProvider] = useState('');
  const [overrides, setOverrides] = useState<AgentOverride[]>([]);

  useEffect(() => {
    if (config) {
      setDefaultProvider(config.default_provider || '');
      setOverrides(config.agent_overrides || []);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiClient.put('/api/v1/ai-config', {
        default_provider: defaultProvider,
        agent_overrides: overrides.filter(o => o.integration_id),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-ai-config'] });
    },
  });

  const setOverride = (agentName: string, integrationId: string) => {
    setOverrides(prev => {
      const filtered = prev.filter(o => o.agent_name !== agentName);
      if (integrationId) {
        return [...filtered, { agent_name: agentName, integration_id: integrationId }];
      }
      return filtered;
    });
  };

  const getOverride = (agentName: string) => {
    return overrides.find(o => o.agent_name === agentName)?.integration_id ?? '';
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Bot className="h-8 w-8" />
        <div>
          <h1 className="text-3xl font-bold">AI Provider Settings</h1>
          <p className="text-muted-foreground">
            Configure which AI provider each agent uses in this workspace
          </p>
        </div>
      </div>

      {/* Available Providers */}
      <Card>
        <CardHeader>
          <CardTitle>Available Providers</CardTitle>
          <CardDescription>AI providers configured for this workspace or globally.</CardDescription>
        </CardHeader>
        <CardContent>
          {aiProviders.length === 0 ? (
            <p className="text-muted-foreground">No AI providers configured. Add one in Workspace Integrations.</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {aiProviders.map(p => (
                <Card key={p.id} className="border">
                  <CardContent className="pt-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-sm text-muted-foreground">{p.provider} · {p.config?.model || 'default model'}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testMutation.mutate(p.id)}
                      disabled={testMutation.isPending}
                    >
                      {testMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Default Provider */}
      <Card>
        <CardHeader>
          <CardTitle>Default Provider</CardTitle>
          <CardDescription>The default AI provider used by all agents unless overridden.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm">
            <Select value={defaultProvider} onValueChange={setDefaultProvider}>
              <SelectTrigger><SelectValue placeholder="Use global default" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">Use global default</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
                <SelectItem value="local">Local LLM</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Per-Agent Overrides */}
      <Card>
        <CardHeader>
          <CardTitle>Agent Overrides</CardTitle>
          <CardDescription>Override the AI provider for specific agents.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Provider Override</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {AGENT_NAMES.map(name => (
                <TableRow key={name}>
                  <TableCell className="font-medium capitalize">{name.replace('_', ' ')}</TableCell>
                  <TableCell>
                    <Select value={getOverride(name)} onValueChange={v => setOverride(name, v)}>
                      <SelectTrigger className="w-64"><SelectValue placeholder="Use workspace default" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Use workspace default</SelectItem>
                        {aiProviders.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name} ({p.provider})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
