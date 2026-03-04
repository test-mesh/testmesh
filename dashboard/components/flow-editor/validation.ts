// Flow validation and linting utilities

import type { FlowDefinition } from '@/lib/api/types';
import type { FlowNodeData, ActionType } from './types';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  id: string;
  severity: ValidationSeverity;
  message: string;
  field?: string;
  suggestion?: string;
  nodeId?: string;
  stepId?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

// URL validation regex
const URL_PATTERN = /^https?:\/\/.+/i;
const VARIABLE_PATTERN = /\$\{[^}]+\}/g;

// Validate URL (allows variables)
function isValidUrl(url: string): boolean {
  if (!url) return false;

  // Allow variables in URL
  const withoutVars = url.replace(VARIABLE_PATTERN, 'VAR');

  // Check if it's a valid URL or starts with a variable
  return URL_PATTERN.test(withoutVars) || url.startsWith('${') || url.startsWith('http');
}

// Validate duration format (e.g., "1s", "500ms", "2m")
function isValidDuration(duration: string): boolean {
  if (!duration) return false;
  return /^\d+(\.\d+)?(ms|s|m|h)$/.test(duration);
}

// Validate JSONPath expression
function isValidJsonPath(path: string): boolean {
  if (!path) return false;
  // Basic JSONPath validation
  return path.startsWith('$.') || path.startsWith('$[') || path === '$';
}

// Validate JavaScript expression (basic check)
function looksLikeValidExpression(expr: string): boolean {
  if (!expr) return false;

  // Check for common syntax errors
  const openBraces = (expr.match(/\{/g) || []).length;
  const closeBraces = (expr.match(/\}/g) || []).length;
  const openParens = (expr.match(/\(/g) || []).length;
  const closeParens = (expr.match(/\)/g) || []).length;
  const openBrackets = (expr.match(/\[/g) || []).length;
  const closeBrackets = (expr.match(/\]/g) || []).length;

  return openBraces === closeBraces &&
         openParens === closeParens &&
         openBrackets === closeBrackets;
}

// Validate a single node
export function validateNode(data: FlowNodeData, nodeId: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { action, config, stepId } = data;

  // Common validations
  if (!stepId || stepId.trim() === '') {
    issues.push({
      id: `${nodeId}-no-step-id`,
      severity: 'error',
      message: 'Step ID is required',
      field: 'stepId',
      nodeId,
      stepId,
    });
  } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(stepId)) {
    issues.push({
      id: `${nodeId}-invalid-step-id`,
      severity: 'error',
      message: 'Step ID must start with a letter or underscore and contain only letters, numbers, and underscores',
      field: 'stepId',
      suggestion: 'Use snake_case like: my_step_name',
      nodeId,
      stepId,
    });
  }

  // Action-specific validations
  switch (action) {
    case 'http_request':
      validateHttpRequest(config, nodeId, stepId, issues);
      break;
    case 'database_query':
      validateDatabaseQuery(config, nodeId, stepId, issues);
      break;
    case 'grpc_call':
    case 'grpc_stream':
      validateGrpcCall(config, nodeId, stepId, issues);
      break;
    case 'websocket':
      validateWebSocket(config, nodeId, stepId, issues);
      break;
    case 'kafka_producer':
    case 'kafka_consumer':
      validateKafka(config, nodeId, stepId, issues, action);
      break;
    case 'delay':
      validateDelay(config, nodeId, stepId, issues);
      break;
    case 'assert':
      validateAssert(config, nodeId, stepId, issues);
      break;
    case 'transform':
      validateTransform(config, nodeId, stepId, issues);
      break;
    case 'condition':
      validateCondition(config, nodeId, stepId, issues);
      break;
    case 'for_each':
      validateForEach(config, nodeId, stepId, issues);
      break;
    case 'wait_for':
      validateWaitFor(config, nodeId, stepId, issues);
      break;
    case 'wait_until':
      validateWaitUntil(config, nodeId, stepId, issues);
      break;
    case 'db_poll':
      validateDBPoll(config, nodeId, stepId, issues);
      break;
    case 'mock_server_start':
      validateMockServerStart(config, nodeId, stepId, issues);
      break;
    case 'run_flow':
      validateRunFlow(config, nodeId, stepId, issues);
      break;
  }

  // Validate timeout if present
  if (data.timeout && !isValidDuration(data.timeout)) {
    issues.push({
      id: `${nodeId}-invalid-timeout`,
      severity: 'error',
      message: 'Invalid timeout format',
      field: 'timeout',
      suggestion: 'Use format like: 30s, 5m, 1h',
      nodeId,
      stepId,
    });
  }

  // Validate retry configuration
  if (data.retry) {
    if (data.retry.max_attempts < 1) {
      issues.push({
        id: `${nodeId}-invalid-retry-attempts`,
        severity: 'error',
        message: 'Max retry attempts must be at least 1',
        field: 'retry.max_attempts',
        nodeId,
        stepId,
      });
    }
    if (data.retry.delay && !isValidDuration(data.retry.delay)) {
      issues.push({
        id: `${nodeId}-invalid-retry-delay`,
        severity: 'error',
        message: 'Invalid retry delay format',
        field: 'retry.delay',
        suggestion: 'Use format like: 1s, 500ms, 2m',
        nodeId,
        stepId,
      });
    }
  }

  return issues;
}

