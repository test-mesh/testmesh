// Request Builder Types

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export type AuthType = 'none' | 'basic' | 'bearer' | 'api_key' | 'oauth2';

export type BodyType = 'none' | 'json' | 'form_data' | 'form_urlencoded' | 'raw' | 'binary';

// Key-value pair for params, headers, form data
export interface KeyValuePair {
  id: string;
  key: string;
  value: string;
  description?: string;
  enabled: boolean;
}

// Basic auth configuration
export interface BasicAuth {
  username: string;
  password: string;
}

// Bearer token configuration
export interface BearerAuth {
  token: string;
  prefix?: string; // Default: "Bearer"
}

// API Key configuration
export interface ApiKeyAuth {
  key: string;
  value: string;
  in: 'header' | 'query';
}

// OAuth2 configuration
export interface OAuth2Auth {
  grant_type: 'authorization_code' | 'client_credentials' | 'password' | 'implicit';
  client_id: string;
  client_secret?: string;
  auth_url?: string;
  token_url?: string;
  redirect_uri?: string;
  scope?: string;
  state?: string;
  access_token?: string;
  refresh_token?: string;
  token_expiry?: string;
}

// Auth configuration union
export interface AuthConfig {
  type: AuthType;
  basic?: BasicAuth;
  bearer?: BearerAuth;
  api_key?: ApiKeyAuth;
  oauth2?: OAuth2Auth;
}

// Request body configuration
export interface BodyConfig {
  type: BodyType;
  json?: string;
  raw?: string;
  form_data?: KeyValuePair[];
  form_urlencoded?: KeyValuePair[];
  binary?: {
    file_name?: string;
    file_path?: string;
  };
  content_type?: string;
}

// Complete HTTP Request configuration
export interface HttpRequest {
  method: HttpMethod;
  url: string;
  query_params: KeyValuePair[];
  headers: KeyValuePair[];
  auth: AuthConfig;
  body: BodyConfig;
  timeout?: string;
  follow_redirects?: boolean;
}

// HTTP Response
export interface HttpResponse {
  status: number;
  status_text: string;
  headers: Record<string, string>;
  body: any;
  body_text: string;
  size_bytes: number;
  time_ms: number;
  cookies?: Record<string, string>;
}

// Test request result
export interface TestResult {
  request: HttpRequest;
  response?: HttpResponse;
  error?: string;
  timestamp: string;
}

// Default empty request
export const DEFAULT_REQUEST: HttpRequest = {
  method: 'GET',
  url: '',
  query_params: [],
  headers: [],
  auth: { type: 'none' },
  body: { type: 'none' },
  follow_redirects: true,
};

