'use client';

import { Card, CardContent } from '@/components/ui/card';
import { GitBranch, Layers, Server, ShieldCheck } from 'lucide-react';
import { useGraphStats } from '@/lib/hooks/useGraph';
import { Skeleton } from '@/components/ui/skeleton';

export function StatsBar() {
  const { data: stats, isLoading } = useGraphStats();

  const items = [
    {
      label: 'Total Nodes',
      value: stats?.total_nodes ?? 0,
      icon: Layers,
    },
    {
      label: 'Total Edges',
      value: stats?.total_edges ?? 0,
      icon: GitBranch,
    },
    {
      label: 'Services',
      value: stats?.service_count ?? 0,
      icon: Server,
    },
    {
      label: 'Coverage',
      value: stats ? `${stats.coverage_percent.toFixed(1)}%` : '—',
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(({ label, value, icon: Icon }) => (
        <Card key={label}>
          <CardContent className="flex items-center gap-3 p-4">
            <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              {isLoading ? (
                <Skeleton className="h-6 w-12 mb-1" />
              ) : (
                <p className="text-xl font-semibold tabular-nums">{value}</p>
              )}
              <p className="text-xs text-muted-foreground truncate">{label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
