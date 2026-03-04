# TestMesh Plugin System

TestMesh supports a plugin system that allows you to extend the platform with custom actions written in any language.

## How It Works

Plugins run as separate HTTP servers. TestMesh communicates with them via a simple REST protocol:

- `GET /health` - Health check (returns `{ "status": "healthy" }`)
- `GET /info` - Plugin information and available actions
- `POST /execute` - Execute an action
- `POST /shutdown` - Graceful shutdown

## Plugin Structure

Each plugin is a directory containing:

```
my-plugin/
  manifest.json    # Plugin metadata
  plugin.js        # Entry point (or .py, .sh, etc.)
  ...              # Other files
```

### manifest.json

```json
{
  "id": "my-plugin",
  "name": "My Custom Plugin",
  "version": "1.0.0",
  "description": "Description of what the plugin does",
  "author": "Your Name",
  "type": "action",
  "entry_point": "plugin.js"
}
```

## Creating a Plugin

### Node.js

```javascript
const { TestMeshPlugin } = require('@testmesh/plugin-sdk');

const plugin = new TestMeshPlugin({
  id: 'my-plugin',
  name: 'My Plugin',
  version: '1.0.0'
});

plugin.action('my-action', async (config, context, logger) => {
  logger.info('Executing my action');

  // Access config values
  const value = config.someValue;

  // Access execution context
  const execId = context.execution_id;

  // Return result
  return {
    result: 'success',
    data: { /* ... */ }
  };
});

plugin.start();
```

### Python

```python
from testmesh_plugin import TestMeshPlugin

plugin = TestMeshPlugin({
    "id": "my-plugin",
    "name": "My Plugin",
    "version": "1.0.0"
})

@plugin.action("my-action")
def my_action(config, context, logger):
    logger.info("Executing my action")

    value = config.get("someValue")

    return {
        "result": "success",
        "data": {}
    }

plugin.start()
```

## Using Plugins in Flows

Once installed, plugins appear as action types in your flows:

```yaml
name: My Flow
steps:
  - name: Use Custom Action
    action: my-plugin  # The plugin ID
    config:
      someValue: "hello"
      otherOption: 123
```

## Installing Plugins

### Via API

```bash
curl -X POST http://localhost:5016/api/v1/plugins/install \
  -H "Content-Type: application/json" \
  -d '{"source": "/path/to/my-plugin"}'
```

### Plugin Directory

Place plugins in the `plugins/` directory and they will be discovered automatically.

## Protocol Details

### Execute Request

```json
{
  "action": "my-action",
  "config": {
    "key": "value"
  },
  "context": {
    "execution_id": "uuid",
    "flow_id": "uuid",
    "step_id": "step_1",
    "variables": {},
    "step_outputs": {}
  }
}
```

### Execute Response

```json
{
  "success": true,
  "output": {
    "key": "value"
  },
  "logs": [
    {
      "level": "info",
      "message": "Log message",
      "timestamp": "2024-01-01T00:00:00Z"
    }
  ],
  "metrics": {
    "duration_ms": 42
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```
