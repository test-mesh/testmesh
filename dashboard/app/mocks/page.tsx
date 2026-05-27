'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  useMockServers,
  useDeleteMockServer,
  useCreateMockServer,
} from '@/lib/hooks/useMockServers';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Eye, Trash2, X, Search, Server, Plus, Copy, Check } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { MockServerStatus } from '@/lib/api/types';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'running', label: 'Running' },
  { value: 'stopped', label: 'Stopped' },
  { value: 'starting', label: 'Starting' },
  { value: 'failed', label: 'Failed' },
];

const STATUS_COLORS: Record<MockServerStatus, string> = {
  running: 'bg-teal-400',
  starting: 'bg-yellow-400',
  stopped: 'bg-[#3d5670]',
  failed: 'bg-red-400',
};

const STATUS_TEXT: Record<MockServerStatus, string> = {
  running: 'text-teal-400',
  starting: 'text-yellow-400',
  stopped: 'text-[#4a6480]',
  failed: 'text-red-400',
};

function StatusDot({ status }: { status: MockServerStatus }) {
  return (
    <span className={cn('flex items-center gap-1.5 text-[11px] font-medium', STATUS_TEXT[status])}>
      <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_COLORS[status])} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function MockServersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<MockServerStatus | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data, isLoading, error } = useMockServers({ status: statusFilter || undefined });
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
      { onSuccess: () => { setCreateOpen(false); setNewServerName(''); } }
    );
  };

  const handleCopyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const servers = data?.servers || [];
  const filteredServers = servers.filter((server) =>
    server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    server.base_url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (error) {
    return (
      <div className="px-6 py-6">
        <div className="rounded-xl bg-red-400/5 border border-red-400/20 p-6 text-red-400 text-sm">
          {error instanceof Error ? error.message : 'An error occurred'}
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-[#c8dce8]">Mock Servers</h1>
          <p className="text-xs text-[#3d5670] mt-0.5">Manage mock API servers for isolated testing</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <button className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors">
              <Plus className="w-3 h-3" />
              New Mock Server
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Mock Server</DialogTitle>
              <DialogDescription>
                Create a new mock server. Configure its endpoints after creation.
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
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!newServerName.trim() || createMockServer.isPending}>
                {createMockServer.isPending ? 'Creating…' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-[#3d5670]" />
          <input
            placeholder="Search by name or URL…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-8 pr-3 rounded-lg bg-[#0f1923] border border-[#1e2d3d] text-xs text-[#c8dce8] placeholder-[#3d5670] focus:outline-none focus:border-teal-400/50 transition-colors"
          />
        </div>
        <div className="flex gap-1">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value as MockServerStatus | '')}
              className={cn(
                'h-8 px-3 rounded-lg text-xs transition-colors',
                statusFilter === opt.value
                  ? 'bg-teal-400/15 text-teal-400 border border-teal-400/30'
                  : 'text-[#4a6480] bg-[#0f1923] border border-[#1e2d3d] hover:border-[#2a3d52] hover:text-[#7fa8c8]'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {(searchQuery || statusFilter) && (
          <button
            className="flex items-center justify-center h-8 w-8 rounded-lg text-[#4a6480] hover:text-[#c8dce8] hover:bg-[#1a2d3d] transition-colors"
            onClick={() => { setSearchQuery(''); setStatusFilter(''); }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl bg-[#0f1923] border border-[#1e2d3d] overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[2fr_3fr_1fr_1fr_auto] gap-4 px-4 py-2.5 border-b border-[#1a2332]">
          {['Name', 'Base URL', 'Status', 'Started', ''].map((h) => (
            <span key={h} className="text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">{h}</span>
          ))}
        </div>

        {isLoading ? (
          <div className="divide-y divide-[#1a2332]">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 px-4 flex items-center">
                <div className="h-3 w-1/3 rounded bg-[#1a2d3d] animate-pulse" />
              </div>
            ))}
          </div>
        ) : filteredServers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Server className="w-10 h-10 mb-3 text-[#1e2d3d]" />
            <p className="text-sm text-[#3d5670] mb-1">
              {servers.length === 0 ? 'No mock servers yet' : 'No mock servers match your search'}
            </p>
            {servers.length === 0 && (
              <p className="text-[11px] text-[#2a3d52]">
                Create one above or use a{' '}
                <code className="font-mono text-[#4a6480]">mock_server_start</code> action in a flow
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-[#1a2332]">
            {filteredServers.map((server) => (
              <div
                key={server.id}
                className="grid grid-cols-[2fr_3fr_1fr_1fr_auto] gap-4 px-4 py-3 hover:bg-[#131b26] transition-colors items-center group"
              >
                <Link
                  href={`/mocks/${server.id}`}
                  className="text-[13px] font-medium text-[#c8dce8] hover:text-teal-400 transition-colors truncate"
                >
                  {server.name}
                </Link>

                <div className="flex items-center gap-2 min-w-0">
                  <code className="text-[11px] font-mono text-[#4a6480] truncate">
                    {server.base_url}
                  </code>
                  <button
                    onClick={() => handleCopyUrl(server.base_url, server.id)}
                    className="shrink-0 text-[#3d5670] hover:text-teal-400 transition-colors"
                    title="Copy URL"
                  >
                    {copiedId === server.id
                      ? <Check className="w-3 h-3 text-teal-400" />
                      : <Copy className="w-3 h-3" />
                    }
                  </button>
                </div>

                <StatusDot status={server.status} />

                <span className="text-[11px] text-[#4a6480]">
                  {server.started_at
                    ? formatDistanceToNow(new Date(server.started_at), { addSuffix: true })
                    : '—'}
                </span>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Link
                    href={`/mocks/${server.id}`}
                    className="flex items-center justify-center h-7 w-7 rounded-lg text-[#4a6480] hover:text-teal-400 hover:bg-[#1a2d3d] transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </Link>
                  <button
                    onClick={() => handleDelete(server.id)}
                    disabled={deleteMockServer.isPending}
                    className="flex items-center justify-center h-7 w-7 rounded-lg text-[#4a6480] hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {data && data.total > 0 && (
        <p className="mt-3 text-xs text-[#3d5670] text-center">
          Showing {filteredServers.length} of {data.total} mock servers
        </p>
      )}
    </div>
  );
}
