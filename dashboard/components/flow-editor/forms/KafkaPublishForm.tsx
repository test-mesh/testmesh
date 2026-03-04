'use client';

import { MessageSquare, Plus } from 'lucide-react';
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

interface KafkaPublishFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  className?: string;
}

const COMPRESSION_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'gzip', label: 'GZIP' },
  { value: 'snappy', label: 'Snappy' },
  { value: 'lz4', label: 'LZ4' },
];

const SASL_MECHANISMS = [
  { value: 'PLAIN', label: 'PLAIN' },
  { value: 'SCRAM-SHA-256', label: 'SCRAM-SHA-256' },
  { value: 'SCRAM-SHA-512', label: 'SCRAM-SHA-512' },
];

export default function KafkaPublishForm({
  config,
  onChange,
  className,
}: KafkaPublishFormProps) {
  const brokers = (config.brokers as string[]) || ['localhost:9092'];
  const headers = (config.headers as Record<string, string>) || {};

  const handleBrokersChange = (value: string) => {
    // Split by comma or newline
    const brokerList = value.split(/[,\n]/).map(b => b.trim()).filter(Boolean);
    onChange('brokers', brokerList);
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <MessageSquare className="h-4 w-4 text-purple-500" />
        <span className="text-sm font-medium">Kafka Publish</span>
      </div>

      {/* Brokers */}
      <div className="space-y-2">
        <Label htmlFor="brokers">Brokers</Label>
        <Textarea
          id="brokers"
          value={brokers.join('\n')}
          onChange={(e) => handleBrokersChange(e.target.value)}
          placeholder="localhost:9092&#10;localhost:9093"
          rows={3}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          One broker per line or comma-separated
        </p>
      </div>

      {/* Topic */}
      <div className="space-y-2">
        <Label htmlFor="topic">Topic</Label>
        <Input
          id="topic"
          value={(config.topic as string) || ''}
          onChange={(e) => onChange('topic', e.target.value)}
          placeholder="user-events"
          className="font-mono"
        />
      </div>

      {/* Key */}
      <div className="space-y-2">
        <Label htmlFor="key">
          Message Key <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="key"
          value={(config.key as string) || ''}
          onChange={(e) => onChange('key', e.target.value)}
          placeholder="${user_id}"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Used for partitioning. Leave empty for random partition.
        </p>
      </div>

      {/* Payload */}
      <div className="space-y-2">
        <Label htmlFor="payload">Message Payload</Label>
        <Textarea
          id="payload"
          value={
            typeof config.payload === 'object'
              ? JSON.stringify(config.payload, null, 2)
              : (config.payload as string) || ''
          }
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              onChange('payload', parsed);
            } catch {
              onChange('payload', e.target.value);
            }
          }}
          placeholder={'{\n  "event": "user.created",\n  "userId": "${user_id}"\n}'}
          rows={6}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          JSON object or string. Use {'${variable}'} for dynamic values.
        </p>
      </div>

      {/* Headers */}
      <KeyValueEditor
        label="Headers"
        description="Kafka message headers"
        value={headers}
        onChange={(v) => onChange('headers', v)}
        keyPlaceholder="header-name"
        valuePlaceholder="value"
      />

      {/* Advanced Options */}
      <details className="space-y-3 p-3 border rounded-lg">
        <summary className="text-sm font-medium cursor-pointer">
          Advanced Options
        </summary>
        <div className="space-y-3 pt-3">
          {/* Partition */}
          <div className="space-y-2">
            <Label htmlFor="partition">
              Partition <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="partition"
              type="number"
              min="0"
              value={(config.partition as number) ?? ''}
              onChange={(e) => onChange('partition', e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="Auto"
            />
          </div>

          {/* Compression */}
          <div className="space-y-2">
            <Label htmlFor="compression">Compression</Label>
            <Select
              value={(config.compression as string) || 'none'}
              onValueChange={(v) => onChange('compression', v)}
            >
              <SelectTrigger id="compression">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMPRESSION_TYPES.map((ct) => (
                  <SelectItem key={ct.value} value={ct.value}>
                    {ct.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* SASL Authentication */}
          <div className="space-y-3 pt-3 border-t">
            <Label className="text-sm font-semibold">SASL Authentication</Label>

            <div className="space-y-2">
              <Label htmlFor="sasl_mechanism">Mechanism</Label>
              <Select
                value={((config.sasl as Record<string, any>)?.mechanism as string) || 'none'}
                onValueChange={(v) => {
                  if (v === 'none') {
                    onChange('sasl', undefined);
                  } else {
                    onChange('sasl', { mechanism: v });
                  }
                }}
              >
                <SelectTrigger id="sasl_mechanism">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {SASL_MECHANISMS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(config.sasl as Record<string, any>)?.mechanism && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="sasl_username">Username</Label>
                  <Input
                    id="sasl_username"
                    value={((config.sasl as Record<string, any>)?.username as string) || ''}
                    onChange={(e) =>
                      onChange('sasl', {
                        ...(config.sasl as object),
                        username: e.target.value,
                      })
                    }
                    placeholder="kafka-user"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sasl_password">Password</Label>
                  <Input
                    id="sasl_password"
                    type="password"
                    value={((config.sasl as Record<string, any>)?.password as string) || ''}
                    onChange={(e) =>
                      onChange('sasl', {
                        ...(config.sasl as object),
                        password: e.target.value,
                      })
                    }
                    placeholder="${KAFKA_PASSWORD}"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
