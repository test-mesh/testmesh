# Phase 3: Analytics Consolidation, Flows Rework, CI/CD Tab

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the analytics sub-routes into a single 5-tab page, rework the Flows list page into a card grid (Scenario Library), and add a CI/CD tab to the Integrations page.

**Architecture:** All changes are confined to page-level components. No new API hooks needed — existing hooks (`useMetrics`, `useTrends`, `useFlakiness`, `useFlows`, `useNotifications`) are reused. The analytics sub-routes (`/analytics/trends`, `/analytics/flakiness`, etc.) are kept functional (not deleted) but their content is consolidated into the main `/analytics` page.

**Tech Stack:** Next.js App Router, TanStack React Query, Recharts (already installed), shadcn/ui Tabs/Cards

---

### Task 1: Consolidate Analytics into a 5-tab page

**Files:**
- Modify: `dashboard/app/analytics/page.tsx`

The current analytics page already has a `<Tabs>` component with Trends, Flaky Tests, Coverage, and Telemetry. We restructure it into 5 tabs: **Overview, RCA, Flakiness, Trends, Alerts** — replacing the current navigation card grid with proper tab content.

- [ ] **Step 1: Check what hooks and components are available for the RCA tab**

```bash
grep -r "diagnosis\|DiagnoseFailure\|useDiagnosis\|useAI" dashboard/lib/hooks/ --include="*.ts" -l
cat dashboard/app/analytics/diagnosis/page.tsx 2>/dev/null | head -60
```

Note the hook name and props used by the existing diagnosis page.

- [ ] **Step 2: Check the notifications hook for the Alerts tab**

```bash
grep -r "notification\|alert\|webhook" dashboard/lib/hooks/ --include="*.ts" -l
grep -r "notification\|alert" dashboard/lib/api/ --include="*.ts" -l
```

Note available functions for creating/listing notification rules.

- [ ] **Step 3: Replace `dashboard/app/analytics/page.tsx`**

Replace the entire file with the following. This reuses all existing hooks — only the layout changes:

