'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRunAgent } from '@/lib/hooks/useGraphAgents';
import type { AgentResult, AgentFinding } from '@/lib/api/graph-agents';
import { ArrowLeft, Stethoscope, Loader2, AlertCircle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
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

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#1a2d3d] text-[#4a7a96] capitalize">
      {type}
    </span>
  );
}

function MetadataSection({ metadata }: { metadata: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const keys = Object.keys(metadata);
  if (keys.length === 0) return null;
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-[11px] text-[#4a6480] hover:text-[#7fa8c8] transition-colors">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Details ({keys.length} fields)
      </button>
      {open && (
        <div className="mt-2 bg-[#0b0f18] border border-[#1a2332] rounded-lg p-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {Object.entries(metadata).map(([key, value]) => (
              <div key={key} className="text-[11px]">
                <span className="text-[#3d5670]">{key}: </span>
                <span className="font-mono text-[#7fa8c8]">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function groupByType(findings: AgentFinding[]): Record<string, AgentFinding[]> {
  const groups: Record<string, AgentFinding[]> = {};
  for (const f of findings) {
    const key = f.type || 'other';
    if (!groups[key]) groups[key] = [];
    groups[key].push(f);
  }
  return groups;
}

export default function DiagnosisPage() {
  const [executionId, setExecutionId] = useState('');
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync, isPending } = useRunAgent();

  const handleDiagnose = async () => {
    setError(null);
    try {
      const params: Record<string, unknown> = {};
      if (executionId.trim()) params.execution_id = executionId.trim();
      const data = await mutateAsync({ agent: 'diagnosis', ...(Object.keys(params).length > 0 ? { params } : {}) });
      setResult(data);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to run diagnosis');
    }
  };

  const grouped = result ? groupByType(result.findings || []) : {};
  const sortedTypes = Object.keys(grouped).sort();

  return (
    <div className="px-6 py-6 space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/analytics" className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <Stethoscope className="h-4 w-4 text-[#3d5670]" />
        <h1 className="text-xl font-semibold text-[#c8dce8]">Graph Diagnosis</h1>
        <p className="text-xs text-[#3d5670] mt-0.5">Diagnose test failures and identify root causes</p>
      </div>

      {/* Input */}
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-4">
        <p className="text-[11px] font-semibold text-[#c8dce8] mb-0.5">Diagnosis Parameters</p>
        <p className="text-[11px] text-[#4a6480] mb-4">Optionally provide an execution ID to diagnose a specific run</p>
        <div className="flex items-end gap-3">
          <div className="flex-1 max-w-md space-y-1.5">
            <Label htmlFor="execution-id">Execution ID (optional)</Label>
            <Input id="execution-id" placeholder="e.g. exec_abc123..." value={executionId} onChange={(e) => setExecutionId(e.target.value)} />
          </div>
          <button
            onClick={handleDiagnose}
            disabled={isPending}
            className="flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Stethoscope className="h-3.5 w-3.5" />}
            Diagnose
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-400/5 border border-red-400/20 p-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-red-400">Diagnosis Failed</p>
            <p className="text-[11px] text-red-400/80 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {!result && !error && (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] flex flex-col items-center justify-center py-16 text-center">
          <Stethoscope className="h-10 w-10 mb-3 text-[#1e2d3d]" />
          <p className="text-[13px] font-semibold text-[#c8dce8] mb-1">No Diagnosis Run Yet</p>
          <p className="text-xs text-[#4a6480] max-w-sm">Click &quot;Diagnose&quot; to analyze recent test failures and identify patterns, regressions, and root causes.</p>
        </div>
      )}

      {result && (
        <>
          {/* Summary */}
          <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-4 w-4 text-teal-400" />
              <p className="text-[13px] font-semibold text-[#c8dce8]">Diagnosis Summary</p>
            </div>
            <p className="text-xs text-[#4a6480]">{result.summary}</p>
            <div className="flex gap-4 mt-3">
              <span className="text-[11px] text-[#4a6480]">Findings: <span className="font-semibold text-[#c8dce8]">{(result.findings || []).length}</span></span>
              <span className="text-[11px] text-[#4a6480]">Actions: <span className="font-semibold text-[#c8dce8]">{(result.actions || []).length}</span></span>
            </div>
          </div>

          {/* Findings grouped by type */}
          {sortedTypes.map((type) => (
            <div key={type} className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#1a2332] flex items-center gap-2">
                <TypeBadge type={type} />
                <span className="text-[11px] text-[#4a6480]">{grouped[type].length} finding{grouped[type].length !== 1 ? 's' : ''}</span>
              </div>
              <div className="p-4 space-y-3">
                {grouped[type].map((finding, i) => (
                  <div key={i} className="rounded-lg border border-[#1e2d3d] bg-[#0b0f18] p-3">
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-[12px] font-semibold text-[#c8dce8]">{finding.title}</p>
                      <SeverityBadge severity={finding.severity} />
                    </div>
                    <p className="text-[11px] text-[#4a6480]">{finding.description}</p>
                    <MetadataSection metadata={finding.metadata || {}} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Actions */}
          {(result.actions || []).length > 0 && (
            <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#1a2332]">
                <p className="text-[11px] font-semibold text-[#c8dce8]">Recommended Actions</p>
                <p className="text-[10px] text-[#4a6480]">Suggested steps to resolve diagnosed issues</p>
              </div>
              <div className="p-4 space-y-2">
                {(result.actions || []).map((action, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg border border-[#1e2d3d] bg-[#0b0f18] p-3">
                    <TypeBadge type={action.type} />
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
