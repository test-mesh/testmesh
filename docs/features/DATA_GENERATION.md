# Data Generation & Request Templating

## Overview

TestMesh provides powerful data generation capabilities for creating realistic test data, large JSON payloads, and complex event messages.

**Capabilities**:
- ✅ Faker library integration (realistic fake data)
- ✅ Large JSON payloads with 10+ parameters
- ✅ Mix of static and dynamic fields
- ✅ Template functions
- ✅ Data builders/factories
- ✅ Works for HTTP requests, responses, Kafka messages, etc.

---

## 1. Basic Random Generation

### Built-in Random Variables

```yaml
flow:
  name: "Basic Random Data"
  steps:
    - action: http_request
      config:
        method: POST
        url: "${API_URL}/users"
        body:
          id: "${RANDOM_ID}"              # UUID: "550e8400-e29b-41d4-a716-446655440000"
          code: "${RANDOM_INT}"            # Integer: 742891
          token: "${RANDOM_STRING}"        # Alphanumeric: "aB3kD9mN2pQ5rT8w"
          timestamp: "${TIMESTAMP}"        # ISO 8601: "2024-01-15T10:30:00Z"
          unix_time: "${TIMESTAMP_UNIX}"   # Unix: 1705315800
```

---

## 2. Faker Library Integration

### Supported Faker Functions

TestMesh integrates with Faker.js for realistic test data generation.

#### Personal Information
```yaml
body:
  # Names
  first_name: "${FAKER.name.firstName}"           # "John"
  last_name: "${FAKER.name.lastName}"             # "Doe"
  full_name: "${FAKER.name.fullName}"             # "John Doe"
  prefix: "${FAKER.name.prefix}"                  # "Mr."
  suffix: "${FAKER.name.suffix}"                  # "Jr."

  # Contact
  email: "${FAKER.internet.email}"                # "john.doe@example.com"
  username: "${FAKER.internet.userName}"          # "john.doe123"
  phone: "${FAKER.phone.phoneNumber}"             # "+1-555-123-4567"

  # Address
  street: "${FAKER.address.streetAddress}"        # "123 Main St"
  city: "${FAKER.address.city}"                   # "San Francisco"
  state: "${FAKER.address.state}"                 # "California"
  zip: "${FAKER.address.zipCode}"                 # "94102"
  country: "${FAKER.address.country}"             # "United States"

  # Company
  company: "${FAKER.company.companyName}"         # "Acme Corp"
  job_title: "${FAKER.name.jobTitle}"             # "Software Engineer"
  department: "${FAKER.commerce.department}"      # "Engineering"
```

#### Financial & Commerce
```yaml
body:
  # Commerce
  product: "${FAKER.commerce.productName}"        # "Ergonomic Keyboard"
  price: "${FAKER.commerce.price}"                # "49.99"
  color: "${FAKER.commerce.color}"                # "blue"

  # Finance
  account_number: "${FAKER.finance.account}"      # "12345678"
  routing_number: "${FAKER.finance.routingNumber}" # "987654321"
  credit_card: "${FAKER.finance.creditCardNumber}" # "4111111111111111"
  amount: "${FAKER.finance.amount}"               # "1234.56"
  currency: "${FAKER.finance.currencyCode}"       # "USD"
```

#### Internet & Tech
```yaml
body:
  # Internet
  url: "${FAKER.internet.url}"                    # "https://example.com"
  domain: "${FAKER.internet.domainName}"          # "example.com"
  ip: "${FAKER.internet.ip}"                      # "192.168.1.1"
  ipv6: "${FAKER.internet.ipv6}"                  # "2001:0db8:85a3:0000:0000:8a2e:0370:7334"
  mac: "${FAKER.internet.mac}"                    # "00:1B:44:11:3A:B7"
  user_agent: "${FAKER.internet.userAgent}"       # "Mozilla/5.0..."

  # Tech
  uuid: "${FAKER.datatype.uuid}"                  # "550e8400-e29b-41d4-a716-446655440000"
  boolean: "${FAKER.datatype.boolean}"            # true/false
  number: "${FAKER.datatype.number}"              # 42
  json: "${FAKER.datatype.json}"                  # Valid JSON object
```

