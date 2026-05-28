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

const TABS: { value: Language; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'curl', label: 'cURL', icon: Terminal },
  { value: 'python', label: 'Python', icon: Code },
  { value: 'javascript', label: 'JavaScript', icon: FileCode2 },
  { value: 'go', label: 'Go', icon: Braces },
];

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
    if (request.method !== 'GET') parts.push(`-X ${request.method}`);

    const headers = { ...request.headers };
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
    Object.entries(headers).forEach(([key, value]) => parts.push(`-H '${key}: ${value}'`));
    if (request.body) {
      const bodyStr = typeof request.body === 'object' ? JSON.stringify(request.body) : String(request.body);
      parts.push(`-d '${bodyStr.replace(/'/g, "\\'")}'`);
    }
    parts.push(`'${request.url}'`);
    return parts.join(' \\\n  ');
  }, [request, options]);

  const pythonCode = useMemo(() => {
    const lines: string[] = ['import requests', '', `url = "${request.url}"`];
    if (request.headers && Object.keys(request.headers).length > 0) {
      lines.push('', 'headers = {');
      Object.entries(request.headers).forEach(([key, value]) => lines.push(`    "${key}": "${value}",`));
      lines.push('}');
    }
    if (request.body) {
      lines.push('');
      if (typeof request.body === 'object') {
        lines.push('json_data = ' + JSON.stringify(request.body, null, 4));
      } else {
        lines.push(`data = """${request.body}"""`);
      }
    }
    let authArg = '';
    if (options.includeAuth && request.auth?.type === 'basic') {
      authArg = `, auth=("${request.auth.username}", "${request.auth.password}")`;
    }
    lines.push('');
    const method = request.method.toLowerCase();
    const args = ['url'];
    if (request.headers && Object.keys(request.headers).length > 0) args.push('headers=headers');
    if (request.body) args.push(typeof request.body === 'object' ? 'json=json_data' : 'data=data');
    lines.push(`response = requests.${method}(${args.join(', ')}${authArg})`);
    lines.push('', 'print(response.status_code)', 'print(response.json())');
    return lines.join('\n');
  }, [request, options]);

  const javascriptCode = useMemo(() => {
    const lines: string[] = ['const options = {', `  method: '${request.method}',`];
    if (request.headers && Object.keys(request.headers).length > 0) {
      lines.push('  headers: {');
      Object.entries(request.headers).forEach(([key, value]) => lines.push(`    '${key}': '${value}',`));
      lines.push('  },');
    }
    if (request.body) {
      const bodyStr = typeof request.body === 'object' ? JSON.stringify(request.body) : String(request.body);
      lines.push(`  body: JSON.stringify(${bodyStr}),`);
    }
    lines.push('};', '', `fetch('${request.url}', options)`, '  .then(response => response.json())', '  .then(data => console.log(data))', "  .catch(error => console.error('Error:', error));");
    return lines.join('\n');
  }, [request]);

  const goCode = useMemo(() => {
    const lines: string[] = ['package main', '', 'import (', '\t"fmt"', '\t"io"', '\t"net/http"'];
    if (request.body) lines.push('\t"strings"');
    lines.push(')', '', 'func main() {');
    if (request.body) {
      const bodyStr = typeof request.body === 'object' ? JSON.stringify(request.body) : String(request.body);
      lines.push(`\tbody := strings.NewReader(\`${bodyStr}\`)`);
      lines.push(`\treq, _ := http.NewRequest("${request.method}", "${request.url}", body)`);
    } else {
      lines.push(`\treq, _ := http.NewRequest("${request.method}", "${request.url}", nil)`);
    }
    if (request.headers) {
      Object.entries(request.headers).forEach(([key, value]) => lines.push(`\treq.Header.Set("${key}", "${value}")`));
    }
    lines.push('', '\tclient := &http.Client{}', '\tresp, _ := client.Do(req)', '\tdefer resp.Body.Close()', '', '\tbody, _ := io.ReadAll(resp.Body)', '\tfmt.Println(string(body))', '}');
    return lines.join('\n');
  }, [request]);

  const getCode = (lang: Language): string => {
    switch (lang) {
      case 'python': return pythonCode;
      case 'javascript': return javascriptCode;
      case 'go': return goCode;
      default: return curlCommand;
    }
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Language tab bar + copy */}
      <div className="flex items-center justify-between border-b border-[#1a2332] px-2">
        <div className="flex items-center gap-0.5 py-1">
          {TABS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setLanguage(value)}
              className={cn(
                'flex items-center gap-1 h-7 px-2.5 rounded text-[11px] transition-colors',
                language === value ? 'bg-teal-400/15 text-teal-400' : 'text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d]'
              )}
            >
              <Icon className="w-3 h-3" />
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => handleCopy(getCode(language))}
          className="flex items-center gap-1 h-7 px-2.5 rounded text-[11px] text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-teal-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Options (curl only) */}
      {language === 'curl' && (
        <div className="flex items-center gap-4 px-3 py-2 border-b border-[#1a2332] bg-[#0f1923]">
          {[
            { id: 'verbose', label: 'Verbose (-v)', key: 'verbose' as const },
            { id: 'compressed', label: 'Compressed', key: 'compressed' as const },
            { id: 'insecure', label: 'Insecure (-k)', key: 'insecure' as const },
          ].map(({ id, label, key }) => (
            <div key={id} className="flex items-center gap-2">
              <Switch
                id={id}
                checked={options[key]}
                onCheckedChange={(checked) => setOptions((o) => ({ ...o, [key]: checked }))}
              />
              <Label htmlFor={id} className="text-xs text-[#4a6480]">{label}</Label>
            </div>
          ))}
        </div>
      )}

      {/* Code Display */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          <pre className="text-xs font-mono whitespace-pre-wrap bg-[#0b0f18] border border-[#1e2d3d] p-4 rounded-lg overflow-x-auto text-[#7fa8c8]">
            {getCode(language)}
          </pre>
        </div>
      </ScrollArea>

      {/* Request Summary */}
      <div className="px-3 py-2 border-t border-[#1a2332] bg-[#0f1923]">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-teal-400">{request.method}</span>
          <span className="truncate flex-1 text-[#4a6480]">{request.url}</span>
        </div>
      </div>
    </div>
  );
}
