'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { StatsBar } from '@/components/graph/StatsBar';
import { RepoTable } from '@/components/graph/RepoTable';
import { GraphCanvas } from '@/components/graph/GraphCanvas';
import { CoveragePanel } from '@/components/graph/CoveragePanel';
import { ConflictsPanel } from '@/components/graph/ConflictsPanel';

const TABS = ['overview', 'explorer', 'coverage', 'conflicts'] as const;
type Tab = typeof TABS[number];

export default function GraphPage() {
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <div className="px-6 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-[#c8dce8]">System Graph</h1>
        <p className="text-xs text-[#3d5670] mt-0.5">Discover services, APIs, and their dependencies across your codebase.</p>
      </div>

      <div className="flex gap-1 mb-4">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'h-7 px-3 rounded-lg text-xs capitalize transition-colors',
              tab === t
                ? 'bg-teal-400/15 text-teal-400 border border-teal-400/30'
                : 'text-[#4a6480] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] hover:text-[#7fa8c8]'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="flex flex-col gap-4">
          <StatsBar />
          <RepoTable />
        </div>
      )}
      {tab === 'explorer' && <GraphCanvas />}
      {tab === 'coverage' && <CoveragePanel />}
      {tab === 'conflicts' && <ConflictsPanel />}
    </div>
  );
}
