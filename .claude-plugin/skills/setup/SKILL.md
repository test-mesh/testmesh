---
name: setup
description: Use when starting TestMesh on a new project for the first time — sets up the workspace, analyzes services, writes the env file, and generates an initial test plan.
---

# TestMesh Project Setup

Run this workflow once per project before writing any flows.

## Full Setup Sequence

```
1. list_workspaces          → get workspace_id (always needed for other tools)
2. analyze_workspace        → understand endpoints, schemas, Kafka topics, DB tables, call graph
3. get_testing_guide        → read best practices before writing anything
4. generate_test_plan       → structure a coverage plan (services × categories)
5. write_env_file           → create shared .env.test with all infra connection strings
6. get_yaml_schema          → understand YAML structure before writing flows
```

After setup, use the `generate-flow` skill to write individual flows.

## Step Details

### 1. list_workspaces
Always call first — every other tool needs the `workspace_id`.

```
tool: mcp__testmesh__list_workspaces
```

Default workspace ID for local dev: `00000000-0000-0000-0000-000000000001`

### 2. analyze_workspace
Pass your services directory. Provide infra connection params if available:

```
tool: mcp__testmesh__analyze_workspace
args:
  workspace_id: <from step 1>
  directory: ./demo-services        # or your services root
  db_connection: postgres://root:admin@localhost:5432/postgres?sslmode=disable
  kafka_brokers: localhost:9092
  redis_addr: localhost:6379
```

This returns: discovered endpoints, DB tables, Kafka topics, Redis keys, and the call graph between services.

### 3. get_testing_guide
Read before writing any flows — covers layer strategy, assertion patterns, async polling, setup/teardown.

```
tool: mcp__testmesh__get_testing_guide
```

### 4. generate_test_plan
Get a structured coverage plan across all discovered services:

```
tool: mcp__testmesh__generate_test_plan
args:
  workspace_id: <from step 1>
  directory: ./demo-services
```

Returns a breakdown of what flows to write per service and layer (L1–L4).

### 5. write_env_file
Write a shared `.env.test` that all flows reference via `env_file: .env.test`:

```
tool: mcp__testmesh__write_env_file
args:
  workspace_id: <from step 1>
  path: .env.test
  vars:
    DB_URL: postgres://root:admin@localhost:5432/postgres?sslmode=disable
    KAFKA_BROKERS: localhost:9092
    REDIS_ADDR: localhost:6379
    USER_SERVICE_URL: http://localhost:5001
    ORDER_SERVICE_URL: http://localhost:5003
    PRODUCT_SERVICE_URL: http://localhost:5002
```

In Docker Compose, use container names (`postgres`, `kafka`, `user-service`) instead of `localhost`.

### 6. get_yaml_schema
Fetch the full YAML schema with examples before generating any flows:

```
tool: mcp__testmesh__get_yaml_schema
```

## What's Next

- Use `generate-flow` skill to write individual flows for each service/scenario
- Use `flow-layers` skill to understand L1–L4 coverage strategy
- Use `run-flow` skill to execute and verify flows as you write them
- Use `coverage` skill to find and fill gaps after initial flows are written
