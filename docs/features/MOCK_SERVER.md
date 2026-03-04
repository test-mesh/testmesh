# Mock Server / Service Virtualization

## Overview

TestMesh includes a built-in mock server that allows you to simulate external APIs and services directly within your test flows. This eliminates the need for external mock tools and makes tests more portable and self-contained.

**Key Benefits:**
- ✅ No external dependencies - mocks defined in YAML
- ✅ Simulate API responses, delays, failures, and edge cases
- ✅ Stateful mocking - responses can change based on previous requests
- ✅ Request matching with patterns and conditions
- ✅ Contract testing integration
- ✅ Automatic mock server lifecycle management

## Table of Contents

1. [Basic Mock Server](#basic-mock-server)
2. [Request Matching](#request-matching)
3. [Response Types](#response-types)
4. [Stateful Mocking](#stateful-mocking)
5. [Advanced Patterns](#advanced-patterns)
6. [Integration with Tests](#integration-with-tests)
7. [Implementation Details](#implementation-details)

---

## Basic Mock Server

### Simple Mock Definition

Define mock endpoints directly in your flow's setup:

```yaml
flow:
  name: "Test with Mock API"

  setup:
    - id: start_mock_server
      action: mock_server_start
      config:
        port: 5016
        endpoints:
          # Simple GET endpoint
          - path: /api/users/123
            method: GET
            response:
              status: 200
              body:
                id: "123"
                name: "John Doe"
                email: "john@example.com"

          # POST endpoint
          - path: /api/users
            method: POST
            response:
              status: 201
              headers:
                Location: "/api/users/124"
              body:
                id: "124"
                message: "User created"

      output:
        mock_url: "$.base_url"  # http://localhost:5016

  steps:
    # Use the mock server
    - id: call_api
      action: http_request
      config:
        method: GET
        url: "${start_mock_server.mock_url}/api/users/123"
      output:
        user: "$.body"

  teardown:
    - id: stop_mock_server
      action: mock_server_stop
```

### External Mock Configuration File

For complex mocks, use external configuration:

```yaml
# mocks/user-service.yaml
mock_server:
  name: "User Service Mock"
  port: 5016

  endpoints:
    - path: /api/users/:id
      method: GET
      response:
        status: 200
        body:
          id: "{{path.id}}"
          name: "User {{path.id}}"
          email: "user{{path.id}}@example.com"

    - path: /api/users
      method: POST
      response:
        status: 201
        body:
          id: "{{random.uuid}}"
          created_at: "{{timestamp}}"
```

```yaml
# Use in flow
setup:
  - id: start_mock
    action: mock_server_start
    config:
      from_file: "mocks/user-service.yaml"
    output:
      mock_url: "$.base_url"
```

---

## Request Matching

### Path Parameters

```yaml
endpoints:
  - path: /api/users/:userId/orders/:orderId
    method: GET
    response:
      status: 200
      body:
        user_id: "{{path.userId}}"
        order_id: "{{path.orderId}}"
        status: "completed"
```

### Query Parameters

```yaml
endpoints:
  - path: /api/users
    method: GET
    match:
      query:
        status: "active"
        role: "admin"
    response:
      status: 200
      body:
        users:
          - id: "1"
            name: "Admin User"
```

### Request Headers

```yaml
endpoints:
  - path: /api/protected
    method: GET
    match:
      headers:
        Authorization: "Bearer secret-token"
    response:
      status: 200
      body:
        message: "Authorized"

  # No matching token
  - path: /api/protected
    method: GET
    response:
      status: 401
      body:
        error: "Unauthorized"
```

### Request Body Matching

```yaml
endpoints:
  # Match exact body
  - path: /api/login
    method: POST
    match:
      body:
        username: "admin"
        password: "secret"
    response:
      status: 200
      body:
        token: "valid-token-123"

  # Match with JSON path
  - path: /api/users
    method: POST
    match:
      body_matches:
        - "$.email contains '@example.com'"
        - "$.age >= 18"
    response:
      status: 201
      body:
        id: "{{random.uuid}}"
        status: "created"
```

### Priority and Fallback

```yaml
endpoints:
  # Specific match (higher priority)
  - path: /api/users/admin
    method: GET
    priority: 1
    response:
      status: 200
      body:
        id: "admin"
        role: "administrator"

  # Generic match (lower priority)
  - path: /api/users/:id
    method: GET
    priority: 2
    response:
      status: 200
      body:
        id: "{{path.id}}"
        role: "user"

  # Fallback - no match
  - path: "*"
    method: "*"
    response:
      status: 404
      body:
        error: "Not found"
```

---

## Response Types

### Static Responses

```yaml
endpoints:
  - path: /api/config
    method: GET
    response:
      status: 200
      headers:
        Content-Type: "application/json"
        Cache-Control: "max-age=3600"
      body:
        version: "1.0.0"
        features: ["feature1", "feature2"]
```

### Dynamic Responses with Templates

```yaml
endpoints:
  - path: /api/time
    method: GET
    response:
      status: 200
      body:
        server_time: "{{timestamp}}"
        request_id: "{{random.uuid}}"
        client_ip: "{{request.ip}}"
```

### Response from File

```yaml
endpoints:
  - path: /api/large-dataset
    method: GET
    response:
      status: 200
      body_from_file: "mocks/data/large-dataset.json"

  - path: /api/report
    method: GET
    response:
      status: 200
      headers:
        Content-Type: "application/pdf"
      body_from_file: "mocks/data/report.pdf"
      binary: true
```

### Delayed Responses

```yaml
endpoints:
  # Simulate slow API
  - path: /api/slow-endpoint
    method: GET
    response:
      status: 200
      delay: 5s
      body:
        message: "This took 5 seconds"

  # Random delay
  - path: /api/variable-latency
    method: GET
    response:
      status: 200
      delay:
        min: 100ms
        max: 2s
      body:
        message: "Variable latency"
```

### Error Responses

```yaml
endpoints:
  # Simulate server error
  - path: /api/failing-endpoint
    method: POST
    response:
      status: 500
      body:
        error: "Internal server error"
        message: "Database connection failed"

  # Simulate timeout
  - path: /api/timeout
    method: GET
    response:
      hang: true  # Never responds

  # Simulate network error
  - path: /api/network-error
    method: GET
    response:
      close_connection: true  # Close connection immediately
```

### Conditional Responses

```yaml
endpoints:
  - path: /api/users/:id
    method: GET
    response:
      status: "{{path.id == '404' ? 404 : 200}}"
      body: |
        {{#if path.id == '404'}}
        {
          "error": "User not found"
        }
        {{else}}
        {
          "id": "{{path.id}}",
          "name": "User {{path.id}}"
        }
        {{/if}}
```

---

## Stateful Mocking

### Scenario-Based States

```yaml
mock_server:
  endpoints:
    - path: /api/counter
      method: GET
      stateful: true
      scenarios:
        - name: "initial"
          response:
            status: 200
            body:
              count: 0
          next_state: "incremented"

        - name: "incremented"
          response:
            status: 200
            body:
              count: 1
          next_state: "incremented_twice"

        - name: "incremented_twice"
          response:
            status: 200
            body:
              count: 2
          next_state: "incremented_twice"
```

### Request Count Based

```yaml
endpoints:
  - path: /api/rate-limited
    method: GET
    responses:
      # First 3 requests succeed
      - when: "{{request_count <= 3}}"
        status: 200
        body:
          message: "Success"
          remaining: "{{3 - request_count}}"

      # 4th and subsequent requests are rate limited
      - when: "{{request_count > 3}}"
        status: 429
        headers:
          Retry-After: "60"
        body:
          error: "Rate limit exceeded"
```

### Shared State Across Endpoints

```yaml
mock_server:
  state:
    users: []
    next_id: 1

  endpoints:
    # Create user
    - path: /api/users
      method: POST
      response:
        status: 201
        body:
          id: "{{state.next_id}}"
          name: "{{request.body.name}}"
        state_changes:
          - action: "append"
            path: "users"
            value:
              id: "{{state.next_id}}"
              name: "{{request.body.name}}"
          - action: "increment"
            path: "next_id"

    # List users
    - path: /api/users
      method: GET
      response:
        status: 200
        body:
          users: "{{state.users}}"
          total: "{{state.users.length}}"

    # Get specific user
    - path: /api/users/:id
      method: GET
      response:
        status: 200
        body: "{{state.users[path.id - 1]}}"
```

### Reset State

```yaml
steps:
  - id: reset_mock_state
    action: mock_server_reset_state
    config:
      server: "user-service-mock"
      state:
        users: []
        next_id: 1
```

---

## Advanced Patterns

### Proxy Mode (Partial Mocking)

Mock some endpoints, proxy others to real service:

```yaml
mock_server:
  proxy:
    target: "https://api.real-service.com"
    pass_through: true  # Proxy by default

  endpoints:
    # Override specific endpoints
    - path: /api/users/123
      method: GET
      response:
        status: 200
        body:
          id: "123"
          name: "Mocked User"

    # All other requests proxied to real service
```

### Recording and Playback

```yaml
# Record mode - proxy to real API and save responses
setup:
  - id: start_recording_mock
    action: mock_server_start
    config:
      mode: "record"
      proxy_target: "https://api.real-service.com"
      save_to: "mocks/recorded/user-service.yaml"
```

```yaml
# Playback mode - use recorded responses
setup:
  - id: start_playback_mock
    action: mock_server_start
    config:
      mode: "playback"
      from_file: "mocks/recorded/user-service.yaml"
```

### Multiple Mock Servers

```yaml
setup:
  # Start multiple mock servers
  - id: start_user_service_mock
    action: mock_server_start
    config:
      name: "user-service"
      port: 8081
      from_file: "mocks/user-service.yaml"

  - id: start_payment_service_mock
    action: mock_server_start
    config:
      name: "payment-service"
      port: 8082
      from_file: "mocks/payment-service.yaml"

steps:
  - id: call_user_service
    action: http_request
    config:
      url: "${start_user_service_mock.base_url}/api/users/123"

  - id: call_payment_service
    action: http_request
    config:
      url: "${start_payment_service_mock.base_url}/api/charge"
```

### Request Verification

Track and verify which requests were received:

```yaml
steps:
  # Make some requests
  - id: call_api
    action: http_request
    config:
      url: "${mock_url}/api/users"
      method: POST
      body:
        name: "John Doe"

  # Verify requests received by mock
  - id: verify_mock_requests
    action: mock_server_verify
    config:
      server: "user-service"
      assertions:
        - path: /api/users
          method: POST
          count: 1
          body_matches:
            - "$.name == 'John Doe'"
```

### Chaos Engineering

Simulate various failure scenarios:

```yaml
mock_server:
  chaos:
    enabled: true

  endpoints:
    - path: /api/users
      method: GET
      chaos_rules:
        # 10% of requests fail with 500
        - probability: 0.1
          response:
            status: 500
            body:
              error: "Random server error"

        # 5% of requests timeout
        - probability: 0.05
          response:
            hang: true

        # 85% succeed normally
        - probability: 0.85
          response:
            status: 200
            body:
              users: []
```

---

## Integration with Tests

### Example: EMV Fare Testing with Mock Payment Gateway

```yaml
flow:
  name: "Test Fare Calculation with Mock Payment Gateway"

  setup:
    # Start mock payment gateway
    - id: start_payment_gateway_mock
      action: mock_server_start
      config:
        name: "payment-gateway"
        port: 9000
        endpoints:
          # Successful charge
          - path: /v1/charges
            method: POST
            match:
              body_matches:
                - "$.amount <= 10.00"
            response:
              status: 200
              delay: 500ms
              body:
                id: "{{random.uuid}}"
                status: "succeeded"
                amount: "{{request.body.amount}}"

          # Decline if amount too high
          - path: /v1/charges
            method: POST
            match:
              body_matches:
                - "$.amount > 10.00"
            response:
              status: 402
              body:
                error:
                  code: "card_declined"
                  message: "Amount exceeds limit"

      output:
        payment_gateway_url: "$.base_url"

    # Configure fare service to use mock gateway
    - id: configure_fare_service
      action: http_request
      config:
        method: PUT
        url: "${FARE_API_URL}/config/payment-gateway"
        body:
          url: "${start_payment_gateway_mock.payment_gateway_url}"

  steps:
    # Send taps and calculate fares
    - id: send_taps
      action: kafka_publish
      config:
        topic: "matches"
        value:
          pan: "4111111111111111"
          amount: 5.00

    # Wait for payment
    - id: wait_for_payment
      action: kafka_consume
      config:
        topic: "payments"
        timeout: 10s

    # Verify mock received charge request
    - id: verify_charge_request
      action: mock_server_verify
      config:
        server: "payment-gateway"
        assertions:
          - path: /v1/charges
            method: POST
            count: 1
            body_matches:
              - "$.amount == 5.00"
              - "$.currency == 'USD'"

  teardown:
    - id: stop_mock
      action: mock_server_stop
      config:
        server: "payment-gateway"
```

### Example: Test with Failing External API

```yaml
flow:
  name: "Test Resilience to External API Failures"

  setup:
    - id: start_flaky_api_mock
      action: mock_server_start
      config:
        endpoints:
          - path: /api/validate
            method: POST
            # Fail first 2 times, succeed on 3rd
            responses:
              - when: "{{request_count <= 2}}"
                status: 503
                body:
                  error: "Service temporarily unavailable"
              - when: "{{request_count > 2}}"
                status: 200
                body:
                  valid: true

  steps:
    # Call with retry logic
    - id: call_with_retry
      action: http_request
      config:
        url: "${mock_url}/api/validate"
        method: POST
        retry:
          max_attempts: 5
          backoff: exponential
      output:
        result: "$.body"

    # Verify it eventually succeeded
    - id: verify_success
      action: assert
      config:
        assertions:
          - expression: "${call_with_retry.result.valid} == true"

    # Verify exactly 3 attempts were made
    - id: verify_attempts
      action: mock_server_verify
      config:
        assertions:
          - path: /api/validate
            method: POST
            count: 3
```

---

## Implementation Details

### Architecture

```
┌─────────────────────────────────────────────┐
│ TestMesh Engine                             │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │ Mock Server Manager                  │  │
│  │ - Lifecycle management               │  │
│  │ - Request routing                    │  │
│  │ - State management                   │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │ HTTP Server (per mock)               │  │
│  │ - Pattern matching                   │  │
│  │ - Response rendering                 │  │
│  │ - Request logging                    │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
         │                        │
         ▼                        ▼
   [Test Flow]           [External Service]
                         (optional proxy)
```

### Go Implementation Approach

```go
// pkg/mock/server.go
type MockServer struct {
    Name      string
    Port      int
    Endpoints []Endpoint
    State     map[string]interface{}
    Server    *http.Server
    Requests  []RecordedRequest
}

type Endpoint struct {
    Path       string
    Method     string
    Match      *MatchCriteria
    Response   *Response
    Responses  []*ConditionalResponse
    Priority   int
}

type Response struct {
    Status        int
    Headers       map[string]string
    Body          interface{}
    BodyFromFile  string
    Delay         time.Duration
    StateChanges  []StateChange
}

// Start mock server
func (m *MockServer) Start() error {
    mux := http.NewServeMux()
    mux.HandleFunc("/", m.handleRequest)

    m.Server = &http.Server{
        Addr:    fmt.Sprintf(":%d", m.Port),
        Handler: mux,
    }

    return m.Server.ListenAndServe()
}

// Handle incoming requests
func (m *MockServer) handleRequest(w http.ResponseWriter, r *http.Request) {
    // Record request
    m.recordRequest(r)

    // Find matching endpoint
    endpoint := m.findMatchingEndpoint(r)
    if endpoint == nil {
        http.NotFound(w, r)
        return
    }

    // Get response (stateful logic)
    response := endpoint.getResponse(m.State, r)

    // Apply delay
    if response.Delay > 0 {
        time.Sleep(response.Delay)
    }

    // Apply state changes
    for _, change := range response.StateChanges {
        m.applyStateChange(change)
    }

    // Write response
    m.writeResponse(w, response, r)
}
```

### Action Definitions

```yaml
# YAML_SCHEMA.md additions

mock_server_start:
  description: "Start a mock HTTP server"
  config:
    name: string          # Optional unique name
    port: integer         # Port to listen on
    from_file: string     # Load config from file
    endpoints: array      # Inline endpoint definitions
    proxy: object         # Proxy configuration
    mode: string          # "mock", "record", "playback"
  output:
    base_url: string      # "http://localhost:{port}"
    server_id: string

mock_server_stop:
  description: "Stop a running mock server"
  config:
    server: string        # Server name or ID

mock_server_verify:
  description: "Verify requests received by mock server"
  config:
    server: string
    assertions:
      - path: string
        method: string
        count: integer
        count_min: integer
        count_max: integer
        body_matches: array
        headers: object

mock_server_reset_state:
  description: "Reset mock server state"
  config:
    server: string
    state: object
```

### Template Variables

Available in mock responses:

- `{{timestamp}}` - Current ISO timestamp
- `{{timestamp_unix}}` - Unix timestamp
- `{{random.uuid}}` - Random UUID
- `{{random.int}}` - Random integer
- `{{random.int(min, max)}}` - Random int in range
- `{{random.string(length)}}` - Random string
- `{{path.paramName}}` - Path parameter value
- `{{query.paramName}}` - Query parameter value
- `{{header.HeaderName}}` - Header value
- `{{request.body.fieldName}}` - Request body field
- `{{request.ip}}` - Client IP address
- `{{request_count}}` - Number of times this endpoint was called
- `{{state.fieldName}}` - State variable value

---

## Benefits

✅ **Self-Contained Tests**: No need for external mock tools
✅ **Version Control**: Mock definitions in YAML alongside tests
✅ **Stateful Scenarios**: Test complex multi-step interactions
✅ **Failure Simulation**: Easily test error handling and retries
✅ **Fast Execution**: No network calls to real services
✅ **Deterministic**: Consistent responses for reliable tests
✅ **Contract Testing**: Verify request/response contracts
✅ **Team Collaboration**: Share mock configurations across team

---

## Future Enhancements

- [ ] WebSocket support
- [ ] gRPC mocking
- [ ] Import from OpenAPI/Swagger specs
- [ ] Import from Postman collections
- [ ] Export to WireMock format
- [ ] Mock server UI for visual editing
- [ ] Request/response recording from browser
- [ ] Performance simulation (bandwidth throttling)
- [ ] HTTPS/TLS support
