'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrchestrate } from '@/lib/hooks/useGraphAgents';
import type { OrchestratorResult, AgentResult } from '@/lib/api/graph-agents';
import { ArrowLeft, Workflow, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-400/10 text-red-400 border-red-400/30',
  high:     'bg-orange-400/10 text-orange-400 border-orange-400/30',
  medium:   'bg-yellow-400/10 text-yellow-400 border-yellow-400/30',
  low:      'bg-teal-400/10 text-teal-400 border-teal-400/30',
};

function AgentResultCard({ agentName, agentResult }: { agentName: string; agentResult: AgentResult }) {
  const [expanded, setExpanded] = useState(true);
  const findings = agentResult.findings || [];
  const actions = agentResult.actions || [];

  return (
    <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2.5 flex items-center gap-2 border-b border-[#1a2332] hover:bg-[#131b26] transition-colors text-left"
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-[#4a6480]" /> : <ChevronRight className="h-3.5 w-3.5 text-[#4a6480]" />}
        <span className="text-[11px] font-semibold text-[#c8dce8] flex-1">{agentName}</span>
        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded border', agentResult.success ? 'bg-teal-400/10 text-teal-400 border-teal-400/30' : 'bg-red-400/10 text-red-400 border-red-400/30')}>
          {agentResult.success ? 'Success' : 'Failed'}
        </span>
      </button>

      {expanded && (
        <div className="p-4 space-y-4">
          {agentResult.summary && (
            <p className="text-xs text-[#4a6480]">{agentResult.summary}</p>
          )}

          {findings.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-2">Findings ({findings.length})</p>
              <div className="space-y-2">
                {findings.map((finding, i) => (
                  <div key={i} className="rounded-lg border border-[#1e2d3d] bg-[#0b0f18] p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] font-semibold text-[#c8dce8]">{finding.title}</p>
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded border capitalize', SEVERITY_COLORS[finding.severity] ?? 'bg-[#1a2d3d] text-[#4a6480] border-[#2a3d52]')}>
                        {finding.severity}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#4a6480]">{finding.description}</p>
                    {Object.keys(finding.metadata || {}).length > 0 && (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        {Object.entries(finding.metadata).map(([key, value]) => (
                          <div key={key} className="flex gap-2 text-[11px]">
                            <span className="text-[#3d5670]">{key}:</span>
                            <span className="font-mono text-[#7fa8c8]">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {actions.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-2">Actions ({actions.length})</p>
              <div className="space-y-2">
                {actions.map((action, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg border border-[#1e2d3d] bg-[#0b0f18] p-3">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#1a2d3d] text-[#4a7a96] capitalize shrink-0">{action.type}</span>
                    <p className="text-[11px] text-[#c8dce8]">{action.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {findings.length === 0 && actions.length === 0 && (
            <p className="text-xs text-[#4a6480]">No findings or actions from this agent.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function OrchestratorPage() {
  const [eventType, setEventType] = useState('');
  const [executionId, setExecutionId] = useState('');
  const [diff, setDiff] = useState('');
  const [result, setResult] = useState<OrchestratorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const orchestrate = useOrchestrate();

  const handleRun = async () => {
    if (!eventType) return;
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (eventType === 'execution.failed' && executionId) params.execution_id = executionId;
      if (eventType === 'pr.opened' && diff) params.diff = diff;
      const data = await orchestrate.mutateAsync({ event: eventType, params: Object.keys(params).length > 0 ? params : undefined });
      setResult(data);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to run orchestration');
    }
  };

  return (
    <div className="px-6 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/analytics" className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <Workflow className="h-4 w-4 text-[#3d5670]" />
          <h1 className="text-xl font-semibold text-[#c8dce8]">Orchestrator</h1>
          <p className="text-xs text-[#3d5670] mt-0.5">Coordinate multiple agents based on events</p>
        </div>
        <button
          onClick={handleRun}
          disabled={orchestrate.isPending || !eventType}
          className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
        >
          {orchestrate.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          Run Orchestration
        </button>
      </div>

      {/* Configuration */}
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-4 space-y-4">
        <div>
          <p className="text-[11px] font-semibold text-[#c8dce8] mb-0.5">Configuration</p>
          <p className="text-[11px] text-[#4a6480]">Select an event type and provide optional parameters</p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] text-[#7fa8c8]">Event Type</Label>
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger className="h-8 text-xs bg-[#0b0f18] border-[#1a2332] text-[#c8dce8]">
              <SelectValue placeholder="Select an event type..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="execution.failed">execution.failed</SelectItem>
              <SelectItem value="pr.opened">pr.opened</SelectItem>
              <SelectItem value="graph.updated">graph.updated</SelectItem>
              <SelectItem value="scheduled">scheduled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {eventType === 'execution.failed' && (
          <div className="space-y-1.5">
            <Label className="text-[11px] text-[#7fa8c8]">Execution ID</Label>
            <Input
              placeholder="Enter execution ID..."
              value={executionId}
              onChange={(e) => setExecutionId(e.target.value)}
              className="h-8 text-xs bg-[#0b0f18] border-[#1a2332] text-[#c8dce8] placeholder-[#3d5670]"
            />
          </div>
        )}

        {eventType === 'pr.opened' && (
          <div className="space-y-1.5">
            <Label className="text-[11px] text-[#7fa8c8]">Diff</Label>
            <textarea
              className="w-full min-h-[120px] px-3 py-2 rounded-lg bg-[#0b0f18] border border-[#1a2332] text-xs font-mono text-[#c8dce8] placeholder-[#3d5670] focus:outline-none focus:border-teal-400/50 resize-y transition-colors"
              placeholder="Paste the PR diff here..."
              value={diff}
              onChange={(e) => setDiff(e.target.value)}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-red-400/5 border border-red-400/20 p-4">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {!result && !error && (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] flex flex-col items-center justify-center py-16 text-center">
          <Workflow className="h-10 w-10 mb-3 text-[#1e2d3d]" />
          <p className="text-[13px] font-semibold text-[#c8dce8] mb-1">No orchestration results yet</p>
          <p className="text-xs text-[#4a6480]">Select an event type and run the orchestration</p>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-4">
            <p className="text-[11px] font-semibold text-[#c8dce8] mb-1">Summary</p>
            <p className="text-xs text-[#4a6480]">{result.summary}</p>
          </div>

          {/* Agents Invoked */}
          {(result.agents_invoked || []).length > 0 && (
            <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-4">
              <p className="text-[11px] font-semibold text-[#c8dce8] mb-2">
                Agents Invoked
                <span className="text-[10px] text-[#4a6480] font-normal ml-2">
                  {(result.agents_invoked || []).length} agent{(result.agents_invoked || []).length !== 1 ? 's' : ''} triggered
                </span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(result.agents_invoked || []).map((agent) => (
                  <span key={agent} className="text-[10px] font-medium px-2 py-0.5 rounded bg-[#1a2d3d] text-[#7fa8c8] border border-[#2a3d52]">
                    {agent}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Results by Agent */}
          {Object.keys(result.results || {}).length > 0 && (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-[#c8dce8]">Results by Agent</p>
              {Object.entries(result.results || {}).map(([agentName, agentResult]) => (
                <AgentResultCard key={agentName} agentName={agentName} agentResult={agentResult} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
