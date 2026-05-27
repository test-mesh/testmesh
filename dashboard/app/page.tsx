'use client';

import Link from 'next/link';
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
    <div className={cn(
      'flex flex-col gap-3 p-4 rounded-xl border transition-colors',
      href && 'cursor-pointer',
      highlight
        ? 'bg-teal-400/5 border-teal-400/20 hover:border-teal-400/40'
        : 'bg-[#0f1923] border-[#1e2d3d] hover:border-[#2a3d52]'
    )}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-[#4a6480] uppercase tracking-wider">{title}</span>
        <Icon className={cn('w-3.5 h-3.5', highlight ? 'text-teal-400' : 'text-[#2a3d52]')} />
      </div>
      <div className={cn('text-3xl font-bold leading-none', highlight ? 'text-teal-400' : 'text-[#c8dce8]')}>
        {value}
      </div>
      {sub && <p className="text-[11px] text-[#3d5670]">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function ExecutionStatusBadge({ status }: { status: string }) {
  if (status === 'completed') return (
    <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-teal-400/10 text-teal-400">
      <CheckCircle2 className="w-2.5 h-2.5" />Passed
    </span>
  );
  if (status === 'failed') return (
    <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-400/10 text-red-400">
      <XCircle className="w-2.5 h-2.5" />Failed
    </span>
  );
  if (status === 'running') return (
    <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-400/10 text-blue-400">
      <Clock className="w-2.5 h-2.5 animate-spin" />Running
    </span>
  );
  return (
    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#1a2d3d] text-[#7fa8c8]">{status}</span>
  );
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
    <div className="px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#c8dce8]">Overview</h1>
        <p className="text-xs text-[#3d5670] mt-0.5">Monitor your test flows and execution health</p>
      </div>

      {/* KPI grid */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-6">
        {flowsLoading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-[#0f1923] border border-[#1e2d3d] animate-pulse" />
          ))
        ) : (
          <>
            <KPICard title="Test Flows" value={totalFlows} sub="Active flows" icon={FileText} href="/flows" />
            <KPICard
              title="Executions"
              value={executionsData?.total ?? totalShown}
              sub={`${completedExecutions} passed · ${failedExecutions} failed`}
              icon={Activity}
              href="/executions"
            />
            <KPICard title="Pass Rate" value={`${successRate}%`} sub={`Last ${totalShown} runs`} icon={TrendingUp} highlight />
            <KPICard title="Mock Servers" value={mockServers.length} sub={`${runningMockServers} running`} icon={Server} href="/mocks" />
          </>
        )}
      </div>

      {/* Quick Actions */}
      <div className="mb-6">
        <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-3">Quick Actions</p>
        <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
          <Link
            href="/flows/new"
            className="flex flex-col items-center justify-center gap-1.5 h-14 rounded-xl text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Flow
          </Link>
          {[
            { href: '/flows', icon: Layers, label: 'Browse Flows' },
            { href: '/executions', icon: Play, label: 'Executions' },
            { href: '/analytics', icon: BarChart3, label: 'Analytics' },
          ].map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center justify-center gap-1.5 h-14 rounded-xl text-xs font-medium text-[#7fa8c8] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Executions */}
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a2332]">
          <div>
            <p className="text-[13px] font-semibold text-[#c8dce8]">Recent Executions</p>
            <p className="text-[11px] text-[#3d5670]">Latest test flow runs</p>
          </div>
          <Link
            href="/executions"
            className="flex items-center gap-1 text-[11px] text-[#4a6480] hover:text-teal-400 transition-colors"
          >
            View All <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {execLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-[#131b26] animate-pulse" />
            ))}
          </div>
        ) : executions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Play className="w-8 h-8 mb-3 text-[#1e2d3d]" />
            <p className="text-sm text-[#3d5670] mb-3">No executions yet</p>
            <Link
              href="/flows/new"
              className="flex items-center gap-1.5 h-7 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors"
            >
              <Plus className="w-3 h-3" />Create your first flow
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-[#1a2332]">
            {executions.map((execution) => (
              <Link
                key={execution.id}
                href={`/executions/${execution.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-[#131b26] transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[#c8dce8] truncate group-hover:text-teal-400 transition-colors">
                    {execution.flow?.name || 'Unknown Flow'}
                  </div>
                  <div className="text-[11px] text-[#3d5670] mt-0.5">
                    {execution.passed_steps ?? 0}/{execution.total_steps ?? 0} steps
                    {execution.duration_ms ? ` · ${execution.duration_ms}ms` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] text-[#3d5670] hidden sm:block">
                    {execution.started_at
                      ? formatDistanceToNow(new Date(execution.started_at), { addSuffix: true })
                      : '—'}
                  </span>
                  <ExecutionStatusBadge status={execution.status} />
                  <ArrowRight className="w-3 h-3 text-[#3d5670] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
