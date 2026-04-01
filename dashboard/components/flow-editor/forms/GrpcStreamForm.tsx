'use client';

import { Network } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
          Server-streaming gRPC call: send one request, receive multiple responses.
        </p>
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

      {/* Request */}
      <div className="space-y-2">
        <Label htmlFor="request">Request Message (JSON)</Label>
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
          placeholder={'{\n  "room_id": "room123"\n}'}
          rows={8}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Single request message sent to open the stream
        </p>
      </div>

      {/* Timeout */}
      <div className="space-y-2">
        <Label htmlFor="timeout">Timeout</Label>
        <Input
          id="timeout"
          value={(config.timeout as string) || ''}
          onChange={(e) => onChange('timeout', e.target.value)}
          placeholder="30s"
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Maximum time to keep the stream open (e.g. 30s, 2m)
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

      {/* Proto File */}
      <div className="space-y-2">
        <Label htmlFor="proto_file">Proto File (Optional)</Label>
        <Input
          id="proto_file"
          value={(config.proto_file as string) || ''}
          onChange={(e) => onChange('proto_file', e.target.value)}
          placeholder="/path/to/service.proto"
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Path to .proto file for type-safe serialisation
        </p>
      </div>

      {/* TLS */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>Use TLS</Label>
          <p className="text-xs text-muted-foreground">
            Connect over TLS (requires server TLS support)
          </p>
        </div>
        <Switch
          checked={(config.use_tls as boolean) ?? false}
          onCheckedChange={(checked) => onChange('use_tls', checked)}
        />
      </div>

      {/* Server Reflection */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>Use Server Reflection</Label>
          <p className="text-xs text-muted-foreground">
            Discover service schema via gRPC server reflection
          </p>
        </div>
        <Switch
          checked={(config.use_reflection as boolean) ?? false}
          onCheckedChange={(checked) => onChange('use_reflection', checked)}
        />
      </div>

      {/* Output Info */}
      <div className="p-3 bg-muted/30 border rounded-lg space-y-2">
        <div className="text-sm font-medium">Output Format</div>
        <div className="text-xs text-muted-foreground space-y-1">
          <div>• <span className="font-mono">messages</span> — array of received messages</div>
          <div>• <span className="font-mono">status_code</span> — final gRPC status</div>
          <div>• <span className="font-mono">latency_ms</span> — total call duration</div>
          <div>• <span className="font-mono">metadata</span> — response trailer metadata</div>
        </div>
      </div>
    </div>
  );
}
