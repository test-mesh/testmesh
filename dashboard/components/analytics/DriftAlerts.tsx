'use client';

import { AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useDriftAlerts } from '@/lib/hooks/useTelemetry';

export function DriftAlerts() {
  const { data, isLoading, error } = useDriftAlerts();
  const alerts = data?.alerts ?? [];

  if (isLoading) {
    return <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-[#3d5670]" /></div>;
  }
  if (error) {
    return <p className="text-xs text-red-400">Failed to load drift alerts.</p>;
  }
  if (alerts.length === 0) {
    return <p className="text-xs text-[#4a6480]">No drift alerts. All observed flows match their baselines.</p>;
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-yellow-400/5 border border-yellow-400/20"
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-yellow-400" />
          <div className="flex-1 min-w-0">
            <span className="font-semibold font-mono text-[11px] text-[#c8dce8]">{alert.name}</span>
            <p className="text-[10px] text-[#4a6480] mt-0.5">{JSON.stringify(alert.drift_details)}</p>
            <p className="text-[10px] text-[#4a6480]">Last seen: {new Date(alert.last_seen_at).toLocaleDateString()}</p>
          </div>
          <Link
            href={`/traces?service=${alert.entry_service}`}
            className="text-[#3d5670] hover:text-[#7fa8c8] shrink-0 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      ))}
    </div>
  );
}
