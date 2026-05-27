'use client';

import { useState } from 'react';
import { useSchedules, useDeleteSchedule, usePauseSchedule, useResumeSchedule, useTriggerSchedule } from '@/lib/hooks/useSchedules';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  Calendar,
  Clock,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Search,
  Trash2,
  Edit,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import Link from 'next/link';
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

function ResultIcon({ result }: { result?: string }) {
  if (result === 'success') return <CheckCircle2 className="h-3.5 w-3.5 text-teal-400 shrink-0" />;
  if (result === 'failure') return <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />;
  if (result === 'skipped') return <AlertCircle className="h-3.5 w-3.5 text-yellow-400 shrink-0" />;
  return null;
}

export default function SchedulesPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ScheduleStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading, error } = useSchedules({
    search: search || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
    page,
    page_size: 20,
  });

  const deleteMutation = useDeleteSchedule();
  const pauseMutation = usePauseSchedule();
  const resumeMutation = useResumeSchedule();
  const triggerMutation = useTriggerSchedule();

  const handleDelete = async () => {
    if (deleteId) {
      await deleteMutation.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  if (error) {
    return (
      <div className="px-6 py-6">
        <div className="rounded-xl bg-red-400/5 border border-red-400/20 p-6 text-red-400 text-sm">
          Failed to load schedules. Please try again.
        </div>
      </div>
    );
  }

  const STATUS_OPTIONS: Array<{ value: ScheduleStatus | 'all'; label: string }> = [
    { value: 'all', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'paused', label: 'Paused' },
    { value: 'disabled', label: 'Disabled' },
  ];

  return (
    <div className="px-6 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-[#c8dce8]">Scheduled Tests</h1>
          <p className="text-xs text-[#3d5670] mt-0.5">Automate your test runs with cron-based scheduling</p>
        </div>
        <Link
          href="/schedules/new"
          className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors"
        >
          <Plus className="h-3 w-3" />
          New Schedule
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-[#3d5670]" />
          <input
            placeholder="Search schedules..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 pl-8 pr-3 rounded-lg bg-[#0f1923] border border-[#1e2d3d] text-xs text-[#c8dce8] placeholder-[#3d5670] focus:outline-none focus:border-teal-400/50 transition-colors"
          />
        </div>
        <div className="flex gap-1">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={cn(
                'h-8 px-3 rounded-lg text-xs transition-colors',
                statusFilter === opt.value
                  ? 'bg-teal-400/15 text-teal-400 border border-teal-400/30'
                  : 'text-[#4a6480] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] hover:text-[#7fa8c8]'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
        <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_auto] gap-4 px-4 py-2.5 border-b border-[#1a2332]">
          {['Name', 'Schedule', 'Status', 'Last Run', 'Next Run', ''].map((h) => (
            <span key={h} className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{h}</span>
          ))}
        </div>

        {isLoading ? (
          <div className="divide-y divide-[#1a2332]">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-14 px-4 flex items-center">
                <div className="h-3 w-1/3 rounded bg-[#1a2d3d] animate-pulse" />
              </div>
            ))}
          </div>
        ) : data?.schedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Calendar className="h-10 w-10 mb-3 text-[#1e2d3d]" />
            <p className="text-sm text-[#3d5670] mb-1">No schedules found</p>
            <p className="text-[11px] text-[#2a3d52] mb-4">Create your first schedule to automate test runs.</p>
            <Link
              href="/schedules/new"
              className="flex items-center gap-1.5 h-7 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors"
            >
              <Plus className="h-3 w-3" />
              Create Schedule
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-[#1a2332]">
            {data?.schedules.map((schedule) => (
              <div key={schedule.id} className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 items-center hover:bg-[#131b26] transition-colors group">
                <div>
                  <Link
                    href={`/schedules/${schedule.id}`}
                    className="text-[13px] font-medium text-[#c8dce8] hover:text-teal-400 transition-colors"
                  >
                    {schedule.name}
                  </Link>
                  {schedule.description && (
                    <p className="text-[11px] text-[#4a6480] truncate max-w-[280px]">{schedule.description}</p>
                  )}
                  {schedule.flow && (
                    <Link href={`/flows/${schedule.flow.id}`} className="text-[10px] text-teal-400/70 hover:text-teal-400 transition-colors">
                      {schedule.flow.name}
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3 text-[#3d5670] shrink-0" />
                  <div>
                    <p className="text-[11px] text-[#c8dce8]">{describeCron(schedule.cron_expr)}</p>
                    <p className="text-[10px] text-[#4a6480] font-mono">{schedule.cron_expr}</p>
                  </div>
                </div>
                <StatusBadge status={schedule.status} />
                <div>
                  {schedule.last_run_at ? (
                    <div className="flex items-center gap-1.5">
                      <ResultIcon result={schedule.last_run_result} />
                      <span className="text-[11px] text-[#7fa8c8]">
                        {formatDistanceToNow(new Date(schedule.last_run_at), { addSuffix: true })}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[11px] text-[#3d5670]">Never</span>
                  )}
                </div>
                <span className="text-[11px] text-[#7fa8c8]">
                  {schedule.next_run_at && schedule.status === 'active'
                    ? format(new Date(schedule.next_run_at), 'MMM d, h:mm a')
                    : <span className="text-[#3d5670]">—</span>
                  }
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center justify-center h-6 w-6 rounded text-[#3d5670] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors opacity-0 group-hover:opacity-100">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => triggerMutation.mutate(schedule.id)} disabled={triggerMutation.isPending}>
                      <Play className="mr-2 h-4 w-4" />Run Now
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {schedule.status === 'active' ? (
                      <DropdownMenuItem onClick={() => pauseMutation.mutate(schedule.id)} disabled={pauseMutation.isPending}>
                        <Pause className="mr-2 h-4 w-4" />Pause
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => resumeMutation.mutate(schedule.id)} disabled={resumeMutation.isPending}>
                        <Play className="mr-2 h-4 w-4" />Resume
                      </DropdownMenuItem>
                    )}
                    <Link href={`/schedules/${schedule.id}/edit`}>
                      <DropdownMenuItem>
                        <Edit className="mr-2 h-4 w-4" />Edit
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setDeleteId(schedule.id)} className="text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" />Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}

        {data && data.total > 20 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#1a2332]">
            <p className="text-[11px] text-[#4a6480]">
              {(page - 1) * 20 + 1}–{Math.min(page * 20, data.total)} of {data.total} schedules
            </p>
            <div className="flex gap-1.5">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0b0f18] border border-[#1e2d3d] hover:border-[#2a3d52] disabled:opacity-40 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page * 20 >= data.total}
                className="h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0b0f18] border border-[#1e2d3d] hover:border-[#2a3d52] disabled:opacity-40 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this schedule? This action cannot be undone.
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
