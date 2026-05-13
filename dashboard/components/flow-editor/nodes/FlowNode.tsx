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
  HardDrive,
  Activity,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FlowNodeData, ActionType } from '../types';

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
  docker_run: Box,
  docker_stop: Box,
  'redis.get': Database,
  'redis.set': Database,
  'redis.del': Database,
  'redis.exists': Database,
  'minio.put': HardDrive,
  'minio.get': HardDrive,
  'minio.delete': HardDrive,
  'minio.assert': HardDrive,
  'neo4j.query': Network,
  'neo4j.assert': Network,
  'otel.inject': Activity,
  'otel.assert': Activity,
  'postgresql.query': Database,
  'postgresql.insert': Database,
  'postgresql.update': Database,
  'postgresql.delete': Database,
  'postgresql.assert': Database,
  'postgresql.execute': Database,
  'postgresql.transaction': Database,
  'postgresql.tables': Database,
  'postgresql.columns': Database,
  mock_server_configure: Settings,
};

// Short label shown in the action type badge
const actionLabels: Record<ActionType, string> = {
  http_request: 'HTTP',
  grpc_call: 'gRPC',
  grpc_stream: 'gRPC',
  websocket: 'WS',
  database_query: 'DB',
  db_poll: 'DB',
  kafka_producer: 'KAFKA',
  kafka_consumer: 'KAFKA',
  browser: 'BROWSER',
  log: 'LOG',
  delay: 'DELAY',
  assert: 'ASSERT',
  transform: 'XFORM',
  condition: 'IF',
  for_each: 'EACH',
  parallel: 'PARALLEL',
  wait_for: 'WAIT',
  wait_until: 'WAIT',
  run_flow: 'FLOW',
  mock_server_start: 'MOCK',
  mock_server_stop: 'MOCK',
  mock_server_verify: 'MOCK',
  mock_server_update: 'MOCK',
  mock_server_reset_state: 'MOCK',
  mock_server_configure: 'MOCK',
  contract_generate: 'CONTRACT',
  contract_verify: 'CONTRACT',
  docker_run: 'DOCKER',
  docker_stop: 'DOCKER',
  'redis.get': 'REDIS',
  'redis.set': 'REDIS',
  'redis.del': 'REDIS',
  'redis.exists': 'REDIS',
  'minio.put': 'MINIO',
  'minio.get': 'MINIO',
  'minio.delete': 'MINIO',
  'minio.assert': 'MINIO',
  'neo4j.query': 'NEO4J',
  'neo4j.assert': 'NEO4J',
  'otel.inject': 'OTEL',
  'otel.assert': 'OTEL',
  'postgresql.query': 'SQL',
  'postgresql.insert': 'SQL',
  'postgresql.update': 'SQL',
  'postgresql.delete': 'SQL',
  'postgresql.assert': 'SQL',
  'postgresql.execute': 'SQL',
  'postgresql.transaction': 'SQL',
  'postgresql.tables': 'SQL',
  'postgresql.columns': 'SQL',
};

