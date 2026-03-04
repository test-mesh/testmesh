# Advanced Reporting & Analytics

> **Comprehensive test reports with trends, analytics, and insights**

## Overview

TestMesh provides advanced reporting capabilities that go beyond pass/fail results. Get detailed insights into test execution, performance trends, flaky tests, and more.

---

## Report Types

### 1. HTML Reports

Beautiful, interactive HTML reports with all test details.

```bash
# Generate HTML report
testmesh run suite.yaml --report html --output reports/

# Open report
open reports/index.html
```

**Report Structure:**
```
reports/
├── index.html           # Main dashboard
├── execution/
│   ├── details.html     # Execution details
│   └── timeline.html    # Execution timeline
├── flows/
│   ├── flow-1.html      # Per-flow details
│   └── flow-2.html
├── assets/
│   ├── styles.css
│   ├── scripts.js
│   └── screenshots/     # Browser test screenshots
└── data/
    └── results.json     # Raw data
```

### 2. Console Output

```bash
# Run with pretty console output
testmesh run suite.yaml --reporter console

# Output:
#
# TestMesh v1.0.0
#
# Running Suite: User API Tests
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# ✓ Create User                    245ms
# ✓ Get User by ID                 123ms
# ✗ Update User Email              512ms
#   └─ Assertion failed: status == 200
#      Expected: 200
#      Actual:   400
# ✓ Delete User                    189ms
#
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Results: 3 passed, 1 failed (4 total)
# Duration: 1.069s
```

### 3. JUnit XML

For CI/CD integration.

```bash
testmesh run suite.yaml --report junit --output junit.xml
```

**junit.xml:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="User API Tests" tests="4" failures="1" time="1.069">
  <testsuite name="User Management" tests="4" failures="1" time="1.069">
    <testcase name="Create User" time="0.245"/>
    <testcase name="Get User by ID" time="0.123"/>
    <testcase name="Update User Email" time="0.512">
      <failure message="Assertion failed: status == 200">
        Expected: 200
        Actual:   400
      </failure>
    </testcase>
    <testcase name="Delete User" time="0.189"/>
  </testsuite>
</testsuites>
```

### 4. JSON Report

Machine-readable format for custom processing.

```bash
testmesh run suite.yaml --report json --output results.json
```

**results.json:**
```json
{
  "summary": {
    "total": 4,
    "passed": 3,
    "failed": 1,
    "skipped": 0,
    "duration": 1069,
    "pass_rate": 0.75
  },
  "flows": [
    {
      "id": "create_user",
      "name": "Create User",
      "status": "passed",
      "duration": 245,
      "steps": [...],
      "assertions": [...]
    },
    ...
  ],
  "errors": [
    {
      "flow": "update_user_email",
      "step": "update_email",
      "message": "Assertion failed: status == 200",
      "details": {
        "expected": 200,
        "actual": 400
      }
    }
  ]
}
```

### 5. PDF Report

Executive summary for stakeholders.

```bash
testmesh run suite.yaml --report pdf --output report.pdf
```

---

## HTML Report Features

### Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│ TestMesh Report - User API Tests                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Summary                                                    │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐ │
│  │  Total   │  Passed  │  Failed  │ Skipped  │ Duration │ │
│  │    4     │    3     │    1     │    0     │  1.07s   │ │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘ │
│                                                             │
│  Pass Rate: 75%  [███████░░░] ─────────────────┐          │
│                                                  │          │
│  Flows                                          │          │
│  ┌────────────────────────────────────────────┐│          │
│  │ ✓ Create User                      245ms   ││  Charts  │
│  │ ✓ Get User by ID                   123ms   ││          │
│  │ ✗ Update User Email                512ms   ││  [Pie]   │
│  │ ✓ Delete User                      189ms   ││  [Bar]   │
│  └────────────────────────────────────────────┘│          │
│                                                 │          │
│  Environment: staging                           │          │
│  Date: 2026-02-09 10:30:45                     │          │
│  Agent: local                                   │          │
└─────────────────────────────────────────────────┴─────────┘
```

