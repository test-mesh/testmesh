'use client';

import { useState } from 'react';
import { Database, Plus, Trash2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface PostgreSQLNativeFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  action?: string;
  className?: string;
}

export default function PostgreSQLNativeForm({
  config,
  onChange,
  action,
  className,
}: PostgreSQLNativeFormProps) {
  const [useConnectionString, setUseConnectionString] = useState(
    !!(config.connectionString as string)
  );

  const needsQuery = action === 'postgresql.query' || action === 'postgresql.assert' || action === 'postgresql.execute';
  const needsTable = action === 'postgresql.insert' || action === 'postgresql.update' || action === 'postgresql.delete' || action === 'postgresql.columns';
  const needsData = action === 'postgresql.insert' || action === 'postgresql.update';
  const needsWhere = action === 'postgresql.update' || action === 'postgresql.delete';
  const needsReturning = action === 'postgresql.insert' || action === 'postgresql.update' || action === 'postgresql.delete';
  const needsSchema = action === 'postgresql.tables' || action === 'postgresql.columns';
  const needsStatements = action === 'postgresql.transaction';
  const isAssert = action === 'postgresql.assert';

  const assertions = (config.assertions as string[]) || [];

  const addAssertion = () => {
    onChange('assertions', [...assertions, '']);
  };

  const updateAssertion = (index: number, value: string) => {
    const updated = [...assertions];
    updated[index] = value;
    onChange('assertions', updated);
  };

  const removeAssertion = (index: number) => {
    onChange('assertions', assertions.filter((_, i) => i !== index));
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <Database className="h-4 w-4 text-blue-600" />
        <span className="text-sm font-medium">PostgreSQL</span>
        {action && (
          <span className="text-xs text-muted-foreground font-mono">({action})</span>
        )}
      </div>

      {/* Connection */}
      <details className="space-y-3 p-3 border rounded-lg">
        <summary className="text-sm font-medium cursor-pointer">Connection</summary>
        <div className="space-y-3 pt-3">
          <div className="flex items-center justify-between">
            <Label>Use connection string</Label>
            <Switch
              checked={useConnectionString}
              onCheckedChange={(checked) => {
                setUseConnectionString(checked);
                if (checked) {
                  // Clear individual fields
                  onChange('host', undefined);
                  onChange('port', undefined);
                  onChange('user', undefined);
                  onChange('password', undefined);
                  onChange('database', undefined);
                  onChange('sslmode', undefined);
                } else {
                  onChange('connectionString', undefined);
                }
              }}
            />
          </div>

          {useConnectionString ? (
            <div className="space-y-2">
              <Label htmlFor="pg-connection-string">Connection String</Label>
              <Input
                id="pg-connection-string"
                value={(config.connectionString as string) || ''}
                onChange={(e) => onChange('connectionString', e.target.value)}
                placeholder="postgresql://user:password@localhost:5432/dbname"
                className="font-mono text-sm"
              />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="pg-host">Host</Label>
                <Input
                  id="pg-host"
                  value={(config.host as string) || ''}
                  onChange={(e) => onChange('host', e.target.value)}
                  placeholder="localhost"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pg-port">Port</Label>
                <Input
                  id="pg-port"
                  value={(config.port as string) || ''}
                  onChange={(e) => onChange('port', e.target.value)}
                  placeholder="5432"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pg-user">User</Label>
                <Input
                  id="pg-user"
                  value={(config.user as string) || ''}
                  onChange={(e) => onChange('user', e.target.value)}
                  placeholder="postgres"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pg-password">Password</Label>
                <Input
                  id="pg-password"
                  type="password"
                  value={(config.password as string) || ''}
                  onChange={(e) => onChange('password', e.target.value)}
                  placeholder="${DB_PASSWORD}"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pg-database">Database</Label>
                <Input
                  id="pg-database"
                  value={(config.database as string) || ''}
                  onChange={(e) => onChange('database', e.target.value)}
                  placeholder="postgres"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pg-sslmode">SSL Mode</Label>
                <Select
                  value={(config.sslmode as string) || 'disable'}
                  onValueChange={(v) => onChange('sslmode', v)}
                >
                  <SelectTrigger id="pg-sslmode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disable">Disable</SelectItem>
                    <SelectItem value="require">Require</SelectItem>
                    <SelectItem value="verify-full">Verify Full</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
      </details>

      {/* Query — for query/assert */}
      {(action === 'postgresql.query' || action === 'postgresql.assert') && (
        <div className="space-y-2">
          <Label htmlFor="pg-query">SQL Query</Label>
          <Textarea
            id="pg-query"
            value={(config.query as string) || ''}
            onChange={(e) => onChange('query', e.target.value)}
            placeholder="SELECT * FROM users WHERE id = $1"
            rows={6}
            className="font-mono text-sm"
          />
        </div>
      )}

      {/* Statement — for execute */}
      {action === 'postgresql.execute' && (
        <div className="space-y-2">
          <Label htmlFor="pg-statement">SQL Statement</Label>
          <Textarea
            id="pg-statement"
            value={(config.statement as string) || ''}
            onChange={(e) => onChange('statement', e.target.value)}
            placeholder="INSERT INTO users (name, email) VALUES ($1, $2)"
            rows={6}
            className="font-mono text-sm"
          />
        </div>
      )}

      {/* Table — for insert/update/delete/columns */}
      {needsTable && (
        <div className="space-y-2">
          <Label htmlFor="pg-table">Table</Label>
          <Input
            id="pg-table"
            value={(config.table as string) || ''}
            onChange={(e) => onChange('table', e.target.value)}
            placeholder="users"
            className="font-mono text-sm"
          />
        </div>
      )}

      {/* Data — for insert/update */}
      {needsData && (
        <div className="space-y-2">
          <Label htmlFor="pg-data">Data (JSON object)</Label>
          <Textarea
            id="pg-data"
            value={(config.data as string) || ''}
            onChange={(e) => onChange('data', e.target.value)}
            placeholder='{"name": "${user_name}", "email": "${user_email}"}'
            rows={4}
            className="font-mono text-sm"
          />
        </div>
      )}

      {/* Where + WhereParams — for update/delete */}
      {needsWhere && (
        <>
          <div className="space-y-2">
            <Label htmlFor="pg-where">Where Clause</Label>
            <Input
              id="pg-where"
              value={(config.where as string) || ''}
              onChange={(e) => onChange('where', e.target.value)}
              placeholder="id = $1"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pg-where-params">Where Params (JSON array)</Label>
            <Textarea
              id="pg-where-params"
              value={(config.whereParams as string) || ''}
              onChange={(e) => onChange('whereParams', e.target.value)}
              placeholder='["${user_id}"]'
              rows={2}
              className="font-mono text-sm"
            />
          </div>
        </>
      )}

      {/* Returning — for insert/update/delete */}
      {needsReturning && (
        <div className="space-y-2">
          <Label htmlFor="pg-returning">Returning (optional)</Label>
          <Input
            id="pg-returning"
            value={(config.returning as string) || ''}
            onChange={(e) => onChange('returning', e.target.value)}
            placeholder="id, created_at"
            className="font-mono text-sm"
          />
        </div>
      )}

      {/* Schema — for tables/columns */}
      {needsSchema && (
        <div className="space-y-2">
          <Label htmlFor="pg-schema">Schema</Label>
          <Input
            id="pg-schema"
            value={(config.schema as string) || ''}
            onChange={(e) => onChange('schema', e.target.value)}
            placeholder="public"
            className="font-mono text-sm"
          />
        </div>
      )}

      {/* Statements — for transaction */}
      {needsStatements && (
        <div className="space-y-2">
          <Label htmlFor="pg-statements">Statements (one per line)</Label>
          <Textarea
            id="pg-statements"
            value={(config.statements as string[] || []).join('\n')}
            onChange={(e) => onChange('statements', e.target.value.split('\n').filter(s => s.trim() !== ''))}
            placeholder={
              'INSERT INTO orders (user_id) VALUES ($1);\nUPDATE users SET order_count = order_count + 1 WHERE id = $1;'
            }
            rows={6}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Each statement runs within the same transaction. All succeed or all roll back.
          </p>
        </div>
      )}

      {/* Assertions — for postgresql.assert */}
      {isAssert && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Assertions</Label>
            <Button variant="outline" size="sm" onClick={addAssertion} type="button">
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          </div>
          {assertions.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No assertions yet. Click Add to create one.
            </p>
          )}
          {assertions.map((assertion, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={assertion}
                onChange={(e) => updateAssertion(index, e.target.value)}
                placeholder='rows[0].status == "active"'
                className="font-mono text-sm flex-1"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeAssertion(index)}
                type="button"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
