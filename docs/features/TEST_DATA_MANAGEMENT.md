# Test Data Management & Cleanup

## Overview

TestMesh provides comprehensive **test data tracking and automatic cleanup** to prevent data pollution and ensure tests are isolated and repeatable.

**Key Features**:
- ✅ Automatic tracking of created resources (HTTP, Database, Kafka)
- ✅ Automatic cleanup in teardown
- ✅ Manual tracking for custom cleanup logic
- ✅ Metadata tagging for easy identification
- ✅ Cleanup even on test failure
- ✅ Cleanup verification and reporting
- ✅ Retention policies for debugging

---

## 1. Automatic Resource Tracking

### How It Works

TestMesh automatically tracks resources created during test execution and cleans them up in the teardown phase.

```yaml
name: User Registration Test

config:
  auto_cleanup: true  # Enable automatic cleanup (default: true)

steps:
  - id: create_user
    action: http_request
    config:
      method: POST
      url: "${API_URL}/users"
      body:
        email: "test-${uuid}@example.com"
        name: "Test User"
    output:
      user_id: response.body.id
    track:
      resource_type: user
      resource_id: ${user_id}
      cleanup_method: http_request
      cleanup_config:
        method: DELETE
        url: "${API_URL}/users/${user_id}"

  - id: create_order
    action: http_request
    config:
      method: POST
      url: "${API_URL}/orders"
      body:
        user_id: "${user_id}"
        amount: 100.00
    output:
      order_id: response.body.id
    track:
      resource_type: order
      resource_id: ${order_id}
      cleanup_method: http_request
      cleanup_config:
        method: DELETE
        url: "${API_URL}/orders/${order_id}"

# Automatic teardown - TestMesh cleans up in reverse order:
# 1. DELETE /orders/{order_id}
# 2. DELETE /users/{user_id}
```

