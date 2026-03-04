# Scaffold Skill

**Skill Name**: `scaffold`
**Purpose**: Generate boilerplate code for TestMesh components
**Version**: 1.0.0

---

## Usage

```
/scaffold <type> <name> [options]
```

**Types**:
- `api` - Generate API handlers (Go)
- `domain` - Generate domain models and repository (Go)
- `component` - Generate React component (TypeScript)
- `page` - Generate Next.js page (TypeScript)
- `handler` - Generate action handler (Go)
- `test` - Generate test file (Go or TypeScript)

---

## Examples

### 1. Scaffold API Endpoints

```
/scaffold api flows
```

**Generates**:
- `server/internal/api/handlers/flows.go` - CRUD handlers
- `server/internal/api/handlers/flows_test.go` - Handler tests
- Updates `server/internal/api/router/router.go` - Add routes

**Template**: REST API with Create, Read, Update, Delete, List operations

---

### 2. Scaffold Domain Model

```
/scaffold domain execution
```

**Generates**:
- `server/internal/storage/executions/models.go` - Domain models
- `server/internal/storage/executions/repository.go` - Repository pattern
- `server/internal/storage/executions/repository_test.go` - Repository tests
- `server/migrations/000X_create_executions.up.sql` - Database migration
- `server/migrations/000X_create_executions.down.sql` - Rollback migration

---

### 3. Scaffold React Component

```
/scaffold component FlowEditor
```

**Generates**:
- `web/dashboard/src/components/FlowEditor.tsx` - Component
- `web/dashboard/src/components/FlowEditor.test.tsx` - Component tests
- `web/dashboard/src/components/FlowEditor.stories.tsx` - Storybook (optional)

---

### 4. Scaffold Next.js Page

```
/scaffold page flows/[id]
```

**Generates**:
- `web/dashboard/app/flows/[id]/page.tsx` - Dynamic route page
- `web/dashboard/app/flows/[id]/layout.tsx` - Layout (if needed)
- `web/dashboard/app/flows/[id]/loading.tsx` - Loading state

---

### 5. Scaffold Action Handler

```
/scaffold handler kafka
```

**Generates**:
- `server/internal/runner/actions/kafka.go` - Kafka action handler
- `server/internal/runner/actions/kafka_test.go` - Handler tests
- Updates `server/internal/runner/actions/registry.go` - Register handler

---

## Instructions for AI Agent

When this skill is invoked, follow these steps:

### Step 1: Parse Command
- Extract type, name, and options from command
- Validate that type is supported
- Validate that name follows conventions (camelCase for components, snake_case for Go files)

### Step 2: Determine File Paths
Based on type and project structure from PROJECT_STRUCTURE.md:

**API Handler** (`api <name>`):
- Handler: `server/internal/api/handlers/<name>.go`
- Tests: `server/internal/api/handlers/<name>_test.go`
- Router update: `server/internal/api/router/router.go`

**Domain Model** (`domain <name>`):
- Models: `server/internal/storage/<name>s/models.go`
- Repository: `server/internal/storage/<name>s/repository.go`
- Tests: `server/internal/storage/<name>s/repository_test.go`
- Migration: `server/migrations/000X_create_<name>s.{up,down}.sql`

**Component** (`component <Name>`):
- Component: `web/dashboard/src/components/<Name>.tsx`
- Tests: `web/dashboard/src/components/<Name>.test.tsx`

**Page** (`page <path>`):
- Page: `web/dashboard/app/<path>/page.tsx`
- Layout: `web/dashboard/app/<path>/layout.tsx` (optional)

**Action Handler** (`handler <name>`):
- Handler: `server/internal/runner/actions/<name>.go`
- Tests: `server/internal/runner/actions/<name>_test.go`
- Registry update: `server/internal/runner/actions/registry.go`

### Step 3: Generate Code from Templates

Use the templates below and customize based on the specific name and context.

---

## Templates

### API Handler Template (Go)

```go
// server/internal/api/handlers/{{name}}.go
package handlers

import (
    "net/http"
    "github.com/gin-gonic/gin"
    "github.com/testmesh/server/internal/storage/{{name}}s"
    "github.com/google/uuid"
)

type {{Name}}Handler struct {
    repo *{{name}}s.Repository
}

func New{{Name}}Handler(repo *{{name}}s.Repository) *{{Name}}Handler {
    return &{{Name}}Handler{repo: repo}
}

// Create handles POST /api/v1/{{name}}s
func (h *{{Name}}Handler) Create(c *gin.Context) {
    var req {{name}}s.Create{{Name}}Request
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    {{name}}, err := h.repo.Create(c.Request.Context(), &req)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }

    c.JSON(http.StatusCreated, {{name}})
}

// List handles GET /api/v1/{{name}}s
func (h *{{Name}}Handler) List(c *gin.Context) {
    {{name}}s, err := h.repo.List(c.Request.Context())
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }

    c.JSON(http.StatusOK, {{name}}s)
}

// Get handles GET /api/v1/{{name}}s/:id
func (h *{{Name}}Handler) Get(c *gin.Context) {
    id, err := uuid.Parse(c.Param("id"))
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ID"})
        return
    }

    {{name}}, err := h.repo.GetByID(c.Request.Context(), id)
    if err != nil {
        c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
        return
    }

    c.JSON(http.StatusOK, {{name}})
}

// Update handles PUT /api/v1/{{name}}s/:id
func (h *{{Name}}Handler) Update(c *gin.Context) {
    id, err := uuid.Parse(c.Param("id"))
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ID"})
        return
    }

    var req {{name}}s.Update{{Name}}Request
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    {{name}}, err := h.repo.Update(c.Request.Context(), id, &req)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }

    c.JSON(http.StatusOK, {{name}})
}

// Delete handles DELETE /api/v1/{{name}}s/:id
func (h *{{Name}}Handler) Delete(c *gin.Context) {
    id, err := uuid.Parse(c.Param("id"))
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ID"})
        return
    }

    if err := h.repo.Delete(c.Request.Context(), id); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }

    c.JSON(http.StatusNoContent, nil)
}
```