```tsx
'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  LayoutDashboard, AlertTriangle, TrendingUp, Bell, Stethoscope,
  RefreshCw, CheckCircle2, XCircle, Clock, Loader2, Plus, Trash2,
} from 'lucide-react';
import { MetricsSummary } from '@/components/analytics/MetricsCard';
import { TrendChart } from '@/components/analytics/TrendChart';
import { FlakinessTable } from '@/components/analytics/FlakinessTable';
import {
  useMetrics, useTrends, useFlakiness, useTriggerAggregation,
} from '@/lib/hooks/useReports';
import type { GetFlakinessResponse } from '@/lib/api/types';

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ startDate, endDate }: { startDate: string; endDate: string }) {
  const { data: metricsData, isLoading } = useMetrics({ start_date: startDate, end_date: endDate });
  const { data: flakinessData } = useFlakiness({ limit: 5 });
  const flakyFlows = (flakinessData as GetFlakinessResponse)?.flaky_flows || [];

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
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
      {flakyFlows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Top Flaky Flows
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {flakyFlows.slice(0, 5).map((f: any) => (
                <div key={f.flow_id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground truncate max-w-xs">{f.flow_name || f.flow_id}</span>
                  <Badge variant="outline" className="text-yellow-600 border-yellow-600/40">
                    {Math.round(f.flakiness_rate * 100)}% flaky
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── RCA Tab ───────────────────────────────────────────────────────────────────

function RCATab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Stethoscope className="h-5 w-5 text-primary" />
          Root Cause Analysis
        </CardTitle>
        <CardDescription>
          AI-powered diagnosis of test failures. Select a failed execution to analyze.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Open a failed execution from{' '}
          <a href="/executions" className="text-primary hover:underline">Executions → History</a>
          {' '}and click "Diagnose" to run root cause analysis.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Flakiness Tab ─────────────────────────────────────────────────────────────

function FlakinessTab() {
  const { data: flakinessData, isLoading } = useFlakiness({ limit: 50 });
  const flakyFlows = (flakinessData as GetFlakinessResponse)?.flaky_flows || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Flaky Tests</CardTitle>
        <CardDescription>Flows with inconsistent pass/fail patterns</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <FlakinessTable data={flakyFlows} />
        )}
      </CardContent>
    </Card>
  );
}

// ── Trends Tab ────────────────────────────────────────────────────────────────

function TrendsTab({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');
  const { data: trendsData, isLoading } = useTrends({ start_date: startDate, end_date: endDate, group_by: groupBy });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as 'day' | 'week' | 'month')}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Daily</SelectItem>
            <SelectItem value="week">Weekly</SelectItem>
            <SelectItem value="month">Monthly</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : trendsData?.trends?.length ? (
        <TrendChart data={trendsData.trends} title="Execution Trends" showExecutions showPassRate height={350} />
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No trend data for this period.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Alerts Tab ────────────────────────────────────────────────────────────────

function AlertsTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          Alerting & Notifications
        </CardTitle>
        <CardDescription>
          Configure alerts for test failures, flakiness thresholds, and duration spikes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Bell className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-4">
            No alert rules configured yet. Set up webhooks, email, or Slack notifications.
          </p>
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Alert Rule
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Connect to integrations in{' '}
          <a href="/integrations" className="text-primary hover:underline">Infrastructure → Integrations</a>
        </p>
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState('30');
  const triggerAggregation = useTriggerAggregation();

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - parseInt(dateRange) * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground mt-1">Execution metrics, trends, and test health</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => triggerAggregation.mutate({ start_date: startDate, end_date: endDate })} disabled={triggerAggregation.isPending}>
            <RefreshCw className={`h-4 w-4 mr-2 ${triggerAggregation.isPending ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="overview" className="gap-1.5">
            <LayoutDashboard className="h-3.5 w-3.5" />Overview
          </TabsTrigger>
          <TabsTrigger value="rca" className="gap-1.5">
            <Stethoscope className="h-3.5 w-3.5" />RCA
          </TabsTrigger>
          <TabsTrigger value="flakiness" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />Flakiness
          </TabsTrigger>
          <TabsTrigger value="trends" className="gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />Trends
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1.5">
            <Bell className="h-3.5 w-3.5" />Alerts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab startDate={startDate} endDate={endDate} />
        </TabsContent>
        <TabsContent value="rca">
          <RCATab />
        </TabsContent>
        <TabsContent value="flakiness">
          <FlakinessTab />
        </TabsContent>
        <TabsContent value="trends">
          <TrendsTab startDate={startDate} endDate={endDate} />
        </TabsContent>
        <TabsContent value="alerts">
          <AlertsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 4: Verify analytics page**

Open http://localhost:3000/analytics. Confirm:
- 5 tabs render: Overview, RCA, Flakiness, Trends, Alerts
- Overview shows metric summary cards
- Flakiness tab shows the flaky flows table
- Trends tab shows the chart with group-by selector
- No console errors

- [ ] **Step 5: Commit**

```bash
git add dashboard/app/analytics/page.tsx
git commit -m "feat(analytics): consolidate into single 5-tab page (Overview, RCA, Flakiness, Trends, Alerts)"
```

---

### Task 2: Rework Flows page into card grid (Scenario Library)

**Files:**
- Modify: `dashboard/app/flows/page.tsx`

The current page is a table. We replace it with a card grid that keeps all existing hooks (`useFlows`, `useCreateExecution`, `useDeleteFlow`).

- [ ] **Step 1: Replace `dashboard/app/flows/page.tsx`**

Replace the entire file with:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFlows, useDeleteFlow } from '@/lib/hooks/useFlows';
import { useCreateExecution } from '@/lib/hooks/useExecutions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Play, Trash2, Plus, Search, Upload, Sparkles, LayoutGrid, List,
  Clock, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const PAGE_SIZE = 12;

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-500/15 text-green-600 border-green-600/20',
  failed: 'bg-destructive/15 text-destructive border-destructive/20',
  running: 'bg-primary/15 text-primary border-primary/20',
};

