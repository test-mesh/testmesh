'use client';

import { use, useEffect } from 'react';
import Link from 'next/link';
import { useExecution, useExecutionSteps } from '@/lib/hooks/useExecutions';
import { useWebSocket } from '@/lib/hooks/useWebSocket';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Clock, CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { StepStatus } from '@/lib/api/types';

export default function ExecutionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const { data: execution, isLoading, error, refetch: refetchExecution } = useExecution(id);
  const { data: stepsData, refetch: refetchSteps } = useExecutionSteps(id);

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

  const getStatusIcon = (status: StepStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'running':
        return <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />;
      case 'skipped':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      default:
        return <div className="w-5 h-5 rounded-full bg-gray-300" />;
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
            {getStatusBadge(execution.status)}
          </div>
        </div>
      </div>

      <div className="grid gap-6">
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
            <CardTitle>Step Execution</CardTitle>
            <CardDescription>
              {steps.length} steps executed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {steps.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No steps found
                </div>
              ) : (
                steps.map((step, index) => (
                  <div
                    key={step.id}
                    className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 pt-1">
                        {getStatusIcon(step.status)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium">
                            {step.step_name || step.step_id}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {step.action}
                          </Badge>
                          {step.attempt > 1 && (
                            <Badge variant="secondary" className="text-xs">
                              Attempt {step.attempt}
                            </Badge>
                          )}
                        </div>

                        <div className="text-sm text-muted-foreground mb-2">
                          {step.duration_ms ? (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {step.duration_ms}ms
                            </span>
                          ) : null}
                        </div>

                        {step.error_message && (
                          <div className="mt-2 p-3 bg-destructive/10 border border-destructive rounded text-sm font-mono text-destructive">
                            {step.error_message}
                          </div>
                        )}

                        {step.output && Object.keys(step.output).length > 0 && (
                          <details className="mt-3">
                            <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                              View Output
                            </summary>
                            <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-x-auto">
                              {JSON.stringify(step.output, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>

                      <div className="flex-shrink-0 text-sm text-muted-foreground">
                        Step {index + 1}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
