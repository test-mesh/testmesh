'use client';

import { Activity } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface OtelFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  action?: string;
  className?: string;
}

export default function OtelForm({
  config,
  onChange,
  action,
  className,
}: OtelFormProps) {
  const isAssert = action === 'otel.assert';

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <Activity className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">OpenTelemetry</span>
        {action && (
          <span className="text-xs text-muted-foreground font-mono">({action})</span>
        )}
      </div>

      {/* Span Name — always shown */}
      <div className="space-y-2">
        <Label htmlFor="otel-span-name">Span Name</Label>
        <Input
          id="otel-span-name"
          value={(config.span_name as string) || ''}
          onChange={(e) => onChange('span_name', e.target.value)}
          placeholder="testmesh-step"
          className="font-mono text-sm"
        />
      </div>

      {/* Assert-only fields */}
      {isAssert && (
        <>
          <div className="space-y-2">
            <Label htmlFor="otel-backend-url">Backend URL (Tempo)</Label>
            <Input
              id="otel-backend-url"
              value={(config.backend_url as string) || ''}
              onChange={(e) => onChange('backend_url', e.target.value)}
              placeholder="http://localhost:3200"
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="otel-trace-id">Trace ID</Label>
            <Input
              id="otel-trace-id"
              value={(config.trace_id as string) || ''}
              onChange={(e) => onChange('trace_id', e.target.value)}
              placeholder="${prev.trace_id}"
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="otel-service">Service (optional)</Label>
            <Input
              id="otel-service"
              value={(config.service as string) || ''}
              onChange={(e) => onChange('service', e.target.value)}
              placeholder="my-service"
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="otel-operation">Operation (optional)</Label>
            <Input
              id="otel-operation"
              value={(config.operation as string) || ''}
              onChange={(e) => onChange('operation', e.target.value)}
              placeholder="POST /api/users"
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="otel-within">Within</Label>
            <Input
              id="otel-within"
              value={(config.within as string) || ''}
              onChange={(e) => onChange('within', e.target.value)}
              placeholder="10s"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Maximum age of the trace to assert against (e.g. 10s, 1m).
            </p>
          </div>
        </>
      )}
    </div>
  );
}
