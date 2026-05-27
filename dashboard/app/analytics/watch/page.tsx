'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRunAgent } from '@/lib/hooks/useGraphAgents';
import type { AgentResult, AgentFinding } from '@/lib/api/graph-agents';
import { ArrowLeft, Eye, Loader2, AlertTriangle, TrendingDown, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-400/10 text-red-400 border-red-400/30',
  high:     'bg-orange-400/10 text-orange-400 border-orange-400/30',
  medium:   'bg-yellow-400/10 text-yellow-400 border-yellow-400/30',
  low:      'bg-teal-400/10 text-teal-400 border-teal-400/30',
};

function FindingCard({ finding }: { finding: AgentFinding }) {
  const metadataEntries = Object.entries(finding.metadata || {});
  return (
    <div className="rounded-lg border border-[#1e2d3d] bg-[#0b0f18] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold text-[#c8dce8]">{finding.title}</p>
        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded border capitalize', SEVERITY_COLORS[finding.severity] ?? 'bg-[#1a2d3d] text-[#4a6480] border-[#2a3d52]')}>
          {finding.severity}
        </span>
      </div>
      <p className="text-[11px] text-[#4a6480]">{finding.description}</p>
      {metadataEntries.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {metadataEntries.map(([key, value]) => (
            <div key={key} className="flex gap-2 text-[11px]">
              <span className="text-[#3d5670]">{key}:</span>
              <span className="font-mono text-[#7fa8c8]">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ icon, title, sub, findings }: { icon: React.ReactNode; title: string; sub: string; findings: AgentFinding[] }) {
  return (
    <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#1a2332] flex items-center gap-2">
        {icon}
        <span className="text-[11px] font-semibold text-[#c8dce8]">{title}</span>
        <span className="text-[10px] text-[#4a6480]">{sub}</span>
      </div>
      <div className="p-4 space-y-2">
        {findings.map((finding, i) => <FindingCard key={i} finding={finding} />)}
      </div>
    </div>
  );
}

export default function WatchPage() {
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runAgent = useRunAgent();

  const handleRun = async () => {
    setError(null);
    try {
      const data = await runAgent.mutateAsync({ agent: 'watch' });
      setResult(data);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to run watch analysis');
    }
  };

  const findings = result?.findings || [];
  const regressions = findings.filter((f) => f.type === 'regression');
  const performanceAlerts = findings.filter((f) => f.type === 'performance_degradation');
  const graphChanges = findings.filter((f) => f.type !== 'regression' && f.type !== 'performance_degradation');

  return (
    <div className="px-6 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/analytics" className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <Eye className="h-4 w-4 text-[#3d5670]" />
          <h1 className="text-xl font-semibold text-[#c8dce8]">Watch Agent</h1>
          <p className="text-xs text-[#3d5670] mt-0.5">Monitor regressions and performance degradation</p>
        </div>
        <button
          onClick={handleRun}
          disabled={runAgent.isPending}
          className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
        >
          {runAgent.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          Run Watch Analysis
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-400/5 border border-red-400/20 p-4">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {!result && !error && (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] flex flex-col items-center justify-center py-16 text-center">
          <Eye className="h-10 w-10 mb-3 text-[#1e2d3d]" />
          <p className="text-[13px] font-semibold text-[#c8dce8] mb-1">No analysis results yet</p>
          <p className="text-xs text-[#4a6480]">Run the watch analysis to detect regressions and performance issues</p>
        </div>
      )}

      {result && (
        <>
          <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-4">
            <p className="text-[11px] font-semibold text-[#c8dce8] mb-1">Summary</p>
            <p className="text-xs text-[#4a6480]">{result.summary}</p>
          </div>

          {regressions.length > 0 && (
            <Section
              icon={<AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
              title="Regressions"
              sub={`${regressions.length} regression${regressions.length !== 1 ? 's' : ''} detected`}
              findings={regressions}
            />
          )}
          {performanceAlerts.length > 0 && (
            <Section
              icon={<TrendingDown className="h-3.5 w-3.5 text-orange-400" />}
              title="Performance Alerts"
              sub={`${performanceAlerts.length} performance issue${performanceAlerts.length !== 1 ? 's' : ''} detected`}
              findings={performanceAlerts}
            />
          )}
          {graphChanges.length > 0 && (
            <Section
              icon={<GitBranch className="h-3.5 w-3.5 text-teal-400" />}
              title="Graph Changes"
              sub={`${graphChanges.length} change${graphChanges.length !== 1 ? 's' : ''} detected`}
              findings={graphChanges}
            />
          )}

          {regressions.length === 0 && performanceAlerts.length === 0 && graphChanges.length === 0 && (
            <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] flex flex-col items-center justify-center py-12 text-center">
              <Eye className="h-8 w-8 mb-2 text-[#1e2d3d]" />
              <p className="text-xs text-[#4a6480]">No issues found — everything looks good</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
