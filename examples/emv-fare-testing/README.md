# EMV Fare Calculation Test Suite Examples

> **Real-world example: Testing a contactless payment fare calculation system for public transit**

## Overview

This directory contains example TestMesh flows for testing an EMV (Europay, Mastercard, Visa) contactless payment fare calculation system for public transit. These examples demonstrate how to migrate from a Ginkgo-based Go testing framework to TestMesh.

## System Under Test

A public transit system that:
- Accepts contactless payment cards (tap-in/tap-out)
- Calculates fares based on various rules
- Applies daily and weekly fare caps
- Supports special programs (green tickets, enrollment)
- Processes transactions via Kafka
- Stores results in PostgreSQL

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│   Payment   │ Kafka   │     Fare     │ Kafka   │   Database   │
│   Terminal  │────────>│  Calculator  │────────>│  (Postgres)  │
│   (Tap)     │ matches │   Service    │  fares  │              │
└─────────────┘         └──────────────┘         └──────────────┘
```

## Test Scenarios

### Basic Scenarios
1. **daily-fare-cap.yaml** - Daily fare cap with 3 taps
2. **single-fare.yaml** - Single journey fare calculation
3. **weekly-fare-cap.yaml** - Weekly cap across multiple days

### Advanced Scenarios
4. **compensation-refund.yaml** - Compensation for missed tap-out
5. **enrollment-green-ticket.yaml** - Green ticket program enrollment
6. **batch-cutoff.yaml** - Batch processing and end-of-day cutoff
7. **unmatched-fare.yaml** - Unmatched transaction handling

### Data-Driven
8. **all-scenarios-data-driven.yaml** - Run multiple scenarios from JSON data
9. **parallel-card-tests.yaml** - Test multiple cards simultaneously

## File Structure

```
examples/emv-fare-testing/
├── README.md                          # This file
├── flows/
│   ├── daily-fare-cap.yaml           # Daily fare cap test
│   ├── weekly-fare-cap.yaml          # Weekly fare cap test
│   ├── compensation-refund.yaml      # Compensation scenario
│   ├── enrollment-green-ticket.yaml  # Enrollment test
│   ├── batch-cutoff.yaml             # Batch processing
│   ├── unmatched-fare.yaml           # Unmatched transactions
│   ├── all-scenarios-data-driven.yaml # Data-driven tests
│   └── parallel-card-tests.yaml      # Parallel execution
├── data/
│   ├── daily_card_3_taps.json        # Test data for daily cap
│   ├── weekly_fare_scenarios.json    # Weekly cap test data
│   ├── all_fare_scenarios.json       # All scenarios data
│   └── fare_rules.json               # Fare rule definitions
├── shared/
│   └── fare-test-template.yaml       # Reusable sub-flow
└── .env.example                       # Environment variables template
```

## Prerequisites

### Infrastructure
- Kafka cluster running (or local docker-compose)
- PostgreSQL database
- Fare calculation service deployed

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Kafka
KAFKA_BROKERS=localhost:9092

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=fare_system
DB_USER=postgres
DB_PASS=password

# API
FARE_API_URL=http://localhost:5016
```

## Running the Tests

### Run Single Test
```bash
testmesh run flows/daily-fare-cap.yaml
```

### Run All Tests
```bash
testmesh run flows/ --suite emv_fare
```

### Run with Specific Tag
```bash
testmesh run flows/ --tag daily_cap
testmesh run flows/ --tag compensation
```

### Run Data-Driven Tests
```bash
testmesh run flows/all-scenarios-data-driven.yaml
```

### Watch Mode (for development)
```bash
testmesh watch flows/daily-fare-cap.yaml
```

## Test Data Format

### Daily Fare Cap Test Data

**File**: `data/daily_card_3_taps.json`
```json
{
  "test_name": "Daily Cap - 3 Taps",
  "pan": "TEST_CARD_001",
  "expected_fare": 5.00,
  "taps": 3,
  "product_id": "daily_cap",
  "intervals_minutes": [30, 60],
  "batch_type": "regular",
  "stations": ["STATION_A", "STATION_B", "STATION_C"]
}
```

### Weekly Fare Cap Test Data

**File**: `data/weekly_fare_scenarios.json`
```json
{
  "test_name": "Weekly Cap - 5 Days",
  "pan": "WEEKLY_CARD_001",
  "expected_total": 25.00,
  "days": 5,
  "trips_per_day": 4,
  "cap_threshold": 25.00
}
```

## Key Features Demonstrated

### 1. Kafka Integration
- Publishing match events (tap-in/tap-out)
- Consuming fare calculation results
- Timeout handling for async processing
- Message key and JSON matching

### 2. Database Validation
- Querying fare results
- Polling for eventual consistency
- Complex SQL queries with aggregations
- Transaction validation

### 3. Async Testing
- Wait for Kafka messages with timeout
- Database polling patterns
- Time-based simulations
- Event ordering

