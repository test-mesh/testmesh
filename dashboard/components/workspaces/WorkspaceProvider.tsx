'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { getPersonalWorkspace, type Workspace } from '@/lib/api/workspaces';
import {
  getActiveWorkspaceId,
  setActiveWorkspaceId,
} from '@/lib/hooks/useWorkspaces';

// Pages that don't require workspace context
const NO_WORKSPACE_PATHS = ['/login', '/login/callback'];

interface WorkspaceContextValue {
  activeWorkspaceId: string | null;
  workspace: Workspace | null;
  isLoading: boolean;
  setActiveWorkspace: (id: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspaceContext() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspaceContext must be used within WorkspaceProvider');
  }
  return context;
}

interface WorkspaceProviderProps {
  children: ReactNode;
}

export function WorkspaceProvider({ children }: WorkspaceProviderProps) {
  const [activeWorkspaceId, setActiveId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();
  const pathname = usePathname();

  // Check if current page requires workspace
  const requiresWorkspace = !NO_WORKSPACE_PATHS.some(path => pathname.startsWith(path));

  // Initialize workspace on mount
  useEffect(() => {
    async function initWorkspace() {
      // Skip initialization for pages that don't need workspace
      if (!requiresWorkspace) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      // Check localStorage first
      let workspaceId = getActiveWorkspaceId();

      if (!workspaceId) {
        // No active workspace - fetch personal workspace
        try {
          const personal = await getPersonalWorkspace();
          workspaceId = personal.id;
          setActiveWorkspaceId(personal.id);
          setWorkspace(personal);
        } catch (error) {
          console.error('Failed to get personal workspace:', error);
        }
      }

      setActiveId(workspaceId);
      setIsLoading(false);
    }

    initWorkspace();
  }, [requiresWorkspace]);

  // Listen for workspace changes
  useEffect(() => {
    const handleWorkspaceChange = (event: CustomEvent<{ workspaceId: string }>) => {
      setActiveId(event.detail.workspaceId);
      // Invalidate workspace-scoped queries
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['environments'] });
    };

    window.addEventListener('workspace-changed', handleWorkspaceChange as EventListener);
    return () => {
      window.removeEventListener('workspace-changed', handleWorkspaceChange as EventListener);
    };
  }, [queryClient]);

  const setActiveWorkspace = (id: string) => {
    setActiveWorkspaceId(id);
    setActiveId(id);
  };

  // Show loading state while initializing workspace (only for pages that need it)
  if (isLoading && requiresWorkspace) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <WorkspaceContext.Provider
      value={{
        activeWorkspaceId,
        workspace,
        isLoading,
        setActiveWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}
