# TestMesh v1.0 - Recommended Skills, Plugins & MCPs

> **Enhanced development capabilities for TestMesh implementation**

**Date**: 2026-02-11
**Status**: Recommendations for Review

---

## Overview

This document recommends additional tooling, skills, plugins, and MCP servers that could accelerate TestMesh v1.0 development and improve developer experience.

---

## 1. Model Context Protocol (MCP) Servers

### 🔥 Highly Recommended

#### 1.1 **Database MCP (PostgreSQL)**
**MCP**: `@modelcontextprotocol/server-postgres`

**Capabilities**:
- Execute SQL queries directly
- Inspect database schema
- Run migrations
- Query table structures
- Test database operations

**Use Cases**:
- Creating database schemas
- Testing queries before writing Go code
- Debugging database issues
- Inspecting execution results

**Configuration**:
```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/testmesh"]
    }
  }
}
```

**Value**: ⭐⭐⭐⭐⭐ **CRITICAL** - Direct database access during development

---

#### 1.2 **GitHub MCP**
**MCP**: `@modelcontextprotocol/server-github`

**Capabilities**:
- Create/manage issues
- Create/merge PRs
- Manage branches
- Read/write files in repository
- Search code
- Manage labels/milestones

**Use Cases**:
- Creating PRs automatically
- Managing issues for phase tasks
- Branch management
- Code search across repository

**Configuration**:
```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

**Value**: ⭐⭐⭐⭐⭐ **CRITICAL** - Workflow automation

---

#### 1.3 **Filesystem MCP (Enhanced)**
**MCP**: `@modelcontextprotocol/server-filesystem`

**Capabilities**:
- Advanced file operations
- Directory watching
- File search
- Batch operations

**Use Cases**:
- Project scaffolding
- Code generation
- Template management

**Configuration**:
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/ggeorgiev/Dev/testmesh"]
    }
  }
}
```

**Value**: ⭐⭐⭐⭐ **HIGH** - Enhanced file operations

---

### 💡 Recommended

#### 1.4 **Docker MCP**
**MCP**: Custom or community Docker MCP

**Capabilities**:
- Start/stop containers
- View logs
- Inspect containers
- Manage images
- Docker Compose operations

**Use Cases**:
- Local development environment
- Testing database migrations
- Starting services for integration tests

**Value**: ⭐⭐⭐⭐ **HIGH** - Local development

---

#### 1.5 **Kubernetes MCP**
**MCP**: `@kubernetes/mcp-server` (if exists) or kubectl wrapper

**Capabilities**:
- Deploy applications
- View pod status
- Read logs
- Manage resources
- Apply manifests

**Use Cases**:
- Production deployments
- Debugging production issues
- Managing Helm releases

**Value**: ⭐⭐⭐ **MEDIUM** - Production operations (Phase 6+)

---

#### 1.6 **Redis MCP**
**MCP**: Custom Redis MCP

**Capabilities**:
- Execute Redis commands
- Inspect keys
- Monitor Redis Streams
- Debug caching issues

**Use Cases**:
- Testing cache operations
- Debugging queue issues
- Inspecting session data

**Value**: ⭐⭐⭐ **MEDIUM** - Debugging caching/queue

---

#### 1.7 **Prometheus/Grafana MCP**
**MCP**: Custom metrics MCP

**Capabilities**:
- Query Prometheus metrics
- View dashboards
- Inspect alerts
- Analyze performance

**Use Cases**:
- Performance debugging
- Metrics analysis
- Dashboard creation

**Value**: ⭐⭐⭐ **MEDIUM** - Observability (Phase 3+)

---

### 🤔 Optional (Nice to Have)

#### 1.8 **OpenAPI/Swagger MCP**
**MCP**: Custom OpenAPI MCP

**Capabilities**:
- Generate OpenAPI specs from code
- Validate API responses
- Generate API client code
- API documentation

**Use Cases**:
- API documentation
- Client SDK generation
- API testing

**Value**: ⭐⭐ **LOW** - Can be manual

---

#### 1.9 **AWS MCP**
**MCP**: `@modelcontextprotocol/server-aws` (if exists)

**Capabilities**:
- Manage AWS resources
- S3 operations
- RDS management
- CloudWatch logs

