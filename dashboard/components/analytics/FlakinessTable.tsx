'use client';

import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle } from 'lucide-react';
import type { FlakinessMetric } from '@/lib/api/types';

interface FlakinessTableProps {
  data: FlakinessMetric[];
  showFlow?: boolean;
}

export function FlakinessTable({ data, showFlow = true }: FlakinessTableProps) {
  const getSeverityColor = (score: number) => {
    if (score >= 0.3) return 'destructive';
    if (score >= 0.15) return 'warning';
    return 'secondary';
  };

  const formatScore = (score: number) => {
    return `${(score * 100).toFixed(1)}%`;
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showFlow && <TableHead>Flow</TableHead>}
          <TableHead>Flakiness Score</TableHead>
          <TableHead>Transitions</TableHead>
          <TableHead>Pass Rate</TableHead>
          <TableHead>Executions</TableHead>
          <TableHead>Window</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 ? (
          <TableRow>
            <TableCell colSpan={showFlow ? 6 : 5} className="text-center py-8">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <AlertTriangle className="h-8 w-8" />
                <p>No flaky tests detected</p>
              </div>
            </TableCell>
          </TableRow>
        ) : (
          data.map((metric) => {
            const passRate = metric.total_executions > 0
              ? (metric.passed_executions / metric.total_executions) * 100
              : 0;

            return (
              <TableRow key={metric.id}>
                {showFlow && (
                  <TableCell>
                    {metric.flow ? (
                      <Link
                        href={`/flows/${metric.flow_id}`}
                        className="font-medium hover:underline"
                      >
                        {metric.flow.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">
                        {metric.flow_id.slice(0, 8)}...
                      </span>
                    )}
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Badge variant={getSeverityColor(metric.flakiness_score) as any}>
                      {formatScore(metric.flakiness_score)}
                    </Badge>
                    {metric.is_flaky && (
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    )}
                  </div>
                </TableCell>
                <TableCell>{metric.transitions}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={passRate} className="w-16 h-2" />
                    <span className="text-sm">{passRate.toFixed(1)}%</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-green-600">{metric.passed_executions}</span>
                  {' / '}
                  <span className="text-red-600">{metric.failed_executions}</span>
                  {' / '}
                  <span>{metric.total_executions}</span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {metric.window_days} days
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
