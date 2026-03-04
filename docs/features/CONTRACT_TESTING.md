# Contract Testing

> **Consumer-Driven Contract Testing for Microservices**

## Overview

Contract testing ensures that services can communicate correctly by verifying that:
1. **Consumers** (clients) define what they expect from providers (APIs)
2. **Providers** (APIs) fulfill the contracts that consumers expect

TestMesh implements **Pact-compatible** contract testing with a flow-based approach.

---

## Key Concepts

### Consumer vs Provider

```
┌─────────────┐         ┌─────────────┐
│  Consumer   │────────>│  Provider   │
│  (Client)   │ Request │  (API)      │
│             │<────────│             │
└─────────────┘ Response└─────────────┘
```

**Consumer:** The service making API requests (e.g., web app, mobile app, other microservices)

**Provider:** The service providing the API (e.g., user service, payment service)

### Contract

A **contract** defines:
- Request: method, path, headers, body
- Expected response: status, headers, body structure

### Why Contract Testing?

**Without Contracts:**
- Provider changes API → Consumers break unexpectedly
- No visibility into who uses which endpoints
- Integration testing requires running all services

**With Contracts:**
- Provider knows what consumers expect
- Can detect breaking changes before deployment
- Test each service independently
- Automated compatibility checking

---

## Consumer-Side: Generate Contracts

### Basic Contract Generation

```yaml
flow:
  name: "User Service Consumer Contract"
  description: "Web app's expectations of User Service"

  contract:
    enabled: true
    consumer: "web-app"
    provider: "user-service"
    output: "contracts/web-app--user-service.json"

  steps:
    # Step 1: Get user by ID
    - id: get_user
      name: "Get User by ID"
      action: http_request
      config:
        method: GET
        url: "/users/${user_id}"
        headers:
          Authorization: "Bearer ${token}"

      contract_expectation:
        request:
          method: GET
          path: "/users/123"
          headers:
            Authorization: "Bearer token123"

        response:
          status: 200
          headers:
            Content-Type: "application/json"
          body:
            type: object
            required: [id, email, name]
            properties:
              id:
                type: string
                example: "123"
              email:
                type: string
                format: email
                example: "user@example.com"
              name:
                type: string
                example: "John Doe"

    # Step 2: Create user
    - id: create_user
      name: "Create User"
      action: http_request
      config:
        method: POST
        url: "/users"
        body:
          email: "newuser@example.com"
          name: "New User"

      contract_expectation:
        request:
          method: POST
          path: "/users"
          body:
            type: object
            required: [email, name]
            properties:
              email: { type: string, format: email }
              name: { type: string }

        response:
          status: 201
          body:
            type: object
            required: [id, email, name]
            properties:
              id: { type: string }
              email: { type: string }
              name: { type: string }
```

### Running Consumer Contract Generation

```bash
# Run flow and generate contract
testmesh run consumer-contract.yaml --generate-contract

# Output: contracts/web-app--user-service.json
```

**Generated Contract (Pact format):**
```json
{
  "consumer": {
    "name": "web-app"
  },
  "provider": {
    "name": "user-service"
  },
  "interactions": [
    {
      "description": "Get User by ID",
      "providerState": "user with ID 123 exists",
      "request": {
        "method": "GET",
        "path": "/users/123",
        "headers": {
          "Authorization": "Bearer token123"
        }
      },
      "response": {
        "status": 200,
        "headers": {
          "Content-Type": "application/json"
        },
        "body": {
          "id": "123",
          "email": "user@example.com",
          "name": "John Doe"
        },
        "matchingRules": {
          "$.body.id": {
            "match": "type"
          },
          "$.body.email": {
            "match": "regex",
            "regex": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
          },
          "$.body.name": {
            "match": "type"
          }
        }
      }
    },
    {
      "description": "Create User",
      "request": {
        "method": "POST",
        "path": "/users",
        "body": {
          "email": "newuser@example.com",
          "name": "New User"
        }
      },
      "response": {
        "status": 201,
        "body": {
          "id": "abc123",
          "email": "newuser@example.com",
          "name": "New User"
        }
      }
    }
  ],
  "metadata": {
    "pactSpecification": {
      "version": "2.0.0"
    }
  }
}
```

