'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  useSchedule,
  useUpdateSchedule,
  useCronPresets,
  useTimezones,
  useValidateCron,
} from '@/lib/hooks/useSchedules';
import { useFlows } from '@/lib/hooks/useFlows';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Calendar, Clock, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { describeCron } from '@/lib/api/schedules';

export default function ScheduleEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const { data: schedule, isLoading: scheduleLoading, error: scheduleError } = useSchedule(id);
  const { data: flows } = useFlows();
  const { data: presets } = useCronPresets();
  const { data: timezones } = useTimezones();
  const validateCron = useValidateCron();
  const updateMutation = useUpdateSchedule();

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [flowId, setFlowId] = useState('');
  const [cronExpr, setCronExpr] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [notifyOnFailure, setNotifyOnFailure] = useState(false);
  const [notifyOnSuccess, setNotifyOnSuccess] = useState(false);
  const [notifyEmails, setNotifyEmails] = useState('');
  const [allowOverlap, setAllowOverlap] = useState(false);
  const [maxRetries, setMaxRetries] = useState(0);
  const [tags, setTags] = useState('');
  const [initialized, setInitialized] = useState(false);

  // Initialize form with schedule data
  useEffect(() => {
    if (schedule && !initialized) {
      setName(schedule.name);
      setDescription(schedule.description || '');
      setFlowId(schedule.flow_id);
      setCronExpr(schedule.cron_expr);
      setTimezone(schedule.timezone);
      setNotifyOnFailure(schedule.notify_on_failure);
      setNotifyOnSuccess(schedule.notify_on_success);
      setNotifyEmails(schedule.notify_emails?.join(', ') || '');
      setAllowOverlap(schedule.allow_overlap);
      setMaxRetries(schedule.max_retries);
      setTags(schedule.tags?.join(', ') || '');
      setInitialized(true);
    }
  }, [schedule, initialized]);

  // Validate cron expression when it changes
  useEffect(() => {
    if (cronExpr && initialized) {
      validateCron.mutate({ cron_expr: cronExpr, timezone, count: 5 });
    }
  }, [cronExpr, timezone, initialized]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    await updateMutation.mutateAsync({
      id,
      data: {
        name,
        description: description || undefined,
        flow_id: flowId,
        cron_expr: cronExpr,
        timezone,
        notify_on_failure: notifyOnFailure,
        notify_on_success: notifyOnSuccess,
        notify_emails: notifyEmails ? notifyEmails.split(',').map((e) => e.trim()) : undefined,
        allow_overlap: allowOverlap,
        max_retries: maxRetries,
        tags: tags ? tags.split(',').map((t) => t.trim()) : undefined,
      },
    });

    router.push(`/schedules/${id}`);
  };

  const handlePresetSelect = (preset: string) => {
    const selected = presets?.presets.find((p) => p.name === preset);
    if (selected) {
      setCronExpr(selected.expr);
    }
  };

  if (scheduleError) {
    return (
      <div className="container mx-auto py-8">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Failed to load schedule. It may have been deleted.</p>
            <Link href="/schedules">
              <Button className="mt-4">Back to Schedules</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (scheduleLoading || !schedule) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-12">
            <div className="flex items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 max-w-3xl">
      <div className="mb-6">
        <Link href={`/schedules/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Schedule
          </Button>
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Edit Schedule</CardTitle>
            <CardDescription>
              Modify the schedule configuration
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Schedule Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Nightly API Tests"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this schedule does..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="flow">Test Flow</Label>
              <Select value={flowId} onValueChange={setFlowId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select a flow to run" />
                </SelectTrigger>
                <SelectContent>
                  {flows?.flows.map((flow) => (
                    <SelectItem key={flow.id} value={flow.id}>
                      {flow.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Schedule Timing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Quick Presets</Label>
              <div className="flex flex-wrap gap-2">
                {presets?.presets.map((preset) => (
                  <Badge
                    key={preset.name}
                    variant={cronExpr === preset.expr ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => handlePresetSelect(preset.name)}
                  >
                    {preset.name.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cron">Cron Expression</Label>
              <Input
                id="cron"
                value={cronExpr}
                onChange={(e) => setCronExpr(e.target.value)}
                placeholder="* * * * *"
                className="font-mono"
                required
              />
              <div className="flex items-center gap-2 text-sm">
                {validateCron.data?.valid ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-green-600">{describeCron(cronExpr)}</span>
                  </>
                ) : validateCron.data?.error ? (
                  <>
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span className="text-red-600">{validateCron.data.error}</span>
                  </>
                ) : null}
              </div>
            </div>

            {validateCron.data?.valid && validateCron.data?.next_run_times && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Upcoming Runs
                </Label>
                <div className="bg-muted rounded-md p-3 space-y-1">
                  {validateCron.data.next_run_times.map((time, index) => (
                    <p key={index} className="text-sm">
                      {format(new Date(time), 'PPpp')}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timezones?.timezones.map((tz) => (
                    <SelectItem key={tz.id} value={tz.id}>
                      {tz.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Allow Overlapping Runs</Label>
                <p className="text-sm text-muted-foreground">
                  Allow a new run to start even if the previous one is still running
                </p>
              </div>
              <Switch checked={allowOverlap} onCheckedChange={setAllowOverlap} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="retries">Max Retries on Failure</Label>
              <Select
                value={maxRetries.toString()}
                onValueChange={(v) => setMaxRetries(parseInt(v))}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">No retries</SelectItem>
                  <SelectItem value="1">1 retry</SelectItem>
                  <SelectItem value="2">2 retries</SelectItem>
                  <SelectItem value="3">3 retries</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g., nightly, critical, api"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Notify on Failure</Label>
                <p className="text-sm text-muted-foreground">
                  Send email notification when tests fail
                </p>
              </div>
              <Switch checked={notifyOnFailure} onCheckedChange={setNotifyOnFailure} />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Notify on Success</Label>
                <p className="text-sm text-muted-foreground">
                  Send email notification when tests pass
                </p>
              </div>
              <Switch checked={notifyOnSuccess} onCheckedChange={setNotifyOnSuccess} />
            </div>

            {(notifyOnFailure || notifyOnSuccess) && (
              <div className="space-y-2">
                <Label htmlFor="emails">Notification Emails (comma-separated)</Label>
                <Input
                  id="emails"
                  type="text"
                  value={notifyEmails}
                  onChange={(e) => setNotifyEmails(e.target.value)}
                  placeholder="e.g., team@example.com, alerts@example.com"
                />
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Link href={`/schedules/${id}`}>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={
              updateMutation.isPending ||
              !name ||
              !flowId ||
              (initialized && !validateCron.data?.valid)
            }
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}
