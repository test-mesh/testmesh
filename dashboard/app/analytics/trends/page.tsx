'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendChart } from '@/components/analytics/TrendChart';
import { MetricsCard } from '@/components/analytics/MetricsCard';
import { useTrends, useMetrics, useStepPerformance } from '@/lib/hooks/useReports';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
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

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/analytics">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Execution Trends</h1>
          <p className="text-muted-foreground mt-1">
            Detailed analysis of test execution patterns over time
          </p>
        </div>
        <div className="flex items-center gap-4">
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
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
            <SelectTrigger className="w-32">
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
        <div className="grid gap-4 md:grid-cols-4 mb-8">
          <MetricsCard
            title="Total Executions"
            value={metricsData.summary.total_executions}
            icon={<Zap className="h-4 w-4" />}
          />
          <MetricsCard
            title="Pass Rate"
            value={`${metricsData.summary.pass_rate.toFixed(1)}%`}
            valueClassName={
              metricsData.summary.pass_rate >= 90
                ? 'text-green-600'
                : metricsData.summary.pass_rate >= 70
                ? 'text-yellow-600'
                : 'text-red-600'
            }
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
      <div className="space-y-6">
        {trendsLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
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
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <p>No trend data available for the selected period</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Slowest Steps */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Slowest Steps</CardTitle>
        </CardHeader>
        <CardContent>
          {stepsLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : stepData?.slowest_steps && stepData.slowest_steps.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Flow</TableHead>
                  <TableHead>Step</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Avg Duration</TableHead>
                  <TableHead>Pass Rate</TableHead>
                  <TableHead>Executions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stepData.slowest_steps.slice(0, 10).map((step) => (
                  <TableRow key={step.id}>
                    <TableCell>
                      {step.flow ? (
                        <Link
                          href={`/flows/${step.flow_id}`}
                          className="font-medium hover:underline"
                        >
                          {step.flow.name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">
                          {step.flow_id.slice(0, 8)}...
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{step.step_name || step.step_id}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">
                        {step.action}
                      </code>
                    </TableCell>
                    <TableCell className="font-mono">
                      {formatDuration(step.avg_duration_ms)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={step.pass_rate} className="w-16 h-2" />
                        <span className="text-sm">{step.pass_rate.toFixed(1)}%</span>
                      </div>
                    </TableCell>
                    <TableCell>{step.execution_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center py-8 text-muted-foreground">
              No step performance data available
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
