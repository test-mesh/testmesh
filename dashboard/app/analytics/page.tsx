'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendChart } from '@/components/analytics/TrendChart';
import { FlakinessTable } from '@/components/analytics/FlakinessTable';
import { MetricsSummary } from '@/components/analytics/MetricsCard';
import { DiscoveredFlowsTable } from '@/components/analytics/DiscoveredFlowsTable';
import { DriftAlerts } from '@/components/analytics/DriftAlerts';
import {
  useMetrics,
  useTrends,
  useFlakiness,
  useTriggerAggregation,
  useGenerateReport,
  useDownloadReport,
  useReports,
  useReport,
} from '@/lib/hooks/useReports';
import { useAnalyzeCoverage, useCoverageAnalyses } from '@/lib/hooks/useAI';
import { getActiveWorkspaceId } from '@/lib/hooks/useWorkspaces';
import {
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Calendar,
  Clock,
  Target,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  History,
  Download,
  FileDown,
  BarChart3,
  Activity,
  Wifi,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type {
  GetFlakinessResponse,
  AnalyzeCoverageResponse,
  EndpointCoverage,
  ReportFormat,
} from '@/lib/api/types';

// ── Coverage sub-components ───────────────────────────────────────────────────

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    POST: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    PUT: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    PATCH: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold ${colors[method.toUpperCase()] || 'bg-muted text-muted-foreground'}`}>
      {method.toUpperCase()}
    </span>
  );
}

function EndpointRow({
  endpoint,
  status,
}: {
  endpoint: EndpointCoverage;
  status: 'covered' | 'uncovered' | 'partial';
}) {
  const [expanded, setExpanded] = useState(false);
  const icons = {
    covered: <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />,
    uncovered: <XCircle className="h-4 w-4 text-red-500 shrink-0" />,
    partial: <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0" />,
  };
  const hasMeta =
    endpoint.description ||
    (endpoint.flow_ids?.length ?? 0) > 0 ||
    (endpoint.missing_tests?.length ?? 0) > 0;
  return (
    <div className="border rounded-lg">
      <button
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
        onClick={() => hasMeta && setExpanded(!expanded)}
      >
        {icons[status]}
        <MethodBadge method={endpoint.method} />
        <span className="font-mono text-sm flex-1">{endpoint.path}</span>
        {status === 'partial' && (
          <Badge variant="outline" className="text-xs">{Math.round(endpoint.coverage * 100)}%</Badge>
        )}
        {hasMeta && (
          expanded
            ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {expanded && hasMeta && (
        <div className="px-4 pb-3 space-y-2 border-t">
          {endpoint.description && (
            <p className="text-sm text-muted-foreground pt-2">{endpoint.description}</p>
          )}
          {(endpoint.flow_ids?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium mb-1">Covered by flows:</p>
              <div className="flex flex-wrap gap-1">
                {(endpoint.flow_ids ?? []).map((id) => (
                  <Link key={id} href={`/flows/${id}`}>
                    <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-secondary/80">
                      {id.slice(0, 8)}…
                    </Badge>
                  </Link>
                ))}
              </div>
            </div>
          )}
          {(endpoint.missing_tests?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium mb-1">Missing test cases:</p>
              <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                {(endpoint.missing_tests ?? []).map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CoverageResults({
  result,
  onReset,
}: {
  result: AnalyzeCoverageResponse;
  onReset: () => void;
}) {
  const coverageColor =
    result.coverage_percent >= 80
      ? 'text-green-600'
      : result.coverage_percent >= 50
      ? 'text-yellow-600'
      : 'text-red-600';
  return (
    <div className="space-y-6">
      <Button variant="outline" size="sm" onClick={onReset}>
        <Target className="h-4 w-4 mr-2" />
        Analyze Another
      </Button>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{result.spec_name || 'Coverage Analysis'}</span>
            <span className={`text-3xl font-bold ${coverageColor}`}>
              {Math.round(result.coverage_percent)}%
            </span>
          </CardTitle>
          <CardDescription>
            {result.covered_endpoints} of {result.total_endpoints} endpoints covered
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={result.coverage_percent} className="h-3" />
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-600">{result.covered?.length ?? 0}</div>
              <div className="text-xs text-muted-foreground">Covered</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600">{result.partial?.length ?? 0}</div>
              <div className="text-xs text-muted-foreground">Partial</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">{result.uncovered?.length ?? 0}</div>
              <div className="text-xs text-muted-foreground">Uncovered</div>
            </div>
          </div>
        </CardContent>
      </Card>
      {(result.uncovered?.length ?? 0) > 0 && (
        <div>
          <h3 className="font-medium mb-3 flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-500" />
            Uncovered Endpoints ({result.uncovered.length})
          </h3>
          <div className="space-y-2">
            {result.uncovered.map((ep, i) => <EndpointRow key={i} endpoint={ep} status="uncovered" />)}
          </div>
        </div>
      )}
      {(result.partial?.length ?? 0) > 0 && (
        <div>
          <h3 className="font-medium mb-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-yellow-500" />
            Partially Covered ({result.partial.length})
          </h3>
          <div className="space-y-2">
            {result.partial.map((ep, i) => <EndpointRow key={i} endpoint={ep} status="partial" />)}
          </div>
        </div>
      )}
      {(result.covered?.length ?? 0) > 0 && (
        <div>
          <h3 className="font-medium mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            Covered Endpoints ({result.covered.length})
          </h3>
          <div className="space-y-2">
            {result.covered.map((ep, i) => <EndpointRow key={i} endpoint={ep} status="covered" />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState('30');
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');

  // Coverage state
  const [coverageSpec, setCoverageSpec] = useState('');
  const [coverageBaseUrl, setCoverageBaseUrl] = useState('');
  const [coverageResult, setCoverageResult] = useState<AnalyzeCoverageResponse | null>(null);
  const analyzeCoverage = useAnalyzeCoverage();
  const { data: coverageHistoryData } = useCoverageAnalyses({ limit: 5 });
  const recentAnalyses = coverageHistoryData?.analyses || [];

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - parseInt(dateRange) * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const { data: metricsData } = useMetrics({ start_date: startDate, end_date: endDate });
  const { data: trendsData, isLoading: trendsLoading } = useTrends({
    start_date: startDate,
    end_date: endDate,
    group_by: groupBy,
  });
  const { data: flakinessData, isLoading: flakinessLoading } = useFlakiness({ limit: 10 });
  const triggerAggregation = useTriggerAggregation();

  // Export dialog state
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ReportFormat>('html');
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const generateReport = useGenerateReport();
  const downloadReport = useDownloadReport();
  const { data: recentReportsData } = useReports({ limit: 5 });
  const recentReports = recentReportsData?.reports || [];
  const { data: generatingReport } = useReport(generatingId ?? '');

  const handleExport = () => {
    generateReport.mutate(
      {
        name: `Analytics Export ${new Date().toISOString().split('T')[0]}`,
        format: exportFormat,
        start_date: startDate,
        end_date: endDate,
      },
      {
        onSuccess: (report) => setGeneratingId(report.id),
      }
    );
  };

  const handleDownloadGenerated = () => {
    if (!generatingReport) return;
    const ext = generatingReport.format === 'junit' ? 'xml' : generatingReport.format;
    downloadReport.mutate({ id: generatingReport.id, filename: `${generatingReport.name}.${ext}` });
    setGeneratingId(null);
    setExportDialogOpen(false);
  };

  const handleRefreshData = () => {
    triggerAggregation.mutate({ start_date: startDate, end_date: endDate });
  };

  const handleAnalyzeCoverage = async () => {
    try {
      const response = await analyzeCoverage.mutateAsync({
        spec: coverageSpec,
        base_url: coverageBaseUrl || undefined,
        workspace_id: getActiveWorkspaceId() ?? undefined,
      });
      setCoverageResult(response);
    } catch (error) {
      console.error('Coverage analysis failed:', error);
    }
  };

  const flakyFlows = (flakinessData as GetFlakinessResponse)?.flaky_flows || [];
  const summary = metricsData?.summary;

  return (
    <div className="container mx-auto py-8">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Execution metrics, trends, and test health insights</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-36 h-8 text-sm">
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

          <Dialog
            open={exportDialogOpen}
            onOpenChange={(open) => {
              if (!open) { setGeneratingId(null); setExportFormat('html'); }
              setExportDialogOpen(open);
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <FileDown className="h-3.5 w-3.5 mr-1.5" />
                Export
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Export Report</DialogTitle>
                <DialogDescription>
                  Generate a report for {startDate} to {endDate}.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label>Format</Label>
                <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as ReportFormat)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="html">HTML (with charts)</SelectItem>
                    <SelectItem value="json">JSON (raw data)</SelectItem>
                    <SelectItem value="junit">JUnit XML (CI/CD)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {generatingId && generatingReport && (
                <div className="rounded-md border p-3 space-y-2">
                  {generatingReport.status === 'completed' ? (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-green-600 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" /> Report ready
                      </span>
                      <Button size="sm" onClick={handleDownloadGenerated}>
                        <Download className="h-4 w-4 mr-2" /> Download
                      </Button>
                    </div>
                  ) : generatingReport.status === 'failed' ? (
                    <p className="text-sm text-red-600 flex items-center gap-2">
                      <XCircle className="h-4 w-4" />{generatingReport.error || 'Generation failed'}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {generatingReport.status === 'generating' ? 'Generating…' : 'Queued…'}
                    </p>
                  )}
                </div>
              )}
              {recentReports.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Recent Exports</Label>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {recentReports.map((r) => (
                      <div key={r.id} className="flex items-center justify-between text-sm p-2 rounded hover:bg-muted">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs text-muted-foreground uppercase font-mono">{r.format}</span>
                          <span className="truncate">{r.name}</span>
                        </div>
                        {r.status === 'completed' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const ext = r.format === 'junit' ? 'xml' : r.format;
                              downloadReport.mutate({ id: r.id, filename: `${r.name}.${ext}` });
                            }}
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setExportDialogOpen(false)}>Cancel</Button>
                <Button
                  onClick={handleExport}
                  disabled={
                    generateReport.isPending ||
                    (!!generatingId &&
                      generatingReport?.status !== 'completed' &&
                      generatingReport?.status !== 'failed')
                  }
                >
                  {generateReport.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</>
                  ) : (
                    <><FileDown className="h-4 w-4 mr-2" />Generate</>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={handleRefreshData}
            disabled={triggerAggregation.isPending}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${triggerAggregation.isPending ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* 5-tab layout */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="h-9">
          <TabsTrigger value="overview" className="text-sm gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="trends" className="text-sm gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            Trends
          </TabsTrigger>
          <TabsTrigger value="flakiness" className="text-sm gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Flakiness
          </TabsTrigger>
          <TabsTrigger value="coverage" className="text-sm gap-1.5">
            <Target className="h-3.5 w-3.5" />
            Coverage
          </TabsTrigger>
          <TabsTrigger value="telemetry" className="text-sm gap-1.5">
            <Wifi className="h-3.5 w-3.5" />
            Telemetry
          </TabsTrigger>
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="space-y-6">
          {summary ? (
            <MetricsSummary
              totalExecutions={summary.total_executions}
              passedExecutions={summary.passed_executions}
              failedExecutions={summary.failed_executions}
              passRate={summary.pass_rate}
              avgDurationMs={summary.avg_duration_ms}
              flakyCount={flakyFlows.length}
            />
          ) : (
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
          )}
          {trendsLoading ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : trendsData?.trends && trendsData.trends.length > 0 ? (
            <TrendChart
              data={trendsData.trends}
              title="Execution Trends"
              showExecutions
              showPassRate
              height={260}
            />
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <Activity className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">No trend data for the selected period</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={handleRefreshData}>
                  Aggregate Data
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Trends ── */}
        <TabsContent value="trends" className="space-y-4">
          <div className="flex justify-end">
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as 'day' | 'week' | 'month')}>
              <SelectTrigger className="w-32 h-8 text-sm">
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
            <Skeleton className="h-80 rounded-xl" />
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
                <Calendar className="h-12 w-12 mb-4 opacity-30" />
                <p>No trend data available for the selected period</p>
                <Button variant="outline" className="mt-4" onClick={handleRefreshData}>
                  Aggregate Data
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Flakiness ── */}
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
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
                </div>
              ) : (
                <FlakinessTable data={flakyFlows} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Coverage ── */}
        <TabsContent value="coverage" className="space-y-4">
          {coverageResult ? (
            <CoverageResults
              result={coverageResult}
              onReset={() => { setCoverageResult(null); setCoverageSpec(''); setCoverageBaseUrl(''); }}
            />
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    API Coverage Analysis
                  </CardTitle>
                  <CardDescription>
                    Paste your OpenAPI specification to see which endpoints are covered by your test flows
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="coverage-spec">OpenAPI Specification</Label>
                    <Textarea
                      id="coverage-spec"
                      placeholder="Paste your OpenAPI 3.0 or Swagger 2.0 specification (JSON or YAML)..."
                      value={coverageSpec}
                      onChange={(e) => setCoverageSpec(e.target.value)}
                      className="min-h-48 font-mono text-sm"
                      disabled={analyzeCoverage.isPending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="coverage-base-url">Base URL (optional)</Label>
                    <input
                      id="coverage-base-url"
                      type="text"
                      placeholder="https://api.example.com"
                      value={coverageBaseUrl}
                      onChange={(e) => setCoverageBaseUrl(e.target.value)}
                      disabled={analyzeCoverage.isPending}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                  <Button
                    onClick={handleAnalyzeCoverage}
                    disabled={!coverageSpec.trim() || analyzeCoverage.isPending}
                    className="w-full"
                  >
                    {analyzeCoverage.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing...</>
                    ) : (
                      <><Target className="h-4 w-4 mr-2" />Analyze Coverage</>
                    )}
                  </Button>
                  {analyzeCoverage.isError && (
                    <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-400">
                      {analyzeCoverage.error instanceof Error
                        ? analyzeCoverage.error.message
                        : 'Analysis failed'}
                    </div>
                  )}
                </CardContent>
              </Card>

              {recentAnalyses.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <History className="h-4 w-4" />
                      Recent Analyses
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {recentAnalyses.map((analysis) => (
                        <div key={analysis.id} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                          <Target className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{analysis.spec_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(analysis.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={`text-sm font-bold ${analysis.coverage_percent >= 80 ? 'text-green-600' : analysis.coverage_percent >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {Math.round(analysis.coverage_percent)}%
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {analysis.covered_endpoints}/{analysis.total_endpoints} endpoints
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ── Telemetry ── */}
        <TabsContent value="telemetry" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Discovered Flows</CardTitle>
              <CardDescription>Flows detected from telemetry data</CardDescription>
            </CardHeader>
            <CardContent>
              <DiscoveredFlowsTable />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Drift Alerts</CardTitle>
              <CardDescription>Detected changes in service behavior</CardDescription>
            </CardHeader>
            <CardContent>
              <DriftAlerts />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
