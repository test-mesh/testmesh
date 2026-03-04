'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useCreateGitTriggerRule, useUpdateGitTriggerRule } from '@/lib/hooks/useIntegrations';
import { useSchedules } from '@/lib/hooks/useSchedules';
import { useFlows } from '@/lib/hooks/useFlows';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { GitTriggerRule } from '@/lib/api/integrations';

interface TriggerRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integrationId: string;
  workspaceId: string;
  rule?: GitTriggerRule | null;
}

interface FormData {
  name: string;
  repository: string;
  branch_filter: string;
  event_types: string[];
  trigger_mode: 'schedule' | 'direct';
  schedule_id?: string;
  flow_id?: string;
}

const EVENT_TYPES = [
  { id: 'push', label: 'Push' },
  { id: 'pull_request', label: 'Pull Request' },
  { id: 'release', label: 'Release' },
];

export function TriggerRuleDialog({
  open,
  onOpenChange,
  integrationId,
  workspaceId,
  rule,
}: TriggerRuleDialogProps) {
  const createRule = useCreateGitTriggerRule();
  const updateRule = useUpdateGitTriggerRule();
  const { data: schedulesData } = useSchedules();
  const { data: flowsData } = useFlows();
  const { toast } = useToast();

  const [selectedEvents, setSelectedEvents] = useState<string[]>(['push', 'pull_request']);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      name: '',
      repository: '',
      branch_filter: '*',
      event_types: ['push', 'pull_request'],
      trigger_mode: 'schedule',
      schedule_id: '',
      flow_id: '',
    },
  });

  const isEditing = !!rule;
  const triggerMode = watch('trigger_mode');

  useEffect(() => {
    if (rule && open) {
      setValue('name', rule.name);
      setValue('repository', rule.repository);
      setValue('branch_filter', rule.branch_filter);
      setValue('trigger_mode', rule.trigger_mode);
      setValue('schedule_id', rule.schedule_id || '');
      setValue('flow_id', rule.flow_id || '');
      setSelectedEvents(rule.event_types);
    } else if (open && !isEditing) {
      reset();
      setSelectedEvents(['push', 'pull_request']);
    }
  }, [rule, open, isEditing, setValue, reset]);

  const toggleEvent = (eventId: string) => {
    setSelectedEvents(prev =>
      prev.includes(eventId)
        ? prev.filter(e => e !== eventId)
        : [...prev, eventId]
    );
  };

  const onSubmit = async (data: FormData) => {
    if (selectedEvents.length === 0) {
      toast({
        title: 'Validation error',
        description: 'Please select at least one event type',
        variant: 'destructive',
      });
      return;
    }

    if (data.trigger_mode === 'schedule' && !data.schedule_id) {
      toast({
        title: 'Validation error',
        description: 'Please select a schedule',
        variant: 'destructive',
      });
      return;
    }

    if (data.trigger_mode === 'direct' && !data.flow_id) {
      toast({
        title: 'Validation error',
        description: 'Please select a flow',
        variant: 'destructive',
      });
      return;
    }

    try {
      const payload = {
        integration_id: integrationId,
        name: data.name,
        repository: data.repository,
        branch_filter: data.branch_filter || '*',
        event_types: selectedEvents,
        trigger_mode: data.trigger_mode,
        schedule_id: data.trigger_mode === 'schedule' ? data.schedule_id : undefined,
        flow_id: data.trigger_mode === 'direct' ? data.flow_id : undefined,
        enabled: true,
      };

      if (isEditing && rule) {
        await updateRule.mutateAsync({
          workspaceId,
          id: rule.id,
          data: payload,
        });

        toast({
          title: 'Rule updated',
          description: `Trigger rule "${data.name}" has been updated.`,
        });
      } else {
        await createRule.mutateAsync({
          workspaceId,
          data: payload,
        });

        toast({
          title: 'Rule created',
          description: `Trigger rule "${data.name}" has been created.`,
        });
      }

      onOpenChange(false);
      reset();
      setSelectedEvents(['push', 'pull_request']);
    } catch (error) {
      toast({
        title: 'Failed to save',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? 'Edit' : 'Create'} Trigger Rule
            </DialogTitle>
            <DialogDescription>
              Configure when and how tests should be triggered from Git events
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                Rule Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="Main branch CI"
                {...register('name', {
                  required: 'Rule name is required',
                })}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="repository">
                Repository <span className="text-destructive">*</span>
              </Label>
              <Input
                id="repository"
                placeholder="owner/repo"
                {...register('repository', {
                  required: 'Repository is required',
                  pattern: {
                    value: /^[^/]+\/[^/]+$/,
                    message: 'Format: owner/repo',
                  },
                })}
              />
              {errors.repository && (
                <p className="text-sm text-destructive">{errors.repository.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Format: owner/repository-name (e.g., facebook/react)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="branch_filter">Branch Filter</Label>
              <Input
                id="branch_filter"
                placeholder="*"
                {...register('branch_filter')}
              />
              <p className="text-xs text-muted-foreground">
                Use * for all branches, or specify a branch name like "main" or "develop"
              </p>
            </div>

            <div className="space-y-2">
              <Label>Event Types</Label>
              <div className="space-y-2">
                {EVENT_TYPES.map((event) => (
                  <div key={event.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={event.id}
                      checked={selectedEvents.includes(event.id)}
                      onCheckedChange={() => toggleEvent(event.id)}
                    />
                    <Label
                      htmlFor={event.id}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {event.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label>Trigger Mode</Label>
              <RadioGroup
                value={triggerMode}
                onValueChange={(value) => setValue('trigger_mode', value as 'schedule' | 'direct')}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="schedule" id="schedule" />
                  <Label htmlFor="schedule" className="font-normal cursor-pointer">
                    Via Schedule (recommended)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="direct" id="direct" />
                  <Label htmlFor="direct" className="font-normal cursor-pointer">
                    Direct Execution
                  </Label>
                </div>
              </RadioGroup>

              {triggerMode === 'schedule' && (
                <div className="space-y-2 pl-6">
                  <Label htmlFor="schedule_id">Schedule</Label>
                  <Select
                    value={watch('schedule_id')}
                    onValueChange={(value) => setValue('schedule_id', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a schedule" />
                    </SelectTrigger>
                    <SelectContent>
                      {schedulesData?.schedules?.map((schedule) => (
                        <SelectItem key={schedule.id} value={schedule.id}>
                          {schedule.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    The selected schedule will be triggered when the event occurs
                  </p>
                </div>
              )}

              {triggerMode === 'direct' && (
                <div className="space-y-2 pl-6">
                  <Label htmlFor="flow_id">Flow</Label>
                  <Select
                    value={watch('flow_id')}
                    onValueChange={(value) => setValue('flow_id', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a flow" />
                    </SelectTrigger>
                    <SelectContent>
                      {flowsData?.flows?.map((flow) => (
                        <SelectItem key={flow.id} value={flow.id}>
                          {flow.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    The flow will be executed immediately when the event occurs
                  </p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={createRule.isPending || updateRule.isPending}
            >
              {(createRule.isPending || updateRule.isPending) ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Rule'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