// Badge color classes (dark-mode native)
const actionBadgeColors: Record<ActionType, string> = {
  http_request: 'bg-teal-500/15 text-teal-300 border-teal-500/25',
  grpc_call: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  grpc_stream: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  websocket: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  database_query: 'bg-purple-500/15 text-purple-300 border-purple-500/25',
  db_poll: 'bg-purple-500/15 text-purple-300 border-purple-500/25',
  kafka_producer: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
  kafka_consumer: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
  browser: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  log: 'bg-slate-500/15 text-slate-300 border-slate-500/25',
  delay: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/25',
  assert: 'bg-green-500/15 text-green-300 border-green-500/25',
  transform: 'bg-orange-500/15 text-orange-300 border-orange-500/25',
  condition: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
  for_each: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25',
  parallel: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
  wait_for: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/25',
  wait_until: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/25',
  run_flow: 'bg-teal-500/15 text-teal-300 border-teal-500/25',
  mock_server_start: 'bg-pink-500/15 text-pink-300 border-pink-500/25',
  mock_server_stop: 'bg-pink-500/15 text-pink-300 border-pink-500/25',
  mock_server_verify: 'bg-pink-500/15 text-pink-300 border-pink-500/25',
  mock_server_update: 'bg-pink-500/15 text-pink-300 border-pink-500/25',
  mock_server_reset_state: 'bg-pink-500/15 text-pink-300 border-pink-500/25',
  mock_server_configure: 'bg-pink-500/15 text-pink-300 border-pink-500/25',
  contract_generate: 'bg-teal-600/15 text-teal-200 border-teal-600/25',
  contract_verify: 'bg-teal-600/15 text-teal-200 border-teal-600/25',
  docker_run: 'bg-slate-600/15 text-slate-300 border-slate-600/25',
  docker_stop: 'bg-slate-600/15 text-slate-300 border-slate-600/25',
  'redis.get': 'bg-red-500/15 text-red-300 border-red-500/25',
  'redis.set': 'bg-red-500/15 text-red-300 border-red-500/25',
  'redis.del': 'bg-red-500/15 text-red-300 border-red-500/25',
  'redis.exists': 'bg-red-500/15 text-red-300 border-red-500/25',
  'minio.put': 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  'minio.get': 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  'minio.delete': 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  'minio.assert': 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  'neo4j.query': 'bg-sky-500/15 text-sky-300 border-sky-500/25',
  'neo4j.assert': 'bg-sky-500/15 text-sky-300 border-sky-500/25',
  'otel.inject': 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25',
  'otel.assert': 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25',
  'postgresql.query': 'bg-blue-600/15 text-blue-200 border-blue-600/25',
  'postgresql.insert': 'bg-blue-600/15 text-blue-200 border-blue-600/25',
  'postgresql.update': 'bg-blue-600/15 text-blue-200 border-blue-600/25',
  'postgresql.delete': 'bg-blue-600/15 text-blue-200 border-blue-600/25',
  'postgresql.assert': 'bg-blue-600/15 text-blue-200 border-blue-600/25',
  'postgresql.execute': 'bg-blue-600/15 text-blue-200 border-blue-600/25',
  'postgresql.transaction': 'bg-blue-600/15 text-blue-200 border-blue-600/25',
  'postgresql.tables': 'bg-blue-600/15 text-blue-200 border-blue-600/25',
  'postgresql.columns': 'bg-blue-600/15 text-blue-200 border-blue-600/25',
};

// Icon color matching the badge
const actionIconColors: Record<ActionType, string> = {
  http_request: 'text-teal-400',
  grpc_call: 'text-blue-400',
  grpc_stream: 'text-blue-400',
  websocket: 'text-blue-400',
  database_query: 'text-purple-400',
  db_poll: 'text-purple-400',
  kafka_producer: 'text-violet-400',
  kafka_consumer: 'text-violet-400',
  browser: 'text-amber-400',
  log: 'text-slate-400',
  delay: 'text-yellow-400',
  assert: 'text-green-400',
  transform: 'text-orange-400',
  condition: 'text-cyan-400',
  for_each: 'text-indigo-400',
  parallel: 'text-cyan-400',
  wait_for: 'text-fuchsia-400',
  wait_until: 'text-fuchsia-400',
  run_flow: 'text-teal-400',
  mock_server_start: 'text-pink-400',
  mock_server_stop: 'text-pink-400',
  mock_server_verify: 'text-pink-400',
  mock_server_update: 'text-pink-400',
  mock_server_reset_state: 'text-pink-400',
  mock_server_configure: 'text-pink-400',
  contract_generate: 'text-teal-300',
  contract_verify: 'text-teal-300',
  docker_run: 'text-slate-300',
  docker_stop: 'text-slate-300',
  'redis.get': 'text-red-400',
  'redis.set': 'text-red-400',
  'redis.del': 'text-red-400',
  'redis.exists': 'text-red-400',
  'minio.put': 'text-amber-400',
  'minio.get': 'text-amber-400',
  'minio.delete': 'text-amber-400',
  'minio.assert': 'text-amber-400',
  'neo4j.query': 'text-sky-400',
  'neo4j.assert': 'text-sky-400',
  'otel.inject': 'text-indigo-400',
  'otel.assert': 'text-indigo-400',
  'postgresql.query': 'text-blue-300',
  'postgresql.insert': 'text-blue-300',
  'postgresql.update': 'text-blue-300',
  'postgresql.delete': 'text-blue-300',
  'postgresql.assert': 'text-blue-300',
  'postgresql.execute': 'text-blue-300',
  'postgresql.transaction': 'text-blue-300',
  'postgresql.tables': 'text-blue-300',
  'postgresql.columns': 'text-blue-300',
};

