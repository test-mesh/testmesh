'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  Plus,
  Users,
  Settings,
  Crown,
  Shield,
  Edit,
  UserPlus,
  Loader2,
  MoreVertical,
  Trash2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  useWorkspaces,
  usePersonalWorkspace,
  useCreateWorkspace,
  useDeleteWorkspace,
  useUserRole,
} from '@/lib/hooks/useWorkspaces';
import type { Workspace, WorkspaceRole } from '@/lib/api/workspaces';

const ROLE_ICONS: Record<WorkspaceRole, React.ReactNode> = {
  owner: <Crown className="w-3 h-3" />,
  admin: <Shield className="w-3 h-3" />,
  editor: <Edit className="w-3 h-3" />,
  viewer: <Users className="w-3 h-3" />,
};

const ROLE_COLORS: Record<WorkspaceRole, string> = {
  owner:  'bg-yellow-400/10 text-yellow-400',
  admin:  'bg-purple-400/10 text-purple-400',
  editor: 'bg-blue-400/10 text-blue-400',
  viewer: 'bg-[#1a2d3d] text-[#4a6480]',
};

export default function WorkspacesPage() {
  const [activeTab, setActiveTab] = useState<'all' | 'personal' | 'team'>('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newWorkspaceDescription, setNewWorkspaceDescription] = useState('');

  const { data: personalWorkspace, isLoading: isLoadingPersonal } = usePersonalWorkspace();
  const { data: workspacesData, isLoading: isLoadingWorkspaces } = useWorkspaces({
    type: activeTab === 'all' ? undefined : activeTab,
  });

  const createWorkspace = useCreateWorkspace();
  const deleteWorkspace = useDeleteWorkspace();

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) return;
    await createWorkspace.mutateAsync({
      name: newWorkspaceName,
      description: newWorkspaceDescription,
      type: 'team',
    });
    setNewWorkspaceName('');
    setNewWorkspaceDescription('');
    setCreateDialogOpen(false);
  };

  const handleDeleteWorkspace = async (id: string) => {
    if (confirm('Are you sure you want to delete this workspace? This action cannot be undone.')) {
      await deleteWorkspace.mutateAsync(id);
    }
  };

  const isLoading = isLoadingPersonal || isLoadingWorkspaces;

  const TABS = [
    { value: 'all', label: 'All Workspaces' },
    { value: 'personal', label: 'Personal' },
    { value: 'team', label: 'Team' },
  ] as const;

  return (
    <div className="px-6 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-[#c8dce8] flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#3d5670]" />
            Workspaces
          </h1>
          <p className="text-xs text-[#3d5670] mt-0.5">Organize your work and collaborate with team members</p>
        </div>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <button className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors">
              <Plus className="w-3 h-3" />
              New Workspace
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Workspace</DialogTitle>
              <DialogDescription>Create a new team workspace to collaborate with others</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="ws-name">Name</Label>
                <Input id="ws-name" value={newWorkspaceName} onChange={(e) => setNewWorkspaceName(e.target.value)} placeholder="My Team Workspace" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ws-desc">Description</Label>
                <Textarea id="ws-desc" value={newWorkspaceDescription} onChange={(e) => setNewWorkspaceDescription(e.target.value)} placeholder="Optional description..." rows={3} />
              </div>
            </div>
            <DialogFooter>
              <button
                onClick={() => setCreateDialogOpen(false)}
                className="h-8 px-4 rounded-lg text-xs text-[#7fa8c8] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateWorkspace}
                disabled={!newWorkspaceName.trim() || createWorkspace.isPending}
                className="h-8 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
              >
                {createWorkspace.isPending && <Loader2 className="w-3 h-3 mr-1.5 animate-spin inline" />}
                Create
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              'h-8 px-3 rounded-lg text-xs transition-colors',
              activeTab === tab.value
                ? 'bg-teal-400/15 text-teal-400 border border-teal-400/30'
                : 'text-[#4a6480] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] hover:text-[#7fa8c8]'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-[#3d5670]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(activeTab === 'all' || activeTab === 'personal') && personalWorkspace && (
            <WorkspaceCard workspace={personalWorkspace} role="owner" isPersonal />
          )}
          {workspacesData?.workspaces
            .filter((w) => w.type === 'team')
            .map((workspace) => (
              <WorkspaceCardWithRole
                key={workspace.id}
                workspace={workspace}
                onDelete={() => handleDeleteWorkspace(workspace.id)}
              />
            ))}
          {!personalWorkspace && (!workspacesData?.workspaces || workspacesData.workspaces.length === 0) && (
            <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
              <Building2 className="w-10 h-10 mb-3 text-[#1e2d3d]" />
              <p className="text-sm text-[#3d5670] mb-1">No workspaces yet</p>
              <p className="text-[11px] text-[#2a3d52] mb-4">Create a workspace to start organizing your work</p>
              <button
                onClick={() => setCreateDialogOpen(true)}
                className="flex items-center gap-1.5 h-7 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors"
              >
                <Plus className="w-3 h-3" />Create Workspace
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WorkspaceCardWithRole({ workspace, onDelete }: { workspace: Workspace; onDelete?: () => void }) {
  const { data: roleData, isLoading } = useUserRole(workspace.id);
  const role = roleData?.role ?? 'viewer';
  return <WorkspaceCard workspace={workspace} role={role} onDelete={onDelete} isLoadingRole={isLoading} />;
}

interface WorkspaceCardProps {
  workspace: Workspace;
  role: WorkspaceRole;
  isPersonal?: boolean;
  onDelete?: () => void;
  isLoadingRole?: boolean;
}

function WorkspaceCard({ workspace, role, isPersonal, onDelete, isLoadingRole }: WorkspaceCardProps) {
  return (
    <div className="group rounded-xl bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] p-4 flex flex-col gap-3 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
            isPersonal ? 'bg-gradient-to-br from-blue-500/30 to-purple-500/30 border border-blue-500/20' : 'bg-gradient-to-br from-teal-500/20 to-emerald-500/20 border border-teal-500/20'
          )}>
            {isPersonal ? <Users className="w-4 h-4 text-blue-400" /> : <Building2 className="w-4 h-4 text-teal-400" />}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-[#c8dce8] truncate">{workspace.name}</p>
            <p className="text-[10px] text-[#4a6480] font-mono">/{workspace.slug}</p>
          </div>
        </div>

        {!isPersonal && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center justify-center h-6 w-6 rounded text-[#3d5670] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] opacity-0 group-hover:opacity-100 transition-all">
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/workspaces/${workspace.id}/settings`}>
                  <Settings className="w-4 h-4 mr-2" />Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <UserPlus className="w-4 h-4 mr-2" />Invite Members
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                <Trash2 className="w-4 h-4 mr-2" />Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {workspace.description && (
        <p className="text-[11px] text-[#4a6480] line-clamp-2">{workspace.description}</p>
      )}

      <div className="flex items-center justify-between mt-auto">
        <span className={cn('flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded capitalize', isLoadingRole ? 'bg-[#1a2d3d] text-[#3d5670]' : ROLE_COLORS[role])}>
          {isLoadingRole ? <Loader2 className="w-3 h-3 animate-spin" /> : <>{ROLE_ICONS[role]}{role}</>}
        </span>
        <Link
          href={`/workspaces/${workspace.id}/settings`}
          className="flex items-center gap-1 text-[10px] text-[#4a6480] hover:text-[#7fa8c8] transition-colors"
        >
          <Settings className="w-3 h-3" />Settings
        </Link>
      </div>
    </div>
  );
}
