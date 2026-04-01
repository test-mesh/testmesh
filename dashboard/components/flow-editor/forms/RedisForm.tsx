'use client';

import { Database } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface RedisFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  action?: string;
  className?: string;
}

export default function RedisForm({
  config,
  onChange,
  action,
  className,
}: RedisFormProps) {
  const isSet = action === 'redis.set';

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <Database className="h-4 w-4 text-red-500" />
        <span className="text-sm font-medium">Redis</span>
        {action && (
          <span className="text-xs text-muted-foreground font-mono">({action})</span>
        )}
      </div>

      {/* Connection */}
      <details className="space-y-3 p-3 border rounded-lg">
        <summary className="text-sm font-medium cursor-pointer">Connection</summary>
        <div className="space-y-3 pt-3">
          <div className="space-y-2">
            <Label htmlFor="redis-host">Host</Label>
            <Input
              id="redis-host"
              value={(config.host as string) || ''}
              onChange={(e) => onChange('host', e.target.value)}
              placeholder="localhost"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="redis-port">Port</Label>
            <Input
              id="redis-port"
              value={(config.port as string) || ''}
              onChange={(e) => onChange('port', e.target.value)}
              placeholder="6379"
              className="font-mono text-sm"
            />
          </div>
        </div>
      </details>

      {/* Key */}
      <div className="space-y-2">
        <Label htmlFor="redis-key">Key</Label>
        <Input
          id="redis-key"
          value={(config.key as string) || ''}
          onChange={(e) => onChange('key', e.target.value)}
          placeholder="my-key"
          className="font-mono text-sm"
        />
      </div>

      {/* Value — only for redis.set */}
      {isSet && (
        <div className="space-y-2">
          <Label htmlFor="redis-value">Value</Label>
          <Textarea
            id="redis-value"
            value={(config.value as string) || ''}
            onChange={(e) => onChange('value', e.target.value)}
            placeholder='{"hello":"world"}'
            rows={4}
            className="font-mono text-sm"
          />
        </div>
      )}

      {/* TTL — only for redis.set */}
      {isSet && (
        <div className="space-y-2">
          <Label htmlFor="redis-ttl">TTL</Label>
          <Input
            id="redis-ttl"
            value={(config.ttl as string) || ''}
            onChange={(e) => onChange('ttl', e.target.value)}
            placeholder="10s"
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Time-to-live duration (e.g. 10s, 5m). Leave blank for no expiry.
          </p>
        </div>
      )}
    </div>
  );
}