#### Date & Time
```yaml
body:
  # Dates
  past_date: "${FAKER.date.past}"                 # "2023-06-15T10:30:00Z"
  future_date: "${FAKER.date.future}"             # "2025-06-15T10:30:00Z"
  recent_date: "${FAKER.date.recent}"             # "2024-01-14T10:30:00Z"
  birthdate: "${FAKER.date.birthdate}"            # "1990-05-20T00:00:00Z"

  # Time
  weekday: "${FAKER.date.weekday}"                # "Monday"
  month: "${FAKER.date.month}"                    # "January"
```

#### Text & Lorem
```yaml
body:
  # Text
  word: "${FAKER.lorem.word}"                     # "dolor"
  words: "${FAKER.lorem.words(3)}"                # "lorem ipsum dolor"
  sentence: "${FAKER.lorem.sentence}"             # "Lorem ipsum dolor sit amet."
  paragraph: "${FAKER.lorem.paragraph}"           # Long paragraph...
  text: "${FAKER.lorem.text}"                     # Multiple paragraphs...

  # Descriptions
  description: "${FAKER.commerce.productDescription}" # Product description
```

---

## 3. Large JSON Payloads (10+ Parameters)

### Example: User Registration with 15+ Fields

```yaml
flow:
  name: "Create User with Full Profile"
  steps:
    - id: create_user
      action: http_request
      config:
        method: POST
        url: "${API_URL}/users"
        headers:
          Content-Type: "application/json"
        body:
          # Authentication (static structure, dynamic values)
          email: "${FAKER.internet.email}"
          username: "${FAKER.internet.userName}"
          password: "Test123!@#"  # Static value

          # Personal Information
          profile:
            first_name: "${FAKER.name.firstName}"
            last_name: "${FAKER.name.lastName}"
            date_of_birth: "${FAKER.date.birthdate}"
            gender: "male"  # Static
            phone: "${FAKER.phone.phoneNumber}"

            # Address (nested object)
            address:
              street: "${FAKER.address.streetAddress}"
              city: "${FAKER.address.city}"
              state: "${FAKER.address.state}"
              zip_code: "${FAKER.address.zipCode}"
              country: "US"  # Static

            # Additional fields
            bio: "${FAKER.lorem.paragraph}"
            avatar_url: "${FAKER.internet.url}/avatar.jpg"
            website: "${FAKER.internet.url}"

          # Settings (mix of static and dynamic)
          preferences:
            language: "en"  # Static
            timezone: "America/New_York"  # Static
            newsletter: true  # Static
            notifications_enabled: "${FAKER.datatype.boolean}"

          # Metadata
          metadata:
            signup_source: "web"  # Static
            referral_code: "${RANDOM_STRING}"
            utm_campaign: "spring_2024"  # Static
            device_id: "${FAKER.datatype.uuid}"
            ip_address: "${FAKER.internet.ip}"

        assert:
          - status_code: 201
          - json_path: "$.id exists"
          - json_path: "$.profile.email == '${body.email}'"
```

---

## 4. Template Functions

### String Manipulation

```yaml
body:
  # Transform generated data
  email_upper: "${FAKER.internet.email.upper()}"              # "JOHN.DOE@EXAMPLE.COM"
  email_lower: "${FAKER.internet.email.lower()}"              # "john.doe@example.com"

  # Combine static + dynamic
  full_email: "test+${RANDOM_STRING}@example.com"             # "test+aB3kD9mN2pQ5@example.com"
  username: "user_${RANDOM_INT}"                              # "user_742891"

  # Concatenation
  full_name: "${FAKER.name.firstName} ${FAKER.name.lastName}" # "John Doe"

  # Substring
  short_id: "${RANDOM_ID.substring(0, 8)}"                    # "550e8400"

  # Replace
  safe_email: "${FAKER.internet.email.replace('@', '_at_')}"  # "john.doe_at_example.com"
```

### Arithmetic & Logic

```yaml
body:
  # Arithmetic
  quantity: "${RANDOM_INT % 10 + 1}"                # Random 1-10
  total: "${FAKER.commerce.price * 1.08}"           # Price + 8% tax

  # Conditional
  status: "${FAKER.datatype.boolean ? 'active' : 'inactive'}"
  discount: "${FAKER.commerce.price > 50 ? 10 : 0}" # 10% off if price > $50
```

