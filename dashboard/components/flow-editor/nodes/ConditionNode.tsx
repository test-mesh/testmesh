'use client';

import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { GitBranch, CheckCircle2, XCircle, Loader2, AlertCircle, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConditionNodeData } from '../types';

// Status icon component
function StatusIcon({ status }: { status?: ConditionNodeData['status'] }) {
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
 * ConditionNode - A diamond-shaped decision node for conditional branching
 *
 * Visual design:
 * - Diamond shape rotated 45 degrees
 * - Input handle at top
 * - "Then" output handle on the right (true branch)
 * - "Else" output handle on the left (false branch)
 * - Shows the condition expression
 * - Hover shows full expression
 * - Branch highlights on hover
 */
function ConditionNode({ data, selected }: NodeProps<ConditionNodeData>) {
  const [hoveredBranch, setHoveredBranch] = useState<'then' | 'else' | null>(null);
  const expression = data.config?.expression || 'condition';
  const showFullExpression = expression.length > 20;

  return (
    <div className="relative group">
      {/* Input Handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background"
        style={{ top: -6 }}
      />

      {/* Diamond shape container */}
      <div
        className={cn(
          'w-[140px] h-[140px] flex items-center justify-center',
          'transform rotate-45',
          'rounded-lg border-2 shadow-md transition-all duration-200',
          'bg-gradient-to-br from-cyan-50 to-cyan-100',
          'dark:from-cyan-950 dark:to-cyan-900',
          'border-cyan-300 dark:border-cyan-700',
          selected && 'ring-2 ring-primary ring-offset-2 shadow-lg',
          data.status === 'failed' && 'border-red-500 bg-red-50 dark:bg-red-950',
          data.status === 'running' && 'border-blue-500 bg-blue-50 dark:bg-blue-950 animate-pulse',
          data.status === 'completed' && 'border-green-500',
          hoveredBranch && 'shadow-xl'
        )}
      >
        {/* Inner content (counter-rotate to keep text upright) */}
        <div className="transform -rotate-45 text-center p-2 max-w-[100px]">
          <div className="flex items-center justify-center gap-1 mb-1">
            <GitBranch className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <StatusIcon status={data.status} />
          </div>
          <div className="text-xs font-semibold text-cyan-900 dark:text-cyan-100 truncate">
            {data.name || 'Condition'}
          </div>
          <div className="text-[10px] text-cyan-700 dark:text-cyan-300 font-mono truncate mt-1">
            {expression.length > 15 ? expression.substring(0, 15) + '...' : expression}
          </div>
        </div>
      </div>

      {/* Hover tooltip with full expression */}
      {showFullExpression && (
        <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
          <div className="bg-popover text-popover-foreground px-3 py-2 rounded-md shadow-lg border text-xs font-mono max-w-xs break-words">
            {expression}
          </div>
          <div className="w-2 h-2 bg-popover border-l border-b transform rotate-45 mx-auto -mt-1"></div>
        </div>
      )}

      {/* Then branch (right) - True branch */}
      <div
        className="absolute"
        style={{ right: -45, top: '50%', transform: 'translateY(-50%)' }}
        onMouseEnter={() => setHoveredBranch('then')}
        onMouseLeave={() => setHoveredBranch(null)}
      >
        <Handle
          type="source"
          position={Position.Right}
          id="then"
          className={cn(
            '!w-4 !h-4 !border-2 !border-background transition-all',
            '!bg-green-500',
            hoveredBranch === 'then' && '!w-5 !h-5 !shadow-lg !shadow-green-500/50'
          )}
          style={{ right: -6, top: '50%' }}
        />
        <div
          className={cn(
            'flex items-center gap-1 text-[10px] font-semibold transition-all',
            'text-green-600 dark:text-green-400',
            hoveredBranch === 'then' && 'text-green-700 dark:text-green-300 scale-110'
          )}
          style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', whiteSpace: 'nowrap' }}
        >
          <Check className="w-3 h-3" />
          <span>TRUE</span>
        </div>
      </div>

      {/* Else branch (left) - False branch */}
      <div
        className="absolute"
        style={{ left: -45, top: '50%', transform: 'translateY(-50%)' }}
        onMouseEnter={() => setHoveredBranch('else')}
        onMouseLeave={() => setHoveredBranch(null)}
      >
        <Handle
          type="source"
          position={Position.Left}
          id="else"
          className={cn(
            '!w-4 !h-4 !border-2 !border-background transition-all',
            '!bg-red-500',
            hoveredBranch === 'else' && '!w-5 !h-5 !shadow-lg !shadow-red-500/50'
          )}
          style={{ left: -6, top: '50%' }}
        />
        <div
          className={cn(
            'flex items-center gap-1 text-[10px] font-semibold transition-all',
            'text-red-600 dark:text-red-400',
            hoveredBranch === 'else' && 'text-red-700 dark:text-red-300 scale-110'
          )}
          style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', whiteSpace: 'nowrap' }}
        >
          <span>FALSE</span>
          <X className="w-3 h-3" />
        </div>
      </div>

      {/* Continuation handle (bottom) - After both branches merge */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="next"
        className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background hover:!w-4 hover:!h-4 transition-all"
        style={{ bottom: -6 }}
      />
      <div className="absolute text-[9px] font-medium text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ bottom: -20, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}
      >
        continue
      </div>
    </div>
  );
}

export default memo(ConditionNode);
