# Flow UI / Backend Gap Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all gaps between the TestMesh flow editor UI and the backend execution engine — critical field mismatches, missing UI for existing backend features, and missing backend handlers for UI-only actions.

**Architecture:** Five independent groups (1=Kafka+DB bug fixes, 2=plugin UI, 3=control-flow backends, 4=integration backends, 5=step-level fields). Groups share no file dependencies and can be parallelized. Backend actions are in `testmesh/api/internal/runner/actions/`. UI forms are in `testmesh/dashboard/components/flow-editor/`.

**Tech Stack:** Go 1.25 (backend), Next.js/React (dashboard), IBM/sarama (Kafka), gorm/postgres, expr-lang/expr (expression evaluation), lucide-react + shadcn/ui (form components)

---

## Group 1 — Kafka & Database Form Fixes

### Task 1: Fix Kafka Consumer field name mismatch

**Files:**
- Modify: `testmesh/dashboard/components/flow-editor/forms/KafkaConsumeForm.tsx`

The form currently uses `config.match` but the backend `parseKafkaConsumerConfig` reads `config["filter"]`. This causes all filter configs to be silently ignored.

- [ ] **Step 1: Fix `match` → `filter` throughout KafkaConsumeForm.tsx**

Replace every occurrence of `config.match` with `config.filter` and `onChange('match', ...)` with `onChange('filter', ...)`:

```tsx
// Line 29: was: const hasMatch = !!config.match;
const hasFilter = !!config.filter;

// Line 140: was: value={((config.match as Record<string, any>)?.key as string) || ''}
value={((config.filter as Record<string, any>)?.key as string) || ''}

// Line 142-155: was: onChange('match', { ...(config.match as object || {}), key: e.target.value })
// Change all four match references:
onChange={(e) => {
  if (e.target.value) {
    onChange('filter', {
      ...(config.filter as object || {}),
      key: e.target.value,
    });
  } else {
    const filter = { ...(config.filter as Record<string, any> || {}) };
    delete filter.key;
    onChange('filter', Object.keys(filter).length > 0 ? filter : undefined);
  }
}}

// Line 163-186: JSONPath section — was: (config.match as Record<string, any>)?.json_path
// Fix the read:
value={
  ((config.filter as Record<string, any>)?.json_path as string[])?.join('\n') || ''
}
// Fix the write — serialize array to single string (backend expects string):
onChange={(e) => {
  const lines = e.target.value.split('\n').filter(Boolean);
  if (lines.length > 0) {
    onChange('filter', {
      ...(config.filter as object || {}),
      json_path: lines.join(' && '),  // serialize to single string
    });
  } else {
    const filter = { ...(config.filter as Record<string, any> || {}) };
    delete filter.json_path;
    onChange('filter', Object.keys(filter).length > 0 ? filter : undefined);
  }
}}
```

Also update the label section (line 126-129):
```tsx
// was: const hasMatch = !!config.match;
// was: <Label>Message Matching (Optional)</Label>
// change: no label change needed, just the variable
```

- [ ] **Step 2: Fix default timeout in utils.ts**

In `testmesh/dashboard/components/flow-editor/utils.ts`, line 52:
```ts
// was:
kafka_consumer: {
  brokers: ['localhost:9092'],
  topic: '',
  group_id: '',
  timeout: '10s',   // ← wrong, backend default is 30s
  count: 1,
  from_beginning: false,
},
// fix:
kafka_consumer: {
  brokers: ['localhost:9092'],
  topic: '',
  group_id: '',
  timeout: '30s',
  count: 1,
  from_beginning: false,
},
```

- [ ] **Step 3: Add missing filter fields to KafkaConsumeForm.tsx**

After the existing JSONPath block (after line 186), add three more filter fields inside the filter `<div>`:

```tsx
{/* Key Pattern (regex) */}
<div className="space-y-2">
  <Label htmlFor="key_pattern">Key Pattern (regex)</Label>
  <Input
    id="key_pattern"
    value={((config.filter as Record<string, any>)?.key_pattern as string) || ''}
    onChange={(e) => {
      if (e.target.value) {
        onChange('filter', { ...(config.filter as object || {}), key_pattern: e.target.value });
      } else {
        const filter = { ...(config.filter as Record<string, any> || {}) };
        delete filter.key_pattern;
        onChange('filter', Object.keys(filter).length > 0 ? filter : undefined);
      }
    }}
    placeholder="^user\.\d+$"
    className="font-mono"
  />
</div>

{/* JSON Value */}
<div className="space-y-2">
  <Label htmlFor="json_value">JSONPath Expected Value</Label>
  <Input
    id="json_value"
    value={((config.filter as Record<string, any>)?.json_value as string) || ''}
    onChange={(e) => {
      if (e.target.value) {
        onChange('filter', { ...(config.filter as object || {}), json_value: e.target.value });
      } else {
        const filter = { ...(config.filter as Record<string, any> || {}) };
        delete filter.json_value;
        onChange('filter', Object.keys(filter).length > 0 ? filter : undefined);
      }
    }}
    placeholder='"user.created"'
    className="font-mono"
  />
</div>
```

- [ ] **Step 4: Add `auto_offset_reset` and TLS section**

After the `from_beginning` Switch block, add:

```tsx
{/* Auto Offset Reset — only show when from_beginning is false */}
{!(config.from_beginning as boolean) && (
  <div className="space-y-2">
    <Label htmlFor="auto_offset_reset">Offset Reset</Label>
    <Select
      value={(config.auto_offset_reset as string) || 'latest'}
      onValueChange={(v) => onChange('auto_offset_reset', v)}
    >
      <SelectTrigger id="auto_offset_reset">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="latest">Latest (new messages only)</SelectItem>
        <SelectItem value="earliest">Earliest (from beginning)</SelectItem>
      </SelectContent>
    </Select>
  </div>
)}
```

After the SASL `<details>` block, add TLS:

```tsx
{/* TLS (collapsed by default) */}
<details className="space-y-3 p-3 border rounded-lg">
  <summary className="text-sm font-medium cursor-pointer">TLS Configuration</summary>
  <div className="space-y-3 pt-3">
    <div className="flex items-center justify-between">
      <Label>Enable TLS</Label>
      <Switch
        checked={((config.tls as Record<string, any>)?.enabled as boolean) || false}
        onCheckedChange={(checked) =>
          onChange('tls', { ...(config.tls as object || {}), enabled: checked })
        }
      />
    </div>
    {(config.tls as Record<string, any>)?.enabled && (
      <>
        <div className="flex items-center justify-between">
          <Label>Skip Verify</Label>
          <Switch
            checked={((config.tls as Record<string, any>)?.insecure_skip_verify as boolean) || false}
            onCheckedChange={(checked) =>
              onChange('tls', { ...(config.tls as object || {}), insecure_skip_verify: checked })
            }
          />
        </div>
        {(['cert_file', 'key_file', 'ca_file'] as const).map((field) => (
          <div key={field} className="space-y-2">
            <Label htmlFor={field}>{field.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</Label>
            <Input
              id={field}
              value={((config.tls as Record<string, any>)?.[field] as string) || ''}
              onChange={(e) =>
                onChange('tls', { ...(config.tls as object || {}), [field]: e.target.value })
              }
              placeholder={`/path/to/${field.replace('_file', '.pem')}`}
              className="font-mono text-sm"
            />
          </div>
        ))}
      </>
    )}
  </div>
</details>
```

- [ ] **Step 5: Verify lint passes**

```bash
cd testmesh/dashboard && npm run lint
```
Expected: no errors.

- [ ] **Step 6: Commit Group 1, Task 1**

```bash
cd testmesh
git add dashboard/components/flow-editor/forms/KafkaConsumeForm.tsx dashboard/components/flow-editor/utils.ts
git commit -m "fix: kafka consumer form — match→filter rename, json_path serialization, add missing fields"
```

---

### Task 2: Add Kafka Producer compression + TLS

**Files:**
- Modify: `testmesh/api/internal/runner/actions/async/kafka_producer.go`
- Modify: `testmesh/dashboard/components/flow-editor/forms/KafkaPublishForm.tsx`

- [ ] **Step 1: Add compression to KafkaProducerConfig and Produce()**

In `testmesh/api/internal/runner/actions/async/kafka_producer.go`:

```go
// Add Compression field to KafkaProducerConfig
type KafkaProducerConfig struct {
    Brokers     []string          `yaml:"brokers" json:"brokers"`
    Topic       string            `yaml:"topic" json:"topic"`
    Key         string            `yaml:"key,omitempty" json:"key,omitempty"`
    Payload     interface{}       `yaml:"payload" json:"payload"`
    Headers     map[string]string `yaml:"headers,omitempty" json:"headers,omitempty"`
    Compression string            `yaml:"compression,omitempty" json:"compression,omitempty"` // none|gzip|snappy|lz4
    SASL        *SASLConfig       `yaml:"sasl,omitempty" json:"sasl,omitempty"`
    TLS         *TLSConfig        `yaml:"tls,omitempty" json:"tls,omitempty"`
}
```

In the `Produce()` method, after `saramaConfig.Producer.RequiredAcks = sarama.WaitForAll`, add:

```go
// Compression
switch kp.config.Compression {
case "gzip":
    saramaConfig.Producer.Compression = sarama.CompressionGZIP
case "snappy":
    saramaConfig.Producer.Compression = sarama.CompressionSnappy
case "lz4":
    saramaConfig.Producer.Compression = sarama.CompressionLZ4
default:
    saramaConfig.Producer.Compression = sarama.CompressionNone
}
```

- [ ] **Step 2: Parse compression in kafka_producer.go**

In `testmesh/api/internal/runner/actions/kafka_producer.go`, in `parseKafkaProducerConfig()` (or add parsing in the Execute method before creating KafkaProducerConfig), add:

```go
// After parsing headers, add:
if v, ok := config["compression"].(string); ok {
    cfg.Compression = v
}
```

Find the existing `parseKafkaProducerConfig` function and add this line. Check what fields are already parsed:

```go
// Existing parse function already parses brokers, topic, key, payload, headers, sasl, tls.
// Add after the headers block:
if v, ok := config["compression"].(string); ok {
    cfg.Compression = v
}
```

