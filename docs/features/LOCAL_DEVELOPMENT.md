# Local Development Guide

## Overview

TestMesh is designed for a **local-first development workflow**. Write and test flows on your machine, then push to the server when ready.

## Quick Start

```bash
# Initialize a new test project
testmesh init my-tests
cd my-tests

# Create your first flow
testmesh create flow user-registration.yaml

# Run it locally
testmesh run user-registration.yaml

# Watch for changes and re-run
testmesh watch user-registration.yaml
```

---

## Project Structure

```
my-tests/
├── .testmesh/
│   ├── config.yaml           # Local configuration
│   ├── secrets.env           # Environment secrets (gitignored)
│   └── plugins/              # Local plugins
├── flows/
│   ├── auth/
│   │   ├── login.yaml
│   │   └── register.yaml
│   ├── checkout/
│   │   └── purchase.yaml
│   └── shared/
│       └── setup-user.yaml   # Reusable sub-flows
├── data/
│   ├── users.json           # Test data
│   └── products.csv
├── plugins/
│   └── custom-validator/    # Your custom plugins
└── testmesh.yaml            # Project configuration
```

---

## Configuration Files

### `testmesh.yaml` (Project Config)

```yaml
name: my-e2e-tests
version: 1.0.0

# Default environment variables
env:
  API_URL: http://localhost:3000
  DB_HOST: localhost
  DB_PORT: 5432

# Remote server (optional)
remote:
  url: https://testmesh.company.com
  sync: auto  # auto | manual | off

# Local execution settings
local:
  parallel: 4              # Max parallel executions
  timeout: 300             # Default timeout (seconds)
  retry: 1                 # Default retry count

# Plugins
plugins:
  - ./plugins/custom-validator
  - '@testmesh/slack-notifier@1.2.0'
  - 'npm:@company/internal-actions@2.0.0'

# Watch mode settings
watch:
  patterns:
    - 'flows/**/*.yaml'
    - 'data/**/*'
  ignore:
    - '**/node_modules/**'
    - '**/.git/**'
```

### `.testmesh/config.yaml` (User Config)

```yaml
# Personal settings (gitignored)
user:
  name: John Doe
  email: john@company.com

# Editor integration
editor:
  default: vscode
  format_on_save: true
  validate_on_type: true

# Local development
dev:
  auto_reload: true
  verbose: true
  open_browser: true  # Open results in browser after run
```

---

## Writing Flows Locally

### 1. Create Flow with Template

```bash
# Interactive creation
testmesh create flow

# With template
testmesh create flow checkout.yaml --template http-api

# From example
testmesh create flow --from examples/rest-api.yaml
```

This generates:

```yaml
# flows/checkout.yaml
name: Checkout Flow
version: 1.0.0
description: Test checkout process

tags:
  - checkout
  - e2e
  - critical

env:
  API_URL: ${API_URL}
  USER_ID: ${USER_ID}

steps:
  - id: create_cart
    action: http_request
    config:
      method: POST
      url: "${API_URL}/cart"
      body:
        user_id: "${USER_ID}"
    output:
      cart_id: response.body.id
```

### 2. Edit in Your Favorite Editor

**VS Code** (Recommended):
```bash
# Install TestMesh extension
code --install-extension testmesh.vscode-testmesh

# Open project
code .
```

Features:
- ✅ YAML schema validation
- ✅ Auto-completion for actions
- ✅ Inline documentation
- ✅ JSONPath validation
- ✅ Variable reference checking
- ✅ Run/Debug from editor
- ✅ Visual flow preview

**JetBrains IDEs** (IntelliJ, WebStorm):
- Install TestMesh plugin from marketplace
- Same features as VS Code

**Vim/Neovim**:
```vim
" Install via vim-plug
Plug 'testmesh/vim-testmesh'

" LSP support
lua << EOF
require'lspconfig'.testmesh.setup{}
EOF
```

### 3. Validate Before Running

```bash
# Validate YAML syntax and schema
testmesh validate flows/checkout.yaml

# Validate all flows
testmesh validate flows/

# Validate with specific environment
testmesh validate flows/checkout.yaml --env staging
```

