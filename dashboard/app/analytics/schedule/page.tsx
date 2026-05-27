'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRunAgent } from '@/lib/hooks/useGraphAgents';
import type { AgentResult, AgentFinding, AgentAction } from '@/lib/api/graph-agents';
import { ArrowLeft, Calendar, Loader2, Lightbulb, ListOrdered, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-400/10 text-red-400 border-red-400/30',
  high:     'bg-orange-400/10 text-orange-400 border-orange-400/30',
  medium:   'bg-yellow-400/10 text-yellow-400 border-yellow-400/30',
  low:      'bg-teal-400/10 text-teal-400 border-teal-400/30',
};

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded border capitalize', SEVERITY_COLORS[severity] ?? 'bg-[#1a2d3d] text-[#4a6480] border-[#2a3d52]')}>
      {severity}
    </span>
  );
}

function FindingCard({ finding }: { finding: AgentFinding }) {
  const metadataEntries = Object.entries(finding.metadata || {});
  const suggestedAction = finding.metadata?.suggested_action;
  return (
    <div className="rounded-lg border border-[#1e2d3d] bg-[#0b0f18] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold text-[#c8dce8]">{finding.title}</p>
        <SeverityBadge severity={finding.severity} />
      </div>
      <p className="text-[11px] text-[#4a6480]">{finding.description}</p>
      {suggestedAction && (
        <div className="bg-[#0f1923] border border-[#1a2332] rounded p-2 text-[11px] text-[#7fa8c8]">
          <span className="font-semibold text-[#c8dce8]">Suggested action: </span>
          {String(suggestedAction)}
        </div>
      )}
      {metadataEntries.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
          {metadataEntries.filter(([key]) => key !== 'suggested_action').map(([key, value]) => (
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

function ActionCard({ action }: { action: AgentAction }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-[#1e2d3d] bg-[#0b0f18] p-3">
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#1a2d3d] text-[#4a7a96] capitalize shrink-0">{action.type}</span>
      <div>
        <p className="text-[11px] text-[#c8dce8]">{action.description}</p>
        {action.metadata && Object.keys(action.metadata).length > 0 && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
            {Object.entries(action.metadata).map(([key, value]) => (
              <div key={key} className="flex gap-2 text-[11px]">
                <span className="text-[#3d5670]">{key}:</span>
                <span className="font-mono text-[#7fa8c8]">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SchedulePage() {
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runAgent = useRunAgent();

  const handleRun = async () => {
    setError(null);
    try {
      const data = await runAgent.mutateAsync({ agent: 'scheduler_optimizer' });
      setResult(data);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to run scheduler optimization');
    }
  };

  const findings = result?.findings || [];
  const priorities = findings.filter((f) => f.type === 'priority_ranking');
  const redundancies = findings.filter((f) => f.type === 'redundancy');
  const recommendations = findings.filter((f) => f.type !== 'priority_ranking' && f.type !== 'redundancy');
  const groupedRecommendations = recommendations.reduce<Record<string, AgentFinding[]>>((acc, f) => {
    const key = f.type || 'general';
    if (!acc[key]) acc[key] = [];
    acc[key].push(f);
    return acc;
  }, {});

  return (
    <div className="px-6 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/analytics" className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <Calendar className="h-4 w-4 text-[#3d5670]" />
          <h1 className="text-xl font-semibold text-[#c8dce8]">Scheduler Optimizer</h1>
          <p className="text-xs text-[#3d5670] mt-0.5">Optimize test scheduling for efficiency and coverage</p>
        </div>
        <button
          onClick={handleRun}
          disabled={runAgent.isPending}
          className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
        >
          {runAgent.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          Optimize Schedule
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-400/5 border border-red-400/20 p-4">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {!result && !error && (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] flex flex-col items-center justify-center py-16 text-center">
          <Calendar className="h-10 w-10 mb-3 text-[#1e2d3d]" />
          <p className="text-[13px] font-semibold text-[#c8dce8] mb-1">No optimization results yet</p>
          <p className="text-xs text-[#4a6480]">Run the scheduler optimizer to get recommendations</p>
        </div>
      )}

      {result && (
        <>
          {/* Summary */}
          <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-4">
            <p className="text-[11px] font-semibold text-[#c8dce8] mb-1">Summary</p>
            <p className="text-xs text-[#4a6480]">{result.summary}</p>
          </div>

          {/* Recommendations */}
          {Object.keys(groupedRecommendations).length > 0 && (
            <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#1a2332] flex items-center gap-2">
                <Lightbulb className="h-3.5 w-3.5 text-yellow-400" />
                <span className="text-[11px] font-semibold text-[#c8dce8]">Recommendations</span>
                <span className="text-[10px] text-[#4a6480]">{recommendations.length} recommendation{recommendations.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="p-4 space-y-4">
                {Object.entries(groupedRecommendations).map(([type, recs]) => (
                  <div key={type}>
                    <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-2 capitalize">{type.replace(/_/g, ' ')}</p>
                    <div className="space-y-2">
                      {recs.map((finding, i) => <FindingCard key={i} finding={finding} />)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Flow Priorities */}
          {priorities.length > 0 && (
            <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#1a2332] flex items-center gap-2">
                <ListOrdered className="h-3.5 w-3.5 text-teal-400" />
                <span className="text-[11px] font-semibold text-[#c8dce8]">Flow Priorities</span>
                <span className="text-[10px] text-[#4a6480]">Recommended priority rankings</span>
              </div>
              <div className="divide-y divide-[#1a2332]">
                <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-4 py-2 bg-[#0b0f18]">
                  {['#', 'Finding', 'Severity', 'Details'].map((h) => (
                    <span key={h} className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{h}</span>
                  ))}
                </div>
                {priorities.map((finding, i) => (
                  <div key={i} className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-4 py-3 items-center hover:bg-[#131b26] transition-colors">
                    <span className="text-[11px] font-mono text-[#4a6480]">{i + 1}</span>
                    <div>
                      <p className="text-[12px] font-semibold text-[#c8dce8]">{finding.title}</p>
                      <p className="text-[10px] text-[#4a6480]">{finding.description}</p>
                    </div>
                    <SeverityBadge severity={finding.severity} />
                    <div className="text-[10px] text-[#4a6480]">
                      {Object.entries(finding.metadata || {}).map(([k, v]) => (
                        <div key={k}>{k}: {typeof v === 'object' ? JSON.stringify(v) : String(v)}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Redundancy Alerts */}
          {redundancies.length > 0 && (
            <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#1a2332] flex items-center gap-2">
                <Copy className="h-3.5 w-3.5 text-orange-400" />
                <span className="text-[11px] font-semibold text-[#c8dce8]">Redundancy Alerts</span>
                <span className="text-[10px] text-[#4a6480]">{redundancies.length} redundanc{redundancies.length !== 1 ? 'ies' : 'y'} detected</span>
              </div>
              <div className="p-4 space-y-2">
                {redundancies.map((finding, i) => {
                  const affectedFlows = finding.metadata?.affected_flows;
                  return (
                    <div key={i} className="rounded-lg border border-[#1e2d3d] bg-[#0b0f18] p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[12px] font-semibold text-[#c8dce8]">{finding.title}</p>
                        <SeverityBadge severity={finding.severity} />
                      </div>
                      <p className="text-[11px] text-[#4a6480]">{finding.description}</p>
                      {affectedFlows && (
                        <div className="flex flex-wrap gap-1">
                          {(Array.isArray(affectedFlows) ? affectedFlows : [affectedFlows]).map((flow: string, fi: number) => (
                            <span key={fi} className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#4a7a96]">{flow}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          {(result.actions || []).length > 0 && (
            <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#1a2332]">
                <span className="text-[11px] font-semibold text-[#c8dce8]">Suggested Actions</span>
                <span className="text-[10px] text-[#4a6480] ml-2">{(result.actions || []).length} automated action{(result.actions || []).length !== 1 ? 's' : ''} available</span>
              </div>
              <div className="p-4 space-y-2">
                {(result.actions || []).map((action, i) => <ActionCard key={i} action={action} />)}
              </div>
            </div>
          )}

          {priorities.length === 0 && redundancies.length === 0 && recommendations.length === 0 && (result.actions || []).length === 0 && (
            <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] flex flex-col items-center justify-center py-12 text-center">
              <Calendar className="h-8 w-8 mb-2 text-[#1e2d3d]" />
              <p className="text-xs text-[#4a6480]">No optimization recommendations — schedule looks good</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
