'use client';

import { useState } from 'react';
import { Code, HelpCircle, CheckCircle2, AlertCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
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

function evaluateJSONPath(path: string, data: any): { success: boolean; result?: any; error?: string } {
  try {
    if (!data) {
      return { success: false, error: 'No sample data provided' };
    }

    let normalized = path.replace(/^\$\.?/, '');
    if (!normalized) {
      return { success: true, result: data };
    }

    const parts = normalized.split('.');
    let current = data;

    for (const part of parts) {
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [, prop, index] = arrayMatch;
        current = current[prop]?.[parseInt(index)];
      } else if (part.endsWith('.length')) {
        const prop = part.replace('.length', '');
        current = Array.isArray(current[prop]) ? current[prop].length : 0;
      } else {
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
                <button
                  type="button"
                  className="flex items-center justify-center h-5 w-5 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
                  onClick={() => setShowHelp(!showHelp)}
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
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

      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="$.response.body.data[0].id"
          className="font-mono text-sm"
        />
        <Code className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#4a6480] pointer-events-none" />
      </div>

      {evaluation && (
        <div className={cn(
          'p-3 rounded-lg border',
          evaluation.success
            ? 'bg-teal-400/5 border-teal-400/20'
            : 'bg-red-400/5 border-red-400/20'
        )}>
          <div className="flex items-center gap-2 mb-2">
            {evaluation.success ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-teal-400" />
                <span className="text-sm font-medium text-teal-400">Preview</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-red-400" />
                <span className="text-sm font-medium text-red-400">Error</span>
              </>
            )}
          </div>
          <pre className={cn(
            'text-xs font-mono p-2 rounded overflow-auto max-h-32',
            evaluation.success
              ? 'bg-teal-400/10 text-teal-400'
              : 'bg-red-400/10 text-red-400'
          )}>
            {evaluation.success ? formatResult(evaluation.result) : evaluation.error}
          </pre>
        </div>
      )}

      {showHelp && (
        <div className="space-y-2 p-3 border border-[#1a2332] rounded-lg bg-[#0b0f18]">
          <Label className="text-xs font-semibold text-[#c8dce8]">Common Patterns</Label>
          <div className="grid grid-cols-2 gap-2">
            {COMMON_PATTERNS.map((pattern) => (
              <TooltipProvider key={pattern.value}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onChange(pattern.value)}
                      className="flex items-center justify-start h-8 px-3 rounded border border-[#1e2d3d] bg-[#0f1923] text-xs font-mono text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
                    >
                      {pattern.label}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold">{pattern.description}</p>
                      <code className="text-xs text-[#4a6480]">{pattern.value}</code>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-[#4a6480] space-y-1">
        <p><code className="bg-[#1a2332] px-1 py-0.5 rounded text-[#7fa8c8]">$</code> - Root object</p>
        <p><code className="bg-[#1a2332] px-1 py-0.5 rounded text-[#7fa8c8]">.property</code> - Access property</p>
        <p><code className="bg-[#1a2332] px-1 py-0.5 rounded text-[#7fa8c8]">[0]</code> - Array index</p>
        <p><code className="bg-[#1a2332] px-1 py-0.5 rounded text-[#7fa8c8]">[*]</code> - All array elements</p>
        <p><code className="bg-[#1a2332] px-1 py-0.5 rounded text-[#7fa8c8]">[?(condition)]</code> - Filter</p>
        <p><code className="bg-[#1a2332] px-1 py-0.5 rounded text-[#7fa8c8]">..</code> - Recursive descent</p>
      </div>
    </div>
  );
}
