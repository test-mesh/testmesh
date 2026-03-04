# Git Workflow Skill

**Skill Name**: `git`
**Purpose**: Automate git operations following TestMesh workflow
**Version**: 1.0.0

---

## Usage

```
/git <command> [options]
```

**Commands**:
- `feature <name>` - Create feature branch
- `commit <message>` - Create conventional commit
- `pr [title]` - Create pull request
- `sync` - Sync with main branch
- `status` - Show git status with context

---

## Examples

### 1. Start New Feature

```
/git feature add-kafka-handler
```

**Actions**:
1. Ensures you're on `main` branch
2. Pulls latest changes
3. Creates branch: `feat/add-kafka-handler`
4. Checks out new branch

### 2. Commit Changes

```
/git commit "add Kafka action handler"
```

**Creates commit**:
```
feat(runner): add Kafka action handler

- Implement KafkaActionHandler
- Add producer/consumer support
- Add tests for Kafka handler

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

### 3. Create Pull Request

```
/git pr
```

**Actions**:
1. Pushes current branch
2. Analyzes commits since divergence from main
3. Generates PR title and description
4. Creates PR using GitHub MCP or gh CLI

---

## Instructions for AI Agent

### Command: `feature <name>`

**Steps**:

1. **Check current status**
   ```bash
   git status
   ```
   - Warn if uncommitted changes
   - Suggest stash if needed

2. **Switch to main**
   ```bash
   git checkout main
   ```

3. **Pull latest**
   ```bash
   git pull origin main
   ```

4. **Determine branch prefix**
   Based on feature name, choose:
   - `feat/` - New feature
   - `fix/` - Bug fix
   - `refactor/` - Code refactoring
   - `docs/` - Documentation
   - `test/` - Tests only
   - `chore/` - Maintenance

5. **Create and checkout branch**
   ```bash
   git checkout -b feat/{{name}}
   ```

6. **Report to user**
   ```markdown
   ✅ Created feature branch: feat/{{name}}

   Next steps:
   1. Make your changes
   2. Commit: /git commit "description"
   3. Create PR: /git pr
   ```

---

### Command: `commit <message>`

**Steps**:

1. **Run git status**
   ```bash
   git status --short
   ```

2. **Analyze changes**
   - Identify modified files
   - Determine commit type
   - Extract scope from file paths

3. **Determine commit type**
   Based on files changed:
   - `server/internal/runner/` → `runner` scope
   - `web/dashboard/` → `dashboard` scope
   - `docs/` → `docs` scope
   - `tests/` → `test` or parent scope

   Based on nature of changes:
   - New files → `feat`
   - Test files only → `test`
   - Documentation → `docs`
   - Bug fixes → `fix`

4. **Generate commit message**

   **Format**:
   ```
   <type>(<scope>): <subject>

   <body>

   Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
   ```

   **Type**:
   - `feat` - New feature
   - `fix` - Bug fix
   - `refactor` - Code refactoring
   - `test` - Add/update tests
   - `docs` - Documentation
   - `chore` - Maintenance
   - `perf` - Performance improvement

   **Subject**:
   - Lowercase, no period
   - Imperative mood ("add" not "added")
   - Max 72 characters

   **Body**:
   - List of changes (bullet points)
   - Why the change was made
   - References to issues if applicable

5. **Stage and commit**
   ```bash
   git add <relevant files>
   git commit -m "$(cat <<'EOF'
   {{commit_message}}
   EOF
   )"
   ```

6. **Report to user**
   ```markdown
   ✅ Created commit

   Type: {{type}}
   Scope: {{scope}}
   Message: {{subject}}

   Files committed:
   - {{file1}}
   - {{file2}}

   Next: /git pr
   ```

---

### Command: `pr [title]`

**Steps**:

1. **Check current branch**
   ```bash
   git branch --show-current
   ```
   - Ensure not on `main`

2. **Check if pushed**
   ```bash
   git rev-list --count @{u}..HEAD
   ```
   - Push if needed

3. **Get commits since main**
   ```bash
   git log main..HEAD --oneline
   ```

4. **Analyze commits**
   - Extract commit types
   - Extract scopes
   - Extract messages
   - Determine overall change nature

5. **Generate PR title**
   If not provided:
   - Use first commit message (if single commit)
   - Or: `<type>(<scope>): <summary of changes>`
   - Max 70 characters

6. **Generate PR description**

   **Template**:
   ```markdown
   ## Summary

   {{1-3 bullet points summarizing changes}}

   ## Changes

   {{List of commits with their messages}}

   ## Testing

   - [ ] Unit tests added/updated
   - [ ] Integration tests passing
   - [ ] Manual testing completed

   ## Checklist

   - [ ] Code follows CODING_STANDARDS.md
   - [ ] Security guidelines followed
   - [ ] Tests have >80% coverage
   - [ ] Documentation updated

   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   ```

7. **Create PR**

   **Using GitHub MCP** (preferred):
   ```
   GitHub MCP: create_pull_request
   - title: {{title}}
   - body: {{description}}
   - head: {{current_branch}}
   - base: main
   ```

   **Or using gh CLI**:
   ```bash
   gh pr create \
     --title "{{title}}" \
     --body "$(cat <<'EOF'
   {{description}}
   EOF
   )"
   ```

8. **Report to user**
   ```markdown
   ✅ Created pull request

   Title: {{title}}
   URL: {{pr_url}}

   Next steps:
   1. Review the PR
   2. Wait for CI/CD checks
   3. Request review
   4. Merge when approved
   ```

---

### Command: `sync`

**Steps**:

1. **Fetch latest**
   ```bash
   git fetch origin
   ```

2. **Check for conflicts**
   ```bash
   git diff main...HEAD
   ```

3. **Rebase on main**
   ```bash
   git rebase origin/main
   ```

4. **Handle conflicts** (if any)
   - List conflicted files
   - Guide user through resolution
   - Continue rebase after resolution

5. **Force push** (if needed)
   ```bash
   git push --force-with-lease
   ```

---

### Command: `status`

**Steps**:

1. **Run git status**
   ```bash
   git status
   ```

2. **Get additional context**
   - Current branch
   - Commits ahead/behind main
   - Uncommitted changes
   - Untracked files

3. **Present formatted status**
   ```markdown
   ## Git Status

   **Branch**: feat/add-kafka-handler
   **Ahead of main**: 3 commits
   **Behind main**: 0 commits

   **Staged**:
   - server/internal/runner/actions/kafka.go
   - server/internal/runner/actions/kafka_test.go

   **Modified** (not staged):
   - server/internal/runner/actions/registry.go

   **Untracked**:
   - server/temp.txt

   **Suggested actions**:
   - Review modified files
   - Stage relevant changes: git add <file>
   - Commit: /git commit "description"
   ```

---

## Commit Message Examples

### Feature

```
feat(runner): add Kafka action handler