function StatusIcon({ status, error, duration }: {
  status?: FlowNodeData['status'];
  error?: string;
  duration?: number;
}) {
  switch (status) {
    case 'running':
      return <Loader2 className="w-3.5 h-3.5 text-teal-400 animate-spin shrink-0" />;
    case 'completed':
      return (
        <div className="relative group/status shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
          {duration && (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 opacity-0 group-hover/status:opacity-100 transition-opacity pointer-events-none z-50">
              <div className="bg-[#0d1117] text-[#8ba8c0] border border-[#1e2d3d] px-2 py-1 rounded text-[10px] whitespace-nowrap shadow-lg">
                {duration}ms
              </div>
            </div>
          )}
        </div>
      );
    case 'failed':
      return (
        <div className="relative group/status shrink-0">
          <XCircle className="w-3.5 h-3.5 text-red-400" />
          {error && (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 opacity-0 group-hover/status:opacity-100 transition-opacity pointer-events-none z-50">
              <div className="bg-[#0d1117] text-[#8ba8c0] border border-[#1e2d3d] px-2 py-1 rounded text-[10px] whitespace-nowrap shadow-lg max-w-[200px] truncate">
                {error}
              </div>
            </div>
          )}
        </div>
      );
    case 'skipped':
      return <AlertCircle className="w-3.5 h-3.5 text-[#3a4f62] shrink-0" />;
    default:
      return null;
  }
}

// HTTP method pill colors on dark
function HttpMethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: 'text-green-400',
    POST: 'text-teal-400',
    PUT: 'text-yellow-400',
    DELETE: 'text-red-400',
    PATCH: 'text-purple-400',
    HEAD: 'text-slate-400',
    OPTIONS: 'text-slate-400',
  };
  return (
    <span className={cn('font-mono font-semibold text-[10px]', colors[method] ?? colors.GET)}>
      {method}
    </span>
  );
}

function NodeContent({ data }: { data: FlowNodeData }) {
  const { action, config } = data;

  switch (action) {
    case 'http_request':
      return (
        <div className="flex items-center gap-1.5 text-[11px] truncate mt-1">
          <HttpMethodBadge method={config.method || 'GET'} />
          <span className="truncate text-[#4a6480] font-mono">
            {config.url || 'no url'}
          </span>
        </div>
      );

    case 'database_query':
      return (
        <div className="text-[11px] text-[#4a6480] truncate font-mono mt-1">
          {config.query?.substring(0, 36) || 'no query'}
          {(config.query?.length ?? 0) > 36 ? '…' : ''}
        </div>
      );

    case 'assert':
      return (
        <div className="text-[11px] text-[#4a6480] font-mono truncate mt-1">
          {config.expression || 'no expression'}
        </div>
      );

    case 'log':
      return (
        <div className="text-[11px] text-[#4a6480] truncate mt-1">
          {config.message || 'no message'}
        </div>
      );

    case 'delay':
      return (
        <div className="text-[11px] text-[#4a6480] mt-1">
          wait {config.duration || '0s'}
        </div>
      );

    case 'transform':
      return (
        <div className="text-[11px] text-[#4a6480] truncate mt-1">
          → {config.output_var || 'output'}
        </div>
      );

    case 'condition':
      return (
        <div className="text-[11px] text-[#4a6480] font-mono truncate mt-1">
          if {config.expression || '…'}
        </div>
      );

    case 'for_each':
      return (
        <div className="text-[11px] text-[#4a6480] truncate mt-1">
          {config.item_var || 'item'} in {config.items || '[]'}
        </div>
      );

    case 'mock_server_start':
      return (
        <div className="text-[11px] text-[#4a6480] truncate mt-1">
          {config.name || 'unnamed'}{config.port ? ` :${config.port}` : ''}
        </div>
      );

    default:
      return null;
  }
}

