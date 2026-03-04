# Implementation Decisions

## Overview

This document records all key technical decisions for TestMesh v1.0 implementation.

**Status**: ✅ Decisions Finalized
**Date**: 2024-01-15
**Ready for Implementation**: ✅ Yes (awaiting start signal)

---

## 🎯 Technology Stack Decisions

### Backend

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Primary Language** | **Go** | Performance critical for test execution engine. Better concurrency, lower memory footprint, excellent for CLI tools. |
| **Database** | **PostgreSQL** (single instance with schemas) | Simpler to manage for v1.0. Easier transactions across services. Can split into per-service DBs in v2.0 if needed. |
| **Time-series DB** | **TimescaleDB** (PostgreSQL extension) | Metrics and execution history. Seamless integration with PostgreSQL. |
| **Cache** | **Redis** | Caching, distributed locks, session storage. Industry standard. |
| **Message Queue** | **Redis Streams** | Job queue for test execution. Already using Redis for caching - reuse infrastructure. Provides persistence, consumer groups, acknowledgments. Simpler than RabbitMQ. |
| **Authentication** | **JWT + API Keys** (self-hosted) | JWT for web users, API keys for CLI/CI-CD. No external dependencies. Simple to implement. |
| **Secrets Management** | **Encrypted in Database** (AES-256) | Simple for v1.0. Keys in environment variables. Vault integration can be added in v1.1. |
| **API Design** | **REST** | Standard, simple, great for CLI. Better documentation. GraphQL adds unnecessary complexity for v1.0. |

### Frontend

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Framework** | **Next.js 14** (App Router) | React framework with SSR, routing, optimization built-in. Better SEO, faster page loads, modern architecture. |
| **Language** | **TypeScript** | Type safety, better IDE support, catches errors early. |
| **Build Tool** | **Turbopack** (Next.js built-in) | Faster than Webpack, modern, maintained by Vercel. |
| **UI Library** | **Tailwind CSS** | Utility-first, fast development, great with Next.js. |
| **Component Library** | **shadcn/ui** | Accessible components built on Radix UI. Copy-paste, customizable, modern. |
| **Visual Editor** | **React Flow** | Most popular (20k+ stars), great docs, proven in production. |
| **Code Editor** | **Monaco Editor** (VS Code engine) | Industry-standard, excellent TypeScript support, syntax highlighting. |
| **Forms** | **React Hook Form** | Performant, great validation, excellent TypeScript support. |
| **State Management** | **Zustand** | Simple, minimal boilerplate, TypeScript-friendly. Use React Query for server state. |
| **Real-time Updates** | **Socket.io** | Simple, reliable, good Next.js integration. Handles reconnection automatically. |
| **Charts** | **Recharts** | React-friendly, declarative, good for dashboards. |
| **Data Fetching** | **TanStack Query (React Query)** | Excellent caching, loading states, error handling. Standard for Next.js. |

### CLI

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Language** | **Go** | Same as backend, single binary distribution, excellent CLI libraries (cobra, viper). |
| **CLI Framework** | **Cobra** | Industry standard (used by kubectl, docker, hugo). Great command structure, auto-completion. |
| **Configuration** | **Viper** | YAML/JSON/ENV support, watches config changes, integrates with Cobra. |

### Infrastructure

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Container Runtime** | **Docker** | Industry standard, excellent tooling. |
| **Orchestration** | **Kubernetes** | Cloud-agnostic, scales well, industry standard. Deploy anywhere (AWS, GCP, Azure, on-premise). |
| **Package Manager** | **Helm** | Standard for Kubernetes, templating, versioning. |
| **Infrastructure as Code** | **Terraform** (optional) | For cloud resources. Users can choose to use it or not. |
| **Monitoring** | **Prometheus + Grafana** | Open source, industry standard, great Kubernetes integration. |
| **Logging** | **Loki + Grafana** | Simpler than ELK, integrates with Prometheus/Grafana, cost-effective. |
| **Tracing** | **Jaeger** | OpenTelemetry compatible, open source, proven. |
| **Metrics Format** | **OpenTelemetry** | Industry standard, future-proof, vendor-neutral. |

