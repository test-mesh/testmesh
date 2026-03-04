// Additional protocol types for WebSocket and gRPC

// WebSocket types
export type WebSocketAction = 'connect' | 'send' | 'receive' | 'close';
export type WebSocketMessageType = 'text' | 'binary';

export interface WebSocketConfig {
  url: string;
  headers?: Record<string, string>;
  action: WebSocketAction;
  message?: any;
  message_type?: WebSocketMessageType;
  timeout?: string;
  expected?: any;
  connection_id?: string;
}

export interface WebSocketResult {
  connected: boolean;
  received_message?: any;
  message_type?: number;
  error?: string;
  latency_ms: number;
  metadata?: Record<string, any>;
}

// gRPC types
export interface GRPCConfig {
  address: string;
  service: string;
  method: string;
  request?: Record<string, any>;
  metadata?: Record<string, string>;
  proto_file?: string;
  timeout?: string;
  use_tls?: boolean;
  use_reflection?: boolean;
}

export interface GRPCResult {
  response?: Record<string, any>;
  status_code: string;
  error_message?: string;
  latency_ms: number;
  metadata?: Record<string, any>;
}

// gRPC status codes
export const GRPC_STATUS_CODES = {
  OK: 'OK',
  CANCELLED: 'CANCELLED',
  UNKNOWN: 'UNKNOWN',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  DEADLINE_EXCEEDED: 'DEADLINE_EXCEEDED',
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  RESOURCE_EXHAUSTED: 'RESOURCE_EXHAUSTED',
  FAILED_PRECONDITION: 'FAILED_PRECONDITION',
  ABORTED: 'ABORTED',
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  UNIMPLEMENTED: 'UNIMPLEMENTED',
  INTERNAL: 'INTERNAL',
  UNAVAILABLE: 'UNAVAILABLE',
  DATA_LOSS: 'DATA_LOSS',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
} as const;

export type GRPCStatusCode = keyof typeof GRPC_STATUS_CODES;

// Helper to create WebSocket step configs
export function createWebSocketConnect(url: string, options?: {
  headers?: Record<string, string>;
  timeout?: string;
  connectionId?: string;
}): WebSocketConfig {
  return {
    url,
    action: 'connect',
    headers: options?.headers,
    timeout: options?.timeout,
    connection_id: options?.connectionId,
  };
}

export function createWebSocketSend(connectionId: string, message: any, options?: {
  messageType?: WebSocketMessageType;
}): WebSocketConfig {
  return {
    url: '', // Not needed for send
    action: 'send',
    connection_id: connectionId,
    message,
    message_type: options?.messageType ?? 'text',
  };
}

export function createWebSocketReceive(connectionId: string, options?: {
  timeout?: string;
  expected?: any;
}): WebSocketConfig {
  return {
    url: '', // Not needed for receive
    action: 'receive',
    connection_id: connectionId,
    timeout: options?.timeout,
    expected: options?.expected,
  };
}

export function createWebSocketClose(connectionId: string): WebSocketConfig {
  return {
    url: '', // Not needed for close
    action: 'close',
    connection_id: connectionId,
  };
}

// Helper to create gRPC step configs
export function createGRPCCall(
  address: string,
  service: string,
  method: string,
  request?: Record<string, any>,
  options?: {
    metadata?: Record<string, string>;
    timeout?: string;
    useTLS?: boolean;
  }
): GRPCConfig {
  return {
    address,
    service,
    method,
    request,
    metadata: options?.metadata,
    timeout: options?.timeout,
    use_tls: options?.useTLS,
  };
}

// Extended action types including new protocols
export type ActionType =
  | 'http'
  | 'database'
  | 'log'
  | 'delay'
  | 'transform'
  | 'assert'
  | 'condition'
  | 'for_each'
  | 'mock_server_start'
  | 'mock_server_stop'
  | 'mock_server_verify'
  | 'contract_import'
  | 'contract_verify'
  | 'websocket'
  | 'grpc';
