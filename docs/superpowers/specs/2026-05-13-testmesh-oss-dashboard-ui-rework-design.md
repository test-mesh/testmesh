# TestMesh OSS Dashboard UI/UX Rework

**Date:** 2026-05-13  
**Scope:** OSS dashboard only (`testmesh/dashboard/`). Cloud dashboard is a separate product and excluded entirely.  
**Stitch project:** `projects/7578085931736521812` — "Visual Mesh Interface - PRD"  
**Approach:** Incremental screen-by-screen replacement. App stays functional throughout. Four phases ship independently.

---

## Design System Alignment

### Fonts
- **Headings + body:** Space Grotesk (replaces Outfit/Geist)
- **Code / YAML:** Geist Mono (unchanged)
- Import via Google Fonts in `globals.css`

### Color Tokens (dark-first, matching Stitch)
| Token | Value | Notes |
|---|---|---|
| `--primary` | `#42f0b6` | Teal/mint accent — replaces blue |
| `--background` | `oklch(0.145 0 0)` | Unchanged |
| `--sidebar` | `oklch(0.175 0 0)` | Slightly lighter than bg |
| `--border` | `oklch(1 0 0 / 8%)` | More subtle than current 10% |
| `--destructive` | unchanged | Red stays |

Chart colors rebuild as 5-step teal scale anchored to `#42f0b6`.

### Radius
- Base: `0.75rem` (12px) — matches Stitch `ROUND_TWELVE`

### Saturation
- Stitch saturation level 2: colors are vivid, not muted. Teal accent is punchy against dark background.

### Scope of changes
All token changes live in `dashboard/app/globals.css` and `tailwind.config.*`. shadcn/ui components pick up CSS variables automatically — no component-level changes needed for token alignment.

---

## Navigation Architecture

### Sidebar (220px, always expanded on desktop)
Six top-level items with collapsible sub-groups. Icon + label always visible. Active item: teal accent at 10% opacity background, teal text. Chevron toggles sub-group expansion.

```
1. Dashboard          /
2. Flows              /flows
   ├── All Flows      /flows
   ├── Collections    /collections
   └── Schedules      /schedules
3. Executions         /executions
   ├── History        /executions
   ├── Suites         /suites
   └── Coverage       /coverage
4. Infrastructure
   ├── Environments   /environments
   ├── Mock Servers   /mocks
   ├── System Graph   /graph
   └── Integrations   /integrations
5. Analytics          /analytics
6. Settings           /workspaces/[id]/settings
   ├── Test Envs      /test-environments
   ├── Plugins        /plugins
   └── Health         /health
```

**Bottom-anchored:** Workspace switcher + user avatar.

### Removed from sidebar (accessible contextually)
| Route | New entry point |
|---|---|
| `/request-builder` | Flow editor toolbar |
| `/debug` | Execution detail page |
| `/import` | Flows page header button |
| `/runner` | Settings |
| All `/ai/*` routes | Contextual buttons per page |

All routes remain functional — only their sidebar visibility changes.

---

## Phase 1: Design Tokens + Navigation

**Goal:** Visual identity aligned to Stitch, navigation restructured. Every existing page benefits immediately.

**Files changed:**
- `dashboard/app/globals.css` — font imports, color tokens, radius
- `tailwind.config.*` — chart color scale
- `dashboard/components/layout/Sidebar.tsx` — full rework to collapsible 6-group structure
- `dashboard/app/layout.tsx` — font class updates

**Definition of done:** App loads with teal accent, Space Grotesk, 12px radius. Sidebar shows 6 collapsed groups. All existing pages still function.

---

## Phase 2: Mesh Canvas (Flow Editor)

**Route:** `/flows/[id]` — replaces current flow detail page.

### Three-panel layout
```
┌─────────────────────────────────────────────────────┐
│ Toolbar: [flow name] · [Validate] · [Run] · [YAML]  │
├──────────┬──────────────────────────────┬───────────┤
│  Step    │                              │   Node    │
│ Library  │     ReactFlow Canvas         │ Inspector │
│  160px   │     (fills remaining)        │   320px   │
│          │                              │ (on select│
│ drag to  │                              │  only)    │
│ add step │                              │           │
└──────────┴──────────────────────────────┴───────────┘
```

### Left panel — Step Library
- Grouped by protocol: HTTP, Database, Kafka, gRPC, Redis, WebSocket, etc.
- Search filter at top
- Drag onto canvas to add a step
- "Generate with AI" button at bottom — opens prompt input, calls AI generate API, drops nodes onto canvas