Output:
```
✓ flows/checkout.yaml
  - Valid YAML syntax
  - Schema validation passed
  - All variables defined
  - All actions available

✗ flows/payment.yaml
  - Error at line 15: Unknown action 'stripe_charge'
  - Warning at line 23: Unused variable 'old_user_id'
```

---

## Running Tests Locally

### 1. Simple Run

```bash
# Run single flow
testmesh run flows/checkout.yaml

# Run with environment
testmesh run flows/checkout.yaml --env staging

# Run with variable overrides
testmesh run flows/checkout.yaml --var USER_ID=123 --var API_URL=http://localhost:5016
```

### 2. Watch Mode (Live Reload)

```bash
# Watch single flow
testmesh watch flows/checkout.yaml

# Watch directory
testmesh watch flows/checkout/

# Watch with filter
testmesh watch flows/ --tag smoke
```

When files change:
```
[12:34:56] File changed: flows/checkout.yaml
[12:34:56] Validating...
[12:34:57] ✓ Validation passed
[12:34:57] Running flow...
[12:35:02] ✓ Flow completed in 5.2s
```

### 3. Interactive Mode

```bash
testmesh run flows/checkout.yaml --interactive
```

```
Step 1/5: create_cart
  POST http://localhost:3000/cart

  → Continue? [Y/n/s/d] (Y=yes, n=no, s=skip, d=debug)
  ▶ Y

  ✓ Status: 201
  ✓ Response: { "id": "cart_123", "items": [] }

  Variables set:
    cart_id = "cart_123"

Step 2/5: add_item
  POST http://localhost:3000/cart/cart_123/items

  → Continue? [Y/n/s/d]
```

### 4. Debug Mode

```bash
testmesh run flows/checkout.yaml --debug
```

Features:
- Detailed request/response logging
- Variable state at each step
- Execution timing per step
- Network traffic inspection
- Breakpoints (with `--interactive`)

---

## Local Test Runner

TestMesh CLI includes a local test runner that:
- ✅ Runs without server connection
- ✅ Stores results in `.testmesh/results/`
- ✅ Supports all action types
- ✅ Hot reloads on file changes
- ✅ Parallel execution
- ✅ Rich terminal UI

### Architecture

```
┌─────────────────────────────────────┐
│   TestMesh CLI (Local Runner)       │
│                                      │
│  ┌────────────┐    ┌──────────────┐ │
│  │ YAML Parser│───▶│ Flow Executor│ │
│  └────────────┘    └──────────────┘ │
│                           │          │
│  ┌────────────────────────┼─────┐   │
│  │ Action Handlers        │     │   │
│  │  - HTTP Request     ───┘     │   │
│  │  - Database Query            │   │
│  │  - Kafka Producer            │   │
│  │  - Browser Automation        │   │
│  │  - Custom Plugins            │   │
│  └──────────────────────────────┘   │
│                                      │
│  ┌──────────────────────────────┐   │
│  │ Results Store (Local)        │   │
│  │  .testmesh/results/*.json    │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

---

## Environment Management

### 1. Multiple Environments

```yaml
# .testmesh/environments/local.yaml
name: local
env:
  API_URL: http://localhost:3000
  DB_HOST: localhost
  DB_PORT: 5432
  DB_NAME: testdb
  KAFKA_BROKER: localhost:9092

# .testmesh/environments/staging.yaml
name: staging
env:
  API_URL: https://staging-api.company.com
  DB_HOST: staging-db.company.com
  DB_PORT: 5432
  DB_NAME: staging_db
  KAFKA_BROKER: staging-kafka.company.com:9092

# .testmesh/environments/production.yaml
name: production
env:
  API_URL: https://api.company.com
  DB_HOST: prod-db.company.com
  DB_PORT: 5432
  DB_NAME: prod_db
  KAFKA_BROKER: prod-kafka.company.com:9092
```

```bash
# Run with environment
testmesh run flows/ --env local
testmesh run flows/ --env staging
testmesh run flows/ --env production
```

### 2. Secrets Management

```bash
# Store secrets locally (gitignored)
testmesh secret set DB_PASSWORD mysecret123
testmesh secret set API_KEY sk_test_abc123

