'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Repeat, CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ForEachNodeData } from '../types';

// Status icon component
function StatusIcon({ status }: { status?: ForEachNodeData['status'] }) {
  switch (status) {
    case 'running':
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-500" />;
    case 'skipped':
      return <AlertCircle className="w-4 h-4 text-gray-400" />;
    default:
      return null;
  }
}

/**
 * ForEachNode - A container node for loop iterations
 *
 * Visual design:
 * - Rounded rectangle with a header bar
 * - Shows the iteration variable and collection
 * - Acts as a parent/group for nested step nodes
 * - Expandable to show contained steps
 */
function ForEachNode({ data, selected }: NodeProps<ForEachNodeData>) {
  const itemVar = data.config?.item_var || 'item';
  const items = data.config?.items || '[]';
  const nestedStepCount = data.nestedStepCount || 0;

  // Determine if this is an expanded container or collapsed
  const isExpanded = data.isExpanded !== false;

  return (
    <div
      className={cn(
        'rounded-lg border-2 shadow-sm transition-all',
        'min-w-[280px]',
        'bg-indigo-50 dark:bg-indigo-950',
        'border-indigo-200 dark:border-indigo-800',
        selected && 'ring-2 ring-primary ring-offset-2',
        data.status === 'failed' && 'border-red-500',
        data.status === 'running' && 'border-blue-500 animate-pulse'
      )}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background"
      />

      {/* Header */}
      <div className="px-3 py-2 border-b border-indigo-200 dark:border-indigo-800 bg-indigo-100 dark:bg-indigo-900 rounded-t-md">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded text-indigo-500">
            <Repeat className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">
              {data.name || 'For Each'}
            </div>
          </div>
          <StatusIcon status={data.status} />
        </div>
        <div className="text-xs text-muted-foreground font-mono mt-1">
          for <span className="text-indigo-600 dark:text-indigo-400">{itemVar}</span> in{' '}
          <span className="text-indigo-600 dark:text-indigo-400">
            {items.length > 20 ? items.substring(0, 20) + '...' : items}
          </span>
        </div>
      </div>

      {/* Body - Container for nested steps */}
      <div
        className={cn(
          'p-3 transition-all',
          isExpanded ? 'min-h-[100px]' : 'min-h-[40px]'
        )}
      >
        {isExpanded ? (
          <div className="border-2 border-dashed border-indigo-200 dark:border-indigo-700 rounded-lg p-4 min-h-[80px] flex items-center justify-center">
            {nestedStepCount > 0 ? (
              <div className="text-sm text-muted-foreground">
                {nestedStepCount} step{nestedStepCount !== 1 ? 's' : ''} per iteration
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Drop steps here to execute for each item
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground text-center">
            {nestedStepCount} step{nestedStepCount !== 1 ? 's' : ''} (collapsed)
          </div>
        )}
      </div>

      {/* Loop iteration handle (connects back for visual loop indication) */}
      <Handle
        type="source"
        position={Position.Left}
        id="loop"
        className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-background"
        style={{ left: -6, top: '75%' }}
      />
      <div
        className="absolute text-[10px] font-medium text-indigo-600 dark:text-indigo-400"
        style={{ left: -35, top: '75%', transform: 'translateY(-50%)' }}
      >
        loop
      </div>

      {/* Output Handle (after loop completes) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="output"
        className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background"
      />
    </div>
  );
}

export default memo(ForEachNode);
