# Async Validation Patterns

> **Testing eventual consistency and asynchronous operations with timeout tolerance**

## Overview

Modern distributed systems often have eventual consistency - operations don't complete instantly. TestMesh provides powerful patterns to test async operations:

1. **Kafka Message Waiting** - Wait for events with timeout
2. **Database Polling** - Poll database until data appears
3. **API Polling** - Wait for status changes
4. **Combined Patterns** - Test full async flows

---

## 1. Kafka Message Validation

### Pattern: Wait for Message After API Call

**Scenario**: API call triggers an event. Verify the event appears in Kafka within timeout.

```yaml
flow:
  name: "Verify Kafka Event After API Call"

  steps:
    # Step 1: Trigger action that produces event
    - id: create_user
      name: "Create User via API"
      action: http_request
      config:
        method: POST
        url: "${API_URL}/users"
        body:
          email: "${FAKER.internet.email}"
          name: "${FAKER.name.fullName}"
      save:
        user_id: "response.body.id"
        user_email: "response.body.email"
      assert:
        - status == 201

    # Step 2: Wait for Kafka message with timeout
    - id: verify_event
      name: "Wait for user.created Event"
      action: kafka_consume
      config:
        brokers: ["${KAFKA_BROKERS}"]
        topic: "user.events"

        # Unique consumer group per test execution
        group_id: "test-consumer-${EXECUTION_ID}"

        # Wait up to 10 seconds for message
        timeout: 10s

        # Match specific message by key or content
        match:
          key: "${create_user.user_id}"      # Search by message key
          json_path:                          # AND search by content
            - "$.event_type == 'user.created'"
            - "$.user.id == '${create_user.user_id}'"
            - "$.user.email == '${create_user.user_email}'"

      save:
        event_timestamp: "result.messages[0].value.timestamp"
        event_data: "result.messages[0].value"

      assert:
        - result.count > 0
        - result.messages[0].value.event_type == "user.created"
```

### Pattern: Consume Multiple Events

```yaml
- id: verify_multiple_events
  name: "Verify Order Processing Events"
  action: kafka_consume
  config:
    brokers: ["${KAFKA_BROKERS}"]
    topic: "order.events"
    group_id: "test-${EXECUTION_ID}"

    timeout: 30s
    max_messages: 5                        # Consume up to 5 messages

    # Wait for at least one message matching
    match:
      json_path:
        - "$.order_id == '${order_id}'"

  save:
    all_events: "result.messages"
    event_types: "result.messages[*].value.event_type"

  assert:
    - result.count >= 3                    # At least 3 events
    - "'order.created' in ${event_types}"
    - "'order.paid' in ${event_types}"
    - "'order.shipped' in ${event_types}"
```

### Pattern: Multiple Topics

```yaml
- id: verify_cross_service_events
  name: "Verify Events in Multiple Topics"
  action: parallel
  config:
    steps:
      - id: verify_user_event
        action: kafka_consume
        config:
          topic: "user.events"
          timeout: 10s
          match:
            key: "${user_id}"

      - id: verify_notification_event
        action: kafka_consume
        config:
          topic: "notification.events"
          timeout: 10s
          match:
            json_path:
              - "$.user_id == '${user_id}'"
              - "$.type == 'welcome_email'"

      - id: verify_analytics_event
        action: kafka_consume
        config:
          topic: "analytics.events"
          timeout: 10s
          match:
            json_path:
              - "$.event == 'user_signup'"
```

---

## 2. Database Polling

### Pattern: Wait for Database Entry

**Scenario**: API call triggers async processing. Verify database entry appears after processing.

```yaml
flow:
  name: "Verify Database Entry After Async Processing"

  steps:
    # Step 1: Trigger async operation
    - id: submit_job
      name: "Submit Async Job"
      action: http_request
      config:
        method: POST
        url: "${API_URL}/jobs"
        body:
          type: "data_import"
          file_url: "${DATA_FILE_URL}"
      save:
        job_id: "response.body.job_id"
      assert:
        - status == 202                    # Accepted (async)

    # Step 2: Poll database until entry appears
    - id: wait_for_completion
      name: "Wait for Job Completion in DB"
      action: database_query
      config:
        query: "SELECT * FROM jobs WHERE id = $1 AND status = 'completed'"
        params: ["${submit_job.job_id}"]

        # Poll configuration
        poll:
          enabled: true
          timeout: 60s                     # Total wait time
          interval: 2s                     # Check every 2 seconds

      save:
        completed_at: "result.rows[0].completed_at"
        rows_processed: "result.rows[0].rows_processed"

      assert:
        - result.count == 1                # Job found
        - result.rows[0].status == "completed"
        - result.rows[0].rows_processed > 0
```

### Pattern: Wait for Status Change

