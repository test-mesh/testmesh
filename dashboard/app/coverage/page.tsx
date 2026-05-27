'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCoverageGaps, useGenerateFlow } from '@/lib/hooks/useCoverage';
import { getActiveWorkspaceId } from '@/lib/hooks/useWorkspaces';
import { Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CoverageGap, TraceGenerateFlowResponse } from '@/lib/api/types';

function RiskBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = score > 0.7 ? 'bg-red-500' : score > 0.3 ? 'bg-amber-500' : 'bg-teal-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-[#1a2332] rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-[#4a6480] tabular-nums">{pct}</span>
    </div>
  );
}

function GenerateFlowModal({ result, onClose, onSave }: { result: TraceGenerateFlowResponse; onClose: () => void; onSave: (yaml: string) => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a2332]">
          <div>
            <p className="text-[13px] font-semibold text-[#c8dce8]">Generated Test Flow</p>
            <p className="text-[11px] text-[#4a6480] mt-0.5">{result.intent}</p>
          </div>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-teal-400/10 text-teal-400">
            {Math.round(result.confidence * 100)}% confidence
          </span>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <pre className="text-[11px] font-mono bg-[#0b0f18] border border-[#1a2332] p-3 rounded-lg overflow-x-auto whitespace-pre-wrap text-[#7fa8c8]">
            {result.yaml}
          </pre>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#1a2332]">
          <button onClick={onClose} className="h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0b0f18] border border-[#1e2d3d] hover:border-[#2a3d52] transition-colors">
            Close
          </button>
          <button onClick={() => navigator.clipboard.writeText(result.yaml)} className="h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0b0f18] border border-[#1e2d3d] hover:border-[#2a3d52] transition-colors">
            Copy YAML
          </button>
          <button onClick={() => onSave(result.yaml)} className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors">
            <Sparkles className="w-3 h-3" />Save as flow
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CoveragePage() {
  const router = useRouter();
  const workspaceId = getActiveWorkspaceId();
  const [tab, setTab] = useState<'uncovered' | 'all'>('uncovered');
  const [generatedFlow, setGeneratedFlow] = useState<TraceGenerateFlowResponse | null>(null);
  const [generatingTraceId, setGeneratingTraceId] = useState<string | null>(null);

  const { data, isLoading } = useCoverageGaps(workspaceId, { uncovered: tab === 'uncovered', sort: 'risk_score', limit: 50 });
  const generateFlow = useGenerateFlow();

  const handleGenerate = async (gap: CoverageGap) => {
    if (!gap.sample_trace_id || !workspaceId) return;
    setGeneratingTraceId(gap.sample_trace_id);
    try {
      const result = await generateFlow.mutateAsync({ workspaceId, traceId: gap.sample_trace_id });
      setGeneratedFlow(result);
    } finally {
      setGeneratingTraceId(null);
    }
  };

  const handleSaveFlow = (yaml: string) => {
    try { localStorage.setItem('testmesh:new-flow-yaml', yaml); } catch { /* ignore */ }
    router.push('/flows/new');
    setGeneratedFlow(null);
  };

  const gaps = data?.gaps ?? [];

  return (
    <div className="px-6 py-6 space-y-5">
      {generatedFlow && (
        <GenerateFlowModal result={generatedFlow} onClose={() => setGeneratedFlow(null)} onSave={handleSaveFlow} />
      )}

      <div>
        <h1 className="text-xl font-semibold text-[#c8dce8]">Coverage Gaps</h1>
        <p className="text-xs text-[#3d5670] mt-0.5">Real-traffic endpoints that have no test flow, ranked by risk.</p>
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Untested Endpoints', value: data.uncovered_count, cls: 'text-red-400' },
            { label: 'Total Endpoints Seen', value: data.total, cls: 'text-[#c8dce8]' },
          ].map((kpi) => (
            <div key={kpi.label} className="flex flex-col gap-2 p-4 rounded-xl bg-[#0f1923] border border-[#1e2d3d]">
              <span className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{kpi.label}</span>
              <p className={cn('text-2xl font-bold leading-none tabular-nums', kpi.cls)}>{kpi.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tab row */}
      <div className="flex gap-1">
        {(['uncovered', 'all'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs transition-colors',
              tab === t
                ? 'bg-teal-400/15 text-teal-400 border border-teal-400/30'
                : 'text-[#4a6480] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] hover:text-[#7fa8c8]'
            )}
          >
            {t === 'uncovered' ? 'Uncovered' : 'All'}
            {t === 'uncovered' && data?.uncovered_count ? (
              <span className="text-[9px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none">
                {data.uncovered_count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#1a2332]">
          <span className="text-[11px] font-semibold text-[#c8dce8]">Endpoints</span>
          <span className="text-[10px] text-[#4a6480] ml-2">Sorted by risk score — higher means more traffic, errors, or latency.</span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-[#3d5670]" /></div>
        ) : gaps.length === 0 ? (
          <div className="text-center py-12 text-[11px] text-[#3d5670]">
            No endpoints seen yet — send traces to TestMesh to discover your coverage.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[1.5fr_2fr_1fr_1.5fr_1fr_auto] gap-4 px-4 py-2.5 border-b border-[#1a2332]">
              {['Service', 'Endpoint', 'Calls', 'Risk', 'Status', ''].map((h) => (
                <span key={h} className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{h}</span>
              ))}
            </div>
            <div className="divide-y divide-[#1a2332]">
              {gaps.map((gap) => (
                <div key={gap.id} className="grid grid-cols-[1.5fr_2fr_1fr_1.5fr_1fr_auto] gap-4 px-4 py-3 items-center hover:bg-[#131b26] transition-colors">
                  <span className="text-[11px] text-[#4a6480]">{gap.service}</span>
                  <span className="text-[11px] font-mono text-[#c8dce8]">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#4a7a96] mr-1.5">{gap.method}</span>
                    {gap.route}
                  </span>
                  <span className="text-[11px] text-[#7fa8c8]">{gap.occurrence_count.toLocaleString()}</span>
                  <RiskBar score={gap.risk_score} />
                  <span>
                    {gap.has_test_flow ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-teal-400/10 text-teal-400">Has test</span>
                    ) : (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-red-400/10 text-red-400">No test</span>
                    )}
                  </span>
                  <span>
                    {!gap.has_test_flow && gap.sample_trace_id && (
                      <button
                        disabled={generatingTraceId === gap.sample_trace_id}
                        onClick={() => handleGenerate(gap)}
                        className="flex items-center gap-1 h-6 px-2.5 rounded text-xs text-[#7fa8c8] bg-[#0b0f18] border border-[#1e2d3d] hover:border-[#2a3d52] disabled:opacity-50 transition-colors"
                      >
                        {generatingTraceId === gap.sample_trace_id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Sparkles className="w-3 h-3" />}
                        Generate
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
