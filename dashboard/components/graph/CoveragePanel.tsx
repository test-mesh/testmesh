'use client';

import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { useGraphCoverage } from '@/lib/hooks/useGraph';

export function CoveragePanel() {
  const { data, isLoading } = useGraphCoverage();

  const pct = data?.coverage_percent ?? 0;
  const uncovered = data?.uncovered_nodes ?? [];
  const uncoveredCount = data?.uncovered_count ?? 0;

  const barColor = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-4">
        <div className="flex items-center gap-2 mb-3">
          {isLoading ? (
            <ShieldCheck className="h-4 w-4 text-[#3d5670]" />
          ) : pct >= 80 ? (
            <ShieldCheck className="h-4 w-4 text-green-500" />
          ) : (
            <ShieldAlert className="h-4 w-4 text-yellow-500" />
          )}
          <span className="text-xs font-semibold text-[#c8dce8]">Test Coverage</span>
        </div>
        {isLoading ? (
          <div className="h-4 w-full rounded-full bg-[#1a2332] animate-pulse" />
        ) : (
          <>
            <div className="flex justify-between mb-2">
              <span className="text-2xl font-semibold tabular-nums text-[#c8dce8]">{pct.toFixed(1)}%</span>
              <span className="text-xs text-[#4a6480]">{uncoveredCount} uncovered node{uncoveredCount !== 1 ? 's' : ''}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-[#1a2332] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${barColor}`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="h-48 w-full rounded-xl bg-[#0f1923] border border-[#1e2d3d] animate-pulse" />
      ) : uncovered.length === 0 ? (
        <div className="rounded-xl bg-[#0f1923] border border-dashed border-[#1e2d3d] p-8 text-center">
          <ShieldCheck className="h-8 w-8 text-green-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-[#c8dce8]">Full coverage!</p>
          <p className="text-xs text-[#3d5670] mt-1">All graph nodes have associated test flows.</p>
        </div>
      ) : (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="grid grid-cols-5 gap-4 px-4 py-2.5 border-b border-[#1a2332]">
            {['Name', 'Type', 'Service', 'Layer', 'Confidence'].map((h) => (
              <span key={h} className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{h}</span>
            ))}
          </div>
          <div className="divide-y divide-[#1a2332]">
            {uncovered.map((node) => (
              <div key={node.id} className="grid grid-cols-5 gap-4 px-4 py-2.5 items-center hover:bg-[#131b26] transition-colors">
                <span className="text-[13px] font-medium text-[#c8dce8] truncate">{node.name}</span>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#1a2d3d] text-[#4a6480] w-fit">{node.type}</span>
                <span className="text-[11px] text-[#4a6480]">{node.service || '—'}</span>
                <span className="text-[11px] text-[#4a6480]">{node.source_layer}</span>
                <span className="text-[11px] text-[#4a6480]">{(node.confidence * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
