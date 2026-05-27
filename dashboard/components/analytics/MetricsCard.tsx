'use client';

import { cn } from '@/lib/utils';

interface MetricsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  valueClassName?: string;
  className?: string;
}

export function MetricsCard({ title, value, subtitle, icon, valueClassName, className }: MetricsCardProps) {
  return (
    <div className={cn('flex flex-col gap-3 p-4 rounded-xl bg-[#0f1923] border border-[#1e2d3d]', className)}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{title}</span>
        {icon && <div className="text-[#2a3d52]">{icon}</div>}
      </div>
      <p className={cn('text-2xl font-bold leading-none tabular-nums text-[#c8dce8]', valueClassName)}>{value}</p>
      {subtitle && <p className="text-[11px] text-[#4a6480]">{subtitle}</p>}
    </div>
  );
}

interface MetricsSummaryProps {
  totalExecutions: number;
  passedExecutions: number;
  failedExecutions: number;
  passRate: number;
  avgDurationMs: number;
  flakyCount?: number;
}

export function MetricsSummary({
  totalExecutions,
  passedExecutions,
  failedExecutions,
  passRate,
  avgDurationMs,
  flakyCount,
}: MetricsSummaryProps) {
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const passRateColor = passRate >= 90 ? 'text-teal-400' : passRate >= 70 ? 'text-yellow-400' : 'text-red-400';
  const flakyColor = (flakyCount ?? 0) > 0 ? 'text-yellow-400' : 'text-[#c8dce8]';

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      <MetricsCard
        title="Total Executions"
        value={totalExecutions}
        subtitle={`${passedExecutions} passed, ${failedExecutions} failed`}
      />
      <MetricsCard
        title="Pass Rate"
        value={`${passRate.toFixed(1)}%`}
        valueClassName={passRateColor}
      />
      <MetricsCard
        title="Avg Duration"
        value={formatDuration(avgDurationMs)}
      />
      {flakyCount !== undefined && (
        <MetricsCard
          title="Flaky Tests"
          value={flakyCount}
          valueClassName={flakyColor}
        />
      )}
    </div>
  );
}
