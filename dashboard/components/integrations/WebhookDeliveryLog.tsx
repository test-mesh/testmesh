'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CheckCircle, XCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Mock data for now - in production, this would come from an API endpoint
const MOCK_DELIVERIES = [
  {
    id: '1',
    event_type: 'push',
    repository: 'testmesh/api',
    branch: 'main',
    commit_sha: 'a1b2c3d',
    status: 'success' as const,
    triggered_runs: ['run-123', 'run-124'],
    received_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  {
    id: '2',
    event_type: 'pull_request',
    repository: 'testmesh/web',
    branch: 'feature/new-ui',
    commit_sha: 'e4f5g6h',
    status: 'success' as const,
    triggered_runs: ['run-125'],
    received_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: '3',
    event_type: 'push',
    repository: 'testmesh/api',
    branch: 'develop',
    commit_sha: 'i7j8k9l',
    status: 'failed' as const,
    error: 'No matching trigger rules found',
    triggered_runs: [],
    received_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
];

export function WebhookDeliveryLog() {
  const getStatusBadge = (status: 'success' | 'failed' | 'rejected') => {
    switch (status) {
      case 'success':
        return (
          <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
            <CheckCircle className="h-3 w-3 mr-1" />
            Success
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="outline" className="border-red-500/50 text-red-600">
            <AlertCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        );
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
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
        <CardDescription>
          Monitor incoming webhook events and triggered test runs
        </CardDescription>
      </CardHeader>
      <CardContent>
        {MOCK_DELIVERIES.length === 0 ? (
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
                {MOCK_DELIVERIES.map((delivery) => (
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
                        {delivery.commit_sha}
                      </code>
                    </TableCell>
                    <TableCell>{getStatusBadge(delivery.status)}</TableCell>
                    <TableCell>
                      {delivery.triggered_runs.length > 0 ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {delivery.triggered_runs.length}
                          </span>
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
