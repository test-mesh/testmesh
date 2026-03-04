/**
 * TestMesh Plugin SDK for Node.js
 *
 * This SDK provides a simple way to create TestMesh plugins using Node.js.
 * Plugins communicate with TestMesh via HTTP.
 */

const http = require('http');

class TestMeshPlugin {
  constructor(manifest) {
    this.manifest = manifest;
    this.handlers = new Map();
    this.port = parseInt(process.env.PLUGIN_PORT || '0');
    this.server = null;
  }

  /**
   * Register an action handler
   * @param {string} actionId - The action identifier
   * @param {Function} handler - Async function(config, context) => result
   */
  action(actionId, handler) {
    this.handlers.set(actionId, handler);
  }

  /**
   * Start the plugin server
   */
  async start() {
    this.server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${this.port}`);

      try {
        if (url.pathname === '/health' && req.method === 'GET') {
          this.handleHealth(req, res);
        } else if (url.pathname === '/info' && req.method === 'GET') {
          this.handleInfo(req, res);
        } else if (url.pathname === '/execute' && req.method === 'POST') {
          await this.handleExecute(req, res);
        } else if (url.pathname === '/shutdown' && req.method === 'POST') {
          this.handleShutdown(req, res);
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      } catch (err) {
        console.error('Request error:', err);
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    });

    return new Promise((resolve) => {
      this.server.listen(this.port, '127.0.0.1', () => {
        const addr = this.server.address();
        console.log(`Plugin ${this.manifest.id} listening on port ${addr.port}`);
        resolve(addr.port);
      });
    });
  }

  handleHealth(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      version: this.manifest.version,
      uptime_seconds: Math.floor(process.uptime())
    }));
  }

  handleInfo(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: this.manifest.id,
      name: this.manifest.name,
      version: this.manifest.version,
      description: this.manifest.description,
      actions: Array.from(this.handlers.keys()).map(id => ({
        id,
        name: id,
        description: `Action: ${id}`
      }))
    }));
  }

  async handleExecute(req, res) {
    const body = await this.readBody(req);
    const request = JSON.parse(body);

    const { action, config, context } = request;
    const handler = this.handlers.get(action);

    if (!handler) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: {
          code: 'UNKNOWN_ACTION',
          message: `Unknown action: ${action}`
        }
      }));
      return;
    }

    const startTime = Date.now();
    const logs = [];

    // Create a logger that captures logs
    const logger = {
      debug: (msg) => logs.push({ level: 'debug', message: msg, timestamp: new Date() }),
      info: (msg) => logs.push({ level: 'info', message: msg, timestamp: new Date() }),
      warn: (msg) => logs.push({ level: 'warn', message: msg, timestamp: new Date() }),
      error: (msg) => logs.push({ level: 'error', message: msg, timestamp: new Date() })
    };

    try {
      const result = await handler(config, context, logger);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        output: result || {},
        logs,
        metrics: {
          duration_ms: Date.now() - startTime
        }
      }));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: {
          code: err.code || 'EXECUTION_ERROR',
          message: err.message
        },
        logs,
        metrics: {
          duration_ms: Date.now() - startTime
        }
      }));
    }
  }

  handleShutdown(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'shutting_down' }));

    // Graceful shutdown
    setTimeout(() => {
      this.server.close(() => {
        process.exit(0);
      });
    }, 100);
  }

  readBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }
}

module.exports = { TestMeshPlugin };
