# Database Migration Skill

**Skill Name**: `migrate`
**Purpose**: Manage database schema migrations for TestMesh
**Version**: 1.0.0

---

## Usage

```
/migrate <command> [options]
```

**Commands**:
- `create <name>` - Create new migration files
- `up` - Run pending migrations
- `down` - Rollback last migration
- `status` - Show migration status
- `force <version>` - Force database to specific version

---

## Examples

### 1. Create New Migration

```
/migrate create add_agents_table
```

**Generates**:
- `server/migrations/000003_add_agents_table.up.sql`
- `server/migrations/000003_add_agents_table.down.sql`

### 2. Check Migration Status

```
/migrate status
```

**Shows**:
```
Applied migrations:
✅ 000001_initial_schema (2026-02-10 10:30:00)
✅ 000002_add_executions (2026-02-11 09:15:00)

Pending migrations:
⏳ 000003_add_agents_table
```

### 3. Run Migrations

```
/migrate up
```

**Applies all pending migrations**

### 4. Rollback Migration

```
/migrate down
```

**Rolls back the last migration**

---

## Instructions for AI Agent

### Command: `create <name>`

**Steps**:

1. **Find latest migration number**
   - Read `server/migrations/` directory
   - Find highest number (e.g., `000002`)
   - Increment by 1 (e.g., `000003`)

2. **Generate migration files**

**Up migration template**:
```sql
-- server/migrations/{{number}}_{{name}}.up.sql
-- Migration: {{name}}
-- Created: {{date}}

BEGIN;

-- TODO: Add your schema changes here
-- Example:
-- CREATE TABLE {{table_name}} (
--     id UUID PRIMARY KEY,
--     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );

-- CREATE INDEX idx_{{table}}_{{column}} ON {{table}}({{column}});

COMMIT;
```

**Down migration template**:
```sql
-- server/migrations/{{number}}_{{name}}.down.sql
-- Rollback: {{name}}
-- Created: {{date}}

BEGIN;

-- TODO: Add rollback logic here
-- Example:
-- DROP TABLE IF EXISTS {{table_name}} CASCADE;

COMMIT;
```

3. **Report to user**
```markdown
✅ Created migration files:
- server/migrations/{{number}}_{{name}}.up.sql
- server/migrations/{{number}}_{{name}}.down.sql

Next steps:
1. Edit migration files with your schema changes
2. Test locally: /migrate up
3. Verify rollback: /migrate down
4. Commit migration files
```

---

### Command: `status`

**Steps**:

1. **Connect to database** (using PostgreSQL MCP if available)
2. **Query schema_migrations table**
   ```sql
   SELECT version, applied_at
   FROM schema_migrations
   ORDER BY version;
   ```
3. **List all migration files** in `server/migrations/`
4. **Compare** database vs files
5. **Report status**

---

### Command: `up`

**Steps**:

1. **Find pending migrations**
   - Get applied migrations from database
   - Get all migration files
   - Diff to find pending

2. **For each pending migration**:
   - Read `.up.sql` file
   - Execute SQL
   - Record in `schema_migrations` table
   - Report success/failure

3. **Handle errors**:
   - If migration fails, rollback transaction
   - Report error with SQL line number
   - Stop execution

---

### Command: `down`

**Steps**:

1. **Find last migration** from database
2. **Read corresponding `.down.sql`** file
3. **Execute rollback SQL**
4. **Remove from schema_migrations** table
5. **Report result**

---

## Migration Templates

### Create Table Migration

```sql
-- {{number}}_create_{{table}}.up.sql
BEGIN;

CREATE SCHEMA IF NOT EXISTS {{schema}};

CREATE TABLE {{schema}}.{{table}} (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    config JSONB,
    tags TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100),
    deleted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_{{table}}_created_at ON {{schema}}.{{table}}(created_at DESC);
CREATE INDEX idx_{{table}}_tags ON {{schema}}.{{table}} USING GIN(tags);
CREATE INDEX idx_{{table}}_deleted_at ON {{schema}}.{{table}}(deleted_at) WHERE deleted_at IS NULL;

-- Trigger for updated_at
CREATE TRIGGER update_{{table}}_updated_at
    BEFORE UPDATE ON {{schema}}.{{table}}
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMIT;
```

```sql
-- {{number}}_create_{{table}}.down.sql
BEGIN;

DROP TABLE IF EXISTS {{schema}}.{{table}} CASCADE;

COMMIT;
```

### Add Column Migration

```sql
-- {{number}}_add_{{column}}_to_{{table}}.up.sql
BEGIN;

ALTER TABLE {{schema}}.{{table}}
    ADD COLUMN {{column}} {{type}} {{constraints}};

-- Add index if needed
CREATE INDEX idx_{{table}}_{{column}} ON {{schema}}.{{table}}({{column}});

COMMIT;
```

```sql
-- {{number}}_add_{{column}}_to_{{table}}.down.sql
BEGIN;

ALTER TABLE {{schema}}.{{table}}
    DROP COLUMN {{column}};

COMMIT;
```

### Add Index Migration

```sql
-- {{number}}_add_index_{{table}}_{{column}}.up.sql
BEGIN;

CREATE INDEX CONCURRENTLY idx_{{table}}_{{column}}
    ON {{schema}}.{{table}}({{column}});

COMMIT;
```

```sql
-- {{number}}_add_index_{{table}}_{{column}}.down.sql
BEGIN;

DROP INDEX IF EXISTS {{schema}}.idx_{{table}}_{{column}};

COMMIT;
```

---

## Migration Best Practices

### ✅ DO

1. **Use transactions** (BEGIN/COMMIT)
2. **Make migrations reversible** (always write down.sql)
3. **Test locally first** before committing
4. **One logical change per migration**
5. **Use CASCADE carefully** (understand impact)
6. **Add indexes concurrently** on large tables
7. **Include comments** explaining complex changes

### ❌ DON'T

1. **Don't edit existing migrations** (create new ones)
2. **Don't skip migrations** (apply in order)
3. **Don't drop data without backup**
4. **Don't use FORCE in production** without review
5. **Don't commit untested migrations**

---

## Safety Checks

Before running migrations, AI agent should:

1. ✅ **Verify database connection**
2. ✅ **Check for pending migrations**
3. ✅ **Warn if migrations drop tables/columns**
4. ✅ **Confirm destructive operations**
5. ✅ **Suggest backup for production**

---

## Integration with PostgreSQL MCP

If PostgreSQL MCP is available:
- Use MCP to execute SQL directly
- Query schema_migrations table
- Test migrations before applying
- Verify schema after migration

---

**Version**: 1.0.0
**Last Updated**: 2026-02-11
