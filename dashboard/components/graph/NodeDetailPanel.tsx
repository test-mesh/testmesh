'use client';

import { X, ArrowRight, ArrowLeft } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
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
    <div className="w-72 shrink-0 border-l border-[#1e2d3d] flex flex-col h-full bg-[#0b0f18]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a2332]">
        <h3 className="text-xs font-semibold text-[#c8dce8]">Node Details</h3>
        <button
          className="flex items-center justify-center h-6 w-6 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-4 py-3 flex flex-col gap-4">
          {isLoading ? (
            <>
              <div className="h-4 w-40 rounded bg-[#1a2332] animate-pulse" />
              <div className="h-3 w-24 rounded bg-[#1a2332] animate-pulse" />
              <div className="h-3 w-32 rounded bg-[#1a2332] animate-pulse" />
            </>
          ) : node ? (
            <>
              {/* Identity */}
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: nodeColor(node.type) }} />
                  <p className="text-xs font-semibold text-[#c8dce8] truncate">{node.name}</p>
                </div>
                <div className="flex gap-2 mt-1.5 flex-wrap pl-4">
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#4a6480]">
                    {node.type.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-[#1e2d3d] bg-[#0f1923] text-[#4a6480]">
                    {node.source_layer}
                  </span>
                </div>
              </div>

              {/* Meta */}
              <div className="flex flex-col gap-1.5 text-xs">
                {node.service && (
                  <div className="flex justify-between">
                    <span className="text-[#4a6480]">Service</span>
                    <span className="font-mono text-[#7fa8c8]">{node.service}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[#4a6480]">Confidence</span>
                  <span className="text-[#7fa8c8]">{(node.confidence * 100).toFixed(0)}%</span>
                </div>
                {node.source_file && (
                  <div className="flex justify-between gap-2">
                    <span className="text-[#4a6480] shrink-0">Source</span>
                    <span className="font-mono truncate text-right text-[#7fa8c8]" title={node.source_file}>
                      {node.source_file.split('/').slice(-2).join('/')}
                    </span>
                  </div>
                )}
              </div>

              {/* Outgoing connections */}
              {outgoing.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium mb-2 flex items-center gap-1 text-[#4a6480]">
                    <ArrowRight className="h-3 w-3" />
                    Calls / sends to ({outgoing.length})
                  </p>
                  <ul className="flex flex-col gap-1">
                    {outgoing.map((e) => {
                      const target = nodeById.get(e.to_node_id);
                      return (
                        <li key={e.id} className="text-xs flex items-center gap-2 py-1 border-b border-[#1a2332] last:border-0">
                          <span
                            className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium"
                            style={{ background: edgeColor(e.type) + '22', color: edgeColor(e.type) }}
                          >
                            {e.type.replace(/_/g, ' ')}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-[#c8dce8]">{target?.name ?? e.to_node_id.slice(0, 8)}</p>
                            {target && <p className="text-[10px] text-[#4a6480]">{target.type.replace(/_/g, ' ')}</p>}
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
                  <p className="text-[10px] font-medium mb-2 flex items-center gap-1 text-[#4a6480]">
                    <ArrowLeft className="h-3 w-3" />
                    Called by / received from ({incoming.length})
                  </p>
                  <ul className="flex flex-col gap-1">
                    {incoming.map((e) => {
                      const source = nodeById.get(e.from_node_id);
                      return (
                        <li key={e.id} className="text-xs flex items-center gap-2 py-1 border-b border-[#1a2332] last:border-0">
                          <span
                            className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium"
                            style={{ background: edgeColor(e.type) + '22', color: edgeColor(e.type) }}
                          >
                            {e.type.replace(/_/g, ' ')}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-[#c8dce8]">{source?.name ?? e.from_node_id.slice(0, 8)}</p>
                            {source && <p className="text-[10px] text-[#4a6480]">{source.type.replace(/_/g, ' ')}</p>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {outgoing.length === 0 && incoming.length === 0 && (
                <p className="text-xs text-[#4a6480]">No connections found.</p>
              )}
            </>
          ) : (
            <p className="text-xs text-[#4a6480]">Node not found.</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
