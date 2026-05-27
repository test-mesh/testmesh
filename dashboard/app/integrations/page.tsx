'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plug, Bot, GitBranch, Bell, History, Workflow } from 'lucide-react';
import { AIProviderSection } from '@/components/integrations/AIProviderSection';
import { GitIntegrationSection } from '@/components/integrations/GitIntegrationSection';
import { GiteaIntegrationSection } from '@/components/integrations/GiteaIntegrationSection';
import { GitLabIntegrationSection } from '@/components/integrations/GitLabIntegrationSection';
import { SlackIntegrationSection } from '@/components/integrations/SlackIntegrationSection';
import { ArgoCDIntegrationSection } from '@/components/integrations/ArgoCDIntegrationSection';
import { CICDIntegrationSection } from '@/components/integrations/CICDIntegrationSection';
import { useAIUsage } from '@/lib/hooks/useAI';
import { cn } from '@/lib/utils';

const TABS = [
  { value: 'ai-providers',       label: 'AI Providers', icon: <Bot className="h-3 w-3" /> },
  { value: 'git-integration',    label: 'GitHub',       icon: <GitBranch className="h-3 w-3" /> },
  { value: 'gitea-integration',  label: 'Gitea',        icon: <GitBranch className="h-3 w-3" /> },
  { value: 'gitlab-integration', label: 'GitLab',       icon: <GitBranch className="h-3 w-3" /> },
  { value: 'argocd',             label: 'Argo CD',      icon: <GitBranch className="h-3 w-3" /> },
  { value: 'slack',              label: 'Slack',        icon: <Bell className="h-3 w-3" /> },
  { value: 'cicd',               label: 'CI/CD',        icon: <Workflow className="h-3 w-3" /> },
];

export default function IntegrationsPage() {
  const [activeTab, setActiveTab] = useState('ai-providers');
  const { data: usageData } = useAIUsage();

  return (
    <div className="px-6 py-6 space-y-5">
      <div className="flex items-center gap-2">
        <Plug className="h-4 w-4 text-[#3d5670]" />
        <h1 className="text-xl font-semibold text-[#c8dce8]">Integrations</h1>
        <p className="text-xs text-[#3d5670] mt-0.5">Manage AI providers, Git webhooks, and notification channels</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              'flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs transition-colors',
              activeTab === tab.value
                ? 'bg-teal-400/15 text-teal-400 border border-teal-400/30'
                : 'text-[#4a6480] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] hover:text-[#7fa8c8]'
            )}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* AI Providers */}
      {activeTab === 'ai-providers' && (
        <div className="space-y-4">
          {usageData && usageData.stats.length > 0 && (
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Total Requests', value: usageData.stats.reduce((a, s) => a + s.total_requests, 0).toLocaleString() },
                { label: 'Tokens Used', value: usageData.stats.reduce((a, s) => a + s.total_tokens, 0).toLocaleString() },
                {
                  label: 'Success Rate',
                  value: (() => {
                    const total = usageData.stats.reduce((a, s) => a + s.total_requests, 0);
                    const success = usageData.stats.reduce((a, s) => a + s.success_count, 0);
                    return total > 0 ? `${Math.round((success / total) * 100)}%` : 'N/A';
                  })(),
                },
                {
                  label: 'Avg Latency',
                  value: (() => {
                    const stats = usageData.stats.filter(s => s.avg_latency_ms > 0);
                    if (!stats.length) return 'N/A';
                    return `${(stats.reduce((a, s) => a + s.avg_latency_ms, 0) / stats.length / 1000).toFixed(1)}s`;
                  })(),
                },
              ].map((kpi) => (
                <div key={kpi.label} className="flex flex-col gap-2 p-4 rounded-xl bg-[#0f1923] border border-[#1e2d3d]">
                  <span className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{kpi.label}</span>
                  <p className="text-2xl font-bold leading-none text-[#c8dce8] tabular-nums">{kpi.value}</p>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1a2332]">
              <div>
                <span className="text-[11px] font-semibold text-[#c8dce8]">AI Providers</span>
                <span className="text-[10px] text-[#4a6480] ml-2">Configure AI providers for test generation, failure analysis, and self-healing</span>
              </div>
              <Link
                href="/ai/history"
                className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0b0f18] border border-[#1e2d3d] hover:border-[#2a3d52] transition-colors"
              >
                <History className="h-3 w-3" />View History
              </Link>
            </div>
            <div className="p-4">
              <AIProviderSection />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'git-integration' && (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2332]">
            <span className="text-[11px] font-semibold text-[#c8dce8]">GitHub Integration</span>
            <span className="text-[10px] text-[#4a6480] ml-2">Set up webhooks to automatically trigger tests on Git events</span>
          </div>
          <div className="p-4"><GitIntegrationSection /></div>
        </div>
      )}

      {activeTab === 'gitea-integration' && (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2332]">
            <span className="text-[11px] font-semibold text-[#c8dce8]">Gitea Integration</span>
            <span className="text-[10px] text-[#4a6480] ml-2">Set up webhooks for self-hosted or cloud Gitea instances</span>
          </div>
          <div className="p-4"><GiteaIntegrationSection /></div>
        </div>
      )}

      {activeTab === 'gitlab-integration' && (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2332]">
            <span className="text-[11px] font-semibold text-[#c8dce8]">GitLab Integration</span>
            <span className="text-[10px] text-[#4a6480] ml-2">Set up webhooks for GitLab.com or self-hosted GitLab instances</span>
          </div>
          <div className="p-4"><GitLabIntegrationSection /></div>
        </div>
      )}

      {activeTab === 'argocd' && (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2332]">
            <span className="text-[11px] font-semibold text-[#c8dce8]">Argo CD Integration</span>
            <span className="text-[10px] text-[#4a6480] ml-2">Receive sync events and trigger suites after successful deployments</span>
          </div>
          <div className="p-4"><ArgoCDIntegrationSection /></div>
        </div>
      )}

      {activeTab === 'slack' && (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2332]">
            <span className="text-[11px] font-semibold text-[#c8dce8]">Slack Notifications</span>
            <span className="text-[10px] text-[#4a6480] ml-2">Receive execution results and system alerts in your Slack workspace</span>
          </div>
          <div className="p-4"><SlackIntegrationSection /></div>
        </div>
      )}

      {activeTab === 'cicd' && (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2332]">
            <span className="text-[11px] font-semibold text-[#c8dce8]">CI/CD Integration</span>
          </div>
          <div className="p-4"><CICDIntegrationSection /></div>
        </div>
      )}
    </div>
  );
}