### Canvas
- Existing ReactFlow implementation retained
- Node styling: dark card, teal accent border on selected, status badges (pass/fail/running/idle)
- Edges animated during run
- Mini-map bottom-right corner
- Pan/zoom controls bottom-left

### Right panel — Node Inspector
- Hidden until a node is selected, then slides in (320px)
- Shows: action type header, config fields as form (not raw YAML), assertion builder, output mapping
- "View YAML" button at bottom opens YAML Drawer

### YAML Drawer
- Full-height right Sheet (shadcn Sheet)
- Monaco editor with full flow YAML
- Changes sync back to canvas on save
- Triggered from toolbar "YAML" button or Node Inspector

### Toolbar
- Flow name: inline editable
- Validate: dry-run mode (see Phase 4)
- Run: teal primary button, triggers execution with live WebSocket node status updates
- YAML: toggles YAML Drawer
- Breadcrumb: back to `/flows`

**Definition of done:** `/flows/[id]` shows three-panel canvas. Nodes draggable from library. Node Inspector appears on node click. YAML Drawer opens and syncs. Run button executes and updates node status live.

---

## Phase 3: Missing & Consolidated Screens

### Analytics (`/analytics`) — single page, 5 tabs

**Overview tab**
- 3 KPI cards: total flows, 24h pass rate, active schedules
- Execution timeline (last 7 days)
- Recent failures feed
- Replaces: `/analytics` home

**RCA tab**
- Failed execution selector (list on left)
- Root cause timeline on right: step-by-step failure trace
- AI diagnosis card with suggested fix (calls existing diagnosis API)
- Replaces: `/analytics/diagnosis`

**Flakiness tab**
- Flow reliability heatmap
- Ranked flaky flows list with trend sparkline
- Replaces: `/analytics/flakiness`

**Trends tab**
- Pass rate over time, duration over time, volume over time
- Date range picker
- Replaces: `/analytics/trends` + `/analytics/steps`

**Alerts tab** *(currently missing)*
- List of configured alert rules
- Create rule form: select flow/suite → condition (fail rate > X%, duration > Xs) → notification channel (webhook, email, Slack)
- Connects to existing notifications API

### Flows page (`/flows`) — Scenario Library rework
- Card grid (default) + table toggle
- Each card: flow name, last run status badge, protocol tags, last run time, Run button
- Left mini-sidebar: Collections as folder tree
- Header actions: "New Flow", "Import", "Generate with AI"
- AI generation: opens a sheet with a prompt input

### CI/CD tab on Integrations (`/integrations`)
- Add "CI/CD" tab to existing integrations page
- Static content: copy-pasteable snippets for GitHub Actions, GitLab CI, curl
- No backend changes

**Definition of done:** `/analytics` has 5 functional tabs. `/flows` shows card grid with collection sidebar. `/integrations` has CI/CD tab with code snippets.

---

## Phase 4: Polish

### Flow Validation (`/flows/[id]` — new mode)
- "Validate" button in Mesh Canvas toolbar
- Triggers dry-run/lint without execution
- Nodes receive validation state badges: ok / warning / error
- Error details appear in Node Inspector
- No new route — canvas mode state

### Execution Detail (`/executions/[id]`) — upgrade
- Step-by-step timeline with expand/collapse
- Pass/fail/skip badges per step
- Request/response viewer in bottom drawer (existing `response-viewer` component)
- Duration bar chart across steps
- "View RCA" link if any step failed

### Dashboard home (`/`) — upgrade
- 3 KPI cards: flows count, 24h pass rate, active schedules
- Recent executions feed (last 10 with status)
- Quick actions: New Flow · View Executions · View Graph
- System health indicator (calls `/health` API)

### Global polish
- All blue primary replaced with teal across every component
- Space Grotesk applied globally
- Empty states: consistent illustration + CTA using shadcn `empty` component
- Loading states: skeleton shimmer (not spinners)
- Toasts: Sonner styled with teal accent

**Definition of done:** Validation mode works on canvas. Execution detail shows timeline view. Dashboard home shows KPI cards and recent feed. No remaining blue accent anywhere in the UI.

---

## What is Excluded (Cloud-only — do not implement in OSS)

- Billing & Usage screens
- Team Management / RBAC
- Agent Configuration
- Projects Hub (multi-org)
- SSO / enterprise auth

---

## Technical Constraints

- Next.js 16, React 19, TypeScript — no version changes
- Tailwind v4 via `@tailwindcss/postcss` — use CSS variables, not arbitrary values
- shadcn/ui with Radix Nova style — extend, don't replace
- ReactFlow 11 — keep existing implementation, restyle nodes
- All existing API hooks and React Query calls — unchanged
- All 56 routes remain functional — only layouts and visuals change
