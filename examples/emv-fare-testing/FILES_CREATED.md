# EMV Fare Testing Examples - Files Created

## Summary

All example flows for EMV contactless payment fare calculation testing have been saved and are ready to use!

## File Structure

```
examples/emv-fare-testing/
├── README.md                                 ✅ Complete guide and documentation
├── FILES_CREATED.md                          ✅ This file
├── .env.example                              ✅ Environment variables template
│
├── flows/                                    ✅ Test flow definitions
│   ├── daily-fare-cap.yaml                  ✅ Daily cap with 3 taps
│   ├── weekly-fare-cap.yaml                 ✅ Weekly cap across multiple days
│   ├── compensation-refund.yaml             ✅ Compensation for missed tap-out
│   ├── enrollment-green-ticket.yaml         ✅ Green ticket enrollment & discount
│   ├── all-scenarios-data-driven.yaml       ✅ Data-driven all scenarios
│   ├── data-driven-clean.yaml               ✅ Data-driven (pass entire objects)
│   ├── data-driven-file-refs.yaml           ✅ Data-driven (file references & glob)
│   ├── manual-cutoff-test.yaml              ✅ Trigger cutoff via HTTP API
│   └── http-api-patterns.yaml               ✅ HTTP request pattern examples
│
├── data/                                     ✅ Test data files
│   ├── daily_card_3_taps.json               ✅ Daily cap test data
│   └── all_fare_scenarios.json              ✅ 10 different test scenarios
│
├── mocks/                                    ✅ Mock API configurations
│   └── payment-gateway.yaml                 ✅ Payment gateway mock with test cards
│
└── shared/                                   ✅ Reusable components
    ├── fare-test-template.yaml              ✅ Reusable fare test sub-flow (v1)
    └── fare-test-template-v2.yaml           ✅ Enhanced template (accepts objects/files)
```

## Files Created (18 total)

### 1. Documentation
- ✅ **README.md** - Complete guide with examples, patterns, troubleshooting
- ✅ **FILES_CREATED.md** - This file
- ✅ **.env.example** - Environment configuration template

### 2. Test Flows (10 flows)
- ✅ **daily-fare-cap.yaml** - Tests daily fare cap with 3 tap events
- ✅ **weekly-fare-cap.yaml** - Tests weekly fare cap across multiple days
- ✅ **compensation-refund.yaml** - Tests compensation for missed tap-out
- ✅ **enrollment-green-ticket.yaml** - Tests green ticket enrollment and discounts
- ✅ **all-scenarios-data-driven.yaml** - Runs multiple scenarios from JSON data (original approach)
- ✅ **data-driven-clean.yaml** - Data-driven testing with entire object passing (no field mapping)
- ✅ **data-driven-file-refs.yaml** - Data-driven testing with file references and glob patterns
- ✅ **manual-cutoff-test.yaml** - Trigger cutoff immediately via HTTP API instead of waiting
- ✅ **http-api-patterns.yaml** - 15 common HTTP request patterns for testing
- ✅ **test-with-mock-apis.yaml** - Complete test using mock payment gateway, fraud detection, and enrollment services

### 3. Test Data (2 files)
- ✅ **daily_card_3_taps.json** - Test data for daily cap scenario
- ✅ **all_fare_scenarios.json** - 10 different test scenarios including:
  - Single journey (30 min & 60 min tickets)
  - Daily caps (3 & 5 taps)
  - Weekly cap (20 trips)
  - Night fare (off-peak)
  - Green ticket discount
  - Compensation scenarios
  - Two tickets same card
  - Cross-zone fares

### 4. Mock API Configurations (1 file)
- ✅ **payment-gateway.yaml** - Reusable payment gateway mock with multiple test cards (success, decline, insufficient funds, expired)

### 5. Shared Components (2 files)
- ✅ **fare-test-template.yaml** - Reusable sub-flow for fare testing (v1 - explicit field mapping)
- ✅ **fare-test-template-v2.yaml** - Enhanced template that accepts entire objects or file references

## Quick Start

### 1. Setup Environment
```bash
cd examples/emv-fare-testing
cp .env.example .env
# Edit .env with your configuration
```

### 2. Run Single Test
```bash
testmesh run flows/daily-fare-cap.yaml
```

### 3. Run All Scenarios
```bash
testmesh run flows/all-scenarios-data-driven.yaml
```

### 4. Run with Tags
```bash
testmesh run flows/ --tag daily_cap
testmesh run flows/ --tag compensation
```

### 5. Run HTTP Examples
```bash
# Trigger manual cutoff
testmesh run flows/manual-cutoff-test.yaml

# View HTTP patterns
testmesh run flows/http-api-patterns.yaml
```

### 6. Run Data-Driven Tests (New Approaches)
```bash
# Clean approach - pass entire objects
testmesh run flows/data-driven-clean.yaml

# File reference approach - use glob patterns
testmesh run flows/data-driven-file-refs.yaml
```

