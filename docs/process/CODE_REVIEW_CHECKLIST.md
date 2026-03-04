# Code Review Checklist

> **Comprehensive review checklist for TestMesh v1.0 development**

**Version**: 1.0
**Date**: 2026-02-11
**Status**: Active ✅
**Binding**: Mandatory for all pull requests

---

## Overview

This checklist ensures every code change meets TestMesh quality standards before merge.

**Use this checklist for**:
- ✅ Pull request reviews (human reviewers)
- ✅ Self-reviews before PR creation
- ✅ AI agent validation
- ✅ Pre-commit validation

**Review time targets**:
- Small PR (1-3 files): 15-30 minutes
- Medium PR (4-5 files): 30-60 minutes
- Large PR (>5 files): **Should be split** (see Rule 5 in AGENT_CONTRACT.md)

---

## Quick Reference

### Review Outcomes

**✅ APPROVE**: All critical items pass, minor items addressed
**💬 REQUEST CHANGES**: Critical items fail or major concerns exist
**🤔 COMMENT**: Non-blocking suggestions for improvement
**❌ REJECT**: Fundamental issues (security, architecture violations, etc.)

---

## Part 1: Pre-Review Validation

**Before starting review, verify**:

- [ ] PR follows naming convention: `feat/`, `fix/`, `refactor/`, `docs/`, `test/`
- [ ] PR description includes context and testing details
- [ ] PR size is reasonable (3-5 files maximum)
- [ ] CI/CD checks are passing
- [ ] No merge conflicts exist
- [ ] Branch is up to date with target branch

**If any fail**: Ask author to fix before detailed review.

---

## Part 2: Functional Correctness

### 2.1 Requirements Alignment

**Critical ⚠️**

- [ ] Code implements **only** what's specified (no extra features)
- [ ] All acceptance criteria from issue/spec are met
- [ ] No scope creep or "nice to have" additions
- [ ] Implementation matches architecture decisions

**Questions to ask**:
- Does this solve the stated problem?
- Are we building what was requested, not what we assume is needed?
- Does this align with phase objectives?

---

### 2.2 Logic Correctness

**Critical ⚠️**

- [ ] Business logic is correct
- [ ] Edge cases are handled
- [ ] Error conditions are covered
- [ ] No off-by-one errors
- [ ] No race conditions or concurrency bugs
- [ ] No memory leaks (check defer statements, goroutine cleanup)

**Look for**:
```go
// ❌ Bad - Off-by-one error
for i := 1; i <= len(items); i++ {
    process(items[i]) // Panic on last iteration
}

// ✅ Good
for i := 0; i < len(items); i++ {
    process(items[i])
}
```

---

### 2.3 Error Handling

**Critical ⚠️**

- [ ] ALL errors are checked (no `_` ignoring errors)
- [ ] Errors are wrapped with context (`fmt.Errorf("context: %w", err)`)
- [ ] Error messages are helpful for debugging
- [ ] Errors don't leak sensitive information
- [ ] Appropriate error types used (custom errors where needed)

**Examples**:
```go
// ❌ Bad - Ignoring error
data, _ := fetchData()

// ❌ Bad - No context
if err != nil {
    return err
}

// ✅ Good - Proper error handling
data, err := fetchData()
if err != nil {
    return fmt.Errorf("failed to fetch user data for ID %d: %w", userID, err)
}
```

---

## Part 3: Security Review

**Reference**: [SECURITY_GUIDELINES.md](./SECURITY_GUIDELINES.md)

### 3.1 Secrets Management

**Critical ⚠️ - BLOCKER**

- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] No credentials in code or comments
- [ ] No secrets in test files
- [ ] Environment variables used correctly
- [ ] `.env` files in `.gitignore`

**Auto-reject if**:
```go
// ❌ REJECT - Hardcoded secret
apiKey := "sk_live_51Hx..."
password := "admin123"
token := "ghp_xxxxxxxxxxxx"
```

---

### 3.2 Input Validation

**Critical ⚠️**

- [ ] All user input is validated
- [ ] Input length limits enforced
- [ ] Type validation present
- [ ] Range checks for numeric input
- [ ] Format validation (email, URL, etc.)