---

## Provider-Side: Verify Contracts

### Basic Contract Verification

```yaml
flow:
  name: "User Service Provider Verification"
  description: "Verify that User Service fulfills consumer contracts"

  contract_verification:
    enabled: true
    provider: "user-service"
    contracts_dir: "contracts/"
    provider_base_url: "${PROVIDER_URL}"

    # Provider state setup (seed test data)
    states:
      - state: "user with ID 123 exists"
        setup:
          - action: database_query
            config:
              query: |
                INSERT INTO users (id, email, name)
                VALUES ('123', 'user@example.com', 'John Doe')
                ON CONFLICT (id) DO NOTHING

      - state: "no users exist"
        setup:
          - action: database_query
            config:
              query: "DELETE FROM users WHERE id IN ('123', '456')"

  steps:
    # TestMesh automatically generates verification steps
    # from contracts found in contracts_dir

    # Verification for: Get User by ID
    - id: verify_get_user
      action: verify_contract_interaction
      config:
        contract: "web-app--user-service.json"
        interaction: "Get User by ID"
        provider_state: "user with ID 123 exists"

    # Verification for: Create User
    - id: verify_create_user
      action: verify_contract_interaction
      config:
        contract: "web-app--user-service.json"
        interaction: "Create User"
```

### Running Provider Verification

```bash
# Verify all contracts
testmesh run provider-verification.yaml

# Verify specific consumer contracts
testmesh run provider-verification.yaml --contracts web-app

# Output:
# ✓ web-app--user-service: Get User by ID
# ✓ web-app--user-service: Create User
# ✓ mobile-app--user-service: Get User Profile
#
# All contracts verified successfully!
```

---

## Advanced Features

### 1. Request Matching Rules

```yaml
contract_expectation:
  request:
    method: POST
    path: "/users"
    body:
      email:
        value: "user@example.com"
        match: "regex"
        regex: "^[\\w.]+@[\\w.]+\\.[a-zA-Z]{2,}$"
      age:
        value: 25
        match: "type"  # Any integer is fine
      id:
        value: "abc123"
        match: "uuid"  # Must be valid UUID
```

### 2. Response Matching Rules

```yaml
contract_expectation:
  response:
    status: 200
    body:
      id:
        match: "type"  # Any string
      created_at:
        match: "datetime"
        format: "iso8601"
      items:
        match: "array"
        min_length: 1
        each:
          id: { match: "type" }
          price: { match: "decimal" }
```

### 3. Provider States

```yaml
# Consumer specifies required state
contract_expectation:
  provider_states:
    - "user with email user@example.com exists"
    - "user has 3 orders"

# Provider sets up state
states:
  - state: "user with email user@example.com exists"
    setup:
      - action: database_query
        config:
          query: |
            INSERT INTO users (email, name)
            VALUES ('user@example.com', 'Test User')
    teardown:
      - action: database_query
        config:
          query: "DELETE FROM users WHERE email = 'user@example.com'"
```

### 4. Multi-Consumer Contracts

```yaml
# Provider must verify contracts from all consumers
contract_verification:
  provider: "user-service"
  contracts:
    - consumer: "web-app"
      contract_file: "contracts/web-app--user-service.json"
    - consumer: "mobile-app"
      contract_file: "contracts/mobile-app--user-service.json"
    - consumer: "admin-portal"
      contract_file: "contracts/admin-portal--user-service.json"
```

---

## Contract Registry/Broker

### Publishing Contracts

```bash
# Publish consumer contract to registry
testmesh contract publish \
  --contract contracts/web-app--user-service.json \
  --consumer web-app \
  --consumer-version 1.2.3 \
  --broker-url http://pact-broker.example.com

# With tag
testmesh contract publish \
  --contract contracts/web-app--user-service.json \
  --consumer web-app \
  --consumer-version 1.2.3 \
  --tag production \
  --broker-url http://pact-broker.example.com
```

