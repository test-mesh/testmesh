# TestMesh Flow-Based Design

> **Tests as visual flows with drag-and-drop editing**

## Inspiration

Inspired by [Maestro](https://maestro.mobile.dev/) - a mobile UI testing framework that uses flow-based YAML definitions.

## Core Concept

**Tests are flows** - A sequence of connected steps that data flows through. Each step can:
- Execute an action (HTTP request, DB query, etc.)
- Transform data (extract, map, filter)
- Branch based on conditions
- Call other flows (composition)
- Run in parallel
- Loop/iterate

## Flow Structure

### Basic Flow Example

```yaml
flow:
  name: "User Registration Flow"
  description: "Complete user registration journey"

  env:
    API_URL: "${API_BASE_URL}"

  steps:
    - id: create_user
      name: "Create User Account"
      action: http_request
      config:
        method: POST
        url: "${API_URL}/users"
        body:
          email: "user-${RANDOM_ID}@test.com"
          password: "SecurePass123!"
      output:
        user_id: response.body.user.id
        auth_token: response.body.token

    - id: verify_email
      name: "Verify Email in Database"
      action: database_query
      config:
        query: "SELECT * FROM users WHERE id = ?"
        params: [${create_user.user_id}]
      assert:
        - row_count == 1
        - rows[0].email_verified == false

    - id: send_verification
      name: "Send Verification Email"
      action: http_request
      config:
        method: POST
        url: "${API_URL}/users/${create_user.user_id}/send-verification"
        headers:
          Authorization: "Bearer ${create_user.auth_token}"
      assert:
        - status == 200
```

### Visual Representation

```
┌──────────────────┐
│  Start Flow      │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────┐
│  create_user             │
│  POST /users             │
│  ├─ Output: user_id      │
│  └─ Output: auth_token   │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐
│  verify_email            │
│  SELECT FROM users       │
│  Assert: row_count == 1  │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐
│  send_verification       │
│  POST /send-verification │
│  Assert: status == 200   │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────┐
│  End Flow        │
└──────────────────┘
```

## Advanced Flow Features

### 1. Conditional Branches

```yaml
flow:
  name: "User Login Flow"

  steps:
    - id: attempt_login
      action: http_request
      config:
        method: POST
        url: "${API_URL}/auth/login"
        body:
          email: "${USER_EMAIL}"
          password: "${USER_PASSWORD}"
      output:
        status_code: response.status

    - id: check_success
      action: condition
      when: ${attempt_login.status_code} == 200
      then:
        - id: load_profile
          action: http_request
          config:
            method: GET
            url: "${API_URL}/users/me"
            headers:
              Authorization: "Bearer ${attempt_login.token}"
      else:
        - id: log_failure
          action: log
          config:
            message: "Login failed with status ${attempt_login.status_code}"
```

Visual:
```
        ┌──────────────┐
        │attempt_login │
        └──────┬───────┘
               │
               ▼
        ┌──────────────┐
        │check_success │
        └──┬────────┬──┘
           │        │
    status │        │ status
    == 200 │        │ != 200
           ▼        ▼
    ┌──────────┐  ┌──────────┐
    │  load_   │  │   log_   │
    │ profile  │  │ failure  │
    └──────────┘  └──────────┘
```

### 2. Parallel Execution

```yaml
flow:
  name: "Load Dashboard Data"

  steps:
    - id: parallel_fetch
      action: parallel
      steps:
        - id: fetch_user_info
          action: http_request
          config:
            method: GET
            url: "${API_URL}/users/me"

        - id: fetch_recent_orders
          action: http_request
          config:
            method: GET
            url: "${API_URL}/orders?limit=10"

        - id: fetch_notifications
          action: http_request
          config:
            method: GET
            url: "${API_URL}/notifications?unread=true"

    - id: validate_all_loaded
      action: assert
      config:
        - ${fetch_user_info.status} == 200
        - ${fetch_recent_orders.status} == 200
        - ${fetch_notifications.status} == 200
```

Visual:
```
        ┌──────────────┐
        │parallel_fetch│
        └──────┬───────┘
               │
        ┌──────┴──────────────────┐
        │                         │
        ▼                         ▼
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │fetch_user│  │fetch_ord-│  │fetch_no- │
  │  _info   │  │  ers     │  │tifications│
  └────┬─────┘  └────┬─────┘  └────┬─────┘
       └─────────────┴─────────────┘
                     │
                     ▼
            ┌─────────────────┐
            │validate_all_load│
            └─────────────────┘
```

### 3. Loops / Iterations

```yaml
flow:
  name: "Process Multiple Items"

  steps:
    - id: get_items
      action: http_request
      config:
        method: GET
        url: "${API_URL}/items"
      output:
        items: response.body.items

    - id: process_each
      action: for_each
      items: ${get_items.items}
      steps:
        - id: process_item
          action: http_request
          config:
            method: POST
            url: "${API_URL}/items/${item.id}/process"
          assert:
            - status == 200
```

Visual:
```
    ┌──────────┐
    │get_items │
    └────┬─────┘
         │
         ▼
    ┌──────────┐
    │for_each  │◄─────┐
    └────┬─────┘      │
         │            │
         ▼            │
    ┌──────────┐     │
    │ process_ │     │
    │   item   │─────┘ (loop)
    └────┬─────┘
         │
         ▼
    ┌──────────┐
    │   End    │
    └──────────┘
```

### 4. Flow Composition (Call Sub-flows)

```yaml
flow:
  name: "Complete Checkout"

  steps:
    - id: validate_cart
      runFlow: "validate-shopping-cart"
      input:
        cart_id: "${CART_ID}"
      output:
        total_amount: flow.result.total

    - id: process_payment
      runFlow: "process-payment"
      input:
        amount: ${validate_cart.total_amount}
        payment_method: "${PAYMENT_METHOD}"
      output:
        payment_id: flow.result.payment_id

    - id: create_order
      runFlow: "create-order"
      input:
        cart_id: "${CART_ID}"
        payment_id: ${process_payment.payment_id}
```

Visual:
```
    ┌──────────────┐
    │validate_cart │
    │   [FLOW]     │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │process_pay-  │
    │   ment       │
    │   [FLOW]     │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │create_order  │
    │   [FLOW]     │
    └──────────────┘
```

### 5. Error Handling

```yaml
flow:
  name: "API Call with Retry"

  steps:
    - id: api_call
      action: http_request
      config:
        method: GET
        url: "${API_URL}/data"
      retry:
        attempts: 3
        delay: 1s
        backoff: exponential
      onError:
        - id: log_error
          action: log
          config:
            level: error
            message: "API call failed: ${error.message}"

        - id: send_alert
          action: http_request
          config:
            method: POST
            url: "${ALERT_WEBHOOK}"
            body:
              error: "${error.message}"
              flow: "${flow.name}"
```

Visual:
```
    ┌──────────┐
    │api_call  │
    └────┬─────┘
         │
    ┌────┴─────┐
    │  Error?  │
    └┬────────┬┘
     │Success │Error
     │        │
     │        ▼
     │   ┌──────────┐
     │   │log_error │
     │   └────┬─────┘
     │        │
     │        ▼
     │   ┌──────────┐
     │   │send_alert│
     │   └──────────┘
     │
     ▼
┌──────────┐
│Continue  │
└──────────┘
```

### 6. Wait/Polling

```yaml
flow:
  name: "Wait for Job Completion"

  steps:
    - id: start_job
      action: http_request
      config:
        method: POST
        url: "${API_URL}/jobs"
        body:
          type: "data_export"
      output:
        job_id: response.body.job_id

    - id: wait_for_completion
      action: wait_until
      maxDuration: 5m
      interval: 5s
      condition: ${check_status.status} == "completed"
      steps:
        - id: check_status
          action: http_request
          config:
            method: GET
            url: "${API_URL}/jobs/${start_job.job_id}"
          output:
            status: response.body.status

    - id: download_result
      action: http_request
      config:
        method: GET
        url: "${API_URL}/jobs/${start_job.job_id}/download"
```

## Web Dashboard - Visual Flow Editor

### Technology

**React Flow** - https://reactflow.dev/
- Node-based visual editor
- Drag-and-drop interface
- Custom node types
- Connection validation
- Mini-map and controls
- Export to/from JSON/YAML

### Features

#### 1. Node Types

**Action Nodes**:
- HTTP Request (color: blue)
- Database Query (color: green)
- Message Queue (color: purple)
- gRPC Call (color: orange)
- Custom Action (color: gray)

**Control Flow Nodes**:
- Condition/Branch (color: yellow)
- Parallel (color: cyan)
- Loop/For Each (color: pink)
- Wait/Poll (color: brown)

**Composition Nodes**:
- Sub-flow (color: teal)
- Start (color: white)
- End (color: black)

**Data Nodes**:
- Variable/Output (color: light blue)
- Transform (color: light green)

#### 2. Node Configuration Panel

When clicking a node, show side panel:
```
┌─────────────────────────────────┐
│ HTTP Request Node               │
├─────────────────────────────────┤
│ Name: Create User               │
│                                 │
│ Method: [POST ▼]                │
│                                 │
│ URL: ${API_URL}/users           │
│                                 │
│ Headers:                        │
│   Content-Type: application/json│
│   [+ Add Header]                │
│                                 │
│ Body:                           │
│   {                             │
│     "email": "...",             │
│     "password": "..."           │
│   }                             │
│   [JSON/Form/Raw tabs]          │
│                                 │
│ Assertions:                     │
│   ☑ status == 201               │
│   ☑ response.body.id exists     │
│   [+ Add Assertion]             │
│                                 │
│ Output Variables:               │
│   user_id ← response.body.id    │
│   [+ Add Output]                │
│                                 │
│ [Save] [Test] [Cancel]          │
└─────────────────────────────────┘
```

#### 3. Connection Rules

- **Data connections**: Can connect any node to another
- **Conditional branches**: Must have 2+ outputs (true/false paths)
- **Parallel nodes**: Multiple outputs, converge to join node
- **Loop nodes**: Has loop-back connection
- **Validation**: Show errors for invalid connections

#### 4. Node Context Menu (Right-click)

```
┌─────────────────┐
│ Duplicate       │
│ Delete          │
│ Copy            │
│ Paste           │
├─────────────────┤
│ Add Step After  │
│ Add Step Before │
├─────────────────┤
│ Enable/Disable  │
│ Add Breakpoint  │
├─────────────────┤
│ View Output     │
│ View Logs       │
└─────────────────┘
```

#### 5. Toolbar

```
┌────────────────────────────────────────────────┐
│ [Save] [Run] [Validate] [Share] [Export YAML] │
│                                                │
│ [⊕ HTTP] [⊕ DB] [⊕ Branch] [⊕ Loop] [⊕ Flow]│
│                                                │
│ [Undo] [Redo] [Zoom In] [Zoom Out] [Fit]     │
└────────────────────────────────────────────────┘
```

#### 6. Execution Visualization

When running a flow, highlight active nodes:
- **Pending**: Gray
- **Running**: Blue (animated pulse)
- **Success**: Green ✓
- **Failed**: Red ✗
- **Skipped**: Yellow

Show execution path with animated arrows flowing through connections.

#### 7. Live Editing & Collaboration

**Real-time Features**:
- Multiple users can view same flow
- Show cursors of other users
- Lock nodes being edited
- Live updates via WebSocket
- Change history with rollback

#### 8. Templates & Examples

**Template Library**:
```
┌─────────────────────────────────────┐
│ Templates                           │
├─────────────────────────────────────┤
│ 🔷 REST API Test                    │
│ 🔷 CRUD Operations                  │
│ 🔷 Authentication Flow              │
│ 🔷 Payment Processing               │
│ 🔷 Data Pipeline                    │
│ 🔷 Event-Driven Test                │
│ 🔷 Microservices Integration        │
│                                     │
│ [Browse More Templates]             │
└─────────────────────────────────────┘
```

Click template to:
- Start new flow from template
- Preview template
- Customize before creating

### Mock UI Design

```
┌────────────────────────────────────────────────────────────────────┐
│ TestMesh                        [User Registration Flow ▼] [Help]  │
├────────────────────────────────────────────────────────────────────┤
│ [💾 Save] [▶ Run] [✓ Validate] [↗ Share] [⬇ Export YAML]        │
│                                                                    │
│ Node Palette          Canvas                    Properties        │
│ ┌──────────────┐    ┌─────────────────────┐   ┌──────────────┐  │
│ │              │    │                     │   │ HTTP Request │  │
│ │ Actions:     │    │    ⭕ Start         │   │──────────────│  │
│ │ • HTTP       │    │      │              │   │              │  │
│ │ • Database   │    │      ▼              │   │ Method: POST │  │
│ │ • Kafka      │    │   ┌──────────┐     │   │              │  │
│ │ • gRPC       │    │   │ HTTP Req │     │   │ URL:         │  │
│ │              │    │   │ /users   │◄───────┼─│ ${API}/users│  │
│ │ Control:     │    │   └────┬─────┘     │   │              │  │
│ │ • Condition  │    │        │           │   │ Body: {...}  │  │
│ │ • Parallel   │    │        ▼           │   │              │  │
│ │ • Loop       │    │   ┌──────────┐     │   │ Assertions:  │  │
│ │ • Wait       │    │   │ DB Query │     │   │ ☑ status=201 │  │
│ │              │    │   │ users    │     │   │              │  │
│ │ [+ Custom]   │    │   └────┬─────┘     │   │ [Test Node]  │  │
│ │              │    │        │           │   │ [Save]       │  │
│ └──────────────┘    │        ▼           │   └──────────────┘  │
│                     │    ⭕ End          │                    │
│                     │                     │                    │
│                     │  [Mini-map]         │                    │
│                     └─────────────────────┘                    │
│                                                                 │
│ Console / Execution Logs                                       │
│ ┌────────────────────────────────────────────────────────────┐│
│ │ [INFO] Flow started                                        ││
│ │ [INFO] Executing step: create_user                         ││
│ │ [SUCCESS] create_user completed in 245ms                   ││
│ │ [INFO] Executing step: verify_email                        ││
│ └────────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────┘
```

## YAML ↔ Visual Conversion

### Converting YAML to Visual

```typescript
interface FlowNode {
  id: string;
  type: 'http' | 'database' | 'condition' | 'parallel' | 'loop' | 'subflow';
  position: { x: number; y: number };
  data: {
    label: string;
    config: any;
    outputs?: Record<string, string>;
  };
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: 'conditional' | 'loop' | 'default';
}

function yamlToFlow(yaml: FlowYAML): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];

  // Auto-layout algorithm (hierarchical layout)
  let yPosition = 100;

  yaml.steps.forEach((step, index) => {
    nodes.push({
      id: step.id,
      type: step.action,
      position: { x: 300, y: yPosition },
      data: {
        label: step.name,
        config: step.config,
        outputs: step.output,
      },
    });

    // Create edge to previous step
    if (index > 0) {
      edges.push({
        id: `e${yaml.steps[index - 1].id}-${step.id}`,
        source: yaml.steps[index - 1].id,
        target: step.id,
      });
    }

    yPosition += 150;
  });

  return { nodes, edges };
}
```

### Converting Visual to YAML

```typescript
function flowToYaml(nodes: FlowNode[], edges: FlowEdge[]): FlowYAML {
  // Topological sort to determine execution order
  const sortedNodes = topologicalSort(nodes, edges);

  const steps = sortedNodes.map(node => ({
    id: node.id,
    name: node.data.label,
    action: node.type,
    config: node.data.config,
    output: node.data.outputs,
  }));

  return {
    flow: {
      name: 'Generated Flow',
      steps,
    },
  };
}
```

## Implementation Priority

### Phase 1 - Flow Parser & Execution (v1.0)
- [ ] YAML flow parser
- [ ] Sequential step execution
- [ ] Variable interpolation
- [ ] Output capture
- [ ] Basic assertions

### Phase 2 - Advanced Flow Features (v1.1)
- [ ] Conditional branches
- [ ] Parallel execution
- [ ] Loops/iterations
- [ ] Flow composition (sub-flows)
- [ ] Error handling

### Phase 3 - Visual Editor (v1.2)
- [ ] React Flow integration
- [ ] Node palette
- [ ] Drag-and-drop canvas
- [ ] Connection management
- [ ] Node configuration panel
- [ ] YAML ↔ Visual conversion

### Phase 4 - Collaboration (v1.3)
- [ ] Real-time editing
- [ ] Multi-user support
- [ ] Change history
- [ ] Template library
- [ ] Comments on nodes

## Benefits of Flow-Based Design

### For Developers
✅ Visual representation of test logic
✅ Easy to understand complex flows
✅ Reusable sub-flows
✅ Clear data flow between steps
✅ Version control friendly (YAML)

### For QA Engineers
✅ Create tests without coding
✅ Drag-and-drop interface
✅ Template-based creation
✅ Visual debugging

### For Teams
✅ Easier collaboration
✅ Self-documenting tests
✅ Consistent structure
✅ Knowledge sharing

### For TestMesh
✅ Differentiation from competitors
✅ Lower barrier to entry
✅ Better user experience
✅ Modern, intuitive interface

## Comparison with Existing Tools

| Feature | TestMesh | Postman | Playwright | Maestro |
|---------|----------|---------|------------|---------|
| Visual Flow Editor | ✅ | ❌ | ❌ | ❌ |
| YAML Definition | ✅ | ❌ | ❌ | ✅ |
| Multi-Protocol | ✅ | ✅ | ❌ | ❌ |
| Flow Composition | ✅ | ❌ | ❌ | ✅ |
| Real-time Collab | ✅ | ✅ | ❌ | ❌ |
| Self-hosted | ✅ | ❌ | N/A | N/A |

## Next Steps

1. **Design detailed flow schema** - Complete YAML format
2. **Create flow parser** - Parse and validate flow definitions
3. **Build execution engine** - Execute flows with all features
4. **Prototype visual editor** - React Flow POC
5. **Design conversion logic** - YAML ↔ Visual
6. **User testing** - Validate UX with target users
