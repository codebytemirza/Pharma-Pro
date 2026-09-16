import { useEffect, useRef, useState, useCallback } from 'react';

export interface WsMessage {
  type: string;
  payload?: any;
  timestamp: string;
}

export function useWsSync(onEvent?: (msg: WsMessage) => void) {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [terminalCount, setTerminalCount] = useState<number>(1);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/ws`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data: WsMessage = JSON.parse(event.data);
          if (data.type === 'CLIENTS_COUNT') {
            setTerminalCount(data.payload?.count || 1);
          } else if (data.type === 'CONNECTED') {
            setTerminalCount(data.payload?.connectedClients || 1);
          }
          if (onEventRef.current) {
            onEventRef.current(data);
          }
        } catch {
          // ignore parsing error
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        // Attempt reconnection after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.onerror = () => {
        setIsConnected(false);
      };

      wsRef.current = ws;
    } catch (err) {
      console.warn('WebSocket connection error:', err);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { isConnected, terminalCount };
}
