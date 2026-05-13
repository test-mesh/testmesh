# Phase 4: Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the dashboard home page, the execution detail page, add validation mode to the Mesh Canvas, and do a global blue-to-teal sweep and consistency pass.

**Architecture:** All changes are page and component-level. No new API hooks. The validation mode is a new boolean state on FlowEditor, not a new route. Empty state and skeleton patterns are already in shadcn/ui.

**Tech Stack:** Next.js App Router, shadcn/ui (Skeleton, Empty), Sonner (toasts), date-fns, Recharts

---

### Task 1: Upgrade Dashboard home page

**Files:**
- Modify: `dashboard/app/page.tsx`

- [ ] **Step 1: Read the current home page hooks to understand what data is available**

```bash
head -30 dashboard/app/page.tsx
```

Note the hooks used (`useFlows`, `useExecutions`, `useMockServers`) and the data shapes.

- [ ] **Step 2: Check if a schedules hook exists for the KPI card**

```bash
grep -r "useSchedules\|schedule" dashboard/lib/hooks/ --include="*.ts" -l
```

Note the hook name and whether it returns a `total` count.

- [ ] **Step 3: Replace `dashboard/app/page.tsx`**

Replace the entire file with:

```tsx
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useFlows } from '@/lib/hooks/useFlows';
import { useExecutions } from '@/lib/hooks/useExecutions';
import { useSchedules } from '@/lib/hooks/useSchedules';
import {
  FileText, Play, Calendar, CheckCircle2, XCircle, Clock,
  Plus, Network, TrendingUp, ArrowRight,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const STATUS_ICON: Record<string, React.ReactNode> = {
  completed: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
  failed: <XCircle className="h-3.5 w-3.5 text-destructive" />,
  running: <Clock className="h-3.5 w-3.5 text-primary animate-pulse" />,
};

const STATUS_BADGE: Record<string, string> = {
  completed: 'bg-green-500/10 text-green-600 border-green-600/20',
  failed: 'bg-destructive/10 text-destructive border-destructive/20',
  running: 'bg-primary/10 text-primary border-primary/20',
};

export default function DashboardPage() {
  const { data: flowsData, isLoading: flowsLoading } = useFlows({ limit: 1 });
  const { data: executionsData, isLoading: execLoading } = useExecutions({ limit: 10 });
  const { data: schedulesData } = useSchedules({});

  const totalFlows = flowsData?.total ?? 0;
  const executions = executionsData?.executions || [];
  const activeSchedules = schedulesData?.schedules?.filter((s: any) => s.enabled)?.length ?? 0;

  const recentExecs = executions.slice(0, 10);
  const passRate = executions.length
    ? Math.round((executions.filter(e => e.status === 'completed').length / executions.length) * 100)
    : null;

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Your testing workspace at a glance</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Flows</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {flowsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-bold">{totalFlows}</div>
            )}
            <Link href="/flows" className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">24h Pass Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {execLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className={`text-3xl font-bold ${passRate !== null && passRate < 80 ? 'text-destructive' : ''}`}>
                {passRate !== null ? `${passRate}%` : '—'}
              </div>
            )}
            <Link href="/analytics" className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1">
              View analytics <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Schedules</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{activeSchedules}</div>
            <Link href="/flows" className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1">
              Manage schedules <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-3 mb-8">
        <Link href="/flows/new">
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />New Flow
          </Button>
        </Link>
        <Link href="/executions">
          <Button variant="outline" size="sm">
            <Play className="h-4 w-4 mr-2" />View Executions
          </Button>
        </Link>
        <Link href="/graph">
          <Button variant="outline" size="sm">
            <Network className="h-4 w-4 mr-2" />System Graph
          </Button>
        </Link>
      </div>

      {/* Recent Executions */}
      <div>
        <h2 className="text-base font-semibold mb-4">Recent Executions</h2>
        {execLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : recentExecs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Play className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-4">No executions yet. Run a flow to get started.</p>
              <Link href="/flows">
                <Button variant="outline" size="sm">Browse Flows</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {recentExecs.map(exec => (
              <Link key={exec.id} href={`/executions/${exec.id}`}>
                <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 hover:border-primary/40 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    {STATUS_ICON[exec.status] ?? <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
                    <span className="text-sm font-medium truncate">{exec.flow_name || exec.flow_id}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {exec.created_at
                        ? formatDistanceToNow(new Date(exec.created_at), { addSuffix: true })
                        : ''}
                    </span>
                    <Badge variant="outline" className={`text-xs ${STATUS_BADGE[exec.status] || ''}`}>
                      {exec.status}
                    </Badge>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
        {recentExecs.length > 0 && (
          <div className="mt-4 text-center">
            <Link href="/executions">
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                View all executions <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Handle missing `useSchedules` hook**

If `useSchedules` doesn't exist (step 2 revealed nothing), replace the schedules KPI with active mock servers:

```tsx
// Instead of useSchedules, use:
import { useMockServers } from '@/lib/hooks/useMockServers';
const { data: mockServersData } = useMockServers({});
const activeMocks = mockServersData?.servers?.filter((s: any) => s.status === 'running')?.length ?? 0;

