'use client';

import { useCallback, useEffect, useState } from 'react';
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

// ── Type colours ──────────────────────────────────────────────────────────────

const TYPE_HEX: Record<string, string> = {
  service:     '#3b82f6',
  api_endpoint:'#22c55e',
  endpoint:    '#22c55e',
  database:    '#a855f7',
  queue:       '#f97316',
  topic:       '#eab308',
  cache:       '#ec4899',
};

function nodeHex(type: string): string {
  return TYPE_HEX[type] ?? '#9ca3af';
}

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

function edgeHex(type: string): string {
  return EDGE_HEX[type] ?? '#9ca3af';
}

// ── Custom node component ─────────────────────────────────────────────────────

const NODE_W = 160;
const NODE_H = 52;

function GraphNodeComponent({ data, selected }: NodeProps<{ node: GraphNode }>) {
  const { node } = data;
  const hex = nodeHex(node.type);
  return (
    <div
      className={cn(
        'px-3 py-2 rounded-lg border-2 bg-background shadow-sm cursor-pointer select-none',
        selected ? 'border-primary' : 'border-border',
      )}
      style={{ width: NODE_W, minHeight: NODE_H }}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: hex }} />
        <span className="font-medium text-xs truncate">{node.name}</span>
      </div>
      <p className="text-[10px] text-muted-foreground mt-0.5 pl-4">{node.type}</p>
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground" />
    </div>
  );
}

const NODE_TYPES = { graphNode: GraphNodeComponent };

// ── Dagre layout ──────────────────────────────────────────────────────────────

function applyDagreLayout(nodes: GraphNode[], edges: GraphEdge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 100, align: 'UL' });

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
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 12,
        height: 12,
        color: edgeHex(e.type),
      },
      style: { stroke: edgeHex(e.type), strokeWidth: 1.5, opacity: 0.7 },
    }));
}

// ── GraphCanvas ───────────────────────────────────────────────────────────────

export function GraphCanvas() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useGraphNodes({ search: debouncedSearch || undefined, limit: 200 });
  const { data: edgesData } = useGraphEdges();

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    if (!data?.nodes) return;
    const allEdges = edgesData?.edges ?? [];
    const nodeIds = new Set(data.nodes.map((n) => n.id));
    const visibleEdges = allEdges.filter(
      (e) => nodeIds.has(e.from_node_id) && nodeIds.has(e.to_node_id),
    );
    setRfNodes(applyDagreLayout(data.nodes, visibleEdges));
    setRfEdges(buildEdges(visibleEdges, nodeIds));
  }, [data, edgesData, setRfNodes, setRfEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
  }, []);

  return (
    <div className="flex h-[700px] rounded-lg border overflow-hidden">
      <div className="flex-1 flex flex-col">
        <div className="px-3 py-2 border-b flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            className="h-7 border-0 shadow-none focus-visible:ring-0 text-sm"
            placeholder="Filter nodes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {data && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {data.total} nodes
            </span>
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
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
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

      {selectedNodeId && (
        <NodeDetailPanel nodeId={selectedNodeId} onClose={() => setSelectedNodeId(null)} />
      )}
    </div>
  );
}
