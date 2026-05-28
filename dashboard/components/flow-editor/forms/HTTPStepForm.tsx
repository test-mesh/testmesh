'use client';

import { useState } from 'react';
import {
  Globe,
  Plus,
  Trash2,
  FileJson,
  Code,
  ChevronDown,
  ChevronRight,
  Lock,
  Timer,
  Cookie,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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

type HTTPTab = 'params' | 'headers' | 'body' | 'auth' | 'ssl' | 'cookies';

export default function HTTPStepForm({
  config,
  onChange,
  variables = {},
  stepOutputs = {},
  className,
}: HTTPStepFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [bodyFormat, setBodyFormat] = useState<'json' | 'raw'>('json');

  const method = (config.method as string) || 'GET';
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);
  const [activeTab, setActiveTab] = useState<HTTPTab>(hasBody ? 'body' : 'headers');

  const headers: HeaderEntry[] = (() => {
    let h = config.headers as Record<string, string> | string | undefined;
    if (!h) return [];
    if (typeof h === 'string') {
      try { h = JSON.parse(h); } catch { return []; }
    }
    if (typeof h !== 'object' || Array.isArray(h)) return [];
    return Object.entries(h as Record<string, string>).map(([key, value]) => ({
      key, value, enabled: true,
    }));
  })();

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

  const updateHeaders = (newHeaders: HeaderEntry[]) => {
    const h: Record<string, string> = {};
    newHeaders.filter((e) => e.enabled && e.key).forEach((e) => { h[e.key] = e.value; });
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

  const updateUrlWithParams = (baseUrl: string, params: QueryParam[]) => {
    try {
      const placeholder = 'http://placeholder.test';
      let url = baseUrl || placeholder;
      if (!url.includes('://')) url = placeholder + url;

      const urlObj = new URL(url.replace(/\$\{[^}]+\}/g, 'VAR_PLACEHOLDER'));
      urlObj.search = '';
      params.filter((p) => p.enabled && p.key).forEach((p) => {
        urlObj.searchParams.append(p.key, p.value);
      });

      let result = urlObj.toString().replace(/VAR_PLACEHOLDER/g, (match, offset) => {
        const before = baseUrl.slice(0, offset);
        const matches = baseUrl.match(/\$\{[^}]+\}/g) || [];
        const idx = (before.match(/\$\{[^}]+\}/g) || []).length;
        return matches[idx] || match;
      });

      if (!baseUrl?.includes('://')) {
        result = result.replace(placeholder, '');
      }
      return result;
    } catch {
      return baseUrl;
    }
  };

  const cookieCount = ((config.cookies as CookieConfig[]) || []).length;

  const tabs: { id: HTTPTab; label: string; count?: number; icon?: React.ReactNode }[] = [
    { id: 'params', label: 'Params', count: queryParams.length > 0 ? queryParams.length : undefined },
    { id: 'headers', label: 'Headers', count: headers.length > 0 ? headers.length : undefined },
    ...(hasBody ? [{ id: 'body' as HTTPTab, label: 'Body' }] : []),
    { id: 'auth', label: 'Auth' },
    { id: 'ssl', label: 'SSL/TLS', icon: <Lock className="w-3 h-3" /> },
    { id: 'cookies', label: 'Cookies', icon: <Cookie className="w-3 h-3" />, count: cookieCount > 0 ? cookieCount : undefined },
  ];

  return (
    <div className={cn('space-y-4', className)}>
      <div className="space-y-2">
        <Label className="text-xs font-medium">Request</Label>
        <div className="flex gap-2">
          <Select value={method} onValueChange={(v) => onChange('method', v)}>
            <SelectTrigger
              className={cn(
                'h-9 w-24 font-mono font-medium text-xs',
                method === 'GET' && 'text-green-400',
                method === 'POST' && 'text-yellow-400',
                method === 'PUT' && 'text-blue-400',
                method === 'PATCH' && 'text-purple-400',
                method === 'DELETE' && 'text-red-400'
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

      {/* Tab bar */}
      <div className="flex gap-0.5 border-b border-[#1a2332]">
        {tabs.map(({ id, label, count, icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex items-center gap-1 px-3 h-8 text-xs font-medium border-b-2 transition-colors',
              activeTab === id
                ? 'border-teal-400 text-teal-400'
                : 'border-transparent text-[#4a6480] hover:text-[#7fa8c8]'
            )}
          >
            {icon}
            {label}
            {count !== undefined && (
              <span className="bg-[#1a2332] px-1 rounded text-[10px] text-[#7fa8c8]">{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Params */}
      {activeTab === 'params' && (
        <div className="space-y-3">
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
                <span className="text-[#4a6480]">=</span>
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
                <button
                  type="button"
                  onClick={() => {
                    const newParams = queryParams.filter((_, i) => i !== index);
                    setQueryParams(newParams);
                    onChange('url', updateUrlWithParams((config.url as string) || '', newParams));
                  }}
                  className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-red-400 hover:bg-[#1a2d3d] transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              const newParams = [...queryParams, { key: '', value: '', enabled: true }];
              setQueryParams(newParams);
            }}
            className="flex items-center gap-1 h-7 px-3 rounded border border-[#1e2d3d] bg-[#0f1923] text-xs text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add Parameter
          </button>
        </div>
      )}

      {/* Headers */}
      {activeTab === 'headers' && (
        <div className="space-y-3">
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
                <span className="text-[#4a6480]">:</span>
                <Input
                  value={header.value}
                  onChange={(e) => updateHeader(index, { value: e.target.value })}
                  placeholder="value"
                  className="h-7 text-xs font-mono flex-1"
                />
                <button
                  type="button"
                  onClick={() => removeHeader(index)}
                  className="flex items-center justify-center h-7 w-7 rounded text-[#4a6480] hover:text-red-400 hover:bg-[#1a2d3d] transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <datalist id="common-headers">
            {COMMON_HEADERS.map((h) => (
              <option key={h.key} value={h.key} />
            ))}
          </datalist>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={addHeader}
              className="flex items-center gap-1 h-7 px-3 rounded border border-[#1e2d3d] bg-[#0f1923] text-xs text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add Header
            </button>
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
        </div>
      )}

      {/* Body */}
      {activeTab === 'body' && hasBody && (
        <div className="space-y-3">
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

          <div className="border border-[#1e2d3d] rounded-lg overflow-hidden">
            <div className="flex border-b border-[#1e2d3d]">
              <button
                type="button"
                onClick={() => setBodyFormat('json')}
                className={cn(
                  'flex items-center gap-1 px-3 py-1.5 text-xs transition-colors',
                  bodyFormat === 'json'
                    ? 'bg-[#1a2332] text-[#c8dce8] font-medium'
                    : 'text-[#4a6480] hover:bg-[#0f1923] hover:text-[#7fa8c8]'
                )}
              >
                <FileJson className="w-3 h-3" />
                JSON
              </button>
              <button
                type="button"
                onClick={() => setBodyFormat('raw')}
                className={cn(
                  'flex items-center gap-1 px-3 py-1.5 text-xs transition-colors',
                  bodyFormat === 'raw'
                    ? 'bg-[#1a2332] text-[#c8dce8] font-medium'
                    : 'text-[#4a6480] hover:bg-[#0f1923] hover:text-[#7fa8c8]'
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
          <p className="text-[10px] text-[#4a6480]">
            Use {'${variable}'} syntax for dynamic values
          </p>
        </div>
      )}

      {/* Auth */}
      {activeTab === 'auth' && (
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
      )}

      {/* SSL/TLS */}
      {activeTab === 'ssl' && (
        <SSLTLSConfigPanel
          value={(config.ssl as SSLTLSConfig) || {}}
          onChange={(sslConfig) => onChange('ssl', sslConfig)}
        />
      )}

      {/* Cookies */}
      {activeTab === 'cookies' && (
        <CookieManager
          cookies={(config.cookies as CookieConfig[]) || []}
          onChange={(cookies) => onChange('cookies', cookies)}
        />
      )}

      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-[#4a6480] hover:text-[#7fa8c8] transition-colors">
          {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Advanced Options
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-3 pt-3 border-t border-[#1e2d3d]">
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
