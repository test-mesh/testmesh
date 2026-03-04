'use client';

import { useState } from 'react';
import {
  MessageSquare,
  Send,
  Download,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Key,
  FileJson,
  Clock,
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

interface KafkaStepFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  variables?: Record<string, string>;
  stepOutputs?: Record<string, Record<string, unknown>>;
  className?: string;
}

interface KafkaHeader {
  key: string;
  value: string;
}

export default function KafkaStepForm({
  config,
  onChange,
  variables = {},
  stepOutputs = {},
  className,
}: KafkaStepFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const action = (config.action as string) || 'produce';

  // Parse headers
  const headers: KafkaHeader[] = (() => {
    const h = config.headers as Record<string, string> | undefined;
    if (!h) return [];
    return Object.entries(h).map(([key, value]) => ({ key, value }));
  })();

  const updateHeaders = (newHeaders: KafkaHeader[]) => {
    const h: Record<string, string> = {};
    newHeaders.filter((e) => e.key).forEach((e) => {
      h[e.key] = e.value;
    });
    onChange('headers', h);
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Action Type */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">Action</Label>
        <div className="flex gap-2">
          <Button
            variant={action === 'produce' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onChange('action', 'produce')}
            className="flex-1 h-9"
          >
            <Send className="w-4 h-4 mr-2" />
            Produce
          </Button>
          <Button
            variant={action === 'consume' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onChange('action', 'consume')}
            className="flex-1 h-9"
          >
            <Download className="w-4 h-4 mr-2" />
            Consume
          </Button>
        </div>
      </div>

      {/* Connection */}
      <div className="space-y-3">
        <Label className="text-xs font-medium">Connection</Label>
        <div className="space-y-2">
          <VariablePicker
            value={(config.brokers as string) || ''}
            onChange={(v) => onChange('brokers', v)}
            placeholder="localhost:9092"
            variables={variables}
            stepOutputs={stepOutputs}
          />
          <p className="text-[10px] text-muted-foreground">
            Comma-separated broker addresses
          </p>
        </div>
      </div>

      {/* Topic */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">Topic</Label>
        <VariablePicker
          value={(config.topic as string) || ''}
          onChange={(v) => onChange('topic', v)}
          placeholder="my-topic"
          variables={variables}
          stepOutputs={stepOutputs}
        />
      </div>

      {/* Produce-specific options */}
      {action === 'produce' && (
        <div className="space-y-4">
          {/* Key and Partition */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1">
                <Key className="w-3 h-3" />
                Message Key
              </Label>
              <VariablePicker
                value={(config.key as string) || ''}
                onChange={(v) => onChange('key', v)}
                placeholder="Optional key"
                variables={variables}
                stepOutputs={stepOutputs}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Partition</Label>
              <Input
                type="number"
                value={(config.partition as number) ?? ''}
                onChange={(e) => onChange('partition', e.target.value ? parseInt(e.target.value) : undefined)}
                placeholder="Auto"
                className="h-8 text-sm"
              />
            </div>
          </div>

          {/* Message Value */}
          <div className="space-y-2">
            <Label className="text-xs font-medium flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              Message Value
            </Label>
            <Textarea
              value={
                typeof config.value === 'object'
                  ? JSON.stringify(config.value, null, 2)
                  : (config.value as string) || ''
              }
              onChange={(e) => {
                try {
                  onChange('value', JSON.parse(e.target.value));
                } catch {
                  onChange('value', e.target.value);
                }
              }}
              placeholder='{"event": "user.created", "data": {...}}'
              className="text-xs font-mono resize-none min-h-[100px]"
            />
            <p className="text-[10px] text-muted-foreground">
              JSON or string value. Use {'${variable}'} for dynamic content.
            </p>
          </div>

          {/* Headers */}
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ChevronRight className="w-3 h-3" />
              Message Headers
              {headers.length > 0 && (
                <span className="ml-1 text-[10px] bg-muted px-1 rounded">
                  {headers.length}
                </span>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              {headers.map((header, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={header.key}
                    onChange={(e) => {
                      const newHeaders = [...headers];
                      newHeaders[index] = { ...header, key: e.target.value };
                      updateHeaders(newHeaders);
                    }}
                    placeholder="key"
                    className="h-7 text-xs font-mono w-32"
                  />
                  <span className="text-muted-foreground">:</span>
                  <Input
                    value={header.value}
                    onChange={(e) => {
                      const newHeaders = [...headers];
                      newHeaders[index] = { ...header, value: e.target.value };
                      updateHeaders(newHeaders);
                    }}
                    placeholder="value"
                    className="h-7 text-xs font-mono flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateHeaders(headers.filter((_, i) => i !== index))}
                    className="h-7 w-7 p-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateHeaders([...headers, { key: '', value: '' }])}
                className="h-7 text-xs"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Header
              </Button>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* Consume-specific options */}
      {action === 'consume' && (
        <div className="space-y-4">
          {/* Consumer Group */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Consumer Group</Label>
            <VariablePicker
              value={(config.group_id as string) || ''}
              onChange={(v) => onChange('group_id', v)}
              placeholder="my-consumer-group"
              variables={variables}
              stepOutputs={stepOutputs}
            />
          </div>

          {/* Consume Options */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Timeout
              </Label>
              <Input
                value={(config.timeout as string) || ''}
                onChange={(e) => onChange('timeout', e.target.value)}
                placeholder="30s"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Max Messages</Label>
              <Input
                type="number"
                value={(config.max_messages as number) ?? 1}
                onChange={(e) => onChange('max_messages', parseInt(e.target.value) || 1)}
                placeholder="1"
                className="h-8 text-sm"
              />
            </div>
          </div>

          {/* Offset */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Starting Offset</Label>
            <Select
              value={(config.offset as string) || 'latest'}
              onValueChange={(v) => onChange('offset', v)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest" className="text-xs">Latest (new messages only)</SelectItem>
                <SelectItem value="earliest" className="text-xs">Earliest (all messages)</SelectItem>
                <SelectItem value="stored" className="text-xs">Stored (committed offset)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Filter */}
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ChevronRight className="w-3 h-3" />
              Message Filter
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              <div className="space-y-2">
                <Label className="text-xs">Key Pattern (regex)</Label>
                <Input
                  value={(config.key_pattern as string) || ''}
                  onChange={(e) => onChange('key_pattern', e.target.value)}
                  placeholder="user-.*"
                  className="h-7 text-xs font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Value Contains (JSONPath)</Label>
                <Input
                  value={(config.value_filter as string) || ''}
                  onChange={(e) => onChange('value_filter', e.target.value)}
                  placeholder="$.event == 'user.created'"
                  className="h-7 text-xs font-mono"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* Advanced Options */}
      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Advanced Options
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-3 pt-3 border-t">
          <div className="space-y-3">
            {(config.sasl_mechanism as string) && config.sasl_mechanism !== 'none' ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Username</Label>
                  <VariablePicker
                    value={(config.sasl_username as string) || ''}
                    onChange={(v) => onChange('sasl_username', v)}
                    placeholder="username"
                    variables={variables}
                    stepOutputs={stepOutputs}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Password</Label>
                  <VariablePicker
                    value={(config.sasl_password as string) || ''}
                    onChange={(v) => onChange('sasl_password', v)}
                    placeholder="password"
                    variables={variables}
                    stepOutputs={stepOutputs}
                  />
                </div>
              </div>
            ) : null}

            {/* TLS */}
            <div className="flex items-center gap-2">
              <Switch
                checked={(config.tls as boolean) || false}
                onCheckedChange={(checked) => onChange('tls', checked)}
              />
              <Label className="text-xs">Enable TLS/SSL</Label>
            </div>

            {config.tls ? (
              <div className="space-y-2 pl-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={(config.tls_skip_verify as boolean) || false}
                    onCheckedChange={(checked) => onChange('tls_skip_verify', checked)}
                  />
                  <Label className="text-xs">Skip certificate verification</Label>
                </div>
              </div>
            ) : null}

            {/* Compression */}
            {action === 'produce' ? (
              <div className="space-y-2">
                <Label className="text-xs">Compression</Label>
                <Select
                  value={(config.compression as string) || 'none'}
                  onValueChange={(v) => onChange('compression', v === 'none' ? undefined : v)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-xs">None</SelectItem>
                    <SelectItem value="gzip" className="text-xs">GZIP</SelectItem>
                    <SelectItem value="snappy" className="text-xs">Snappy</SelectItem>
                    <SelectItem value="lz4" className="text-xs">LZ4</SelectItem>
                    <SelectItem value="zstd" className="text-xs">ZSTD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
