'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  History,
  Search,
  Loader2,
  BookmarkCheck,
  Bookmark,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import RequestBuilder from '@/components/request-builder/RequestBuilder';
import { DEFAULT_REQUEST, generatePairId, requestToStepConfig } from '@/components/request-builder/types';
import type { HttpRequest, HttpResponse } from '@/components/request-builder/types';
import { apiClient } from '@/lib/api/client';
import {
  useCreateHistory,
  useHistory,
  useHistoryStats,
  useSaveHistory,
  useUnsaveHistory,
  useDeleteHistory,
  useClearHistory,
} from '@/lib/hooks/useHistory';
import { useImportFlows } from '@/lib/hooks/useImportExport';
import type { RequestHistory, RequestHistoryData, HistoryFilter } from '@/lib/api/history';

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-teal-400/15 text-teal-400',
  POST: 'bg-blue-400/15 text-blue-400',
  PUT: 'bg-orange-400/15 text-orange-400',
  PATCH: 'bg-yellow-400/15 text-yellow-400',
  DELETE: 'bg-red-400/15 text-red-400',
  HEAD: 'bg-[#1a2d3d] text-[#4a6480]',
  OPTIONS: 'bg-purple-400/15 text-purple-400',
};

function getStatusColor(status: number): string {
  if (status >= 200 && status < 300) return 'text-teal-400';
  if (status >= 300 && status < 400) return 'text-blue-400';
  if (status >= 400 && status < 500) return 'text-orange-400';
  if (status >= 500) return 'text-red-400';
  return 'text-[#4a6480]';
}

