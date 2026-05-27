'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSuite, useSuiteRuns, useDeleteSuite, useRunSuite } from '@/lib/hooks/useSuites';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Play,
  RefreshCw,
  Layers,
  CheckCircle2,
  XCircle,
  Clock,
  GitBranch,
  Webhook,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { SuiteRunStatus, TriggerType } from '@/lib/api/suites';

function RunStatusBadge({ status }: { status: SuiteRunStatus }) {
  const map: Record<SuiteRunStatus, { cls: string; icon?: React.ReactNode; label: string }> = {
    completed: { cls: 'bg-teal-400/10 text-teal-400', icon: <CheckCircle2 className="h-3 w-3" />, label: 'Completed' },
    failed:    { cls: 'bg-red-400/10 text-red-400',   icon: <XCircle className="h-3 w-3" />,      label: 'Failed' },
    running:   { cls: 'bg-blue-400/10 text-blue-400', icon: <RefreshCw className="h-3 w-3 animate-spin" />, label: 'Running' },
    pending:   { cls: 'bg-[#1a2d3d] text-[#4a6480]', icon: <Clock className="h-3 w-3" />,        label: 'Pending' },
    cancelled: { cls: 'bg-[#1a2d3d] text-[#4a6480]',                                              label: 'Cancelled' },
  };
  const entry = map[status] ?? { cls: 'bg-[#1a2d3d] text-[#4a6480]', label: status };
  return (
    <span className={cn('flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded w-fit', entry.cls)}>
      {entry.icon}{entry.label}
    </span>
  );
}

function TriggerBadge({ type }: { type: TriggerType }) {
  const icons: Partial<Record<TriggerType, React.ReactNode>> = {
    webhook: <Webhook className="h-3 w-3" />,
    argocd: <GitBranch className="h-3 w-3" />,
  };
  const labels: Record<TriggerType, string> = {
    manual: 'Manual', schedule: 'Schedule', webhook: 'Webhook', argocd: 'Argo CD', api: 'API',
  };
  return (
    <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded w-fit bg-[#1a2d3d] text-[#4a7a96]">
      {icons[type]}{labels[type] ?? type}
    </span>
  );
}

export default function SuiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: suite, isLoading, error } = useSuite(id);
  const { data: runsData } = useSuiteRuns(id, 10);
  const deleteMutation = useDeleteSuite();
  const runMutation = useRunSuite();

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(id);
    router.push('/suites');
  };

  const handleRun = () => {
    runMutation.mutate(id, {
      onSuccess: () => toast.success(`Suite "${suite?.name}" started`),
      onError: () => toast.error('Failed to run suite'),
    });
  };

  if (error) {
    return (
      <div className="px-6 py-6">
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-6">
          <p className="text-[13px] font-semibold text-red-400 mb-2">Error Loading Suite</p>
          <p className="text-xs text-[#4a6480] mb-4">Failed to load suite. It may have been deleted.</p>
          <Link
            href="/suites"
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0b0f18] border border-[#1e2d3d] hover:border-[#2a3d52] transition-colors"
          >
            Back to Suites
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading || !suite) {
    return (
      <div className="px-6 py-6 flex items-center justify-center h-48">
        <RefreshCw className="h-5 w-5 animate-spin text-[#3d5670]" />
      </div>
    );
  }

  const flowsByOrder = [...(suite.flows ?? [])].sort((a, b) => a.order - b.order);

  return (
    <div className="px-6 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link
            href="/suites"
            className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors mt-0.5"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-[#c8dce8]">{suite.name}</h1>
            {suite.description && (
              <p className="text-xs text-[#4a6480] mt-0.5">{suite.description}</p>
            )}
            {suite.tags && suite.tags.length > 0 && (
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {suite.tags.map((tag) => (
                  <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#4a6480]">{tag}</span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleRun}
            disabled={runMutation.isPending}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
          >
            <Play className="h-3 w-3" />Run Now
          </button>
          <Link
            href={`/suites/${id}/edit`}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] transition-colors"
          >
            <Edit className="h-3 w-3" />Edit
          </Link>
          <button
            onClick={() => setDeleteDialogOpen(true)}
            className="flex items-center justify-center h-7 w-7 rounded text-[#3d5670] hover:text-red-400 hover:bg-red-400/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Flows list */}
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#1a2332]">
          <Layers className="h-3.5 w-3.5 text-[#3d5670]" />
          <span className="text-[11px] font-semibold text-[#c8dce8]">Flows ({flowsByOrder.length})</span>
          <span className="text-[10px] text-[#4a6480]">ordered list</span>
        </div>
        {flowsByOrder.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Layers className="h-8 w-8 mb-2 text-[#1e2d3d]" />
            <p className="text-xs text-[#3d5670]">No flows added yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#1a2332]">
            {flowsByOrder.map((sf) => (
              <div key={sf.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#131b26] transition-colors">
                <span className="text-[11px] font-mono text-[#3d5670] w-5 text-right shrink-0">{sf.order}</span>
                <div className="flex-1 min-w-0">
                  {sf.flow ? (
                    <Link href={`/flows/${sf.flow_id}`} className="text-[13px] font-medium text-[#c8dce8] hover:text-teal-400 transition-colors">
                      {sf.flow.name}
                    </Link>
                  ) : (
                    <span className="text-[13px] font-medium text-[#c8dce8]">{sf.flow_id}</span>
                  )}
                  {sf.flow?.tags && sf.flow.tags.length > 0 && (
                    <div className="flex gap-1 mt-0.5">
                      {sf.flow.tags.map((t) => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#4a6480]">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                {sf.parallel && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-400/10 text-blue-400 font-semibold">Parallel</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Runs */}
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#1a2332]">
          <span className="text-[11px] font-semibold text-[#c8dce8]">Recent Runs</span>
          <span className="text-[10px] text-[#4a6480] ml-2">last 10 executions</span>
        </div>
        {runsData?.runs && runsData.runs.length > 0 ? (
          <>
            <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-2.5 border-b border-[#1a2332]">
              {['Started', 'Status', 'Trigger', 'Flows', 'Duration'].map((h) => (
                <span key={h} className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{h}</span>
              ))}
            </div>
            <div className="divide-y divide-[#1a2332]">
              {runsData.runs.map((run) => (
                <div key={run.id} className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-3 items-center hover:bg-[#131b26] transition-colors">
                  <div>
                    <p className="text-[12px] text-[#c8dce8]">
                      {run.started_at
                        ? format(new Date(run.started_at), 'MMM d, h:mm a')
                        : format(new Date(run.created_at), 'MMM d, h:mm a')}
                    </p>
                    <p className="text-[10px] text-[#4a6480]">
                      {formatDistanceToNow(new Date(run.started_at ?? run.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <RunStatusBadge status={run.status} />
                  <TriggerBadge type={run.trigger_type} />
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <CheckCircle2 className="h-3 w-3 text-teal-400" />
                    <span className="text-teal-400">{run.passed_flows}</span>
                    {run.failed_flows > 0 && (
                      <>
                        <XCircle className="h-3 w-3 text-red-400" />
                        <span className="text-red-400">{run.failed_flows}</span>
                      </>
                    )}
                    <span className="text-[#3d5670]">/ {run.total_flows}</span>
                  </div>
                  <span className="text-[11px] text-[#4a6480]">
                    {run.duration_ms > 0 ? `${(run.duration_ms / 1000).toFixed(1)}s` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Layers className="h-8 w-8 mb-2 text-[#1e2d3d]" />
            <p className="text-xs text-[#3d5670]">No runs yet. Click "Run Now" to execute this suite.</p>
          </div>
        )}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Suite</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{suite.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
