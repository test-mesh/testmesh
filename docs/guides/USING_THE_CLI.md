# Using the CLI

The TestMesh CLI executes flows locally without needing the API server running. It's the fastest way to run and iterate on tests.

## Installation

```bash
# Run directly with Go
cd cli
go run main.go --help

# Or build a binary
go build -o testmesh main.go
./testmesh --help
```

## Commands

### `run` — Execute a flow

```bash
go run main.go run <flow.yaml>

# Examples
go run main.go run ../examples/microservices/e2e-order-flow.yaml
go run main.go run ./my-test.yaml
```

Output shows each step with pass/fail status, timing, and assertion results.

### `validate` — Check flow YAML without running

```bash
go run main.go validate <flow.yaml>
```

Useful for catching syntax errors and missing required fields before running.

### `debug` — Step-by-step interactive execution

```bash
go run main.go debug <flow.yaml>
```

Pauses between steps. Shows the full response and extracted variables at each point. Useful for building flows incrementally.

### `watch` — Re-run on file changes

```bash
go run main.go watch <flow.yaml>
```

Watches the flow file and re-runs it automatically when saved. Good for TDD-style flow development.

### `generate` — AI-powered test generation

```bash
# Generate a flow from an OpenAPI spec
go run main.go generate --spec ./openapi.yaml

# Generate from a running service
go run main.go generate --url http://localhost:5001

# Generate with a description
go run main.go generate --description "Test creating and retrieving a user"
```

Requires `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set in the environment.

### `chat` — Conversational flow creation

```bash
go run main.go chat
```

Interactive conversation to describe what you want to test. The AI generates a flow YAML and can refine it based on feedback.

### `mock` — Start a mock server

```bash
# Start a mock from a flow's mock config
go run main.go mock --config ./mock-config.yaml --port 8080
```

Useful for testing against services that aren't available yet.

## Environment Variables

Set these before running if your flows reference external services:

```bash
export DATABASE_URL=postgres://user:pass@localhost:5432/mydb
export REDIS_URL=redis://localhost:6379
export ANTHROPIC_API_KEY=sk-ant-...   # For AI features
```

## Common Patterns

### Run against a specific environment

```bash
BASE_URL=https://staging.example.com go run main.go run ./flow.yaml
```

Reference `{{BASE_URL}}` in your flow's `url` fields.

### Run multiple flows

```bash
for f in ./tests/*.yaml; do
  go run main.go run "$f"
done
```

### CI/CD integration

```yaml
# .github/workflows/test.yml
- name: Run integration tests
  run: |
    cd cli
    go run main.go run ../examples/microservices/e2e-order-flow.yaml
  env:
    DATABASE_URL: postgres://testmesh:testmesh@localhost:5432/testmesh
    REDIS_URL: redis://localhost:6379
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All steps passed |
| `1` | One or more steps failed |
| `2` | Flow file not found or invalid YAML |

## Next Steps

- [Writing Your First Flow](./WRITING_YOUR_FIRST_FLOW.md) — Flow YAML format
- [YAML Schema Reference](../features/YAML_SCHEMA.md) — All action types and options
- [AI Integration](../features/AI_INTEGRATION.md) — Using `generate` and `chat` commands