```yaml
- id: wait_for_payment_processed
  name: "Wait for Payment Processing"
  action: database_query
  config:
    query: |
      SELECT status, processed_at, error_message
      FROM payments
      WHERE id = $1
    params: ["${payment_id}"]

    # Poll until payment is processed (not pending)
    poll:
      enabled: true
      timeout: 30s
      interval: 1s

  save:
    payment_status: "result.rows[0].status"
    processed_at: "result.rows[0].processed_at"

  assert:
    - result.count == 1
    - result.rows[0].status in ["completed", "failed"]  # Not pending
    - result.rows[0].processed_at exists
```

### Pattern: Wait for Multiple Rows

```yaml
- id: wait_for_order_items
  name: "Wait for All Order Items Created"
  action: database_query
  config:
    query: "SELECT * FROM order_items WHERE order_id = $1"
    params: ["${order_id}"]

    poll:
      enabled: true
      timeout: 20s
      interval: 1s

  assert:
    - result.count == 3                    # Expected 3 items
    - result.rows[*].status == "confirmed" # All confirmed
```

---

## 3. Combined Pattern: API → Kafka → Database

### Pattern: Full Async Flow Verification

**Scenario**: API call → produces Kafka event → event consumer updates database

```yaml
flow:
  name: "Complete Async Flow Verification"
  description: "Test API → Kafka → Database async pipeline"

  steps:
    # Step 1: API call
    - id: create_order
      name: "Create Order via API"
      action: http_request
      config:
        method: POST
        url: "${API_URL}/orders"
        body:
          customer_id: "${customer_id}"
          items:
            - product_id: "prod_123"
              quantity: 2
            - product_id: "prod_456"
              quantity: 1
      save:
        order_id: "response.body.order_id"
        total_amount: "response.body.total"
      assert:
        - status == 201

    # Step 2: Verify Kafka event (immediate)
    - id: verify_order_event
      name: "Verify order.created Event in Kafka"
      action: kafka_consume
      config:
        brokers: ["${KAFKA_BROKERS}"]
        topic: "order.events"
        group_id: "test-${EXECUTION_ID}"
        timeout: 5s
        match:
          key: "${create_order.order_id}"
          json_path:
            - "$.event_type == 'order.created'"
            - "$.order.id == '${create_order.order_id}'"
      assert:
        - result.count > 0

    # Step 3: Verify database updated (eventual consistency)
    - id: verify_inventory_updated
      name: "Verify Inventory Deducted"
      action: database_query
      config:
        query: |
          SELECT product_id, quantity_available
          FROM inventory
          WHERE product_id IN ('prod_123', 'prod_456')
        poll:
          enabled: true
          timeout: 15s
          interval: 1s
      assert:
        - result.count == 2                # Both products found
        # Verify quantity was deducted (would need to know original values)

    # Step 4: Verify order processing status
    - id: verify_order_processed
      name: "Verify Order Processing Complete"
      action: database_query
      config:
        query: |
          SELECT id, status, processed_at
          FROM orders
          WHERE id = $1 AND status IN ('processing', 'confirmed')
        params: ["${create_order.order_id}"]
        poll:
          enabled: true
          timeout: 20s
          interval: 2s
      save:
        order_status: "result.rows[0].status"
      assert:
        - result.count == 1
        - result.rows[0].status in ["processing", "confirmed"]
        - result.rows[0].processed_at exists
```

---

## 4. API Polling Pattern

### Pattern: Wait for API Status Change

```yaml
flow:
  name: "Wait for Async Job via API Polling"

  steps:
    # Step 1: Start async job
    - id: start_export
      name: "Start Data Export"
      action: http_request
      config:
        method: POST
        url: "${API_URL}/exports"
        body:
          format: "csv"
          filters: { status: "active" }
      save:
        export_id: "response.body.export_id"
      assert:
        - status == 202                    # Accepted

    # Step 2: Poll API until complete
    - id: wait_for_export
      name: "Wait for Export Completion"
      action: wait_until
      config:
        # Condition to check
        condition: "${check_status.status} in ['completed', 'failed']"

        max_duration: 5m                   # Total wait time
        interval: 5s                       # Check every 5 seconds

        # Steps to execute on each poll
        steps:
          - id: check_status
            action: http_request
            config:
              method: GET
              url: "${API_URL}/exports/${start_export.export_id}"
            output:
              status: "response.body.status"
              progress: "response.body.progress"

        # What to do on timeout
        on_timeout: "fail"

      save:
        final_status: "check_status.status"
        download_url: "check_status.response.body.download_url"

      assert:
        - "${check_status.status}" == "completed"
        - "${check_status.response.body.download_url}" exists
```

---

## 5. Complex Pattern: Payment Processing

### Pattern: Payment with Multiple Async Checks

