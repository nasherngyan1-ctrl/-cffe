import os from 'os';
import path from 'path';
import { Router } from 'express';
import {
  createLocalBackup,
  db,
  getPaths,
  listLocalBackups,
  restoreLocalBackup,
} from '../db.ts';
import { logAudit, requireAuth, requirePermission, requireRole } from '../auth.ts';
import { broadcastEvent, getConnectedDevices } from '../ws.ts';

const router = Router();

router.get('/', requireAuth, (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM shop_settings').all() as Array<{
    key: string;
    value: string;
  }>;
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  return res.json({ settings });
});

router.put('/', requireAuth, requireRole('owner'), requirePermission('settings.manage'), (req, res) => {
  const updates = req.body as Record<string, string>;
  const upsert = db.prepare(
    `INSERT INTO shop_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  );
  db.transaction(() => {
    for (const [k, v] of Object.entries(updates)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        upsert.run(k, String(v));
      }
    }
  })();

  logAudit(req.user!, 'settings_updated', 'settings', 'shop', Object.keys(updates).join(', '), req.ip || '');
  broadcastEvent('settings:updated', { settings: updates });
  return res.json({ ok: true });
});

router.get('/lan-info', requireAuth, (_req, res) => {
  const nets = os.networkInterfaces();
  const addresses: Array<{ interface: string; address: string }> = [];
  for (const [iface, list] of Object.entries(nets)) {
    if (!list) continue;
    for (const net of list) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({ interface: iface, address: net.address });
      }
    }
  }
  return res.json({
    hostname: os.hostname(),
    port: Number(process.env.PORT || 3000),
    lanAddresses: addresses,
    connectedDevices: getConnectedDevices(),
  });
});

router.get('/backups', requireAuth, requireRole('owner'), requirePermission('backups.manage'), (_req, res) => {
  return res.json({ backups: listLocalBackups() });
});

router.post('/backups', requireAuth, requireRole('owner'), requirePermission('backups.manage'), async (req, res) => {
  try {
    const info = await createLocalBackup('manual');
    logAudit(req.user!, 'backup_created', 'database', info.filename, `${info.sizeBytes} bytes`, req.ip || '');
    return res.status(201).json({ backup: info });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/backups/download/:filename', requireAuth, requireRole('owner'), requirePermission('backups.manage'), (req, res) => {
  const { BACKUP_DIR } = getPaths();
  const safeName = path.basename(req.params.filename);
  const fullPath = path.join(BACKUP_DIR, safeName);
  return res.download(fullPath, safeName, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: 'Backup file not found' });
    }
  });
});

router.post('/backups/restore', requireAuth, requireRole('owner'), requirePermission('backups.manage'), async (req, res) => {
  const { filename } = req.body as { filename?: string };
  if (!filename) return res.status(400).json({ error: 'Backup filename is required' });
  try {
    await restoreLocalBackup(filename);
    logAudit(req.user!, 'backup_restored', 'database', filename, 'Restored local SQLite snapshot', req.ip || '');
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

router.get('/audit-logs', requireAuth, requireRole('owner'), (_req, res) => {
  const logs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 150').all();
  return res.json({ logs });
});

export default router;
