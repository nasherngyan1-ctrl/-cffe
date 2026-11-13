import { Router } from 'express';
import { db } from '../db.ts';
import { logAudit, requireAuth, requirePermission } from '../auth.ts';
import { broadcastEvent } from '../ws.ts';

const router = Router();

router.get('/', requireAuth, requirePermission('inventory.view'), (_req, res) => {
  const items = db
    .prepare(
      `SELECT ii.*, s.name as supplier_name
       FROM inventory_items ii
       LEFT JOIN suppliers s ON s.id = ii.supplier_id
       ORDER BY (ii.quantity <= ii.min_threshold) DESC, ii.name_en ASC`
    )
    .all();

  const directProducts = db
    .prepare(
      `SELECT p.id, p.sku, p.name_ckb, p.name_ar, p.name_en, p.direct_stock_qty as quantity,
              p.low_stock_threshold as min_threshold, p.cost_estimate as unit_cost, p.base_price
       FROM products p
       WHERE p.is_active = 1 AND p.track_direct_stock = 1
       ORDER BY p.name_en ASC`
    )
    .all();

  const suppliers = db.prepare('SELECT * FROM suppliers ORDER BY name ASC').all();

  const movements = db
    .prepare(
      `SELECT sm.*, ii.name_en as ingredient_name, ii.unit as ingredient_unit,
              p.name_en as product_name, u.name as user_name
       FROM stock_movements sm
       LEFT JOIN inventory_items ii ON ii.id = sm.inventory_item_id
       LEFT JOIN products p ON p.id = sm.product_id
       LEFT JOIN users u ON u.id = sm.user_id
       ORDER BY sm.created_at DESC, sm.id DESC
       LIMIT 100`
    )
    .all();

  const purchases = db
    .prepare(
      `SELECT pr.*, s.name as supplier_name, ii.name_en as item_name, ii.unit, u.name as recorded_by_name
       FROM purchase_records pr
       LEFT JOIN suppliers s ON s.id = pr.supplier_id
       JOIN inventory_items ii ON ii.id = pr.inventory_item_id
       LEFT JOIN users u ON u.id = pr.recorded_by
       ORDER BY pr.created_at DESC
       LIMIT 60`
    )
    .all();

  return res.json({ items, directProducts, suppliers, movements, purchases });
});