### Domain Repository Template (Go)

```go
// server/internal/storage/{{name}}s/repository.go
package {{name}}s

import (
    "context"
    "database/sql"
    "github.com/google/uuid"
    "time"
)

type Repository struct {
    db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
    return &Repository{db: db}
}

func (r *Repository) Create(ctx context.Context, req *Create{{Name}}Request) (*{{Name}}, error) {
    {{name}} := &{{Name}}{
        ID:        uuid.New(),
        CreatedAt: time.Now(),
        UpdatedAt: time.Now(),
        // TODO: Add fields from request
    }

    query := `
        INSERT INTO {{name}}s (id, created_at, updated_at)
        VALUES ($1, $2, $3)
        RETURNING *
    `

    err := r.db.QueryRowContext(ctx, query, {{name}}.ID, {{name}}.CreatedAt, {{name}}.UpdatedAt).Scan(
        &{{name}}.ID,
        &{{name}}.CreatedAt,
        &{{name}}.UpdatedAt,
    )

    if err != nil {
        return nil, err
    }

    return {{name}}, nil
}

func (r *Repository) GetByID(ctx context.Context, id uuid.UUID) (*{{Name}}, error) {
    var {{name}} {{Name}}
    query := `SELECT id, created_at, updated_at FROM {{name}}s WHERE id = $1`

    err := r.db.QueryRowContext(ctx, query, id).Scan(
        &{{name}}.ID,
        &{{name}}.CreatedAt,
        &{{name}}.UpdatedAt,
    )

    if err == sql.ErrNoRows {
        return nil, nil
    }
    if err != nil {
        return nil, err
    }

    return &{{name}}, nil
}

func (r *Repository) List(ctx context.Context) ([]*{{Name}}, error) {
    query := `SELECT id, created_at, updated_at FROM {{name}}s ORDER BY created_at DESC`

    rows, err := r.db.QueryContext(ctx, query)
    if err != nil {
        return nil, err
    }
    defer rows.Close()

    var {{name}}s []*{{Name}}
    for rows.Next() {
        var {{name}} {{Name}}
        if err := rows.Scan(&{{name}}.ID, &{{name}}.CreatedAt, &{{name}}.UpdatedAt); err != nil {
            return nil, err
        }
        {{name}}s = append({{name}}s, &{{name}})
    }

    return {{name}}s, nil
}

func (r *Repository) Update(ctx context.Context, id uuid.UUID, req *Update{{Name}}Request) (*{{Name}}, error) {
    // TODO: Implement update logic
    return r.GetByID(ctx, id)
}

func (r *Repository) Delete(ctx context.Context, id uuid.UUID) error {
    query := `DELETE FROM {{name}}s WHERE id = $1`
    _, err := r.db.ExecContext(ctx, query, id)
    return err
}
```

### React Component Template (TypeScript)

```typescript
// web/dashboard/src/components/{{Name}}.tsx
'use client';

import React from 'react';

interface {{Name}}Props {
  // TODO: Add props
}

export function {{Name}}({}: {{Name}}Props) {
  return (
    <div className="{{name}}">
      <h2 className="text-2xl font-bold">{{Name}}</h2>
      {/* TODO: Add component content */}
    </div>
  );
}
```

### Component Test Template (TypeScript)

```typescript
// web/dashboard/src/components/{{Name}}.test.tsx
import { render, screen } from '@testing-library/react';
import { {{Name}} } from './{{Name}}';

describe('{{Name}}', () => {
  it('renders successfully', () => {
    render(<{{Name}} />);
    expect(screen.getByText('{{Name}}')).toBeInTheDocument();
  });

  // TODO: Add more tests
});
```

---

## Step 4: Update Related Files

After generating files, update related files:

**For API handlers**:
- Update `server/internal/api/router/router.go` to add routes

**For action handlers**:
- Update `server/internal/runner/actions/registry.go` to register handler

**For components**:
- Consider updating barrel exports if using index files

### Step 5: Report to User

After scaffolding, provide a summary:

```markdown
✅ Scaffolded {{type}} "{{name}}"

Files created:
- {{file1}}
- {{file2}}
- {{file3}}

Files updated:
- {{file4}}

Next steps:
1. Review generated code
2. Add missing fields/logic (marked with TODO)
3. Run tests: go test ./...
4. Commit changes
```

---

## Coding Standards Compliance

All generated code MUST follow:
- [CODING_STANDARDS.md](../CODING_STANDARDS.md)
- [SECURITY_GUIDELINES.md](../SECURITY_GUIDELINES.md)
- [AGENT_CONTRACT.md](../AGENT_CONTRACT.md)

**Specific requirements**:
- ✅ Proper error handling (no ignored errors)
- ✅ Input validation
- ✅ Context propagation
- ✅ Consistent naming
- ✅ TODO comments for incomplete parts

---

## Important Notes

- **Always read PROJECT_STRUCTURE.md** to confirm file locations
- **Always check CODING_STANDARDS.md** for naming conventions
- **Generate tests** alongside implementation files
- **Use TODO comments** for parts that need customization
- **Follow existing patterns** from similar files in the codebase
- **Keep it simple** - don't over-engineer

---

**Version**: 1.0.0
**Last Updated**: 2026-02-11
