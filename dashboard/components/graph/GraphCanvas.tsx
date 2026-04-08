'use client';

import { useCallback, useEffect, useState } from 'react';
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
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useGraphNodes } from '@/lib/hooks/useGraph';
import type { GraphNode } from '@/lib/api/graph';
import { Search } from 'lucide-react';
import { NodeDetailPanel } from './NodeDetailPanel';

// ── Type colour map ───────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  service: 'bg-blue-500',
  endpoint: 'bg-green-500',
  database: 'bg-purple-500',
  queue: 'bg-orange-500',
  topic: 'bg-yellow-500',
  cache: 'bg-pink-500',
};

function dotColor(type: string): string {
  return TYPE_COLORS[type] ?? 'bg-gray-400';
}

const TYPE_HEX: Record<string, string> = {
  service: '#3b82f6',
  endpoint: '#22c55e',
  database: '#a855f7',
  queue: '#f97316',
  topic: '#eab308',
  cache: '#ec4899',
};

function dotHex(type: string): string {
  return TYPE_HEX[type] ?? '#9ca3af';
}

// ── Custom ReactFlow node ─────────────────────────────────────────────────────

function GraphNodeComponent({ data, selected }: NodeProps<{ node: GraphNode }>) {
  const { node } = data;
  return (
    <div
      className={cn(
        'px-3 py-2 rounded-lg border-2 bg-background shadow-sm min-w-[150px] cursor-pointer select-none',
        selected ? 'border-primary' : 'border-border',
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground" />
      <div className="flex items-center gap-2">
        <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', dotColor(node.type))} />
        <span className="font-medium text-xs truncate max-w-[110px]">{node.name}</span>
      </div>
      <p className="text-[10px] text-muted-foreground mt-0.5 pl-4">{node.type}</p>
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground" />
    </div>
  );
}

const NODE_TYPES = { graphNode: GraphNodeComponent };

// ── Grid layout ───────────────────────────────────────────────────────────────

function buildLayout(nodes: GraphNode[]): Node[] {
  const typeGroups = new Map<string, GraphNode[]>();
  nodes.forEach((n) => {
    if (!typeGroups.has(n.type)) typeGroups.set(n.type, []);
    typeGroups.get(n.type)!.push(n);
  });

  const rfNodes: Node[] = [];
  let colX = 0;
  for (const [, group] of typeGroups) {
    group.forEach((n, rowIndex) => {
      rfNodes.push({
        id: n.id,
        type: 'graphNode',
        position: { x: colX, y: rowIndex * 90 },
        data: { node: n },
      });
    });
    colX += 260;
  }
  return rfNodes;
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

  const { data, isLoading } = useGraphNodes({
    search: debouncedSearch || undefined,
    limit: 200,
  });

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, , onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    if (data?.nodes) {
      setRfNodes(buildLayout(data.nodes));
    }
  }, [data, setRfNodes]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
  }, []);

  return (
    <div className="flex h-[600px] rounded-lg border overflow-hidden">
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
            attributionPosition="bottom-left"
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <Controls />
            <MiniMap nodeColor={(n) => dotHex((n.data as { node: GraphNode }).node.type)} />
          </ReactFlow>
        )}
      </div>

      {selectedNodeId && (
        <NodeDetailPanel
          nodeId={selectedNodeId}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  );
}