- Implement KafkaActionHandler with producer/consumer support
- Add configuration validation
- Add integration tests for Kafka operations
- Update action registry to include Kafka handler

Closes #123

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

### Bug Fix

```
fix(api): prevent nil pointer in flow execution

The executor was not checking for nil flow definitions before execution,
causing panics when flows were deleted but executions remained queued.

Added nil check and proper error handling.

Fixes #456

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

### Refactor

```
refactor(storage): extract repository interface

- Create Repository interface for better testability
- Move PostgreSQL implementation to postgres_repository.go
- Add mock repository for testing
- Update tests to use mock

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

### Tests

```
test(runner): add comprehensive executor tests

- Add unit tests for happy path
- Add error case tests
- Add edge case tests (nil input, empty config)
- Achieve 95% coverage

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

---

## Branch Naming Conventions

**Format**: `<type>/<short-description>`

**Types**:
- `feat/` - New features
- `fix/` - Bug fixes
- `refactor/` - Code refactoring
- `docs/` - Documentation updates
- `test/` - Test additions/updates
- `chore/` - Maintenance tasks

**Examples**:
- `feat/add-kafka-handler`
- `fix/nil-pointer-in-executor`
- `refactor/repository-interface`
- `docs/update-api-documentation`
- `test/add-executor-tests`
- `chore/update-dependencies`

---

## PR Title Conventions

**Format**: `<type>(<scope>): <description>`

**Examples**:
- `feat(runner): add Kafka action handler`
- `fix(api): prevent nil pointer in flow execution`
- `refactor(storage): extract repository interface`
- `test(runner): add comprehensive executor tests`

---

## Integration with GitHub MCP

If GitHub MCP is available, use it for:
- Creating pull requests
- Checking PR status
- Requesting reviews
- Merging PRs
- Closing issues

Otherwise, fallback to `gh` CLI.

---

## Safety Rules

**Before committing**:
- ✅ Run tests
- ✅ Run linter
- ✅ Check for secrets (no API keys, passwords)
- ✅ Verify file permissions

**Before creating PR**:
- ✅ Rebase on main
- ✅ Resolve conflicts
- ✅ Run full test suite
- ✅ Update documentation

**Before pushing**:
- ✅ Verify commit message format
- ✅ Check for large files
- ✅ Confirm branch name is correct

---

**Version**: 1.0.0
**Last Updated**: 2026-02-11
