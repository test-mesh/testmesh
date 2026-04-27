'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { CheckCircle, XCircle, AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWebhookDeliveries } from '@/lib/hooks/useIntegrations';

interface WebhookDeliveryLogProps {
  integrationId: string;
}

export function WebhookDeliveryLog({ integrationId }: WebhookDeliveryLogProps) {
  const { data, isLoading, isError } = useWebhookDeliveries(integrationId);
  const deliveries = data?.deliveries ?? [];

  const getStatusBadge = (status: 'success' | 'failed' | 'rejected') => {
    switch (status) {
      case 'success':
        return (
          <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
            <CheckCircle className="h-3 w-3 mr-1" />Success
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />Failed
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="outline" className="border-red-500/50 text-red-600">
            <AlertCircle className="h-3 w-3 mr-1" />Rejected
          </Badge>
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
    <Card>
      <CardHeader>
        <CardTitle>Recent Webhook Deliveries</CardTitle>
        <CardDescription>Monitor incoming webhook events and triggered test runs</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="text-center py-12 text-destructive text-sm">
            Failed to load webhook deliveries
          </div>
        ) : deliveries.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No webhook deliveries yet
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Repository</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Commit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Triggered</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((delivery) => (
                  <TableRow key={delivery.id}>
                    <TableCell>
                      <Badge variant="secondary">{delivery.event_type}</Badge>
                    </TableCell>
                    <TableCell>
                      <code className="text-sm">{delivery.repository}</code>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{delivery.branch}</Badge>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs text-muted-foreground">
                        {delivery.commit_sha?.slice(0, 7) ?? '—'}
                      </code>
                    </TableCell>
                    <TableCell>{getStatusBadge(delivery.status)}</TableCell>
                    <TableCell>
                      {(delivery.triggered_runs?.length ?? 0) > 0 ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{delivery.triggered_runs!.length}</span>
                          <Button variant="ghost" size="sm" className="h-6 px-2">
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {formatDate(delivery.received_at)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