export default function RequestBuilderPage() {
  const [requestKey, setRequestKey] = useState(0);
  const [initialRequest, setInitialRequest] = useState<HttpRequest>(DEFAULT_REQUEST);
  const [currentRequest, setCurrentRequest] = useState<HttpRequest>(DEFAULT_REQUEST);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [flowName, setFlowName] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [savedFilter, setSavedFilter] = useState<'all' | 'saved' | 'unsaved'>('all');

  const filter: HistoryFilter = useMemo(() => {
    const f: HistoryFilter = {};
    if (searchQuery) f.url = searchQuery;
    if (methodFilter !== 'all') f.method = methodFilter;
    if (savedFilter === 'saved') f.saved = true;
    return f;
  }, [searchQuery, methodFilter, savedFilter]);

  const { data: historyData, isLoading: historyLoading } = useHistory(filter, 100, 0);
  const { data: stats } = useHistoryStats();

  const createHistory = useCreateHistory();
  const saveHistory = useSaveHistory();
  const unsaveHistory = useUnsaveHistory();
  const deleteHistory = useDeleteHistory();
  const clearHistory = useClearHistory();
  const importFlows = useImportFlows();

  const displayedEntries = useMemo(() => {
    if (savedFilter === 'unsaved') {
      return historyData?.history.filter((h) => !h.saved_at) || [];
    }
    return historyData?.history || [];
  }, [historyData, savedFilter]);

  const loadHistoryEntry = useCallback((entry: RequestHistory) => {
    setActiveHistoryId(entry.id);
    const data = entry.request;
    const request: HttpRequest = {
      method: (data.method?.toUpperCase() || 'GET') as HttpRequest['method'],
      url: data.url || '',
      query_params: Object.entries(data.query_params || {}).map(([key, value]) => ({
        id: generatePairId(),
        key,
        value,
        enabled: true,
      })),
      headers: Object.entries(data.headers || {}).map(([key, value]) => ({
        id: generatePairId(),
        key,
        value,
        enabled: true,
      })),
      auth: { type: 'none' },
      body: data.body
        ? { type: (data.body_type as HttpRequest['body']['type']) || 'raw', raw: data.body }
        : { type: 'none' },
      follow_redirects: true,
    };
    setInitialRequest(request);
    setRequestKey((k) => k + 1);
  }, []);

  const handleToggleSave = async (e: React.MouseEvent, entry: RequestHistory) => {
    e.stopPropagation();
    if (entry.saved_at) {
      await unsaveHistory.mutateAsync(entry.id);
    } else {
      await saveHistory.mutateAsync(entry.id);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Delete this history entry?')) {
      await deleteHistory.mutateAsync(id);
      if (activeHistoryId === id) setActiveHistoryId(null);
    }
  };

  const handleClearAll = async () => {
    if (confirm('Clear all history? Saved entries will be kept.')) {
      await clearHistory.mutateAsync(true);
    }
  };

  const handleSend = useCallback(
    async (request: HttpRequest): Promise<HttpResponse | null> => {
      setActiveHistoryId(null);

      let url = request.url;
      const enabledParams = request.query_params.filter((p) => p.enabled && p.key);
      if (enabledParams.length > 0) {
        try {
          const urlObj = new URL(url);
          enabledParams.forEach((p) => urlObj.searchParams.append(p.key, p.value));
          url = urlObj.toString();
        } catch {
          const sep = url.includes('?') ? '&' : '?';
          url +=
            sep +
            enabledParams
              .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
              .join('&');
        }
      }

      const headers: Record<string, string> = {};
      request.headers.filter((h) => h.enabled && h.key).forEach((h) => {
        headers[h.key] = h.value;
      });
      if (request.auth.type === 'basic' && request.auth.basic) {
        headers['Authorization'] = `Basic ${btoa(`${request.auth.basic.username}:${request.auth.basic.password}`)}`;
      } else if (request.auth.type === 'bearer' && request.auth.bearer) {
        headers['Authorization'] = `${request.auth.bearer.prefix || 'Bearer'} ${request.auth.bearer.token}`;
      } else if (request.auth.type === 'api_key' && request.auth.api_key?.in === 'header') {
        headers[request.auth.api_key.key] = request.auth.api_key.value;
      }

      let body: string | undefined;
      if (request.body.type === 'json' && request.body.json) {
        headers['Content-Type'] = 'application/json';
        body = request.body.json;
      } else if (request.body.type === 'raw' && request.body.raw) {
        if (request.body.content_type) headers['Content-Type'] = request.body.content_type;
        body = request.body.raw;
      } else if (request.body.type === 'form_urlencoded' && request.body.form_urlencoded) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        body = request.body.form_urlencoded
          .filter((f) => f.enabled && f.key)
          .map((f) => `${encodeURIComponent(f.key)}=${encodeURIComponent(f.value)}`)
          .join('&');
      }

      const historyRequest: RequestHistoryData = {
        method: request.method,
        url: request.url,
        headers: Object.fromEntries(
          request.headers.filter((h) => h.enabled && h.key).map((h) => [h.key, h.value])
        ),
        query_params: Object.fromEntries(
          request.query_params.filter((p) => p.enabled && p.key).map((p) => [p.key, p.value])
        ),
        body,
        body_type: request.body.type !== 'none' ? request.body.type : undefined,
      };

      try {
        const { data } = await apiClient.post('/api/v1/proxy/send', {
          method: request.method,
          url,
          headers,
          body: ['GET', 'HEAD'].includes(request.method) ? undefined : body,
          follow_redirects: request.follow_redirects,
          timeout_seconds: request.timeout ? parseInt(request.timeout) : undefined,
        });

        if (data.error) {
          createHistory.mutate({
            method: request.method,
            url: request.url,
            request: historyRequest,
            error: data.error,
            duration_ms: data.time_ms || 0,
          });
          throw new Error(data.error);
        }

        const response: HttpResponse = {
          status: data.status,
          status_text: data.status_text,
          headers: data.headers || {},
          body: (() => { try { return JSON.parse(data.body); } catch { return data.body; } })(),
          body_text: data.body,
          size_bytes: data.size_bytes,
          time_ms: data.time_ms,
        };

        createHistory.mutate({
          method: request.method,
          url: request.url,
          request: historyRequest,
          response: {
            status_code: data.status,
            status_text: data.status_text,
            headers: data.headers || {},
            body: data.body,
            body_text: data.body,
            size_bytes: data.size_bytes,
            time_ms: data.time_ms,
          },
          status_code: data.status,
          duration_ms: data.time_ms,
          size_bytes: data.size_bytes,
        });

        return response;
      } catch (err: any) {
        if (err.message && !err.response) throw err;
        const errorMsg = err.response?.data?.error || err.message || 'Request failed';
        createHistory.mutate({
          method: request.method,
          url: request.url,
          request: historyRequest,
          error: errorMsg,
        });
        throw new Error(errorMsg);
      }
    },
    [createHistory]
  );

  const handleSaveAsFlow = useCallback(async () => {
    if (!flowName.trim()) return;
    const config = requestToStepConfig(currentRequest);
    const urlPath = (() => {
      try { return new URL(currentRequest.url).pathname; } catch { return currentRequest.url; }
    })();
    await importFlows.mutateAsync({
      flows: [{
        name: flowName.trim(),
        description: `${currentRequest.method} ${urlPath}`,
        suite: '',
        tags: [],
        steps: [{ id: 'step_1', name: flowName.trim(), action: 'http_request', config }],
      }],
    });
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveDialogOpen(false);
      setSaveSuccess(false);
      setFlowName('');
    }, 1200);
  }, [flowName, currentRequest, importFlows]);

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* History sidebar */}
      <div className="w-72 border-r border-[#1e2d3d] flex flex-col bg-[#0b0f18] shrink-0">
        <div className="p-3 border-b border-[#1e2d3d] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-[#4a7a96]" />
              <span className="text-sm font-medium text-[#c8dce8]">History</span>
            </div>
            <button
              onClick={handleClearAll}
              className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-red-400 hover:bg-red-400/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#3d5670]" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search URL..."
              className="pl-7 h-7 text-xs bg-[#0f1923] border-[#1e2d3d] text-[#c8dce8] placeholder-[#3d5670] focus:border-teal-400/50"
            />
          </div>

          <div className="flex gap-1.5">
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-20 h-7 text-xs bg-[#0f1923] border-[#1e2d3d] text-[#c8dce8]">
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
              <SelectTrigger className="flex-1 h-7 text-xs bg-[#0f1923] border-[#1e2d3d] text-[#c8dce8]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="saved">Saved</SelectItem>
                <SelectItem value="unsaved">Unsaved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {stats && (
            <div className="flex gap-3 text-[10px] text-[#3d5670]">
              <span>{stats.total_requests} total</span>
              <span>{stats.saved_requests} saved</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {historyLoading ? (
            <div className="flex items-center justify-center h-16">
              <Loader2 className="w-4 h-4 animate-spin text-[#4a6480]" />
            </div>
          ) : displayedEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 text-[#4a6480]">
              <History className="w-6 h-6 mb-1 opacity-40" />
              <p className="text-xs">No history yet</p>
            </div>
          ) : (
            <div className="divide-y divide-[#1a2332]">
              {displayedEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={cn(
                    'p-2.5 cursor-pointer hover:bg-[#131b26] transition-colors group',
                    activeHistoryId === entry.id && 'bg-teal-400/5 border-l-2 border-l-teal-400'
                  )}
                  onClick={() => loadHistoryEntry(entry)}
                >
                  <div className="flex items-start gap-1.5">
                    <span className={cn(
                      'text-[9px] px-1.5 py-0.5 rounded font-mono font-bold shrink-0 mt-0.5',
                      METHOD_COLORS[entry.method] || 'bg-[#1a2d3d] text-[#4a6480]'
                    )}>
                      {entry.method}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono truncate text-[#7fa8c8]">{entry.url}</div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-[#4a6480]">
                        <span className={getStatusColor(entry.status_code)}>
                          {entry.status_code || 'Error'}
                        </span>
                        <span>{entry.duration_ms}ms</span>
                        <span className="truncate">
                          {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 opacity-0 group-hover:opacity-100 transition-opacity gap-0.5">
                      <button
                        className="p-0.5 text-[#4a6480] hover:text-teal-400 transition-colors"
                        onClick={(e) => handleToggleSave(e, entry)}
                      >
                        {entry.saved_at
                          ? <BookmarkCheck className="w-3 h-3 text-teal-400" />
                          : <Bookmark className="w-3 h-3" />}
                      </button>
                      <button
                        className="p-0.5 text-[#4a6480] hover:text-red-400 transition-colors"
                        onClick={(e) => handleDelete(e, entry.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  {entry.error && (
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-red-400">
                      <AlertCircle className="w-2.5 h-2.5" />
                      <span className="truncate">{entry.error}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Request Builder */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <RequestBuilder
          key={requestKey}
          initialRequest={initialRequest}
          onSend={handleSend}
          onChange={setCurrentRequest}
          onSave={() => {
            const urlPath = (() => {
              try { return new URL(currentRequest.url).pathname; } catch { return currentRequest.url; }
            })();
            setFlowName(`${currentRequest.method} ${urlPath}`);
            setSaveDialogOpen(true);
          }}
          className="h-full"
        />
      </div>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save as Flow</DialogTitle>
          </DialogHeader>
          {saveSuccess ? (
            <p className="text-sm text-teal-400 py-2">Flow saved successfully.</p>
          ) : (
            <>
              <div className="space-y-2 py-2">
                <Label htmlFor="flow-name">Flow name</Label>
                <Input
                  id="flow-name"
                  value={flowName}
                  onChange={(e) => setFlowName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveAsFlow()}
                  autoFocus
                />
              </div>
              <DialogFooter>
                <button
                  onClick={() => setSaveDialogOpen(false)}
                  className="h-8 px-4 rounded-lg text-xs font-medium bg-[#0b0f18] border border-[#1e2d3d] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAsFlow}
                  disabled={!flowName.trim() || importFlows.isPending}
                  className="h-8 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors"
                >
                  Save
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
