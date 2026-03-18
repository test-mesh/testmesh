# Project Structure & Cloud Strategy

---

## Repository Layout

### Two repos: OSS + private cloud

```
testmesh/              ← public, open source (this repo)
testmesh-cloud/        ← private, never open sourced
```

Keeping them separate prevents accidental exposure of billing keys, auth config, and proprietary cloud logic in OSS commits. They also have different release cadences and CI/CD pipelines.

---

## OSS Repo (this repo) — Target Structure

```
testmesh/
├── api/                   Self-hosted API server (Go)
│   └── internal/
│       ├── ai/            LLM providers, basic generation, self-healing suggestions (manual)
│       ├── api/           REST handlers
│       ├── auth/          JWT, API keys, basic workspace auth
│       ├── runner/        Execution engine + action handlers
│       ├── scheduler/     Cron scheduling
│       ├── storage/       Models + repositories
│       ├── mcp/           MCP client
│       ├── importer/      OpenAPI, Postman, Swagger import
│       ├── exporter/      JUnit XML, JSON, CSV export
│       ├── reporting/     Per-execution reports
│       ├── git/           Webhook receiver for PR-triggered runs
│       ├── plugins/       Plugin system + registry
│       ├── tracing/       OpenTelemetry tracing
│       └── shared/        Config, DB, logging
│
├── agent/                 NEW: self-hosted execution agent (Go)
│   ├── main.go
│   ├── cmd/               agent start, version
│   └── internal/
│       ├── connection/    Outbound WebSocket to cloud control plane
│       ├── worker/        Job polling + execution (wraps api/internal/runner)
│       └── reporter/      Streams results back to cloud
│
├── cli/                   CLI tool (Go)
│   ├── cmd/               run, debug, generate, chat, watch, mcp, ...
│   └── internal/
│       ├── mcpserver/     MCP server implementation
│       └── watcher/       File watcher
│
├── dashboard/             OSS dashboard (Next.js)
├── web/                   Documentation site (Next.js)
├── demo-services/         Demo microservices for examples
├── examples/              Example flow YAML files
├── deploy/                Helm chart, k8s manifests, docker-compose
└── docs/                  Architecture + feature docs
```

---

## Cloud Repo (private) — Structure

```
testmesh-cloud/
├── control-plane/         Cloud API (extends OSS api)
│   └── internal/
│       ├── tenancy/       Multi-tenant workspace isolation
│       ├── agent-mgmt/    Agent token issuance, connection registry
│       ├── relay/         WebSocket relay — pushes jobs to agents, receives results
│       ├── billing/       Stripe integration, usage metering (step executions)
│       ├── auth/          Auth0/Clerk SSO, SAML, team management, RBAC, audit logs
│       ├── analytics/     Long-term trends, coverage history, flakiness scoring
│       ├── ai/            Self-healing auto-apply, diff-to-impact, coverage trends
│       ├── git/           GitHub App, GitLab OAuth, PR comments, smart test selection
│       ├── reporting/     Trend dashboards, bulk export, Slack/email digests
│       ├── loadtest/      Distributed load test orchestration (cloud workers)
│       ├── security/      Security scan rules, auth bypass detection
│       └── codegen/       Advanced AI code generation
│
├── dashboard-cloud/       Cloud-only UI pages (Next.js, layered on top of OSS dashboard)
│   ├── billing/           Plan management, invoices, usage
│   ├── agents/            Agent status, tokens, connection health
│   ├── analytics/         Trend dashboards, flakiness, coverage over time
│   └── settings/          SSO, audit log, RBAC, GitHub App install
│
├── infra/                 Terraform + k8s for cloud deployment
│   ├── aws/               EKS, RDS, ElastiCache, MSK
│   └── k8s/               Helm overrides for cloud
│
└── billing/               Stripe webhooks, metering, plan enforcement
```

---

## The Agent

The `agent/` is **open source and lives in this repo**. Customers inspect it before running it inside their network — transparency is required for trust.

### What it does

```
Cloud Control Plane                    Customer Network
┌──────────────────┐                  ┌─────────────────────────────┐
│  Job queue       │◄─── outbound ────│  testmesh/agent             │
│  Result storage  │──── results ────►│  (single Docker container)  │
│  Dashboard       │                  └─────────────────────────────┘
└──────────────────┘                            │
                                                ▼
                                   internal-api:8080
                                   postgres:5432
                                   kafka:9092
                                   redis:6379
```

- Agent connects **outbound only** to cloud (no inbound ports, no firewall changes)
- Executes flows locally using the same runner as the OSS API
- Only execution results and logs leave the network (no raw internal data)
- Agent token is scoped to a single workspace

