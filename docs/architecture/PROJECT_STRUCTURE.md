# TestMesh Project Structure

## Repository Organization

TestMesh uses a **multi-repository architecture** with separate repositories for backend (Go) and frontend (TypeScript).

**Rationale**:
- Clear separation of concerns
- Independent versioning and releases
- Different CI/CD pipelines for different languages
- Easier to manage dependencies and tooling
- Better suited for polyglot development

---

## Repository Structure

### 1. Backend Repository: `testmesh-server` (Go)

Main backend service containing the modular monolith, CLI, and plugins.

```
testmesh-server/
├── cmd/
│   ├── server/              # HTTP API server
│   │   └── main.go
│   ├── worker/              # Background job worker
│   │   └── main.go
│   ├── cli/                 # CLI tool
│   │   └── main.go
│   └── migrate/             # Database migration tool
│       └── main.go
├── internal/                # Private application code
│   ├── api/                 # API Domain
│   │   ├── handlers/        # HTTP handlers
│   │   ├── middleware/      # Middleware (auth, logging, etc.)
│   │   ├── routes/          # Route definitions
│   │   └── websocket/       # WebSocket handlers
│   ├── runner/              # Runner Domain
│   │   ├── executor/        # Test execution engine
│   │   ├── actions/         # Action handlers (HTTP, DB, etc.)
│   │   ├── assertions/      # Assertion engine
│   │   ├── context/         # Execution context
│   │   └── plugins/         # Plugin system
│   ├── scheduler/           # Scheduler Domain
│   │   ├── cron/            # Cron parser
│   │   ├── jobs/            # Job definitions
│   │   └── triggers/        # Execution triggers
│   ├── storage/             # Storage Domain
│   │   ├── repositories/    # Data repositories
│   │   ├── models/          # Domain models
│   │   └── migrations/      # SQL migrations
│   └── shared/              # Shared utilities
│       ├── config/          # Configuration
│       ├── logger/          # Logging
│       ├── errors/          # Error types
│       └── utils/           # Utilities
├── pkg/                     # Public libraries (can be imported by other Go projects)
│   ├── client/              # Go API client
│   ├── types/               # Shared types
│   └── validation/          # Validation utilities
├── plugins/                 # Built-in plugins
│   ├── http/                # HTTP action plugin
│   ├── database/            # Database plugin
│   ├── kafka/               # Kafka plugin
│   ├── grpc/                # gRPC plugin
│   ├── websocket/           # WebSocket plugin
│   ├── browser/             # Browser automation (Playwright)
│   └── mcp/                 # MCP integration plugin
├── tests/                   # Tests
│   ├── unit/                # Unit tests
│   ├── integration/         # Integration tests
│   └── e2e/                 # End-to-end tests
├── scripts/                 # Build and deployment scripts
├── deployments/             # Deployment configurations
│   ├── docker/              # Dockerfiles
│   │   ├── Dockerfile.server
│   │   ├── Dockerfile.worker
│   │   └── Dockerfile.cli
│   ├── kubernetes/          # Kubernetes manifests
│   │   ├── base/
│   │   └── overlays/
│   └── helm/                # Helm charts
│       └── testmesh-server/
├── docs/                    # Backend-specific documentation
├── examples/                # Example flows and tests
├── .github/                 # GitHub Actions workflows
│   └── workflows/
├── go.mod
├── go.sum
├── Makefile
├── README.md
└── .gitignore
```

### 2. Frontend Repository: `testmesh-dashboard` (TypeScript)

Web dashboard built with Next.js 16.

