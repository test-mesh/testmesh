'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendChart } from '@/components/analytics/TrendChart';
import { FlakinessTable } from '@/components/analytics/FlakinessTable';
import { MetricsSummary } from '@/components/analytics/MetricsCard';
import { useMetrics, useTrends, useFlakiness, useTriggerAggregation } from '@/lib/hooks/useReports';
import {
  BarChart3,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Calendar,
  ArrowRight,
  Clock,
} from 'lucide-react';
import type { GetFlakinessResponse } from '@/lib/api/types';

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState('30');
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - parseInt(dateRange) * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const { data: metricsData, isLoading: metricsLoading } = useMetrics({
    start_date: startDate,
    end_date: endDate,
  });

  const { data: trendsData, isLoading: trendsLoading } = useTrends({
    start_date: startDate,
    end_date: endDate,
    group_by: groupBy,
  });

  const { data: flakinessData, isLoading: flakinessLoading } = useFlakiness({
    limit: 10,
  });

  const triggerAggregation = useTriggerAggregation();

  const handleRefreshData = () => {
    triggerAggregation.mutate({
      start_date: startDate,
      end_date: endDate,
    });
  };

  const flakyFlows = (flakinessData as GetFlakinessResponse)?.flaky_flows || [];

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Execution metrics, trends, and test health insights
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
          <Button
            variant="outline"
            onClick={handleRefreshData}
            disabled={triggerAggregation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${triggerAggregation.isPending ? 'animate-spin' : ''}`} />
            Refresh Data
          </Button>
        </div>
      </div>

      {/* Summary Metrics */}
      {metricsData?.summary && (
        <MetricsSummary
          totalExecutions={metricsData.summary.total_executions}
          passedExecutions={metricsData.summary.passed_executions}
          failedExecutions={metricsData.summary.failed_executions}
          passRate={metricsData.summary.pass_rate}
          avgDurationMs={metricsData.summary.avg_duration_ms}
          flakyCount={flakyFlows.length}
        />
      )}

      {/* Quick Navigation Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mt-6 mb-8">
        <Link href="/analytics/trends">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Trends</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Detailed execution trends and performance analysis
              </p>
              <div className="flex items-center text-sm text-primary mt-2">
                View Details <ArrowRight className="h-4 w-4 ml-1" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/analytics/flakiness">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Flaky Tests</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Identify and track unreliable tests
              </p>
              <div className="flex items-center text-sm text-primary mt-2">
                View Details <ArrowRight className="h-4 w-4 ml-1" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/reports">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Reports</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Generate and download detailed reports
              </p>
              <div className="flex items-center text-sm text-primary mt-2">
                View Details <ArrowRight className="h-4 w-4 ml-1" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/analytics/steps">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Step Performance</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Analyze individual step execution times and success rates
              </p>
              <div className="flex items-center text-sm text-primary mt-2">
                View Details <ArrowRight className="h-4 w-4 ml-1" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="trends" className="space-y-4">
        <TabsList>
          <TabsTrigger value="trends">
            <TrendingUp className="h-4 w-4 mr-2" />
            Trends
          </TabsTrigger>
          <TabsTrigger value="flakiness">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Flaky Tests
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trends" className="space-y-4">
          <div className="flex justify-end">
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

          {trendsLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ) : trendsData?.trends && trendsData.trends.length > 0 ? (
            <TrendChart
              data={trendsData.trends}
              title="Execution Trends"
              showExecutions
              showPassRate
              height={350}
            />
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Calendar className="h-12 w-12 mb-4" />
                <p>No trend data available for the selected period</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={handleRefreshData}
                >
                  Aggregate Data
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="flakiness">
          <Card>
            <CardHeader>
              <CardTitle>Flaky Tests</CardTitle>
              <CardDescription>
                Tests with inconsistent pass/fail patterns that may need attention
              </CardDescription>
            </CardHeader>
            <CardContent>
              {flakinessLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <FlakinessTable data={flakyFlows} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