### Install

```bash
# Docker
docker run -e AGENT_TOKEN=<token> -e CLOUD_URL=https://app.testmesh.io testmesh/agent

# Or binary
curl -fsSL https://install.testmesh.io | sh
testmesh-agent start --token <token>
```

### What the agent is NOT

Not a new execution engine. It wraps `api/internal/runner` which already exists.
New code is only: connection management, job polling, result streaming — roughly 300 lines.

---

## Feature Boundary: OSS vs Cloud

The rule: move to cloud only if a feature (a) requires cloud infrastructure to scale, or (b) is a clear premium differentiator. Never move something just because it's valuable — if it's needed for self-hosting to work, it stays OSS. A crippled OSS version kills adoption and kills the funnel.

### Packages that stay fully OSS

| Package | What it does | Why OSS |
|---------|-------------|---------|
| `runner/` | Core execution engine + action handlers | Agent depends on it; must be inspectable |
| `storage/` | DB models + repositories | Required for self-hosting |
| `shared/` | Config, DB connection, logging | Foundational |
| `scheduler/` | Cron-based scheduled runs | Self-hosted teams need scheduling |
| `mcp/` | MCP client (flows calling external MCP servers) | Core flow feature |
| `tracing/` | OpenTelemetry tracing | Core observability |
| `plugins/` | Plugin system + registry | Extensibility is a self-host feature |
| `importer/` | OpenAPI, Postman, Swagger import | Table stakes for onboarding |

### Packages that move entirely to cloud

| Package | What it does | Why cloud |
|---------|-------------|-----------|
| `loadtest/` | Distributed load testing | Requires many parallel workers; meaningless without cloud infra |
| `security/` | Security scanning, auth checks | Premium feature; needs ongoing rule/signature maintenance |
| `codegen/` | AI code generation beyond basic flows | Heavy AI usage, premium differentiator |

### Packages that split (OSS core, cloud premium)

#### `auth/`
- **OSS**: JWT authentication, API keys, basic workspace auth
- **Cloud**: SSO/SAML, Auth0/Clerk integration, team management, RBAC, audit logs

#### `ai/`
- **OSS**: LLM provider config (Anthropic, OpenAI, Local/Ollama), basic flow generation from prompt, OpenAPI/Postman import with AI, self-healing *suggestions* with manual approval
- **Cloud**: Self-healing *auto-apply* (requires cross-run history to establish confidence), coverage trend analysis, diff-to-impact analysis (PR test selection), flakiness scoring, generation quality feedback loop

The split here is important: self-hosted users can bring their own API key and get genuine AI value. The cloud premium is the *automation* layer on top — where results from many runs feed back into the AI to make decisions without human approval.

#### `git/`
- **OSS**: Webhook receiver endpoint (self-hosted users configure their own GitHub/GitLab webhook to trigger runs)
- **Cloud**: GitHub App (one-click install, no manual webhook), GitLab OAuth integration, automated PR comments with test results, smart test selection based on changed files

#### `reporting/`
- **OSS**: Per-execution reports, basic pass/fail history, CSV/JSON export
- **Cloud**: Long-term retention (>30 days), trend dashboards, team-level analytics, flakiness scores across runs, coverage over time

#### `exporter/`
- **OSS**: Export individual execution results (JSON, CSV, JUnit XML for CI)
- **Cloud**: Bulk export, scheduled reports, Slack/email digests, webhook push on completion

---

### Admin dashboard, user management, system health, activity feed

These four areas follow the same pattern — OSS gets the single-tenant operational version, cloud gets the multi-tenant + compliance + billing-aware version.

#### User management

- **OSS**: Invite users to a workspace, assign roles (admin/member/viewer), manage API keys, revoke access. Self-hosted teams need this to operate.
- **Cloud**: Org-level user management across workspaces, seat tracking for billing, SSO provisioning via SCIM (auto-provision/deprovision users from Okta, Azure AD), suspend or delete users across all workspaces from a single admin panel.

#### System health

Fully OSS — self-hosted operators *need* this to run the platform reliably. It covers:
- API server status (uptime, request latency, error rate)
- Database connection pool (active/idle connections, query latency)
- Redis connectivity and memory usage
- Scheduler queue depth (pending/running/failed jobs)
- Runner health (active executions, step throughput)
- Agent connections (connected agents, last heartbeat)

Cloud adds the multi-tenant layer:
- Per-workspace usage against plan limits (step executions, agents)
- Infra-level metrics (EKS node health, RDS connections, Redis evictions)
- SLA uptime tracking and incident history
- Automated alerts when an agent goes offline or a workspace exceeds thresholds