### Flow Details

```
┌─────────────────────────────────────────────────────────────┐
│ Flow: Update User Email                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Status: ✗ Failed                                           │
│  Duration: 512ms                                            │
│  Started: 2026-02-09 10:30:45                              │
│                                                             │
│  Steps                                                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 1. Get User            ✓ Passed    123ms             │  │
│  │ 2. Update Email        ✗ Failed    389ms             │  │
│  │    └─ Assertion failed: status == 200                │  │
│  │       Expected: 200                                   │  │
│  │       Actual:   400                                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  Request Details (Step 2)                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ POST /users/123                                       │  │
│  │                                                       │  │
│  │ Headers:                                              │  │
│  │   Content-Type: application/json                     │  │
│  │   Authorization: Bearer ***                           │  │
│  │                                                       │  │
│  │ Body:                                                 │  │
│  │   {                                                   │  │
│  │     "email": "newemail@example.com"                  │  │
│  │   }                                                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  Response Details                                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Status: 400 Bad Request                              │  │
│  │ Time: 389ms                                           │  │
│  │                                                       │  │
│  │ Body:                                                 │  │
│  │   {                                                   │  │
│  │     "error": "Email already in use"                  │  │
│  │   }                                                   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Execution Timeline

Visual timeline of test execution with waterfall view.

```
Time ────────────────────────────────────────────────────────>
0ms   500ms  1000ms 1500ms 2000ms

Create User      [██████████]
Get User                      [████]
Update Email                       [████████████████]
Delete User                                         [██████]
```

### Screenshot Gallery

For browser tests, display all captured screenshots.

```
┌──────────────────────────────────────────────────────────┐
│ Screenshots                                              │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Login     │  │  Dashboard  │  │   Profile   │    │
│  │   Page      │  │   View      │  │   Modal     │    │
│  │  [image]    │  │  [image]    │  │  [image]    │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
│   Step 1            Step 3            Step 5           │
└──────────────────────────────────────────────────────────┘
```

---

## Historical Trends

### Pass Rate Over Time

Track test stability over multiple runs.

```yaml
# Enable trend tracking
testmesh run suite.yaml --save-history
```

**Dashboard shows:**
```
Pass Rate Trend (Last 30 Days)
100% ┤                               ╭─╮
     │                          ╭────╯ ╰─╮
 75% │              ╭───────────╯        │
     │         ╭────╯                    │
 50% │    ╭────╯                         ╰─╮
     │╭───╯                                │
 25% ││                                    │
     ││                                    │
  0% ╰┴────────────────────────────────────╯
     Jan 10   Jan 20   Jan 30   Feb 9
```

### Duration Trends

Identify performance regressions.

```
Average Duration Trend (Last 30 Runs)
2s  ┤                                    ╭─
    │                               ╭────╯
1.5s│                          ╭────╯
    │                     ╭────╯
1s  │──────────────────────╯
    │
0.5s│
    │
0s  ╰──────────────────────────────────────
    #1   #10   #20   #30
```

### Flaky Test Detection

Automatically identify unstable tests.

```
Flaky Tests (Last 50 Runs)

┌──────────────────────────────────────────────────────────┐
│ Test: Update User Email                                  │
│ Flakiness: 23%  [🔴🔴🔴🟢🟢🟢🟢🟢🟢🟢]                  │
│                                                          │
│ Pass rate: 77% (38/50)                                   │
│ Fails:     23% (12/50)                                   │
│                                                          │
│ Recent runs:                                             │
│ ✓ ✓ ✗ ✓ ✓ ✓ ✗ ✓ ✗ ✓ ✓ ✓ ✓ ✓ ✗ ✓ ✓ ✓ ✓ ✓           │
│                                                          │
│ Common errors:                                           │
│ - Timeout waiting for response (8 times)                │
│ - Status code 500 (3 times)                             │
│ - Connection refused (1 time)                           │
└──────────────────────────────────────────────────────────┘
```

---

## Test Analytics

### Test Coverage by Tag

```
Test Coverage by Tag