function FlowCard({ flow, onRun, onDelete, isRunning, isDeleting }: {
  flow: any;
  onRun: (id: string) => void;
  onDelete: (id: string) => void;
  isRunning: boolean;
  isDeleting: boolean;
}) {
  return (
    <Card className="group flex flex-col hover:border-primary/40 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/flows/${flow.id}`} className="flex-1 min-w-0">
            <CardTitle className="text-sm font-semibold hover:text-primary transition-colors truncate">
              {flow.name}
            </CardTitle>
          </Link>
          {flow.last_execution_status && (
            <Badge
              variant="outline"
              className={`shrink-0 text-xs ${STATUS_COLORS[flow.last_execution_status] || ''}`}
            >
              {flow.last_execution_status}
            </Badge>
          )}
        </div>
        {flow.description && (
          <CardDescription className="text-xs line-clamp-2">{flow.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="pt-0 flex-1 flex flex-col justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {flow.tags?.slice(0, 3).map((tag: string) => (
            <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
          ))}
          {flow.suite && (
            <Badge variant="outline" className="text-xs">{flow.suite}</Badge>
          )}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {flow.updated_at
              ? formatDistanceToNow(new Date(flow.updated_at), { addSuffix: true })
              : 'Never run'}
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onRun(flow.id)}
              disabled={isRunning}
              title="Run"
            >
              <Play className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:text-destructive"
              onClick={() => onDelete(flow.id)}
              disabled={isDeleting}
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FlowsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const router = useRouter();

  const { data, isLoading } = useFlows({ limit: PAGE_SIZE, offset: page * PAGE_SIZE });
  const deleteFlow = useDeleteFlow();
  const createExecution = useCreateExecution();

  const flows = data?.flows || [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const filtered = flows.filter(f =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRun = (flowId: string) => {
    createExecution.mutate(
      { flow_id: flowId, environment: 'development' },
      { onSuccess: (exec) => router.push(`/executions/${exec.id}`) }
    );
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this flow?')) deleteFlow.mutate(id);
  };

  return (
    <div className="container mx-auto py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Flows</h1>
          <p className="text-muted-foreground mt-1">{total} test flows</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/import">
            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4 mr-2" />Import
            </Button>
          </Link>
          <Link href="/ai/generate">
            <Button variant="outline" size="sm">
              <Sparkles className="h-4 w-4 mr-2" />Generate
            </Button>
          </Link>
          <Link href="/flows/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />New Flow
            </Button>
          </Link>
        </div>
      </div>

      {/* Search + view toggle */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search flows..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <div className="flex items-center border rounded-lg p-0.5">
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7"
            onClick={() => setViewMode('grid')}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Flow grid */}
      {isLoading ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground mb-4">
              {flows.length === 0 ? 'No flows yet.' : 'No flows match your search.'}
            </p>
            <Link href="/flows/new">
              <Button><Plus className="h-4 w-4 mr-2" />Create Your First Flow</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className={
          viewMode === 'grid'
            ? 'grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
            : 'flex flex-col gap-2'
        }>
          {filtered.map(flow => (
            <FlowCard
              key={flow.id}
              flow={flow}
              onRun={handleRun}
              onDelete={handleDelete}
              isRunning={createExecution.isPending}
              isDeleting={deleteFlow.isPending}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 text-sm text-muted-foreground">
          <span>Page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 0}>
              <ChevronLeft className="h-4 w-4 mr-1" />Previous
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>
              Next<ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify flows page**

Open http://localhost:3000/flows. Confirm:
- Cards display in a 4-column grid (responsive)
- Search filters the visible cards
- Grid/List toggle works
- Run button creates execution and redirects
- Delete button prompts and removes

- [ ] **Step 3: Commit**

```bash
git add dashboard/app/flows/page.tsx
git commit -m "feat(flows): rework flows list into card grid scenario library"
```

---

### Task 3: Add CI/CD tab to Integrations page

**Files:**
- Modify: `dashboard/app/integrations/page.tsx`

- [ ] **Step 1: Read the current integrations page structure**

```bash
head -60 dashboard/app/integrations/page.tsx
```

Identify if the page already uses `<Tabs>` or is a flat component. Note the existing tab names if any.

- [ ] **Step 2: Add a CI/CD tab with code snippets**

Find the `<TabsList>` in `dashboard/app/integrations/page.tsx`. Add a new tab trigger:

```tsx
<TabsTrigger value="cicd">CI/CD</TabsTrigger>
```

Then add the corresponding `<TabsContent>` section. Add this as a new import at the top of the file:

```tsx
// Add to existing imports
import { Copy, CheckCheck } from 'lucide-react';
```

Add a `CopyButton` component and the CI/CD tab content **before** the `export default`:

```tsx
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={copy}>
      {copied ? <CheckCheck className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

const GITHUB_ACTIONS_SNIPPET = `name: TestMesh
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run TestMesh flows
        run: |
          curl -X POST http://your-testmesh-host:5016/api/v1/executions \\
            -H "Content-Type: application/json" \\
            -d '{"flow_id": "your-flow-id", "environment": "ci"}'`;

const GITLAB_CI_SNIPPET = `testmesh:
  stage: test
  script:
    - |
      curl -X POST http://your-testmesh-host:5016/api/v1/executions \\
        -H "Content-Type: application/json" \\
        -d '{"flow_id": "your-flow-id", "environment": "ci"}'`;

const CURL_SNIPPET = `curl -X POST http://your-testmesh-host:5016/api/v1/executions \\
  -H "Content-Type: application/json" \\
  -d '{"flow_id": "your-flow-id", "environment": "ci"}'`;

function CICDTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">GitHub Actions</CardTitle>
          <CardDescription>Add to `.github/workflows/testmesh.yml`</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative rounded-lg bg-muted p-4">
            <pre className="text-xs font-mono whitespace-pre-wrap text-foreground overflow-x-auto">{GITHUB_ACTIONS_SNIPPET}</pre>
            <div className="absolute top-2 right-2">
              <CopyButton text={GITHUB_ACTIONS_SNIPPET} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">GitLab CI</CardTitle>
          <CardDescription>Add to `.gitlab-ci.yml`</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative rounded-lg bg-muted p-4">
            <pre className="text-xs font-mono whitespace-pre-wrap text-foreground overflow-x-auto">{GITLAB_CI_SNIPPET}</pre>
            <div className="absolute top-2 right-2">
              <CopyButton text={GITLAB_CI_SNIPPET} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Direct API (curl)</CardTitle>
          <CardDescription>Trigger a flow from any CI/CD system</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative rounded-lg bg-muted p-4">
            <pre className="text-xs font-mono whitespace-pre-wrap text-foreground overflow-x-auto">{CURL_SNIPPET}</pre>
            <div className="absolute top-2 right-2">
              <CopyButton text={CURL_SNIPPET} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Replace <code className="font-mono bg-muted px-1 rounded">your-testmesh-host</code> with your server address and <code className="font-mono bg-muted px-1 rounded">your-flow-id</code> with the flow ID from the Flows page.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

If the integrations page doesn't already have a Tabs structure, wrap its existing content in a tab and add the CI/CD tab. If it does, just add the new tab trigger and content.

- [ ] **Step 3: Verify CI/CD tab**

Open http://localhost:3000/integrations. Click the CI/CD tab. Confirm all three code snippets render with copy buttons. Click a copy button and paste to verify.

- [ ] **Step 4: Commit**

```bash
git add dashboard/app/integrations/page.tsx
git commit -m "feat(integrations): add CI/CD tab with GitHub Actions, GitLab CI, and curl snippets"
```

---

### Phase 3 complete

At this point: analytics is a clean 5-tab page, the flows list is a card grid, and integrations has a CI/CD reference tab.