### Development Tools

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Monorepo Tool** | **pnpm workspaces** (frontend) + **Go modules** (backend) | Fast, efficient, good monorepo support. |
| **CI/CD** | **GitHub Actions** | Free for open source, great integration, widely used. |
| **Linting** | **golangci-lint** (Go) + **ESLint** (TypeScript) | Comprehensive, fast, configurable. |
| **Formatting** | **gofmt** (Go) + **Prettier** (TypeScript) | Standard tools, automatic formatting. |
| **Testing** | **Go testing** (backend) + **Vitest** (frontend) | Fast, modern, excellent TypeScript support. |
| **E2E Testing** | **Playwright** | Modern, multi-browser, great API, TypeScript support. |

### Browser Automation

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Library** | **Playwright** | Modern, fast, multi-browser (Chrome, Firefox, Safari), excellent API. Better than Puppeteer or Selenium. |

### Plugin System

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Primary Language** | **JavaScript/TypeScript** (Node.js) | Largest ecosystem, easy for users to create plugins. |
| **Secondary Languages** | **Go, Python, WASM, HTTP** | Multi-language support for flexibility. |
| **Distribution** | **npm** + **GitHub** | Standard for JS/TS, easy to publish and install. Custom marketplace in v1.1. |

### Documentation

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Platform** | **Docusaurus** | React-based, modern, search built-in, versioning, great for technical docs. |
| **Hosting** | **GitHub Pages** or **Vercel** | Free, easy deployment, custom domain support. |

---

## 🚀 Deployment & Hosting Decisions

### Hosting Model

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **v1.0** | **Self-hosted only** | Users deploy to their own infrastructure. No hosting costs, full control, no multi-tenancy complexity. |
| **v1.1+** | **Optional SaaS offering** | Can add hosted version later if demand exists. Requires multi-tenancy, billing, support. |

### Deployment Targets

| Target | Support Level | Notes |
|--------|---------------|-------|
| **Kubernetes** | ✅ Primary | Helm charts provided, works on any K8s cluster. |
| **Docker Compose** | ✅ Development | For local development and small deployments. |
| **AWS** | ✅ Documented | EKS deployment guide, Terraform examples. |
| **GCP** | ✅ Documented | GKE deployment guide, Terraform examples. |
| **Azure** | ✅ Documented | AKS deployment guide, Terraform examples. |
| **On-premise** | ✅ Supported | Deploy to any Kubernetes cluster. |

### Cloud Resources

Users deploy TestMesh themselves. We provide:
- Helm charts
- Docker Compose files
- Terraform examples (optional)
- Deployment guides for major clouds

---

## 📦 Architecture Decisions

### Service Architecture

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Pattern** | **Modular Monolith** | Single service with domain-driven modules (API, Runner, Scheduler, Storage). Simpler for v1.0, can split into microservices in v2.0 when needed. |
| **Modules** | **4 domains** | `api`, `runner`, `scheduler`, `storage` - each in its own package with clear boundaries. |
| **Communication** | **In-process** (function calls) + **Redis Streams** (async jobs) | Direct function calls between modules. Redis Streams for background jobs. Fast, simple. |
| **Database** | **Single PostgreSQL with schemas** | One DB instance, separate schemas per domain. Clean separation for future split. |
| **Agent Architecture** | **Distributed agents** | Agents run in user's networks, connect to control plane. Secure, flexible, no VPN needed. |
| **Future Migration** | **Extract to microservices** | When scale requires, extract domains as separate services. Already has clean boundaries. |

