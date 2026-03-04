# JSON Schema Validation

> **Validate API responses against JSON Schema for robust type checking**

## Overview

JSON Schema validation ensures that API responses conform to a predefined structure. This catches schema violations, type mismatches, and missing fields that simple assertions might miss.

---

## Basic Usage

### Simple Schema Validation

```yaml
flow:
  name: "Validate User API Response"

  steps:
    - id: get_user
      action: http_request
      config:
        method: GET
        url: "${API_URL}/users/${user_id}"

      assert:
        - status == 200
        - response.body matches_schema:
            type: object
            required: [id, email, name, created_at]
            properties:
              id:
                type: string
                format: uuid
              email:
                type: string
                format: email
              name:
                type: string
                minLength: 1
                maxLength: 255
              age:
                type: integer
                minimum: 0
                maximum: 150
              created_at:
                type: string
                format: date-time
              is_active:
                type: boolean
```

### External Schema File

```yaml
- id: validate_order
  action: http_request
  config:
    method: GET
    url: "${API_URL}/orders/${order_id}"

  assert:
    - status == 200
    - response.body matches_schema_file: "schemas/order.json"
```

**schemas/order.json:**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://example.com/schemas/order.json",
  "title": "Order",
  "type": "object",
  "required": ["id", "customer_id", "items", "total", "status"],
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "customer_id": {
      "type": "string"
    },
    "items": {
      "type": "array",
      "minItems": 1,
      "items": {
        "$ref": "#/definitions/OrderItem"
      }
    },
    "total": {
      "type": "number",
      "minimum": 0
    },
    "status": {
      "type": "string",
      "enum": ["pending", "processing", "shipped", "delivered", "cancelled"]
    },
    "created_at": {
      "type": "string",
      "format": "date-time"
    }
  },
  "definitions": {
    "OrderItem": {
      "type": "object",
      "required": ["product_id", "quantity", "price"],
      "properties": {
        "product_id": {
          "type": "string"
        },
        "quantity": {
          "type": "integer",
          "minimum": 1
        },
        "price": {
          "type": "number",
          "minimum": 0
        }
      }
    }
  }
}
```

---

## Advanced Features

### Nested Schemas with $ref

```yaml
assert:
  - response.body matches_schema:
      type: object
      properties:
        user:
          $ref: "#/definitions/User"
        orders:
          type: array
          items:
            $ref: "#/definitions/Order"
      definitions:
        User:
          type: object
          required: [id, email]
          properties:
            id:
              type: string
            email:
              type: string
              format: email
        Order:
          type: object
          required: [id, total]
          properties:
            id:
              type: string
            total:
              type: number
```

### Conditional Schemas

```yaml
assert:
  - response.body matches_schema:
      type: object
      properties:
        type:
          type: string
          enum: [personal, business]
      allOf:
        - if:
            properties:
              type:
                const: personal
          then:
            required: [first_name, last_name]
            properties:
              first_name:
                type: string
              last_name:
                type: string
        - if:
            properties:
              type:
                const: business
          then:
            required: [company_name, tax_id]
            properties:
              company_name:
                type: string
              tax_id:
                type: string
```

### Pattern Properties

```yaml
assert:
  - response.body matches_schema:
      type: object
      patternProperties:
        "^metadata_":              # Keys starting with "metadata_"
          type: string
      additionalProperties: false  # No other properties allowed
```

### Array Validation

```yaml
assert:
  - response.body matches_schema:
      type: array
      minItems: 1
      maxItems: 100
      uniqueItems: true
      items:
        type: object
        required: [id, name]
        properties:
          id:
            type: integer
          name:
            type: string
```

---

## Common Validation Patterns

### 1. API Response Structure

```yaml
# Validate paginated API response
assert:
  - response.body matches_schema:
      type: object
      required: [data, pagination]
      properties:
        data:
          type: array
          items:
            type: object
        pagination:
          type: object
          required: [page, per_page, total, total_pages]
          properties:
            page:
              type: integer
              minimum: 1
            per_page:
              type: integer
              minimum: 1
              maximum: 100
            total:
              type: integer
              minimum: 0
            total_pages:
              type: integer
              minimum: 0
