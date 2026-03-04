# TestMesh MCP Server Integration

> **AI-powered test flows using Model Context Protocol (MCP) servers**

## Table of Contents

1. [Overview](#overview)
2. [MCP Server Basics](#mcp-server-basics)
3. [MCP Action Handler](#mcp-action-handler)
4. [Configuration](#configuration)
5. [Use Cases](#use-cases)
6. [Built-in MCP Tools](#built-in-mcp-tools)
7. [Custom MCP Servers](#custom-mcp-servers)
8. [Advanced Features](#advanced-features)
9. [Examples](#examples)
10. [Best Practices](#best-practices)

---

## Overview

### What is MCP?

**Model Context Protocol (MCP)** is an open protocol by Anthropic that enables AI assistants to securely connect to external tools and data sources. It allows:

- **Tool Use**: AI can call functions and APIs
- **Context Access**: AI can access files, databases, web content
- **Structured Output**: AI returns structured data
- **Conversational**: Multi-turn interactions with context

### Why MCP in TestMesh?

Integrate AI capabilities into test flows:

1. **Intelligent Test Generation** - Generate tests from natural language
2. **Smart Data Extraction** - Parse complex responses using AI
3. **Dynamic Decision Making** - AI-powered conditional logic
4. **Natural Language Assertions** - Write assertions in plain English
5. **Code Analysis** - Analyze API responses, logs, error messages
6. **Test Data Generation** - Generate realistic test data
7. **Result Analysis** - AI-powered failure analysis and debugging

### Architecture

```
TestMesh Flow
    │
    ├─→ MCP Action Handler
    │       │
    │       ├─→ MCP Client
    │       │       │
    │       │       ├─→ MCP Server (Claude)
    │       │       ├─→ MCP Server (Custom)
    │       │       └─→ MCP Server (Community)
    │       │
    │       └─→ Tool Registry
    │               │
    │               ├─→ Built-in Tools
    │               └─→ Custom Tools
    │
    └─→ Regular Actions (HTTP, DB, etc.)
```

---

## MCP Server Basics

### MCP Server Types

**1. Claude MCP Server** (Anthropic)
- Claude Sonnet 4.5 / Opus 4.6
- Natural language understanding
- Code generation and analysis
- Reasoning and decision making

**2. Custom MCP Servers**
- Your own tools and APIs
- Domain-specific logic
- Internal services

**3. Community MCP Servers**
- Open source tools
- Third-party integrations
- Shared utilities

### MCP Communication Flow

```
1. TestMesh sends request to MCP Server
   ├─ Prompt/question
   ├─ Context data
   └─ Available tools

2. MCP Server (AI Agent) processes request
   ├─ Understands intent
   ├─ Plans approach
   └─ May call tools

3. MCP Server returns response
   ├─ Text response
   ├─ Structured data
   └─ Tool call results

4. TestMesh processes response
   ├─ Extracts data
   ├─ Runs assertions
   └─ Continues flow
```

---

## MCP Action Handler

### Basic MCP Action

```yaml
- id: ai_analysis
  action: mcp
  config:
    # MCP Server to use
    server: "claude"                    # or custom server name

    # Prompt for the AI
    prompt: |
      Analyze this API response and determine if it's valid:
      ${api_response.body}

      Check for:
      1. Required fields are present
      2. Data types are correct
      3. Values are reasonable

      Return JSON with: {valid: boolean, issues: string[]}

    # Optional: Provide context/files
    context:
      - type: "text"
        content: "${api_response.body}"
      - type: "file"
        path: "./schema.json"

    # Optional: Available tools for AI to use
    tools:
      - name: "check_database"
        description: "Query database to verify data"
      - name: "call_api"
        description: "Make additional API calls"

    # Response parsing
    response_format: "json"              # json|text|structured

    # Model settings
    model: "claude-sonnet-4.5"          # or claude-opus-4.6
    max_tokens: 4000
    temperature: 0                       # 0 = deterministic

  # Extract from AI response
  output:
    is_valid: "response.valid"
    issues: "response.issues"

  # Assert on AI's analysis
  assert:
    - response.valid == true
```

### MCP Action Configuration

```yaml
- id: mcp_action
  action: mcp
  config:
    # Server selection
    server: string                      # Required: "claude" or custom server name

    # AI Prompt
    prompt: string | template           # Required: instruction for AI

    # Context (optional)
    context:                            # Data/files for AI to access
      - type: "text"|"file"|"data"
        content: string                 # For type: text
        path: string                    # For type: file
        data: object                    # For type: data

    # Tools (optional)
    tools: array<Tool>                  # Tools AI can use

    # Response format
    response_format: "json"|"text"|"structured"

    # Model configuration
    model: string                       # Model to use
    max_tokens: number                  # Max response length (default: 4000)
    temperature: number                 # 0-1, creativity (default: 0)

    # Multi-turn conversation
    conversation_id: string             # Continue previous conversation
    system_prompt: string               # System instructions

    # Caching (for efficiency)
    cache_prompt: boolean               # Cache prompt for reuse
    cache_ttl: duration                 # Cache duration

    # Timeout
    timeout: duration                   # Max time for AI response
```

---

## Configuration

### MCP Server Configuration

```yaml
# .testmesh.yaml

mcp:
  # MCP Servers
  servers:
    # Claude MCP Server (Anthropic)
    - name: "claude"
      type: "anthropic"
      config:
        api_key: "${ANTHROPIC_API_KEY}"
        model: "claude-sonnet-4.5"      # Default model
        base_url: "https://api.anthropic.com"  # Optional
        max_tokens: 4000
        temperature: 0

    # Claude Opus (for complex reasoning)
    - name: "claude-opus"
      type: "anthropic"
      config:
        api_key: "${ANTHROPIC_API_KEY}"
        model: "claude-opus-4.6"
        max_tokens: 8000

    # Custom MCP Server
    - name: "custom-analyzer"
      type: "custom"
      config:
        url: "http://localhost:5016/mcp"
        auth:
          type: "bearer"
          token: "${CUSTOM_MCP_TOKEN}"

    # Community MCP Server
    - name: "code-analyzer"
      type: "community"
      config:
        package: "@testmesh/code-analyzer"
        version: "1.0.0"

  # Global settings
  settings:
    timeout: "30s"                      # Default timeout
    cache_enabled: true                 # Enable prompt caching
    retry_attempts: 3                   # Retry on failure
    log_prompts: true                   # Log prompts for debugging

  # Tool registry
  tools:
    # Built-in tools
    - name: "http_request"
      enabled: true
    - name: "database_query"
      enabled: true
    - name: "file_read"
      enabled: true

    # Custom tools
    - name: "check_inventory"
      handler: "./tools/inventory.js"
      description: "Check product inventory levels"
```

### Environment Variables

```bash
# .env

# Anthropic API Key (for Claude)
ANTHROPIC_API_KEY=sk-ant-xxxxx

# Custom MCP Server
CUSTOM_MCP_URL=http://localhost:5016/mcp
CUSTOM_MCP_TOKEN=xxxxx
```

---

## Use Cases

### 1. Intelligent Data Extraction

Extract structured data from unstructured responses:

```yaml
- id: scrape_api
  action: http_request
  config:
    method: GET
    url: "${API_URL}/user/profile"

- id: extract_data
  action: mcp
  config:
    server: "claude"
    prompt: |
      Extract user information from this API response:
      ${scrape_api.response.body}

      Return JSON with:
      {
        "full_name": "first and last name combined",
        "email": "email address",
        "phone": "phone number in E.164 format",
        "age": "calculated from birthday",
        "is_active": "true if status is 'active' or 'verified'"
      }

      If any field is missing, return null for that field.

    response_format: "json"

  output:
    user_name: "response.full_name"
    user_email: "response.email"
    user_phone: "response.phone"
```

### 2. Natural Language Assertions

Write assertions in plain English:

```yaml
- id: verify_response
  action: mcp
  config:
    server: "claude"
    prompt: |
      Check if this API response is valid:
      ${api_response.body}

      Requirements:
      - User must have an email address
      - User must be over 18 years old
      - Account must be verified
      - No error fields should be present

      Return JSON: {valid: boolean, reason: string}

    response_format: "json"

  assert:
    - response.valid == true
```

### 3. Dynamic Test Generation

Generate test steps based on API documentation:

```yaml
- id: generate_tests
  action: mcp
  config:
    server: "claude"
    prompt: |
      Generate API test cases for this endpoint:

      Endpoint: POST /api/users
      Schema: ${openapi_spec}

      Generate 5 test cases covering:
      - Happy path
      - Invalid input
      - Missing required fields
      - Edge cases

      Return JSON array of test cases with:
      {
        "name": "test name",
        "input": {request body},
        "expected_status": status code,
        "expected_response": expected response pattern
      }

    context:
      - type: "file"
        path: "./openapi.yaml"

    response_format: "json"

  output:
    test_cases: "response"

# Run generated tests
- id: run_generated_tests
  action: for_each
  config:
    items: "${generate_tests.test_cases}"
    item_name: "test_case"

    steps:
      - id: run_test
        action: http_request
        config:
          method: POST
          url: "/api/users"
          body: "${test_case.input}"
        assert:
          - status == ${test_case.expected_status}
```

### 4. Intelligent Decision Making

AI-powered conditional logic:

```yaml
- id: check_status
  action: http_request
  config:
    method: GET
    url: "${API_URL}/job/${job_id}"

- id: decide_action
  action: mcp
  config:
    server: "claude"
    prompt: |
      Based on this job status, what should we do next?
      ${check_status.response.body}

      Options:
      1. "continue" - Job is still processing, check again
      2. "success" - Job completed successfully
      3. "retry" - Job failed but should retry
      4. "fail" - Job failed permanently

      Return JSON: {action: string, reason: string}

    response_format: "json"

  output:
    next_action: "response.action"

- id: handle_continue
  when: "${decide_action.next_action} == 'continue'"
  action: delay
  config:
    duration: "10s"

- id: handle_retry
  when: "${decide_action.next_action} == 'retry'"
  action: http_request
  config:
    method: POST
    url: "${API_URL}/job/${job_id}/retry"
```

### 5. Smart Test Data Generation

Generate realistic test data:

```yaml
- id: generate_user_data
  action: mcp
  config:
    server: "claude"
    prompt: |
      Generate 10 realistic user profiles for testing.

      Requirements:
      - Diverse names (different cultures)
      - Valid email addresses
      - Realistic ages (18-80)
      - Mix of genders
      - Valid US phone numbers

      Return JSON array of users with:
      {
        "first_name": string,
        "last_name": string,
        "email": string,
        "age": number,
        "phone": string (E.164 format)
      }

    response_format: "json"

  output:
    test_users: "response"

- id: create_users
  action: for_each
  config:
    items: "${generate_user_data.test_users}"
    item_name: "user"

    steps:
      - id: create_user
        action: http_request
        config:
          method: POST
          url: "${API_URL}/users"
          body: "${user}"
```

### 6. Error Analysis

AI-powered debugging:

```yaml
- id: failing_test
  action: http_request
  config:
    method: POST
    url: "${API_URL}/checkout"
    body: { cart_id: "${cart_id}" }
  on_error: "continue"

- id: analyze_failure
  when: "${failing_test.status} >= 400"
  action: mcp
  config:
    server: "claude"
    prompt: |
      This API call failed. Analyze the error and suggest fixes:

      Request:
      POST ${failing_test.config.url}
      Body: ${failing_test.config.body}

      Response:
      Status: ${failing_test.status}
      Body: ${failing_test.response.body}

      Additional context:
      - Previous step (create_cart) succeeded
      - Cart ID: ${cart_id}
      - User is authenticated

      Provide:
      1. Root cause of the error
      2. Suggested fix
      3. Additional tests to add

      Return JSON: {
        "root_cause": string,
        "suggested_fix": string,
        "additional_tests": string[]
      }

    response_format: "json"

  output:
    error_analysis: "response"

- id: log_analysis
  action: log
  config:
    level: "error"
    message: |
      Test failed. AI Analysis:
      Root cause: ${analyze_failure.error_analysis.root_cause}
      Fix: ${analyze_failure.error_analysis.suggested_fix}
```

### 7. Complex Response Validation

Validate complex business logic:

```yaml
- id: get_invoice
  action: http_request
  config:
    method: GET
    url: "${API_URL}/invoices/${invoice_id}"

- id: validate_invoice
  action: mcp
  config:
    server: "claude"
    prompt: |
      Validate this invoice for correctness:
      ${get_invoice.response.body}

      Business rules:
      1. Subtotal must equal sum of line items
      2. Tax must be 8.5% of subtotal (rounded to 2 decimals)
      3. Total must equal subtotal + tax - discount
      4. Discount cannot exceed 20% of subtotal
      5. All line items must have positive quantities
      6. Unit prices must match product catalog

      Product catalog:
      ${product_catalog}

      Return JSON:
      {
        "valid": boolean,
        "issues": [
          {
            "field": string,
            "issue": string,
            "expected": string,
            "actual": string
          }
        ],
        "calculations": {
          "subtotal": number,
          "tax": number,
          "total": number
        }
      }

    context:
      - type: "data"
        data: "${product_catalog}"

    response_format: "json"

  assert:
    - response.valid == true
    - response.issues.length == 0
```

### 8. Multi-Step AI Workflow

Use AI across multiple steps with conversation context:

```yaml
- id: start_analysis
  action: mcp
  config:
    server: "claude"
    prompt: |
      I need to test a user registration flow.
      Analyze this API documentation and tell me what test cases I need.

      ${api_docs}

    context:
      - type: "file"
        path: "./api-docs.yaml"

    response_format: "text"

  output:
    conversation_id: "conversation_id"
    test_cases: "response"

- id: generate_test_data
  action: mcp
  config:
    server: "claude"
    conversation_id: "${start_analysis.conversation_id}"  # Continue conversation
    prompt: |
      Based on the test cases you identified, generate test data for each case.
      Return as JSON array.

    response_format: "json"

  output:
    test_data: "response"

- id: refine_tests
  action: mcp
  config:
    server: "claude"
    conversation_id: "${start_analysis.conversation_id}"
    prompt: |
      Looking at the test data, are we missing any edge cases?
      Add 3 more edge case tests.

    response_format: "json"

  output:
    additional_tests: "response"
```

---

## Built-in MCP Tools

### HTTP Request Tool

AI can make HTTP requests:

```yaml
- id: ai_with_api_access
  action: mcp
  config:
    server: "claude"
    prompt: |
      Check if user with email "test@example.com" exists.
      If not, create one.
      Return the user ID.

    tools:
      - name: "http_request"
        config:
          base_url: "${API_URL}"
          auth:
            type: "bearer"
            token: "${API_TOKEN}"

    response_format: "json"

  output:
    user_id: "response.user_id"
```

AI can then use the tool:
```
AI: Let me check if the user exists...
[Calls http_request: GET /api/users?email=test@example.com]
[Response: {users: []}]

AI: User doesn't exist. Creating...
[Calls http_request: POST /api/users with body: {email: "test@example.com"}]
[Response: {id: 12345, email: "test@example.com"}]

AI: {user_id: 12345}
```

### Database Query Tool

AI can query databases:

```yaml
- id: ai_database_check
  action: mcp
  config:
    server: "claude"
    prompt: |
      Check if we have any users with duplicate emails.
      If found, return their IDs and emails.

    tools:
      - name: "database_query"
        config:
          connection: "${DATABASE_URL}"

    response_format: "json"
```

### File Read Tool

AI can read files:

```yaml
- id: ai_config_analysis
  action: mcp
  config:
    server: "claude"
    prompt: |
      Analyze these configuration files and check for:
      1. Security issues (exposed secrets)
      2. Invalid settings
      3. Missing required fields

      Return issues as JSON array.

    tools:
      - name: "file_read"
        config:
          allowed_paths:
            - "./config/**/*.yaml"
            - "./config/**/*.json"

    response_format: "json"
```

---

## Custom MCP Servers

### Creating Custom MCP Server

```typescript
// custom-mcp-server/index.ts
import { MCPServer, Tool } from '@testmesh/mcp-sdk';

const server = new MCPServer({
  name: 'custom-analyzer',
  version: '1.0.0',
  description: 'Custom analysis tools for TestMesh'
});

// Define custom tool
const analyzePerformance: Tool = {
  name: 'analyze_performance',
  description: 'Analyze API performance metrics',
  parameters: {
    type: 'object',
    properties: {
      response_time: { type: 'number' },
      endpoint: { type: 'string' }
    },
    required: ['response_time', 'endpoint']
  },
  handler: async (params) => {
    const { response_time, endpoint } = params;

    // Custom logic
    const analysis = {
      rating: response_time < 100 ? 'excellent' :
              response_time < 500 ? 'good' :
              response_time < 1000 ? 'acceptable' : 'poor',
      suggestions: []
    };

    if (response_time > 1000) {
      analysis.suggestions.push('Consider adding caching');
      analysis.suggestions.push('Check database query performance');
    }

    return analysis;
  }
};

server.addTool(analyzePerformance);

// Start server
server.listen(5016);
```

### Using Custom MCP Server

```yaml
# .testmesh.yaml
mcp:
  servers:
    - name: "custom-analyzer"
      type: "custom"
      config:
        url: "http://localhost:5016"

# In flow
- id: analyze_perf
  action: mcp
  config:
    server: "custom-analyzer"
    prompt: |
      Analyze the performance of this API call:
      Endpoint: ${endpoint}
      Response Time: ${response_time}ms

      Use the analyze_performance tool and provide recommendations.

    tools:
      - name: "analyze_performance"

    response_format: "json"
```

---

## Advanced Features

### 1. Prompt Templates

Reusable prompt templates:

```yaml
# .testmesh.yaml
mcp:
  prompt_templates:
    validate_json:
      template: |
        Validate this JSON against the schema:
        JSON: {{json}}
        Schema: {{schema}}

        Return {valid: boolean, errors: string[]}
      parameters:
        - json
        - schema

    analyze_error:
      template: |
        Analyze this error and suggest fixes:
        Error: {{error}}
        Context: {{context}}

        Return {cause: string, fix: string}
      parameters:
        - error
        - context

# Use in flow
- id: validate
  action: mcp
  config:
    server: "claude"
    prompt_template: "validate_json"
    parameters:
      json: "${api_response.body}"
      schema: "${schema}"
    response_format: "json"
```

### 2. Caching for Performance

Cache prompts for faster execution:

```yaml
- id: ai_analysis
  action: mcp
  config:
    server: "claude"
    prompt: |
      Analyze this API specification:
      ${large_api_spec}

    # Cache the prompt (large API spec)
    cache_prompt: true
    cache_ttl: "24h"

    response_format: "json"
```

On subsequent runs, the large API spec is cached, reducing:
- Token usage (cheaper)
- Latency (faster)

### 3. Tool Permissions

Control what tools AI can use:

```yaml
- id: restricted_ai
  action: mcp
  config:
    server: "claude"
    prompt: "Analyze this data..."

    # Only allow specific tools
    tools:
      - name: "http_request"
        permissions:
          methods: ["GET"]              # Only GET requests
          allowed_hosts:
            - "api.example.com"         # Only this host
          forbidden_paths:
            - "/admin/*"                # Block admin paths

      - name: "database_query"
        permissions:
          read_only: true               # No INSERT/UPDATE/DELETE
          allowed_tables:
            - "users"
            - "orders"
```

### 4. Multi-Model Strategy

Use different models for different tasks:

```yaml
# Fast model for simple tasks
- id: quick_check
  action: mcp
  config:
    server: "claude"
    model: "claude-haiku-4.5"          # Fast, cheap
    prompt: "Is this JSON valid? ${json}"

# Powerful model for complex reasoning
- id: complex_analysis
  action: mcp
  config:
    server: "claude-opus"
    model: "claude-opus-4.6"           # Powerful, expensive
    prompt: |
      Analyze this complex business logic...
```

### 5. Structured Output

Enforce structured responses:

```yaml
- id: structured_response
  action: mcp
  config:
    server: "claude"
    prompt: "Extract user data from: ${text}"

    # Enforce JSON schema
    response_schema:
      type: "object"
      required: ["name", "email"]
      properties:
        name:
          type: "string"
          minLength: 1
        email:
          type: "string"
          format: "email"
        age:
          type: "integer"
          minimum: 0
          maximum: 150

    response_format: "json"

  # Response is guaranteed to match schema
  assert:
    - response.name exists
    - response.email exists
```

### 6. Streaming Responses

Stream AI responses for long-running tasks:

```yaml
- id: generate_long_report
  action: mcp
  config:
    server: "claude"
    prompt: "Generate comprehensive test report..."

    # Enable streaming
    stream: true

    # Callback for each chunk
    on_chunk: |
      console.log(chunk);

    response_format: "text"
```

---

## Examples

### Complete Example: E2E Test with AI

```yaml
flow:
  name: "AI-Powered E2E Test"
  description: "Complete e2e test using AI for intelligent validation"

  tags:
    - integration
    - ai-powered
    - e2e

  env:
    API_URL: "https://api.example.com"
    ANTHROPIC_API_KEY: "${ANTHROPIC_API_KEY}"

  steps:
    # Step 1: Generate test data with AI
    - id: generate_test_user
      action: mcp
      config:
        server: "claude"
        prompt: |
          Generate a realistic test user profile for a US-based e-commerce site.
          Return JSON with: first_name, last_name, email, phone, address

        response_format: "json"
      output:
        test_user: "response"

    # Step 2: Create user via API
    - id: create_user
      action: http_request
      config:
        method: POST
        url: "${API_URL}/users"
        body: "${generate_test_user.test_user}"
      output:
        user_id: "response.body.id"

    # Step 3: AI validates the response
    - id: validate_user_creation
      action: mcp
      config:
        server: "claude"
        prompt: |
          Validate this user creation response:
          Request: ${create_user.config.body}
          Response: ${create_user.response.body}

          Check:
          - All input fields are present in response
          - Response has an ID field
          - Email format is valid
          - No sensitive data (password) in response

          Return {valid: boolean, issues: string[]}

        response_format: "json"
      assert:
        - response.valid == true

    # Step 4: Create order
    - id: create_order
      action: http_request
      config:
        method: POST
        url: "${API_URL}/orders"
        headers:
          Authorization: "Bearer ${auth_token}"
        body:
          user_id: "${create_user.user_id}"
          items:
            - product_id: "prod_123"
              quantity: 2
              price: 29.99
      output:
        order_id: "response.body.id"
        order_total: "response.body.total"

    # Step 5: AI calculates expected total
    - id: calculate_expected_total
      action: mcp
      config:
        server: "claude"
        prompt: |
          Calculate the expected order total:
          Items: ${create_order.config.body.items}
          Tax rate: 8.5%

          Return {subtotal: number, tax: number, total: number}

        response_format: "json"
      output:
        expected_total: "response.total"

    # Step 6: AI validates business logic
    - id: validate_order_calculation
      action: mcp
      config:
        server: "claude"
        prompt: |
          Validate this order calculation:
          Actual total: ${create_order.order_total}
          Expected total: ${calculate_expected_total.expected_total}

          Are they the same (within $0.01)?
          If not, explain the discrepancy.

          Return {valid: boolean, discrepancy: number, explanation: string}

        response_format: "json"
      assert:
        - response.valid == true

    # Step 7: AI checks order status with tools
    - id: verify_order_processing
      action: mcp
      config:
        server: "claude"
        prompt: |
          Check if order ${create_order.order_id} is being processed correctly:
          1. Check order status via API
          2. Check database for order record
          3. Verify inventory was decremented

          Return {status: string, valid: boolean, issues: string[]}

        tools:
          - name: "http_request"
            config:
              base_url: "${API_URL}"
          - name: "database_query"
            config:
              connection: "${DATABASE_URL}"

        response_format: "json"
      assert:
        - response.valid == true
        - response.status == "processing"

    # Step 8: AI-powered error analysis (if needed)
    - id: final_analysis
      action: mcp
      config:
        server: "claude-opus"          # Use Opus for complex reasoning
        prompt: |
          Analyze the complete test execution:

          Test steps:
          1. User creation: ${create_user.status}
          2. Order creation: ${create_order.status}
          3. Order validation: ${validate_order_calculation.response}
          4. Order processing: ${verify_order_processing.response}

          Summary:
          - Did everything pass?
          - Any concerns or warnings?
          - Recommendations for improvement?

          Return {
            "overall_status": "pass|fail|warning",
            "summary": string,
            "concerns": string[],
            "recommendations": string[]
          }

        response_format: "json"
      output:
        test_summary: "response"

  teardown:
    # Cleanup with AI deciding what to clean
    - id: intelligent_cleanup
      action: mcp
      config:
        server: "claude"
        prompt: |
          Determine what needs to be cleaned up:
          - User ID: ${create_user.user_id}
          - Order ID: ${create_order.order_id}
          - Test status: ${final_analysis.test_summary.overall_status}

          If test passed, clean up test data.
          If test failed, leave data for debugging.

          Return {should_cleanup: boolean, items_to_cleanup: string[]}

        response_format: "json"
      output:
        should_cleanup: "response.should_cleanup"

    - id: cleanup_user
      when: "${intelligent_cleanup.should_cleanup} == true"
      action: http_request
      config:
        method: DELETE
        url: "${API_URL}/users/${create_user.user_id}"
```

---

## Best Practices

### 1. Use Appropriate Models

```yaml
# Fast tasks → Haiku
- action: mcp
  config:
    model: "claude-haiku-4.5"
    prompt: "Is this JSON valid?"

# Complex reasoning → Opus
- action: mcp
  config:
    model: "claude-opus-4.6"
    prompt: "Analyze this complex business logic..."

# General tasks → Sonnet
- action: mcp
  config:
    model: "claude-sonnet-4.5"
    prompt: "Extract data from response"
```

### 2. Be Specific in Prompts

```yaml
# Bad - Vague
prompt: "Check the response"

# Good - Specific
prompt: |
  Validate this API response:
  ${response}

  Requirements:
  1. Status code must be 200
  2. Response must have 'data' field
  3. Data must be an array with at least 1 item

  Return {valid: boolean, issues: string[]}
```

### 3. Request Structured Output

```yaml
# Always specify response format
response_format: "json"

# Provide expected structure in prompt
prompt: |
  ...
  Return JSON with exactly this structure:
  {
    "valid": boolean,
    "score": number (0-100),
    "issues": string[]
  }
```

### 4. Use Caching for Large Context

```yaml
# Cache large, static context
- action: mcp
  config:
    prompt: |
      Using this API specification:
      ${large_api_spec}

      Generate test cases...

    cache_prompt: true          # Cache the large spec
    cache_ttl: "24h"
```

### 5. Set Appropriate Timeouts

```yaml
# Quick validation
- action: mcp
  config:
    prompt: "Is this valid?"
    timeout: "10s"

# Complex analysis
- action: mcp
  config:
    prompt: "Analyze entire codebase..."
    timeout: "5m"
```

### 6. Handle Errors Gracefully

```yaml
- id: ai_analysis
  action: mcp
  config:
    server: "claude"
    prompt: "Analyze..."

  on_error: "continue"

  error_steps:
    - id: fallback
      action: log
      config:
        message: "AI analysis failed, using fallback logic"
```

### 7. Use Temperature Wisely

```yaml
# Deterministic tasks (testing) → temperature: 0
- action: mcp
  config:
    prompt: "Validate this data..."
    temperature: 0              # Consistent results

# Creative tasks (data generation) → temperature: 0.7
- action: mcp
  config:
    prompt: "Generate diverse test data..."
    temperature: 0.7            # More variety
```

---

## Security Considerations

### 1. API Key Management

```yaml
# Store in environment variables
mcp:
  servers:
    - name: "claude"
      config:
        api_key: "${ANTHROPIC_API_KEY}"    # NOT hardcoded

# Use secrets manager
api_key: "${vault:anthropic-api-key}"
```

### 2. Tool Permissions

```yaml
# Restrict tool access
tools:
  - name: "http_request"
    permissions:
      methods: ["GET"]                     # Read-only
      allowed_hosts: ["api.example.com"]  # Specific host

  - name: "database_query"
    permissions:
      read_only: true                      # No writes
```

### 3. Prompt Injection Prevention

```yaml
# Sanitize user input before including in prompts
- id: sanitize_input
  action: transform
  config:
    input: "${user_input}"
    operations:
      - type: "sanitize"
        remove: ["sql", "javascript", "eval"]

- id: ai_analysis
  action: mcp
  config:
    prompt: "Analyze: ${sanitize_input.output}"
```

### 4. Audit Logging

```yaml
# Log all AI interactions
mcp:
  settings:
    log_prompts: true
    log_responses: true
    audit_log_path: "./logs/mcp-audit.log"
```

---

## Performance & Cost

### Cost Optimization

**1. Use Appropriate Models**:
- Haiku: $0.25 / 1M input tokens
- Sonnet: $3 / 1M input tokens
- Opus: $15 / 1M input tokens

**2. Enable Caching**:
- Cached tokens: 90% cheaper
- Use for large, static context

**3. Minimize Token Usage**:
```yaml
# Bad - Includes entire response
prompt: "Analyze: ${huge_response}"

# Good - Extract relevant parts first
- id: extract
  action: transform
  config:
    input: "${huge_response}"
    operations:
      - type: "extract"
        fields: ["id", "status", "error"]

- id: analyze
  action: mcp
  config:
    prompt: "Analyze: ${extract.output}"
```

### Performance Optimization

**1. Parallel AI Calls**:
```yaml
- action: parallel
  config:
    steps:
      - id: analyze_response
        action: mcp
        config:
          prompt: "Analyze response..."

      - id: analyze_logs
        action: mcp
        config:
          prompt: "Analyze logs..."

      - id: analyze_metrics
        action: mcp
        config:
          prompt: "Analyze metrics..."
```

**2. Use Streaming for Long Responses**:
```yaml
- action: mcp
  config:
    stream: true              # Don't wait for full response
```

---

## Summary

MCP integration brings **AI superpowers** to TestMesh:

✅ **Intelligent validation** - AI understands business logic
✅ **Natural language** - Write tests in plain English
✅ **Dynamic test generation** - AI creates test cases
✅ **Smart debugging** - AI analyzes failures
✅ **Complex reasoning** - Handle sophisticated scenarios
✅ **Flexible integration** - Works with existing flows

### Quick Start

```yaml
# 1. Configure MCP server
# .testmesh.yaml
mcp:
  servers:
    - name: "claude"
      type: "anthropic"
      config:
        api_key: "${ANTHROPIC_API_KEY}"

# 2. Use in flow
- id: ai_check
  action: mcp
  config:
    server: "claude"
    prompt: "Validate this response: ${response}"
    response_format: "json"

  assert:
    - response.valid == true
```

---

**Version**: 1.0.0
**Last Updated**: 2026-02-09
**Status**: Complete ✅
