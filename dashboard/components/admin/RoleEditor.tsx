'use client';

import { useState } from 'react';
import {
  Shield,
  Check,
  X,
  Eye,
  Edit,
  Trash2,
  Settings,
  Users,
  Workflow,
  Calendar,
  Database,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface Permission {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

interface PermissionGroup {
  id: string;
  name: string;
  icon: React.ElementType;
  permissions: Permission[];
}

interface Role {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  color: string;
  permissionGroups: PermissionGroup[];
}

interface RoleEditorProps {
  role: Role | null;
  open: boolean;
  onClose: () => void;
  onSave: (role: Role) => void;
}

const DEFAULT_PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'flows',
    name: 'Flows',
    icon: Workflow,
    permissions: [
      { id: 'flows.view', name: 'View Flows', description: 'View flow definitions', enabled: true },
      { id: 'flows.create', name: 'Create Flows', description: 'Create new flows', enabled: false },
      { id: 'flows.edit', name: 'Edit Flows', description: 'Modify existing flows', enabled: false },
      { id: 'flows.delete', name: 'Delete Flows', description: 'Delete flows', enabled: false },
      { id: 'flows.execute', name: 'Execute Flows', description: 'Run flow executions', enabled: false },
    ],
  },
  {
    id: 'users',
    name: 'Users',
    icon: Users,
    permissions: [
      { id: 'users.view', name: 'View Users', description: 'View user list', enabled: false },
      { id: 'users.invite', name: 'Invite Users', description: 'Send user invitations', enabled: false },
      { id: 'users.manage', name: 'Manage Users', description: 'Edit and delete users', enabled: false },
      { id: 'users.roles', name: 'Manage Roles', description: 'Assign and modify roles', enabled: false },
    ],
  },
  {
    id: 'schedules',
    name: 'Schedules',
    icon: Calendar,
    permissions: [
      { id: 'schedules.view', name: 'View Schedules', description: 'View scheduled runs', enabled: true },
      { id: 'schedules.create', name: 'Create Schedules', description: 'Create new schedules', enabled: false },
      { id: 'schedules.manage', name: 'Manage Schedules', description: 'Edit and delete schedules', enabled: false },
    ],
  },
  {
    id: 'admin',
    name: 'Administration',
    icon: Settings,
    permissions: [
      { id: 'admin.dashboard', name: 'Admin Dashboard', description: 'Access admin dashboard', enabled: false },
      { id: 'admin.health', name: 'System Health', description: 'View system health', enabled: false },
      { id: 'admin.settings', name: 'System Settings', description: 'Modify system settings', enabled: false },
    ],
  },
];

export function RoleEditor({ role, open, onClose, onSave }: RoleEditorProps) {
  const [name, setName] = useState(role?.name || '');
  const [description, setDescription] = useState(role?.description || '');
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>(
    role?.permissionGroups || DEFAULT_PERMISSION_GROUPS
  );
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['flows']));

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const togglePermission = (groupId: string, permissionId: string) => {
    setPermissionGroups((groups) =>
      groups.map((group) => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          permissions: group.permissions.map((perm) => {
            if (perm.id !== permissionId) return perm;
            return { ...perm, enabled: !perm.enabled };
          }),
        };
      })
    );
  };

  const toggleAllInGroup = (groupId: string, enabled: boolean) => {
    setPermissionGroups((groups) =>
      groups.map((group) => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          permissions: group.permissions.map((perm) => ({ ...perm, enabled })),
        };
      })
    );
  };

  const countEnabled = (permissions: Permission[]) =>
    permissions.filter((p) => p.enabled).length;

  const handleSave = () => {
    onSave({
      id: role?.id || crypto.randomUUID(),
      name,
      description,
      isSystem: role?.isSystem || false,
      color: role?.color || 'blue',
      permissionGroups,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            {role ? 'Edit Role' : 'Create Role'}
          </DialogTitle>
          <DialogDescription>
            Configure role permissions and access levels
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Role Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Developer"
                disabled={role?.isSystem}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this role can do"
                rows={2}
              />
            </div>
          </div>

          {/* Permissions */}
          <div className="space-y-2">
            <Label>Permissions</Label>
            <div className="border rounded-lg divide-y">
              {permissionGroups.map((group) => {
                const Icon = group.icon;
                const enabledCount = countEnabled(group.permissions);
                const allEnabled = enabledCount === group.permissions.length;
                const someEnabled = enabledCount > 0 && !allEnabled;

                return (
                  <Collapsible
                    key={group.id}
                    open={expandedGroups.has(group.id)}
                    onOpenChange={() => toggleGroup(group.id)}
                  >
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <Icon className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{group.name}</span>
                          <Badge variant="secondary" className="text-xs">
                            {enabledCount}/{group.permissions.length}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleAllInGroup(group.id, !allEnabled);
                            }}
                          >
                            {allEnabled ? 'Disable All' : 'Enable All'}
                          </Button>
                          <ChevronDown
                            className={cn(
                              'w-4 h-4 transition-transform',
                              expandedGroups.has(group.id) && 'rotate-180'
                            )}
                          />
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="px-3 pb-3 space-y-2">
                        {group.permissions.map((permission) => (
                          <div
                            key={permission.id}
                            className="flex items-center justify-between p-2 rounded-md hover:bg-muted/30"
                          >
                            <div className="flex items-center gap-3">
                              <Switch
                                checked={permission.enabled}
                                onCheckedChange={() =>
                                  togglePermission(group.id, permission.id)
                                }
                              />
                              <div>
                                <div className="text-sm font-medium">
                                  {permission.name}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {permission.description}
                                </div>
                              </div>
                            </div>
                            {permission.enabled ? (
                              <Check className="w-4 h-4 text-green-500" />
                            ) : (
                              <X className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          </div>

          {role?.isSystem && (
            <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
              <Shield className="w-4 h-4 inline mr-2" />
              This is a system role and has limited editing capabilities.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name}>
            {role ? 'Save Changes' : 'Create Role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
