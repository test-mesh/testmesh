'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useStepPerformance } from '@/lib/hooks/useReports';
import {
  ArrowLeft,
  ArrowUpDown,
  RefreshCw,
  Clock,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import type { StepPerformance } from '@/lib/api/types';

type SortKey = 'avg_duration_ms' | 'execution_count' | 'pass_rate' | 'step_name' | 'action';
type SortOrder = 'asc' | 'desc';

export default function StepPerformancePage() {
  const [dateRange, setDateRange] = useState('30');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('avg_duration_ms');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - parseInt(dateRange) * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const { data, isLoading, refetch } = useStepPerformance({
    start_date: startDate,
    end_date: endDate,
    action: actionFilter !== 'all' ? actionFilter : undefined,
  });

  const steps = data?.step_performance || data?.slowest_steps || [];

  // Extract unique action types for filter
  const actionTypes = useMemo(() => {
    const types = new Set<string>();
    steps.forEach((step) => types.add(step.action));
    return Array.from(types).sort();
  }, [steps]);

  // Sort steps
  const sortedSteps = useMemo(() => {
    return [...steps].sort((a, b) => {
      let comparison = 0;
      switch (sortKey) {
        case 'avg_duration_ms':
          comparison = a.avg_duration_ms - b.avg_duration_ms;
          break;
        case 'execution_count':
          comparison = a.execution_count - b.execution_count;
          break;
        case 'pass_rate':
          comparison = a.pass_rate - b.pass_rate;
          break;
        case 'step_name':
          comparison = a.step_name.localeCompare(b.step_name);
          break;
        case 'action':
          comparison = a.action.localeCompare(b.action);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [steps, sortKey, sortOrder]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  };

  const getPassRateColor = (rate: number) => {
    if (rate >= 95) return 'text-green-600';
    if (rate >= 80) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getDurationBadge = (step: StepPerformance) => {
    const avgMs = step.avg_duration_ms;
    if (avgMs > 5000) return <Badge variant="destructive">Slow</Badge>;
    if (avgMs > 2000) return <Badge variant="outline" className="text-yellow-600 border-yellow-400">Moderate</Badge>;
    return <Badge variant="secondary">Fast</Badge>;
  };

  // Summary statistics
  const summary = useMemo(() => {
    if (steps.length === 0) return null;
    const totalExecutions = steps.reduce((sum, s) => sum + s.execution_count, 0);
    const avgDuration = steps.reduce((sum, s) => sum + s.avg_duration_ms * s.execution_count, 0) / totalExecutions;
    const avgPassRate = steps.reduce((sum, s) => sum + s.pass_rate * s.execution_count, 0) / totalExecutions;
    const slowSteps = steps.filter((s) => s.avg_duration_ms > 5000).length;
    return { totalExecutions, avgDuration, avgPassRate, slowSteps };
  }, [steps]);

  const SortableHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => (
    <TableHead
      className="cursor-pointer hover:bg-muted/50"
      onClick={() => handleSort(sortKeyName)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${sortKey === sortKeyName ? 'opacity-100' : 'opacity-40'}`} />
      </div>
    </TableHead>
  );

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/analytics">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Analytics
          </Button>
        </Link>
      </div>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Step Performance</h1>
          <p className="text-muted-foreground mt-1">
            Analyze individual step execution times and success rates across all flows
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Action type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              {actionTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-36">
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
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Executions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalExecutions.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Avg Duration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatDuration(summary.avgDuration)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Avg Pass Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getPassRateColor(summary.avgPassRate)}`}>
                {summary.avgPassRate.toFixed(1)}%
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Slow Steps
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{summary.slowSteps}</div>
              <p className="text-xs text-muted-foreground">&gt; 5 seconds avg</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle>Step Metrics</CardTitle>
          <CardDescription>
            Click column headers to sort. Performance data aggregated from {data?.start_date} to {data?.end_date}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : sortedSteps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Clock className="h-12 w-12 mb-4" />
              <p>No step performance data available</p>
              <p className="text-sm mt-2">Run some flows to collect step metrics</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader label="Step Name" sortKeyName="step_name" />
                  <SortableHeader label="Action" sortKeyName="action" />
                  <SortableHeader label="Avg Duration" sortKeyName="avg_duration_ms" />
                  <TableHead>P50 / P95 / P99</TableHead>
                  <SortableHeader label="Pass Rate" sortKeyName="pass_rate" />
                  <SortableHeader label="Executions" sortKeyName="execution_count" />
                  <TableHead>Flow</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedSteps.map((step) => (
                  <TableRow key={step.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {step.step_name}
                        {getDurationBadge(step)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{step.action}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{formatDuration(step.avg_duration_ms)}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDuration(step.min_duration_ms)} - {formatDuration(step.max_duration_ms)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="flex gap-2">
                        <span>{formatDuration(step.p50_duration_ms)}</span>
                        <span className="text-muted-foreground">/</span>
                        <span>{formatDuration(step.p95_duration_ms)}</span>
                        <span className="text-muted-foreground">/</span>
                        <span>{formatDuration(step.p99_duration_ms)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={step.pass_rate} className="w-16 h-2" />
                        <span className={`text-sm ${getPassRateColor(step.pass_rate)}`}>
                          {step.pass_rate.toFixed(1)}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{step.execution_count.toLocaleString()}</span>
                        <span className="text-xs">
                          <span className="text-green-600">{step.passed_count}</span>
                          {' / '}
                          <span className="text-red-600">{step.failed_count}</span>
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {step.flow ? (
                        <Link
                          href={`/flows/${step.flow_id}`}
                          className="text-primary hover:underline"
                        >
                          {step.flow.name}
                        </Link>
                      ) : step.flow_id ? (
                        <Link
                          href={`/flows/${step.flow_id}`}
                          className="text-muted-foreground hover:underline"
                        >
                          {step.flow_id.slice(0, 8)}...
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