```yaml
flow:
  name: "Payment Processing with Async Verification"
  description: "Test payment API → webhook → database → notification"

  steps:
    # Step 1: Initiate payment
    - id: create_payment
      name: "Create Payment Intent"
      action: http_request
      config:
        method: POST
        url: "${PAYMENT_API_URL}/payment-intents"
        body:
          amount: 9999                     # $99.99
          currency: "USD"
          customer: "${customer_id}"
      save:
        payment_intent_id: "response.body.id"
      assert:
        - status == 201
        - response.body.status == "requires_confirmation"

    # Step 2: Confirm payment
    - id: confirm_payment
      name: "Confirm Payment"
      action: http_request
      config:
        method: POST
        url: "${PAYMENT_API_URL}/payment-intents/${create_payment.payment_intent_id}/confirm"
        body:
          payment_method: "pm_card_visa"
      assert:
        - status == 200

    # Step 3: Wait for webhook event
    - id: wait_for_webhook_event
      name: "Wait for payment.succeeded Event"
      action: kafka_consume
      config:
        brokers: ["${KAFKA_BROKERS}"]
        topic: "payment.webhooks"
        group_id: "test-${EXECUTION_ID}"
        timeout: 15s
        match:
          json_path:
            - "$.type == 'payment_intent.succeeded'"
            - "$.data.object.id == '${create_payment.payment_intent_id}'"
      assert:
        - result.count > 0

    # Step 4: Verify database updated
    - id: verify_payment_recorded
      name: "Verify Payment in Database"
      action: database_query
      config:
        query: |
          SELECT * FROM payments
          WHERE payment_intent_id = $1
          AND status = 'completed'
        params: ["${create_payment.payment_intent_id}"]
        poll:
          enabled: true
          timeout: 10s
          interval: 1s
      assert:
        - result.count == 1
        - result.rows[0].amount == 9999
        - result.rows[0].status == "completed"

    # Step 5: Verify customer balance updated
    - id: verify_balance_updated
      name: "Verify Customer Balance"
      action: database_query
      config:
        query: |
          SELECT balance, last_payment_at
          FROM customers
          WHERE id = $1
        params: ["${customer_id}"]
        poll:
          enabled: true
          timeout: 10s
          interval: 1s
      assert:
        - result.rows[0].last_payment_at exists

    # Step 6: Verify notification sent
    - id: verify_notification
      name: "Verify Payment Confirmation Email"
      action: database_query
      config:
        query: |
          SELECT * FROM notifications
          WHERE customer_id = $1
          AND type = 'payment_confirmation'
          AND payment_id = $2
        params:
          - "${customer_id}"
          - "${verify_payment_recorded.result.rows[0].id}"
        poll:
          enabled: true
          timeout: 20s
          interval: 2s
      assert:
        - result.count == 1
        - result.rows[0].status == "sent"
```

---

## 6. Error Handling Patterns

### Pattern: Timeout Handling

```yaml
- id: wait_with_timeout_handling
  name: "Wait for Job with Timeout Handling"
  action: database_query
  config:
    query: "SELECT * FROM jobs WHERE id = $1 AND status = 'completed'"
    params: ["${job_id}"]
    poll:
      enabled: true
      timeout: 30s
      interval: 2s

  # Continue even if timeout (don't fail flow)
  on_error: "continue"

  save:
    timed_out: "error.timeout"            # Will be true if timed out
    status: "result.rows[0].status"       # Will be null if timed out

# Handle timeout case
- id: handle_timeout
  when: "${wait_with_timeout_handling.timed_out} == true"
  action: log
  config:
    level: warn
    message: "Job did not complete within timeout"
```

### Pattern: Retry on Failure

```yaml
- id: consume_with_retry
  name: "Consume Message with Retry"
  action: kafka_consume
  config:
    brokers: ["${KAFKA_BROKERS}"]
    topic: "events"
    timeout: 5s
    match:
      key: "${expected_key}"

  # Retry if message not found
  retry:
    max_attempts: 3
    delay: 2s
    backoff: "exponential"                # 2s, 4s, 8s

  assert:
    - result.count > 0
```

---

## 7. Best Practices

### 1. Use Unique Consumer Groups

```yaml
# GOOD: Unique consumer group per test execution
group_id: "test-consumer-${EXECUTION_ID}"

# BAD: Reused consumer group (may miss messages)
group_id: "test-consumer"
```

### 2. Set Appropriate Timeouts

```yaml
# GOOD: Reasonable timeout based on expected latency
timeout: 10s                              # For fast async operations
timeout: 60s                              # For slower batch processing

# BAD: Too short or too long
timeout: 1s                               # Too short, may false-fail
timeout: 5m                               # Too long, slows down test suite
```

### 3. Use Specific Match Criteria