```
testmesh-dashboard/
├── app/                     # Next.js 16 App Router
│   ├── (auth)/              # Auth route group
│   │   ├── login/
│   │   └── register/
│   ├── (dashboard)/         # Dashboard route group
│   │   ├── flows/           # Flows list and detail
│   │   ├── collections/     # Collections management
│   │   ├── executions/      # Execution history
│   │   ├── analytics/       # Analytics dashboard
│   │   ├── settings/        # Settings pages
│   │   └── layout.tsx       # Dashboard layout
│   ├── api/                 # API routes (if needed)
│   ├── layout.tsx           # Root layout
│   ├── page.tsx             # Home page
│   └── globals.css          # Global styles
├── components/              # React components
│   ├── ui/                  # shadcn/ui components
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── dialog.tsx
│   │   └── ...
│   ├── flow/                # Flow-related components
│   │   ├── FlowEditor.tsx   # Visual flow editor (React Flow)
│   │   ├── FlowNode.tsx
│   │   └── FlowCanvas.tsx
│   ├── request/             # Request builder components
│   │   ├── RequestBuilder.tsx
│   │   ├── ResponseViewer.tsx
│   │   └── BodyEditor.tsx
│   ├── collections/         # Collection components
│   │   ├── CollectionTree.tsx
│   │   └── FolderView.tsx
│   └── shared/              # Shared components
│       ├── Header.tsx
│       ├── Sidebar.tsx
│       └── Layout.tsx
├── lib/                     # Utilities and helpers
│   ├── api/                 # API client (calls testmesh-server)
│   │   ├── client.ts
│   │   ├── flows.ts
│   │   ├── executions.ts
│   │   └── auth.ts
│   ├── hooks/               # Custom React hooks
│   │   ├── useFlow.ts
│   │   ├── useExecution.ts
│   │   └── useWebSocket.ts
│   ├── store/               # State management (Zustand)
│   │   ├── flowStore.ts
│   │   ├── authStore.ts
│   │   └── uiStore.ts
│   ├── utils/               # Utility functions
│   │   ├── validation.ts
│   │   ├── formatting.ts
│   │   └── yaml.ts
│   └── types/               # TypeScript types
│       ├── flow.ts
│       ├── execution.ts
│       └── api.ts
├── public/                  # Static assets
│   ├── images/
│   ├── icons/
│   └── fonts/
├── styles/                  # Additional styles
├── tests/                   # Tests
│   ├── unit/                # Unit tests (Vitest)
│   ├── integration/         # Integration tests
│   └── e2e/                 # E2E tests (Playwright)
├── .github/                 # GitHub Actions workflows
│   └── workflows/
├── next.config.ts           # Next.js 16 configuration
├── tailwind.config.ts       # Tailwind configuration
├── tsconfig.json            # TypeScript configuration
├── package.json
├── pnpm-lock.yaml           # Using pnpm
├── README.md
└── .gitignore
```

---

## Technology Choices

### Backend (Go)
- **Go 1.22+** - Latest stable Go version
- **Gin** - Web framework
- **GORM** - ORM with PostgreSQL driver
- **Cobra** - CLI framework
- **Viper** - Configuration management
- **Zap** - Structured logging
- **go-redis** - Redis client

### Frontend (TypeScript)
- **Next.js 16** - React framework with App Router
- **React 19** - Latest React version
- **TypeScript 5.6+** - Type safety
- **pnpm** - Fast, efficient package manager
- **Tailwind CSS** - Utility-first CSS
- **shadcn/ui** - UI component library
- **React Flow** - Visual flow editor
- **Monaco Editor** - Code editor
- **TanStack Query (React Query)** - Server state management
- **Zustand** - Client state management
- **Zod** - Schema validation
- **Socket.io-client** - Real-time communication
- **Recharts** - Charts and analytics

---

## Development Workflow

### Backend Development

```bash
# Clone repository
git clone https://github.com/testmesh/testmesh-server.git
cd testmesh-server

# Install dependencies
go mod download

# Set up environment
cp .env.example .env

# Start dependencies (PostgreSQL, Redis)
docker-compose up -d

# Run database migrations
make migrate-up

# Run tests
make test

# Start server in development mode
make dev-server

# Start worker in development mode
make dev-worker

# Build CLI
make build-cli
```

### Frontend Development

```bash
# Clone repository
git clone https://github.com/testmesh/testmesh-dashboard.git
cd testmesh-dashboard

# Install dependencies (using pnpm)
pnpm install

# Set up environment
cp .env.example .env.local

# Run development server
pnpm dev

# Run tests
pnpm test

# Build for production
pnpm build

# Start production server
pnpm start
```

---

## Environment Configuration

### Backend (.env)

```bash
# Server
PORT=5016
ENV=development

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/testmesh?sslmode=disable
DATABASE_MAX_CONNECTIONS=25
DATABASE_MAX_IDLE_CONNECTIONS=5

# Redis
REDIS_URL=redis://localhost:6379/0
REDIS_PASSWORD=

# JWT
JWT_SECRET=your-secret-key-change-this
JWT_EXPIRATION=24h

# Storage
STORAGE_TYPE=s3
S3_BUCKET=testmesh-artifacts
S3_REGION=us-east-1

# Observability
LOG_LEVEL=info
PROMETHEUS_PORT=9090
JAEGER_ENDPOINT=http://localhost:14268/api/traces

# AI Integration
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

### Frontend (.env.local)

```bash
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:5016
NEXT_PUBLIC_WS_URL=ws://localhost:5016

# Environment
NEXT_PUBLIC_ENV=development

# Feature Flags
NEXT_PUBLIC_ENABLE_AI=true
NEXT_PUBLIC_ENABLE_MOCK_SERVER=true

