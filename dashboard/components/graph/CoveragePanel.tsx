'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
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
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            {pct >= 80 ? (
              <ShieldCheck className="h-5 w-5 text-green-500" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-yellow-500" />
            )}
            Test Coverage
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-4 w-full rounded-full" />
          ) : (
            <>
              <div className="flex justify-between mb-1.5">
                <span className="text-2xl font-semibold tabular-nums">{pct.toFixed(1)}%</span>
                <span className="text-sm text-muted-foreground">{uncoveredCount} uncovered node{uncoveredCount !== 1 ? 's' : ''}</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${barColor}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : uncovered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <ShieldCheck className="h-8 w-8 text-green-500 mx-auto mb-2" />
          <p className="text-sm font-medium">Full coverage!</p>
          <p className="text-xs text-muted-foreground mt-1">All graph nodes have associated test flows.</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Layer</TableHead>
                <TableHead>Confidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {uncovered.map((node) => (
                <TableRow key={node.id}>
                  <TableCell className="font-medium">{node.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{node.type}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{node.service || '—'}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{node.source_layer}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {(node.confidence * 100).toFixed(0)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
