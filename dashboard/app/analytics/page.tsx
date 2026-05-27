'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
  AlertTriangle,
  RefreshCw,
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
  Activity,
} from 'lucide-react';
import type {
  GetFlakinessResponse,
  AnalyzeCoverageResponse,
  EndpointCoverage,
  ReportFormat,
} from '@/lib/api/types';
import { cn } from '@/lib/utils';

// ── Coverage sub-components ───────────────────────────────────────────────────

const METHOD_COLORS: Record<string, string> = {
  GET:    'bg-blue-400/10 text-blue-400',
  POST:   'bg-teal-400/10 text-teal-400',
  PUT:    'bg-yellow-400/10 text-yellow-400',
  PATCH:  'bg-orange-400/10 text-orange-400',
  DELETE: 'bg-red-400/10 text-red-400',
};

function MethodBadge({ method }: { method: string }) {
  const upper = method.toUpperCase();
  return (
    <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold', METHOD_COLORS[upper] ?? 'bg-[#1a2d3d] text-[#4a6480]')}>
      {upper}
    </span>
  );
}

function EndpointRow({ endpoint, status }: { endpoint: EndpointCoverage; status: 'covered' | 'uncovered' | 'partial' }) {
  const [expanded, setExpanded] = useState(false);
  const icons = {
    covered:   <CheckCircle2 className="h-4 w-4 text-teal-400 shrink-0" />,
    uncovered: <XCircle className="h-4 w-4 text-red-400 shrink-0" />,
    partial:   <AlertCircle className="h-4 w-4 text-yellow-400 shrink-0" />,
  };
  const hasMeta = endpoint.description || (endpoint.flow_ids?.length ?? 0) > 0 || (endpoint.missing_tests?.length ?? 0) > 0;
  return (
    <div className="rounded-lg border border-[#1e2d3d] bg-[#0f1923] overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[#131b26] transition-colors"
        onClick={() => hasMeta && setExpanded(!expanded)}
      >
        {icons[status]}
        <MethodBadge method={endpoint.method} />
        <span className="font-mono text-[11px] text-[#c8dce8] flex-1">{endpoint.path}</span>
        {status === 'partial' && (
          <span className="text-[10px] text-[#7fa8c8] border border-[#2a3d52] px-1.5 py-0.5 rounded">
            {Math.round(endpoint.coverage * 100)}%
          </span>
        )}
        {hasMeta && (expanded
          ? <ChevronDown className="h-3.5 w-3.5 text-[#3d5670] shrink-0" />
          : <ChevronRight className="h-3.5 w-3.5 text-[#3d5670] shrink-0" />
        )}
      </button>
      {expanded && hasMeta && (
        <div className="px-4 pb-3 space-y-2 border-t border-[#1a2332]">
          {endpoint.description && (
            <p className="text-xs text-[#4a6480] pt-2">{endpoint.description}</p>
          )}
          {(endpoint.flow_ids?.length ?? 0) > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-1">Covered by flows</p>
              <div className="flex flex-wrap gap-1">
                {(endpoint.flow_ids ?? []).map((id) => (
                  <Link key={id} href={`/flows/${id}`} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1a2d3d] text-teal-400 hover:text-teal-300 transition-colors">
                    {id.slice(0, 8)}…
                  </Link>
                ))}
              </div>
            </div>
          )}
          {(endpoint.missing_tests?.length ?? 0) > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-1">Missing test cases</p>
              <ul className="text-xs text-[#4a6480] list-disc list-inside space-y-0.5">
                {(endpoint.missing_tests ?? []).map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CoverageResults({ result, onReset }: { result: AnalyzeCoverageResponse; onReset: () => void }) {
  const coverageColor = result.coverage_percent >= 80 ? 'text-teal-400' : result.coverage_percent >= 50 ? 'text-yellow-400' : 'text-red-400';
  const pct = Math.round(result.coverage_percent);
  return (
    <div className="space-y-5">
      <button
        onClick={onReset}
        className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
      >
        <Target className="h-3 w-3" />
        Analyze Another
      </button>

      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold text-[#c8dce8]">{result.spec_name || 'Coverage Analysis'}</p>
            <p className="text-[11px] text-[#4a6480] mt-0.5">{result.covered_endpoints} of {result.total_endpoints} endpoints covered</p>
          </div>
          <span className={cn('text-3xl font-bold tabular-nums', coverageColor)}>{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-[#1a2332] overflow-hidden">
          <div className="h-full rounded-full bg-teal-400 transition-all" style={{ width: `${result.coverage_percent}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-teal-400">{result.covered?.length ?? 0}</div>
            <div className="text-[11px] text-[#4a6480]">Covered</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-yellow-400">{result.partial?.length ?? 0}</div>
            <div className="text-[11px] text-[#4a6480]">Partial</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-400">{result.uncovered?.length ?? 0}</div>
            <div className="text-[11px] text-[#4a6480]">Uncovered</div>
          </div>
        </div>
      </div>

      {(result.uncovered?.length ?? 0) > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-[#3d5670] uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <XCircle className="h-3 w-3 text-red-400" />
            Uncovered Endpoints ({result.uncovered.length})
          </p>
          <div className="space-y-1.5">
            {result.uncovered.map((ep, i) => <EndpointRow key={i} endpoint={ep} status="uncovered" />)}
          </div>
        </div>
      )}
      {(result.partial?.length ?? 0) > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-[#3d5670] uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <AlertCircle className="h-3 w-3 text-yellow-400" />
            Partially Covered ({result.partial.length})
          </p>
          <div className="space-y-1.5">
            {result.partial.map((ep, i) => <EndpointRow key={i} endpoint={ep} status="partial" />)}
          </div>
        </div>
      )}
      {(result.covered?.length ?? 0) > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-[#3d5670] uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-teal-400" />
            Covered Endpoints ({result.covered.length})
          </p>
          <div className="space-y-1.5">
            {result.covered.map((ep, i) => <EndpointRow key={i} endpoint={ep} status="covered" />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const DATE_RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '60', label: 'Last 60 days' },
  { value: '90', label: 'Last 90 days' },
];

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState('30');
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');

  const [coverageSpec, setCoverageSpec] = useState('');
  const [coverageBaseUrl, setCoverageBaseUrl] = useState('');
  const [coverageResult, setCoverageResult] = useState<AnalyzeCoverageResponse | null>(null);
  const analyzeCoverage = useAnalyzeCoverage();
  const { data: coverageHistoryData } = useCoverageAnalyses({ limit: 5 });
  const recentAnalyses = coverageHistoryData?.analyses || [];

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - parseInt(dateRange) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data: metricsData } = useMetrics({ start_date: startDate, end_date: endDate });
  const { data: trendsData, isLoading: trendsLoading } = useTrends({ start_date: startDate, end_date: endDate, group_by: groupBy });
  const { data: flakinessData, isLoading: flakinessLoading } = useFlakiness({ limit: 10 });
  const triggerAggregation = useTriggerAggregation();

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
      { name: `Analytics Export ${endDate}`, format: exportFormat, start_date: startDate, end_date: endDate },
      { onSuccess: (report) => setGeneratingId(report.id) }
    );
  };

  const handleDownloadGenerated = () => {
    if (!generatingReport) return;
    const ext = generatingReport.format === 'junit' ? 'xml' : generatingReport.format;
    downloadReport.mutate({ id: generatingReport.id, filename: `${generatingReport.name}.${ext}` });
    setGeneratingId(null);
    setExportDialogOpen(false);
  };

  const handleRefreshData = () => triggerAggregation.mutate({ start_date: startDate, end_date: endDate });

  const handleAnalyzeCoverage = async () => {
    try {
      const response = await analyzeCoverage.mutateAsync({
        spec: coverageSpec,
        base_url: coverageBaseUrl || undefined,
        workspace_id: getActiveWorkspaceId() ?? undefined,
      });
      setCoverageResult(response);
    } catch {}
  };

  const flakyFlows = (flakinessData as GetFlakinessResponse)?.flaky_flows || [];
  const summary = metricsData?.summary;
  const dateRangeLabel = DATE_RANGES.find((r) => r.value === dateRange)?.label ?? 'Last 30 days';

  return (
    <div className="px-6 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-[#c8dce8]">Analytics</h1>
          <p className="text-xs text-[#3d5670] mt-0.5">Execution metrics, trends, and test health insights</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="h-7 text-xs bg-[#0f1923] border-[#1e2d3d] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] w-36 focus:ring-0 focus:ring-offset-0">
              <SelectValue placeholder={dateRangeLabel} />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
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
              <button className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors">
                <FileDown className="h-3 w-3" />
                Export
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Export Report</DialogTitle>
                <DialogDescription>Generate a report for {startDate} to {endDate}.</DialogDescription>
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
                <div className="rounded-lg border border-[#1e2d3d] bg-[#0b0f18] p-3 space-y-2">
                  {generatingReport.status === 'completed' ? (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-teal-400 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" /> Report ready
                      </span>
                      <Button size="sm" onClick={handleDownloadGenerated}>
                        <Download className="h-4 w-4 mr-2" /> Download
                      </Button>
                    </div>
                  ) : generatingReport.status === 'failed' ? (
                    <p className="text-sm text-red-400 flex items-center gap-2">
                      <XCircle className="h-4 w-4" />{generatingReport.error || 'Generation failed'}
                    </p>
                  ) : (
                    <p className="text-sm text-[#4a6480] flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {generatingReport.status === 'generating' ? 'Generating…' : 'Queued…'}
                    </p>
                  )}
                </div>
              )}
              {recentReports.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">Recent Exports</p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {recentReports.map((r) => (
                      <div key={r.id} className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-[#0f1923] transition-colors">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] text-[#4a6480] uppercase font-mono">{r.format}</span>
                          <span className="text-[12px] text-[#7fa8c8] truncate">{r.name}</span>
                        </div>
                        {r.status === 'completed' && (
                          <button
                            onClick={() => {
                              const ext = r.format === 'junit' ? 'xml' : r.format;
                              downloadReport.mutate({ id: r.id, filename: `${r.name}.${ext}` });
                            }}
                            className="flex items-center justify-center h-6 w-6 rounded text-[#3d5670] hover:text-teal-400 hover:bg-[#1a2d3d] transition-colors"
                          >
                            <Download className="h-3 w-3" />
                          </button>
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
                  disabled={generateReport.isPending || (!!generatingId && generatingReport?.status !== 'completed' && generatingReport?.status !== 'failed')}
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

          <button
            onClick={handleRefreshData}
            disabled={triggerAggregation.isPending}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] hover:text-[#c8dce8] disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn('h-3 w-3', triggerAggregation.isPending && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="bg-[#0f1923] border border-[#1e2d3d] p-0.5 h-auto rounded-lg mb-4">
          {['overview', 'trends', 'flakiness', 'coverage', 'telemetry'].map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="text-xs px-3 py-1.5 capitalize data-[state=active]:bg-[#1a2d3d] data-[state=active]:text-[#c8dce8] text-[#4a6480] rounded-md"
            >
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="flex flex-col gap-4">
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
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 rounded-xl bg-[#0f1923] border border-[#1e2d3d] animate-pulse" />
              ))}
            </div>
          )}
          {trendsLoading ? (
            <div className="h-64 rounded-xl bg-[#0f1923] border border-[#1e2d3d] animate-pulse" />
          ) : trendsData?.trends && trendsData.trends.length > 0 ? (
            <TrendChart data={trendsData.trends} title="Execution Trends" showExecutions showPassRate height={260} />
          ) : (
            <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] flex flex-col items-center justify-center py-12 text-center">
              <Activity className="h-10 w-10 mb-3 text-[#1e2d3d]" />
              <p className="text-sm text-[#3d5670] mb-3">No trend data for the selected period</p>
              <button
                onClick={handleRefreshData}
                className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0b0f18] border border-[#1e2d3d] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
              >
                Aggregate Data
              </button>
            </div>
          )}
        </TabsContent>

        {/* ── Trends ── */}
        <TabsContent value="trends" className="flex flex-col gap-4">
          <div className="flex justify-end">
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as 'day' | 'week' | 'month')}>
              <SelectTrigger className="h-7 text-xs bg-[#0f1923] border-[#1e2d3d] text-[#7fa8c8] w-28 focus:ring-0 focus:ring-offset-0">
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
            <div className="h-80 rounded-xl bg-[#0f1923] border border-[#1e2d3d] animate-pulse" />
          ) : trendsData?.trends && trendsData.trends.length > 0 ? (
            <TrendChart data={trendsData.trends} title="Execution Trends" showExecutions showPassRate height={350} />
          ) : (
            <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] flex flex-col items-center justify-center py-16 text-center">
              <Activity className="h-12 w-12 mb-4 text-[#1e2d3d]" />
              <p className="text-sm text-[#3d5670] mb-4">No trend data for the selected period</p>
              <button
                onClick={handleRefreshData}
                className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs text-[#7fa8c8] bg-[#0b0f18] border border-[#1e2d3d] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
              >
                Aggregate Data
              </button>
            </div>
          )}
        </TabsContent>

        {/* ── Flakiness ── */}
        <TabsContent value="flakiness">
          <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1a2332]">
              <p className="text-[13px] font-semibold text-[#c8dce8]">Flaky Tests</p>
              <p className="text-[11px] text-[#4a6480] mt-0.5">Tests with inconsistent pass/fail patterns</p>
            </div>
            {flakinessLoading ? (
              <div className="divide-y divide-[#1a2332]">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 px-4 flex items-center">
                    <div className="h-3 w-1/3 rounded bg-[#1a2d3d] animate-pulse" />
                  </div>
                ))}
              </div>
            ) : (
              <FlakinessTable data={flakyFlows} />
            )}
          </div>
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
              <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-5 space-y-4">
                <div>
                  <p className="text-[13px] font-semibold text-[#c8dce8] flex items-center gap-2">
                    <Target className="h-4 w-4 text-teal-400" />
                    API Coverage Analysis
                  </p>
                  <p className="text-[11px] text-[#4a6480] mt-0.5">
                    Paste your OpenAPI specification to see which endpoints are covered by your test flows
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="coverage-spec" className="text-[11px] text-[#7fa8c8]">OpenAPI Specification</Label>
                  <Textarea
                    id="coverage-spec"
                    placeholder="Paste your OpenAPI 3.0 or Swagger 2.0 specification (JSON or YAML)..."
                    value={coverageSpec}
                    onChange={(e) => setCoverageSpec(e.target.value)}
                    className="min-h-48 font-mono text-xs bg-[#0b0f18] border-[#1e2d3d] text-[#c8dce8] placeholder:text-[#3d5670] focus:border-teal-400/50 focus:ring-0"
                    disabled={analyzeCoverage.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="coverage-base-url" className="text-[11px] text-[#7fa8c8]">Base URL (optional)</Label>
                  <input
                    id="coverage-base-url"
                    type="text"
                    placeholder="https://api.example.com"
                    value={coverageBaseUrl}
                    onChange={(e) => setCoverageBaseUrl(e.target.value)}
                    disabled={analyzeCoverage.isPending}
                    className="w-full h-8 px-3 rounded-lg bg-[#0b0f18] border border-[#1e2d3d] text-xs text-[#c8dce8] placeholder-[#3d5670] focus:outline-none focus:border-teal-400/50 transition-colors disabled:opacity-50"
                  />
                </div>
                <button
                  onClick={handleAnalyzeCoverage}
                  disabled={!coverageSpec.trim() || analyzeCoverage.isPending}
                  className="w-full h-8 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                >
                  {analyzeCoverage.isPending ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" />Analyzing…</>
                  ) : (
                    <><Target className="h-3.5 w-3.5" />Analyze Coverage</>
                  )}
                </button>
                {analyzeCoverage.isError && (
                  <div className="p-3 rounded-lg bg-red-400/5 border border-red-400/20 text-xs text-red-400">
                    {analyzeCoverage.error instanceof Error ? analyzeCoverage.error.message : 'Analysis failed'}
                  </div>
                )}
              </div>

              {recentAnalyses.length > 0 && (
                <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#1a2332] flex items-center gap-2">
                    <History className="h-3.5 w-3.5 text-[#3d5670]" />
                    <p className="text-[13px] font-semibold text-[#c8dce8]">Recent Analyses</p>
                  </div>
                  <div className="divide-y divide-[#1a2332]">
                    {recentAnalyses.map((analysis) => (
                      <div key={analysis.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[#131b26] transition-colors">
                        <Target className="h-3.5 w-3.5 text-[#3d5670] shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-medium text-[#c8dce8] truncate">{analysis.spec_name}</div>
                          <div className="text-[10px] text-[#4a6480]">{new Date(analysis.created_at).toLocaleDateString()}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={cn('text-sm font-bold', analysis.coverage_percent >= 80 ? 'text-teal-400' : analysis.coverage_percent >= 50 ? 'text-yellow-400' : 'text-red-400')}>
                            {Math.round(analysis.coverage_percent)}%
                          </div>
                          <div className="text-[10px] text-[#4a6480]">{analysis.covered_endpoints}/{analysis.total_endpoints}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ── Telemetry ── */}
        <TabsContent value="telemetry" className="flex flex-col gap-4">
          <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1a2332]">
              <p className="text-[13px] font-semibold text-[#c8dce8]">Discovered Flows</p>
              <p className="text-[11px] text-[#4a6480] mt-0.5">Flows detected from telemetry data</p>
            </div>
            <div className="p-4">
              <DiscoveredFlowsTable />
            </div>
          </div>
          <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1a2332]">
              <p className="text-[13px] font-semibold text-[#c8dce8]">Drift Alerts</p>
              <p className="text-[11px] text-[#4a6480] mt-0.5">Detected changes in service behavior</p>
            </div>
            <div className="p-4">
              <DriftAlerts />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
