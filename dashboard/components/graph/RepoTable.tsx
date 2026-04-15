'use client';

import { useState } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
        <h2 className="text-base font-medium">Repositories</h2>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Register Repo
        </Button>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {isMerging ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Rebuilding cross-repo graph…</span>
            </>
          ) : latestJob?.status === 'completed' ? (
            <span>
              Cross-repo graph updated{' '}
              {latestJob.completed_at ? formatDistanceToNow(new Date(latestJob.completed_at), { addSuffix: true }) : ''}
            </span>
          ) : latestJob?.status === 'failed' ? (
            <span className="text-destructive">Graph merge failed: {latestJob.error}</span>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => triggerMerge.mutate()}
          disabled={isMerging || triggerMerge.isPending || !workspaceId}
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Rebuild graph
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : repos.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">No repositories registered yet.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Register your first repo
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {repos.map((repo) => (
                <TableRow key={repo.id}>
                  <TableCell className="font-medium">{repo.name}</TableCell>
                  <TableCell className="max-w-[240px] truncate text-muted-foreground text-sm">
                    {repo.url || <span className="italic">local</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{repo.branch}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {repo.created_at ? formatDistanceToNow(new Date(repo.created_at), { addSuffix: true }) : '—'}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleScan(repo.id)}
                          disabled={scanningId === repo.id}
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          {scanningId === repo.id ? 'Scanning…' : 'Trigger Scan'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(repo)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteId(repo.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
