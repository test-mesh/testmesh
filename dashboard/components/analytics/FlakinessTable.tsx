'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FlakinessMetric } from '@/lib/api/types';

interface FlakinessTableProps {
  data: FlakinessMetric[];
  showFlow?: boolean;
}

function ScoreBadge({ score }: { score: number }) {
  const pct = (score * 100).toFixed(1) + '%';
  const cls = score >= 0.3
    ? 'bg-red-400/10 text-red-400'
    : score >= 0.15
    ? 'bg-yellow-400/10 text-yellow-400'
    : 'bg-[#1a2d3d] text-[#4a6480]';
  return <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded', cls)}>{pct}</span>;
}

export function FlakinessTable({ data, showFlow = true }: FlakinessTableProps) {
  const cols = showFlow
    ? 'grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr]'
    : 'grid-cols-[1fr_1fr_1fr_1fr_1fr]';
  const headers = showFlow
    ? ['Flow', 'Score', 'Transitions', 'Pass Rate', 'Executions', 'Window']
    : ['Score', 'Transitions', 'Pass Rate', 'Executions', 'Window'];

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-[#3d5670]">
        <AlertTriangle className="h-8 w-8 text-[#1e2d3d]" />
        <p className="text-sm">No flaky tests detected</p>
      </div>
    );
  }

  return (
    <div>
      <div className={cn('grid gap-4 px-4 py-2.5 border-b border-[#1a2332]', cols)}>
        {headers.map((h) => (
          <span key={h} className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{h}</span>
        ))}
      </div>
      <div className="divide-y divide-[#1a2332]">
        {data.map((metric) => {
          const passRate = metric.total_executions > 0
            ? (metric.passed_executions / metric.total_executions) * 100
            : 0;
          return (
            <div key={metric.id} className={cn('grid gap-4 px-4 py-3 items-center hover:bg-[#131b26] transition-colors', cols)}>
              {showFlow && (
                <span className="text-[13px] font-medium text-[#c8dce8] truncate">
                  {metric.flow ? (
                    <Link href={`/flows/${metric.flow_id}`} className="hover:text-teal-400 transition-colors">
                      {metric.flow.name}
                    </Link>
                  ) : (
                    <span className="text-[#4a6480]">{metric.flow_id.slice(0, 8)}…</span>
                  )}
                </span>
              )}
              <div className="flex items-center gap-1.5">
                <ScoreBadge score={metric.flakiness_score} />
                {metric.is_flaky && <AlertTriangle className="h-3 w-3 text-yellow-400" />}
              </div>
              <span className="text-[11px] text-[#7fa8c8]">{metric.transitions}</span>
              <div className="flex items-center gap-2">
                <div className="flex-1 max-w-[64px] h-1.5 rounded-full bg-[#1a2332] overflow-hidden">
                  <div className="h-full rounded-full bg-teal-400" style={{ width: `${passRate}%` }} />
                </div>
                <span className="text-[11px] text-[#7fa8c8]">{passRate.toFixed(1)}%</span>
              </div>
              <span className="text-[11px]">
                <span className="text-teal-400">{metric.passed_executions}</span>
                <span className="text-[#3d5670]"> / </span>
                <span className="text-red-400">{metric.failed_executions}</span>
                <span className="text-[#3d5670]"> / {metric.total_executions}</span>
              </span>
              <span className="text-[11px] text-[#4a6480]">{metric.window_days}d</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
