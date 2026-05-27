'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useSchedule,
  useScheduleRuns,
  useScheduleStats,
  useDeleteSchedule,
  usePauseSchedule,
  useResumeSchedule,
  useTriggerSchedule,
} from '@/lib/hooks/useSchedules';
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
  Calendar,
  Clock,
  Edit,
  Trash2,
  Play,
  Pause,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  BarChart3,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { describeCron, type ScheduleStatus } from '@/lib/api/schedules';

function StatusBadge({ status }: { status: ScheduleStatus }) {
  const cls = status === 'active'
    ? 'bg-teal-400/10 text-teal-400'
    : status === 'paused'
    ? 'bg-yellow-400/10 text-yellow-400'
    : 'bg-[#1a2d3d] text-[#4a6480]';
  return (
    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded capitalize', cls)}>
      {status}
    </span>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: 'bg-teal-400/10 text-teal-400',
    failed:    'bg-red-400/10 text-red-400',
    running:   'bg-blue-400/10 text-blue-400',
    pending:   'bg-[#1a2d3d] text-[#4a6480]',
  };
  return (
    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded capitalize w-fit', map[status] ?? 'bg-[#1a2d3d] text-[#4a6480]')}>
      {status}
    </span>
  );
}

function ResultIcon({ result }: { result?: string }) {
  if (result === 'success') return <CheckCircle2 className="h-3.5 w-3.5 text-teal-400 shrink-0" />;
  if (result === 'failure') return <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />;
  if (result === 'skipped') return <AlertCircle className="h-3.5 w-3.5 text-yellow-400 shrink-0" />;
  return null;
}

export default function ScheduleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: schedule, isLoading, error } = useSchedule(id);
  const { data: runsData } = useScheduleRuns(id, 10);
  const { data: stats } = useScheduleStats(id, 30);

  const deleteMutation = useDeleteSchedule();
  const pauseMutation = usePauseSchedule();
  const resumeMutation = useResumeSchedule();
  const triggerMutation = useTriggerSchedule();

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(id);
    router.push('/schedules');
  };

  if (error) {
    return (
      <div className="px-6 py-6">
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-6">
          <p className="text-[13px] font-semibold text-red-400 mb-2">Error Loading Schedule</p>
          <p className="text-xs text-[#4a6480] mb-4">Failed to load schedule. It may have been deleted.</p>
          <Link
            href="/schedules"
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0b0f18] border border-[#1e2d3d] hover:border-[#2a3d52] transition-colors"
          >
            Back to Schedules
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading || !schedule) {
    return (
      <div className="px-6 py-6 flex items-center justify-center h-48">
        <RefreshCw className="h-5 w-5 animate-spin text-[#3d5670]" />
      </div>
    );
  }

  return (
    <div className="px-6 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link
            href="/schedules"
            className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors mt-0.5"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-[#c8dce8]">{schedule.name}</h1>
              <StatusBadge status={schedule.status} />
            </div>
            {schedule.description && (
              <p className="text-xs text-[#4a6480] mt-0.5">{schedule.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => triggerMutation.mutate(id)}
            disabled={triggerMutation.isPending}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
          >
            <Play className="h-3 w-3" />Run Now
          </button>
          {schedule.status === 'active' ? (
            <button
              onClick={() => pauseMutation.mutate(id)}
              disabled={pauseMutation.isPending}
              className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] disabled:opacity-50 transition-colors"
            >
              <Pause className="h-3 w-3" />Pause
            </button>
          ) : (
            <button
              onClick={() => resumeMutation.mutate(id)}
              disabled={resumeMutation.isPending}
              className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] disabled:opacity-50 transition-colors"
            >
              <Play className="h-3 w-3" />Resume
            </button>
          )}
          <Link
            href={`/schedules/${id}/edit`}
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

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-2 p-4 rounded-xl bg-[#0f1923] border border-[#1e2d3d]">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-[#3d5670]" />
            <span className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">Schedule</span>
          </div>
          <p className="text-[13px] font-semibold text-[#c8dce8]">{describeCron(schedule.cron_expr)}</p>
          <p className="text-[10px] font-mono text-[#4a6480]">{schedule.cron_expr}</p>
          <p className="text-[10px] text-[#4a6480]">TZ: {schedule.timezone}</p>
        </div>

        <div className="flex flex-col gap-2 p-4 rounded-xl bg-[#0f1923] border border-[#1e2d3d]">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3 w-3 text-[#3d5670]" />
            <span className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">Next Run</span>
          </div>
          {schedule.next_run_at && schedule.status === 'active' ? (
            <>
              <p className="text-[13px] font-semibold text-[#c8dce8]">
                {format(new Date(schedule.next_run_at), 'MMM d, yyyy')}
              </p>
              <p className="text-[11px] text-[#4a6480]">{format(new Date(schedule.next_run_at), 'h:mm a')}</p>
            </>
          ) : (
            <p className="text-[13px] text-[#3d5670]">Not scheduled</p>
          )}
        </div>

        <div className="flex flex-col gap-2 p-4 rounded-xl bg-[#0f1923] border border-[#1e2d3d]">
          <div className="flex items-center gap-1.5">
            <BarChart3 className="h-3 w-3 text-[#3d5670]" />
            <span className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">Last 30 Days</span>
          </div>
          {stats ? (
            <>
              <p className="text-[13px] font-semibold text-[#c8dce8]">
                {stats.successful_runs}/{stats.total_runs} successful
              </p>
              <p className="text-[11px] text-[#4a6480]">
                {stats.total_runs > 0
                  ? `${Math.round((stats.successful_runs / stats.total_runs) * 100)}% success rate`
                  : 'No runs yet'}
              </p>
            </>
          ) : (
            <p className="text-[13px] text-[#3d5670]">Loading…</p>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#1a2332]">
          <span className="text-[11px] font-semibold text-[#c8dce8]">Details</span>
        </div>
        <div className="grid grid-cols-2 gap-0 divide-y divide-[#1a2332]">
          <div className="px-4 py-3 border-r border-[#1a2332]">
            <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-1">Flow</p>
            {schedule.flow ? (
              <Link href={`/flows/${schedule.flow.id}`} className="text-[12px] text-teal-400 hover:text-teal-300 transition-colors">
                {schedule.flow.name}
              </Link>
            ) : (
              <span className="text-[12px] text-[#4a6480]">Unknown</span>
            )}
          </div>
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-1">Max Retries</p>
            <p className="text-[12px] text-[#c8dce8]">{schedule.max_retries > 0 ? `${schedule.max_retries} retries` : 'No retries'}</p>
          </div>
          <div className="px-4 py-3 border-r border-[#1a2332]">
            <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-1">Allow Overlap</p>
            <p className="text-[12px] text-[#c8dce8]">{schedule.allow_overlap ? 'Yes' : 'No'}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-1">Notifications</p>
            <p className="text-[12px] text-[#c8dce8]">
              {schedule.notify_on_failure || schedule.notify_on_success ? (
                [schedule.notify_on_failure && 'On failure', schedule.notify_on_success && 'On success'].filter(Boolean).join(', ')
              ) : (
                <span className="text-[#4a6480]">Disabled</span>
              )}
            </p>
          </div>
          {schedule.tags && schedule.tags.length > 0 && (
            <div className="col-span-2 px-4 py-3">
              <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-2">Tags</p>
              <div className="flex gap-1 flex-wrap">
                {schedule.tags.map((tag) => (
                  <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#4a6480]">{tag}</span>
                ))}
              </div>
            </div>
          )}
        </div>
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
              {['Scheduled', 'Status', 'Result', 'Duration', 'Retries'].map((h) => (
                <span key={h} className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{h}</span>
              ))}
            </div>
            <div className="divide-y divide-[#1a2332]">
              {runsData.runs.map((run) => (
                <div key={run.id} className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-3 items-center hover:bg-[#131b26] transition-colors">
                  <div>
                    <p className="text-[12px] text-[#c8dce8]">{format(new Date(run.scheduled_at), 'MMM d, h:mm a')}</p>
                    <p className="text-[10px] text-[#4a6480]">{formatDistanceToNow(new Date(run.scheduled_at), { addSuffix: true })}</p>
                  </div>
                  <RunStatusBadge status={run.status} />
                  <div className="flex items-center gap-1.5">
                    <ResultIcon result={run.result} />
                    <span className="text-[11px] text-[#7fa8c8] capitalize">{run.result || '—'}</span>
                  </div>
                  <span className="text-[11px] text-[#4a6480]">
                    {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : '—'}
                  </span>
                  <span className="text-[11px] text-[#4a6480]">{run.retry_count}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Calendar className="h-8 w-8 mb-2 text-[#1e2d3d]" />
            <p className="text-xs text-[#3d5670]">No runs yet</p>
          </div>
        )}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Schedule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{schedule.name}&quot;? This action cannot be undone.
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
