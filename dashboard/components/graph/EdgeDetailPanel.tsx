'use client';

import { X, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { GraphEdge, GraphNode } from '@/lib/api/graph';

const EDGE_HEX: Record<string, string> = {
  calls:      '#3b82f6',
  publishes:  '#f97316',
  consumes:   '#22c55e',
  reads:      '#a855f7',
  writes:     '#ef4444',
  depends_on: '#9ca3af',
  exposes:    '#06b6d4',
  triggers:   '#eab308',
  tested_by:  '#14b8a6',
};

interface EdgeDetailPanelProps {
  edge: GraphEdge;
  sourceNode: GraphNode | undefined;
  targetNode: GraphNode | undefined;
  onClose: () => void;
}

export function EdgeDetailPanel({ edge, sourceNode, targetNode, onClose }: EdgeDetailPanelProps) {
  const color = EDGE_HEX[edge.type] ?? '#9ca3af';

  return (
    <div className="w-72 shrink-0 border-l flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: color }} />
          <h3 className="font-medium text-sm capitalize">{edge.type.replace(/_/g, ' ')}</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="px-4 py-4 flex flex-col gap-4">
        {/* Flow */}
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm">
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{sourceNode?.name ?? '…'}</p>
            <p className="text-[10px] text-muted-foreground">{sourceNode?.type}</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" style={{ color }} />
          <div className="flex-1 min-w-0 text-right">
            <p className="font-medium truncate">{targetNode?.name ?? '…'}</p>
            <p className="text-[10px] text-muted-foreground">{targetNode?.type}</p>
          </div>
        </div>

        {/* Meta */}
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Layer</span>
            <Badge variant="outline" className="text-[10px]">{edge.source_layer}</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Confidence</span>
            <span>{(edge.confidence * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