### Array Generation

```yaml
body:
  # Generate array of items
  items:
    - product_name: "${FAKER.commerce.productName}"
      quantity: "${RANDOM_INT % 5 + 1}"
      price: "${FAKER.commerce.price}"

    - product_name: "${FAKER.commerce.productName}"
      quantity: "${RANDOM_INT % 5 + 1}"
      price: "${FAKER.commerce.price}"

    - product_name: "${FAKER.commerce.productName}"
      quantity: "${RANDOM_INT % 5 + 1}"
      price: "${FAKER.commerce.price}"
```

---

## 5. Event Messages (Kafka, RabbitMQ, etc.)

### Kafka Message with Mixed Fields

```yaml
flow:
  name: "Publish User Event"
  steps:
    - action: kafka_publish
      config:
        topic: "user.events"
        key: "${RANDOM_ID}"  # Partition key
        message:
          # Event metadata (static structure)
          event_id: "${FAKER.datatype.uuid}"
          event_type: "user.created"  # Static
          event_version: "1.0"  # Static
          timestamp: "${TIMESTAMP}"

          # Event payload (mix of static/dynamic)
          data:
            user_id: "${RANDOM_ID}"
            email: "${FAKER.internet.email}"
            name: "${FAKER.name.fullName}"
            age: "${FAKER.datatype.number(min: 18, max: 80)}"
            country: "US"  # Static
            signup_date: "${TIMESTAMP}"
            ip_address: "${FAKER.internet.ip}"
            user_agent: "${FAKER.internet.userAgent}"

            # Nested objects
            preferences:
              language: "en"
              currency: "USD"
              marketing_opt_in: "${FAKER.datatype.boolean}"

            # Arrays
            interests: ["technology", "sports", "music"]  # Static
            device_ids:
              - "${FAKER.datatype.uuid}"
              - "${FAKER.datatype.uuid}"

          # Tracing
          trace:
            correlation_id: "${RANDOM_ID}"
            source_system: "web-app"  # Static
            source_version: "2.1.0"  # Static
```

### Consume & Validate Event

```yaml
- action: kafka_consume
  config:
    topic: "user.events"
    timeout: 5s
    assert:
      # Validate structure
      - json_path: "$.event_type == 'user.created'"
      - json_path: "$.event_version == '1.0'"

      # Validate data types
      - json_path: "$.data.user_id exists"
      - json_path: "$.data.email contains '@'"
      - json_path: "$.data.age > 17"

      # Validate nested objects
      - json_path: "$.data.preferences.language == 'en'"
      - json_path: "$.data.device_ids.length == 2"
```

---

## 6. Response Assertions with Generated Data

### Save Generated Data for Later Validation

```yaml
flow:
  name: "Create and Verify User"
  steps:
    - id: create
      action: http_request
      config:
        method: POST
        url: "${API_URL}/users"
        body:
          email: "${FAKER.internet.email}"
          name: "${FAKER.name.fullName}"
          age: "${FAKER.datatype.number(min: 18, max: 80)}"
      save:
        # Save generated values for later comparison
        generated_email: "${body.email}"
        generated_name: "${body.name}"
        generated_age: "${body.age}"
        user_id: "$.id"  # From response

    - action: http_request
      config:
        method: GET
        url: "${API_URL}/users/${create.user_id}"
        assert:
          # Verify response matches what we sent
          - json_path: "$.email == '${create.generated_email}'"
          - json_path: "$.name == '${create.generated_name}'"
          - json_path: "$.age == ${create.generated_age}"
```

---

## 7. Data Factories & Builders

### Reusable Data Templates

```yaml
flow:
  name: "User Factory Pattern"

  # Define templates
  env:
    # Base user template
    BASE_USER:
      email: "${FAKER.internet.email}"
      username: "${FAKER.internet.userName}"
      password: "Test123!@#"
      profile:
        first_name: "${FAKER.name.firstName}"
        last_name: "${FAKER.name.lastName}"
        phone: "${FAKER.phone.phoneNumber}"

    # Admin user template (inherits from BASE_USER)
    ADMIN_USER:
      <<: ${BASE_USER}  # Merge operator
      role: "admin"
      permissions: ["read", "write", "delete"]

    # Basic user template
    BASIC_USER:
      <<: ${BASE_USER}
      role: "user"
      permissions: ["read"]

  steps:
    - id: create_admin
      action: http_request
      config:
        method: POST
        url: "${API_URL}/users"
        body: ${ADMIN_USER}

    - id: create_user
      action: http_request
      config:
        method: POST
        url: "${API_URL}/users"
        body: ${BASIC_USER}
```

