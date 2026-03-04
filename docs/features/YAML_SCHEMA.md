# TestMesh Flow YAML Schema

> **Complete, precise YAML schema specification for TestMesh flows**

## Table of Contents
1. [Schema Overview](#schema-overview)
2. [Flow Structure](#flow-structure)
3. [Step Types](#step-types)
4. [Variable System](#variable-system)
5. [Assertions](#assertions)
6. [Control Flow](#control-flow)
7. [Error Handling](#error-handling)
8. [Complete Examples](#complete-examples)
9. [JSON Schema Definition](#json-schema-definition)
10. [Validation Rules](#validation-rules)

---

## Schema Overview

### Design Principles
1. **Human-readable** - Clear, intuitive YAML format
2. **Type-safe** - Strong typing with validation
3. **Composable** - Flows can call other flows
4. **Extensible** - Easy to add new action types
5. **IDE-friendly** - Schema enables autocomplete

### File Format
```yaml
# Single flow per file
flow:
  # Flow metadata
  name: string (required)
  description: string (optional)
  version: string (optional, default: "1.0")

  # Environment setup
  env: object (optional)

  # Setup/teardown
  setup: array<Step> (optional)
  teardown: array<Step> (optional)

  # Main flow steps
  steps: array<Step> (required, min: 1)

  # Configuration
  config: object (optional)
```

---

## Flow Structure

### Complete Flow Definition

```yaml
flow:
  # ============================================
  # METADATA
  # ============================================
  name: "User Registration Flow"              # Required, 1-255 chars
  description: "Complete user registration"   # Optional
  version: "1.0.0"                            # Optional, semver

  # Tags for organization and execution control
  tags:                                       # Optional
    - authentication
    - critical
    - smoke-test
    # See TAGGING_SYSTEM.md for complete tag documentation

  # Suite categorization
  suite: "user-management"                    # Optional

  # Author information
  author: "john@example.com"                  # Optional

  # ============================================
  # ENVIRONMENT VARIABLES
  # ============================================
  env:
    API_URL: "${API_BASE_URL}/v1"             # Can reference other vars
    DB_NAME: "users_test"
    TIMEOUT: "30s"

  # ============================================
  # SETUP (runs before steps)
  # ============================================
  setup:
    - id: create_test_db                      # Optional ID
      action: database_query
      config:
        query: "CREATE DATABASE IF NOT EXISTS ${DB_NAME}"

    - action: http_request
      config:
        method: GET
        url: "${API_URL}/health"
        assert:
          - status == 200

  # ============================================
  # MAIN STEPS
  # ============================================
  steps:
    - id: step_1                              # Required for referencing
      name: "Create User"                     # Optional, display name
      action: http_request                    # Required
      config:                                 # Action-specific config
        method: POST
        url: "${API_URL}/users"
        body:
          email: "user-${RANDOM_ID}@test.com"
          password: "SecurePass123!"
      output:                                 # Extract outputs
        user_id: "response.body.id"
        auth_token: "response.body.token"
      assert:                                 # Assertions
        - status == 201
        - response.body.id exists

    # More steps...

  # ============================================
  # TEARDOWN (runs after steps, even on failure)
  # ============================================
  teardown:
    - action: database_query
      config:
        query: "DROP DATABASE IF EXISTS ${DB_NAME}"

  # ============================================
  # FLOW CONFIGURATION
  # ============================================
  config:
    timeout: "5m"                             # Max flow duration
    fail_fast: true                           # Stop on first failure
    retry:
      enabled: true
      max_attempts: 3
      delay: "1s"
      backoff: "exponential"                  # linear|exponential|constant
```

---

## Step Types

### Base Step Structure

All steps share this common structure:

```yaml
- id: string                    # Required, unique within flow, [a-z0-9_-]+
  name: string                  # Optional, human-readable name
  description: string           # Optional, longer description
  action: string                # Required, action type

  # Action-specific configuration
  config: object                # Required, varies by action

  # Conditional execution
  when: string                  # Optional, boolean expression

  # Output extraction
  output: object                # Optional, key: JSONPath pairs

  # Assertions
  assert: array<Assertion>      # Optional, array of assertions

  # Error handling
  on_error: "continue"|"fail"   # Optional, default: "fail"

  # Retry configuration
  retry:                        # Optional
    max_attempts: number        # Default: 1
    delay: duration             # Default: "1s"
    backoff: string             # linear|exponential|constant
    retry_on:                   # Conditions for retry
      - status >= 500
      - timeout

  # Timeout
  timeout: duration             # Optional, default: "30s"

  # Metadata
  tags: array<string>           # Optional
  disabled: boolean             # Optional, default: false
```

### 1. HTTP Request

```yaml
- id: api_call
  action: http_request
  config:
    # Request details
    method: "GET"|"POST"|"PUT"|"PATCH"|"DELETE"|"HEAD"|"OPTIONS"
    url: string                           # Required, supports variables

    # Headers
    headers:                              # Optional
      Content-Type: "application/json"
      Authorization: "Bearer ${AUTH_TOKEN}"
      X-Custom-Header: "value"

    # Query parameters
    params:                               # Optional
      page: "1"
      limit: "10"
      filter: "active"

    # Request body (for POST, PUT, PATCH)
    body:                                 # Optional, JSON object or string
      key: "value"
      nested:
        data: "value"

    # Alternative: body as string (for non-JSON)
    # body: "raw text or XML"
    # body: |
    #   <xml>content</xml>

    # Authentication
    auth:                                 # Optional
      type: "basic"|"bearer"|"api_key"|"oauth2"

      # For basic auth:
      username: "${USERNAME}"
      password: "${PASSWORD}"

      # For bearer token:
      token: "${AUTH_TOKEN}"

      # For API key:
      key: "${API_KEY}"
      location: "header"|"query"          # Where to send key
      name: "X-API-Key"                   # Header/param name

    # Follow redirects
    follow_redirects: boolean             # Default: true
    max_redirects: number                 # Default: 10

    # SSL/TLS
    verify_ssl: boolean                   # Default: true
    client_cert: string                   # Path to client cert
    client_key: string                    # Path to client key

    # Cookies
    cookies:                              # Optional
      session_id: "abc123"
      preference: "dark_mode"

    # Timeout
    timeout: duration                     # Request timeout

  # Output extraction
  output:
    status_code: "response.status"
    user_id: "response.body.id"
    headers: "response.headers"
    cookies: "response.cookies"

  # Assertions
  assert:
    - status == 200
    - response.body.id exists
    - response.headers["Content-Type"] contains "json"
    - response.time < 1000                # Response time in ms
```

### 2. Database Query

```yaml
- id: db_query
  action: database_query
  config:
    # Database connection
    connection:                           # Optional, uses default if not specified
      type: "postgresql"|"mysql"|"mongodb"
      host: "localhost"
      port: 5432
      database: "testdb"
      username: "${DB_USER}"
      password: "${DB_PASS}"

      # Optional connection params
      ssl: boolean
      timeout: duration
      pool_size: number

    # Query
    query: string                         # Required, SQL or MongoDB query

    # Parameterized query (recommended)
    params: array                         # Optional, positional parameters

    # Named parameters (alternative)
    named_params:                         # Optional
      user_id: "${user_id}"
      status: "active"

    # Transaction support
    transaction: boolean                  # Default: false

    # Polling/Wait configuration (for eventual consistency)
    poll:                                 # Optional
      enabled: boolean                    # Enable polling (default: false)
      timeout: duration                   # Max time to wait (e.g., "30s", "2m")
      interval: duration                  # Poll interval (default: "1s")

  # Output extraction
  output:
    rows: "result.rows"                   # All rows
    row_count: "result.count"
    first_row: "result.rows[0]"
    user_email: "result.rows[0].email"

  # Assertions
  assert:
    - result.count > 0
    - result.rows[0].email exists
    - result.rows[0].status == "active"
```

**Examples**:

```yaml
# PostgreSQL SELECT
- id: get_user
  action: database_query
  config:
    query: "SELECT * FROM users WHERE id = ?"
    params: ["${user_id}"]

# PostgreSQL INSERT
- id: create_record
  action: database_query
  config:
    query: |
      INSERT INTO logs (user_id, action, timestamp)
      VALUES (?, ?, NOW())
      RETURNING id
    params:
      - "${user_id}"
      - "login"
  output:
    log_id: "result.rows[0].id"

# MongoDB query
- id: mongo_find
  action: database_query
  config:
    connection:
      type: mongodb
      database: "mydb"
    query: |
      {
        "collection": "users",
        "operation": "find",
        "filter": { "status": "active" },
        "limit": 10
      }
```

### 3. Kafka Message

```yaml
# Kafka Publish
- id: publish_event
  action: kafka_publish
  config:
    # Connection
    brokers:                              # Required
      - "localhost:9092"
      - "localhost:9093"

    # Topic
    topic: string                         # Required

    # Message
    key: string                           # Optional, for partitioning
    value: object|string                  # Required, message payload

    # Headers
    headers:                              # Optional
      correlation-id: "${CORRELATION_ID}"
      source: "testmesh"

    # Partition (optional, otherwise uses key hash)
    partition: number

    # Compression
    compression: "none"|"gzip"|"snappy"|"lz4"

    # SASL authentication
    sasl:                                 # Optional
      mechanism: "PLAIN"|"SCRAM-SHA-256"|"SCRAM-SHA-512"
      username: "${KAFKA_USER}"
      password: "${KAFKA_PASS}"

  output:
    offset: "result.offset"
    partition: "result.partition"

# Kafka Consume (with timeout and filtering)
- id: consume_event
  action: kafka_consume
  config:
    brokers:
      - "localhost:9092"

    topic: string                         # Required

    # Consumer group (use unique per test execution)
    group_id: string                      # Required, e.g., "test-${EXECUTION_ID}"

    # Consume options
    timeout: duration                     # How long to wait for message (e.g., "10s", "1m")
    max_messages: number                  # Max messages to consume (default: 1)

    # Offset
    from_beginning: boolean               # Start from beginning (default: false)

    # Match/Filter (wait for specific message)
    match:                                # Optional, wait for message matching criteria
      key: string                         # Message key equals this value
      json_path:                          # JSONPath conditions (all must match)
        - "$.event_type == 'user.created'"
        - "$.user.id == '${user_id}'"

    # Alternative: Simple filter (returns first matching)
    filter:                               # Only return messages matching
      key: "expected_key"
      header:
        correlation-id: "${CORRELATION_ID}"

  output:
    messages: "result.messages"
    message_count: "result.count"
    first_message: "result.messages[0].value"

  assert:
    - result.count > 0
    - result.messages[0].value.event_type == "user.created"
```

### 4. gRPC Call

```yaml
- id: grpc_call
  action: grpc_call
  config:
    # Service
    address: "localhost:50051"            # Required
    service: "UserService"                # Required, service name
    method: "GetUser"                     # Required, method name

    # Proto file (for reflection, optional)
    proto_file: "./protos/user.proto"

    # Request
    request:                              # Required, message fields
      id: "${user_id}"
      include_metadata: true

    # Metadata (headers)
    metadata:                             # Optional
      authorization: "Bearer ${TOKEN}"
      request-id: "${REQUEST_ID}"

    # TLS
    tls:                                  # Optional
      enabled: boolean
      cert: string
      key: string
      ca: string

    # Timeout
    timeout: duration

  output:
    response: "result.response"
    status: "result.status"

  assert:
    - result.status == "OK"
    - result.response.id == "${user_id}"

# Streaming gRPC
- id: grpc_stream
  action: grpc_stream
  config:
    address: "localhost:50051"
    service: "ChatService"
    method: "StreamMessages"

    # Stream type
    type: "client"|"server"|"bidirectional"

    # Messages to send (for client/bidirectional)
    messages:
      - text: "Hello"
      - text: "World"

    # Max messages to receive (for server/bidirectional)
    max_receive: number

    timeout: duration

  output:
    received_messages: "result.messages"
```

### 5. WebSocket

```yaml
- id: websocket_test
  action: websocket
  config:
    # Connection
    url: "ws://localhost:5016/chat"       # Required

    # Subprotocols
    protocols:                            # Optional
      - "chat"
      - "v1"

    # Headers
    headers:                              # Optional
      Authorization: "Bearer ${TOKEN}"

    # Actions
    actions:                              # Required, array of actions
      - type: "connect"
        timeout: "5s"

      - type: "send"
        message:                          # JSON or string
          type: "subscribe"
          channel: "user-${user_id}"

      - type: "wait_for"
        message:                          # Expected message (pattern)
          type: "subscribed"
        timeout: "10s"

      - type: "send"
        message: "ping"

      - type: "receive"
        timeout: "5s"

      - type: "close"

  output:
    received_messages: "result.messages"

  assert:
    - result.messages.length > 0
    - result.messages[0].type == "subscribed"
```

### 6. Browser Automation

```yaml
- id: browser_test
  action: browser
  config:
    # Browser settings
    browser: "chromium"|"firefox"|"webkit"  # Default: chromium
    headless: boolean                       # Default: true

    # Viewport
    viewport:
      width: 1920
      height: 1080

    # Device emulation (optional)
    device: "iPhone 13"|"Pixel 5"|"iPad Pro"  # Predefined devices

    # Actions
    actions:
      - type: "navigate"
        url: "https://app.example.com/login"

      - type: "wait_for_selector"
        selector: "#email"
        timeout: "5s"

      - type: "fill"
        selector: "#email"
        value: "user@example.com"

      - type: "fill"
        selector: "#password"
        value: "SecurePass123!"

      - type: "click"
        selector: "button[type='submit']"

      - type: "wait_for_navigation"
        timeout: "10s"

      - type: "wait_for_selector"
        selector: ".dashboard"

      - type: "screenshot"
        path: "dashboard.png"
        full_page: boolean                  # Default: false

      - type: "assert_text"
        selector: ".user-name"
        text: "John Doe"

      - type: "assert_visible"
        selector: ".logout-button"

    # Network interception (optional)
    intercept:
      enabled: boolean
      patterns:
        - "*/api/*"

  output:
    screenshot: "result.screenshots[0]"
    requests: "result.network.requests"

  assert:
    - result.screenshots.length > 0
```

**Browser Action Types**:
```yaml
# Navigation
- type: "navigate"
  url: string

- type: "go_back"
- type: "go_forward"
- type: "reload"

# Selectors & Waiting
- type: "wait_for_selector"
  selector: string
  state: "attached"|"detached"|"visible"|"hidden"  # Default: visible
  timeout: duration

- type: "wait_for_url"
  url: string|regex
  timeout: duration

- type: "wait_for_navigation"
  timeout: duration

# Interactions
- type: "click"
  selector: string
  button: "left"|"right"|"middle"                  # Default: left
  click_count: number                              # Default: 1

- type: "fill"
  selector: string
  value: string

- type: "type"                                     # Types character by character
  selector: string
  text: string
  delay: duration                                  # Delay between keypresses

- type: "press"                                    # Press keyboard key
  key: "Enter"|"Tab"|"Escape"|...

- type: "check"                                    # Check checkbox
  selector: string

- type: "uncheck"
  selector: string

- type: "select"                                   # Select dropdown option
  selector: string
  value: string

- type: "hover"
  selector: string

- type: "focus"
  selector: string

- type: "drag"
  from: string                                     # Source selector
  to: string                                       # Target selector

# Content
- type: "get_text"
  selector: string
  save_as: string                                  # Variable name

- type: "get_attribute"
  selector: string
  attribute: string
  save_as: string

- type: "evaluate"                                 # Run JavaScript
  script: string
  save_as: string

# Assertions
- type: "assert_text"
  selector: string
  text: string
  mode: "equals"|"contains"|"regex"                # Default: contains

- type: "assert_visible"
  selector: string

- type: "assert_hidden"
  selector: string

- type: "assert_count"
  selector: string
  count: number

- type: "assert_url"
  url: string|regex

# Screenshots & Video
- type: "screenshot"
  path: string
  full_page: boolean
  selector: string                                 # Screenshot specific element

- type: "start_video"
  path: string

- type: "stop_video"
```

### 7. Wait/Poll

```yaml
- id: wait_for_job
  action: wait_until
  config:
    # Condition to wait for
    condition: "${check_status.status} == 'completed'"

    # Max duration to wait
    max_duration: "5m"                    # Required

    # Poll interval
    interval: "5s"                        # Default: "1s"

    # Steps to execute on each poll
    steps:                                # Required
      - id: check_status
        action: http_request
        config:
          method: GET
          url: "${API_URL}/jobs/${job_id}"
        output:
          status: "response.body.status"
          progress: "response.body.progress"

    # On timeout
    on_timeout: "fail"|"continue"         # Default: fail

  assert:
    - "${check_status.status}" == "completed"
```

### 8. Transform Data

```yaml
- id: transform
  action: transform
  config:
    # Input data (Option 1: inline)
    input: "${previous_step.output}"

    # Input data (Option 2: from file)
    input_file: string                    # Path to JSON/YAML file

    # Transformations
    operations:
      # Extract field
      - type: "extract"
        path: "user.profile"
        save_as: "profile"

      # Map array
      - type: "map"
        array: "users"
        transform:
          id: "item.id"
          name: "item.full_name"
        save_as: "mapped_users"

      # Filter array
      - type: "filter"
        array: "users"
        condition: "item.status == 'active'"
        save_as: "active_users"

      # Join strings
      - type: "join"
        array: "names"
        separator: ", "
        save_as: "joined_names"

      # Format string
      - type: "format"
        template: "User ${id} has email ${email}"
        variables:
          id: "${user.id}"
          email: "${user.email}"
        save_as: "formatted"

  output:
    result: "result"
```

### 9. Assert Step

```yaml
- id: verify_conditions
  action: assert
  config:
    assertions:
      - expression: "${user_id} exists"
        message: "User ID is required"

      - expression: "${status_code} == 200"
        message: "Expected status 200"

      - expression: "${response_time} < 1000"
        message: "Response too slow"
```

### 10. Log Message

```yaml
- id: log_info
  action: log
  config:
    level: "debug"|"info"|"warn"|"error"  # Default: info
    message: string                       # Required
    data: object                          # Optional, additional data
```

### 11. Delay

```yaml
- id: wait_5_seconds
  action: delay
  config:
    duration: "5s"                        # Required
```

### 12. Sub-flow

```yaml
- id: run_subflow
  action: run_flow
  config:
    # Flow to run
    flow: "validate-cart-flow"            # Required, flow name or ID

    # Input variables to pass (Option 1: inline object)
    input:                                # Optional
      cart_id: "${cart_id}"
      user_id: "${user_id}"

    # Input variables to pass (Option 2: from file)
    input_file: string                    # Optional, path to JSON/YAML file

    # Inherit environment variables
    inherit_env: boolean                  # Default: true

  # Extract outputs from sub-flow
  output:
    total_amount: "flow.output.total"
    item_count: "flow.output.count"

  assert:
    - flow.status == "success"
```

### 13. Mock Server

```yaml
# Start Mock Server
- id: start_mock
  action: mock_server_start
  config:
    # Server configuration
    name: string                          # Optional, unique server name
    port: number                          # Required, port to listen on

    # Option 1: Inline endpoint definitions
    endpoints:                            # Array of endpoint definitions
      - path: string                      # Required, e.g., "/api/users/:id"
        method: string                    # Required, GET|POST|PUT|DELETE|PATCH
        priority: number                  # Optional, lower = higher priority

        # Request matching
        match:                            # Optional, additional match criteria
          query:                          # Query parameter matches
            status: "active"
          headers:                        # Header matches
            Authorization: "Bearer token"
          body:                           # Exact body match
            key: "value"
          body_matches:                   # JSONPath conditions
            - "$.email contains '@example.com'"
            - "$.age >= 18"

        # Single response
        response:                         # Response configuration
          status: number                  # HTTP status code (default: 200)
          headers:                        # Response headers
            Content-Type: "application/json"
          body: object|string             # Response body
          body_from_file: string          # Load body from file
          delay: duration                 # Response delay
          hang: boolean                   # Never respond (timeout simulation)
          close_connection: boolean       # Close connection immediately

          # State changes (for stateful mocking)
          state_changes:                  # Optional, array of state updates
            - action: "set"|"append"|"increment"
              path: string                # State path
              value: any                  # New value

        # Multiple conditional responses
        responses:                        # Alternative to single response
          - when: string                  # Condition expression
            status: number
            body: object

    # Option 2: Load from file
    from_file: string                     # Path to mock config file

    # Proxy mode (optional)
    proxy:
      target: string                      # Target URL to proxy
      pass_through: boolean               # Proxy by default (default: false)

    # Recording mode (optional)
    mode: "mock"|"record"|"playback"      # Default: "mock"
    save_to: string                       # File to save recorded responses

    # Initial state (for stateful mocks)
    state:                                # Optional
      key: value

    # Chaos engineering (optional)
    chaos:
      enabled: boolean                    # Enable chaos mode
      rules:                              # Chaos rules
        - probability: number             # 0.0-1.0
          response:
            status: number
            delay: duration

  output:
    base_url: "$.base_url"                # Server base URL
    server_id: "$.server_id"              # Server ID for later reference

# Stop Mock Server
- id: stop_mock
  action: mock_server_stop
  config:
    server: string                        # Server name or ID

# Verify Mock Requests
- id: verify_mock
  action: mock_server_verify
  config:
    server: string                        # Server name or ID
    assertions:                           # Array of request assertions
      - path: string                      # Endpoint path
        method: string                    # HTTP method
        count: number                     # Exact request count
        count_min: number                 # Minimum requests
        count_max: number                 # Maximum requests
        body_matches:                     # JSONPath conditions
          - "$.amount > 0"
        headers:                          # Expected headers
          Authorization: "Bearer token"

# Reset Mock State
- id: reset_mock
  action: mock_server_reset_state
  config:
    server: string                        # Server name or ID
    state:                                # New state
      key: value

# Update Mock Endpoint (dynamic)
- id: update_mock
  action: mock_server_update
  config:
    server: string                        # Server name or ID
    endpoint:                             # Endpoint to add/update
      path: string
      method: string
      response:
        status: number
        body: object
```

**Examples**:

```yaml
# Simple mock with inline config
- id: start_api_mock
  action: mock_server_start
  config:
    port: 5016
    endpoints:
      - path: /api/users/:id
        method: GET
        response:
          status: 200
          body:
            id: "{{path.id}}"
            name: "User {{path.id}}"

      - path: /api/users
        method: POST
        response:
          status: 201
          body:
            id: "{{random.uuid}}"
            created_at: "{{timestamp}}"

# Load from external file
- id: start_payment_mock
  action: mock_server_start
  config:
    from_file: "mocks/payment-gateway.yaml"
  output:
    payment_url: "$.base_url"

# Stateful mock
- id: start_stateful_mock
  action: mock_server_start
  config:
    port: 9000
    state:
      users: []
      next_id: 1
    endpoints:
      - path: /api/users
        method: POST
        response:
          status: 201
          body:
            id: "{{state.next_id}}"
          state_changes:
            - action: append
              path: users
              value:
                id: "{{state.next_id}}"
            - action: increment
              path: next_id

      - path: /api/users
        method: GET
        response:
          status: 200
          body:
            users: "{{state.users}}"
```

---

## Variable System

### Variable Types

```yaml
# 1. Environment Variables (defined in flow.env)
env:
  API_URL: "http://localhost:3000"
  DB_NAME: "testdb"

# 2. System Variables (built-in)
# ${FLOW_ID}              - Current flow ID
# ${FLOW_NAME}            - Current flow name
# ${EXECUTION_ID}         - Current execution ID
# ${TIMESTAMP}            - Current timestamp (ISO 8601)
# ${TIMESTAMP_UNIX}       - Unix timestamp
# ${RANDOM_ID}            - Random UUID
# ${RANDOM_INT}           - Random integer (0-999999)
# ${RANDOM_STRING}        - Random alphanumeric string (16 chars)

# 3. Faker Variables (realistic test data)
# ${FAKER.name.firstName}           - "John"
# ${FAKER.name.lastName}            - "Doe"
# ${FAKER.name.fullName}            - "John Doe"
# ${FAKER.internet.email}           - "john.doe@example.com"
# ${FAKER.internet.userName}        - "john.doe123"
# ${FAKER.phone.phoneNumber}        - "+1-555-123-4567"
# ${FAKER.address.streetAddress}    - "123 Main St"
# ${FAKER.address.city}             - "San Francisco"
# ${FAKER.company.companyName}      - "Acme Corp"
# ${FAKER.commerce.productName}     - "Ergonomic Keyboard"
# ${FAKER.commerce.price}           - "49.99"
# ${FAKER.datatype.uuid}            - UUID
# ${FAKER.datatype.boolean}         - true/false
# ... and 100+ more functions
# See DATA_GENERATION.md for complete list

# 4. Step Outputs (from previous steps)
# ${step_id.output_name}
# ${create_user.user_id}
# ${api_call.response.body.data[0].id}

# 5. Special Variables
# ${request.body}         - Request body of current step
# ${response.body}        - Response body of current step
# ${response.status}      - Response status code
# ${response.headers}     - Response headers
# ${result}               - Generic result object
```

### Variable Interpolation

```yaml
# Simple interpolation
url: "${API_URL}/users"

# Nested interpolation
url: "${API_URL}/users/${user_id}/posts/${post_id}"

# Default values
url: "${API_URL:http://localhost:3000}/users"

# Conditional
message: "${status == 200 ? 'Success' : 'Failed'}"

# JSONPath expressions (for complex data)
user_email: "${api_response.body.data.users[0].email}"

# Concatenation
full_name: "${first_name} ${last_name}"

# Arithmetic (simple)
next_page: "${current_page + 1}"

# String functions
uppercase_name: "${name.upper()}"
lowercase_email: "${email.lower()}"
```

### JSONPath Syntax

```yaml
# Access object property
"$.user.name"
"response.body.data.id"

# Array access
"$.users[0]"              # First element
"$.users[-1]"             # Last element
"$.users[0:3]"            # Slice (elements 0-2)

# Filter
"$.users[?(@.status == 'active')]"          # Active users
"$.products[?(@.price < 100)]"              # Products under $100

# Recursive descent
"$..email"                                  # All email fields at any level

# Multiple selections
"$.users[*].id"                             # All user IDs

# Functions
"$.users.length"                            # Array length
"$.prices.sum()"                            # Sum of array
"$.prices.avg()"                            # Average
"$.prices.min()"                            # Minimum
"$.prices.max()"                            # Maximum
```

---

## Assertions

### Assertion Syntax

```yaml
assert:
  # Simple equality
  - status == 200
  - name == "John Doe"

  # Inequality
  - status != 404
  - count > 0
  - price < 100
  - age >= 18
  - score <= 100

  # Existence
  - id exists
  - user.email exists
  - response.body.data exists

  # Null checks
  - deleted_at is null
  - error is not null

  # Type checks
  - id is number
  - name is string
  - active is boolean
  - tags is array
  - metadata is object

  # String operations
  - email contains "@"
  - url starts_with "https://"
  - filename ends_with ".pdf"
  - content matches "\\d{3}-\\d{4}"          # Regex

  # Array operations
  - tags contains "important"
  - users.length == 10
  - prices.length > 0

  # Boolean logic
  - status == 200 && body exists
  - status == 200 || status == 201
  - !(status >= 400)

  # Complex expressions
  - (status == 200 || status == 201) && response.body.id exists

  # JSONPath assertions
  - "$.users[?(@.status == 'active')].length > 0"

  # Time/Duration
  - response_time < 1000                     # milliseconds
  - created_at > "2024-01-01T00:00:00Z"
```

### Assertion with Custom Messages

```yaml
assert:
  - expression: "status == 200"
    message: "Expected successful response"

  - expression: "response.body.id exists"
    message: "Response must include user ID"

  - expression: "response_time < 1000"
    message: "Response time must be under 1 second (was ${response_time}ms)"
```

### Assertion Modes

```yaml
# Default: All assertions must pass
assert:
  - status == 200
  - body exists

# Alternative: At least one must pass
assert_any:
  - status == 200
  - status == 201

# Assert none should be true (negative assertions)
assert_none:
  - status >= 400
  - error exists
```

---

## Control Flow

### 1. Conditional Execution (If/Else)

```yaml
# Simple condition
- id: conditional_step
  action: http_request
  when: "${previous_step.status} == 200"
  config:
    method: GET
    url: "${API_URL}/next"

# If/Else pattern using two steps
- id: check_status
  action: http_request
  config:
    method: GET
    url: "${API_URL}/status"
  output:
    is_ready: "response.body.ready"

- id: handle_ready
  when: "${check_status.is_ready} == true"
  action: http_request
  config:
    method: POST
    url: "${API_URL}/process"

- id: handle_not_ready
  when: "${check_status.is_ready} == false"
  action: log
  config:
    level: warn
    message: "Service not ready"

# Conditional branching node
- id: conditional_branch
  action: condition
  config:
    condition: "${response.status} == 200"
    then:
      - id: success_path
        action: http_request
        config:
          method: POST
          url: "${API_URL}/success"

      - id: log_success
        action: log
        config:
          message: "Processing succeeded"

    else:
      - id: error_path
        action: http_request
        config:
          method: POST
          url: "${API_URL}/error"

      - id: log_error
        action: log
        config:
          level: error
          message: "Processing failed: ${response.body.error}"
```

### 2. Loops (For Each)

```yaml
# Loop over array
- id: get_users
  action: http_request
  config:
    method: GET
    url: "${API_URL}/users"
  output:
    users: "response.body.users"

- id: process_each_user
  action: for_each
  config:
    # Option 1: Items from variable/expression
    items: "${get_users.users}"              # Array to iterate

    # Option 2: Items from glob pattern
    items_from_glob: "data/*.json"           # Glob pattern to match files

    item_name: "user"                        # Variable name for current item

    # Steps to run for each item
    steps:
      - id: update_user
        action: http_request
        config:
          method: PUT
          url: "${API_URL}/users/${user.id}"
          body:
            last_processed: "${TIMESTAMP}"
        assert:
          - status == 200

      - id: log_processed
        action: log
        config:
          message: "Processed user ${user.id}"

    # Loop configuration
    max_iterations: 100                      # Optional, safety limit
    continue_on_error: true                  # Continue if iteration fails
    parallel: false                          # Run sequentially (default)

# Loop with index
- id: loop_with_index
  action: for_each
  config:
    items: "${items}"
    item_name: "item"
    index_name: "index"                      # Optional, provides index

    steps:
      - action: log
        config:
          message: "Processing item ${index}: ${item.name}"

# Loop with range
- id: loop_range
  action: for_each
  config:
    range:
      start: 1
      end: 10
      step: 1
    item_name: "number"

    steps:
      - action: http_request
        config:
          method: GET
          url: "${API_URL}/page/${number}"

# Loop over files matching glob pattern
- id: process_test_files
  action: for_each
  config:
    items_from_glob: "data/*.json"           # Process all JSON files
    item_name: "file_path"

    steps:
      - action: run_flow
        config:
          flow: "test-template"
          input_file: "${file_path}"
```

### 3. Parallel Execution

```yaml
- id: parallel_requests
  action: parallel
  config:
    # Steps to run in parallel
    steps:
      - id: fetch_users
        action: http_request
        config:
          method: GET
          url: "${API_URL}/users"

      - id: fetch_posts
        action: http_request
        config:
          method: GET
          url: "${API_URL}/posts"

      - id: fetch_comments
        action: http_request
        config:
          method: GET
          url: "${API_URL}/comments"

    # Parallel configuration
    wait_for_all: true                       # Wait for all to complete
    fail_fast: false                         # Don't stop on first failure
    max_concurrent: 3                        # Limit concurrent execution

  # Outputs are available as map
  output:
    users: "parallel_requests.fetch_users.response.body"
    posts: "parallel_requests.fetch_posts.response.body"
    comments: "parallel_requests.fetch_comments.response.body"

  # Assert all succeeded
  assert:
    - fetch_users.status == 200
    - fetch_posts.status == 200
    - fetch_comments.status == 200
```

### 4. Try/Catch Pattern

```yaml
- id: try_operation
  action: http_request
  config:
    method: POST
    url: "${API_URL}/risky-operation"
  on_error: "continue"                       # Don't fail flow
  output:
    operation_status: "response.status"
    operation_error: "error.message"

- id: handle_error
  when: "${try_operation.operation_status} >= 400"
  action: http_request
  config:
    method: POST
    url: "${WEBHOOK_URL}/alert"
    body:
      error: "${try_operation.operation_error}"
      timestamp: "${TIMESTAMP}"
```

### 5. Switch/Case Pattern

```yaml
- id: get_status
  action: http_request
  config:
    method: GET
    url: "${API_URL}/status"
  output:
    status: "response.body.status"

# Handle "pending"
- id: handle_pending
  when: "${get_status.status} == 'pending'"
  action: log
  config:
    message: "Status is pending"

# Handle "processing"
- id: handle_processing
  when: "${get_status.status} == 'processing'"
  action: log
  config:
    message: "Status is processing"

# Handle "completed"
- id: handle_completed
  when: "${get_status.status} == 'completed'"
  action: http_request
  config:
    method: POST
    url: "${API_URL}/finalize"

# Handle default/unknown
- id: handle_unknown
  when: "${get_status.status} not in ['pending', 'processing', 'completed']"
  action: log
  config:
    level: error
    message: "Unknown status: ${get_status.status}"
```

---

## Error Handling

### Step-Level Error Handling

```yaml
- id: risky_operation
  action: http_request
  config:
    method: POST
    url: "${API_URL}/operation"

  # Error handling
  on_error: "continue"|"fail"|"retry"        # Default: fail

  # Retry configuration
  retry:
    max_attempts: 3
    delay: "1s"
    backoff: "exponential"                   # Delay: 1s, 2s, 4s

    # Retry only on specific conditions
    retry_on:
      - "status >= 500"                      # Server errors
      - "timeout"                            # Timeout errors
      - "connection_error"                   # Connection failures

    # Don't retry on these
    retry_on_not:
      - "status == 401"                      # Auth errors
      - "status == 403"                      # Forbidden
```

### Error Steps

```yaml
- id: main_operation
  action: http_request
  config:
    method: POST
    url: "${API_URL}/process"
  on_error: "continue"

  # Steps to run on error (only if this step fails)
  error_steps:
    - id: log_error
      action: log
      config:
        level: error
        message: "Operation failed: ${error.message}"
        data:
          status: "${response.status}"
          body: "${response.body}"

    - id: send_alert
      action: http_request
      config:
        method: POST
        url: "${ALERT_WEBHOOK}"
        body:
          error: "${error.message}"
          flow: "${FLOW_NAME}"
          execution: "${EXECUTION_ID}"
```

### Flow-Level Error Handling

```yaml
flow:
  name: "Flow with Error Handling"

  steps:
    - id: step1
      action: http_request
      config:
        method: GET
        url: "${API_URL}/data"

  # Flow-level error handler (runs if any step fails)
  on_error:
    - id: cleanup
      action: database_query
      config:
        query: "DELETE FROM temp_data WHERE execution_id = '${EXECUTION_ID}'"

    - id: notify_failure
      action: http_request
      config:
        method: POST
        url: "${SLACK_WEBHOOK}"
        body:
          text: "Flow ${FLOW_NAME} failed at step ${failed_step.id}"
```

### Timeout Handling

```yaml
- id: long_operation
  action: http_request
  config:
    method: GET
    url: "${API_URL}/long-operation"

  timeout: "60s"

  # What to do on timeout
  on_timeout:
    - id: log_timeout
      action: log
      config:
        level: warn
        message: "Operation timed out after 60s"

    - id: cancel_operation
      action: http_request
      config:
        method: DELETE
        url: "${API_URL}/long-operation/${operation_id}"
```

---

## Complete Examples

### Example 1: User Registration & Verification

```yaml
flow:
  name: "User Registration and Email Verification"
  description: "Complete user registration flow with email verification"
  version: "1.0.0"

  tags:
    - authentication
    - critical
    - smoke-test

  suite: "user-management"

  env:
    API_URL: "${API_BASE_URL}/v1"
    EMAIL_FROM: "noreply@example.com"

  setup:
    - id: check_api_health
      action: http_request
      config:
        method: GET
        url: "${API_URL}/health"
        assert:
          - status == 200

  steps:
    # Step 1: Create user account
    - id: create_user
      name: "Create User Account"
      action: http_request
      config:
        method: POST
        url: "${API_URL}/users"
        headers:
          Content-Type: "application/json"
        body:
          email: "test-${RANDOM_ID}@example.com"
          password: "SecurePass123!"
          first_name: "Test"
          last_name: "User"
      output:
        user_id: "response.body.id"
        user_email: "response.body.email"
        auth_token: "response.body.token"
      assert:
        - status == 201
        - response.body.id exists
        - response.body.email exists
        - response.body.token exists
      retry:
        max_attempts: 3
        delay: "1s"
        backoff: "exponential"
        retry_on:
          - "status >= 500"

    # Step 2: Verify user exists in database
    - id: verify_user_in_db
      name: "Verify User in Database"
      action: database_query
      config:
        query: "SELECT * FROM users WHERE id = ?"
        params: ["${create_user.user_id}"]
      output:
        db_user: "result.rows[0]"
      assert:
        - result.count == 1
        - result.rows[0].email == "${create_user.user_email}"
        - result.rows[0].email_verified == false

    # Step 3: Check email was sent
    - id: verify_email_sent
      name: "Verify Verification Email Sent"
      action: database_query
      config:
        query: |
          SELECT * FROM email_queue
          WHERE recipient = ?
          AND subject LIKE '%verification%'
          ORDER BY created_at DESC
          LIMIT 1
        params: ["${create_user.user_email}"]
      output:
        verification_token: "result.rows[0].verification_token"
      assert:
        - result.count == 1
        - result.rows[0].status == "sent"

    # Step 4: Verify email token
    - id: verify_email
      name: "Verify Email with Token"
      action: http_request
      config:
        method: POST
        url: "${API_URL}/users/verify-email"
        body:
          token: "${verify_email_sent.verification_token}"
      assert:
        - status == 200
        - response.body.email_verified == true

    # Step 5: Confirm email verified in database
    - id: confirm_email_verified
      name: "Confirm Email Verified in Database"
      action: database_query
      config:
        query: "SELECT email_verified, verified_at FROM users WHERE id = ?"
        params: ["${create_user.user_id}"]
      assert:
        - result.rows[0].email_verified == true
        - result.rows[0].verified_at exists

    # Step 6: Login with verified account
    - id: login_verified_user
      name: "Login with Verified Account"
      action: http_request
      config:
        method: POST
        url: "${API_URL}/auth/login"
        body:
          email: "${create_user.user_email}"
          password: "SecurePass123!"
      output:
        login_token: "response.body.token"
      assert:
        - status == 200
        - response.body.token exists
        - response.body.user.email_verified == true

  teardown:
    - id: cleanup_test_user
      name: "Delete Test User"
      action: database_query
      config:
        query: "DELETE FROM users WHERE id = ?"
        params: ["${create_user.user_id}"]

    - id: cleanup_emails
      name: "Delete Test Emails"
      action: database_query
      config:
        query: "DELETE FROM email_queue WHERE recipient = ?"
        params: ["${create_user.user_email}"]

  config:
    timeout: "5m"
    fail_fast: true
```

### Example 2: E-commerce Checkout Flow

```yaml
flow:
  name: "E-commerce Checkout Flow"
  description: "Complete checkout process from cart to order confirmation"
  version: "1.0.0"

  tags:
    - ecommerce
    - critical
    - payment

  suite: "checkout"

  env:
    API_URL: "${API_BASE_URL}/v1"
    PAYMENT_GATEWAY_URL: "${PAYMENT_GATEWAY_BASE_URL}"

  steps:
    # Step 1: Create cart and add items
    - id: create_cart
      name: "Create Shopping Cart"
      action: http_request
      config:
        method: POST
        url: "${API_URL}/carts"
        headers:
          Authorization: "Bearer ${USER_TOKEN}"
      output:
        cart_id: "response.body.id"
      assert:
        - status == 201

    - id: add_items_to_cart
      name: "Add Items to Cart"
      action: for_each
      config:
        items:
          - { product_id: "prod_1", quantity: 2, price: 29.99 }
          - { product_id: "prod_2", quantity: 1, price: 49.99 }
          - { product_id: "prod_3", quantity: 3, price: 15.99 }
        item_name: "item"

        steps:
          - id: add_item
            action: http_request
            config:
              method: POST
              url: "${API_URL}/carts/${create_cart.cart_id}/items"
              headers:
                Authorization: "Bearer ${USER_TOKEN}"
              body:
                product_id: "${item.product_id}"
                quantity: "${item.quantity}"
            assert:
              - status == 201

    # Step 2: Validate cart
    - id: run_cart_validation
      name: "Run Cart Validation Sub-flow"
      action: run_flow
      config:
        flow: "validate-cart"
        input:
          cart_id: "${create_cart.cart_id}"
          user_token: "${USER_TOKEN}"
      output:
        is_valid: "flow.output.is_valid"
        total_amount: "flow.output.total_amount"
        item_count: "flow.output.item_count"
      assert:
        - flow.status == "success"
        - is_valid == true

    # Step 3: Apply discount code
    - id: apply_discount
      name: "Apply Discount Code"
      action: http_request
      config:
        method: POST
        url: "${API_URL}/carts/${create_cart.cart_id}/discount"
        headers:
          Authorization: "Bearer ${USER_TOKEN}"
        body:
          code: "SAVE20"
      output:
        discount_amount: "response.body.discount_amount"
        final_total: "response.body.total"
      assert:
        - status == 200
        - discount_amount > 0

    # Step 4: Process payment
    - id: create_payment_intent
      name: "Create Payment Intent"
      action: http_request
      config:
        method: POST
        url: "${PAYMENT_GATEWAY_URL}/payment-intents"
        headers:
          Authorization: "Bearer ${PAYMENT_API_KEY}"
        body:
          amount: "${apply_discount.final_total}"
          currency: "USD"
          payment_method: "card"
      output:
        payment_intent_id: "response.body.id"
        client_secret: "response.body.client_secret"
      assert:
        - status == 201
      retry:
        max_attempts: 3
        delay: "2s"
        backoff: "exponential"
        retry_on:
          - "status >= 500"
          - "timeout"

    - id: confirm_payment
      name: "Confirm Payment"
      action: http_request
      config:
        method: POST
        url: "${PAYMENT_GATEWAY_URL}/payment-intents/${create_payment_intent.payment_intent_id}/confirm"
        headers:
          Authorization: "Bearer ${PAYMENT_API_KEY}"
        body:
          payment_method: "pm_card_visa"
      output:
        payment_status: "response.body.status"
      assert:
        - status == 200
        - payment_status == "succeeded"
      timeout: "30s"

    # Step 5: Create order
    - id: create_order
      name: "Create Order"
      action: http_request
      config:
        method: POST
        url: "${API_URL}/orders"
        headers:
          Authorization: "Bearer ${USER_TOKEN}"
        body:
          cart_id: "${create_cart.cart_id}"
          payment_intent_id: "${create_payment_intent.payment_intent_id}"
      output:
        order_id: "response.body.id"
        order_number: "response.body.order_number"
      assert:
        - status == 201
        - response.body.status == "confirmed"
        - response.body.total == "${apply_discount.final_total}"

    # Step 6: Verify order in database
    - id: verify_order
      name: "Verify Order in Database"
      action: database_query
      config:
        query: |
          SELECT o.*, oi.product_id, oi.quantity, oi.price
          FROM orders o
          JOIN order_items oi ON o.id = oi.order_id
          WHERE o.id = ?
        params: ["${create_order.order_id}"]
      assert:
        - result.count == 3
        - result.rows[0].status == "confirmed"

    # Step 7: Wait for order processing
    - id: wait_for_processing
      name: "Wait for Order Processing"
      action: wait_until
      config:
        condition: "${check_order_status.status} == 'processing' || ${check_order_status.status} == 'shipped'"
        max_duration: "2m"
        interval: "10s"

        steps:
          - id: check_order_status
            action: http_request
            config:
              method: GET
              url: "${API_URL}/orders/${create_order.order_id}"
              headers:
                Authorization: "Bearer ${USER_TOKEN}"
            output:
              status: "response.body.status"
      output:
        final_status: "check_order_status.status"

    # Step 8: Verify order confirmation email
    - id: verify_confirmation_email
      name: "Verify Order Confirmation Email"
      action: database_query
      config:
        query: |
          SELECT * FROM email_queue
          WHERE recipient = ?
          AND subject LIKE '%Order Confirmation%'
          AND body LIKE ?
          ORDER BY created_at DESC
          LIMIT 1
        params:
          - "${USER_EMAIL}"
          - "%${create_order.order_number}%"
      assert:
        - result.count == 1
        - result.rows[0].status == "sent"

    # Step 9: Parallel post-order checks
    - id: post_order_checks
      name: "Run Post-Order Validation"
      action: parallel
      config:
        steps:
          - id: check_inventory
            action: database_query
            config:
              query: |
                SELECT product_id, SUM(quantity) as reserved
                FROM order_items
                WHERE order_id = ?
                GROUP BY product_id
              params: ["${create_order.order_id}"]

          - id: check_analytics
            action: http_request
            config:
              method: GET
              url: "${API_URL}/analytics/events"
              headers:
                Authorization: "Bearer ${ADMIN_TOKEN}"
              params:
                type: "order_created"
                order_id: "${create_order.order_id}"

          - id: check_fulfillment
            action: http_request
            config:
              method: GET
              url: "${API_URL}/fulfillment/orders/${create_order.order_id}"
              headers:
                Authorization: "Bearer ${ADMIN_TOKEN}"

        wait_for_all: true
        max_concurrent: 3

      assert:
        - check_inventory.result.count > 0
        - check_analytics.status == 200
        - check_fulfillment.status == 200

  teardown:
    # Only cleanup if test failed
    - id: cancel_order_if_failed
      when: "${FLOW_STATUS} == 'failed'"
      action: http_request
      config:
        method: DELETE
        url: "${API_URL}/orders/${create_order.order_id}"
        headers:
          Authorization: "Bearer ${ADMIN_TOKEN}"
      on_error: "continue"

  config:
    timeout: "10m"
    fail_fast: false
```

### Example 3: Microservices Integration Test

```yaml
flow:
  name: "Microservices Integration Test"
  description: "Test communication between multiple microservices"
  version: "1.0.0"

  tags:
    - integration
    - microservices

  suite: "backend"

  env:
    USER_SERVICE_URL: "http://user-service:8001"
    ORDER_SERVICE_URL: "http://order-service:8002"
    INVENTORY_SERVICE_URL: "http://inventory-service:8003"
    NOTIFICATION_SERVICE_URL: "http://notification-service:8004"
    KAFKA_BROKERS: "kafka:9092"

  steps:
    # Step 1: Create user via User Service
    - id: create_user
      name: "Create User in User Service"
      action: http_request
      config:
        method: POST
        url: "${USER_SERVICE_URL}/users"
        body:
          email: "integration-test-${RANDOM_ID}@example.com"
          name: "Test User"
      output:
        user_id: "response.body.id"
      assert:
        - status == 201

    # Step 2: Verify user creation event in Kafka
    - id: verify_user_created_event
      name: "Verify User Created Event"
      action: kafka_consume
      config:
        brokers: ["${KAFKA_BROKERS}"]
        topic: "user-events"
        group_id: "test-consumer-${RANDOM_ID}"
        timeout: "30s"
        filter:
          key: "${create_user.user_id}"
      output:
        event: "result.messages[0].value"
      assert:
        - result.count > 0
        - event.event_type == "user.created"
        - event.user_id == "${create_user.user_id}"

    # Step 3: Check inventory
    - id: check_product_inventory
      name: "Check Product Inventory"
      action: http_request
      config:
        method: GET
        url: "${INVENTORY_SERVICE_URL}/products/prod_123/inventory"
      output:
        available_quantity: "response.body.available"
      assert:
        - status == 200
        - available_quantity > 0

    # Step 4: Create order via Order Service
    - id: create_order
      name: "Create Order in Order Service"
      action: http_request
      config:
        method: POST
        url: "${ORDER_SERVICE_URL}/orders"
        body:
          user_id: "${create_user.user_id}"
          items:
            - product_id: "prod_123"
              quantity: 2
      output:
        order_id: "response.body.id"
      assert:
        - status == 201

    # Step 5: Wait for order events to propagate
    - id: consume_order_events
      name: "Consume Order Events"
      action: kafka_consume
      config:
        brokers: ["${KAFKA_BROKERS}"]
        topic: "order-events"
        group_id: "test-consumer-${RANDOM_ID}"
        timeout: "30s"
        max_messages: 5
      output:
        events: "result.messages"

    # Step 6: Verify all services processed the order
    - id: verify_services_updated
      name: "Verify All Services Updated"
      action: parallel
      config:
        steps:
          # Check User Service updated user's order count
          - id: check_user_orders
            action: http_request
            config:
              method: GET
              url: "${USER_SERVICE_URL}/users/${create_user.user_id}/orders"
            assert:
              - status == 200
              - response.body.total_orders == 1

          # Check Inventory Service reserved items
          - id: check_inventory_reserved
            action: http_request
            config:
              method: GET
              url: "${INVENTORY_SERVICE_URL}/products/prod_123/inventory"
            assert:
              - status == 200
              - response.body.reserved >= 2

          # Check Notification Service sent confirmation
          - id: check_notification_sent
            action: http_request
            config:
              method: GET
              url: "${NOTIFICATION_SERVICE_URL}/notifications"
              params:
                user_id: "${create_user.user_id}"
                type: "order_confirmation"
            assert:
              - status == 200
              - response.body.notifications.length > 0

        wait_for_all: true

    # Step 7: Test gRPC communication between services
    - id: grpc_order_status
      name: "Check Order Status via gRPC"
      action: grpc_call
      config:
        address: "order-service:9002"
        service: "OrderService"
        method: "GetOrderStatus"
        request:
          order_id: "${create_order.order_id}"
      output:
        grpc_status: "result.response.status"
      assert:
        - result.status == "OK"
        - grpc_status == "CONFIRMED"

    # Step 8: Test WebSocket notification
    - id: websocket_notification
      name: "Test WebSocket Real-time Notification"
      action: websocket
      config:
        url: "ws://notification-service:8004/ws"
        headers:
          Authorization: "Bearer ${TEST_TOKEN}"
        actions:
          - type: "connect"

          - type: "send"
            message:
              type: "subscribe"
              user_id: "${create_user.user_id}"

          - type: "wait_for"
            message:
              type: "subscribed"
            timeout: "10s"

          # Trigger update that should send WebSocket message
          - type: "send"
            message:
              type: "trigger_test_notification"
              order_id: "${create_order.order_id}"

          - type: "wait_for"
            message:
              type: "order_update"
            timeout: "15s"

          - type: "close"
      output:
        ws_messages: "result.messages"
      assert:
        - ws_messages.length >= 2

  teardown:
    - id: cleanup_order
      action: http_request
      config:
        method: DELETE
        url: "${ORDER_SERVICE_URL}/orders/${create_order.order_id}"
      on_error: "continue"

    - id: cleanup_user
      action: http_request
      config:
        method: DELETE
        url: "${USER_SERVICE_URL}/users/${create_user.user_id}"
      on_error: "continue"

  config:
    timeout: "10m"
```

---

## JSON Schema Definition

### Full JSON Schema for Validation

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://testmesh.io/schemas/flow/v1.0.0",
  "title": "TestMesh Flow",
  "description": "Schema for TestMesh flow definitions",
  "type": "object",
  "required": ["flow"],
  "properties": {
    "flow": {
      "type": "object",
      "required": ["name", "steps"],
      "properties": {
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 255,
          "description": "Human-readable flow name"
        },
        "description": {
          "type": "string",
          "maxLength": 1000
        },
        "version": {
          "type": "string",
          "pattern": "^\\d+\\.\\d+\\.\\d+$",
          "default": "1.0.0"
        },
        "tags": {
          "type": "array",
          "items": {
            "type": "string",
            "pattern": "^[a-z0-9-]+$"
          },
          "uniqueItems": true
        },
        "suite": {
          "type": "string",
          "pattern": "^[a-z0-9-]+$"
        },
        "author": {
          "type": "string",
          "format": "email"
        },
        "env": {
          "type": "object",
          "additionalProperties": {
            "type": "string"
          }
        },
        "setup": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/step"
          }
        },
        "steps": {
          "type": "array",
          "minItems": 1,
          "items": {
            "$ref": "#/definitions/step"
          }
        },
        "teardown": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/step"
          }
        },
        "config": {
          "type": "object",
          "properties": {
            "timeout": {
              "$ref": "#/definitions/duration"
            },
            "fail_fast": {
              "type": "boolean",
              "default": true
            },
            "retry": {
              "$ref": "#/definitions/retry_config"
            }
          }
        }
      }
    }
  },
  "definitions": {
    "step": {
      "type": "object",
      "required": ["action", "config"],
      "properties": {
        "id": {
          "type": "string",
          "pattern": "^[a-z0-9_-]+$"
        },
        "name": {
          "type": "string",
          "maxLength": 255
        },
        "description": {
          "type": "string",
          "maxLength": 1000
        },
        "action": {
          "type": "string",
          "enum": [
            "http_request",
            "database_query",
            "kafka_publish",
            "kafka_consume",
            "grpc_call",
            "websocket",
            "browser",
            "wait_until",
            "transform",
            "assert",
            "log",
            "delay",
            "run_flow",
            "condition",
            "for_each",
            "parallel"
          ]
        },
        "config": {
          "type": "object"
        },
        "when": {
          "type": "string"
        },
        "output": {
          "type": "object",
          "additionalProperties": {
            "type": "string"
          }
        },
        "assert": {
          "type": "array",
          "items": {
            "oneOf": [
              {
                "type": "string"
              },
              {
                "type": "object",
                "required": ["expression"],
                "properties": {
                  "expression": {
                    "type": "string"
                  },
                  "message": {
                    "type": "string"
                  }
                }
              }
            ]
          }
        },
        "on_error": {
          "type": "string",
          "enum": ["continue", "fail", "retry"],
          "default": "fail"
        },
        "error_steps": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/step"
          }
        },
        "retry": {
          "$ref": "#/definitions/retry_config"
        },
        "timeout": {
          "$ref": "#/definitions/duration"
        },
        "tags": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "disabled": {
          "type": "boolean",
          "default": false
        }
      }
    },
    "duration": {
      "type": "string",
      "pattern": "^\\d+[smh]$",
      "description": "Duration in format: 30s, 5m, 2h"
    },
    "retry_config": {
      "type": "object",
      "properties": {
        "max_attempts": {
          "type": "integer",
          "minimum": 1,
          "maximum": 10,
          "default": 1
        },
        "delay": {
          "$ref": "#/definitions/duration",
          "default": "1s"
        },
        "backoff": {
          "type": "string",
          "enum": ["linear", "exponential", "constant"],
          "default": "exponential"
        },
        "retry_on": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "retry_on_not": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

---

## Validation Rules

### 1. ID Uniqueness
- All step IDs must be unique within a flow
- IDs can only contain: `[a-z0-9_-]`
- IDs must start with a letter
- Maximum length: 64 characters

### 2. Variable References
- Variables must be defined before use
- Format: `${variable_name}` or `${step_id.output_name}`
- Nested access: `${step_id.response.body.data[0].id}`
- System variables are always available

### 3. Circular Dependencies
- Flows cannot call themselves directly or indirectly
- Variable dependencies must form a DAG (directed acyclic graph)

### 4. Duration Format
- Valid units: `s` (seconds), `m` (minutes), `h` (hours)
- Examples: `30s`, `5m`, `2h`, `90s`
- Must be positive integer + unit

### 5. JSONPath
- Must be valid JSONPath syntax
- Can access nested objects and arrays
- Supports filters: `$.users[?(@.active == true)]`

### 6. Assertions
- Must be valid boolean expressions
- Supported operators: `==`, `!=`, `>`, `<`, `>=`, `<=`, `contains`, `exists`, `is`
- Can reference current step outputs and previous step outputs

### 7. Conditional Expressions
- `when` clauses must evaluate to boolean
- Can use logical operators: `&&`, `||`, `!`
- Can reference variables and outputs

### 8. File Size Limits
- Maximum flow file size: 1MB
- Maximum number of steps: 1000
- Maximum nesting depth: 10

---

## Best Practices

### 1. Naming Conventions
```yaml
# Good
- id: create_user_account
  name: "Create User Account"

# Bad
- id: step1
  name: "do stuff"
```

### 2. Use Meaningful IDs
```yaml
# Good
- id: verify_payment_processed
- id: send_confirmation_email

# Bad
- id: step_1
- id: test_thing
```

### 3. Extract Reusable Flows
```yaml
# Instead of duplicating login steps, create sub-flow
- id: login
  action: run_flow
  config:
    flow: "user-login"
    input:
      email: "${USER_EMAIL}"
      password: "${USER_PASSWORD}"
```

### 4. Use Descriptive Assertions
```yaml
# Good
assert:
  - expression: "status == 200"
    message: "Expected successful HTTP response"

  - expression: "response.body.id exists"
    message: "Response must include user ID"

# Also good (for simple cases)
assert:
  - status == 200
  - response.body.id exists
```

### 5. Handle Errors Gracefully
```yaml
- id: risky_operation
  action: http_request
  config:
    method: POST
    url: "${API_URL}/risky"
  on_error: "continue"
  error_steps:
    - id: log_error
      action: log
      config:
        level: error
        message: "Operation failed: ${error.message}"
```

### 6. Use Timeouts
```yaml
# Set appropriate timeouts
- id: long_operation
  action: http_request
  config:
    method: POST
    url: "${API_URL}/long-operation"
  timeout: "5m"  # Don't let it hang indefinitely
```

### 7. Cleanup in Teardown
```yaml
teardown:
  # Always cleanup test data
  - id: delete_test_user
    action: database_query
    config:
      query: "DELETE FROM users WHERE email LIKE 'test-%@example.com'"
    on_error: "continue"  # Don't fail flow if cleanup fails
```

### 8. Document Complex Flows
```yaml
flow:
  name: "Complex Integration Test"
  description: |
    This flow tests the complete order processing pipeline:
    1. Creates test user and products
    2. Simulates order placement
    3. Verifies payment processing
    4. Confirms inventory updates
    5. Validates notification delivery

    Prerequisites:
    - Payment gateway must be running
    - Kafka cluster must be available

    Expected duration: ~5 minutes
```

---

## File Organization

### Recommended Structure

```
tests/
├── flows/
│   ├── authentication/
│   │   ├── user-login.yaml
│   │   ├── user-registration.yaml
│   │   └── password-reset.yaml
│   │
│   ├── ecommerce/
│   │   ├── checkout-flow.yaml
│   │   ├── cart-management.yaml
│   │   └── order-tracking.yaml
│   │
│   ├── api/
│   │   ├── user-crud.yaml
│   │   ├── product-api.yaml
│   │   └── search-api.yaml
│   │
│   └── integration/
│       ├── microservices-communication.yaml
│       └── event-driven-flow.yaml
│
├── shared/
│   ├── sub-flows/
│   │   ├── login.yaml
│   │   ├── create-test-user.yaml
│   │   └── cleanup-test-data.yaml
│   │
│   └── fixtures/
│       ├── users.yaml
│       └── products.yaml
│
└── .testmesh.yaml  # Project configuration
```

---

**Schema Version**: 1.0.0
**Last Updated**: 2026-02-09
**Status**: Complete ✅
