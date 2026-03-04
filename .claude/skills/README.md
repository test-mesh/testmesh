# TestMesh Claude Code Skills

**Purpose**: Custom skills for accelerated TestMesh development
**Version**: 1.0.0
**Created**: 2026-02-11

---

## Available Skills

### 1. 🏗️ Code Scaffolding (`/scaffold`)

Generate boilerplate code for TestMesh components.

**Usage**:
```
/scaffold api flows
/scaffold domain execution
/scaffold component FlowEditor
/scaffold page flows/[id]
/scaffold handler kafka
```

**Generates**:
- API handlers (Go)
- Domain models & repositories (Go)
- React components (TypeScript)
- Next.js pages (TypeScript)
- Action handlers (Go)
- Corresponding test files

**Documentation**: [scaffold.md](./scaffold.md)

---

### 2. 🧪 Test Generator (`/test-gen`)

Automatically generate test files and test cases.

**Usage**:
```
/test-gen server/internal/runner/executor.go
/test-gen web/dashboard/src/components/FlowEditor.tsx
/test-gen server/internal/api/handlers/flows.go --integration
```

**Generates**:
- Unit tests (Go & TypeScript)
- Integration tests
- Mock files
- Test helpers

**Coverage**: Targets >80% coverage automatically

**Documentation**: [test-gen.md](./test-gen.md)

---

### 3. 🗄️ Database Migrations (`/migrate`)

Manage database schema migrations.

**Usage**:
```
/migrate create add_agents_table
/migrate up
/migrate down
/migrate status
```

**Features**:
- Generate migration files
- Apply migrations
- Rollback migrations
- Check migration status

**Documentation**: [migrate.md](./migrate.md)

---

### 4. 🔀 Git Workflow (`/git`)

Automate git operations following TestMesh conventions.

**Usage**:
```
/git feature add-kafka-handler
/git commit "add Kafka action handler"
/git pr
/git sync
```

**Features**:
- Create feature branches
- Conventional commits
- Generate PR descriptions
- Sync with main branch

**Documentation**: [git.md](./git.md)

---

## Quick Start

### 1. Verify Skills are Loaded

Skills should be automatically discovered from this directory. To verify:

```
# In Claude Code, list available skills
/help skills
```

You should see:
- `/scaffold`
- `/test-gen`
- `/migrate`
- `/git`

### 2. Use a Skill

Simply invoke the skill with `/` prefix:

```
/scaffold api flows
```

Claude Code will:
1. Read the skill definition
2. Execute the instructions
3. Generate code following templates
4. Report results

---

## Skill Development

### Adding New Skills

1. Create a new `.md` file in this directory
2. Follow the format of existing skills
3. Include:
   - Skill name and purpose
   - Usage examples
   - Instructions for AI agent
   - Templates (if applicable)
   - Safety checks

### Skill Format

```markdown
# Skill Name

**Skill Name**: `skill-name`
**Purpose**: Brief description
**Version**: 1.0.0

## Usage

## Examples

## Instructions for AI Agent

## Templates

## Important Notes
```

---

## Integration with MCPs

These skills work best with MCPs enabled:

### PostgreSQL MCP
Used by `/migrate` for:
- Executing migrations
- Checking migration status
- Testing schema changes

### GitHub MCP
Used by `/git` for:
- Creating pull requests
- Managing issues
- Branch operations

### Filesystem MCP
Used by all skills for:
- Reading/writing files
- Directory operations
- File templates

---

## Skill Workflow Example

**Complete feature development workflow**:

```bash
# 1. Create feature branch
/git feature add-kafka-handler

# 2. Scaffold the handler
/scaffold handler kafka

# 3. Generate tests
/test-gen server/internal/runner/actions/kafka.go

# 4. Create database migration (if needed)
/migrate create add_kafka_config

# 5. Implement logic (manual)
# ... write actual Kafka code ...

# 6. Commit changes
/git commit "add Kafka action handler"

# 7. Create pull request
/git pr
```

**Time saved**: 30-40% on boilerplate and workflow automation

---

## Best Practices

### Using `/scaffold`
- ✅ Use for new components (avoid manual boilerplate)
- ✅ Review generated code before committing
- ✅ Customize TODO sections
- ✅ Follow existing patterns in codebase

### Using `/test-gen`
- ✅ Generate tests immediately after implementation
- ✅ Add edge cases beyond generated tests
- ✅ Achieve >80% coverage
- ✅ Review test quality

### Using `/migrate`
- ✅ Create migrations for all schema changes
- ✅ Test migrations locally first
- ✅ Write reversible migrations (down.sql)
- ✅ One logical change per migration

### Using `/git`
- ✅ Use conventional commit format
- ✅ Keep commits focused
- ✅ Create small PRs (3-5 files)
- ✅ Sync with main regularly

---

## Troubleshooting

### Skill Not Found

**Problem**: `/scaffold` shows "skill not found"

**Solutions**:
1. Verify file exists: `ls -la .claude/skills/`
2. Check file has `.md` extension
3. Reload Claude Code
4. Check skill name matches filename

### Skill Execution Error

**Problem**: Skill executes but generates incorrect code

**Solutions**:
1. Read skill documentation (e.g., `scaffold.md`)
2. Check your command syntax
3. Verify project structure matches PROJECT_STRUCTURE.md
4. Review CODING_STANDARDS.md

### MCP Integration Issues

**Problem**: Skill needs MCP but MCP not available

**Solutions**:
1. Check `.claude/mcp.json` configuration
2. Verify MCP server is installed
3. Test MCP separately
4. Use fallback manual approach

---

## Skill Maintenance

### Updating Skills

When project structure or standards change:

1. Update skill documentation
2. Update templates
3. Test with real examples
4. Update version number
5. Document changes

### Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-11 | Initial skills: scaffold, test-gen, migrate, git |

---

## Contributing

To improve skills:

1. Identify repetitive manual work
2. Design skill to automate it
3. Create skill definition
4. Test thoroughly
5. Document usage
6. Share with team

---

## Support

**Documentation**:
- Individual skill docs in this directory
- [DEVELOPMENT_WORKFLOW.md](../../DEVELOPMENT_WORKFLOW.md)
- [CODING_STANDARDS.md](../../CODING_STANDARDS.md)

**Questions**:
- Check skill `.md` file for instructions
- Review examples in skill documentation
- Test with simple examples first

---

**Status**: ✅ Ready to Use

**Total Skills**: 4
**Estimated Time Savings**: 30-40% on development tasks
