# Tracing Overview

TestMesh receives OpenTelemetry spans from your services and uses them to help you write and fix tests.

## What TestMesh does with traces

```
Your services (OTel-instrumented)
  │  OTLP/HTTP
  ▼
TestMesh API  POST /otlp/v1/traces
  │
  ├── Store spans in telemetry.spans
  ├── Discover flow patterns (telemetry.discovered_flows)
  ├── Index coverage gaps (telemetry.coverage_gaps)
  ├── Link traces to failed executions → repair suggestions
  └── Summarize with LLM → generated YAML flows (telemetry.trace_insights)
```

## Sub-guides

- [Integration](./integration.md) — Send spans from your services to TestMesh
- [Test Generation](./test-generation.md) — Generate runnable YAML flows from real traces
- [Repair Suggestions](./repair.md) — Fix failing tests using trace diffs
