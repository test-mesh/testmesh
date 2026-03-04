// Flow Editor Utilities - YAML ↔ Visual Conversion
import type { Node, Edge } from 'reactflow';
import type { Step, FlowDefinition } from '@/lib/api/types';
import type {
  FlowNode,
  FlowEdge,
  FlowNodeData,
  SectionHeaderData,
  ConditionNodeData,
  ForEachNodeData,
  ActionType,
  FlowSection,
  ConversionOptions,
} from './types';
import { isFlowNodeData, isSectionHeaderData, isConditionNodeData, isForEachNodeData } from './types';

// Generate a unique ID for nodes
export function generateNodeId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Generate a unique step ID
export function generateStepId(): string {
  return `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Default configurations for each action type
export const defaultConfigs: Record<ActionType, Record<string, any>> = {
  http_request: {
    method: 'GET',
    url: '',
    headers: {},
    body: null,
  },
  database_query: {
    connection: '',
    query: '',
    params: [],
  },
  kafka_producer: {
    brokers: ['localhost:9092'],
    topic: '',
    key: '',
    payload: {},
    headers: {},
  },
  kafka_consumer: {
    brokers: ['localhost:9092'],
    topic: '',
    group_id: '',
    timeout: '10s',
    count: 1,
    from_beginning: false,
  },
  grpc_call: {
    service: '',
    method: '',
    address: '',
    request: {},
  },
  grpc_stream: {
    service: '',
    method: '',
    address: '',
    request: {},
  },
  websocket: {
    url: '',
    messages: [],
    timeout: '30s',
  },
  browser: {
    action: 'navigate',
    url: '',
    steps: [],
  },
  log: {
    message: '',
    level: 'info',
  },
  delay: {
    duration: '1s',
  },
  assert: {
    data: {},
    assertions: [],
  },
  transform: {
    input: '',
    expression: '',
    output_var: '',
  },
  condition: {
    expression: '',
    then_steps: [],
    else_steps: [],
  },
  for_each: {
    items: '',
    item_var: 'item',
    steps: [],
  },
  parallel: {
    wait_for_all: true,
    fail_fast: false,
    max_concurrent: 0,
  },
  wait_for: {
    type: 'http',
    url: '',
    timeout: '30s',
    interval: '1s',
    status_code: 200,
  },
  wait_until: {
    condition: '',
    max_duration: '5m',
    interval: '5s',
    on_timeout: 'fail',
  },
  db_poll: {
    connection: '',
    query: '',
    params: [],
    timeout: '30s',
    interval: '1s',
    condition: { type: 'row_exists' },
  },
  run_flow: {
    flow: '',
    input: {},
    inherit_env: true,
  },
  mock_server_start: {
    name: '',
    port: 5016,
    endpoints: [],
  },
  mock_server_stop: {
    name: '',
  },
  mock_server_verify: {
    name: '',
    endpoint: '',
    expected_calls: 1,
  },
  mock_server_update: {
    name: '',
    endpoint: '',
    response: {},
  },
  mock_server_reset_state: {
    name: '',
  },
  contract_generate: {
    consumer: '',
    provider: '',
    interactions: [],
  },
  contract_verify: {
    contract_id: '',
    provider_base_url: '',
  },
};

// Node layout constants
const NODE_WIDTH = 280;
const NODE_HEIGHT = 80;
const NODE_VERTICAL_GAP = 100;
const SECTION_GAP = 150;
const BRANCH_HORIZONTAL_GAP = 350; // Gap between condition branches
const CONDITION_NODE_HEIGHT = 140; // Diamond height

// Convert a Step to a FlowNode
export function stepToNode(
  step: Step,
  position: { x: number; y: number },
  section: FlowSection
): FlowNode {
  const nodeId = step.id || generateNodeId();

  // Handle condition nodes specially
  if (step.action === 'condition') {
    const data: ConditionNodeData = {
      label: step.name || step.id || 'Condition',
      stepId: step.id || nodeId,
      action: 'condition',
      name: step.name,
      description: step.description,
      config: step.config || defaultConfigs.condition || {},
      assert: step.assert,
      output: step.output,
      retry: step.retry,
      timeout: step.timeout,
    };

    return {
      id: nodeId,
      type: 'conditionNode',
      position,
      data,
    };
  }

  // Handle for_each nodes specially
  if (step.action === 'for_each') {
    const nestedSteps = step.config?.steps || [];
    const data: ForEachNodeData = {
      label: step.name || step.id || 'For Each',
      stepId: step.id || nodeId,
      action: 'for_each',
      name: step.name,
      description: step.description,
      config: step.config || defaultConfigs.for_each || {},
      assert: step.assert,
      output: step.output,
      retry: step.retry,
      timeout: step.timeout,
      nestedStepCount: nestedSteps.length,
      isExpanded: true,
    };

    return {
      id: nodeId,
      type: 'forEachNode',
      position,
      data,
    };
  }

  // Regular flow node
  const data: FlowNodeData = {
    label: step.name || step.id || step.action,
    stepId: step.id || nodeId,
    action: step.action as ActionType,
    name: step.name,
    description: step.description,
    config: step.config || defaultConfigs[step.action as ActionType] || {},
    assert: step.assert,
    output: step.output,
    retry: step.retry,
    timeout: step.timeout,
  };

  return {
    id: nodeId,
    type: 'flowNode',
    position,
    data,
  };
}

// Convert a FlowNode back to a Step
export function nodeToStep(node: FlowNode): Step {
  const data = node.data as FlowNodeData;

  const step: Step = {
    id: data.stepId,
    action: data.action,
    config: data.config,
  };

  if (data.name) step.name = data.name;
  if (data.description) step.description = data.description;
  if (data.assert && data.assert.length > 0) step.assert = data.assert;
  if (data.output && Object.keys(data.output).length > 0) step.output = data.output;
  if (data.retry) step.retry = data.retry;
  if (data.timeout) step.timeout = data.timeout;

  return step;
}

// Create edges between sequential nodes
export function createSequentialEdges(nodeIds: string[]): FlowEdge[] {
  const edges: FlowEdge[] = [];

  for (let i = 0; i < nodeIds.length - 1; i++) {
    edges.push({
      id: `edge_${nodeIds[i]}_${nodeIds[i + 1]}`,
      source: nodeIds[i],
      target: nodeIds[i + 1],
      type: 'smoothstep',
      animated: false,
    });
  }

  return edges;
}

// Helper to convert steps to nodes recursively, handling branching
interface ConversionContext {
  nodes: FlowNode[];
  edges: FlowEdge[];
  currentY: number;
  baseX: number;
  section: FlowSection;
}

function convertStepsToNodes(
  steps: Step[],
  ctx: ConversionContext
): { nodeIds: string[]; endY: number } {
  const nodeIds: string[] = [];
  let { currentY } = ctx;

  for (const step of steps) {
    const position = { x: ctx.baseX, y: currentY };

    if (step.action === 'condition') {
      // Create condition node
      const conditionNode = stepToNode(step, position, ctx.section);
      ctx.nodes.push(conditionNode);
      nodeIds.push(conditionNode.id);

      const thenSteps = step.config?.then_steps || [];
      const elseSteps = step.config?.else_steps || [];

      currentY += CONDITION_NODE_HEIGHT + NODE_VERTICAL_GAP;

      // Process then branch (right side)
      if (thenSteps.length > 0) {
        const thenCtx: ConversionContext = {
          ...ctx,
          currentY,
          baseX: ctx.baseX + BRANCH_HORIZONTAL_GAP / 2,
        };
        const thenResult = convertStepsToNodes(thenSteps, thenCtx);

        // Connect condition to first then node
        if (thenResult.nodeIds.length > 0) {
          ctx.edges.push({
            id: `edge_${conditionNode.id}_then_${thenResult.nodeIds[0]}`,
            source: conditionNode.id,
            sourceHandle: 'then',
            target: thenResult.nodeIds[0],
            type: 'smoothstep',
            label: 'true',
            labelStyle: { fill: '#22c55e', fontWeight: 500, fontSize: 10 },
            labelBgStyle: { fill: 'transparent' },
          });
        }

        currentY = Math.max(currentY, thenResult.endY);
      }

      // Process else branch (left side)
      if (elseSteps.length > 0) {
        const elseCtx: ConversionContext = {
          ...ctx,
          currentY: position.y + CONDITION_NODE_HEIGHT + NODE_VERTICAL_GAP,
          baseX: ctx.baseX - BRANCH_HORIZONTAL_GAP / 2,
        };
        const elseResult = convertStepsToNodes(elseSteps, elseCtx);

        // Connect condition to first else node
        if (elseResult.nodeIds.length > 0) {
          ctx.edges.push({
            id: `edge_${conditionNode.id}_else_${elseResult.nodeIds[0]}`,
            source: conditionNode.id,
            sourceHandle: 'else',
            target: elseResult.nodeIds[0],
            type: 'smoothstep',
            label: 'false',
            labelStyle: { fill: '#ef4444', fontWeight: 500, fontSize: 10 },
            labelBgStyle: { fill: 'transparent' },
          });
        }

        currentY = Math.max(currentY, elseResult.endY);
      }

      currentY += NODE_VERTICAL_GAP;

    } else if (step.action === 'for_each') {
      // Create for_each container node
      const forEachNode = stepToNode(step, position, ctx.section);
      ctx.nodes.push(forEachNode);
      nodeIds.push(forEachNode.id);

      // Calculate container size based on nested steps
      const nestedSteps = step.config?.steps || [];
      const containerHeight = Math.max(120, nestedSteps.length * (NODE_HEIGHT + 40) + 60);

      // Nested steps would be rendered inside the container
      // For now, we just account for the container height
      currentY += containerHeight + NODE_VERTICAL_GAP;

    } else {
      // Regular node
      const node = stepToNode(step, position, ctx.section);
      ctx.nodes.push(node);
      nodeIds.push(node.id);
      currentY += NODE_HEIGHT + NODE_VERTICAL_GAP;
    }
  }

  // Create sequential edges between nodes (excluding branching nodes which handle their own edges)
  for (let i = 0; i < nodeIds.length - 1; i++) {
    const sourceNode = ctx.nodes.find(n => n.id === nodeIds[i]);
    const targetNode = ctx.nodes.find(n => n.id === nodeIds[i + 1]);

    // Skip if source is a condition node (it has its own output handles)
    if (sourceNode && sourceNode.type === 'conditionNode') {
      // Connect from the 'next' handle (bottom) to the next node
      ctx.edges.push({
        id: `edge_${nodeIds[i]}_next_${nodeIds[i + 1]}`,
        source: nodeIds[i],
        sourceHandle: 'next',
        target: nodeIds[i + 1],
        type: 'smoothstep',
      });
    } else {
      ctx.edges.push({
        id: `edge_${nodeIds[i]}_${nodeIds[i + 1]}`,
        source: nodeIds[i],
        target: nodeIds[i + 1],
        type: 'smoothstep',
      });
    }
  }

  return { nodeIds, endY: currentY };
}

// Convert FlowDefinition to nodes and edges
export function flowDefinitionToNodesAndEdges(
  definition: FlowDefinition
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  let currentY = 50;

  // Add section label nodes (visual only)
  const sections: { name: FlowSection; steps: Step[] | undefined }[] = [
    { name: 'setup', steps: definition.setup },
    { name: 'steps', steps: definition.steps },
    { name: 'teardown', steps: definition.teardown },
  ];

  sections.forEach(({ name, steps }) => {
    if (!steps || steps.length === 0) return;

    // Add section header node
    const sectionHeaderId = `section_${name}`;
    const sectionData: SectionHeaderData = {
      label: name.charAt(0).toUpperCase() + name.slice(1),
      section: name,
    };

    nodes.push({
      id: sectionHeaderId,
      type: 'sectionHeader',
      position: { x: 300, y: currentY },
      data: sectionData,
      draggable: false,
      selectable: false,
    });

    currentY += 60;

    // Convert steps using the recursive helper
    const ctx: ConversionContext = {
      nodes,
      edges,
      currentY,
      baseX: 300,
      section: name,
    };

    const result = convertStepsToNodes(steps, ctx);
    currentY = result.endY + SECTION_GAP - NODE_VERTICAL_GAP;
  });

  return { nodes, edges };
}

// Convert nodes and edges back to FlowDefinition
export function nodesAndEdgesToFlowDefinition(
  nodes: FlowNode[],
  edges: FlowEdge[],
  existingDefinition: Partial<FlowDefinition> = {}
): FlowDefinition {
  // Filter out section headers and sort nodes by Y position
  const stepNodes = nodes
    .filter((n) => n.type === 'flowNode')
    .sort((a, b) => a.position.y - b.position.y);

  // Group nodes by section (stored in node data or determine by position)
  const setupNodes: FlowNode[] = [];
  const mainNodes: FlowNode[] = [];
  const teardownNodes: FlowNode[] = [];

  // Find section boundaries from section header nodes
  const sectionHeaders = nodes.filter((n) => n.type === 'sectionHeader');
  const setupHeader = sectionHeaders.find((n) => {
    const data = n.data as SectionHeaderData;
    return data.section === 'setup';
  });
  const stepsHeader = sectionHeaders.find((n) => {
    const data = n.data as SectionHeaderData;
    return data.section === 'steps';
  });
  const teardownHeader = sectionHeaders.find((n) => {
    const data = n.data as SectionHeaderData;
    return data.section === 'teardown';
  });

  stepNodes.forEach((node) => {
    const nodeY = node.position.y;

    // Determine section by position relative to headers
    if (teardownHeader && nodeY > teardownHeader.position.y) {
      teardownNodes.push(node);
    } else if (stepsHeader && nodeY > stepsHeader.position.y) {
      mainNodes.push(node);
    } else if (setupHeader && nodeY > setupHeader.position.y) {
      setupNodes.push(node);
    } else {
      // Default to main steps
      mainNodes.push(node);
    }
  });

  // Convert nodes to steps
  const setup = setupNodes.length > 0 ? setupNodes.map(nodeToStep) : undefined;
  const steps = mainNodes.map(nodeToStep);
  const teardown = teardownNodes.length > 0 ? teardownNodes.map(nodeToStep) : undefined;

  return {
    name: existingDefinition.name || 'Untitled Flow',
    description: existingDefinition.description || '',
    suite: existingDefinition.suite || '',
    tags: existingDefinition.tags || [],
    env: existingDefinition.env,
    setup,
    steps,
    teardown,
  };
}

// Convert FlowDefinition to YAML string
// Uses `flow:` wrapper to match standard format
export function flowDefinitionToYaml(definition: FlowDefinition): string {
  const lines: string[] = [];

  // Root wrapper
  lines.push('flow:');

  // Header (indented under flow:)
  lines.push(`  name: "${definition.name}"`);
  if (definition.description) {
    lines.push(`  description: "${definition.description}"`);
  }
  if (definition.suite) {
    lines.push(`  suite: "${definition.suite}"`);
  }
  if (definition.tags && definition.tags.length > 0) {
    lines.push(`  tags: [${definition.tags.map((t) => `"${t}"`).join(', ')}]`);
  }

  // Environment variables
  if (definition.env && Object.keys(definition.env).length > 0) {
    lines.push('');
    lines.push('  env:');
    Object.entries(definition.env).forEach(([key, value]) => {
      if (typeof value === 'string') {
        lines.push(`    ${key}: "${value}"`);
      } else {
        lines.push(`    ${key}: ${JSON.stringify(value)}`);
      }
    });
  }

  // Flow-level configuration defaults
  const defAny = definition as any;

  // Default timeout
  if (defAny.default_timeout) {
    lines.push('');
    lines.push(`  default_timeout: "${defAny.default_timeout}"`);
  }

  // Default retry
  if (defAny.default_retry) {
    lines.push('');
    lines.push('  default_retry:');
    lines.push(`    max_attempts: ${defAny.default_retry.max_attempts}`);
    lines.push(`    delay: "${defAny.default_retry.delay}"`);
    if (defAny.default_retry.backoff) {
      lines.push(`    backoff: "${defAny.default_retry.backoff}"`);
    }
  }

  // Execution settings
  if (defAny.fail_fast !== undefined) {
    lines.push('');
    lines.push(`  fail_fast: ${defAny.fail_fast}`);
  }
  if (defAny.continue_on_error !== undefined) {
    lines.push('');
    lines.push(`  continue_on_error: ${defAny.continue_on_error}`);
  }

  // Helper to convert steps to YAML (base indent is now 4 spaces under flow:)
  const stepsToYaml = (steps: Step[], indent: string = '  '): string[] => {
    const stepLines: string[] = [];

    steps.forEach((step) => {
      stepLines.push(`${indent}- id: ${step.id}`);
      stepLines.push(`${indent}  action: ${step.action}`);

      if (step.name) {
        stepLines.push(`${indent}  name: "${step.name}"`);
      }
      if (step.description) {
        stepLines.push(`${indent}  description: "${step.description}"`);
      }

      // Config
      if (step.config && Object.keys(step.config).length > 0) {
        stepLines.push(`${indent}  config:`);
        Object.entries(step.config).forEach(([key, value]) => {
          if (value === null || value === undefined) return;
          if (typeof value === 'object') {
            stepLines.push(`${indent}    ${key}: ${JSON.stringify(value)}`);
          } else if (typeof value === 'string') {
            // Handle strings with special characters
            if (value.includes('${') || value.includes('"') || value.includes('\n')) {
              stepLines.push(`${indent}    ${key}: "${value.replace(/"/g, '\\"')}"`);
            } else {
              stepLines.push(`${indent}    ${key}: "${value}"`);
            }
          } else {
            stepLines.push(`${indent}    ${key}: ${value}`);
          }
        });
      }

      // Assertions
      if (step.assert && step.assert.length > 0) {
        stepLines.push(`${indent}  assert:`);
        step.assert.forEach((assertion) => {
          stepLines.push(`${indent}    - ${assertion}`);
        });
      }

      // Output
      if (step.output && Object.keys(step.output).length > 0) {
        stepLines.push(`${indent}  output:`);
        Object.entries(step.output).forEach(([key, value]) => {
          stepLines.push(`${indent}    ${key}: "${value}"`);
        });
      }

      // Retry
      if (step.retry) {
        stepLines.push(`${indent}  retry:`);
        stepLines.push(`${indent}    max_attempts: ${step.retry.max_attempts}`);
        stepLines.push(`${indent}    delay: "${step.retry.delay}"`);
        if (step.retry.backoff) {
          stepLines.push(`${indent}    backoff: "${step.retry.backoff}"`);
        }
      }

      // Timeout
      if (step.timeout) {
        stepLines.push(`${indent}  timeout: "${step.timeout}"`);
      }

      // Comments (for collaboration)
      if ((step as any).comments && (step as any).comments.length > 0) {
        stepLines.push(`${indent}  comments:`);
        (step as any).comments.forEach((comment: any) => {
          stepLines.push(`${indent}    - id: "${comment.id}"`);
          stepLines.push(`${indent}      author: "${comment.author}"`);
          stepLines.push(`${indent}      content: "${comment.content.replace(/"/g, '\\"')}"`);
          stepLines.push(`${indent}      timestamp: "${comment.timestamp}"`);
          if (comment.edited) {
            stepLines.push(`${indent}      edited: ${comment.edited}`);
            stepLines.push(`${indent}      editedAt: "${comment.editedAt}"`);
          }
          if (comment.replies && comment.replies.length > 0) {
            stepLines.push(`${indent}      replies:`);
            comment.replies.forEach((reply: any) => {
              stepLines.push(`${indent}        - id: "${reply.id}"`);
              stepLines.push(`${indent}          author: "${reply.author}"`);
              stepLines.push(`${indent}          content: "${reply.content.replace(/"/g, '\\"')}"`);
              stepLines.push(`${indent}          timestamp: "${reply.timestamp}"`);
            });
          }
        });
      }

      stepLines.push('');
    });

    return stepLines;
  };

  // Setup steps
  if (definition.setup && definition.setup.length > 0) {
    lines.push('');
    lines.push('  setup:');
    lines.push(...stepsToYaml(definition.setup, '  '));
  }

  // Main steps
  lines.push('');
  lines.push('  steps:');
  lines.push(...stepsToYaml(definition.steps, '  '));

  // Teardown steps
  if (definition.teardown && definition.teardown.length > 0) {
    lines.push('');
    lines.push('  teardown:');
    lines.push(...stepsToYaml(definition.teardown, '  '));
  }

  return lines.join('\n');
}

