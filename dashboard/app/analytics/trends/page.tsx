'use client';

import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendChart } from '@/components/analytics/TrendChart';
import { MetricsCard } from '@/components/analytics/MetricsCard';
import { useTrends, useMetrics, useStepPerformance } from '@/lib/hooks/useReports';
import { RefreshCw, ArrowLeft, Clock, Zap } from 'lucide-react';
import Link from 'next/link';

export default function TrendsPage() {
  const [dateRange, setDateRange] = useState('30');
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - parseInt(dateRange) * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const { data: trendsData, isLoading: trendsLoading } = useTrends({
    start_date: startDate,
    end_date: endDate,
    group_by: groupBy,
  });

  const { data: metricsData } = useMetrics({
    start_date: startDate,
    end_date: endDate,
  });

  const { data: stepData, isLoading: stepsLoading } = useStepPerformance({
    start_date: startDate,
    end_date: endDate,
  });

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const passRateColor = (rate: number) =>
    rate >= 90 ? 'text-teal-400' : rate >= 70 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="px-6 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/analytics" className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <Clock className="h-4 w-4 text-[#3d5670]" />
          <h1 className="text-xl font-semibold text-[#c8dce8]">Execution Trends</h1>
          <p className="text-xs text-[#3d5670] mt-0.5">Detailed analysis of test execution patterns over time</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="h-7 w-36 text-xs bg-[#0f1923] border-[#1e2d3d] text-[#c8dce8]">
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as 'day' | 'week' | 'month')}>
            <SelectTrigger className="h-7 w-28 text-xs bg-[#0f1923] border-[#1e2d3d] text-[#c8dce8]">
              <SelectValue placeholder="Group by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Daily</SelectItem>
              <SelectItem value="week">Weekly</SelectItem>
              <SelectItem value="month">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Stats */}
      {metricsData?.summary && (
        <div className="grid grid-cols-4 gap-3">
          <MetricsCard
            title="Total Executions"
            value={metricsData.summary.total_executions}
            icon={<Zap className="h-4 w-4" />}
          />
          <MetricsCard
            title="Pass Rate"
            value={`${metricsData.summary.pass_rate.toFixed(1)}%`}
            valueClassName={passRateColor(metricsData.summary.pass_rate)}
          />
          <MetricsCard
            title="Avg Duration"
            value={formatDuration(metricsData.summary.avg_duration_ms)}
            icon={<Clock className="h-4 w-4" />}
          />
          <MetricsCard
            title="Steps"
            value={`${metricsData.summary.passed_steps} / ${metricsData.summary.total_steps}`}
            subtitle="passed / total"
          />
        </div>
      )}

      {/* Trend Charts */}
      <div className="space-y-4">
        {trendsLoading ? (
          <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-[#3d5670]" />
          </div>
        ) : trendsData?.trends && trendsData.trends.length > 0 ? (
          <>
            <TrendChart
              data={trendsData.trends}
              title="Executions & Pass Rate"
              showExecutions
              showPassRate
              height={300}
            />
            <TrendChart
              data={trendsData.trends}
              title="Average Duration"
              showExecutions={false}
              showPassRate={false}
              showDuration
              height={250}
            />
          </>
        ) : (
          <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] flex items-center justify-center py-12">
            <p className="text-xs text-[#4a6480]">No trend data available for the selected period</p>
          </div>
        )}
      </div>

      {/* Slowest Steps */}
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#1a2332] flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-[#4a6480]" />
          <span className="text-[11px] font-semibold text-[#c8dce8]">Slowest Steps</span>
        </div>

        {stepsLoading ? (
          <div className="flex items-center justify-center py-10">
            <RefreshCw className="h-5 w-5 animate-spin text-[#3d5670]" />
          </div>
        ) : stepData?.slowest_steps && stepData.slowest_steps.length > 0 ? (
          <div className="divide-y divide-[#1a2332]">
            <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1.5fr_1fr] gap-0">
              {['Flow', 'Step', 'Action', 'Avg Duration', 'Pass Rate', 'Executions'].map((h) => (
                <div key={h} className="px-4 py-2 bg-[#0b0f18] text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{h}</div>
              ))}
            </div>
            {stepData.slowest_steps.slice(0, 10).map((step) => (
              <div key={step.id} className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1.5fr_1fr] gap-0 hover:bg-[#131b26] transition-colors">
                <div className="px-4 py-2.5 flex items-center">
                  {step.flow ? (
                    <Link href={`/flows/${step.flow_id}`} className="text-xs font-medium text-[#7fa8c8] hover:text-teal-400 transition-colors truncate">
                      {step.flow.name}
                    </Link>
                  ) : (
                    <span className="text-xs text-[#4a6480] font-mono">{step.flow_id.slice(0, 8)}…</span>
                  )}
                </div>
                <div className="px-4 py-2.5 flex items-center">
                  <span className="text-xs text-[#c8dce8] truncate">{step.step_name || step.step_id}</span>
                </div>
                <div className="px-4 py-2.5 flex items-center">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#4a7a96]">{step.action}</span>
                </div>
                <div className="px-4 py-2.5 flex items-center">
                  <span className="text-xs font-mono text-[#c8dce8]">{formatDuration(step.avg_duration_ms)}</span>
                </div>
                <div className="px-4 py-2.5 flex items-center gap-2">
                  <div className="w-14 h-1.5 bg-[#1a2332] rounded-full overflow-hidden">
                    <div className="h-full bg-teal-400 rounded-full" style={{ width: `${step.pass_rate}%` }} />
                  </div>
                  <span className="text-xs text-[#7fa8c8]">{step.pass_rate.toFixed(1)}%</span>
                </div>
                <div className="px-4 py-2.5 flex items-center">
                  <span className="text-xs text-[#7fa8c8]">{step.execution_count}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center py-10 text-xs text-[#4a6480]">No step performance data available</p>
        )}
      </div>
    </div>
  );
}