┌─────────────────────────────────────────┐
│ Tag            Tests  Coverage  Status  │
├─────────────────────────────────────────┤
│ authentication   12      100%     ✓     │
│ payment           8       87%     ✓     │
│ user-mgmt        15       93%     ✓     │
│ orders            6       50%     ⚠     │
│ search            3       30%     ✗     │
└─────────────────────────────────────────┘
```

### API Endpoint Coverage

```
API Endpoint Coverage

┌────────────────────────────────────────────────────┐
│ Endpoint              Method  Tested  Last Run     │
├────────────────────────────────────────────────────┤
│ /users                POST    ✓       2m ago       │
│ /users/:id            GET     ✓       2m ago       │
│ /users/:id            PUT     ✓       2m ago       │
│ /users/:id            DELETE  ✓       2m ago       │
│ /users/:id/orders     GET     ✓       5m ago       │
│ /orders               POST    ✗       Never        │
│ /orders/:id           GET     ✗       Never        │
└────────────────────────────────────────────────────┘

Covered: 71% (5/7 endpoints)
```

### Most Failing Tests

```
Most Failing Tests (Last 30 Days)

1. Payment Processing      23 failures
2. Search API             18 failures
3. Order Creation         12 failures
4. Email Verification      8 failures
5. Profile Update          5 failures
```

### Slowest Tests

```
Slowest Tests (Average Duration)

1. Full Checkout Flow     5.2s
2. Data Import            3.8s
3. Report Generation      2.1s
4. Bulk User Creation     1.5s
5. Image Processing       1.2s
```

---

## Custom Reports

### Report Configuration

```yaml
# testmesh.config.yaml
reporting:
  # Output directory
  output_dir: "reports/"

  # Formats to generate
  formats:
    - html
    - junit
    - json

  # HTML customization
  html:
    theme: "light"  # light|dark
    logo: "assets/logo.png"
    title: "My API Tests"
    show_passed: true
    show_skipped: false
    group_by: "suite"  # suite|tag

  # History tracking
  history:
    enabled: true
    max_runs: 100
    database: "sqlite://reports/history.db"

  # Notifications
  notifications:
    slack:
      webhook: "${SLACK_WEBHOOK}"
      on_failure: true
      on_success: false
    email:
      to: ["team@example.com"]
      on_failure: true
```

### Custom Report Templates

```bash
# Use custom template
testmesh run suite.yaml --report html --template custom-template.html
```

**custom-template.html:**
```html
<!DOCTYPE html>
<html>
<head>
  <title>{{.Title}}</title>
  <style>
    /* Custom styles */
  </style>
</head>
<body>
  <h1>{{.Suite.Name}}</h1>

  <div class="summary">
    <p>Pass Rate: {{.Summary.PassRate}}%</p>
    <p>Duration: {{.Summary.Duration}}</p>
  </div>

  {{range .Flows}}
  <div class="flow">
    <h2>{{.Name}}</h2>
    <p>Status: {{.Status}}</p>
    {{range .Steps}}
      <div class="step">
        <h3>{{.Name}}</h3>
        {{if .Error}}
        <pre class="error">{{.Error}}</pre>
        {{end}}
      </div>
    {{end}}
  </div>
  {{end}}
</body>
</html>
```

---

## Report Sharing

### Public Report URLs

```bash
# Generate and upload report
testmesh run suite.yaml --report html --publish

# Output:
# Report published: https://reports.testmesh.io/abc123
# Valid for: 30 days
```

### Embed in Dashboards

```html
<!-- Embed report iframe -->
<iframe src="https://reports.testmesh.io/abc123" width="100%" height="600"></iframe>
```

### Email Reports

```bash
# Email report after execution
testmesh run suite.yaml \
  --report html \
  --email team@example.com \
  --email-subject "Test Results - ${DATE}"