# Use in flows
# The CLI automatically loads from .testmesh/secrets.env
```

`.testmesh/secrets.env`:
```bash
DB_PASSWORD=mysecret123
API_KEY=sk_test_abc123
STRIPE_SECRET=sk_test_xyz789
```

`.gitignore`:
```
.testmesh/secrets.env
.testmesh/results/
```

### 3. Variable Overrides

```bash
# Command-line override
testmesh run flow.yaml --var USER_ID=123

# Environment file override
testmesh run flow.yaml --env-file .env.local

# Interactive prompt for missing variables
testmesh run flow.yaml --prompt-missing
```

---

## Testing Against Local Services

### 1. Docker Compose Setup

```yaml
# docker-compose.test.yaml
version: '3.8'

services:
  api:
    build: ./api
    ports:
      - "3000:3000"
    environment:
      - DB_HOST=postgres
      - KAFKA_BROKER=kafka:9092

  postgres:
    image: postgres:14
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: testdb
      POSTGRES_PASSWORD: testpass

  kafka:
    image: confluentinc/cp-kafka:7.0.0
    ports:
      - "9092:9092"
    environment:
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
```

```bash
# Start local stack
docker-compose -f docker-compose.test.yaml up -d

# Wait for services
testmesh wait-for http://localhost:3000/health
testmesh wait-for tcp://localhost:5432

# Run tests
testmesh run flows/ --env local

# Stop stack
docker-compose -f docker-compose.test.yaml down
```

### 2. Mock External Services

```yaml
# .testmesh/mocks/stripe.yaml
name: stripe-mock
type: http

routes:
  - path: /v1/charges
    method: POST
    response:
      status: 200
      body:
        id: ch_mock_123
        amount: 1000
        status: succeeded

  - path: /v1/customers
    method: POST
    response:
      status: 200
      body:
        id: cus_mock_456
        email: "{{request.body.email}}"
```

```bash
# Start mock server
testmesh mock start .testmesh/mocks/stripe.yaml --port 4000

# Run tests against mock
testmesh run flows/payment.yaml --var STRIPE_URL=http://localhost:4000
```

---

## IDE Integration

### VS Code Extension

**Installation**:
```bash
code --install-extension testmesh.vscode-testmesh
```

**Features**:

1. **Syntax Highlighting**
   - YAML schema validation
   - Action-specific highlighting
   - Variable reference highlighting

2. **Auto-completion**
   ```yaml
   - id: step1
     action: |  # Ctrl+Space shows all actions
             ▼
     ├─ http_request
     ├─ database_query
     ├─ kafka_produce
     ├─ browser_navigate
     └─ ...
   ```

3. **Inline Documentation**
   ```yaml
   - id: api_call
     action: http_request  # Hover shows documentation
     config:
       method:  # Ctrl+Space shows: GET, POST, PUT, DELETE, PATCH
   ```

4. **Run/Debug from Editor**
   - Click ▶️ icon in gutter to run step
   - Right-click flow → "Run Flow"
   - Breakpoints in flow execution
   - Variable inspection

5. **Visual Flow Preview**
   - Open flow.yaml → Click "Preview Flow" button
   - See visual graph representation
   - Click nodes to jump to YAML

6. **Integrated Terminal**
   ```
   Problems (Ctrl+Shift+M)
   ─────────────────────────
   flows/checkout.yaml
     Line 23: Unknown action 'stripe_charge'
     Line 45: Variable 'cart_id' not defined
   ```

### JetBrains Plugin

Similar features for IntelliJ IDEA, WebStorm, PyCharm, etc.

```bash
# Install from IDE
Settings → Plugins → Search "TestMesh"
```

---

## Git Workflow

### 1. Project Setup

```bash
# Initialize
git init
testmesh init

# .gitignore (auto-generated)
.testmesh/secrets.env
.testmesh/results/
.testmesh/cache/
node_modules/
```

### 2. Feature Branch Workflow

```bash
# Create feature branch
git checkout -b feature/new-payment-test

# Create new flow
testmesh create flow flows/payment/stripe-checkout.yaml

# Test locally
testmesh run flows/payment/stripe-checkout.yaml --watch

