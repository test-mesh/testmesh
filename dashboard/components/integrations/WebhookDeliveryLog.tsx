'use client';

import { CheckCircle, XCircle, AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
import { useWebhookDeliveries } from '@/lib/hooks/useIntegrations';

interface WebhookDeliveryLogProps {
  integrationId: string;
}

export function WebhookDeliveryLog({ integrationId }: WebhookDeliveryLogProps) {
  const { data, isLoading, isError } = useWebhookDeliveries(integrationId);
  const deliveries = data?.deliveries ?? [];

  const getStatusSpan = (status: 'success' | 'failed' | 'rejected') => {
    switch (status) {
      case 'success':
        return (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-teal-400/10 text-teal-400">
            <CheckCircle className="h-3 w-3" />Success
          </span>
        );
      case 'failed':
        return (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-red-400/10 text-red-400">
            <XCircle className="h-3 w-3" />Failed
          </span>
        );
      case 'rejected':
        return (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-400">
            <AlertCircle className="h-3 w-3" />Rejected
          </span>
        );
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="rounded-xl border border-[#1e2d3d] bg-[#0f1923]">
      <div className="p-5 border-b border-[#1a2332]">
        <p className="text-sm font-semibold text-[#c8dce8]">Recent Webhook Deliveries</p>
        <p className="text-xs text-[#4a6480] mt-0.5">Monitor incoming webhook events and triggered test runs</p>
      </div>
      <div className="p-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-[#4a6480]" />
          </div>
        ) : isError ? (
          <div className="text-center py-12 text-red-400 text-xs">
            Failed to load webhook deliveries
          </div>
        ) : deliveries.length === 0 ? (
          <div className="text-center py-12 text-[#4a6480] text-xs">
            No webhook deliveries yet
          </div>
        ) : (
          <div className="rounded-lg border border-[#1e2d3d] overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1a2332] bg-[#0b0f18]">
                  <th className="text-left py-2.5 px-3 text-[10px] font-medium text-[#4a6480] uppercase tracking-wide">Event</th>
                  <th className="text-left py-2.5 px-3 text-[10px] font-medium text-[#4a6480] uppercase tracking-wide">Repository</th>
                  <th className="text-left py-2.5 px-3 text-[10px] font-medium text-[#4a6480] uppercase tracking-wide">Branch</th>
                  <th className="text-left py-2.5 px-3 text-[10px] font-medium text-[#4a6480] uppercase tracking-wide">Commit</th>
                  <th className="text-left py-2.5 px-3 text-[10px] font-medium text-[#4a6480] uppercase tracking-wide">Status</th>
                  <th className="text-left py-2.5 px-3 text-[10px] font-medium text-[#4a6480] uppercase tracking-wide">Triggered</th>
                  <th className="text-left py-2.5 px-3 text-[10px] font-medium text-[#4a6480] uppercase tracking-wide">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1a2332]">
                {deliveries.map((delivery) => (
                  <tr key={delivery.id} className="hover:bg-[#131b26] transition-colors">
                    <td className="py-3 px-3">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a2332] text-[#7fa8c8]">
                        {delivery.event_type}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <code className="text-[#7fa8c8] font-mono">{delivery.repository}</code>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a2332] text-[#4a6480] font-mono">
                        {delivery.branch}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <code className="text-[#4a6480] font-mono">
                        {delivery.commit_sha?.slice(0, 7) ?? '—'}
                      </code>
                    </td>
                    <td className="py-3 px-3">{getStatusSpan(delivery.status)}</td>
                    <td className="py-3 px-3">
                      {(delivery.triggered_runs?.length ?? 0) > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-[#c8dce8]">{delivery.triggered_runs!.length}</span>
                          <button className="flex items-center justify-center h-5 w-5 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors">
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[#4a6480]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-[#4a6480]">
                      {formatDate(delivery.received_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