function FlowNode({ data, selected }: NodeProps<FlowNodeData>) {
  const Icon = actionIcons[data.action] || Box;
  const label = actionLabels[data.action] || data.action;
  const badgeColor = actionBadgeColors[data.action] || 'bg-slate-500/15 text-slate-300 border-slate-500/25';
  const iconColor = actionIconColors[data.action] || 'text-slate-400';
  const executionData = (data as any).execution;

  return (
    <div
      className={cn(
        'rounded-xl border transition-all duration-150',
        'min-w-[200px] max-w-[280px]',
        'bg-[#131b26] border-[#1e2d3d]',
        'shadow-[0_4px_24px_rgba(0,0,0,0.4)]',
        selected && 'border-teal-500/60 shadow-[0_0_0_1px_rgba(45,212,191,0.3),0_4px_24px_rgba(0,0,0,0.5)]',
        data.status === 'running' && 'border-teal-500/50 shadow-[0_0_0_1px_rgba(45,212,191,0.2)]',
        data.status === 'completed' && 'border-green-500/40',
        data.status === 'failed' && 'border-red-500/40',
      )}
    >
      {/* Running progress bar */}
      {data.status === 'running' && (
        <div className="absolute top-0 left-0 right-0 h-px bg-teal-500/20 rounded-t-xl overflow-hidden">
          <div className="h-full bg-teal-400 animate-pulse w-full" />
        </div>
      )}

      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-teal-400/70 !border-0 !top-[-4px] hover:!bg-teal-300 transition-colors"
      />

      <div className="px-3 pt-2.5 pb-2.5">
        {/* Action type badge + status icon row */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-mono font-semibold uppercase tracking-wider',
              badgeColor
            )}
          >
            <Icon className={cn('w-2.5 h-2.5', iconColor)} />
            {label}
          </span>
          <StatusIcon
            status={data.status}
            error={executionData?.error}
            duration={executionData?.duration}
          />
        </div>

        {/* Node name */}
        <div className="text-[13px] font-medium text-[#c8dce8] truncate leading-snug">
          {data.name || data.label}
        </div>

        {/* Action-specific subtitle */}
        <NodeContent data={data} />

        {/* Error box */}
        {data.status === 'failed' && executionData?.error && (
          <div className="mt-2 px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
            <div className="text-[10px] text-red-300 font-mono line-clamp-2">
              {executionData.error}
            </div>
          </div>
        )}

        {/* Meta badges */}
        {(data.assert?.length || data.output || data.retry) && (
          <div className="flex items-center gap-1 mt-2 flex-wrap">
            {data.assert && data.assert.length > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">
                {data.assert.length} assert{data.assert.length > 1 ? 's' : ''}
              </span>
            )}
            {data.output && Object.keys(data.output).length > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20">
                {Object.keys(data.output).length} out
              </span>
            )}
            {data.retry && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                ×{data.retry.max_attempts}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-teal-400/70 !border-0 !bottom-[-4px] hover:!bg-teal-300 transition-colors"
      />
    </div>
  );
}

export default memo(FlowNode);
