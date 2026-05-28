'use client';

import { useState, useCallback } from 'react';
import {
  Send,
  Copy,
  Settings,
  ChevronDown,
  Code,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import MethodSelector from './MethodSelector';
import URLInput from './URLInput';
import ParamsTab from './tabs/ParamsTab';
import HeadersTab from './tabs/HeadersTab';
import BodyTab from './tabs/BodyTab';
import AuthTab from './tabs/AuthTab';

import type { HttpRequest, HttpResponse } from './types';
import { DEFAULT_REQUEST, requestToStepConfig, requestToCurl } from './types';

interface RequestBuilderProps {
  initialRequest?: HttpRequest;
  onChange?: (request: HttpRequest) => void;
  onSend?: (request: HttpRequest) => Promise<HttpResponse | null>;
  onSave?: (config: Record<string, any>) => void;
  className?: string;
}

type RequestTab = 'params' | 'headers' | 'body' | 'auth';

export default function RequestBuilder({
  initialRequest = DEFAULT_REQUEST,
  onChange,
  onSend,
  onSave,
  className,
}: RequestBuilderProps) {
  const [request, setRequest] = useState<HttpRequest>(initialRequest);
  const [response, setResponse] = useState<HttpResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCurlDialog, setShowCurlDialog] = useState(false);
  const [tab, setTab] = useState<RequestTab>('params');

  const updateRequest = useCallback(
    (updates: Partial<HttpRequest>) => {
      const newRequest = { ...request, ...updates };
      setRequest(newRequest);
      onChange?.(newRequest);
    },
    [request, onChange]
  );

  const handleSend = useCallback(async () => {
    if (!onSend) return;
    setIsLoading(true);
    setError(null);
    setResponse(null);
    try {
      const result = await onSend(request);
      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setIsLoading(false);
    }
  }, [request, onSend]);

  const copyCurl = useCallback(() => {
    navigator.clipboard.writeText(requestToCurl(request));
  }, [request]);

  const handleSave = useCallback(() => {
    onSave?.(requestToStepConfig(request));
  }, [request, onSave]);

  const activeParamsCount = request.query_params.filter((p) => p.enabled && p.key).length;
  const activeHeadersCount = request.headers.filter((h) => h.enabled && h.key).length;
  const hasBody = request.body.type !== 'none';
  const hasAuth = request.auth.type !== 'none';

  const statusOk = response && response.status >= 200 && response.status < 300;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="flex items-center gap-2 p-3 border-b border-[#1a2332] bg-[#0b0f18]">
        <MethodSelector
          value={request.method}
          onChange={(method) => updateRequest({ method })}
        />
        <URLInput
          value={request.url}
          onChange={(url) => updateRequest({ url })}
        />
        <button
          onClick={handleSend}
          disabled={isLoading || !request.url || !onSend}
          className="flex items-center gap-2 h-9 px-4 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 disabled:opacity-50 transition-colors shrink-0"
        >
          {isLoading ? (
            <div className="w-3.5 h-3.5 border-2 border-[#0b0f18] border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          Send
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center justify-center h-9 w-9 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors">
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShowCurlDialog(true)}>
              <Code className="w-4 h-4 mr-2" />
              View as cURL
            </DropdownMenuItem>
            <DropdownMenuItem onClick={copyCurl}>
              <Copy className="w-4 h-4 mr-2" />
              Copy as cURL
            </DropdownMenuItem>
            {onSave && (
              <DropdownMenuItem onClick={handleSave}>
                <Settings className="w-4 h-4 mr-2" />
                Save to Flow
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex gap-0.5 px-3 py-1.5 border-b border-[#1a2332] bg-[#0b0f18]">
          {([
            ['params', 'Params', activeParamsCount > 0 ? String(activeParamsCount) : null],
            ['headers', 'Headers', activeHeadersCount > 0 ? String(activeHeadersCount) : null],
            ['body', 'Body', hasBody ? request.body.type : null],
            ['auth', 'Auth', hasAuth ? request.auth.type : null],
          ] as const).map(([id, label, badge]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                'flex items-center gap-1.5 h-7 px-3 rounded text-xs transition-colors',
                tab === id
                  ? 'bg-[#1a2332] text-[#c8dce8]'
                  : 'text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#131b26]'
              )}
            >
              {label}
              {badge && (
                <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-[#1a2d3d] text-[#4a6480]">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto">
          {tab === 'params' && (
            <ParamsTab
              params={request.query_params}
              onChange={(query_params) => updateRequest({ query_params })}
            />
          )}
          {tab === 'headers' && (
            <HeadersTab
              headers={request.headers}
              onChange={(headers) => updateRequest({ headers })}
            />
          )}
          {tab === 'body' && (
            <BodyTab
              body={request.body}
              onChange={(body) => updateRequest({ body })}
              method={request.method}
            />
          )}
          {tab === 'auth' && (
            <AuthTab
              auth={request.auth}
              onChange={(auth) => updateRequest({ auth })}
            />
          )}
        </div>
      </div>

      {(response || error) && (
        <div className="border-t border-[#1a2332]">
          <div className="p-3 flex items-center gap-3 bg-[#0b0f18]">
            {response && (
              <>
                <span className={cn(
                  'text-xs font-medium font-mono px-2 py-0.5 rounded',
                  statusOk ? 'bg-teal-400/10 text-teal-400' : 'bg-red-400/10 text-red-400'
                )}>
                  {response.status} {response.status_text}
                </span>
                <div className="flex items-center gap-1 text-xs text-[#4a6480]">
                  <Clock className="w-3 h-3" />
                  {response.time_ms}ms
                </div>
                <div className="text-xs text-[#4a6480]">
                  {(response.size_bytes / 1024).toFixed(2)} KB
                </div>
              </>
            )}
            {error && (
              <div className="flex items-center gap-2 text-red-400">
                <AlertCircle className="w-4 h-4" />
                <span className="text-xs">{error}</span>
              </div>
            )}
          </div>

          {response && (
            <div className="p-3 max-h-64 overflow-auto">
              <pre className="text-xs font-mono bg-[#0f1923] border border-[#1a2332] p-3 rounded overflow-x-auto text-[#c8dce8]">
                {typeof response.body === 'object'
                  ? JSON.stringify(response.body, null, 2)
                  : response.body_text}
              </pre>
            </div>
          )}
        </div>
      )}

      <Dialog open={showCurlDialog} onOpenChange={setShowCurlDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>cURL Command</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <pre className="text-xs font-mono bg-[#0b0f18] border border-[#1a2332] p-4 rounded overflow-x-auto whitespace-pre-wrap text-[#c8dce8]">
              {requestToCurl(request)}
            </pre>
            <button
              onClick={() => { copyCurl(); setShowCurlDialog(false); }}
              className="absolute top-2 right-2 flex items-center gap-1.5 h-7 px-3 rounded border border-[#1e2d3d] bg-[#0f1923] text-xs text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
            >
              <Copy className="w-3 h-3" />
              Copy
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