function validateHttpRequest(config: any, nodeId: string, stepId: string, issues: ValidationIssue[]): void {
  if (!config.url || config.url.trim() === '') {
    issues.push({
      id: `${nodeId}-no-url`,
      severity: 'error',
      message: 'URL is required for HTTP request',
      field: 'url',
      nodeId,
      stepId,
    });
  } else if (!isValidUrl(config.url)) {
    issues.push({
      id: `${nodeId}-invalid-url`,
      severity: 'warning',
      message: 'URL should start with http:// or https://',
      field: 'url',
      suggestion: 'Add protocol: https://example.com/api',
      nodeId,
      stepId,
    });
  }

  if (!config.method) {
    issues.push({
      id: `${nodeId}-no-method`,
      severity: 'error',
      message: 'HTTP method is required',
      field: 'method',
      nodeId,
      stepId,
    });
  }

  // Warn about body on GET/HEAD requests
  if ((config.method === 'GET' || config.method === 'HEAD') && config.body) {
    issues.push({
      id: `${nodeId}-body-on-get`,
      severity: 'warning',
      message: `${config.method} requests typically don't have a body`,
      field: 'body',
      nodeId,
      stepId,
    });
  }
}

function validateDatabaseQuery(config: any, nodeId: string, stepId: string, issues: ValidationIssue[]): void {
  if (!config.query || config.query.trim() === '') {
    issues.push({
      id: `${nodeId}-no-query`,
      severity: 'error',
      message: 'SQL query is required',
      field: 'query',
      nodeId,
      stepId,
    });
  }

  if (!config.connection) {
    issues.push({
      id: `${nodeId}-no-connection`,
      severity: 'warning',
      message: 'Database connection not specified',
      field: 'connection',
      suggestion: 'Specify connection string or use environment variable',
      nodeId,
      stepId,
    });
  }
}

function validateGrpcCall(config: any, nodeId: string, stepId: string, issues: ValidationIssue[]): void {
  if (!config.host || config.host.trim() === '') {
    issues.push({
      id: `${nodeId}-no-host`,
      severity: 'error',
      message: 'gRPC host is required',
      field: 'host',
      nodeId,
      stepId,
    });
  }

  if (!config.service || config.service.trim() === '') {
    issues.push({
      id: `${nodeId}-no-service`,
      severity: 'error',
      message: 'gRPC service name is required',
      field: 'service',
      nodeId,
      stepId,
    });
  }

  if (!config.method || config.method.trim() === '') {
    issues.push({
      id: `${nodeId}-no-method`,
      severity: 'error',
      message: 'gRPC method name is required',
      field: 'method',
      nodeId,
      stepId,
    });
  }
}

function validateWebSocket(config: any, nodeId: string, stepId: string, issues: ValidationIssue[]): void {
  if (!config.url || config.url.trim() === '') {
    issues.push({
      id: `${nodeId}-no-url`,
      severity: 'error',
      message: 'WebSocket URL is required',
      field: 'url',
      nodeId,
      stepId,
    });
  } else if (!config.url.startsWith('ws://') && !config.url.startsWith('wss://') && !config.url.includes('${')) {
    issues.push({
      id: `${nodeId}-invalid-ws-url`,
      severity: 'warning',
      message: 'WebSocket URL should start with ws:// or wss://',
      field: 'url',
      nodeId,
      stepId,
    });
  }
}

