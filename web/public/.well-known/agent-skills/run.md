# testmesh-run

Execute TestMesh flows and suites, stream results, and diagnose failures.

## When to use

Use this skill when you need to:
- Run a specific flow and check if it passes
- Execute an entire collection/suite
- Get structured pass/fail results with diffs
- Diagnose why a flow is failing

## MCP Tools

### `run_flow`

Execute a single flow by ID.

**Input**
```json
{
  "workspace_id": "<uuid>",
  "flow_id": "<uuid>",
  "environment_id": "<uuid>"
}
```

**Output** — execution result with step-by-step pass/fail, assertion results, and captured outputs.

---

### `run_suite`

Execute all flows in a collection.

**Input**
```json
{
  "workspace_id": "<uuid>",
  "collection_id": "<uuid>",
  "environment_id": "<uuid>"
}
```

**Output** — suite result with per-flow pass/fail summary and overall stats.

---

### `run_step`

Run a single flow step interactively (useful for debugging).

**Input**
```json
{
  "workspace_id": "<uuid>",
  "flow_id": "<uuid>",
  "step_id": "<string>",
  "context": {}
}
```

---

### `get_execution`

Retrieve results of a past execution.

**Input**
```json
{ "execution_id": "<uuid>" }
```

**Output** — full execution record with step results, timing, and captured variable values.

---

### `trigger_execution`

Trigger an async execution and return an execution ID to poll.

**Input**
```json
{
  "workspace_id": "<uuid>",
  "flow_id": "<uuid>",
  "environment_id": "<uuid>"
}
```

## Reading results

Execution results include per-step data:

```json
{
  "step_id": "create_user",
  "status": "failed",
  "assertions": [
    { "expression": "status == 201", "passed": false, "actual": 400 }
  ],
  "response": { "status": 400, "body": { "error": "email already exists" } }
}
```

## Example workflow

```
1. run_flow          → execute and get results
2. (if failed)
   get_execution     → inspect full step trace
   run_step          → re-run failing step with modified context
```
