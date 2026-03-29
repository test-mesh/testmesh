'use client';

import { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, GitBranch, Bot, Save, Loader2, CheckCircle2 } from 'lucide-react';
import { RepositoryLinksSection } from '@/components/integrations/RepositoryLinksSection';
import { useIntegrations, useTestConnection } from '@/lib/hooks/useIntegrations';
import { apiClient } from '@/lib/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface AgentOverride {
  agent_name: string;
  integration_id: string;
}

interface WorkspaceAIConfig {
  workspace_id: string;
  default_provider: string;
  agent_overrides: AgentOverride[];
}

const AGENT_NAMES = [
  'coverage', 'impact', 'diagnosis', 'repair', 'flakiness',
  'generation', 'watch', 'scheduler_optimizer', 'orchestrator',
];

interface WorkspaceSettingsPageProps {
  params: Promise<{ workspace_id: string }>;
}

export default function WorkspaceSettingsPage({ params }: WorkspaceSettingsPageProps) {
  const { workspace_id } = use(params);
  const queryClient = useQueryClient();

  // AI provider config
  const { data: integrations } = useIntegrations({ type: 'ai_provider' });
  const testMutation = useTestConnection();
  const aiProviders = integrations?.integrations ?? [];

  const { data: config } = useQuery<WorkspaceAIConfig>({
    queryKey: ['workspace-ai-config', workspace_id],
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
      queryClient.invalidateQueries({ queryKey: ['workspace-ai-config', workspace_id] });
    },
  });

  const setOverride = (agentName: string, integrationId: string) => {
    setOverrides(prev => {
      const filtered = prev.filter(o => o.agent_name !== agentName);
      if (integrationId) return [...filtered, { agent_name: agentName, integration_id: integrationId }];
      return filtered;
    });
  };

  const getOverride = (agentName: string) =>
    overrides.find(o => o.agent_name === agentName)?.integration_id ?? '';

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/workspaces">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Workspace Settings</h1>
          <p className="text-muted-foreground">Configure repository links and AI providers for this workspace</p>
        </div>
      </div>

      {/* Repository Links */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            <div>
              <CardTitle>Repository Links</CardTitle>
              <CardDescription>
                Link git repositories to this workspace and configure AI-powered test adaptation.
                When code changes, TestMesh can automatically analyze the diff and generate flow
                update suggestions.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <RepositoryLinksSection workspaceId={workspace_id} />
        </CardContent>
      </Card>

      {/* AI Provider Config */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <div>
              <CardTitle>AI Providers</CardTitle>
              <CardDescription>Configure which AI provider each agent uses in this workspace.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Available providers */}
          {aiProviders.length === 0 ? (
            <p className="text-muted-foreground text-sm">No AI providers configured. Add one in Integrations.</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {aiProviders.map(p => (
                <Card key={p.id} className="border">
                  <CardContent className="pt-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-sm text-muted-foreground">{p.provider} · {p.config?.model || 'default model'}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => testMutation.mutate(p.id)} disabled={testMutation.isPending}>
                      {testMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Default provider */}
          <div>
            <p className="text-sm font-medium mb-2">Default Provider</p>
            <div className="max-w-sm">
              <Select value={defaultProvider || '__default__'} onValueChange={(v) => setDefaultProvider(v === '__default__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Use global default" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">Use global default</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="local">Local LLM</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Per-agent overrides */}
          <div>
            <p className="text-sm font-medium mb-2">Agent Overrides</p>
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
                      <Select value={getOverride(name) || '__default__'} onValueChange={v => setOverride(name, v === '__default__' ? '' : v)}>
                        <SelectTrigger className="w-64"><SelectValue placeholder="Use workspace default" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__default__">Use workspace default</SelectItem>
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
          </div>

          <div className="flex justify-end">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