// Update the card:
<CardTitle className="text-sm font-medium text-muted-foreground">Active Mock Servers</CardTitle>
// ...
<div className="text-3xl font-bold">{activeMocks}</div>
```

- [ ] **Step 5: Verify dashboard home**

Open http://localhost:3000. Confirm:
- Three KPI cards with real data
- Quick action buttons
- Recent executions list (last 10) with status icons and badges
- Empty state if no executions yet
- All links navigate correctly

- [ ] **Step 6: Commit**

```bash
git add dashboard/app/page.tsx
git commit -m "feat(dashboard): upgrade home page with KPI cards and recent executions feed"
```

---

### Task 2: Upgrade Execution Detail page

**Files:**
- Read first: `dashboard/app/executions/[id]/page.tsx`
- Modify: `dashboard/app/executions/[id]/page.tsx`

- [ ] **Step 1: Read the current execution detail page**

```bash
cat "dashboard/app/executions/[id]/page.tsx"
```

Note: the data shape of `execution.steps`, status values, and existing components used.

- [ ] **Step 2: Add step timeline to the execution detail page**

Find the section that renders step results (likely a table or list). Replace it with a timeline component:

```tsx
// Add this component above the export default in executions/[id]/page.tsx:

function StepTimeline({ steps }: { steps: Array<{
  id: string;
  name?: string;
  action?: string;
  status: string;
  duration_ms?: number;
  error?: string;
  request?: unknown;
  response?: unknown;
}> }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const STATUS_STYLE: Record<string, { dot: string; badge: string }> = {
    passed: { dot: 'bg-green-500', badge: 'text-green-600 border-green-600/30 bg-green-500/10' },
    completed: { dot: 'bg-green-500', badge: 'text-green-600 border-green-600/30 bg-green-500/10' },
    failed: { dot: 'bg-destructive', badge: 'text-destructive border-destructive/30 bg-destructive/10' },
    skipped: { dot: 'bg-muted-foreground', badge: 'text-muted-foreground border-border bg-muted' },
    running: { dot: 'bg-primary animate-pulse', badge: 'text-primary border-primary/30 bg-primary/10' },
  };

  return (
    <div className="space-y-1">
      {steps.map((step, i) => {
        const style = STATUS_STYLE[step.status] ?? STATUS_STYLE.skipped;
        const isOpen = expanded === step.id;
        const hasDetail = step.error || step.request || step.response;

        return (
          <div key={step.id} className="relative">
            {i < steps.length - 1 && (
              <div className="absolute left-[11px] top-8 bottom-0 w-px bg-border" />
            )}
            <button
              className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
              onClick={() => hasDetail && setExpanded(isOpen ? null : step.id)}
              disabled={!hasDetail}
            >
              <div className={`mt-1 h-3 w-3 rounded-full shrink-0 ${style.dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{step.name || step.action || `Step ${i + 1}`}</span>
                  <Badge variant="outline" className={`text-xs ${style.badge}`}>{step.status}</Badge>
                  {step.duration_ms != null && (
                    <span className="text-xs text-muted-foreground">{step.duration_ms}ms</span>
                  )}
                </div>
                {step.error && !isOpen && (
                  <p className="text-xs text-destructive mt-0.5 truncate">{step.error}</p>
                )}
              </div>
            </button>

            {isOpen && hasDetail && (
              <div className="ml-6 mb-2 rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-xs font-mono">
                {step.error && (
                  <div>
                    <p className="text-destructive font-medium mb-1 font-sans text-xs">Error</p>
                    <pre className="whitespace-pre-wrap text-destructive/80">{step.error}</pre>
                  </div>
                )}
                {step.request && (
                  <div>
                    <p className="text-muted-foreground font-medium mb-1 font-sans text-xs">Request</p>
                    <pre className="whitespace-pre-wrap text-foreground/80">
                      {JSON.stringify(step.request, null, 2)}
                    </pre>
                  </div>
                )}
                {step.response && (
                  <div>
                    <p className="text-muted-foreground font-medium mb-1 font-sans text-xs">Response</p>
                    <pre className="whitespace-pre-wrap text-foreground/80">
                      {JSON.stringify(step.response, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

Then in the page, replace the existing steps table/list with:

```tsx
{execution.steps?.length > 0 && (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">Steps</CardTitle>
    </CardHeader>
    <CardContent>
      <StepTimeline steps={execution.steps} />
    </CardContent>
  </Card>
)}
```

Add `'Analytics'` link if execution failed:

```tsx
{execution.status === 'failed' && (
  <div className="mt-4 text-center">
    <Link href="/analytics?tab=rca">
      <Button variant="outline" size="sm">
        <Stethoscope className="h-4 w-4 mr-2" />View RCA
      </Button>
    </Link>
  </div>
)}
```

- [ ] **Step 3: Verify execution detail**

Open an execution at `/executions/[id]`. Confirm:
- Step timeline shows with dots and connector lines
- Status badges colored correctly
- Click a step with error/request/response to expand detail
- Duration shown per step

- [ ] **Step 4: Commit**

```bash
git add "dashboard/app/executions/[id]/page.tsx"
git commit -m "feat(executions): upgrade execution detail with expandable step timeline"
```

---

### Task 3: Add Validation mode to Mesh Canvas

**Files:**
- Modify: `dashboard/components/flow-editor/FlowEditor.tsx`

The `ValidationPanel` and `validateFlow` function already exist in `components/flow-editor/`. Validation mode is a toolbar button that runs the existing `validateFlow()` and shows results in the Node Inspector / ValidationPanel.

- [ ] **Step 1: Read the existing ValidationPanel and validateFlow**

```bash
head -60 dashboard/components/flow-editor/ValidationPanel.tsx
head -30 dashboard/components/flow-editor/validation.ts
```

Note the `ValidationResult` type shape and what `ValidationPanel` expects as props.

- [ ] **Step 2: Add validate toolbar button and wire it**

In `dashboard/components/flow-editor/FlowEditor.tsx`, find the toolbar section. Add a Validate button next to Run:

```tsx
import { ShieldCheck } from 'lucide-react';

// In state declarations:
const [isValidating, setIsValidating] = useState(false);
const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

// Handler:
const handleValidate = useCallback(() => {
  setIsValidating(true);
  const definition = nodesAndEdgesToFlowDefinition(nodes, edges, yaml);
  const result = validateFlow(definition);
  setValidationResult(result);
  setIsValidating(false);
}, [nodes, edges, yaml]);

// In toolbar JSX, before the Run button:
<Button
  variant="outline"
  size="sm"
  onClick={handleValidate}
  disabled={isValidating}
  className="gap-1.5"
>
  <ShieldCheck className="h-4 w-4" />
  Validate
</Button>
```

- [ ] **Step 3: Show validation results in the side panel**

Find where `ValidationPanel` is currently rendered in `FlowEditor.tsx` (it may already be in a tab or hidden panel). Make it appear when `validationResult` is non-null:

```tsx
{validationResult && (
  <div className="absolute bottom-4 right-4 w-80 z-10">
    <Card className="shadow-lg border-border">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Validation Results</CardTitle>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setValidationResult(null)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent>
        <ValidationPanel result={validationResult} />
      </CardContent>
    </Card>
  </div>
)}
```

- [ ] **Step 4: Apply validation error styling to canvas nodes**

When `validationResult` contains errors referencing step IDs, apply error styling to those nodes. In `FlowEditor.tsx`, derive error step IDs:

```tsx
const errorStepIds = new Set(
  validationResult?.errors?.map((e: any) => e.step_id).filter(Boolean) ?? []
);
```

Pass `errorStepIds` down to `FlowCanvas` and in the custom node component, add:

```tsx
data.hasValidationError && 'border-destructive shadow-[0_0_0_2px_hsl(var(--destructive)/0.2)]'
```

(Wire `data.hasValidationError = errorStepIds.has(node.id)` via `setNodes` in a `useEffect` when `validationResult` changes.)

- [ ] **Step 5: Verify validation mode**

Open a flow. Click Validate. Confirm:
- Validation result card appears bottom-right
- Any invalid steps show destructive border on their canvas node
- Closing the card clears the validation state
- Running after validation still works

- [ ] **Step 6: Commit**

```bash
git add dashboard/components/flow-editor/FlowEditor.tsx dashboard/components/flow-editor/FlowCanvas.tsx
git commit -m "feat(mesh-canvas): add validation mode with inline result card and node error highlights"
```

---

### Task 4: Global blue-to-teal sweep and consistency pass

**Files:**
- Scan all files in `dashboard/` for hardcoded blue color references

- [ ] **Step 1: Find all hardcoded blue color usage**

```bash
grep -r "blue-\|text-blue\|bg-blue\|border-blue\|ring-blue" dashboard/app dashboard/components --include="*.tsx" -l
```

- [ ] **Step 2: Replace hardcoded blue with teal equivalents in each file**

For each file found, replace patterns like:
- `text-blue-500` → `text-primary`
- `bg-blue-500` → `bg-primary`
- `bg-blue-100 text-blue-700` → `bg-primary/10 text-primary`
- `dark:bg-blue-900/30 dark:text-blue-400` → `dark:bg-primary/10 dark:text-primary`

In particular, fix the `MethodBadge` in `analytics/page.tsx` (it has hardcoded HTTP method colors — keep those as they provide semantic meaning, only replace incidental blue usage).

- [ ] **Step 3: Replace spinner loading states with skeletons**

```bash
grep -r "animate-spin\|Loader2\|Loading\.\.\." dashboard/app --include="*.tsx" -l | head -10
```

For each file that shows a spinner as a full-page loading state (not as an inline button spinner), replace with a skeleton layout. For inline button spinners (`<Loader2 className="animate-spin" />` next to button text), keep them — they are appropriate.

Example replacement for a page-level loader:
```tsx
// Before:
<div className="flex items-center justify-center py-12">
  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
</div>

// After:
<div className="space-y-3 py-4">
  <Skeleton className="h-10 w-full" />
  <Skeleton className="h-32 w-full" />
  <Skeleton className="h-32 w-full" />
</div>
```

- [ ] **Step 4: Verify Sonner toast styling**

Open `dashboard/components/layout/` or check where `<Toaster />` is configured. In `dashboard/app/layout.tsx`, update the Toaster to use theme:

```tsx
<Toaster richColors theme="dark" />
```

Trigger a toast (run a flow, save a flow) and confirm it shows with the correct dark theme and teal accent.

- [ ] **Step 5: Final visual check across all main pages**

Visit each of these pages and confirm no blue remnants, consistent spacing, correct font:
- `/` (Dashboard)
- `/flows`
- `/flows/[id]` (Mesh Canvas)
- `/executions`
- `/executions/[id]`
- `/analytics`
- `/graph`
- `/integrations`
- `/settings` (any settings page)

- [ ] **Step 6: Commit**

```bash
git add dashboard/
git commit -m "feat(dashboard): global blue-to-teal sweep, skeleton loading states, Sonner dark theme"
```

---

### Phase 4 complete

At this point all four phases are complete. The OSS dashboard is fully aligned to the Stitch design system with teal accent, Space Grotesk, 12px radius, collapsible navigation, Mesh Canvas flow editor, consolidated analytics, card grid flows, CI/CD snippets, upgraded home and execution pages, and validation mode.