function validateKafka(config: any, nodeId: string, stepId: string, issues: ValidationIssue[], action: string): void {
  if (!config.brokers || config.brokers.length === 0) {
    issues.push({
      id: `${nodeId}-no-brokers`,
      severity: 'error',
      message: 'At least one Kafka broker is required',
      field: 'brokers',
      nodeId,
      stepId,
    });
  }

  if (!config.topic || config.topic.trim() === '') {
    issues.push({
      id: `${nodeId}-no-topic`,
      severity: 'error',
      message: 'Kafka topic is required',
      field: 'topic',
      nodeId,
      stepId,
    });
  }

  if (action === 'kafka_consumer' && !config.group_id) {
    issues.push({
      id: `${nodeId}-no-group-id`,
      severity: 'warning',
      message: 'Consumer group ID is recommended',
      field: 'group_id',
      suggestion: 'Add a consumer group ID for better consumer management',
      nodeId,
      stepId,
    });
  }
}

function validateDelay(config: any, nodeId: string, stepId: string, issues: ValidationIssue[]): void {
  if (!config.duration) {
    issues.push({
      id: `${nodeId}-no-duration`,
      severity: 'error',
      message: 'Delay duration is required',
      field: 'duration',
      nodeId,
      stepId,
    });
  } else if (!isValidDuration(config.duration)) {
    issues.push({
      id: `${nodeId}-invalid-duration`,
      severity: 'error',
      message: 'Invalid duration format',
      field: 'duration',
      suggestion: 'Use format like: 1s, 500ms, 2m',
      nodeId,
      stepId,
    });
  }
}

function parseAssertions(raw: any): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); if (Array.isArray(p)) return p; } catch {}
  }
  return [];
}

function validateAssert(config: any, nodeId: string, stepId: string, issues: ValidationIssue[]): void {
  const assertions = parseAssertions(config.assertions);
  if (assertions.length === 0) {
    issues.push({
      id: `${nodeId}-no-assertions`,
      severity: 'error',
      message: 'At least one assertion is required',
      field: 'assertions',
      nodeId,
      stepId,
    });
  } else {
    assertions.forEach((expr, i) => {
      if (typeof expr === 'string' && expr.trim() !== '' && !looksLikeValidExpression(expr)) {
        issues.push({
          id: `${nodeId}-malformed-assertion-${i}`,
          severity: 'warning',
          message: `Assertion ${i + 1} might have unmatched brackets or braces`,
          field: 'assertions',
          nodeId,
          stepId,
        });
      }
    });
  }
}

function validateTransform(config: any, nodeId: string, stepId: string, issues: ValidationIssue[]): void {
  if (!config.output_var || config.output_var.trim() === '') {
    issues.push({
      id: `${nodeId}-no-output-var`,
      severity: 'error',
      message: 'Output variable name is required',
      field: 'output_var',
      nodeId,
      stepId,
    });
  }
}

function validateCondition(config: any, nodeId: string, stepId: string, issues: ValidationIssue[]): void {
  if (!config.expression || config.expression.trim() === '') {
    issues.push({
      id: `${nodeId}-no-expression`,
      severity: 'error',
      message: 'Condition expression is required',
      field: 'expression',
      nodeId,
      stepId,
    });
  } else if (!looksLikeValidExpression(config.expression)) {
    issues.push({
      id: `${nodeId}-malformed-expression`,
      severity: 'warning',
      message: 'Expression might have unmatched brackets or braces',
      field: 'expression',
      nodeId,
      stepId,
    });
  }
}

function validateForEach(config: any, nodeId: string, stepId: string, issues: ValidationIssue[]): void {
  if (!config.items) {
    issues.push({
      id: `${nodeId}-no-items`,
      severity: 'error',
      message: 'Items array or expression is required',
      field: 'items',
      nodeId,
      stepId,
    });
  }

  if (!config.item_var || config.item_var.trim() === '') {
    issues.push({
      id: `${nodeId}-no-item-var`,
      severity: 'warning',
      message: 'Item variable name is recommended',
      field: 'item_var',
      suggestion: 'Specify a variable name like: item, user, product',
      nodeId,
      stepId,
    });
  }
}

function validateWaitUntil(config: any, nodeId: string, stepId: string, issues: ValidationIssue[]): void {
  if (!config.condition || config.condition.trim() === '') {
    issues.push({
      id: `${nodeId}-no-condition`,
      severity: 'error',
      message: 'Wait condition is required',
      field: 'condition',
      nodeId,
      stepId,
    });
  }

  if (config.max_attempts && config.max_attempts < 1) {
    issues.push({
      id: `${nodeId}-invalid-max-attempts`,
      severity: 'error',
      message: 'Max attempts must be at least 1',
      field: 'max_attempts',
      nodeId,
      stepId,
    });
  }

  if (config.interval && !isValidDuration(config.interval)) {
    issues.push({
      id: `${nodeId}-invalid-interval`,
      severity: 'error',
      message: 'Invalid interval format',
      field: 'interval',
      suggestion: 'Use format like: 1s, 500ms, 2m',
      nodeId,
      stepId,
    });
  }
}

