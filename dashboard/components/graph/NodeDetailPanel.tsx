'use client';

import { X, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useGraphNode, useGraphNodeDependencies } from '@/lib/hooks/useGraph';

interface NodeDetailPanelProps {
  nodeId: string;
  onClose: () => void;
}

export function NodeDetailPanel({ nodeId, onClose }: NodeDetailPanelProps) {
  const { data: nodeData, isLoading: nodeLoading } = useGraphNode(nodeId);
  const { data: depsData, isLoading: depsLoading } = useGraphNodeDependencies(nodeId);

  const node = nodeData?.node;
  const deps = depsData?.nodes ?? [];

  return (
    <div className="w-80 shrink-0 border-l flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-medium text-sm">Node Details</h3>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-4 py-3 flex flex-col gap-4">
          {nodeLoading ? (
            <>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
            </>
          ) : node ? (
            <>
              <div>
                <p className="font-semibold text-base">{node.name}</p>
                <div className="flex gap-2 mt-1 flex-wrap">
                  <Badge variant="secondary">{node.type}</Badge>
                  <Badge variant="outline">{node.source_layer}</Badge>
                </div>
              </div>

              <div className="flex flex-col gap-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Service</span>
                  <span className="font-mono text-xs">{node.service || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Confidence</span>
                  <span>{(node.confidence * 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Source</span>
                  <span className="font-mono text-xs truncate max-w-[140px]" title={node.source_file}>
                    {node.source_file || '—'}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Node not found.</p>
          )}

          <div>
            <p className="text-sm font-medium mb-2 flex items-center gap-1">
              <GitBranch className="h-4 w-4" />
              Dependencies
            </p>
            {depsLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : deps.length === 0 ? (
              <p className="text-xs text-muted-foreground">No dependencies found.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {deps.map((dep) => (
                  <li key={dep.id} className="text-xs flex items-center gap-2 py-1 border-b last:border-0">
                    <Badge variant="outline" className="text-[10px]">{dep.type}</Badge>
                    <span className="truncate">{dep.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
