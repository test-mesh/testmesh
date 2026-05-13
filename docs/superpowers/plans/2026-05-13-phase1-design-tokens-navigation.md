# Phase 1: Design Tokens + Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the OSS dashboard visual identity to the Stitch design system (teal accent, Space Grotesk, 12px radius) and restructure the sidebar into 6 collapsible groups.

**Architecture:** Token changes in `globals.css` propagate through shadcn/ui CSS variables automatically. The Sidebar is a self-contained client component rewritten in-place. No new routes or API calls.

**Tech Stack:** Next.js 16, Tailwind CSS v4, shadcn/ui (Radix Nova), next/font/google

---

### Task 1: Update color tokens, radius, and chart scale in globals.css

**Files:**
- Modify: `dashboard/app/globals.css`

- [ ] **Step 1: Replace the `:root` light-mode token block**

In `dashboard/app/globals.css`, replace the entire `:root { ... }` block (lines 50–83) with:

```css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.60 0.15 163);
  --primary-foreground: oklch(0.98 0 0);
  --secondary: oklch(0.967 0.001 286.375);
  --secondary-foreground: oklch(0.21 0.006 285.885);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.60 0.15 163);
  --accent-foreground: oklch(0.98 0 0);
  --destructive: oklch(0.58 0.22 27);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.60 0.15 163);
  --chart-1: oklch(0.90 0.10 163);
  --chart-2: oklch(0.84 0.14 163);
  --chart-3: oklch(0.74 0.14 163);
  --chart-4: oklch(0.64 0.13 163);
  --chart-5: oklch(0.54 0.12 163);
  --radius: 0.75rem;
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.60 0.15 163);
  --sidebar-primary-foreground: oklch(0.98 0 0);
  --sidebar-accent: oklch(0.60 0.15 163);
  --sidebar-accent-foreground: oklch(0.98 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.60 0.15 163);
}
```

- [ ] **Step 2: Replace the `.dark` token block**

Replace the entire `.dark { ... }` block (lines 85–117) with:

```css
.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.84 0.15 163);
  --primary-foreground: oklch(0.15 0 0);
  --secondary: oklch(0.274 0.006 286.033);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.84 0.15 163);
  --accent-foreground: oklch(0.15 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 8%);
  --input: oklch(1 0 0 / 12%);
  --ring: oklch(0.84 0.15 163);
  --chart-1: oklch(0.90 0.10 163);
  --chart-2: oklch(0.84 0.14 163);
  --chart-3: oklch(0.74 0.14 163);
  --chart-4: oklch(0.64 0.13 163);
  --chart-5: oklch(0.54 0.12 163);
  --sidebar: oklch(0.175 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.84 0.15 163);
  --sidebar-primary-foreground: oklch(0.15 0 0);
  --sidebar-accent: oklch(0.84 0.15 163);
  --sidebar-accent-foreground: oklch(0.15 0 0);
  --sidebar-border: oklch(1 0 0 / 8%);
  --sidebar-ring: oklch(0.84 0.15 163);
}
```

- [ ] **Step 3: Verify visually**

Start the dev server if not running:
```bash
cd dashboard && npm run dev
```
Open http://localhost:3000. Confirm:
- Buttons, links, badges show teal/mint color instead of blue
- Border radius on cards is slightly tighter (12px)
- Dark mode background and sidebar have correct contrast

- [ ] **Step 4: Commit**

```bash
git add dashboard/app/globals.css
git commit -m "feat(dashboard): align color tokens and radius to Stitch design system"
```

---

### Task 2: Swap font from Outfit to Space Grotesk

**Files:**
- Modify: `dashboard/app/layout.tsx`

- [ ] **Step 1: Replace font imports and variable**

In `dashboard/app/layout.tsx`, replace lines 1–12:

```tsx
import type { Metadata } from "next";
import { Space_Grotesk, Geist_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/lib/providers/query-provider";
import { ThemeProvider } from "@/lib/providers/theme-provider";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { MainLayout } from "@/components/layout";
import { WorkspaceProvider } from "@/components/workspaces/WorkspaceProvider";
import { Toaster } from "@/components/ui/sonner";
import { CloudAuthGuard } from "@/components/auth/CloudAuthGuard";

const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-sans' });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
```

- [ ] **Step 2: Update the html element className**

Replace the `<html>` and `<body>` element in the `RootLayout`:

