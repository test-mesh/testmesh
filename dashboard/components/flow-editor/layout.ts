// Auto-layout utilities for flow graph
import type { Node, Edge } from 'reactflow';
import type { FlowNode, FlowNodeData, ConditionNodeData, ForEachNodeData } from './types';
import { isConditionNodeData, isForEachNodeData } from './types';

export interface LayoutOptions {
  direction?: 'TB' | 'LR'; // Top-to-bottom or Left-to-right
  nodeSpacing?: number;
  rankSpacing?: number;
  branchSpacing?: number;
}

const DEFAULT_OPTIONS: Required<LayoutOptions> = {
  direction: 'TB',
  nodeSpacing: 80, // Horizontal spacing between nodes at same level
  rankSpacing: 120, // Vertical spacing between levels
  branchSpacing: 200, // Spacing for condition branches
};

interface NodeWithRank {
  node: FlowNode;
  rank: number;
  column: number;
  branch?: 'then' | 'else' | 'main';
}

/**
 * Auto-layout algorithm using hierarchical layering
 *
 * Algorithm steps:
 * 1. Assign ranks (layers) to each node based on dependencies
 * 2. Order nodes within each rank to minimize edge crossings
 * 3. Assign X,Y coordinates based on rank and column
 * 4. Handle special cases (condition branches, parallel groups)
 */
export function autoLayout(
  nodes: FlowNode[],
  edges: Edge[],
  options: LayoutOptions = {}
): FlowNode[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (nodes.length === 0) return nodes;

  // Build adjacency lists for graph traversal
  const { incomingEdges, outgoingEdges } = buildAdjacencyLists(edges);

  // Step 1: Assign ranks to nodes
  const rankedNodes = assignRanks(nodes, incomingEdges, outgoingEdges);

  // Step 2: Group nodes by rank
  const rankGroups = groupByRank(rankedNodes);

  // Step 3: Order nodes within each rank
  const orderedRanks = orderNodesInRanks(rankGroups, edges);

  // Step 4: Calculate positions
  const positionedNodes = calculatePositions(orderedRanks, opts);

  return positionedNodes;
}

/**
 * Build adjacency lists for efficient graph traversal
 */
function buildAdjacencyLists(edges: Edge[]) {
  const incomingEdges = new Map<string, Edge[]>();
  const outgoingEdges = new Map<string, Edge[]>();

  edges.forEach((edge) => {
    // Outgoing edges
    if (!outgoingEdges.has(edge.source)) {
      outgoingEdges.set(edge.source, []);
    }
    outgoingEdges.get(edge.source)!.push(edge);

    // Incoming edges
    if (!incomingEdges.has(edge.target)) {
      incomingEdges.set(edge.target, []);
    }
    incomingEdges.get(edge.target)!.push(edge);
  });

  return { incomingEdges, outgoingEdges };
}

/**
 * Assign rank (layer) to each node using longest path algorithm
 */
function assignRanks(
  nodes: FlowNode[],
  incomingEdges: Map<string, Edge[]>,
  outgoingEdges: Map<string, Edge[]>
): NodeWithRank[] {
  const ranks = new Map<string, number>();
  const visited = new Set<string>();

  // Find root nodes (no incoming edges)
  const rootNodes = nodes.filter(
    (node) => !incomingEdges.has(node.id) || incomingEdges.get(node.id)!.length === 0
  );

  // Assign rank 0 to root nodes
  rootNodes.forEach((node) => {
    ranks.set(node.id, 0);
  });

  // BFS traversal to assign ranks
  const queue = [...rootNodes.map((n) => n.id)];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;

    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const currentRank = ranks.get(nodeId) || 0;
    const outgoing = outgoingEdges.get(nodeId) || [];

    outgoing.forEach((edge) => {
      const targetId = edge.target;
      const newRank = currentRank + 1;

      // Use maximum rank if node has multiple incoming edges
      const existingRank = ranks.get(targetId);
      if (existingRank === undefined || newRank > existingRank) {
        ranks.set(targetId, newRank);
      }

      if (!visited.has(targetId)) {
        queue.push(targetId);
      }
    });
  }

  // Handle isolated nodes (no edges)
  nodes.forEach((node) => {
    if (!ranks.has(node.id)) {
      ranks.set(node.id, 0);
    }
  });

  // Create ranked node list
  return nodes.map((node) => ({
    node,
    rank: ranks.get(node.id) || 0,
    column: 0,
    branch: 'main' as const,
  }));
}

/**
 * Group nodes by their rank
 */
function groupByRank(rankedNodes: NodeWithRank[]): Map<number, NodeWithRank[]> {
  const groups = new Map<number, NodeWithRank[]>();

  rankedNodes.forEach((rn) => {
    if (!groups.has(rn.rank)) {
      groups.set(rn.rank, []);
    }
    groups.get(rn.rank)!.push(rn);
  });

  return groups;
}