# Analytics (optional)
NEXT_PUBLIC_ANALYTICS_ID=
```

---

## Inter-Repository Communication

### API Communication

The frontend communicates with the backend via:

1. **REST API** - HTTP requests for CRUD operations
2. **WebSocket** - Real-time updates for execution status
3. **Server-Sent Events** - Streaming logs

### API Client Structure

```typescript
// lib/api/client.ts
import axios from 'axios';

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token interceptor
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default apiClient;
```

---

## Deployment

### Separate Deployments

Each repository has its own deployment pipeline:

**Backend Deployment**:
- Docker image: `testmesh/server:latest`
- Kubernetes deployment with HPA
- Exposes REST API and WebSocket

**Frontend Deployment**:
- Docker image: `testmesh/dashboard:latest`
- Static hosting (Vercel, Netlify) or Kubernetes
- Configures API_URL to point to backend

### Docker Compose (Local Development)

```yaml
# docker-compose.yml (in a shared repo or locally)
version: '3.8'

services:
  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: testmesh
      POSTGRES_USER: testmesh
      POSTGRES_PASSWORD: testmesh
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    ports:
      - "6379:6379"

  server:
    build:
      context: ./testmesh-server
      dockerfile: deployments/docker/Dockerfile.server
    ports:
      - "5016:5016"
    environment:
      DATABASE_URL: postgresql://testmesh:testmesh@postgres:5432/testmesh
      REDIS_URL: redis://redis:6379/0
    depends_on:
      - postgres
      - redis

  worker:
    build:
      context: ./testmesh-server
      dockerfile: deployments/docker/Dockerfile.worker
    environment:
      DATABASE_URL: postgresql://testmesh:testmesh@postgres:5432/testmesh
      REDIS_URL: redis://redis:6379/0
    depends_on:
      - postgres
      - redis

  dashboard:
    build:
      context: ./testmesh-dashboard
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:5016
    depends_on:
      - server

volumes:
  postgres_data:
```

---

## Build and Release

### Backend Release Process

```bash
# Tag version
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0

# GitHub Actions builds and publishes:
# - Docker image: testmesh/server:v1.0.0
# - CLI binaries for macOS, Linux, Windows
# - Helm chart: testmesh-server-v1.0.0
```

### Frontend Release Process

```bash
# Tag version
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0

# GitHub Actions builds and publishes:
# - Docker image: testmesh/dashboard:v1.0.0
# - Static build for CDN deployment
# - Vercel/Netlify automatic deployment
```

---

## Shared Resources

### Shared Documentation Repository (Optional)

Create a third repository for shared documentation:

```
testmesh-docs/
├── docs/
│   ├── getting-started/
│   ├── api-reference/
│   ├── architecture/
│   └── guides/
├── website/              # Documentation website (Docusaurus, VitePress, etc.)
└── README.md
```

### Shared Types (TypeScript)

For API contract sharing, publish a shared types package:

```bash
# NPM package: @testmesh/types
npm install @testmesh/types
```

---

## Version Management

### Backend (Go)

```
testmesh-server/
└── version.go

package main

const (
    Version = "1.0.0"
    GitCommit = "abc123" // Injected at build time
)
```

### Frontend (Next.js 16)

```json
// package.json
{
  "name": "testmesh-dashboard",
  "version": "1.0.0"
}
```

---

## CI/CD Pipeline

### Backend GitHub Actions

```yaml
# .github/workflows/backend.yml
name: Backend CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-go@v4
        with:
          go-version: '1.22'
      - run: go test ./...

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: docker build -t testmesh/server:latest .
```

### Frontend GitHub Actions

```yaml
# .github/workflows/frontend.yml
name: Frontend CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm test
      - run: pnpm build
```

---

## Benefits of Multi-Repository Approach

✅ **Independent Development**: Teams can work independently on backend and frontend
✅ **Clear Ownership**: Different teams/people can own different repositories
✅ **Simplified CI/CD**: Each repo has its own pipeline tailored to its technology
✅ **Faster Builds**: Changes to one repo don't trigger builds in the other
✅ **Better Dependency Management**: No conflicts between Go and Node dependencies
✅ **Flexible Deployment**: Deploy backend and frontend independently
✅ **Easier Scaling**: Scale teams and infrastructure independently

---

## Trade-offs

⚠️ **Coordination**: Need to coordinate API changes across repositories
⚠️ **Version Compatibility**: Must ensure frontend and backend versions are compatible
⚠️ **Shared Types**: Duplication of types or need for shared package

**Mitigation**:
- Use semantic versioning
- Document API contracts clearly (OpenAPI spec)
- Consider publishing shared TypeScript types package
- Use feature flags for gradual rollouts

---

## Summary

TestMesh uses a **multi-repository architecture** with:

1. **testmesh-server** (Go) - Backend API, CLI, plugins
2. **testmesh-dashboard** (Next.js 16) - Web UI
3. **testmesh-docs** (Optional) - Shared documentation

This structure provides clear separation, independent development, and flexible deployment while maintaining strong API contracts between services.
