# Test Generator Skill

**Skill Name**: `test-gen`
**Purpose**: Automatically generate test files and test cases for TestMesh code
**Version**: 1.0.0

---

## Usage

```
/test-gen <file-path> [options]
```

**Options**:
- `--unit` - Generate unit tests only (default)
- `--integration` - Generate integration tests
- `--coverage` - Include coverage for all public functions
- `--mocks` - Generate mock files for interfaces

---

## Examples

### 1. Generate Tests for Go File

```
/test-gen server/internal/runner/executor.go
```

**Generates**:
- `server/internal/runner/executor_test.go`
- Test cases for all public functions
- Table-driven tests where appropriate
- Mock setup if dependencies exist

---

### 2. Generate Tests for TypeScript Component

```
/test-gen web/dashboard/src/components/FlowEditor.tsx
```

**Generates**:
- `web/dashboard/src/components/FlowEditor.test.tsx`
- Render tests
- Interaction tests (click, input)
- Prop validation tests

---

### 3. Generate Integration Tests

```
/test-gen server/internal/api/handlers/flows.go --integration
```

**Generates**:
- `server/tests/integration/flows_test.go`
- Full request/response tests
- Database setup/teardown
- Mock HTTP server

---

### 4. Generate Mocks

```
/test-gen server/internal/storage/flows/repository.go --mocks
```

**Generates**:
- `server/internal/storage/flows/mocks/repository_mock.go`
- Mock implementation of Repository interface
- Using testify/mock or gomock

---

## Instructions for AI Agent

### Step 1: Read Source File

- Read the source file completely
- Identify all public functions/methods
- Identify all public types/interfaces
- Understand dependencies and imports

### Step 2: Analyze Test Requirements

**For Go files**:
- Public functions → unit tests
- Methods on structs → test each method
- Interfaces → generate mocks
- Error cases → test error handling
- Edge cases → identify from function logic

**For TypeScript/React**:
- Components → render tests, interaction tests
- Hooks → hook behavior tests
- Utilities → pure function tests
- API clients → mock response tests

### Step 3: Generate Test File

Create test file with:
1. Proper package/imports
2. Test setup/teardown (if needed)
3. Test cases for each function
4. Assertions following AAA pattern
5. Coverage for happy path + error cases

---

## Templates

### Go Unit Test Template

```go
// {{file}}_test.go
package {{package}}

import (
    "context"
    "testing"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
)

// Test{{FunctionName}}_Success tests the happy path
func Test{{FunctionName}}_Success(t *testing.T) {
    // Arrange
    {{setup}}

    // Act
    result, err := {{FunctionName}}({{args}})

    // Assert
    require.NoError(t, err)
    assert.NotNil(t, result)
    assert.Equal(t, expected, result)
}

// Test{{FunctionName}}_Error tests error handling
func Test{{FunctionName}}_Error(t *testing.T) {
    // Arrange
    {{setup_for_error}}

    // Act
    result, err := {{FunctionName}}({{args}})

    // Assert
    require.Error(t, err)
    assert.Nil(t, result)
    assert.Contains(t, err.Error(), "expected error message")
}

// Test{{FunctionName}}_EdgeCases tests edge cases
func Test{{FunctionName}}_EdgeCases(t *testing.T) {
    tests := []struct {
        name     string
        input    {{InputType}}
        expected {{OutputType}}
        wantErr  bool
    }{
        {
            name:     "empty input",
            input:    {{EmptyInput}},
            expected: {{EmptyExpected}},
            wantErr:  true,
        },
        {
            name:     "nil input",
            input:    nil,
            expected: nil,
            wantErr:  true,
        },
        // TODO: Add more edge cases
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // Act
            result, err := {{FunctionName}}(tt.input)

            // Assert
            if tt.wantErr {
                require.Error(t, err)
            } else {
                require.NoError(t, err)
                assert.Equal(t, tt.expected, result)
            }
        })
    }
}
```

### Go Table-Driven Test Template

```go
func Test{{FunctionName}}(t *testing.T) {
    tests := []struct {
        name    string
        input   {{InputType}}
        want    {{OutputType}}
        wantErr bool
    }{
        {
            name:    "valid input",
            input:   {{ValidInput}},
            want:    {{ExpectedOutput}},
            wantErr: false,
        },
        {
            name:    "invalid input",
            input:   {{InvalidInput}},
            want:    nil,
            wantErr: true,
        },
        {
            name:    "empty input",
            input:   {{EmptyInput}},
            want:    nil,
            wantErr: true,
        },
        // TODO: Add more test cases
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // Arrange
            ctx := context.Background()

            // Act
            got, err := {{FunctionName}}(ctx, tt.input)

            // Assert
            if tt.wantErr {
                require.Error(t, err)
                return
            }

            require.NoError(t, err)
            assert.Equal(t, tt.want, got)
        })
    }
}
```

