'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useSchedule,
  useScheduleRuns,
  useScheduleStats,
  useDeleteSchedule,
  usePauseSchedule,
  useResumeSchedule,
  useTriggerSchedule,
} from '@/lib/hooks/useSchedules';
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
  Calendar,
  Clock,
  Edit,
  Trash2,
  Play,
  Pause,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  BarChart3,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { useState } from 'react';
import { describeCron, type ScheduleStatus } from '@/lib/api/schedules';

export default function ScheduleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: schedule, isLoading, error } = useSchedule(id);
  const { data: runsData } = useScheduleRuns(id, 10);
  const { data: stats } = useScheduleStats(id, 30);

  const deleteMutation = useDeleteSchedule();
  const pauseMutation = usePauseSchedule();
  const resumeMutation = useResumeSchedule();
  const triggerMutation = useTriggerSchedule();

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(id);
    router.push('/schedules');
  };

  const getStatusBadge = (status: ScheduleStatus) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">Active</Badge>;
      case 'paused':
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">Paused</Badge>;
      case 'disabled':
        return <Badge variant="secondary">Disabled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getResultIcon = (result?: string) => {
    switch (result) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failure':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'skipped':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return null;
    }
  };

  const getRunStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="outline" className="text-green-600">Completed</Badge>;
      case 'running':
        return <Badge className="bg-blue-100 text-blue-800">Running</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
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
            <p>Failed to load schedule. It may have been deleted.</p>
            <Link href="/schedules">
              <Button className="mt-4">Back to Schedules</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading || !schedule) {
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
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/schedules">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{schedule.name}</h1>
              {getStatusBadge(schedule.status)}
            </div>
            {schedule.description && (
              <p className="text-muted-foreground mt-1">{schedule.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => triggerMutation.mutate(id)}
            disabled={triggerMutation.isPending}
          >
            <Play className="mr-2 h-4 w-4" />
            Run Now
          </Button>
          {schedule.status === 'active' ? (
            <Button
              variant="outline"
              onClick={() => pauseMutation.mutate(id)}
              disabled={pauseMutation.isPending}
            >
              <Pause className="mr-2 h-4 w-4" />
              Pause
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => resumeMutation.mutate(id)}
              disabled={resumeMutation.isPending}
            >
              <Play className="mr-2 h-4 w-4" />
              Resume
            </Button>
          )}
          <Link href={`/schedules/${id}/edit`}>
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

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Schedule
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{describeCron(schedule.cron_expr)}</p>
            <p className="text-sm text-muted-foreground font-mono">{schedule.cron_expr}</p>
            <p className="text-sm text-muted-foreground mt-1">Timezone: {schedule.timezone}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Next Run
            </CardTitle>
          </CardHeader>
          <CardContent>
            {schedule.next_run_at && schedule.status === 'active' ? (
              <>
                <p className="text-lg font-semibold">
                  {format(new Date(schedule.next_run_at), 'MMM d, yyyy')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(schedule.next_run_at), 'h:mm a')}
                </p>
              </>
            ) : (
              <p className="text-lg text-muted-foreground">Not scheduled</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Last 30 Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats ? (
              <>
                <p className="text-lg font-semibold">
                  {stats.successful_runs}/{stats.total_runs} successful
                </p>
                <p className="text-sm text-muted-foreground">
                  {stats.total_runs > 0
                    ? `${Math.round((stats.successful_runs / stats.total_runs) * 100)}% success rate`
                    : 'No runs yet'}
                </p>
              </>
            ) : (
              <p className="text-lg text-muted-foreground">Loading...</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Flow</dt>
              <dd>
                {schedule.flow ? (
                  <Link href={`/flows/${schedule.flow.id}`} className="text-blue-500 hover:underline">
                    {schedule.flow.name}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Unknown</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Max Retries</dt>
              <dd>{schedule.max_retries > 0 ? `${schedule.max_retries} retries` : 'No retries'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Allow Overlap</dt>
              <dd>{schedule.allow_overlap ? 'Yes' : 'No'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Notifications</dt>
              <dd>
                {schedule.notify_on_failure || schedule.notify_on_success ? (
                  <span>
                    {schedule.notify_on_failure && 'On failure'}
                    {schedule.notify_on_failure && schedule.notify_on_success && ', '}
                    {schedule.notify_on_success && 'On success'}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Disabled</span>
                )}
              </dd>
            </div>
            {schedule.tags && schedule.tags.length > 0 && (
              <div className="md:col-span-2">
                <dt className="text-sm font-medium text-muted-foreground mb-1">Tags</dt>
                <dd className="flex gap-2 flex-wrap">
                  {schedule.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">{tag}</Badge>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Recent Runs */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Runs</CardTitle>
          <CardDescription>Last 10 scheduled executions</CardDescription>
        </CardHeader>
        <CardContent>
          {runsData?.runs && runsData.runs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Retries</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runsData.runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {format(new Date(run.scheduled_at), 'MMM d, h:mm a')}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(run.scheduled_at), { addSuffix: true })}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{getRunStatusBadge(run.status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getResultIcon(run.result)}
                        <span className="capitalize">{run.result || '-'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : '-'}
                    </TableCell>
                    <TableCell>{run.retry_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="mx-auto h-12 w-12 mb-4" />
              <p>No runs yet</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Schedule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{schedule.name}"? This action cannot be undone.
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