// Generate unique ID for key-value pairs
export function generatePairId(): string {
  return `pair_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Create empty key-value pair
export function createEmptyPair(): KeyValuePair {
  return {
    id: generatePairId(),
    key: '',
    value: '',
    enabled: true,
  };
}

// Convert request to flow step config
export function requestToStepConfig(request: HttpRequest): Record<string, any> {
  const config: Record<string, any> = {
    method: request.method,
    url: request.url,
  };

  // Add headers
  const headers: Record<string, string> = {};
  request.headers
    .filter((h) => h.enabled && h.key)
    .forEach((h) => {
      headers[h.key] = h.value;
    });

  // Add auth headers
  if (request.auth.type === 'basic' && request.auth.basic) {
    const credentials = btoa(`${request.auth.basic.username}:${request.auth.basic.password}`);
    headers['Authorization'] = `Basic ${credentials}`;
  } else if (request.auth.type === 'bearer' && request.auth.bearer) {
    const prefix = request.auth.bearer.prefix || 'Bearer';
    headers['Authorization'] = `${prefix} ${request.auth.bearer.token}`;
  } else if (request.auth.type === 'api_key' && request.auth.api_key) {
    if (request.auth.api_key.in === 'header') {
      headers[request.auth.api_key.key] = request.auth.api_key.value;
    }
  }

  if (Object.keys(headers).length > 0) {
    config.headers = headers;
  }

  // Add query params to URL
  const enabledParams = request.query_params.filter((p) => p.enabled && p.key);
  if (enabledParams.length > 0) {
    const urlObj = new URL(request.url || 'http://placeholder');
    enabledParams.forEach((p) => urlObj.searchParams.append(p.key, p.value));
    config.url = urlObj.pathname + urlObj.search;
  }

  // Add API key to query if needed
  if (request.auth.type === 'api_key' && request.auth.api_key?.in === 'query') {
    const urlObj = new URL(config.url || 'http://placeholder');
    urlObj.searchParams.append(request.auth.api_key.key, request.auth.api_key.value);
    config.url = urlObj.pathname + urlObj.search;
  }

  // Add body
  if (request.body.type !== 'none') {
    if (request.body.type === 'json' && request.body.json) {
      try {
        config.body = JSON.parse(request.body.json);
        headers['Content-Type'] = 'application/json';
      } catch {
        config.body = request.body.json;
      }
    } else if (request.body.type === 'raw' && request.body.raw) {
      config.body = request.body.raw;
      if (request.body.content_type) {
        headers['Content-Type'] = request.body.content_type;
      }
    } else if (request.body.type === 'form_data' && request.body.form_data) {
      const formData: Record<string, string> = {};
      request.body.form_data
        .filter((f) => f.enabled && f.key)
        .forEach((f) => {
          formData[f.key] = f.value;
        });
      config.body = formData;
      headers['Content-Type'] = 'multipart/form-data';
    } else if (request.body.type === 'form_urlencoded' && request.body.form_urlencoded) {
      const formData: Record<string, string> = {};
      request.body.form_urlencoded
        .filter((f) => f.enabled && f.key)
        .forEach((f) => {
          formData[f.key] = f.value;
        });
      config.body = formData;
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
  }

  // Update headers if modified
  if (Object.keys(headers).length > 0) {
    config.headers = headers;
  }

  // Add timeout
  if (request.timeout) {
    config.timeout = request.timeout;
  }

  // Add follow redirects
  if (request.follow_redirects !== undefined) {
    config.follow_redirects = request.follow_redirects;
  }

  return config;
}

// Convert flow step config to request
export function stepConfigToRequest(config: Record<string, any>): HttpRequest {
  const request: HttpRequest = { ...DEFAULT_REQUEST };

  request.method = (config.method || 'GET').toUpperCase() as HttpMethod;
  request.url = config.url || '';

  // Parse headers
  if (config.headers) {
    request.headers = Object.entries(config.headers).map(([key, value]) => ({
      id: generatePairId(),
      key,
      value: String(value),
      enabled: true,
    }));

    // Detect auth from headers
    const authHeader = request.headers.find((h) => h.key.toLowerCase() === 'authorization');
    if (authHeader) {
      if (authHeader.value.toLowerCase().startsWith('basic ')) {
        request.auth.type = 'basic';
        // We can't decode basic auth easily, leave it in headers
      } else if (authHeader.value.toLowerCase().startsWith('bearer ')) {
        request.auth = {
          type: 'bearer',
          bearer: {
            token: authHeader.value.replace(/^bearer\s+/i, ''),
          },
        };
        request.headers = request.headers.filter((h) => h.key.toLowerCase() !== 'authorization');
      }
    }
  }

  // Parse body
  if (config.body !== undefined && config.body !== null) {
    if (typeof config.body === 'object') {
      request.body = {
        type: 'json',
        json: JSON.stringify(config.body, null, 2),
      };
    } else {
      request.body = {
        type: 'raw',
        raw: String(config.body),
      };
    }
  }

  // Parse timeout
  if (config.timeout) {
    request.timeout = config.timeout;
  }

  // Parse follow redirects
  if (config.follow_redirects !== undefined) {
    request.follow_redirects = config.follow_redirects;
  }

  return request;
}

// Generate cURL command from request
export function requestToCurl(request: HttpRequest): string {
  const parts: string[] = ['curl'];

  // Method
  if (request.method !== 'GET') {
    parts.push(`-X ${request.method}`);
  }

  // URL with query params
  let url = request.url;
  const enabledParams = request.query_params.filter((p) => p.enabled && p.key);
  if (enabledParams.length > 0) {
    const separator = url.includes('?') ? '&' : '?';
    const params = enabledParams.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
    url = `${url}${separator}${params}`;
  }
  parts.push(`'${url}'`);

  // Headers
  request.headers
    .filter((h) => h.enabled && h.key)
    .forEach((h) => {
      parts.push(`-H '${h.key}: ${h.value}'`);
    });

  // Auth
  if (request.auth.type === 'basic' && request.auth.basic) {
    parts.push(`-u '${request.auth.basic.username}:${request.auth.basic.password}'`);
  } else if (request.auth.type === 'bearer' && request.auth.bearer) {
    const prefix = request.auth.bearer.prefix || 'Bearer';
    parts.push(`-H 'Authorization: ${prefix} ${request.auth.bearer.token}'`);
  } else if (request.auth.type === 'api_key' && request.auth.api_key) {
    if (request.auth.api_key.in === 'header') {
      parts.push(`-H '${request.auth.api_key.key}: ${request.auth.api_key.value}'`);
    }
  }

  // Body
  if (request.body.type === 'json' && request.body.json) {
    parts.push(`-H 'Content-Type: application/json'`);
    parts.push(`-d '${request.body.json.replace(/'/g, "'\\''")}'`);
  } else if (request.body.type === 'raw' && request.body.raw) {
    if (request.body.content_type) {
      parts.push(`-H 'Content-Type: ${request.body.content_type}'`);
    }
    parts.push(`-d '${request.body.raw.replace(/'/g, "'\\''")}'`);
  } else if (request.body.type === 'form_urlencoded' && request.body.form_urlencoded) {
    parts.push(`-H 'Content-Type: application/x-www-form-urlencoded'`);
    const formData = request.body.form_urlencoded
      .filter((f) => f.enabled && f.key)
      .map((f) => `${encodeURIComponent(f.key)}=${encodeURIComponent(f.value)}`)
      .join('&');
    parts.push(`-d '${formData}'`);
  }

  // Follow redirects
  if (request.follow_redirects) {
    parts.push('-L');
  }

  return parts.join(' \\\n  ');
}
