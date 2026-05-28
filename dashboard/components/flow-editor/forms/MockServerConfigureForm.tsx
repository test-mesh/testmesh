'use client';

import { useRef } from 'react';
import { Server, Plus, Trash2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  id: number;
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

const DEFAULT_ENDPOINT: Omit<RouteEndpoint, 'id'> = {
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
  const endpointIdCounter = useRef(Date.now());
  const endpoints = (config.endpoints as RouteEndpoint[]) || [];

  const updateEndpoint = (index: number, field: keyof RouteEndpoint, value: string | number | Record<string, string>) => {
    const updated = [...endpoints];
    updated[index] = { ...updated[index], [field]: value };
    onChange('endpoints', updated);
  };

  const addEndpoint = () => {
    onChange('endpoints', [...endpoints, { ...DEFAULT_ENDPOINT, id: endpointIdCounter.current++ }]);
  };

  const removeEndpoint = (index: number) => {
    onChange('endpoints', endpoints.filter((_, i) => i !== index));
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b border-[#1a2332]">
        <Server className="h-4 w-4 text-pink-400" />
        <span className="text-sm font-medium text-[#c8dce8]">Configure Mock Server</span>
      </div>

      <div className="space-y-2">
        <Label htmlFor="mock-server-id">Server ID</Label>
        <Input
          id="mock-server-id"
          value={(config.server_id as string) || ''}
          onChange={(e) => onChange('server_id', e.target.value)}
          placeholder="my_mock_server"
          className="font-mono text-sm"
        />
        <p className="text-xs text-[#4a6480]">
          Matches the server ID used in mock_server_start.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Endpoints</Label>
          <button
            type="button"
            onClick={addEndpoint}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg border border-[#1e2d3d] bg-[#0f1923] text-xs text-[#7fa8c8] hover:border-[#2a3d52] hover:text-[#c8dce8] transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add Endpoint
          </button>
        </div>

        {endpoints.length === 0 && (
          <p className="text-xs text-[#4a6480]">
            No endpoints configured. Click Add Endpoint to create one.
          </p>
        )}

        {endpoints.map((endpoint, index) => (
          <div key={endpoint.id} className="p-3 border border-[#1a2332] rounded-lg space-y-3 bg-[#0b0f18]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#4a6480]">
                Endpoint {index + 1}
              </span>
              <button
                type="button"
                onClick={() => removeEndpoint(index)}
                className="flex items-center justify-center h-6 w-6 rounded text-[#4a6480] hover:text-red-400 hover:bg-[#1a2d3d] transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>

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

            <div className="space-y-1">
              <Label className="text-xs">Status Code</Label>
              <Input
                type="number"
                min={100}
                max={599}
                value={endpoint.status ?? 200}
                onChange={(e) => updateEndpoint(index, 'status', Number(e.target.value) || 200)}
                className="font-mono text-sm w-28"
              />
            </div>

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
