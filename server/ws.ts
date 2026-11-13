import type { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { getUserFromToken } from './auth.ts';

export interface PosWsEvent {
  type:
    | 'connected'
    | 'device:presence'
    | 'order:created'
    | 'order:updated'
    | 'inventory:updated'
    | 'table:updated'
    | 'menu:updated'
    | 'settings:updated'
    | 'demo:reset';
  payload: unknown;
  timestamp: string;
}

interface ClientMeta {
  ws: WebSocket;
  deviceId: string;
  userName: string;
  role: string;
  connectedAt: string;
  ip: string;
}

const clients = new Map<WebSocket, ClientMeta>();
let wss: WebSocketServer | null = null;

export function getConnectedDevices() {
  return Array.from(clients.values()).map((c) => ({
    deviceId: c.deviceId,
    userName: c.userName,
    role: c.role,
    connectedAt: c.connectedAt,
    ip: c.ip,
  }));
}

export function broadcastEvent(type: PosWsEvent['type'], payload: unknown) {
  if (!wss) return;
  const message = JSON.stringify({
    type,
    payload,
    timestamp: new Date().toISOString(),
  } satisfies PosWsEvent);

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

export function initWebSocketServer(httpServer: HttpServer) {
  wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname !== '/ws') {
      return;
    }
    wss!.handleUpgrade(req, socket, head, (ws) => {
      wss!.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/ws', 'http://localhost');
    const token = url.searchParams.get('token') || '';
    const deviceId = url.searchParams.get('deviceId') || `terminal-${Math.floor(Math.random() * 900 + 100)}`;

    // Also parse cookie if token not in query
    let cookieToken = token;
    if (!cookieToken && req.headers.cookie) {
      const match = req.headers.cookie.match(/baslune_session=([^;]+)/);
      if (match) cookieToken = decodeURIComponent(match[1]);
    }

    const user = cookieToken ? getUserFromToken(cookieToken) : null;
    if (!user) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const ip = (req.socket.remoteAddress || '').replace('::ffff:', '') || '127.0.0.1';
    const meta: ClientMeta = {
      ws,
      deviceId,
      userName: user.name,
      role: user.role,
      connectedAt: new Date().toISOString(),
      ip,
    };
    clients.set(ws, meta);

    ws.send(
      JSON.stringify({
        type: 'connected',
        payload: {
          deviceId,
          connectedDevices: getConnectedDevices(),
        },
        timestamp: new Date().toISOString(),
      } satisfies PosWsEvent)
    );

    broadcastEvent('device:presence', { connectedDevices: getConnectedDevices() });

    ws.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString()) as { type?: string };
        if (parsed.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        }
      } catch {
        // ignore malformed client messages
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      broadcastEvent('device:presence', { connectedDevices: getConnectedDevices() });
    });
  });

  console.log('[WS] Local multi-device WebSocket hub attached on /ws');
  return wss;
}
