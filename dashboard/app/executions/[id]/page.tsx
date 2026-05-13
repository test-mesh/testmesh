'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useExecution, useExecutionSteps } from '@/lib/hooks/useExecutions';
import { useWebSocket } from '@/lib/hooks/useWebSocket';
import { useAnalyzeFailure } from '@/lib/hooks/useAI';
import { getActiveWorkspaceId } from '@/lib/hooks/useWorkspaces';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  if (status >= 200 && status < 300) return 'text-green-600';
  if (status >= 400) return 'text-red-600';
  return 'text-yellow-600';
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
    <div className="border rounded-md overflow-hidden text-sm">
      {/* Status line */}
      {status !== undefined && (
        <div className={`flex items-center gap-3 px-3 py-2 bg-muted/50 font-mono font-medium border-b ${statusColor(status)}`}>
          <span className="text-lg">{status}</span>
          {duration !== undefined && (
            <span className="text-xs text-muted-foreground ml-auto">{duration}ms</span>
          )}
        </div>
      )}

      {/* Body */}
      {body !== undefined && body !== null && body !== '' && (
        <div>
          <div className="px-3 py-1 text-xs font-medium text-muted-foreground bg-muted/30 border-b">
            Body
          </div>
          <pre className="p-3 text-xs overflow-x-auto max-h-80 bg-background">
            {formatBody(body)}
          </pre>
        </div>
      )}

      {/* Headers */}
      {headers && Object.keys(headers).length > 0 && (
        <details>
          <summary className="px-3 py-1 text-xs font-medium text-muted-foreground bg-muted/30 border-t cursor-pointer hover:text-foreground">
            Headers ({Object.keys(headers).length})
          </summary>
          <div className="p-3 font-mono text-xs space-y-0.5 bg-background">
            {Object.entries(headers).map(([k, v]) => (
              <div key={k}>
                <span className="text-blue-600">{k}</span>
                <span className="text-muted-foreground">: </span>
                <span>{Array.isArray(v) ? v.join(', ') : String(v)}</span>
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
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'running':
        return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
      case 'skipped':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      default:
        return <div className="w-5 h-5 rounded-full bg-muted-foreground/30" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default">Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'running':
        return <Badge variant="secondary">Running</Badge>;
      case 'cancelled':
        return <Badge variant="outline">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Error Loading Execution</CardTitle>
            <CardDescription>
              {error instanceof Error ? error.message : 'An error occurred'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (isLoading || !execution) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              Loading execution...
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <Link href="/executions">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Executions
          </Button>
        </Link>

        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">Execution Details</h1>
            {execution.flow && (
              <p className="text-muted-foreground mt-2">
                Flow:{' '}
                <Link
                  href={`/flows/${execution.flow.id}`}
                  className="hover:underline"
                >
                  {execution.flow.name}
                </Link>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isConnected && (
              <Badge variant="outline" className="flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                Live
              </Badge>
            )}
            {execution.status === 'failed' && (
              <Button
                variant="outline"
                size="sm"
                disabled={analyzeFailure.isPending}
                onClick={() =>
                  analyzeFailure.mutate(id, {
                    onSuccess: () => router.push(`/ai/suggestions?flow_id=${execution.flow_id}`),
                  })
                }
              >
                {analyzeFailure.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                Analyze with AI
              </Button>
            )}
            {getStatusBadge(execution.status)}
          </div>
        </div>
      </div>

      <Tabs defaultValue="results" className="space-y-4">
        <TabsList>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="trace">
            Trace
            {traceValidation?.status === 'failed' && (
              <span className="ml-1.5 w-2 h-2 rounded-full bg-red-500 inline-block" />
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="results">
          <div className="grid gap-6">
            {repairSuggestion && workspaceId && (
              <RepairSuggestionCard workspaceId={workspaceId} suggestion={repairSuggestion} />
            )}
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Status</div>
                    <div className="text-lg font-medium capitalize">
                      {execution.status}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Steps</div>
                    <div className="text-lg font-medium">
                      <span className="text-green-600">{execution.passed_steps}</span>
                      {' / '}
                      <span className="text-red-600">{execution.failed_steps}</span>
                      {' / '}
                      <span className="text-muted-foreground">
                        {execution.total_steps}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Duration</div>
                    <div className="text-lg font-medium flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {execution.duration_ms || 0}ms
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Started</div>
                    <div className="text-lg font-medium">
                      {execution.started_at
                        ? formatDistanceToNow(new Date(execution.started_at), {
                            addSuffix: true,
                          })
                        : '-'}
                    </div>
                  </div>
                </div>

                {execution.error && (
                  <div className="mt-4 p-4 bg-destructive/10 border border-destructive rounded-lg">
                    <div className="font-medium text-destructive mb-1">Error</div>
                    <div className="text-sm font-mono text-destructive">
                      {execution.error}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Step Timeline</CardTitle>
                    <CardDescription>{steps.length} steps</CardDescription>
                  </div>
                  {/* Mini progress bar */}
                  {steps.length > 0 && (
                    <div className="flex gap-0.5 items-center">
                      {steps.map((step) => (
                        <div
                          key={step.id}
                          title={step.step_name || step.step_id}
                          className={cn(
                            'h-2 rounded-full',
                            steps.length <= 20 ? 'w-4' : 'w-2',
                            step.status === 'completed' && 'bg-green-500',
                            step.status === 'failed' && 'bg-destructive',
                            step.status === 'running' && 'bg-primary animate-pulse',
                            step.status === 'skipped' && 'bg-yellow-400',
                            !['completed', 'failed', 'running', 'skipped'].includes(step.status) && 'bg-muted-foreground/30',
                          )}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {steps.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No steps found
                  </div>
                ) : (
                  <div className="relative">
                    {/* Vertical timeline line */}
                    <div className="absolute left-[18px] top-6 bottom-6 w-px bg-border" />

                    <div className="space-y-0">
                      {steps.map((step, index) => (
                        <div key={step.id} className="relative flex gap-4 pb-4 last:pb-0">
                          {/* Step icon on timeline */}
                          <div className="relative z-10 flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-background border-2 border-border mt-0.5">
                            {getStatusIcon(step.status)}
                          </div>

                          {/* Step content */}
                          <div className="flex-1 min-w-0 pt-1 pb-4 last:pb-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">
                                {step.step_name || step.step_id}
                              </span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {step.action}
                              </Badge>
                              {step.attempt > 1 && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  Retry {step.attempt}
                                </Badge>
                              )}
                              {step.duration_ms ? (
                                <span className="text-xs text-muted-foreground flex items-center gap-0.5 ml-auto">
                                  <Clock className="w-3 h-3" />
                                  {step.duration_ms}ms
                                </span>
                              ) : null}
                            </div>

                            {step.error_message && (
                              <div className="mt-2 p-2.5 bg-destructive/10 border border-destructive/30 rounded text-xs font-mono text-destructive">
                                {step.error_message}
                              </div>
                            )}

                            {step.output && Object.keys(step.output).length > 0 && (
                              <details className="mt-2" open={step.status === 'failed'}>
                                <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                                  View Response
                                </summary>
                                <div className="mt-2">
                                  {step.action === 'http_request' ? (
                                    <HttpResponseOutput output={step.output} />
                                  ) : (
                                    <pre className="p-3 bg-muted rounded text-xs overflow-x-auto">
                                      {JSON.stringify(step.output, null, 2)}
                                    </pre>
                                  )}
                                </div>
                              </details>
                            )}
                          </div>

                          <div className="flex-shrink-0 text-xs text-muted-foreground pt-2">
                            #{index + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="trace">
          <div className="space-y-4">
            {spansLoading && (
              <Card>
                <CardContent className="py-8 flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </CardContent>
              </Card>
            )}

            {!spansLoading && !traceId && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                  No trace data for this execution. Ensure tracing is enabled in workspace settings.
                </CardContent>
              </Card>
            )}

            {!spansLoading && traceId && (
              <Card>
                <CardContent className="pt-4">
                  {errorSpan && <ErrorHero span={errorSpan} />}
                  {traceValidation && (
                    <ValidationSummary validation={traceValidation} />
                  )}
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
                    <div className="py-8 text-center text-muted-foreground text-sm">
                      Trace found but no spans loaded yet.
                    </div>
                  )}
                  <div className="mt-4 text-right">
                    <Link
                      href={`/traces?trace_id=${traceId}`}
                      className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                      Open full trace explorer
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