- [ ] **Step 3: Add TLS section to KafkaPublishForm.tsx**

In `testmesh/dashboard/components/flow-editor/forms/KafkaPublishForm.tsx`, after the SASL `<details>` block, add:

```tsx
{/* TLS (collapsed by default) */}
<details className="space-y-3 p-3 border rounded-lg">
  <summary className="text-sm font-medium cursor-pointer">TLS Configuration</summary>
  <div className="space-y-3 pt-3">
    <div className="flex items-center justify-between">
      <Label>Enable TLS</Label>
      <Switch
        checked={((config.tls as Record<string, any>)?.enabled as boolean) || false}
        onCheckedChange={(checked) =>
          onChange('tls', { ...(config.tls as object || {}), enabled: checked })
        }
      />
    </div>
    {(config.tls as Record<string, any>)?.enabled && (
      <>
        <div className="flex items-center justify-between">
          <Label>Skip Verify</Label>
          <Switch
            checked={((config.tls as Record<string, any>)?.insecure_skip_verify as boolean) || false}
            onCheckedChange={(checked) =>
              onChange('tls', { ...(config.tls as object || {}), insecure_skip_verify: checked })
            }
          />
        </div>
        {(['cert_file', 'key_file', 'ca_file'] as const).map((field) => (
          <div key={field} className="space-y-2">
            <Label htmlFor={`prod_${field}`}>{field.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</Label>
            <Input
              id={`prod_${field}`}
              value={((config.tls as Record<string, any>)?.[field] as string) || ''}
              onChange={(e) =>
                onChange('tls', { ...(config.tls as object || {}), [field]: e.target.value })
              }
              placeholder={`/path/to/${field.replace('_file', '.pem')}`}
              className="font-mono text-sm"
            />
          </div>
        ))}
      </>
    )}
  </div>
</details>
```

Note: `Switch` must be imported if not already. Check existing imports in KafkaPublishForm.tsx.

- [ ] **Step 4: Build and lint**

```bash
cd testmesh/api && go build ./...
cd testmesh/dashboard && npm run lint
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd testmesh
git add api/internal/runner/actions/async/kafka_producer.go \
        api/internal/runner/actions/kafka_producer.go \
        dashboard/components/flow-editor/forms/KafkaPublishForm.tsx
git commit -m "feat: kafka producer compression support + TLS UI for both producer and consumer"
```

---

### Task 3: Clean up DatabaseQueryForm

**Files:**
- Modify: `testmesh/dashboard/components/flow-editor/forms/DatabaseQueryForm.tsx`
- Modify: `testmesh/api/internal/runner/actions/database.go`

- [ ] **Step 1: Remove unsupported fields from DatabaseQueryForm.tsx**

Open `testmesh/dashboard/components/flow-editor/forms/DatabaseQueryForm.tsx`. Remove:
1. The `db_type` dropdown selector (replace with a static "PostgreSQL" label)
2. The polling section (`poll`, `poll_until`, `poll_interval`, `poll_timeout`) — add a note pointing to `db_poll`
3. `row_mapper` field
4. `read_only` field
5. `query_type` dropdown (backend auto-detects)

Replace `db_type` section with:
```tsx
<div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
  <Database className="h-4 w-4 text-blue-500" />
  <span className="text-sm font-medium">PostgreSQL</span>
  <span className="text-xs text-muted-foreground ml-auto">GORM driver</span>
</div>
```

Replace polling section with:
```tsx
<p className="text-xs text-muted-foreground p-2 border rounded-md">
  Need to poll until a condition? Use the <code className="font-mono">db_poll</code> action instead.
</p>
```

- [ ] **Step 2: Add max_rows and timeout to DatabaseQueryForm.tsx**

After the params field, add:

```tsx
{/* Advanced Options */}
<details className="space-y-3 p-3 border rounded-lg">
  <summary className="text-sm font-medium cursor-pointer">Advanced Options</summary>
  <div className="space-y-3 pt-3">
    <div className="space-y-2">
      <Label htmlFor="max_rows">Max Rows</Label>
      <Input
        id="max_rows"
        type="number"
        min="1"
        value={(config.max_rows as number) || ''}
        onChange={(e) => onChange('max_rows', e.target.value ? parseInt(e.target.value) : undefined)}
        placeholder="1000"
      />
      <p className="text-xs text-muted-foreground">Adds LIMIT to SELECT queries</p>
    </div>
    <div className="space-y-2">
      <Label htmlFor="db_timeout">Timeout</Label>
      <Input
        id="db_timeout"
        value={(config.timeout as string) || ''}
        onChange={(e) => onChange('timeout', e.target.value || undefined)}
        placeholder="30s"
        className="font-mono"
      />
    </div>
  </div>
</details>
```

- [ ] **Step 3: Implement max_rows and timeout in database.go**

In `testmesh/api/internal/runner/actions/database.go`, in the `Execute` method, after extracting `query` and `connection`, add:

```go
// Optional max_rows for SELECT queries
var maxRows int
if v, ok := config["max_rows"]; ok {
    switch n := v.(type) {
    case int:
        maxRows = n
    case float64:
        maxRows = int(n)
    }
}

// Optional timeout
if v, ok := config["timeout"].(string); ok && v != "" {
    if d, err := time.ParseDuration(v); err == nil {
        var cancel context.CancelFunc
        ctx, cancel = context.WithTimeout(ctx, d)
        defer cancel()
    }
}
```

Add `"time"` to imports if not present.

In `executeSelect`, apply max_rows after the existing code:
```go
// After: queryType := h.determineQueryType(query)
// and before: return h.executeSelect(db, query, params)
// Add maxRows to executeSelect signature:
func (h *DatabaseHandler) executeSelect(db *gorm.DB, query string, params []interface{}, maxRows int) (models.OutputData, error) {
    // ... existing code ...
    // After db.Raw(query, params...).Rows(), before the rows loop:
    // Apply LIMIT if maxRows > 0 — inject via query modification:
    if maxRows > 0 && !strings.Contains(strings.ToUpper(query), "LIMIT") {
        query = query + fmt.Sprintf(" LIMIT %d", maxRows)
    }
    rows, err := db.Raw(query, params...).Rows()
```

Update the call site: `return h.executeSelect(db, query, params, maxRows)`.

- [ ] **Step 4: Build and lint**

```bash
cd testmesh/api && go build ./...
cd testmesh/dashboard && npm run lint
```

- [ ] **Step 5: Commit**

```bash
cd testmesh
git add api/internal/runner/actions/database.go \
        dashboard/components/flow-editor/forms/DatabaseQueryForm.tsx
git commit -m "fix: database query form — remove unsupported fields, implement max_rows/timeout"
```

---

## Group 2 — Plugin UI (Redis, MinIO, Neo4j, OTel, PostgreSQL native)

All five plugins are already registered in `routes.go` and work via prefix-match. This group is pure UI work.

### Task 4: Add plugin action types to types.ts and utils.ts

**Files:**
- Modify: `testmesh/dashboard/components/flow-editor/types.ts`
- Modify: `testmesh/dashboard/components/flow-editor/utils.ts`

- [ ] **Step 1: Add new ActionTypes to types.ts**

In `types.ts`, add to the `ActionType` union after `'docker_stop'`:

```ts
  // Cache
  | 'redis.get'
  | 'redis.set'
  | 'redis.del'
  | 'redis.exists'
  // Storage
  | 'minio.put'
  | 'minio.get'
  | 'minio.delete'
  | 'minio.assert'
  // Graph DB
  | 'neo4j.query'
  | 'neo4j.assert'
  // Observability
  | 'otel.inject'
  | 'otel.assert'
  // PostgreSQL native
  | 'postgresql.query'
  | 'postgresql.insert'
  | 'postgresql.update'
  | 'postgresql.delete'
  | 'postgresql.assert'
  | 'postgresql.execute'
  | 'postgresql.transaction'
  | 'postgresql.tables'
  | 'postgresql.columns'
  // Mock Server (missing)
  | 'mock_server_configure';
```

- [ ] **Step 2: Add default configs in utils.ts**

In `utils.ts`, add to `defaultConfigs` after `docker_stop`:

```ts
  // Redis
  'redis.get': { host: 'localhost', port: '6379', key: '' },
  'redis.set': { host: 'localhost', port: '6379', key: '', value: '', ttl: '' },
  'redis.del': { host: 'localhost', port: '6379', key: '' },
  'redis.exists': { host: 'localhost', port: '6379', key: '' },
  // MinIO
  'minio.put': { endpoint: 'localhost:9000', access_key: 'minioadmin', secret_key: 'minioadmin', use_ssl: false, bucket: '', object: '', data: '', content_type: 'application/json' },
  'minio.get': { endpoint: 'localhost:9000', access_key: 'minioadmin', secret_key: 'minioadmin', use_ssl: false, bucket: '', object: '', as: 'json' },
  'minio.delete': { endpoint: 'localhost:9000', access_key: 'minioadmin', secret_key: 'minioadmin', use_ssl: false, bucket: '', object: '' },
  'minio.assert': { endpoint: 'localhost:9000', access_key: 'minioadmin', secret_key: 'minioadmin', use_ssl: false, bucket: '', object: '', assertions: [] },
  // Neo4j
  'neo4j.query': { url: 'bolt://localhost:7687', username: 'neo4j', password: '', database: 'neo4j', query: '', params: {} },
  'neo4j.assert': { url: 'bolt://localhost:7687', username: 'neo4j', password: '', database: 'neo4j', query: '', params: {}, assertions: [] },
  // OTel
  'otel.inject': { span_name: 'testmesh-step' },
  'otel.assert': { span_name: 'testmesh-step', backend_url: 'http://localhost:3200', trace_id: '', within: '10s', assertions: [] },
  // PostgreSQL native
  'postgresql.query': { host: 'localhost', port: '5432', user: 'postgres', password: '', database: 'postgres', sslmode: 'disable', query: '', params: [] },
  'postgresql.insert': { host: 'localhost', port: '5432', user: 'postgres', password: '', database: 'postgres', sslmode: 'disable', table: '', data: {}, returning: [] },
  'postgresql.update': { host: 'localhost', port: '5432', user: 'postgres', password: '', database: 'postgres', sslmode: 'disable', table: '', data: {}, where: '', whereParams: [] },
  'postgresql.delete': { host: 'localhost', port: '5432', user: 'postgres', password: '', database: 'postgres', sslmode: 'disable', table: '', where: '', whereParams: [] },
  'postgresql.assert': { host: 'localhost', port: '5432', user: 'postgres', password: '', database: 'postgres', sslmode: 'disable', query: '', params: [], assertions: [] },
  'postgresql.execute': { host: 'localhost', port: '5432', user: 'postgres', password: '', database: 'postgres', sslmode: 'disable', query: '' },
  'postgresql.transaction': { host: 'localhost', port: '5432', user: 'postgres', password: '', database: 'postgres', sslmode: 'disable', statements: [] },
  'postgresql.tables': { host: 'localhost', port: '5432', user: 'postgres', password: '', database: 'postgres', sslmode: 'disable', schema: 'public' },
  'postgresql.columns': { host: 'localhost', port: '5432', user: 'postgres', password: '', database: 'postgres', sslmode: 'disable', table: '', schema: 'public' },
  // Mock server configure
  mock_server_configure: { mock_server_id: '', routes: [] },
```