// Validate a node's configuration
export function validateNodeConfig(node: FlowNode): string[] {
  const errors: string[] = [];

  if (!isFlowNodeData(node.data)) {
    return errors;
  }

  const data = node.data;

  switch (data.action) {
    case 'http_request':
      if (!data.config.url) {
        errors.push('URL is required');
      }
      if (!data.config.method) {
        errors.push('HTTP method is required');
      }
      break;

    case 'database_query':
      if (!data.config.connection) {
        errors.push('Database connection string is required');
      }
      if (!data.config.query) {
        errors.push('SQL query is required');
      }
      break;

    case 'log':
      if (!data.config.message) {
        errors.push('Log message is required');
      }
      break;

    case 'delay':
      if (!data.config.duration) {
        errors.push('Delay duration is required');
      }
      break;

    case 'assert':
      if (!data.config.expression) {
        errors.push('Assertion expression is required');
      }
      break;

    case 'transform':
      if (!data.config.expression) {
        errors.push('Transform expression is required');
      }
      if (!data.config.output_var) {
        errors.push('Output variable name is required');
      }
      break;

    case 'mock_server_start':
      if (!data.config.name) {
        errors.push('Mock server name is required');
      }
      break;

    case 'mock_server_stop':
      if (!data.config.name) {
        errors.push('Mock server name is required');
      }
      break;

    case 'contract_generate':
      if (!data.config.consumer) {
        errors.push('Consumer name is required');
      }
      if (!data.config.provider) {
        errors.push('Provider name is required');
      }
      break;

    case 'contract_verify':
      if (!data.config.contract_id) {
        errors.push('Contract ID is required');
      }
      if (!data.config.provider_base_url) {
        errors.push('Provider base URL is required');
      }
      break;
  }

  return errors;
}

