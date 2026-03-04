# TestMesh Development Workflow

> **Clear boundaries, workflows, and permissions for safe, efficient development**

**Version**: 1.0
**Date**: 2026-02-11
**Status**: Active ✅

---

## Table of Contents

1. [Agent Permissions & Boundaries](#agent-permissions--boundaries)
2. [Git Workflow](#git-workflow)
3. [Development Cycle](#development-cycle)
4. [Review Process](#review-process)
5. [File Change Approval](#file-change-approval)
6. [When to Stop and Ask](#when-to-stop-and-ask)
7. [Phase Completion Criteria](#phase-completion-criteria)

---

## Agent Permissions & Boundaries

### What Agent CAN Modify (Green Zone ✅)

**Source Code**:
- ✅ `server/internal/**/*` - All internal Go code
- ✅ `server/cmd/**/*` - Command entry points
- ✅ `web/dashboard/src/**/*` - Frontend source code
- ✅ `web/dashboard/components/**/*` - React components
- ✅ `cli/cmd/**/*` - CLI commands
- ✅ `cli/pkg/**/*` - CLI packages
- ✅ `plugins/core/**/*` - Core plugin code

**Tests**:
- ✅ `tests/**/*` - All test files
- ✅ `server/internal/**/*_test.go` - Unit tests
- ✅ `web/dashboard/**/*.test.ts` - Frontend tests
- ✅ `web/dashboard/**/*.test.tsx` - Component tests

**Documentation**:
- ✅ `docs/**/*.md` - Documentation files
- ✅ `examples/**/*` - Example flows and code

### What Agent CANNOT Modify (Red Zone ❌)

**Infrastructure & Configuration**:
- ❌ `.github/**/*` - GitHub Actions workflows
- ❌ `.gitlab-ci.yml` - GitLab CI configuration
- ❌ `infrastructure/**/*` - Terraform, Kubernetes configs
- ❌ `Dockerfile` - Docker configuration
- ❌ `docker-compose.yml` - Docker Compose configuration
- ❌ `.env*` - Environment files

**Root Configuration Files**:
- ❌ `go.mod` - Go module definition
- ❌ `go.sum` - Go module checksums
- ❌ `package.json` - NPM dependencies (root)
- ❌ `package-lock.json` - NPM lockfile
- ❌ `tsconfig.json` - TypeScript configuration
- ❌ `.eslintrc*` - ESLint configuration
- ❌ `.prettierrc*` - Prettier configuration

**Critical Files**:
- ❌ `README.md` - Project README (updates require approval)
- ❌ `LICENSE` - License file
- ❌ `.gitignore` - Git ignore rules
- ❌ `Makefile` - Build scripts

### What Requires Approval (Yellow Zone ⚠️)

**Database**:
- ⚠️ `server/migrations/**/*` - Database migrations
  - **Rule**: All migrations must be reviewed before merge
  - **Reason**: Irreversible, affects production data

**Dependencies**:
- ⚠️ Adding new Go dependencies (go.mod)
  - **Rule**: Justify need, check license, review security
  - **Process**: Propose → Review → Approve → Add

- ⚠️ Adding new NPM dependencies (package.json)
  - **Rule**: Check bundle size impact, license, maintenance
  - **Process**: Propose → Review → Approve → Add

**Configuration**:
- ⚠️ `web/dashboard/package.json` - Frontend dependencies
- ⚠️ `server/config/**/*` - Application configuration
- ⚠️ `.testmesh/**/*` - TestMesh configuration files

**API Changes**:
- ⚠️ Public API endpoints (breaking changes)
- ⚠️ Database schema changes
- ⚠️ Plugin interfaces

---

## Git Workflow

### Branch Strategy

```
main (protected)
  ↓
develop (integration branch)
  ↓
feature/phase-{N}-{task-name}
```

#### Branch Naming

**Format**: `{type}/{phase}-{task-name}`

**Types**:
- `feature/` - New features (most common)
- `fix/` - Bug fixes
- `refactor/` - Code refactoring
- `docs/` - Documentation only
- `test/` - Test additions/fixes

**Examples**:
```
feature/phase1-database-setup
feature/phase2-http-action-handler
fix/phase3-logging-bug
refactor/phase2-assertion-engine
docs/api-specification
test/phase1-auth-tests
```

#### Branch Lifecycle

1. **Create from develop**:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/phase1-database-setup
   ```

2. **Work on branch**:
   - Make small, atomic commits
   - Push regularly

3. **Keep up to date**:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout feature/phase1-database-setup
   git rebase develop
   ```

4. **Open PR when ready**:
   - Create pull request to `develop`
   - Request review
   - Address feedback

5. **Merge after approval**:
   - Squash merge (keeps history clean)
   - Delete branch after merge

### Commit Guidelines

#### Commit Message Format

```
<type>(<scope>): <short description>

<detailed description>

<footer>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `test`: Adding/updating tests
- `docs`: Documentation changes
- `chore`: Build/tooling changes
- `perf`: Performance improvements

**Examples**:

```
feat(runner): add HTTP action handler

Implement HTTP action handler with support for all methods,
authentication, and response parsing.

- Support GET, POST, PUT, PATCH, DELETE
- Add Bearer token and API key auth
- Parse JSON and form-data responses
- Add comprehensive tests

Closes #123
```

```
fix(api): correct validation error handling

Fix issue where validation errors weren't properly returned
to client, causing generic 500 errors instead of 400.

Fixes #456
```

```
test(assertions): add JSONPath assertion tests

Add comprehensive tests for JSONPath assertions covering
nested objects, arrays, and edge cases.
```

#### Commit Best Practices

**DO**:
- ✅ Make small, atomic commits (1 logical change per commit)
- ✅ Write clear, descriptive messages
- ✅ Reference issue numbers
- ✅ Commit working code (tests pass)
- ✅ Commit frequently

**DON'T**:
- ❌ Commit broken code
- ❌ Mix unrelated changes
- ❌ Write vague messages ("fix stuff", "updates")
- ❌ Commit secrets or credentials
- ❌ Commit large binary files (unless necessary)

### Pull Request Guidelines

#### PR Title Format

```
[Phase N] <Type>: <Short description>
```

**Examples**:
```
[Phase 1] feat: Database schema and migrations
[Phase 2] feat: HTTP action handler implementation
[Phase 3] fix: Logging format inconsistency
```

#### PR Description Template

```markdown
## Summary
Brief description of changes

## Changes
- Bullet list of specific changes
- What was added/modified/removed

## Testing
How were these changes tested?
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed

## Screenshots (if applicable)
Add screenshots for UI changes

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Tests written and passing
- [ ] Documentation updated
- [ ] No breaking changes (or documented if unavoidable)
- [ ] Security review completed (for sensitive code)

## Related Issues
Closes #123
Related to #456
```

#### PR Size Guidelines

**Small PR** (Preferred):
- < 200 lines changed
- 1-5 files modified
- Single logical change
- Fast to review (< 30 minutes)

**Medium PR** (Acceptable):
- 200-500 lines changed
- 5-15 files modified
- Related changes grouped
- Review time: 30-60 minutes

**Large PR** (Avoid):
- \> 500 lines changed
- \> 15 files modified
- Should be split into smaller PRs
- Hard to review effectively

**Rule**: If PR is large, break it into multiple smaller PRs.

---

## Development Cycle

### Typical Development Flow

```
1. Plan (Read specifications)
   ↓
2. Design (Architecture/approach)
   ↓
3. Present for approval
   ↓
4. Implement (TDD: Test → Code → Refactor)
   ↓
5. Test (Unit + Integration)
   ↓
6. Document (Code comments + docs)
   ↓
7. Self-review
   ↓
8. Create PR
   ↓
9. Address review feedback
   ↓
10. Merge
```

### TDD Workflow (Required)

**Red → Green → Refactor**

```
1. RED: Write failing test
   ↓
2. GREEN: Write minimal code to pass
   ↓
3. REFACTOR: Clean up code
   ↓
4. Repeat
```

**Example**:

```go
// 1. RED - Write test first (fails)
func TestHTTPActionHandler_Execute(t *testing.T) {
    handler := NewHTTPActionHandler()
    config := map[string]interface{}{
        "method": "GET",
        "url": "https://api.example.com/users",
    }

    result, err := handler.Execute(config, context)

    assert.NoError(t, err)
    assert.True(t, result.Success)
}

// 2. GREEN - Implement to pass test
func (h *HTTPActionHandler) Execute(config map[string]interface{}, ctx *Context) (*Result, error) {
    // Minimal implementation
    return &Result{Success: true}, nil
}

// 3. REFACTOR - Add proper implementation
func (h *HTTPActionHandler) Execute(config map[string]interface{}, ctx *Context) (*Result, error) {
    method := config["method"].(string)
    url := config["url"].(string)

    resp, err := http.Get(url)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    return &Result{
        Success: resp.StatusCode < 400,
        Output: parseResponse(resp),
    }, nil
}
```

### Iteration Cycle

**Maximum Scope per Iteration**:
- 3-5 files modified
- 1-2 hours of work
- Single logical feature/fix

**Process**:
1. Complete small unit of work
2. Commit
3. Push
4. Continue or present for review

**Review Triggers**:
- Completed logical unit (feature/fix)
- About to change architecture
- Uncertain about approach
- Completed phase milestone

---

## Review Process

### When to Request Review

**Always request review after**:
- ✅ Completing a phase task
- ✅ Implementing a major feature
- ✅ Making architectural changes
- ✅ Adding/modifying database migrations
- ✅ Changing public APIs
- ✅ Security-related code

**Before making changes to**:
- ⚠️ Critical files (see approval list)
- ⚠️ Infrastructure configuration
- ⚠️ Dependencies

### Review Checklist

Reviewer must verify:

**Functional Correctness**:
- [ ] Code does what it's supposed to do
- [ ] Edge cases handled
- [ ] Error conditions handled
- [ ] No obvious bugs

**Tests**:
- [ ] Tests written and passing
- [ ] Test coverage > 80%
- [ ] Tests cover happy path and edge cases
- [ ] Integration tests for critical paths

**Security**:
- [ ] No hardcoded secrets
- [ ] Input validation present
- [ ] SQL injection prevented (parameterized queries)
- [ ] XSS prevented (sanitized output)
- [ ] Authentication/authorization checked

**Code Quality**:
- [ ] Follows coding standards
- [ ] No unused dependencies
- [ ] No debug code (console.log, print statements)
- [ ] Error handling present
- [ ] Logging appropriate

**Documentation**:
- [ ] Public APIs documented
- [ ] Complex logic commented
- [ ] README updated (if needed)
- [ ] Migration guide (if breaking change)

**Performance**:
- [ ] No obvious performance issues
- [ ] Database queries optimized
- [ ] No N+1 queries
- [ ] Appropriate indexes added

### Review Response Times

**Target SLAs**:
- Small PR (< 200 lines): 4 hours
- Medium PR (200-500 lines): 1 day
- Large PR (> 500 lines): 2 days (or split into smaller PRs)

**If PR blocked**:
- Notify immediately
- Provide clear feedback
- Suggest alternative approach if needed

---

## File Change Approval

### Approval Process for Critical Files

**Process**:
1. **Propose change** with justification
2. **Wait for approval** (don't proceed)
3. **Make change** after approval
4. **Request review** of the change

### Dependency Changes

**Adding New Dependency**:

```markdown
## Dependency Request

**Package**: `express-rate-limit`
**Version**: `^6.0.0`
**Purpose**: Rate limiting for API endpoints
**Alternatives Considered**:
- redis-rate-limiter (too complex)
- Custom implementation (reinventing wheel)

**License**: MIT ✅
**Bundle Size Impact**: +15KB
**Maintenance**: Active (updated 2 weeks ago)
**Security**: No known vulnerabilities

**Justification**:
Need rate limiting to prevent abuse. express-rate-limit is
battle-tested, well-maintained, and has minimal footprint.

**Approval Required**: Yes
```

**Questions to Answer**:
- Why is this dependency needed?
- What alternatives were considered?
- What is the license? (Must be compatible)
- What is the bundle size impact? (Frontend)
- Is it actively maintained?
- Are there security vulnerabilities?
- Can we implement it ourselves easily?

### Database Migration Approval

**Migration Request Template**:

```markdown
## Migration Request

**Phase**: Phase 1 - Foundation
**Description**: Create users table with authentication fields

**Up Migration**:
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
```

**Down Migration**:
```sql
DROP TABLE IF EXISTS users;
```

**Impact**:
- Creates new table (no existing data affected)
- Adds index for email lookups

**Rollback Plan**:
- Down migration drops table
- No data loss risk (new table)

**Approval Required**: Yes
```

---

## When to Stop and Ask

### Always Stop and Ask When:

**Unclear Requirements**:
- ❓ Feature specification is ambiguous
- ❓ Multiple valid interpretations exist
- ❓ Edge case behavior not specified

**Architectural Uncertainty**:
- ❓ Approach could affect other components
- ❓ Performance implications unclear
- ❓ Security considerations present

**Technical Blockers**:
- ❓ Required API not yet implemented
- ❓ Dependency missing or incompatible
- ❓ Test environment issues

**Scope Questions**:
- ❓ Is this feature in scope?
- ❓ Should this be configurable or hardcoded?
- ❓ What priority is this feature?

**Error Handling**:
- ❓ What should happen if X fails?
- ❓ Should this error be retried?
- ❓ How should error be logged?

### Example Questions

**Good Questions** (Stop and ask):
```
"The spec says 'notify user on failure'. Should this be:
a) Email notification
b) In-app notification
c) Both
d) Configurable

I need clarification before implementing."
```

```
"The database query could be slow with large datasets.
Should I:
a) Add pagination (breaking change)
b) Add index (simple, non-breaking)
c) Add caching (more complex)

What's the preferred approach?"
```

**Bad** (Guessing instead of asking):
```
"The spec doesn't say, so I'll just implement email notifications."
→ Wrong! Ask first.
```

### Response to Questions

**Format for asking**:
```markdown
## Question

**Context**: [Describe what you're working on]
**Issue**: [What's unclear]
**Options**: [List possible approaches]
**Recommendation**: [Your suggested approach]
**Impact**: [Implications of each option]

**Waiting for clarification before proceeding.**
```

---

## Phase Completion Criteria

### Phase Deliverables Checklist

Before marking phase as complete:

**Code**:
- [ ] All planned features implemented
- [ ] All tests passing (unit + integration)
- [ ] Code coverage > 80%
- [ ] No debug code or TODOs left
- [ ] Code reviewed and approved

**Tests**:
- [ ] Unit tests for all business logic
- [ ] Integration tests for API endpoints
- [ ] E2E tests for critical paths
- [ ] Load tests (if applicable)
- [ ] Security tests (if applicable)

**Documentation**:
- [ ] Public APIs documented
- [ ] README updated
- [ ] Architecture docs updated
- [ ] Examples added
- [ ] CHANGELOG updated

**Quality**:
- [ ] Linting passes
- [ ] No compiler warnings
- [ ] No console errors
- [ ] Security scan passes
- [ ] Performance benchmarks met

**Deployment**:
- [ ] Database migrations tested
- [ ] Environment variables documented
- [ ] Deployment tested in staging
- [ ] Rollback plan documented

### Phase Handoff

**Before starting next phase**:
1. Complete all phase tasks
2. Pass all quality gates
3. Get phase approval
4. Document lessons learned
5. Update project board

**Phase Approval Template**:
```markdown
## Phase {N} Completion

**Phase**: {Phase Name}
**Duration**: {Actual vs Planned}
**Completed**: YYYY-MM-DD

**Deliverables**:
- [x] Task 1
- [x] Task 2
- [x] Task 3

**Metrics**:
- Code Coverage: 85%
- Tests Passing: 120/120
- Performance: < 100ms overhead ✅

**Known Issues**:
- None

**Technical Debt**:
- None

**Lessons Learned**:
- What went well
- What could be improved

**Ready for Phase {N+1}**: ✅ Yes
```

---

## Emergency Procedures

### Critical Bug in Production

**Process**:
1. **Create hotfix branch** from `main`:
   ```bash
   git checkout main
   git checkout -b hotfix/critical-bug-description
   ```

2. **Fix the bug** (minimal change)

3. **Test thoroughly**

4. **Create PR to `main`** (not develop)

5. **Fast-track review** (priority)

6. **Merge to `main`** and `develop`

7. **Deploy immediately**

8. **Post-mortem** (document what happened)

### Rollback Procedure

If deployment causes issues:

1. **Identify issue**
2. **Decide**: Fix forward or rollback?
3. **If rollback**:
   ```bash
   git revert <commit-hash>
   # Or
   kubectl rollout undo deployment/testmesh-server
   ```
4. **Document incident**
5. **Fix root cause**
6. **Deploy fix**

---

## Summary

### Quick Reference

**Agent Can Modify**:
- ✅ Source code: `server/internal`, `web/dashboard/src`, `cli`
- ✅ Tests: `tests/`, `*_test.go`, `*.test.ts`
- ✅ Docs: `docs/`, `examples/`

**Agent Cannot Modify**:
- ❌ Infrastructure: `.github`, `infrastructure/`, `Dockerfile`
- ❌ Config: `go.mod`, `package.json`, `.env`
- ❌ Root files: `README.md`, `LICENSE`, `.gitignore`

**Requires Approval**:
- ⚠️ Database migrations
- ⚠️ New dependencies
- ⚠️ Breaking API changes

**Git Workflow**:
- Branch: `feature/phase-N-task-name`
- Commit: Small, atomic, descriptive
- PR: < 200 lines preferred
- Review: Required before merge

**When to Stop and Ask**:
- ❓ Requirements unclear
- ❓ Architecture uncertain
- ❓ Error handling unclear
- ❓ Scope question

**Remember**: Ask instead of guessing. Small PRs. TDD always. Security first.

---

**Version**: 1.0
**Last Updated**: 2026-02-11
**Status**: Active ✅
