# TestMesh Agent

The TestMesh Agent runs **inside your network** and executes flows against your internal services.
It connects outbound to the TestMesh cloud control plane — no inbound ports, no firewall changes.

```
TestMesh Cloud                        Your Network
┌──────────────────┐                 ┌─────────────────────────────────┐
│  Control Plane   │◄── outbound ────│  testmesh-agent                 │
│  (schedules,     │──── results ────►│  (executes flows locally)       │
│   dashboard,     │                 └─────────────────────────────────┘
│   AI analysis)   │                              │
└──────────────────┘                              ▼
                                     internal-api:8080
                                     postgres:5432
                                     kafka:9092
                                     redis:6379
```

## Quick Start

### Docker (recommended)

```bash
docker run -d \
  -e AGENT_TOKEN=<your-token> \
  -e CLOUD_URL=https://app.testmesh.io \
  --name testmesh-agent \
  --restart unless-stopped \
  testmesh/agent:latest
```

### Binary

```bash
curl -fsSL https://testmesh.io/install-agent.sh | sh
testmesh-agent start --token <your-token>
```

### docker-compose (alongside your existing services)

```yaml
services:
  testmesh-agent:
    image: testmesh/agent:latest
    environment:
      AGENT_TOKEN: <your-token>
      CLOUD_URL: https://app.testmesh.io
    restart: unless-stopped
    # No ports needed — outbound only
```

Get your agent token from: TestMesh Dashboard → Settings → Agents → New Agent

---

## Configuration

| Flag | Env var | Default | Description |
|------|---------|---------|-------------|
| `--token` | `AGENT_TOKEN` | required | Agent token from dashboard |
| `--cloud-url` | `CLOUD_URL` | `https://app.testmesh.io` | Control plane URL |
| `--workers` | — | `4` | Max concurrent flow executions |

---

## How It Works

1. Agent dials `wss://app.testmesh.io/api/v1/agent/connect` with its token
2. Control plane authenticates the token, registers the agent, starts sending jobs
3. Agent executes each flow using the embedded runner (same engine as the OSS API)
4. Step results are streamed back as they complete — you see live progress in the dashboard
5. On disconnect, agent retries with backoff — jobs not yet acknowledged are requeued by the control plane

### Message protocol

```
agent → cloud:   { "type": "register", "payload": { "workers": 4, "version": "0.1.0" } }
cloud → agent:   { "type": "job",      "payload": { "id": "...", "definition": {...}, "variables": {...} } }
agent → cloud:   { "type": "result",   "payload": { "job_id": "...", "type": "step_completed", ... } }
cloud → agent:   { "type": "ping" }
agent → cloud:   { "type": "pong" }
```

Result types streamed per job: `step_started` → `step_completed|step_failed` (×N) → `flow_completed|flow_failed`

---

## Security

- Outbound-only: the agent initiates all connections — your firewall never needs an inbound rule
- Token-scoped: each token is tied to a single workspace; compromise of one token does not affect others
- No raw data leaves: only execution results and logs are sent to the cloud, not the actual data from your databases or APIs (unless you explicitly capture it in assertions)
- Secrets in flows stay local: environment variables and connection strings are resolved inside the agent, never sent to the cloud

---

## Self-Hosting the Control Plane

If you need full on-premise deployment (no cloud at all), you can point the agent at your own
self-hosted TestMesh API:

```bash
testmesh-agent start \
  --token <token> \
  --cloud-url http://testmesh-api:5016
```

This works because the agent relay endpoint (`/api/v1/agent/connect`) is part of the OSS API.

---

## Building from Source

```bash
cd agent
go build -o testmesh-agent .
```

Or with Docker (from repo root):

```bash
docker build -f agent/Dockerfile -t testmesh/agent:local .
```