// Get action category color
export function getActionColor(action: ActionType): string {
  switch (action) {
    case 'http_request':
    case 'grpc_call':
    case 'grpc_stream':
    case 'websocket':
      return 'bg-blue-500';
    case 'database_query':
    case 'db_poll':
      return 'bg-purple-500';
    case 'kafka_producer':
    case 'kafka_consumer':
      return 'bg-violet-500';
    case 'browser':
      return 'bg-amber-500';
    case 'log':
      return 'bg-gray-500';
    case 'delay':
      return 'bg-yellow-500';
    case 'assert':
      return 'bg-green-500';
    case 'transform':
      return 'bg-orange-500';
    case 'condition':
      return 'bg-cyan-500';
    case 'for_each':
      return 'bg-indigo-500';
    case 'parallel':
      return 'bg-cyan-600';
    case 'wait_for':
    case 'wait_until':
      return 'bg-fuchsia-500';
    case 'run_flow':
      return 'bg-teal-500';
    case 'mock_server_start':
    case 'mock_server_stop':
    case 'mock_server_verify':
    case 'mock_server_update':
    case 'mock_server_reset_state':
      return 'bg-pink-500';
    case 'contract_generate':
    case 'contract_verify':
      return 'bg-teal-500';
    default:
      return 'bg-gray-500';
  }
}

