'use client';

import { useState } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
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
          <p className="text-sm text-muted-foreground">
            Conflict type: <span className="font-medium text-foreground">{conflict.type}</span>
          </p>
          {conflict.node_ids.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Affected nodes: {conflict.node_ids.length}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Resolution strategy</label>
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
          <Button variant="ghost" onClick={onClose} disabled={resolveMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleResolve} disabled={resolveMutation.isPending}>
            {resolveMutation.isPending ? 'Resolving…' : 'Resolve'}
          </Button>
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
        <Skeleton className="h-48 w-full" />
      ) : conflicts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
          <p className="text-sm font-medium">No conflicts</p>
          <p className="text-xs text-muted-foreground mt-1">
            The graph has no unresolved merge conflicts.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <span className="text-sm font-medium">{conflicts.length} unresolved conflict{conflicts.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Nodes affected</TableHead>
                  <TableHead>Current resolution</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {conflicts.map((conflict) => (
                  <TableRow key={conflict.id}>
                    <TableCell>
                      <Badge variant="destructive">{conflict.type}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {conflict.node_ids.length} node{conflict.node_ids.length !== 1 ? 's' : ''}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {conflict.resolution || <span className="italic">unresolved</span>}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setResolving(conflict)}
                      >
                        Resolve
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