**Example**:
```go
// ❌ Bad - No validation
func ProcessUserInput(input string) error {
    return processData(input)
}

// ✅ Good - Proper validation
func ProcessUserInput(input string) error {
    if input == "" {
        return errors.New("input cannot be empty")
    }
    if len(input) > 1000 {
        return errors.New("input exceeds maximum length of 1000 characters")
    }
    // Additional validation...
    return processData(input)
}
```

---

### 3.3 SQL Injection Prevention

**Critical ⚠️ - BLOCKER**

- [ ] All SQL queries use parameterized statements
- [ ] No string concatenation for queries
- [ ] ORM used correctly (if applicable)
- [ ] Dynamic table/column names properly validated

**Auto-reject if**:
```go
// ❌ REJECT - SQL injection vulnerability
query := "SELECT * FROM users WHERE id = " + userID

// ✅ Good - Parameterized query
query := "SELECT * FROM users WHERE id = $1"
rows, err := db.Query(query, userID)
```

---

### 3.4 XSS Prevention

**Critical ⚠️**

- [ ] All HTML output is escaped
- [ ] User input sanitized before rendering
- [ ] Proper Content-Security-Policy headers
- [ ] No `dangerouslySetInnerHTML` without sanitization (React)

**TypeScript/React example**:
```typescript
// ❌ Bad - XSS vulnerability
<div dangerouslySetInnerHTML={{__html: userInput}} />

// ✅ Good - Safe rendering
<div>{userInput}</div>

// ✅ Good - If HTML needed, sanitize first
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{__html: DOMPurify.sanitize(userInput)}} />
```

---

### 3.5 Authentication & Authorization

**Critical ⚠️**

- [ ] Authentication required for protected endpoints
- [ ] Authorization checks present
- [ ] User permissions verified
- [ ] No privilege escalation vulnerabilities
- [ ] Session management secure

---

### 3.6 Other Security Checks

**Important**

- [ ] HTTPS enforced (no HTTP fallback)
- [ ] CSRF protection for state-changing operations
- [ ] Rate limiting considered for API endpoints
- [ ] File upload restrictions (if applicable)
- [ ] No shell command injection vulnerabilities

---

## Part 4: Testing

### 4.1 Test Coverage

**Critical ⚠️**

- [ ] Tests are written (TDD approach followed)
- [ ] Coverage > 80% for new code
- [ ] Happy path tested
- [ ] Edge cases tested
- [ ] Error cases tested
- [ ] All tests pass locally

**Run coverage check**:
```bash
# Go
go test -cover ./...

# Target: > 80% coverage
```

---

### 4.2 Test Quality

**Important**

- [ ] Tests are readable and maintainable
- [ ] Test names clearly describe what's being tested
- [ ] Tests follow AAA pattern (Arrange, Act, Assert)
- [ ] No test interdependencies
- [ ] Tests are deterministic (no flaky tests)
- [ ] Mock/stub external dependencies

**Example**:
```go
// ✅ Good test structure
func TestHTTPActionHandler_Execute_Success(t *testing.T) {
    // Arrange
    handler := NewHTTPActionHandler()
    config := map[string]interface{}{
        "method": "GET",
        "url":    "https://api.example.com/users",
    }
    mockContext := createMockContext()

    // Act
    result, err := handler.Execute(config, mockContext)

    // Assert
    assert.NoError(t, err)
    assert.True(t, result.Success)
    assert.NotNil(t, result.Output)
}
```

---

### 4.3 Integration Tests

**Important**

- [ ] Integration tests for API endpoints
- [ ] Database integration tested (if applicable)
- [ ] External service integrations tested (with mocks)
- [ ] End-to-end critical paths tested

---

## Part 5: Code Quality

### 5.1 Readability

**Important**

- [ ] Code is self-documenting
- [ ] Variable names are descriptive
- [ ] Function names clearly describe intent
- [ ] No cryptic abbreviations
- [ ] Code structure is logical
- [ ] Similar to existing codebase patterns

