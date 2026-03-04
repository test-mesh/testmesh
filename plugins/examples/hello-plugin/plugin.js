/**
 * Hello World Plugin for TestMesh
 *
 * This is an example plugin that demonstrates how to create
 * custom actions using the TestMesh plugin system.
 *
 * Usage in a flow:
 *   steps:
 *     - name: Say Hello
 *       action: hello
 *       config:
 *         name: "World"
 *         uppercase: true
 */

const { TestMeshPlugin } = require('../../sdk/nodejs');

// Define the plugin manifest
const manifest = {
  id: 'hello',
  name: 'Hello World Plugin',
  version: '1.0.0',
  description: 'A simple greeting plugin'
};

// Create the plugin
const plugin = new TestMeshPlugin(manifest);

// Register the "hello" action
plugin.action('hello', async (config, context, logger) => {
  const name = config.name || 'World';
  const uppercase = config.uppercase || false;

  logger.info(`Generating greeting for: ${name}`);

  let greeting = `Hello, ${name}!`;

  if (uppercase) {
    greeting = greeting.toUpperCase();
  }

  // Access context if needed
  if (context.execution_id) {
    logger.debug(`Running in execution: ${context.execution_id}`);
  }

  // Return the result
  return {
    greeting: greeting,
    name: name,
    timestamp: new Date().toISOString()
  };
});

// Start the plugin
plugin.start().then(port => {
  console.log(`Hello plugin started on port ${port}`);
}).catch(err => {
  console.error('Failed to start plugin:', err);
  process.exit(1);
});
