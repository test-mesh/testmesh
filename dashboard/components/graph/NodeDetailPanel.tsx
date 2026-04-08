'use client';

import { X, ArrowRight, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useGraphNode } from '@/lib/hooks/useGraph';
import type { GraphNode } from '@/lib/api/graph';
import { EDGE_HEX, NODE_HEX } from './GraphCanvas';

interface NodeDetailPanelProps {
  nodeId: string;
  nodeById: Map<string, GraphNode>;
  onClose: () => void;
}

function edgeColor(type: string): string {
  return EDGE_HEX[type] ?? '#9ca3af';
}

function nodeColor(type: string): string {
  return NODE_HEX[type] ?? '#9ca3af';
}

export function NodeDetailPanel({ nodeId, nodeById, onClose }: NodeDetailPanelProps) {
  const { data: nodeData, isLoading } = useGraphNode(nodeId);

  const node  = nodeData?.node;
  const edges = nodeData?.edges ?? [];

  const outgoing = edges.filter((e) => e.from_node_id === nodeId);
  const incoming = edges.filter((e) => e.to_node_id   === nodeId);

  return (
    <div className="w-72 shrink-0 border-l flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-medium text-sm">Node Details</h3>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-4 py-3 flex flex-col gap-4">
          {isLoading ? (
            <>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
            </>
          ) : node ? (
            <>
              {/* Identity */}
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: nodeColor(node.type) }} />
                  <p className="font-semibold text-sm truncate">{node.name}</p>
                </div>
                <div className="flex gap-2 mt-1.5 flex-wrap pl-4">
                  <Badge variant="secondary" className="text-[10px]">{node.type.replace(/_/g, ' ')}</Badge>
                  <Badge variant="outline" className="text-[10px]">{node.source_layer}</Badge>
                </div>
              </div>

              {/* Meta */}
              <div className="flex flex-col gap-1.5 text-xs">
                {node.service && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Service</span>
                    <span className="font-mono">{node.service}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Confidence</span>
                  <span>{(node.confidence * 100).toFixed(0)}%</span>
                </div>
                {node.source_file && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground shrink-0">Source</span>
                    <span className="font-mono truncate text-right" title={node.source_file}>
                      {node.source_file.split('/').slice(-2).join('/')}
                    </span>
                  </div>
                )}
              </div>

              {/* Outgoing connections */}
              {outgoing.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-2 flex items-center gap-1 text-muted-foreground">
                    <ArrowRight className="h-3.5 w-3.5" />
                    Calls / sends to ({outgoing.length})
                  </p>
                  <ul className="flex flex-col gap-1">
                    {outgoing.map((e) => {
                      const target = nodeById.get(e.to_node_id);
                      return (
                        <li key={e.id} className="text-xs flex items-center gap-2 py-1 border-b last:border-0">
                          <span
                            className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium"
                            style={{ background: edgeColor(e.type) + '22', color: edgeColor(e.type) }}
                          >
                            {e.type.replace(/_/g, ' ')}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{target?.name ?? e.to_node_id.slice(0, 8)}</p>
                            {target && <p className="text-[10px] text-muted-foreground">{target.type.replace(/_/g, ' ')}</p>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Incoming connections */}
              {incoming.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-2 flex items-center gap-1 text-muted-foreground">
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Called by / received from ({incoming.length})
                  </p>
                  <ul className="flex flex-col gap-1">
                    {incoming.map((e) => {
                      const source = nodeById.get(e.from_node_id);
                      return (
                        <li key={e.id} className="text-xs flex items-center gap-2 py-1 border-b last:border-0">
                          <span
                            className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium"
                            style={{ background: edgeColor(e.type) + '22', color: edgeColor(e.type) }}
                          >
                            {e.type.replace(/_/g, ' ')}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{source?.name ?? e.from_node_id.slice(0, 8)}</p>
                            {source && <p className="text-[10px] text-muted-foreground">{source.type.replace(/_/g, ' ')}</p>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {outgoing.length === 0 && incoming.length === 0 && (
                <p className="text-xs text-muted-foreground">No connections found.</p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Node not found.</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