**Reference**: [CODING_STANDARDS.md](./CODING_STANDARDS.md)

---

### 5.2 Complexity

**Important**

- [ ] Functions are small and focused (< 50 lines)
- [ ] Cyclomatic complexity is reasonable (< 10)
- [ ] No deeply nested logic (max 3-4 levels)
- [ ] Complex logic is broken into helper functions

**Check**:
```go
// ❌ Bad - Too complex
func ProcessData(data []Item) ([]Result, error) {
    // 150 lines of nested logic...
}

// ✅ Good - Broken down
func ProcessData(data []Item) ([]Result, error) {
    validated, err := validateItems(data)
    if err != nil {
        return nil, err
    }

    transformed := transformItems(validated)
    results := aggregateResults(transformed)

    return results, nil
}
```

---

### 5.3 Code Style

**Important**

- [ ] Follows language conventions (Go: `gofmt`, TypeScript: `prettier`)
- [ ] Linting passes without warnings
- [ ] Consistent with existing codebase
- [ ] No commented-out code
- [ ] No debug statements (`console.log`, `fmt.Println`)
- [ ] No unused imports or variables

**Run checks**:
```bash
# Go
gofmt -s -w .
golangci-lint run

# TypeScript
npm run lint
npm run format
```

---

### 5.4 DRY (Don't Repeat Yourself)

**Important**

- [ ] No code duplication
- [ ] Common logic extracted to functions
- [ ] Shared utilities used appropriately
- [ ] Constants used for magic numbers/strings

---

### 5.5 SOLID Principles

**Nice to Have**

- [ ] Single Responsibility: Each function/class has one job
- [ ] Open/Closed: Extensible without modification
- [ ] Interface Segregation: Focused interfaces
- [ ] Dependency Injection: Dependencies passed in, not hardcoded

---

## Part 6: Documentation

### 6.1 Code Comments

**Important**

- [ ] Public APIs documented (godoc style for Go)
- [ ] Complex logic explained with comments
- [ ] Non-obvious decisions documented
- [ ] Comments explain "why", not "what"
- [ ] No outdated comments

**Example**:
```go
// ❌ Bad - Stating the obvious
// Increment counter
counter++

// ✅ Good - Explaining why
// Add 1 to account for zero-based indexing when displaying to users
counter++

// ✅ Good - Explaining complex logic
// We use exponential backoff here because the API rate limit resets
// every 60 seconds. Starting with 1s and doubling prevents us from
// hitting the limit while still retrying quickly for transient errors.
backoff := time.Second
for attempts := 0; attempts < maxRetries; attempts++ {
    // ...
}
```

---

### 6.2 API Documentation

**Critical for Public APIs ⚠️**

- [ ] Public functions have godoc comments (Go)
- [ ] TypeScript interfaces documented with JSDoc
- [ ] API parameters documented
- [ ] Return values documented
- [ ] Example usage provided (if non-trivial)

**Go example**:
```go
// CreateWorkflow creates a new workflow definition with the given configuration.
//
// Parameters:
//   - name: Unique identifier for the workflow
//   - config: Workflow configuration including actions and assertions
//
// Returns:
//   - *Workflow: The created workflow instance
//   - error: Error if validation fails or workflow already exists
//
// Example:
//   workflow, err := CreateWorkflow("checkout-flow", config)
//   if err != nil {
//       return fmt.Errorf("workflow creation failed: %w", err)
//   }
func CreateWorkflow(name string, config *WorkflowConfig) (*Workflow, error) {
    // ...
}
```

---

### 6.3 README Updates

**If Applicable**

- [ ] README updated for new features
- [ ] Examples added/updated
- [ ] Setup instructions current
- [ ] Breaking changes documented

---

## Part 7: Performance

### 7.1 Efficiency

**Important**

- [ ] No obvious performance issues
- [ ] Appropriate data structures used
- [ ] No N+1 query problems
- [ ] Database queries optimized
- [ ] Pagination for large datasets

---

### 7.2 Resource Management

**Important**

- [ ] No memory leaks
- [ ] Goroutines cleaned up properly (Go)
- [ ] Database connections closed
- [ ] File handles closed (defer pattern)
- [ ] HTTP response bodies closed