**Use Cases**:
- Production infrastructure
- Artifact storage (S3)
- Deployment automation

**Value**: ⭐⭐ **LOW** - Only if using AWS (Terraform preferred)

---

## 2. Claude Code Skills

### 🔥 Highly Recommended

#### 2.1 **Database Migration Skill**
**Purpose**: Automate database schema changes

**Capabilities**:
- Generate migration files
- Run migrations
- Rollback migrations
- Validate schemas

**Example**:
```
/migrate create add_agents_table
/migrate up
/migrate status
```

**Value**: ⭐⭐⭐⭐⭐ **CRITICAL** - Frequent use

---

#### 2.2 **Code Scaffolding Skill**
**Purpose**: Generate boilerplate code

**Capabilities**:
- Generate CRUD endpoints
- Generate domain models
- Generate test files
- Generate React components

**Example**:
```
/scaffold api flows
  -> Creates handlers/flows.go, models/flow.go, flows_test.go

/scaffold component FlowEditor
  -> Creates FlowEditor.tsx, FlowEditor.test.tsx, FlowEditor.stories.tsx
```

**Value**: ⭐⭐⭐⭐⭐ **CRITICAL** - Saves massive time

---

#### 2.3 **Test Generator Skill**
**Purpose**: Auto-generate test skeletons

**Capabilities**:
- Generate unit tests from functions
- Generate integration tests from APIs
- Generate test fixtures
- Generate mocks

**Example**:
```
/test-gen executor.go
  -> Generates executor_test.go with test cases for all functions
```

**Value**: ⭐⭐⭐⭐⭐ **CRITICAL** - TDD requirement

---

### 💡 Recommended

#### 2.4 **API Documentation Skill**
**Purpose**: Generate API documentation

**Capabilities**:
- Generate OpenAPI/Swagger specs
- Generate Postman collections
- Generate API reference docs
- Validate API contracts

**Example**:
```
/api-docs generate
  -> Creates openapi.yaml from Go handlers
```

**Value**: ⭐⭐⭐⭐ **HIGH** - Documentation requirement

---

#### 2.5 **Dependency Management Skill**
**Purpose**: Manage project dependencies

**Capabilities**:
- Add/remove Go modules
- Add/remove NPM packages
- Check for updates
- Security audit

**Example**:
```
/deps add github.com/gin-gonic/gin
/deps audit
/deps update
```

**Value**: ⭐⭐⭐⭐ **HIGH** - Frequent use

---

#### 2.6 **Docker Compose Skill**
**Purpose**: Manage local development environment

**Capabilities**:
- Start/stop services
- View logs
- Reset databases
- Run commands in containers

**Example**:
```
/docker up
/docker logs postgres
/docker exec postgres psql
/docker reset
```

**Value**: ⭐⭐⭐⭐ **HIGH** - Daily use

---

#### 2.7 **Git Workflow Skill**
**Purpose**: Automate git operations

**Capabilities**:
- Create feature branches
- Create commits (conventional format)
- Create PRs
- Rebase/squash

**Example**:
```
/git feature add-kafka-handler
/git commit "feat(runner): add Kafka action handler"
/git pr "Add Kafka action handler"
```

**Value**: ⭐⭐⭐⭐ **HIGH** - Workflow automation

---

### 🤔 Optional (Nice to Have)

#### 2.8 **Code Review Skill**
**Purpose**: Automated code review

**Capabilities**:
- Run linters
- Check test coverage
- Security scan
- Generate review checklist

**Example**:
```
/review
  -> Runs golangci-lint, tests, security scan
  -> Generates review checklist
```

**Value**: ⭐⭐⭐ **MEDIUM** - Can be manual

---

#### 2.9 **Performance Profiling Skill**
**Purpose**: Profile and optimize code

**Capabilities**:
- Run Go pprof
- Analyze memory usage
- Identify bottlenecks
- Generate flame graphs

**Example**:
```
/profile executor.Execute
  -> Runs profiler, generates report
```

**Value**: ⭐⭐ **LOW** - Phase 6 only

---

#### 2.10 **Release Management Skill**
**Purpose**: Manage releases and versioning

