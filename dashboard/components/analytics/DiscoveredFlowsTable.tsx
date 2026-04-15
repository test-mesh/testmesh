'use client';

import { useState } from 'react';
import { Download, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDiscoveredFlows, useExportDiscoveredFlow } from '@/lib/hooks/useTelemetry';
import Link from 'next/link';

function RiskBadge({ score }: { score: number }) {
  if (score >= 0.7)
    return (
      <Badge className="bg-red-100/30 text-red-700 border-red-200">high</Badge>
    );
  if (score >= 0.4)
    return (
      <Badge className="bg-yellow-100/30 text-yellow-700 border-yellow-200">medium</Badge>
    );
  return (
    <Badge className="bg-green-100/30 text-green-700 border-green-200">low</Badge>
  );
}

export function DiscoveredFlowsTable() {
  const { data, isLoading, error } = useDiscoveredFlows();
  const exportFlow = useExportDiscoveredFlow();
  const [exportingId, setExportingId] = useState<string | null>(null);

  const flows = data?.flows ?? [];

  async function handleExport(flowId: string, flowName: string) {
    setExportingId(flowId);
    try {
      const yaml = await exportFlow.mutateAsync(flowId);
      const blob = new Blob([yaml], { type: 'text/yaml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${flowName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.yaml`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Flow exported as YAML');
    } catch {
      toast.error('Failed to export flow');
    } finally {
      setExportingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-red-600 py-4">Failed to load discovered flows.</p>
    );
  }

  if (flows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No flows discovered yet. Flows are detected automatically from incoming traces.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Flow</TableHead>
          <TableHead className="text-right">Occurrences</TableHead>
          <TableHead className="text-right">Avg / P95</TableHead>
          <TableHead className="text-right">Error rate</TableHead>
          <TableHead>Risk</TableHead>
          <TableHead>Drifted</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {flows.map((flow) => (
          <TableRow key={flow.id}>
            <TableCell className="font-mono text-xs max-w-[240px] truncate">
              {flow.name}
            </TableCell>
            <TableCell className="text-right text-sm">{flow.occurrence_count}</TableCell>
            <TableCell className="text-right text-sm font-mono">
              {flow.avg_duration_ms}ms / {flow.p95_duration_ms}ms
            </TableCell>
            <TableCell className="text-right text-sm">
              {(flow.error_rate * 100).toFixed(1)}%
            </TableCell>
            <TableCell>
              <RiskBadge score={flow.risk_score} />
            </TableCell>
            <TableCell>
              {flow.drifted ? (
                <Badge className="bg-yellow-100/30 text-yellow-700 border-yellow-200">
                  drifted
                </Badge>
              ) : (
                <span className="text-muted-foreground text-xs">—</span>
              )}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleExport(flow.id, flow.name)}
                  disabled={exportingId === flow.id}
                >
                  {exportingId === flow.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                </Button>
                <Link
                  href={`/traces?service=${flow.entry_service}&operation=${flow.entry_operation}`}
                >
                  <Button variant="ghost" size="sm">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