**Check**:
```go
// ❌ Bad - Connection leak
resp, err := http.Get(url)
data, _ := ioutil.ReadAll(resp.Body)

// ✅ Good - Proper cleanup
resp, err := http.Get(url)
if err != nil {
    return err
}
defer resp.Body.Close()

data, err := ioutil.ReadAll(resp.Body)
```

---

### 7.3 Scalability Considerations

**Nice to Have**

- [ ] Code can handle growth
- [ ] No hardcoded limits that will break
- [ ] Caching used appropriately
- [ ] Background jobs for heavy operations

---

## Part 8: Architecture & Design

### 8.1 Architectural Compliance

**Critical ⚠️**

- [ ] Follows modular monolith architecture
- [ ] No architecture changes without approval
- [ ] Domain boundaries respected
- [ ] No circular dependencies
- [ ] Follows existing patterns

**Reference**: [ARCHITECTURE.md](./ARCHITECTURE.md), [MODULAR_MONOLITH.md](./MODULAR_MONOLITH.md)

---

### 8.2 API Design

**Important**

- [ ] RESTful conventions followed (if REST API)
- [ ] Consistent naming across endpoints
- [ ] Proper HTTP methods used
- [ ] Appropriate status codes
- [ ] Versioning considered

---

### 8.3 Database Design

**If Applicable**

- [ ] Schema changes are backward compatible
- [ ] Migrations provided
- [ ] Indexes appropriate
- [ ] Constraints enforced at DB level
- [ ] No denormalization without justification

---

## Part 9: Dependencies

### 9.1 Dependency Management

**Important**

- [ ] New dependencies justified
- [ ] Dependencies are actively maintained
- [ ] License compatible (check LICENSE.md)
- [ ] No unnecessary dependencies
- [ ] Version pinned (no `latest`)

---

### 9.2 Security Vulnerabilities

**Critical ⚠️**

- [ ] No known vulnerabilities in dependencies
- [ ] Dependencies scanned (`npm audit`, `go mod tidy && go list -m all | nancy`)

---

## Part 10: Git Hygiene

### 10.1 Commit Quality

**Important**

- [ ] Commit messages clear and descriptive
- [ ] Commits are atomic (one logical change)
- [ ] No "WIP" or "fix" commits (squash before merge)
- [ ] Follows conventional commit format

**Format**:
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Example**:
```
feat(workflow): add HTTP action handler

Implements HTTP request action handler with support for:
- GET, POST, PUT, DELETE methods
- Custom headers
- Request/response validation
- Timeout configuration

Closes #123
```

---

### 10.2 Branch Hygiene

**Important**

- [ ] Branch name follows convention
- [ ] Branch is up to date with target
- [ ] No merge commits (rebase preferred)
- [ ] No conflicts

---

## Review Workflow

### Step 1: Quick Scan (2 minutes)
1. Check PR size (should be 3-5 files)
2. Read PR description
3. Review changed files list
4. Identify potential red flags

### Step 2: Security Review (5 minutes)
**CRITICAL - Don't skip**
1. Search for secrets (API keys, passwords)
2. Check input validation
3. Review SQL queries
4. Check authentication/authorization

**Auto-reject if**:
- Hardcoded secrets
- SQL injection vulnerability
- Missing authentication

### Step 3: Functional Review (10 minutes)
1. Read the code changes
2. Verify logic correctness
3. Check error handling
4. Review edge cases

### Step 4: Test Review (5 minutes)
1. Check test coverage
2. Review test quality
3. Run tests locally if needed

### Step 5: Quality Review (5 minutes)
1. Check readability
2. Verify coding standards
3. Look for code smells
4. Check documentation

### Step 6: Final Checks (3 minutes)
1. Run linter
2. Check CI/CD status
3. Verify no breaking changes
4. Review dependencies

---

## Review Comments

### Effective Feedback

**Good feedback is**:
- ✅ Specific: Point to exact line numbers
- ✅ Actionable: Suggest concrete improvements
- ✅ Educational: Explain why, not just what
- ✅ Respectful: Assume good intent

