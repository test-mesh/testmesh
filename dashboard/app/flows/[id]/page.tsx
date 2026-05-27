'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFlow, useUpdateFlow, useDeleteFlow } from '@/lib/hooks/useFlows';
import { useExecutions, useCreateExecution } from '@/lib/hooks/useExecutions';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { FlowEditor } from '@/components/flow-editor';
import { PresenceIndicator } from '@/components/collaboration';
import { ArrowLeft, Trash2, Clock, History, Play } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { FlowDefinition } from '@/lib/api/types';

export default function FlowDetailPage({ params }: { params: Promise<{ id: string }> }) {
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

  const handleRun = async (_definition: FlowDefinition) => {
    try {
      const execution = await createExecution.mutateAsync({ flow_id: id, environment: 'development' });
      router.push(`/executions/${execution.id}`);
    } catch (err) {
      console.error('Failed to run flow:', err);
    }
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this flow?')) {
      deleteFlow.mutate(id, { onSuccess: () => router.push('/flows') });
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-6 w-96">
          <p className="text-[13px] font-semibold text-red-400 mb-2">Error Loading Flow</p>
          <p className="text-xs text-[#4a6480]">
            {error instanceof Error ? error.message : 'An unexpected error occurred'}
          </p>
          <Link
            href="/flows"
            className="inline-flex items-center gap-1.5 h-7 px-3 mt-4 rounded-lg text-xs text-[#7fa8c8] bg-[#0b0f18] border border-[#1e2d3d] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
          >
            Back to Flows
          </Link>
        </div>
      </div>
    );
  }

  const executions = executionsData?.executions || [];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1e2d3d] bg-[#0b0f18] shrink-0">
        <Link
          href="/flows"
          className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>

        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="h-4 w-48 rounded bg-[#1a2d3d] animate-pulse" />
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[#c8dce8] truncate">{flow?.name}</span>
              {flow?.suite && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#4a7a96]">{flow.suite}</span>
              )}
              {flow?.tags?.map((tag) => (
                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#4a6480]">{tag}</span>
              ))}
              <PresenceIndicator resourceType="flow" resourceId={id} size="sm" />
            </div>
          )}
        </div>

        <button
          onClick={() => setExecutionsOpen(true)}
          className="flex items-center gap-1.5 h-7 px-2.5 rounded text-[11px] text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
        >
          <History className="w-3.5 h-3.5" />
          Runs
          {executions.length > 0 && (
            <span className="text-[10px] bg-[#1a2d3d] text-[#4a6480] rounded-full px-1.5 py-0.5">{executions.length}</span>
          )}
        </button>

        <button
          onClick={handleDelete}
          disabled={deleteFlow.isPending}
          className="flex items-center justify-center h-7 w-7 rounded text-[#3d5670] hover:text-red-400 hover:bg-red-400/10 disabled:opacity-40 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden">
        {isLoading || !flow ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-[#3d5670]">Loading flow…</p>
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
        <SheetContent side="right" className="w-[520px] sm:max-w-[520px] flex flex-col p-0 bg-[#0b0f18] border-[#1e2d3d]">
          <SheetHeader className="px-5 py-4 border-b border-[#1e2d3d]">
            <SheetTitle className="text-[13px] font-semibold text-[#c8dce8]">Recent Runs</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-auto">
            {executions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-[#3d5670]">
                <Play className="w-8 h-8 opacity-30" />
                <p className="text-sm">No executions yet</p>
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-3 px-5 py-2.5 border-b border-[#1a2332]">
                  {['Status', 'Steps', 'Duration', 'Started', ''].map((h) => (
                    <span key={h} className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{h}</span>
                  ))}
                </div>
                <div className="divide-y divide-[#1a2332]">
                  {executions.slice(0, 20).map((execution) => {
                    const statusCls = execution.status === 'completed'
                      ? 'bg-teal-400/10 text-teal-400'
                      : execution.status === 'failed'
                      ? 'bg-red-400/10 text-red-400'
                      : 'bg-blue-400/10 text-blue-400';
                    return (
                      <div key={execution.id} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-3 px-5 py-3 items-center hover:bg-[#0f1923] transition-colors">
                        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded capitalize w-fit', statusCls)}>
                          {execution.status}
                        </span>
                        <span className="text-[11px]">
                          <span className="text-teal-400">{execution.passed_steps}</span>
                          <span className="text-[#3d5670]"> / </span>
                          <span className="text-red-400">{execution.failed_steps}</span>
                        </span>
                        <span className="text-[11px] text-[#4a6480]">
                          {execution.duration_ms ? (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {execution.duration_ms}ms
                            </span>
                          ) : '—'}
                        </span>
                        <span className="text-[10px] text-[#4a6480]">
                          {execution.started_at
                            ? formatDistanceToNow(new Date(execution.started_at), { addSuffix: true })
                            : '—'}
                        </span>
                        <Link
                          href={`/executions/${execution.id}`}
                          className="text-[11px] text-teal-400/70 hover:text-teal-400 transition-colors"
                        >
                          View
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
