# TestMesh Tagging System

> **Comprehensive tagging and filtering system for flow organization and execution control**

## Overview

Tags enable flexible organization and selective execution of flows. You can:
- Tag flows for categorization (e.g., `smoke`, `regression`, `critical`)
- Run specific subsets of flows based on tags
- Schedule different tag groups on different schedules
- Filter flows in UI/CLI
- Track metrics by tag

---

## Table of Contents

1. [Flow Tags](#flow-tags)
2. [Step Tags](#step-tags)
3. [Tag Syntax](#tag-syntax)
4. [Tag Filtering](#tag-filtering)
5. [Execution by Tags](#execution-by-tags)
6. [Tag Management](#tag-management)
7. [Reserved Tags](#reserved-tags)
8. [Tag Inheritance](#tag-inheritance)
9. [Best Practices](#best-practices)
10. [Examples](#examples)

---

## Flow Tags

### Basic Tagging

```yaml
flow:
  name: "User Registration Flow"

  # Simple tag list
  tags:
    - authentication
    - critical
    - smoke-test
    - user-management

  steps:
    # ... flow steps
```

### Tag Rules

**Naming Convention**:
- Lowercase only: `smoke-test` ✅, `Smoke-Test` ❌
- Hyphens allowed: `smoke-test` ✅
- Underscores allowed: `smoke_test` ✅
- No spaces: `smoke test` ❌
- Alphanumeric: `[a-z0-9-_]+`
- Max length: 50 characters
- Min length: 2 characters

**Valid Examples**:
```yaml
tags:
  - smoke               # ✅ Simple
  - smoke-test          # ✅ Hyphenated
  - api-v2              # ✅ Versioned
  - p0                  # ✅ Priority
  - auth-oauth2         # ✅ Specific
  - regression-suite    # ✅ Categorized
```

**Invalid Examples**:
```yaml
tags:
  - Smoke-Test          # ❌ Uppercase
  - smoke test          # ❌ Space
  - smoke/test          # ❌ Invalid character
  - a                   # ❌ Too short
```

### Multi-Dimensional Tagging

Organize flows across multiple dimensions:

```yaml
flow:
  name: "Payment Processing"

  tags:
    # Test type
    - integration
    - e2e

    # Priority
    - p0              # Critical
    - critical

    # Feature area
    - payment
    - checkout
    - ecommerce

    # Test level
    - smoke
    - regression

    # Environment
    - requires-staging
    - requires-payment-gateway

    # Team ownership
    - team-payments

    # Compliance
    - pci-compliant
    - security-critical

    # Performance
    - slow             # Takes > 1 minute

    # Stability
    - flaky            # Known to be flaky
```

### Tag Categories (Recommended)

#### 1. Test Type
```yaml
tags:
  - unit              # Unit test
  - integration       # Integration test
  - e2e               # End-to-end test
  - smoke             # Smoke test
  - regression        # Regression test
  - performance       # Performance test
  - security          # Security test
  - accessibility     # Accessibility test
```

#### 2. Priority
```yaml
tags:
  - p0                # Critical (must pass)
  - p1                # High priority
  - p2                # Medium priority
  - p3                # Low priority
  - critical          # Business critical
  - blocker           # Blocks release
```

#### 3. Feature Area
```yaml
tags:
  - authentication
  - authorization
  - payment
  - checkout
  - user-management
  - inventory
  - search
  - notifications
```

#### 4. Execution Context
```yaml
tags:
  - fast              # < 30 seconds
  - slow              # > 1 minute
  - very-slow         # > 5 minutes
  - parallel-safe     # Can run in parallel
  - sequential-only   # Must run sequentially
  - requires-cleanup  # Needs cleanup after
```

#### 5. Environment Requirements
```yaml
tags:
  - requires-staging
  - requires-production
  - local-only
  - requires-database
  - requires-kafka
  - requires-redis
  - requires-payment-gateway
```

#### 6. Team Ownership
```yaml
tags:
  - team-backend
  - team-frontend
  - team-mobile
  - team-payments
  - team-growth
```

#### 7. Stability
```yaml
tags:
  - stable
  - flaky
  - experimental
  - deprecated
```

#### 8. Compliance
```yaml
tags:
  - pci-compliant
  - gdpr-required
  - hipaa-compliant
  - sox-compliance
```

---

## Step Tags

You can also tag individual steps within a flow:

```yaml
flow:
  name: "Complex Flow"
  tags:
    - integration

  steps:
    - id: setup_database
      action: database_query
      tags:
        - setup
        - database
      config:
        query: "CREATE TABLE IF NOT EXISTS ..."

    - id: api_call
      action: http_request
      tags:
        - api
        - slow
      config:
        method: GET
        url: "${API_URL}/data"

    - id: cleanup
      action: database_query
      tags:
        - cleanup
        - database
      config:
        query: "DROP TABLE IF EXISTS ..."
```

**Use Cases for Step Tags**:
- Filter steps in execution logs
- Performance profiling by step type
- Metrics aggregation by step tags
- Conditional step execution
- Documentation and organization

---

## Tag Syntax

### Tag Format

```
tag := [a-z0-9][a-z0-9-_]*[a-z0-9]
     | [a-z0-9]
```

**Examples**:
- `smoke` ✅
- `smoke-test` ✅
- `smoke_test` ✅
- `api-v2` ✅
- `p0` ✅
- `smoke-test-api-v2` ✅

### Tag Expression Syntax

Used for filtering and selection:

```yaml
# Single tag
tag: smoke

# Multiple tags (OR)
tags: smoke,regression

# Required tags (AND)
tags: smoke+critical

# Exclude tags (NOT)
tags: !flaky

# Complex expressions
tags: (smoke OR regression) AND critical AND !flaky

# Shorthand
tags: smoke,regression+critical+!flaky
```

---

## Tag Filtering

### CLI Filtering

```bash
# Run flows with specific tag
testmesh run --tag smoke

# Multiple tags (OR - run flows with ANY of these tags)
testmesh run --tag smoke --tag regression
testmesh run --tag smoke,regression

# Required tags (AND - run flows with ALL of these tags)
testmesh run --tag smoke+critical
testmesh run --tag smoke --tag critical --require-all

# Exclude tags (NOT)
testmesh run --tag smoke --exclude flaky
testmesh run --tag smoke+!flaky

# Complex filtering
testmesh run --tag "(smoke OR regression) AND critical AND !flaky"

# Combine with other filters
testmesh run --tag smoke --suite authentication --env staging
```

### API Filtering

```http
GET /api/v1/flows?tags=smoke,regression
GET /api/v1/flows?tags=smoke+critical
GET /api/v1/flows?tags=smoke&exclude=flaky
GET /api/v1/flows?tags=smoke,regression&require_all=true
```

### Dashboard Filtering

**Tag Filter UI**:
```
┌─────────────────────────────────────┐
│ Filter Flows                        │
├─────────────────────────────────────┤
│                                     │
│ Tags (any of):                      │
│ [x] smoke                           │
│ [x] regression                      │
│ [ ] performance                     │
│ [ ] security                        │
│                                     │
│ Must have all:                      │
│ [x] critical                        │
│                                     │
│ Exclude:                            │
│ [x] flaky                           │
│ [x] deprecated                      │
│                                     │
│ ─────────────────────────────────   │
│ Matching flows: 23                  │
│                                     │
│ [Apply Filter] [Clear]              │
└─────────────────────────────────────┘
```

**Quick Filters**:
```
┌─────────────────────────────────────┐
│ Quick Filters:                      │
│ • All flows (234)                   │
│ • Smoke tests (45)                  │
│ • Critical (89)                     │
│ • Flaky (12)                        │
│ • Slow (34)                         │
│ • Recently failed (8)               │
└─────────────────────────────────────┘
```

---

## Execution by Tags

### Run Specific Tags

```bash
# Run all smoke tests
testmesh run --tag smoke

# Run critical smoke tests only
testmesh run --tag smoke+critical

# Run all tests except flaky ones
testmesh run --exclude flaky

# Run payment tests in staging
testmesh run --tag payment --env staging

# Run fast tests in parallel
testmesh run --tag fast+parallel-safe --parallel 10
```

### Scheduled Execution by Tags

```yaml
# .testmesh.yaml or server configuration
schedules:
  - name: "Hourly Smoke Tests"
    cron: "0 * * * *"
    tags:
      - smoke
    environment: production
    notify_on_failure: true

  - name: "Nightly Regression"
    cron: "0 2 * * *"
    tags:
      - regression
    exclude_tags:
      - flaky
      - very-slow
    environment: staging

  - name: "Critical Tests Every 15 Min"
    cron: "*/15 * * * *"
    tags:
      - critical
      - p0
    require_all: true          # Must have BOTH tags
    environment: production

  - name: "Weekend Full Suite"
    cron: "0 0 * * 6"          # Saturdays at midnight
    tags:
      - regression
      - performance
      - security
    environment: staging
    timeout: "6h"              # Long-running suite
```

### CI/CD Integration by Tags

```yaml
# GitHub Actions
name: Run Tests

on: [push, pull_request]

jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Smoke Tests
        run: testmesh run --tag smoke --env staging

  critical:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Critical Tests
        run: testmesh run --tag critical --env staging

  pr-tests:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Fast PR Tests
        run: testmesh run --tag fast+pr-safe --env staging

  nightly:
    if: github.event.schedule
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Full Regression
        run: testmesh run --tag regression --exclude flaky --env staging
```

### API-Triggered Execution

```bash
# Trigger execution via API
curl -X POST https://testmesh.example.com/api/v1/executions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tags": ["smoke", "critical"],
    "require_all": false,
    "exclude_tags": ["flaky"],
    "environment": "staging"
  }'
```

---

## Tag Management

### View All Tags

```bash
# List all tags in use
testmesh tags list

# Output:
# authentication (12 flows)
# critical (45 flows)
# smoke (34 flows)
# regression (89 flows)
# payment (23 flows)
# flaky (8 flows)
# ...

# With details
testmesh tags list --detailed

# Output:
# authentication (12 flows, 145 executions, 95% pass rate)
# critical (45 flows, 890 executions, 98% pass rate)
# ...
```

### Tag Statistics

```bash
# Show tag statistics
testmesh tags stats

# Output:
┌─────────────────┬───────┬────────────┬───────────┐
│ Tag             │ Flows │ Executions │ Pass Rate │
├─────────────────┼───────┼────────────┼───────────┤
│ smoke           │    34 │        890 │     99.2% │
│ critical        │    45 │      1,234 │     98.5% │
│ regression      │    89 │      2,345 │     94.3% │
│ flaky           │     8 │        234 │     67.1% │
└─────────────────┴───────┴────────────┴───────────┘
```

### Find Flows by Tag

```bash
# Find flows with specific tag
testmesh flows list --tag smoke

# Output:
# user-login-flow (smoke, authentication, critical)
# api-health-check (smoke, api)
# database-connection (smoke, database)
# ...

# Find flows with multiple tags
testmesh flows list --tag smoke+critical

# Find untagged flows
testmesh flows list --untagged
```

### Tag Maintenance

```bash
# Add tag to existing flow
testmesh flow tag add user-login-flow regression

# Remove tag from flow
testmesh flow tag remove user-login-flow flaky

# Rename tag globally
testmesh tag rename authentication auth

# Delete tag from all flows
testmesh tag delete deprecated

# Bulk tag operations
testmesh flows list --suite authentication | testmesh flow tag add-batch smoke
```

### Tag Validation

```yaml
# .testmesh.yaml
tag_rules:
  # Require at least one tag from each category
  required_categories:
    - type: [smoke, regression, integration, e2e]
    - priority: [p0, p1, p2, p3]

  # Allowed tags (whitelist)
  allowed_tags:
    - smoke
    - regression
    - critical
    # ... (prevent typos)

  # Deprecated tags (warn but allow)
  deprecated_tags:
    - old-api: "Use 'api-v1' instead"
    - temp: "Remove temporary tags before merging"

  # Auto-tag rules
  auto_tag:
    - if_name_contains: "smoke"
      add_tag: "smoke"

    - if_suite: "authentication"
      add_tag: "auth"

    - if_duration: "> 1m"
      add_tag: "slow"
```

---

## Reserved Tags

### System-Generated Tags

These tags are automatically added by TestMesh:

```yaml
# Automatically added based on flow characteristics
tags:
  - auto:fast              # Duration < 30s
  - auto:slow              # Duration > 1m
  - auto:very-slow         # Duration > 5m
  - auto:flaky             # Pass rate < 80% (last 10 runs)
  - auto:stable            # Pass rate > 95% (last 50 runs)
  - auto:new               # Created in last 7 days
  - auto:failing           # Currently failing
  - auto:deprecated        # Not run in last 30 days
```

**Usage**:
```bash
# Run all fast tests
testmesh run --tag auto:fast

# Exclude flaky tests
testmesh run --exclude auto:flaky

# Run stable tests only
testmesh run --tag auto:stable
```

### Reserved Prefixes

Certain tag prefixes are reserved:

- `auto:*` - Auto-generated tags
- `system:*` - System tags
- `meta:*` - Metadata tags
- `internal:*` - Internal use only

**Don't use these prefixes in your tags!**

---

## Tag Inheritance

### Flow to Step Inheritance

Steps can inherit tags from their parent flow:

```yaml
flow:
  name: "Payment Flow"
  tags:
    - payment
    - critical

  config:
    inherit_tags: true          # Default: true

  steps:
    - id: process_payment
      action: http_request
      # Inherits: payment, critical
      tags:
        - api                   # Additional tag
      # Effective tags: payment, critical, api
```

### Sub-flow Tag Inheritance

```yaml
flow:
  name: "Main Flow"
  tags:
    - integration
    - critical

  steps:
    - id: run_subflow
      action: run_flow
      config:
        flow: "sub-flow"
        inherit_tags: true      # Sub-flow inherits main flow tags
```

### Tag Propagation Configuration

```yaml
# .testmesh.yaml
tag_inheritance:
  # Flow -> Step
  flow_to_step:
    enabled: true
    exclude_tags:              # Don't inherit these
      - experimental
      - deprecated

  # Main Flow -> Sub-flow
  flow_to_subflow:
    enabled: true
    exclude_tags:
      - local-only
```

---

## Best Practices

### 1. Use Consistent Naming

```yaml
# Good - Consistent, clear
tags:
  - smoke-test
  - regression-test
  - integration-test

# Bad - Inconsistent
tags:
  - smoke_test
  - RegressionTest
  - IntegrationTests
```

### 2. Multi-Dimensional Tagging

Tag across multiple dimensions for flexible filtering:

```yaml
tags:
  - smoke              # Test type
  - critical           # Priority
  - authentication     # Feature
  - fast               # Performance
  - team-backend       # Ownership
```

### 3. Create Tag Taxonomy

Document your tag taxonomy:

```markdown
# Tag Taxonomy

## Test Types
- smoke: Quick health checks
- regression: Full test suite
- integration: Multi-service tests
- e2e: End-to-end user flows

## Priority
- p0: Critical, must pass
- p1: High priority
- p2: Medium priority
- p3: Low priority

## Features
- authentication: Auth flows
- payment: Payment processing
- checkout: Checkout flows
...
```

### 4. Review Tags Regularly

```bash
# Find unused tags
testmesh tags list --unused

# Find deprecated flows
testmesh flows list --tag auto:deprecated

# Find flaky tests
testmesh flows list --tag auto:flaky
```

### 5. Use Tag Policies

```yaml
# .testmesh.yaml
tag_policies:
  # All flows must have these tags
  required:
    - At least one: [smoke, regression, integration]
    - At least one: [p0, p1, p2, p3]

  # Warn if these tags are used
  warnings:
    - flaky: "Fix flaky tests instead of tagging them"
    - temp: "Remove temporary tags"

  # Auto-fail if these tags present
  forbidden:
    - do-not-merge
    - wip
```

### 6. Tag in Git Workflow

```yaml
# PR Checks
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  check-tags:
    runs-on: ubuntu-latest
    steps:
      - name: Validate Tags
        run: |
          # Check all new/modified flows have required tags
          testmesh flows validate --require-tags
```

### 7. Document Tags in Flow

```yaml
flow:
  name: "Payment Processing"
  description: |
    Tests complete payment flow from cart to confirmation.

    Tags:
    - smoke: Included in smoke test suite
    - critical: Blocking if fails
    - payment: Payment team ownership
    - requires-payment-gateway: Needs payment gateway running

  tags:
    - smoke
    - critical
    - payment
    - requires-payment-gateway
```

---

## Examples

### Example 1: Smoke Test Suite

```yaml
flow:
  name: "API Health Check"
  tags:
    - smoke
    - api
    - fast
    - p0

  steps:
    - id: health
      action: http_request
      config:
        method: GET
        url: "${API_URL}/health"
      assert:
        - status == 200
```

```bash
# Run all smoke tests
testmesh run --tag smoke

# Run smoke tests in CI
testmesh run --tag smoke+fast --env staging
```

### Example 2: Regression Suite

```yaml
flow:
  name: "User Registration Complete Flow"
  tags:
    - regression
    - authentication
    - user-management
    - slow
    - p1
    - requires-database
    - requires-email

  steps:
    # ... comprehensive test steps
```

```bash
# Nightly regression
testmesh run --tag regression --exclude flaky --env staging

# Exclude slow tests for faster feedback
testmesh run --tag regression --exclude slow
```

### Example 3: Critical Tests

```yaml
flow:
  name: "Payment Processing"
  tags:
    - critical
    - p0
    - payment
    - pci-compliant
    - team-payments
    - requires-payment-gateway

  steps:
    # ... payment flow
```

```bash
# Run only critical tests
testmesh run --tag critical

# Critical tests every 15 minutes
# (in schedule configuration)
```

### Example 4: Feature-Specific Tests

```yaml
flow:
  name: "OAuth2 Login Flow"
  tags:
    - authentication
    - oauth2
    - integration
    - requires-staging
    - team-backend

  steps:
    # ... OAuth2 flow
```

```bash
# Run all authentication tests
testmesh run --tag authentication

# Run OAuth2-specific tests
testmesh run --tag oauth2
```

### Example 5: Environment-Specific

```yaml
flow:
  name: "Production Health Check"
  tags:
    - smoke
    - production-only
    - monitoring
    - team-sre

  steps:
    # ... production checks
```

```bash
# Run production-only tests
testmesh run --tag production-only --env production

# Exclude production-only from staging
testmesh run --tag smoke --exclude production-only --env staging
```

### Example 6: Team-Based Execution

```yaml
flow:
  name: "Backend API Tests"
  tags:
    - team-backend
    - api
    - integration

  steps:
    # ... backend tests
```

```bash
# Run tests for specific team
testmesh run --tag team-backend

# In CI, run team-specific tests
testmesh run --tag team-${TEAM_NAME}
```

---

## Tag-Based Metrics

### Dashboard Views by Tags

**Success Rate by Tag**:
```
┌──────────────┬─────────┬──────────┐
│ Tag          │ Success │ Failures │
├──────────────┼─────────┼──────────┤
│ smoke        │   99.5% │      2   │
│ critical     │   98.2% │      8   │
│ regression   │   95.1% │     34   │
│ flaky        │   72.3% │     89   │
└──────────────┴─────────┴──────────┘
```

**Execution Time by Tag**:
```
┌──────────────┬─────────┬────────┐
│ Tag          │ Avg     │ P95    │
├──────────────┼─────────┼────────┤
│ fast         │   12s   │   25s  │
│ slow         │   2m    │   5m   │
│ very-slow    │   8m    │   15m  │
└──────────────┴─────────┴────────┘
```

### Alerts by Tags

```yaml
# Alert configuration
alerts:
  - name: "Critical Tests Failing"
    condition: "tag:critical AND status:failed"
    notify: ["#alerts", "team-leads@example.com"]

  - name: "Flaky Test Threshold"
    condition: "tag:flaky AND count > 10"
    notify: ["#quality", "qa-team@example.com"]

  - name: "Slow Test Warning"
    condition: "tag:slow AND duration > 10m"
    notify: ["#performance"]
```

---

## Configuration File

### Complete Tag Configuration

```yaml
# .testmesh.yaml

# Tag validation rules
tag_rules:
  # Allowed tags (whitelist)
  allowed_tags:
    - smoke
    - regression
    - integration
    - critical
    - p0
    - p1
    - p2
    - authentication
    - payment
    # ... all allowed tags

  # Required tag categories
  required_categories:
    - type: [smoke, regression, integration, e2e]
    - priority: [p0, p1, p2, p3]

  # Deprecated tags
  deprecated_tags:
    - old-auth: "Use 'authentication' instead"
    - api-v1: "Use 'api' instead"

  # Forbidden tags
  forbidden_tags:
    - wip
    - do-not-run
    - broken

# Tag inheritance
tag_inheritance:
  flow_to_step:
    enabled: true
    exclude_tags: [experimental, deprecated]

  flow_to_subflow:
    enabled: true
    exclude_tags: [local-only]

# Auto-tagging rules
auto_tag:
  - if_name_contains: "smoke"
    add_tag: "smoke"

  - if_duration: "> 1m"
    add_tag: "slow"

  - if_pass_rate: "< 80%"
    add_tag: "auto:flaky"

# Default tags for new flows
default_tags:
  - untagged

# Tag aliases
tag_aliases:
  auth: authentication
  db: database
  k8s: kubernetes
```

---

## Summary

### Tag Benefits

✅ **Organization** - Group flows logically
✅ **Selective Execution** - Run specific subsets
✅ **Scheduling** - Different schedules for different tags
✅ **CI/CD Integration** - Run appropriate tests per pipeline
✅ **Metrics** - Track performance by tag
✅ **Team Ownership** - Clear responsibility
✅ **Compliance** - Track regulatory requirements

### Quick Reference

```bash
# Basic execution
testmesh run --tag smoke
testmesh run --tag smoke,regression
testmesh run --tag smoke+critical
testmesh run --exclude flaky

# Tag management
testmesh tags list
testmesh tags stats
testmesh flow tag add <flow-id> <tag>
testmesh flow tag remove <flow-id> <tag>

# Filtering
testmesh flows list --tag smoke
testmesh flows list --untagged
```

### Next Steps

1. **Define your tag taxonomy** - Document tag categories
2. **Tag existing flows** - Add tags to all flows
3. **Configure validation** - Set up tag rules
4. **Set up schedules** - Create tag-based schedules
5. **Monitor metrics** - Track performance by tag
6. **Iterate** - Refine tags based on usage

---

**Version**: 1.0.0
**Last Updated**: 2026-02-09
**Status**: Complete ✅