### 4. Data-Driven Testing
- JSON test data files
- Variable substitution
- Loop over test cases
- Parameterized flows

### 5. Complex Flows
- Multi-step scenarios
- Conditional logic
- Setup/teardown
- Sub-flow composition
- Parallel execution

### 6. Assertions
- Fare amount validation
- Rule application checks
- Timestamp verification
- Status checks
- Count validations

## Common Patterns

### Pattern 1: Send Tap → Consume Fare → Verify DB

```yaml
steps:
  # 1. Send tap event
  - action: kafka_publish
    config:
      topic: "matches"
      value: { pan: "...", tap_type: "entry" }

  # 2. Consume fare result
  - action: kafka_consume
    config:
      topic: "fares"
      timeout: 10s
      match: { json_path: ["$.pan == '...'"]}

  # 3. Verify in database
  - action: database_query
    config:
      query: "SELECT * FROM emv_sales WHERE pan = ?"
      poll: { enabled: true, timeout: 15s }
```

### Pattern 2: Time-Based Scenarios

```yaml
steps:
  # Send first tap
  - action: kafka_publish
    config: { ... }

  # Simulate 30 minutes
  - action: delay
    config: { duration: "30s" }

  # Send second tap
  - action: kafka_publish
    config: { ... }
```

### Pattern 3: Batch Processing

```yaml
steps:
  # Send multiple transactions
  - action: for_each
    config:
      range: { start: 1, end: 100 }
      steps:
        - action: kafka_publish

  # Trigger cutoff
  - action: kafka_publish
    config:
      topic: "cutoff"

  # Verify batch completion
  - action: kafka_consume
    config:
      topic: "batch_complete"
      timeout: 60s
```

## Troubleshooting

### Tests Timing Out?
- Check Kafka broker connectivity
- Verify fare calculation service is running
- Increase timeout values in `kafka_consume`
- Check database polling intervals

### Wrong Fare Amounts?
- Verify test data `expected_fare` values
- Check fare rules in the system
- Look at fare calculation logs
- Use `database_query` to inspect intermediate results

### Kafka Messages Not Consumed?
- Verify topic names match
- Check consumer group IDs are unique
- Use `from_beginning: true` for debugging
- Check message key matching

### Database Assertions Failing?
- Enable polling with longer timeout
- Check SQL query syntax
- Verify database connection
- Look at actual vs expected values in logs

## Migration from Ginkgo

### Before (Ginkgo/Go)
```go
It("should calculate daily fare cap", func() {
    // Send 3 taps
    for i := 0; i < 3; i++ {
        sendTap(pan, stationID)
        time.Sleep(30 * time.Minute)
    }

    // Wait for fare
    fare := consumeFare(pan, 10*time.Second)
    Expect(fare.Amount).To(Equal(5.00))

    // Verify DB
    var sale EMVSale
    db.Where("pan = ?", pan).First(&sale)
    Expect(sale.Rule).To(Equal("daily_cap"))
})
```

### After (TestMesh)
```yaml
steps:
  - action: for_each
    config:
      range: { start: 1, end: 3 }
      steps:
        - action: kafka_publish
          config: { topic: "matches" }
        - action: delay
          config: { duration: "30s" }

  - action: kafka_consume
    config:
      topic: "fares"
      timeout: 10s
    assert:
      - result.amount == 5.00

  - action: database_query
    config:
      query: "SELECT * FROM emv_sales WHERE pan = ?"
    assert:
      - result.rows[0].rule == "daily_cap"
```

**Benefits:**
- ✅ No code required
- ✅ Visual flow editor available
- ✅ Better async handling
- ✅ Built-in reporting
- ✅ Easier maintenance

## Advanced Topics

### Custom Assertions
Use JSON Schema for complex validations:
```yaml
assert:
  - response.body matches_schema_file: "schemas/fare_response.json"
```

### Mock Fare Service
For testing edge cases:
```yaml
mock_server:
  name: "Fare Calculator Mock"
  endpoints:
    - path: "/calculate"
      response:
        body: { amount: 5.00, rule: "daily_cap" }
```

### Contract Testing
Verify fare service API contracts:
```yaml
contract:
  enabled: true
  consumer: "transit_terminal"
  provider: "fare_calculator"
```

## Support

- Documentation: [TestMesh Docs](../README.md)
- Kafka Testing: [ASYNC_PATTERNS.md](../../ASYNC_PATTERNS.md)
- Database Testing: [YAML_SCHEMA.md](../../YAML_SCHEMA.md)
- Data Generation: [DATA_GENERATION.md](../../DATA_GENERATION.md)

## Related Examples

- [Microservices Integration](../microservices/) - Service-to-service testing
- [Event-Driven Systems](../event-driven/) - Kafka patterns
- [API Testing](../api-testing/) - REST API examples

---

**Ready to migrate your test suite?** Start with `daily-fare-cap.yaml` and gradually convert your existing tests! 🚀
