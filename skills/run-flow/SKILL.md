---
name: run-flow
description: Run a TestMesh flow YAML file. Use when the user wants to execute, run, or test a flow. Accepts a file path or flow name as argument.
---

Run the TestMesh flow specified in $ARGUMENTS.

Use the `mcp__testmesh__run_flow` tool to execute the flow. If $ARGUMENTS is a file path, read the file first and pass its contents. If it's a flow name, use `mcp__testmesh__list_flows` to find it first.

After execution, report:
- Whether the flow passed or failed
- Which steps passed/failed and why
- Any assertion errors with actual vs expected values
- Total duration