#### Activity feed

- **OSS**: Per-workspace feed showing who did what — flow runs, flow edits, schedule changes, environment changes, user invites. Standard team audit trail, visible to all workspace members.
- **Cloud**: Compliance-grade audit log — immutable, tamper-evident, exportable (SOC 2 / ISO 27001 requirement), configurable retention, filterable by user/resource/action. Cross-workspace activity visible to org admins. Anomaly detection ("this agent stopped reporting 2 hours ago", "unusual run volume from this user").

#### Admin dashboard (OSS vs cloud summary)

| Feature | OSS | Cloud |
|---------|:---:|:-----:|
| User invite + role assignment | ✅ | |
| API key management | ✅ | |
| System health (DB, Redis, scheduler, runner) | ✅ | |
| Agent connection status | ✅ | |
| Per-workspace activity feed | ✅ | |
| Org-level user management | | ✅ |
| SCIM provisioning (Okta, Azure AD) | | ✅ |
| Seat tracking for billing | | ✅ |
| Per-workspace usage vs. plan limits | | ✅ |
| Infra-level health (EKS, RDS, Redis) | | ✅ |
| SLA uptime + incident history | | ✅ |
| Compliance audit log (immutable, exportable) | | ✅ |
| Cross-workspace activity for org admins | | ✅ |
| Agent offline alerts | | ✅ |

---

### Full feature matrix

| Feature | OSS | Cloud |
|---------|:---:|:-----:|
| Flow execution engine | ✅ | |
| Action handlers (HTTP, DB, Kafka, gRPC, Redis, WS) | ✅ | |
| REST API + dashboard | ✅ | |
| CLI + MCP server | ✅ | |
| Self-hosted agent | ✅ | |
| Scheduling (cron) | ✅ | |
| OpenAPI / Postman import | ✅ | |
| Basic flow generation from prompt (BYO API key) | ✅ | |
| Self-healing suggestions (manual approval) | ✅ | |
| Plugin system | ✅ | |
| Per-execution reports + JUnit XML export | ✅ | |
| Tracing (OpenTelemetry) | ✅ | |
| JWT auth + API keys | ✅ | |
| Webhook-triggered runs (manual setup) | ✅ | |
| User invite + role assignment | ✅ | |
| System health dashboard (DB, Redis, scheduler, runner, agents) | ✅ | |
| Per-workspace activity feed | ✅ | |
| Multi-tenant workspace isolation | | ✅ |
| Agent token management + connection registry | | ✅ |
| Cloud job relay (WebSocket) | | ✅ |
| Billing + usage metering | | ✅ |
| SSO / SAML | | ✅ |
| SCIM provisioning (Okta, Azure AD) | | ✅ |
| Compliance audit log (immutable, exportable) | | ✅ |
| RBAC | | ✅ |
| Org-level user management + seat tracking | | ✅ |
| Infra health + SLA uptime tracking | | ✅ |
| Agent offline alerts + anomaly detection | | ✅ |
| Self-healing auto-apply | | ✅ |
| Coverage trends + flakiness scoring | | ✅ |
| Diff-to-impact (PR test selection) | | ✅ |
| GitHub App (one-click PR integration) | | ✅ |
| Automated PR comments | | ✅ |
| Long-term analytics + retention | | ✅ |
| Load testing (distributed) | | ✅ |
| Security scanning | | ✅ |
| Advanced code generation | | ✅ |
| Slack / email digests | | ✅ |
| SLA + priority support | | ✅ |

---

## Development Workflow

**OSS contributions:**
- PR to `testmesh/` repo
- Standard open source workflow, public CI

**Cloud development:**
- PR to `testmesh-cloud/` repo
- `control-plane/` imports OSS packages as a Go module dependency
- Cloud dashboard imports OSS dashboard components
- Separate deployment pipeline to cloud infra

**Versioning:**
- OSS follows semver, public releases
- Cloud deploys continuously from `main`
- Agent version must be compatible with control plane version (compatibility matrix in docs)

---

## What to Build Next (in order)

1. **`agent/` directory** — thin wrapper around existing runner, outbound WebSocket to a local mock control plane. Proves the architecture works before building cloud infra.
2. **Agent relay endpoint** — add to OSS API first (`/api/v1/agent/connect` WebSocket). This lets self-hosted users run agents against their own API too.
3. **Cloud control plane repo** — start with just tenancy + agent relay + result storage. No billing yet.
4. **Billing last** — add Stripe only when you have paying customers asking for it. Manual invoicing works fine at <10 customers.