**Capabilities**:
- Bump version numbers
- Generate changelogs
- Create release tags
- Build release artifacts

**Example**:
```
/release v1.0.0
  -> Updates versions, creates tag, generates changelog
```

**Value**: ⭐⭐ **LOW** - Phase 7 only

---

## 3. IDE/Editor Plugins

### 🔥 Highly Recommended

#### 3.1 **Go Plugins**
- **gopls** (Go Language Server) - ✅ Essential
- **golangci-lint** - ✅ Essential (linting)
- **Go Test Explorer** - ✅ Essential (run tests)
- **Go Coverage** - ✅ Essential (coverage visualization)

#### 3.2 **TypeScript/React Plugins**
- **ESLint** - ✅ Essential
- **Prettier** - ✅ Essential
- **Tailwind CSS IntelliSense** - ✅ Essential
- **Vite** - ✅ Essential (for Next.js dev)

#### 3.3 **Database Plugins**
- **PostgreSQL Client** - ✅ Essential (query databases)
- **Redis Client** - Recommended (debug cache)

#### 3.4 **Docker/Kubernetes Plugins**
- **Docker** - ✅ Essential
- **Kubernetes** - Recommended (Phase 6+)

#### 3.5 **Git Plugins**
- **GitLens** - Recommended (blame, history)
- **Git Graph** - Recommended (visualize branches)

---

## 4. CLI Tools (System-wide)

### 🔥 Essential

```bash
# Go development
go 1.21+                    # Go compiler
golangci-lint              # Linting
gopls                      # Language server
air                        # Hot reload (go run on steroids)

# Frontend development
node 18+                   # Node.js
npm/yarn/pnpm              # Package manager
turbo                      # Monorepo build system (optional)

# Database
postgresql-client          # psql CLI
pgcli                      # Better PostgreSQL CLI
redis-cli                  # Redis CLI

# Docker/Kubernetes
docker                     # Container runtime
docker-compose             # Multi-container apps
kubectl                    # Kubernetes CLI
helm                       # Kubernetes package manager

# Observability
prometheus                 # Metrics (local testing)
grafana                    # Dashboards (local testing)

# Testing
k6                         # Load testing (optional)
postman/insomnia           # API testing (optional)

# Utilities
jq                         # JSON processing
yq                         # YAML processing
httpie                     # Better curl
watch                      # Watch command output
```

---

## 5. Recommended MCP Priority

### Phase 1-2 (Foundation & Core Engine)
**Install Now**:
1. ✅ **PostgreSQL MCP** (database schema, queries)
2. ✅ **GitHub MCP** (PR workflow, issues)
3. ✅ **Filesystem MCP** (enhanced file ops)
4. ✅ **Docker MCP** (local environment)

### Phase 3-4 (Observability & Features)
**Add Later**:
5. Redis MCP (debugging cache/queue)
6. Prometheus MCP (metrics analysis)

### Phase 5-7 (AI, Production, Launch)
**Add Later**:
7. Kubernetes MCP (deployments)
8. AWS MCP (if using AWS)

---

## 6. Recommended Skills Priority

### Phase 1-2 (Foundation & Core Engine)
**Create Now**:
1. ✅ **Code Scaffolding Skill** (generate boilerplate)
2. ✅ **Database Migration Skill** (schema management)
3. ✅ **Test Generator Skill** (TDD requirement)
4. ✅ **Git Workflow Skill** (PR automation)

### Phase 3-4 (Observability & Features)
**Add Later**:
5. API Documentation Skill (OpenAPI generation)
6. Docker Compose Skill (environment management)

### Phase 5-7 (AI, Production, Launch)
**Add Later**:
7. Dependency Management Skill (updates, audits)
8. Release Management Skill (versioning)

---

## 7. Custom Skills to Build

### 7.1 **TestMesh Flow Generator**
**Purpose**: Generate test flow YAML from natural language

**Example**:
```
/flow-gen "Test user registration: POST /users, assert 201, save user ID, GET /users/:id, assert 200"

-> Generates:
name: user_registration_test
steps:
  - name: Create user
    action: http_request
    config:
      method: POST
      url: /users
    assertions:
      - type: status_code
        expected: 201
    save:
      user_id: $.id
  - name: Get user
    action: http_request
    config:
      method: GET
      url: /users/{{user_id}}
    assertions:
      - type: status_code
        expected: 200
```