```tsx
  return (
    <html lang="en" className={spaceGrotesk.variable} suppressHydrationWarning>
      <body
        className={`${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
```

- [ ] **Step 3: Verify visually**

Open http://localhost:3000. Confirm heading and body text renders in Space Grotesk (geometric, clean sans-serif). Code/YAML blocks still render in Geist Mono.

- [ ] **Step 4: Commit**

```bash
git add dashboard/app/layout.tsx
git commit -m "feat(dashboard): swap Outfit font for Space Grotesk"
```

---

### Task 3: Rework Sidebar to 6 collapsible groups

**Files:**
- Modify: `dashboard/components/layout/Sidebar.tsx`

- [ ] **Step 1: Check if Collapsible is available**

```bash
ls dashboard/components/ui/ | grep -i collapsible
```

If `collapsible.tsx` is missing, add it:
```bash
cd dashboard && npx shadcn@latest add collapsible
```

- [ ] **Step 2: Write the new Sidebar.tsx**

Replace the entire content of `dashboard/components/layout/Sidebar.tsx` with:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  LayoutDashboard,
  FileText,
  FolderTree,
  Calendar,
  Play,
  Layers,
  ShieldCheck,
  Globe,
  Server,
  Network,
  Plug,
  BarChart3,
  Settings,
  Container,
  Puzzle,
  HeartPulse,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';
import { useWorkspace } from '@/components/workspaces/WorkspaceProvider';

const CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL;

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  items?: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: 'Dashboard',
    href: '/',
    icon: LayoutDashboard,
  },
  {
    title: 'Flows',
    icon: FileText,
    items: [
      { title: 'All Flows', href: '/flows', icon: FileText },
      { title: 'Collections', href: '/collections', icon: FolderTree },
      { title: 'Schedules', href: '/schedules', icon: Calendar },
    ],
  },
  {
    title: 'Executions',
    icon: Play,
    items: [
      { title: 'History', href: '/executions', icon: Play },
      { title: 'Suites', href: '/suites', icon: Layers },
      { title: 'Coverage', href: '/coverage', icon: ShieldCheck },
    ],
  },
  {
    title: 'Infrastructure',
    icon: Server,
    items: [
      { title: 'Environments', href: '/environments', icon: Globe },
      { title: 'Mock Servers', href: '/mocks', icon: Server },
      { title: 'System Graph', href: '/graph', icon: Network },
      { title: 'Integrations', href: '/integrations', icon: Plug },
    ],
  },
  {
    title: 'Analytics',
    href: '/analytics',
    icon: BarChart3,
  },
  {
    title: 'Settings',
    icon: Settings,
    items: [
      { title: 'Test Environments', href: '/test-environments', icon: Container },
      { title: 'Plugins', href: '/plugins', icon: Puzzle },
      { title: 'Health', href: '/health', icon: HeartPulse },
    ],
  },
];

interface SidebarProps {
  mobileMenuOpen?: boolean;
  onMobileMenuClose?: () => void;
}

function NavLink({ href, icon: Icon, title, active, onClick }: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {title}
    </Link>
  );
}

export function Sidebar({ mobileMenuOpen, onMobileMenuClose }: SidebarProps) {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    navGroups.forEach(g => {
      if (g.items) {
        initial[g.title] = g.items.some(i => pathname.startsWith(i.href));
      }
    });
    return initial;
  });

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const toggleGroup = (title: string) =>
    setOpenGroups(prev => ({ ...prev, [title]: !prev[title] }));

  return (
    <>
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onMobileMenuClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'flex flex-col h-full border-r bg-sidebar w-[220px] shrink-0',
          'md:relative fixed inset-y-0 left-0 z-50',
          mobileMenuOpen ? 'flex' : 'hidden md:flex'
        )}
      >
        <ScrollArea className="flex-1 py-3">
          <nav className="px-3 space-y-0.5">
            {navGroups.map((group) => {
              if (!group.items) {
                return (
                  <NavLink
                    key={group.title}
                    href={group.href!}
                    icon={group.icon}
                    title={group.title}
                    active={isActive(group.href!)}
                    onClick={onMobileMenuClose}
                  />
                );
              }

              const isGroupActive = group.items.some(i => isActive(i.href));
              const isOpen = openGroups[group.title] ?? isGroupActive;
              const GroupIcon = group.icon;

              return (
                <Collapsible
                  key={group.title}
                  open={isOpen}
                  onOpenChange={() => toggleGroup(group.title)}
                >
                  <CollapsibleTrigger className={cn(
                    'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    isGroupActive
                      ? 'text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}>
                    <GroupIcon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left">{group.title}</span>
                    <ChevronDown className={cn(
                      'h-3.5 w-3.5 transition-transform duration-200',
                      isOpen && 'rotate-180'
                    )} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-0.5 ml-3 pl-3 border-l border-border space-y-0.5">
                    {group.items.map(item => (
                      <NavLink
                        key={item.href}
                        href={item.href}
                        icon={item.icon}
                        title={item.title}
                        active={isActive(item.href)}
                        onClick={onMobileMenuClose}
                      />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </nav>
        </ScrollArea>

        {/* Bottom section */}
        <div className="border-t border-sidebar-border px-3 py-3 space-y-1">
          {CLOUD_URL && (
            <a
              href={CLOUD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              Cloud Dashboard
            </a>
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Fix layout width — the main layout likely assumes the old 80px (w-20) sidebar**

Read `dashboard/components/layout/index.ts` to find the layout wrapper:

```bash
cat dashboard/components/layout/index.ts
```

Then open the main layout component (likely `dashboard/components/layout/MainLayout.tsx` or similar). Find where the sidebar width is hardcoded as `ml-20` or `pl-20` and update it to `ml-[220px]` (or `md:ml-[220px]` if responsive).

- [ ] **Step 4: Verify visually**

Open http://localhost:3000. Confirm:
- Sidebar is 220px wide with icon + label
- "Flows", "Executions", "Infrastructure", "Settings" groups expand/collapse with chevron
- "Dashboard" and "Analytics" are direct links (no sub-items)
- Active item shows teal background tint + teal text
- Groups containing the active route auto-expand on load
- All existing pages still accessible

- [ ] **Step 5: Commit**

```bash
git add dashboard/components/layout/Sidebar.tsx
git commit -m "feat(dashboard): rework sidebar to 6 collapsible groups with labels"
```

---

### Phase 1 complete

At this point: teal accent throughout, Space Grotesk font, 12px radius, and structured 220px sidebar. All 56 existing routes remain functional.