```

### 2. Error Response Validation

```yaml
- id: test_invalid_request
  action: http_request
  config:
    method: POST
    url: "${API_URL}/users"
    body:
      email: "invalid-email"  # Invalid to trigger error

  assert:
    - status == 400
    - response.body matches_schema:
        type: object
        required: [error, message, details]
        properties:
          error:
            type: string
          message:
            type: string
          details:
            type: array
            items:
              type: object
              required: [field, error]
              properties:
                field:
                  type: string
                error:
                  type: string
```

### 3. Polymorphic Responses

```yaml
# Response can be one of multiple types
assert:
  - response.body matches_schema:
      oneOf:
        - type: object
          required: [success, data]
          properties:
            success:
              const: true
            data:
              type: object
        - type: object
          required: [success, error]
          properties:
            success:
              const: false
            error:
              type: string
```

---

## Schema Generation

### Generate Schema from Response

```bash
# Capture actual API response and generate schema
testmesh run flow.yaml --capture-schemas

# Output: schemas/get_user_response.json
```

**Generated schema:**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "email": { "type": "string" },
    "name": { "type": "string" },
    "age": { "type": "integer" },
    "created_at": { "type": "string" }
  },
  "required": ["id", "email", "name", "created_at"]
}
```

### Generate Schema from OpenAPI

```bash
# Extract schemas from OpenAPI spec
testmesh import openapi swagger.yaml --extract-schemas --output schemas/
```

---

## XML Schema Validation

### Basic XSD Validation

```yaml
- id: soap_request
  action: http_request
  config:
    method: POST
    url: "${SOAP_URL}"
    headers:
      Content-Type: "text/xml"
    body: |
      <soap:Envelope>
        <soap:Body>
          <GetUser>
            <UserId>123</UserId>
          </GetUser>
        </soap:Body>
      </soap:Envelope>

  assert:
    - status == 200
    - response.body matches_xml_schema_file: "schemas/user_response.xsd"
```

**schemas/user_response.xsd:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="UserResponse">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="Id" type="xs:string"/>
        <xs:element name="Email" type="xs:string"/>
        <xs:element name="Name" type="xs:string"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
```

---

## Error Handling

### Custom Error Messages

```yaml
assert:
  - expression: response.body matches_schema_file "schemas/user.json"
    message: "User response does not match expected schema"
```

### Detailed Validation Errors

When schema validation fails, TestMesh provides detailed errors:

```
Schema Validation Failed:
  Path: /user/age
  Error: must be integer
  Actual: "25" (string)

  Path: /user/email
  Error: must be valid email format
  Actual: "not-an-email"

  Path: /user
  Error: missing required property 'created_at'
```

---

## Best Practices

### 1. Use External Schema Files

**Good:**
```yaml
assert:
  - response.body matches_schema_file: "schemas/user.json"
```

**Why:**
- Reusable across multiple tests
- Version controlled
- Can be shared with API documentation
- IDE support for editing

### 2. Start Strict, Then Relax

```yaml
# Strict validation (recommended for critical endpoints)
assert:
  - response.body matches_schema:
      type: object
      required: [id, email, name]
      additionalProperties: false  # No extra properties allowed
      properties:
        id: { type: string, format: uuid }
        email: { type: string, format: email }
        name: { type: string, minLength: 1 }

# Relaxed validation (for evolving APIs)
assert:
  - response.body matches_schema:
      type: object
      required: [id, email]
      additionalProperties: true   # Allow extra properties
      properties:
        id: { type: string }
        email: { type: string }