**What gets tracked**:
- HTTP: Created resources (POST, PUT)
- Database: Inserted/updated rows
- Kafka: Published messages (can't delete, but tracked)
- Files: Created files/directories
- External services: Created resources via API

**Cleanup order**: Reverse order of creation (LIFO - Last In, First Out)

---

## 2. Smart Tracking Modes

### 2.1 Explicit Tracking

Use `track` block to explicitly mark resources for cleanup:

```yaml
- id: create_cart
  action: http_request
  config:
    method: POST
    url: "${API_URL}/carts"
  output:
    cart_id: response.body.id
  track:
    resource_type: cart
    resource_id: ${cart_id}
    cleanup_method: http_request
    cleanup_config:
      method: DELETE
      url: "${API_URL}/carts/${cart_id}"
```

### 2.2 Auto-Track (Inferred)

TestMesh automatically tracks based on HTTP method and response:

```yaml
- id: create_product
  action: http_request
  config:
    method: POST  # Automatically tracked
    url: "${API_URL}/products"
    body:
      name: "Test Product"
  output:
    product_id: response.body.id
  auto_track:
    enabled: true  # Default: true for POST/PUT
    id_path: response.body.id
    delete_url: "${API_URL}/products/${product_id}"
```

**Auto-tracking rules**:
- `POST /resource` → Track with `DELETE /resource/{id}`
- `PUT /resource/{id}` → Track with `DELETE /resource/{id}`
- `INSERT INTO table` → Track with `DELETE FROM table WHERE id = ?`

### 2.3 Batch Tracking

Track multiple resources at once:

```yaml
- id: create_multiple_users
  action: http_request
  config:
    method: POST
    url: "${API_URL}/users/batch"
    body:
      users:
        - email: "user1@test.com"
        - email: "user2@test.com"
        - email: "user3@test.com"
  output:
    user_ids: response.body.ids  # Array of IDs
  track:
    resource_type: user
    resource_ids: ${user_ids}  # Array tracking
    cleanup_method: http_request
    cleanup_config:
      method: DELETE
      url: "${API_URL}/users/${each.id}"  # Loop over IDs
```

---

## 3. Database-Specific Tracking

### 3.1 Auto-Track INSERT Statements

```yaml
- id: insert_test_data
  action: database_query
  config:
    connection: "${DATABASE_URL}"
    query: |
      INSERT INTO users (email, name)
      VALUES ($1, $2)
      RETURNING id
    params:
      - "test-${uuid}@example.com"
      - "Test User"
  output:
    user_id: result.rows[0].id
  # Automatically tracked - will DELETE in teardown
  track:
    resource_type: database_row
    table: users
    id_column: id
    id_value: ${user_id}
```

**Automatic cleanup**:
```sql
DELETE FROM users WHERE id = ?
```

### 3.2 Soft Delete Support

For tables with soft deletes:

```yaml
- id: insert_user
  action: database_query
  config:
    query: |
      INSERT INTO users (email, name)
      VALUES ($1, $2)
      RETURNING id
    params:
      - "test@example.com"
      - "Test User"
  output:
    user_id: result.rows[0].id
  track:
    resource_type: database_row
    table: users
    id_column: id
    id_value: ${user_id}
    soft_delete: true  # Use soft delete
    cleanup_method: database_query
    cleanup_config:
      query: |
        UPDATE users
        SET deleted_at = NOW()
        WHERE id = $1
      params:
        - ${user_id}
```

### 3.3 Transaction-Based Cleanup

Use database transactions for complete rollback:

```yaml
name: Database Test with Transaction

config:
  database_transaction: true  # All DB operations in one transaction

setup:
  - id: begin_transaction
    action: database_query
    config:
      query: BEGIN

steps:
  - id: insert_user
    action: database_query
    config:
      query: INSERT INTO users ...

  - id: insert_order
    action: database_query
    config:
      query: INSERT INTO orders ...

teardown:
  - id: rollback_transaction
    action: database_query
    config:
      query: ROLLBACK  # Rollback all changes
```

---

## 4. Kafka Message Tracking

Kafka messages can't be deleted, but we can track them for verification:

```yaml
- id: publish_event
  action: kafka_produce
  config:
    topic: user.events
    key: "user_${user_id}"
    value:
      event_type: user.created
      user_id: "${user_id}"
      test_run_id: "${test_run_id}"  # Add test metadata
  track:
    resource_type: kafka_message
    topic: user.events
    key: "user_${user_id}"
    metadata:
      test_run_id: "${test_run_id}"
      created_at: "${timestamp}"
    # Can't delete, but tracked for audit
```

**Verification in cleanup**:
```yaml
teardown:
  - id: verify_message_processed
    action: kafka_consume
    config:
      topic: user.events
      key: "user_${user_id}"
    assert:
      - consumed == true  # Verify message was processed
```

---

## 5. Metadata Tagging Strategy

### 5.1 Automatic Test Metadata

TestMesh automatically adds metadata to all created resources:

```yaml
# Automatically injected by TestMesh
test_metadata:
  test_run_id: "exec_abc123"         # Unique execution ID
  flow_id: "user-registration"       # Flow name
  flow_version: "1.2.0"              # Flow version
  execution_timestamp: "2024-01-15T14:23:45Z"
  agent_name: "staging-agent"
  environment: "staging"
  created_by: "testmesh"
```

**Injected in:**
- HTTP headers: `X-Test-Run-ID`, `X-Flow-ID`, `X-Created-By`
- Database columns: `test_run_id`, `created_by_test`
- Kafka headers: `test-run-id`, `flow-id`

### 5.2 Query and Cleanup by Metadata

```yaml
teardown:
  - id: cleanup_by_test_run
    action: database_query
    config:
      query: |
        DELETE FROM users
        WHERE test_run_id = $1
      params:
        - "${test_run_id}"

  - id: cleanup_http_resources
    action: http_request
    config:
      method: DELETE
      url: "${API_URL}/test-data?test_run_id=${test_run_id}"
```

---

## 6. Manual Cleanup with Context

### 6.1 Store in Execution Context

```yaml
steps:
  - id: create_multiple_resources
    action: http_request
    config:
      method: POST
      url: "${API_URL}/bulk-create"
    output:
      created_ids: response.body.ids
    context:
      append: cleanup_list  # Add to cleanup list
      value: ${created_ids}

teardown:
  - id: cleanup_all
    action: loop
    loop:
      items: ${context.cleanup_list}
      variable: item_id
      steps:
        - action: http_request
          config:
            method: DELETE
            url: "${API_URL}/resources/${item_id}"
```

### 6.2 Conditional Cleanup

```yaml
teardown:
  - id: cleanup_users
    action: database_query
    if: ${config.cleanup_enabled} == true  # Conditional
    config:
      query: |
        DELETE FROM users
        WHERE email LIKE 'test-%'
        AND created_at > NOW() - INTERVAL '1 hour'
```

---

## 7. Cleanup Strategies

### Strategy 1: Immediate Cleanup (Default)

Cleanup happens immediately after test execution in `teardown`:

```yaml
config:
  cleanup_strategy: immediate  # Default

steps:
  # ... test steps ...

teardown:
  # Automatic cleanup happens here
```

**Pros**: No data pollution
**Cons**: Can't inspect data after test for debugging

### Strategy 2: Delayed Cleanup

Cleanup happens after a delay or manually:

```yaml
config:
  cleanup_strategy: delayed
  cleanup_delay: 3600  # 1 hour (in seconds)

steps:
  # ... test steps ...

# Cleanup scheduled for 1 hour later
# Useful for manual inspection
```

### Strategy 3: Manual Cleanup

No automatic cleanup - user must trigger manually:

```yaml
config:
  cleanup_strategy: manual
  auto_cleanup: false

steps:
  # ... test steps ...

# No automatic cleanup
# User runs: testmesh cleanup <execution_id>
```

### Strategy 4: Conditional Cleanup

Cleanup only on success, keep data on failure:

```yaml
config:
  cleanup_strategy: conditional
  cleanup_on_success: true   # Cleanup if test passes
  cleanup_on_failure: false  # Keep data if test fails (for debugging)

steps:
  # ... test steps ...

teardown:
  # Cleanup only if test passed
```

---

## 8. Cleanup Verification

### 8.1 Verify Resources Deleted

```yaml
teardown:
  - id: delete_user
    action: http_request
    config:
      method: DELETE
      url: "${API_URL}/users/${user_id}"

  - id: verify_deleted
    action: http_request
    config:
      method: GET
      url: "${API_URL}/users/${user_id}"
    assert:
      - status == 404  # Verify user no longer exists
```

### 8.2 Cleanup Report

TestMesh generates a cleanup report after execution:

```
Cleanup Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tracked Resources: 5
Cleaned Up: 5
Failed Cleanup: 0

Details:
✓ user:usr_123          DELETE /users/usr_123       200 OK
✓ order:ord_456         DELETE /orders/ord_456      200 OK
✓ cart:cart_789         DELETE /carts/cart_789      200 OK
✓ db_row:users:100      DELETE FROM users WHERE ... 1 row
✓ db_row:orders:200     DELETE FROM orders WHERE... 1 row

Total Cleanup Time: 1.2s
```

---

## 9. Handling Cleanup Failures

### 9.1 Retry Failed Cleanup

```yaml
teardown:
  - id: delete_resource
    action: http_request
    config:
      method: DELETE
      url: "${API_URL}/resources/${resource_id}"
    retry:
      max_attempts: 3
      delay: 1000  # 1 second between retries
      on_error: continue  # Continue even if fails
```

### 9.2 Fallback Cleanup

```yaml
teardown:
  - id: delete_via_api
    action: http_request
    config:
      method: DELETE
      url: "${API_URL}/users/${user_id}"
    on_error: fallback  # Use fallback on failure

  - id: delete_via_database
    action: database_query
    if: ${delete_via_api.failed} == true  # Only if API failed
    config:
      query: |
        DELETE FROM users WHERE id = $1
      params:
        - ${user_id}
```

### 9.3 Orphan Resource Detection

TestMesh tracks failed cleanups and alerts:

```yaml
# CLI command to find orphaned resources
testmesh cleanup orphans

# Output:
# Found 3 orphaned resources from failed cleanups:
# - user:usr_123 (from exec_abc123, 2 hours ago)
# - order:ord_456 (from exec_def456, 5 hours ago)
# - cart:cart_789 (from exec_ghi789, 1 day ago)
#
# Clean up now? [Y/n]
```

---

## 10. Advanced Features

### 10.1 Cascading Cleanup

Define cleanup dependencies:

```yaml
- id: create_user
  track:
    resource_id: ${user_id}
    cleanup_cascade:
      - resource_type: order
        query: DELETE FROM orders WHERE user_id = $1
      - resource_type: cart
        query: DELETE FROM carts WHERE user_id = $1
      - resource_type: session
        cleanup: http_request
        url: "${API_URL}/sessions?user_id=${user_id}"
```

**Cleanup order**:
1. Delete sessions (child)
2. Delete carts (child)
3. Delete orders (child)
4. Delete user (parent)

### 10.2 Shared Resources

Mark resources as shared (don't delete):

```yaml
- id: get_test_user
  action: http_request
  config:
    method: GET
    url: "${API_URL}/users/test-shared-user"
  track:
    shared: true  # Don't cleanup - shared across tests
```

### 10.3 Cleanup Filters

Bulk cleanup with filters:

```yaml
teardown:
  - id: cleanup_all_test_data
    action: bulk_cleanup
    config:
      filters:
        - resource_type: user
          where: email LIKE 'test-%'
          created_after: ${test_start_time}
        - resource_type: order
          where: test_run_id = ${test_run_id}
        - resource_type: kafka_message
          topic: test.events
          metadata.test_run_id: ${test_run_id}
```

### 10.4 Cleanup Hooks

Register custom cleanup logic:

```yaml
config:
  cleanup_hooks:
    - name: notify_cleanup
      action: http_request
      config:
        method: POST
        url: "${WEBHOOK_URL}/cleanup-complete"
        body:
          test_run_id: "${test_run_id}"
          cleaned_resources: "${cleanup_count}"
```

---

## 11. Database Schema Support

### Track Test Data in Database

Add test metadata columns to your database schema:

```sql
-- Users table with test metadata
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),

  -- Test metadata columns
  test_run_id VARCHAR(50),      -- TestMesh execution ID
  created_by_test BOOLEAN DEFAULT FALSE,
  test_created_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP  -- For soft deletes
);

-- Index for fast cleanup
CREATE INDEX idx_users_test_run_id ON users(test_run_id)
  WHERE test_run_id IS NOT NULL;

-- Cleanup query
DELETE FROM users WHERE test_run_id = 'exec_abc123';
```

### Automatic Schema Detection

TestMesh can auto-detect test columns:

```yaml
config:
  database:
    auto_detect_test_columns: true
    test_columns:
      - test_run_id
      - created_by_test
      - test_created_at
```

---

## 12. CLI Commands

### Cleanup Commands

```bash
# View tracked resources for an execution
testmesh cleanup list <execution_id>

# Manually trigger cleanup
testmesh cleanup run <execution_id>

# Find orphaned resources
testmesh cleanup orphans

# Cleanup orphaned resources older than N days
testmesh cleanup orphans --older-than 7d --execute

# Bulk cleanup by test run ID
testmesh cleanup bulk --test-run-id exec_abc123

# Cleanup by tag
testmesh cleanup bulk --tag staging --older-than 24h

# Verify cleanup (check if resources still exist)
testmesh cleanup verify <execution_id>

# Export cleanup report
testmesh cleanup report <execution_id> --format json > report.json
```

---

## 13. Dashboard UI

### Cleanup View in Dashboard

```
┌────────────────────────────────────────────────────────────────┐
│  Execution #1847  •  Cleanup Status                            │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Auto Cleanup: ✅ Enabled                                      │
│  Strategy: Conditional (cleanup on success)                    │
│  Status: ✓ Completed                                           │
│                                                                 │
│  Tracked Resources (5)                                          │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                 │
│  Resource            Type      Status      Action              │
│  ────────────────────────────────────────────────────────────  │
│  usr_123             user      ✓ Cleaned   DELETE /users/...   │
│  ord_456             order     ✓ Cleaned   DELETE /orders/...  │
│  cart_789            cart      ✓ Cleaned   DELETE /carts/...   │
│  users:100           db_row    ✓ Cleaned   DELETE FROM users   │
│  orders:200          db_row    ✓ Cleaned   DELETE FROM orders  │
│                                                                 │
│  Cleanup Summary                                                │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                 │
│  Started:    2024-01-15 14:25:00                               │
│  Completed:  2024-01-15 14:25:01                               │
│  Duration:   1.2s                                              │
│  Success:    5/5                                               │
│  Failed:     0                                                 │
│                                                                 │
│  [ Retry Failed ]  [ Manual Cleanup ]  [ Export Report ]      │
└────────────────────────────────────────────────────────────────┘
```

### Orphaned Resources Dashboard

```
┌────────────────────────────────────────────────────────────────┐
│  Orphaned Resources  •  Failed Cleanups                        │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Total: 12 orphaned resources                                  │
│  Oldest: 7 days ago                                            │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ usr_123      user      exec_abc123    2 hours ago        │ │
│  │   Cleanup failed: 404 Not Found                          │ │
│  │   [ Retry ]  [ Mark as Cleaned ]  [ Ignore ]             │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ ord_456      order     exec_def456    5 hours ago        │ │
│  │   Cleanup failed: Connection timeout                     │ │
│  │   [ Retry ]  [ Mark as Cleaned ]  [ Ignore ]             │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  [ Cleanup All ]  [ Cleanup Older than 24h ]  [ Export ]      │
└────────────────────────────────────────────────────────────────┘
```

---

## 14. Best Practices

### ✅ DO

1. **Use unique identifiers** in test data (UUID, timestamp)
   ```yaml
   email: "test-${uuid}@example.com"
   ```

2. **Always track created resources**
   ```yaml
   track:
     resource_id: ${user_id}
   ```

3. **Use metadata tagging**
   ```yaml
   test_run_id: "${test_run_id}"
   created_by: "testmesh"
   ```

4. **Test cleanup in development**
   ```bash
   testmesh run flow.yaml --verify-cleanup
   ```

5. **Use conditional cleanup** to keep data on failure
   ```yaml
   cleanup_on_failure: false
   ```

6. **Index test metadata columns** for fast cleanup
   ```sql
   CREATE INDEX idx_test_run_id ON users(test_run_id);
   ```

### ❌ DON'T

1. **Don't hardcode test data** without unique IDs
   ```yaml
   # BAD: Same email every time
   email: "test@example.com"

   # GOOD: Unique email
   email: "test-${uuid}@example.com"
   ```

2. **Don't skip cleanup tracking** for created resources
   ```yaml
   # BAD: No tracking
   - id: create_user
     action: http_request

   # GOOD: With tracking
   - id: create_user
     action: http_request
     track:
       resource_id: ${user_id}
   ```

3. **Don't delete shared/production data**
   ```yaml
   # BAD: Could delete real data
   DELETE FROM users WHERE email = 'admin@company.com'

   # GOOD: Only test data
   DELETE FROM users WHERE test_run_id = $1
   ```

4. **Don't ignore cleanup failures**
   - Monitor orphaned resources
   - Set up alerts for failed cleanups

---

## 15. Configuration Reference

### Flow-Level Config

```yaml
config:
  # Cleanup strategy
  cleanup_strategy: immediate  # immediate | delayed | manual | conditional
  cleanup_delay: 3600          # Delay in seconds (for delayed strategy)
  cleanup_on_success: true     # Cleanup if test passes
  cleanup_on_failure: false    # Keep data if test fails

  # Auto-cleanup
  auto_cleanup: true           # Enable automatic cleanup
  cleanup_order: reverse       # reverse | forward | custom

  # Retry behavior
  cleanup_retry: true          # Retry failed cleanup
  cleanup_retry_max: 3         # Max retry attempts
  cleanup_retry_delay: 1000    # Delay between retries (ms)

  # Verification
  verify_cleanup: true         # Verify resources deleted

  # Metadata
  add_test_metadata: true      # Add test metadata to resources
  test_metadata_prefix: "X-Test-"  # HTTP header prefix

  # Cascading
  cascade_cleanup: true        # Enable cascading cleanup
```

---

## Summary

TestMesh provides **comprehensive test data management**:

✅ **Automatic tracking** - Resources tracked automatically
✅ **Flexible cleanup** - Immediate, delayed, conditional, manual
✅ **Metadata tagging** - Easy identification of test data
✅ **Verification** - Ensure cleanup succeeded
✅ **Failure handling** - Retry, fallback, orphan detection
✅ **Multi-protocol** - HTTP, Database, Kafka support
✅ **Cascading cleanup** - Handle dependencies
✅ **Dashboard visibility** - View cleanup status in UI
✅ **CLI tools** - Manual cleanup and reporting

**No more data pollution in your test environments!** 🎯
