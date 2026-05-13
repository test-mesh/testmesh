# Phase 2: Mesh Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/flows/[id]` detail page with the Mesh Canvas (visual flow editor) as the primary experience. The existing FlowEditor component already exists in `components/flow-editor/` — this phase reskins it, restructures the layout to match the Stitch three-panel design, and moves the YAML view into a Sheet drawer.

**Architecture:** `FlowEditor.tsx` is the main orchestrator — it already has `FlowCanvas`, `NodePalette`, `PropertiesPanel`, and `ValidationPanel` sub-components. We restyle nodes with teal accent, wire a YAML Sheet drawer, and mount the editor directly on `/flows/[id]` replacing the old tabs-based detail view. The old edit page (`/flows/[id]/edit`) is redirected to `/flows/[id]` to consolidate.

**Tech Stack:** ReactFlow 11, shadcn Sheet, Monaco Editor (already installed), Next.js App Router

---

### Task 1: Restyle FlowCanvas nodes with teal accent and status badges

**Files:**
- Read first: `dashboard/components/flow-editor/FlowCanvas.tsx`
- Modify: `dashboard/components/flow-editor/FlowCanvas.tsx`

- [ ] **Step 1: Read the current FlowCanvas to understand node rendering**

```bash
cat dashboard/components/flow-editor/FlowCanvas.tsx
```

Identify the custom node component (look for `nodeTypes` definition and the component that renders individual nodes).

- [ ] **Step 2: Update node card styling**

Find the node card wrapper in FlowCanvas (or the custom node component). Update its className to use teal accent for selected state and dark card background:

```tsx
// In the custom node component, replace the outer wrapper className logic:
className={cn(
  'rounded-xl border bg-card shadow-sm min-w-[180px] max-w-[240px]',
  'transition-all duration-150',
  selected
    ? 'border-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.3)]'
    : 'border-border hover:border-primary/40',
  data.status === 'running' && 'border-primary animate-pulse',
  data.status === 'passed' && 'border-green-500/60',
  data.status === 'failed' && 'border-destructive/60',
)}
```

- [ ] **Step 3: Add status badge to node header**

Inside the node header area, add a status indicator dot:

```tsx
{data.status && data.status !== 'idle' && (
  <span className={cn(
    'inline-block w-2 h-2 rounded-full shrink-0',
    data.status === 'running' && 'bg-primary animate-pulse',
    data.status === 'passed' && 'bg-green-500',
    data.status === 'failed' && 'bg-destructive',
  )} />
)}
```

- [ ] **Step 4: Verify canvas renders correctly**

Navigate to `/flows/[id]/edit` (existing edit page). Confirm nodes render with dark card, teal border on select, status dots. Use browser devtools to check no console errors.

- [ ] **Step 5: Commit**

```bash
git add dashboard/components/flow-editor/FlowCanvas.tsx
git commit -m "feat(mesh-canvas): restyle ReactFlow nodes with teal accent and status badges"
```

---

### Task 2: Replace YAML inline editor with a Sheet drawer

**Files:**
- Modify: `dashboard/components/flow-editor/FlowEditor.tsx`
- Read first: `dashboard/components/ui/sheet.tsx` (verify Sheet is available)

- [ ] **Step 1: Verify Sheet component exists**

```bash
ls dashboard/components/ui/ | grep sheet
```

If missing: `cd dashboard && npx shadcn@latest add sheet`

- [ ] **Step 2: Add Sheet import to FlowEditor.tsx**

At the top of `dashboard/components/flow-editor/FlowEditor.tsx`, add to imports:

```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
```

- [ ] **Step 3: Add yamlDrawerOpen state**

In the `FlowEditor` component body, add:

```tsx
const [yamlDrawerOpen, setYamlDrawerOpen] = useState(false);
```

- [ ] **Step 4: Find the current YAML tab/panel and replace with Sheet**

In `FlowEditor.tsx`, find where the YAML textarea/Monaco editor is rendered (it will be inside a `TabsContent value="yaml"` or similar). Remove it from the tabs and instead add a Sheet below the main layout:

