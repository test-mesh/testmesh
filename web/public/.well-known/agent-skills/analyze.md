# testmesh-analyze

Analyze TestMesh workspaces and services to understand endpoints, schemas, dependencies, and coverage gaps.

## When to use

Use this skill when you need to:
- Understand what a service does before writing tests
- Map inter-service dependencies across a workspace
- Find untested endpoints and coverage gaps
- Get a full picture of what protocols a service uses (HTTP, Kafka, gRPC, DB, etc.)

## MCP Tools

### `analyze_workspace`

Analyze an entire TestMesh workspace.

**Input**
```json
{ "workspace_id": "<uuid>" }
```

**Output** — workspace summary with services, endpoint counts, protocol breakdown, and overall coverage %.

---

### `analyze_service`

Deep-analyze a single service.

**Input**
```json
{
  "workspace_id": "<uuid>",
  "service_id": "<uuid>"
}
```

**Output** — endpoint list with schemas, inbound/outbound dependencies, existing flow coverage per endpoint.

---

### `get_coverage_gaps`

Return a list of endpoints with no test coverage.

**Input**
```json
{ "workspace_id": "<uuid>" }
```

**Output** — array of uncovered endpoints with suggested flow types to add.

## Example workflow

```
1. analyze_workspace  → find all services
2. analyze_service    → pick the most critical service
3. get_coverage_gaps  → see what's untested
4. (hand off to testmesh-generate skill)
```
