'use client';

import { useState } from 'react';
import { Download, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDiscoveredFlows, useExportDiscoveredFlow } from '@/lib/hooks/useTelemetry';
import Link from 'next/link';
import { cn } from '@/lib/utils';

function RiskBadge({ score }: { score: number }) {
  const [label, cls] = score >= 0.7
    ? ['high',   'bg-red-400/10 text-red-400']
    : score >= 0.4
    ? ['medium', 'bg-yellow-400/10 text-yellow-400']
    : ['low',    'bg-teal-400/10 text-teal-400'];
  return <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded', cls)}>{label}</span>;
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
    return <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-[#3d5670]" /></div>;
  }
  if (error) {
    return <p className="text-xs text-red-400 py-4">Failed to load discovered flows.</p>;
  }
  if (flows.length === 0) {
    return <p className="text-xs text-[#4a6480] py-4">No flows discovered yet. Flows are detected automatically from incoming traces.</p>;
  }

  return (
    <div>
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 px-0 py-2 border-b border-[#1a2332]">
        {['Flow', 'Occurrences', 'Avg / P95', 'Error Rate', 'Risk', 'Drifted', ''].map((h) => (
          <span key={h} className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{h}</span>
        ))}
      </div>
      <div className="divide-y divide-[#1a2332]">
        {flows.map((flow) => (
          <div key={flow.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 py-3 items-center hover:bg-[#131b26] transition-colors group -mx-4 px-4">
            <span className="font-mono text-[11px] text-[#c8dce8] truncate">{flow.name}</span>
            <span className="text-[11px] text-[#7fa8c8]">{flow.occurrence_count}</span>
            <span className="text-[11px] font-mono text-[#4a6480]">
              {flow.avg_duration_ms}ms / {flow.p95_duration_ms}ms
            </span>
            <span className="text-[11px] text-[#7fa8c8]">{(flow.error_rate * 100).toFixed(1)}%</span>
            <span><RiskBadge score={flow.risk_score} /></span>
            <span>
              {flow.drifted
                ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-yellow-400/10 text-yellow-400">drifted</span>
                : <span className="text-[#3d5670] text-[11px]">—</span>
              }
            </span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => handleExport(flow.id, flow.name)}
                disabled={exportingId === flow.id}
                className="flex items-center justify-center h-6 w-6 rounded text-[#3d5670] hover:text-teal-400 hover:bg-[#1a2d3d] transition-colors disabled:opacity-50"
              >
                {exportingId === flow.id
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Download className="w-3.5 h-3.5" />
                }
              </button>
              <Link
                href={`/traces?service=${flow.entry_service}&operation=${flow.entry_operation}`}
                className="flex items-center justify-center h-6 w-6 rounded text-[#3d5670] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
