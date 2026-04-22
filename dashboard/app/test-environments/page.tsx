'use client';

import { useState } from 'react';
import {
  useTestEnvironments,
  useCreateTestEnvironment,
  useDestroyTestEnvironment,
} from '@/lib/hooks/useTestEnvironments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Plus, RefreshCw, Trash2, Server } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import type { TestEnvState, CreateTestEnvRequest } from '@/lib/api/test_environments';
import { TEST_ENV_STATE_COLORS } from '@/lib/api/test_environments';

const STATE_BADGE_CLASS: Record<string, string> = {
  gray: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  green: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  red: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

function StateBadge({ state }: { state: TestEnvState }) {
  const color = TEST_ENV_STATE_COLORS[state] ?? 'gray';
  const cls = STATE_BADGE_CLASS[color] ?? STATE_BADGE_CLASS.gray;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
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
      <div className="container mx-auto py-8">
        <Card className="border-destructive">
          <CardHeader className="text-destructive font-semibold">Error</CardHeader>
          <CardContent>
            <p>Failed to load test environments. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Test Environments</h1>
          <p className="text-muted-foreground">
            Manage ephemeral environments for GitOps-triggered test runs
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Environment
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : environments.length === 0 ? (
            <div className="text-center py-8">
              <Server className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No test environments</h3>
              <p className="text-muted-foreground">
                Create an environment to spin up ephemeral test infrastructure.
              </p>
              <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New Environment
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Context</TableHead>
                  <TableHead>Namespace</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>TTL (min)</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead className="w-[70px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {environments.map((env) => (
                  <TableRow key={env.id}>
                    <TableCell className="font-medium">{env.name}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">{env.context}</code>
                    </TableCell>
                    <TableCell>
                      {env.namespace ? (
                        <code className="text-xs bg-muted px-1 py-0.5 rounded">{env.namespace}</code>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{env.provider}</Badge>
                    </TableCell>
                    <TableCell>
                      <StateBadge state={env.state} />
                    </TableCell>
                    <TableCell>{env.ttl_minutes}</TableCell>
                    <TableCell>
                      {env.last_used_at ? (
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(env.last_used_at), { addSuffix: true })}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">never</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDestroyId(env.id)}
                        disabled={env.state === 'destroyed' || destroyMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Environment Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Test Environment</DialogTitle>
            <DialogDescription>
              Provision an ephemeral environment for GitOps-driven test execution.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="env-name">Name</Label>
              <Input
                id="env-name"
                placeholder="e.g. pr-1234"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="env-context">Context</Label>
              <Input
                id="env-context"
                placeholder="e.g. staging"
                value={form.context}
                onChange={(e) => setForm({ ...form, context: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="env-namespace">Namespace (optional)</Label>
              <Input
                id="env-namespace"
                placeholder="e.g. pr-1234"
                value={form.namespace ?? ''}
                onChange={(e) => setForm({ ...form, namespace: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="env-provider">Provider</Label>
              <Input
                id="env-provider"
                placeholder="argocd"
                value={form.provider ?? ''}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="env-app-name">Provider App Name (optional)</Label>
              <Input
                id="env-app-name"
                placeholder="e.g. my-app-pr-1234"
                value={form.provider_app_name ?? ''}
                onChange={(e) => setForm({ ...form, provider_app_name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="env-ttl">TTL (minutes)</Label>
              <Input
                id="env-ttl"
                type="number"
                min={1}
                placeholder="60"
                value={form.ttl_minutes ?? 60}
                onChange={(e) =>
                  setForm({ ...form, ttl_minutes: parseInt(e.target.value, 10) || 60 })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!form.name || !form.context || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Destroy Confirm Dialog */}
      <AlertDialog open={!!destroyId} onOpenChange={() => setDestroyId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Destroy Environment</AlertDialogTitle>
            <AlertDialogDescription>
              This will tear down the environment and all associated resources. This action cannot
              be undone.
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
