'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useExecutions } from '@/lib/hooks/useExecutions';
import { CheckCircle2, XCircle, Loader2, Clock, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { ExecutionStatus } from '@/lib/api/types';

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manual',
  schedule: 'Schedule',
  webhook: 'Webhook',
  argocd: 'Argo CD',
  api: 'API',
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'running', label: 'Running' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PAGE_SIZE = 20;

function StatusBadge({ status }: { status: ExecutionStatus }) {
  if (status === 'completed') return (
    <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-teal-400/10 text-teal-400 w-fit">
      <CheckCircle2 className="w-2.5 h-2.5" />Completed
    </span>
  );
  if (status === 'failed') return (
    <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-400/10 text-red-400 w-fit">
      <XCircle className="w-2.5 h-2.5" />Failed
    </span>
  );
  if (status === 'running') return (
    <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-400/10 text-blue-400 w-fit">
      <Loader2 className="w-2.5 h-2.5 animate-spin" />Running
    </span>
  );
  return (
    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#1a2d3d] text-[#7fa8c8] w-fit">{status}</span>
  );
}

export default function ExecutionsPage() {
  const [statusFilter, setStatusFilter] = useState<ExecutionStatus | 'all'>('all');
  const [page, setPage] = useState(0);

  const { data, isLoading, error } = useExecutions({
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const executions = data?.executions || [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (error) {
    return (
      <div className="px-6 py-6">
        <div className="rounded-xl bg-red-400/5 border border-red-400/20 p-6 text-red-400 text-sm">
          {error instanceof Error ? error.message : 'An error occurred'}
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-6">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#c8dce8]">Execution History</h1>
        <p className="text-xs text-[#3d5670] mt-0.5">View all test flow executions and their results</p>
      </div>

      {/* Filter bar */}
      <div className="mb-4">
        <div className="flex gap-2">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setStatusFilter(opt.value as ExecutionStatus | 'all'); setPage(0); }}
              className={cn(
                'h-7 px-3 rounded-lg text-xs transition-colors',
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
        {/* Table header */}
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-2.5 border-b border-[#1a2332]">
          {['Flow', 'Status', 'Environment', 'Triggered By', 'Steps', 'Duration', 'Started', ''].map((h) => (
            <span key={h} className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{h}</span>
          ))}
        </div>

        {isLoading ? (
          <div className="divide-y divide-[#1a2332]">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 px-4 flex items-center">
                <div className="h-3 w-1/3 rounded bg-[#1a2d3d] animate-pulse" />
              </div>
            ))}
          </div>
        ) : executions.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#3d5670]">No executions found</div>
        ) : (
          <div className="divide-y divide-[#1a2332]">
            {executions.map((execution) => (
              <div
                key={execution.id}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 hover:bg-[#131b26] transition-colors items-center group"
              >
                {/* Flow name */}
                <div className="min-w-0">
                  {execution.flow ? (
                    <Link
                      href={`/flows/${execution.flow.id}`}
                      className="text-[13px] font-medium text-[#c8dce8] hover:text-teal-400 transition-colors truncate block"
                    >
                      {execution.flow.name}
                    </Link>
                  ) : (
                    <span className="text-[13px] text-[#3d5670]">Unknown</span>
                  )}
                </div>

                {/* Status */}
                <StatusBadge status={execution.status} />

                {/* Environment */}
                <span className="text-[11px] font-mono text-[#4a6480] uppercase tracking-wider truncate">
                  {execution.environment || '—'}
                </span>

                {/* Triggered by */}
                <span className="text-[11px] text-[#4a6480]">
                  {execution.trigger_type ? (TRIGGER_LABELS[execution.trigger_type] ?? execution.trigger_type) : '—'}
                </span>

                {/* Steps */}
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="text-teal-400">{execution.passed_steps ?? 0}</span>
                  <span className="text-[#2a3d52]">/</span>
                  <span className="text-red-400">{execution.failed_steps ?? 0}</span>
                  <span className="text-[#3d5670]"> of {execution.total_steps ?? 0}</span>
                </div>

                {/* Duration */}
                <div className="flex items-center gap-1 text-[11px] text-[#4a6480]">
                  {execution.duration_ms ? (
                    <>
                      <Clock className="w-3 h-3" />
                      {execution.duration_ms}ms
                    </>
                  ) : '—'}
                </div>

                {/* Started */}
                <span className="text-[11px] text-[#4a6480]">
                  {execution.started_at
                    ? formatDistanceToNow(new Date(execution.started_at), { addSuffix: true })
                    : '—'}
                </span>

                {/* Action */}
                <Link
                  href={`/executions/${execution.id}`}
                  className="flex items-center gap-1 text-[11px] text-[#4a6480] hover:text-teal-400 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Eye className="w-3.5 h-3.5" />
                  View
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="mt-4 flex items-center justify-between text-xs text-[#3d5670]">
          <span>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total} executions
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                className="flex items-center gap-1 h-7 px-3 rounded-lg bg-[#0f1923] border border-[#1e2d3d] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] disabled:opacity-40 transition-colors"
                onClick={() => setPage(p => p - 1)}
                disabled={page === 0}
              >
                <ChevronLeft className="w-3.5 h-3.5" />Previous
              </button>
              <span className="text-[#4a6480]">Page {page + 1} of {totalPages}</span>
              <button
                className="flex items-center gap-1 h-7 px-3 rounded-lg bg-[#0f1923] border border-[#1e2d3d] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] disabled:opacity-40 transition-colors"
                onClick={() => setPage(p => p + 1)}
                disabled={page >= totalPages - 1}
              >
                Next<ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