### Go Method Test Template (Struct Methods)

```go
type {{StructName}}TestSuite struct {
    suite.Suite
    {{fieldName}} *{{StructName}}
    // Mock dependencies
    mockDB    *sql.DB
    mockCache *redis.Client
}

func (s *{{StructName}}TestSuite) SetupTest() {
    // Initialize test dependencies
    s.mockDB = setupTestDB()
    s.mockCache = setupTestCache()

    // Create instance
    s.{{fieldName}} = New{{StructName}}(s.mockDB, s.mockCache)
}

func (s *{{StructName}}TestSuite) TearDownTest() {
    // Cleanup
    if s.mockDB != nil {
        s.mockDB.Close()
    }
}

func (s *{{StructName}}TestSuite) Test{{MethodName}}_Success() {
    // Arrange
    ctx := context.Background()
    input := {{TestInput}}

    // Act
    result, err := s.{{fieldName}}.{{MethodName}}(ctx, input)

    // Assert
    s.NoError(err)
    s.NotNil(result)
    s.Equal(expected, result)
}

func Test{{StructName}}Suite(t *testing.T) {
    suite.Run(t, new({{StructName}}TestSuite))
}
```

### React Component Test Template

```typescript
// {{ComponentName}}.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { {{ComponentName}} } from './{{ComponentName}}';

describe('{{ComponentName}}', () => {
  // Render test
  it('renders without crashing', () => {
    render(<{{ComponentName}} />);
    expect(screen.getByRole('{{role}}')).toBeInTheDocument();
  });

  // Props test
  it('renders with props', () => {
    const props = {
      // TODO: Add test props
    };
    render(<{{ComponentName}} {...props} />);
    expect(screen.getByText(props.title)).toBeInTheDocument();
  });

  // Interaction test
  it('handles user interaction', async () => {
    const user = userEvent.setup();
    const handleClick = jest.fn();

    render(<{{ComponentName}} onClick={handleClick} />);

    const button = screen.getByRole('button');
    await user.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  // State test
  it('updates state correctly', async () => {
    const user = userEvent.setup();
    render(<{{ComponentName}} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'test value');

    expect(input).toHaveValue('test value');
  });

  // Async test
  it('handles async operations', async () => {
    render(<{{ComponentName}} />);

    // Wait for async operation
    await waitFor(() => {
      expect(screen.getByText('Loaded')).toBeInTheDocument();
    });
  });

  // Error test
  it('handles errors gracefully', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation();

    render(<{{ComponentName}} throwError={true} />);

    expect(screen.getByText('Error occurred')).toBeInTheDocument();

    consoleError.mockRestore();
  });
});
```

### API Handler Integration Test Template

```go
// server/tests/integration/{{handler}}_test.go
package integration

import (
    "bytes"
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "testing"

    "github.com/gin-gonic/gin"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
    "github.com/testmesh/server/internal/api/handlers"
    "github.com/testmesh/server/internal/storage"
)

func setupTestServer(t *testing.T) *gin.Engine {
    // Setup test database
    db := setupTestDB(t)
    t.Cleanup(func() { db.Close() })

    // Setup router
    router := gin.New()

    // Setup handlers
    handler := handlers.New{{Handler}}(storage.NewRepository(db))

    // Register routes
    v1 := router.Group("/api/v1")
    {
        v1.POST("/{{resource}}", handler.Create)
        v1.GET("/{{resource}}", handler.List)
        v1.GET("/{{resource}}/:id", handler.Get)
        v1.PUT("/{{resource}}/:id", handler.Update)
        v1.DELETE("/{{resource}}/:id", handler.Delete)
    }

    return router
}

func TestCreate{{Resource}}_Success(t *testing.T) {
    // Arrange
    router := setupTestServer(t)

    payload := map[string]interface{}{
        "name": "Test {{Resource}}",
        // TODO: Add required fields
    }
    body, _ := json.Marshal(payload)

    req := httptest.NewRequest(http.MethodPost, "/api/v1/{{resource}}", bytes.NewBuffer(body))
    req.Header.Set("Content-Type", "application/json")
    w := httptest.NewRecorder()

    // Act
    router.ServeHTTP(w, req)

    // Assert
    assert.Equal(t, http.StatusCreated, w.Code)

    var response map[string]interface{}
    err := json.Unmarshal(w.Body.Bytes(), &response)
    require.NoError(t, err)

    assert.NotEmpty(t, response["id"])
    assert.Equal(t, "Test {{Resource}}", response["name"])
}

func TestCreate{{Resource}}_InvalidInput(t *testing.T) {
    // Arrange
    router := setupTestServer(t)

    payload := map[string]interface{}{
        // Missing required fields
    }
    body, _ := json.Marshal(payload)

    req := httptest.NewRequest(http.MethodPost, "/api/v1/{{resource}}", bytes.NewBuffer(body))
    req.Header.Set("Content-Type", "application/json")
    w := httptest.NewRecorder()

    // Act
    router.ServeHTTP(w, req)

    // Assert
    assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestGet{{Resource}}_NotFound(t *testing.T) {
    // Arrange
    router := setupTestServer(t)

    nonExistentID := "00000000-0000-0000-0000-000000000000"
    req := httptest.NewRequest(http.MethodGet, "/api/v1/{{resource}}/"+nonExistentID, nil)
    w := httptest.NewRecorder()

    // Act
    router.ServeHTTP(w, req)

    // Assert
    assert.Equal(t, http.StatusNotFound, w.Code)
}
```

