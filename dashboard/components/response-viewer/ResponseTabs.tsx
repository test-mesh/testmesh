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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

// Get status badge color
function getStatusColor(status: number): 'default' | 'destructive' | 'secondary' {
  if (status >= 200 && status < 300) return 'default';
  if (status >= 400) return 'destructive';
  return 'secondary';
}

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// Check if body is JSON
function isJsonBody(body: any, contentType?: string): boolean {
  if (typeof body === 'object' && body !== null) return true;
  if (contentType?.includes('application/json')) return true;
  if (typeof body === 'string') {
    try {
      JSON.parse(body);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

// Parse body as JSON if possible
function parseJsonBody(body: any): any {
  if (typeof body === 'object' && body !== null) return body;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  return null;
}

export default function ResponseTabs({ response, className }: ResponseTabsProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [headerSearch, setHeaderSearch] = useState('');

  const contentType = response.headers['content-type'] || response.headers['Content-Type'] || '';
  const isJson = isJsonBody(response.body, contentType);
  const jsonBody = isJson ? parseJsonBody(response.body) || response.body : null;

  // Filter headers by search
  const filteredHeaders = useMemo(() => {
    if (!headerSearch) return Object.entries(response.headers);
    const query = headerSearch.toLowerCase();
    return Object.entries(response.headers).filter(
      ([key, value]) =>
        key.toLowerCase().includes(query) ||
        value.toLowerCase().includes(query)
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

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Status bar */}
      <div className="flex items-center gap-4 p-3 border-b bg-muted/30">
        <Badge variant={getStatusColor(response.status)} className="font-mono">
          {response.status} {response.statusText}
        </Badge>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          {response.time}ms
        </div>
        <div className="text-xs text-muted-foreground">
          {formatBytes(response.size)}
        </div>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleCopy(response.bodyText, 'body')}
          className="text-xs"
        >
          {copied === 'body' ? (
            <>
              <Check className="w-3 h-3 mr-1 text-green-500" />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 mr-1" />
              Copy
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDownload}
          className="text-xs"
        >
          <Download className="w-3 h-3 mr-1" />
          Download
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue={isJson ? 'pretty' : 'raw'} className="flex-1 flex flex-col">
        <TabsList className="justify-start px-3 border-b rounded-none bg-transparent">
          {isJson && (
            <TabsTrigger value="pretty" className="text-xs">
              <Code className="w-3 h-3 mr-1" />
              Pretty
            </TabsTrigger>
          )}
          <TabsTrigger value="raw" className="text-xs">
            <FileText className="w-3 h-3 mr-1" />
            Raw
          </TabsTrigger>
          <TabsTrigger value="headers" className="text-xs">
            <Globe className="w-3 h-3 mr-1" />
            Headers
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
              {Object.keys(response.headers).length}
            </Badge>
          </TabsTrigger>
          {response.cookies && Object.keys(response.cookies).length > 0 && (
            <TabsTrigger value="cookies" className="text-xs">
              <Cookie className="w-3 h-3 mr-1" />
              Cookies
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                {Object.keys(response.cookies).length}
              </Badge>
            </TabsTrigger>
          )}
        </TabsList>

        <div className="flex-1 overflow-hidden">
          {/* Pretty JSON view */}
          {isJson && (
            <TabsContent value="pretty" className="m-0 h-full">
              <JsonTreeView data={jsonBody} />
            </TabsContent>
          )}

          {/* Raw text view */}
          <TabsContent value="raw" className="m-0 h-full overflow-auto p-3">
            <pre className="text-sm font-mono whitespace-pre-wrap break-all">
              {response.bodyText}
            </pre>
          </TabsContent>

          {/* Headers view */}
          <TabsContent value="headers" className="m-0 h-full flex flex-col">
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={headerSearch}
                  onChange={(e) => setHeaderSearch(e.target.value)}
                  placeholder="Search headers..."
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>
            <div className="flex-1 overflow-auto p-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium text-muted-foreground">Header</th>
                    <th className="text-left p-2 font-medium text-muted-foreground">Value</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHeaders.map(([key, value]) => (
                    <tr key={key} className="border-b group hover:bg-muted/50">
                      <td className="p-2 font-mono text-foreground/80">{key}</td>
                      <td className="p-2 font-mono text-foreground/60 break-all">{value}</td>
                      <td className="p-2">
                        <button
                          onClick={() => handleCopy(value, key)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted"
                        >
                          {copied === key ? (
                            <Check className="w-3 h-3 text-green-500" />
                          ) : (
                            <Copy className="w-3 h-3 text-muted-foreground" />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredHeaders.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No headers match your search
                </div>
              )}
            </div>
          </TabsContent>

          {/* Cookies view */}
          {response.cookies && (
            <TabsContent value="cookies" className="m-0 h-full overflow-auto p-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium text-muted-foreground">Cookie</th>
                    <th className="text-left p-2 font-medium text-muted-foreground">Value</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(response.cookies).map(([key, value]) => (
                    <tr key={key} className="border-b group hover:bg-muted/50">
                      <td className="p-2 font-mono text-foreground/80">{key}</td>
                      <td className="p-2 font-mono text-foreground/60 break-all">{value}</td>
                      <td className="p-2">
                        <button
                          onClick={() => handleCopy(value, `cookie-${key}`)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted"
                        >
                          {copied === `cookie-${key}` ? (
                            <Check className="w-3 h-3 text-green-500" />
                          ) : (
                            <Copy className="w-3 h-3 text-muted-foreground" />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabsContent>
          )}
        </div>
      </Tabs>
    </div>
  );
}