```

### 3. Validate Both Success and Error Responses

```yaml
- id: success_case
  action: http_request
  config:
    method: GET
    url: "${API_URL}/users/${valid_user_id}"
  assert:
    - status == 200
    - response.body matches_schema_file: "schemas/user_success.json"

- id: error_case
  action: http_request
  config:
    method: GET
    url: "${API_URL}/users/invalid-id"
  assert:
    - status == 404
    - response.body matches_schema_file: "schemas/error_response.json"
```

### 4. Use Schema Composition

```yaml
# Reusable schema definitions
definitions:
  Address:
    type: object
    required: [street, city, country]
    properties:
      street: { type: string }
      city: { type: string }
      country: { type: string }
      postal_code: { type: string }

  Contact:
    type: object
    properties:
      email: { type: string, format: email }
      phone: { type: string }
      address:
        $ref: "#/definitions/Address"

# Use in multiple schemas
- response.body matches_schema:
    type: object
    properties:
      billing_address:
        $ref: "#/definitions/Address"
      shipping_address:
        $ref: "#/definitions/Address"
```

---

## Implementation Details

### Go Implementation

```go
package assertions

import (
    "encoding/json"
    "github.com/xeipuuv/gojsonschema"
)

type SchemaAssertion struct {
    Schema interface{}
    SchemaFile string
}

func (a *SchemaAssertion) Assert(response *http.Response) error {
    var schema interface{}

    if a.SchemaFile != "" {
        // Load from file
        schemaBytes, err := os.ReadFile(a.SchemaFile)
        if err != nil {
            return fmt.Errorf("failed to read schema file: %w", err)
        }
        json.Unmarshal(schemaBytes, &schema)
    } else {
        schema = a.Schema
    }

    // Parse response body
    var body interface{}
    json.NewDecoder(response.Body).Decode(&body)

    // Validate
    schemaLoader := gojsonschema.NewGoLoader(schema)
    documentLoader := gojsonschema.NewGoLoader(body)

    result, err := gojsonschema.Validate(schemaLoader, documentLoader)
    if err != nil {
        return fmt.Errorf("schema validation error: %w", err)
    }

    if !result.Valid() {
        return formatValidationErrors(result.Errors())
    }

    return nil
}

func formatValidationErrors(errors []gojsonschema.ResultError) error {
    var msgs []string
    for _, err := range errors {
        msgs = append(msgs, fmt.Sprintf(
            "Path: %s\nError: %s\nValue: %v\n",
            err.Field(),
            err.Description(),
            err.Value(),
        ))
    }
    return fmt.Errorf("Schema Validation Failed:\n%s", strings.Join(msgs, "\n"))
}
```

---

## Integration with OpenAPI

### Automatic Schema Extraction

When importing OpenAPI specs, TestMesh automatically extracts response schemas:

```bash
testmesh import openapi api.yaml --with-schemas
```

**Generated flow:**
```yaml
flow:
  name: "Get User - Generated from OpenAPI"

  steps:
    - id: get_user
      action: http_request
      config:
        method: GET
        url: "/users/{userId}"
      assert:
        - status == 200
        - response.body matches_schema:
            # Extracted from OpenAPI components/schemas/User
            $ref: "schemas/User.json"
```

---

## CLI Commands

```bash
# Validate schema files
testmesh validate schema schemas/user.json

# Generate schema from response
testmesh schema generate --from-response response.json --output schemas/user.json

# Test schema validation
testmesh schema test schemas/user.json --with test-data.json

# Compare schemas (for breaking changes)
testmesh schema diff schemas/user-v1.json schemas/user-v2.json
```

---

## Related Features

- **[Contract Testing](./CONTRACT_TESTING.md)** - Uses JSON Schema for contract validation
- **[Import from OpenAPI](./V1_SCOPE.md)** - Extracts schemas automatically
- **[YAML Schema](./YAML_SCHEMA.md)** - Assertion syntax reference

---

**Last Updated**: 2026-02-09
**Version**: 1.0
**Status**: Complete ✅
