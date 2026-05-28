'use client';

import { useState } from 'react';
import { useGitTriggerRules, useDeleteGitTriggerRule, useUpdateGitTriggerRule } from '@/lib/hooks/useIntegrations';
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

  const handleCreate = () => { setSelectedRule(null); setDialogOpen(true); };
  const handleEdit = (rule: GitTriggerRule) => { setSelectedRule(rule); setDialogOpen(true); };
  const handleDelete = (rule: GitTriggerRule) => { setRuleToDelete(rule); setDeleteDialogOpen(true); };

  const confirmDelete = async () => {
    if (!ruleToDelete) return;
    try {
      await deleteRule.mutateAsync({ workspaceId, id: ruleToDelete.id });
      toast({ title: 'Rule deleted', description: `Trigger rule "${ruleToDelete.name}" has been removed.` });
      setDeleteDialogOpen(false);
      setRuleToDelete(null);
    } catch (error) {
      toast({ title: 'Delete failed', description: error instanceof Error ? error.message : 'Failed to delete rule', variant: 'destructive' });
    }
  };

  const toggleEnabled = async (rule: GitTriggerRule) => {
    try {
      await updateRule.mutateAsync({ workspaceId, id: rule.id, data: { enabled: !rule.enabled } });
      toast({ title: rule.enabled ? 'Rule disabled' : 'Rule enabled', description: `Trigger rule "${rule.name}" has been ${rule.enabled ? 'disabled' : 'enabled'}.` });
    } catch (error) {
      toast({ title: 'Update failed', description: error instanceof Error ? error.message : 'Failed to update rule', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#4a6480]" />
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-[#4a6480] mb-4">No trigger rules configured</p>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 h-8 px-3 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-xs text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Trigger Rule
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-end">
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 h-8 px-3 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-xs text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Rule
          </button>
        </div>

        <div className="rounded-lg border border-[#1e2d3d] overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1a2332] bg-[#0f1923]">
                <th className="text-left py-2.5 px-3 text-[10px] font-medium text-[#4a6480] uppercase tracking-wide">Name</th>
                <th className="text-left py-2.5 px-3 text-[10px] font-medium text-[#4a6480] uppercase tracking-wide">Repository</th>
                <th className="text-left py-2.5 px-3 text-[10px] font-medium text-[#4a6480] uppercase tracking-wide">Branch</th>
                <th className="text-left py-2.5 px-3 text-[10px] font-medium text-[#4a6480] uppercase tracking-wide">Events</th>
                <th className="text-left py-2.5 px-3 text-[10px] font-medium text-[#4a6480] uppercase tracking-wide">Trigger</th>
                <th className="text-left py-2.5 px-3 text-[10px] font-medium text-[#4a6480] uppercase tracking-wide">Status</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a2332]">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-[#131b26] transition-colors">
                  <td className="py-3 px-3 font-medium text-[#c8dce8]">{rule.name}</td>
                  <td className="py-3 px-3">
                    <code className="px-1.5 py-0.5 rounded bg-[#1a2332] text-[#7fa8c8] font-mono text-[11px]">
                      {rule.repository}
                    </code>
                  </td>
                  <td className="py-3 px-3">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a2332] text-[#4a6480] font-mono">
                      {rule.branch_filter}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex gap-1 flex-wrap">
                      {rule.event_types.map((event) => (
                        <span key={event} className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a2332] text-[#7fa8c8]">
                          {event}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    {rule.trigger_mode === 'schedule' ? (
                      <div className="flex items-center gap-1.5 text-[#7fa8c8]">
                        <Calendar className="h-3.5 w-3.5 text-[#4a6480]" />
                        {rule.schedule?.name || 'Schedule'}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[#7fa8c8]">
                        <Zap className="h-3.5 w-3.5 text-[#4a6480]" />
                        {rule.flow?.name || 'Direct'}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={() => toggleEnabled(rule)}
                      disabled={updateRule.isPending}
                    />
                  </td>
                  <td className="py-3 px-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(rule)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(rule)} className="text-red-400">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
