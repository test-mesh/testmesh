# TestMesh Plugin Development Guide

> **Build custom actions in your favorite language - Go, JavaScript, Python, or any language!**

## Table of Contents

1. [Built-in vs Custom Plugins](#built-in-vs-custom-plugins) ⭐ **Important**
2. [Overview](#overview)
3. [Multi-Language Support](#multi-language-support)
4. [Plugin Architecture](#plugin-architecture)
5. [Quick Start](#quick-start)
6. [JavaScript/TypeScript Plugins](#javascripttypescript-plugins)
7. [Go Plugins](#go-plugins)
8. [Python Plugins](#python-plugins)
9. [WebAssembly Plugins](#webassembly-plugins)
10. [Plugin SDK Reference](#plugin-sdk-reference)
11. [Plugin Distribution](#plugin-distribution)
12. [CI/CD Integration with Plugins](#cicd-integration-with-plugins) ⭐ **New**
13. [Best Practices](#best-practices)

---

## Built-in vs Custom Plugins

### ⚠️ Important: Core Action Handlers are Built-in

**TestMesh comes with core action handlers built into the binary.** These are NOT external plugins and work immediately in all environments (CLI, CI/CD, server) without any installation.

#### Built-in Action Handlers (Always Available)

| Action Type | Handler | Installation Required |
|-------------|---------|----------------------|
| **HTTP/REST** | `http_request` | ❌ No - Built-in |
| **Database** | `database_query`, `database_exec` | ❌ No - Built-in |
| **Kafka** | `kafka_publish`, `kafka_consume` | ❌ No - Built-in |
| **gRPC** | `grpc_call` | ❌ No - Built-in |
| **WebSocket** | `websocket_connect`, `websocket_send` | ❌ No - Built-in |
| **Browser** | `browser_navigate`, `browser_click`, etc. | ❌ No - Built-in |
| **MCP** | `mcp_call` | ❌ No - Built-in |

#### Example: Using Built-in Handlers (No Installation)

```yaml
flow:
  name: "Order Processing"
  steps:
    # HTTP action - Built-in ✅
    - id: create_order
      action: http_request
      config:
        method: POST
        url: "${API_URL}/orders"
        body: { item: "widget", qty: 5 }

    # Database action - Built-in ✅
    - id: verify_db
      action: database_query
      config:
        connection: "${DB_URL}"
        query: "SELECT * FROM orders WHERE id = ?"
        params: ["${create_order.output.order_id}"]

    # Kafka action - Built-in ✅
    - id: publish_event
      action: kafka_publish
      config:
        topic: "orders.created"
        message: { order_id: "${create_order.output.order_id}" }
```

**Run anywhere without plugin installation:**
```bash
# Local CLI
testmesh run flow.yaml  # ✅ Works immediately

# CI/CD (GitHub Actions)
- run: testmesh run flow.yaml  # ✅ Works immediately

# Server execution
# ✅ Works immediately (no plugin installation)
```

---

### Custom/Community Plugins (Require Installation)

**Plugins are for extending beyond the built-in handlers.** You need to install plugins only for:

- ✅ Custom actions (e.g., `slack_notify`, `sap_rfc_call`)
- ✅ Domain-specific integrations (e.g., `salesforce_query`)
- ✅ Custom assertions
- ✅ Custom reporters
- ✅ Specialized data transformations

#### Example: Custom Plugin

```yaml
# Using custom Slack plugin (requires installation)
- id: notify_team
  action: slack_notify  # Custom plugin ⚠️
  config:
    channel: "#alerts"
    message: "Test failed!"
```

**Requires installation:**
```bash
# Install custom plugin first
testmesh plugin install slack-notifier

# Then run flow
testmesh run flow.yaml
```

---

### How It Works in Different Environments

#### Local CLI Execution

```bash
# Built-in handlers work immediately
testmesh run flow.yaml  # HTTP, DB, Kafka work ✅

# Custom plugins need installation
testmesh plugin install custom-plugin
testmesh run flow.yaml  # Now custom actions work ✅
```

#### CI/CD Execution

```yaml
# GitHub Actions
- name: Install TestMesh
  run: curl -L https://get.testmesh.io | sh

# No plugin installation needed for built-in handlers ✅
- name: Run tests with built-in handlers
  run: testmesh run flows/  # HTTP, DB, Kafka work

# Install custom plugins only if needed
- name: Install custom plugins
  run: testmesh plugin install slack-notifier

- name: Run tests with custom plugins
  run: testmesh run flows/
```

#### Server Execution

- **Built-in handlers**: Always available ✅
- **Custom plugins**: Install on server or include in Docker image

```dockerfile
FROM testmesh/testmesh:latest

# Install custom plugins (if needed)
RUN testmesh plugin install slack-notifier
RUN testmesh plugin install custom-sap-plugin

# Built-in handlers work without this step
```

---

### Configuration for Built-in Handlers

Built-in handlers don't need installation, but they need **connection configuration**:

```yaml
# .testmesh/config.yaml
connections:
  # PostgreSQL configuration (handler is built-in)
  postgresql:
    host: "localhost"
    port: 5432
    database: "testdb"
    username: "${DB_USER}"
    password: "${DB_PASSWORD}"

  # Kafka configuration (handler is built-in)
  kafka:
    brokers: ["localhost:9092"]
    sasl:
      mechanism: "PLAIN"
      username: "${KAFKA_USER}"
      password: "${KAFKA_PASSWORD}"
```

**Key Points:**
- ✅ Handler code is built-in (no installation)
- ✅ Connection details are configured
- ✅ Works in CLI, CI/CD, server

---

### When Do You Need Plugin Development?

**You DON'T need to develop plugins for:**
- ❌ HTTP/REST APIs (use `http_request`)
- ❌ PostgreSQL/MySQL (use `database_query`)
- ❌ Kafka messages (use `kafka_publish`/`kafka_consume`)
- ❌ gRPC services (use `grpc_call`)
- ❌ WebSocket connections (use `websocket_*` actions)
- ❌ Browser automation (use `browser_*` actions)

**You DO need plugins for:**
- ✅ **Custom integrations** (Slack, SAP, Salesforce, proprietary systems)
- ✅ **Specialized protocols** (SOAP, custom protocols)
- ✅ **Custom data processing** (ML models, data transformations)
- ✅ **Custom assertions** (domain-specific validations)
- ✅ **Custom reporters** (specialized report formats)

---

### Summary

| Feature | Built-in Handlers | Custom Plugins |
|---------|-------------------|----------------|
| **Installation** | ❌ Not required | ✅ Required |
| **Availability** | Always available | After installation |
| **Examples** | HTTP, DB, Kafka, gRPC, WebSocket, Browser | Slack, SAP, custom integrations |
| **CLI** | Works immediately | Install first |
| **CI/CD** | Works immediately | Install in pipeline |
| **Configuration** | Connection details only | Connection + installation |

**Bottom line:** Use built-in handlers for common protocols. Develop plugins only for custom integrations and specialized functionality.

---

## Overview

### What Can You Build with Plugins?

Plugins are for **extending beyond the built-in action handlers**. With plugins, you can:

✅ **Custom Actions** - Create new action types (e.g., `slack_notify`, `sap_rfc_call`, `salesforce_query`)
✅ **Custom Assertions** - Create new assertion operators (e.g., `is_valid_iban`, `matches_business_rule`)
✅ **Custom Reporters** - Generate custom test reports (e.g., `allure_report`, `custom_html`)
✅ **Protocol Support** - Add support for specialized protocols (e.g., `soap_call`, `graphql_query`)
✅ **Data Transformations** - Custom data processing (e.g., `ml_predict`, `data_encrypt`)
✅ **Integrations** - Connect to any external service (e.g., `jira_update`, `pagerduty_alert`)

**Remember:** You don't need plugins for HTTP, Database, Kafka, gRPC, WebSocket, or Browser actions - these are built-in!

### Why Build Plugins?

- **Extend Built-ins** - Add functionality beyond core handlers
- **Flexibility** - Extend TestMesh without modifying core
- **Reusability** - Share plugins across projects and teams
- **Language Choice** - Use your favorite language
- **Community** - Leverage community plugins
- **Domain-Specific** - Build specialized tools for your domain (e.g., banking, healthcare, e-commerce)

---

## Multi-Language Support

TestMesh supports plugins in **multiple languages**:

| Language | Method | Best For | Performance |
|----------|--------|----------|-------------|
| **JavaScript/TypeScript** | Native (Node.js) | General use, easiest | ⚡⚡⚡ Fast |
| **Go** | Native (compiled) | Performance-critical | ⚡⚡⚡⚡ Fastest |
| **Python** | Subprocess/HTTP | Python libraries | ⚡⚡ Good |
| **WebAssembly** | WASM runtime | Any language! | ⚡⚡⚡ Fast |
| **Any Language** | HTTP/gRPC server | Maximum flexibility | ⚡ Depends |

### Recommended Approach

1. **JavaScript/TypeScript** - Default choice, easiest, well-integrated
2. **Go** - For performance-critical plugins
3. **Python** - If you need Python libraries (data science, ML, etc.)
4. **WebAssembly** - For Rust, C++, or other compiled languages
5. **HTTP Server** - For any language (most flexible, slight overhead)

---

## Plugin Architecture

### How Plugins Work

```
TestMesh Core
    │
    ├─→ Plugin Manager
    │       │
    │       ├─→ JavaScript Runtime (Node.js)
    │       │       └─→ .js/.ts plugins
    │       │
    │       ├─→ Native Plugins (Go)
    │       │       └─→ Compiled .so/.dylib/.dll
    │       │
    │       ├─→ Subprocess Plugins (Python)
    │       │       └─→ .py plugins via stdio
    │       │
    │       ├─→ WebAssembly Runtime
    │       │       └─→ .wasm plugins
    │       │
    │       └─→ Remote Plugins (HTTP/gRPC)
    │               └─→ Any language as server
    │
    └─→ Flow Execution Engine
            └─→ Calls plugins when needed
```

### Plugin Lifecycle

```
1. Discovery
   ├─ Scan plugin directories
   ├─ Read plugin.json manifest
   └─ Validate plugin structure

2. Loading
   ├─ Initialize runtime (Node.js, WASM, etc.)
   ├─ Load plugin code
   └─ Validate plugin interface

3. Registration
   ├─ Register actions
   ├─ Register assertions
   └─ Register hooks

4. Execution
   ├─ Flow calls action
   ├─ Plugin manager routes to plugin
   ├─ Plugin executes
   └─ Return result

5. Cleanup
   └─ Unload when done
```

---

## Quick Start

### Create Your First Plugin (JavaScript)

```bash
# Initialize plugin
testmesh plugin init my-plugin --language javascript

# Generated structure:
my-plugin/
├── plugin.json          # Manifest
├── index.js             # Main code
├── package.json         # Dependencies
└── README.md            # Documentation
```

**plugin.json**:
```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "My custom TestMesh plugin",
  "author": "Your Name",
  "language": "javascript",
  "main": "index.js",
  "actions": [
    {
      "name": "my_custom_action",
      "description": "Does something custom"
    }
  ]
}
```

**index.js**:
```javascript
// Export action handlers
module.exports = {
  actions: {
    my_custom_action: async (config, context) => {
      // Your custom logic here
      console.log('Executing custom action!');

      return {
        success: true,
        output: {
          message: 'Action completed',
          timestamp: new Date().toISOString()
        }
      };
    }
  }
};
```

### Test Your Plugin

```bash
# Test locally
testmesh plugin test my-plugin

# Install locally
testmesh plugin install ./my-plugin

# Use in flow
```

```yaml
- id: test_custom
  action: my_custom_action
  config:
    # Your config
```

---

## JavaScript/TypeScript Plugins

### Setup

```bash
# Create plugin
testmesh plugin init slack-notifier --language typescript

cd slack-notifier
npm install @testmesh/plugin-sdk
npm install @slack/web-api
```

### Plugin Structure

```typescript
// index.ts
import { Plugin, Action, ActionContext, ActionResult } from '@testmesh/plugin-sdk';

// Define action
const slackNotify: Action = {
  name: 'slack_notify',
  description: 'Send notification to Slack',

  // JSON Schema for validation
  schema: {
    type: 'object',
    required: ['channel', 'message'],
    properties: {
      channel: {
        type: 'string',
        description: 'Slack channel (e.g., #alerts)'
      },
      message: {
        type: 'string',
        description: 'Message to send'
      },
      webhook_url: {
        type: 'string',
        description: 'Slack webhook URL'
      }
    }
  },

  // Action handler
  async execute(config: any, context: ActionContext): Promise<ActionResult> {
    const { channel, message, webhook_url } = config;

    // Use context for logging
    context.log.info(`Sending message to ${channel}`);

    // Your logic
    const response = await fetch(webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel,
        text: message
      })
    });

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.statusText}`);
    }

    return {
      success: true,
      output: {
        status: 'sent',
        timestamp: new Date().toISOString()
      }
    };
  }
};

// Export plugin
export default {
  name: 'slack-notifier',
  version: '1.0.0',
  actions: [slackNotify]
} as Plugin;
```

### Advanced TypeScript Plugin

```typescript
// complex-plugin/index.ts
import {
  Plugin,
  Action,
  Assertion,
  Hook,
  ActionContext,
  ActionResult
} from '@testmesh/plugin-sdk';

// Custom action
const customAction: Action = {
  name: 'process_data',
  description: 'Process data with custom logic',

  schema: {
    type: 'object',
    properties: {
      input: { type: 'string' },
      operation: {
        type: 'string',
        enum: ['transform', 'validate', 'analyze']
      }
    }
  },

  async execute(config, context) {
    const { input, operation } = config;

    // Access flow context
    context.log.debug('Processing data', { operation });

    // Access previous steps
    const previousResult = context.getStepOutput('previous_step_id');

    // Set variables
    context.setVariable('processed_at', Date.now());

    let result;

    switch (operation) {
      case 'transform':
        result = transformData(input);
        break;
      case 'validate':
        result = validateData(input);
        break;
      case 'analyze':
        result = analyzeData(input);
        break;
    }

    return {
      success: true,
      output: result
    };
  }
};

// Custom assertion
const customAssertion: Assertion = {
  name: 'is_valid_format',
  description: 'Check if value matches custom format',

  evaluate(expected: any, actual: any, context: ActionContext): boolean {
    // Custom validation logic
    return /^[A-Z]{3}-\d{4}$/.test(actual);
  }
};

// Hooks (lifecycle events)
const hooks: Hook = {
  // Before test execution
  async onBeforeTest(context) {
    context.log.info('Plugin: Test starting');
  },

  // After test execution
  async onAfterTest(context, result) {
    context.log.info('Plugin: Test finished', {
      status: result.status
    });
  },

  // Before each step
  async onBeforeStep(context, step) {
    context.log.debug('Plugin: Step starting', {
      step: step.id
    });
  },

  // After each step
  async onAfterStep(context, step, result) {
    context.log.debug('Plugin: Step finished', {
      step: step.id,
      success: result.success
    });
  }
};

// Export plugin
export default {
  name: 'complex-plugin',
  version: '1.0.0',
  description: 'Complex plugin with actions, assertions, and hooks',
  author: 'Your Name',

  actions: [customAction],
  assertions: [customAssertion],
  hooks: [hooks]
} as Plugin;

// Helper functions
function transformData(input: string) {
  return input.toUpperCase();
}

function validateData(input: string) {
  return { valid: input.length > 0 };
}

function analyzeData(input: string) {
  return {
    length: input.length,
    words: input.split(' ').length
  };
}
```

### Package & Publish

```bash
# Build TypeScript
npm run build

# Publish to npm
npm publish

# Or publish to TestMesh marketplace
testmesh plugin publish
```

---

## Go Plugins

### Setup

```bash
# Create plugin
testmesh plugin init validator --language go

cd validator
go mod init github.com/yourname/testmesh-validator
go get github.com/testmesh/plugin-sdk-go
```

### Plugin Structure

```go
// main.go
package main

import (
    "fmt"
    "github.com/testmesh/plugin-sdk-go/plugin"
)

// Action handler
type ValidatorAction struct{}

func (a *ValidatorAction) Name() string {
    return "validate_format"
}

func (a *ValidatorAction) Description() string {
    return "Validate data format"
}

func (a *ValidatorAction) Schema() interface{} {
    return map[string]interface{}{
        "type": "object",
        "required": []string{"data", "format"},
        "properties": map[string]interface{}{
            "data": map[string]interface{}{
                "type": "string",
            },
            "format": map[string]interface{}{
                "type": "string",
                "enum": []string{"email", "phone", "uuid"},
            },
        },
    }
}

func (a *ValidatorAction) Execute(config map[string]interface{}, ctx *plugin.Context) (*plugin.Result, error) {
    data := config["data"].(string)
    format := config["format"].(string)

    ctx.Log.Info("Validating data", map[string]interface{}{
        "format": format,
    })

    var valid bool

    switch format {
    case "email":
        valid = validateEmail(data)
    case "phone":
        valid = validatePhone(data)
    case "uuid":
        valid = validateUUID(data)
    default:
        return nil, fmt.Errorf("unknown format: %s", format)
    }

    return &plugin.Result{
        Success: true,
        Output: map[string]interface{}{
            "valid": valid,
            "format": format,
            "data": data,
        },
    }, nil
}

// Plugin definition
type ValidatorPlugin struct{}

func (p *ValidatorPlugin) Name() string {
    return "validator"
}

func (p *ValidatorPlugin) Version() string {
    return "1.0.0"
}

func (p *ValidatorPlugin) Actions() []plugin.Action {
    return []plugin.Action{
        &ValidatorAction{},
    }
}

// Plugin entrypoint
func main() {
    plugin.Serve(&ValidatorPlugin{})
}

// Helper functions
func validateEmail(email string) bool {
    // Email validation logic
    return true // simplified
}

func validatePhone(phone string) bool {
    // Phone validation logic
    return true
}

func validateUUID(uuid string) bool {
    // UUID validation logic
    return true
}
```

### Build & Install

```bash
# Build plugin
go build -o validator.so -buildmode=plugin main.go

# Or build for TestMesh
testmesh plugin build

# Install
testmesh plugin install ./validator
```

---

## Python Plugins

### Setup

```bash
# Create plugin
testmesh plugin init data-analyzer --language python

cd data-analyzer
pip install testmesh-plugin-sdk
```

### Plugin Structure

```python
# plugin.py
from testmesh_sdk import Plugin, Action, ActionContext, ActionResult
import pandas as pd
import numpy as np

class DataAnalyzerAction(Action):
    """Analyze data using pandas"""

    def name(self) -> str:
        return "analyze_data"

    def description(self) -> str:
        return "Analyze data with pandas and numpy"

    def schema(self) -> dict:
        return {
            "type": "object",
            "required": ["data"],
            "properties": {
                "data": {
                    "type": "array",
                    "description": "Array of data to analyze"
                },
                "operation": {
                    "type": "string",
                    "enum": ["mean", "median", "std", "summary"],
                    "default": "summary"
                }
            }
        }

    async def execute(self, config: dict, context: ActionContext) -> ActionResult:
        data = config["data"]
        operation = config.get("operation", "summary")

        context.log.info(f"Analyzing data with operation: {operation}")

        # Use pandas for analysis
        df = pd.DataFrame(data)

        result = {}

        if operation == "mean":
            result = {"mean": df.mean().to_dict()}
        elif operation == "median":
            result = {"median": df.median().to_dict()}
        elif operation == "std":
            result = {"std": df.std().to_dict()}
        elif operation == "summary":
            result = {
                "count": len(df),
                "mean": df.mean().to_dict(),
                "median": df.median().to_dict(),
                "std": df.std().to_dict(),
                "min": df.min().to_dict(),
                "max": df.max().to_dict()
            }

        return ActionResult(
            success=True,
            output=result
        )

class DataAnalyzerPlugin(Plugin):
    """Data analysis plugin using Python data science libraries"""

    def name(self) -> str:
        return "data-analyzer"

    def version(self) -> str:
        return "1.0.0"

    def actions(self) -> list[Action]:
        return [DataAnalyzerAction()]

# Plugin entrypoint
def create_plugin():
    return DataAnalyzerPlugin()
```

### Python Plugin with ML

```python
# ml_plugin.py
from testmesh_sdk import Plugin, Action, ActionContext, ActionResult
from sklearn.ensemble import RandomForestClassifier
import joblib
import numpy as np

class MLPredictAction(Action):
    """ML prediction using scikit-learn"""

    def __init__(self):
        # Load pre-trained model
        self.model = joblib.load('model.pkl')

    def name(self) -> str:
        return "ml_predict"

    def schema(self) -> dict:
        return {
            "type": "object",
            "required": ["features"],
            "properties": {
                "features": {
                    "type": "array",
                    "description": "Feature vector for prediction"
                }
            }
        }

    async def execute(self, config: dict, context: ActionContext) -> ActionResult:
        features = np.array(config["features"]).reshape(1, -1)

        # Make prediction
        prediction = self.model.predict(features)[0]
        probability = self.model.predict_proba(features)[0]

        return ActionResult(
            success=True,
            output={
                "prediction": int(prediction),
                "probability": probability.tolist(),
                "confidence": float(max(probability))
            }
        )

class MLPlugin(Plugin):
    def name(self) -> str:
        return "ml-plugin"

    def version(self) -> str:
        return "1.0.0"

    def actions(self) -> list[Action]:
        return [MLPredictAction()]

def create_plugin():
    return MLPlugin()
```

### Run Python Plugin

```bash
# Install dependencies
pip install -r requirements.txt

# Test plugin
testmesh plugin test data-analyzer

# Install
testmesh plugin install ./data-analyzer
```

---

## WebAssembly Plugins

### Build WASM Plugin (Rust)

```rust
// lib.rs
use testmesh_wasm_sdk::{Plugin, Action, ActionContext, ActionResult};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct Config {
    input: String,
    operation: String,
}

#[derive(Serialize)]
struct Output {
    result: String,
    length: usize,
}

pub struct TextProcessorAction;

impl Action for TextProcessorAction {
    fn name(&self) -> &str {
        "process_text"
    }

    fn description(&self) -> &str {
        "Process text with Rust performance"
    }

    fn execute(&self, config: &str, _context: &ActionContext) -> ActionResult {
        let config: Config = serde_json::from_str(config).unwrap();

        let result = match config.operation.as_str() {
            "uppercase" => config.input.to_uppercase(),
            "lowercase" => config.input.to_lowercase(),
            "reverse" => config.input.chars().rev().collect(),
            _ => config.input.clone(),
        };

        let output = Output {
            length: result.len(),
            result,
        };

        ActionResult {
            success: true,
            output: serde_json::to_string(&output).unwrap(),
        }
    }
}

pub struct TextProcessorPlugin;

impl Plugin for TextProcessorPlugin {
    fn name(&self) -> &str {
        "text-processor"
    }

    fn version(&self) -> &str {
        "1.0.0"
    }

    fn actions(&self) -> Vec<Box<dyn Action>> {
        vec![Box::new(TextProcessorAction)]
    }
}

#[no_mangle]
pub extern "C" fn create_plugin() -> *mut TextProcessorPlugin {
    Box::into_raw(Box::new(TextProcessorPlugin))
}
```

### Build WASM

```bash
# Install WASM target
rustup target add wasm32-wasi

# Build
cargo build --target wasm32-wasi --release

# Output: target/wasm32-wasi/release/text_processor.wasm

# Install
testmesh plugin install ./target/wasm32-wasi/release/text_processor.wasm
```

---

## Plugin SDK Reference

### ActionContext API

```typescript
interface ActionContext {
  // Logging
  log: {
    debug(message: string, data?: object): void;
    info(message: string, data?: object): void;
    warn(message: string, data?: object): void;
    error(message: string, data?: object): void;
  };

  // Flow information
  flowId: string;
  flowName: string;
  executionId: string;

  // Step information
  stepId: string;
  stepName: string;

  // Access previous step outputs
  getStepOutput(stepId: string): any;

  // Access environment variables
  getEnv(name: string): string | undefined;

  // Set variables
  setVariable(name: string, value: any): void;
  getVariable(name: string): any;

  // Artifacts
  saveArtifact(name: string, data: Buffer | string): Promise<void>;

  // HTTP client (for making requests)
  http: HttpClient;

  // Database access (if configured)
  db?: DatabaseClient;
}
```

### ActionResult

```typescript
interface ActionResult {
  // Required
  success: boolean;

  // Optional outputs
  output?: {
    [key: string]: any;
  };

  // Optional error
  error?: {
    message: string;
    code?: string;
    details?: any;
  };

  // Optional artifacts
  artifacts?: Array<{
    name: string;
    path: string;
    type: string;
  }>;

  // Optional metrics
  metrics?: {
    duration_ms?: number;
    [key: string]: any;
  };
}
```

---

## Plugin Distribution

### Plugin Packaging

```json
// plugin.json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "My awesome plugin",
  "author": "Your Name <email@example.com>",
  "license": "MIT",

  "language": "javascript|go|python|wasm",
  "main": "index.js|main.so|plugin.py|plugin.wasm",

  "actions": [
    {
      "name": "my_action",
      "description": "Does something",
      "category": "integration|validation|utility"
    }
  ],

  "dependencies": {
    "@slack/web-api": "^6.0.0"
  },

  "testmesh": {
    "minVersion": "1.0.0",
    "maxVersion": "2.0.0"
  },

  "keywords": ["slack", "notification", "integration"],
  "repository": "https://github.com/user/repo",
  "homepage": "https://example.com"
}
```

### Publishing

```bash
# Test plugin
testmesh plugin test

# Validate
testmesh plugin validate

# Publish to npm (JavaScript plugins)
npm publish

# Publish to TestMesh Marketplace
testmesh plugin publish

# Publish to GitHub Releases
gh release create v1.0.0 ./plugin.tar.gz
```

### Installing Plugins

```bash
# From TestMesh Marketplace
testmesh plugin install slack-notifier

# From npm
testmesh plugin install @testmesh/slack-notifier

# From local path
testmesh plugin install ./my-plugin

# From GitHub
testmesh plugin install github:user/repo

# From URL
testmesh plugin install https://example.com/plugin.tar.gz
```

### Plugin Configuration

```yaml
# .testmesh.yaml
plugins:
  # Install and configure plugins
  - name: slack-notifier
    version: "1.0.0"
    enabled: true
    config:
      webhook_url: "${SLACK_WEBHOOK}"
      default_channel: "#alerts"

  - name: data-analyzer
    version: "2.0.0"
    enabled: true

  # Local plugin
  - path: "./plugins/custom-validator"
    enabled: true
```

---

## Best Practices

### 1. Error Handling

```typescript
// Good - Detailed error handling
async execute(config, context) {
  try {
    const result = await doSomething(config);
    return {
      success: true,
      output: result
    };
  } catch (error) {
    context.log.error('Operation failed', {
      error: error.message,
      config
    });

    return {
      success: false,
      error: {
        message: error.message,
        code: 'OPERATION_FAILED',
        details: { config }
      }
    };
  }
}
```

### 2. Validation

```typescript
// Validate config
async execute(config, context) {
  // Validate required fields
  if (!config.required_field) {
    throw new Error('required_field is required');
  }

  // Validate types
  if (typeof config.count !== 'number') {
    throw new Error('count must be a number');
  }

  // Business logic validation
  if (config.count < 0 || config.count > 100) {
    throw new Error('count must be between 0 and 100');
  }

  // ... rest of logic
}
```

### 3. Logging

```typescript
async execute(config, context) {
  context.log.debug('Starting operation', { config });

  try {
    const result = await process(config);

    context.log.info('Operation completed', {
      duration_ms: Date.now() - startTime,
      result_size: result.length
    });

    return { success: true, output: result };
  } catch (error) {
    context.log.error('Operation failed', { error });
    throw error;
  }
}
```

### 4. Performance

```typescript
// Cache expensive operations
const cache = new Map();

async execute(config, context) {
  const cacheKey = JSON.stringify(config);

  if (cache.has(cacheKey)) {
    context.log.debug('Returning cached result');
    return cache.get(cacheKey);
  }

  const result = await expensiveOperation(config);
  cache.set(cacheKey, result);

  return result;
}
```

### 5. Testing

```typescript
// plugin.test.ts
import { describe, it, expect } from 'vitest';
import plugin from './index';

describe('MyPlugin', () => {
  it('should execute action successfully', async () => {
    const context = createMockContext();
    const config = { input: 'test' };

    const result = await plugin.actions[0].execute(config, context);

    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
  });

  it('should handle errors', async () => {
    const context = createMockContext();
    const config = { invalid: true };

    await expect(
      plugin.actions[0].execute(config, context)
    ).rejects.toThrow();
  });
});
```

### 6. Documentation

```typescript
/**
 * Slack Notifier Plugin
 *
 * Sends notifications to Slack channels.
 *
 * @example
 * ```yaml
 * - id: notify
 *   action: slack_notify
 *   config:
 *     channel: "#alerts"
 *     message: "Test failed!"
 *     webhook_url: "${SLACK_WEBHOOK}"
 * ```
 */
export default {
  name: 'slack-notifier',
  version: '1.0.0',

  actions: [{
    name: 'slack_notify',
    description: 'Send message to Slack channel',

    /**
     * Configuration schema
     * @property {string} channel - Slack channel (e.g., #alerts)
     * @property {string} message - Message to send
     * @property {string} webhook_url - Slack webhook URL
     */
    schema: { /* ... */ },

    async execute(config, context) {
      // ...
    }
  }]
} as Plugin;
```

---

## Complete Plugin Examples

### Example 1: Slack Integration (TypeScript)

```typescript
// slack-notifier/index.ts
import { Plugin, Action } from '@testmesh/plugin-sdk';
import { WebClient } from '@slack/web-api';

const slackNotify: Action = {
  name: 'slack_notify',
  description: 'Send notification to Slack',

  schema: {
    type: 'object',
    required: ['message'],
    properties: {
      channel: { type: 'string', default: '#general' },
      message: { type: 'string' },
      token: { type: 'string' },
      attachments: { type: 'array' },
      thread_ts: { type: 'string' }
    }
  },

  async execute(config, context) {
    const client = new WebClient(config.token);

    context.log.info('Sending Slack message', {
      channel: config.channel
    });

    try {
      const result = await client.chat.postMessage({
        channel: config.channel,
        text: config.message,
        attachments: config.attachments,
        thread_ts: config.thread_ts
      });

      return {
        success: true,
        output: {
          ts: result.ts,
          channel: result.channel
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error.message,
          code: error.data?.error
        }
      };
    }
  }
};

export default {
  name: 'slack-notifier',
  version: '1.0.0',
  actions: [slackNotify]
} as Plugin;
```

### Example 2: Data Validator (Go)

```go
// validator/main.go
package main

import (
    "encoding/json"
    "regexp"
    "github.com/testmesh/plugin-sdk-go/plugin"
)

type ValidatorAction struct{}

func (a *ValidatorAction) Execute(config map[string]interface{}, ctx *plugin.Context) (*plugin.Result, error) {
    data := config["data"].(string)
    rules := config["rules"].([]interface{})

    issues := []string{}

    for _, rule := range rules {
        r := rule.(map[string]interface{})
        ruleType := r["type"].(string)
        pattern := r["pattern"].(string)

        switch ruleType {
        case "regex":
            matched, _ := regexp.MatchString(pattern, data)
            if !matched {
                issues = append(issues, "Failed regex: "+pattern)
            }
        case "length":
            minLen := int(r["min"].(float64))
            maxLen := int(r["max"].(float64))
            if len(data) < minLen || len(data) > maxLen {
                issues = append(issues, "Length out of range")
            }
        }
    }

    return &plugin.Result{
        Success: len(issues) == 0,
        Output: map[string]interface{}{
            "valid": len(issues) == 0,
            "issues": issues,
        },
    }, nil
}

func main() {
    plugin.Serve(&plugin.Config{
        Name: "validator",
        Version: "1.0.0",
        Actions: []plugin.Action{
            &ValidatorAction{},
        },
    })
}
```

### Example 3: GraphQL Client (Python)

```python
# graphql_plugin.py
from testmesh_sdk import Plugin, Action, ActionContext, ActionResult
from gql import gql, Client
from gql.transport.requests import RequestsHTTPTransport

class GraphQLAction(Action):
    def name(self) -> str:
        return "graphql_query"

    def schema(self) -> dict:
        return {
            "type": "object",
            "required": ["url", "query"],
            "properties": {
                "url": {"type": "string"},
                "query": {"type": "string"},
                "variables": {"type": "object"}
            }
        }

    async def execute(self, config: dict, context: ActionContext) -> ActionResult:
        transport = RequestsHTTPTransport(url=config["url"])
        client = Client(transport=transport)

        query = gql(config["query"])
        variables = config.get("variables", {})

        try:
            result = client.execute(query, variable_values=variables)

            return ActionResult(
                success=True,
                output=result
            )
        except Exception as e:
            return ActionResult(
                success=False,
                error={"message": str(e)}
            )

class GraphQLPlugin(Plugin):
    def name(self) -> str:
        return "graphql-client"

    def actions(self) -> list:
        return [GraphQLAction()]

def create_plugin():
    return GraphQLPlugin()
```

---

## Summary

### Built-in vs Plugin Decision Tree

```
Need to test HTTP API?
  └─→ Use built-in http_request ✅ (no plugin needed)

Need to test database?
  └─→ Use built-in database_query ✅ (no plugin needed)

Need to test Kafka?
  └─→ Use built-in kafka_publish ✅ (no plugin needed)

Need to test gRPC?
  └─→ Use built-in grpc_call ✅ (no plugin needed)

Need to test WebSocket?
  └─→ Use built-in websocket_* ✅ (no plugin needed)

Need to test browser?
  └─→ Use built-in browser_* ✅ (no plugin needed)

Need custom integration (Slack, SAP, Salesforce)?
  └─→ Build or install plugin ⚠️

Need custom validation/processing?
  └─→ Build plugin ⚠️
```

### Plugin Capabilities

✅ **Multi-Language** - JavaScript, Go, Python, WASM, or any HTTP server
✅ **Easy to Build** - Simple SDK and CLI tools
✅ **Well-Integrated** - Full access to flow context
✅ **Shareable** - Publish to marketplace or npm
✅ **Performant** - Native plugins (Go, WASM) for speed
✅ **Flexible** - Actions, assertions, hooks, reporters
✅ **For Extensions** - Built-in handlers cover common protocols

### Quick Reference

```bash
# Create plugin
testmesh plugin init my-plugin --language typescript

# Test locally
testmesh plugin test my-plugin

# Install
testmesh plugin install ./my-plugin

# Publish
testmesh plugin publish
```

```yaml
# Use in flow
- id: custom_step
  action: my_custom_action
  config:
    # Your config
```

---

## CI/CD Integration with Plugins

This section shows complete CI/CD examples with custom plugin installation.

### GitHub Actions

#### Basic Example (Built-in Handlers Only)

```yaml
# .github/workflows/test.yml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      # Spin up test dependencies
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: testpass
          POSTGRES_DB: testdb
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      kafka:
        image: bitnami/kafka:latest
        env:
          KAFKA_CFG_NODE_ID: 0
          KAFKA_CFG_PROCESS_ROLES: controller,broker
          KAFKA_CFG_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
          KAFKA_CFG_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
          KAFKA_CFG_CONTROLLER_QUORUM_VOTERS: 0@kafka:9093
          KAFKA_CFG_CONTROLLER_LISTENER_NAMES: CONTROLLER
        ports:
          - 9092:9092

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Install TestMesh
        run: |
          curl -L https://get.testmesh.io | sh
          echo "$HOME/.testmesh/bin" >> $GITHUB_PATH

      - name: Verify TestMesh installation
        run: testmesh version

      # No plugin installation needed for built-in handlers!

      - name: Configure connections
        run: |
          mkdir -p .testmesh
          cat > .testmesh/config.yaml <<EOF
          connections:
            postgresql:
              host: localhost
              port: 5432
              database: testdb
              username: postgres
              password: testpass

            kafka:
              brokers: ["localhost:9092"]
          EOF

      - name: Run integration tests
        run: testmesh run flows/ --env ci
        env:
          API_URL: http://localhost:3000

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: .testmesh/results/
```

#### Advanced Example (With Custom Plugins)

```yaml
# .github/workflows/test-with-plugins.yml
name: Integration Tests with Custom Plugins

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: testpass
          POSTGRES_DB: testdb
        ports:
          - 5432:5432

      kafka:
        image: bitnami/kafka:latest
        ports:
          - 9092:9092

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Install TestMesh
        run: |
          curl -L https://get.testmesh.io | sh
          echo "$HOME/.testmesh/bin" >> $GITHUB_PATH

      - name: Install custom plugins
        run: |
          # Install from TestMesh marketplace
          testmesh plugin install slack-notifier

          # Install from npm
          testmesh plugin install @mycompany/sap-plugin

          # Install local plugin from repository
          testmesh plugin install ./plugins/custom-validator

          # List installed plugins
          testmesh plugin list

      - name: Configure connections and plugins
        env:
          SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}
          SAP_API_KEY: ${{ secrets.SAP_API_KEY }}
        run: |
          mkdir -p .testmesh
          cat > .testmesh/config.yaml <<EOF
          connections:
            postgresql:
              host: localhost
              port: 5432
              database: testdb
              username: postgres
              password: testpass

            kafka:
              brokers: ["localhost:9092"]

          plugins:
            - name: slack-notifier
              enabled: true
              config:
                webhook_url: "${SLACK_WEBHOOK}"
                default_channel: "#ci-alerts"

            - name: sap-plugin
              enabled: true
              config:
                api_key: "${SAP_API_KEY}"
                endpoint: "https://sap.example.com/api"

            - name: custom-validator
              enabled: true
          EOF

      - name: Validate configuration
        run: testmesh config validate

      - name: Run integration tests
        run: |
          testmesh run flows/ \
            --env ci \
            --tags "integration,smoke" \
            --report html,junit \
            --output results/
        env:
          API_URL: http://localhost:3000

      - name: Notify on failure
        if: failure()
        run: |
          # This uses the slack-notifier plugin installed earlier
          testmesh run flows/notify-failure.yaml

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: results/

      - name: Publish test results
        if: always()
        uses: EnricoMi/publish-unit-test-result-action@v2
        with:
          files: results/junit.xml
```

#### Using Docker Image with Pre-installed Plugins

```yaml
# .github/workflows/test-docker.yml
name: Integration Tests (Docker)

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    # Use custom Docker image with plugins pre-installed
    container:
      image: mycompany/testmesh:latest-with-plugins
      env:
        SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}
        SAP_API_KEY: ${{ secrets.SAP_API_KEY }}

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: testpass
          POSTGRES_DB: testdb

      kafka:
        image: bitnami/kafka:latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      # No TestMesh or plugin installation needed - in Docker image!

      - name: Run tests
        run: testmesh run flows/ --env ci
```

**Dockerfile for custom image:**
```dockerfile
# Dockerfile
FROM testmesh/testmesh:1.0.0

# Install custom plugins
RUN testmesh plugin install slack-notifier && \
    testmesh plugin install @mycompany/sap-plugin && \
    testmesh plugin install @mycompany/custom-validator

# Verify installations
RUN testmesh plugin list

# Set working directory
WORKDIR /workspace

CMD ["testmesh", "run"]
```

---

### GitLab CI

#### Basic Example (Built-in Handlers Only)

```yaml
# .gitlab-ci.yml
stages:
  - test

variables:
  POSTGRES_DB: testdb
  POSTGRES_USER: postgres
  POSTGRES_PASSWORD: testpass
  API_URL: http://localhost:3000

integration-tests:
  stage: test
  image: testmesh/testmesh:latest

  services:
    - postgres:15
    - bitnami/kafka:latest

  variables:
    POSTGRES_HOST: postgres
    KAFKA_BROKERS: kafka:9092

  before_script:
    # Configure connections
    - mkdir -p .testmesh
    - |
      cat > .testmesh/config.yaml <<EOF
      connections:
        postgresql:
          host: ${POSTGRES_HOST}
          port: 5432
          database: ${POSTGRES_DB}
          username: ${POSTGRES_USER}
          password: ${POSTGRES_PASSWORD}

        kafka:
          brokers: ["${KAFKA_BROKERS}"]
      EOF

  script:
    - testmesh run flows/ --env ci

  artifacts:
    when: always
    reports:
      junit: .testmesh/results/junit.xml
    paths:
      - .testmesh/results/
```

#### Advanced Example (With Custom Plugins)

```yaml
# .gitlab-ci.yml
stages:
  - setup
  - test
  - notify

variables:
  POSTGRES_DB: testdb
  POSTGRES_USER: postgres
  POSTGRES_PASSWORD: testpass

# Cache plugins between jobs
cache:
  key: testmesh-plugins
  paths:
    - .testmesh/plugins/

integration-tests:
  stage: test
  image: testmesh/testmesh:latest

  services:
    - postgres:15
    - bitnami/kafka:latest

  before_script:
    # Install TestMesh plugins
    - testmesh plugin install slack-notifier
    - testmesh plugin install @mycompany/sap-plugin
    - testmesh plugin install ./plugins/custom-validator
    - testmesh plugin list

    # Configure connections and plugins
    - mkdir -p .testmesh
    - |
      cat > .testmesh/config.yaml <<EOF
      connections:
        postgresql:
          host: postgres
          port: 5432
          database: ${POSTGRES_DB}
          username: ${POSTGRES_USER}
          password: ${POSTGRES_PASSWORD}

        kafka:
          brokers: ["kafka:9092"]

      plugins:
        - name: slack-notifier
          enabled: true
          config:
            webhook_url: "${SLACK_WEBHOOK}"
            default_channel: "#ci-alerts"

        - name: sap-plugin
          enabled: true
          config:
            api_key: "${SAP_API_KEY}"
      EOF

  script:
    - testmesh run flows/ --env ci --report html,junit

  after_script:
    # Run notification flow on failure
    - |
      if [ $CI_JOB_STATUS == 'failed' ]; then
        testmesh run flows/notify-failure.yaml
      fi

  artifacts:
    when: always
    reports:
      junit: .testmesh/results/junit.xml
    paths:
      - .testmesh/results/
    expire_in: 30 days

# Notify on success
notify-success:
  stage: notify
  image: testmesh/testmesh:latest
  dependencies:
    - integration-tests
  when: on_success
  script:
    - testmesh plugin install slack-notifier
    - testmesh run flows/notify-success.yaml
```

---

### Jenkins

#### Jenkinsfile (Declarative Pipeline)

```groovy
// Jenkinsfile
pipeline {
    agent any

    environment {
        TESTMESH_VERSION = '1.0.0'
        SLACK_WEBHOOK = credentials('slack-webhook')
        SAP_API_KEY = credentials('sap-api-key')
    }

    stages {
        stage('Setup') {
            steps {
                script {
                    // Install TestMesh
                    sh '''
                        curl -L https://get.testmesh.io | sh
                        export PATH="$HOME/.testmesh/bin:$PATH"
                        testmesh version
                    '''
                }
            }
        }

        stage('Install Plugins') {
            steps {
                script {
                    sh '''
                        export PATH="$HOME/.testmesh/bin:$PATH"

                        # Install custom plugins
                        testmesh plugin install slack-notifier
                        testmesh plugin install @mycompany/sap-plugin
                        testmesh plugin install ./plugins/custom-validator

                        # List installed plugins
                        testmesh plugin list
                    '''
                }
            }
        }

        stage('Configure') {
            steps {
                script {
                    sh '''
                        export PATH="$HOME/.testmesh/bin:$PATH"

                        mkdir -p .testmesh
                        cat > .testmesh/config.yaml <<EOF
connections:
  postgresql:
    host: postgres-server
    port: 5432
    database: testdb
    username: postgres
    password: ${DB_PASSWORD}

  kafka:
    brokers: ["kafka-broker:9092"]

plugins:
  - name: slack-notifier
    enabled: true
    config:
      webhook_url: "${SLACK_WEBHOOK}"

  - name: sap-plugin
    enabled: true
    config:
      api_key: "${SAP_API_KEY}"
EOF
                    '''
                }
            }
        }

        stage('Run Tests') {
            steps {
                script {
                    sh '''
                        export PATH="$HOME/.testmesh/bin:$PATH"
                        testmesh run flows/ \
                            --env ci \
                            --tags "integration,smoke" \
                            --report html,junit \
                            --output results/
                    '''
                }
            }
        }
    }

    post {
        always {
            // Publish test results
            junit 'results/junit.xml'

            // Archive results
            archiveArtifacts artifacts: 'results/**/*', allowEmptyArchive: true
        }

        failure {
            script {
                sh '''
                    export PATH="$HOME/.testmesh/bin:$PATH"
                    testmesh run flows/notify-failure.yaml
                '''
            }
        }

        success {
            script {
                sh '''
                    export PATH="$HOME/.testmesh/bin:$PATH"
                    testmesh run flows/notify-success.yaml
                '''
            }
        }
    }
}
```

---

### CircleCI

```yaml
# .circleci/config.yml
version: 2.1

orbs:
  # You could create a TestMesh orb for reusability
  testmesh: mycompany/testmesh@1.0.0

jobs:
  integration-tests:
    docker:
      - image: cimg/base:stable

      # Service containers
      - image: postgres:15
        environment:
          POSTGRES_PASSWORD: testpass
          POSTGRES_DB: testdb

      - image: bitnami/kafka:latest
        environment:
          KAFKA_CFG_NODE_ID: 0
          KAFKA_CFG_PROCESS_ROLES: controller,broker

    steps:
      - checkout

      - restore_cache:
          keys:
            - testmesh-plugins-v1-{{ checksum "plugins.lock" }}
            - testmesh-plugins-v1-

      - run:
          name: Install TestMesh
          command: |
            curl -L https://get.testmesh.io | sh
            echo 'export PATH="$HOME/.testmesh/bin:$PATH"' >> $BASH_ENV

      - run:
          name: Install custom plugins
          command: |
            testmesh plugin install slack-notifier
            testmesh plugin install @mycompany/sap-plugin
            testmesh plugin install ./plugins/custom-validator
            testmesh plugin list

      - save_cache:
          key: testmesh-plugins-v1-{{ checksum "plugins.lock" }}
          paths:
            - ~/.testmesh/plugins/

      - run:
          name: Configure TestMesh
          command: |
            mkdir -p .testmesh
            cat > .testmesh/config.yaml <<EOF
            connections:
              postgresql:
                host: localhost
                port: 5432
                database: testdb
                username: postgres
                password: testpass

              kafka:
                brokers: ["localhost:9092"]

            plugins:
              - name: slack-notifier
                enabled: true
                config:
                  webhook_url: "${SLACK_WEBHOOK}"
            EOF

      - run:
          name: Run integration tests
          command: |
            testmesh run flows/ \
              --env ci \
              --report html,junit \
              --output results/

      - run:
          name: Notify on failure
          when: on_fail
          command: testmesh run flows/notify-failure.yaml

      - store_test_results:
          path: results/

      - store_artifacts:
          path: results/

workflows:
  version: 2
  test:
    jobs:
      - integration-tests
```

---

### Azure Pipelines

```yaml
# azure-pipelines.yml
trigger:
  - main
  - develop

pool:
  vmImage: 'ubuntu-latest'

variables:
  TESTMESH_VERSION: '1.0.0'
  POSTGRES_HOST: localhost
  POSTGRES_DB: testdb
  POSTGRES_USER: postgres
  POSTGRES_PASSWORD: testpass

services:
  postgres:
    image: postgres:15
    ports:
      - 5432:5432
    env:
      POSTGRES_PASSWORD: $(POSTGRES_PASSWORD)
      POSTGRES_DB: $(POSTGRES_DB)

  kafka:
    image: bitnami/kafka:latest
    ports:
      - 9092:9092

stages:
  - stage: Test
    jobs:
      - job: IntegrationTests
        steps:
          - checkout: self

          - task: Cache@2
            inputs:
              key: 'testmesh-plugins | "$(Agent.OS)" | plugins.lock'
              path: $(HOME)/.testmesh/plugins
            displayName: 'Cache TestMesh plugins'

          - script: |
              curl -L https://get.testmesh.io | sh
              echo "##vso[task.prependpath]$HOME/.testmesh/bin"
            displayName: 'Install TestMesh'

          - script: |
              testmesh version
              testmesh plugin install slack-notifier
              testmesh plugin install @mycompany/sap-plugin
              testmesh plugin install ./plugins/custom-validator
              testmesh plugin list
            displayName: 'Install custom plugins'

          - script: |
              mkdir -p .testmesh
              cat > .testmesh/config.yaml <<EOF
              connections:
                postgresql:
                  host: $(POSTGRES_HOST)
                  port: 5432
                  database: $(POSTGRES_DB)
                  username: $(POSTGRES_USER)
                  password: $(POSTGRES_PASSWORD)

                kafka:
                  brokers: ["localhost:9092"]

              plugins:
                - name: slack-notifier
                  enabled: true
                  config:
                    webhook_url: "$(SLACK_WEBHOOK)"

                - name: sap-plugin
                  enabled: true
                  config:
                    api_key: "$(SAP_API_KEY)"
              EOF
            displayName: 'Configure TestMesh'
            env:
              SLACK_WEBHOOK: $(SLACK_WEBHOOK)
              SAP_API_KEY: $(SAP_API_KEY)

          - script: |
              testmesh run flows/ \
                --env ci \
                --tags "integration,smoke" \
                --report html,junit \
                --output $(Build.ArtifactStagingDirectory)/results/
            displayName: 'Run integration tests'

          - task: PublishTestResults@2
            condition: always()
            inputs:
              testResultsFormat: 'JUnit'
              testResultsFiles: '$(Build.ArtifactStagingDirectory)/results/junit.xml'
              failTaskOnFailedTests: true
            displayName: 'Publish test results'

          - task: PublishBuildArtifacts@1
            condition: always()
            inputs:
              pathToPublish: '$(Build.ArtifactStagingDirectory)/results'
              artifactName: 'test-results'
            displayName: 'Publish test artifacts'

          - script: |
              testmesh run flows/notify-failure.yaml
            condition: failed()
            displayName: 'Notify on failure'
```

---

### Best Practices for CI/CD

#### 1. Plugin Caching

Cache plugins to speed up builds:

```yaml
# GitHub Actions
- uses: actions/cache@v4
  with:
    path: ~/.testmesh/plugins
    key: testmesh-plugins-${{ hashFiles('plugins.lock') }}

# GitLab CI
cache:
  key: testmesh-plugins
  paths:
    - .testmesh/plugins/

# CircleCI
- restore_cache:
    keys:
      - testmesh-plugins-v1-{{ checksum "plugins.lock" }}
```

#### 2. Use Docker Image with Pre-installed Plugins

Build custom Docker image:

```dockerfile
FROM testmesh/testmesh:1.0.0

# Install all required plugins
RUN testmesh plugin install slack-notifier && \
    testmesh plugin install @mycompany/sap-plugin && \
    testmesh plugin install custom-validator

# Verify
RUN testmesh plugin list

WORKDIR /workspace
```

Use in CI:

```yaml
# GitHub Actions
container:
  image: mycompany/testmesh:latest-with-plugins

# GitLab CI
image: mycompany/testmesh:latest-with-plugins

# CircleCI
docker:
  - image: mycompany/testmesh:latest-with-plugins
```

#### 3. Plugin Lock File

Create `plugins.lock` to pin versions:

```yaml
# plugins.lock
plugins:
  - name: slack-notifier
    version: 1.2.3
    source: marketplace

  - name: @mycompany/sap-plugin
    version: 2.0.1
    source: npm

  - name: custom-validator
    version: 1.0.0
    source: ./plugins/custom-validator
```

Install from lock file:

```bash
testmesh plugin install --lock plugins.lock
```

#### 4. Separate Plugin Installation Job

For complex setups:

```yaml
# GitHub Actions
jobs:
  setup:
    runs-on: ubuntu-latest
    steps:
      - name: Install plugins
        run: |
          testmesh plugin install slack-notifier
          testmesh plugin install @mycompany/sap-plugin

      - name: Cache plugins
        uses: actions/cache/save@v4
        with:
          path: ~/.testmesh/plugins
          key: testmesh-plugins-${{ github.sha }}

  test:
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - name: Restore plugin cache
        uses: actions/cache/restore@v4
        with:
          path: ~/.testmesh/plugins
          key: testmesh-plugins-${{ github.sha }}

      - name: Run tests
        run: testmesh run flows/
```

---

## Architecture Note

TestMesh uses a **hybrid architecture**:

1. **Built-in Action Handlers** - Core protocols (HTTP, DB, Kafka, gRPC, WebSocket, Browser, MCP) are compiled into the TestMesh binary for:
   - ✅ Zero-installation experience
   - ✅ Consistent behavior across environments
   - ✅ Maximum performance (no plugin overhead)
   - ✅ Guaranteed availability

2. **Plugin System** - For custom/community extensions:
   - ✅ Flexible extensibility
   - ✅ Multi-language support
   - ✅ Community contributions
   - ✅ Domain-specific integrations

**This gives you the best of both worlds:** Common use cases work immediately, and specialized needs are easily extensible through plugins.

---

**Version**: 1.0.0
**Last Updated**: 2026-02-11
**Status**: Complete ✅

**Key Changes (2026-02-11):**
- Added "Built-in vs Custom Plugins" section
- Clarified that HTTP, Database, Kafka, gRPC, WebSocket, Browser, and MCP handlers are built-in
- Explained when plugin installation is required (only for custom/community plugins)
- Added decision tree for choosing built-in vs plugin
- Updated examples to show built-in handlers work without installation
