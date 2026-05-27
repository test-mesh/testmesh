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
import { ArrowLeft, Calendar, Clock, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { describeCron } from '@/lib/api/schedules';
import { cn } from '@/lib/utils';

export default function ScheduleEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const { data: schedule, isLoading: scheduleLoading, error: scheduleError } = useSchedule(id);
  const { data: flows } = useFlows();
  const { data: presets } = useCronPresets();
  const { data: timezones } = useTimezones();
  const validateCron = useValidateCron();
  const updateMutation = useUpdateSchedule();

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
    if (selected) setCronExpr(selected.expr);
  };

  if (scheduleError) {
    return (
      <div className="px-6 py-6">
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-6">
          <p className="text-[13px] font-semibold text-red-400 mb-2">Error Loading Schedule</p>
          <p className="text-xs text-[#4a6480] mb-4">Failed to load schedule. It may have been deleted.</p>
          <Link href="/schedules" className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0b0f18] border border-[#1e2d3d] hover:border-[#2a3d52] transition-colors">
            Back to Schedules
          </Link>
        </div>
      </div>
    );
  }

  if (scheduleLoading || !schedule) {
    return (
      <div className="px-6 py-6 flex items-center justify-center h-48">
        <RefreshCw className="h-5 w-5 animate-spin text-[#3d5670]" />
      </div>
    );
  }

  return (
    <div className="px-6 py-6 max-w-3xl">
      <div className="flex items-center gap-2 mb-5">
        <Link
          href={`/schedules/${id}`}
          className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-xl font-semibold text-[#c8dce8]">Edit Schedule</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2332]">
            <span className="text-[11px] font-semibold text-[#c8dce8]">Schedule Details</span>
          </div>
          <div className="p-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-[11px] text-[#7fa8c8]">Schedule Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Nightly API Tests" required
                className="h-8 text-xs bg-[#0b0f18] border-[#1e2d3d] text-[#c8dce8] placeholder-[#3d5670] focus-visible:ring-0 focus-visible:border-teal-400/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-[11px] text-[#7fa8c8]">Description (optional)</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this schedule does..." rows={2}
                className="text-xs bg-[#0b0f18] border-[#1e2d3d] text-[#c8dce8] placeholder-[#3d5670] focus-visible:ring-0 focus-visible:border-teal-400/50 resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-[#7fa8c8]">Test Flow</Label>
              <Select value={flowId} onValueChange={setFlowId}>
                <SelectTrigger className="h-8 text-xs bg-[#0b0f18] border-[#1e2d3d] text-[#c8dce8] focus:ring-0 focus:border-teal-400/50">
                  <SelectValue placeholder="Select a flow to run" />
                </SelectTrigger>
                <SelectContent>
                  {flows?.flows.map((flow) => (
                    <SelectItem key={flow.id} value={flow.id}>{flow.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#1a2332]">
            <Clock className="h-3.5 w-3.5 text-[#3d5670]" />
            <span className="text-[11px] font-semibold text-[#c8dce8]">Schedule Timing</span>
          </div>
          <div className="p-4 space-y-4">
            {presets?.presets && (
              <div className="space-y-1.5">
                <Label className="text-[11px] text-[#7fa8c8]">Quick Presets</Label>
                <div className="flex flex-wrap gap-1.5">
                  {presets.presets.map((preset) => (
                    <button
                      key={preset.name} type="button"
                      onClick={() => handlePresetSelect(preset.name)}
                      className={cn(
                        'h-6 px-2.5 rounded text-[10px] font-medium transition-colors',
                        cronExpr === preset.expr
                          ? 'bg-teal-400/15 text-teal-400 border border-teal-400/30'
                          : 'bg-[#0b0f18] border border-[#1e2d3d] text-[#4a6480] hover:border-[#2a3d52] hover:text-[#7fa8c8]'
                      )}
                    >
                      {preset.name.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="cron" className="text-[11px] text-[#7fa8c8]">Cron Expression</Label>
              <Input id="cron" value={cronExpr} onChange={(e) => setCronExpr(e.target.value)}
                placeholder="* * * * *" required
                className="h-8 text-xs font-mono bg-[#0b0f18] border-[#1e2d3d] text-[#c8dce8] placeholder-[#3d5670] focus-visible:ring-0 focus-visible:border-teal-400/50"
              />
              <div className="flex items-center gap-1.5 text-xs">
                {validateCron.data?.valid ? (
                  <><CheckCircle2 className="h-3.5 w-3.5 text-teal-400" /><span className="text-teal-400">{describeCron(cronExpr)}</span></>
                ) : validateCron.data?.error ? (
                  <><XCircle className="h-3.5 w-3.5 text-red-400" /><span className="text-red-400">{validateCron.data.error}</span></>
                ) : null}
              </div>
            </div>
            {validateCron.data?.valid && validateCron.data?.next_run_times && (
              <div className="space-y-1.5">
                <Label className="text-[11px] text-[#7fa8c8] flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" />Upcoming Runs
                </Label>
                <div className="rounded-lg bg-[#0b0f18] border border-[#1e2d3d] p-3 space-y-1">
                  {validateCron.data.next_run_times.map((time, index) => (
                    <p key={index} className="text-[11px] text-[#7fa8c8]">{format(new Date(time), 'PPpp')}</p>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-[11px] text-[#7fa8c8]">Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="h-8 text-xs bg-[#0b0f18] border-[#1e2d3d] text-[#c8dce8] focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timezones?.timezones.map((tz) => (
                    <SelectItem key={tz.id} value={tz.id}>{tz.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2332]">
            <span className="text-[11px] font-semibold text-[#c8dce8]">Options</span>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-medium text-[#c8dce8]">Allow Overlapping Runs</p>
                <p className="text-[11px] text-[#4a6480]">Allow a new run to start even if the previous one is still running</p>
              </div>
              <Switch checked={allowOverlap} onCheckedChange={setAllowOverlap} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-[#7fa8c8]">Max Retries on Failure</Label>
              <Select value={maxRetries.toString()} onValueChange={(v) => setMaxRetries(parseInt(v))}>
                <SelectTrigger className="h-8 w-[160px] text-xs bg-[#0b0f18] border-[#1e2d3d] text-[#c8dce8] focus:ring-0">
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
            <div className="space-y-1.5">
              <Label htmlFor="tags" className="text-[11px] text-[#7fa8c8]">Tags (comma-separated)</Label>
              <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)}
                placeholder="e.g., nightly, critical, api"
                className="h-8 text-xs bg-[#0b0f18] border-[#1e2d3d] text-[#c8dce8] placeholder-[#3d5670] focus-visible:ring-0 focus-visible:border-teal-400/50"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2332]">
            <span className="text-[11px] font-semibold text-[#c8dce8]">Notifications</span>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-medium text-[#c8dce8]">Notify on Failure</p>
                <p className="text-[11px] text-[#4a6480]">Send email notification when tests fail</p>
              </div>
              <Switch checked={notifyOnFailure} onCheckedChange={setNotifyOnFailure} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-medium text-[#c8dce8]">Notify on Success</p>
                <p className="text-[11px] text-[#4a6480]">Send email notification when tests pass</p>
              </div>
              <Switch checked={notifyOnSuccess} onCheckedChange={setNotifyOnSuccess} />
            </div>
            {(notifyOnFailure || notifyOnSuccess) && (
              <div className="space-y-1.5">
                <Label htmlFor="emails" className="text-[11px] text-[#7fa8c8]">Notification Emails (comma-separated)</Label>
                <Input id="emails" type="text" value={notifyEmails} onChange={(e) => setNotifyEmails(e.target.value)}
                  placeholder="e.g., team@example.com, alerts@example.com"
                  className="h-8 text-xs bg-[#0b0f18] border-[#1e2d3d] text-[#c8dce8] placeholder-[#3d5670] focus-visible:ring-0 focus-visible:border-teal-400/50"
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Link
            href={`/schedules/${id}`}
            className="flex items-center h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={updateMutation.isPending || !name || !flowId || (initialized && !validateCron.data?.valid)}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
          >
            {updateMutation.isPending ? <><RefreshCw className="h-3 w-3 animate-spin" />Saving…</> : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
