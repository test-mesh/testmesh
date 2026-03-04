'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import {
  Globe,
  Database,
  FileText,
  Clock,
  CheckCircle,
  Wand2,
  GitBranch,
  Repeat,
  Server,
  ServerOff,
  FileCode,
  FileCheck,
  Box,
  AlertCircle,
  CheckCircle2,
  Loader2,
  XCircle,
  MessageSquare,
  GitMerge,
  Network,
  Radio,
  Chrome,
  Timer,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FlowNodeData, ActionType } from '../types';

// Icon mapping for action types
const actionIcons: Record<ActionType, React.ElementType> = {
  http_request: Globe,
  grpc_call: Network,
  grpc_stream: Network,
  websocket: Radio,
  database_query: Database,
  db_poll: Database,
  kafka_producer: MessageSquare,
  kafka_consumer: MessageSquare,
  browser: Chrome,
  log: FileText,
  delay: Clock,
  assert: CheckCircle,
  transform: Wand2,
  condition: GitBranch,
  for_each: Repeat,
  parallel: GitMerge,
  wait_for: Timer,
  wait_until: Timer,
  run_flow: GitBranch,
  mock_server_start: Server,
  mock_server_stop: ServerOff,
  mock_server_verify: CheckCircle,
  mock_server_update: Server,
  mock_server_reset_state: Server,
  contract_generate: FileCode,
  contract_verify: FileCheck,
};

// Color mapping for action types
const actionColors: Record<ActionType, { bg: string; border: string; icon: string }> = {
  http_request: {
    bg: 'bg-blue-50 dark:bg-blue-950',
    border: 'border-blue-200 dark:border-blue-800',
    icon: 'text-blue-500',
  },
  database_query: {
    bg: 'bg-purple-50 dark:bg-purple-950',
    border: 'border-purple-200 dark:border-purple-800',
    icon: 'text-purple-500',
  },
  db_poll: {
    bg: 'bg-purple-50 dark:bg-purple-950',
    border: 'border-purple-200 dark:border-purple-800',
    icon: 'text-purple-500',
  },
  log: {
    bg: 'bg-gray-50 dark:bg-gray-900',
    border: 'border-gray-200 dark:border-gray-700',
    icon: 'text-gray-500',
  },
  delay: {
    bg: 'bg-yellow-50 dark:bg-yellow-950',
    border: 'border-yellow-200 dark:border-yellow-800',
    icon: 'text-yellow-500',
  },
  assert: {
    bg: 'bg-green-50 dark:bg-green-950',
    border: 'border-green-200 dark:border-green-800',
    icon: 'text-green-500',
  },
  transform: {
    bg: 'bg-orange-50 dark:bg-orange-950',
    border: 'border-orange-200 dark:border-orange-800',
    icon: 'text-orange-500',
  },
  condition: {
    bg: 'bg-cyan-50 dark:bg-cyan-950',
    border: 'border-cyan-200 dark:border-cyan-800',
    icon: 'text-cyan-500',
  },
  for_each: {
    bg: 'bg-indigo-50 dark:bg-indigo-950',
    border: 'border-indigo-200 dark:border-indigo-800',
    icon: 'text-indigo-500',
  },
  mock_server_start: {
    bg: 'bg-pink-50 dark:bg-pink-950',
    border: 'border-pink-200 dark:border-pink-800',
    icon: 'text-pink-500',
  },
  mock_server_stop: {
    bg: 'bg-pink-50 dark:bg-pink-950',
    border: 'border-pink-200 dark:border-pink-800',
    icon: 'text-pink-500',
  },
  contract_generate: {
    bg: 'bg-teal-50 dark:bg-teal-950',
    border: 'border-teal-200 dark:border-teal-800',
    icon: 'text-teal-500',
  },
  contract_verify: {
    bg: 'bg-teal-50 dark:bg-teal-950',
    border: 'border-teal-200 dark:border-teal-800',
    icon: 'text-teal-500',
  },
  grpc_call: {
    bg: 'bg-blue-50 dark:bg-blue-950',
    border: 'border-blue-200 dark:border-blue-800',
    icon: 'text-blue-500',
  },
  grpc_stream: {
    bg: 'bg-blue-50 dark:bg-blue-950',
    border: 'border-blue-200 dark:border-blue-800',
    icon: 'text-blue-500',
  },
  websocket: {
    bg: 'bg-blue-50 dark:bg-blue-950',
    border: 'border-blue-200 dark:border-blue-800',
    icon: 'text-blue-500',
  },
  kafka_producer: {
    bg: 'bg-violet-50 dark:bg-violet-950',
    border: 'border-violet-200 dark:border-violet-800',
    icon: 'text-violet-500',
  },
  kafka_consumer: {
    bg: 'bg-violet-50 dark:bg-violet-950',
    border: 'border-violet-200 dark:border-violet-800',
    icon: 'text-violet-500',
  },
  browser: {
    bg: 'bg-amber-50 dark:bg-amber-950',
    border: 'border-amber-200 dark:border-amber-800',
    icon: 'text-amber-500',
  },
  parallel: {
    bg: 'bg-cyan-50 dark:bg-cyan-950',
    border: 'border-cyan-200 dark:border-cyan-800',
    icon: 'text-cyan-500',
  },
  wait_for: {
    bg: 'bg-fuchsia-50 dark:bg-fuchsia-950',
    border: 'border-fuchsia-200 dark:border-fuchsia-800',
    icon: 'text-fuchsia-500',
  },
  wait_until: {
    bg: 'bg-fuchsia-50 dark:bg-fuchsia-950',
    border: 'border-fuchsia-200 dark:border-fuchsia-800',
    icon: 'text-fuchsia-500',
  },
  run_flow: {
    bg: 'bg-teal-50 dark:bg-teal-950',
    border: 'border-teal-200 dark:border-teal-800',
    icon: 'text-teal-500',
  },
  mock_server_verify: {
    bg: 'bg-pink-50 dark:bg-pink-950',
    border: 'border-pink-200 dark:border-pink-800',
    icon: 'text-pink-500',
  },
  mock_server_update: {
    bg: 'bg-pink-50 dark:bg-pink-950',
    border: 'border-pink-200 dark:border-pink-800',
    icon: 'text-pink-500',
  },
  mock_server_reset_state: {
    bg: 'bg-pink-50 dark:bg-pink-950',
    border: 'border-pink-200 dark:border-pink-800',
    icon: 'text-pink-500',
  },
};

