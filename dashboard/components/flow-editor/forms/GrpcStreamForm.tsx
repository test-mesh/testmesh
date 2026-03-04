'use client';

import { Network, Play, Filter } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import KeyValueEditor from './KeyValueEditor';

interface GrpcStreamFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  className?: string;
}

export default function GrpcStreamForm({
  config,
  onChange,
  className,
}: GrpcStreamFormProps) {
  const metadata = (config.metadata as Record<string, string>) || {};

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <Network className="h-4 w-4 text-blue-500" />
        <span className="text-sm font-medium">gRPC Stream</span>
      </div>

      <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg">
        <p className="text-sm text-blue-900 dark:text-blue-300">
          Handle streaming gRPC calls (server-side, client-side, or bidirectional streams).
        </p>
      </div>

      {/* Stream Type */}
      <div className="space-y-2">
        <Label htmlFor="stream_type">Stream Type</Label>
        <Select
          value={(config.stream_type as string) || 'server'}
          onValueChange={(v) => onChange('stream_type', v)}
        >
          <SelectTrigger id="stream_type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="server">
              <div>
                <div className="font-medium">Server Stream</div>
                <div className="text-xs text-muted-foreground">
                  One request, multiple responses
                </div>
              </div>
            </SelectItem>
            <SelectItem value="client">
              <div>
                <div className="font-medium">Client Stream</div>
                <div className="text-xs text-muted-foreground">
                  Multiple requests, one response
                </div>
              </div>
            </SelectItem>
            <SelectItem value="bidi">
              <div>
                <div className="font-medium">Bidirectional Stream</div>
                <div className="text-xs text-muted-foreground">
                  Multiple requests and responses
                </div>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Address */}
      <div className="space-y-2">
        <Label htmlFor="address">Server Address</Label>
        <Input
          id="address"
          value={(config.address as string) || ''}
          onChange={(e) => onChange('address', e.target.value)}
          placeholder="localhost:50051"
          className="font-mono text-sm"
        />
      </div>

      {/* Service */}
      <div className="space-y-2">
        <Label htmlFor="service">Service Name</Label>
        <Input
          id="service"
          value={(config.service as string) || ''}
          onChange={(e) => onChange('service', e.target.value)}
          placeholder="chat.v1.ChatService"
          className="font-mono text-sm"
        />
      </div>

      {/* Method */}
      <div className="space-y-2">
        <Label htmlFor="method">Method Name</Label>
        <Input
          id="method"
          value={(config.method as string) || ''}
          onChange={(e) => onChange('method', e.target.value)}
          placeholder="StreamMessages"
          className="font-mono text-sm"
        />
      </div>

      {/* Request(s) */}
      <div className="space-y-2">
        <Label htmlFor="request">
          {config.stream_type === 'server' ? 'Request Message' : 'Request Messages'} (JSON)
        </Label>
        <Textarea
          id="request"
          value={
            typeof config.request === 'object'
              ? JSON.stringify(config.request, null, 2)
              : (config.request as string) || ''
          }
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              onChange('request', parsed);
            } catch {
              onChange('request', e.target.value);
            }
          }}
          placeholder={
            config.stream_type === 'server'
              ? '{\n  "room_id": "room123"\n}'
              : '[\n  {"message": "Hello"},\n  {"message": "World"}\n]'
          }
          rows={8}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          {config.stream_type === 'server'
            ? 'Single request message as JSON'
            : 'Array of request messages for client/bidi streams'}
        </p>
      </div>

      {/* Metadata */}
      <KeyValueEditor
        label="Metadata (Headers)"
        description="gRPC metadata sent with the request"
        value={metadata}
        onChange={(v) => onChange('metadata', v)}
        keyPlaceholder="authorization"
        valuePlaceholder="Bearer ${token}"
      />

      {/* Stream Configuration */}
      <details className="space-y-3 p-3 border rounded-lg">
        <summary className="text-sm font-medium cursor-pointer flex items-center gap-2">
          <Play className="h-4 w-4" />
          Stream Configuration
        </summary>
        <div className="pt-3 space-y-3">
          {/* Max Messages */}
          <div className="space-y-2">
            <Label htmlFor="max_messages">Max Messages to Receive</Label>
            <Input
              id="max_messages"
              type="number"
              min="0"
              value={(config.max_messages as number) || 0}
              onChange={(e) => onChange('max_messages', parseInt(e.target.value) || 0)}
              placeholder="0 (unlimited)"
            />
            <p className="text-xs text-muted-foreground">
              0 = receive all messages until stream ends
            </p>
          </div>

          {/* Stream Timeout */}
          <div className="space-y-2">
            <Label htmlFor="stream_timeout">Stream Timeout</Label>
            <Input
              id="stream_timeout"
              value={(config.stream_timeout as string) || '30s'}
              onChange={(e) => onChange('stream_timeout', e.target.value)}
              placeholder="30s"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Maximum time to keep stream open
            </p>
          </div>

          {/* Message Delay (for client/bidi streams) */}
          {(config.stream_type === 'client' || config.stream_type === 'bidi') && (
            <div className="space-y-2">
              <Label htmlFor="message_delay">Delay Between Messages</Label>
              <Input
                id="message_delay"
                value={(config.message_delay as string) || '100ms'}
                onChange={(e) => onChange('message_delay', e.target.value)}
                placeholder="100ms"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Delay between sending messages in client/bidi streams
              </p>
            </div>
          )}

          {/* Close After Receive */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Close After Receive</Label>
              <p className="text-xs text-muted-foreground">
                Close stream after receiving expected messages
              </p>
            </div>
            <Switch
              checked={(config.close_after_receive as boolean) ?? true}
              onCheckedChange={(checked) => onChange('close_after_receive', checked)}
            />
          </div>
        </div>
      </details>

      {/* Message Filtering */}
      <details className="space-y-3 p-3 border rounded-lg">
        <summary className="text-sm font-medium cursor-pointer flex items-center gap-2">
          <Filter className="h-4 w-4" />
          Message Filtering (Optional)
        </summary>
        <div className="pt-3 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="filter_expression">Filter Expression</Label>
            <Textarea
              id="filter_expression"
              value={(config.filter_expression as string) || ''}
              onChange={(e) => onChange('filter_expression', e.target.value)}
              placeholder="$.message.type == 'important'"
              rows={2}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              JSONPath expression to filter received messages
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Collect All Messages</Label>
              <p className="text-xs text-muted-foreground">
                Store all received messages in output
              </p>
            </div>
            <Switch
              checked={(config.collect_all as boolean) ?? true}
              onCheckedChange={(checked) => onChange('collect_all', checked)}
            />
          </div>
        </div>
      </details>

      {/* Examples */}
      <details className="space-y-2 p-3 border rounded-lg">
        <summary className="text-sm font-medium cursor-pointer">
          Example Use Cases
        </summary>
        <div className="pt-2 space-y-3 text-xs">
          <div>
            <p className="font-medium mb-1">1. Server Stream - Chat Messages</p>
            <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
              <div>Type: Server Stream</div>
              <div>Service: chat.v1.ChatService</div>
              <div>Method: StreamMessages</div>
              <div>Request: {'{'} "room_id": "123" {'}'}</div>
              <div>Receive: Multiple chat messages</div>
            </div>
          </div>

          <div>
            <p className="font-medium mb-1">2. Client Stream - Upload Chunks</p>
            <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
              <div>Type: Client Stream</div>
              <div>Send: Multiple file chunks</div>
              <div>Receive: Upload completion response</div>
            </div>
          </div>

          <div>
            <p className="font-medium mb-1">3. Bidirectional - Live Updates</p>
            <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
              <div>Type: Bidirectional Stream</div>
              <div>Send and receive simultaneously</div>
              <div>Use case: Real-time collaboration</div>
            </div>
          </div>
        </div>
      </details>

      {/* Output Info */}
      <div className="p-3 bg-muted/30 border rounded-lg space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Play className="h-4 w-4" />
          Output Format
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <div>• <span className="font-mono">messages</span> - Array of received messages</div>
          <div>• <span className="font-mono">count</span> - Number of messages received</div>
          <div>• <span className="font-mono">metadata</span> - Stream metadata</div>
          <div>• <span className="font-mono">status</span> - Final gRPC status</div>
        </div>
      </div>
    </div>
  );
}
