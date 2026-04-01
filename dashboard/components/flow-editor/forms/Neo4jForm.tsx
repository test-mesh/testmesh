'use client';

import { GitBranch } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface Neo4jFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  action?: string;
  className?: string;
}

export default function Neo4jForm({
  config,
  onChange,
  action,
  className,
}: Neo4jFormProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <GitBranch className="h-4 w-4 text-teal-500" />
        <span className="text-sm font-medium">Neo4j</span>
        {action && (
          <span className="text-xs text-muted-foreground font-mono">({action})</span>
        )}
      </div>

      {/* Connection */}
      <details className="space-y-3 p-3 border rounded-lg">
        <summary className="text-sm font-medium cursor-pointer">Connection</summary>
        <div className="space-y-3 pt-3">
          <div className="space-y-2">
            <Label htmlFor="neo4j-url">URL</Label>
            <Input
              id="neo4j-url"
              value={(config.url as string) || ''}
              onChange={(e) => onChange('url', e.target.value)}
              placeholder="bolt://localhost:7687"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="neo4j-username">Username</Label>
            <Input
              id="neo4j-username"
              value={(config.username as string) || ''}
              onChange={(e) => onChange('username', e.target.value)}
              placeholder="neo4j"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="neo4j-password">Password</Label>
            <Input
              id="neo4j-password"
              type="password"
              value={(config.password as string) || ''}
              onChange={(e) => onChange('password', e.target.value)}
              placeholder="${NEO4J_PASSWORD}"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="neo4j-database">Database</Label>
            <Input
              id="neo4j-database"
              value={(config.database as string) || ''}
              onChange={(e) => onChange('database', e.target.value)}
              placeholder="neo4j"
              className="font-mono text-sm"
            />
          </div>
        </div>
      </details>

      {/* Query */}
      <div className="space-y-2">
        <Label htmlFor="neo4j-query">Cypher Query</Label>
        <Textarea
          id="neo4j-query"
          value={(config.query as string) || ''}
          onChange={(e) => onChange('query', e.target.value)}
          placeholder="MATCH (n:Person {name: $name}) RETURN n"
          rows={6}
          className="font-mono text-sm"
        />
      </div>

      {/* Params */}
      <div className="space-y-2">
        <Label htmlFor="neo4j-params">Parameters (JSON object, optional)</Label>
        <Textarea
          id="neo4j-params"
          value={(config.params as string) || ''}
          onChange={(e) => onChange('params', e.target.value)}
          placeholder='{"name": "${user_name}"}'
          rows={3}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          JSON object of parameter bindings. Supports variable interpolation.
        </p>
      </div>
    </div>
  );
}
