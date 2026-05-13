'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  Controls,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type NodeTypes,
  type OnConnect,
  BackgroundVariant,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { cn } from '@/lib/utils';
import type { FlowDefinition } from '@/lib/api/types';
import type { FlowNode, FlowEdge, PaletteItem, FlowNodeData, SectionHeaderData } from './types';
import { isFlowNodeData } from './types';
import {
  flowDefinitionToNodesAndEdges,
  nodesAndEdgesToFlowDefinition,
  generateNodeId,
  generateStepId,
} from './utils';

import FlowNodeComponent from './nodes/FlowNode';
import SectionHeaderNode from './nodes/SectionHeaderNode';
import ConditionNode from './nodes/ConditionNode';
import ForEachNode from './nodes/ForEachNode';

// Register custom node types
const nodeTypes: NodeTypes = {
  flowNode: FlowNodeComponent,
  sectionHeader: SectionHeaderNode,
  conditionNode: ConditionNode,
  forEachNode: ForEachNode,
};

interface FlowCanvasProps {
  definition?: FlowDefinition;
  onDefinitionChange?: (definition: FlowDefinition) => void;
  onNodeSelect?: (node: FlowNode | null) => void;
  selectedNodeId?: string | null;
  readOnly?: boolean;
  className?: string;
}

function FlowCanvasInner({
  definition,
  onDefinitionChange,
  onNodeSelect,
  selectedNodeId,
  readOnly = false,
  className,
}: FlowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // Initialize nodes and edges from definition
  useEffect(() => {
    if (definition) {
      const { nodes: initialNodes, edges: initialEdges } = flowDefinitionToNodesAndEdges(definition);
      setNodes(initialNodes);
      setEdges(initialEdges);
    }
  }, [definition, setNodes, setEdges]);

  // Handle connection (edge creation)
  const onConnect: OnConnect = useCallback(
    (params: Connection) => {
      if (readOnly) return;
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: 'smoothstep',
            animated: false,
          },
          eds
        )
      );
    },
    [setEdges, readOnly]
  );

  // Handle node selection
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: FlowNode) => {
      if (node.type === 'sectionHeader') return;
      onNodeSelect?.(node);
    },
    [onNodeSelect]
  );

  // Handle canvas click (deselect)
  const onPaneClick = useCallback(() => {
    onNodeSelect?.(null);
  }, [onNodeSelect]);

  // Handle drag over (for dropping new nodes)
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Handle drop (add new node)
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (readOnly || !reactFlowInstance) return;

      const data = event.dataTransfer.getData('application/reactflow');
      if (!data) return;

      const paletteItem: PaletteItem = JSON.parse(data);
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNodeId = generateNodeId();
      const newStepId = generateStepId();

      const nodeData: FlowNodeData = {
        label: paletteItem.label,
        stepId: newStepId,
        action: paletteItem.type,
        name: paletteItem.label,
        config: { ...paletteItem.defaultConfig },
      };

      const newNode: FlowNode = {
        id: newNodeId,
        type: 'flowNode',
        position,
        data: nodeData,
      };

      setNodes((nds) => [...nds, newNode]);

      // Auto-connect to nearest node above
      const flowNodes = nodes.filter((n) => n.type === 'flowNode');
      const nodesAbove = flowNodes
        .filter((n) => n.position.y < position.y)
        .sort((a, b) => b.position.y - a.position.y);

      if (nodesAbove.length > 0) {
        const nearestNode = nodesAbove[0];
        const newEdge: FlowEdge = {
          id: `edge_${nearestNode.id}_${newNodeId}`,
          source: nearestNode.id,
          target: newNodeId,
          type: 'smoothstep',
        };
        setEdges((eds) => [...eds, newEdge]);
      }

      // Select the new node
      onNodeSelect?.(newNode);
    },
    [reactFlowInstance, readOnly, setNodes, setEdges, nodes, onNodeSelect]
  );

  // Update definition when nodes/edges change
  useEffect(() => {
    if (nodes.length > 0 && onDefinitionChange) {
      const flowNodes = nodes.filter((n) => n.type === 'flowNode');
      if (flowNodes.length > 0) {
        const newDefinition = nodesAndEdgesToFlowDefinition(
          nodes as FlowNode[],
          edges,
          definition
        );
        // Only update if there are actual changes
        if (JSON.stringify(newDefinition.steps) !== JSON.stringify(definition?.steps)) {
          onDefinitionChange(newDefinition);
        }
      }
    }
  }, [nodes, edges]); // Intentionally excluding definition and onDefinitionChange to avoid loops

  // Handle node deletion
  const onNodesDelete = useCallback(
    (deletedNodes: FlowNode[]) => {
      // Filter out section headers from deletion
      const nodesToDelete = deletedNodes.filter((n) => n.type !== 'sectionHeader');
      if (nodesToDelete.length === 0) return;

      // Remove connected edges
      const nodeIds = new Set(nodesToDelete.map((n) => n.id));
      setEdges((eds) =>
        eds.filter((e) => !nodeIds.has(e.source) && !nodeIds.has(e.target))
      );
    },
    [setEdges]
  );

  return (
    <div ref={reactFlowWrapper} className={cn('w-full h-full bg-[#0d1117]', className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={readOnly ? undefined : onNodesChange}
        onEdgesChange={readOnly ? undefined : onEdgesChange}
        onConnect={onConnect}
        onInit={setReactFlowInstance}
        onNodeClick={onNodeClick as any}
        onPaneClick={onPaneClick}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodesDelete={onNodesDelete as any}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        snapToGrid
        snapGrid={[15, 15]}
        deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
        selectionKeyCode={null}
        multiSelectionKeyCode={readOnly ? null : 'Shift'}
        panOnScroll
        zoomOnScroll
        zoomOnPinch
        minZoom={0.25}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#2dd4bf', strokeWidth: 1.5, opacity: 0.6 },
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.2}
          color="#1a2d3d"
        />
        <Controls
          showInteractive={!readOnly}
          style={{
            background: '#131b26',
            border: '1px solid #1e2d3d',
            borderRadius: '8px',
          }}
        />
        <MiniMap
          nodeStrokeWidth={2}
          nodeColor="#1e2d3d"
          maskColor="rgba(13,17,23,0.7)"
          zoomable
          pannable
          style={{
            background: '#131b26',
            border: '1px solid #1e2d3d',
            borderRadius: '8px',
          }}
        />

        {/* Empty state panel */}
        {nodes.filter((n) => n.type === 'flowNode').length === 0 && (
          <Panel position="top-center" className="mt-20">
            <div className="text-center p-8 rounded-xl border border-dashed border-[#1e2d3d] bg-[#131b26]/80">
              <h3 className="font-semibold text-[#c8dce8] text-base mb-2">No steps yet</h3>
              <p className="text-[#4a6480] text-sm">
                Drag actions from the palette on the left to add steps
              </p>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

// Wrap with ReactFlowProvider
export default function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

// Export the update function type for external use
export type UpdateNodeDataFn = (nodeId: string, newData: Partial<FlowNodeData>) => void;
