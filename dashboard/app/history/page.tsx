'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  History,
  Search,
  Loader2,
  Clock,
  Bookmark,
  BookmarkCheck,
  Trash2,
  Play,
  Filter,
  X,
  MoreHorizontal,
  Tag,
  AlertCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  useHistory,
  useHistoryStats,
  useSaveHistory,
  useUnsaveHistory,
  useDeleteHistory,
  useClearHistory,
} from '@/lib/hooks/useHistory';
import type { RequestHistory, HistoryFilter } from '@/lib/api/history';

// HTTP method colors
const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-green-500',
  POST: 'bg-blue-500',
  PUT: 'bg-orange-500',
  PATCH: 'bg-yellow-500',
  DELETE: 'bg-red-500',
  HEAD: 'bg-gray-500',
  OPTIONS: 'bg-purple-500',
};

// Status color
function getStatusColor(status: number): string {
  if (status >= 200 && status < 300) return 'text-green-600';
  if (status >= 300 && status < 400) return 'text-blue-600';
  if (status >= 400 && status < 500) return 'text-orange-600';
  if (status >= 500) return 'text-red-600';
  return 'text-gray-600';
}

export default function HistoryPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [savedFilter, setSavedFilter] = useState<'all' | 'saved' | 'unsaved'>('all');
  const [selectedEntry, setSelectedEntry] = useState<RequestHistory | null>(null);

  // Build filter
  const filter: HistoryFilter = useMemo(() => {
    const f: HistoryFilter = {};
    if (searchQuery) f.url = searchQuery;
    if (methodFilter !== 'all') f.method = methodFilter;
    if (savedFilter === 'saved') f.saved = true;
    return f;
  }, [searchQuery, methodFilter, savedFilter]);

  // Queries
  const { data: historyData, isLoading } = useHistory(filter, 100, 0);
  const { data: stats } = useHistoryStats();

  // Mutations
  const saveHistory = useSaveHistory();
  const unsaveHistory = useUnsaveHistory();
  const deleteHistory = useDeleteHistory();
  const clearHistory = useClearHistory();

  const handleToggleSave = async (entry: RequestHistory) => {
    if (entry.saved_at) {
      await unsaveHistory.mutateAsync(entry.id);
    } else {
      await saveHistory.mutateAsync(entry.id);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this history entry?')) {
      await deleteHistory.mutateAsync(id);
      if (selectedEntry?.id === id) {
        setSelectedEntry(null);
      }
    }
  };

  const handleClearAll = async () => {
    if (confirm('Are you sure you want to clear all history? Saved entries will be kept.')) {
      await clearHistory.mutateAsync(true);
    }
  };

  const handleRerun = (entry: RequestHistory) => {
    // Store request data in sessionStorage and redirect to request builder
    sessionStorage.setItem('rerun_request', JSON.stringify(entry.request));
    router.push('/request-builder');
  };

  // Filter entries for unsaved
  const displayedEntries = useMemo(() => {
    if (savedFilter === 'unsaved') {
      return historyData?.history.filter((h) => !h.saved_at) || [];
    }
    return historyData?.history || [];
  }, [historyData, savedFilter]);

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Sidebar with list */}
      <div className="w-96 border-r flex flex-col bg-muted/30">
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              <h2 className="font-semibold">Request History</h2>
            </div>
            <Button variant="ghost" size="sm" onClick={handleClearAll}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by URL..."
              className="pl-8 h-8 text-sm"
            />
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-24 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
                <SelectItem value="PATCH">PATCH</SelectItem>
                <SelectItem value="DELETE">DELETE</SelectItem>
              </SelectContent>
            </Select>

            <Select value={savedFilter} onValueChange={(v: any) => setSavedFilter(v)}>
              <SelectTrigger className="flex-1 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Requests</SelectItem>
                <SelectItem value="saved">Saved Only</SelectItem>
                <SelectItem value="unsaved">Unsaved Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Stats */}
          {stats && (
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>Total: {stats.total_requests}</span>
              <span>Saved: {stats.saved_requests}</span>
              <span>Today: {stats.today_requests}</span>
            </div>
          )}
        </div>

        {/* History list */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : displayedEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center text-muted-foreground">
              <History className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">No history entries</p>
            </div>
          ) : (
            <div className="divide-y">
              {displayedEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={cn(
                    'p-3 cursor-pointer hover:bg-muted/50 transition-colors',
                    selectedEntry?.id === entry.id && 'bg-primary/5 border-l-2 border-l-primary'
                  )}
                  onClick={() => setSelectedEntry(entry)}
                >
                  <div className="flex items-start gap-2">
                    {/* Method badge */}
                    <Badge
                      className={cn(
                        'text-[10px] px-1.5 py-0 text-white shrink-0',
                        METHOD_COLORS[entry.method] || 'bg-gray-500'
                      )}
                    >
                      {entry.method}
                    </Badge>

                    {/* URL and details */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-mono truncate">{entry.url}</div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span className={getStatusColor(entry.status_code)}>
                          {entry.status_code || 'Error'}
                        </span>
                        <span>{entry.duration_ms}ms</span>
                        <span>{formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}</span>
                      </div>
                    </div>

                    {/* Saved indicator */}
                    {entry.saved_at && (
                      <BookmarkCheck className="w-4 h-4 text-primary shrink-0" />
                    )}
                  </div>

                  {/* Tags */}
                  {entry.tags?.length > 0 && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {entry.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[10px] px-1 py-0">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Error indicator */}
                  {entry.error && (
                    <div className="flex items-center gap-1 mt-1.5 text-xs text-destructive">
                      <AlertCircle className="w-3 h-3" />
                      <span className="truncate">{entry.error}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main content - selected entry details */}
      <div className="flex-1 overflow-auto p-6">
        {selectedEntry ? (
          <HistoryEntryDetails
            entry={selectedEntry}
            onToggleSave={handleToggleSave}
            onDelete={handleDelete}
            onRerun={handleRerun}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <History className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">Request History</h3>
            <p className="text-muted-foreground mb-6 max-w-md">
              Select a request from the list to view its details, or make requests using the
              Request Builder to start building your history.
            </p>
            <Button onClick={() => router.push('/request-builder')}>
              Open Request Builder
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// History entry details component
function HistoryEntryDetails({
  entry,
  onToggleSave,
  onDelete,
  onRerun,
}: {
  entry: RequestHistory;
  onToggleSave: (entry: RequestHistory) => void;
  onDelete: (id: string) => void;
  onRerun: (entry: RequestHistory) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Badge
              className={cn(
                'text-sm px-2 py-1 text-white',
                METHOD_COLORS[entry.method] || 'bg-gray-500'
              )}
            >
              {entry.method}
            </Badge>
            <h2 className="font-mono text-lg break-all">{entry.url}</h2>
          </div>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span className={getStatusColor(entry.status_code)}>
              {entry.status_code} {entry.response?.status_text || ''}
            </span>
            <span>
              <Clock className="w-3 h-3 inline mr-1" />
              {entry.duration_ms}ms
            </span>
            <span>
              {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onToggleSave(entry)}>
            {entry.saved_at ? (
              <>
                <BookmarkCheck className="w-4 h-4 mr-1 text-primary" />
                Saved
              </>
            ) : (
              <>
                <Bookmark className="w-4 h-4 mr-1" />
                Save
              </>
            )}
          </Button>
          <Button variant="default" size="sm" onClick={() => onRerun(entry)}>
            <Play className="w-4 h-4 mr-1" />
            Re-run
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigator.clipboard.writeText(entry.url)}>
                Copy URL
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  navigator.clipboard.writeText(JSON.stringify(entry.request, null, 2))
                }
              >
                Copy Request
              </DropdownMenuItem>
              {entry.response && (
                <DropdownMenuItem
                  onClick={() =>
                    navigator.clipboard.writeText(entry.response?.body || '')
                  }
                >
                  Copy Response
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(entry.id)}
                className="text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Error message */}
      {entry.error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-4">
            <div className="flex items-start gap-2 text-destructive">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-sm">{entry.error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Request details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Request</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Headers */}
          {entry.request.headers && Object.keys(entry.request.headers).length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Headers</h4>
              <div className="bg-muted/50 rounded-md p-2 font-mono text-xs space-y-1">
                {Object.entries(entry.request.headers).map(([key, value]) => (
                  <div key={key}>
                    <span className="text-muted-foreground">{key}:</span> {value}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Query params */}
          {entry.request.query_params && Object.keys(entry.request.query_params).length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Query Parameters</h4>
              <div className="bg-muted/50 rounded-md p-2 font-mono text-xs space-y-1">
                {Object.entries(entry.request.query_params).map(([key, value]) => (
                  <div key={key}>
                    <span className="text-muted-foreground">{key}:</span> {value}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Body */}
          {entry.request.body && (
            <div>
              <h4 className="text-sm font-medium mb-2">
                Body
                {entry.request.body_type && (
                  <Badge variant="outline" className="ml-2 text-xs">
                    {entry.request.body_type}
                  </Badge>
                )}
              </h4>
              <pre className="bg-muted/50 rounded-md p-3 font-mono text-xs overflow-x-auto max-h-64 overflow-y-auto">
                {entry.request.body}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Response details */}
      {entry.response && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Response</CardTitle>
            <CardDescription>
              {entry.response.size_bytes} bytes in {entry.response.time_ms}ms
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Headers */}
            {entry.response.headers && Object.keys(entry.response.headers).length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Headers</h4>
                <div className="bg-muted/50 rounded-md p-2 font-mono text-xs space-y-1 max-h-32 overflow-y-auto">
                  {Object.entries(entry.response.headers).map(([key, value]) => (
                    <div key={key}>
                      <span className="text-muted-foreground">{key}:</span> {value}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Body */}
            {entry.response.body && (
              <div>
                <h4 className="text-sm font-medium mb-2">Body</h4>
                <pre className="bg-muted/50 rounded-md p-3 font-mono text-xs overflow-x-auto max-h-96 overflow-y-auto">
                  {entry.response.body}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
