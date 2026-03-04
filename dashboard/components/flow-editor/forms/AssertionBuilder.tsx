'use client';

import { useState } from 'react';
import { Plus, Trash2, HelpCircle, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface Assertion {
  id: string;
  left: string;
  operator: string;
  right: string;
  raw?: string; // For advanced mode
}

interface AssertionBuilderProps {
  assertions: string[];
  onChange: (assertions: string[]) => void;
  className?: string;
}

const OPERATORS = [
  { value: '==', label: 'equals', description: 'Exact equality' },
  { value: '!=', label: 'not equals', description: 'Not equal' },
  { value: '>', label: 'greater than', description: 'Numeric comparison' },
  { value: '<', label: 'less than', description: 'Numeric comparison' },
  { value: '>=', label: 'greater or equal', description: 'Numeric comparison' },
  { value: '<=', label: 'less or equal', description: 'Numeric comparison' },
  { value: 'contains', label: 'contains', description: 'String contains' },
  { value: 'startsWith', label: 'starts with', description: 'String prefix' },
  { value: 'endsWith', label: 'ends with', description: 'String suffix' },
  { value: 'matches', label: 'matches regex', description: 'Regular expression' },
  { value: 'exists', label: 'exists', description: 'Value is not null/undefined' },
  { value: 'isNull', label: 'is null', description: 'Value is null' },
  { value: 'isEmpty', label: 'is empty', description: 'Empty string or array' },
  { value: 'hasLength', label: 'has length', description: 'Array/string length' },
  { value: 'isType', label: 'is type', description: 'Check value type' },
];

const COMMON_PATHS = [
  { path: 'status', description: 'HTTP status code' },
  { path: 'body', description: 'Response body' },
  { path: 'body.id', description: 'Body ID field' },
  { path: 'body.data', description: 'Body data field' },
  { path: 'body.error', description: 'Body error field' },
  { path: 'headers.content-type', description: 'Content-Type header' },
  { path: 'body.items.length', description: 'Array length' },
  { path: 'rows.length', description: 'Database rows count' },
  { path: 'rows[0]', description: 'First database row' },
];

// Parse assertion string into structured form
function parseAssertion(assertion: string): Assertion {
  const id = Math.random().toString(36).substr(2, 9);

  // Try to parse common patterns
  // Pattern: left operator right
  const patterns = [
    /^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/,
    /^(.+?)\s+contains\s+(.+)$/,
    /^(.+?)\s+startsWith\s+(.+)$/,
    /^(.+?)\s+endsWith\s+(.+)$/,
    /^(.+?)\s+matches\s+(.+)$/,
    /^(.+?)\s+exists$/,
    /^(.+?)\s+isNull$/,
    /^(.+?)\s+isEmpty$/,
    /^(.+?)\s+hasLength\s+(.+)$/,
    /^(.+?)\s+isType\s+(.+)$/,
  ];

  for (const pattern of patterns) {
    const match = assertion.match(pattern);
    if (match) {
      const [, left, opOrRight, right] = match;
      // Determine operator based on pattern
      if (pattern.source.includes('contains')) {
        return { id, left, operator: 'contains', right: opOrRight };
      }
      if (pattern.source.includes('exists')) {
        return { id, left, operator: 'exists', right: '' };
      }
      if (pattern.source.includes('isNull')) {
        return { id, left, operator: 'isNull', right: '' };
      }
      if (pattern.source.includes('isEmpty')) {
        return { id, left, operator: 'isEmpty', right: '' };
      }
      // Comparison operators
      return { id, left, operator: opOrRight, right: right || '' };
    }
  }

  // Fallback: treat as raw expression
  return { id, left: '', operator: '', right: '', raw: assertion };
}

// Convert structured assertion back to string
function assertionToString(assertion: Assertion): string {
  if (assertion.raw) return assertion.raw;

  const { left, operator, right } = assertion;
  if (!left || !operator) return '';

  // Operators that don't need right side
  if (['exists', 'isNull', 'isEmpty'].includes(operator)) {
    return `${left} ${operator}`;
  }

  // Word operators
  if (['contains', 'startsWith', 'endsWith', 'matches', 'hasLength', 'isType'].includes(operator)) {
    return `${left} ${operator} ${right}`;
  }

  // Comparison operators
  return `${left} ${operator} ${right}`;
}

export default function AssertionBuilder({
  assertions,
  onChange,
  className,
}: AssertionBuilderProps) {
  const [parsedAssertions, setParsedAssertions] = useState<Assertion[]>(() =>
    assertions.map(parseAssertion)
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateAssertions = (newParsed: Assertion[]) => {
    setParsedAssertions(newParsed);
    const strings = newParsed.map(assertionToString).filter(Boolean);
    onChange(strings);
  };

  const addAssertion = () => {
    updateAssertions([
      ...parsedAssertions,
      { id: Math.random().toString(36).substr(2, 9), left: 'status', operator: '==', right: '200' },
    ]);
  };

  const updateAssertion = (id: string, updates: Partial<Assertion>) => {
    updateAssertions(
      parsedAssertions.map((a) => (a.id === id ? { ...a, ...updates, raw: undefined } : a))
    );
  };

  const removeAssertion = (id: string) => {
    updateAssertions(parsedAssertions.filter((a) => a.id !== id));
  };

  const needsRightOperand = (operator: string) => {
    return !['exists', 'isNull', 'isEmpty'].includes(operator);
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-xs font-medium">Assertions</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="w-3 h-3 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p className="text-xs">
                  Assertions validate the step output. If any assertion fails, the step fails.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Button variant="outline" size="sm" onClick={addAssertion} className="h-6 px-2 text-xs">
          <Plus className="w-3 h-3 mr-1" />
          Add
        </Button>
      </div>

      {parsedAssertions.length === 0 ? (
        <div className="text-center py-6 border-2 border-dashed rounded-lg">
          <CheckCircle className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-xs text-muted-foreground">No assertions defined</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Click "Add" to validate step output
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {parsedAssertions.map((assertion, index) => (
            <div
              key={assertion.id}
              className="p-2 border rounded-lg bg-card space-y-2"
            >
              {assertion.raw ? (
                // Advanced/raw mode
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-[10px] text-amber-600">
                    <AlertCircle className="w-3 h-3" />
                    Advanced expression
                  </div>
                  <Input
                    value={assertion.raw}
                    onChange={(e) => updateAssertion(assertion.id, { raw: e.target.value })}
                    placeholder="Custom assertion expression"
                    className="h-7 text-xs font-mono"
                  />
                </div>
              ) : (
                // Visual builder mode
                <div className="grid grid-cols-[1fr,auto,1fr,auto] gap-1.5 items-center">
                  <div className="relative">
                    <Input
                      value={assertion.left}
                      onChange={(e) => updateAssertion(assertion.id, { left: e.target.value })}
                      placeholder="status"
                      className="h-7 text-xs font-mono pr-6"
                      list={`paths-${assertion.id}`}
                    />
                    <datalist id={`paths-${assertion.id}`}>
                      {COMMON_PATHS.map((p) => (
                        <option key={p.path} value={p.path}>
                          {p.description}
                        </option>
                      ))}
                    </datalist>
                  </div>

                  <Select
                    value={assertion.operator}
                    onValueChange={(v) => updateAssertion(assertion.id, { operator: v })}
                  >
                    <SelectTrigger className="h-7 w-24 text-[10px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATORS.map((op) => (
                        <SelectItem key={op.value} value={op.value} className="text-xs">
                          {op.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {needsRightOperand(assertion.operator) ? (
                    <Input
                      value={assertion.right}
                      onChange={(e) => updateAssertion(assertion.id, { right: e.target.value })}
                      placeholder="200"
                      className="h-7 text-xs font-mono"
                    />
                  ) : (
                    <div />
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeAssertion(assertion.id)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              )}

              {/* Preview */}
              <div className="text-[10px] text-muted-foreground font-mono bg-muted/50 px-2 py-1 rounded">
                {assertionToString(assertion) || 'Invalid assertion'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick templates */}
      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
          <span>Quick templates</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-1">
          {[
            { label: 'Status 200', assertion: 'status == 200' },
            { label: 'Status 201', assertion: 'status == 201' },
            { label: 'Has body.id', assertion: 'body.id exists' },
            { label: 'No error', assertion: 'body.error isNull' },
            { label: 'Array not empty', assertion: 'body.items.length > 0' },
            { label: 'JSON Content-Type', assertion: 'headers.content-type contains application/json' },
          ].map((template) => (
            <button
              key={template.label}
              onClick={() => {
                const parsed = parseAssertion(template.assertion);
                updateAssertions([...parsedAssertions, parsed]);
              }}
              className="block w-full text-left px-2 py-1 text-[10px] rounded hover:bg-muted transition-colors"
            >
              <span className="text-muted-foreground">+ </span>
              {template.label}
              <span className="text-muted-foreground ml-1 font-mono">({template.assertion})</span>
            </button>
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
