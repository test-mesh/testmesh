'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Span } from '@/lib/api/types';

interface SpanDetailDrawerProps {
  span: Span | null;
  onClose: () => void;
}

function AttributeGroup({ title, attrs }: { title: string; attrs: [string, unknown][] }) {
  if (attrs.length === 0) return null;
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
        {title}
      </p>
      <div className="rounded-md border divide-y">
        {attrs.map(([key, value]) => (
          <div key={key} className="flex px-3 py-1.5 gap-3 text-sm">
            <span className="text-muted-foreground font-mono min-w-0 break-all">{key}</span>
            <span className="ml-auto font-mono text-right min-w-0 break-all">
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
  ok: 'bg-green-100/30 text-green-700 border-green-200',
  error: 'bg-red-100/30 text-red-700 border-red-200',
  unset: 'bg-muted text-muted-foreground',
};

export function SpanDetailDrawer({ span, onClose }: SpanDetailDrawerProps) {
  if (!span) return null;
  const { http, db, messaging, custom } = groupAttributes(span.attributes);

  return (
    <Sheet open={!!span} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-base font-mono truncate">
            {span.service}: {span.operation}
          </SheetTitle>
        </SheetHeader>

        {/* Identity */}
        <div className="flex flex-wrap gap-2 mb-4">
          <Badge variant="outline" className={statusColor[span.status_code]}>
            {span.status_code}
          </Badge>
          <Badge variant="outline">{span.kind}</Badge>
          <Badge variant="outline">{span.duration_ms}ms</Badge>
        </div>

        {/* Status message */}
        {span.status_message && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800 mb-4 font-mono">
            {span.status_message}
          </div>
        )}

        {/* Timing */}
        <div className="mb-4 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Start</span>
            <span className="font-mono">{new Date(span.start_time).toISOString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">End</span>
            <span className="font-mono">{new Date(span.end_time).toISOString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Duration</span>
            <span className="font-mono font-semibold">{span.duration_ms}ms</span>
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
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Events
            </p>
            <div className="space-y-2">
              {(span.events ?? []).map((event, i) => (
                <div key={i} className="rounded-md border px-3 py-2 text-sm">
                  <div className="flex justify-between mb-1">
                    <span className="font-semibold">{event.name}</span>
                    <span className="text-muted-foreground font-mono text-xs">
                      {new Date(event.timestamp).toISOString()}
                    </span>
                  </div>
                  {Object.entries(event.attributes ?? {}).map(([k, v]) => (
                    <div key={k} className="text-xs text-muted-foreground font-mono">
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
