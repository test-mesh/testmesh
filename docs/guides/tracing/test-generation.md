# Generating Tests from Traces

Once TestMesh is receiving spans from your services, you can generate runnable YAML test flows from real traces.

## How to generate a test

**From a trace:**
1. Open Traces → find a trace that represents a flow you want to test
2. Click "Generate test"
3. Review the generated YAML — TestMesh uses the actual span data (methods, URLs, status codes)
4. Click "Save as flow" to create the flow in TestMesh

**From Coverage Gaps:**
1. Open Coverage in the sidebar
2. Find an endpoint with "No test" status
3. Click "Generate test" — TestMesh uses the most recent real trace for that endpoint

**From Discovered Flows:**
1. Open Traces → Discovered Flows
2. Click "Generate test" on any discovered flow pattern

## What the generated YAML contains

- HTTP steps with method and URL derived from `http.method` and `http.route` span attributes
- Status code assertions: `assert: - status == 201`
- Response body assertions for key fields: `assert: - $.body.id != ""`
- Variable extraction where values flow between steps: `output: {order_id: $.body.id}`
- Placeholder variables `{{base_url}}`, `{{api_key}}` for environment-specific values

## Improving generation quality

The richer your span attributes, the better the generated YAML. Add these OTel attributes to improve results:

| Attribute | What it enables |
|-----------|----------------|
| `http.request.body` | Request payload in generated step |
| `http.response.body` | Response body assertions |
| `http.route` | Parameterised URL (e.g. `/orders/:id`) instead of concrete URL |
| `http.method` | Correct HTTP method in step config |

Example (Go):
```go
span.SetAttributes(
    attribute.String("http.request.body", string(bodyBytes)),
    attribute.String("http.response.body", string(respBytes)),
)
```

## Confidence score

The generated flow includes a `confidence` score (0–1). Scores below 0.6 mean:
- TestMesh could not infer request bodies (not instrumented)
- The trace had very few spans
- The AI provider could not determine inter-step variable relationships

Lower-confidence flows still run correctly but may need manual assertion tuning.
