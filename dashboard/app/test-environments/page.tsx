'use client';

import { useState } from 'react';
import {
  useTestEnvironments,
  useCreateTestEnvironment,
  useDestroyTestEnvironment,
} from '@/lib/hooks/useTestEnvironments';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Plus, RefreshCw, Trash2, Server } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { TestEnvState, CreateTestEnvRequest } from '@/lib/api/test_environments';
import { TEST_ENV_STATE_COLORS } from '@/lib/api/test_environments';

const STATE_COLORS: Record<string, string> = {
  gray:   'bg-[#1a2d3d] text-[#4a6480]',
  blue:   'bg-blue-400/10 text-blue-400',
  green:  'bg-teal-400/10 text-teal-400',
  yellow: 'bg-yellow-400/10 text-yellow-400',
  orange: 'bg-orange-400/10 text-orange-400',
  red:    'bg-red-400/10 text-red-400',
};

function StateBadge({ state }: { state: TestEnvState }) {
  const color = TEST_ENV_STATE_COLORS[state] ?? 'gray';
  return (
    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded capitalize', STATE_COLORS[color] ?? STATE_COLORS.gray)}>
      {state}
    </span>
  );
}

const DEFAULT_FORM: CreateTestEnvRequest = {
  name: '',
  context: '',
  namespace: '',
  provider: 'argocd',
  provider_app_name: '',
  ttl_minutes: 60,
};

export default function TestEnvironmentsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [destroyId, setDestroyId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateTestEnvRequest>(DEFAULT_FORM);

  const { data, isLoading, error } = useTestEnvironments();
  const createMutation = useCreateTestEnvironment();
  const destroyMutation = useDestroyTestEnvironment();

  const environments = data?.environments ?? [];

  const handleCreate = async () => {
    try {
      await createMutation.mutateAsync(form);
      toast.success(`Environment "${form.name}" created`);
      setCreateOpen(false);
      setForm(DEFAULT_FORM);
    } catch {
      toast.error('Failed to create environment');
    }
  };

  const handleDestroy = async () => {
    if (!destroyId) return;
    try {
      await destroyMutation.mutateAsync(destroyId);
      toast.success('Environment destroyed');
      setDestroyId(null);
    } catch {
      toast.error('Failed to destroy environment');
    }
  };

  if (error) {
    return (
      <div className="px-6 py-6">
        <div className="rounded-xl bg-red-400/5 border border-red-400/20 p-6 text-red-400 text-sm">
          Failed to load test environments. Please try again.
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-[#c8dce8]">Test Environments</h1>
          <p className="text-xs text-[#3d5670] mt-0.5">Manage ephemeral environments for GitOps-triggered test runs</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors"
        >
          <Plus className="h-3 w-3" />
          New Environment
        </button>
      </div>

      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-5 w-5 animate-spin text-[#3d5670]" />
          </div>
        ) : environments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Server className="h-10 w-10 mb-3 text-[#1e2d3d]" />
            <p className="text-sm text-[#3d5670] mb-1">No test environments</p>
            <p className="text-[11px] text-[#2a3d52] mb-4">Create an environment to spin up ephemeral test infrastructure.</p>
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 h-7 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors"
            >
              <Plus className="h-3 w-3" />
              New Environment
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-2.5 border-b border-[#1a2332]">
              {['Name', 'Context', 'Namespace', 'Provider', 'State', 'TTL', 'Last Used', ''].map((h) => (
                <span key={h} className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{h}</span>
              ))}
            </div>
            <div className="divide-y divide-[#1a2332]">
              {environments.map((env) => (
                <div key={env.id} className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 items-center hover:bg-[#131b26] transition-colors group">
                  <span className="text-[13px] font-medium text-[#c8dce8] truncate">{env.name}</span>
                  <code className="text-[10px] font-mono text-[#4a6480] bg-[#0b0f18] px-1.5 py-0.5 rounded w-fit">{env.context}</code>
                  <span>
                    {env.namespace
                      ? <code className="text-[10px] font-mono text-[#4a6480] bg-[#0b0f18] px-1.5 py-0.5 rounded">{env.namespace}</code>
                      : <span className="text-[#3d5670] text-[11px]">—</span>
                    }
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#4a7a96] w-fit">{env.provider}</span>
                  <StateBadge state={env.state} />
                  <span className="text-[11px] text-[#7fa8c8]">{env.ttl_minutes}m</span>
                  <span className="text-[11px] text-[#4a6480]">
                    {env.last_used_at
                      ? formatDistanceToNow(new Date(env.last_used_at), { addSuffix: true })
                      : 'never'}
                  </span>
                  <button
                    onClick={() => setDestroyId(env.id)}
                    disabled={env.state === 'destroyed' || destroyMutation.isPending}
                    className="flex items-center justify-center h-6 w-6 rounded text-[#3d5670] hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-30 opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Test Environment</DialogTitle>
            <DialogDescription>Provision an ephemeral environment for GitOps-driven test execution.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {[
              { id: 'env-name', label: 'Name', placeholder: 'e.g. pr-1234', key: 'name' as const },
              { id: 'env-context', label: 'Context', placeholder: 'e.g. staging', key: 'context' as const },
              { id: 'env-namespace', label: 'Namespace (optional)', placeholder: 'e.g. pr-1234', key: 'namespace' as const },
              { id: 'env-provider', label: 'Provider', placeholder: 'argocd', key: 'provider' as const },
              { id: 'env-app-name', label: 'Provider App Name (optional)', placeholder: 'e.g. my-app-pr-1234', key: 'provider_app_name' as const },
            ].map(({ id, label, placeholder, key }) => (
              <div key={id} className="space-y-1">
                <Label htmlFor={id}>{label}</Label>
                <Input
                  id={id}
                  placeholder={placeholder}
                  value={(form[key] as string) ?? ''}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </div>
            ))}
            <div className="space-y-1">
              <Label htmlFor="env-ttl">TTL (minutes)</Label>
              <Input
                id="env-ttl"
                type="number"
                min={1}
                placeholder="60"
                value={form.ttl_minutes ?? 60}
                onChange={(e) => setForm({ ...form, ttl_minutes: parseInt(e.target.value, 10) || 60 })}
              />
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setCreateOpen(false)}
              className="h-8 px-4 rounded-lg text-xs font-medium bg-[#0b0f18] border border-[#1e2d3d] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!form.name || !form.context || createMutation.isPending}
              className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Create
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!destroyId} onOpenChange={() => setDestroyId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Destroy Environment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will tear down the environment and all associated resources. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDestroy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Destroy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
