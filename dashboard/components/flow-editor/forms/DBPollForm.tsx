'use client';

import { Database, Plus, Trash2 } from 'lucide-react';
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

interface DBPollFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  className?: string;
}

const CONDITION_TYPES = [
  { value: 'row_exists', label: 'Row Exists', description: 'At least one row matches' },
  { value: 'row_count', label: 'Row Count', description: 'Specific number of rows' },
  { value: 'value_equals', label: 'Value Equals', description: 'Column has expected value' },
  { value: 'value_not_null', label: 'Value Not Null', description: 'Column value is not null' },
];

export default function DBPollForm({
  config,
  onChange,
  className,
}: DBPollFormProps) {
  const condition = (config.condition as Record<string, any>) || { type: 'row_exists' };
  const params = (config.params as string[]) || [];

  const updateCondition = (key: string, value: unknown) => {
    onChange('condition', { ...condition, [key]: value });
  };

  const addParam = () => {
    onChange('params', [...params, '']);
  };

  const updateParam = (index: number, value: string) => {
    const updated = [...params];
    updated[index] = value;
    onChange('params', updated);
  };

  const removeParam = (index: number) => {
    onChange('params', params.filter((_, i) => i !== index));
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <Database className="h-4 w-4 text-purple-500" />
        <span className="text-sm font-medium">DB Poll</span>
      </div>

      <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg">
        <p className="text-sm text-blue-900 dark:text-blue-300">
          Polls a database query until a condition is met or timeout is reached.
        </p>
      </div>

      {/* Connection */}
      <div className="space-y-2">
        <Label htmlFor="connection">Connection String</Label>
        <Input
          id="connection"
          value={(config.connection as string) || ''}
          onChange={(e) => onChange('connection', e.target.value)}
          placeholder="${DB_DSN}"
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Database DSN or use a variable like {'${DB_DSN}'}
        </p>
      </div>

      {/* Query */}
      <div className="space-y-2">
        <Label htmlFor="query">SQL Query</Label>
        <Textarea
          id="query"
          value={(config.query as string) || ''}
          onChange={(e) => onChange('query', e.target.value)}
          placeholder={'SELECT COUNT(*) as cnt FROM orders WHERE status = $1'}
          rows={4}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Use $1, $2, ... for parameters
        </p>
      </div>

      {/* Params */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Query Parameters</Label>
          <Button variant="ghost" size="sm" onClick={addParam} className="h-6 px-2 text-xs">
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
        {params.length === 0 && (
          <p className="text-xs text-muted-foreground">No parameters. Add parameters for $1, $2, ...</p>
        )}
        {params.map((param, i) => (
          <div key={i} className="flex gap-2 items-center">
            <span className="text-xs text-muted-foreground w-6 text-right shrink-0">${i + 1}</span>
            <Input
              value={param}
              onChange={(e) => updateParam(i, e.target.value)}
              placeholder={`value for $${i + 1}`}
              className="font-mono text-sm"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeParam(i)}
              className="h-8 w-8 shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      {/* Condition */}
      <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
        <Label className="text-sm font-medium">Success Condition</Label>

        <div className="space-y-2">
          <Label htmlFor="condition_type" className="text-xs">Type</Label>
          <Select
            value={condition.type || 'row_exists'}
            onValueChange={(v) => updateCondition('type', v)}
          >
            <SelectTrigger id="condition_type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONDITION_TYPES.map((ct) => (
                <SelectItem key={ct.value} value={ct.value}>
                  <div>
                    <div className="font-medium">{ct.label}</div>
                    <div className="text-xs text-muted-foreground">{ct.description}</div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {condition.type === 'row_count' && (
          <div className="space-y-1">
            <Label htmlFor="condition_count" className="text-xs">Expected Count</Label>
            <Input
              id="condition_count"
              type="number"
              min="0"
              value={(condition.count as number) ?? 1}
              onChange={(e) => updateCondition('count', parseInt(e.target.value))}
              placeholder="1"
            />
          </div>
        )}

        {(condition.type === 'value_equals' || condition.type === 'value_not_null') && (
          <div className="space-y-1">
            <Label htmlFor="condition_column" className="text-xs">Column Name</Label>
            <Input
              id="condition_column"
              value={(condition.column as string) || ''}
              onChange={(e) => updateCondition('column', e.target.value)}
              placeholder="status"
              className="font-mono text-sm"
            />
          </div>
        )}

        {condition.type === 'value_equals' && (
          <div className="space-y-1">
            <Label htmlFor="condition_value" className="text-xs">Expected Value</Label>
            <Input
              id="condition_value"
              value={(condition.value as string) || ''}
              onChange={(e) => updateCondition('value', e.target.value)}
              placeholder="completed"
              className="font-mono text-sm"
            />
          </div>
        )}
      </div>

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
          Max time to poll (e.g., 30s, 2m, 5m)
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
          Time between DB queries (e.g., 500ms, 1s, 5s)
        </p>
      </div>
    </div>
  );
}
