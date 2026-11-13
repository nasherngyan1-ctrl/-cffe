import { openDB, type IDBPDatabase } from 'idb';
import type { Addon, CafeTable, Category, Product, ShopSettings } from '../types/pos';

const DB_NAME = 'baslune-pos-offline';
const DB_VERSION = 1;

export interface PendingOfflineOrder {
  client_tx_id: string;
  payload: Record<string, unknown>;
  displaySummary: {
    total_amount: number;
    item_count: number;
    payment_method: string;
    order_type: string;
  };
  created_at: string;
  retry_count: number;
  last_error?: string;
}

interface BasluneOfflineSchema {
  cache: {
    key: string;
    value: {
      key: string;
      data: unknown;
      updated_at: string;
    };
  };
  pending_orders: {
    key: string;
    value: PendingOfflineOrder;
  };
}

let dbPromise: Promise<IDBPDatabase<BasluneOfflineSchema>> | null = null;

function getOfflineDb() {
  if (!dbPromise) {
    dbPromise = openDB<BasluneOfflineSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('pending_orders')) {
          db.createObjectStore('pending_orders', { keyPath: 'client_tx_id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveCachedCatalog(data: {
  categories: Category[];
  products: Product[];
  addons: Addon[];
}) {
  const db = await getOfflineDb();
  await db.put('cache', {
    key: 'catalog',
    data,
    updated_at: new Date().toISOString(),
  });
}

export async function loadCachedCatalog(): Promise<{
  categories: Category[];
  products: Product[];
  addons: Addon[];
} | null> {
  const db = await getOfflineDb();
  const entry = await db.get('cache', 'catalog');
  return (entry?.data as { categories: Category[]; products: Product[]; addons: Addon[] }) || null;
}

export async function saveCachedTables(tables: CafeTable[]) {
  const db = await getOfflineDb();
  await db.put('cache', { key: 'tables', data: tables, updated_at: new Date().toISOString() });
}

export async function loadCachedTables(): Promise<CafeTable[] | null> {
  const db = await getOfflineDb();
  const entry = await db.get('cache', 'tables');
  return (entry?.data as CafeTable[]) || null;
}

export async function saveCachedSettings(settings: ShopSettings) {
  const db = await getOfflineDb();
  await db.put('cache', { key: 'settings', data: settings, updated_at: new Date().toISOString() });
}

export async function loadCachedSettings(): Promise<ShopSettings | null> {
  const db = await getOfflineDb();
  const entry = await db.get('cache', 'settings');
  return (entry?.data as ShopSettings) || null;
}

export async function enqueuePendingOrder(order: PendingOfflineOrder) {
  const db = await getOfflineDb();
  await db.put('pending_orders', order);
}

export async function getPendingOrders(): Promise<PendingOfflineOrder[]> {
  const db = await getOfflineDb();
  return db.getAll('pending_orders');
}

export async function removePendingOrder(clientTxId: string) {
  const db = await getOfflineDb();
  await db.delete('pending_orders', clientTxId);
}

export async function updatePendingOrderError(clientTxId: string, errorMsg: string) {
  const db = await getOfflineDb();
  const existing = await db.get('pending_orders', clientTxId);
  if (existing) {
    existing.retry_count += 1;
    existing.last_error = errorMsg;
    await db.put('pending_orders', existing);
  }
}
