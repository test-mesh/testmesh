/**
 * Web Scraper Plugin for TestMesh
 *
 * Uses cheerio (jQuery-like HTML parsing for Node.js) to extract data from HTML.
 * This is a great example of leveraging the npm ecosystem.
 *
 * Usage in a flow:
 *   steps:
 *     - name: Get page
 *       action: http
 *       config:
 *         url: "https://example.com"
 *       output:
 *         html: "{{ response.body }}"
 *
 *     - name: Extract links
 *       action: scraper.select
 *       config:
 *         html: "{{ html }}"
 *         selector: "a"
 *         extract:
 *           - attr: "href"
 *             as: "url"
 *           - text: true
 *             as: "title"
 *
 *     - name: Extract single value
 *       action: scraper.selectOne
 *       config:
 *         html: "{{ html }}"
 *         selector: "h1"
 *         extract: text
 */

const http = require('http');

// Inline TestMesh Plugin SDK
class TestMeshPlugin {
  constructor(manifest) {
    this.manifest = manifest;
    this.handlers = new Map();
    this.port = parseInt(process.env.PLUGIN_PORT || '0');
    this.server = null;
  }

  action(actionId, handler) {
    this.handlers.set(actionId, handler);
  }

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
        id, name: id, description: `Action: ${id}`
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
        error: { code: 'UNKNOWN_ACTION', message: `Unknown action: ${action}` }
      }));
      return;
    }

    const startTime = Date.now();
    const logs = [];
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
        metrics: { duration_ms: Date.now() - startTime }
      }));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: { code: err.code || 'EXECUTION_ERROR', message: err.message },
        logs,
        metrics: { duration_ms: Date.now() - startTime }
      }));
    }
  }

  handleShutdown(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'shutting_down' }));
    setTimeout(() => {
      this.server.close(() => process.exit(0));
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

// =============================================
// Plugin Implementation
// =============================================

const manifest = {
  id: 'scraper',
  name: 'Web Scraper Plugin',
  version: '1.0.0',
  description: 'HTML parsing and web scraping using cheerio'
};

const plugin = new TestMeshPlugin(manifest);

// Lazy load cheerio
let cheerio;
function getCheerio() {
  if (!cheerio) {
    try {
      cheerio = require('cheerio');
    } catch (e) {
      throw new Error('cheerio is not installed. Run: npm install cheerio');
    }
  }
  return cheerio;
}

/**
 * Extract value from a cheerio element based on extraction spec
 */
function extractValue(el, $, spec) {
  if (typeof spec === 'string') {
    switch (spec) {
      case 'text':
        return $(el).text().trim();
      case 'html':
        return $(el).html();
      case 'outerHtml':
        return $.html(el);
      default:
        // Treat as attribute name
        return $(el).attr(spec);
    }
  }

  if (typeof spec === 'object') {
    if (spec.text) {
      return $(el).text().trim();
    }
    if (spec.html) {
      return $(el).html();
    }
    if (spec.attr) {
      return $(el).attr(spec.attr);
    }
    if (spec.data) {
      return $(el).data(spec.data);
    }
  }

  return $(el).text().trim();
}

// ===== scraper.select - Select multiple elements =====
plugin.action('scraper.select', async (config, context, logger) => {
  const $ = getCheerio().load(config.html || '');
  const selector = config.selector;

  if (!selector) {
    throw new Error('selector is required');
  }

  logger.info(`Selecting elements: ${selector}`);

  const elements = $(selector);
  const results = [];

  elements.each((i, el) => {
    if (config.extract && Array.isArray(config.extract)) {
      // Multiple extractions per element
      const item = {};
      for (const spec of config.extract) {
        const key = spec.as || spec.attr || 'value';
        item[key] = extractValue(el, $, spec);
      }
      results.push(item);
    } else if (config.extract) {
      // Single extraction
      results.push(extractValue(el, $, config.extract));
    } else {
      // Default: extract text
      results.push($(el).text().trim());
    }
  });

  logger.info(`Found ${results.length} elements`);

  return {
    count: results.length,
    items: results,
  };
});

// ===== scraper.selectOne - Select single element =====
plugin.action('scraper.selectOne', async (config, context, logger) => {
  const $ = getCheerio().load(config.html || '');
  const selector = config.selector;

  if (!selector) {
    throw new Error('selector is required');
  }

  logger.info(`Selecting single element: ${selector}`);

  const el = $(selector).first();

  if (el.length === 0) {
    logger.warn(`No element found for selector: ${selector}`);
    return {
      found: false,
      value: null,
    };
  }

  let value;
  if (config.extract && Array.isArray(config.extract)) {
    value = {};
    for (const spec of config.extract) {
      const key = spec.as || spec.attr || 'value';
      value[key] = extractValue(el, $, spec);
    }
  } else if (config.extract) {
    value = extractValue(el, $, config.extract);
  } else {
    value = el.text().trim();
  }

  return {
    found: true,
    value,
  };
});

// ===== scraper.table - Extract table data =====
plugin.action('scraper.table', async (config, context, logger) => {
  const $ = getCheerio().load(config.html || '');
  const selector = config.selector || 'table';

  logger.info(`Extracting table: ${selector}`);

  const table = $(selector).first();
  if (table.length === 0) {
    throw new Error(`Table not found: ${selector}`);
  }

  // Extract headers
  const headers = [];
  table.find('thead th, tr:first-child th').each((i, el) => {
    headers.push($(el).text().trim());
  });

  // If no headers in thead, try first row
  if (headers.length === 0) {
    table.find('tr:first-child td').each((i, el) => {
      headers.push($(el).text().trim());
    });
  }

  // Extract rows
  const rows = [];
  const rowSelector = headers.length > 0 ? 'tbody tr, tr:not(:first-child)' : 'tr';

  table.find(rowSelector).each((i, tr) => {
    const row = {};
    $(tr).find('td').each((j, td) => {
      const key = headers[j] || `col_${j}`;
      row[key] = $(td).text().trim();
    });
    if (Object.keys(row).length > 0) {
      rows.push(row);
    }
  });

  logger.info(`Extracted ${rows.length} rows with ${headers.length} columns`);

  return {
    headers,
    rows,
    rowCount: rows.length,
  };
});

// ===== scraper.links - Extract all links =====
plugin.action('scraper.links', async (config, context, logger) => {
  const $ = getCheerio().load(config.html || '');
  const selector = config.selector || 'a[href]';
  const baseUrl = config.baseUrl || '';

  logger.info(`Extracting links: ${selector}`);

  const links = [];

  $(selector).each((i, el) => {
    let href = $(el).attr('href');
    const text = $(el).text().trim();

    // Resolve relative URLs
    if (href && baseUrl && !href.match(/^https?:\/\//)) {
      try {
        href = new URL(href, baseUrl).href;
      } catch (e) {
        // Keep original href
      }
    }

    if (href) {
      links.push({
        href,
        text,
        title: $(el).attr('title') || '',
      });
    }
  });

  // Optionally filter duplicates
  const uniqueLinks = config.unique
    ? links.filter((link, i, arr) => arr.findIndex(l => l.href === link.href) === i)
    : links;

  logger.info(`Found ${uniqueLinks.length} links`);

  return {
    count: uniqueLinks.length,
    links: uniqueLinks,
  };
});

// ===== scraper.meta - Extract meta tags =====
plugin.action('scraper.meta', async (config, context, logger) => {
  const $ = getCheerio().load(config.html || '');

  logger.info('Extracting meta information');

  const meta = {
    title: $('title').text().trim(),
    description: $('meta[name="description"]').attr('content') || '',
    keywords: $('meta[name="keywords"]').attr('content') || '',
    author: $('meta[name="author"]').attr('content') || '',
    ogTitle: $('meta[property="og:title"]').attr('content') || '',
    ogDescription: $('meta[property="og:description"]').attr('content') || '',
    ogImage: $('meta[property="og:image"]').attr('content') || '',
    twitterTitle: $('meta[name="twitter:title"]').attr('content') || '',
    twitterDescription: $('meta[name="twitter:description"]').attr('content') || '',
    twitterImage: $('meta[name="twitter:image"]').attr('content') || '',
    canonical: $('link[rel="canonical"]').attr('href') || '',
    favicon: $('link[rel="icon"], link[rel="shortcut icon"]').attr('href') || '',
  };

  // Extract all custom meta tags if requested
  if (config.all) {
    meta.all = {};
    $('meta').each((i, el) => {
      const name = $(el).attr('name') || $(el).attr('property');
      const content = $(el).attr('content');
      if (name && content) {
        meta.all[name] = content;
      }
    });
  }

  return meta;
});

// ===== scraper.json - Extract JSON-LD structured data =====
plugin.action('scraper.jsonld', async (config, context, logger) => {
  const $ = getCheerio().load(config.html || '');

  logger.info('Extracting JSON-LD data');

  const jsonldScripts = [];
  $('script[type="application/ld+json"]').each((i, el) => {
    try {
      const json = JSON.parse($(el).html());
      jsonldScripts.push(json);
    } catch (e) {
      logger.warn(`Failed to parse JSON-LD script ${i}: ${e.message}`);
    }
  });

  return {
    count: jsonldScripts.length,
    data: jsonldScripts,
  };
});

// Start the plugin
plugin.start().then(port => {
  console.log(`Web Scraper plugin started on port ${port}`);
}).catch(err => {
  console.error('Failed to start Web Scraper plugin:', err);
  process.exit(1);
});
