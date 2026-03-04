'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFlow, useDeleteFlow } from '@/lib/hooks/useFlows';
import { useExecutions, useCreateExecution } from '@/lib/hooks/useExecutions';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PresenceIndicator, CommentThread, VersionHistory } from '@/components/collaboration';
import { Play, Trash2, Edit, ArrowLeft, Clock, MessageSquare, FileCode } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function FlowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const { data: flow, isLoading, error } = useFlow(id);
  const { data: executionsData } = useExecutions({ flow_id: id });
  const deleteFlow = useDeleteFlow();
  const createExecution = useCreateExecution();

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this flow?')) {
      deleteFlow.mutate(id, {
        onSuccess: () => {
          router.push('/flows');
        },
      });
    }
  };

  const handleRun = async () => {
    createExecution.mutate({
      flow_id: id,
      environment: 'development',
    });
  };

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Error Loading Flow</CardTitle>
            <CardDescription>
              {error instanceof Error ? error.message : 'An error occurred'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (isLoading || !flow) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              Loading flow...
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const executions = executionsData?.executions || [];

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <Link href="/flows">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Flows
          </Button>
        </Link>

        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-bold">{flow.name}</h1>
              <PresenceIndicator resourceType="flow" resourceId={id} size="sm" />
            </div>
            {flow.description && (
              <p className="text-muted-foreground mt-2">{flow.description}</p>
            )}
            <div className="flex gap-2 mt-4">
              {flow.suite && <Badge variant="outline">{flow.suite}</Badge>}
              {flow.tags?.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
              <Badge variant="outline">{flow.environment}</Badge>
            </div>
          </div>
          <div className="flex gap-2">
            <VersionHistory flowId={id} />
            <Button onClick={handleRun} disabled={createExecution.isPending}>
              <Play className="w-4 h-4 mr-2" />
              Run Flow
            </Button>
            <Link href={`/flows/${id}/edit`}>
              <Button variant="outline">
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
            </Link>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteFlow.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Flow Definition</CardTitle>
            <CardDescription>
              {flow.definition.steps?.length || 0} steps
              {flow.definition.setup && `, ${flow.definition.setup.length} setup steps`}
              {flow.definition.teardown && `, ${flow.definition.teardown.length} teardown steps`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {flow.definition.setup && flow.definition.setup.length > 0 && (
                <div>
                  <h3 className="font-medium mb-2">Setup Steps</h3>
                  <div className="space-y-2">
                    {flow.definition.setup.map((step, i) => (
                      <div
                        key={step.id || i}
                        className="p-3 border rounded-lg"
                      >
                        <div className="font-medium">{step.name || step.id}</div>
                        <div className="text-sm text-muted-foreground">
                          {step.action}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="font-medium mb-2">Main Steps</h3>
                <div className="space-y-2">
                  {flow.definition.steps?.map((step, i) => (
                    <div key={step.id || i} className="p-3 border rounded-lg">
                      <div className="font-medium">{step.name || step.id}</div>
                      <div className="text-sm text-muted-foreground">
                        {step.action}
                      </div>
                      {step.assert && step.assert.length > 0 && (
                        <div className="mt-2">
                          <Badge variant="secondary" className="text-xs">
                            {step.assert.length} assertions
                          </Badge>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {flow.definition.teardown && flow.definition.teardown.length > 0 && (
                <div>
                  <h3 className="font-medium mb-2">Teardown Steps</h3>
                  <div className="space-y-2">
                    {flow.definition.teardown.map((step, i) => (
                      <div
                        key={step.id || i}
                        className="p-3 border rounded-lg"
                      >
                        <div className="font-medium">{step.name || step.id}</div>
                        <div className="text-sm text-muted-foreground">
                          {step.action}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Executions</CardTitle>
            <CardDescription>Last 10 executions of this flow</CardDescription>
          </CardHeader>
          <CardContent>
            {executions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No executions yet. Run this flow to see results here.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Environment</TableHead>
                    <TableHead>Steps</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {executions.slice(0, 10).map((execution) => (
                    <TableRow key={execution.id}>
                      <TableCell>
                        <Badge
                          variant={
                            execution.status === 'completed'
                              ? 'default'
                              : execution.status === 'failed'
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {execution.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{execution.environment}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-green-600">
                          {execution.passed_steps}
                        </span>
                        /
                        <span className="text-red-600">
                          {execution.failed_steps}
                        </span>
                      </TableCell>
                      <TableCell>
                        {execution.duration_ms ? (
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {execution.duration_ms}ms
                          </div>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        {execution.started_at
                          ? formatDistanceToNow(new Date(execution.started_at), {
                              addSuffix: true,
                            })
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <Link href={`/executions/${execution.id}`}>
                          <Button variant="ghost" size="sm">
                            View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Comments Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Discussion
            </CardTitle>
            <CardDescription>
              Collaborate with your team on this flow
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CommentThread
              flowId={id}
              currentUserId="current-user"
              currentUserName="Current User"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