### Verifying from Registry

```bash
# Verify provider against all consumer contracts in registry
testmesh contract verify \
  --provider user-service \
  --provider-version 2.1.0 \
  --broker-url http://pact-broker.example.com

# Verify against specific tags
testmesh contract verify \
  --provider user-service \
  --provider-version 2.1.0 \
  --consumer-tags production \
  --broker-url http://pact-broker.example.com
```

### Can-I-Deploy Check

```bash
# Check if safe to deploy consumer
testmesh contract can-i-deploy \
  --pacticipant web-app \
  --version 1.2.3 \
  --to production \
  --broker-url http://pact-broker.example.com

# Output:
# Computer says yes \o/
#
# web-app (1.2.3) can be deployed to production
# - user-service (2.1.0) has verified contract

# Check if safe to deploy provider
testmesh contract can-i-deploy \
  --pacticipant user-service \
  --version 2.1.1 \
  --to production \
  --broker-url http://pact-broker.example.com

# Output:
# Computer says no ಠ_ಠ
#
# user-service (2.1.1) cannot be deployed to production
# - web-app (1.2.3) contract verification failed
```

---

## Breaking Change Detection

### Scenario: Provider Breaking Consumer

**Consumer expects:**
```json
{
  "id": "123",
  "email": "user@example.com",
  "name": "John Doe"
}
```

**Provider changes to:**
```json
{
  "id": "123",
  "email": "user@example.com",
  "full_name": "John Doe"  // ❌ Breaking: renamed field
}
```

**Contract verification fails:**
```
Contract Verification Failed:

  Consumer: web-app
  Provider: user-service
  Interaction: Get User by ID

  Expected response body to have field: name
  Actual response body has field: full_name

  This is a BREAKING CHANGE.
```

### Non-Breaking Changes

```json
// ✅ Adding optional field: OK
{
  "id": "123",
  "email": "user@example.com",
  "name": "John Doe",
  "avatar_url": "https://..."  // New optional field
}

// ✅ Removing non-required field: OK if not in contract
{
  "id": "123",
  "email": "user@example.com"
  // "name" removed, but OK if consumer doesn't require it
}
```

---

## CI/CD Integration

### Consumer Pipeline (Web App)

```yaml
# .github/workflows/consumer-contract.yml
name: Consumer Contract Tests

on: [push]

jobs:
  contract-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Run Contract Tests
        run: |
          testmesh run consumer-contract.yaml --generate-contract

      - name: Publish Contract
        run: |
          testmesh contract publish \
            --contract contracts/web-app--user-service.json \
            --consumer web-app \
            --consumer-version ${{ github.sha }} \
            --broker-url ${{ secrets.PACT_BROKER_URL }}

      - name: Can I Deploy?
        run: |
          testmesh contract can-i-deploy \
            --pacticipant web-app \
            --version ${{ github.sha }} \
            --to production \
            --broker-url ${{ secrets.PACT_BROKER_URL }}
```

### Provider Pipeline (User Service)

```yaml
# .github/workflows/provider-verification.yml
name: Provider Contract Verification

on: [push]

jobs:
  verify-contracts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Start Provider Service
        run: docker-compose up -d user-service

      - name: Verify Contracts
        run: |
          testmesh contract verify \
            --provider user-service \
            --provider-version ${{ github.sha }} \
            --consumer-tags production \
            --broker-url ${{ secrets.PACT_BROKER_URL }}

      - name: Publish Verification Results
        run: |
          testmesh contract publish-verification \
            --provider user-service \
            --provider-version ${{ github.sha }} \
            --broker-url ${{ secrets.PACT_BROKER_URL }}
```

---

## Contract Versioning

### Semantic Versioning for Contracts

```bash
# Major version change (breaking)
testmesh contract publish \
  --contract contracts/web-app--user-service.json \
  --consumer-version 2.0.0 \
  --tag breaking-change

# Minor version change (new features)
testmesh contract publish \
  --contract contracts/web-app--user-service.json \
  --consumer-version 1.3.0 \
  --tag feature

# Patch version (bug fixes)
testmesh contract publish \
  --contract contracts/web-app--user-service.json \
  --consumer-version 1.2.1 \
  --tag bugfix
```

