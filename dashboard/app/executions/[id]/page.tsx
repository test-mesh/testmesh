'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useExecution, useExecutionSteps } from '@/lib/hooks/useExecutions';
import { useWebSocket } from '@/lib/hooks/useWebSocket';
import { useAnalyzeFailure } from '@/lib/hooks/useAI';
import { getActiveWorkspaceId } from '@/lib/hooks/useWorkspaces';
import { ArrowLeft, Clock, CheckCircle2, XCircle, Loader2, AlertCircle, Sparkles, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { StepStatus } from '@/lib/api/types';
import { ErrorHero } from '@/components/traces/ErrorHero';
import { ValidationSummary } from '@/components/traces/ValidationSummary';
import { DriftCallout } from '@/components/traces/DriftCallout';
import { SpanWaterfall } from '@/components/traces/SpanWaterfall';
import { useTraceValidation, useSpans, useDiscoveredFlows, useRepairSuggestions } from '@/lib/hooks/useTelemetry';
import type { ValidationViolation } from '@/lib/api/types';
import { RepairSuggestionCard } from '@/components/traces/RepairSuggestionCard';

function statusColor(status: number) {
  if (status >= 200 && status < 300) return 'text-teal-400';
  if (status >= 400) return 'text-red-400';
  return 'text-yellow-400';
}

function formatBody(body: unknown): string {
  if (typeof body === 'string') {
    try { return JSON.stringify(JSON.parse(body), null, 2); } catch { return body; }
  }
  if (body !== null && body !== undefined) {
    return JSON.stringify(body, null, 2);
  }
  return '';
}

function HttpResponseOutput({ output }: { output: Record<string, unknown> }) {
  const status = output.status as number | undefined;
  const body = output.body;
  const headers = output.headers as Record<string, string[]> | undefined;
  const duration = output.duration_ms as number | undefined;

  return (
    <div className="rounded-lg border border-[#1e2d3d] overflow-hidden text-sm bg-[#0b0f18]">
      {status !== undefined && (
        <div className={`flex items-center gap-3 px-3 py-2 font-mono font-semibold border-b border-[#1e2d3d] ${statusColor(status)}`}>
          <span>{status}</span>
          {duration !== undefined && (
            <span className="text-[11px] text-[#3d5670] ml-auto">{duration}ms</span>
          )}
        </div>
      )}
      {body !== undefined && body !== null && body !== '' && (
        <div>
          <div className="px-3 py-1 text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider border-b border-[#1a2332]">Body</div>
          <pre className="p-3 text-[11px] overflow-x-auto max-h-72 text-[#c8dce8] font-mono leading-relaxed">
            {formatBody(body)}
          </pre>
        </div>
      )}
      {headers && Object.keys(headers).length > 0 && (
        <details>
          <summary className="px-3 py-1.5 text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider border-t border-[#1a2332] cursor-pointer hover:text-[#7fa8c8]">
            Headers ({Object.keys(headers).length})
          </summary>
          <div className="p-3 font-mono text-[11px] space-y-1">
            {Object.entries(headers).map(([k, v]) => (
              <div key={k}>
                <span className="text-teal-400/80">{k}</span>
                <span className="text-[#3d5670]">: </span>
                <span className="text-[#7fa8c8]">{Array.isArray(v) ? v.join(', ') : String(v)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export default function ExecutionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'results' | 'trace'>('results');

  const { data: execution, isLoading, error, refetch: refetchExecution } = useExecution(id);
  const { data: stepsData, refetch: refetchSteps } = useExecutionSteps(id);
  const analyzeFailure = useAnalyzeFailure(getActiveWorkspaceId() ?? '');

  const workspaceId = getActiveWorkspaceId();
  const { data: repairData } = useRepairSuggestions(
    execution?.status === 'failed' ? workspaceId : null,
    id,
  );
  const repairSuggestion = repairData?.suggestions?.find(s => s.status === 'pending');

  // Connect to WebSocket for real-time updates
  const { isConnected, lastMessage } = useWebSocket({
    executionId: id,
    onMessage: (event) => {
      console.log('WebSocket event:', event);

      // Refetch execution and steps on any update
      if (event.type.startsWith('execution.') || event.type.startsWith('step.')) {
        refetchExecution();
        refetchSteps();
      }
    },
  });

  const steps = stepsData?.steps || [];

  // Trace data hooks — prefer execution.trace_id (set by runner), fall back to validation record
  const { data: traceValidation } = useTraceValidation(id);
  const traceId = execution?.trace_id || traceValidation?.trace_id;
  const { data: spansData, isLoading: spansLoading } = useSpans(
    traceId ? { trace_id: traceId } : {}
  );
  const { data: driftData } = useDiscoveredFlows({ drifted: true });

  const spans = spansData?.spans ?? [];

  // Find the root error span (first error span without a parent, or first error span found)
  const errorSpan =
    spans.find((s) => s.status_code === 'error' && !s.parent_span_id) ??
    spans.find((s) => s.status_code === 'error') ??
    null;

  // Check if any drifted flow has been detected
  const hasDrift = (driftData?.flows?.length ?? 0) > 0;
  const driftDetails = hasDrift
    ? JSON.stringify(driftData?.flows?.[0]?.drift_details ?? {})
    : '';

  const getStatusIcon = (status: StepStatus) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="w-4 h-4 text-teal-400" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-400" />;
      case 'running': return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
      case 'skipped': return <AlertCircle className="w-4 h-4 text-yellow-400" />;
      default: return <div className="w-4 h-4 rounded-full bg-[#2a3d52]" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      completed: 'bg-teal-400/10 text-teal-400',
      failed: 'bg-red-400/10 text-red-400',
      running: 'bg-blue-400/10 text-blue-400',
      cancelled: 'bg-[#1a2d3d] text-[#7fa8c8]',
    };
    return (
      <span className={cn('text-[10px] font-medium px-2.5 py-1 rounded-full capitalize', map[status] ?? 'bg-[#1a2d3d] text-[#7fa8c8]')}>
        {status}
      </span>
    );
  };

  if (error) {
    return (
      <div className="px-6 py-6">
        <div className="rounded-xl bg-red-400/5 border border-red-400/20 p-6 text-red-400 text-sm">
          {error instanceof Error ? error.message : 'An error occurred'}
        </div>
      </div>
    );
  }

  if (isLoading || !execution) {
    return (
      <div className="px-6 py-6 flex items-center justify-center h-40">
        <Loader2 className="w-5 h-5 animate-spin text-[#3d5670]" />
      </div>
    );
  }

  return (
    <div className="px-6 py-6">
      {/* Back + Header */}
      <div className="mb-5">
        <Link
          href="/executions"
          className="flex items-center gap-1.5 text-[11px] text-[#4a6480] hover:text-teal-400 transition-colors mb-3 w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Executions
        </Link>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[#c8dce8]">Execution Details</h1>
            {execution.flow && (
              <p className="text-xs text-[#3d5670] mt-0.5">
                Flow:{' '}
                <Link href={`/flows/${execution.flow.id}`} className="text-[#7fa8c8] hover:text-teal-400 transition-colors">
                  {execution.flow.name}
                </Link>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isConnected && (
              <span className="flex items-center gap-1.5 text-[10px] font-medium text-teal-400">
                <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-pulse" />
                Live
              </span>
            )}
            {execution.status === 'failed' && (
              <button
                disabled={analyzeFailure.isPending}
                onClick={() => analyzeFailure.mutate(id, { onSuccess: () => router.push(`/ai/suggestions?flow_id=${execution.flow_id}`) })}
                className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0f1923] border border-[#1e2d3d] hover:border-teal-400/30 hover:text-teal-400 disabled:opacity-50 transition-colors"
              >
                {analyzeFailure.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Analyze with AI
              </button>
            )}
            {getStatusBadge(execution.status)}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('results')}
            className={cn(
              'h-7 px-3 rounded-lg text-xs transition-colors',
              activeTab === 'results'
                ? 'bg-teal-400/15 text-teal-400 border border-teal-400/30'
                : 'text-[#4a6480] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] hover:text-[#7fa8c8]'
            )}
          >
            Results
          </button>
          <button
            onClick={() => setActiveTab('trace')}
            className={cn(
              'flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs transition-colors',
              activeTab === 'trace'
                ? 'bg-teal-400/15 text-teal-400 border border-teal-400/30'
                : 'text-[#4a6480] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] hover:text-[#7fa8c8]'
            )}
          >
            Trace
            {traceValidation?.status === 'failed' && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
            )}
          </button>
        </div>

        {activeTab === 'results' && (
          <div className="grid gap-3">
            {repairSuggestion && workspaceId && (
              <RepairSuggestionCard workspaceId={workspaceId} suggestion={repairSuggestion} />
            )}

            {/* Summary */}
            <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-4">
              <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-4">Summary</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-[10px] text-[#3d5670] uppercase tracking-wider mb-1">Status</p>
                  <p className="text-sm font-semibold text-[#c8dce8] capitalize">{execution.status}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#3d5670] uppercase tracking-wider mb-1">Steps</p>
                  <div className="flex items-center gap-1 text-sm font-semibold">
                    <span className="text-teal-400">{execution.passed_steps}</span>
                    <span className="text-[#2a3d52]">/</span>
                    <span className="text-red-400">{execution.failed_steps}</span>
                    <span className="text-[#3d5670] text-xs">/ {execution.total_steps}</span>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-[#3d5670] uppercase tracking-wider mb-1">Duration</p>
                  <div className="flex items-center gap-1 text-sm font-semibold text-[#c8dce8]">
                    <Clock className="w-3.5 h-3.5 text-[#3d5670]" />
                    {execution.duration_ms || 0}ms
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-[#3d5670] uppercase tracking-wider mb-1">Started</p>
                  <p className="text-sm font-semibold text-[#c8dce8]">
                    {execution.started_at ? formatDistanceToNow(new Date(execution.started_at), { addSuffix: true }) : '—'}
                  </p>
                </div>
              </div>
              {execution.error && (
                <div className="mt-4 p-3 rounded-lg bg-red-400/5 border border-red-400/20 text-xs font-mono text-red-400">
                  {execution.error}
                </div>
              )}
            </div>

            {/* Step Timeline */}
            <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a2332]">
                <div>
                  <p className="text-[13px] font-semibold text-[#c8dce8]">Step Timeline</p>
                  <p className="text-[11px] text-[#3d5670]">{steps.length} steps</p>
                </div>
                {steps.length > 0 && (
                  <div className="flex gap-0.5 items-center">
                    {steps.map((step) => (
                      <div
                        key={step.id}
                        title={step.step_name || step.step_id}
                        className={cn(
                          'h-1.5 rounded-full',
                          steps.length <= 20 ? 'w-3' : 'w-1.5',
                          step.status === 'completed' && 'bg-teal-400',
                          step.status === 'failed' && 'bg-red-400',
                          step.status === 'running' && 'bg-blue-400 animate-pulse',
                          step.status === 'skipped' && 'bg-yellow-400',
                          !['completed', 'failed', 'running', 'skipped'].includes(step.status) && 'bg-[#2a3d52]',
                        )}
                      />
                    ))}
                  </div>
                )}
              </div>

              {steps.length === 0 ? (
                <div className="py-12 text-center text-sm text-[#3d5670]">No steps found</div>
              ) : (
                <div className="relative px-4 py-3">
                  <div className="absolute left-[30px] top-6 bottom-6 w-px bg-[#1a2332]" />
                  <div className="space-y-0">
                    {steps.map((step, index) => (
                      <div key={step.id} className="relative flex gap-3 pb-4 last:pb-0">
                        <div className="relative z-10 flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-[#131b26] border border-[#1e2d3d] mt-0.5">
                          {getStatusIcon(step.status)}
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5 pb-4 last:pb-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-medium text-[#c8dce8]">
                              {step.step_name || step.step_id}
                            </span>
                            <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#4a7a96]">
                              {step.action}
                            </span>
                            {step.attempt > 1 && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-400/10 text-yellow-400">
                                Retry {step.attempt}
                              </span>
                            )}
                            {step.duration_ms ? (
                              <span className="text-[11px] text-[#3d5670] flex items-center gap-0.5 ml-auto">
                                <Clock className="w-2.5 h-2.5" />{step.duration_ms}ms
                              </span>
                            ) : null}
                          </div>
                          {step.error_message && (
                            <div className="mt-2 p-2.5 rounded-lg bg-red-400/5 border border-red-400/20 text-[11px] font-mono text-red-400">
                              {step.error_message}
                            </div>
                          )}
                          {step.output && Object.keys(step.output).length > 0 && (
                            <details className="mt-2" open={step.status === 'failed'}>
                              <summary className="cursor-pointer text-[11px] font-medium text-[#4a6480] hover:text-teal-400 transition-colors">
                                ▸ View Response
                              </summary>
                              <div className="mt-2">
                                {step.action === 'http_request' ? (
                                  <HttpResponseOutput output={step.output} />
                                ) : (
                                  <pre className="p-3 bg-[#0b0f18] border border-[#1a2332] rounded-lg text-[11px] text-[#c8dce8] overflow-x-auto font-mono">
                                    {JSON.stringify(step.output, null, 2)}
                                  </pre>
                                )}
                              </div>
                            </details>
                          )}
                        </div>
                        <div className="flex-shrink-0 text-[10px] text-[#2a3d52] pt-1.5">#{index + 1}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'trace' && (
          <div className="space-y-3">
            {spansLoading && (
              <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] py-10 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-[#3d5670]" />
              </div>
            )}
            {!spansLoading && !traceId && (
              <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] py-10 text-center text-sm text-[#3d5670]">
                No trace data for this execution. Ensure tracing is enabled in workspace settings.
              </div>
            )}
            {!spansLoading && traceId && (
              <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-4">
                {errorSpan && <ErrorHero span={errorSpan} />}
                {traceValidation && <ValidationSummary validation={traceValidation} />}
                {hasDrift && <DriftCallout driftDetails={driftDetails} />}
                {spans.length > 0 ? (
                  <SpanWaterfall
                    spans={spans}
                    violations={(traceValidation?.failed_assertions ?? []) as ValidationViolation[]}
                    missingNodes={traceValidation?.missing_nodes}
                    slowSpanIds={traceValidation?.slow_spans}
                    errorSpanIds={traceValidation?.error_spans}
                    highlightSpanId={errorSpan?.span_id}
                  />
                ) : (
                  <div className="py-8 text-center text-sm text-[#3d5670]">Trace found but no spans loaded yet.</div>
                )}
                <div className="mt-4 text-right">
                  <Link
                    href={`/traces?trace_id=${traceId}`}
                    className="text-[11px] text-[#4a6480] hover:text-teal-400 inline-flex items-center gap-1 transition-colors"
                  >
                    Open full trace explorer <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