// Get action icon name
export function getActionIcon(action: ActionType): string {
  switch (action) {
    case 'http_request':
      return 'Globe';
    case 'grpc_call':
    case 'grpc_stream':
      return 'Network';
    case 'websocket':
      return 'Radio';
    case 'database_query':
    case 'db_poll':
      return 'Database';
    case 'kafka_producer':
    case 'kafka_consumer':
      return 'MessageSquare';
    case 'browser':
      return 'Chrome';
    case 'log':
      return 'FileText';
    case 'delay':
      return 'Clock';
    case 'assert':
      return 'CheckCircle';
    case 'transform':
      return 'Wand2';
    case 'condition':
      return 'GitBranch';
    case 'for_each':
      return 'Repeat';
    case 'parallel':
      return 'GitMerge';
    case 'wait_for':
    case 'wait_until':
      return 'Clock';
    case 'run_flow':
      return 'GitBranch';
    case 'mock_server_start':
      return 'Server';
    case 'mock_server_stop':
      return 'ServerOff';
    case 'mock_server_verify':
      return 'CheckCircle';
    case 'mock_server_update':
      return 'Edit';
    case 'mock_server_reset_state':
      return 'RotateCcw';
    case 'contract_generate':
      return 'FileCode';
    case 'contract_verify':
      return 'FileCheck';
    default:
      return 'Box';
  }
}
