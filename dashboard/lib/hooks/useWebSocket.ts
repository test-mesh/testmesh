import { useEffect, useRef, useState } from 'react';

export type WebSocketEventType =
  | 'execution.started'
  | 'execution.completed'
  | 'execution.failed'
  | 'step.started'
  | 'step.completed'
  | 'step.failed';

export interface WebSocketEvent {
  type: WebSocketEventType;
  execution_id: string;
  data: Record<string, any>;
}

interface UseWebSocketOptions {
  executionId: string;
  onMessage?: (event: WebSocketEvent) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  autoConnect?: boolean;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  lastMessage: WebSocketEvent | null;
  connect: () => void;
  disconnect: () => void;
}

export function useWebSocket({
  executionId,
  onMessage,
  onOpen,
  onClose,
  onError,
  autoConnect = true,
}: UseWebSocketOptions): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const connect = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // Determine WebSocket URL based on current location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = process.env.NEXT_PUBLIC_API_URL?.replace(/^https?:\/\//, '') || 'localhost:5016';
    const wsUrl = `${protocol}//${host}/ws/executions/${executionId}`;

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected:', executionId);
        setIsConnected(true);
        onOpen?.();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketEvent;
          setLastMessage(data);
          onMessage?.(data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', executionId, event.code);
        setIsConnected(false);
        wsRef.current = null;
        onClose?.();

        // Auto-reconnect after 3 seconds if not manually disconnected
        // Only reconnect on abnormal closure (not 1000 or 1001)
        if (autoConnect && event.code !== 1000 && event.code !== 1001) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 3000);
        }
      };

      ws.onerror = (error) => {
        // Only log in development - connection errors are expected if server is down
        if (process.env.NODE_ENV === 'development') {
          console.warn('WebSocket connection error - is the API server running?');
        }
        onError?.(error);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
    }
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [executionId, autoConnect]);

  return {
    isConnected,
    lastMessage,
    connect,
    disconnect,
  };
}