// Status icon component with tooltip
function StatusIcon({ status, error, duration }: {
  status?: FlowNodeData['status'];
  error?: string;
  duration?: number;
}) {
  let icon = null;
  let tooltip = '';

  switch (status) {
    case 'running':
      icon = <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      tooltip = 'Running...';
      break;
    case 'completed':
      icon = <CheckCircle2 className="w-4 h-4 text-green-500" />;
      tooltip = duration ? `Completed in ${duration}ms` : 'Completed';
      break;
    case 'failed':
      icon = <XCircle className="w-4 h-4 text-red-500" />;
      tooltip = error || 'Failed';
      break;
    case 'skipped':
      icon = <AlertCircle className="w-4 h-4 text-gray-400" />;
      tooltip = 'Skipped';
      break;
    default:
      return null;
  }

  return (
    <div className="relative group/status">
      {icon}
      {tooltip && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 opacity-0 group-hover/status:opacity-100 transition-opacity pointer-events-none z-50">
          <div className="bg-popover text-popover-foreground px-2 py-1 rounded text-[10px] whitespace-nowrap shadow-lg border">
            {tooltip}
          </div>
          <div className="w-1.5 h-1.5 bg-popover border-r border-b transform rotate-45 mx-auto -mt-0.5"></div>
        </div>
      )}
    </div>
  );
}

// Get display info for HTTP method
function getHttpMethodBadge(method: string) {
  const colors: Record<string, string> = {
    GET: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    PUT: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    DELETE: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    PATCH: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    HEAD: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    OPTIONS: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  };

  return colors[method] || colors.GET;
}