## What Each Flow Does

### daily-fare-cap.yaml
**Purpose**: Test daily fare cap with 3 tap events
**Flow**:
1. Send tap 1 (entry at Station A)
2. Wait 30 minutes
3. Send tap 2 (exit at Station B)
4. Wait 60 minutes
5. Send tap 3 (entry at Station C)
6. Verify daily cap applied (max $5.00)
7. Verify in database

**Key Features**:
- Kafka produce/consume with timeout
- Database polling
- Setup/teardown
- Variable interpolation

### weekly-fare-cap.yaml
**Purpose**: Test weekly fare cap across multiple days
**Flow**:
1. Send 5 trips on Monday
2. Send 4 trips on Tuesday-Friday
3. Verify weekly cap reached ($25.00)
4. Test no additional charge after cap

**Key Features**:
- Nested for_each loops
- Multi-day simulation
- Weekly summary verification

### compensation-refund.yaml
**Purpose**: Test compensation when user forgets to tap out
**Flow**:
1. Send entry tap only (no exit)
2. Verify maximum fare charged
3. Send late exit tap next day
4. Verify compensation calculated and issued
5. Verify final balance

**Key Features**:
- Missed tap-out handling
- Compensation calculation
- Multiple Kafka topics (fares, compensation, notifications)

### enrollment-green-ticket.yaml
**Purpose**: Test green ticket program enrollment and discounts
**Flow**:
1. Test regular fare before enrollment
2. Enroll card via API
3. Verify enrollment in database
4. Test discounted fare (50% off)
5. Verify discount calculation
6. Test unenrollment
7. Verify regular fare restored

**Key Features**:
- HTTP API calls
- Discount validation
- Enrollment lifecycle

### all-scenarios-data-driven.yaml
**Purpose**: Run multiple scenarios from JSON data
**Flow**:
1. Load test scenarios from JSON
2. For each scenario:
   - Run fare-test-template sub-flow
   - Verify results
   - Log outcome
3. Generate summary

**Key Features**:
- Data-driven testing
- Sub-flow composition
- Parallel test execution capability

### data-driven-clean.yaml
**Purpose**: Cleaner data-driven approach by passing entire objects
**Flow**:
1. Load scenarios from JSON file via `data_source`
2. For each scenario, pass entire object to sub-flow
3. No field mapping needed - all fields accessible automatically

**Key Features**:
- Pass entire data objects via `input: "${scenario}"`
- Zero field mapping boilerplate
- Cleaner, more maintainable tests

### data-driven-file-refs.yaml
**Purpose**: Data-driven testing using file path references
**Flow**:
Shows 3 approaches:
1. Direct file reference: `input_file: "data/daily_card_3_taps.json"`
2. Loop through file list with dynamic paths
3. Glob pattern: `items_from_glob: "data/*.json"` to run all files

**Key Features**:
- Reference files by path instead of loading data
- Glob pattern support for batch execution
- Dynamic file path interpolation

### manual-cutoff-test.yaml
**Purpose**: Trigger cutoff immediately via HTTP API instead of waiting for scheduled cutoff
**Flow**:
1. Send test tap events to multiple cards
2. Trigger cutoff via HTTP POST to `/admin/cutoff/trigger`
3. Poll cutoff job status via HTTP GET
4. Wait for cutoff completion via Kafka event
5. Verify fare calculations in database
6. Get batch summary via HTTP API

**Key Features**:
- HTTP POST with authentication headers
- Async job status polling with HTTP
- Combined HTTP + Kafka verification
- Rollback on test failure
- Batch processing verification

### http-api-patterns.yaml
**Purpose**: Comprehensive examples of HTTP request patterns for testing
**Contains 15 patterns**:
1. Simple GET (health check)
2. POST with JSON body and auth headers
3. PUT to update resources
4. GET with query parameters
5. HTTP polling for async job status
6. DELETE requests
7. POST with form data (URL encoded)
8. Batch operations with arrays
9. Conditional requests (when clause)
10. Retry on failure with exponential backoff
11. Response validation with JSON Schema
12. Webhook simulation
13. Binary response (download report)
14. Loop through multiple HTTP calls
15. GraphQL requests

**Key Features**:
- Complete HTTP method coverage
- Authentication patterns (Bearer token)
- Polling with success conditions
- Error handling and retries
- Schema validation
- Form data and GraphQL support

### test-with-mock-apis.yaml
**Purpose**: Complete integration test using mock servers for all external APIs
**Flow**:
1. Start 3 mock servers:
   - Payment Gateway (port 9000) with multiple test cards
   - Fraud Detection Service (port 9001) with risk scoring
   - Card Enrollment Service (port 9002) with stateful tracking
