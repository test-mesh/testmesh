# TestMesh Pricing & Tier Structure

**Date**: 2026-03-29
**Status**: Draft

## Guiding Principles

1. **The agent is always free.** It's a thin relay — the value is in the control plane. Making it free removes adoption friction for enterprises with private networks.
2. **Self-hosted is fully featured.** OSS users get everything. No feature gates on the self-hosted deployment. This builds trust and community.
3. **Cloud tiers gate operational scale and premium intelligence features.** The control plane (managed infra, AI, PR write-back) is the product.
4. **Natural upgrade triggers:** 1 agent → N agents, 1 workspace → N workspaces, rate-limited AI → own keys.

## Industry Precedent

| Product | Agent/Runner | Revenue Model |
|---------|-------------|---------------|
| GitHub Actions | Self-hosted runner = free | Cloud platform + hosted runner minutes |
| Datadog | Agent = free/OSS | Data platform, retention, dashboards |
| GitLab | Runner = free/OSS | Premium/Ultimate feature tiers |
| Buildkite | Agent = free/OSS | Cloud dashboard, queuing, analytics |
| Tailscale | Client = free | Coordination server, team management |

TestMesh follows the same pattern: **free agent, paid control plane.**

---

## Tiers

### Self-Hosted (OSS) — Free

Everything runs on customer infrastructure. No cloud dependency.

- Unlimited workspaces, agents, flows, runs
- All action types and protocol support
- Full AI capabilities (bring your own keys)
- Full Git integration (webhooks, PR write-back, auto-fix PRs)
- Full embedding/semantic search (requires OpenAI key + pgvector)
- No SSO/SAML, no audit logs, community support only

### Cloud Free

For individuals and small teams evaluating the platform.

| Limit | Value |
|-------|-------|
| Workspaces | 1 |
| Site agents | 1 |
| Flow runs | 500/month |
| Git integrations | 1 repository |
| Webhook deliveries | 100/month |
| Environments | 2 |
| Execution retention | 7 days |
| AI | Community (rate-limited, shared model) |

**Not included:** PR write-back, diff analysis, workspace integrations, per-agent routing, semantic search, auto-fix PRs.

### Cloud Pro — $XX/month per workspace

For teams running TestMesh in production.

| Limit | Value |
|-------|-------|
| Workspaces | Unlimited |
| Site agents | Unlimited |
| Flow runs | 10,000/month |
| Git integrations | Unlimited |
| Webhook deliveries | 10,000/month |
| Environments | Unlimited |
| Execution retention | 90 days |
| AI | Bring your own keys |

**Includes:**
- PR write-back (comments + commit status checks)
- Diff analysis on webhook events
- Workspace-scoped integrations
- Per-agent AI provider routing
- Semantic search (embeddings)
- Email support

**Not included:** Auto-fix PRs, SSO/SAML, audit logs, custom agent pools.

### Cloud Enterprise — Custom pricing

For organizations with compliance and scale requirements.

Everything in Pro, plus:

- Unlimited flow runs
- Auto-fix PRs from self-healing
- Custom agent pools (dedicated queues per environment/team)
- SSO / SAML
- Audit logs (who did what, when)
- Custom execution retention
- Dedicated support + SLA
- On-boarding assistance

---

## Feature Gate Details

### What gates on tier (Cloud only)

| Feature | Free | Pro | Enterprise |
|---------|------|-----|------------|
| Site agent connections | 1 | Unlimited | Unlimited |
| PR write-back | — | Yes | Yes |
| Auto-fix PRs | — | — | Yes |
| Workspace integrations | — | Unlimited | Unlimited |
| Per-agent AI routing | — | Yes | Yes |
| Semantic search | — | Yes | Yes |
| Diff analysis | — | Yes | Yes |
| SSO / SAML | — | — | Yes |
| Audit logs | — | — | Yes |
| Custom agent pools | — | — | Yes |

### What does NOT gate (available to all tiers including Free)

- Flow execution (all action types)
- CLI (run, debug, validate, watch, generate, chat)
- Dashboard
- Mock servers
- Scheduling
- MCP server integration
- Basic webhook triggers

---

## Rationale for Specific Decisions

### Why is the agent free?

Enterprises with private networks are the highest-value customers. They literally cannot evaluate TestMesh without the agent. Gating it kills the funnel before it starts. The agent is the **on-ramp**, not the **product**.

### Why is self-hosted fully free?

1. Builds trust and open-source community
2. Companies that self-host often migrate to cloud later for convenience
3. Self-hosted users contribute bug reports, docs, and plugins
4. Competing with "just self-host for free" is a losing strategy — embrace it

### Why is auto-fix PRs Enterprise-only?

Auto-fix PRs are the highest-risk, highest-automation feature. It creates branches and opens PRs automatically. Enterprise customers have the governance processes (code review, CI gates) to handle this safely. Gating it to Enterprise also creates a clear upgrade path from Pro.

### Why are embeddings Pro (not Enterprise)?

Embeddings improve agent analysis quality but don't introduce operational risk. Making them Pro-only encourages Pro adoption with a tangible quality improvement. The marginal cost is low (OpenAI embedding calls are cheap).

---

## Implementation Notes

- Tier enforcement happens in the API middleware, not in the agent
- The agent binary is identical across all tiers — it has no knowledge of tiers
- Feature flags should be checked via workspace metadata, not hardcoded
- Self-hosted deployments should never check tier — all features are always available
- Cloud tier metadata is stored per-workspace and loaded at request time
