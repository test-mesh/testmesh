# testmesh-generate

Generate YAML test flows for services using AI. Covers four layers: endpoint contracts, within-service chains, cross-service E2E, and edge cases.

## When to use

Use this skill when you need to:
- Generate a test flow for a specific endpoint or scenario
- Build a complete test suite for a service
- Create a test plan before writing individual flows
- Fill in coverage gaps identified by `testmesh-analyze`

## Flow Layers

| Layer | Scope | Example |
|---|---|---|
| L1 | Single endpoint contract | `POST /users` returns 201 with correct schema |
| L2 | Within-service chain | Create user → fetch user → verify data |
| L3 | Cross-service E2E | Place order → verify inventory updated → check notification sent |
| L4 | Edge cases & failure paths | Invalid input, auth failures, timeout handling |

## MCP Tools

### `generate_flow`

Generate a single YAML flow.

**Input**
```json
{
  "workspace_id": "<uuid>",
  "description": "Test that creating a user returns 201 and a valid user_id",
  "service_id": "<uuid>",
  "layer": "L1"
}
```

**Output** — complete YAML flow ready to upload and run.

---

### `generate_test_plan`

Generate a full layered test plan for a service.

**Input**
```json
{
  "workspace_id": "<uuid>",
  "service_id": "<uuid>"
}
```

**Output** — structured plan with recommended flows per layer, priority order, and estimated coverage %.

---

### `upload_flow`

Upload a generated flow to a workspace so it can be run.

**Input**
```json
{
  "workspace_id": "<uuid>",
  "collection_id": "<uuid>",
  "yaml": "<flow yaml string>"
}
```

## YAML Flow Format

```yaml
flow:
  name: "Create User - Happy Path"
  steps:
    - id: create_user
      action: http_request
      config:
        method: POST
        url: "{{BASE_URL}}/users"
        body:
          name: "Alice"
          email: "alice@example.com"
      assert:
        - status == 201
        - body.id != ""
      output:
        user_id: $.body.id

    - id: fetch_user
      action: http_request
      config:
        method: GET
        url: "{{BASE_URL}}/users/{{user_id}}"
      assert:
        - status == 200
        - body.name == "Alice"
```

## Example workflow

```
1. generate_test_plan  → understand what flows are needed
2. generate_flow       → generate each flow
3. upload_flow         → upload to workspace
4. (hand off to testmesh-run skill)
```
