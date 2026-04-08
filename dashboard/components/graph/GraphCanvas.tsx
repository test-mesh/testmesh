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

function nodeHex(t: string): string { return NODE_HEX[t] ?? '#9ca3af'; }
function edgeHex(t: string): string { return EDGE_HEX[t] ?? '#9ca3af'; }

// ── Layout constants ──────────────────────────────────────────────────────────

export const NODE_W = 160;
export const NODE_H = 52;

const COL_W    = 220;  // horizontal gap between columns (depth levels)
const ROW_H    = 76;   // vertical gap between nodes within a column
const TREE_GAP = 80;   // vertical gap between service trees

// ── Node component — 4 invisible handles for flexible edge routing ────────────

export function GraphNodeComponent({ data, selected }: NodeProps<{ node: GraphNode }>) {
  const { node } = data;
  return (
    <div
      className={cn(
        'px-3 py-2 rounded-lg border-2 bg-background shadow-sm cursor-pointer select-none',
        selected ? 'border-primary shadow-md' : 'border-border',
      )}
      style={{ width: NODE_W, minHeight: NODE_H }}
    >
      <Handle type="target" position={Position.Top}    id="top"    style={{ visibility: 'hidden' }} />
      <Handle type="target" position={Position.Left}   id="left"   style={{ visibility: 'hidden' }} />
      <Handle type="source" position={Position.Right}  id="right"  style={{ visibility: 'hidden' }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ visibility: 'hidden' }} />
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: nodeHex(node.type) }} />
        <span className="font-medium text-xs truncate">{node.name}</span>
      </div>
      <p className="text-[10px] text-muted-foreground mt-0.5 pl-4">{node.type.replace(/_/g, ' ')}</p>
    </div>
  );
}

const NODE_TYPES = { graphNode: GraphNodeComponent };

// ── Tree layout ───────────────────────────────────────────────────────────────
// Each service is a root. BFS outward assigns column depth (left = service,
// right = what it calls). Service trees are stacked vertically with enough
// vertical space for their tallest column. Inter-service ordering via dagre.
//
//  [service] ──► [endpoint]  ──► [topic]
//                             ──► [database]
//           ──► [endpoint2] ──► [cache]

type LayoutResult = { rfNodes: Node[]; positions: Map<string, { x: number; y: number }> };

