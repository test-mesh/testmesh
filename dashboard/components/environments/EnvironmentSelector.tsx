'use client';

import { useState, useEffect } from 'react';
import { Check, ChevronDown, Globe, Plus, Settings } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  useEnvironments,
  useDefaultEnvironment,
  getActiveEnvironmentId,
  setActiveEnvironmentId,
} from '@/lib/hooks/useEnvironments';
import type { Environment } from '@/lib/api/environments';
import Link from 'next/link';

interface EnvironmentSelectorProps {
  className?: string;
  compact?: boolean;
  onChange?: (env: Environment | null) => void;
}

export function EnvironmentSelector({
  className,
  compact = false,
  onChange,
}: EnvironmentSelectorProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: environmentsData, isLoading } = useEnvironments();
  const { data: defaultEnv } = useDefaultEnvironment();

  const environments = environmentsData?.environments || [];

  // Load active environment from localStorage on mount
  useEffect(() => {
    setActiveId(getActiveEnvironmentId());
  }, []);

  // Find active environment
  const activeEnvironment = activeId
    ? environments.find((e) => e.id === activeId) || defaultEnv
    : defaultEnv;

  const handleSelect = (env: Environment | null) => {
    const id = env?.id || null;
    setActiveId(id);
    setActiveEnvironmentId(id);
    onChange?.(env);
  };

  if (isLoading) {
    return (
      <button
        disabled
        className={cn('flex items-center h-7 px-2.5 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-[#4a6480] opacity-50 cursor-not-allowed text-xs gap-2', className)}
      >
        <Globe className="w-3.5 h-3.5 animate-pulse" />
        {!compact && 'Loading...'}
      </button>
    );
  }

  if (environments.length === 0) {
    return (
      <Link
        href="/environments"
        className={cn('flex items-center h-7 px-2.5 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors text-xs gap-2', className)}
      >
        <Plus className="w-3.5 h-3.5" />
        {!compact && 'Add Environment'}
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex items-center justify-between h-7 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors text-xs gap-2',
            compact ? 'w-auto px-2' : 'w-full px-2.5',
            className
          )}
        >
          <div className="flex items-center gap-2 truncate">
            {activeEnvironment ? (
              <>
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: activeEnvironment.color || '#6B7280' }}
                />
                {!compact && <span className="truncate">{activeEnvironment.name}</span>}
              </>
            ) : (
              <>
                <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                {!compact && <span>No Environment</span>}
              </>
            )}
          </div>
          <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[200px]">
        <DropdownMenuLabel>Environments</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {environments.map((env) => (
          <DropdownMenuItem
            key={env.id}
            onClick={() => handleSelect(env)}
            className="flex items-center gap-2"
          >
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: env.color || '#6B7280' }}
            />
            <span className="flex-1 truncate">{env.name}</span>
            {env.is_default && (
              <span className="text-xs text-muted-foreground">default</span>
            )}
            {activeEnvironment?.id === env.id && (
              <Check className="w-4 h-4 flex-shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleSelect(null)} className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-muted-foreground" />
          <span>No Environment</span>
          {!activeEnvironment && <Check className="w-4 h-4 ml-auto" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/environments" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            <span>Manage Environments</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Export helper to get active environment variables as a map
export function useActiveEnvironmentVariables(): Record<string, string> {
  const { data: environmentsData } = useEnvironments();
  const { data: defaultEnv } = useDefaultEnvironment();

  const environments = environmentsData?.environments || [];
  const activeId = getActiveEnvironmentId();

  const activeEnvironment = activeId
    ? environments.find((e) => e.id === activeId) || defaultEnv
    : defaultEnv;

  if (!activeEnvironment?.variables) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const variable of activeEnvironment.variables) {
    if (variable.enabled) {
      result[variable.key] = variable.value;
    }
  }
  return result;
}
