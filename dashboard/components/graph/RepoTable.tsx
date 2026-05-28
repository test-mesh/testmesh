'use client';

import { useState } from 'react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MoreHorizontal, Plus, RefreshCw, Trash2, Edit, Loader2 } from 'lucide-react';
import { useGraphRepos, useDeleteRepo, useTriggerRepoScan, useMergeJobs, useTriggerMerge } from '@/lib/hooks/useGraph';
import type { GraphRepo } from '@/lib/api/graph';
import { RepoDialog } from './RepoDialog';
import { formatDistanceToNow } from 'date-fns';
import { useActiveWorkspace } from '@/lib/hooks/useWorkspaces';

export function RepoTable() {
  const { activeWorkspaceId } = useActiveWorkspace();
  const workspaceId = activeWorkspaceId ?? '';

  const { data, isLoading } = useGraphRepos();
  const deleteMutation = useDeleteRepo();
  const scanMutation = useTriggerRepoScan();

  const { data: mergeData } = useMergeJobs(workspaceId);
  const triggerMerge = useTriggerMerge(workspaceId);
  const latestJob = mergeData?.merge_jobs?.[0];
  const isMerging = latestJob?.status === 'running' || latestJob?.status === 'pending';

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRepo, setEditRepo] = useState<GraphRepo | undefined>();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [scanningId, setScanningId] = useState<string | null>(null);

  const repos = data?.repos ?? [];

  async function handleScan(id: string) {
    setScanningId(id);
    try {
      await scanMutation.mutateAsync(id);
    } catch {
      // mutation error is captured in scanMutation.error
    } finally {
      setScanningId(null);
    }
  }

  function openCreate() {
    setEditRepo(undefined);
    setDialogOpen(true);
  }

  function openEdit(repo: GraphRepo) {
    setEditRepo(repo);
    setDialogOpen(true);
  }

  async function handleDelete() {
    if (deleteId) {
      try {
        await deleteMutation.mutateAsync(deleteId);
        setDeleteId(null);
      } catch {
        // mutation error is captured in deleteMutation.error
      }
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-[#c8dce8]">Repositories</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => triggerMerge.mutate()}
            disabled={isMerging || triggerMerge.isPending || !workspaceId}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] hover:text-[#c8dce8] disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-3 w-3 ${isMerging ? 'animate-spin' : ''}`} />
            Rebuild graph
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Register Repo
          </button>
        </div>
      </div>

      {latestJob && (
        <p className="text-[11px] text-[#3d5670]">
          {isMerging ? (
            <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Rebuilding cross-repo graph…</span>
          ) : latestJob.status === 'completed' ? (
            <>Cross-repo graph updated {latestJob.completed_at ? formatDistanceToNow(new Date(latestJob.completed_at), { addSuffix: true }) : ''}</>
          ) : latestJob.status === 'failed' ? (
            <span className="text-red-400">Graph merge failed: {latestJob.error}</span>
          ) : null}
        </p>
      )}

      {isLoading ? (
        <div className="h-24 rounded-xl bg-[#0f1923] border border-[#1e2d3d] animate-pulse" />
      ) : repos.length === 0 ? (
        <div className="rounded-xl bg-[#0f1923] border border-dashed border-[#1e2d3d] p-10 text-center">
          <p className="text-sm text-[#3d5670] mb-3">No repositories registered yet.</p>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 h-7 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors mx-auto"
          >
            <Plus className="h-3 w-3" />
            Register your first repo
          </button>
        </div>
      ) : (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="grid grid-cols-[1fr_2fr_1fr_1fr_auto] gap-4 px-4 py-2.5 border-b border-[#1a2332]">
            {['Name', 'URL', 'Branch', 'Created', ''].map((h) => (
              <span key={h} className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{h}</span>
            ))}
          </div>
          <div className="divide-y divide-[#1a2332]">
            {repos.map((repo) => (
              <div key={repo.id} className="grid grid-cols-[1fr_2fr_1fr_1fr_auto] gap-4 px-4 py-3 items-center hover:bg-[#131b26] transition-colors group">
                <span className="text-[13px] font-medium text-[#c8dce8] truncate">{repo.name}</span>
                <span className="text-[11px] font-mono text-[#4a6480] truncate">
                  {repo.url || <span className="italic">local</span>}
                </span>
                <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#4a7a96] w-fit">
                  {repo.branch}
                </span>
                <span className="text-[11px] text-[#4a6480]">
                  {repo.created_at ? formatDistanceToNow(new Date(repo.created_at), { addSuffix: true }) : '—'}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center justify-center h-6 w-6 rounded text-[#3d5670] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors opacity-0 group-hover:opacity-100">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleScan(repo.id)} disabled={scanningId === repo.id}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      {scanningId === repo.id ? 'Scanning…' : 'Trigger Scan'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openEdit(repo)}>
                      <Edit className="h-4 w-4 mr-2" />Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(repo.id)}>
                      <Trash2 className="h-4 w-4 mr-2" />Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </div>
      )}

      <RepoDialog
        key={editRepo?.id ?? 'create'}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        repo={editRepo}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete repository?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the repo registration and all associated graph nodes. This cannot be undone.
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
