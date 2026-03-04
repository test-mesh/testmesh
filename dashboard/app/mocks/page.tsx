'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  useMockServers,
  useDeleteMockServer,
  useCreateMockServer,
} from '@/lib/hooks/useMockServers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Eye, Trash2, X, Search, Server, Plus, Copy, Check } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { MockServerStatus } from '@/lib/api/types';

export default function MockServersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<MockServerStatus | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data, isLoading, error } = useMockServers({
    status: statusFilter || undefined,
  });

  const deleteMockServer = useDeleteMockServer();
  const createMockServer = useCreateMockServer();

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this mock server?')) {
      deleteMockServer.mutate(id);
    }
  };

  const handleCreate = async () => {
    if (!newServerName.trim()) return;
    createMockServer.mutate(
      { name: newServerName.trim() },
      {
        onSuccess: () => {
          setCreateOpen(false);
          setNewServerName('');
        },
      }
    );
  };

  const handleCopyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const servers = data?.servers || [];
  const filteredServers = servers.filter((server) => {
    const matchesSearch =
      server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      server.base_url.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const hasActiveFilters = searchQuery || statusFilter;
  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
  };

  const getStatusBadge = (status: MockServerStatus) => {
    const colors = {
      starting: 'bg-yellow-500',
      running: 'bg-green-500',
      stopped: 'bg-gray-500',
      failed: 'bg-red-500',
    };

    return (
      <Badge variant="secondary" className="capitalize gap-1.5">
        <span className={`w-2 h-2 rounded-full ${colors[status]}`} />
        {status}
      </Badge>
    );
  };

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Error Loading Mock Servers</CardTitle>
            <CardDescription>
              {error instanceof Error ? error.message : 'An error occurred'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Server className="w-8 h-8" />
            Mock Servers
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage mock API servers for isolated testing
          </p>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Mock Server
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Mock Server</DialogTitle>
              <DialogDescription>
                Create a new mock server. You can configure its endpoints after creation.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="server-name">Server Name</Label>
                <Input
                  id="server-name"
                  placeholder="e.g. User API Mock"
                  value={newServerName}
                  onChange={(e) => setNewServerName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!newServerName.trim() || createMockServer.isPending}
              >
                {createMockServer.isPending ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search mock servers by name or URL..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as MockServerStatus | '')}
                className="px-3 py-2 border rounded-md bg-background"
              >
                <option value="">All Statuses</option>
                <option value="running">Running</option>
                <option value="stopped">Stopped</option>
                <option value="starting">Starting</option>
                <option value="failed">Failed</option>
              </select>
              {hasActiveFilters && (
                <Button variant="ghost" size="icon" onClick={clearFilters} title="Clear filters">
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            {hasActiveFilters && (
              <div className="flex gap-2 items-center text-sm text-muted-foreground">
                <span>Active filters:</span>
                {searchQuery && (
                  <Badge variant="secondary" className="gap-1">
                    Search: {searchQuery}
                    <button onClick={() => setSearchQuery('')} className="ml-1 hover:text-foreground">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                )}
                {statusFilter && (
                  <Badge variant="secondary" className="gap-1">
                    Status: {statusFilter}
                    <button onClick={() => setStatusFilter('')} className="ml-1 hover:text-foreground">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">Loading mock servers...</div>
          </CardContent>
        </Card>
      ) : filteredServers.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Server className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground mb-4">
                {servers.length === 0 ? 'No mock servers found' : 'No mock servers match your search'}
              </p>
              <p className="text-sm text-muted-foreground">
                Create a mock server above or run a flow with a{' '}
                <code className="bg-muted px-1 py-0.5 rounded">mock_server_start</code> action
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Base URL</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredServers.map((server) => (
                <TableRow key={server.id}>
                  <TableCell>
                    <Link href={`/mocks/${server.id}`} className="font-medium hover:underline">
                      {server.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="text-sm bg-muted px-2 py-1 rounded truncate max-w-xs">
                        {server.base_url}
                      </code>
                      <button
                        onClick={() => handleCopyUrl(server.base_url, server.id)}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        title="Copy base URL"
                      >
                        {copiedId === server.id ? (
                          <Check className="w-3.5 h-3.5 text-green-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(server.status)}</TableCell>
                  <TableCell>
                    {server.started_at
                      ? formatDistanceToNow(new Date(server.started_at), { addSuffix: true })
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Link href={`/mocks/${server.id}`}>
                        <Button variant="ghost" size="sm">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(server.id)}
                        disabled={deleteMockServer.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {data && data.total > 0 && (
        <div className="mt-4 text-sm text-muted-foreground text-center">
          Showing {filteredServers.length} of {data.total} mock servers
        </div>
      )}
    </div>
  );
}
