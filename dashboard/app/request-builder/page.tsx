'use client';

import { useState, useEffect, useCallback } from 'react';
import { Send } from 'lucide-react';
import RequestBuilder from '@/components/request-builder/RequestBuilder';
import { DEFAULT_REQUEST, generatePairId } from '@/components/request-builder/types';
import type { HttpRequest, HttpResponse } from '@/components/request-builder/types';
import { useCreateHistory } from '@/lib/hooks/useHistory';
import { apiClient } from '@/lib/api/client';
import type { RequestHistoryData } from '@/lib/api/history';

export default function RequestBuilderPage() {
  const [requestKey, setRequestKey] = useState(0);
  const [initialRequest, setInitialRequest] = useState<HttpRequest>(DEFAULT_REQUEST);

  const createHistory = useCreateHistory();

  // Check for rerun request from history page
  useEffect(() => {
    const stored = sessionStorage.getItem('rerun_request');
    if (!stored) return;
    try {
      const data = JSON.parse(stored) as RequestHistoryData;
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
      sessionStorage.removeItem('rerun_request');
    } catch {
      // ignore malformed stored data
    }
  }, []);

  const handleSend = useCallback(
    async (request: HttpRequest): Promise<HttpResponse | null> => {
      // Build URL with query params
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

      // Build headers map
      const headers: Record<string, string> = {};
      request.headers.filter((h) => h.enabled && h.key).forEach((h) => {
        headers[h.key] = h.value;
      });

      // Auth headers
      if (request.auth.type === 'basic' && request.auth.basic) {
        const credentials = btoa(
          `${request.auth.basic.username}:${request.auth.basic.password}`
        );
        headers['Authorization'] = `Basic ${credentials}`;
      } else if (request.auth.type === 'bearer' && request.auth.bearer) {
        const prefix = request.auth.bearer.prefix || 'Bearer';
        headers['Authorization'] = `${prefix} ${request.auth.bearer.token}`;
      } else if (request.auth.type === 'api_key' && request.auth.api_key?.in === 'header') {
        headers[request.auth.api_key.key] = request.auth.api_key.value;
      }

      // Build body string
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

        // data is either ProxySendResponse or { error, time_ms }
        if (data.error) {
          const durationMs = data.time_ms || 0;
          createHistory.mutate({
            method: request.method,
            url: request.url,
            request: historyRequest,
            error: data.error,
            duration_ms: durationMs,
          });
          throw new Error(data.error);
        }

        const response: HttpResponse = {
          status: data.status,
          status_text: data.status_text,
          headers: data.headers || {},
          body: (() => {
            try { return JSON.parse(data.body); } catch { return data.body; }
          })(),
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
        // Re-throw if we already handled it above
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

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="px-4 py-3 border-b flex items-center gap-3">
        <Send className="w-5 h-5 text-primary" />
        <div>
          <h1 className="text-lg font-semibold leading-none">Request Builder</h1>
          <p className="text-sm text-muted-foreground mt-1">Build and send HTTP requests</p>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <RequestBuilder
          key={requestKey}
          initialRequest={initialRequest}
          onSend={handleSend}
          className="h-full"
        />
      </div>
    </div>
  );
}