- [ ] **Step 3: Add icon mappings to PropertiesPanel.tsx**

In `PropertiesPanel.tsx`, extend `actionIcons`:

```ts
// Add after docker_stop:
'redis.get': Database,
'redis.set': Database,
'redis.del': Database,
'redis.exists': Database,
'minio.put': FileText,
'minio.get': FileText,
'minio.delete': FileText,
'minio.assert': FileText,
'neo4j.query': Database,
'neo4j.assert': Database,
'otel.inject': Radio,
'otel.assert': Radio,
'postgresql.query': Database,
'postgresql.insert': Database,
'postgresql.update': Database,
'postgresql.delete': Database,
'postgresql.assert': Database,
'postgresql.execute': Database,
'postgresql.transaction': Database,
'postgresql.tables': Database,
'postgresql.columns': Database,
mock_server_configure: Server,
```

Note: `Radio` is already imported; `Server` is already imported.

- [ ] **Step 4: Lint check**

```bash
cd testmesh/dashboard && npm run lint
```
Expected: TypeScript errors about missing form components (will be fixed in Task 5). Ignore those for now; focus on type union correctness.

- [ ] **Step 5: Commit**

```bash
cd testmesh
git add dashboard/components/flow-editor/types.ts \
        dashboard/components/flow-editor/utils.ts \
        dashboard/components/flow-editor/PropertiesPanel.tsx
git commit -m "feat: add plugin action types to type system (redis, minio, neo4j, otel, postgresql, mock_server_configure)"
```

---

### Task 5: Create plugin form components

**Files:**
- Create: `testmesh/dashboard/components/flow-editor/forms/RedisForm.tsx`
- Create: `testmesh/dashboard/components/flow-editor/forms/MinioForm.tsx`
- Create: `testmesh/dashboard/components/flow-editor/forms/Neo4jForm.tsx`
- Create: `testmesh/dashboard/components/flow-editor/forms/OtelForm.tsx`
- Create: `testmesh/dashboard/components/flow-editor/forms/PostgreSQLNativeForm.tsx`
- Create: `testmesh/dashboard/components/flow-editor/forms/MockServerConfigureForm.tsx`

- [ ] **Step 1: Create RedisForm.tsx**

```tsx
'use client';

import { Database } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface RedisFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  actionType: string; // 'redis.get' | 'redis.set' | 'redis.del' | 'redis.exists'
  className?: string;
}

export default function RedisForm({ config, onChange, actionType, className }: RedisFormProps) {
  const isSet = actionType === 'redis.set';

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <Database className="h-4 w-4 text-red-500" />
        <span className="text-sm font-medium">Redis — {actionType.split('.')[1]}</span>
      </div>

      {/* Connection */}
      <details className="space-y-3 p-3 border rounded-lg" open={false}>
        <summary className="text-sm font-medium cursor-pointer">Connection</summary>
        <div className="space-y-3 pt-3">
          <div className="space-y-2">
            <Label htmlFor="redis_host">Host</Label>
            <Input id="redis_host" value={(config.host as string) || 'localhost'}
              onChange={(e) => onChange('host', e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="redis_port">Port</Label>
            <Input id="redis_port" value={(config.port as string) || '6379'}
              onChange={(e) => onChange('port', e.target.value)} className="font-mono" />
          </div>
        </div>
      </details>

      {/* Key */}
      <div className="space-y-2">
        <Label htmlFor="redis_key">Key</Label>
        <Input id="redis_key" value={(config.key as string) || ''}
          onChange={(e) => onChange('key', e.target.value)}
          placeholder="user:${user_id}" className="font-mono" />
      </div>

      {/* Value — only for set */}
      {isSet && (
        <>
          <div className="space-y-2">
            <Label htmlFor="redis_value">Value</Label>
            <Input id="redis_value" value={(config.value as string) || ''}
              onChange={(e) => onChange('value', e.target.value)}
              placeholder='"active"' className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="redis_ttl">TTL (optional)</Label>
            <Input id="redis_ttl" value={(config.ttl as string) || ''}
              onChange={(e) => onChange('ttl', e.target.value || undefined)}
              placeholder="10s, 1h" className="font-mono" />
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create MinioForm.tsx**

```tsx
'use client';

import { FileText } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface MinioFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  actionType: string;
  className?: string;
}

