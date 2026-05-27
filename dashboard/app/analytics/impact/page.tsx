'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRunAgent } from '@/lib/hooks/useGraphAgents';
import type { AgentResult, AgentFinding } from '@/lib/api/graph-agents';
import { ArrowLeft, GitBranch, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-400/10 text-red-400 border-red-400/30',
  high:     'bg-orange-400/10 text-orange-400 border-orange-400/30',
  medium:   'bg-yellow-400/10 text-yellow-400 border-yellow-400/30',
  low:      'bg-teal-400/10 text-teal-400 border-teal-400/30',
};

const SEVERITY_TEXT: Record<string, string> = {
  critical: 'text-red-400',
  high:     'text-orange-400',
  medium:   'text-yellow-400',
  low:      'text-teal-400',
};

export default function ImpactPage() {
  const [diff, setDiff] = useState('');
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync, isPending } = useRunAgent();

  const handleAnalyze = async () => {
    setError(null);
    if (!diff.trim()) { setError('Please paste a code diff to analyze'); return; }
    try {
      const data = await mutateAsync({ agent: 'impact', params: { diff: diff.trim() } });
      setResult(data);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to run impact analysis');
    }
  };

  return (
    <div className="px-6 py-6 space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/analytics" className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <GitBranch className="h-4 w-4 text-[#3d5670]" />
        <h1 className="text-xl font-semibold text-[#c8dce8]">Graph Impact Analysis</h1>
        <p className="text-xs text-[#3d5670] mt-0.5">Analyze how code changes impact your test flows</p>
      </div>

      {/* Diff Input */}
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-4 space-y-3">
        <div>
          <p className="text-[11px] font-semibold text-[#c8dce8] mb-0.5">Code Diff</p>
          <p className="text-[11px] text-[#4a6480]">Paste a code diff to analyze which test flows and nodes are impacted</p>
        </div>
        <textarea
          className="w-full h-44 px-3 py-2 rounded-lg bg-[#0b0f18] border border-[#1a2332] text-xs font-mono text-[#c8dce8] placeholder-[#3d5670] focus:outline-none focus:border-teal-400/50 resize-y transition-colors"
          placeholder={`Paste your diff here, e.g.:\n\n--- a/src/api/users.go\n+++ b/src/api/users.go\n@@ -10,6 +10,8 @@\n func CreateUser(...) {\n+  // validate email\n+  if !isValidEmail(email) { return err }\n   ...`}
          value={diff}
          onChange={(e) => setDiff(e.target.value)}
        />
        <div className="flex justify-end">
          <button
            onClick={handleAnalyze}
            disabled={isPending}
            className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />}
            Analyze Impact
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-400/5 border border-red-400/20 p-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-red-400">Analysis Failed</p>
            <p className="text-[11px] text-red-400/80 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {!result && !error && (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] flex flex-col items-center justify-center py-16 text-center">
          <GitBranch className="h-10 w-10 mb-3 text-[#1e2d3d]" />
          <p className="text-[13px] font-semibold text-[#c8dce8] mb-1">No Impact Analysis Run Yet</p>
          <p className="text-xs text-[#4a6480] max-w-sm">Paste a code diff above and click &quot;Analyze Impact&quot; to see which test flows and graph nodes would be affected.</p>
        </div>
      )}

      {result && (
        <>
          {/* Summary */}
          <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-4 w-4 text-teal-400" />
              <p className="text-[13px] font-semibold text-[#c8dce8]">Impact Summary</p>
            </div>
            <p className="text-xs text-[#4a6480]">{result.summary}</p>
            <div className="flex gap-4 mt-3">
              <span className="text-[11px] text-[#4a6480]">Impacted Flows: <span className="font-semibold text-[#c8dce8]">{(result.findings || []).length}</span></span>
              <span className="text-[11px] text-[#4a6480]">Actions: <span className="font-semibold text-[#c8dce8]">{(result.actions || []).length}</span></span>
            </div>
          </div>

          {/* Impacted Flows */}
          {(result.findings || []).length > 0 && (
            <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#1a2332]">
                <p className="text-[11px] font-semibold text-[#c8dce8]">Impacted Flows</p>
                <p className="text-[10px] text-[#4a6480]">Test flows and nodes affected by the code changes</p>
              </div>
              <div className="p-4 space-y-3">
                {(result.findings || []).map((finding: AgentFinding, i: number) => (
                  <div key={i} className="rounded-lg border border-[#1e2d3d] bg-[#0b0f18] p-3">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={cn('text-sm font-bold', SEVERITY_TEXT[finding.severity] ?? 'text-[#4a6480]')}>
                          {finding.severity === 'critical' ? '!!!' : finding.severity === 'high' ? '!!' : '!'}
                        </span>
                        <p className="text-[12px] font-semibold text-[#c8dce8]">{finding.title}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#1a2d3d] text-[#4a7a96] capitalize">{finding.type}</span>
                        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded border capitalize', SEVERITY_COLORS[finding.severity] ?? 'bg-[#1a2d3d] text-[#4a6480] border-[#2a3d52]')}>{finding.severity}</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-[#4a6480] mb-2">{finding.description}</p>
                    {finding.metadata && Object.keys(finding.metadata).length > 0 && (
                      <div className="bg-[#0f1923] border border-[#1a2332] rounded-lg p-3">
                        <p className="text-[10px] font-semibold text-[#3d5670] mb-1.5">Affected Flow / Node Info</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                          {Object.entries(finding.metadata).map(([key, value]) => (
                            <div key={key} className="text-[11px]">
                              <span className="text-[#3d5670]">{key}: </span>
                              <span className="font-mono text-[#7fa8c8]">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {(result.actions || []).length > 0 && (
            <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#1a2332]">
                <p className="text-[11px] font-semibold text-[#c8dce8]">Recommended Actions</p>
                <p className="text-[10px] text-[#4a6480]">Suggested steps based on impact analysis</p>
              </div>
              <div className="p-4 space-y-2">
                {(result.actions || []).map((action, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg border border-[#1e2d3d] bg-[#0b0f18] p-3">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#1a2d3d] text-[#4a7a96] capitalize shrink-0">{action.type}</span>
                    <div>
                      <p className="text-[11px] text-[#c8dce8]">{action.description}</p>
                      {action.metadata && Object.keys(action.metadata).length > 0 && (
                        <pre className="mt-2 text-[10px] font-mono text-[#4a6480] whitespace-pre-wrap">
                          {JSON.stringify(action.metadata, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
