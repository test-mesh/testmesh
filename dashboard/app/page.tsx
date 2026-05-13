'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useFlows } from '@/lib/hooks/useFlows';
import { useExecutions } from '@/lib/hooks/useExecutions';
import { useMockServers } from '@/lib/hooks/useMockServers';
import {
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  TrendingUp,
  Activity,
  Server,
  Play,
  BarChart3,
  ArrowRight,
  Layers,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

function KPICard({
  title,
  value,
  sub,
  icon: Icon,
  highlight,
  href,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
  href?: string;
}) {
  const content = (
    <Card className={cn('transition-colors', href && 'cursor-pointer hover:shadow-md', highlight && 'border-primary/30 bg-primary/5')}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={cn('w-4 h-4', highlight ? 'text-primary' : 'text-muted-foreground')} />
      </CardHeader>
      <CardContent>
        <div className={cn('text-3xl font-bold', highlight && 'text-primary')}>{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function ExecutionStatusBadge({ status }: { status: string }) {
  if (status === 'completed') return <Badge className="gap-1 text-xs"><CheckCircle2 className="w-3 h-3" />Passed</Badge>;
  if (status === 'failed') return <Badge variant="destructive" className="gap-1 text-xs"><XCircle className="w-3 h-3" />Failed</Badge>;
  if (status === 'running') return <Badge variant="secondary" className="gap-1 text-xs"><Clock className="w-3 h-3 animate-spin" />Running</Badge>;
  return <Badge variant="outline" className="text-xs">{status}</Badge>;
}

export default function DashboardPage() {
  const { data: flowsData, isLoading: flowsLoading } = useFlows({ limit: 5 });
  const { data: executionsData, isLoading: execLoading } = useExecutions({ limit: 8 });
  const { data: mockServersData } = useMockServers({});

  const flows = flowsData?.flows || [];
  const executions = executionsData?.executions || [];
  const mockServers = mockServersData?.servers || [];
  const totalFlows = flowsData?.total ?? flows.length;

  const completedExecutions = executions.filter((e) => e.status === 'completed').length;
  const failedExecutions = executions.filter((e) => e.status === 'failed').length;
  const totalShown = executions.length;
  const successRate = totalShown > 0 ? Math.round((completedExecutions / totalShown) * 100) : 0;
  const runningMockServers = mockServers.filter((s) => s.status === 'running').length;

  return (
    <div className="container mx-auto py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Monitor your test flows and execution health</p>
      </div>

      {/* KPI grid */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-8">
        {flowsLoading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <KPICard
              title="Test Flows"
              value={totalFlows}
              sub="Active flows"
              icon={FileText}
              href="/flows"
            />
            <KPICard
              title="Executions"
              value={executionsData?.total ?? totalShown}
              sub={`${completedExecutions} passed · ${failedExecutions} failed`}
              icon={Activity}
              href="/executions"
            />
            <KPICard
              title="Pass Rate"
              value={`${successRate}%`}
              sub={`Last ${totalShown} runs`}
              icon={TrendingUp}
              highlight
            />
            <KPICard
              title="Mock Servers"
              value={mockServers.length}
              sub={`${runningMockServers} running`}
              icon={Server}
              href="/mocks"
            />
          </>
        )}
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Quick Actions</h2>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <Button className="h-12 text-sm gap-2 flex-col" asChild>
            <Link href="/flows/new">
              <Plus className="w-4 h-4" />
              Create Flow
            </Link>
          </Button>
          <Button variant="outline" className="h-12 text-sm gap-2 flex-col" asChild>
            <Link href="/flows">
              <Layers className="w-4 h-4" />
              Browse Flows
            </Link>
          </Button>
          <Button variant="outline" className="h-12 text-sm gap-2 flex-col" asChild>
            <Link href="/executions">
              <Play className="w-4 h-4" />
              Executions
            </Link>
          </Button>
          <Button variant="outline" className="h-12 text-sm gap-2 flex-col" asChild>
            <Link href="/analytics">
              <BarChart3 className="w-4 h-4" />
              Analytics
            </Link>
          </Button>
        </div>
      </div>

      {/* Recent Executions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle className="text-base">Recent Executions</CardTitle>
            <CardDescription className="text-xs">Latest test flow runs</CardDescription>
          </div>
          <Button variant="ghost" size="sm" className="text-xs gap-1" asChild>
            <Link href="/executions">
              View All <ArrowRight className="w-3 h-3" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {execLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : executions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Play className="w-8 h-8 mb-3 opacity-30" />
              <p className="text-sm mb-3">No executions yet</p>
              <Button size="sm" asChild>
                <Link href="/flows/new"><Plus className="w-3.5 h-3.5 mr-1.5" />Create your first flow</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {executions.map((execution) => (
                <Link
                  key={execution.id}
                  href={`/executions/${execution.id}`}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {execution.flow?.name || 'Unknown Flow'}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {execution.passed_steps ?? 0}/{execution.total_steps ?? 0} steps
                      {execution.duration_ms ? ` · ${execution.duration_ms}ms` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground hidden sm:block">
                      {execution.started_at
                        ? formatDistanceToNow(new Date(execution.started_at), { addSuffix: true })
                        : '—'}
                    </span>
                    <ExecutionStatusBadge status={execution.status} />
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
