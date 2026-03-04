'use client';

import { Database, Play, Clock, CheckCircle } from 'lucide-react';
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

interface DatabaseQueryFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  className?: string;
}

const DATABASE_TYPES = [
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'mongodb', label: 'MongoDB' },
  { value: 'redis', label: 'Redis' },
];

export default function DatabaseQueryForm({
  config,
  onChange,
  className,
}: DatabaseQueryFormProps) {
  const params = (config.params as string[]) || [];

  const handleParamsChange = (value: string) => {
    try {
      const parsed = JSON.parse(value);
      onChange('params', Array.isArray(parsed) ? parsed : []);
    } catch {
      // Keep existing params if invalid JSON
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <Database className="h-4 w-4 text-purple-500" />
        <span className="text-sm font-medium">Database Query</span>
      </div>

      <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg">
        <p className="text-sm text-blue-900 dark:text-blue-300">
          Execute SQL queries or database operations with parameterized queries and polling support.
        </p>
      </div>

      {/* Database Type */}
      <div className="space-y-2">
        <Label htmlFor="db_type">Database Type</Label>
        <Select
          value={(config.db_type as string) || 'postgresql'}
          onValueChange={(v) => onChange('db_type', v)}
        >
          <SelectTrigger id="db_type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATABASE_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Connection String */}
      <div className="space-y-2">
        <Label htmlFor="connection">Connection String</Label>
        <Input
          id="connection"
          value={(config.connection as string) || ''}
          onChange={(e) => onChange('connection', e.target.value)}
          placeholder="postgresql://user:password@localhost:5432/dbname"
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Use {'${DB_URL}'} for environment variable substitution
        </p>
      </div>

      {/* Query */}
      <div className="space-y-2">
        <Label htmlFor="query">SQL Query</Label>
        <Textarea
          id="query"
          value={(config.query as string) || ''}
          onChange={(e) => onChange('query', e.target.value)}
          placeholder="SELECT * FROM users WHERE id = $1"
          rows={6}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Use $1, $2, etc. for PostgreSQL or ? for MySQL placeholders
        </p>
      </div>

      {/* Parameters */}
      <div className="space-y-2">
        <Label htmlFor="params">Query Parameters (JSON Array)</Label>
        <Textarea
          id="params"
          value={JSON.stringify(params, null, 2)}
          onChange={(e) => handleParamsChange(e.target.value)}
          placeholder='[1, "user@example.com", "${user_id}"]'
          rows={3}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Array of values for query placeholders. Supports variable interpolation.
        </p>
      </div>

      {/* Query Type */}
      <div className="space-y-2">
        <Label htmlFor="query_type">Query Type</Label>
        <Select
          value={(config.query_type as string) || 'query'}
          onValueChange={(v) => onChange('query_type', v)}
        >
          <SelectTrigger id="query_type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="query">
              <div>
                <div className="font-medium">Query (Read)</div>
                <div className="text-xs text-muted-foreground">
                  SELECT statements, returns rows
                </div>
              </div>
            </SelectItem>
            <SelectItem value="exec">
              <div>
                <div className="font-medium">Exec (Write)</div>
                <div className="text-xs text-muted-foreground">
                  INSERT, UPDATE, DELETE statements
                </div>
              </div>
            </SelectItem>
            <SelectItem value="transaction">
              <div>
                <div className="font-medium">Transaction</div>
                <div className="text-xs text-muted-foreground">
                  Execute multiple queries in a transaction
                </div>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Polling Configuration */}
      <details className="space-y-3 p-3 border rounded-lg">
        <summary className="text-sm font-medium cursor-pointer flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Polling Configuration (Optional)
        </summary>
        <div className="pt-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Polling</Label>
              <p className="text-xs text-muted-foreground">
                Re-run query until condition is met
              </p>
            </div>
            <Switch
              checked={(config.poll as boolean) || false}
              onCheckedChange={(checked) => onChange('poll', checked)}
            />
          </div>

          {(config.poll as boolean) && (
            <>
              <div className="space-y-2">
                <Label htmlFor="poll_until">Poll Until (Condition)</Label>
                <Input
                  id="poll_until"
                  value={(config.poll_until as string) || ''}
                  onChange={(e) => onChange('poll_until', e.target.value)}
                  placeholder="$.rows.length > 0"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  JSONPath condition to stop polling
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="poll_interval">Poll Interval</Label>
                <Input
                  id="poll_interval"
                  value={(config.poll_interval as string) || '2s'}
                  onChange={(e) => onChange('poll_interval', e.target.value)}
                  placeholder="2s"
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="poll_timeout">Poll Timeout</Label>
                <Input
                  id="poll_timeout"
                  value={(config.poll_timeout as string) || '30s'}
                  onChange={(e) => onChange('poll_timeout', e.target.value)}
                  placeholder="30s"
                  className="font-mono text-sm"
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
          {/* Max Rows */}
          <div className="space-y-2">
            <Label htmlFor="max_rows">Max Rows</Label>
            <Input
              id="max_rows"
              type="number"
              min="0"
              value={(config.max_rows as number) || 0}
              onChange={(e) => onChange('max_rows', parseInt(e.target.value) || 0)}
              placeholder="0 (unlimited)"
            />
            <p className="text-xs text-muted-foreground">
              Limit number of rows returned. 0 = unlimited.
            </p>
          </div>

          {/* Row Mapping */}
          <div className="space-y-2">
            <Label htmlFor="row_mapper">Row Mapping (JSONPath)</Label>
            <Input
              id="row_mapper"
              value={(config.row_mapper as string) || ''}
              onChange={(e) => onChange('row_mapper', e.target.value)}
              placeholder="$.rows[*].{id: id, name: name}"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Transform query results using JSONPath
            </p>
          </div>

          {/* Timeout */}
          <div className="space-y-2">
            <Label htmlFor="timeout">Query Timeout</Label>
            <Input
              id="timeout"
              value={(config.timeout as string) || '30s'}
              onChange={(e) => onChange('timeout', e.target.value)}
              placeholder="30s"
              className="font-mono text-sm"
            />
          </div>

          {/* Read-only Mode */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Read-only Mode</Label>
              <p className="text-xs text-muted-foreground">
                Prevent any write operations
              </p>
            </div>
            <Switch
              checked={(config.read_only as boolean) || false}
              onCheckedChange={(checked) => onChange('read_only', checked)}
            />
          </div>
        </div>
      </details>

      {/* Examples */}
      <details className="space-y-2 p-3 border rounded-lg">
        <summary className="text-sm font-medium cursor-pointer">
          Example Queries
        </summary>
        <div className="pt-2 space-y-3 text-xs">
          <div>
            <p className="font-medium mb-1">1. Parameterized Select</p>
            <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
              <div>Query: SELECT * FROM users WHERE email = $1</div>
              <div>Params: ["{'${user_email}'}"]</div>
            </div>
          </div>

          <div>
            <p className="font-medium mb-1">2. Insert with Return</p>
            <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
              <div>Query: INSERT INTO orders (user_id, amount)</div>
              <div>       VALUES ($1, $2) RETURNING id</div>
              <div>Params: ["{'${user_id}'}", 99.99]</div>
            </div>
          </div>

          <div>
            <p className="font-medium mb-1">3. Poll Until Record Exists</p>
            <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
              <div>Query: SELECT * FROM jobs WHERE id = $1</div>
              <div>Poll Until: $.rows[0].status == "completed"</div>
              <div>Interval: 2s, Timeout: 30s</div>
            </div>
          </div>
        </div>
      </details>

      {/* Output Info */}
      <div className="p-3 bg-muted/30 border rounded-lg space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CheckCircle className="h-4 w-4" />
          Output Format
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <div>• <span className="font-mono">rows</span> - Array of result rows</div>
          <div>• <span className="font-mono">rowCount</span> - Number of rows affected</div>
          <div>• <span className="font-mono">fields</span> - Column metadata</div>
        </div>
      </div>
    </div>
  );
}