---

## Step 4: Test Coverage Analysis

After generating tests, analyze what's covered:

**Checklist**:
- [ ] All public functions have tests
- [ ] Happy path tested
- [ ] Error cases tested
- [ ] Edge cases identified (empty, nil, boundary values)
- [ ] Concurrent access tested (if applicable)
- [ ] Integration points tested
- [ ] Mock dependencies where appropriate

---

## Step 5: Generate Test Helpers

If tests need common setup, generate helper files:

```go
// {{package}}/testhelpers.go
package {{package}}

import (
    "database/sql"
    "testing"
)

func setupTestDB(t *testing.T) *sql.DB {
    db, err := sql.Open("postgres", "postgresql://localhost/testmesh_test")
    if err != nil {
        t.Fatalf("failed to open test database: %v", err)
    }

    // Run migrations
    if err := runMigrations(db); err != nil {
        t.Fatalf("failed to run migrations: %v", err)
    }

    // Cleanup after test
    t.Cleanup(func() {
        cleanupTestDB(db)
        db.Close()
    })

    return db
}

func cleanupTestDB(db *sql.DB) {
    // Truncate all tables
    tables := []string{"flows", "executions", "steps"}
    for _, table := range tables {
        db.Exec("TRUNCATE TABLE " + table + " CASCADE")
    }
}
```

---

## Step 6: Report to User

```markdown
✅ Generated tests for {{file}}

Test file: {{test_file}}

Coverage:
- {{num_functions}} functions tested
- {{num_test_cases}} test cases generated
- Happy path: ✅
- Error cases: ✅
- Edge cases: ✅

To run tests:
```bash
# Go
go test -v ./{{package}}

# TypeScript
npm test {{test_file}}
```

Next steps:
1. Review generated tests
2. Add TODO test cases
3. Run tests and verify coverage
4. Commit test file with implementation
```

---

## Test Quality Standards

All generated tests MUST:
- ✅ Follow AAA pattern (Arrange, Act, Assert)
- ✅ Have descriptive test names
- ✅ Test one thing per test
- ✅ Be independent (no shared state)
- ✅ Be deterministic (no flaky tests)
- ✅ Clean up resources
- ✅ Use proper assertions (require vs assert)
- ✅ Include error message context

**Coverage Target**: >80% for all new code

---

## Important Notes

- **Read the implementation file** completely before generating tests
- **Identify all code paths** including error cases
- **Use table-driven tests** for similar test cases
- **Mock external dependencies** (database, HTTP, file system)
- **Test edge cases** (nil, empty, boundary values)
- **Follow CODING_STANDARDS.md** for test conventions
- **Include TODO comments** for tests that need customization

---

## Advanced Features

### Coverage-Driven Test Generation

```
/test-gen server/internal/runner/executor.go --coverage
```

1. Run existing tests with coverage
2. Identify uncovered lines
3. Generate tests specifically for uncovered code
4. Report new coverage after generated tests

### Mock Generation

```
/test-gen server/internal/storage/flows/repository.go --mocks
```

Generates mocks for all interfaces using testify/mock or gomock.

---

**Version**: 1.0.0
**Last Updated**: 2026-02-11