# Validate before commit
testmesh validate flows/

# Commit
git add flows/payment/stripe-checkout.yaml
git commit -m "Add Stripe checkout test"

# Push
git push origin feature/new-payment-test
```

### 3. Pre-commit Hooks

```yaml
# .husky/pre-commit or .git/hooks/pre-commit
#!/bin/bash

echo "Validating TestMesh flows..."
testmesh validate flows/

if [ $? -ne 0 ]; then
  echo "❌ Validation failed. Fix errors before committing."
  exit 1
fi

echo "✓ All flows valid"
```

### 4. CI Integration

```yaml
# .github/workflows/test.yml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install TestMesh CLI
        run: |
          curl -sSL https://get.testmesh.io | bash
          echo "$HOME/.testmesh/bin" >> $GITHUB_PATH

      - name: Start services
        run: docker-compose -f docker-compose.test.yaml up -d

      - name: Wait for services
        run: testmesh wait-for http://localhost:3000/health

      - name: Run tests
        run: testmesh run flows/ --env ci --reporter github

      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: .testmesh/results/
```

---

## Syncing with Remote Server

### 1. Configure Remote

```bash
# Set remote server
testmesh remote set https://testmesh.company.com

# Authenticate
testmesh login
```

### 2. Push Flows

```bash
# Push all flows
testmesh push

# Push specific flows
testmesh push flows/checkout/

# Push with tag
testmesh push --tag v1.2.0
```

### 3. Pull Flows

```bash
# Pull all flows
testmesh pull

# Pull specific flows
testmesh pull --flow checkout-flow

# Pull with conflict resolution
testmesh pull --strategy merge  # merge | overwrite | keep-local
```

### 4. Auto-sync

```yaml
# testmesh.yaml
remote:
  url: https://testmesh.company.com
  sync: auto  # Push on every successful run
```

```bash
# Run and auto-push
testmesh run flows/checkout.yaml
# → Runs locally
# → If successful, pushes to remote automatically
```

### 5. Sync Status

```bash
# Check sync status
testmesh status

# Output:
# Local: 5 flows, 2 modified, 1 new
# Remote: 4 flows
#
# Modified:
#   - flows/checkout.yaml (local newer)
#   - flows/login.yaml (remote newer)
#
# New:
#   - flows/payment.yaml (local only)
```

---

## Debugging Flows

### 1. Step-by-Step Execution

```bash
testmesh run flow.yaml --step
```

```
▶ Step 1/5: create_user
  Press [Enter] to execute, [s] to skip, [q] to quit

  > [Enter]

  ✓ Executed in 234ms
  Variables:
    user_id: "usr_123"
    user_email: "test@example.com"
```

### 2. Breakpoints

```yaml
- id: create_cart
  action: http_request
  config:
    method: POST
    url: "${API_URL}/cart"
  debug:
    breakpoint: true  # Pause execution here
```

```bash
testmesh run flow.yaml --debug
```

```
⏸ Breakpoint at step 'create_cart'

Variables:
  user_id: "usr_123"
  API_URL: "http://localhost:3000"

Commands:
  [c] continue
  [n] next step
  [v] view variables
  [r] view request
  [e] evaluate expression

> v

user_id: "usr_123"
user_email: "test@example.com"
API_URL: "http://localhost:3000"

> e ${API_URL}/cart

http://localhost:3000/cart
```

### 3. Request/Response Inspection

```bash
testmesh run flow.yaml --verbose
```

```
Step 1: create_cart

Request:
  POST http://localhost:3000/cart
  Headers:
    Content-Type: application/json
    X-User-ID: usr_123
  Body:
    {
      "user_id": "usr_123"
    }

Response:
  Status: 201 Created
  Headers:
    Content-Type: application/json
    X-Request-ID: req_abc123
  Body:
    {
      "id": "cart_xyz789",
      "user_id": "usr_123",
      "items": []
    }

  Time: 234ms
```

### 4. Flow Replay

```bash
# Save execution context
testmesh run flow.yaml --save-context context.json

# Replay from saved context
testmesh replay context.json --from-step create_cart

