'use client';

import { useState, useRef, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertCircle } from 'lucide-react';
import {
  VariableContext,
  extractVariableNames,
  findUndefinedVariables,
  getVariableInfo,
  formatVariableValue,
} from '@/lib/variables';

interface URLInputProps {
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
  className?: string;
  variableContext?: VariableContext;
}

// Regex to match variables in the URL like ${VAR} or {{VAR}}
const VARIABLE_REGEX = /(\$\{[^}]+\}|\{\{[^}]+\}\})/g;

export default function URLInput({
  value,
  onChange,
  placeholder,
  className,
  variableContext = {},
}: URLInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Parse URL to extract variables
  const variables = value.match(VARIABLE_REGEX) || [];

  // Check for undefined variables
  const undefinedVars = useMemo(() => {
    return findUndefinedVariables(value, variableContext);
  }, [value, variableContext]);

  // Get variable info for tooltip
  const variableInfos = useMemo(() => {
    const names = extractVariableNames(value);
    return names.map((name) => ({
      name,
      info: getVariableInfo(name, variableContext),
      isUndefined: undefinedVars.includes(name),
    }));
  }, [value, variableContext, undefinedVars]);

  // Validate URL
  const isValidUrl = () => {
    if (!value) return true;
    // Replace variables with placeholder values for validation
    const testUrl = value.replace(VARIABLE_REGEX, 'placeholder');
    try {
      new URL(testUrl);
      return true;
    } catch {
      // Also accept relative paths
      return testUrl.startsWith('/') || testUrl.startsWith('http');
    }
  };

  const hasVariables = variables.length > 0;
  const hasUndefinedVars = undefinedVars.length > 0;
  const isValid = isValidUrl();

  return (
    <div className={cn('flex-1 relative', className)}>
      <Input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder || 'Enter request URL (e.g., https://api.example.com/users)'}
        className={cn(
          'font-mono text-sm pr-24',
          !isValid && value && 'border-destructive focus-visible:ring-destructive',
          hasVariables && !hasUndefinedVars && 'bg-blue-50/50 dark:bg-blue-950/20',
          hasUndefinedVars && 'bg-yellow-50/50 dark:bg-yellow-950/20 border-yellow-500'
        )}
      />

      {/* Variable indicator */}
      {hasVariables && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {hasUndefinedVars && (
            <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />
          )}
          <Badge
            variant={hasUndefinedVars ? 'outline' : 'secondary'}
            className={cn(
              'text-[10px] px-1.5 py-0',
              hasUndefinedVars && 'border-yellow-500 text-yellow-600'
            )}
          >
            {variables.length} var{variables.length > 1 ? 's' : ''}
          </Badge>
        </div>
      )}

      {/* Tooltip for variables */}
      {isFocused && hasVariables && (
        <div className="absolute top-full left-0 mt-1 p-2 bg-popover border rounded-lg shadow-lg z-50 text-xs min-w-[200px] max-w-[400px]">
          <div className="text-muted-foreground mb-2">Variables:</div>
          <div className="space-y-1.5">
            {variableInfos.map(({ name, info, isUndefined }, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-start gap-2 p-1.5 rounded',
                  isUndefined ? 'bg-yellow-50 dark:bg-yellow-950/30' : 'bg-muted/50'
                )}
              >
                <code
                  className={cn(
                    'px-1.5 py-0.5 rounded font-mono text-[11px]',
                    isUndefined
                      ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300'
                      : 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                  )}
                >
                  {name}
                </code>
                {info ? (
                  <span className="text-muted-foreground truncate">
                    = {formatVariableValue(info.value, 30)}
                  </span>
                ) : (
                  <span className="text-yellow-600 dark:text-yellow-400 italic">
                    not defined
                  </span>
                )}
              </div>
            ))}
          </div>
          {hasUndefinedVars && (
            <div className="mt-2 pt-2 border-t text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              <span>Some variables are not defined</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
