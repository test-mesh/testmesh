'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFlow, useUpdateFlow, useDeleteFlow } from '@/lib/hooks/useFlows';
import { useExecutions, useCreateExecution } from '@/lib/hooks/useExecutions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { FlowEditor } from '@/components/flow-editor';
import { PresenceIndicator } from '@/components/collaboration';
import {
  ArrowLeft,
  Play,
  Trash2,
  Clock,
  History,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { FlowDefinition } from '@/lib/api/types';

export default function FlowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const { data: flow, isLoading, error } = useFlow(id);
  const { data: executionsData } = useExecutions({ flow_id: id });
  const updateFlow = useUpdateFlow();
  const createExecution = useCreateExecution();
  const deleteFlow = useDeleteFlow();

  const [executionsOpen, setExecutionsOpen] = useState(false);

  const handleSave = async (yaml: string, _definition: FlowDefinition) => {
    try {
      await updateFlow.mutateAsync({ id, data: { yaml } });
    } catch (err) {
      console.error('Failed to save flow:', err);
    }
  };

  const handleRun = async (definition: FlowDefinition) => {
    try {
      const execution = await createExecution.mutateAsync({
        flow_id: id,
        environment: 'development',
      });
      router.push(`/executions/${execution.id}`);
    } catch (err) {
      console.error('Failed to run flow:', err);
    }
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this flow?')) {
      deleteFlow.mutate(id, {
        onSuccess: () => router.push('/flows'),
      });
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="w-96">
          <CardHeader>
            <CardTitle className="text-destructive">Error Loading Flow</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </p>
            <Button variant="outline" size="sm" className="mt-4" asChild>
              <Link href="/flows">Back to Flows</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const executions = executionsData?.executions || [];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-background shrink-0">
        <Button variant="ghost" size="sm" className="h-8 px-2" asChild>
          <Link href="/flows">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>

        <div className="flex-1 min-w-0">
          {isLoading ? (
            <Skeleton className="h-5 w-48" />
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-semibold truncate">{flow?.name}</span>
              {flow?.suite && <Badge variant="outline" className="text-xs shrink-0">{flow.suite}</Badge>}
              {flow?.tags?.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs shrink-0">{tag}</Badge>
              ))}
              <PresenceIndicator resourceType="flow" resourceId={id} size="sm" />
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => setExecutionsOpen(true)}
        >
          <History className="w-3.5 h-3.5" />
          Runs
          {executions.length > 0 && (
            <Badge variant="secondary" className="h-4 text-[10px] px-1">{executions.length}</Badge>
          )}
        </Button>

        <Button
          variant="destructive"
          size="sm"
          className="h-8"
          onClick={handleDelete}
          disabled={deleteFlow.isPending}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Canvas — primary view */}
      <div className="flex-1 overflow-hidden">
        {isLoading || !flow ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-sm text-muted-foreground">Loading flow...</div>
          </div>
        ) : (
          <FlowEditor
            initialDefinition={flow.definition}
            onSave={handleSave}
            onRun={handleRun}
            isSaving={updateFlow.isPending}
            isRunning={createExecution.isPending}
          />
        )}
      </div>

      {/* Executions Sheet */}
      <Sheet open={executionsOpen} onOpenChange={setExecutionsOpen}>
        <SheetContent side="right" className="w-[560px] sm:max-w-[560px] flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle>Recent Runs</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-auto">
            {executions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                <Play className="w-8 h-8 opacity-30" />
                <p className="text-sm">No executions yet</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Steps</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {executions.slice(0, 20).map((execution) => (
                    <TableRow key={execution.id}>
                      <TableCell>
                        <Badge
                          variant={
                            execution.status === 'completed'
                              ? 'default'
                              : execution.status === 'failed'
                              ? 'destructive'
                              : 'secondary'
                          }
                          className="text-xs"
                        >
                          {execution.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="text-green-600">{execution.passed_steps}</span>
                        <span className="text-muted-foreground mx-0.5">/</span>
                        <span className="text-red-600">{execution.failed_steps}</span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {execution.duration_ms ? (
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {execution.duration_ms}ms
                          </div>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {execution.started_at
                          ? formatDistanceToNow(new Date(execution.started_at), { addSuffix: true })
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                          <Link href={`/executions/${execution.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
