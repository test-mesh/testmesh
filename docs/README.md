# TestMesh Documentation

Welcome to the TestMesh documentation. This directory contains architecture, feature design, and development process documentation.

## 📚 Documentation Structure

### 🏗️ Architecture (`/architecture/`)
System architecture, technical decisions, and project structure.

- **[ARCHITECTURE.md](./architecture/ARCHITECTURE.md)** - Complete system architecture overview
- **[MODULAR_MONOLITH.md](./architecture/MODULAR_MONOLITH.md)** - Architectural approach and rationale
- **[TECH_STACK.md](./architecture/TECH_STACK.md)** - Technology stack with rationale
- **[PROJECT_STRUCTURE.md](./architecture/PROJECT_STRUCTURE.md)** - Code organization and folder layout
- **[DECISIONS.md](./architecture/DECISIONS.md)** - Key architectural decisions and trade-offs

### ✨ Features (`/features/`)
Detailed feature specifications and design documents.

**Core Features:**
- **[FLOW_DESIGN.md](./features/FLOW_DESIGN.md)** - Flow execution design
- **[YAML_SCHEMA.md](./features/YAML_SCHEMA.md)** - YAML flow schema specification
- **[MOCK_SERVER.md](./features/MOCK_SERVER.md)** - Mock server implementation
- **[CONTRACT_TESTING.md](./features/CONTRACT_TESTING.md)** - Contract testing approach
- **[OBSERVABILITY.md](./features/OBSERVABILITY.md)** - Logging, metrics, and monitoring
- **[TAGGING_SYSTEM.md](./features/TAGGING_SYSTEM.md)** - Test organization and filtering

**Advanced Features:**
- **[AI_INTEGRATION.md](./features/AI_INTEGRATION.md)** - AI-powered test generation
- **[MCP_INTEGRATION.md](./features/MCP_INTEGRATION.md)** - Model Context Protocol integration
- **[ASYNC_PATTERNS.md](./features/ASYNC_PATTERNS.md)** - Async messaging patterns (Kafka, WebSocket)
- **[DATA_GENERATION.md](./features/DATA_GENERATION.md)** - Test data generation strategies
- **[TEST_DATA_MANAGEMENT.md](./features/TEST_DATA_MANAGEMENT.md)** - Data management and cleanup
- **[JSON_SCHEMA_VALIDATION.md](./features/JSON_SCHEMA_VALIDATION.md)** - Schema validation

**UI & Developer Experience:**
- **[DASHBOARD_UI_SPECIFICATION.md](./features/DASHBOARD_UI_SPECIFICATION.md)** - Dashboard design
- **[LOCAL_DEVELOPMENT.md](./features/LOCAL_DEVELOPMENT.md)** - Local development setup
- **[ADVANCED_REPORTING.md](./features/ADVANCED_REPORTING.md)** - Test reporting and analytics
- **[POSTMAN_INSPIRED_FEATURES.md](./features/POSTMAN_INSPIRED_FEATURES.md)** - Postman-like features
- **[CLOUD_EXECUTION.md](./features/CLOUD_EXECUTION.md)** - Cloud-based test execution

### 🚀 Deployment (`/deployment/`)
Deployment guides for production and development environments.

- **[EXTERNAL_SERVICES.md](./deployment/EXTERNAL_SERVICES.md)** - Configure external PostgreSQL, Redis, and Kafka
  - Cloud provider examples (AWS, GCP, Azure, Confluent)
  - SSL/TLS configuration
  - Security best practices
  - Environment variables reference
- **[Deployment Guide](/deploy/README.md)** - Docker Compose, Kubernetes, and Helm configurations

### 🛠️ Development Process (`/process/`)
Guidelines and standards for contributing to TestMesh.

- **[CODING_STANDARDS.md](./process/CODING_STANDARDS.md)** - Code style and best practices
- **[DEVELOPMENT_WORKFLOW.md](./process/DEVELOPMENT_WORKFLOW.md)** - Git workflow and PR process
- **[SECURITY_GUIDELINES.md](./process/SECURITY_GUIDELINES.md)** - Security best practices
- **[PLUGIN_DEVELOPMENT.md](./process/PLUGIN_DEVELOPMENT.md)** - Creating custom plugins
- **[CODE_REVIEW_CHECKLIST.md](./process/CODE_REVIEW_CHECKLIST.md)** - Code review guidelines
- **[RECOMMENDED_TOOLING.md](./process/RECOMMENDED_TOOLING.md)** - Development tools and IDE setup

### 🚀 Getting Started (`/planning/`)
Quick start guides and tutorials.

- **[QUICKSTART.md](./planning/QUICKSTART.md)** - Getting started with TestMesh

---

## 📖 Quick Links

### For Users
- [Getting Started Guide](./planning/QUICKSTART.md)
- [YAML Schema Reference](./features/YAML_SCHEMA.md)
- [Dashboard UI Guide](./features/DASHBOARD_UI_SPECIFICATION.md)

### For Contributors
- [Architecture Overview](./architecture/ARCHITECTURE.md)
- [Coding Standards](./process/CODING_STANDARDS.md)
- [Development Workflow](./process/DEVELOPMENT_WORKFLOW.md)

### For DevOps
- [External Services Configuration](./deployment/EXTERNAL_SERVICES.md)
- [Deployment Guide](/deploy/README.md)
- [Observability](./features/OBSERVABILITY.md)
- [Cloud Execution](./features/CLOUD_EXECUTION.md)
- [Security Guidelines](./process/SECURITY_GUIDELINES.md)

---

## 🗂️ Documentation Maintenance

This documentation is actively maintained and reflects the current state of the TestMesh project. If you find outdated information or have suggestions for improvements, please open an issue or submit a pull request.

**Last Updated**: 2026-03-04