---

## 8. Advanced Examples

### E-commerce Order with Multiple Products

```yaml
flow:
  name: "Create Complex Order"
  steps:
    - action: http_request
      config:
        method: POST
        url: "${API_URL}/orders"
        body:
          # Order metadata
          order_id: "${FAKER.datatype.uuid}"
          order_date: "${TIMESTAMP}"
          status: "pending"

          # Customer info (all dynamic)
          customer:
            customer_id: "${RANDOM_ID}"
            email: "${FAKER.internet.email}"
            name: "${FAKER.name.fullName}"
            phone: "${FAKER.phone.phoneNumber}"

            shipping_address:
              street: "${FAKER.address.streetAddress}"
              city: "${FAKER.address.city}"
              state: "${FAKER.address.state}"
              zip: "${FAKER.address.zipCode}"
              country: "US"

            billing_address:
              street: "${FAKER.address.streetAddress}"
              city: "${FAKER.address.city}"
              state: "${FAKER.address.state}"
              zip: "${FAKER.address.zipCode}"
              country: "US"

          # Line items (mix of static structure, dynamic values)
          items:
            - product_id: "${FAKER.datatype.uuid}"
              product_name: "${FAKER.commerce.productName}"
              quantity: "${FAKER.datatype.number(min: 1, max: 5)}"
              unit_price: "${FAKER.commerce.price}"
              color: "${FAKER.commerce.color}"
              size: "L"  # Static

            - product_id: "${FAKER.datatype.uuid}"
              product_name: "${FAKER.commerce.productName}"
              quantity: "${FAKER.datatype.number(min: 1, max: 5)}"
              unit_price: "${FAKER.commerce.price}"
              color: "${FAKER.commerce.color}"
              size: "M"

            - product_id: "${FAKER.datatype.uuid}"
              product_name: "${FAKER.commerce.productName}"
              quantity: "${FAKER.datatype.number(min: 1, max: 5)}"
              unit_price: "${FAKER.commerce.price}"
              color: "${FAKER.commerce.color}"
              size: "S"

          # Payment info
          payment:
            method: "credit_card"  # Static
            card_number: "${FAKER.finance.creditCardNumber}"
            card_holder: "${FAKER.name.fullName}"
            expiry_date: "${FAKER.date.future.substring(0, 7)}"  # YYYY-MM
            cvv: "${FAKER.finance.creditCardCVV}"
            amount: "${FAKER.finance.amount}"
            currency: "USD"

          # Tracking
          tracking:
            ip_address: "${FAKER.internet.ip}"
            user_agent: "${FAKER.internet.userAgent}"
            session_id: "${FAKER.datatype.uuid}"
            referrer: "${FAKER.internet.url}"
```

### IoT Device Telemetry Event

```yaml
flow:
  name: "IoT Sensor Data"
  steps:
    - action: kafka_publish
      config:
        topic: "iot.telemetry"
        message:
          # Device info
          device_id: "sensor-${RANDOM_INT}"
          device_type: "temperature_sensor"  # Static
          firmware_version: "1.2.3"  # Static

          # Timestamp
          timestamp: "${TIMESTAMP}"
          timestamp_unix: "${TIMESTAMP_UNIX}"

          # Sensor readings (simulated realistic values)
          readings:
            temperature: "${FAKER.datatype.number(min: 15, max: 35)}.${FAKER.datatype.number(min: 0, max: 99)}"
            humidity: "${FAKER.datatype.number(min: 30, max: 80)}.${FAKER.datatype.number(min: 0, max: 99)}"
            pressure: "${FAKER.datatype.number(min: 980, max: 1040)}.${FAKER.datatype.number(min: 0, max: 99)}"
            battery_level: "${FAKER.datatype.number(min: 0, max: 100)}"
            signal_strength: "${FAKER.datatype.number(min: -100, max: -30)}"

          # Location
          location:
            latitude: "${FAKER.address.latitude}"
            longitude: "${FAKER.address.longitude}"
            altitude: "${FAKER.datatype.number(min: 0, max: 1000)}"

          # Metadata
          metadata:
            measurement_id: "${FAKER.datatype.uuid}"
            sequence_number: "${RANDOM_INT}"
            quality_score: "${FAKER.datatype.number(min: 85, max: 100)}"
            calibration_date: "${FAKER.date.recent}"
```