```

### Slack Notifications

```yaml
# Automatic Slack notification
reporting:
  notifications:
    slack:
      webhook: "${SLACK_WEBHOOK}"
      on_failure: true
      template: |
        🔴 Test Suite Failed

        Suite: {{.Suite.Name}}
        Pass Rate: {{.Summary.PassRate}}%
        Duration: {{.Summary.Duration}}

        Failed Tests:
        {{range .Failures}}
        - {{.Name}}
        {{end}}

        View Report: {{.ReportURL}}
```

---

## Real-Time Reporting

### Live Dashboard

```bash
# Start live dashboard server
testmesh serve --port 5016

# Run tests with live updates
testmesh run suite.yaml --live
```

**Browser at http://localhost:5016:**
```
┌─────────────────────────────────────────────────────────┐
│ Live Test Execution                          [RUNNING]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Progress: 3/10 tests completed                        │
│  [███████░░░░░░░░░░░░░░] 30%                          │
│                                                         │
│  Currently Running:                                     │
│  ⏳ Update User Email (389ms elapsed)                  │
│                                                         │
│  Completed:                                             │
│  ✓ Create User                      245ms              │
│  ✓ Get User by ID                   123ms              │
│  ✓ List Users                       567ms              │
│                                                         │
│  Queued:                                                │
│  ⏸ Delete User                                         │
│  ⏸ Search Users                                        │
│  ... 5 more                                            │
└─────────────────────────────────────────────────────────┘

[Auto-refreshing every 1s]
```

---

## CLI Commands

```bash
# Generate HTML report
testmesh run suite.yaml --report html --output reports/

# Generate multiple formats
testmesh run suite.yaml --report html,junit,json --output reports/

# Open report in browser
testmesh report open reports/index.html

# List report history
testmesh report list

# Compare two runs
testmesh report compare run-1 run-2

# Generate report from existing results
testmesh report generate results.json --format html

# Clean old reports
testmesh report clean --older-than 30d

# Export report data
testmesh report export --format csv --output data.csv
```

---

## Integration Examples

### Jenkins Pipeline

```groovy
pipeline {
    agent any
    stages {
        stage('Test') {
            steps {
                sh 'testmesh run suite.yaml --report html,junit --output reports/'
            }
        }
        stage('Publish') {
            steps {
                junit 'reports/junit.xml'
                publishHTML([
                    reportDir: 'reports',
                    reportFiles: 'index.html',
                    reportName: 'TestMesh Report'
                ])
            }
        }
    }
}
```

### GitHub Actions

```yaml
name: Tests

on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Run Tests
        run: testmesh run suite.yaml --report html,junit --output reports/

      - name: Publish Report
        uses: actions/upload-artifact@v2
        with:
          name: test-report
          path: reports/

      - name: Publish Test Results
        uses: EnricoMi/publish-unit-test-result-action@v1
        with:
          files: reports/junit.xml
```

### GitLab CI

```yaml
test:
  script:
    - testmesh run suite.yaml --report html,junit --output reports/
  artifacts:
    reports:
      junit: reports/junit.xml
    paths:
      - reports/
    expire_in: 30 days
```

---

## Report Data API

Query report data programmatically.

```bash
# Get summary
curl http://localhost:5016/api/reports/latest/summary

# Response:
# {
#   "total": 4,
#   "passed": 3,
#   "failed": 1,
#   "pass_rate": 0.75,
#   "duration": 1069
# }

# Get failures
curl http://localhost:5016/api/reports/latest/failures

# Get trends
curl http://localhost:5016/api/reports/trends?days=30
```

---

## Related Features

- **[Observability](./V1_SCOPE.md)** - Real-time execution monitoring
- **[CI/CD Integration](./README.md)** - Automated test reporting
- **[Tagging System](./TAGGING_SYSTEM.md)** - Organize and filter reports

---

**Last Updated**: 2026-02-09
**Version**: 1.0
**Status**: Complete ✅
