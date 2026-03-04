'use client';

import { useState } from 'react';
import { Code, HelpCircle, CheckCircle2, AlertCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface JSONPathBuilderProps {
  value: string;
  onChange: (value: string) => void;
  sampleData?: any;
  label?: string;
  className?: string;
}

// Common JSONPath patterns
const COMMON_PATTERNS = [
  { value: '$.', label: 'Root', description: 'Start from root' },
  { value: '$.*', label: 'All properties', description: 'All direct children' },
  { value: '$.items[*]', label: 'All array items', description: 'All elements in array' },
  { value: '$.items[0]', label: 'First item', description: 'First element (index 0)' },
  { value: '$.items[-1]', label: 'Last item', description: 'Last element' },
  { value: '$.items[0:3]', label: 'Slice', description: 'Elements 0-2' },
  { value: '$.items[?(@.status == "active")]', label: 'Filter', description: 'Filter by condition' },
  { value: '$..email', label: 'Recursive', description: 'All email fields at any level' },
  { value: '$.items.length', label: 'Array length', description: 'Count of items' },
  { value: '$.prices.sum()', label: 'Sum', description: 'Sum of array' },
  { value: '$.prices.avg()', label: 'Average', description: 'Average of array' },
  { value: '$.prices.min()', label: 'Min', description: 'Minimum value' },
  { value: '$.prices.max()', label: 'Max', description: 'Maximum value' },
];

// Evaluate JSONPath on sample data (simplified)
function evaluateJSONPath(path: string, data: any): { success: boolean; result?: any; error?: string } {
  try {
    if (!data) {
      return { success: false, error: 'No sample data provided' };
    }

    // Simple evaluation - remove $ prefix
    let normalized = path.replace(/^\$\.?/, '');
    if (!normalized) {
      return { success: true, result: data };
    }

    // Handle basic dot notation (very simplified)
    const parts = normalized.split('.');
    let current = data;

    for (const part of parts) {
      // Array index: items[0]
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [, prop, index] = arrayMatch;
        current = current[prop]?.[parseInt(index)];
      }
      // Array functions
      else if (part.endsWith('.length')) {
        const prop = part.replace('.length', '');
        current = Array.isArray(current[prop]) ? current[prop].length : 0;
      }
      // Simple property
      else {
        current = current[part];
      }

      if (current === undefined) {
        return { success: false, error: `Property '${part}' not found` };
      }
    }

    return { success: true, result: current };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Invalid path' };
  }
}

export default function JSONPathBuilder({
  value,
  onChange,
  sampleData,
  label,
  className,
}: JSONPathBuilderProps) {
  const [showHelp, setShowHelp] = useState(false);

  const evaluation = sampleData ? evaluateJSONPath(value, sampleData) : null;

  const handlePatternSelect = (pattern: string) => {
    onChange(pattern);
  };

  const formatResult = (result: any): string => {
    if (result === null) return 'null';
    if (result === undefined) return 'undefined';
    if (typeof result === 'object') {
      return JSON.stringify(result, null, 2);
    }
    return String(result);
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {label && <Label>{label}</Label>}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0"
                  onClick={() => setShowHelp(!showHelp)}
                >
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p className="text-xs">
                  JSONPath expressions let you extract data from nested structures.
                  Use $ for root, . for properties, [] for arrays.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Path Input */}
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="$.response.body.data[0].id"
          className="font-mono text-sm"
        />
        <Code className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      </div>

      {/* Preview with Sample Data */}
      {evaluation && (
        <div className={cn(
          'p-3 rounded-lg border',
          evaluation.success ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900' : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900'
        )}>
          <div className="flex items-center gap-2 mb-2">
            {evaluation.success ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-700 dark:text-green-400">Preview</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-sm font-medium text-red-700 dark:text-red-400">Error</span>
              </>
            )}
          </div>
          <pre className={cn(
            'text-xs font-mono p-2 rounded overflow-auto max-h-32',
            evaluation.success ? 'bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-900 dark:text-red-300'
          )}>
            {evaluation.success ? formatResult(evaluation.result) : evaluation.error}
          </pre>
        </div>
      )}

      {/* Help / Common Patterns */}
      {showHelp && (
        <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
          <Label className="text-xs font-semibold">Common Patterns</Label>
          <div className="grid grid-cols-2 gap-2">
            {COMMON_PATTERNS.map((pattern) => (
              <TooltipProvider key={pattern.value}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handlePatternSelect(pattern.value)}
                      className="justify-start text-xs h-8 font-mono"
                    >
                      {pattern.label}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold">{pattern.description}</p>
                      <code className="text-xs text-muted-foreground">{pattern.value}</code>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>
        </div>
      )}

      {/* Syntax Reference */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p><code className="bg-muted px-1 rounded">$</code> - Root object</p>
        <p><code className="bg-muted px-1 rounded">.property</code> - Access property</p>
        <p><code className="bg-muted px-1 rounded">[0]</code> - Array index</p>
        <p><code className="bg-muted px-1 rounded">[*]</code> - All array elements</p>
        <p><code className="bg-muted px-1 rounded">[?(condition)]</code> - Filter</p>
        <p><code className="bg-muted px-1 rounded">..</code> - Recursive descent</p>
      </div>
    </div>
  );
}
