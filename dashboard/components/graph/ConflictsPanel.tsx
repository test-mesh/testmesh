'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useGraphConflicts, useResolveConflict } from '@/lib/hooks/useGraph';
import type { GraphConflict } from '@/lib/api/graph';

const RESOLUTION_OPTIONS = [
  { value: 'keep_newer', label: 'Keep newer version' },
  { value: 'keep_older', label: 'Keep older version' },
  { value: 'merge', label: 'Merge both' },
  { value: 'discard', label: 'Discard' },
];

interface ResolveDialogProps {
  conflict: GraphConflict;
  onClose: () => void;
}

function ResolveDialog({ conflict, onClose }: ResolveDialogProps) {
  const [resolution, setResolution] = useState('keep_newer');
  const resolveMutation = useResolveConflict();

  async function handleResolve() {
    try {
      await resolveMutation.mutateAsync({ id: conflict.id, resolution });
      onClose();
    } catch {
      // error accessible via resolveMutation.error
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Resolve Conflict</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          <p className="text-xs text-[#4a6480]">
            Conflict type: <span className="font-medium text-[#c8dce8]">{conflict.type}</span>
          </p>
          {conflict.node_ids.length > 0 && (
            <p className="text-xs text-[#4a6480]">
              Affected nodes: {conflict.node_ids.length}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[#c8dce8]">Resolution strategy</label>
            <Select value={resolution} onValueChange={setResolution}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOLUTION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={resolveMutation.isPending}
            className="h-8 px-4 rounded-lg text-xs text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleResolve}
            disabled={resolveMutation.isPending}
            className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
          >
            {resolveMutation.isPending ? 'Resolving…' : 'Resolve'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConflictsPanel() {
  const { data, isLoading } = useGraphConflicts();
  const [resolving, setResolving] = useState<GraphConflict | null>(null);

  const conflicts = data?.conflicts ?? [];

  return (
    <div className="flex flex-col gap-4">
      {isLoading ? (
        <div className="h-48 w-full rounded-xl bg-[#0f1923] border border-[#1e2d3d] animate-pulse" />
      ) : conflicts.length === 0 ? (
        <div className="rounded-xl bg-[#0f1923] border border-dashed border-[#1e2d3d] p-8 text-center">
          <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-[#c8dce8]">No conflicts</p>
          <p className="text-xs text-[#3d5670] mt-1">The graph has no unresolved merge conflicts.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <span className="text-sm font-medium text-[#c8dce8]">
              {conflicts.length} unresolved conflict{conflicts.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-4 px-4 py-2.5 border-b border-[#1a2332]">
              {['Type', 'Nodes affected', 'Current resolution', ''].map((h) => (
                <span key={h} className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{h}</span>
              ))}
            </div>
            <div className="divide-y divide-[#1a2332]">
              {conflicts.map((conflict) => (
                <div key={conflict.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-4 px-4 py-3 items-center hover:bg-[#131b26] transition-colors">
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-400/10 text-red-400 w-fit">
                    {conflict.type}
                  </span>
                  <span className="text-xs text-[#4a6480]">
                    {conflict.node_ids.length} node{conflict.node_ids.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-xs text-[#4a6480]">
                    {conflict.resolution || <span className="italic">unresolved</span>}
                  </span>
                  <button
                    onClick={() => setResolving(conflict)}
                    className="flex items-center h-7 px-3 rounded-lg text-xs border border-[#1e2d3d] bg-[#0f1923] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
                  >
                    Resolve
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {resolving && (
        <ResolveDialog
          conflict={resolving}
          onClose={() => setResolving(null)}
        />
      )}
    </div>
  );
}
