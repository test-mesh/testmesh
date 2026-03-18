---
name: validate-flow
description: Validate a TestMesh flow YAML file for correctness. Use when the user wants to check, lint, or validate a flow before running it. Accepts a file path as argument.
---

Validate the TestMesh flow at $ARGUMENTS.

Steps:
1. Read the file if a path is given
2. Use `mcp__testmesh__validate_flow` to validate it
3. If validation fails, explain each error clearly and suggest fixes
4. If valid, confirm it's ready to run and offer to execute it with the run-flow skill