function applyTreeLayout(nodes: GraphNode[], edges: GraphEdge[]): LayoutResult {
  const nodeById = new Map<string, GraphNode>();
  nodes.forEach((n) => nodeById.set(n.id, n));

  // Build outgoing adjacency map and edge-type lookup
  const outAdj    = new Map<string, string[]>();
  const edgeType  = new Map<string, string>(); // `${from}:${to}` → type
  edges.forEach((e) => {
    if (!outAdj.has(e.from_node_id)) outAdj.set(e.from_node_id, []);
    outAdj.get(e.from_node_id)!.push(e.to_node_id);
    // Keep highest-priority type if multiple edges between same pair
    const key = `${e.from_node_id}:${e.to_node_id}`;
    if (!edgeType.has(key)) edgeType.set(key, e.type);
  });

  const services   = nodes.filter((n) => n.type === 'service');
  const serviceIds = new Set(services.map((s) => s.id));

  // Topo-sort services so upstream services appear above downstream ones
  const sg = new dagre.graphlib.Graph();
  sg.setDefaultEdgeLabel(() => ({}));
  sg.setGraph({ rankdir: 'TB', nodesep: 1, ranksep: 1 });
  services.forEach((s) => sg.setNode(s.id, { width: 1, height: 1 }));
  edges.forEach((e) => {
    if (serviceIds.has(e.from_node_id) && serviceIds.has(e.to_node_id)
        && sg.hasNode(e.from_node_id) && sg.hasNode(e.to_node_id)) {
      sg.setEdge(e.from_node_id, e.to_node_id);
    }
  });
  dagre.layout(sg);

  const sortedServices = [...services].sort((a, b) => {
    const ay = sg.hasNode(a.id) ? (sg.node(a.id)?.y ?? 0) : 0;
    const by = sg.hasNode(b.id) ? (sg.node(b.id)?.y ?? 0) : 0;
    return ay - by;
  });

  // BFS from each service to build its subtree.
  //
  // Column assignment:
  //   col 0 — service itself
  //   col 1 — nodes reached via "exposes" from the service (endpoints/handlers)
  //   col 2 — nodes reached via any other edge from the service (tables, topics, caches…)
  //            AND nodes reached from col-1 nodes (normal BFS step)
  //   col 3+ — normal BFS step from col 2
  //
  // This produces the visual hierarchy:  service → handler → resource
  // even though the scanner emits service→resource edges directly.

  const assigned = new Set<string>();
  // serviceId → Map<col, nodeId[]>
  const serviceTrees = new Map<string, Map<number, string[]>>();

  sortedServices.forEach((svc) => {
    const tree = new Map<number, string[]>();
    tree.set(0, [svc.id]);
    assigned.add(svc.id);

    // Seed queue: assign col based on edge type leaving the service
    const queue: Array<{ id: string; col: number }> = [];

    for (const nid of outAdj.get(svc.id) ?? []) {
      if (assigned.has(nid)) continue;
      const neighbor = nodeById.get(nid);
      if (!neighbor || neighbor.type === 'service') continue;
      assigned.add(nid);
      // "exposes" → col 1 (endpoint layer); everything else → col 2 (resource layer)
      const col = edgeType.get(`${svc.id}:${nid}`) === 'exposes' ? 1 : 2;
      if (!tree.has(col)) tree.set(col, []);
      tree.get(col)!.push(nid);
      queue.push({ id: nid, col });
    }

    // Continue BFS from endpoint/resource nodes outward
    while (queue.length > 0) {
      const { id, col } = queue.shift()!;
      for (const nid of outAdj.get(id) ?? []) {
        if (assigned.has(nid)) continue;
        const neighbor = nodeById.get(nid);
        if (!neighbor || neighbor.type === 'service') continue;
        assigned.add(nid);
        const nextCol = col + 1;
        if (!tree.has(nextCol)) tree.set(nextCol, []);
        tree.get(nextCol)!.push(nid);
        queue.push({ id: nid, col: nextCol });
      }
    }

    serviceTrees.set(svc.id, tree);
  });

  // Position each tree
  const positions = new Map<string, { x: number; y: number }>();
  const rfNodes: Node[] = [];
  let currentY = 0;

  sortedServices.forEach((svc) => {
    const tree = serviceTrees.get(svc.id)!;
    // Tree height = tallest column
    const maxNodes = Math.max(...[...tree.values()].map((ns) => ns.length));
    const treeH    = Math.max(maxNodes, 1) * ROW_H;

    tree.forEach((nodeIds, col) => {
      const colH   = nodeIds.length * ROW_H;
      const startY = currentY + (treeH - colH) / 2; // centre col within tree

      nodeIds.forEach((nid, row) => {
        const pos = { x: col * COL_W, y: startY + row * ROW_H };
        positions.set(nid, pos);
        rfNodes.push({
          id: nid,
          type: 'graphNode',
          position: pos,
          data: { node: nodeById.get(nid)! },
        });
      });
    });

    currentY += treeH + TREE_GAP;
  });

  // Orphaned nodes — not reached by any service BFS
  const maxCol = serviceTrees.size > 0
    ? Math.max(...[...serviceTrees.values()].flatMap((t) => [...t.keys()]))
    : 0;
  const orphanX = (maxCol + 1) * COL_W + 40;
  let orphanY = 0;
  nodes.forEach((n) => {
    if (!positions.has(n.id)) {
      const pos = { x: orphanX, y: orphanY };
      positions.set(n.id, pos);
      rfNodes.push({ id: n.id, type: 'graphNode', position: pos, data: { node: n } });
      orphanY += ROW_H;
    }
  });

  return { rfNodes, positions };
}

// ── Edge builder — picks handle based on relative node positions ───────────────

