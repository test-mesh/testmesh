'use client';

import { useState } from 'react';
import {
  Globe,
  Plus,
  Trash2,
  FileJson,
  FileText,
  Code,
  ChevronDown,
  ChevronRight,
  Lock,
  Key,
  Timer,
  Cookie,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import VariablePicker from './VariablePicker';
import SSLTLSConfigPanel, { type SSLTLSConfig } from './SSLTLSConfigPanel';
import CookieManager, { type CookieConfig } from './CookieManager';

interface HTTPStepFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  variables?: Record<string, string>;
  stepOutputs?: Record<string, Record<string, unknown>>;
  className?: string;
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const COMMON_HEADERS = [
  { key: 'Content-Type', value: 'application/json' },
  { key: 'Accept', value: 'application/json' },
  { key: 'Authorization', value: 'Bearer ${TOKEN}' },
  { key: 'X-Request-ID', value: '${RANDOM_ID}' },
];

const CONTENT_TYPES = [
  { value: 'application/json', label: 'JSON' },
  { value: 'application/x-www-form-urlencoded', label: 'Form URL Encoded' },
  { value: 'multipart/form-data', label: 'Multipart Form' },
  { value: 'text/plain', label: 'Plain Text' },
  { value: 'application/xml', label: 'XML' },
];

interface HeaderEntry {
  key: string;
  value: string;
  enabled: boolean;
}

interface QueryParam {
  key: string;
  value: string;
  enabled: boolean;
}

export default function HTTPStepForm({
  config,
  onChange,
  variables = {},
  stepOutputs = {},
  className,
}: HTTPStepFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [bodyFormat, setBodyFormat] = useState<'json' | 'raw'>('json');

  // Parse headers from config (handle both object and JSON-string formats)
  const headers: HeaderEntry[] = (() => {
    let h = config.headers as Record<string, string> | string | undefined;
    if (!h) return [];
    if (typeof h === 'string') {
      try { h = JSON.parse(h); } catch { return []; }
    }
    if (typeof h !== 'object' || Array.isArray(h)) return [];
    return Object.entries(h as Record<string, string>).map(([key, value]) => ({
      key,
      value,
      enabled: true,
    }));
  })();

  // Parse query params from URL
  const parseQueryParams = (url: string): QueryParam[] => {
    try {
      const urlObj = new URL(url.replace(/\$\{[^}]+\}/g, 'placeholder'));
      const params: QueryParam[] = [];
      urlObj.searchParams.forEach((value, key) => {
        params.push({ key, value, enabled: true });
      });
      return params;
    } catch {
      return [];
    }
  };

  const [queryParams, setQueryParams] = useState<QueryParam[]>(
    parseQueryParams((config.url as string) || '')
  );

  // Update headers
  const updateHeaders = (newHeaders: HeaderEntry[]) => {
    const h: Record<string, string> = {};
    newHeaders.filter((e) => e.enabled && e.key).forEach((e) => {
      h[e.key] = e.value;
    });
    onChange('headers', h);
  };

  const addHeader = () => {
    updateHeaders([...headers, { key: '', value: '', enabled: true }]);
  };

  const updateHeader = (index: number, updates: Partial<HeaderEntry>) => {
    const newHeaders = [...headers];
    newHeaders[index] = { ...newHeaders[index], ...updates };
    updateHeaders(newHeaders);
  };

  const removeHeader = (index: number) => {
    updateHeaders(headers.filter((_, i) => i !== index));
  };

  // Update URL with query params
  const updateUrlWithParams = (baseUrl: string, params: QueryParam[]) => {
    try {
      // Keep variable placeholders
      const placeholder = 'http://placeholder.test';
      let url = baseUrl || placeholder;
      if (!url.includes('://')) url = placeholder + url;

      const urlObj = new URL(url.replace(/\$\{[^}]+\}/g, 'VAR_PLACEHOLDER'));

      // Clear existing params
      urlObj.search = '';

      // Add enabled params
      params.filter((p) => p.enabled && p.key).forEach((p) => {
        urlObj.searchParams.append(p.key, p.value);
      });

      let result = urlObj.toString().replace(/VAR_PLACEHOLDER/g, (match, offset, str) => {
        // Find the original variable
        const before = baseUrl.slice(0, offset);
        const matches = baseUrl.match(/\$\{[^}]+\}/g) || [];
        const idx = (before.match(/\$\{[^}]+\}/g) || []).length;
        return matches[idx] || match;
      });

      // Remove placeholder if we added it
      if (!baseUrl?.includes('://')) {
        result = result.replace(placeholder, '');
      }

      return result;
    } catch {
      return baseUrl;
    }
  };

  const method = (config.method as string) || 'GET';
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Method and URL */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">Request</Label>
        <div className="flex gap-2">
          <Select value={method} onValueChange={(v) => onChange('method', v)}>
            <SelectTrigger
              className={cn(
                'h-9 w-24 font-mono font-medium text-xs',
                method === 'GET' && 'text-green-600',
                method === 'POST' && 'text-yellow-600',
                method === 'PUT' && 'text-blue-600',
                method === 'PATCH' && 'text-purple-600',
                method === 'DELETE' && 'text-red-600'
              )}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HTTP_METHODS.map((m) => (
                <SelectItem key={m} value={m} className="font-mono">
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <VariablePicker
            value={(config.url as string) || ''}
            onChange={(v) => onChange('url', v)}
            placeholder="https://api.example.com/endpoint"
            variables={variables}
            stepOutputs={stepOutputs}
            className="flex-1"
          />
        </div>
      </div>

      {/* Tabs for Params, Headers, Body, Auth */}
      <Tabs defaultValue={hasBody ? 'body' : 'headers'} className="w-full">
        <TabsList className="w-full justify-start h-8">
          <TabsTrigger value="params" className="text-xs h-7 px-3">
            Params
            {queryParams.length > 0 && (
              <span className="ml-1 text-[10px] bg-muted px-1 rounded">
                {queryParams.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="headers" className="text-xs h-7 px-3">
            Headers
            {headers.length > 0 && (
              <span className="ml-1 text-[10px] bg-muted px-1 rounded">
                {headers.length}
              </span>
            )}
          </TabsTrigger>
          {hasBody && (
            <TabsTrigger value="body" className="text-xs h-7 px-3">
              Body
            </TabsTrigger>
          )}
          <TabsTrigger value="auth" className="text-xs h-7 px-3">
            Auth
          </TabsTrigger>
          <TabsTrigger value="ssl" className="text-xs h-7 px-3">
            <Lock className="w-3 h-3 mr-1" />
            SSL/TLS
          </TabsTrigger>
          <TabsTrigger value="cookies" className="text-xs h-7 px-3">
            <Cookie className="w-3 h-3 mr-1" />
            Cookies
            {((config.cookies as CookieConfig[]) || []).length > 0 && (
              <span className="ml-1 text-[10px] bg-muted px-1 rounded">
                {((config.cookies as CookieConfig[]) || []).length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Query Parameters */}
        <TabsContent value="params" className="mt-3 space-y-3">
          <div className="space-y-2">
            {queryParams.map((param, index) => (
              <div key={index} className="flex items-center gap-2">
                <Switch
                  checked={param.enabled}
                  onCheckedChange={(checked) => {
                    const newParams = [...queryParams];
                    newParams[index] = { ...param, enabled: checked };
                    setQueryParams(newParams);
                    onChange('url', updateUrlWithParams((config.url as string) || '', newParams));
                  }}
                  className="scale-75"
                />
                <Input
                  value={param.key}
                  onChange={(e) => {
                    const newParams = [...queryParams];
                    newParams[index] = { ...param, key: e.target.value };
                    setQueryParams(newParams);
                    onChange('url', updateUrlWithParams((config.url as string) || '', newParams));
                  }}
                  placeholder="key"
                  className="h-7 text-xs font-mono w-28"
                />
                <span className="text-muted-foreground">=</span>
                <Input
                  value={param.value}
                  onChange={(e) => {
                    const newParams = [...queryParams];
                    newParams[index] = { ...param, value: e.target.value };
                    setQueryParams(newParams);
                    onChange('url', updateUrlWithParams((config.url as string) || '', newParams));
                  }}
                  placeholder="value"
                  className="h-7 text-xs font-mono flex-1"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const newParams = queryParams.filter((_, i) => i !== index);
                    setQueryParams(newParams);
                    onChange('url', updateUrlWithParams((config.url as string) || '', newParams));
                  }}
                  className="h-7 w-7 p-0"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newParams = [...queryParams, { key: '', value: '', enabled: true }];
              setQueryParams(newParams);
            }}
            className="h-7 text-xs"
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Parameter
          </Button>
        </TabsContent>

        {/* Headers */}
        <TabsContent value="headers" className="mt-3 space-y-3">
          <div className="space-y-2">
            {headers.map((header, index) => (
              <div key={index} className="flex items-center gap-2">
                <Switch
                  checked={header.enabled}
                  onCheckedChange={(checked) => updateHeader(index, { enabled: checked })}
                  className="scale-75"
                />
                <Input
                  value={header.key}
                  onChange={(e) => updateHeader(index, { key: e.target.value })}
                  placeholder="Header-Name"
                  className="h-7 text-xs font-mono w-32"
                  list="common-headers"
                />
                <span className="text-muted-foreground">:</span>
                <Input
                  value={header.value}
                  onChange={(e) => updateHeader(index, { value: e.target.value })}
                  placeholder="value"
                  className="h-7 text-xs font-mono flex-1"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeHeader(index)}
                  className="h-7 w-7 p-0"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
          <datalist id="common-headers">
            {COMMON_HEADERS.map((h) => (
              <option key={h.key} value={h.key} />
            ))}
          </datalist>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={addHeader} className="h-7 text-xs">
              <Plus className="w-3 h-3 mr-1" />
              Add Header
            </Button>
            <Select
              value=""
              onValueChange={(key) => {
                const common = COMMON_HEADERS.find((h) => h.key === key);
                if (common) {
                  updateHeaders([...headers, { ...common, enabled: true }]);
                }
              }}
            >
              <SelectTrigger className="h-7 w-32 text-xs">
                <SelectValue placeholder="Common..." />
              </SelectTrigger>
              <SelectContent>
                {COMMON_HEADERS.map((h) => (
                  <SelectItem key={h.key} value={h.key} className="text-xs">
                    {h.key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </TabsContent>

        {/* Body */}
        {hasBody && (
          <TabsContent value="body" className="mt-3 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Label className="text-xs">Content Type</Label>
              <Select
                value={(config.headers as Record<string, string>)?.['Content-Type'] || 'application/json'}
                onValueChange={(v) => {
                  const newHeaders = { ...(config.headers as Record<string, string>), 'Content-Type': v };
                  onChange('headers', newHeaders);
                }}
              >
                <SelectTrigger className="h-7 w-48 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_TYPES.map((ct) => (
                    <SelectItem key={ct.value} value={ct.value} className="text-xs">
                      {ct.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <div className="flex border-b">
                <button
                  onClick={() => setBodyFormat('json')}
                  className={cn(
                    'flex items-center gap-1 px-3 py-1.5 text-xs',
                    bodyFormat === 'json' ? 'bg-muted font-medium' : 'hover:bg-muted/50'
                  )}
                >
                  <FileJson className="w-3 h-3" />
                  JSON
                </button>
                <button
                  onClick={() => setBodyFormat('raw')}
                  className={cn(
                    'flex items-center gap-1 px-3 py-1.5 text-xs',
                    bodyFormat === 'raw' ? 'bg-muted font-medium' : 'hover:bg-muted/50'
                  )}
                >
                  <Code className="w-3 h-3" />
                  Raw
                </button>
              </div>
              <Textarea
                value={
                  typeof config.body === 'object'
                    ? JSON.stringify(config.body, null, 2)
                    : (config.body as string) || ''
                }
                onChange={(e) => {
                  if (bodyFormat === 'json') {
                    try {
                      onChange('body', JSON.parse(e.target.value));
                    } catch {
                      onChange('body', e.target.value);
                    }
                  } else {
                    onChange('body', e.target.value);
                  }
                }}
                placeholder={bodyFormat === 'json' ? '{\n  "key": "value"\n}' : 'Request body...'}
                className="border-0 rounded-none text-xs font-mono resize-none min-h-[120px]"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Use {'${variable}'} syntax for dynamic values
            </p>
          </TabsContent>
        )}

        {/* Auth */}
        <TabsContent value="auth" className="mt-3 space-y-3">
          <div className="space-y-3">
            <Select
              value={(config.auth as Record<string, unknown>)?.type as string || 'none'}
              onValueChange={(v) => onChange('auth', { type: v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select auth type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">No Auth</SelectItem>
                <SelectItem value="bearer" className="text-xs">Bearer Token</SelectItem>
                <SelectItem value="basic" className="text-xs">Basic Auth</SelectItem>
                <SelectItem value="api_key" className="text-xs">API Key</SelectItem>
                <SelectItem value="oauth2" className="text-xs">OAuth 2.0</SelectItem>
              </SelectContent>
            </Select>

            {(config.auth as Record<string, unknown>)?.type === 'bearer' && (
              <div className="space-y-2">
                <Label className="text-xs">Token</Label>
                <VariablePicker
                  value={(config.auth as Record<string, string>)?.token || ''}
                  onChange={(v) => onChange('auth', { type: 'bearer', token: v })}
                  placeholder="${ACCESS_TOKEN}"
                  variables={variables}
                  stepOutputs={stepOutputs}
                />
              </div>
            )}

            {(config.auth as Record<string, unknown>)?.type === 'basic' && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Username</Label>
                  <VariablePicker
                    value={(config.auth as Record<string, string>)?.username || ''}
                    onChange={(v) => onChange('auth', { ...(config.auth as object), username: v })}
                    placeholder="username"
                    variables={variables}
                    stepOutputs={stepOutputs}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Password</Label>
                  <VariablePicker
                    value={(config.auth as Record<string, string>)?.password || ''}
                    onChange={(v) => onChange('auth', { ...(config.auth as object), password: v })}
                    placeholder="password"
                    variables={variables}
                    stepOutputs={stepOutputs}
                  />
                </div>
              </div>
            )}

            {(config.auth as Record<string, unknown>)?.type === 'api_key' && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Key Name</Label>
                  <Input
                    value={(config.auth as Record<string, string>)?.key || ''}
                    onChange={(e) => onChange('auth', { ...(config.auth as object), key: e.target.value })}
                    placeholder="X-API-Key"
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Value</Label>
                  <VariablePicker
                    value={(config.auth as Record<string, string>)?.value || ''}
                    onChange={(v) => onChange('auth', { ...(config.auth as object), value: v })}
                    placeholder="${API_KEY}"
                    variables={variables}
                    stepOutputs={stepOutputs}
                  />
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* SSL/TLS Configuration */}
        <TabsContent value="ssl" className="mt-3">
          <SSLTLSConfigPanel
            value={(config.ssl as SSLTLSConfig) || {}}
            onChange={(sslConfig) => onChange('ssl', sslConfig)}
          />
        </TabsContent>

        {/* Cookies */}
        <TabsContent value="cookies" className="mt-3">
          <CookieManager
            cookies={(config.cookies as CookieConfig[]) || []}
            onChange={(cookies) => onChange('cookies', cookies)}
          />
        </TabsContent>
      </Tabs>

      {/* Advanced Options */}
      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Advanced Options
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-3 pt-3 border-t">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Timer className="w-3 h-3" />
                Timeout
              </Label>
              <Input
                value={(config.timeout as string) || ''}
                onChange={(e) => onChange('timeout', e.target.value)}
                placeholder="30s"
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Follow Redirects</Label>
              <Select
                value={config.follow_redirects === false ? 'false' : 'true'}
                onValueChange={(v) => onChange('follow_redirects', v === 'true')}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true" className="text-xs">Yes</SelectItem>
                  <SelectItem value="false" className="text-xs">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={(config.insecure as boolean) || false}
              onCheckedChange={(checked) => onChange('insecure', checked)}
            />
            <Label className="text-xs">Skip TLS verification (insecure)</Label>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
