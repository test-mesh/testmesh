'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Copy, Check, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { SpanWaterfall } from '@/components/traces/SpanWaterfall';
import { useSpans } from '@/lib/hooks/useTelemetry';

function TracesContent() {
  const searchParams = useSearchParams();
  const traceId = searchParams.get('trace_id') ?? '';
  const executionId = searchParams.get('execution_id') ?? '';

  const [serviceFilter, setServiceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [copied, setCopied] = useState(false);

  const { data, isLoading, error } = useSpans(
    traceId ? { trace_id: traceId } : {}
  );

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
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href={executionId ? `/executions/${executionId}` : '/executions'}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm text-muted-foreground">Trace</span>
          <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded truncate">
            {traceId || '—'}
          </code>
          {traceId && (
            <button onClick={handleCopy} className="text-muted-foreground hover:text-foreground">
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
        {spans.length > 0 && (
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                overallStatus === 'error'
                  ? 'text-red-600 border-red-200'
                  : 'text-green-600 border-green-200'
              }
            >
              {overallStatus}
            </Badge>
            <span className="text-sm text-muted-foreground">{totalDuration}ms total</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={serviceFilter} onValueChange={setServiceFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All services" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All services</SelectItem>
            {services.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
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

      {/* Empty state */}
      {!traceId && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            No trace ID provided. Open this page from an execution&apos;s Trace tab.
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {traceId && isLoading && (
        <Card>
          <CardContent className="py-12 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {traceId && error && (
        <Card>
          <CardContent className="py-12 text-center text-red-600 text-sm">
            Failed to load trace. The trace may have expired or tracing may be disabled.
          </CardContent>
        </Card>
      )}

      {/* Waterfall */}
      {traceId && !isLoading && spans.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Span Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <SpanWaterfall
              spans={spans}
              errorSpanIds={errorSpanIds}
              filterService={serviceFilter === 'all' ? undefined : serviceFilter}
              filterStatus={statusFilter === 'all' ? undefined : statusFilter}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function TracesPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto py-8 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <TracesContent />
    </Suspense>
  );
}