### Contract Diff

```bash
# Compare two contract versions
testmesh contract diff \
  --consumer web-app \
  --version1 1.2.0 \
  --version2 1.3.0 \
  --broker-url http://pact-broker.example.com

# Output:
# Contract Diff: web-app (1.2.0 → 1.3.0)
#
# Added interactions:
#   + Get User Orders
#
# Modified interactions:
#   ~ Get User by ID
#     + Added optional field: avatar_url
#
# Removed interactions:
#   (none)
#
# Breaking changes: 0
```

---

## Best Practices

### 1. Consumer Defines Minimal Expectations

**Good:**
```yaml
response:
  body:
    required: [id, email]  # Only require what you actually use
    properties:
      id: { type: string }
      email: { type: string }
```

**Bad:**
```yaml
response:
  body:
    required: [id, email, name, created_at, updated_at, avatar_url, ...]
    # Don't require everything the API returns
```

### 2. Use Type Matching, Not Exact Values

**Good:**
```yaml
response:
  body:
    id:
      match: "type"  # Any string is fine
    created_at:
      match: "datetime"  # Any valid datetime
```

**Bad:**
```yaml
response:
  body:
    id: "123"  # Exact match - too brittle
    created_at: "2026-02-09T10:00:00Z"  # Exact match
```

### 3. Use Provider States for Test Data

**Good:**
```yaml
contract_expectation:
  provider_states:
    - "user with ID 123 exists"
```

Provider sets up test data for each verification.

**Bad:**
Assuming production data exists for testing.

### 4. Run Contract Tests in CI/CD

- Consumer: Generate and publish contracts on every commit
- Provider: Verify contracts before deployment
- Use "can-i-deploy" to prevent breaking changes

### 5. Version Contracts

- Tag contracts with environment (dev, staging, production)
- Use semantic versioning
- Track breaking changes

---

## Implementation Details

### Contract Format (Pact-Compatible)

TestMesh generates contracts in Pact v2/v3 format, compatible with:
- Pact Broker
- Pactflow
- Pact JVM
- Pact JS/TS
- Pact Go
- Other Pact implementations

### Contract Verification Algorithm

```go
func VerifyContract(contract Contract, providerURL string) error {
    for _, interaction := range contract.Interactions {
        // 1. Set up provider state
        if err := setupProviderState(interaction.ProviderState); err != nil {
            return err
        }

        // 2. Make request to provider
        response, err := makeRequest(providerURL, interaction.Request)
        if err != nil {
            return err
        }

        // 3. Verify response matches contract
        if err := verifyResponse(response, interaction.Response); err != nil {
            return fmt.Errorf("interaction %s failed: %w",
                interaction.Description, err)
        }

        // 4. Tear down provider state
        teardownProviderState(interaction.ProviderState)
    }
    return nil
}
```

---

## CLI Commands

```bash
# Generate contract from flow
testmesh run flow.yaml --generate-contract

# Verify contracts
testmesh contract verify --provider user-service --contracts-dir ./contracts

# Publish to broker
testmesh contract publish --contract contract.json --broker-url URL

# Can I deploy?
testmesh contract can-i-deploy --pacticipant web-app --version 1.0.0

# List contracts
testmesh contract list --broker-url URL

# Diff contracts
testmesh contract diff --consumer web-app --version1 1.0.0 --version2 1.1.0

# Validate contract file
testmesh contract validate contract.json
```

---

## Related Features

- **[JSON Schema Validation](./JSON_SCHEMA_VALIDATION.md)** - Used for contract response validation
- **[Import from OpenAPI](./V1_SCOPE.md)** - Can generate contracts from OpenAPI specs
- **[CI/CD Integration](./README.md)** - Contract testing in pipelines

---

**Last Updated**: 2026-02-09
**Version**: 1.0
**Status**: Complete ✅
