'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Copy, Check, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SpanWaterfall } from '@/components/traces/SpanWaterfall';
import { useSpans } from '@/lib/hooks/useTelemetry';
import { cn } from '@/lib/utils';

function TracesContent() {
  const searchParams = useSearchParams();
  const traceId = searchParams.get('trace_id') ?? '';
  const executionId = searchParams.get('execution_id') ?? '';

  const [serviceFilter, setServiceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [copied, setCopied] = useState(false);

  const { data, isLoading, error } = useSpans(traceId ? { trace_id: traceId } : {});

  const spans = data?.spans ?? [];
  const services = Array.from(new Set(spans.map((s) => s.service)));
  const errorSpanIds = spans.filter((s) => s.status_code === 'error').map((s) => s.span_id);
  const overallStatus = errorSpanIds.length > 0 ? 'error' : 'ok';
  const totalDuration =
    spans.length > 0
      ? Math.max(...spans.map((s) => new Date(s.end_time).getTime())) -
        Math.min(...spans.map((s) => new Date(s.start_time).getTime()))
      : 0;

  function handleCopy() {
    navigator.clipboard.writeText(traceId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="px-6 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href={executionId ? `/executions/${executionId}` : '/executions'}
          className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[11px] text-[#4a6480]">Trace</span>
          <code className="text-[11px] font-mono bg-[#1a2d3d] text-[#7fa8c8] px-2 py-0.5 rounded truncate">
            {traceId || '—'}
          </code>
          {traceId && (
            <button
              onClick={handleCopy}
              className="text-[#4a6480] hover:text-[#7fa8c8] transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
        {spans.length > 0 && (
          <div className="flex items-center gap-2">
            <span className={cn(
              'text-[10px] font-semibold px-2 py-0.5 rounded capitalize',
              overallStatus === 'error' ? 'bg-red-400/10 text-red-400' : 'bg-teal-400/10 text-teal-400'
            )}>
              {overallStatus}
            </span>
            <span className="text-[11px] text-[#4a6480]">{totalDuration}ms total</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={serviceFilter} onValueChange={setServiceFilter}>
          <SelectTrigger className="h-7 w-[160px] text-xs bg-[#0f1923] border-[#1e2d3d] text-[#7fa8c8]">
            <SelectValue placeholder="All services" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All services</SelectItem>
            {services.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-7 w-[130px] text-xs bg-[#0f1923] border-[#1e2d3d] text-[#7fa8c8]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="ok">OK</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="slow">Slow</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!traceId && (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-8 text-center">
          <p className="text-xs text-[#3d5670]">No trace ID provided. Open this page from an execution&apos;s Trace tab.</p>
        </div>
      )}

      {traceId && isLoading && (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] p-8 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-[#3d5670]" />
        </div>
      )}

      {traceId && error && (
        <div className="rounded-xl bg-red-400/5 border border-red-400/20 p-6 text-center">
          <p className="text-xs text-red-400">Failed to load trace. The trace may have expired or tracing may be disabled.</p>
        </div>
      )}

      {traceId && !isLoading && spans.length > 0 && (
        <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2332]">
            <span className="text-[11px] font-semibold text-[#c8dce8]">Span Timeline</span>
          </div>
          <div className="p-4">
            <SpanWaterfall
              spans={spans}
              errorSpanIds={errorSpanIds}
              filterService={serviceFilter === 'all' ? undefined : serviceFilter}
              filterStatus={statusFilter === 'all' ? undefined : statusFilter}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function TracesPage() {
  return (
    <Suspense
      fallback={
        <div className="px-6 py-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-[#3d5670]" />
        </div>
      }
    >
      <TracesContent />
    </Suspense>
  );
}
