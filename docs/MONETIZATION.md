# Monetization & Distribution Strategy

---

## Core Decision: Open Core Model

**Keep the API and dashboard fully open source.**

Reasons:
- Open source is the distribution strategy for developer tools. Developers adopt tools they can inspect, self-host, and contribute to
- Closed source kills organic adoption — you need teams to try it without a sales call
- Competitors like Grafana, GitLab, Sentry, and Temporal all proved this model works at scale
- The moat is not the code, it's the cloud platform, the network effects, and the AI layer on top

**What stays open source:**
- API server
- Dashboard
- CLI
- MCP server
- All action handlers and runners

**What is cloud/enterprise only:**
- Managed execution infrastructure
- Advanced AI features (self-healing auto-apply, PR impact analysis, coverage trends)
- SSO / SAML
- Audit logs
- RBAC and team management
- SLA and priority support
- Long-term result retention and analytics

---

## The Connectivity Problem (and the Solution)

This is the central challenge: if tests need to reach internal services (databases, internal APIs, Kafka), a cloud runner can't do that without network access.

**The solution: self-hosted execution agent + cloud control plane.**

This is the same architecture used by:
- GitHub Actions (self-hosted runners)
- Grafana Agent
- Datadog Agent
- Tailscale
- Cloudflare Tunnel

```
Cloud (TestMesh SaaS)                 Customer Network
┌─────────────────────┐               ┌──────────────────────────────┐
│  Control Plane      │               │  TestMesh Agent              │
│  - scheduling       │◄──────────────│  - pulls jobs from cloud     │
│  - results storage  │               │  - executes flows locally    │
│  - AI analysis      │──────────────►│  - sends results to cloud    │
│  - dashboard        │               │  - no inbound ports needed   │
│  - notifications    │               └──────────────────────────────┘
└─────────────────────┘                         │
                                                ▼
                                   internal-api:8080
                                   postgres:5432
                                   kafka:9092
                                   redis:6379
```

**How it works:**
1. Customer installs the TestMesh Agent inside their network (single Docker container or binary)
2. Agent connects outbound to the cloud control plane (no inbound ports, no firewall changes)
3. Cloud sends flow execution jobs to the agent via a persistent connection (WebSocket or long-poll)
4. Agent executes flows locally, hitting internal services directly
5. Agent streams results back to cloud (no raw data, just execution results and logs)
6. Dashboard shows results, AI analysis runs in cloud

**What the agent needs:**
```bash
docker run -e AGENT_TOKEN=<token> testmesh/agent
```
One command. That's the entire setup.

**Security properties:**
- Outbound-only connection (agent initiates, never cloud)
- Agent token scoped to workspace
- Only execution results leave the network (not internal data unless captured in assertions)
- Agent can be configured to redact sensitive fields

---

## Pricing Model

### Tiers

**Free (OSS / Self-hosted)**
- Full API, dashboard, CLI — self-managed
- No limits
- Community support only
- Target: individual developers, small teams evaluating

**Starter — $49/month**
- Cloud dashboard and result storage
- 1 agent connection
- 5,000 step executions/month
- 30-day result retention
- Email notifications
- Target: small startups, solo engineers

**Team — $199/month**
- 5 agent connections
- 50,000 step executions/month
- 90-day result retention
- Slack/webhook notifications
- AI failure analysis
- PR integration (GitHub, GitLab)
- Target: engineering teams (5–20 people)

**Business — $799/month**
- Unlimited agent connections
- 500,000 step executions/month
- 1-year retention
- Self-healing suggestions (AI auto-repair)
- Coverage analysis
- RBAC and team management
- Priority support
- Target: mid-size companies with dedicated QA

**Enterprise — custom ($2k–$20k+/month)**
- Fully self-hosted cloud plane option (no data leaves the building)
- SSO / SAML
- Audit logs
- Custom data retention
- SLA
- Dedicated support
- Target: regulated industries, large engineering orgs

---

## Path to $1M ARR

```
10 Team customers   × $199  = $1,990/month
20 Team customers   × $199  = $3,980/month
50 Team customers   × $199  = $9,950/month
100 Team customers  × $199  = $19,900/month   ← ~$240k ARR
200 Team customers  × $199  = ~$480k ARR
+ 20 Business       × $799  = +$192k ARR
                              ≈ $670k ARR

Add 5 Enterprise    × $3k   = +$180k ARR
                              ≈ $850k ARR
```

Realistic with strong developer adoption and one enterprise channel.

---

## Go-To-Market

**Phase 1 — Developer adoption (bottom-up)**

The CLI and MCP server are the distribution channel. Developers install them, use them locally, hit limits or want cloud features, upgrade.

- `testmesh agent` should be stupidly easy to install
- Free cloud tier with generous limits
- GitHub Action: `testmesh/run-flows@v1` — runs flows in CI, posts results as PR comment
- VS Code / Cursor extension (via MCP)

**Phase 2 — Team adoption**

When one developer loves it, the pitch to the team is:
- "Shared dashboard for all test results"
- "Scheduled runs with alerting"
- "AI explains failures so you don't have to dig"

This is a $199/month conversation, not a sales call.

**Phase 3 — Enterprise**

Enterprise buys when:
- Compliance requires on-prem data
- They need SSO and audit logs
- Engineering org is large enough that $799/month is noise

---

## What NOT to Build Early

- Do not build a browser/UI testing agent before API/integration testing is proven
- Do not build a chat UI in the dashboard (see `docs/features/AI_AGENTS.md`)
- Do not build a marketplace or plugin ecosystem until you have 1,000+ active users
- Do not price per seat early — execution-based pricing is easier to sell to developers

---

## The Narrative

Positioning as "another testing tool" loses.

Positioning as **"Autonomous QA Engineer"** wins:

> TestMesh watches your codebase, generates tests when you ship features, runs them in your infrastructure, and fixes them when they break — without a QA team.

That's the $100M narrative. The agent connectivity model is what makes it credible — because tests actually run against real systems, not mocked cloud sandboxes.
