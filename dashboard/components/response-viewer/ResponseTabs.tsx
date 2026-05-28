'use client';

import { useState, useMemo } from 'react';
import {
  Copy,
  Check,
  Download,
  Clock,
  FileText,
  Code,
  Globe,
  Cookie,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import JsonTreeView from './JsonTreeView';

interface ResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: any;
  bodyText: string;
  size: number;
  time: number;
  cookies?: Record<string, string>;
}

interface ResponseTabsProps {
  response: ResponseData;
  className?: string;
}

function getStatusClasses(status: number): string {
  if (status >= 200 && status < 300) return 'bg-teal-400/10 text-teal-400 border border-teal-400/30';
  if (status >= 400) return 'bg-red-400/10 text-red-400 border border-red-400/30';
  return 'bg-[#1a2d3d] text-[#7fa8c8] border border-[#1e2d3d]';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function isJsonBody(body: any, contentType?: string): boolean {
  if (typeof body === 'object' && body !== null) return true;
  if (contentType?.includes('application/json')) return true;
  if (typeof body === 'string') {
    try { JSON.parse(body); return true; } catch { return false; }
  }
  return false;
}

function parseJsonBody(body: any): any {
  if (typeof body === 'object' && body !== null) return body;
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return null; }
  }
  return null;
}

type Tab = 'pretty' | 'raw' | 'headers' | 'cookies';