### Load Testing

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Implementation** | **Build custom** | Integrated with flow execution engine. Better UX (same interface). Estimated: 6-8 weeks. |
| **Fallback Plan** | **Integrate k6** | If timeline slips, integrate k6 instead of building custom. Faster but separate tool. |

---

## 🏗️ Modular Monolith Architecture

### Why Modular Monolith for v1.0?

**Benefits**:
- ✅ **Simpler deployment** - Single binary, easier to run
- ✅ **Faster development** - No distributed system complexity
- ✅ **Easier debugging** - All code in one process
- ✅ **Better performance** - In-process calls, no network overhead
- ✅ **Simpler transactions** - Single database transactions across domains
- ✅ **Lower operational overhead** - One service to monitor
- ✅ **Clean migration path** - Can extract to microservices when needed

**When to split into microservices** (v2.0+):
- Independent scaling needs (e.g., Test Runner needs 10x capacity)
- Different deployment frequencies
- Team structure demands it (separate teams per service)
- Technology diversity required (unlikely)

### Domain Structure

```
testmesh/
└── server/                    # Single Go service
    ├── main.go               # Entry point
    ├── cmd/                  # Commands
    │   ├── server/           # HTTP server
    │   └── worker/           # Background worker
    ├── internal/
    │   ├── api/              # Domain: API Gateway
    │   │   ├── handlers/     # HTTP handlers
    │   │   ├── middleware/   # Auth, logging, etc.
    │   │   └── router/       # Route definitions
    │   ├── runner/           # Domain: Test Execution
    │   │   ├── executor/     # Core execution engine
    │   │   ├── actions/      # Action handlers (HTTP, DB, etc.)
    │   │   ├── assertions/   # Assertion engine
    │   │   └── context/      # Execution context
    │   ├── scheduler/        # Domain: Job Scheduling
    │   │   ├── cron/         # Cron scheduling
    │   │   ├── queue/        # Job queue management
    │   │   └── worker/       # Worker pool
    │   ├── storage/          # Domain: Data Storage
    │   │   ├── flows/        # Flow CRUD
    │   │   ├── executions/   # Execution results
    │   │   └── metrics/      # Metrics collection
    │   └── shared/           # Shared utilities
    │       ├── database/     # DB client
    │       ├── cache/        # Redis client
    │       ├── queue/        # Redis Streams client
    │       ├── auth/         # JWT/API key auth
    │       └── logger/       # Structured logging
    └── pkg/                  # Public packages (if any)
```

### Domain Communication Rules

**Allowed**:
- ✅ API → Runner (direct function call)
- ✅ API → Scheduler (direct function call)
- ✅ API → Storage (direct function call)
- ✅ Scheduler → Runner (via Redis Streams)
- ✅ Runner → Storage (direct function call)
- ✅ Any domain → Shared (direct import)

**Not Allowed**:
- ❌ Runner → API (circular dependency)
- ❌ Storage → API (circular dependency)
- ❌ Scheduler → API (circular dependency)

**Dependency Flow**: API → Scheduler → Runner → Storage → Shared

### Future Microservices Split

When ready to split (v2.0+), each domain becomes a service:

```
Before (Monolith):           After (Microservices):
┌─────────────────┐         ┌──────────┐
│   TestMesh      │         │ API      │
│   Server        │         │ Gateway  │
│                 │         └────┬─────┘
│  ┌───────────┐  │              │ REST
│  │   API     │  │              ▼
│  ├───────────┤  │    ┌─────────────────┐
│  │  Scheduler│  │───▶│   Scheduler     │
│  ├───────────┤  │    └────────┬────────┘
│  │  Runner   │  │             │ Queue
│  ├───────────┤  │             ▼
│  │  Storage  │  │    ┌─────────────────┐
│  └───────────┘  │    │   Test Runner   │
└─────────────────┘    └────────┬────────┘
                                │ REST
                                ▼
                       ┌─────────────────┐
                       │  Result Store   │
                       └─────────────────┘
```

