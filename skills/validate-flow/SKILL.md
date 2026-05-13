---
name: validate-flow
description: Validate a TestMesh flow YAML file for correctness. Use when the user wants to check, lint, or validate a flow before running it. Accepts a file path as argument.
---

Validate the TestMesh flow at $ARGUMENTS.

## Steps

1. If $ARGUMENTS is a file path, read the file first
2. Use `mcp__testmesh__validate_flow` to validate it
3. If **validation fails**: explain each error with a concrete fix (see table below)
4. If **valid**: confirm it's ready to run and offer to execute it with `/testmesh:run-flow`

---

## Common Validation Errors and Fixes

| Error | Fix |
|---|---|
| `missing 'flow:' root key` | Wrap everything under `flow:` at the top level |
| `flow.name is required` | Add `name: "..."` directly under `flow:` |
| `missing 'id' field` | Every step needs a unique `id:` field |
| `unknown action 'X'` | Check spelling against the valid action list below |
| `config.method is required` | `http_request` has no default method — add `method: GET/POST/etc` |
| `config.url is required` | Add the missing required config key |
| `config.connection is required` | Add a PostgreSQL DSN string as `connection:` |
| `config.brokers is required` | Add `brokers: "${KAFKA_BROKERS}"` |
| `references '{{var}}' but not defined` | Variable used before the `output:` step that captures it — reorder steps |
| `duplicate step id 'X'` | Step IDs must be unique within the flow — rename one |
| `{{var}} in assert block` | Remove `{{}}` — use bare variable names in assertions |

**Valid actions:** `http_request`, `database_query`, `db_poll`, `kafka_producer`, `kafka_consumer`, `grpc`, `websocket`, `redis.get`, `redis.set`, `redis.del`, `redis.exists`, `assert`, `transform`, `condition`, `for_each`, `parallel`, `run_flow`, `wait_for`, `wait_until`, `delay`, `log`, `mock_server_start`, `mock_server_stop`, `mock_server_configure`, `contract_generate`, `contract_verify`, `docker_run`, `docker_stop`, `mcp_call`

---

## Quick Structural Check (before calling validate_flow)

If you can see the YAML, scan for these before validating:

- Root key is `flow:` — not `name:` or `steps:` directly
- `flow.name` is present
- Every step has a unique `id:`
- `assert:` blocks use bare variable names, not `{{var}}`
- DB tables are schema-qualified: `user_service.users`, not `users`
- `http_request` has `method:` set