// Node content based on action type
function NodeContent({ data }: { data: FlowNodeData }) {
  const { action, config } = data;

  switch (action) {
    case 'http_request':
      return (
        <div className="flex items-center gap-2 text-xs truncate">
          <span
            className={cn(
              'px-1.5 py-0.5 rounded font-mono font-medium',
              getHttpMethodBadge(config.method)
            )}
          >
            {config.method}
          </span>
          <span className="truncate text-muted-foreground font-mono">
            {config.url || 'No URL'}
          </span>
        </div>
      );

    case 'database_query':
      return (
        <div className="text-xs text-muted-foreground truncate font-mono">
          {config.query?.substring(0, 40) || 'No query'}
          {config.query?.length > 40 ? '...' : ''}
        </div>
      );

    case 'log':
      return (
        <div className="text-xs text-muted-foreground truncate">
          {config.message || 'No message'}
        </div>
      );

    case 'delay':
      return (
        <div className="text-xs text-muted-foreground">
          Wait {config.duration || '0s'}
        </div>
      );

    case 'assert':
      return (
        <div className="text-xs text-muted-foreground font-mono truncate">
          {config.expression || 'No expression'}
        </div>
      );

    case 'transform':
      return (
        <div className="text-xs text-muted-foreground truncate">
          → {config.output_var || 'output'}
        </div>
      );

    case 'condition':
      return (
        <div className="text-xs text-muted-foreground font-mono truncate">
          if {config.expression || '...'}
        </div>
      );

    case 'for_each':
      return (
        <div className="text-xs text-muted-foreground truncate">
          foreach {config.item_var || 'item'} in {config.items || '[]'}
        </div>
      );

    case 'mock_server_start':
      return (
        <div className="text-xs text-muted-foreground truncate">
          Start: {config.name || 'unnamed'}
          {config.port && ` :${config.port}`}
        </div>
      );

    case 'mock_server_stop':
      return (
        <div className="text-xs text-muted-foreground truncate">
          Stop: {config.name || 'unnamed'}
        </div>
      );

    case 'contract_generate':
      return (
        <div className="text-xs text-muted-foreground truncate">
          {config.consumer || '?'} → {config.provider || '?'}
        </div>
      );

    case 'contract_verify':
      return (
        <div className="text-xs text-muted-foreground truncate">
          Verify: {config.contract_id?.substring(0, 8) || 'no contract'}
        </div>
      );

    default:
      return null;
  }
}

// Main FlowNode component
function FlowNode({ data, selected }: NodeProps<FlowNodeData>) {
  const Icon = actionIcons[data.action] || Box;
  const colors = actionColors[data.action] || actionColors.log;
  const executionData = (data as any).execution; // Execution metadata: { startTime, endTime, duration, error }

  return (
    <div
      className={cn(
        'rounded-lg border-2 shadow-md transition-all group/node',
        'min-w-[240px] max-w-[320px]',
        colors.bg,
        colors.border,
        selected && 'ring-2 ring-primary ring-offset-2 shadow-lg',
        data.status === 'failed' && 'border-red-500 shadow-red-200 dark:shadow-red-900',
        data.status === 'running' && 'border-blue-500 shadow-blue-200 dark:shadow-blue-900 animate-pulse',
        data.status === 'completed' && 'border-green-400 dark:border-green-600'
      )}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background hover:!w-4 hover:!h-4 transition-all"
      />

      {/* Execution progress bar (for running status) */}
      {data.status === 'running' && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-blue-200 dark:bg-blue-900 rounded-t-lg overflow-hidden">
          <div className="h-full bg-blue-500 animate-pulse w-full"></div>
        </div>
      )}

      <div className="p-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <div className={cn('p-1 rounded', colors.icon)}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">
              {data.name || data.label}
            </div>
          </div>
          <StatusIcon
            status={data.status}
            error={executionData?.error}
            duration={executionData?.duration}
          />
        </div>

        {/* Action-specific content */}
        <NodeContent data={data} />

        {/* Execution duration (for completed/failed steps) */}
        {executionData?.duration && (data.status === 'completed' || data.status === 'failed') && (
          <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
            <Timer className="w-3 h-3" />
            <span>{executionData.duration}ms</span>
          </div>
        )}

        {/* Error message (for failed steps) */}
        {data.status === 'failed' && executionData?.error && (
          <div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
            <div className="text-[10px] text-red-700 dark:text-red-300 font-mono line-clamp-2">
              {executionData.error}
            </div>
          </div>
        )}

        {/* Badges */}
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          {data.assert && data.assert.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
              {data.assert.length} assertion{data.assert.length > 1 ? 's' : ''}
            </span>
          )}
          {data.output && Object.keys(data.output).length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
              {Object.keys(data.output).length} output{Object.keys(data.output).length > 1 ? 's' : ''}
            </span>
          )}
          {data.retry && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
              retry ×{data.retry.max_attempts}
            </span>
          )}
          {data.comments && data.comments.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 flex items-center gap-1">
              <MessageSquare className="w-2.5 h-2.5" />
              {data.comments.length}
            </span>
          )}
        </div>
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background hover:!w-4 hover:!h-4 transition-all"
      />
    </div>
  );
}

export default memo(FlowNode);
