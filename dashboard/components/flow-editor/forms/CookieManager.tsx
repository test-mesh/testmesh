'use client';

import { useState } from 'react';
import {
  Cookie,
  Plus,
  Trash2,
  Copy,
  Download,
  Upload,
  Clock,
  Shield,
  Globe,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface CookieConfig {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: string; // ISO date string or relative time like "1h", "7d"
  maxAge?: number; // Seconds
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

interface CookieManagerProps {
  cookies: CookieConfig[];
  onChange: (cookies: CookieConfig[]) => void;
  className?: string;
}

const COOKIE_TEMPLATES = [
  {
    name: 'Session Cookie',
    cookies: [
      {
        name: 'sessionId',
        value: '${session_id}',
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax' as const,
      },
    ],
  },
  {
    name: 'Authentication Token',
    cookies: [
      {
        name: 'auth_token',
        value: '${auth_token}',
        domain: 'example.com',
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'Strict' as const,
        expires: '7d',
      },
    ],
  },
  {
    name: 'CSRF Token',
    cookies: [
      {
        name: 'XSRF-TOKEN',
        value: '${csrf_token}',
        path: '/',
        sameSite: 'Strict' as const,
      },
    ],
  },
  {
    name: 'Multi-Cookie Auth',
    cookies: [
      {
        name: 'access_token',
        value: '${access_token}',
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'Strict' as const,
        expires: '1h',
      },
      {
        name: 'refresh_token',
        value: '${refresh_token}',
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'Strict' as const,
        expires: '7d',
      },
    ],
  },
];

export default function CookieManager({
  cookies,
  onChange,
  className,
}: CookieManagerProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importText, setImportText] = useState('');

  const addCookie = () => {
    const newCookie: CookieConfig = {
      name: '',
      value: '',
      path: '/',
      sameSite: 'Lax',
    };
    onChange([...cookies, newCookie]);
    setEditingIndex(cookies.length);
  };

  const updateCookie = (index: number, updates: Partial<CookieConfig>) => {
    const updated = [...cookies];
    updated[index] = { ...updated[index], ...updates };
    onChange(updated);
  };

  const removeCookie = (index: number) => {
    onChange(cookies.filter((_, i) => i !== index));
    if (editingIndex === index) {
      setEditingIndex(null);
    }
  };

  const duplicateCookie = (index: number) => {
    const cookie = { ...cookies[index] };
    cookie.name = `${cookie.name}_copy`;
    onChange([...cookies, cookie]);
  };

  const applyTemplate = (templateCookies: CookieConfig[]) => {
    onChange([...cookies, ...templateCookies]);
  };

  const exportCookies = () => {
    const cookieStrings = cookies.map((c) => {
      let str = `${c.name}=${c.value}`;
      if (c.domain) str += `; Domain=${c.domain}`;
      if (c.path) str += `; Path=${c.path}`;
      if (c.expires) str += `; Expires=${c.expires}`;
      if (c.maxAge) str += `; Max-Age=${c.maxAge}`;
      if (c.secure) str += '; Secure';
      if (c.httpOnly) str += '; HttpOnly';
      if (c.sameSite) str += `; SameSite=${c.sameSite}`;
      return str;
    });

    const blob = new Blob([cookieStrings.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cookies.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCookies = () => {
    try {
      const lines = importText.split('\n').filter((l) => l.trim());
      const imported: CookieConfig[] = [];

      lines.forEach((line) => {
        const parts = line.split(';').map((p) => p.trim());
        const [nameValue, ...attributes] = parts;
        const [name, value] = nameValue.split('=');

        const cookie: CookieConfig = { name: name.trim(), value: value?.trim() || '' };

        attributes.forEach((attr) => {
          const [key, val] = attr.split('=').map((s) => s.trim());
          const lowerKey = key.toLowerCase();

          if (lowerKey === 'domain') cookie.domain = val;
          else if (lowerKey === 'path') cookie.path = val;
          else if (lowerKey === 'expires') cookie.expires = val;
          else if (lowerKey === 'max-age') cookie.maxAge = parseInt(val);
          else if (lowerKey === 'secure') cookie.secure = true;
          else if (lowerKey === 'httponly') cookie.httpOnly = true;
          else if (lowerKey === 'samesite') cookie.sameSite = val as any;
        });

        imported.push(cookie);
      });

      onChange([...cookies, ...imported]);
      setImportText('');
      setShowImportDialog(false);
    } catch (error) {
      console.error('Failed to import cookies:', error);
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between pb-2 border-b">
        <div className="flex items-center gap-2">
          <Cookie className="h-4 w-4 text-orange-500" />
          <span className="text-sm font-medium">Cookie Management</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImportDialog(true)}
            className="h-7 text-xs gap-1"
          >
            <Upload className="w-3 h-3" />
            Import
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCookies}
            disabled={cookies.length === 0}
            className="h-7 text-xs gap-1"
          >
            <Download className="w-3 h-3" />
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={addCookie}
            className="h-7 text-xs gap-1"
          >
            <Plus className="w-3 h-3" />
            Add Cookie
          </Button>
        </div>
      </div>

      {/* Cookie Templates */}
      {cookies.length === 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Start with a template or create a new cookie
          </p>
          <div className="grid grid-cols-2 gap-2">
            {COOKIE_TEMPLATES.map((template, idx) => (
              <button
                key={idx}
                onClick={() => applyTemplate(template.cookies)}
                className="p-3 border rounded-lg hover:border-primary transition-colors text-left group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Cookie className="w-4 h-4 text-orange-500" />
                  <span className="font-medium text-sm group-hover:text-primary transition-colors">
                    {template.name}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {template.cookies.length} cookie{template.cookies.length > 1 ? 's' : ''}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cookie List */}
      {cookies.length > 0 && (
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-3">
            {cookies.map((cookie, index) => (
              <div
                key={index}
                className={cn(
                  'p-3 border rounded-lg transition-colors',
                  editingIndex === index && 'border-primary bg-primary/5'
                )}
              >
                {editingIndex === index ? (
                  /* Editing Mode */
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-sm">Edit Cookie</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingIndex(null)}
                        className="h-6 text-xs"
                      >
                        Done
                      </Button>
                    </div>

                    {/* Name and Value */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Name *</Label>
                        <Input
                          value={cookie.name}
                          onChange={(e) => updateCookie(index, { name: e.target.value })}
                          placeholder="cookieName"
                          className="h-7 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Value *</Label>
                        <Input
                          value={cookie.value}
                          onChange={(e) => updateCookie(index, { value: e.target.value })}
                          placeholder="${variable} or value"
                          className="h-7 text-xs font-mono"
                        />
                      </div>
                    </div>

                    {/* Domain and Path */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          Domain
                        </Label>
                        <Input
                          value={cookie.domain || ''}
                          onChange={(e) => updateCookie(index, { domain: e.target.value })}
                          placeholder=".example.com"
                          className="h-7 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Path</Label>
                        <Input
                          value={cookie.path || ''}
                          onChange={(e) => updateCookie(index, { path: e.target.value })}
                          placeholder="/"
                          className="h-7 text-xs font-mono"
                        />
                      </div>
                    </div>

                    {/* Expiration */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Expires (Relative)
                        </Label>
                        <Input
                          value={cookie.expires || ''}
                          onChange={(e) => updateCookie(index, { expires: e.target.value })}
                          placeholder="1h, 7d, 30d"
                          className="h-7 text-xs font-mono"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          e.g., 1h, 7d, 30d, or ISO date
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Max-Age (Seconds)</Label>
                        <Input
                          type="number"
                          value={cookie.maxAge || ''}
                          onChange={(e) =>
                            updateCookie(index, {
                              maxAge: e.target.value ? parseInt(e.target.value) : undefined,
                            })
                          }
                          placeholder="3600"
                          className="h-7 text-xs font-mono"
                        />
                      </div>
                    </div>

                    {/* Security Flags */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
                        <div className="flex items-center gap-2">
                          <Shield className="w-3 h-3 text-blue-500" />
                          <Label className="text-xs">Secure (HTTPS only)</Label>
                        </div>
                        <Switch
                          checked={cookie.secure || false}
                          onCheckedChange={(checked) => updateCookie(index, { secure: checked })}
                        />
                      </div>

                      <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
                        <div className="flex items-center gap-2">
                          <Shield className="w-3 h-3 text-purple-500" />
                          <Label className="text-xs">HttpOnly (No JavaScript access)</Label>
                        </div>
                        <Switch
                          checked={cookie.httpOnly || false}
                          onCheckedChange={(checked) => updateCookie(index, { httpOnly: checked })}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">SameSite</Label>
                        <Select
                          value={cookie.sameSite || 'Lax'}
                          onValueChange={(v) => updateCookie(index, { sameSite: v as any })}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Strict" className="text-xs">
                              Strict (Same-site only)
                            </SelectItem>
                            <SelectItem value="Lax" className="text-xs">
                              Lax (Some cross-site)
                            </SelectItem>
                            <SelectItem value="None" className="text-xs">
                              None (All cross-site)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground">
                          CSRF protection level
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Display Mode */
                  <div>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-sm font-medium truncate">
                          {cookie.name}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground truncate">
                          {cookie.value}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingIndex(index)}
                          className="h-6 w-6 p-0"
                        >
                          <span className="sr-only">Edit</span>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => duplicateCookie(index)}
                          className="h-6 w-6 p-0"
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeCookie(index)}
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Cookie Details */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {cookie.domain && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 rounded">
                          {cookie.domain}
                        </span>
                      )}
                      {cookie.path && cookie.path !== '/' && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 rounded">
                          {cookie.path}
                        </span>
                      )}
                      {cookie.secure && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 rounded flex items-center gap-0.5">
                          <Shield className="w-2.5 h-2.5" />
                          Secure
                        </span>
                      )}
                      {cookie.httpOnly && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 rounded">
                          HttpOnly
                        </span>
                      )}
                      {cookie.sameSite && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 rounded">
                          {cookie.sameSite}
                        </span>
                      )}
                      {cookie.expires && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 rounded flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {cookie.expires}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Cookies</DialogTitle>
            <DialogDescription>
              Paste cookie strings in Set-Cookie header format (one per line)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="name=value; Domain=.example.com; Path=/; Secure; HttpOnly"
              rows={8}
              className="font-mono text-xs"
            />
            <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5" />
                <div className="text-xs text-blue-900 dark:text-blue-300">
                  <p className="font-medium mb-1">Format Example:</p>
                  <code className="text-[10px]">
                    sessionId=abc123; Domain=.example.com; Path=/; Secure; HttpOnly; SameSite=Lax
                  </code>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              Cancel
            </Button>
            <Button onClick={importCookies} disabled={!importText.trim()}>
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
