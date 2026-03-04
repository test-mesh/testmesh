'use client';

import { useState, useMemo } from 'react';
import {
  Terminal,
  Copy,
  Check,
  Code,
  FileCode2,
  Braces,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';

interface HTTPRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  auth?: {
    type: 'bearer' | 'basic' | 'api_key';
    token?: string;
    username?: string;
    password?: string;
    key?: string;
    value?: string;
  };
}

interface CurlGeneratorProps {
  request: HTTPRequest;
  className?: string;
}

type Language = 'curl' | 'python' | 'javascript' | 'go';

export default function CurlGenerator({ request, className }: CurlGeneratorProps) {
  const [copied, setCopied] = useState(false);
  const [language, setLanguage] = useState<Language>('curl');
  const [options, setOptions] = useState({
    verbose: false,
    insecure: false,
    compressed: true,
    includeAuth: true,
  });

  const handleCopy = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const curlCommand = useMemo(() => {
    const parts: string[] = ['curl'];

    if (options.verbose) parts.push('-v');
    if (options.insecure) parts.push('-k');
    if (options.compressed) parts.push('--compressed');

    // Method
    if (request.method !== 'GET') {
      parts.push(`-X ${request.method}`);
    }

    // Headers
    const headers = { ...request.headers };

    // Add auth header
    if (options.includeAuth && request.auth) {
      if (request.auth.type === 'bearer' && request.auth.token) {
        headers['Authorization'] = `Bearer ${request.auth.token}`;
      } else if (request.auth.type === 'basic' && request.auth.username) {
        const credentials = btoa(`${request.auth.username}:${request.auth.password || ''}`);
        headers['Authorization'] = `Basic ${credentials}`;
      } else if (request.auth.type === 'api_key' && request.auth.key) {
        headers[request.auth.key] = request.auth.value || '';
      }
    }

    Object.entries(headers).forEach(([key, value]) => {
      parts.push(`-H '${key}: ${value}'`);
    });

    // Body
    if (request.body) {
      const bodyStr = typeof request.body === 'object'
        ? JSON.stringify(request.body)
        : String(request.body);
      parts.push(`-d '${bodyStr.replace(/'/g, "\\'")}'`);
    }

    // URL
    parts.push(`'${request.url}'`);

    return parts.join(' \\\n  ');
  }, [request, options]);

  const pythonCode = useMemo(() => {
    const lines: string[] = ['import requests', ''];

    // URL
    lines.push(`url = "${request.url}"`);

    // Headers
    if (request.headers && Object.keys(request.headers).length > 0) {
      lines.push('');
      lines.push('headers = {');
      Object.entries(request.headers).forEach(([key, value]) => {
        lines.push(`    "${key}": "${value}",`);
      });
      lines.push('}');
    }

    // Body
    if (request.body) {
      lines.push('');
      if (typeof request.body === 'object') {
        lines.push('json_data = ' + JSON.stringify(request.body, null, 4).replace(/\n/g, '\n'));
      } else {
        lines.push(`data = """${request.body}"""`);
      }
    }

    // Auth
    let authArg = '';
    if (options.includeAuth && request.auth) {
      if (request.auth.type === 'basic') {
        authArg = `, auth=("${request.auth.username}", "${request.auth.password}")`;
      }
    }

    // Request
    lines.push('');
    const method = request.method.toLowerCase();
    let args = ['url'];
    if (request.headers && Object.keys(request.headers).length > 0) {
      args.push('headers=headers');
    }
    if (request.body) {
      if (typeof request.body === 'object') {
        args.push('json=json_data');
      } else {
        args.push('data=data');
      }
    }

    lines.push(`response = requests.${method}(${args.join(', ')}${authArg})`);
    lines.push('');
    lines.push('print(response.status_code)');
    lines.push('print(response.json())');

    return lines.join('\n');
  }, [request, options]);

  const javascriptCode = useMemo(() => {
    const lines: string[] = [];

    // Options
    lines.push('const options = {');
    lines.push(`  method: '${request.method}',`);

    if (request.headers && Object.keys(request.headers).length > 0) {
      lines.push('  headers: {');
      Object.entries(request.headers).forEach(([key, value]) => {
        lines.push(`    '${key}': '${value}',`);
      });
      lines.push('  },');
    }

    if (request.body) {
      const bodyStr = typeof request.body === 'object'
        ? JSON.stringify(request.body)
        : String(request.body);
      lines.push(`  body: JSON.stringify(${bodyStr}),`);
    }

    lines.push('};');
    lines.push('');

    // Fetch
    lines.push(`fetch('${request.url}', options)`);
    lines.push('  .then(response => response.json())');
    lines.push('  .then(data => console.log(data))');
    lines.push("  .catch(error => console.error('Error:', error));");

    return lines.join('\n');
  }, [request]);

  const goCode = useMemo(() => {
    const lines: string[] = [
      'package main',
      '',
      'import (',
      '\t"fmt"',
      '\t"io"',
      '\t"net/http"',
    ];

    if (request.body) {
      lines.push('\t"strings"');
    }

    lines.push(')');
    lines.push('');
    lines.push('func main() {');

    // Body
    if (request.body) {
      const bodyStr = typeof request.body === 'object'
        ? JSON.stringify(request.body)
        : String(request.body);
      lines.push(`\tbody := strings.NewReader(\`${bodyStr}\`)`);
      lines.push(`\treq, _ := http.NewRequest("${request.method}", "${request.url}", body)`);
    } else {
      lines.push(`\treq, _ := http.NewRequest("${request.method}", "${request.url}", nil)`);
    }

    // Headers
    if (request.headers) {
      Object.entries(request.headers).forEach(([key, value]) => {
        lines.push(`\treq.Header.Set("${key}", "${value}")`);
      });
    }

    lines.push('');
    lines.push('\tclient := &http.Client{}');
    lines.push('\tresp, _ := client.Do(req)');
    lines.push('\tdefer resp.Body.Close()');
    lines.push('');
    lines.push('\tbody, _ := io.ReadAll(resp.Body)');
    lines.push('\tfmt.Println(string(body))');
    lines.push('}');

    return lines.join('\n');
  }, [request]);

  const getCode = (lang: Language): string => {
    switch (lang) {
      case 'curl':
        return curlCommand;
      case 'python':
        return pythonCode;
      case 'javascript':
        return javascriptCode;
      case 'go':
        return goCode;
      default:
        return curlCommand;
    }
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Language Tabs */}
      <Tabs value={language} onValueChange={(v) => setLanguage(v as Language)} className="flex-1 flex flex-col">
        <div className="flex items-center justify-between border-b px-2">
          <TabsList className="h-9 bg-transparent">
            <TabsTrigger value="curl" className="text-xs h-7 data-[state=active]:bg-muted">
              <Terminal className="w-3 h-3 mr-1" />
              cURL
            </TabsTrigger>
            <TabsTrigger value="python" className="text-xs h-7 data-[state=active]:bg-muted">
              <Code className="w-3 h-3 mr-1" />
              Python
            </TabsTrigger>
            <TabsTrigger value="javascript" className="text-xs h-7 data-[state=active]:bg-muted">
              <FileCode2 className="w-3 h-3 mr-1" />
              JavaScript
            </TabsTrigger>
            <TabsTrigger value="go" className="text-xs h-7 data-[state=active]:bg-muted">
              <Braces className="w-3 h-3 mr-1" />
              Go
            </TabsTrigger>
          </TabsList>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleCopy(getCode(language))}
            className="h-7"
          >
            {copied ? (
              <Check className="w-3 h-3 mr-1 text-green-500" />
            ) : (
              <Copy className="w-3 h-3 mr-1" />
            )}
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>

        {/* Options (curl only) */}
        {language === 'curl' && (
          <div className="flex items-center gap-4 px-3 py-2 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Switch
                id="verbose"
                checked={options.verbose}
                onCheckedChange={(checked) => setOptions((o) => ({ ...o, verbose: checked }))}
              />
              <Label htmlFor="verbose" className="text-xs">Verbose (-v)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="compressed"
                checked={options.compressed}
                onCheckedChange={(checked) => setOptions((o) => ({ ...o, compressed: checked }))}
              />
              <Label htmlFor="compressed" className="text-xs">Compressed</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="insecure"
                checked={options.insecure}
                onCheckedChange={(checked) => setOptions((o) => ({ ...o, insecure: checked }))}
              />
              <Label htmlFor="insecure" className="text-xs">Insecure (-k)</Label>
            </div>
          </div>
        )}

        {/* Code Display */}
        <ScrollArea className="flex-1">
          <div className="p-4">
            <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/50 p-4 rounded-lg overflow-x-auto">
              {getCode(language)}
            </pre>
          </div>
        </ScrollArea>
      </Tabs>

      {/* Request Summary */}
      <div className="p-2 border-t bg-muted/30 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="font-medium">{request.method}</span>
          <span className="truncate flex-1">{request.url}</span>
        </div>
      </div>
    </div>
  );
}
