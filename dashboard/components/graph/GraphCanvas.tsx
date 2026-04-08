'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dagre from '@dagrejs/dagre';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useGraphEdges, useGraphNodes } from '@/lib/hooks/useGraph';
import type { GraphEdge, GraphNode } from '@/lib/api/graph';
import { Search } from 'lucide-react';
import { NodeDetailPanel } from './NodeDetailPanel';
import { EdgeDetailPanel } from './EdgeDetailPanel';

// ── Colour maps ───────────────────────────────────────────────────────────────

export const NODE_HEX: Record<string, string> = {
  service:      '#3b82f6',
  api_endpoint: '#22c55e',
  endpoint:     '#22c55e',
  database:     '#a855f7',
  queue:        '#f97316',
  topic:        '#eab308',
  cache:        '#ec4899',
  grpc_method:  '#06b6d4',
  websocket:    '#8b5cf6',
};

export const EDGE_HEX: Record<string, string> = {
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

function nodeHex(type: string): string  { return NODE_HEX[type] ?? '#9ca3af'; }
function edgeHex(type: string): string  { return EDGE_HEX[type] ?? '#9ca3af'; }

// ── Node component ────────────────────────────────────────────────────────────

export const NODE_W = 160;
export const NODE_H = 52;

function GraphNodeComponent({ data, selected }: NodeProps<{ node: GraphNode }>) {
  const { node } = data;
  return (
    <div
      className={cn(
        'px-3 py-2 rounded-lg border-2 bg-background shadow-sm cursor-pointer select-none',
        selected ? 'border-primary shadow-md' : 'border-border',
      )}
      style={{ width: NODE_W, minHeight: NODE_H }}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: nodeHex(node.type) }} />
        <span className="font-medium text-xs truncate">{node.name}</span>
      </div>
      <p className="text-[10px] text-muted-foreground mt-0.5 pl-4">{node.type.replace(/_/g, ' ')}</p>
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground" />
    </div>
  );
}

const NODE_TYPES = { graphNode: GraphNodeComponent };

// ── Dagre layout ──────────────────────────────────────────────────────────────

function applyDagreLayout(nodes: GraphNode[], edges: GraphEdge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 100 });

  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => {
    if (g.hasNode(e.from_node_id) && g.hasNode(e.to_node_id)) {
      g.setEdge(e.from_node_id, e.to_node_id);
    }
  });

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      id: n.id,
      type: 'graphNode',
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: { node: n },
    };
  });
}

// ── Edge builder ──────────────────────────────────────────────────────────────

function buildEdges(edges: GraphEdge[], nodeIds: Set<string>): Edge[] {
  return edges
    .filter((e) => nodeIds.has(e.from_node_id) && nodeIds.has(e.to_node_id))
    .map((e) => ({
      id: e.id,
      source: e.from_node_id,
      target: e.to_node_id,
      type: 'smoothstep',
      data: { edge: e },
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: edgeHex(e.type) },
      style: { stroke: edgeHex(e.type), strokeWidth: 1.5, opacity: 0.7, cursor: 'pointer' },
    }));
}

// ── GraphCanvas ───────────────────────────────────────────────────────────────

