'use client';

import { X, ArrowRight } from 'lucide-react';
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
    <div className="w-72 shrink-0 border-l border-[#1e2d3d] flex flex-col h-full bg-[#0b0f18]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a2332]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: color }} />
          <h3 className="text-xs font-semibold text-[#c8dce8] capitalize">{edge.type.replace(/_/g, ' ')}</h3>
        </div>
        <button
          className="flex items-center justify-center h-6 w-6 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="px-4 py-4 flex flex-col gap-4">
        {/* Flow */}
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[#131b26] border border-[#1e2d3d] text-xs">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-[#c8dce8] truncate">{sourceNode?.name ?? '…'}</p>
            <p className="text-[10px] text-[#4a6480]">{sourceNode?.type}</p>
          </div>
          <ArrowRight className="h-3.5 w-3.5 shrink-0" style={{ color }} />
          <div className="flex-1 min-w-0 text-right">
            <p className="font-medium text-[#c8dce8] truncate">{targetNode?.name ?? '…'}</p>
            <p className="text-[10px] text-[#4a6480]">{targetNode?.type}</p>
          </div>
        </div>

        {/* Meta */}
        <div className="flex flex-col gap-2 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-[#4a6480]">Layer</span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-[#1e2d3d] bg-[#0f1923] text-[#4a6480]">
              {edge.source_layer}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#4a6480]">Confidence</span>
            <span className="text-[#7fa8c8]">{(edge.confidence * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
