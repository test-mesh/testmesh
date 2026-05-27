'use client';

import { GitBranch, Layers, Server, ShieldCheck } from 'lucide-react';
import { useGraphStats } from '@/lib/hooks/useGraph';

export function StatsBar() {
  const { data: stats, isLoading } = useGraphStats();

  const items = [
    { label: 'Total Nodes', value: stats?.total_nodes ?? 0, icon: Layers },
    { label: 'Total Edges', value: stats?.total_edges ?? 0, icon: GitBranch },
    { label: 'Services', value: stats?.service_count ?? 0, icon: Server },
    { label: 'Coverage', value: stats ? `${stats.coverage_percent.toFixed(1)}%` : '—', icon: ShieldCheck },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(({ label, value, icon: Icon }) => (
        <div key={label} className="flex flex-col gap-3 p-4 rounded-xl bg-[#0f1923] border border-[#1e2d3d]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{label}</span>
            <Icon className="w-3.5 h-3.5 text-[#2a3d52]" />
          </div>
          {isLoading ? (
            <div className="h-7 w-12 rounded bg-[#1a2d3d] animate-pulse" />
          ) : (
            <p className="text-2xl font-bold leading-none text-[#c8dce8] tabular-nums">{value}</p>
          )}
        </div>
      ))}
    </div>
  );
}
