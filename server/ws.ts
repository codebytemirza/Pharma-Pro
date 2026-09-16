import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';

export interface BroadcastMessage {
  type:
    | 'STOCK_UPDATED'
    | 'SALE_CREATED'
    | 'RETURN_PROCESSED'
    | 'LICENSE_CHANGED'
    | 'USER_UPDATED'
    | 'ROLE_UPDATED'
    | 'PURCHASE_UPDATED'
    | 'AUDIT_LOG'
    | 'PONG';
  payload?: any;
  timestamp: string;
}

export class WsSyncHub {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();

  public init(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/api/ws' });

    this.wss.on('connection', (ws: WebSocket, req) => {
      this.clients.add(ws);
      // Send initial welcome message
      ws.send(
        JSON.stringify({
          type: 'CONNECTED',
          payload: { connectedClients: this.clients.size },
          timestamp: new Date().toISOString(),
        })
      );

      ws.on('message', (message: string) => {
        try {
          const parsed = JSON.parse(message.toString());
          if (parsed.type === 'PING') {
            ws.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
          }
        } catch {
          // ignore malformed ping
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        this.broadcastClientCount();
      });

      ws.on('error', () => {
        this.clients.delete(ws);
      });

      this.broadcastClientCount();
    });
  }

  private broadcastClientCount() {
    const msg = JSON.stringify({
      type: 'CLIENTS_COUNT',
      payload: { count: this.clients.size },
      timestamp: new Date().toISOString(),
    });
    this.sendToAll(msg);
  }

  public broadcast(type: BroadcastMessage['type'], payload?: any) {
    const message: BroadcastMessage = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };
    this.sendToAll(JSON.stringify(message));
  }

  private sendToAll(data: string) {
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(data);
        } catch (err) {
          console.error('Error broadcasting to WS client:', err);
        }
      }
    }
  }

  public getConnectedCount(): number {
    return this.clients.size;
  }
}

export const wsHub = new WsSyncHub();
