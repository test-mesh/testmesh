'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useFlows } from '@/lib/hooks/useFlows';
import { useExecutions } from '@/lib/hooks/useExecutions';
import { useMockServers } from '@/lib/hooks/useMockServers';
import { useContracts } from '@/lib/hooks/useContracts';
import {
  PlayCircle,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  TrendingUp,
  Activity,
  Server,
  FileCode
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function DashboardPage() {
  const { data: flowsData } = useFlows();
  const { data: executionsData } = useExecutions({});
  const { data: mockServersData } = useMockServers({});
  const { data: contractsData } = useContracts({});

  const flows = flowsData?.flows || [];
  const executions = executionsData?.executions || [];
  const mockServers = mockServersData?.servers || [];
  const contracts = contractsData?.contracts || [];

  // Calculate statistics
  const totalFlows = flows.length;
  const totalExecutions = executions.length;
  const completedExecutions = executions.filter(e => e.status === 'completed').length;
  const failedExecutions = executions.filter(e => e.status === 'failed').length;
  const successRate = totalExecutions > 0
    ? Math.round((completedExecutions / totalExecutions) * 100)
    : 0;
  const runningMockServers = mockServers.filter(s => s.status === 'running').length;
  const totalContracts = contracts.length;

  // Recent executions (last 5)
  const recentExecutions = executions.slice(0, 5);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="gap-1"><CheckCircle2 className="w-3 h-3" />Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />Failed</Badge>;
      case 'running':
        return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" />Running</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Monitor your test flows and execution statistics
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Flows</CardTitle>
            <FileText className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalFlows}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Active test flows
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Executions</CardTitle>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalExecutions}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {completedExecutions} passed, {failedExecutions} failed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{successRate}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              Based on {totalExecutions} executions
            </p>
          </CardContent>
        </Card>

        <Link href="/mocks">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Mock Servers</CardTitle>
              <Server className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{mockServers.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {runningMockServers} running
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/contracts">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Contracts</CardTitle>
              <FileCode className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalContracts}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Pact contracts
              </p>
            </CardContent>
          </Card>
        </Link>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
            <PlayCircle className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href="/flows/new">
              <Button size="sm" className="w-full">Create Flow</Button>
            </Link>
            <Link href="/flows">
              <Button size="sm" variant="outline" className="w-full">
                View All Flows
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Recent Executions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Executions</CardTitle>
          <CardDescription>Latest test flow executions</CardDescription>
        </CardHeader>
        <CardContent>
          {recentExecutions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No executions yet. Create and run a flow to see results here.
            </div>
          ) : (
            <div className="space-y-4">
              {recentExecutions.map((execution) => (
                <Link
                  key={execution.id}
                  href={`/executions/${execution.id}`}
                  className="block"
                >
                  <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex-1">
                      <div className="font-medium">
                        {execution.flow?.name || 'Unknown Flow'}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {execution.passed_steps} / {execution.total_steps} steps passed
                        {execution.duration_ms && ` • ${execution.duration_ms}ms`}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-sm text-muted-foreground">
                        {execution.started_at
                          ? formatDistanceToNow(new Date(execution.started_at), {
                              addSuffix: true,
                            })
                          : '-'}
                      </div>
                      {getStatusBadge(execution.status)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
          {recentExecutions.length > 0 && (
            <div className="mt-4 text-center">
              <Link href="/executions">
                <Button variant="ghost" size="sm">
                  View All Executions
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