```tsx
<Sheet open={yamlDrawerOpen} onOpenChange={setYamlDrawerOpen}>
  <SheetContent side="right" className="w-[560px] sm:w-[640px] p-0 flex flex-col">
    <SheetHeader className="px-6 py-4 border-b">
      <SheetTitle className="text-base font-semibold">Flow YAML</SheetTitle>
    </SheetHeader>
    <div className="flex-1 overflow-hidden">
      <Textarea
        value={yaml}
        onChange={(e) => {
          setYaml(e.target.value);
          const parsed = parseYaml(e.target.value);
          if (parsed) {
            const { nodes: newNodes, edges: newEdges } = flowDefinitionToNodesAndEdges(parsed);
            setNodes(newNodes);
            setEdges(newEdges);
          }
        }}
        className="h-full w-full resize-none font-mono text-sm border-0 rounded-none focus-visible:ring-0 bg-background"
        spellCheck={false}
      />
    </div>
  </SheetContent>
</Sheet>
```

- [ ] **Step 5: Wire the YAML toolbar button to open the drawer**

Find the existing "Code" or "YAML" button in the FlowEditor toolbar. Change its `onClick` to:

```tsx
onClick={() => setYamlDrawerOpen(true)}
```

- [ ] **Step 6: Verify YAML drawer**

Open the flow editor at `/flows/[id]/edit`. Click the YAML button. Confirm a right-side sheet opens with the YAML content. Edit YAML and confirm canvas nodes update on change.

- [ ] **Step 7: Commit**

```bash
git add dashboard/components/flow-editor/FlowEditor.tsx
git commit -m "feat(mesh-canvas): move YAML editor into Sheet drawer"
```

---

### Task 3: Make `/flows/[id]` show the Mesh Canvas as primary view

**Files:**
- Modify: `dashboard/app/flows/[id]/page.tsx`
- Read first: `dashboard/app/flows/[id]/edit/page.tsx` (to understand how FlowEditor is mounted there)

- [ ] **Step 1: Read the edit page to understand FlowEditor mounting**

```bash
cat "dashboard/app/flows/[id]/edit/page.tsx"
```

Note the props passed to FlowEditor (`initialDefinition`, `onSave`, `onRun`, etc.) and any data fetching hooks used.

- [ ] **Step 2: Replace the flow detail page with Mesh Canvas**

Replace the entire content of `dashboard/app/flows/[id]/page.tsx` with:

```tsx
'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useFlow, useUpdateFlow } from '@/lib/hooks/useFlows';
import { useCreateExecution } from '@/lib/hooks/useExecutions';
import { FlowEditor } from '@/components/flow-editor';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import type { FlowDefinition } from '@/lib/api/types';

export default function FlowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const { data: flow, isLoading, error } = useFlow(id);
  const updateFlow = useUpdateFlow();
  const createExecution = useCreateExecution();

  const handleSave = (yaml: string, definition: FlowDefinition) => {
    updateFlow.mutate({ id, definition, yaml });
  };

  const handleRun = (definition: FlowDefinition) => {
    createExecution.mutate(
      { flow_id: id, environment: 'development' },
      { onSuccess: (exec) => router.push(`/executions/${exec.id}`) }
    );
  };

  if (isLoading) {
    return (
      <div className="h-[calc(100vh-57px)] flex flex-col gap-2 p-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="flex-1" />
      </div>
    );
  }

  if (error || !flow) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Flow not found or failed to load.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-57px)]">
      <FlowEditor
        initialDefinition={flow.definition}
        onSave={handleSave}
        onRun={handleRun}
        isSaving={updateFlow.isPending}
        isRunning={createExecution.isPending}
      />
    </div>
  );
}
```

Note: `57px` is the header height. Adjust if the actual header height differs (check `dashboard/components/layout/Header.tsx` or the main layout CSS).

- [ ] **Step 3: Verify hook availability**

Check that `useUpdateFlow` exists:

```bash
grep -r "useUpdateFlow\|updateFlow" dashboard/lib/hooks/
```

If it doesn't exist, find the correct update hook name (may be `useSaveFlow` or similar) and use that instead in step 2.

- [ ] **Step 4: Redirect the old edit page to the detail page**

Replace `dashboard/app/flows/[id]/edit/page.tsx` with a redirect:

```tsx
import { redirect } from 'next/navigation';

export default function FlowEditRedirect({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/flows/${params.id}`);
}
```

- [ ] **Step 5: Add breadcrumb back to /flows in FlowEditor toolbar**

In `dashboard/components/flow-editor/FlowEditor.tsx`, find the toolbar area. Add a back link using Next.js Link at the far left of the toolbar:

```tsx
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

