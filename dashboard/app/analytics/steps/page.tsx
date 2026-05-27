'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStepPerformance } from '@/lib/hooks/useReports';
import {
  ArrowLeft,
  ArrowUpDown,
  RefreshCw,
  Clock,
  Zap,
  AlertTriangle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StepPerformance } from '@/lib/api/types';

type SortKey = 'avg_duration_ms' | 'execution_count' | 'pass_rate' | 'step_name' | 'action';
type SortOrder = 'asc' | 'desc';

export default function StepPerformancePage() {
  const [dateRange, setDateRange] = useState('30');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('avg_duration_ms');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [topFailuresOpen, setTopFailuresOpen] = useState(false);

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - parseInt(dateRange) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data, isLoading, refetch } = useStepPerformance({
    start_date: startDate,
    end_date: endDate,
    action: actionFilter !== 'all' ? actionFilter : undefined,
  });

  const steps = data?.step_performance || data?.slowest_steps || [];

  const actionTypes = useMemo(() => {
    const types = new Set<string>();
    steps.forEach((step) => types.add(step.action));
    return Array.from(types).sort();
  }, [steps]);

  const sortedSteps = useMemo(() => {
    return [...steps].sort((a, b) => {
      let comparison = 0;
      switch (sortKey) {
        case 'avg_duration_ms': comparison = a.avg_duration_ms - b.avg_duration_ms; break;
        case 'execution_count': comparison = a.execution_count - b.execution_count; break;
        case 'pass_rate':       comparison = a.pass_rate - b.pass_rate; break;
        case 'step_name':       comparison = a.step_name.localeCompare(b.step_name); break;
        case 'action':          comparison = a.action.localeCompare(b.action); break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [steps, sortKey, sortOrder]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortOrder('desc'); }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  };

  const getPassRateColor = (rate: number) => {
    if (rate >= 95) return 'text-teal-400';
    if (rate >= 80) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getDurationLabel = (step: StepPerformance) => {
    if (step.avg_duration_ms > 5000) return { label: 'Slow', cls: 'bg-red-400/10 text-red-400' };
    if (step.avg_duration_ms > 2000) return { label: 'Moderate', cls: 'bg-yellow-400/10 text-yellow-400' };
    return { label: 'Fast', cls: 'bg-teal-400/10 text-teal-400' };
  };

  const summary = useMemo(() => {
    if (steps.length === 0) return null;
    const totalExecutions = steps.reduce((sum, s) => sum + s.execution_count, 0);
    const avgDuration = steps.reduce((sum, s) => sum + s.avg_duration_ms * s.execution_count, 0) / totalExecutions;
    const avgPassRate = steps.reduce((sum, s) => sum + s.pass_rate * s.execution_count, 0) / totalExecutions;
    const slowSteps = steps.filter((s) => s.avg_duration_ms > 5000).length;
    return { totalExecutions, avgDuration, avgPassRate, slowSteps };
  }, [steps]);

  const topFailures = useMemo(() => {
    return [...steps].filter((s) => s.failed_count > 0).sort((a, b) => b.failed_count - a.failed_count).slice(0, 10);
  }, [steps]);

  const SortableHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => (
    <button
      onClick={() => handleSort(sortKeyName)}
      className="flex items-center gap-1 text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider hover:text-[#7fa8c8] transition-colors"
    >
      {label}
      <ArrowUpDown className={cn('h-2.5 w-2.5', sortKey === sortKeyName ? 'opacity-100 text-teal-400' : 'opacity-40')} />
    </button>
  );

  return (
    <div className="px-6 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/analytics" className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <Zap className="h-4 w-4 text-[#3d5670]" />
          <h1 className="text-xl font-semibold text-[#c8dce8]">Step Performance</h1>
          <p className="text-xs text-[#3d5670] mt-0.5">Analyze individual step execution times and success rates</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="h-7 text-xs bg-[#0f1923] border-[#1e2d3d] text-[#7fa8c8] w-40 focus:ring-0 focus:ring-offset-0">
              <SelectValue placeholder="Action type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              {actionTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="h-7 text-xs bg-[#0f1923] border-[#1e2d3d] text-[#7fa8c8] w-36 focus:ring-0 focus:ring-offset-0">
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
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] transition-colors"
          >
            <RefreshCw className="h-3 w-3" />Refresh
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      {summary && (
        <div className="grid gap-3 grid-cols-4">
          {[
            { label: 'Total Executions', value: summary.totalExecutions.toLocaleString(), cls: 'text-[#c8dce8]', icon: <Zap className="h-3.5 w-3.5 text-[#4a6480]" /> },
            { label: 'Avg Duration', value: formatDuration(summary.avgDuration), cls: 'text-[#c8dce8]', icon: <Clock className="h-3.5 w-3.5 text-[#4a6480]" /> },
            { label: 'Avg Pass Rate', value: `${summary.avgPassRate.toFixed(1)}%`, cls: getPassRateColor(summary.avgPassRate), icon: <Zap className="h-3.5 w-3.5 text-[#4a6480]" /> },
            { label: 'Slow Steps (>5s)', value: String(summary.slowSteps), cls: 'text-yellow-400', icon: <AlertTriangle className="h-3.5 w-3.5 text-[#4a6480]" /> },
          ].map((kpi) => (
            <div key={kpi.label} className="flex flex-col gap-2 p-4 rounded-xl bg-[#0f1923] border border-[#1e2d3d]">
              <div className="flex items-center gap-1.5">
                {kpi.icon}
                <span className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{kpi.label}</span>
              </div>
              <p className={cn('text-2xl font-bold leading-none tabular-nums', kpi.cls)}>{kpi.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Top Failures Panel */}
      {topFailures.length > 0 && (
        <div className="rounded-xl bg-[#0f1923] border border-red-400/20 overflow-hidden">
          <button
            onClick={() => setTopFailuresOpen(!topFailuresOpen)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[#131b26] transition-colors"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-red-400" />
              <span className="text-[11px] font-semibold text-[#c8dce8]">Top Failures</span>
              <span className="text-[9px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none">{topFailures.length}</span>
              <span className="text-[10px] text-[#4a6480]">Steps with the highest failure count</span>
            </div>
            {topFailuresOpen ? <ChevronDown className="h-3.5 w-3.5 text-[#3d5670]" /> : <ChevronRight className="h-3.5 w-3.5 text-[#3d5670]" />}
          </button>
          {topFailuresOpen && (
            <>
              <div className="grid grid-cols-[1.5fr_1.5fr_1fr_auto_auto_2fr] gap-4 px-4 py-2 bg-[#0b0f18] border-t border-[#1a2332]">
                {['Step', 'Flow', 'Action', 'Failures', 'Failure %', 'Common Error'].map((h) => (
                  <span key={h} className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{h}</span>
                ))}
              </div>
              <div className="divide-y divide-[#1a2332]">
                {topFailures.map((step) => (
                  <div key={step.id} className="grid grid-cols-[1.5fr_1.5fr_1fr_auto_auto_2fr] gap-4 px-4 py-2.5 items-center hover:bg-[#131b26] transition-colors">
                    <span className="text-[12px] font-medium text-[#c8dce8]">{step.step_name}</span>
                    <span>
                      {step.flow ? (
                        <Link href={`/flows/${step.flow_id}`} className="text-[11px] text-teal-400/80 hover:text-teal-400 transition-colors">{step.flow.name}</Link>
                      ) : <span className="text-[11px] text-[#3d5670]">—</span>}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#1a2d3d] text-[#4a7a96]">{step.action}</span>
                    <span className="text-[12px] font-semibold text-red-400">{step.failed_count}</span>
                    <span className="text-[11px] text-red-400">
                      {step.execution_count > 0 ? `${((step.failed_count / step.execution_count) * 100).toFixed(1)}%` : '—'}
                    </span>
                    <span className="text-[11px] text-[#4a6480] truncate">
                      {step.common_errors?.[0] ? (
                        <span title={step.common_errors[0]}>{step.common_errors[0].length > 80 ? step.common_errors[0].slice(0, 80) + '…' : step.common_errors[0]}</span>
                      ) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Step Metrics Table */}
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#1a2332]">
          <span className="text-[11px] font-semibold text-[#c8dce8]">Step Metrics</span>
          <span className="text-[10px] text-[#4a6480] ml-2">
            Click column headers to sort. Data from {data?.start_date} to {data?.end_date}.
          </span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><RefreshCw className="h-5 w-5 animate-spin text-[#3d5670]" /></div>
        ) : sortedSteps.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Clock className="h-10 w-10 mb-3 text-[#1e2d3d]" />
            <p className="text-xs text-[#3d5670]">No step performance data available</p>
            <p className="text-[11px] text-[#2a3d52] mt-1">Run some flows to collect step metrics</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[2fr_1fr_1.5fr_1.5fr_1.5fr_1.5fr_1.5fr] gap-4 px-4 py-2.5 border-b border-[#1a2332]">
              <SortableHeader label="Step Name" sortKeyName="step_name" />
              <SortableHeader label="Action" sortKeyName="action" />
              <SortableHeader label="Avg Duration" sortKeyName="avg_duration_ms" />
              <span className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">P50 / P95 / P99</span>
              <SortableHeader label="Pass Rate" sortKeyName="pass_rate" />
              <SortableHeader label="Executions" sortKeyName="execution_count" />
              <span className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">Flow</span>
            </div>
            <div className="divide-y divide-[#1a2332]">
              {sortedSteps.map((step) => {
                const dur = getDurationLabel(step);
                return (
                  <div key={step.id} className="grid grid-cols-[2fr_1fr_1.5fr_1.5fr_1.5fr_1.5fr_1.5fr] gap-4 px-4 py-2.5 items-center hover:bg-[#131b26] transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-[#c8dce8]">{step.step_name}</span>
                      <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded', dur.cls)}>{dur.label}</span>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#1a2d3d] text-[#4a7a96] w-fit">{step.action}</span>
                    <div>
                      <div className="text-[12px] font-semibold text-[#c8dce8]">{formatDuration(step.avg_duration_ms)}</div>
                      <div className="text-[10px] text-[#3d5670]">{formatDuration(step.min_duration_ms)} – {formatDuration(step.max_duration_ms)}</div>
                    </div>
                    <div className="flex gap-1 text-[11px]">
                      <span className="text-[#7fa8c8]">{formatDuration(step.p50_duration_ms)}</span>
                      <span className="text-[#2a3d52]">/</span>
                      <span className="text-[#7fa8c8]">{formatDuration(step.p95_duration_ms)}</span>
                      <span className="text-[#2a3d52]">/</span>
                      <span className="text-[#7fa8c8]">{formatDuration(step.p99_duration_ms)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-14 h-1.5 bg-[#1a2332] rounded-full overflow-hidden">
                        <div className="h-full bg-teal-400 rounded-full" style={{ width: `${step.pass_rate}%` }} />
                      </div>
                      <span className={cn('text-[11px] font-semibold', getPassRateColor(step.pass_rate))}>
                        {step.pass_rate.toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      <div className="text-[12px] text-[#c8dce8]">{step.execution_count.toLocaleString()}</div>
                      <div className="text-[10px]">
                        <span className="text-teal-400">{step.passed_count}</span>
                        <span className="text-[#3d5670]"> / </span>
                        <span className="text-red-400">{step.failed_count}</span>
                      </div>
                    </div>
                    <span>
                      {step.flow ? (
                        <Link href={`/flows/${step.flow_id}`} className="text-[11px] text-teal-400/80 hover:text-teal-400 transition-colors">{step.flow.name}</Link>
                      ) : step.flow_id ? (
                        <Link href={`/flows/${step.flow_id}`} className="text-[11px] text-[#4a6480] hover:text-[#7fa8c8] transition-colors">{step.flow_id.slice(0, 8)}…</Link>
                      ) : (
                        <span className="text-[11px] text-[#3d5670]">—</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