**Migration steps**:
1. Extract Storage domain → Result Store service
2. Extract Runner domain → Test Runner service
3. Extract Scheduler domain → Scheduler service
4. API Gateway remains as frontend

**Preparation in monolith**:
- Each domain has its own database schema
- Clear interfaces between domains
- No circular dependencies
- Communication via interfaces (easy to swap with HTTP/gRPC)

---

## 🔐 Security Decisions

### Authentication & Authorization

| Aspect | Decision | Details |
|--------|----------|---------|
| **Web Users** | JWT tokens | 1 hour expiry, refresh tokens for longer sessions. |
| **CLI Users** | API Keys | Long-lived tokens for CLI and CI/CD. Scoped permissions. |
| **Password Hashing** | bcrypt (cost 12) | Industry standard, proven. |
| **HTTPS** | Required in production | Let's Encrypt for free SSL certificates. |
| **Secrets Storage** | AES-256 encrypted in DB | Encryption keys in environment variables. Vault integration in v1.1. |
| **RBAC** | v1.1 feature | Basic auth in v1.0, full RBAC in v1.1. |

### Data Privacy

| Aspect | Decision |
|--------|----------|
| **Telemetry** | Opt-in anonymous analytics only |
| **Data Collection** | Only what's necessary for functionality |
| **GDPR Compliance** | Self-hosted = users control data |
| **Logs** | Sanitize sensitive data (passwords, API keys) |

---

## 📖 Distribution & Licensing Decisions

### Open Source

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **License** | **Apache 2.0** | Permissive, patent protection, commercial-friendly. Encourages adoption and contributions. |
| **Repository** | **GitHub** (public) | Largest developer community, excellent tools (Actions, Discussions, Projects). |
| **Contributions** | **Welcome** | CLA not required initially. Standard PR process. |

### Distribution

| Component | Distribution Method |
|-----------|---------------------|
| **CLI** | GitHub Releases (binaries), Homebrew, apt/yum repos |
| **Docker Images** | Docker Hub + GitHub Container Registry |
| **Helm Charts** | GitHub Pages (Helm repository) |
| **Documentation** | docs.testmesh.io (GitHub Pages or Vercel) |
| **Plugins** | npm registry + GitHub |

---

## 🎯 Version Support

### Minimum Versions

| Technology | Minimum Version | Rationale |
|------------|-----------------|-----------|
| **Node.js** | 18.x (LTS) | Next.js 14 requirement |
| **Go** | 1.21+ | Generics, modern features |
| **PostgreSQL** | 14+ | Performance, features |
| **Redis** | 6+ | Streams support |
| **Kubernetes** | 1.25+ | Recent stable version |
| **Docker** | 20.10+ | Modern features |

### Browser Support (Dashboard)

| Browser | Minimum Version |
|---------|-----------------|
| Chrome/Edge | 90+ |
| Firefox | 90+ |
| Safari | 14+ |

---

## 📅 Release Strategy

### Versioning

| Aspect | Strategy |
|--------|----------|
| **Scheme** | Semantic Versioning (SemVer) |
| **v1.0** | First production-ready release |
| **v1.x** | Feature additions, backwards compatible |
| **v2.0** | Breaking changes (if needed) |

### Release Cadence

| Release Type | Frequency |
|--------------|-----------|
| **Major** | When needed (breaking changes) |
| **Minor** | Every 2-3 months (new features) |
| **Patch** | As needed (bug fixes) |

### Support Policy

| Version | Support |
|---------|---------|
| **Latest** | Full support (bug fixes, features) |
| **Previous** | Security fixes for 6 months |
| **Older** | Community support only |

---

## 🌍 Community & Support

### Communication Channels

