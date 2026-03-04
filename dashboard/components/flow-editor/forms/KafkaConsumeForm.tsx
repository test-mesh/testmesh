'use client';

import { MessageSquare, Filter } from 'lucide-react';
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

interface KafkaConsumeFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  className?: string;
}

export default function KafkaConsumeForm({
  config,
  onChange,
  className,
}: KafkaConsumeFormProps) {
  const brokers = (config.brokers as string[]) || ['localhost:9092'];
  const hasMatch = !!config.match;

  const handleBrokersChange = (value: string) => {
    const brokerList = value.split(/[,\n]/).map(b => b.trim()).filter(Boolean);
    onChange('brokers', brokerList);
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <MessageSquare className="h-4 w-4 text-purple-500" />
        <span className="text-sm font-medium">Kafka Consume</span>
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

      {/* Consumer Group */}
      <div className="space-y-2">
        <Label htmlFor="group_id">Consumer Group ID</Label>
        <Input
          id="group_id"
          value={(config.group_id as string) || ''}
          onChange={(e) => onChange('group_id', e.target.value)}
          placeholder="test-consumer-${EXECUTION_ID}"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Use unique group ID per test execution to start from beginning
        </p>
      </div>

      {/* Timeout */}
      <div className="space-y-2">
        <Label htmlFor="timeout">Timeout</Label>
        <Input
          id="timeout"
          value={(config.timeout as string) || '10s'}
          onChange={(e) => onChange('timeout', e.target.value)}
          placeholder="10s"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          How long to wait for messages (e.g., 10s, 1m)
        </p>
      </div>

      {/* Count */}
      <div className="space-y-2">
        <Label htmlFor="count">Max Messages</Label>
        <Input
          id="count"
          type="number"
          min="1"
          value={(config.count as number) || 1}
          onChange={(e) => onChange('count', parseInt(e.target.value))}
          placeholder="1"
        />
      </div>

      {/* From Beginning */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>Start from Beginning</Label>
          <p className="text-xs text-muted-foreground">
            Read from the beginning of the topic
          </p>
        </div>
        <Switch
          checked={(config.from_beginning as boolean) || false}
          onCheckedChange={(checked) => onChange('from_beginning', checked)}
        />
      </div>

      {/* Match/Filter */}
      <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          <Label>Message Matching (Optional)</Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Wait for messages matching specific criteria
        </p>

        {/* Match Key */}
        <div className="space-y-2">
          <Label htmlFor="match_key">Match Key</Label>
          <Input
            id="match_key"
            value={((config.match as Record<string, any>)?.key as string) || ''}
            onChange={(e) => {
              if (e.target.value) {
                onChange('match', {
                  ...(config.match as object || {}),
                  key: e.target.value,
                });
              } else {
                const match = { ...(config.match as Record<string, any> || {}) };
                delete match.key;
                onChange('match', Object.keys(match).length > 0 ? match : undefined);
              }
            }}
            placeholder="${user_id}"
            className="font-mono"
          />
        </div>

        {/* JSONPath Conditions */}
        <div className="space-y-2">
          <Label htmlFor="json_path">JSONPath Conditions</Label>
          <Textarea
            id="json_path"
            value={
              ((config.match as Record<string, any>)?.json_path as string[])?.join('\n') || ''
            }
            onChange={(e) => {
              const lines = e.target.value.split('\n').filter(Boolean);
              if (lines.length > 0) {
                onChange('match', {
                  ...(config.match as object || {}),
                  json_path: lines,
                });
              } else {
                const match = { ...(config.match as Record<string, any> || {}) };
                delete match.json_path;
                onChange('match', Object.keys(match).length > 0 ? match : undefined);
              }
            }}
            placeholder={'$.event_type == "user.created"\n$.user.id == "${user_id}"'}
            rows={3}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            One condition per line. All must match.
          </p>
        </div>
      </div>

      {/* SASL (collapsed by default) */}
      <details className="space-y-3 p-3 border rounded-lg">
        <summary className="text-sm font-medium cursor-pointer">
          SASL Authentication
        </summary>
        <div className="space-y-3 pt-3">
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
                <SelectItem value="PLAIN">PLAIN</SelectItem>
                <SelectItem value="SCRAM-SHA-256">SCRAM-SHA-256</SelectItem>
                <SelectItem value="SCRAM-SHA-512">SCRAM-SHA-512</SelectItem>
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
      </details>
    </div>
  );
}