export default function MinioForm({ config, onChange, actionType, className }: MinioFormProps) {
  const isPut = actionType === 'minio.put';
  const isGet = actionType === 'minio.get';
  const isAssert = actionType === 'minio.assert';

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <FileText className="h-4 w-4 text-orange-500" />
        <span className="text-sm font-medium">MinIO — {actionType.split('.')[1]}</span>
      </div>

      {/* Connection */}
      <details className="space-y-3 p-3 border rounded-lg">
        <summary className="text-sm font-medium cursor-pointer">Connection</summary>
        <div className="space-y-3 pt-3">
          <div className="space-y-2">
            <Label>Endpoint</Label>
            <Input value={(config.endpoint as string) || 'localhost:9000'}
              onChange={(e) => onChange('endpoint', e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label>Access Key</Label>
            <Input value={(config.access_key as string) || ''}
              onChange={(e) => onChange('access_key', e.target.value)} placeholder="${MINIO_ACCESS_KEY}" />
          </div>
          <div className="space-y-2">
            <Label>Secret Key</Label>
            <Input type="password" value={(config.secret_key as string) || ''}
              onChange={(e) => onChange('secret_key', e.target.value)} placeholder="${MINIO_SECRET_KEY}" />
          </div>
          <div className="flex items-center justify-between">
            <Label>Use SSL</Label>
            <Switch checked={(config.use_ssl as boolean) || false}
              onCheckedChange={(v) => onChange('use_ssl', v)} />
          </div>
        </div>
      </details>

      {/* Bucket + Object */}
      <div className="space-y-2">
        <Label>Bucket</Label>
        <Input value={(config.bucket as string) || ''}
          onChange={(e) => onChange('bucket', e.target.value)} placeholder="test-results" className="font-mono" />
      </div>
      <div className="space-y-2">
        <Label>Object Path</Label>
        <Input value={(config.object as string) || ''}
          onChange={(e) => onChange('object', e.target.value)} placeholder="runs/${EXECUTION_ID}/results.json" className="font-mono" />
      </div>

      {/* Put-specific */}
      {isPut && (
        <>
          <div className="space-y-2">
            <Label>Data</Label>
            <Textarea value={(config.data as string) || ''}
              onChange={(e) => onChange('data', e.target.value)}
              placeholder='{"status": "passed"}' className="font-mono text-sm" rows={4} />
          </div>
          <div className="space-y-2">
            <Label>Content Type</Label>
            <Input value={(config.content_type as string) || 'application/json'}
              onChange={(e) => onChange('content_type', e.target.value)} className="font-mono" />
          </div>
        </>
      )}

      {/* Get-specific */}
      {isGet && (
        <div className="space-y-2">
          <Label>Parse as</Label>
          <Select value={(config.as as string) || 'json'} onValueChange={(v) => onChange('as', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="json">JSON</SelectItem>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="base64">Base64</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Assert-specific */}
      {isAssert && (
        <div className="space-y-2">
          <Label>Assertions (one per line)</Label>
          <Textarea
            value={((config.assertions as string[]) || []).join('\n')}
            onChange={(e) => onChange('assertions', e.target.value.split('\n').filter(Boolean))}
            placeholder={'body.status == "active"\nbody.count > 0'} className="font-mono text-sm" rows={4} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create Neo4jForm.tsx**

```tsx
'use client';

import { Database } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface Neo4jFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  actionType: string;
  className?: string;
}

export default function Neo4jForm({ config, onChange, actionType, className }: Neo4jFormProps) {
  const isAssert = actionType === 'neo4j.assert';

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <Database className="h-4 w-4 text-green-500" />
        <span className="text-sm font-medium">Neo4j — {actionType.split('.')[1]}</span>
      </div>

      {/* Connection */}
      <details className="space-y-3 p-3 border rounded-lg">
        <summary className="text-sm font-medium cursor-pointer">Connection</summary>
        <div className="space-y-3 pt-3">
          <div className="space-y-2">
            <Label>Bolt URL</Label>
            <Input value={(config.url as string) || 'bolt://localhost:7687'}
              onChange={(e) => onChange('url', e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label>Username</Label>
            <Input value={(config.username as string) || 'neo4j'}
              onChange={(e) => onChange('username', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <Input type="password" value={(config.password as string) || ''}
              onChange={(e) => onChange('password', e.target.value)} placeholder="${NEO4J_PASSWORD}" />
          </div>
          <div className="space-y-2">
            <Label>Database</Label>
            <Input value={(config.database as string) || 'neo4j'}
              onChange={(e) => onChange('database', e.target.value)} className="font-mono" />
          </div>
        </div>
      </details>

      {/* Query */}
      <div className="space-y-2">
        <Label>Cypher Query</Label>
        <Textarea value={(config.query as string) || ''}
          onChange={(e) => onChange('query', e.target.value)}
          placeholder={'MATCH (u:User {id: $id})\nRETURN u.name as name, u.email as email'}
          className="font-mono text-sm" rows={5} />
      </div>

      {/* Params */}
      <div className="space-y-2">
        <Label>Parameters (JSON)</Label>
        <Textarea
          value={JSON.stringify(config.params || {}, null, 2)}
          onChange={(e) => { try { onChange('params', JSON.parse(e.target.value)); } catch {} }}
          placeholder='{ "id": "${user_id}" }' className="font-mono text-sm" rows={3} />
      </div>

      {/* Assertions */}
      {isAssert && (
        <div className="space-y-2">
          <Label>Assertions (one per line)</Label>
          <Textarea
            value={((config.assertions as string[]) || []).join('\n')}
            onChange={(e) => onChange('assertions', e.target.value.split('\n').filter(Boolean))}
            placeholder={'count > 0\nrows[0].name == "Alice"'} className="font-mono text-sm" rows={4} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create OtelForm.tsx**

```tsx
'use client';

import { Radio } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface OtelFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  actionType: string;
  className?: string;
}

export default function OtelForm({ config, onChange, actionType, className }: OtelFormProps) {
  const isAssert = actionType === 'otel.assert';

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <Radio className="h-4 w-4 text-blue-500" />
        <span className="text-sm font-medium">OpenTelemetry — {actionType.split('.')[1]}</span>
      </div>

      <div className="space-y-2">
        <Label>Span Name</Label>
        <Input value={(config.span_name as string) || 'testmesh-step'}
          onChange={(e) => onChange('span_name', e.target.value)} className="font-mono" />
        <p className="text-xs text-muted-foreground">
          Output: traceparent, tracestate, trace_id, span_id
        </p>
      </div>

      {isAssert && (
        <>
          <div className="space-y-2">
            <Label>Tempo Backend URL</Label>
            <Input value={(config.backend_url as string) || 'http://localhost:3200'}
              onChange={(e) => onChange('backend_url', e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label>Trace ID</Label>
            <Input value={(config.trace_id as string) || ''}
              onChange={(e) => onChange('trace_id', e.target.value)}
              placeholder='${inject_step.trace_id}' className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label>Service Filter (optional)</Label>
            <Input value={(config.service as string) || ''}
              onChange={(e) => onChange('service', e.target.value || undefined)}
              placeholder="user-service" className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label>Operation Filter (optional)</Label>
            <Input value={(config.operation as string) || ''}
              onChange={(e) => onChange('operation', e.target.value || undefined)}
              placeholder="GET /users/{id}" className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label>Wait Within</Label>
            <Input value={(config.within as string) || '10s'}
              onChange={(e) => onChange('within', e.target.value)} className="font-mono" />
            <p className="text-xs text-muted-foreground">How long to poll Tempo for the trace</p>
          </div>
          <div className="space-y-2">
            <Label>Assertions (one per line)</Label>
            <Textarea
              value={((config.assertions as string[]) || []).join('\n')}
              onChange={(e) => onChange('assertions', e.target.value.split('\n').filter(Boolean))}
              placeholder={'spans[0].duration < 500\nspans[0].status == "OK"'}
              className="font-mono text-sm" rows={4} />
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create PostgreSQLNativeForm.tsx**

```tsx
'use client';

import { Database } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PostgreSQLNativeFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  actionType: string;
  className?: string;
}

export default function PostgreSQLNativeForm({ config, onChange, actionType, className }: PostgreSQLNativeFormProps) {
  const action = actionType.split('.')[1]; // query, insert, update, delete, assert, execute, transaction, tables, columns
  const useConnStr = !!(config.connectionString as string);

  const needsTable = ['insert', 'update', 'delete', 'columns'].includes(action);
  const needsQuery = ['query', 'assert', 'execute'].includes(action);
  const needsData = ['insert', 'update'].includes(action);
  const needsWhere = ['update', 'delete'].includes(action);
  const needsReturning = ['insert', 'update', 'delete'].includes(action);
  const needsStatements = action === 'transaction';
  const needsSchema = ['tables', 'columns'].includes(action);
  const needsAssertions = action === 'assert';

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <Database className="h-4 w-4 text-blue-600" />
        <span className="text-sm font-medium">PostgreSQL — {action}</span>
      </div>

      {/* Connection */}
      <details className="space-y-3 p-3 border rounded-lg">
        <summary className="text-sm font-medium cursor-pointer">Connection</summary>
        <div className="space-y-3 pt-3">
          <div className="flex items-center justify-between">
            <Label>Use connection string</Label>
            <Switch checked={useConnStr}
              onCheckedChange={(v) => {
                if (v) {
                  onChange('connectionString', '');
                  onChange('host', undefined);
                } else {
                  onChange('connectionString', undefined);
                  onChange('host', 'localhost');
                }
              }} />
          </div>
          {useConnStr ? (
            <div className="space-y-2">
              <Label>Connection String</Label>
              <Input value={(config.connectionString as string) || ''}
                onChange={(e) => onChange('connectionString', e.target.value)}
                placeholder="postgresql://user:pass@localhost:5432/db?sslmode=disable"
                className="font-mono text-sm" />
            </div>
          ) : (
            <>
              {[['host', 'localhost'], ['port', '5432'], ['user', 'postgres'], ['database', 'postgres']].map(([field, placeholder]) => (
                <div key={field} className="space-y-2">
                  <Label>{field.charAt(0).toUpperCase() + field.slice(1)}</Label>
                  <Input value={(config[field] as string) || ''}
                    onChange={(e) => onChange(field, e.target.value)}
                    placeholder={placeholder} className="font-mono" />
                </div>
              ))}
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" value={(config.password as string) || ''}
                  onChange={(e) => onChange('password', e.target.value)}
                  placeholder="${PG_PASSWORD}" />
              </div>
              <div className="space-y-2">
                <Label>SSL Mode</Label>
                <Input value={(config.sslmode as string) || 'disable'}
                  onChange={(e) => onChange('sslmode', e.target.value)}
                  placeholder="disable|require|verify-full" className="font-mono" />
              </div>
            </>
          )}
        </div>
      </details>

      {needsSchema && (
        <div className="space-y-2">
          <Label>Schema</Label>
          <Input value={(config.schema as string) || 'public'}
            onChange={(e) => onChange('schema', e.target.value)} className="font-mono" />
        </div>
      )}

      {needsTable && (
        <div className="space-y-2">
          <Label>Table</Label>
          <Input value={(config.table as string) || ''}
            onChange={(e) => onChange('table', e.target.value)}
            placeholder="public.users" className="font-mono" />
        </div>
      )}

      {needsQuery && (
        <div className="space-y-2">
          <Label>SQL Query</Label>
          <Textarea value={(config.query as string) || ''}
            onChange={(e) => onChange('query', e.target.value)}
            placeholder={'SELECT id, name FROM users WHERE id = $1'}
            className="font-mono text-sm" rows={4} />
        </div>
      )}

      {needsData && (
        <div className="space-y-2">
          <Label>Data (JSON)</Label>
          <Textarea
            value={JSON.stringify(config.data || {}, null, 2)}
            onChange={(e) => { try { onChange('data', JSON.parse(e.target.value)); } catch {} }}
            placeholder={'{ "name": "${name}", "email": "${email}" }'}
            className="font-mono text-sm" rows={4} />
        </div>
      )}

      {needsWhere && (
        <>
          <div className="space-y-2">
            <Label>WHERE clause</Label>
            <Input value={(config.where as string) || ''}
              onChange={(e) => onChange('where', e.target.value)}
              placeholder="id = $1 AND status = $2" className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label>WHERE params (JSON array)</Label>
            <Input
              value={JSON.stringify(config.whereParams || [])}
              onChange={(e) => { try { onChange('whereParams', JSON.parse(e.target.value)); } catch {} }}
              placeholder='["${user_id}", "active"]' className="font-mono" />
          </div>
        </>
      )}

      {needsReturning && (
        <div className="space-y-2">
          <Label>RETURNING columns (comma-separated)</Label>
          <Input
            value={((config.returning as string[]) || []).join(', ')}
            onChange={(e) => onChange('returning', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            placeholder="id, created_at" className="font-mono" />
        </div>
      )}

      {needsStatements && (
        <div className="space-y-2">
          <Label>SQL Statements (one per line)</Label>
          <Textarea
            value={((config.statements as string[]) || []).join('\n')}
            onChange={(e) => onChange('statements', e.target.value.split('\n').filter(Boolean))}
            placeholder={'INSERT INTO users (name) VALUES ($1);\nUPDATE counters SET count = count + 1;'}
            className="font-mono text-sm" rows={6} />
        </div>
      )}

      {needsAssertions && (
        <div className="space-y-2">
          <Label>Assertions (one per line)</Label>
          <Textarea
            value={((config.assertions as string[]) || []).join('\n')}
            onChange={(e) => onChange('assertions', e.target.value.split('\n').filter(Boolean))}
            placeholder={'count > 0\nrows[0].name == "Alice"'} className="font-mono text-sm" rows={4} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create MockServerConfigureForm.tsx**

```tsx
'use client';

import { Server, Plus, X } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface Route {
  method: string;
  path: string;
  status: number;
  response: Record<string, unknown>;
  headers?: Record<string, string>;
}

interface MockServerConfigureFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  className?: string;
}

export default function MockServerConfigureForm({ config, onChange, className }: MockServerConfigureFormProps) {
  const routes = (config.routes as Route[]) || [];

  const addRoute = () => {
    onChange('routes', [...routes, { method: 'GET', path: '/', status: 200, response: {} }]);
  };

  const updateRoute = (index: number, updates: Partial<Route>) => {
    const next = [...routes];
    next[index] = { ...next[index], ...updates };
    onChange('routes', next);
  };

  const removeRoute = (index: number) => {
    onChange('routes', routes.filter((_, i) => i !== index));
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <Server className="h-4 w-4 text-purple-500" />
        <span className="text-sm font-medium">Configure Mock Server</span>
      </div>

      <div className="space-y-2">
        <Label>Mock Server ID</Label>
        <Input value={(config.mock_server_id as string) || ''}
          onChange={(e) => onChange('mock_server_id', e.target.value)}
          placeholder="my-mock-api" className="font-mono" />
        <p className="text-xs text-muted-foreground">
          Must match the name used in mock_server_start
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Routes</Label>
          <Button type="button" variant="outline" size="sm" onClick={addRoute}>
            <Plus className="h-4 w-4 mr-1" /> Add Route
          </Button>
        </div>

        {routes.length === 0 && (
          <div className="text-center py-4 border-2 border-dashed rounded-lg">
            <p className="text-xs text-muted-foreground">No routes. Click Add Route.</p>
          </div>
        )}

        {routes.map((route, i) => (
          <div key={i} className="p-3 border rounded-lg space-y-3 bg-muted/30">
            <div className="flex items-center gap-2">
              <Select value={route.method} onValueChange={(v) => updateRoute(i, { method: v })}>
                <SelectTrigger className="w-24 h-7">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input value={route.path} onChange={(e) => updateRoute(i, { path: e.target.value })}
                placeholder="/api/users" className="flex-1 h-7 font-mono text-sm" />
              <Input type="number" value={route.status}
                onChange={(e) => updateRoute(i, { status: parseInt(e.target.value) || 200 })}
                className="w-16 h-7" />
              <Button type="button" variant="ghost" size="sm"
                onClick={() => removeRoute(i)} className="h-7 w-7 p-0 text-destructive">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Response Body (JSON)</Label>
              <Textarea
                value={JSON.stringify(route.response || {}, null, 2)}
                onChange={(e) => { try { updateRoute(i, { response: JSON.parse(e.target.value) }); } catch {} }}
                className="font-mono text-xs" rows={3} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Lint check**

```bash
cd testmesh/dashboard && npm run lint
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd testmesh
git add dashboard/components/flow-editor/forms/RedisForm.tsx \
        dashboard/components/flow-editor/forms/MinioForm.tsx \
        dashboard/components/flow-editor/forms/Neo4jForm.tsx \
        dashboard/components/flow-editor/forms/OtelForm.tsx \
        dashboard/components/flow-editor/forms/PostgreSQLNativeForm.tsx \
        dashboard/components/flow-editor/forms/MockServerConfigureForm.tsx
git commit -m "feat: add plugin form components (redis, minio, neo4j, otel, postgresql, mock_server_configure)"
```

---

### Task 6: Wire forms into PropertiesPanel and NodePalette

**Files:**
- Modify: `testmesh/dashboard/components/flow-editor/PropertiesPanel.tsx`
- Modify: `testmesh/dashboard/components/flow-editor/NodePalette.tsx`

- [ ] **Step 1: Add imports to PropertiesPanel.tsx**

At the top of `PropertiesPanel.tsx`, add after the existing form imports:

```tsx
import RedisForm from './forms/RedisForm';
import MinioForm from './forms/MinioForm';
import Neo4jForm from './forms/Neo4jForm';
import OtelForm from './forms/OtelForm';
import PostgreSQLNativeForm from './forms/PostgreSQLNativeForm';
import MockServerConfigureForm from './forms/MockServerConfigureForm';
```

- [ ] **Step 2: Add routing cases in PropertiesPanel.tsx renderConfig function**

Find the `renderConfig` function (the one with the switch on `actionType`). Add before the `default:` case:

```tsx
case 'redis.get':
case 'redis.set':
case 'redis.del':
case 'redis.exists':
  return <RedisForm config={config} onChange={onConfigChange} actionType={actionType} />;

case 'minio.put':
case 'minio.get':
case 'minio.delete':
case 'minio.assert':
  return <MinioForm config={config} onChange={onConfigChange} actionType={actionType} />;

case 'neo4j.query':
case 'neo4j.assert':
  return <Neo4jForm config={config} onChange={onConfigChange} actionType={actionType} />;

case 'otel.inject':
case 'otel.assert':
  return <OtelForm config={config} onChange={onConfigChange} actionType={actionType} />;

case 'postgresql.query':
case 'postgresql.insert':
case 'postgresql.update':
case 'postgresql.delete':
case 'postgresql.assert':
case 'postgresql.execute':
case 'postgresql.transaction':
case 'postgresql.tables':
case 'postgresql.columns':
  return <PostgreSQLNativeForm config={config} onChange={onConfigChange} actionType={actionType} />;

case 'mock_server_configure':
  return <MockServerConfigureForm config={config} onChange={onConfigChange} />;
```

- [ ] **Step 3: Add palette entries to NodePalette.tsx**

In `NodePalette.tsx`, after the existing `docker_stop` entry, add new categories:

```tsx
// Cache
{ type: 'redis.get', label: 'Redis Get', description: 'Get a value from Redis by key', icon: 'Database', category: 'cache', defaultConfig: defaultConfigs['redis.get'] },
{ type: 'redis.set', label: 'Redis Set', description: 'Set a key-value pair in Redis with optional TTL', icon: 'Database', category: 'cache', defaultConfig: defaultConfigs['redis.set'] },
{ type: 'redis.del', label: 'Redis Delete', description: 'Delete a Redis key', icon: 'Database', category: 'cache', defaultConfig: defaultConfigs['redis.del'] },
{ type: 'redis.exists', label: 'Redis Exists', description: 'Check if a Redis key exists', icon: 'Database', category: 'cache', defaultConfig: defaultConfigs['redis.exists'] },
// Storage
{ type: 'minio.put', label: 'MinIO Put', description: 'Upload an object to MinIO / S3', icon: 'FileText', category: 'storage', defaultConfig: defaultConfigs['minio.put'] },
{ type: 'minio.get', label: 'MinIO Get', description: 'Download an object from MinIO / S3', icon: 'FileText', category: 'storage', defaultConfig: defaultConfigs['minio.get'] },
{ type: 'minio.delete', label: 'MinIO Delete', description: 'Delete an object from MinIO / S3', icon: 'FileText', category: 'storage', defaultConfig: defaultConfigs['minio.delete'] },
{ type: 'minio.assert', label: 'MinIO Assert', description: 'Assert object content in MinIO / S3', icon: 'FileText', category: 'storage', defaultConfig: defaultConfigs['minio.assert'] },
// Graph DB
{ type: 'neo4j.query', label: 'Neo4j Query', description: 'Execute a Cypher query against Neo4j', icon: 'Database', category: 'database', defaultConfig: defaultConfigs['neo4j.query'] },
{ type: 'neo4j.assert', label: 'Neo4j Assert', description: 'Query Neo4j and assert on results', icon: 'Database', category: 'database', defaultConfig: defaultConfigs['neo4j.assert'] },
// Observability
{ type: 'otel.inject', label: 'OTel Inject', description: 'Inject OpenTelemetry trace context', icon: 'Radio', category: 'observability', defaultConfig: defaultConfigs['otel.inject'] },
{ type: 'otel.assert', label: 'OTel Assert', description: 'Assert trace spans in Grafana Tempo', icon: 'Radio', category: 'observability', defaultConfig: defaultConfigs['otel.assert'] },
// PostgreSQL native
{ type: 'postgresql.query', label: 'PG Query', description: 'Execute a SELECT query', icon: 'Database', category: 'database', defaultConfig: defaultConfigs['postgresql.query'] },
{ type: 'postgresql.insert', label: 'PG Insert', description: 'Insert rows into a table', icon: 'Database', category: 'database', defaultConfig: defaultConfigs['postgresql.insert'] },
{ type: 'postgresql.update', label: 'PG Update', description: 'Update rows in a table', icon: 'Database', category: 'database', defaultConfig: defaultConfigs['postgresql.update'] },
{ type: 'postgresql.delete', label: 'PG Delete', description: 'Delete rows from a table', icon: 'Database', category: 'database', defaultConfig: defaultConfigs['postgresql.delete'] },
{ type: 'postgresql.assert', label: 'PG Assert', description: 'Query and assert results', icon: 'Database', category: 'database', defaultConfig: defaultConfigs['postgresql.assert'] },
{ type: 'postgresql.transaction', label: 'PG Transaction', description: 'Execute statements in a transaction', icon: 'Database', category: 'database', defaultConfig: defaultConfigs['postgresql.transaction'] },
// Mock Server Configure
{ type: 'mock_server_configure', label: 'Configure Mock', description: 'Update routes on a running mock server', icon: 'Server', category: 'mock', defaultConfig: defaultConfigs.mock_server_configure },
```

Also add the `observability` and `cache` and `storage` categories to the `categories` array at the top of NodePalette (find where existing categories like `'http'`, `'database'`, etc. are defined and add):
```tsx
{ id: 'cache', label: 'Cache' },
{ id: 'storage', label: 'Storage' },
{ id: 'observability', label: 'Observability' },
```

- [ ] **Step 4: Lint and build**

```bash
cd testmesh/dashboard && npm run lint && npm run build 2>&1 | head -50
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd testmesh
git add dashboard/components/flow-editor/PropertiesPanel.tsx \
        dashboard/components/flow-editor/NodePalette.tsx
git commit -m "feat: wire plugin forms into flow editor palette and properties panel"
```

---

## Group 3 — Control Flow Backends

### Task 7: Implement parallel, wait_until, run_flow in executor

**Files:**
- Create: `testmesh/api/internal/runner/executor_extensions.go`
- Modify: `testmesh/api/internal/runner/executor.go`
- Modify: `testmesh/api/internal/storage/models/flow.go` (add flow lookup helper)

These three actions require access to the execution context and executor internals, so they live in the `runner` package alongside `executor.go` to avoid import cycles.

- [ ] **Step 1: Create executor_extensions.go**

Create `testmesh/api/internal/runner/executor_extensions.go`:

```go
package runner

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/expr-lang/expr"
	"github.com/test-mesh/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// executeParallel runs multiple branches of steps concurrently.
// config expected: { "branches": [ [step...], [step...] ], "max_concurrent": 3, "fail_fast": true }
func (e *Executor) executeParallel(ctx context.Context, config map[string]interface{}, execCtx *Context) (models.OutputData, error) {
	rawBranches, ok := config["branches"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("parallel: branches must be an array")
	}

	// Parse branches as [][]models.Step
	branches := make([][]models.Step, 0, len(rawBranches))
	for _, rb := range rawBranches {
		rawSteps, ok := rb.([]interface{})
		if !ok {
			return nil, fmt.Errorf("parallel: each branch must be an array of steps")
		}
		var steps []models.Step
		for _, rs := range rawSteps {
			if stepMap, ok := rs.(map[string]interface{}); ok {
				step := models.Step{}
				if id, ok := stepMap["id"].(string); ok {
					step.ID = id
				}
				if action, ok := stepMap["action"].(string); ok {
					step.Action = action
				}
				if cfg, ok := stepMap["config"].(map[string]interface{}); ok {
					step.Config = cfg
				}
				steps = append(steps, step)
			}
		}
		branches = append(branches, steps)
	}

	// Parse options
	maxConcurrent := len(branches) // default: unlimited
	if v, ok := config["max_concurrent"]; ok {
		switch n := v.(type) {
		case int:
			if n > 0 {
				maxConcurrent = n
			}
		case float64:
			if n > 0 {
				maxConcurrent = int(n)
			}
		}
	}

	failFast := true
	if v, ok := config["fail_fast"].(bool); ok {
		failFast = v
	}

	// Semaphore for max_concurrent
	sem := make(chan struct{}, maxConcurrent)

	type branchResult struct {
		index  int
		output models.OutputData
		err    error
	}

	results := make([]branchResult, len(branches))
	var wg sync.WaitGroup
	errCh := make(chan error, 1)
	cancelCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	for i, branch := range branches {
		i, branch := i, branch
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			// Create a child context per branch (shares variables but has independent outputs)
			branchCtx := execCtx.Fork()
			var branchOutput models.OutputData

			for _, step := range branch {
				select {
				case <-cancelCtx.Done():
					results[i] = branchResult{index: i, err: context.Canceled}
					return
				default:
				}

				out, err := e.executeStepInline(cancelCtx, &step, branchCtx)
				if err != nil {
					results[i] = branchResult{index: i, err: fmt.Errorf("branch %d step %s: %w", i, step.ID, err)}
					if failFast {
						select {
						case errCh <- err:
						default:
						}
						cancel()
					}
					return
				}
				branchOutput = out
			}
			results[i] = branchResult{index: i, output: branchOutput}
		}()
	}

	wg.Wait()
	close(errCh)

	// Collect errors
	var firstErr error
	for _, r := range results {
		if r.err != nil && firstErr == nil {
			firstErr = r.err
		}
	}
	if firstErr != nil {
		return nil, firstErr
	}

	// Merge outputs
	output := models.OutputData{}
	for _, r := range results {
		key := fmt.Sprintf("branch_%d", r.index)
		output[key] = r.output
	}
	output["branches_completed"] = len(branches)

	return output, nil
}

// executeWaitUntil polls a condition expression until it is true or timeout is reached.
// config expected: { "condition": "expr", "max_duration": "30s", "interval": "1s", "on_timeout": "fail" }
func (e *Executor) executeWaitUntil(ctx context.Context, config map[string]interface{}, execCtx *Context) (models.OutputData, error) {
	conditionStr, ok := config["condition"].(string)
	if !ok || conditionStr == "" {
		return nil, fmt.Errorf("wait_until: condition is required")
	}

	maxDuration := 5 * time.Minute
	if v, ok := config["max_duration"].(string); ok && v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			maxDuration = d
		}
	}

	interval := 5 * time.Second
	if v, ok := config["interval"].(string); ok && v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			interval = d
		}
	}

	onTimeout := "fail"
	if v, ok := config["on_timeout"].(string); ok && v != "" {
		onTimeout = v
	}

	deadline := time.Now().Add(maxDuration)
	attempts := 0

	for time.Now().Before(deadline) {
		// Build env for expression evaluation from current execCtx
		env := map[string]interface{}{}
		for k, v := range execCtx.variables {
			env[k] = v
		}
		for stepID, outputs := range execCtx.stepOutputs {
			env[stepID] = outputs
		}

		program, err := expr.Compile(conditionStr, expr.Env(env))
		if err != nil {
			return nil, fmt.Errorf("wait_until: failed to compile condition: %w", err)
		}

		result, err := expr.Run(program, env)
		if err == nil {
			if b, ok := result.(bool); ok && b {
				e.logger.Info("wait_until condition met", zap.Int("attempts", attempts))
				return models.OutputData{
					"condition": conditionStr,
					"result":    true,
					"attempts":  attempts,
				}, nil
			}
		}

		attempts++
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(interval):
		}
	}

	e.logger.Warn("wait_until timed out", zap.String("condition", conditionStr), zap.Int("attempts", attempts))

	if onTimeout == "continue" {
		return models.OutputData{
			"condition": conditionStr,
			"result":    false,
			"timed_out": true,
			"attempts":  attempts,
		}, nil
	}

	return nil, fmt.Errorf("wait_until: condition %q not met after %s (%d attempts)", conditionStr, maxDuration, attempts)
}

// executeRunFlow loads and executes a sub-flow by name or ID.
// config expected: { "flow": "flow-name-or-uuid", "input": {}, "inherit_env": true }
func (e *Executor) executeRunFlow(ctx context.Context, config map[string]interface{}, execCtx *Context) (models.OutputData, error) {
	flowRef, ok := config["flow"].(string)
	if !ok || flowRef == "" {
		return nil, fmt.Errorf("run_flow: flow name or ID is required")
	}

	if e.repo == nil {
		return nil, fmt.Errorf("run_flow: repository not available")
	}

	// Load flow via repo — use the flow lookup helper
	flow, err := e.repo.FindFlowByNameOrID(ctx, flowRef)
	if err != nil {
		return nil, fmt.Errorf("run_flow: flow %q not found: %w", flowRef, err)
	}

	// Build input variables
	inputVars := map[string]string{}

	inheritEnv := true
	if v, ok := config["inherit_env"].(bool); ok {
		inheritEnv = v
	}

	if inheritEnv {
		for k, v := range execCtx.variables {
			inputVars[k] = v
		}
	}

	if rawInput, ok := config["input"].(map[string]interface{}); ok {
		for k, v := range rawInput {
			inputVars[k] = fmt.Sprintf("%v", v)
		}
	}

	// Execute inline (no DB persistence for sub-flow)
	result := e.ExecuteInline(&flow.Definition, inputVars)

	return models.OutputData{
		"flow":       flowRef,
		"status":     result.Status,
		"passed":     result.Passed,
		"failed":     result.Failed,
		"duration_ms": result.DurationMs,
		"steps":      result.Steps,
	}, nil
}

// executeStepInline executes a single step without DB persistence (used by parallel branches).
func (e *Executor) executeStepInline(ctx context.Context, step *models.Step, execCtx *Context) (models.OutputData, error) {
	interpolator := NewInterpolator(execCtx)
	config := interpolator.InterpolateMap(step.Config)

	handler, err := e.getActionHandler(step.Action)
	if err != nil {
		return nil, err
	}

	result, err := handler.Execute(ctx, config)
	if err != nil {
		return nil, err
	}

	for key, value := range result {
		execCtx.SetStepOutput(step.ID, key, value)
	}
	for key, path := range step.Output {
		value := extractValue(result, path)
		execCtx.SetStepOutput(step.ID, key, value)
	}

	return result, nil
}
```

- [ ] **Step 2: Add Context.Fork() method**

Find `testmesh/api/internal/runner/context.go` and add:

```go
// Fork creates a child context that shares a copy of the current variables.
func (c *Context) Fork() *Context {
	child := &Context{
		variables:   make(map[string]string),
		stepOutputs: make(map[string]map[string]interface{}),
		env:         c.env,
	}
	for k, v := range c.variables {
		child.variables[k] = v
	}
	for k, v := range c.stepOutputs {
		child.stepOutputs[k] = v
	}
	return child
}
```

- [ ] **Step 3: Add FindFlowByNameOrID to ExecutionRepository**

In `testmesh/api/internal/storage/repository/execution.go` (or wherever the repo lives), add:

```go
// FindFlowByNameOrID finds a flow by UUID string or by name (workspace-global, first match).
func (r *ExecutionRepository) FindFlowByNameOrID(ctx context.Context, ref string) (*models.Flow, error) {
	var flow models.Flow
	// Try UUID first
	if _, err := uuid.Parse(ref); err == nil {
		if err := r.db.WithContext(ctx).Where("id = ?", ref).First(&flow).Error; err != nil {
			return nil, err
		}
		return &flow, nil
	}
	// Try name
	if err := r.db.WithContext(ctx).Where("name = ?", ref).First(&flow).Error; err != nil {
		return nil, fmt.Errorf("flow %q not found: %w", ref, err)
	}
	return &flow, nil
}
```

Add required imports (`"github.com/google/uuid"`, `"context"`, `"fmt"`) if not present.

- [ ] **Step 4: Hook parallel, wait_until, run_flow into executeStepWithDebug**

In `executor.go`, in the `executeStepWithDebug` method, replace the block:

```go
// Get action handler
handler, err := e.getActionHandler(step.Action)
if err != nil {
    e.notifyDebugAfterStep(executionID, step.ID, nil, err, time.Since(startTime))
    return nil, err
}

// Execute action
result, err := handler.Execute(ctx, config)
```

With:

```go
// Execute action — some complex actions handled inline (avoid import cycles)
var result models.OutputData
switch step.Action {
case "parallel":
    result, err = e.executeParallel(ctx, config, execCtx)
case "wait_until":
    result, err = e.executeWaitUntil(ctx, config, execCtx)
case "run_flow":
    result, err = e.executeRunFlow(ctx, config, execCtx)
default:
    var handler actions.Handler
    handler, err = e.getActionHandler(step.Action)
    if err != nil {
        e.notifyDebugAfterStep(executionID, step.ID, nil, err, time.Since(startTime))
        return nil, err
    }
    result, err = handler.Execute(ctx, config)
}
```

- [ ] **Step 5: Build**

```bash
cd testmesh/api && go build ./...
```
Expected: no errors. Fix any compilation issues (missing imports, wrong method signatures).

- [ ] **Step 6: Commit**

```bash
cd testmesh
git add api/internal/runner/executor_extensions.go \
        api/internal/runner/executor.go \
        api/internal/runner/context.go \
        api/internal/storage/repository/
git commit -m "feat: implement parallel, wait_until, run_flow action handlers"
```

---

### Task 8: Add ConditionForm and ForEachForm

**Files:**
- Create: `testmesh/dashboard/components/flow-editor/forms/ConditionForm.tsx`
- Create: `testmesh/dashboard/components/flow-editor/forms/ForEachForm.tsx`
- Modify: `testmesh/dashboard/components/flow-editor/PropertiesPanel.tsx`

- [ ] **Step 1: Create ConditionForm.tsx**

```tsx
'use client';

import { GitBranch } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface ConditionFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  className?: string;
}

export default function ConditionForm({ config, onChange, className }: ConditionFormProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <GitBranch className="h-4 w-4 text-yellow-500" />
        <span className="text-sm font-medium">Condition</span>
      </div>

      <div className="space-y-2">
        <Label htmlFor="condition_expr">Condition Expression</Label>
        <Input
          id="condition_expr"
          value={(config.condition as string) || ''}
          onChange={(e) => onChange('condition', e.target.value)}
          placeholder='${status} == "active" && ${count} > 0'
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Expression using expr-lang. Access step outputs via {'${stepId.field}'}.
          Then/else branches are configured in the YAML or via nested step nodes.
        </p>
      </div>

      <div className="p-3 bg-muted/50 rounded-md space-y-1">
        <p className="text-xs font-medium">Outputs</p>
        <p className="text-xs text-muted-foreground">
          <code className="font-mono">condition</code> — the expression string<br />
          <code className="font-mono">result</code> — true or false<br />
          <code className="font-mono">evaluated</code> — always true
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create ForEachForm.tsx**

```tsx
'use client';

import { Repeat } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface ForEachFormProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  className?: string;
}

export default function ForEachForm({ config, onChange, className }: ForEachFormProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 pb-2 border-b">
        <Repeat className="h-4 w-4 text-blue-500" />
        <span className="text-sm font-medium">For Each</span>
      </div>

      <div className="space-y-2">
        <Label htmlFor="foreach_items">Items</Label>
        <Input
          id="foreach_items"
          value={(config.items as string) || ''}
          onChange={(e) => onChange('items', e.target.value)}
          placeholder='${create_users.rows}'
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Expression resolving to an array. Each element is available as the item variable below.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="item_var">Item Variable Name</Label>
        <Input
          id="item_var"
          value={(config.item_var as string) || 'item'}
          onChange={(e) => onChange('item_var', e.target.value)}
          placeholder="item"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Access in nested steps via {'${item.field}'}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="max_iterations">Max Iterations (optional)</Label>
        <Input
          id="max_iterations"
          type="number"
          min="1"
          value={(config.max_iterations as number) || ''}
          onChange={(e) => onChange('max_iterations', e.target.value ? parseInt(e.target.value) : undefined)}
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label>Run in Parallel</Label>
          <p className="text-xs text-muted-foreground">Execute iterations concurrently</p>
        </div>
        <Switch
          checked={(config.parallel as boolean) || false}
          onCheckedChange={(v) => onChange('parallel', v)}
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label>Continue on Error</Label>
          <p className="text-xs text-muted-foreground">Skip failed iterations</p>
        </div>
        <Switch
          checked={(config.continue_on_error as boolean) || false}
          onCheckedChange={(v) => onChange('continue_on_error', v)}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire into PropertiesPanel.tsx**

Add imports:
```tsx
import ConditionForm from './forms/ConditionForm';
import ForEachForm from './forms/ForEachForm';
```

Add routing in `renderConfig` switch:
```tsx
case 'condition':
  return <ConditionForm config={config} onChange={onConfigChange} />;
case 'for_each':
  return <ForEachForm config={config} onChange={onConfigChange} />;
```

Note: these cases may already exist in the switch with a different render. If they do, replace the existing case with the new components.

- [ ] **Step 4: Lint**

```bash
cd testmesh/dashboard && npm run lint
```

- [ ] **Step 5: Commit**

```bash
cd testmesh
git add dashboard/components/flow-editor/forms/ConditionForm.tsx \
        dashboard/components/flow-editor/forms/ForEachForm.tsx \
        dashboard/components/flow-editor/PropertiesPanel.tsx
git commit -m "feat: add condition and for_each config forms"
```

---

## Group 4 — Integration Backends

### Task 9: Register browser, grpc_call, grpc_stream

**Files:**
- Modify: `testmesh/api/internal/runner/executor.go`

- [ ] **Step 1: Register browser in getActionHandler**

In `executor.go`, in `getActionHandler`, add before the `default:` case:

```go
case "browser":
    return actions.NewBrowserHandler(e.logger), nil
```

- [ ] **Step 2: Add grpc_call and grpc_stream aliases**

Add two more cases:

```go
case "grpc_call", "grpc_stream":
    return actions.NewGRPCHandler(e.logger), nil
```

- [ ] **Step 3: Build**

```bash
cd testmesh/api && go build ./...
```
Expected: no errors. `NewBrowserHandler` must exist in `actions/browser.go` — it does (verified earlier).

- [ ] **Step 4: Commit**

```bash
cd testmesh
git add api/internal/runner/executor.go
git commit -m "fix: register browser handler and grpc_call/grpc_stream aliases in executor"
```

---

### Task 10: Implement contract_generate and contract_verify

**Files:**
- Create: `testmesh/api/internal/runner/actions/contract_generate.go`
- Create: `testmesh/api/internal/runner/actions/contract_verify.go`
- Modify: `testmesh/api/internal/runner/executor.go`

These actions use a lightweight JSON-based contract format (no external Pact library). `contract_generate` writes a contract JSON file to disk or MinIO. `contract_verify` fetches it and verifies each interaction by making real HTTP calls.

- [ ] **Step 1: Create contract_generate.go**

```go
package actions

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/test-mesh/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// ContractInteraction describes one request-response pair in a contract.
type ContractInteraction struct {
	Description string                 `json:"description"`
	Request     map[string]interface{} `json:"request"`
	Response    map[string]interface{} `json:"response"`
}

// Contract is the JSON contract document written by contract_generate.
type Contract struct {
	Consumer     string                `json:"consumer"`
	Provider     string                `json:"provider"`
	GeneratedAt  string                `json:"generated_at"`
	Interactions []ContractInteraction `json:"interactions"`
}

// ContractGenerateHandler writes a contract JSON file.
type ContractGenerateHandler struct {
	logger *zap.Logger
}

// NewContractGenerateHandler creates a ContractGenerateHandler.
func NewContractGenerateHandler(logger *zap.Logger) *ContractGenerateHandler {
	return &ContractGenerateHandler{logger: logger}
}

// Execute generates a contract JSON file.
// config: { consumer, provider, interactions: [{description, request, response}], output_path }
func (h *ContractGenerateHandler) Execute(_ context.Context, config map[string]interface{}) (models.OutputData, error) {
	consumer, _ := config["consumer"].(string)
	provider, _ := config["provider"].(string)
	if consumer == "" || provider == "" {
		return nil, fmt.Errorf("contract_generate: consumer and provider are required")
	}

	outputPath, _ := config["output_path"].(string)
	if outputPath == "" {
		outputPath = "pacts"
	}

	// Parse interactions
	rawInteractions, _ := config["interactions"].([]interface{})
	interactions := make([]ContractInteraction, 0, len(rawInteractions))
	for _, ri := range rawInteractions {
		m, ok := ri.(map[string]interface{})
		if !ok {
			continue
		}
		ci := ContractInteraction{}
		ci.Description, _ = m["description"].(string)
		ci.Request, _ = m["request"].(map[string]interface{})
		ci.Response, _ = m["response"].(map[string]interface{})
		interactions = append(interactions, ci)
	}

	contract := &Contract{
		Consumer:     consumer,
		Provider:     provider,
		GeneratedAt:  time.Now().UTC().Format(time.RFC3339),
		Interactions: interactions,
	}

	data, err := json.MarshalIndent(contract, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("contract_generate: failed to marshal contract: %w", err)
	}

	// Write to file
	if err := os.MkdirAll(outputPath, 0755); err != nil {
		return nil, fmt.Errorf("contract_generate: failed to create output dir: %w", err)
	}

	filename := fmt.Sprintf("%s-%s.json", consumer, provider)
	fullPath := filepath.Join(outputPath, filename)

	if err := os.WriteFile(fullPath, data, 0644); err != nil {
		return nil, fmt.Errorf("contract_generate: failed to write contract: %w", err)
	}

	h.logger.Info("Contract generated",
		zap.String("path", fullPath),
		zap.Int("interactions", len(interactions)),
	)

	return models.OutputData{
		"contract_path": fullPath,
		"consumer":      consumer,
		"provider":      provider,
		"interactions":  len(interactions),
	}, nil
}
```

- [ ] **Step 2: Create contract_verify.go**

```go
package actions

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/test-mesh/testmesh/internal/storage/models"
	"go.uber.org/zap"
)

// ContractVerifyHandler reads a contract JSON and verifies each interaction.
type ContractVerifyHandler struct {
	logger *zap.Logger
}

// NewContractVerifyHandler creates a ContractVerifyHandler.
func NewContractVerifyHandler(logger *zap.Logger) *ContractVerifyHandler {
	return &ContractVerifyHandler{logger: logger}
}

// Execute verifies a contract against a live provider.
// config: { contract_path, provider_base_url }
func (h *ContractVerifyHandler) Execute(ctx context.Context, config map[string]interface{}) (models.OutputData, error) {
	contractPath, _ := config["contract_path"].(string)
	if contractPath == "" {
		// Also accept contract_id for backward compat
		contractPath, _ = config["contract_id"].(string)
	}
	if contractPath == "" {
		return nil, fmt.Errorf("contract_verify: contract_path is required")
	}

	providerBaseURL, _ := config["provider_base_url"].(string)
	if providerBaseURL == "" {
		return nil, fmt.Errorf("contract_verify: provider_base_url is required")
	}
	providerBaseURL = strings.TrimRight(providerBaseURL, "/")

	// Load contract
	data, err := os.ReadFile(contractPath)
	if err != nil {
		return nil, fmt.Errorf("contract_verify: failed to read contract: %w", err)
	}

	var contract Contract
	if err := json.Unmarshal(data, &contract); err != nil {
		return nil, fmt.Errorf("contract_verify: invalid contract JSON: %w", err)
	}

	client := &http.Client{}
	passed, failed := 0, 0
	var failures []string

	for _, interaction := range contract.Interactions {
		method, _ := interaction.Request["method"].(string)
		path, _ := interaction.Request["path"].(string)
		if method == "" {
			method = "GET"
		}

		// Build request body
		var bodyReader io.Reader
		if body, ok := interaction.Request["body"]; ok {
			b, _ := json.Marshal(body)
			bodyReader = strings.NewReader(string(b))
		}

		req, err := http.NewRequestWithContext(ctx, method, providerBaseURL+path, bodyReader)
		if err != nil {
			failures = append(failures, fmt.Sprintf("%s: failed to build request: %v", interaction.Description, err))
			failed++
			continue
		}

		// Set headers from interaction
		if headers, ok := interaction.Request["headers"].(map[string]interface{}); ok {
			for k, v := range headers {
				req.Header.Set(k, fmt.Sprintf("%v", v))
			}
		}
		if bodyReader != nil {
			req.Header.Set("Content-Type", "application/json")
		}

		resp, err := client.Do(req)
		if err != nil {
			failures = append(failures, fmt.Sprintf("%s: request failed: %v", interaction.Description, err))
			failed++
			continue
		}
		resp.Body.Close()

		// Check expected status
		if expectedStatus, ok := interaction.Response["status"].(float64); ok {
			if resp.StatusCode != int(expectedStatus) {
				failures = append(failures, fmt.Sprintf("%s: expected status %d got %d", interaction.Description, int(expectedStatus), resp.StatusCode))
				failed++
				continue
			}
		}

		passed++
		h.logger.Info("Interaction verified", zap.String("description", interaction.Description))
	}

	if failed > 0 {
		return models.OutputData{
			"passed":   passed,
			"failed":   failed,
			"failures": failures,
		}, fmt.Errorf("contract_verify: %d interaction(s) failed: %s", failed, strings.Join(failures, "; "))
	}

	return models.OutputData{
		"passed":   passed,
		"failed":   0,
		"failures": []string{},
	}, nil
}
```

- [ ] **Step 3: Register in executor.go**

In `getActionHandler`, add:

```go
case "contract_generate":
    return actions.NewContractGenerateHandler(e.logger), nil
case "contract_verify":
    return actions.NewContractVerifyHandler(e.logger), nil
```

- [ ] **Step 4: Build**

```bash
cd testmesh/api && go build ./...
```

- [ ] **Step 5: Commit**

```bash
cd testmesh
git add api/internal/runner/actions/contract_generate.go \
        api/internal/runner/actions/contract_verify.go \
        api/internal/runner/executor.go
git commit -m "feat: implement contract_generate and contract_verify action handlers"
```

---

## Group 5 — Step-Level Fields

### Task 11: Add `when` and `on_error` to Step model and executor

**Files:**
- Modify: `testmesh/api/internal/storage/models/flow.go`
- Modify: `testmesh/api/internal/runner/executor.go`

- [ ] **Step 1: Add When, OnError, ErrorSteps, OnTimeout to Step model**

In `testmesh/api/internal/storage/models/flow.go`, update the `Step` struct:

```go
// Step represents a single step in a flow
type Step struct {
    ID          string                 `json:"id" yaml:"id"`
    Action      string                 `json:"action" yaml:"action"`
    Name        string                 `json:"name" yaml:"name"`
    Description string                 `json:"description" yaml:"description"`
    Config      map[string]interface{} `json:"config" yaml:"config"`
    Assert      []string               `json:"assert" yaml:"assert"`
    Output      map[string]string      `json:"output" yaml:"output"`
    Retry       *RetryConfig           `json:"retry,omitempty" yaml:"retry,omitempty"`
    Timeout     string                 `json:"timeout,omitempty" yaml:"timeout,omitempty"`
    When        string                 `json:"when,omitempty" yaml:"when,omitempty"`         // Skip step if false
    OnError     string                 `json:"on_error,omitempty" yaml:"on_error,omitempty"` // "fail" | "continue"
    ErrorSteps  []Step                 `json:"error_steps,omitempty" yaml:"error_steps,omitempty"`
    OnTimeout   []Step                 `json:"on_timeout,omitempty" yaml:"on_timeout,omitempty"`
}
```

- [ ] **Step 2: Evaluate `when` in executeStepWithDebug**

In `executor.go`, in `executeStepWithDebug`, after the interpolation block and before the action handler call, add:

```go
// Evaluate 'when' condition — skip step if expression evaluates to false
if step.When != "" {
    env := map[string]interface{}{}
    for k, v := range execCtx.variables {
        env[k] = v
    }
    for stepID, outputs := range execCtx.stepOutputs {
        env[stepID] = outputs
    }
    program, err := exprlib.Compile(step.When, exprlib.Env(env))
    if err != nil {
        return nil, fmt.Errorf("when expression compile error: %w", err)
    }
    result, err := exprlib.Run(program, env)
    if err != nil {
        return nil, fmt.Errorf("when expression eval error: %w", err)
    }
    if skip, ok := result.(bool); ok && !skip {
        e.logger.Info("Skipping step due to when condition", zap.String("step_id", step.ID), zap.String("when", step.When))
        return models.OutputData{"skipped": true, "when": step.When}, nil
    }
}
```

Add the import alias at the top of executor.go:
```go
exprlib "github.com/expr-lang/expr"
```

- [ ] **Step 3: Honor on_error in executeSteps**

In `executor.go`, in `executeSteps`, find the error handling block after `result, err := e.executeStepWithRetry(...)`. Currently it returns the error immediately. Change it to:

```go
if err != nil {
    // ... existing status update and broadcast code ...

    execErr := NewExecutionError(phase, stepID, step.Name, step.Action, err.Error(), err)

    // Run error_steps if defined
    if len(step.ErrorSteps) > 0 {
        e.logger.Info("Running error_steps", zap.String("step_id", stepID), zap.Int("count", len(step.ErrorSteps)))
        _ = e.executeSteps(ctx, execution, step.ErrorSteps, execCtx, "error")
    }

    // Check on_error behavior
    if step.OnError == "continue" {
        e.logger.Warn("Step failed but on_error=continue, proceeding", zap.String("step_id", stepID))
        continue
    }

    return execErr
}
```

- [ ] **Step 4: Build**

```bash
cd testmesh/api && go build ./...
```

- [ ] **Step 5: Commit**

```bash
cd testmesh
git add api/internal/storage/models/flow.go \
        api/internal/runner/executor.go
git commit -m "feat: add when condition and on_error handling to Step model and executor"
```

---

### Task 12: Add `when` field to PropertiesPanel General tab

**Files:**
- Modify: `testmesh/dashboard/components/flow-editor/PropertiesPanel.tsx`

- [ ] **Step 1: Add when field to General tab**

In `PropertiesPanel.tsx`, in the General tab (`<TabsContent value="general">`), after the description textarea and before the timeout input (or at the end of the general fields), add:

```tsx
<div className="space-y-2">
  <Label htmlFor="step-when" className="text-xs">Run condition (optional)</Label>
  <Input
    id="step-when"
    value={(localData as any).when || ''}
    onChange={(e) => updateData({ when: e.target.value || undefined } as any)}
    placeholder='${env.STAGE} == "staging"'
    className="h-8 text-sm font-mono"
  />
  <p className="text-[10px] text-muted-foreground">
    Step is skipped if this expression evaluates to false. Uses expr-lang syntax.
  </p>
</div>
```

- [ ] **Step 2: Lint**

```bash
cd testmesh/dashboard && npm run lint
```

- [ ] **Step 3: Commit**

```bash
cd testmesh
git add dashboard/components/flow-editor/PropertiesPanel.tsx
git commit -m "feat: add step 'when' condition field to General tab in PropertiesPanel"
```

---

## Self-review against spec

**Spec coverage check:**

| Spec requirement | Task(s) |
|---|---|
| Kafka consumer `match`→`filter` rename | Task 1 |
| Kafka consumer json_path serialization fix | Task 1 |
| Kafka consumer missing fields (TLS, key_pattern, headers, json_value, auto_offset_reset) | Task 1 |
| Kafka consumer timeout default fix | Task 1 |
| Kafka producer compression + TLS | Task 2 |
| Database query form cleanup (db_type, polling, row_mapper, read_only) | Task 3 |
| Database query max_rows, timeout backend impl | Task 3 |
| Plugin ActionTypes and defaultConfigs | Task 4 |
| Redis form | Task 5 |
| MinIO form | Task 5 |
| Neo4j form | Task 5 |
| OTel form | Task 5 |
| PostgreSQL native form | Task 5 |
| mock_server_configure form | Task 5 |
| Wire forms into PropertiesPanel + NodePalette | Task 6 |
| parallel backend handler | Task 7 |
| wait_until backend handler | Task 7 |
| run_flow backend handler | Task 7 |
| condition config form | Task 8 |
| for_each config form | Task 8 |
| browser registration in executor | Task 9 |
| grpc_call/grpc_stream aliases | Task 9 |
| contract_generate backend | Task 10 |
| contract_verify backend | Task 10 |
| on_error in Step model + executor | Task 11 |
| step.when in Step model + executor | Task 11 |
| step.when UI field | Task 12 |
| mock_server_configure palette entry | Task 6 |

**Placeholder scan:** None found.

**Type consistency check:** All form components use `actionType: string` prop for multi-action forms (Redis, MinIO, Neo4j, OTel, PostgreSQL). PropertiesPanel calls them with `actionType={localData.action}`. Consistent throughout.