| Channel | Purpose | Decision |
|---------|---------|----------|
| **GitHub Issues** | Bug reports, feature requests | ✅ Primary |
| **GitHub Discussions** | Q&A, community discussions | ✅ Yes |
| **Discord** | Real-time chat, community | ⏳ v1.1 (after launch) |
| **Twitter/X** | Announcements, updates | ✅ Yes |
| **Blog** | Technical posts, announcements | ✅ Yes (Docusaurus blog) |

### Roadmap

| Aspect | Decision |
|--------|----------|
| **Public Roadmap** | ✅ Yes - GitHub Projects |
| **Feature Voting** | ✅ Yes - GitHub Discussions + upvotes |
| **Transparency** | ✅ Open development, public discussions |

---

## 🔄 Migration & Compatibility

### Import Support

| Format | Support Level |
|--------|---------------|
| **OpenAPI 3.0** | ✅ Full support |
| **Swagger 2.0** | ✅ Full support |
| **Postman Collection v2.1** | ✅ Full support |
| **HAR files** | ✅ Full support |
| **cURL commands** | ✅ Full support |
| **GraphQL Schema** | ✅ Full support |

### Export Support

| Format | Support Level |
|--------|---------------|
| **YAML** | ✅ Native format |
| **JSON** | ✅ Full support |
| **OpenAPI 3.0** | ⏳ v1.1 |
| **Postman Collection** | ⏳ v1.1 |

---

## ⚠️ Explicitly Excluded from v1.0

These features are **intentionally not included** in v1.0:

| Feature | Reason | Future |
|---------|--------|--------|
| **Code Generation** | Not core to testing workflow | Not planned |
| **Documentation Generation** | Not core to testing | Not planned |
| **Comments/Collaboration** | Use Git-based workflows | Maybe v2.0 |
| **Multi-tenancy** | Self-hosted only in v1.0 | v1.1+ (for SaaS) |
| **RBAC** | Simple auth sufficient for v1.0 | v1.1 |
| **SSO** | Not needed for self-hosted | v1.1+ (enterprise) |
| **Advanced Analytics** | Basic metrics sufficient | v1.2 |
| **Mobile App** | Dashboard is responsive web | Not planned |

---

## 📊 Success Metrics

### Technical Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Test Execution Overhead** | < 100ms | Per test startup time |
| **System Throughput** | > 100 tests/minute | Single runner instance |
| **API Response Time (P95)** | < 200ms | All endpoints |
| **System Uptime** | 99.9% | Production instances |
| **Time to First Test** | < 15 minutes | New user onboarding |

### Quality Metrics

| Metric | Target |
|--------|--------|
| **Code Coverage** | > 80% |
| **Security Vulnerabilities** | 0 high/critical |
| **Documentation Coverage** | 100% of public APIs |
| **Load Test Capacity** | 1000 VUs per runner |

---

## 🚀 Next Steps

### Before Implementation

- [x] Document all decisions (this file)
- [x] Update TECH_STACK.md with Next.js
- [x] Update PROJECT_STRUCTURE.md for Next.js
- [ ] Set up Git repository
- [ ] Create initial project structure
- [ ] Configure development environment
- [ ] Set up CI/CD pipeline skeleton

### Phase 1: Foundation (Weeks 1-8)

See IMPLEMENTATION_PLAN.md for detailed breakdown.

---

## 📝 Change Log

| Date | Change | Reason |
|------|--------|--------|
| 2024-01-15 | Initial decisions documented | Pre-implementation planning |
| 2024-01-15 | Changed React to Next.js 14 | Better SSR, routing, optimization |

---

## ✅ Sign-off

All critical decisions have been made and documented. The project is ready for implementation to begin on your signal.

**Stack Summary**:
- Backend: **Go + PostgreSQL + Redis** (with Redis Streams for job queue)
- Frontend: **Next.js 14 + TypeScript + Tailwind + shadcn/ui**
- Infrastructure: **Kubernetes + Prometheus + Loki + Jaeger**
- Distribution: **Open Source (Apache 2.0), Self-hosted**

**Ready to build!** 🚀
