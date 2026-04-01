'use client';

import { Server, Plus, Trash2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import KeyValueEditor from './KeyValueEditor';

interface RouteEndpoint {
  method: string;
  path: string;
  status: number;
  response: string;
  headers: Record<string, string>;
}

interface MockServerConfigureFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  className?: string;
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

const DEFAULT_ENDPOINT: RouteEndpoint = {
  method: 'GET',
  path: '/',
  status: 200,
  response: '{}',
  headers: {},
};

export default function MockServerConfigureForm({
  config,
  onChange,
  className,
}: MockServerConfigureFormProps) {
  const endpoints = (config.endpoints as RouteEndpoint[]) || [];

  const updateEndpoint = (index: number, field: keyof RouteEndpoint, value: string | number | Record<string, string>) => {
    const updated = [...endpoints];
    updated[index] = { ...updated[index], [field]: value };
    onChange('endpoints', updated);
  };

  const addEndpoint = () => {
    onChange('endpoints', [...endpoints, { ...DEFAULT_ENDPOINT }]);
  };

  const removeEndpoint = (index: number) => {
    onChange('endpoints', endpoints.filter((_, i) => i !== index));
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <Server className="h-4 w-4 text-pink-500" />
        <span className="text-sm font-medium">Configure Mock Server</span>
      </div>

      {/* Server ID */}
      <div className="space-y-2">
        <Label htmlFor="mock-server-id">Server ID</Label>
        <Input
          id="mock-server-id"
          value={(config.server_id as string) || ''}
          onChange={(e) => onChange('server_id', e.target.value)}
          placeholder="my_mock_server"
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Matches the server ID used in mock_server_start.
        </p>
      </div>

      {/* Endpoints */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Endpoints</Label>
          <Button variant="outline" size="sm" onClick={addEndpoint} type="button">
            <Plus className="h-3 w-3 mr-1" />
            Add Endpoint
          </Button>
        </div>

        {endpoints.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No endpoints configured. Click Add Endpoint to create one.
          </p>
        )}

        {endpoints.map((endpoint, index) => (
          <div key={index} className="p-3 border rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Endpoint {index + 1}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeEndpoint(index)}
                type="button"
                className="text-destructive hover:text-destructive h-6 px-2"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>

            {/* Method + Path */}
            <div className="flex gap-2">
              <div className="w-32 shrink-0">
                <Select
                  value={endpoint.method || 'GET'}
                  onValueChange={(v) => updateEndpoint(index, 'method', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HTTP_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Input
                  value={endpoint.path || ''}
                  onChange={(e) => updateEndpoint(index, 'path', e.target.value)}
                  placeholder="/api/resource"
                  className="font-mono text-sm"
                />
              </div>
            </div>

            {/* Status */}
            <div className="space-y-1">
              <Label className="text-xs">Status Code</Label>
              <Input
                type="number"
                min={100}
                max={599}
                value={endpoint.status ?? 200}
                onChange={(e) => updateEndpoint(index, 'status', parseInt(e.target.value, 10) || 200)}
                className="font-mono text-sm w-28"
              />
            </div>

            {/* Response */}
            <div className="space-y-1">
              <Label className="text-xs">Response Body (JSON)</Label>
              <Textarea
                value={endpoint.response || ''}
                onChange={(e) => updateEndpoint(index, 'response', e.target.value)}
                placeholder='{}'
                rows={3}
                className="font-mono text-sm"
              />
            </div>

            {/* Response Headers */}
            <KeyValueEditor
              label="Response Headers"
              value={endpoint.headers || {}}
              onChange={(v) => updateEndpoint(index, 'headers', v)}
              keyPlaceholder="Content-Type"
              valuePlaceholder="application/json"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
