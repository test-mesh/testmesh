'use client';

import { useState, useEffect } from 'react';
import { Check, ChevronDown, Globe, Plus, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
      <Button variant="outline" size="sm" disabled className={className}>
        <Globe className="w-4 h-4 mr-2 animate-pulse" />
        {!compact && 'Loading...'}
      </Button>
    );
  }

  if (environments.length === 0) {
    return (
      <Button variant="outline" size="sm" asChild className={className}>
        <Link href="/environments">
          <Plus className="w-4 h-4 mr-2" />
          {!compact && 'Add Environment'}
        </Link>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn('justify-between', compact ? 'w-auto px-2' : 'w-full', className)}
          size="sm"
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
                <Globe className="w-4 h-4 flex-shrink-0" />
                {!compact && <span>No Environment</span>}
              </>
            )}
          </div>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
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
