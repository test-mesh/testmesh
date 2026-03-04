'use client';

import { useState } from 'react';
import { useGitTriggerRules, useDeleteGitTriggerRule, useUpdateGitTriggerRule } from '@/lib/hooks/useIntegrations';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MoreHorizontal, Plus, Edit, Trash2, Loader2, Calendar, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { TriggerRuleDialog } from './TriggerRuleDialog';
import type { GitTriggerRule } from '@/lib/api/integrations';

interface TriggerRulesTableProps {
  integrationId: string;
}

export function TriggerRulesTable({ integrationId }: TriggerRulesTableProps) {
  // For now, use a hardcoded workspace ID - in production, get from context
  const workspaceId = '00000000-0000-0000-0000-000000000001';

  const { data, isLoading } = useGitTriggerRules(workspaceId);
  const deleteRule = useDeleteGitTriggerRule();
  const updateRule = useUpdateGitTriggerRule();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<GitTriggerRule | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<GitTriggerRule | null>(null);

  const rules = data?.rules || [];

  const handleCreate = () => {
    setSelectedRule(null);
    setDialogOpen(true);
  };

  const handleEdit = (rule: GitTriggerRule) => {
    setSelectedRule(rule);
    setDialogOpen(true);
  };

  const handleDelete = (rule: GitTriggerRule) => {
    setRuleToDelete(rule);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!ruleToDelete) return;

    try {
      await deleteRule.mutateAsync({
        workspaceId,
        id: ruleToDelete.id,
      });

      toast({
        title: 'Rule deleted',
        description: `Trigger rule "${ruleToDelete.name}" has been removed.`,
      });

      setDeleteDialogOpen(false);
      setRuleToDelete(null);
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Failed to delete rule',
        variant: 'destructive',
      });
    }
  };

  const toggleEnabled = async (rule: GitTriggerRule) => {
    try {
      await updateRule.mutateAsync({
        workspaceId,
        id: rule.id,
        data: {
          enabled: !rule.enabled,
        },
      });

      toast({
        title: rule.enabled ? 'Rule disabled' : 'Rule enabled',
        description: `Trigger rule "${rule.name}" has been ${rule.enabled ? 'disabled' : 'enabled'}.`,
      });
    } catch (error) {
      toast({
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Failed to update rule',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">No trigger rules configured</p>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Trigger Rule
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add Rule
          </Button>
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Repository</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell>
                    <code className="text-sm bg-muted px-2 py-1 rounded">
                      {rule.repository}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{rule.branch_filter}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {rule.event_types.map((event) => (
                        <Badge key={event} variant="secondary" className="text-xs">
                          {event}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {rule.trigger_mode === 'schedule' ? (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {rule.schedule?.name || 'Schedule'}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {rule.flow?.name || 'Direct'}
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={() => toggleEnabled(rule)}
                      disabled={updateRule.isPending}
                    />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(rule)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(rule)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <TriggerRuleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        integrationId={integrationId}
        workspaceId={workspaceId}
        rule={selectedRule}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Trigger Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{ruleToDelete?.name}</strong>?
              This will stop automatic test executions for this repository and branch.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
