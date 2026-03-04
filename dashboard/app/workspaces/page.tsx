'use client';

import { useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  useWorkspaces,
  usePersonalWorkspace,
  useCreateWorkspace,
  useDeleteWorkspace,
  useUserRole,
} from '@/lib/hooks/useWorkspaces';
import type { Workspace, WorkspaceType, WorkspaceRole } from '@/lib/api/workspaces';

const ROLE_ICONS: Record<WorkspaceRole, React.ReactNode> = {
  owner: <Crown className="w-3 h-3" />,
  admin: <Shield className="w-3 h-3" />,
  editor: <Edit className="w-3 h-3" />,
  viewer: <Users className="w-3 h-3" />,
};

const ROLE_COLORS: Record<WorkspaceRole, string> = {
  owner: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  admin: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  editor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  viewer: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
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

  return (
    <div className="container max-w-6xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" />
            Workspaces
          </h1>
          <p className="text-muted-foreground">
            Organize your work and collaborate with team members
          </p>
        </div>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Workspace
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Workspace</DialogTitle>
              <DialogDescription>
                Create a new team workspace to collaborate with others
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  placeholder="My Team Workspace"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={newWorkspaceDescription}
                  onChange={(e) => setNewWorkspaceDescription(e.target.value)}
                  placeholder="Optional description..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateWorkspace}
                disabled={!newWorkspaceName.trim() || createWorkspace.isPending}
              >
                {createWorkspace.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="all">All Workspaces</TabsTrigger>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Personal workspace */}
              {(activeTab === 'all' || activeTab === 'personal') && personalWorkspace && (
                <WorkspaceCard
                  workspace={personalWorkspace}
                  role="owner"
                  isPersonal
                />
              )}

              {/* Team workspaces */}
              {workspacesData?.workspaces
                .filter((w) => w.type === 'team')
                .map((workspace) => (
                  <WorkspaceCardWithRole
                    key={workspace.id}
                    workspace={workspace}
                    onDelete={() => handleDeleteWorkspace(workspace.id)}
                  />
                ))}

              {/* Empty state */}
              {!personalWorkspace &&
                (!workspacesData?.workspaces || workspacesData.workspaces.length === 0) && (
                  <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                    <Building2 className="w-12 h-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">No workspaces yet</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Create a workspace to start organizing your work
                    </p>
                    <Button onClick={() => setCreateDialogOpen(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Workspace
                    </Button>
                  </div>
                )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Wrapper component that fetches the user's role for a workspace
function WorkspaceCardWithRole({
  workspace,
  onDelete,
}: {
  workspace: Workspace;
  onDelete?: () => void;
}) {
  const { data: roleData, isLoading } = useUserRole(workspace.id);

  // Default to viewer while loading, or if the API call fails
  const role = roleData?.role ?? 'viewer';

  return (
    <WorkspaceCard
      workspace={workspace}
      role={role}
      onDelete={onDelete}
      isLoadingRole={isLoading}
    />
  );
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
    <Card className="group hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center',
                isPersonal
                  ? 'bg-gradient-to-br from-blue-500 to-purple-500'
                  : 'bg-gradient-to-br from-green-500 to-teal-500'
              )}
            >
              {isPersonal ? (
                <Users className="w-5 h-5 text-white" />
              ) : (
                <Building2 className="w-5 h-5 text-white" />
              )}
            </div>
            <div>
              <CardTitle className="text-base">{workspace.name}</CardTitle>
              <CardDescription className="text-xs">/{workspace.slug}</CardDescription>
            </div>
          </div>

          {!isPersonal && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Invite Members
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600"
                  onClick={onDelete}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {workspace.description && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
            {workspace.description}
          </p>
        )}

        <div className="flex items-center justify-between">
          <Badge
            variant="outline"
            className={cn('flex items-center gap-1', isLoadingRole ? 'opacity-50' : ROLE_COLORS[role])}
          >
            {isLoadingRole ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <>
                {ROLE_ICONS[role]}
                {role}
              </>
            )}
          </Badge>

          {workspace.members && workspace.members.length > 0 && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Users className="w-4 h-4" />
              {workspace.members.length}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
