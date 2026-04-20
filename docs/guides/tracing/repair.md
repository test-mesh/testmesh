# Repair Suggestions

When a test execution fails and TestMesh has a trace for that execution, it automatically generates a repair suggestion.

## When repair suggestions appear

A repair suggestion card appears on the execution detail page when:
1. The execution `status` is `failed`
2. The execution has a `trace_id` (tracing is enabled and the execution produced spans)
3. An AI provider is configured in Settings → Integrations

The suggestion is computed asynchronously — it may appear 5–30 seconds after the execution completes.

## Reading the suggestion

The card shows:
- **Diagnosis**: a plain-English explanation of what diverged between what the test expected and what the service returned
- **Diff**: the specific YAML change needed (click "View diff" to expand)
- **Confidence**: how certain the AI is (0–100%). Treat anything below 50% with extra scrutiny.

## Applying a suggestion

Click **Apply fix** to update the flow definition. The original definition is preserved in history — you can revert via the flow's history tab.

## Dismissing a suggestion

Click **Dismiss** to hide the card. This does not affect the flow or execution.

## Confidence guidance

| Range | What it means |
|-------|--------------|
| 80–100% | High confidence — root cause is clear from the trace |
| 50–79% | Medium confidence — plausible but review the diff before applying |
| Below 50% | Low confidence — use the diagnosis as a hint, fix manually |

## Limitations

- Repair suggestions require the failing service to be OTel-instrumented. If the service did not produce spans, TestMesh cannot match the test step to a real service call.
- The AI may suggest updating an assertion when the real fix is in the service itself (e.g., a bug in the service returning the wrong status code). Always verify whether the test needs to change or the service does.