export default function ResponseTabs({ response, className }: ResponseTabsProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [headerSearch, setHeaderSearch] = useState('');

  const contentType = response.headers['content-type'] || response.headers['Content-Type'] || '';
  const isJson = isJsonBody(response.body, contentType);
  const jsonBody = isJson ? parseJsonBody(response.body) || response.body : null;

  const [tab, setTab] = useState<Tab>(isJson ? 'pretty' : 'raw');

  const filteredHeaders = useMemo(() => {
    if (!headerSearch) return Object.entries(response.headers);
    const query = headerSearch.toLowerCase();
    return Object.entries(response.headers).filter(
      ([key, value]) => key.toLowerCase().includes(query) || value.toLowerCase().includes(query)
    );
  }, [response.headers, headerSearch]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([response.bodyText], { type: contentType || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `response.${isJson ? 'json' : 'txt'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasCookies = response.cookies && Object.keys(response.cookies).length > 0;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Status bar */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[#1a2332] bg-[#0b0f18]">
        <span className={cn('text-[10px] font-mono font-semibold px-2 py-0.5 rounded', getStatusClasses(response.status))}>
          {response.status} {response.statusText}
        </span>
        <div className="flex items-center gap-1 text-[10px] text-[#4a6480]">
          <Clock className="w-3 h-3" />
          {response.time}ms
        </div>
        <div className="text-[10px] text-[#4a6480]">{formatBytes(response.size)}</div>
        <div className="flex-1" />
        <button
          onClick={() => handleCopy(response.bodyText, 'body')}
          className="flex items-center gap-1 h-6 px-2 rounded text-[10px] text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
        >
          {copied === 'body' ? <Check className="w-3 h-3 text-teal-400" /> : <Copy className="w-3 h-3" />}
          {copied === 'body' ? 'Copied' : 'Copy'}
        </button>
        <button
          onClick={handleDownload}
          className="flex items-center gap-1 h-6 px-2 rounded text-[10px] text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
        >
          <Download className="w-3 h-3" />
          Download
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[#1a2332]">
        {isJson && (
          <button
            onClick={() => setTab('pretty')}
            className={cn(
              'flex items-center gap-1 h-6 px-2.5 rounded text-[10px] transition-colors',
              tab === 'pretty' ? 'bg-teal-400/15 text-teal-400' : 'text-[#4a6480] hover:text-[#7fa8c8]'
            )}
          >
            <Code className="w-3 h-3" />
            Pretty
          </button>
        )}
        <button
          onClick={() => setTab('raw')}
          className={cn(
            'flex items-center gap-1 h-6 px-2.5 rounded text-[10px] transition-colors',
            tab === 'raw' ? 'bg-teal-400/15 text-teal-400' : 'text-[#4a6480] hover:text-[#7fa8c8]'
          )}
        >
          <FileText className="w-3 h-3" />
          Raw
        </button>
        <button
          onClick={() => setTab('headers')}
          className={cn(
            'flex items-center gap-1.5 h-6 px-2.5 rounded text-[10px] transition-colors',
            tab === 'headers' ? 'bg-teal-400/15 text-teal-400' : 'text-[#4a6480] hover:text-[#7fa8c8]'
          )}
        >
          <Globe className="w-3 h-3" />
          Headers
          <span className="text-[9px] px-1 rounded bg-[#1a2d3d] text-[#4a6480]">
            {Object.keys(response.headers).length}
          </span>
        </button>
        {hasCookies && (
          <button
            onClick={() => setTab('cookies')}
            className={cn(
              'flex items-center gap-1.5 h-6 px-2.5 rounded text-[10px] transition-colors',
              tab === 'cookies' ? 'bg-teal-400/15 text-teal-400' : 'text-[#4a6480] hover:text-[#7fa8c8]'
            )}
          >
            <Cookie className="w-3 h-3" />
            Cookies
            <span className="text-[9px] px-1 rounded bg-[#1a2d3d] text-[#4a6480]">
              {Object.keys(response.cookies!).length}
            </span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === 'pretty' && isJson && <JsonTreeView data={jsonBody} />}

        {tab === 'raw' && (
          <div className="h-full overflow-auto p-3">
            <pre className="text-xs font-mono whitespace-pre-wrap break-all text-[#7fa8c8]">
              {response.bodyText}
            </pre>
          </div>
        )}

        {tab === 'headers' && (
          <div className="h-full flex flex-col">
            <div className="p-2 border-b border-[#1a2332]">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#3d5670]" />
                <Input
                  value={headerSearch}
                  onChange={(e) => setHeaderSearch(e.target.value)}
                  placeholder="Search headers..."
                  className="pl-7 h-7 text-xs"
                />
              </div>
            </div>
            <div className="flex-1 overflow-auto p-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1a2332]">
                    <th className="text-left p-2 text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">Header</th>
                    <th className="text-left p-2 text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">Value</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {filteredHeaders.map(([key, value]) => (
                    <tr key={key} className="border-b border-[#1a2332] group hover:bg-[#131b26] transition-colors">
                      <td className="p-2 font-mono text-[#7fa8c8]">{key}</td>
                      <td className="p-2 font-mono text-[#4a6480] break-all">{value}</td>
                      <td className="p-2">
                        <button
                          onClick={() => handleCopy(value, key)}
                          className="opacity-0 group-hover:opacity-100 flex items-center justify-center h-5 w-5 rounded hover:bg-[#1a2d3d] transition-colors"
                        >
                          {copied === key ? <Check className="w-3 h-3 text-teal-400" /> : <Copy className="w-3 h-3 text-[#4a6480]" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredHeaders.length === 0 && (
                <div className="text-center py-8 text-xs text-[#3d5670]">No headers match your search</div>
              )}
            </div>
          </div>
        )}

        {tab === 'cookies' && response.cookies && (
          <div className="h-full overflow-auto p-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1a2332]">
                  <th className="text-left p-2 text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">Cookie</th>
                  <th className="text-left p-2 text-[10px] font-semibold text-[#3d5670] uppercase tracking-wider">Value</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {Object.entries(response.cookies).map(([key, value]) => (
                  <tr key={key} className="border-b border-[#1a2332] group hover:bg-[#131b26] transition-colors">
                    <td className="p-2 font-mono text-[#7fa8c8]">{key}</td>
                    <td className="p-2 font-mono text-[#4a6480] break-all">{value}</td>
                    <td className="p-2">
                      <button
                        onClick={() => handleCopy(value, `cookie-${key}`)}
                        className="opacity-0 group-hover:opacity-100 flex items-center justify-center h-5 w-5 rounded hover:bg-[#1a2d3d] transition-colors"
                      >
                        {copied === `cookie-${key}` ? <Check className="w-3 h-3 text-teal-400" /> : <Copy className="w-3 h-3 text-[#4a6480]" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
