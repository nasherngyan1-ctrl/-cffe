export interface WsIncomingMessage {
  type: string;
  payload?: Record<string, unknown>;
  timestamp?: string;
}

export function getOrCreateDeviceId(): string {
  const key = 'baslune_device_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = `POS-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    localStorage.setItem(key, id);
  }
  return id;
}

export class PosWebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private listeners = new Set<(msg: WsIncomingMessage) => void>();
  private statusListeners = new Set<(connected: boolean) => void>();
  private stopped = false;

  connect(token: string) {
    this.stopped = false;
    this.openSocket(token);
  }

  disconnect() {
    this.stopped = true;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) window.clearInterval(this.heartbeatTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.notifyStatus(false);
  }

  onMessage(cb: (msg: WsIncomingMessage) => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  onStatus(cb: (connected: boolean) => void) {
    this.statusListeners.add(cb);
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  private notifyStatus(connected: boolean) {
    for (const cb of this.statusListeners) cb(connected);
  }

  private openSocket(token: string) {
    if (this.stopped) return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const deviceId = encodeURIComponent(getOrCreateDeviceId());
    const url = `${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}&deviceId=${deviceId}`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect(token);
      return;
    }

    this.ws.onopen = () => {
      this.notifyStatus(true);
      if (this.heartbeatTimer) window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = window.setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25000);
    };

    this.ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as WsIncomingMessage;
        for (const cb of this.listeners) cb(parsed);
      } catch {
        // ignore malformed packets
      }
    };

    this.ws.onclose = () => {
      this.notifyStatus(false);
      if (this.heartbeatTimer) window.clearInterval(this.heartbeatTimer);
      if (!this.stopped) this.scheduleReconnect(token);
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private scheduleReconnect(token: string) {
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(() => {
      this.openSocket(token);
    }, 3500);
  }
}

export const posWsClient = new PosWebSocketClient();
