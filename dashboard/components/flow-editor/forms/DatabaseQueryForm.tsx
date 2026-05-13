'use client';

import { Database, CheckCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface DatabaseQueryFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  className?: string;
}

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

      <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
        <p className="text-sm text-foreground">
          Execute SQL queries against a PostgreSQL database with parameterized query support.
        </p>
      </div>

      {/* Database Type (static) */}
      <div className="space-y-2">
        <Label>Database Type</Label>
        <div className="px-3 py-2 rounded-md border bg-muted/40 text-sm text-muted-foreground">
          PostgreSQL
        </div>
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
          Use $1, $2, etc. for parameterized placeholders. Query type is auto-detected (SELECT / INSERT / UPDATE / DELETE).
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
              Limit rows returned for SELECT queries. 0 = unlimited. Appends LIMIT automatically.
            </p>
          </div>

          {/* Timeout */}
          <div className="space-y-2">
            <Label htmlFor="timeout">Query Timeout</Label>
            <Input
              id="timeout"
              value={(config.timeout as string) || ''}
              onChange={(e) => onChange('timeout', e.target.value)}
              placeholder="30s"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Cancel the query after this duration (e.g. <span className="font-mono">10s</span>, <span className="font-mono">1m</span>). Leave blank for no timeout.
            </p>
          </div>
        </div>
      </details>

      {/* Polling hint */}
      <div className="p-3 bg-muted/30 border rounded-lg">
        <p className="text-xs text-muted-foreground">
          For polling queries, use the <span className="font-mono">db_poll</span> action instead.
        </p>
      </div>

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
            <p className="font-medium mb-1">3. Limited Select</p>
            <div className="p-2 bg-muted rounded font-mono text-[10px] space-y-1">
              <div>Query: SELECT * FROM audit_log ORDER BY created_at DESC</div>
              <div>Max Rows: 100</div>
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
          <div>• <span className="font-mono">rows</span> - Array of result rows (SELECT)</div>
          <div>• <span className="font-mono">row_count</span> - Number of rows returned</div>
          <div>• <span className="font-mono">first_row</span> - First result row (convenience)</div>
          <div>• <span className="font-mono">rows_affected</span> - Rows affected (INSERT/UPDATE/DELETE)</div>
        </div>
      </div>
    </div>
  );
}
