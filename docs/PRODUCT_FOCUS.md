# Product Focus

TestMesh does not try to match Postman, Playwright or k6 feature for feature.
It aims to be the best tool for **verifying workflows that span APIs, message
brokers, databases and asynchronous services**.

## The first use case

> A developer writes one test that calls an API, waits for a Kafka event, and
> verifies the resulting database state.

That experience has to be dramatically simpler than maintaining custom
scripts. In practice that means:

| Hand-written script                                 | TestMesh                                              |
|-----------------------------------------------------|-------------------------------------------------------|
| Throwaway consumer group, offset juggling            | `kafka_consumer` anchored at flow start, no group      |
| Loop over messages comparing IDs                     | `match: { order_id: "{{order_id}}" }`                  |
| `sleep(3)` or a retry loop around a SQL query        | `eventually: 15s` on any step                          |
| Connection strings copied into every check           | `DATABASE_URL` / `KAFKA_BROKERS` declared once         |
| `expected 8, got 10`                                 | What was read, what didn't match, last observed state  |

Reference: [guides/API_KAFKA_DB.md](./guides/API_KAFKA_DB.md) and
[`examples/microservices/00-api-kafka-db.yaml`](../examples/microservices/00-api-kafka-db.yaml).

When prioritising work, ask whether it makes this test easier to write,
more reliable to run, or faster to debug. If it mainly adds breadth, such as
another protocol or a UI-testing or load-testing capability, it is a lower
priority.

## Where the business is

The runner and CLI stay open and free, so the first test is cheap to adopt.
Revenue comes from what teams need once many people depend on these tests:

- **Collaboration**: shared workspaces, flow review and ownership, history of
  who changed what.
- **Test execution infrastructure**: hosted runners and self-hosted agents
  (`agent/`) that reach private networks, with scheduling and parallelism.
- **Environment management**: per-environment connections, secrets and
  routing (`DATABASE_URL`, brokers, service URLs), so flows stay portable.
- **Debugging**: execution timelines, captured events and query results,
  step-through debugging and trace correlation for failed async workflows.
