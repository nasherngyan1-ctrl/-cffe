import {
  enqueuePendingOrder,
  getPendingOrders,
  removePendingOrder,
  updatePendingOrderError,
} from './offlineDb';
import { getOrCreateDeviceId } from './wsClient';
import type { Order } from '../types/pos';

const TOKEN_STORAGE_KEY = 'baslune_auth_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // ignore json parse error
    }
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  return res.json() as Promise<T>;
}

export async function submitOrderWithOfflineSupport(
  payload: Record<string, unknown>,
  displaySummary: {
    total_amount: number;
    item_count: number;
    payment_method: string;
    order_type: string;
  }
): Promise<{ queued: boolean; order?: Order; client_tx_id: string }> {
  const clientTxId =
    (typeof payload.client_tx_id === 'string' && payload.client_tx_id) ||
    (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  const enrichedPayload = {
    ...payload,
    client_tx_id: clientTxId,
    device_id: getOrCreateDeviceId(),
  };

  try {
    const res = await apiRequest<{ order: Order; deduplicated?: boolean }>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(enrichedPayload),
    });
    return { queued: false, order: res.order, client_tx_id: clientTxId };
  } catch (err) {
    const status = (err as { status?: number }).status;
    // Queue locally ONLY on network/server unavailability (not validation/auth 4xx errors)
    if (!status || status >= 500) {
      await enqueuePendingOrder({
        client_tx_id: clientTxId,
        payload: enrichedPayload,
        displaySummary,
        created_at: new Date().toISOString(),
        retry_count: 0,
      });
      return { queued: true, client_tx_id: clientTxId };
    }
    throw err;
  }
}

export async function syncPendingOfflineOrders(): Promise<{
  synced: number;
  failed: number;
  remaining: number;
}> {
  const pending = await getPendingOrders();
  let synced = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      await apiRequest('/api/orders', {
        method: 'POST',
        body: JSON.stringify(item.payload),
      });
      await removePendingOrder(item.client_tx_id);
      synced += 1;
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status && status >= 400 && status < 500) {
        await updatePendingOrderError(item.client_tx_id, (err as Error).message);
      }
      failed += 1;
    }
  }

  const remaining = (await getPendingOrders()).length;
  return { synced, failed, remaining };
}