router.post('/items', requireAuth, requirePermission('inventory.manage'), (req, res) => {
  const { sku, name_ckb, name_ar, name_en, item_type, unit, quantity, min_threshold, unit_cost, supplier_id } =
    req.body as Record<string, string | number | null>;

  if (!name_en || !unit) {
    return res.status(400).json({ error: 'Item name and unit are required' });
  }

  const finalSku = String(sku || `ING-${Date.now().toString().slice(-5)}`).trim();
  try {
    const result = db
      .prepare(
        `INSERT INTO inventory_items (sku, name_ckb, name_ar, name_en, item_type, unit, quantity, min_threshold, unit_cost, supplier_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        finalSku,
        String(name_ckb || name_en),
        String(name_ar || name_en),
        String(name_en),
        String(item_type || 'ingredient'),
        String(unit),
        Number(quantity || 0),
        Number(min_threshold || 0),
        Number(unit_cost || 0),
        supplier_id ? Number(supplier_id) : null
      );

    const id = Number(result.lastInsertRowid);
    if (Number(quantity || 0) > 0) {
      db.prepare(
        `INSERT INTO stock_movements (inventory_item_id, movement_type, quantity_delta, balance_after, notes, user_id)
         VALUES (?, 'adjustment', ?, ?, 'Initial stock entry', ?)`
      ).run(id, Number(quantity), Number(quantity), req.user!.id);
    }

    logAudit(req.user!, 'inventory_item_created', 'inventory_item', id, String(name_en), req.ip || '');
    broadcastEvent('inventory:updated', { itemId: id });
    return res.status(201).json({ id });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

router.post('/adjust', requireAuth, requirePermission('inventory.manage'), (req, res) => {
  const { inventory_item_id, product_id, movement_type, quantity_delta, notes } = req.body as {
    inventory_item_id?: number;
    product_id?: number;
    movement_type: 'adjustment' | 'waste';
    quantity_delta: number;
    notes?: string;
  };

  const delta = Number(quantity_delta || 0);
  if (delta === 0) {
    return res.status(400).json({ error: 'Quantity change must be non-zero' });
  }

  const finalDelta = movement_type === 'waste' ? -Math.abs(delta) : delta;

  try {
    if (inventory_item_id) {
      db.transaction(() => {
        const item = db
          .prepare('SELECT id, name_en, quantity FROM inventory_items WHERE id = ?')
          .get(inventory_item_id) as { id: number; name_en: string; quantity: number } | undefined;
        if (!item) throw new Error('Inventory item not found');

        const newBal = Math.max(0, Number((item.quantity + finalDelta).toFixed(3)));
        db.prepare(`UPDATE inventory_items SET quantity = ?, updated_at = datetime('now') WHERE id = ?`).run(
          newBal,
          item.id
        );
        db.prepare(
          `INSERT INTO stock_movements (inventory_item_id, movement_type, quantity_delta, balance_after, notes, user_id)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          item.id,
          movement_type === 'waste' ? 'waste' : 'adjustment',
          finalDelta,
          newBal,
          notes || (movement_type === 'waste' ? 'Waste recorded' : 'Manual stock adjustment'),
          req.user!.id
        );
      })();
    } else if (product_id) {
      db.transaction(() => {
        const prod = db
          .prepare('SELECT id, name_en, direct_stock_qty FROM products WHERE id = ?')
          .get(product_id) as { id: number; name_en: string; direct_stock_qty: number } | undefined;
        if (!prod) throw new Error('Product not found');

        const newBal = Math.max(0, Number((prod.direct_stock_qty + finalDelta).toFixed(3)));
        db.prepare('UPDATE products SET direct_stock_qty = ? WHERE id = ?').run(newBal, prod.id);
        db.prepare(
          `INSERT INTO stock_movements (product_id, movement_type, quantity_delta, balance_after, notes, user_id)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          prod.id,
          movement_type === 'waste' ? 'waste' : 'adjustment',
          finalDelta,
          newBal,
          notes || 'Direct product stock adjustment',
          req.user!.id
        );
      })();
    } else {
      return res.status(400).json({ error: 'Target inventory item or product is required' });
    }

    logAudit(
      req.user!,
      movement_type === 'waste' ? 'stock_waste' : 'stock_adjusted',
      inventory_item_id ? 'inventory_item' : 'product',
      inventory_item_id || product_id || '',
      `Delta: ${finalDelta} (${notes || ''})`,
      req.ip || ''
    );
    broadcastEvent('inventory:updated', { inventory_item_id, product_id });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

router.post('/purchases', requireAuth, requirePermission('inventory.manage'), (req, res) => {
  const { supplier_id, inventory_item_id, quantity, unit_cost, invoice_ref, notes } = req.body as {
    supplier_id?: number | null;
    inventory_item_id: number;
    quantity: number;
    unit_cost: number;
    invoice_ref?: string;
    notes?: string;
  };

  const qty = Number(quantity || 0);
  const cost = Number(unit_cost || 0);
  if (!inventory_item_id || qty <= 0) {
    return res.status(400).json({ error: 'Valid item and positive quantity are required' });
  }

  try {
    db.transaction(() => {
      const item = db
        .prepare('SELECT id, name_en, quantity FROM inventory_items WHERE id = ?')
        .get(inventory_item_id) as { id: number; name_en: string; quantity: number } | undefined;
      if (!item) throw new Error('Inventory item not found');

      const totalCost = Math.round(qty * cost);
      const newBal = Number((item.quantity + qty).toFixed(3));

      db.prepare(
        `INSERT INTO purchase_records (supplier_id, inventory_item_id, quantity, unit_cost, total_cost, invoice_ref, notes, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        supplier_id || null,
        item.id,
        qty,
        cost,
        totalCost,
        invoice_ref || '',
        notes || '',
        req.user!.id
      );

      db.prepare(
        `UPDATE inventory_items SET quantity = ?, unit_cost = CASE WHEN ? > 0 THEN ? ELSE unit_cost END, updated_at = datetime('now') WHERE id = ?`
      ).run(newBal, cost, cost, item.id);

      db.prepare(
        `INSERT INTO stock_movements (inventory_item_id, movement_type, quantity_delta, balance_after, reference_id, notes, user_id)
         VALUES (?, 'purchase', ?, ?, ?, ?, ?)`
      ).run(
        item.id,
        qty,
        newBal,
        invoice_ref || '',
        notes || `Purchase recorded (${qty})`,
        req.user!.id
      );
    })();

    logAudit(req.user!, 'purchase_recorded', 'inventory_item', inventory_item_id, `Qty: +${qty}`, req.ip || '');
    broadcastEvent('inventory:updated', { inventory_item_id });
    return res.status(201).json({ ok: true });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

router.post('/suppliers', requireAuth, requirePermission('inventory.manage'), (req, res) => {
  const { name, contact_person, phone, email, notes } = req.body as Record<string, string>;
  if (!name) return res.status(400).json({ error: 'Supplier name is required' });
  const result = db
    .prepare(`INSERT INTO suppliers (name, contact_person, phone, email, notes) VALUES (?, ?, ?, ?, ?)`)
    .run(name, contact_person || '', phone || '', email || '', notes || '');
  return res.status(201).json({ id: Number(result.lastInsertRowid) });
});

export default router;