2. Configure fare service to use mock URLs
3. Test successful payment with low-risk transaction
4. Verify payment gateway and fraud detection were called
5. Test declined payment (amount exceeds limit)
6. Enroll card in green ticket program (stateful mock)
7. Verify discount is applied to subsequent fares
8. Simulate payment gateway failure and verify retry logic
9. Stop all mock servers and cleanup

**Key Features**:
- **Built-in mock servers** - no external tools required
- **Stateful mocking** - enrollment service tracks enrolled cards
- **Request matching** - different responses based on card number, amount
- **Delays** - simulate network latency
- **Request verification** - assert which APIs were called and how many times
- **Mock updates** - change mock behavior mid-test to simulate failures
- **Multiple mock servers** - run 3 mocks simultaneously on different ports
- **External mock configs** - can load from `mocks/payment-gateway.yaml`

## Test Data Scenarios

The `all_fare_scenarios.json` includes:

1. **Single Journey - 30 Minute Ticket** ($2.50)
2. **Single Journey - 60 Minute Ticket** ($3.50)
3. **Daily Cap - 3 Taps** ($5.00)
4. **Daily Cap - 5 Taps** ($5.00)
5. **Weekly Cap - 20 Trips** ($25.00)
6. **Night Fare - Off Peak** ($1.50)
7. **Green Ticket - 50% Discount** ($1.25)
8. **Compensation - Missed Tap Out** ($10.00)
9. **Two Tickets - Same Card** ($7.00)
10. **Cross-Zone Fare** ($4.50)

## Key Patterns Demonstrated

### Pattern 1: Kafka Produce → Consume → Database Verify
```yaml
- kafka_publish (send tap)
- kafka_consume (wait for fare, timeout: 10s)
- database_query (verify, with polling)
```

### Pattern 2: Data-Driven Testing
```yaml
- Load JSON test data
- for_each over scenarios
- Run sub-flow with parameters
- Verify results
```

### Pattern 3: Async Processing with Timeout
```yaml
- kafka_consume:
    timeout: 10s
    match:
      json_path: ["$.pan == '...'"]
```

### Pattern 4: Database Polling
```yaml
- database_query:
    poll:
      enabled: true
      timeout: 15s
      interval: 2s
```

### Pattern 5: Setup/Teardown
```yaml
setup:
  - Clean test data
  - Reset state

teardown:
  - Send cutoff
  - Cleanup test data
```

### Pattern 6: HTTP Request with Polling
```yaml
- http_request:
    method: POST
    url: "${API_URL}/admin/cutoff/trigger"
    headers:
      Authorization: "Bearer ${API_KEY}"
    body:
      cutoff_type: "daily"
  output:
    job_id: "$.job_id"

- http_request:
    method: GET
    url: "${API_URL}/admin/jobs/${job_id}"
    poll:
      enabled: true
      timeout: 60s
      interval: 5s
      success_condition: "$.status == 'completed'"
```

### Pattern 7: Data-Driven with Entire Objects
```yaml
# Load data once
data_source:
  type: "json"
  file: "data/scenarios.json"

# Pass entire objects - no field mapping!
- for_each:
    items: "${data}"
    item_name: "scenario"
    steps:
      - run_flow:
          flow: "test-template"
          input: "${scenario}"  # All fields available
```

### Pattern 8: Data-Driven with File References
```yaml
# Approach 1: Direct file reference
- run_flow:
    flow: "test-template"
    input_file: "data/test1.json"

# Approach 2: Glob pattern
- for_each:
    items_from_glob: "data/*.json"
    item_name: "file_path"
    steps:
      - run_flow:
          input_file: "${file_path}"
```

## Benefits Over Ginkgo/Go

✅ **No code required** - YAML configuration
✅ **Visual flow editor** - Drag-and-drop test creation
✅ **Built-in async handling** - Kafka consume with timeout
✅ **Database polling** - Wait for eventual consistency
✅ **Better observability** - Real-time execution timeline
✅ **Easier maintenance** - Non-developers can update tests
✅ **Advanced reporting** - Trends, flaky detection, coverage

## Migration Path

1. **Start small**: Convert `daily-fare-cap.yaml` first
2. **Add complexity**: Add `compensation-refund.yaml`
3. **Go data-driven**: Use `all-scenarios-data-driven.yaml`
4. **Visual editing**: Use TestMesh UI for new scenarios
5. **Team collaboration**: Share flows with team

## Next Steps

1. **Configure .env** - Set Kafka and database connection
2. **Start infrastructure** - Kafka, PostgreSQL, fare service
3. **Run first test** - `testmesh run flows/daily-fare-cap.yaml`
4. **Check results** - View HTML report
5. **Add more scenarios** - Customize for your system

## Support

- Main README: `README.md`
- TestMesh Docs: `../../README.md`
- Async Patterns: `../../ASYNC_PATTERNS.md`
- Data Generation: `../../DATA_GENERATION.md`

---

**All files ready to use!** 🚀

Start testing your EMV fare calculation system with TestMesh today!
