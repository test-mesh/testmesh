---
name: generate-flow
description: Generate a TestMesh YAML flow from a description. Use when the user wants to create a new test flow, write a test, or generate YAML for testing a service or scenario. Accepts a natural language description as argument.
---

Generate a TestMesh flow YAML for: $ARGUMENTS

Use `mcp__testmesh__get_yaml_schema` to get the current YAML schema, then use `mcp__testmesh__get_action_types` to get available action types and their required/optional fields.

If the user's codebase has services running, use `mcp__testmesh__analyze_workspace` or `mcp__testmesh__analyze_service` to understand the available endpoints and data shapes before generating.

Generate a complete, working flow YAML following these rules:
- Always include `flow:` at the root level
- Give each step a unique `id`
- Use realistic test data
- Add assertions on every step that makes a request — write precise ones:
  - Exact status codes (201 not `200 || 201`)
  - Kafka consumers: verify payload fields (`messages[0].value.user_id == user_id`), not just `len > 0`
  - For mutations: capture count/value before, assert delta after (`body.total == count_before + 1`)
  - Created entities: verify fields match what was sent (`body.name == name`, `body.owner_id == user_id`)
- Use `output:` to capture values needed in later steps
- Reference captured values with `{{variable_name}}`

After generating, offer to save the file and run it.
