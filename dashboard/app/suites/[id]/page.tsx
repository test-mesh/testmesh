'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSuite, useSuiteRuns, useDeleteSuite, useRunSuite } from '@/lib/hooks/useSuites';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import {
  ArrowLeft,
  Edit,
  Trash2,
  Play,
  RefreshCw,
  Layers,
  CheckCircle2,
  XCircle,
  Clock,
  GitBranch,
  Webhook,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from 'sonner';
import type { SuiteRunStatus, TriggerType } from '@/lib/api/suites';

export default function SuiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: suite, isLoading, error } = useSuite(id);
  const { data: runsData } = useSuiteRuns(id, 10);

  const deleteMutation = useDeleteSuite();
  const runMutation = useRunSuite();

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(id);
    router.push('/suites');
  };

  const handleRun = () => {
    runMutation.mutate(id, {
      onSuccess: () => {
        toast.success(`Suite "${suite?.name}" started`);
      },
      onError: () => {
        toast.error(`Failed to run suite`);
      },
    });
  };

  const getRunStatusBadge = (status: SuiteRunStatus) => {
    switch (status) {
      case 'completed':
        return (
          <Badge variant="outline" className="text-green-600 gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Completed
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Failed
          </Badge>
        );
      case 'running':
        return (
          <Badge className="bg-primary/10 text-primary gap-1">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Running
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" />
            Pending
          </Badge>
        );
      case 'cancelled':
        return <Badge variant="secondary">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTriggerBadge = (triggerType: TriggerType) => {
    switch (triggerType) {
      case 'manual':
        return <Badge variant="outline">Manual</Badge>;
      case 'schedule':
        return <Badge variant="secondary">Schedule</Badge>;
      case 'webhook':
        return (
          <Badge variant="outline" className="gap-1">
            <Webhook className="h-3 w-3" />
            Webhook
          </Badge>
        );
      case 'argocd':
        return (
          <Badge variant="outline" className="gap-1">
            <GitBranch className="h-3 w-3" />
            Argo CD
          </Badge>
        );
      case 'api':
        return <Badge variant="outline">API</Badge>;
      default:
        return <Badge variant="outline">{triggerType}</Badge>;
    }
  };

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Failed to load suite. It may have been deleted.</p>
            <Link href="/suites">
              <Button className="mt-4">Back to Suites</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading || !suite) {
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

  // Group flows by order value
  const flowsByOrder = [...(suite.flows ?? [])].sort((a, b) => a.order - b.order);

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/suites">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{suite.name}</h1>
            </div>
            {suite.description && (
              <p className="text-muted-foreground mt-1">{suite.description}</p>
            )}
            {suite.tags && suite.tags.length > 0 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                {suite.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleRun}
            disabled={runMutation.isPending}
          >
            <Play className="mr-2 h-4 w-4" />
            Run Now
          </Button>
          <Link href={`/suites/${id}/edit`}>
            <Button variant="outline">
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
          </Link>
          <Button
            variant="outline"
            className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Flows list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Flows ({flowsByOrder.length})
          </CardTitle>
          <CardDescription>Ordered list of flows in this suite</CardDescription>
        </CardHeader>
        <CardContent>
          {flowsByOrder.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No flows added yet.</p>
          ) : (
            <div className="space-y-2">
              {flowsByOrder.map((sf, idx) => (
                <div
                  key={sf.id}
                  className="flex items-center gap-3 p-3 rounded-md border bg-card"
                >
                  <span className="text-sm font-mono text-muted-foreground w-6 text-center">
                    {sf.order}
                  </span>
                  <div className="flex-1">
                    {sf.flow ? (
                      <Link
                        href={`/flows/${sf.flow_id}`}
                        className="font-medium hover:underline text-sm"
                      >
                        {sf.flow.name}
                      </Link>
                    ) : (
                      <span className="font-medium text-sm">{sf.flow_id}</span>
                    )}
                    {sf.flow?.tags && sf.flow.tags.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {sf.flow.tags.map((t) => (
                          <Badge key={t} variant="secondary" className="text-xs">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  {sf.parallel && (
                    <Badge variant="outline" className="text-xs">
                      Parallel
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Runs */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Runs</CardTitle>
          <CardDescription>Last 10 suite executions</CardDescription>
        </CardHeader>
        <CardContent>
          {runsData?.runs && runsData.runs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Flows</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runsData.runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">
                          {run.started_at
                            ? format(new Date(run.started_at), 'MMM d, h:mm a')
                            : format(new Date(run.created_at), 'MMM d, h:mm a')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(
                            new Date(run.started_at ?? run.created_at),
                            { addSuffix: true }
                          )}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{getRunStatusBadge(run.status)}</TableCell>
                    <TableCell>{getTriggerBadge(run.trigger_type)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        <span>{run.passed_flows}</span>
                        {run.failed_flows > 0 && (
                          <>
                            <XCircle className="h-3 w-3 text-red-500" />
                            <span>{run.failed_flows}</span>
                          </>
                        )}
                        <span className="text-muted-foreground">/ {run.total_flows}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {run.duration_ms > 0
                        ? `${(run.duration_ms / 1000).toFixed(1)}s`
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Layers className="mx-auto h-12 w-12 mb-4" />
              <p>No runs yet. Click "Run Now" to execute this suite.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Suite</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{suite.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