**Examples**:

❌ **Bad comment**:
```
This is wrong.
```

✅ **Good comment**:
```
This could lead to a panic if `items` is empty (line 42).

Consider adding a length check:
if len(items) == 0 {
    return errors.New("items cannot be empty")
}
```

---

### Comment Categories

Use these prefixes:

- **🚨 BLOCKER**: Must fix before merge (security, correctness)
- **⚠️ CRITICAL**: Should fix before merge (error handling, tests)
- **💡 SUGGESTION**: Nice to have (optimization, readability)
- **❓ QUESTION**: Need clarification
- **👍 PRAISE**: Good work (positive feedback is important!)

---

## Approval Guidelines

### ✅ APPROVE when:
- All critical items pass
- No security issues
- Tests comprehensive and passing
- Code is maintainable
- Minor issues noted but non-blocking

### 💬 REQUEST CHANGES when:
- Critical items fail
- Security concerns exist
- Tests insufficient
- Major readability issues
- Architecture violations

### ❌ REJECT when:
- Secrets committed
- Critical security vulnerabilities
- Fundamental design flaws
- No tests for critical code
- Violates AGENT_CONTRACT.md rules

---

## Common Issues Checklist

Quick reference for common problems:

**Security** 🚨
- [ ] No hardcoded secrets
- [ ] No SQL injection
- [ ] Input validated
- [ ] Errors don't leak info

**Error Handling** ⚠️
- [ ] All errors checked
- [ ] Errors wrapped with context
- [ ] Meaningful error messages

**Testing** ⚠️
- [ ] Tests exist
- [ ] Coverage > 80%
- [ ] Edge cases covered

**Code Quality** 💡
- [ ] Readable and maintainable
- [ ] Follows conventions
- [ ] No code duplication
- [ ] No debug code

**Documentation** 💡
- [ ] Public APIs documented
- [ ] Complex logic commented
- [ ] README updated

---

## Self-Review Checklist

**Before creating PR, review your own code**:

1. **Read your changes like you're reviewing someone else's code**
2. **Run through this entire checklist**
3. **Fix issues before submitting**
4. **Write good PR description**

**Self-review catches**:
- 60% of issues before peer review
- Debug statements left behind
- Incomplete error handling
- Missing tests

---

## Tools & Automation

### Automated Checks

**Pre-commit hooks** (recommended):
```bash
# .git/hooks/pre-commit
#!/bin/bash
go fmt ./...
golangci-lint run
go test ./...
```

**CI/CD checks** (mandatory):
- Linting
- Test execution
- Coverage report
- Security scan
- Dependency audit

### Manual Checks

**Before every review**:
```bash
# Pull latest changes
git pull origin main

# Checkout PR branch
git checkout pr-branch

# Run tests
go test -v -cover ./...

# Run linter
golangci-lint run

# Check for secrets (optional)
git secrets --scan
```

---

## Summary

### Critical Review Areas (Must Check)

1. ✅ **Security**: No secrets, input validated, no injection vulnerabilities
2. ✅ **Correctness**: Logic works, errors handled, edge cases covered
3. ✅ **Tests**: Written, comprehensive, passing, coverage > 80%
4. ✅ **Architecture**: Follows patterns, no unauthorized changes

### Important Review Areas (Should Check)

5. ✅ **Readability**: Clear, maintainable, follows standards
6. ✅ **Documentation**: APIs documented, complex logic explained
7. ✅ **Performance**: No obvious issues, resources managed properly

### Nice-to-Have Review Areas (Time Permitting)

8. ✅ **Optimization**: Could be more efficient
9. ✅ **Extensibility**: Ready for future changes

---

## Remember

**Quality over speed**: It's better to do thorough review than fast review.

**Every review is a teaching opportunity**: Help teammates grow through feedback.

**We're building production software**: Real users depend on our code.

**When in doubt, ask questions**: Better to clarify than assume.

---

**Version**: 1.0
**Date**: 2026-02-11
**Status**: Active ✅
**Binding**: Mandatory for all pull requests

**Review with care. Merge with confidence.** 🚀
