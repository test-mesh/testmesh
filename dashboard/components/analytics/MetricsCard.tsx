'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    isPositive?: boolean;
    label?: string;
  };
  className?: string;
  valueClassName?: string;
}

export function MetricsCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  className,
  valueClassName,
}: MetricsCardProps) {
  const getTrendIcon = () => {
    if (!trend) return null;
    if (trend.value === 0) return <Minus className="h-4 w-4" />;
    if (trend.value > 0) return <TrendingUp className="h-4 w-4" />;
    return <TrendingDown className="h-4 w-4" />;
  };

  const getTrendColor = () => {
    if (!trend) return '';
    if (trend.value === 0) return 'text-muted-foreground';
    if (trend.isPositive !== undefined) {
      return trend.isPositive ? 'text-green-600' : 'text-red-600';
    }
    return trend.value > 0 ? 'text-green-600' : 'text-red-600';
  };

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-bold', valueClassName)}>{value}</div>
        <div className="flex items-center justify-between mt-1">
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
          {trend && (
            <div className={cn('flex items-center gap-1 text-xs', getTrendColor())}>
              {getTrendIcon()}
              <span>{Math.abs(trend.value).toFixed(1)}%</span>
              {trend.label && <span className="text-muted-foreground">{trend.label}</span>}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
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

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <MetricsCard
        title="Total Executions"
        value={totalExecutions}
        subtitle={`${passedExecutions} passed, ${failedExecutions} failed`}
      />
      <MetricsCard
        title="Pass Rate"
        value={`${passRate.toFixed(1)}%`}
        valueClassName={passRate >= 90 ? 'text-green-600' : passRate >= 70 ? 'text-yellow-600' : 'text-red-600'}
      />
      <MetricsCard
        title="Avg Duration"
        value={formatDuration(avgDurationMs)}
      />
      {flakyCount !== undefined && (
        <MetricsCard
          title="Flaky Tests"
          value={flakyCount}
          valueClassName={flakyCount > 0 ? 'text-yellow-600' : ''}
        />
      )}
    </div>
  );
}