---

## 9. Data Generation Configuration

### Global Faker Settings

```yaml
flow:
  name: "Localized Data Generation"

  config:
    faker:
      locale: "en_US"  # Options: en_US, en_GB, fr_FR, de_DE, es_ES, etc.
      seed: 12345      # For reproducible random data (optional)

  steps:
    - action: http_request
      config:
        body:
          name: "${FAKER.name.fullName}"     # US-style name
          phone: "${FAKER.phone.phoneNumber}" # US phone format
          address: "${FAKER.address.city}"   # US city
```

### Custom Data Ranges

```yaml
body:
  # Number ranges
  age: "${FAKER.datatype.number(min: 18, max: 80)}"
  score: "${FAKER.datatype.number(min: 0, max: 100, precision: 0.01)}"  # 45.23

  # Date ranges
  signup_date: "${FAKER.date.between('2023-01-01', '2024-12-31')}"

  # Array length
  tags: "${FAKER.random.words(5)}"  # 5 random words
```

---

## 10. Best Practices

### ✅ DO

1. **Use Faker for realistic data**
   ```yaml
   email: "${FAKER.internet.email}"  # Good: realistic email
   ```

2. **Mix static and dynamic fields appropriately**
   ```yaml
   body:
     type: "user"  # Static: business logic
     email: "${FAKER.internet.email}"  # Dynamic: test data
   ```

3. **Save generated values for assertions**
   ```yaml
   save:
     generated_email: "${body.email}"
   ```

4. **Use templates for repeated structures**
   ```yaml
   env:
     USER_TEMPLATE:
       name: "${FAKER.name.fullName}"
       email: "${FAKER.internet.email}"
   ```

### ❌ DON'T

1. **Don't hardcode test data that should be unique**
   ```yaml
   email: "test@example.com"  # Bad: will conflict on reruns
   ```

2. **Don't use RANDOM_* when Faker is more appropriate**
   ```yaml
   name: "${RANDOM_STRING}"  # Bad: not realistic
   name: "${FAKER.name.fullName}"  # Good: realistic
   ```

3. **Don't over-complicate simple tests**
   ```yaml
   # If you just need a valid email, this is fine:
   email: "test+${RANDOM_INT}@example.com"
   ```

---

## 11. Implementation Details

### Faker Library

**Language**: JavaScript (Faker.js)

**Installation**:
```bash
npm install @faker-js/faker
```

**Usage in TestMesh**:
```go
// internal/runner/variables/faker.go
package variables

import "github.com/jaswdr/faker"

func ResolveFaker(expression string) string {
    fake := faker.New()

    switch expression {
    case "FAKER.name.firstName":
        return fake.Person().FirstName()
    case "FAKER.internet.email":
        return fake.Internet().Email()
    // ... more cases
    }
}
```

### Variable Resolution Order

1. Check for `${FAKER.*}` → Call Faker library
2. Check for `${RANDOM_*}` → Generate random value
3. Check for `${TIMESTAMP*}` → Get current time
4. Check environment variables
5. Check step outputs
6. Return error if not found

---

## Summary

TestMesh provides comprehensive data generation for:

✅ **Large JSON payloads** - 10+ parameters with ease
✅ **Realistic test data** - Faker library integration
✅ **Mixed static/dynamic fields** - Full control
✅ **HTTP requests** - Complex request bodies
✅ **Event messages** - Kafka, RabbitMQ, etc.
✅ **Response assertions** - Validate generated data
✅ **Templates & factories** - Reusable patterns

**All supported actions**: HTTP, Database, Kafka, gRPC, WebSocket, Browser, MCP
