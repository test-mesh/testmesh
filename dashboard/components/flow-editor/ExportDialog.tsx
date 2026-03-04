'use client';

import { useState } from 'react';
import {
  Download,
  FileCode,
  FileJson,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import type { FlowDefinition } from '@/lib/api/types';
import { flowDefinitionToYaml } from './utils';

interface ExportDialogProps {
  definition: FlowDefinition;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type ExportFormat = 'yaml' | 'json' | 'json-pretty' | 'curl' | 'postman';

export default function ExportDialog({
  definition,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: ExportDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('yaml');
  const [includeComments, setIncludeComments] = useState(true);
  const [copied, setCopied] = useState(false);

  // Use controlled or uncontrolled state
  const open = controlledOpen !== undefined ? controlledOpen : isOpen;
  const setOpen = onOpenChange || setIsOpen;

  // Generate export content based on format
  const getExportContent = (): string => {
    switch (format) {
      case 'yaml':
        return flowDefinitionToYaml(definition);

      case 'json':
        return JSON.stringify(definition);

      case 'json-pretty':
        return JSON.stringify(definition, null, 2);

      case 'curl':
        return generateCurlCommands(definition);

      case 'postman':
        return generatePostmanCollection(definition);

      default:
        return '';
    }
  };

  const exportContent = getExportContent();

  // Get file extension based on format
  const getFileExtension = (): string => {
    switch (format) {
      case 'yaml':
        return 'yaml';
      case 'json':
      case 'json-pretty':
        return 'json';
      case 'curl':
        return 'sh';
      case 'postman':
        return 'json';
      default:
        return 'txt';
    }
  };

  // Handle copy to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  // Handle download
  const handleDownload = () => {
    const blob = new Blob([exportContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${definition.name || 'flow'}.${getFileExtension()}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <Download className="w-4 h-4" />
            Export
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Export Flow
          </DialogTitle>
          <DialogDescription>
            Export your flow in various formats for sharing, version control, or integration
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {/* Format Selection */}
          <div className="space-y-2">
            <Label htmlFor="export-format">Export Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
              <SelectTrigger id="export-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yaml">
                  <div className="flex items-center gap-2">
                    <FileCode className="w-4 h-4" />
                    <div>
                      <div className="font-medium">YAML</div>
                      <div className="text-xs text-muted-foreground">
                        Human-readable format (recommended)
                      </div>
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="json-pretty">
                  <div className="flex items-center gap-2">
                    <FileJson className="w-4 h-4" />
                    <div>
                      <div className="font-medium">JSON (Pretty)</div>
                      <div className="text-xs text-muted-foreground">
                        Formatted JSON with indentation
                      </div>
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="json">
                  <div className="flex items-center gap-2">
                    <FileJson className="w-4 h-4" />
                    <div>
                      <div className="font-medium">JSON (Compact)</div>
                      <div className="text-xs text-muted-foreground">
                        Minified JSON for APIs
                      </div>
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="curl">
                  <div className="flex items-center gap-2">
                    <FileCode className="w-4 h-4" />
                    <div>
                      <div className="font-medium">cURL Commands</div>
                      <div className="text-xs text-muted-foreground">
                        Shell commands for HTTP requests
                      </div>
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="postman">
                  <div className="flex items-center gap-2">
                    <ExternalLink className="w-4 h-4" />
                    <div>
                      <div className="font-medium">Postman Collection</div>
                      <div className="text-xs text-muted-foreground">
                        Import into Postman
                      </div>
                    </div>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Options */}
          {format === 'yaml' && (
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-0.5">
                <Label htmlFor="include-comments">Include Comments</Label>
                <p className="text-xs text-muted-foreground">
                  Add helpful comments to explain each step
                </p>
              </div>
              <Switch
                id="include-comments"
                checked={includeComments}
                onCheckedChange={setIncludeComments}
              />
            </div>
          )}

          {/* Preview */}
          <div className="flex-1 flex flex-col min-h-0">
            <Label htmlFor="export-preview" className="mb-2">
              Preview
            </Label>
            <Textarea
              id="export-preview"
              value={exportContent}
              readOnly
              className="flex-1 font-mono text-xs resize-none"
            />
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{exportContent.split('\n').length} lines</span>
            <span>{exportContent.length} characters</span>
            <span>
              {(new Blob([exportContent]).size / 1024).toFixed(2)} KB
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button variant="outline" onClick={handleCopy} className="gap-2">
            {copied ? (
              <>
                <Check className="w-4 h-4 text-green-500" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy
              </>
            )}
          </Button>
          <Button onClick={handleDownload} className="gap-2">
            <Download className="w-4 h-4" />
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Generate cURL commands for HTTP requests in the flow
 */
function generateCurlCommands(definition: FlowDefinition): string {
  const commands: string[] = [];

  commands.push(`#!/bin/bash`);
  commands.push(`# cURL commands for: ${definition.name}`);
  commands.push('');

  const allSteps = [
    ...(definition.setup || []),
    ...(definition.steps || []),
    ...(definition.teardown || []),
  ];

  const httpSteps = allSteps.filter((step) => step.action === 'http_request');

  if (httpSteps.length === 0) {
    commands.push('# No HTTP requests found in this flow');
    return commands.join('\n');
  }

  httpSteps.forEach((step, index) => {
    const config = step.config;
    const method = config.method || 'GET';
    const url = config.url || 'http://example.com';

    commands.push(`# Step ${index + 1}: ${step.name || step.id}`);

    let curlCmd = `curl -X ${method}`;

    // Add headers
    if (config.headers && typeof config.headers === 'object') {
      Object.entries(config.headers).forEach(([key, value]) => {
        curlCmd += ` \\\n  -H "${key}: ${value}"`;
      });
    }

    // Add body
    if (config.body && method !== 'GET' && method !== 'HEAD') {
      const bodyStr =
        typeof config.body === 'string'
          ? config.body
          : JSON.stringify(config.body);
      curlCmd += ` \\\n  -d '${bodyStr}'`;
    }

    // Add URL
    curlCmd += ` \\\n  "${url}"`;

    commands.push(curlCmd);
    commands.push('');
  });

  return commands.join('\n');
}

/**
 * Generate Postman collection from flow
 */
function generatePostmanCollection(definition: FlowDefinition): string {
  const collection = {
    info: {
      name: definition.name,
      description: definition.description || '',
      schema:
        'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: [] as any[],
  };

  const allSteps = [
    ...(definition.setup || []),
    ...(definition.steps || []),
    ...(definition.teardown || []),
  ];

  const httpSteps = allSteps.filter((step) => step.action === 'http_request');

  httpSteps.forEach((step) => {
    const config = step.config;

    const request: any = {
      method: config.method || 'GET',
      header: [],
      url: {
        raw: config.url || '',
        host: [config.url || ''],
      },
    };

    // Add headers
    if (config.headers && typeof config.headers === 'object') {
      Object.entries(config.headers).forEach(([key, value]) => {
        request.header.push({
          key,
          value: String(value),
          type: 'text',
        });
      });
    }

    // Add body
    if (config.body && config.method !== 'GET') {
      request.body = {
        mode: 'raw',
        raw:
          typeof config.body === 'string'
            ? config.body
            : JSON.stringify(config.body, null, 2),
        options: {
          raw: {
            language: 'json',
          },
        },
      };
    }

    collection.item.push({
      name: step.name || step.id || 'HTTP Request',
      request,
    });
  });

  return JSON.stringify(collection, null, 2);
}