# Replay with modified variables
testmesh replay context.json --var user_id=different_user
```

---

## Performance Testing Locally

### 1. Load Testing

```bash
# Run flow multiple times
testmesh run flow.yaml --iterations 100

# Concurrent execution
testmesh run flow.yaml --iterations 1000 --concurrency 50

# Ramp-up pattern
testmesh load flow.yaml --rampup 1m --users 100 --duration 5m
```

### 2. Results Analysis

```bash
# View statistics
testmesh stats .testmesh/results/latest.json
```

```
Flow: checkout-flow
Iterations: 100
Duration: 2m 34s

Statistics:
  Success rate: 98% (98/100)
  Failed: 2

Response times:
  Min: 123ms
  Max: 2.3s
  Mean: 456ms
  P50: 432ms
  P95: 891ms
  P99: 1.2s

Step breakdown:
  create_cart:    avg 134ms (29%)
  add_items:      avg 201ms (44%)
  checkout:       avg 121ms (27%)
```

---

## Tips & Best Practices

### 1. Fast Iteration

```bash
# Terminal 1: Watch mode
testmesh watch flows/checkout.yaml

# Terminal 2: Edit flow
vim flows/checkout.yaml

# Auto-runs on save!
```

### 2. Test Data Management

```yaml
# flows/checkout.yaml
env:
  TEST_USER: "${file:./data/users.json#/test_user}"
  PRODUCTS: "${file:./data/products.json#/items}"
```

```json
// data/users.json
{
  "test_user": {
    "email": "test@example.com",
    "password": "test123"
  }
}
```

### 3. Shared Setup/Teardown

```yaml
# flows/shared/setup.yaml
name: Common Setup
steps:
  - id: create_test_user
    action: database_query
    config:
      query: INSERT INTO users ...
    output:
      user_id: result.rows[0].id
```

```yaml
# flows/checkout.yaml
setup:
  - flow: shared/setup.yaml

steps:
  - id: checkout
    # Use ${setup.user_id} from setup flow
```

### 4. Organize by Feature

```
flows/
  auth/
    login.yaml
    logout.yaml
    register.yaml
  checkout/
    cart.yaml
    payment.yaml
    shipping.yaml
  admin/
    users.yaml
    reports.yaml
```

Run by feature:
```bash
testmesh run flows/checkout/  # All checkout tests
testmesh run flows/ --tag auth  # All auth tests
```

---

## CLI Reference

### Flow Management
```bash
testmesh create flow [name]              # Create new flow
testmesh validate [path]                 # Validate flows
testmesh list                            # List all flows
testmesh show [flow]                     # Show flow details
testmesh delete [flow]                   # Delete flow
```

### Execution
```bash
testmesh run [path]                      # Run flows
testmesh watch [path]                    # Watch and re-run
testmesh load [flow]                     # Load test
testmesh replay [context]                # Replay execution
```

### Environment
```bash
testmesh env list                        # List environments
testmesh env create [name]               # Create environment
testmesh env set [name] [key] [value]    # Set variable
testmesh secret set [key] [value]        # Set secret
```

### Remote Sync
```bash
testmesh remote set [url]                # Set remote server
testmesh login                           # Authenticate
testmesh push                            # Push flows
testmesh pull                            # Pull flows
testmesh status                          # Check sync status
```

### Plugins
```bash
testmesh plugin init [name]              # Create plugin
testmesh plugin install [name]           # Install plugin
testmesh plugin list                     # List plugins
```

### Results
```bash
testmesh results list                    # List results
testmesh results show [id]               # Show result details
testmesh stats [result]                  # Show statistics
```

---

## Next Steps

1. **Set up your project**: `testmesh init my-tests`
2. **Create your first flow**: `testmesh create flow`
3. **Install IDE extension**: VS Code or JetBrains
4. **Write tests locally**: Use watch mode for fast iteration
5. **Configure remote sync**: When ready to share with team

## Resources

- **Examples**: `/examples/` directory in TestMesh repo
- **Templates**: `testmesh create flow --list-templates`
- **Documentation**: https://docs.testmesh.io
- **VS Code Extension**: https://marketplace.visualstudio.com/testmesh
- **Discord Community**: https://discord.gg/testmesh
