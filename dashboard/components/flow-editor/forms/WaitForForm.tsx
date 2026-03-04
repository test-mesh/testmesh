'use client';

import { Clock } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface WaitForFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  className?: string;
}

export default function WaitForForm({
  config,
  onChange,
  className,
}: WaitForFormProps) {
  const type = (config.type as string) || 'http';

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <Clock className="h-4 w-4 text-cyan-500" />
        <span className="text-sm font-medium">Wait For (Endpoint Polling)</span>
      </div>

      <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg">
        <p className="text-sm text-blue-900 dark:text-blue-300">
          Polls an HTTP endpoint or TCP port until it becomes available or matches conditions.
        </p>
      </div>

      {/* Type */}
      <div className="space-y-2">
        <Label htmlFor="type">Check Type</Label>
        <Select value={type} onValueChange={(v) => onChange('type', v)}>
          <SelectTrigger id="type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="http">HTTP</SelectItem>
            <SelectItem value="tcp">TCP</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {type === 'http' && (
        <>
          {/* URL */}
          <div className="space-y-2">
            <Label htmlFor="url">URL</Label>
            <Input
              id="url"
              value={(config.url as string) || ''}
              onChange={(e) => onChange('url', e.target.value)}
              placeholder="http://localhost:8080/health"
              className="font-mono"
            />
          </div>

          {/* Expected Status Code */}
          <div className="space-y-2">
            <Label htmlFor="status_code">Expected Status Code</Label>
            <Input
              id="status_code"
              type="number"
              min="100"
              max="599"
              value={(config.status_code as number) || 200}
              onChange={(e) => onChange('status_code', parseInt(e.target.value))}
              placeholder="200"
            />
          </div>

          {/* Body Contains */}
          <div className="space-y-2">
            <Label htmlFor="body_contains">
              Body Contains <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="body_contains"
              value={(config.body_contains as string) || ''}
              onChange={(e) => onChange('body_contains', e.target.value || undefined)}
              placeholder='"status":"ok"'
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Substring that must appear in the response body
            </p>
          </div>

          {/* JSONPath check */}
          <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
            <Label className="text-sm font-medium">JSONPath Condition (optional)</Label>
            <div className="space-y-2">
              <div className="space-y-1">
                <Label htmlFor="json_path" className="text-xs">JSONPath</Label>
                <Input
                  id="json_path"
                  value={(config.json_path as string) || ''}
                  onChange={(e) => onChange('json_path', e.target.value || undefined)}
                  placeholder="$.status"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="json_value" className="text-xs">Expected Value</Label>
                <Input
                  id="json_value"
                  value={(config.json_value as string) || ''}
                  onChange={(e) => onChange('json_value', e.target.value || undefined)}
                  placeholder="healthy"
                  className="font-mono text-sm"
                />
              </div>
            </div>
          </div>
        </>
      )}

      {type === 'tcp' && (
        <>
          {/* Host */}
          <div className="space-y-2">
            <Label htmlFor="host">Host</Label>
            <Input
              id="host"
              value={(config.host as string) || ''}
              onChange={(e) => onChange('host', e.target.value)}
              placeholder="localhost"
              className="font-mono"
            />
          </div>

          {/* Port */}
          <div className="space-y-2">
            <Label htmlFor="port">Port</Label>
            <Input
              id="port"
              type="number"
              min="1"
              max="65535"
              value={(config.port as number) || ''}
              onChange={(e) => onChange('port', parseInt(e.target.value))}
              placeholder="5432"
            />
          </div>
        </>
      )}

      {/* Timeout */}
      <div className="space-y-2">
        <Label htmlFor="timeout">Timeout</Label>
        <Input
          id="timeout"
          value={(config.timeout as string) || '30s'}
          onChange={(e) => onChange('timeout', e.target.value)}
          placeholder="30s"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Max time to wait (e.g., 30s, 2m)
        </p>
      </div>

      {/* Interval */}
      <div className="space-y-2">
        <Label htmlFor="interval">Poll Interval</Label>
        <Input
          id="interval"
          value={(config.interval as string) || '1s'}
          onChange={(e) => onChange('interval', e.target.value)}
          placeholder="1s"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Time between polling attempts (e.g., 500ms, 1s, 5s)
        </p>
      </div>
    </div>
  );
}
