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
  CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

import type {
  HttpRequest,
  HttpResponse,
  HttpMethod,
  KeyValuePair,
  BodyConfig,
  AuthConfig,
} from './types';
import {
  DEFAULT_REQUEST,
  requestToStepConfig,
  requestToCurl,
} from './types';

interface RequestBuilderProps {
  initialRequest?: HttpRequest;
  onChange?: (request: HttpRequest) => void;
  onSend?: (request: HttpRequest) => Promise<HttpResponse | null>;
  onSave?: (config: Record<string, any>) => void;
  className?: string;
}

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

  // Update request and notify parent
  const updateRequest = useCallback(
    (updates: Partial<HttpRequest>) => {
      const newRequest = { ...request, ...updates };
      setRequest(newRequest);
      onChange?.(newRequest);
    },
    [request, onChange]
  );

  // Send the request
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

  // Copy as cURL
  const copyCurl = useCallback(() => {
    const curl = requestToCurl(request);
    navigator.clipboard.writeText(curl);
  }, [request]);

  // Save to flow
  const handleSave = useCallback(() => {
    const config = requestToStepConfig(request);
    onSave?.(config);
  }, [request, onSave]);

  // Count active items for badges
  const activeParamsCount = request.query_params.filter((p) => p.enabled && p.key).length;
  const activeHeadersCount = request.headers.filter((h) => h.enabled && h.key).length;
  const hasBody = request.body.type !== 'none';
  const hasAuth = request.auth.type !== 'none';

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* URL Bar */}
      <div className="flex items-center gap-2 p-3 border-b">
        <MethodSelector
          value={request.method}
          onChange={(method) => updateRequest({ method })}
        />
        <URLInput
          value={request.url}
          onChange={(url) => updateRequest({ url })}
        />
        <Button
          onClick={handleSend}
          disabled={isLoading || !request.url || !onSend}
          className="min-w-20"
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" />
              Send
            </>
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <ChevronDown className="w-4 h-4" />
            </Button>
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

      {/* Request tabs */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <Tabs defaultValue="params" className="flex-1 flex flex-col">
          <TabsList className="justify-start px-3 border-b rounded-none bg-transparent">
            <TabsTrigger value="params" className="relative">
              Params
              {activeParamsCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                  {activeParamsCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="headers">
              Headers
              {activeHeadersCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                  {activeHeadersCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="body">
              Body
              {hasBody && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                  {request.body.type}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="auth">
              Auth
              {hasAuth && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                  {request.auth.type}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto">
            <TabsContent value="params" className="m-0 h-full">
              <ParamsTab
                params={request.query_params}
                onChange={(query_params) => updateRequest({ query_params })}
              />
            </TabsContent>
            <TabsContent value="headers" className="m-0 h-full">
              <HeadersTab
                headers={request.headers}
                onChange={(headers) => updateRequest({ headers })}
              />
            </TabsContent>
            <TabsContent value="body" className="m-0 h-full">
              <BodyTab
                body={request.body}
                onChange={(body) => updateRequest({ body })}
                method={request.method}
              />
            </TabsContent>
            <TabsContent value="auth" className="m-0 h-full">
              <AuthTab
                auth={request.auth}
                onChange={(auth) => updateRequest({ auth })}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Response section */}
      {(response || error) && (
        <div className="border-t">
          <div className="p-3 flex items-center justify-between bg-muted/30">
            <div className="flex items-center gap-3">
              {response && (
                <>
                  <Badge
                    variant={response.status >= 200 && response.status < 300 ? 'default' : 'destructive'}
                    className="font-mono"
                  >
                    {response.status} {response.status_text}
                  </Badge>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {response.time_ms}ms
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {(response.size_bytes / 1024).toFixed(2)} KB
                  </div>
                </>
              )}
              {error && (
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">{error}</span>
                </div>
              )}
            </div>
          </div>

          {response && (
            <div className="p-3 max-h-64 overflow-auto">
              <pre className="text-xs font-mono bg-muted/50 p-3 rounded overflow-x-auto">
                {typeof response.body === 'object'
                  ? JSON.stringify(response.body, null, 2)
                  : response.body_text}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* cURL Dialog */}
      <Dialog open={showCurlDialog} onOpenChange={setShowCurlDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>cURL Command</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <pre className="text-sm font-mono bg-muted p-4 rounded overflow-x-auto whitespace-pre-wrap">
              {requestToCurl(request)}
            </pre>
            <Button
              variant="outline"
              size="sm"
              className="absolute top-2 right-2"
              onClick={() => {
                copyCurl();
                setShowCurlDialog(false);
              }}
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
