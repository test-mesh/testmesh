'use client';

import { useState } from 'react';
import { useSuites, useDeleteSuite, useRunSuite } from '@/lib/hooks/useSuites';
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
  MoreHorizontal, Plus, Search, Trash2, Edit, RefreshCw, Play, Layers,
  CheckCircle2, XCircle, Clock,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { SuiteRunStatus } from '@/lib/api/suites';

function LastRunBadge({ status }: { status?: SuiteRunStatus }) {
  if (!status) return null;
  const map: Record<SuiteRunStatus, { cls: string; icon: React.ReactNode; label: string }> = {
    completed: { cls: 'bg-teal-400/10 text-teal-400', icon: <CheckCircle2 className="h-3 w-3" />, label: 'Passed' },
    failed:    { cls: 'bg-red-400/10 text-red-400',  icon: <XCircle className="h-3 w-3" />,       label: 'Failed' },
    running:   { cls: 'bg-blue-400/10 text-blue-400', icon: <RefreshCw className="h-3 w-3 animate-spin" />, label: 'Running' },
    pending:   { cls: 'bg-[#1a2d3d] text-[#4a6480]', icon: <Clock className="h-3 w-3" />,         label: 'Pending' },
    cancelled: { cls: 'bg-[#1a2d3d] text-[#4a6480]', icon: null,                                   label: 'Cancelled' },
  };
  const entry = map[status] ?? { cls: 'bg-[#1a2d3d] text-[#4a6480]', icon: null, label: status };
  return (
    <span className={cn('flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded w-fit', entry.cls)}>
      {entry.icon}{entry.label}
    </span>
  );
}

export default function SuitesPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const PAGE_SIZE = 20;

  const { data, isLoading, error } = useSuites({
    search: search || undefined,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const deleteMutation = useDeleteSuite();
  const runMutation = useRunSuite();

  const handleDelete = async () => {
    if (deleteId) {
      await deleteMutation.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  const handleRun = (id: string, name: string) => {
    runMutation.mutate(id, {
      onSuccess: () => toast.success(`Suite "${name}" started`),
      onError: () => toast.error(`Failed to run suite "${name}"`),
    });
  };

  if (error) {
    return (
      <div className="px-6 py-6">
        <div className="rounded-xl bg-red-400/5 border border-red-400/20 p-6 text-red-400 text-sm">
          Failed to load suites. Please try again.
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-[#c8dce8]">Suites</h1>
          <p className="text-xs text-[#3d5670] mt-0.5">Group and run multiple flows as an ordered test suite</p>
        </div>
        <Link
          href="/suites/new"
          className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors"
        >
          <Plus className="h-3 w-3" />
          New Suite
        </Link>
      </div>

      {/* Search */}
      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-[#3d5670]" />
        <input
          placeholder="Search suites..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full h-8 pl-8 pr-3 rounded-lg bg-[#0f1923] border border-[#1e2d3d] text-xs text-[#c8dce8] placeholder-[#3d5670] focus:outline-none focus:border-teal-400/50 transition-colors"
        />
      </div>

      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-4 py-2.5 border-b border-[#1a2332]">
          {['Name', 'Tags', 'Flows', 'Last Run', ''].map((h) => (
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
        ) : data?.suites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Layers className="h-10 w-10 mb-3 text-[#1e2d3d]" />
            <p className="text-sm text-[#3d5670] mb-1">No suites found</p>
            <p className="text-[11px] text-[#2a3d52] mb-4">Create your first suite to run multiple flows together.</p>
            <Link
              href="/suites/new"
              className="flex items-center gap-1.5 h-7 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors"
            >
              <Plus className="h-3 w-3" />
              Create Suite
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-[#1a2332]">
            {data?.suites.map((suite) => (
              <div key={suite.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 items-center hover:bg-[#131b26] transition-colors group">
                <div>
                  <Link href={`/suites/${suite.id}`} className="text-[13px] font-medium text-[#c8dce8] hover:text-teal-400 transition-colors">
                    {suite.name}
                  </Link>
                  {suite.description && (
                    <p className="text-[11px] text-[#4a6480] truncate max-w-[280px]">{suite.description}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {suite.tags?.map((tag) => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#4a6480]">{tag}</span>
                  ))}
                </div>
                <span className="text-[11px] text-[#7fa8c8]">{suite.flows?.length ?? 0} flows</span>
                <span className="text-[11px] text-[#4a6480]">
                  {formatDistanceToNow(new Date(suite.updated_at), { addSuffix: true })}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center justify-center h-6 w-6 rounded text-[#3d5670] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors opacity-0 group-hover:opacity-100">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleRun(suite.id, suite.name)} disabled={runMutation.isPending}>
                      <Play className="mr-2 h-4 w-4" />Run Now
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <Link href={`/suites/${suite.id}/edit`}>
                      <DropdownMenuItem><Edit className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                    </Link>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setDeleteId(suite.id)} className="text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" />Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}

        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#1a2332]">
            <p className="text-[11px] text-[#4a6480]">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total} suites
            </p>
            <div className="flex gap-1.5">
              <button onClick={() => setPage(page - 1)} disabled={page === 1}
                className="h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0b0f18] border border-[#1e2d3d] hover:border-[#2a3d52] disabled:opacity-40 transition-colors">
                Previous
              </button>
              <button onClick={() => setPage(page + 1)} disabled={page * PAGE_SIZE >= data.total}
                className="h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0b0f18] border border-[#1e2d3d] hover:border-[#2a3d52] disabled:opacity-40 transition-colors">
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Suite?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this suite? This action cannot be undone.
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