// In toolbar JSX, as the first element:
<Link href="/flows">
  <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
    <ArrowLeft className="h-4 w-4" />
    Flows
  </Button>
</Link>
```

- [ ] **Step 6: Verify full Mesh Canvas experience**

1. Go to `/flows` and click a flow — should open the canvas directly (not the old detail tabs)
2. Canvas shows nodes draggable, YAML drawer opens via button
3. Save works (updates flow)
4. Run button creates execution and redirects to execution detail
5. Back arrow returns to `/flows`

- [ ] **Step 7: Commit**

```bash
git add "dashboard/app/flows/[id]/page.tsx" "dashboard/app/flows/[id]/edit/page.tsx" dashboard/components/flow-editor/FlowEditor.tsx
git commit -m "feat(mesh-canvas): make flow detail page the primary Mesh Canvas view"
```

---

### Task 4: Wire live execution status updates to canvas nodes

**Files:**
- Modify: `dashboard/app/flows/[id]/page.tsx`
- Modify: `dashboard/components/flow-editor/FlowEditor.tsx`

- [ ] **Step 1: Check if WebSocket or polling hook exists for execution status**

```bash
grep -r "websocket\|useExecution\b\|execution.*status" dashboard/lib/hooks/ --include="*.ts" -l
```

- [ ] **Step 2: Poll execution status during run**

In `dashboard/app/flows/[id]/page.tsx`, add execution polling after run starts:

```tsx
import { useState } from 'react';
import { useExecution } from '@/lib/hooks/useExecutions';

// Add state for active execution ID
const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null);

// Poll execution (React Query refetchInterval handles polling)
const { data: activeExecution } = useExecution(activeExecutionId ?? '', {
  enabled: !!activeExecutionId,
  refetchInterval: (data) =>
    data?.status === 'running' ? 1500 : false,
});

// Update handleRun to capture the execution ID:
const handleRun = (definition: FlowDefinition) => {
  createExecution.mutate(
    { flow_id: id, environment: 'development' },
    {
      onSuccess: (exec) => {
        setActiveExecutionId(exec.id);
      },
    }
  );
};
```

- [ ] **Step 3: Pass execution step statuses to FlowEditor**

Add `executionSteps` prop to FlowEditor and thread it down to FlowCanvas so nodes can receive `status`:

In `FlowEditor.tsx`, add to `FlowEditorProps`:
```tsx
executionSteps?: Array<{ id: string; status: 'running' | 'passed' | 'failed' | 'idle' }>;
```

Pass it down to `FlowCanvas`:
```tsx
<FlowCanvas
  nodes={nodes}
  edges={edges}
  // ... existing props
  executionSteps={executionSteps}
/>
```

In `FlowCanvas.tsx`, use `executionSteps` to update node `data.status` via a `useEffect`:
```tsx
useEffect(() => {
  if (!executionSteps) return;
  setNodes(nds => nds.map(n => ({
    ...n,
    data: {
      ...n.data,
      status: executionSteps.find(s => s.id === n.id)?.status ?? 'idle',
    },
  })));
}, [executionSteps]);
```

- [ ] **Step 4: Wire activeExecution steps to FlowEditor in the page**

In `dashboard/app/flows/[id]/page.tsx`, pass execution steps to the editor:

```tsx
const executionSteps = activeExecution?.steps?.map(s => ({
  id: s.step_id,
  status: s.status as 'running' | 'passed' | 'failed' | 'idle',
}));

// In JSX:
<FlowEditor
  initialDefinition={flow.definition}
  onSave={handleSave}
  onRun={handleRun}
  isSaving={updateFlow.isPending}
  isRunning={createExecution.isPending}
  executionSteps={executionSteps}
/>
```

- [ ] **Step 5: Verify live node updates**

Run a flow. Confirm nodes change color/badge as steps execute. If the execution API doesn't return step-level status, skip the per-node animation — just show the Run button spinner while running.

- [ ] **Step 6: Commit**

```bash
git add "dashboard/app/flows/[id]/page.tsx" dashboard/components/flow-editor/FlowEditor.tsx dashboard/components/flow-editor/FlowCanvas.tsx
git commit -m "feat(mesh-canvas): wire live execution step status to canvas nodes"
```

---

### Phase 2 complete

At this point: `/flows/[id]` shows the Mesh Canvas as the primary view. Nodes styled with teal accent and status badges. YAML is a sheet drawer. Running a flow updates node status live.
