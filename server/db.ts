import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const DB_PATH = path.join(DATA_DIR, 'baslune-pos.sqlite');

export function ensureDirectories() {
  for (const dir of [DATA_DIR, BACKUP_DIR, UPLOADS_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

ensureDirectories();

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

interface Migration {
  version: number;
  name: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_pos_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS roles (
        role_key TEXT PRIMARY KEY,
        label_en TEXT NOT NULL,
        label_ckb TEXT NOT NULL,
        label_ar TEXT NOT NULL,
        permissions_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL REFERENCES roles(role_key),
        permissions_override_json TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        must_change_password INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_login_at TEXT
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_name TEXT,
        ip_address TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS shop_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name_ckb TEXT NOT NULL,
        name_ar TEXT NOT NULL,
        name_en TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        contact_person TEXT,
        phone TEXT,
        email TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS inventory_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sku TEXT NOT NULL UNIQUE,
        name_ckb TEXT NOT NULL,
        name_ar TEXT NOT NULL,
        name_en TEXT NOT NULL,
        item_type TEXT NOT NULL DEFAULT 'ingredient',
        unit TEXT NOT NULL DEFAULT 'g',
        quantity REAL NOT NULL DEFAULT 0,
        min_threshold REAL NOT NULL DEFAULT 0,
        unit_cost REAL NOT NULL DEFAULT 0,
        supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL REFERENCES categories(id),
        sku TEXT NOT NULL UNIQUE,
        barcode TEXT,
        name_ckb TEXT NOT NULL,
        name_ar TEXT NOT NULL,
        name_en TEXT NOT NULL,
        description_ckb TEXT DEFAULT '',
        description_ar TEXT DEFAULT '',
        description_en TEXT DEFAULT '',
        base_price REAL NOT NULL,
        cost_estimate REAL NOT NULL DEFAULT 0,
        image_url TEXT DEFAULT '',
        is_available INTEGER NOT NULL DEFAULT 1,
        is_active INTEGER NOT NULL DEFAULT 1,
        track_direct_stock INTEGER NOT NULL DEFAULT 0,
        direct_stock_qty REAL NOT NULL DEFAULT 0,
        low_stock_threshold REAL NOT NULL DEFAULT 5,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS product_variations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        name_ckb TEXT NOT NULL,
        name_ar TEXT NOT NULL,
        name_en TEXT NOT NULL,
        price_delta REAL NOT NULL DEFAULT 0,
        recipe_multiplier REAL NOT NULL DEFAULT 1.0,
        is_default INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS addons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name_ckb TEXT NOT NULL,
        name_ar TEXT NOT NULL,
        name_en TEXT NOT NULL,
        price REAL NOT NULL DEFAULT 0,
        ingredient_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
        ingredient_qty REAL NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS product_recipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
        quantity_required REAL NOT NULL,
        UNIQUE(product_id, inventory_item_id)
      );

      CREATE TABLE IF NOT EXISTS cafe_tables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_number TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        capacity INTEGER NOT NULL DEFAULT 4,
        zone TEXT NOT NULL DEFAULT 'Main Hall',
        status TEXT NOT NULL DEFAULT 'available',
        current_order_id INTEGER
      );

      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_number TEXT NOT NULL UNIQUE,
        client_tx_id TEXT NOT NULL UNIQUE,
        order_type TEXT NOT NULL DEFAULT 'dine_in',
        table_id INTEGER REFERENCES cafe_tables(id) ON DELETE SET NULL,
        customer_name TEXT DEFAULT '',
        customer_phone TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        payment_status TEXT NOT NULL DEFAULT 'paid',
        payment_method TEXT NOT NULL DEFAULT 'cash',
        cash_amount REAL NOT NULL DEFAULT 0,
        card_amount REAL NOT NULL DEFAULT 0,
        subtotal REAL NOT NULL,
        discount_amount REAL NOT NULL DEFAULT 0,
        discount_type TEXT NOT NULL DEFAULT 'fixed',
        tax_amount REAL NOT NULL DEFAULT 0,
        service_charge_amount REAL NOT NULL DEFAULT 0,
        total_amount REAL NOT NULL,
        estimated_cost REAL NOT NULL DEFAULT 0,
        notes TEXT DEFAULT '',
        cashier_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        cancelled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        cancel_reason TEXT,
        device_id TEXT DEFAULT 'terminal-1',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        product_name TEXT NOT NULL,
        variation_id INTEGER,
        variation_name TEXT DEFAULT '',
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price REAL NOT NULL,
        addons_json TEXT NOT NULL DEFAULT '[]',
        addons_total REAL NOT NULL DEFAULT 0,
        line_total REAL NOT NULL,
        unit_cost REAL NOT NULL DEFAULT 0,
        notes TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS purchase_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
        inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
        quantity REAL NOT NULL,
        unit_cost REAL NOT NULL,
        total_cost REAL NOT NULL,
        invoice_ref TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS stock_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        inventory_item_id INTEGER REFERENCES inventory_items(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        movement_type TEXT NOT NULL,
        quantity_delta REAL NOT NULL,
        balance_after REAL NOT NULL,
        reference_id TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        amount REAL NOT NULL,
        notes TEXT DEFAULT '',
        recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        expense_date TEXT NOT NULL DEFAULT (date('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        user_name TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT DEFAULT '',
        details TEXT DEFAULT '',
        ip_address TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_client_tx ON orders(client_tx_id);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(inventory_item_id);
      CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at);
    `,
  },
];

export function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set<number>(
    (db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>).map(
      (r) => r.version
    )
  );

  for (const migration of MIGRATIONS) {
    if (!applied.has(migration.version)) {
      const tx = db.transaction(() => {
        db.exec(migration.sql);
        db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(
          migration.version,
          migration.name
        );
      });
      tx();
      console.log(`[DB] Applied migration v${migration.version}: ${migration.name}`);
    }
  }
}

export async function createLocalBackup(label = 'manual'): Promise<{
  filename: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
}> {
  ensureDirectories();
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, '');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `baslune-pos-${safeLabel}-${stamp}.sqlite`;
  const destPath = path.join(BACKUP_DIR, filename);

  await db.backup(destPath);
  const stats = fs.statSync(destPath);

  // Retain up to 30 automatic backups to keep disk usage clean
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => ({
      name: f,
      time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs,
    }))
    .sort((a, b) => b.time - a.time);

  if (files.length > 30) {
    for (const old of files.slice(30)) {
      try {
        fs.unlinkSync(path.join(BACKUP_DIR, old.name));
      } catch {
        // ignore cleanup error
      }
    }
  }

  return {
    filename,
    path: destPath,
    sizeBytes: stats.size,
    createdAt: new Date().toISOString(),
  };
}

export function listLocalBackups() {
  ensureDirectories();
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => {
      const fullPath = path.join(BACKUP_DIR, f);
      const st = fs.statSync(fullPath);
      return {
        filename: f,
        sizeBytes: st.size,
        createdAt: st.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function restoreLocalBackup(filename: string) {
  const safeName = path.basename(filename);
  const backupPath = path.join(BACKUP_DIR, safeName);
  if (!fs.existsSync(backupPath)) {
    throw new Error('Backup file not found');
  }

  // Create a safety snapshot before restoring
  await createLocalBackup('pre-restore');

  // Verify backup integrity first using a temporary sqlite instance
  const checkDb = new Database(backupPath, { readonly: true });
  const integrity = checkDb.pragma('integrity_check', { simple: true });
  checkDb.close();
  if (integrity !== 'ok') {
    throw new Error('Backup file failed SQLite integrity check');
  }

  // Copy backup content atomically using sqlite backup API in reverse
  const sourceDb = new Database(backupPath, { readonly: true });
  await sourceDb.backup(DB_PATH);
  sourceDb.close();
}

export function getPaths() {
  return { DATA_DIR, BACKUP_DIR, UPLOADS_DIR, DB_PATH };
}

let backupTimer: NodeJS.Timeout | null = null;
export function startAutomaticBackupScheduler() {
  if (backupTimer) clearInterval(backupTimer);
  // Every 6 hours automatic local backup
  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  backupTimer = setInterval(() => {
    createLocalBackup('auto').catch((err) => {
      console.error('[DB] Automatic backup failed:', err);
    });
  }, SIX_HOURS_MS);
}
