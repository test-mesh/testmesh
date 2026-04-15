'use client';

import { AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useDriftAlerts } from '@/lib/hooks/useTelemetry';

export function DriftAlerts() {
  const { data, isLoading } = useDriftAlerts();
  const alerts = data?.alerts ?? [];

  if (isLoading) {
    return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
  }

  if (alerts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No drift alerts. All observed flows match their baselines.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="flex items-start gap-3 px-3 py-2.5 rounded-md bg-yellow-50/20 border border-yellow-200 text-sm"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-yellow-600" />
          <div className="flex-1 min-w-0">
            <span className="font-semibold font-mono text-xs">{alert.name}</span>
            <p className="text-muted-foreground text-xs mt-0.5">
              {JSON.stringify(alert.drift_details)}
            </p>
            <p className="text-muted-foreground text-xs">
              Last seen: {new Date(alert.last_seen_at).toLocaleDateString()}
            </p>
          </div>
          <Link
            href={`/traces?service=${alert.entry_service}`}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <ExternalLink className="w-4 h-4" />
          </Link>
        </div>
      ))}
    </div>
  );
}
