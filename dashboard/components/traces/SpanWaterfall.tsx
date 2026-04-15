'use client';

import { useState, useMemo } from 'react';
import { AlertCircle, Clock, Minus } from 'lucide-react';
import { Span, ValidationViolation } from '@/lib/api/types';
import { SpanDetailDrawer } from './SpanDetailDrawer';
import { cn } from '@/lib/utils';

interface SpanWaterfallProps {
  spans: Span[];
  violations?: ValidationViolation[];
  missingNodes?: string[];
  slowSpanIds?: string[];
  errorSpanIds?: string[];
  highlightSpanId?: string;
  filterService?: string;
  filterStatus?: string;
}

interface SpanNode {
  span: Span;
  depth: number;
  children: SpanNode[];
}

function buildTree(spans: Span[]): SpanNode[] {
  const byId = new Map<string, SpanNode>();
  for (const span of spans) {
    byId.set(span.span_id, { span, depth: 0, children: [] });
  }
  const roots: SpanNode[] = [];
  for (const span of spans) {
    const node = byId.get(span.span_id)!;
    if (span.parent_span_id && byId.has(span.parent_span_id)) {
      byId.get(span.parent_span_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  function assignDepth(node: SpanNode, depth: number) {
    node.depth = depth;
    for (const child of node.children) assignDepth(child, depth + 1);
  }
  for (const root of roots) assignDepth(root, 0);
  function flatten(node: SpanNode): SpanNode[] {
    return [node, ...node.children.flatMap(flatten)];
  }
  return roots.flatMap(flatten);
}

const SLOW_THRESHOLD_MS = 1000;

export function SpanWaterfall({
  spans,
  violations = [],
  missingNodes = [],
  slowSpanIds = [],
  errorSpanIds = [],
  highlightSpanId,
  filterService,
  filterStatus,
}: SpanWaterfallProps) {
  const [selectedSpan, setSelectedSpan] = useState<Span | null>(null);
  const [showOnlyErrors, setShowOnlyErrors] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const nodes = useMemo(() => buildTree(spans), [spans]);

  const traceStart = useMemo(
    () => Math.min(...spans.map((s) => new Date(s.start_time).getTime())),
    [spans]
  );
  const traceEnd = useMemo(
    () => Math.max(...spans.map((s) => new Date(s.end_time).getTime())),
    [spans]
  );
  const traceDuration = traceEnd - traceStart || 1;

  function getBarStyle(span: Span) {
    const start = new Date(span.start_time).getTime();
    const left = ((start - traceStart) / traceDuration) * 100;
    const width = Math.max((span.duration_ms / traceDuration) * 100, 0.5);
    return { left: `${left}%`, width: `${width}%` };
  }

  function getBarColor(span: Span) {
    if (errorSpanIds.includes(span.span_id) || span.status_code === 'error')
      return 'bg-red-500';
    if (slowSpanIds.includes(span.span_id) || span.duration_ms >= SLOW_THRESHOLD_MS)
      return 'bg-yellow-400';
    return 'bg-blue-500';
  }

  function isDimmed(node: SpanNode) {
    const span = node.span;
    if (showOnlyErrors && span.status_code !== 'error' && !errorSpanIds.includes(span.span_id))
      return true;
    if (filterService && span.service !== filterService) return true;
    if (filterStatus) {
      if (filterStatus === 'error' && span.status_code !== 'error') return true;
      if (filterStatus === 'ok' && span.status_code !== 'ok') return true;
      if (filterStatus === 'slow' && span.duration_ms < SLOW_THRESHOLD_MS) return true;
    }
    return false;
  }

  const totalDurationMs = traceDuration;
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) =>
    Math.round((totalDurationMs / tickCount) * i)
  );

  return (
    <div className="relative">
      {/* Controls */}
      <div className="flex items-center gap-3 mb-3 text-sm">
        <button
          onClick={() => setShowOnlyErrors((v) => !v)}
          className={cn(
            'px-2 py-1 rounded border text-xs',
            showOnlyErrors
              ? 'bg-red-100 border-red-300 text-red-700'
              : 'border-border text-muted-foreground hover:bg-muted'
          )}
        >
          Show errors only
        </button>
        <button
          onClick={() => setCollapsed(new Set())}
          className="px-2 py-1 rounded border border-border text-xs text-muted-foreground hover:bg-muted"
        >
          Expand all
        </button>
        <span className="ml-auto text-muted-foreground text-xs">{spans.length} spans</span>
      </div>

      {/* Time axis */}
      <div className="relative h-5 ml-[220px] mb-1 border-b border-border">
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute text-[10px] text-muted-foreground -translate-x-1/2"
            style={{ left: `${(t / totalDurationMs) * 100}%` }}
          >
            {t}ms
          </div>
        ))}
      </div>

      {/* Rows */}
      <div className="space-y-0.5">
        {/* Missing span placeholders */}
        {missingNodes.map((node, i) => (
          <div key={`missing-${i}`} className="flex items-center h-8 opacity-50">
            <div className="w-[220px] shrink-0 pr-3 text-xs text-muted-foreground font-mono truncate flex items-center gap-1">
              <Minus className="w-3 h-3" />
              {node}
            </div>
            <div className="flex-1 relative h-4">
              <div className="absolute inset-0 border border-dashed border-muted-foreground/40 rounded" />
            </div>
          </div>
        ))}

        {nodes.map((node) => {
          const { span } = node;
          const isError = errorSpanIds.includes(span.span_id) || span.status_code === 'error';
          const isSlow = slowSpanIds.includes(span.span_id) || span.duration_ms >= SLOW_THRESHOLD_MS;
          const dimmed = isDimmed(node);
          const isHighlighted = highlightSpanId === span.span_id;

          return (
            <div
              key={span.span_id}
              className={cn(
                'flex items-center h-8 rounded cursor-pointer hover:bg-muted/50',
                dimmed && 'opacity-30',
                isHighlighted && 'ring-1 ring-blue-400 bg-blue-50/10'
              )}
              onClick={() => setSelectedSpan(span)}
            >
              {/* Label */}
              <div
                className="w-[220px] shrink-0 pr-3 text-xs font-mono truncate flex items-center gap-1"
                style={{ paddingLeft: `${node.depth * 12 + 4}px` }}
              >
                {node.children.length > 0 && (
                  <button
                    className="shrink-0 text-muted-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        next.has(span.span_id) ? next.delete(span.span_id) : next.add(span.span_id);
                        return next;
                      });
                    }}
                  >
                    {collapsed.has(span.span_id) ? '▶' : '▼'}
                  </button>
                )}
                <span className="text-muted-foreground">{span.service}</span>
                <span>: {span.operation}</span>
              </div>

              {/* Bar */}
              <div className="flex-1 relative h-4">
                <div
                  className={cn('absolute h-full rounded-sm opacity-80', getBarColor(span))}
                  style={getBarStyle(span)}
                />
                {/* Annotations */}
                {isError && (
                  <div className="absolute top-0 -mt-1" style={{ left: getBarStyle(span).left }}>
                    <AlertCircle className="w-3 h-3 text-red-500" />
                  </div>
                )}
                {isSlow && !isError && (
                  <div className="absolute top-0 -mt-1" style={{ left: getBarStyle(span).left }}>
                    <Clock className="w-3 h-3 text-yellow-500" />
                  </div>
                )}
              </div>

              {/* Duration */}
              <div className="w-16 text-right text-xs text-muted-foreground pr-2">
                {span.duration_ms}ms
              </div>
            </div>
          );
        })}
      </div>

      <SpanDetailDrawer span={selectedSpan} onClose={() => setSelectedSpan(null)} />
    </div>
  );
}
