# Integrating Your Services with TestMesh Tracing

## Prerequisites

Your services must already be instrumented with OpenTelemetry and export spans via OTLP.

## Direct send (recommended)

Set these environment variables on each service:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://your-testmesh-host:5016
OTEL_EXPORTER_OTLP_HEADERS="X-Workspace-ID=YOUR_WORKSPACE_UUID"
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
```

Your workspace UUID is visible in TestMesh → Settings → Workspace.

## Production: API key auth

For internet-facing deployments, use an API key instead of a bare UUID:

1. Go to Settings → API Keys → Create Key
2. Copy the key (shown once)
3. Set:

```bash
OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer tm_live_YOUR_KEY"
```

## Via OTel Collector (if you already have one)

Add an exporter to your `otel-collector.yaml`:

```yaml
exporters:
  otlphttp/testmesh:
    traces_endpoint: "http://your-testmesh-host:5016/otlp/v1/traces"
    compression: none
    headers:
      X-Workspace-ID: "YOUR_WORKSPACE_UUID"
    tls:
      insecure: true

service:
  pipelines:
    traces:
      exporters: [otlp/tempo, otlphttp/testmesh]  # fan-out to both
```

## Verify spans are arriving

1. Run your service or trigger some traffic
2. Open TestMesh → Traces — spans should appear within 30 seconds
3. Check Settings → Workspace → Span count (increments as spans arrive)

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| No spans in TestMesh | Wrong endpoint URL | Check `OTEL_EXPORTER_OTLP_ENDPOINT` includes the port |
| `400 X-Workspace-ID header is required` | Missing header | Add `X-Workspace-ID` to `OTEL_EXPORTER_OTLP_HEADERS` |
| `400 invalid OTLP protobuf payload` | Content-type mismatch | Set `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf` |
| Collector sends gzip but TestMesh rejects | Collector default | Add `compression: none` to the `otlphttp/testmesh` exporter in collector config |
| `401 invalid API key` | Key revoked or mistyped | Regenerate key in Settings → API Keys |