/**
 * Order nodes within each rank to minimize edge crossings
 * Uses barycenter heuristic
 */
function orderNodesInRanks(
  rankGroups: Map<number, NodeWithRank[]>,
  edges: Edge[]
): Map<number, NodeWithRank[]> {
  const orderedGroups = new Map<number, NodeWithRank[]>();
  const ranks = Array.from(rankGroups.keys()).sort((a, b) => a - b);

  ranks.forEach((rank) => {
    const nodesInRank = rankGroups.get(rank)!;

    if (rank === 0) {
      // First rank: order alphabetically by label
      const ordered = nodesInRank.sort((a, b) => {
        const labelA = (a.node.data as FlowNodeData).label || '';
        const labelB = (b.node.data as FlowNodeData).label || '';
        return labelA.localeCompare(labelB);
      });

      // Assign columns
      ordered.forEach((node, idx) => {
        node.column = idx;
      });

      orderedGroups.set(rank, ordered);
    } else {
      // Calculate barycenter for each node based on parent positions
      const barycenters = nodesInRank.map((rn) => {
        const incomingEdges = edges.filter((e) => e.target === rn.node.id);

        if (incomingEdges.length === 0) {
          return { node: rn, barycenter: 0 };
        }

        // Find parent nodes' columns
        const parentColumns = incomingEdges
          .map((e) => {
            const parentRank = rank - 1;
            const parentNodes = orderedGroups.get(parentRank) || [];
            const parentNode = parentNodes.find((n) => n.node.id === e.source);
            return parentNode?.column ?? 0;
          })
          .filter((col) => col !== undefined);

        const barycenter =
          parentColumns.length > 0
            ? parentColumns.reduce((sum, col) => sum + col, 0) / parentColumns.length
            : 0;

        return { node: rn, barycenter };
      });

      // Sort by barycenter
      const ordered = barycenters
        .sort((a, b) => a.barycenter - b.barycenter)
        .map((bc) => bc.node);

      // Assign columns
      ordered.forEach((node, idx) => {
        node.column = idx;
      });

      orderedGroups.set(rank, ordered);
    }
  });

  return orderedGroups;
}

/**
 * Calculate final X,Y positions for nodes
 */
function calculatePositions(
  orderedRanks: Map<number, NodeWithRank[]>,
  options: Required<LayoutOptions>
): FlowNode[] {
  const positioned: FlowNode[] = [];
  const ranks = Array.from(orderedRanks.keys()).sort((a, b) => a - b);

  ranks.forEach((rank) => {
    const nodesInRank = orderedRanks.get(rank)!;
    const rankWidth = (nodesInRank.length - 1) * options.nodeSpacing;
    const startX = -rankWidth / 2; // Center the rank

    nodesInRank.forEach((rn, idx) => {
      const x = startX + idx * options.nodeSpacing;
      const y = rank * options.rankSpacing;

      // Handle special node types
      let nodeWidth = 280; // Default node width
      let nodeHeight = 100; // Default node height

      if (isConditionNodeData(rn.node.data)) {
        nodeWidth = 140;
        nodeHeight = 140;
      }

      positioned.push({
        ...rn.node,
        position: { x, y },
        // Preserve existing data
        data: rn.node.data,
      });
    });
  });

  return positioned;
}

/**
 * Apply auto-layout with animation support
 * Returns updated nodes with animated position changes
 */
export function applyAutoLayout(
  nodes: FlowNode[],
  edges: Edge[],
  options: LayoutOptions = {}
): FlowNode[] {
  const layoutedNodes = autoLayout(nodes, edges, options);

  // Add animation class or smooth transition data
  return layoutedNodes.map((node) => ({
    ...node,
    // React Flow will animate position changes automatically
    position: node.position,
  }));
}

/**
 * Get bounding box of all nodes
 */
export function getNodesBoundingBox(nodes: FlowNode[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  const positions = nodes.map((n) => n.position);
  const minX = Math.min(...positions.map((p) => p.x));
  const maxX = Math.max(...positions.map((p) => p.x + 280)); // Assume avg width
  const minY = Math.min(...positions.map((p) => p.y));
  const maxY = Math.max(...positions.map((p) => p.y + 100)); // Assume avg height

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Center the flow on the canvas
 */
export function centerFlow(nodes: FlowNode[], viewportWidth: number, viewportHeight: number): FlowNode[] {
  const bbox = getNodesBoundingBox(nodes);

  const offsetX = (viewportWidth - bbox.width) / 2 - bbox.minX;
  const offsetY = 100; // Top padding

  return nodes.map((node) => ({
    ...node,
    position: {
      x: node.position.x + offsetX,
      y: node.position.y + offsetY,
    },
  }));
}