```yaml
# GOOD: Match on specific identifiers
match:
  key: "${user_id}"
  json_path:
    - "$.event_type == 'user.created'"
    - "$.user.email == '${expected_email}'"

# BAD: Too generic, may match wrong message
match:
  json_path:
    - "$.event_type == 'user.created'"   # Could match any user creation
```

### 4. Poll at Reasonable Intervals

```yaml
# GOOD: Balance between responsiveness and load
poll:
  interval: 1s                            # For fast operations
  interval: 5s                            # For slower operations

# BAD: Too frequent polling
poll:
  interval: 100ms                         # Creates excessive load
```

### 5. Handle Both Success and Failure Cases

```yaml
- id: verify_async_result
  action: database_query
  config:
    query: "SELECT status, error FROM jobs WHERE id = $1"
    params: ["${job_id}"]
    poll:
      enabled: true
      timeout: 60s
      interval: 2s

  save:
    status: "result.rows[0].status"
    error: "result.rows[0].error"

  # Don't assert only success - check terminal states
  assert:
    - result.count == 1
    - result.rows[0].status in ["completed", "failed"]  # Terminal state reached

# Then handle failure case
- id: handle_job_failure
  when: "${verify_async_result.status} == 'failed'"
  action: log
  config:
    level: error
    message: "Job failed: ${verify_async_result.error}"
```

---

## 8. Implementation Details

### Kafka Consumer Implementation

```go
type KafkaConsumeConfig struct {
    Brokers       []string
    Topic         string
    GroupID       string
    Timeout       time.Duration
    MaxMessages   int
    FromBeginning bool
    Match         *MatchConfig
}

type MatchConfig struct {
    Key      string
    JSONPath []string
}

func (h *KafkaConsumeHandler) Execute(config KafkaConsumeConfig) (*Result, error) {
    consumer := kafka.NewConsumer(config)
    defer consumer.Close()

    deadline := time.Now().Add(config.Timeout)
    messages := []kafka.Message{}

    for time.Now().Before(deadline) {
        msg, err := consumer.ReadMessage(1 * time.Second)
        if err != nil {
            continue  // Timeout, keep trying
        }

        // Check if message matches criteria
        if config.Match != nil {
            if !matchesKey(msg, config.Match.Key) {
                continue
            }
            if !matchesJSONPath(msg, config.Match.JSONPath) {
                continue
            }
        }

        messages = append(messages, msg)

        if len(messages) >= config.MaxMessages {
            break
        }
    }

    if len(messages) == 0 {
        return nil, fmt.Errorf("no messages found within timeout")
    }

    return &Result{Messages: messages}, nil
}
```

### Database Polling Implementation

```go
type DatabasePollConfig struct {
    Enabled  bool
    Timeout  time.Duration
    Interval time.Duration
}

func (h *DatabaseQueryHandler) Execute(config DatabaseQueryConfig) (*Result, error) {
    if !config.Poll.Enabled {
        // Simple query without polling
        return h.executeQuery(config)
    }

    // Polling logic
    deadline := time.Now().Add(config.Poll.Timeout)
    ticker := time.NewTicker(config.Poll.Interval)
    defer ticker.Stop()

    for {
        result, err := h.executeQuery(config)

        // Success - return result
        if err == nil && result.RowCount > 0 {
            return result, nil
        }

        // Timeout - return last error
        if time.Now().After(deadline) {
            return nil, fmt.Errorf("polling timeout after %v", config.Poll.Timeout)
        }

        // Wait for next poll
        <-ticker.C
    }
}
```

---

## 9. Testing Patterns Summary

| Pattern | Use Case | Timeout | Best For |
|---------|----------|---------|----------|
| **Kafka Consume** | Wait for event message | 5-30s | Event-driven systems |
| **Database Poll** | Wait for data to appear | 10-60s | Eventual consistency |
| **API Poll** | Wait for status change | 30s-5m | Long-running jobs |
| **Combined** | Full async flow | 30s-2m | Multi-service flows |

---

## 10. Common Scenarios

### Scenario 1: User Registration Flow
```
API (create user) → Kafka (user.created) → Email Service → DB (email_sent)
                                         → Analytics → DB (event logged)
```

### Scenario 2: Order Processing
```
API (create order) → Kafka (order.created) → Inventory Service → DB (reserved)
                                           → Payment Service → DB (charged)
                                           → Fulfillment → Kafka (order.shipped)
```

### Scenario 3: Data Pipeline
```
API (upload file) → S3 → Kafka (file.uploaded) → Processor → DB (records created)
                                                            → Kafka (processing.complete)
```

---

**Last Updated**: 2026-02-09
**Version**: 1.0
**Status**: Complete ✅

See also: [YAML_SCHEMA.md](./YAML_SCHEMA.md), [FLOW_DESIGN.md](./FLOW_DESIGN.md)
