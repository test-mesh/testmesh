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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-900 dark:text-red-300',
    icon: 'text-red-500',
  },
  warning: {
    bg: 'bg-yellow-50 dark:bg-yellow-950/30',
    border: 'border-yellow-200 dark:border-yellow-800',
    text: 'text-yellow-900 dark:text-yellow-300',
    icon: 'text-yellow-500',
  },
  info: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-900 dark:text-blue-300',
    icon: 'text-blue-500',
  },
};

export default function ValidationPanel({
  result,
  onNodeSelect,
  onClose,
  className,
}: ValidationPanelProps) {
  const [filterSeverity, setFilterSeverity] = useState<ValidationSeverity | 'all'>('all');

  // Filter issues by severity
  const filteredIssues = useMemo(() => {
    if (filterSeverity === 'all') {
      return result.issues;
    }
    return result.issues.filter((issue) => issue.severity === filterSeverity);
  }, [result.issues, filterSeverity]);

  // Group issues by node
  const issuesByNode = useMemo(() => {
    const grouped: Record<string, ValidationIssue[]> = {
      flow: [], // Flow-level issues
    };

    filteredIssues.forEach((issue) => {
      const key = issue.nodeId || 'flow';
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(issue);
    });

    return grouped;
  }, [filteredIssues]);

  const handleIssueClick = (issue: ValidationIssue) => {
    if (issue.nodeId && onNodeSelect) {
      onNodeSelect(issue.nodeId);
    }
  };

  return (
    <div className={cn('flex flex-col h-full bg-background border-l', className)}>
      {/* Header */}
      <div className="p-3 border-b space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {result.valid ? (
              <>
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="font-semibold text-sm">Validation Passed</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-red-500" />
                <span className="font-semibold text-sm">Validation Issues</span>
              </>
            )}
          </div>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Summary Stats */}
        <div className="flex items-center gap-2 flex-wrap">
          {result.errorCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              <AlertCircle className="w-3 h-3 mr-1" />
              {result.errorCount} {result.errorCount === 1 ? 'error' : 'errors'}
            </Badge>
          )}
          {result.warningCount > 0 && (
            <Badge className="text-xs bg-yellow-500 hover:bg-yellow-600">
              <AlertTriangle className="w-3 h-3 mr-1" />
              {result.warningCount} {result.warningCount === 1 ? 'warning' : 'warnings'}
            </Badge>
          )}
          {result.infoCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              <Info className="w-3 h-3 mr-1" />
              {result.infoCount} info
            </Badge>
          )}
          {result.valid && result.issues.length === 0 && (
            <Badge variant="secondary" className="text-xs text-green-600">
              <CheckCircle className="w-3 h-3 mr-1" />
              No issues found
            </Badge>
          )}
        </div>

        {/* Filter */}
        {result.issues.length > 0 && (
          <div className="flex items-center gap-2">
            <Filter className="h-3 w-3 text-muted-foreground" />
            <Select value={filterSeverity} onValueChange={(v: any) => setFilterSeverity(v)}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  All Issues ({result.issues.length})
                </SelectItem>
                <SelectItem value="error" className="text-xs">
                  Errors ({result.errorCount})
                </SelectItem>
                <SelectItem value="warning" className="text-xs">
                  Warnings ({result.warningCount})
                </SelectItem>
                <SelectItem value="info" className="text-xs">
                  Info ({result.infoCount})
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Issues List */}
      <div className="flex-1 overflow-y-auto p-3">
        {result.valid && result.issues.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle className="h-16 w-16 mx-auto mb-3 text-green-500 opacity-50" />
            <p className="text-sm font-medium text-green-600 dark:text-green-400">
              All validations passed!
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Your flow configuration looks good
            </p>
          </div>
        ) : filteredIssues.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Filter className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No issues match the current filter</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(issuesByNode).map(([nodeKey, issues]) => {
              if (issues.length === 0) return null;

              return (
                <div key={nodeKey} className="space-y-2">
                  {/* Node Header */}
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    {nodeKey === 'flow' ? (
                      <span>Flow-level Issues</span>
                    ) : (
                      <span>
                        Node: {issues[0]?.stepId || nodeKey}
                      </span>
                    )}
                    <Badge variant="secondary" className="h-4 text-[10px] px-1">
                      {issues.length}
                    </Badge>
                  </div>

                  {/* Issues */}
                  <div className="space-y-2">
                    {issues.map((issue) => {
                      const Icon = severityIcons[issue.severity];
                      const colors = severityColors[issue.severity];

                      return (
                        <button
                          key={issue.id}
                          onClick={() => handleIssueClick(issue)}
                          disabled={!issue.nodeId}
                          className={cn(
                            'w-full text-left p-3 rounded-lg border transition-colors',
                            colors.bg,
                            colors.border,
                            issue.nodeId && 'cursor-pointer hover:brightness-95 dark:hover:brightness-110'
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', colors.icon)} />
                            <div className="flex-1 min-w-0">
                              <div className={cn('text-sm font-medium', colors.text)}>
                                {issue.message}
                              </div>
                              {issue.field && (
                                <div className="text-xs text-muted-foreground mt-1 font-mono">
                                  Field: {issue.field}
                                </div>
                              )}
                              {issue.suggestion && (
                                <div className="text-xs mt-2 flex items-start gap-1">
                                  <Info className="w-3 h-3 mt-0.5 flex-shrink-0 text-muted-foreground" />
                                  <span className="text-muted-foreground">{issue.suggestion}</span>
                                </div>
                              )}
                              {issue.nodeId && onNodeSelect && (
                                <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
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

      {/* Footer */}
      {result.issues.length > 0 && (
        <div className="p-3 border-t bg-muted/20">
          <div className="text-xs text-muted-foreground">
            {result.valid ? (
              <p>
                <CheckCircle className="w-3 h-3 inline mr-1" />
                Flow can be saved despite warnings
              </p>
            ) : (
              <p>
                <AlertCircle className="w-3 h-3 inline mr-1" />
                Fix errors before running the flow
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
