'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Span } from '@/lib/api/types';

interface SpanDetailDrawerProps {
  span: Span | null;
  onClose: () => void;
}

function AttributeGroup({ title, attrs }: { title: string; attrs: [string, unknown][] }) {
  if (attrs.length === 0) return null;
  return (
    <div className="mb-4">
      <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-1.5">
        {title}
      </p>
      <div className="rounded-lg border border-[#1e2d3d] divide-y divide-[#1a2332]">
        {attrs.map(([key, value]) => (
          <div key={key} className="flex px-3 py-1.5 gap-3 text-xs">
            <span className="text-[#4a6480] font-mono min-w-0 break-all">{key}</span>
            <span className="ml-auto font-mono text-right min-w-0 break-all text-[#c8dce8]">
              {String(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function groupAttributes(attrs: Record<string, unknown>) {
  const http: [string, unknown][] = [];
  const db: [string, unknown][] = [];
  const messaging: [string, unknown][] = [];
  const custom: [string, unknown][] = [];
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('http.')) http.push([key, value]);
    else if (key.startsWith('db.')) db.push([key, value]);
    else if (key.startsWith('messaging.') || key.startsWith('message.')) messaging.push([key, value]);
    else custom.push([key, value]);
  }
  return { http, db, messaging, custom };
}

const statusColor: Record<string, string> = {
  ok: 'bg-teal-400/10 text-teal-400 border border-teal-400/30',
  error: 'bg-red-400/10 text-red-400 border border-red-400/30',
  unset: 'bg-[#1a2d3d] text-[#4a6480] border border-[#1e2d3d]',
};

export function SpanDetailDrawer({ span, onClose }: SpanDetailDrawerProps) {
  if (!span) return null;
  const { http, db, messaging, custom } = groupAttributes(span.attributes);

  return (
    <Sheet open={!!span} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto bg-[#0b0f18] border-l border-[#1e2d3d]">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-sm font-mono truncate text-[#c8dce8]">
            {span.service}: {span.operation}
          </SheetTitle>
        </SheetHeader>

        {/* Identity */}
        <div className="flex flex-wrap gap-2 mb-4">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded capitalize ${statusColor[span.status_code] ?? statusColor.unset}`}>
            {span.status_code}
          </span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-[#1a2d3d] text-[#4a6480] border border-[#1e2d3d]">
            {span.kind}
          </span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-[#1a2d3d] text-[#4a6480] border border-[#1e2d3d]">
            {span.duration_ms}ms
          </span>
        </div>

        {/* Status message */}
        {span.status_message && (
          <div className="rounded-lg bg-red-400/5 border border-red-400/20 px-3 py-2 text-xs text-red-400 mb-4 font-mono">
            {span.status_message}
          </div>
        )}

        {/* Timing */}
        <div className="mb-4 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-[#4a6480]">Start</span>
            <span className="font-mono text-[#7fa8c8]">{new Date(span.start_time).toISOString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#4a6480]">End</span>
            <span className="font-mono text-[#7fa8c8]">{new Date(span.end_time).toISOString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#4a6480]">Duration</span>
            <span className="font-mono font-semibold text-[#c8dce8]">{span.duration_ms}ms</span>
          </div>
        </div>

        {/* Attributes */}
        <AttributeGroup title="HTTP" attrs={http} />
        <AttributeGroup title="Database" attrs={db} />
        <AttributeGroup title="Messaging" attrs={messaging} />
        <AttributeGroup title="Custom" attrs={custom} />

        {/* Resource attrs */}
        {Object.keys(span.resource_attrs).length > 0 && (
          <AttributeGroup
            title="Resource"
            attrs={Object.entries(span.resource_attrs)}
          />
        )}

        {/* Events */}
        {(span.events?.length ?? 0) > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider mb-1.5">
              Events
            </p>
            <div className="space-y-2">
              {(span.events ?? []).map((event, i) => (
                <div key={i} className="rounded-lg border border-[#1e2d3d] px-3 py-2 text-xs">
                  <div className="flex justify-between mb-1">
                    <span className="font-semibold text-[#c8dce8]">{event.name}</span>
                    <span className="text-[#4a6480] font-mono text-[10px]">
                      {new Date(event.timestamp).toISOString()}
                    </span>
                  </div>
                  {Object.entries(event.attributes ?? {}).map(([k, v]) => (
                    <div key={k} className="text-[10px] text-[#4a6480] font-mono">
                      {k}: {String(v)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
