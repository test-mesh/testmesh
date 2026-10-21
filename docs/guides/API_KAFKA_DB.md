# Testing an API → Kafka → Database Workflow

The most common integration test in an event-driven system is also the most
annoying to write by hand: call an API, wait for the event it publishes, then
check the database state that some asynchronous consumer writes. Hand-rolled
versions of this test usually grow a Kafka consumer with a throwaway group id,
a `sleep(3)`, a retry loop around a SQL query, and failure output that says
nothing more than `expected 8, got 10`.

In TestMesh it is three steps.

```yaml
flow:
  name: "Place order → order.placed → inventory reserved"
  env:
    DATABASE_URL: "postgres://root:admin@localhost:5432/postgres?sslmode=disable"
    KAFKA_BROKERS: "localhost:9092"

  steps:
    - id: place_order
      action: http_request
      config:
        method: POST
        url: "http://localhost:5003/api/v1/orders"
        body:
          user_id: "{{user_id}}"
          items: [{ product_id: "{{product_id}}", quantity: 2 }]
      assert:
        - status == 201
      output:
        order_id: $.body.id

    - id: order_placed_event
      action: kafka_consumer
      config:
        topic: order.placed
        match:
          order_id: "{{order_id}}"
        timeout: 10s
      assert:
        - event.items[0].quantity == 2

    - id: inventory_reserved
      action: database_query
      eventually: 15s
      config:
        query: "SELECT inventory FROM product_service.products WHERE id = $1"
        params: ["{{product_id}}"]
      assert:
        - first_row.inventory == 8
```

The complete runnable version, including setup, is
[`examples/microservices/00-api-kafka-db.yaml`](../../examples/microservices/00-api-kafka-db.yaml).

## What each piece does for you

### Connections are declared once

`database_query` and `db_poll` use `DATABASE_URL` when a step has no
`connection`; `kafka_producer` and `kafka_consumer` use `KAFKA_BROKERS` when a
step has no `brokers`. Put them in `env:`, in a shared `env_file:`, or export
them in CI:

```bash
DATABASE_URL=postgres://… KAFKA_BROKERS=broker:9092 testmesh run flows/
```

A flow's own `env:` takes precedence over the shell.

### The consumer catches the right event, every time

Two race conditions make hand-written Kafka assertions flaky:

1. **The event is published before the consumer starts.** The API call
   returns after the producer has already written the event. A consumer that
   starts at "latest" misses it.
2. **Old events leak in.** A consumer that starts at "earliest", or that reuses
   a consumer group, picks up events from previous runs.

`kafka_consumer` reads every partition directly (no consumer group, no
rebalance wait) starting at the offset of the **flow's start time**. Events
produced by earlier steps are seen; events from earlier runs are not. `match`
then selects the one event your test caused, by comparing fields of the JSON
payload:

```yaml
match:
  order_id: "{{order_id}}"
  items.0.sku: "SKU-42"      # dot paths into nested objects and arrays
```

Use `filter:` for key and header criteria, and `since:` to choose a different
start position (`earliest`, `latest`, an RFC 3339 timestamp, or a duration such
as `5m`). Setting `group_id` switches back to consumer-group mode.

After a match, assertions can use:

| Variable   | Contents                                                        |
|------------|-----------------------------------------------------------------|
| `event`    | Parsed JSON payload of the first matching message               |
| `message`  | `key`, `value`, `headers`, `partition`, `offset`, `timestamp`   |
| `messages` | All matching messages (when `count` > 1)                        |
| `count`    | Number of matching messages                                     |
| `scanned`  | Number of messages read from the topic, matching or not         |

### Asynchronous state is checked with `eventually`

Any step can be marked `eventually: <timeout>`. The action and its assertions
are re-run (every 500ms by default) until the assertions pass or the timeout
expires:

```yaml
eventually: 15s
# or
eventually: { timeout: 15s, interval: 250ms }
```

This works for any action, including `database_query`, `http_request` (polling
a status endpoint) and `redis.get`. It replaces `delay` steps and
`db_poll` + `database_query` pairs.

## When it fails, it tells you why

A missing event:

```
❌ order_placed_event (kafka_consumer) — 10001ms
   timed out after 10s waiting for 1 message(s) on topic "order.placed" matching order_id=7f3c…:
   2 message(s) read, 0 matched; most recent non-matching:
     key="a91e…" value={"order_id":"a91e…","items":[…],"status":"placed"}
```

From this you can tell the topic is correct and events are flowing, so the
match value is wrong or the service published a different ID. If no messages
were read at all, the message says so.

State that never converges:

```
❌ inventory_reserved (database_query) — 15002ms
   still failing after 15s (30 attempts); last error: assertion failed:
     - first_row.inventory == 8: got first_row.inventory = 10
```

The consumer never applied the update. That is a different bug from "the
event was never published", and the output tells the two apart.
