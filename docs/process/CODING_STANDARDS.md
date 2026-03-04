# TestMesh Coding Standards

> **Explicit rules for writing clean, maintainable, secure code**

**Version**: 1.0
**Date**: 2026-02-11
**Status**: Mandatory ✅

---

## Table of Contents

1. [Core Philosophy](#core-philosophy)
2. [Go Standards](#go-standards)
3. [TypeScript/React Standards](#typescriptreact-standards)
4. [General Rules](#general-rules)
5. [Naming Conventions](#naming-conventions)
6. [Error Handling](#error-handling)
7. [Testing Standards](#testing-standards)
8. [Comments & Documentation](#comments--documentation)
9. [Dependency Management](#dependency-management)
10. [Code Review Guidelines](#code-review-guidelines)

---

## Core Philosophy

### Simple Over Clever

```go
// Bad ❌ - Clever but hard to understand
func p(d []int) (r []int) {
    for _, v := range d {
        if v > 0 { r = append(r, v*v) }
    }
    return
}

// Good ✅ - Simple and clear
func squarePositiveNumbers(numbers []int) []int {
    var result []int
    for _, number := range numbers {
        if number > 0 {
            squared := number * number
            result = append(result, squared)
        }
    }
    return result
}
```

**Principles**:
- ✅ Code should be **boring** (predictable, not surprising)
- ✅ Explicit is better than implicit
- ✅ Verbose is better than terse (within reason)
- ✅ Clear intent over compact code

---

## Go Standards

### Package Structure

```
server/internal/
├── api/              # API Domain
│   ├── handlers/     # HTTP handlers
│   ├── middleware/   # Middleware functions
│   └── routes/       # Route definitions
├── runner/           # Runner Domain
│   ├── actions/      # Action handlers
│   ├── assertions/   # Assertion engine
│   └── executor/     # Flow executor
├── storage/          # Storage Domain
│   ├── models/       # Data models
│   └── repositories/ # Data access
└── shared/           # Shared utilities
    ├── errors/       # Error types
    ├── logger/       # Logging
    └── validator/    # Validation
```

### Naming Conventions

**Packages**:
```go
// Good ✅
package handlers
package executor
package validator

// Bad ❌
package httpHandlers  // No camelCase
package Executor      // No capitalization
package utils         // Too vague
```

**Functions**:
```go
// Public functions: PascalCase
func ExecuteFlow(flow *Flow) error { }
func ValidateInput(input string) bool { }

// Private functions: camelCase
func parseConfig(config map[string]interface{}) error { }
func buildQuery(params QueryParams) string { }
```

**Variables**:
```go
// Good ✅
var userID string
var maxRetries int
var httpClient *http.Client

// Bad ❌
var userId string    // Use userID (ID in all caps)
var MaxRetries int   // Should be private
var client *http.Client  // Too vague (httpClient is better)
```

**Constants**:
```go
// Public constants: PascalCase
const DefaultTimeout = 30 * time.Second
const MaxRetries = 3

// Private constants: camelCase
const defaultPort = 5016
const bufferSize = 1024
```

### Function Structure

**Keep functions small** (< 50 lines):
```go
// Good ✅ - Small, focused function
func ValidateEmail(email string) error {
    if email == "" {
        return errors.New("email is required")
    }

    emailRegex := regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
    if !emailRegex.MatchString(email) {
        return errors.New("invalid email format")
    }

    return nil
}

// Bad ❌ - Too large (extract sub-functions)
func ProcessUserRegistration(req *Request) error {
    // 200 lines of mixed logic
    // Validation, database, email, logging all in one function
}
```

### Error Handling

**Always wrap errors with context**:
```go
// Good ✅
func FetchUser(id string) (*User, error) {
    user, err := db.Query("SELECT * FROM users WHERE id = $1", id)
    if err != nil {
        return nil, fmt.Errorf("failed to fetch user %s: %w", id, err)
    }
    return user, nil
}

// Bad ❌
func FetchUser(id string) (*User, error) {
    user, err := db.Query("SELECT * FROM users WHERE id = $1", id)
    if err != nil {
        return nil, err  // Lost context!
    }
    return user, nil
}
```

**Custom error types for domain errors**:
```go
// Define error types
type ValidationError struct {
    Field   string
    Message string
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("validation error on field '%s': %s", e.Field, e.Message)
}

// Use in code
func ValidateUser(user *User) error {
    if user.Email == "" {
        return &ValidationError{
            Field:   "email",
            Message: "email is required",
        }
    }
    return nil
}
```

### Struct Definition

```go
// Good ✅ - Clear, organized
type HTTPActionHandler struct {
    client      *http.Client
    timeout     time.Duration
    maxRetries  int
    logger      *Logger
}

func NewHTTPActionHandler(options ...Option) *HTTPActionHandler {
    handler := &HTTPActionHandler{
        client:     &http.Client{},
        timeout:    30 * time.Second,
        maxRetries: 3,
        logger:     NewLogger(),
    }

    for _, opt := range options {
        opt(handler)
    }

    return handler
}

// Bad ❌ - No constructor, public fields
type HTTPActionHandler struct {
    Client     *http.Client  // Should be private
    Timeout    time.Duration // Should be private
    MaxRetries int          // Should be private
}
```

### Interface Definition

**Keep interfaces small** (1-3 methods):
```go
// Good ✅ - Small, focused interfaces
type ActionHandler interface {
    Execute(config map[string]interface{}, ctx *Context) (*Result, error)
}

type Logger interface {
    Info(msg string, fields map[string]interface{})
    Error(msg string, fields map[string]interface{})
}

// Bad ❌ - Too large (God interface)
type Handler interface {
    Execute()
    Validate()
    Log()
    Notify()
    Cleanup()
    // ... 10 more methods
}
```

### Goroutines & Concurrency

**Always use context for cancellation**:
```go
// Good ✅
func ProcessItems(ctx context.Context, items []Item) error {
    for _, item := range items {
        select {
        case <-ctx.Done():
            return ctx.Err()
        default:
            if err := processItem(item); err != nil {
                return err
            }
        }
    }
    return nil
}

// Bad ❌ - No cancellation support
func ProcessItems(items []Item) error {
    for _, item := range items {
        if err := processItem(item); err != nil {
            return err
        }
    }
    return nil
}
```

**Use sync.WaitGroup for goroutines**:
```go
// Good ✅
func ProcessConcurrently(items []Item) error {
    var wg sync.WaitGroup
    errChan := make(chan error, len(items))

    for _, item := range items {
        wg.Add(1)
        go func(item Item) {
            defer wg.Done()
            if err := process(item); err != nil {
                errChan <- err
            }
        }(item)
    }

    wg.Wait()
    close(errChan)

    // Check for errors
    for err := range errChan {
        if err != nil {
            return err
        }
    }

    return nil
}
```

---

## TypeScript/React Standards

### File Structure

```
web/dashboard/src/
├── app/              # Next.js app router
│   ├── page.tsx      # Home page
│   └── layout.tsx    # Root layout
├── components/       # Reusable components
│   ├── ui/          # UI primitives (shadcn/ui)
│   └── features/    # Feature-specific components
├── lib/             # Utilities
│   ├── api/         # API client
│   ├── hooks/       # Custom hooks
│   └── utils/       # Helper functions
├── types/           # TypeScript types
└── styles/          # Global styles
```

### Naming Conventions

**Files**:
```
// Components: PascalCase
FlowEditor.tsx
NodePalette.tsx
ExecutionTimeline.tsx

// Utilities: camelCase
api.ts
formatDate.ts
validateFlow.ts

// Types: PascalCase
Flow.ts
Action.ts
User.ts
```

**Components**:
```tsx
// Good ✅ - Named export with PascalCase
export function FlowEditor({ flow }: FlowEditorProps) {
    return <div>...</div>;
}

// Bad ❌ - Default export (harder to refactor)
export default function flowEditor(props: any) {
    return <div>...</div>;
}
```

**Variables & Functions**:
```typescript
// Variables: camelCase
const userName = "John";
const isAuthenticated = true;
const flowCount = 10;

// Functions: camelCase
function fetchUser(id: string) { }
function validateInput(input: string) { }
function formatDate(date: Date) { }

// Constants: UPPER_SNAKE_CASE
const API_BASE_URL = "https://api.testmesh.io";
const MAX_RETRIES = 3;
const DEFAULT_TIMEOUT = 30000;
```

### Component Structure

```tsx
// Good ✅ - Clear structure
interface FlowEditorProps {
    flow: Flow;
    onSave: (flow: Flow) => void;
    onCancel: () => void;
}

export function FlowEditor({ flow, onSave, onCancel }: FlowEditorProps) {
    // 1. Hooks
    const [isEditing, setIsEditing] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);

    // 2. Derived state
    const hasChanges = useMemo(() => {
        return flow !== originalFlow;
    }, [flow, originalFlow]);

    // 3. Event handlers
    const handleSave = useCallback(() => {
        if (validate(flow)) {
            onSave(flow);
        }
    }, [flow, onSave]);

    // 4. Effects
    useEffect(() => {
        // Load flow data
    }, [flow.id]);

    // 5. Render
    return (
        <div className="flow-editor">
            {/* Component JSX */}
        </div>
    );
}
```

### TypeScript Strictness

**Always use strict mode**:
```json
// tsconfig.json
{
    "compilerOptions": {
        "strict": true,
        "noImplicitAny": true,
        "strictNullChecks": true,
        "strictFunctionTypes": true,
        "noUnusedLocals": true,
        "noUnusedParameters": true
    }
}
```

**Avoid `any`** (use `unknown` if needed):
```typescript
// Bad ❌
function process(data: any) {
    return data.value;
}

// Good ✅
function process(data: unknown) {
    if (typeof data === 'object' && data !== null && 'value' in data) {
        return (data as { value: string }).value;
    }
    throw new Error('Invalid data format');
}
```

### Props & State Types

**Always define interfaces for props**:
```tsx
// Good ✅
interface ButtonProps {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    variant?: 'primary' | 'secondary';
}

export function Button({ label, onClick, disabled = false, variant = 'primary' }: ButtonProps) {
    return <button onClick={onClick} disabled={disabled}>{label}</button>;
}

// Bad ❌
export function Button(props: any) {
    return <button>{props.label}</button>;
}
```

### Hooks

**Custom hooks naming: use\***:
```typescript
// Good ✅
function useFlowEditor(flowId: string) {
    const [flow, setFlow] = useState<Flow | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchFlow(flowId).then(setFlow).finally(() => setLoading(false));
    }, [flowId]);

    return { flow, loading };
}

// Usage
const { flow, loading } = useFlowEditor(flowId);
```

**Dependency arrays must be complete**:
```typescript
// Good ✅
useEffect(() => {
    fetchData(userId, filter);
}, [userId, filter]); // All dependencies listed

// Bad ❌
useEffect(() => {
    fetchData(userId, filter);
}, []); // Missing dependencies!
```

---

## General Rules

### 1. No Unused Dependencies

**Before adding a dependency, ask**:
- Do we really need this?
- Can we implement it ourselves easily?
- What's the maintenance burden?
- What's the bundle size impact?

```json
// Bad ❌ - Unused dependency
{
    "dependencies": {
        "lodash": "^4.17.21",  // Using only 1 function
        "moment": "^2.29.4"    // date-fns is already used
    }
}

// Good ✅ - Minimal dependencies
{
    "dependencies": {
        "date-fns": "^2.30.0"  // One date library
    }
}
```

### 2. Type Safety Everywhere

**Go**: Use specific types, not `interface{}`
```go
// Bad ❌
func Process(data interface{}) interface{} {
    return data
}

// Good ✅
func ProcessUser(user *User) (*ProcessedUser, error) {
    return &ProcessedUser{...}, nil
}
```

**TypeScript**: Enable strict mode, avoid `any`
```typescript
// Bad ❌
function format(value: any): any {
    return value.toString();
}

// Good ✅
function format(value: string | number): string {
    return value.toString();
}
```

### 3. No Mock Data in Production Paths

**Mock data only in tests**:
```go
// Bad ❌
func GetUser(id string) *User {
    if os.Getenv("ENV") == "development" {
        return &User{ID: "mock", Name: "Mock User"}
    }
    return fetchUserFromDB(id)
}

// Good ✅
func GetUser(id string) *User {
    return fetchUserFromDB(id)
}

// Tests use mocks
func TestGetUser(t *testing.T) {
    mockDB := NewMockDB()
    user := GetUser("123") // Uses mock in test
}
```

### 4. No Premature Optimization

**Make it work, then make it fast (if needed)**:
```go
// Bad ❌ - Premature optimization
func FindUser(users []User, id string) *User {
    // Complex caching, binary search, etc.
    // before we even know if performance is an issue
}

// Good ✅ - Simple first
func FindUser(users []User, id string) *User {
    for _, user := range users {
        if user.ID == id {
            return &user
        }
    }
    return nil
}

// Optimize ONLY if benchmarks show it's slow
```

### 5. DRY (Don't Repeat Yourself)

**Extract common logic**:
```go
// Bad ❌ - Repeated validation
func CreateUser(user *User) error {
    if user.Email == "" {
        return errors.New("email required")
    }
    if !isValidEmail(user.Email) {
        return errors.New("invalid email")
    }
    // ...
}

func UpdateUser(user *User) error {
    if user.Email == "" {
        return errors.New("email required")
    }
    if !isValidEmail(user.Email) {
        return errors.New("invalid email")
    }
    // ...
}

// Good ✅ - Extract validation
func ValidateUser(user *User) error {
    if user.Email == "" {
        return errors.New("email required")
    }
    if !isValidEmail(user.Email) {
        return errors.New("invalid email")
    }
    return nil
}

func CreateUser(user *User) error {
    if err := ValidateUser(user); err != nil {
        return err
    }
    // ...
}

func UpdateUser(user *User) error {
    if err := ValidateUser(user); err != nil {
        return err
    }
    // ...
}
```

---

## Naming Conventions

### Be Descriptive

```go
// Bad ❌
var d time.Duration
var u *User
func p() {}

// Good ✅
var requestTimeout time.Duration
var currentUser *User
func processPayment() {}
```

### Boolean Variables

**Use is/has/can/should prefix**:
```go
// Good ✅
isValid := validate(input)
hasPermission := checkPermission(user)
canEdit := user.Role == "admin"
shouldRetry := attempts < maxRetries

// Bad ❌
valid := validate(input)  // Not clear it's boolean
permission := checkPermission(user)  // Could be the permission itself
```

### Collections

**Use plural names**:
```go
// Good ✅
var users []User
var flows []*Flow
var errors []error

// Bad ❌
var userList []User  // Redundant "List"
var flowArray []*Flow  // Type is already clear
```

### Avoid Abbreviations

**Clarity over brevity**:
```go
// Good ✅
var requestCount int
var maximumRetries int
var database *sql.DB

// Bad ❌
var reqCnt int  // What's "Cnt"?
var maxRtrs int  // Unreadable
var db *sql.DB  // OK - "db" is universally understood
```

---

## Error Handling

### Always Check Errors

```go
// Bad ❌
data, _ := fetchData()

// Good ✅
data, err := fetchData()
if err != nil {
    return fmt.Errorf("failed to fetch data: %w", err)
}
```

### Wrap Errors with Context

```go
// Bad ❌
if err != nil {
    return err
}

// Good ✅
if err != nil {
    return fmt.Errorf("failed to process user %s: %w", userID, err)
}
```

### Return Errors, Don't Panic

```go
// Bad ❌
func MustGetConfig() *Config {
    config, err := loadConfig()
    if err != nil {
        panic(err)  // Crashes the program!
    }
    return config
}

// Good ✅
func GetConfig() (*Config, error) {
    config, err := loadConfig()
    if err != nil {
        return nil, fmt.Errorf("failed to load config: %w", err)
    }
    return config, nil
}
```

---

## Testing Standards

### Test File Naming

```
// Go
handler.go       → handler_test.go
validator.go     → validator_test.go

// TypeScript
Button.tsx       → Button.test.tsx
utils.ts         → utils.test.ts
```

### Test Function Naming

**Pattern**: `Test<Function>_<Scenario>_<ExpectedOutcome>`

```go
func TestCreateUser_ValidInput_ReturnsUser(t *testing.T) {}
func TestCreateUser_EmptyEmail_ReturnsError(t *testing.T) {}
func TestCreateUser_DuplicateEmail_ReturnsError(t *testing.T) {}
```

### Test Structure (AAA Pattern)

```go
func TestExecuteFlow_ValidFlow_Success(t *testing.T) {
    // Arrange
    flow := &Flow{
        Name: "Test Flow",
        Steps: []Step{
            {Action: "http_request", Config: map[string]interface{}{}},
        },
    }
    executor := NewExecutor()

    // Act
    result, err := executor.Execute(flow)

    // Assert
    assert.NoError(t, err)
    assert.True(t, result.Success)
}
```

### Coverage Requirements

- ✅ Minimum 80% coverage
- ✅ All public functions tested
- ✅ Happy path tested
- ✅ Error cases tested
- ✅ Edge cases tested

---

## Comments & Documentation

### When to Comment

**Comment WHY, not WHAT**:
```go
// Bad ❌ - Explaining what (obvious)
// Increment counter by 1
counter++

// Good ✅ - Explaining why (non-obvious)
// We increment by 1 to account for zero-based indexing
// when displaying to users who expect 1-based counting
counter++
```

### Public API Documentation

**All exported functions must have doc comments**:
```go
// ExecuteFlow runs a test flow and returns the execution result.
// It validates the flow structure, executes each step sequentially,
// and collects results and artifacts.
//
// Parameters:
//   - flow: The flow definition to execute
//   - ctx: Execution context with variables and environment
//
// Returns:
//   - *ExecutionResult: Contains success status, outputs, and artifacts
//   - error: Any error encountered during execution
func ExecuteFlow(flow *Flow, ctx *Context) (*ExecutionResult, error) {
    // ...
}
```

### TODOs are NOT Allowed in Main Branch

```go
// Bad ❌
// TODO: Add error handling
// FIXME: This is a hack
// HACK: Temporary workaround

// If something needs to be done, do it before merging!
```

---

## Dependency Management

### Approval Required for New Dependencies

**Process**:
1. Justify need
2. Check license
3. Check maintenance status
4. Check security vulnerabilities
5. Evaluate alternatives
6. Get approval
7. Add dependency

### Update Dependencies Regularly

```bash
# Go
go get -u ./...
go mod tidy

# JavaScript
npm update
npm audit fix
```

---

## Summary

### Quick Reference

**Naming**:
- ✅ Be descriptive, avoid abbreviations
- ✅ Boolean: is/has/can/should prefix
- ✅ Collections: plural names
- ✅ Functions: verb + noun

**Code Quality**:
- ✅ Simple over clever
- ✅ Explicit over implicit
- ✅ Small functions (< 50 lines)
- ✅ No premature optimization

**Error Handling**:
- ✅ Always check errors
- ✅ Wrap with context
- ✅ Return errors, don't panic

**Testing**:
- ✅ > 80% coverage
- ✅ AAA pattern
- ✅ Test happy path + edge cases

**Security**:
- ✅ No secrets in code
- ✅ Validate all input
- ✅ Type safety everywhere

**Dependencies**:
- ✅ Minimal dependencies
- ✅ Justify each addition
- ✅ Regular updates

---

**Version**: 1.0
**Last Updated**: 2026-02-11
**Status**: Mandatory ✅
