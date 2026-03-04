'use client';

import { Network, Shield, Code } from 'lucide-react';
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

interface GrpcCallFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  className?: string;
}

export default function GrpcCallForm({
  config,
  onChange,
  className,
}: GrpcCallFormProps) {
  const metadata = (config.metadata as Record<string, string>) || {};

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <Network className="h-4 w-4 text-blue-500" />
        <span className="text-sm font-medium">gRPC Call</span>
      </div>

      <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg">
        <p className="text-sm text-blue-900 dark:text-blue-300">
          Execute unary gRPC calls with full request/response handling and metadata support.
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
        <p className="text-xs text-muted-foreground">
          gRPC server address (host:port)
        </p>
      </div>

      {/* Service */}
      <div className="space-y-2">
        <Label htmlFor="service">Service Name</Label>
        <Input
          id="service"
          value={(config.service as string) || ''}
          onChange={(e) => onChange('service', e.target.value)}
          placeholder="users.v1.UserService"
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Fully qualified service name from .proto file
        </p>
      </div>

      {/* Method */}
      <div className="space-y-2">
        <Label htmlFor="method">Method Name</Label>
        <Input
          id="method"
          value={(config.method as string) || ''}
          onChange={(e) => onChange('method', e.target.value)}
          placeholder="GetUser"
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          RPC method to call
        </p>
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
          placeholder={'{\n  "user_id": "${user_id}",\n  "include_profile": true\n}'}
          rows={8}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Request message as JSON. Use {'${variable}'} for dynamic values.
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
        <Label htmlFor="proto_file">Proto File Path (Optional)</Label>
        <Input
          id="proto_file"
          value={(config.proto_file as string) || ''}
          onChange={(e) => onChange('proto_file', e.target.value)}
          placeholder="./protos/users.proto"
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Path to .proto file for reflection. If omitted, uses server reflection.
        </p>
      </div>

      {/* TLS Configuration */}
      <details className="space-y-3 p-3 border rounded-lg">
        <summary className="text-sm font-medium cursor-pointer flex items-center gap-2">
          <Shield className="h-4 w-4" />
          TLS/Security Configuration
        </summary>
        <div className="pt-3 space-y-3">
          {/* Use TLS */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable TLS</Label>
              <p className="text-xs text-muted-foreground">
                Use secure connection
              </p>
            </div>
            <Switch
              checked={(config.use_tls as boolean) || false}
              onCheckedChange={(checked) => onChange('use_tls', checked)}
            />
          </div>

          {(config.use_tls as boolean) && (
            <>
              {/* Server Name Override */}
              <div className="space-y-2">
                <Label htmlFor="server_name">Server Name Override</Label>
                <Input
                  id="server_name"
                  value={(config.server_name as string) || ''}
                  onChange={(e) => onChange('server_name', e.target.value)}
                  placeholder="api.example.com"
                  className="font-mono text-sm"
                />
              </div>

              {/* CA Cert */}
              <div className="space-y-2">
                <Label htmlFor="ca_cert">CA Certificate Path</Label>
                <Input
                  id="ca_cert"
                  value={(config.ca_cert as string) || ''}
                  onChange={(e) => onChange('ca_cert', e.target.value)}
                  placeholder="/path/to/ca.crt"
                  className="font-mono text-sm"
                />
              </div>

              {/* Client Cert */}
              <div className="space-y-2">
                <Label htmlFor="client_cert">Client Certificate Path</Label>
                <Input
                  id="client_cert"
                  value={(config.client_cert as string) || ''}
                  onChange={(e) => onChange('client_cert', e.target.value)}
                  placeholder="/path/to/client.crt"
                  className="font-mono text-sm"
                />
              </div>

              {/* Client Key */}
              <div className="space-y-2">
                <Label htmlFor="client_key">Client Key Path</Label>
                <Input
                  id="client_key"
                  value={(config.client_key as string) || ''}
                  onChange={(e) => onChange('client_key', e.target.value)}
                  placeholder="/path/to/client.key"
                  className="font-mono text-sm"
                />
              </div>

              {/* Skip Verify */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Skip TLS Verification</Label>
                  <p className="text-xs text-muted-foreground">
                    Insecure - skip certificate verification
                  </p>
                </div>
                <Switch
                  checked={(config.insecure_skip_verify as boolean) || false}
                  onCheckedChange={(checked) => onChange('insecure_skip_verify', checked)}
                />
              </div>
            </>
          )}
        </div>
      </details>

      {/* Advanced Options */}
      <details className="space-y-3 p-3 border rounded-lg">
        <summary className="text-sm font-medium cursor-pointer">
          Advanced Options
        </summary>
        <div className="pt-3 space-y-3">
          {/* Timeout */}
          <div className="space-y-2">
            <Label htmlFor="timeout">Call Timeout</Label>
            <Input
              id="timeout"
              value={(config.timeout as string) || '10s'}
              onChange={(e) => onChange('timeout', e.target.value)}
              placeholder="10s"
              className="font-mono text-sm"
            />
          </div>

          {/* Max Message Size */}
          <div className="space-y-2">
            <Label htmlFor="max_recv_msg_size">Max Receive Message Size (bytes)</Label>
            <Input
              id="max_recv_msg_size"
              type="number"
              value={(config.max_recv_msg_size as number) || 4194304}
              onChange={(e) => onChange('max_recv_msg_size', parseInt(e.target.value))}
              placeholder="4194304"
            />
            <p className="text-xs text-muted-foreground">
              Default: 4MB (4194304 bytes)
            </p>
          </div>

          {/* Wait for Ready */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Wait for Ready</Label>
              <p className="text-xs text-muted-foreground">
                Wait for connection to be ready before calling
              </p>
            </div>
            <Switch
              checked={(config.wait_for_ready as boolean) || false}
              onCheckedChange={(checked) => onChange('wait_for_ready', checked)}
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
            <p className="font-medium mb-1">1. User Service Call</p>
            <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
              <div>Service: users.v1.UserService</div>
              <div>Method: GetUser</div>
              <div>Request: {'{'} "user_id": "123" {'}'}</div>
            </div>
          </div>

          <div>
            <p className="font-medium mb-1">2. Authenticated Call</p>
            <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
              <div>Metadata:</div>
              <div className="pl-4">authorization: Bearer ${'${token}'}</div>
              <div className="pl-4">x-request-id: ${'${REQUEST_ID}'}</div>
            </div>
          </div>

          <div>
            <p className="font-medium mb-1">3. Secure Connection</p>
            <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
              <div>Address: api.example.com:443</div>
              <div>Use TLS: true</div>
              <div>CA Cert: /certs/ca.crt</div>
            </div>
          </div>
        </div>
      </details>

      {/* Output Info */}
      <div className="p-3 bg-muted/30 border rounded-lg space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Code className="h-4 w-4" />
          Output Format
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <div>• <span className="font-mono">response</span> - Response message (JSON)</div>
          <div>• <span className="font-mono">metadata</span> - Response metadata</div>
          <div>• <span className="font-mono">status</span> - gRPC status code</div>
          <div>• <span className="font-mono">trailers</span> - Response trailers</div>
        </div>
      </div>
    </div>
  );
}
