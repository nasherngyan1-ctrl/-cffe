import { Router } from 'express';
import { db } from '../db.ts';
import { logAudit, requireAuth, requirePermission } from '../auth.ts';
import { broadcastEvent } from '../ws.ts';

const router = Router();

router.get('/', requireAuth, (_req, res) => {
  const tables = db
    .prepare(
      `SELECT ct.*, o.order_number as active_order_number, o.total_amount as active_order_total,
              o.status as active_order_status, o.payment_status as active_order_payment_status,
              o.created_at as active_order_created_at
       FROM cafe_tables ct
       LEFT JOIN orders o ON o.id = ct.current_order_id AND o.status NOT IN ('completed', 'cancelled')
       ORDER BY ct.id ASC`
    )
    .all();
  return res.json({ tables });
});

router.post('/', requireAuth, requirePermission('orders.manage'), (req, res) => {
  const { table_number, name, capacity, zone } = req.body as Record<string, string | number>;
  if (!table_number || !String(table_number).trim()) {
    return res.status(400).json({ error: 'Table number is required' });
  }
  const cleanNumber = String(table_number).trim().toUpperCase();
  const duplicate = db.prepare('SELECT id FROM cafe_tables WHERE upper(table_number) = ?').get(cleanNumber);
  if (duplicate) {
    return res.status(409).json({ error: 'Table number already exists' });
  }

  try {
    const result = db
      .prepare(
        `INSERT INTO cafe_tables (table_number, name, capacity, zone, status)
         VALUES (?, ?, ?, ?, 'available')`
      )
      .run(
        cleanNumber,
        String(name || cleanNumber).trim(),
        Math.max(1, Number(capacity || 4)),
        String(zone || 'Main Lounge').trim()
      );
    const id = Number(result.lastInsertRowid);
    logAudit(req.user!, 'table_created', 'table', id, `${cleanNumber} (${capacity || 4} seats)`, req.ip || '');
    broadcastEvent('table:updated', { id });
    return res.status(201).json({ id });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

router.put('/:id', requireAuth, requirePermission('orders.manage'), (req, res) => {
  const id = Number(req.params.id);
  const { table_number, name, capacity, zone } = req.body as Record<string, string | number>;
  const existing = db.prepare('SELECT * FROM cafe_tables WHERE id = ?').get(id) as
    | { id: number; table_number: string; name: string; capacity: number; zone: string }
    | undefined;
  if (!existing) return res.status(404).json({ error: 'Table not found' });

  const cleanNumber = String(table_number || existing.table_number).trim().toUpperCase();
  const duplicate = db
    .prepare('SELECT id FROM cafe_tables WHERE upper(table_number) = ? AND id != ?')
    .get(cleanNumber, id);
  if (duplicate) {
    return res.status(409).json({ error: 'Table number already exists' });
  }

  db.prepare(
    `UPDATE cafe_tables SET table_number = ?, name = ?, capacity = ?, zone = ? WHERE id = ?`
  ).run(
    cleanNumber,
    String(name || cleanNumber).trim(),
    Math.max(1, Number(capacity || existing.capacity)),
    String(zone || existing.zone).trim(),
    id
  );
  logAudit(req.user!, 'table_updated', 'table', id, cleanNumber, req.ip || '');
  broadcastEvent('table:updated', { tableId: id });
  return res.json({ ok: true });
});

router.delete('/:id', requireAuth, requirePermission('menu.manage'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id, table_number, status, current_order_id FROM cafe_tables WHERE id = ?').get(id) as
    | { id: number; table_number: string; status: string; current_order_id: number | null }
    | undefined;
  if (!existing) return res.status(404).json({ error: 'Table not found' });
  if (existing.status === 'occupied' || existing.current_order_id) {
    return res.status(400).json({ error: 'Cannot delete an occupied table with an active order' });
  }
  db.prepare('DELETE FROM cafe_tables WHERE id = ?').run(id);
  logAudit(req.user!, 'table_deleted', 'table', id, existing.table_number, req.ip || '');
  broadcastEvent('table:updated', { tableId: id });
  return res.json({ ok: true });
});

router.patch('/:id/status', requireAuth, requirePermission('orders.manage'), (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body as { status: 'available' | 'occupied' | 'reserved' | 'cleaning' };
  if (!['available', 'occupied', 'reserved', 'cleaning'].includes(status)) {
    return res.status(400).json({ error: 'Invalid table status' });
  }
  const existing = db.prepare('SELECT id, table_number FROM cafe_tables WHERE id = ?').get(id) as
    | { id: number; table_number: string }
    | undefined;
  if (!existing) return res.status(404).json({ error: 'Table not found' });

  db.prepare(
    `UPDATE cafe_tables
     SET status = ?,
         current_order_id = CASE WHEN ? IN ('available', 'cleaning') THEN NULL ELSE current_order_id END
     WHERE id = ?`
  ).run(status, status, id);
  logAudit(req.user!, 'table_status_updated', 'table', id, `${existing.table_number} -> ${status}`, req.ip || '');
  broadcastEvent('table:updated', { tableId: id, status });
  return res.json({ ok: true });
});

router.post('/transfer', requireAuth, requirePermission('orders.manage'), (req, res) => {
  const { from_table_id, to_table_id } = req.body as { from_table_id?: number; to_table_id?: number };
  if (!from_table_id || !to_table_id || from_table_id === to_table_id) {
    return res.status(400).json({ error: 'Valid source and destination tables are required' });
  }

  try {
    const result = db.transaction(() => {
      const fromTable = db.prepare('SELECT * FROM cafe_tables WHERE id = ?').get(from_table_id) as
        | { id: number; table_number: string; current_order_id: number | null; status: string }
        | undefined;
      const toTable = db.prepare('SELECT * FROM cafe_tables WHERE id = ?').get(to_table_id) as
        | { id: number; table_number: string; current_order_id: number | null; status: string }
        | undefined;

      if (!fromTable || !toTable) throw new Error('Table not found');
      if (!fromTable.current_order_id) throw new Error('Source table has no active order to transfer');
      if (toTable.status === 'occupied' || toTable.current_order_id) {
        throw new Error('Destination table is already occupied');
      }

      const orderId = fromTable.current_order_id;
      db.prepare(`UPDATE orders SET table_id = ?, updated_at = datetime('now') WHERE id = ?`).run(
        toTable.id,
        orderId
      );
      db.prepare(`UPDATE cafe_tables SET status = 'available', current_order_id = NULL WHERE id = ?`).run(
        fromTable.id
      );
      db.prepare(`UPDATE cafe_tables SET status = 'occupied', current_order_id = ? WHERE id = ?`).run(
        orderId,
        toTable.id
      );
      return { orderId, from: fromTable.table_number, to: toTable.table_number };
    })();

    logAudit(
      req.user!,
      'table_order_transferred',
      'table',
      result.orderId,
      `${result.from} -> ${result.to}`,
      req.ip || ''
    );
    broadcastEvent('table:updated', { from_table_id, to_table_id });
    broadcastEvent('order:updated', { orderId: result.orderId });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

router.post('/:id/close', requireAuth, requirePermission('orders.manage'), (req, res) => {
  const id = Number(req.params.id);
  const { next_status = 'available' } = req.body as { next_status?: 'available' | 'cleaning' };
  const targetStatus = next_status === 'cleaning' ? 'cleaning' : 'available';

  const table = db.prepare('SELECT * FROM cafe_tables WHERE id = ?').get(id) as
    | { id: number; table_number: string; current_order_id: number | null }
    | undefined;
  if (!table) return res.status(404).json({ error: 'Table not found' });

  db.transaction(() => {
    if (table.current_order_id) {
      db.prepare(
        `UPDATE orders SET status = 'completed', updated_at = datetime('now')
         WHERE id = ? AND status != 'cancelled'`
      ).run(table.current_order_id);
    }
    db.prepare(`UPDATE cafe_tables SET status = ?, current_order_id = NULL WHERE id = ?`).run(targetStatus, id);
  })();

  logAudit(req.user!, 'table_closed', 'table', id, `${table.table_number} -> ${targetStatus}`, req.ip || '');
  broadcastEvent('table:updated', { tableId: id, status: targetStatus });
  if (table.current_order_id) {
    broadcastEvent('order:updated', { orderId: table.current_order_id });
  }
  return res.json({ ok: true });
});

export default router;