function buildEdges(
  edges: GraphEdge[],
  nodeIds: Set<string>,
  positions: Map<string, { x: number; y: number }>,
): Edge[] {
  return edges
    .filter((e) => nodeIds.has(e.from_node_id) && nodeIds.has(e.to_node_id))
    .map((e) => {
      const fp = positions.get(e.from_node_id) ?? { x: 0, y: 0 };
      const tp = positions.get(e.to_node_id)   ?? { x: 0, y: 0 };
      const vertical = Math.abs(tp.y - fp.y) > Math.abs(tp.x - fp.x);
      const goingDown = tp.y >= fp.y;
      return {
        id: e.id,
        source: e.from_node_id,
        target: e.to_node_id,
        sourceHandle: vertical ? (goingDown ? 'bottom' : 'top') : 'right',
        targetHandle: vertical ? (goingDown ? 'top' : 'bottom') : 'left',
        type: 'smoothstep',
        data: { edge: e },
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: edgeHex(e.type) },
        style: { stroke: edgeHex(e.type), strokeWidth: 1.5, opacity: 0.7, cursor: 'pointer' },
      };
    });
}

// ── GraphCanvas ───────────────────────────────────────────────────────────────

export function GraphCanvas() {
  const [search, setSearch]                   = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedNodeId, setSelectedNodeId]   = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge]       = useState<GraphEdge | null>(null);
  const [hiddenTypes, setHiddenTypes]         = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useGraphNodes({ search: debouncedSearch || undefined, limit: 200 });
  const { data: edgesData } = useGraphEdges();

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Persist node positions separately so edge routing can use them
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());

  useEffect(() => {
    if (!data?.nodes) return;
    const allEdges = edgesData?.edges ?? [];
    const nodeIds  = new Set(data.nodes.map((n) => n.id));
    const visible  = allEdges.filter((e) => nodeIds.has(e.from_node_id) && nodeIds.has(e.to_node_id));
    const { rfNodes: laid, positions: pos } = applyTreeLayout(data.nodes, visible);
    setRfNodes(laid);
    setPositions(pos);
    setRfEdges(buildEdges(visible, nodeIds, pos));
  }, [data, edgesData, setRfNodes, setRfEdges]);

  // Node lookup for EdgeDetailPanel
  const nodeById = useMemo(() => {
    const m = new Map<string, GraphNode>();
    data?.nodes?.forEach((n) => m.set(n.id, n));
    return m;
  }, [data]);

  // Edge types present in data
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

  const displayNodes = useMemo(() => {
    if (!focusedIds) return rfNodes;
    return rfNodes.map((n) => ({
      ...n,
      style: { opacity: focusedIds.has(n.id) ? 1 : 0.12, transition: 'opacity 0.15s' },
    }));
  }, [rfNodes, focusedIds]);

  const displayEdges = useMemo<Edge[]>(() => {
    return rfEdges
      .filter((e) => !hiddenTypes.has((e.data as unknown as { edge: GraphEdge }).edge.type))
      .map((e) => {
        const isActive   = !focusedIds || (focusedIds.has(e.source) && focusedIds.has(e.target));
        const isSelected = selectedEdge?.id === e.id;
        return {
          ...e,
          style: {
            ...e.style,
            opacity:     isSelected ? 1 : isActive ? 0.7 : 0.06,
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

          {/* Edge type filter */}
          {allEdgeTypes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {allEdgeTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-opacity',
                    hiddenTypes.has(type) ? 'opacity-30' : 'opacity-100',
                  )}
                  style={{ borderColor: edgeHex(type), color: edgeHex(type) }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: edgeHex(type) }} />
                  {type.replace(/_/g, ' ')}
                </button>
              ))}
              {hasSelection && (
                <button
                  onClick={onPaneClick}
                  className="ml-auto px-2 py-0.5 rounded-full text-[10px] border text-muted-foreground border-border hover:bg-muted transition-colors"
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
            fitViewOptions={{ padding: 0.12 }}
            attributionPosition="bottom-left"
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <Controls />
            <MiniMap nodeColor={(n) => nodeHex((n.data as { node: GraphNode }).node.type)} />
          </ReactFlow>
        )}
      </div>

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