export function GraphCanvas() {
  const [search, setSearch]               = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedNodeId, setSelectedNodeId]   = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge]       = useState<GraphEdge | null>(null);
  const [hiddenTypes, setHiddenTypes]         = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useGraphNodes({ search: debouncedSearch || undefined, limit: 200 });
  const { data: edgesData }  = useGraphEdges();

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Build layout whenever nodes or edges change
  useEffect(() => {
    if (!data?.nodes) return;
    const allEdges = edgesData?.edges ?? [];
    const nodeIds  = new Set(data.nodes.map((n) => n.id));
    const visible  = allEdges.filter((e) => nodeIds.has(e.from_node_id) && nodeIds.has(e.to_node_id));
    setRfNodes(applyDagreLayout(data.nodes, visible));
    setRfEdges(buildEdges(visible, nodeIds));
  }, [data, edgesData, setRfNodes, setRfEdges]);

  // Node lookup map (for EdgeDetailPanel)
  const nodeById = useMemo(() => {
    const m = new Map<string, GraphNode>();
    data?.nodes?.forEach((n) => m.set(n.id, n));
    return m;
  }, [data]);

  // Available edge types for the filter bar
  const allEdgeTypes = useMemo(() => {
    const types = new Set(rfEdges.map((e) => (e.data as unknown as { edge: GraphEdge }).edge.type));
    return [...types].sort();
  }, [rfEdges]);

  // Focus: IDs directly connected to selected node
  const focusedIds = useMemo<Set<string> | null>(() => {
    if (!selectedNodeId) return null;
    const ids = new Set([selectedNodeId]);
    rfEdges.forEach((e) => {
      if (e.source === selectedNodeId) ids.add(e.target);
      if (e.target === selectedNodeId) ids.add(e.source);
    });
    return ids;
  }, [selectedNodeId, rfEdges]);

  // Apply focus dimming to nodes
  const displayNodes = useMemo(() => {
    if (!focusedIds) return rfNodes;
    return rfNodes.map((n) => ({
      ...n,
      style: { opacity: focusedIds.has(n.id) ? 1 : 0.12, transition: 'opacity 0.15s' },
    }));
  }, [rfNodes, focusedIds]);

  // Apply focus dimming + type filter to edges
  const displayEdges = useMemo<Edge[]>(() => {
    return rfEdges
      .filter((e) => !hiddenTypes.has((e.data as unknown as { edge: GraphEdge }).edge.type))
      .map((e) => {
        const isActive = !focusedIds || (focusedIds.has(e.source) && focusedIds.has(e.target));
        const isSelected = selectedEdge?.id === e.id;
        return {
          ...e,
          style: {
            ...e.style,
            opacity: isSelected ? 1 : isActive ? 0.7 : 0.06,
            strokeWidth: isSelected ? 2.5 : 1.5,
          },
          markerEnd: isActive || isSelected
            ? e.markerEnd
            : { ...(e.markerEnd as object), color: '#d1d5db' },
        } as Edge;
      });
  }, [rfEdges, focusedIds, hiddenTypes, selectedEdge]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedEdge(null);
    setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
  }, []);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedNodeId(null);
    const ge = (edge.data as unknown as { edge: GraphEdge }).edge;
    setSelectedEdge((prev) => (prev?.id === ge.id ? null : ge));
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdge(null);
  }, []);

  const toggleType = useCallback((type: string) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  }, []);

  const hasSelection = selectedNodeId || selectedEdge;

  return (
    <div className="flex h-[700px] rounded-lg border overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0">

        {/* Toolbar */}
        <div className="px-3 py-2 border-b flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              className="h-7 border-0 shadow-none focus-visible:ring-0 text-sm"
              placeholder="Filter nodes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {data && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {data.total} nodes · {rfEdges.length} edges
              </span>
            )}
          </div>

          {/* Edge type filter pills */}
          {allEdgeTypes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {allEdgeTypes.map((type) => {
                const hidden = hiddenTypes.has(type);
                return (
                  <button
                    key={type}
                    onClick={() => toggleType(type)}
                    className={cn(
                      'flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-opacity',
                      hidden ? 'opacity-30' : 'opacity-100',
                    )}
                    style={{ borderColor: edgeHex(type), color: edgeHex(type) }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: edgeHex(type) }} />
                    {type.replace(/_/g, ' ')}
                  </button>
                );
              })}
              {hasSelection && (
                <button
                  onClick={onPaneClick}
                  className="px-2 py-0.5 rounded-full text-[10px] border text-muted-foreground border-border hover:bg-muted transition-colors ml-auto"
                >
                  Clear focus
                </button>
              )}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Loading graph…
          </div>
        ) : rfNodes.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            {debouncedSearch ? 'No nodes match your filter.' : 'No nodes found. Run a scan to populate the graph.'}
          </div>
        ) : (
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            nodeTypes={NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            attributionPosition="bottom-left"
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <Controls />
            <MiniMap nodeColor={(n) => nodeHex((n.data as { node: GraphNode }).node.type)} />
          </ReactFlow>
        )}
      </div>

      {/* Side panel: node or edge detail */}
      {selectedNodeId && !selectedEdge && (
        <NodeDetailPanel nodeId={selectedNodeId} nodeById={nodeById} onClose={() => setSelectedNodeId(null)} />
      )}
      {selectedEdge && (
        <EdgeDetailPanel
          edge={selectedEdge}
          sourceNode={nodeById.get(selectedEdge.from_node_id)}
          targetNode={nodeById.get(selectedEdge.to_node_id)}
          onClose={() => setSelectedEdge(null)}
        />
      )}
    </div>
  );
}