function validateWaitFor(config: any, nodeId: string, stepId: string, issues: ValidationIssue[]): void {
  const type = config.type || 'http';
  if (type === 'http' && (!config.url || config.url.trim() === '')) {
    issues.push({
      id: `${nodeId}-no-url`,
      severity: 'error',
      message: 'URL is required for HTTP wait',
      field: 'url',
      nodeId,
      stepId,
    });
  }
  if (type === 'tcp') {
    if (!config.host || config.host.trim() === '') {
      issues.push({
        id: `${nodeId}-no-host`,
        severity: 'error',
        message: 'Host is required for TCP wait',
        field: 'host',
        nodeId,
        stepId,
      });
    }
    if (!config.port) {
      issues.push({
        id: `${nodeId}-no-port`,
        severity: 'error',
        message: 'Port is required for TCP wait',
        field: 'port',
        nodeId,
        stepId,
      });
    }
  }
}

function validateDBPoll(config: any, nodeId: string, stepId: string, issues: ValidationIssue[]): void {
  if (!config.connection || config.connection.trim() === '') {
    issues.push({
      id: `${nodeId}-no-connection`,
      severity: 'error',
      message: 'Database connection string is required',
      field: 'connection',
      nodeId,
      stepId,
    });
  }
  if (!config.query || config.query.trim() === '') {
    issues.push({
      id: `${nodeId}-no-query`,
      severity: 'error',
      message: 'SQL query is required',
      field: 'query',
      nodeId,
      stepId,
    });
  }
}

function validateMockServerStart(config: any, nodeId: string, stepId: string, issues: ValidationIssue[]): void {
  if (!config.port) {
    issues.push({
      id: `${nodeId}-no-port`,
      severity: 'warning',
      message: 'Mock server port not specified, will use default',
      field: 'port',
      nodeId,
      stepId,
    });
  } else if (config.port < 1 || config.port > 65535) {
    issues.push({
      id: `${nodeId}-invalid-port`,
      severity: 'error',
      message: 'Port must be between 1 and 65535',
      field: 'port',
      nodeId,
      stepId,
    });
  }

  if (!config.endpoints || config.endpoints.length === 0) {
    issues.push({
      id: `${nodeId}-no-endpoints`,
      severity: 'info',
      message: 'No endpoints defined for mock server',
      field: 'endpoints',
      suggestion: 'Add at least one endpoint to handle requests',
      nodeId,
      stepId,
    });
  }
}

function validateRunFlow(config: any, nodeId: string, stepId: string, issues: ValidationIssue[]): void {
  if (!config.flow || config.flow.trim() === '') {
    issues.push({
      id: `${nodeId}-no-flow`,
      severity: 'error',
      message: 'Sub-flow name or ID is required',
      field: 'flow',
      nodeId,
      stepId,
    });
  }
}

// Validate entire flow definition
export function validateFlow(definition: FlowDefinition, nodes: any[]): ValidationResult {
  const issues: ValidationIssue[] = [];

  // Validate flow name
  if (!definition.name || definition.name.trim() === '') {
    issues.push({
      id: 'flow-no-name',
      severity: 'warning',
      message: 'Flow name is not specified',
      field: 'name',
      suggestion: 'Add a descriptive name for your flow',
    });
  }

  // Validate all nodes
  nodes.forEach((node) => {
    if (node.data && node.data.action) {
      const nodeIssues = validateNode(node.data, node.id);
      issues.push(...nodeIssues);
    }
  });

  // Check for duplicate step IDs
  const stepIds = new Set<string>();
  nodes.forEach((node) => {
    if (node.data && node.data.stepId) {
      const stepId = node.data.stepId;
      if (stepIds.has(stepId)) {
        issues.push({
          id: `duplicate-${stepId}`,
          severity: 'error',
          message: `Duplicate step ID: ${stepId}`,
          field: 'stepId',
          suggestion: 'Each step must have a unique ID',
          nodeId: node.id,
          stepId,
        });
      }
      stepIds.add(stepId);
    }
  });

  // Count issues by severity
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;

  return {
    valid: errorCount === 0,
    issues,
    errorCount,
    warningCount,
    infoCount,
  };
}
