'use client';

import { useState, useRef } from 'react';
import { Variable, Search, Clock, Hash, Braces, Link } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface VariablePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  variables?: Record<string, string>;
  stepOutputs?: Record<string, Record<string, unknown>>;
  className?: string;
}

interface VariableOption {
  name: string;
  type: 'env' | 'step' | 'builtin';
  path: string;
  description?: string;
}

// Built-in variables
const builtinVariables: VariableOption[] = [
  { name: 'RANDOM_ID', type: 'builtin', path: '${RANDOM_ID}', description: 'Generate a UUID' },
  { name: 'TIMESTAMP', type: 'builtin', path: '${TIMESTAMP}', description: 'Unix timestamp' },
  { name: 'ISO_TIMESTAMP', type: 'builtin', path: '${ISO_TIMESTAMP}', description: 'ISO 8601 timestamp' },
];

const COMMON_PATHS = [
  '/create', '/list', '/get/:id', '/update/:id', '/delete/:id',
  '/search', '/status', '/health',
];

function isUrlVariable(variable: VariableOption, variables: Record<string, string>): boolean {
  const nameHint = /(_URL|_BASE|_HOST|_ENDPOINT|_API|_SERVICE)$/i.test(variable.name);
  const valueHint = variable.type === 'env' && /^https?:\/\//i.test(variables[variable.name] ?? '');
  return nameHint || valueHint;
}

export default function VariablePicker({
  value,
  onChange,
  placeholder = 'Enter value or pick a variable',
  variables = {},
  stepOutputs = {},
  className,
}: VariablePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [cursorPosition, setCursorPosition] = useState<number | null>(null);
  // When a URL variable is selected, hold it here so we can show path composer
  const [pendingUrlVar, setPendingUrlVar] = useState<VariableOption | null>(null);
  const [pathInput, setPathInput] = useState('');

  // Build list of available variables
  const allVariables: VariableOption[] = [
    ...builtinVariables,
    ...Object.keys(variables).map((key) => ({
      name: key,
      type: 'env' as const,
      path: `\${${key}}`,
      description: variables[key]?.substring(0, 50),
    })),
    ...Object.entries(stepOutputs).flatMap(([stepId, outputs]) =>
      Object.keys(outputs).map((outputKey) => ({
        name: `${stepId}.${outputKey}`,
        type: 'step' as const,
        path: `\${${stepId}.${outputKey}}`,
        description: `Output from step: ${stepId}`,
      }))
    ),
  ];

  // Filter variables based on search
  const filteredVariables = allVariables.filter(
    (v) =>
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      v.description?.toLowerCase().includes(search.toLowerCase())
  );

  // Insert variable at cursor position
  const insertVariable = (variable: VariableOption) => {
    // For URL variables: show path composer instead of immediately inserting
    if (isUrlVariable(variable, variables)) {
      setPendingUrlVar(variable);
      setPathInput('');
      setSearch('');
      return;
    }
    commitInsert(variable.path);
  };

  const commitInsert = (text: string) => {
    const position = cursorPosition ?? value.length;
    const newValue = value.slice(0, position) + text + value.slice(position);
    onChange(newValue);
    setOpen(false);
    setSearch('');
    setPendingUrlVar(null);
    setPathInput('');
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const newPosition = position + text.length;
        inputRef.current.setSelectionRange(newPosition, newPosition);
      }
    }, 0);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'builtin':
        return <Clock className="w-3 h-3 text-blue-500" />;
      case 'env':
        return <Hash className="w-3 h-3 text-green-500" />;
      case 'step':
        return <Braces className="w-3 h-3 text-purple-500" />;
      default:
        return <Variable className="w-3 h-3" />;
    }
  };

  return (
    <div className={cn('relative', className)}>
      <div className="flex gap-1">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onSelect={(e) => setCursorPosition((e.target as HTMLInputElement).selectionStart)}
          placeholder={placeholder}
          className="h-8 text-sm font-mono flex-1"
        />
        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setPendingUrlVar(null); setPathInput(''); setSearch(''); } }}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              title="Insert variable"
            >
              <Variable className="w-4 h-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="end">
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search variables..."
                  className="h-7 pl-7 text-xs"
                  autoFocus
                />
              </div>
            </div>
            {pendingUrlVar ? (
              /* Path composer — shown after selecting a URL variable */
              <div className="p-3 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Link className="w-3 h-3 text-green-500" />
                  <span className="font-mono text-green-600">{pendingUrlVar.path}</span>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1.5">Append a path:</p>
                  <Input
                    autoFocus
                    value={pathInput}
                    onChange={(e) => setPathInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitInsert(pendingUrlVar.path + pathInput);
                      if (e.key === 'Escape') setPendingUrlVar(null);
                    }}
                    placeholder="/endpoint"
                    className="h-7 text-xs font-mono"
                  />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Common paths:</p>
                  <div className="flex flex-wrap gap-1">
                    {COMMON_PATHS.map((p) => (
                      <button
                        key={p}
                        onClick={() => commitInsert(pendingUrlVar.path + p)}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 border transition-colors"
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      onClick={() => commitInsert(pendingUrlVar.path)}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 border text-muted-foreground transition-colors"
                    >
                      (no path)
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="h-6 text-xs flex-1" onClick={() => commitInsert(pendingUrlVar.path + pathInput)}>
                    Insert
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setPendingUrlVar(null)}>
                    Back
                  </Button>
                </div>
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto">
              {filteredVariables.length === 0 ? (
                <div className="p-3 text-center text-xs text-muted-foreground">
                  No variables found
                </div>
              ) : (
                <div className="p-1">
                  {/* Group by type */}
                  {['builtin', 'env', 'step'].map((type) => {
                    const typeVars = filteredVariables.filter((v) => v.type === type);
                    if (typeVars.length === 0) return null;

                    return (
                      <div key={type} className="mb-2">
                        <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase">
                          {type === 'builtin' && 'Built-in'}
                          {type === 'env' && 'Environment'}
                          {type === 'step' && 'Step Outputs'}
                        </div>
                        {typeVars.map((variable) => (
                          <button
                            key={variable.path}
                            onClick={() => insertVariable(variable)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-left rounded hover:bg-muted transition-colors"
                          >
                            {getTypeIcon(variable.type)}
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-mono truncate flex items-center gap-1.5">
                                {variable.name}
                                {isUrlVariable(variable, variables) && (
                                  <span className="text-[9px] px-1 py-0 rounded bg-green-100 text-green-700 font-sans">URL</span>
                                )}
                              </div>
                              {variable.description && (
                                <div className="text-[10px] text-muted-foreground truncate">
                                  {variable.description}
                                </div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            )}
            {!pendingUrlVar && (
            <div className="p-2 border-t text-[10px] text-muted-foreground">
              Click to insert at cursor · URL vars show path composer
            </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
