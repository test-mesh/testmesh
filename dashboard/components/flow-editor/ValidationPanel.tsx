'use client';

import { useState, useMemo } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  ChevronRight,
  X,
  Filter,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { ValidationResult, ValidationIssue, ValidationSeverity } from './validation';

export interface ValidationPanelProps {
  result: ValidationResult;
  onNodeSelect?: (nodeId: string) => void;
  onClose?: () => void;
  className?: string;
}

const severityIcons: Record<ValidationSeverity, React.ElementType> = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const severityColors: Record<ValidationSeverity, { bg: string; border: string; text: string; icon: string }> = {
  error: {
    bg: 'bg-red-400/5',
    border: 'border-red-400/20',
    text: 'text-red-300',
    icon: 'text-red-400',
  },
  warning: {
    bg: 'bg-yellow-400/5',
    border: 'border-yellow-400/20',
    text: 'text-yellow-300',
    icon: 'text-yellow-400',
  },
  info: {
    bg: 'bg-teal-400/5',
    border: 'border-teal-400/20',
    text: 'text-[#7fa8c8]',
    icon: 'text-teal-400',
  },
};

export default function ValidationPanel({
  result,
  onNodeSelect,
  onClose,
  className,
}: ValidationPanelProps) {
  const [filterSeverity, setFilterSeverity] = useState<ValidationSeverity | 'all'>('all');

  const filteredIssues = useMemo(() => {
    if (filterSeverity === 'all') return result.issues;
    return result.issues.filter((issue) => issue.severity === filterSeverity);
  }, [result.issues, filterSeverity]);

  const issuesByNode = useMemo(() => {
    const grouped: Record<string, ValidationIssue[]> = { flow: [] };
    filteredIssues.forEach((issue) => {
      const key = issue.nodeId || 'flow';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(issue);
    });
    return grouped;
  }, [filteredIssues]);

  return (
    <div className={cn('flex flex-col h-full bg-[#0b0f18] border-l border-[#1a2332]', className)}>
      {/* Header */}
      <div className="p-3 border-b border-[#1a2332] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {result.valid ? (
              <>
                <CheckCircle className="h-4 w-4 text-teal-400" />
                <span className="font-semibold text-sm text-[#c8dce8]">Validation Passed</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-red-400" />
                <span className="font-semibold text-sm text-[#c8dce8]">Validation Issues</span>
              </>
            )}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="flex items-center justify-center h-6 w-6 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Summary Stats */}
        <div className="flex items-center gap-2 flex-wrap">
          {result.errorCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-400/10 text-red-400">
              <AlertCircle className="w-3 h-3" />
              {result.errorCount} {result.errorCount === 1 ? 'error' : 'errors'}
            </span>
          )}
          {result.warningCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-yellow-400/10 text-yellow-400">
              <AlertTriangle className="w-3 h-3" />
              {result.warningCount} {result.warningCount === 1 ? 'warning' : 'warnings'}
            </span>
          )}
          {result.infoCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#4a6480]">
              <Info className="w-3 h-3" />
              {result.infoCount} info
            </span>
          )}
          {result.valid && result.issues.length === 0 && (
            <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-teal-400/10 text-teal-400">
              <CheckCircle className="w-3 h-3" />
              No issues found
            </span>
          )}
        </div>

        {result.issues.length > 0 && (
          <div className="flex items-center gap-2">
            <Filter className="h-3 w-3 text-[#4a6480]" />
            <Select value={filterSeverity} onValueChange={(v: any) => setFilterSeverity(v)}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All Issues ({result.issues.length})</SelectItem>
                <SelectItem value="error" className="text-xs">Errors ({result.errorCount})</SelectItem>
                <SelectItem value="warning" className="text-xs">Warnings ({result.warningCount})</SelectItem>
                <SelectItem value="info" className="text-xs">Info ({result.infoCount})</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Issues List */}
      <div className="flex-1 overflow-y-auto p-3">
        {result.valid && result.issues.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle className="h-16 w-16 mx-auto mb-3 text-teal-400 opacity-50" />
            <p className="text-sm font-medium text-teal-400">All validations passed!</p>
            <p className="text-xs text-[#4a6480] mt-1">Your flow configuration looks good</p>
          </div>
        ) : filteredIssues.length === 0 ? (
          <div className="text-center py-12 text-[#3d5670]">
            <Filter className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No issues match the current filter</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(issuesByNode).map(([nodeKey, issues]) => {
              if (issues.length === 0) return null;
              return (
                <div key={nodeKey} className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-[#4a6480]">
                    {nodeKey === 'flow' ? (
                      <span>Flow-level Issues</span>
                    ) : (
                      <span>Node: {issues[0]?.stepId || nodeKey}</span>
                    )}
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#4a6480]">
                      {issues.length}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {issues.map((issue) => {
                      const Icon = severityIcons[issue.severity];
                      const colors = severityColors[issue.severity];
                      return (
                        <button
                          key={issue.id}
                          onClick={() => issue.nodeId && onNodeSelect?.(issue.nodeId)}
                          disabled={!issue.nodeId}
                          className={cn(
                            'w-full text-left p-3 rounded-lg border transition-colors',
                            colors.bg,
                            colors.border,
                            issue.nodeId && 'cursor-pointer hover:brightness-110'
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <Icon className={cn('w-3.5 h-3.5 mt-0.5 shrink-0', colors.icon)} />
                            <div className="flex-1 min-w-0">
                              <div className={cn('text-xs font-medium', colors.text)}>{issue.message}</div>
                              {issue.field && (
                                <div className="text-[10px] text-[#4a6480] mt-1 font-mono">Field: {issue.field}</div>
                              )}
                              {issue.suggestion && (
                                <div className="text-[10px] mt-2 flex items-start gap-1 text-[#4a6480]">
                                  <Info className="w-3 h-3 mt-0.5 shrink-0" />
                                  <span>{issue.suggestion}</span>
                                </div>
                              )}
                              {issue.nodeId && onNodeSelect && (
                                <div className="flex items-center gap-1 mt-2 text-[10px] text-[#3d5670]">
                                  <ChevronRight className="w-3 h-3" />
                                  <span>Click to navigate</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {result.issues.length > 0 && (
        <div className="p-3 border-t border-[#1a2332] bg-[#0b0f18]">
          <div className="text-[10px] text-[#4a6480]">
            {result.valid ? (
              <p className="flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-teal-400" />
                Flow can be saved despite warnings
              </p>
            ) : (
              <p className="flex items-center gap-1">
                <AlertCircle className="w-3 h-3 text-red-400" />
                Fix errors before running the flow
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
