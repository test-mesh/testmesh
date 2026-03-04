'use client';

import { useEffect } from 'react';
import { Building2, Check, ChevronDown, Plus, Settings, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useWorkspaces, useActiveWorkspace, usePersonalWorkspace } from '@/lib/hooks/useWorkspaces';
import Link from 'next/link';

interface WorkspaceSwitcherProps {
  className?: string;
  compact?: boolean;
}

export function WorkspaceSwitcher({ className, compact = false }: WorkspaceSwitcherProps) {
  const { data: workspacesData, isLoading: isLoadingWorkspaces } = useWorkspaces();
  const { data: personalWorkspace, isLoading: isLoadingPersonal } = usePersonalWorkspace();
  const { activeWorkspaceId, hydrated, workspace: activeWorkspace, setActiveWorkspace } = useActiveWorkspace();

  // Auto-select personal workspace only after localStorage has been read (hydrated)
  // This prevents overwriting the stored selection during the initial render
  useEffect(() => {
    if (!hydrated) return;
    if (!activeWorkspaceId && personalWorkspace && !isLoadingPersonal) {
      setActiveWorkspace(personalWorkspace.id);
    }
  }, [hydrated, activeWorkspaceId, personalWorkspace, isLoadingPersonal, setActiveWorkspace]);

  const isLoading = isLoadingWorkspaces || isLoadingPersonal;
  const workspaces = workspacesData?.workspaces ?? [];

  // Separate personal from team workspaces
  const teamWorkspaces = workspaces.filter(w => w.type === 'team');

  if (isLoading) {
    return (
      <Button
        variant="outline"
        disabled
        className={cn(compact ? 'h-8 w-8 p-0' : 'w-full', className)}
      >
        <Building2 className={cn('h-4 w-4 animate-pulse', !compact && 'mr-2')} />
        {!compact && <span className="text-muted-foreground">Loading...</span>}
      </Button>
    );
  }

  const displayName = activeWorkspace?.name || 'Select Workspace';
  const isPersonal = activeWorkspace?.type === 'personal';

  if (compact) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className={className} title={displayName}>
            {isPersonal ? (
              <User className="h-4 w-4" />
            ) : (
              <Building2 className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <WorkspaceSwitcherContent
          personalWorkspace={personalWorkspace}
          teamWorkspaces={teamWorkspaces}
          activeWorkspaceId={activeWorkspaceId}
          onSelect={setActiveWorkspace}
        />
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn('justify-between', className)}
        >
          <div className="flex items-center gap-2 truncate">
            {isPersonal ? (
              <User className="h-4 w-4 shrink-0" />
            ) : (
              <Building2 className="h-4 w-4 shrink-0" />
            )}
            <span className="truncate">{displayName}</span>
          </div>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <WorkspaceSwitcherContent
        personalWorkspace={personalWorkspace}
        teamWorkspaces={teamWorkspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSelect={setActiveWorkspace}
      />
    </DropdownMenu>
  );
}

interface WorkspaceSwitcherContentProps {
  personalWorkspace: import('@/lib/api/workspaces').Workspace | undefined;
  teamWorkspaces: import('@/lib/api/workspaces').Workspace[];
  activeWorkspaceId: string | null;
  onSelect: (id: string) => void;
}

function WorkspaceSwitcherContent({
  personalWorkspace,
  teamWorkspaces,
  activeWorkspaceId,
  onSelect,
}: WorkspaceSwitcherContentProps) {
  return (
    <DropdownMenuContent className="w-56" align="start" sideOffset={4}>
      {/* Personal Workspace */}
      <DropdownMenuGroup>
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Personal
        </DropdownMenuLabel>
        {personalWorkspace && (
          <DropdownMenuItem
            onClick={() => onSelect(personalWorkspace.id)}
            className="cursor-pointer"
          >
            <User className="mr-2 h-4 w-4" />
            <span className="truncate">{personalWorkspace.name}</span>
            {activeWorkspaceId === personalWorkspace.id && (
              <Check className="ml-auto h-4 w-4" />
            )}
          </DropdownMenuItem>
        )}
      </DropdownMenuGroup>

      {/* Team Workspaces */}
      {teamWorkspaces.length > 0 && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Team Workspaces
            </DropdownMenuLabel>
            {teamWorkspaces.map((workspace) => (
              <DropdownMenuItem
                key={workspace.id}
                onClick={() => onSelect(workspace.id)}
                className="cursor-pointer"
              >
                <Building2 className="mr-2 h-4 w-4" />
                <span className="truncate">{workspace.name}</span>
                {activeWorkspaceId === workspace.id && (
                  <Check className="ml-auto h-4 w-4" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </>
      )}

      {/* Actions */}
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem asChild>
          <Link href="/workspaces/new" className="cursor-pointer">
            <Plus className="mr-2 h-4 w-4" />
            Create Workspace
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/workspaces" className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            Manage Workspaces
          </Link>
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  );
}