**Value**: ⭐⭐⭐⭐⭐ **CRITICAL** - Core product feature

---

### 7.2 **TestMesh Import Skill**
**Purpose**: Import tests from Postman/Insomnia

**Example**:
```
/import postman collection.json
  -> Converts Postman collection to TestMesh flows
```

**Value**: ⭐⭐⭐⭐⭐ **CRITICAL** - Migration path for users

---

### 7.3 **TestMesh Deploy Skill**
**Purpose**: Deploy TestMesh to various environments

**Example**:
```
/deploy staging
  -> Builds Docker image
  -> Pushes to registry
  -> Updates Kubernetes deployment
  -> Runs smoke tests
```

**Value**: ⭐⭐⭐⭐ **HIGH** - Phase 6+

---

## 8. Implementation Recommendations

### Immediate (Phase 1-2)

**MCPs to Install**:
```bash
# Add to ~/.claude/config.json or project .claude/mcp.json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/testmesh"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/ggeorgiev/Dev/testmesh"]
    }
  }
}
```

**Skills to Create**:
1. Code Scaffolding (`/scaffold`)
2. Database Migration (`/migrate`)
3. Test Generator (`/test-gen`)
4. Git Workflow (`/git`)

---

### Later Phases (Phase 3-7)

**Additional MCPs**:
- Docker MCP (Phase 3)
- Redis MCP (Phase 3)
- Kubernetes MCP (Phase 6)
- Prometheus MCP (Phase 3)

**Additional Skills**:
- API Documentation (`/api-docs`) - Phase 3
- Docker Compose (`/docker`) - Phase 2
- TestMesh Flow Generator (`/flow-gen`) - Phase 4
- TestMesh Import (`/import`) - Phase 4
- TestMesh Deploy (`/deploy`) - Phase 6

---

## 9. Cost/Benefit Analysis

### High Value, Low Effort (Do First)
- ✅ PostgreSQL MCP
- ✅ GitHub MCP
- ✅ Code Scaffolding Skill
- ✅ Test Generator Skill

### High Value, Medium Effort (Do Soon)
- Database Migration Skill
- Git Workflow Skill
- Docker MCP
- API Documentation Skill

### Medium Value, Low Effort (Nice to Have)
- Filesystem MCP
- Redis MCP
- Docker Compose Skill

### Low Value or High Effort (Skip/Defer)
- AWS MCP (use Terraform instead)
- Performance Profiling Skill (manual is fine)
- Release Management Skill (Phase 7 only)

---

## 10. Recommended Action Plan

### Week 1 (Before Phase 1 starts)
1. ✅ Install PostgreSQL MCP
2. ✅ Install GitHub MCP
3. ✅ Create Code Scaffolding Skill
4. ✅ Create Test Generator Skill

### Week 2-4 (During Phase 1)
5. Create Database Migration Skill
6. Create Git Workflow Skill
7. Install Docker MCP
8. Test all tooling

### Phase 2+
9. Add skills/MCPs as needed per phase
10. Iterate based on actual usage

---

## Summary

### Critical (Install Now)
- ✅ **PostgreSQL MCP** - Direct database access
- ✅ **GitHub MCP** - Workflow automation
- ✅ **Code Scaffolding Skill** - Generate boilerplate
- ✅ **Test Generator Skill** - TDD support

### High Priority (Phase 1-2)
- Database Migration Skill
- Git Workflow Skill
- Docker MCP
- Filesystem MCP

### Medium Priority (Phase 3+)
- Redis MCP
- API Documentation Skill
- Docker Compose Skill
- Prometheus MCP

### Low Priority (Phase 6+)
- Kubernetes MCP
- TestMesh Deploy Skill
- Release Management Skill

---

**Total Recommended**:
- **4 MCPs** (immediate)
- **4 Skills** (immediate)
- **6 additional tools** (later phases)

**Estimated Setup Time**: 2-4 hours
**Estimated Time Savings**: 20-30% faster development

---

**Next Step**: Install critical MCPs and create scaffolding skills before Phase 1 begins.
