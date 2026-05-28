'use client';

import { useState, useRef, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
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

  const variables = value.match(VARIABLE_REGEX) || [];

  const undefinedVars = useMemo(() => {
    return findUndefinedVariables(value, variableContext);
  }, [value, variableContext]);

  const variableInfos = useMemo(() => {
    const names = extractVariableNames(value);
    return names.map((name) => ({
      name,
      info: getVariableInfo(name, variableContext),
      isUndefined: undefinedVars.includes(name),
    }));
  }, [value, variableContext, undefinedVars]);

  const isValidUrl = () => {
    if (!value) return true;
    const testUrl = value.replace(VARIABLE_REGEX, 'placeholder');
    try {
      new URL(testUrl);
      return true;
    } catch {
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
          !isValid && value && 'border-red-400/50 focus-visible:ring-red-400/30',
          hasVariables && !hasUndefinedVars && 'bg-blue-400/5',
          hasUndefinedVars && 'bg-yellow-400/5 border-yellow-400/50'
        )}
      />

      {hasVariables && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {hasUndefinedVars && <AlertCircle className="w-3.5 h-3.5 text-yellow-400" />}
          <span className={cn(
            'text-[10px] px-1.5 py-0 rounded',
            hasUndefinedVars
              ? 'bg-yellow-400/10 text-yellow-400'
              : 'bg-[#1a2332] text-[#4a6480]'
          )}>
            {variables.length} var{variables.length > 1 ? 's' : ''}
          </span>
        </div>
      )}

      {isFocused && hasVariables && (
        <div className="absolute top-full left-0 mt-1 p-2 bg-[#0f1923] border border-[#1e2d3d] rounded-lg shadow-lg z-50 text-xs min-w-[200px] max-w-[400px]">
          <div className="text-[#4a6480] mb-2">Variables:</div>
          <div className="space-y-1.5">
            {variableInfos.map(({ name, info, isUndefined }, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-start gap-2 p-1.5 rounded',
                  isUndefined ? 'bg-yellow-400/5' : 'bg-[#1a2332]'
                )}
              >
                <code className={cn(
                  'px-1.5 py-0.5 rounded font-mono text-[11px]',
                  isUndefined
                    ? 'bg-yellow-400/10 text-yellow-400'
                    : 'bg-blue-400/10 text-blue-400'
                )}>
                  {name}
                </code>
                {info ? (
                  <span className="text-[#7fa8c8] truncate">= {formatVariableValue(info.value, 30)}</span>
                ) : (
                  <span className="text-yellow-400 italic">not defined</span>
                )}
              </div>
            ))}
          </div>
          {hasUndefinedVars && (
            <div className="mt-2 pt-2 border-t border-[#1a2332] text-yellow-400 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              <span>Some variables are not defined</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
