'use client';

import { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
    <div className="px-6 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/workspaces"
          className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-[#c8dce8]">Workspace Settings</h1>
          <p className="text-xs text-[#3d5670] mt-0.5">Configure repository links and AI providers for this workspace</p>
        </div>
      </div>

      {/* Repository Links */}
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#1a2332] flex items-center gap-2">
          <GitBranch className="h-3.5 w-3.5 text-[#4a7a96]" />
          <div>
            <span className="text-[11px] font-semibold text-[#c8dce8]">Repository Links</span>
            <span className="text-[10px] text-[#4a6480] ml-2">
              Link git repositories and configure AI-powered test adaptation
            </span>
          </div>
        </div>
        <div className="p-4">
          <RepositoryLinksSection workspaceId={workspace_id} />
        </div>
      </div>

      {/* AI Provider Config */}
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#1a2332] flex items-center gap-2">
          <Bot className="h-3.5 w-3.5 text-[#4a7a96]" />
          <span className="text-[11px] font-semibold text-[#c8dce8]">AI Providers</span>
          <span className="text-[10px] text-[#4a6480]">Configure which AI provider each agent uses in this workspace</span>
        </div>
        <div className="p-4 space-y-5">
          {/* Available providers */}
          {aiProviders.length === 0 ? (
            <p className="text-xs text-[#4a6480]">No AI providers configured. Add one in Integrations.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {aiProviders.map(p => (
                <div key={p.id} className="rounded-lg bg-[#0b0f18] border border-[#1e2d3d] p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-[#c8dce8]">{p.name}</p>
                    <p className="text-[10px] text-[#4a6480]">{p.provider} · {p.config?.model || 'default model'}</p>
                  </div>
                  <button
                    onClick={() => testMutation.mutate(p.id)}
                    disabled={testMutation.isPending}
                    className="flex items-center justify-center h-7 w-7 rounded-lg bg-[#0f1923] border border-[#1e2d3d] text-[#4a6480] hover:text-teal-400 hover:border-teal-400/30 disabled:opacity-50 transition-colors"
                  >
                    {testMutation.isPending
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <CheckCircle2 className="h-3 w-3" />}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Default provider */}
          <div>
            <p className="text-xs font-medium text-[#c8dce8] mb-2">Default Provider</p>
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
            <p className="text-xs font-medium text-[#c8dce8] mb-2">Agent Overrides</p>
            <div className="rounded-lg border border-[#1e2d3d] overflow-hidden">
              <div className="grid grid-cols-2 px-4 py-2 border-b border-[#1a2332]">
                <span className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">Agent</span>
                <span className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">Provider Override</span>
              </div>
              <div className="divide-y divide-[#1a2332]">
                {AGENT_NAMES.map(name => (
                  <div key={name} className="grid grid-cols-2 px-4 py-2 items-center hover:bg-[#131b26] transition-colors">
                    <span className="text-xs font-medium text-[#c8dce8] capitalize">{name.replace('_', ' ')}</span>
                    <Select value={getOverride(name) || '__default__'} onValueChange={v => setOverride(name, v === '__default__' ? '' : v)}>
                      <SelectTrigger className="w-64 h-7 text-xs"><SelectValue placeholder="Use workspace default" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default__">Use workspace default</SelectItem>
                        {aiProviders.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name} ({p.provider})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
            >
              {saveMutation.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Save className="h-3.5 w-3.5" />}
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
