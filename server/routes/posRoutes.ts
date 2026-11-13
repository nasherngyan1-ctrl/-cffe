import crypto from 'crypto';
import { Router } from 'express';
import { db } from '../db.ts';
import { logAudit, requireAuth, requirePermission } from '../auth.ts';
import { broadcastEvent } from '../ws.ts';

const router = Router();

interface CreateOrderItemInput {
  product_id: number;
  variation_id?: number | null;
  quantity: number;
  addon_ids?: number[];
  notes?: string;
}

interface CreateOrderBody {
  client_tx_id?: string;
  order_type?: 'dine_in' | 'takeaway' | 'delivery';
  table_id?: number | null;
  customer_name?: string;
  customer_phone?: string;
  discount_amount?: number;
  discount_type?: 'fixed' | 'percent';
  payment_method?: 'cash' | 'card' | 'split';
  cash_amount?: number;
  card_amount?: number;
  notes?: string;
  device_id?: string;
  items?: CreateOrderItemInput[];
}

function hydrateOrders(
  orders: Array<Record<string, unknown>>
): Array<Record<string, unknown> & { items: Array<Record<string, unknown>> }> {
  if (orders.length === 0) return [];
  const ids = orders.map((o) => Number(o.id));
  const placeholders = ids.map(() => '?').join(',');
  const items = db
    .prepare(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`)
    .all(...ids) as Array<Record<string, unknown>>;

  const byOrder = new Map<number, Array<Record<string, unknown>>>();
  for (const item of items) {
    const oid = Number(item.order_id);
    if (!byOrder.has(oid)) byOrder.set(oid, []);
    byOrder.get(oid)!.push({
      ...item,
      addons: (() => {
        try {
          return JSON.parse(String(item.addons_json || '[]'));
        } catch {
          return [];
        }
      })(),
    });
  }

  return orders.map((o) => ({
    ...o,
    items: byOrder.get(Number(o.id)) || [],
  }));
}

router.get('/', requireAuth, (req, res) => {
  const { status, order_type, limit = '60', date_from, date_to } = req.query as Record<string, string>;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status && status !== 'all') {
    conditions.push('o.status = ?');
    params.push(status);
  }
  if (order_type && order_type !== 'all') {
    conditions.push('o.order_type = ?');
    params.push(order_type);
  }
  if (date_from) {
    conditions.push('date(o.created_at) >= date(?)');
    params.push(date_from);
  }
  if (date_to) {
    conditions.push('date(o.created_at) <= date(?)');
    params.push(date_to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const maxRows = Math.min(Math.max(parseInt(limit, 10) || 60, 1), 250);

  const rows = db
    .prepare(
      `SELECT o.*, u.name as cashier_name, t.table_number, t.name as table_name
       FROM orders o
       LEFT JOIN users u ON u.id = o.cashier_id
       LEFT JOIN cafe_tables t ON t.id = o.table_id
       ${where}
       ORDER BY o.created_at DESC, o.id DESC
       LIMIT ?`
    )
    .all(...params, maxRows) as Array<Record<string, unknown>>;

  const canViewCosts = req.user!.role === 'owner' || req.user!.permissions.includes('reports.view');
  const hydrated = hydrateOrders(rows).map((order) => {
    if (canViewCosts) return order;
    return {
      ...order,
      estimated_cost: 0,
      items: order.items.map((item) => ({ ...item, unit_cost: 0 })),
    };
  });

  return res.json({ orders: hydrated });
});

router.post('/', requireAuth, requirePermission('pos.sell'), (req, res) => {
  const body = req.body as CreateOrderBody;
  if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
    return res.status(400).json({ error: 'Order must include at least one item' });
  }

  const clientTxId = (body.client_tx_id || crypto.randomUUID()).trim();

  // Duplicate transaction protection (idempotent check)
  const existingOrder = db
    .prepare(
      `SELECT o.*, u.name as cashier_name, t.table_number, t.name as table_name
       FROM orders o
       LEFT JOIN users u ON u.id = o.cashier_id
       LEFT JOIN cafe_tables t ON t.id = o.table_id
       WHERE o.client_tx_id = ?`
    )
    .get(clientTxId) as Record<string, unknown> | undefined;

  if (existingOrder) {
    return res.status(200).json({
      order: hydrateOrders([existingOrder])[0],
      deduplicated: true,
    });
  }

  // Discount permission check if discount > 0
  const rawDiscount = Math.max(0, Number(body.discount_amount || 0));
  if (rawDiscount > 0 && req.user!.role !== 'owner' && !req.user!.permissions.includes('pos.discount')) {
    return res.status(403).json({ error: 'Permission required to apply discounts' });
  }

  const settingsRows = db.prepare('SELECT key, value FROM shop_settings').all() as Array<{
    key: string;
    value: string;
  }>;
  const settingsMap = new Map(settingsRows.map((s) => [s.key, s.value]));
  const taxRate = Math.max(0, Number(settingsMap.get('tax_rate') || 0));
  const serviceRate = Math.max(0, Number(settingsMap.get('service_charge_rate') || 0));

  try {
    const createdOrderId = db.transaction(() => {
      let subtotal = 0;
      let totalEstimatedCost = 0;

      const preparedItems: Array<{
        product_id: number;
        product_name: string;
        variation_id: number | null;
        variation_name: string;
        quantity: number;
        unit_price: number;
        addons: Array<{ id: number; name: string; price: number }>;
        addons_total: number;
        line_total: number;
        unit_cost: number;
        notes: string;
        recipe_multiplier: number;
        track_direct_stock: number;
      }> = [];

      const getProduct = db.prepare('SELECT * FROM products WHERE id = ? AND is_active = 1');
      const getVariation = db.prepare('SELECT * FROM product_variations WHERE id = ? AND product_id = ?');
      const getAddon = db.prepare('SELECT * FROM addons WHERE id = ? AND is_active = 1');

      for (const itemInput of body.items!) {
        const qty = Math.max(1, Math.floor(Number(itemInput.quantity || 1)));
        const product = getProduct.get(itemInput.product_id) as
          | {
              id: number;
              name_en: string;
              base_price: number;
              cost_estimate: number;
              track_direct_stock: number;
              direct_stock_qty: number;
            }
          | undefined;

        if (!product) {
          throw new Error(`Product ID ${itemInput.product_id} not found or inactive`);
        }

        let variationName = '';
        let priceDelta = 0;
        let recipeMultiplier = 1.0;
        let variationId: number | null = null;

        if (itemInput.variation_id) {
          const variation = getVariation.get(itemInput.variation_id, product.id) as
            | { id: number; name_en: string; price_delta: number; recipe_multiplier: number }
            | undefined;
          if (variation) {
            variationId = variation.id;
            variationName = variation.name_en;
            priceDelta = variation.price_delta;
            recipeMultiplier = variation.recipe_multiplier || 1.0;
          }
        }

        const selectedAddons: Array<{
          id: number;
          name: string;
          price: number;
          ingredient_id: number | null;
          ingredient_qty: number;
        }> = [];
        let addonsTotalPerUnit = 0;

        if (Array.isArray(itemInput.addon_ids)) {
          for (const aid of itemInput.addon_ids) {
            const addon = getAddon.get(aid) as
              | {
                  id: number;
                  name_en: string;
                  price: number;
                  ingredient_id: number | null;
                  ingredient_qty: number;
                }
              | undefined;
            if (addon) {
              selectedAddons.push({
                id: addon.id,
                name: addon.name_en,
                price: addon.price,
                ingredient_id: addon.ingredient_id,
                ingredient_qty: addon.ingredient_qty,
              });
              addonsTotalPerUnit += addon.price;
            }
          }
        }

        const unitPrice = product.base_price + priceDelta;
        const lineTotal = (unitPrice + addonsTotalPerUnit) * qty;
        subtotal += lineTotal;
        totalEstimatedCost += (product.cost_estimate || 0) * recipeMultiplier * qty;

        preparedItems.push({
          product_id: product.id,
          product_name: product.name_en,
          variation_id: variationId,
          variation_name: variationName,
          quantity: qty,
          unit_price: unitPrice,
          addons: selectedAddons.map((a) => ({ id: a.id, name: a.name, price: a.price })),
          addons_total: addonsTotalPerUnit * qty,
          line_total: lineTotal,
          unit_cost: product.cost_estimate || 0,
          notes: (itemInput.notes || '').slice(0, 200),
          recipe_multiplier: recipeMultiplier,
          track_direct_stock: product.track_direct_stock,
        });

        // Deduct direct product stock if tracked
        if (product.track_direct_stock) {
          if (product.direct_stock_qty < qty) {
            throw new Error(`Insufficient stock for ${product.name_en} (${product.direct_stock_qty} remaining)`);
          }
          const newQty = Number((product.direct_stock_qty - qty).toFixed(3));
          db.prepare('UPDATE products SET direct_stock_qty = ? WHERE id = ?').run(newQty, product.id);
          db.prepare(
            `INSERT INTO stock_movements (product_id, movement_type, quantity_delta, balance_after, reference_id, notes, user_id)
             VALUES (?, 'sale_deduction', ?, ?, ?, ?, ?)`
          ).run(product.id, -qty, newQty, clientTxId, `POS sale: ${product.name_en}`, req.user!.id);
        }

        // Deduct recipe ingredients automatically
        const recipeRows = db
          .prepare('SELECT inventory_item_id, quantity_required FROM product_recipes WHERE product_id = ?')
          .all(product.id) as Array<{ inventory_item_id: number; quantity_required: number }>;

        for (const rec of recipeRows) {
          const deduct = rec.quantity_required * recipeMultiplier * qty;
          const inv = db
            .prepare('SELECT quantity FROM inventory_items WHERE id = ?')
            .get(rec.inventory_item_id) as { quantity: number } | undefined;
          if (inv) {
            const newBal = Math.max(0, Number((inv.quantity - deduct).toFixed(3)));
            db.prepare(`UPDATE inventory_items SET quantity = ?, updated_at = datetime('now') WHERE id = ?`).run(
              newBal,
              rec.inventory_item_id
            );
            db.prepare(
              `INSERT INTO stock_movements (inventory_item_id, product_id, movement_type, quantity_delta, balance_after, reference_id, notes, user_id)
               VALUES (?, ?, 'sale_deduction', ?, ?, ?, ?, ?)`
            ).run(
              rec.inventory_item_id,
              product.id,
              -deduct,
              newBal,
              clientTxId,
              `Auto recipe deduction (${product.name_en} x${qty})`,
              req.user!.id
            );
          }
        }

        // Deduct addon ingredients
        for (const addon of selectedAddons) {
          if (addon.ingredient_id && addon.ingredient_qty > 0) {
            const deduct = addon.ingredient_qty * qty;
            const inv = db
              .prepare('SELECT quantity FROM inventory_items WHERE id = ?')
              .get(addon.ingredient_id) as { quantity: number } | undefined;
            if (inv) {
              const newBal = Math.max(0, Number((inv.quantity - deduct).toFixed(3)));
              db.prepare(`UPDATE inventory_items SET quantity = ?, updated_at = datetime('now') WHERE id = ?`).run(
                newBal,
                addon.ingredient_id
              );
              db.prepare(
                `INSERT INTO stock_movements (inventory_item_id, product_id, movement_type, quantity_delta, balance_after, reference_id, notes, user_id)
                 VALUES (?, ?, 'sale_deduction', ?, ?, ?, ?, ?)`
              ).run(
                addon.ingredient_id,
                product.id,
                -deduct,
                newBal,
                clientTxId,
                `Addon deduction (${addon.name} x${qty})`,
                req.user!.id
              );
            }
          }
        }
      }

      const discountType = body.discount_type === 'percent' ? 'percent' : 'fixed';
      const discountAmount =
        discountType === 'percent'
          ? Math.min(subtotal, Math.round((subtotal * Math.min(rawDiscount, 100)) / 100))
          : Math.min(subtotal, rawDiscount);

      const discountedSubtotal = Math.max(0, subtotal - discountAmount);
      const taxAmount = Math.round((discountedSubtotal * taxRate) / 100);
      const serviceAmount =
        body.order_type === 'dine_in' ? Math.round((discountedSubtotal * serviceRate) / 100) : 0;
      const totalAmount = discountedSubtotal + taxAmount + serviceAmount;

      const paymentMethod =
        body.payment_method === 'card' || body.payment_method === 'split' ? body.payment_method : 'cash';
      let cashAmount = 0;
      let cardAmount = 0;
      if (paymentMethod === 'cash') {
        cashAmount = totalAmount;
      } else if (paymentMethod === 'card') {
        cardAmount = totalAmount;
      } else {
        cashAmount = Math.max(0, Math.min(totalAmount, Number(body.cash_amount || 0)));
        cardAmount = Math.max(0, totalAmount - cashAmount);
      }

      const maxIdRow = db.prepare('SELECT COALESCE(MAX(id), 0) as m FROM orders').get() as { m: number };
      const orderNumber = `BSL-${1001 + maxIdRow.m}`;
      const orderType =
        body.order_type === 'takeaway' || body.order_type === 'delivery' ? body.order_type : 'dine_in';

      const orderRes = db
        .prepare(
          `INSERT INTO orders (
             order_number, client_tx_id, order_type, table_id, customer_name, customer_phone,
             status, payment_status, payment_method, cash_amount, card_amount,
             subtotal, discount_amount, discount_type, tax_amount, service_charge_amount,
             total_amount, estimated_cost, notes, cashier_id, device_id
           ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 'paid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          orderNumber,
          clientTxId,
          orderType,
          orderType === 'dine_in' ? body.table_id ?? null : null,
          (body.customer_name || '').slice(0, 120),
          (body.customer_phone || '').slice(0, 40),
          paymentMethod,
          cashAmount,
          cardAmount,
          subtotal,
          discountAmount,
          discountType,
          taxAmount,
          serviceAmount,
          totalAmount,
          totalEstimatedCost,
          (body.notes || '').slice(0, 300),
          req.user!.id,
          (body.device_id || 'terminal-1').slice(0, 60)
        );

      const newOrderId = Number(orderRes.lastInsertRowid);

      const insItem = db.prepare(
        `INSERT INTO order_items (
           order_id, product_id, product_name, variation_id, variation_name,
           quantity, unit_price, addons_json, addons_total, line_total, unit_cost, notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (const pi of preparedItems) {
        insItem.run(
          newOrderId,
          pi.product_id,
          pi.product_name,
          pi.variation_id,
          pi.variation_name,
          pi.quantity,
          pi.unit_price,
          JSON.stringify(pi.addons),
          pi.addons_total,
          pi.line_total,
          pi.unit_cost,
          pi.notes
        );
      }

      if (orderType === 'dine_in' && body.table_id) {
        db.prepare(`UPDATE cafe_tables SET status = 'occupied', current_order_id = ? WHERE id = ?`).run(
          newOrderId,
          body.table_id
        );
      }

      return newOrderId;
    })();

    const row = db
      .prepare(
        `SELECT o.*, u.name as cashier_name, t.table_number, t.name as table_name
         FROM orders o
         LEFT JOIN users u ON u.id = o.cashier_id
         LEFT JOIN cafe_tables t ON t.id = o.table_id
         WHERE o.id = ?`
      )
      .get(createdOrderId) as Record<string, unknown>;

    const fullOrder = hydrateOrders([row])[0];

    logAudit(
      req.user!,
      'order_created',
      'order',
      createdOrderId,
      `${fullOrder.order_number} Total: ${fullOrder.total_amount} IQD (${fullOrder.payment_method})`,
      req.ip || ''
    );

    broadcastEvent('order:created', { order: fullOrder });
    broadcastEvent('inventory:updated', { orderId: createdOrderId });
    if (fullOrder.table_id) {
      broadcastEvent('table:updated', { tableId: fullOrder.table_id, status: 'occupied' });
    }

    return res.status(201).json({ order: fullOrder, deduplicated: false });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message || 'Failed to create order' });
  }
});

router.patch('/:id/status', requireAuth, requirePermission('orders.manage'), (req, res) => {
  const orderId = Number(req.params.id);
  const { status } = req.body as { status?: string };
  const allowed = ['pending', 'preparing', 'ready', 'completed'];
  if (!status || !allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid order status' });
  }

  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as
    | { id: number; order_number: string; table_id: number | null; status: string }
    | undefined;
  if (!existing) {
    return res.status(404).json({ error: 'Order not found' });
  }
  if (existing.status === 'cancelled') {
    return res.status(400).json({ error: 'Cannot change status of a cancelled order' });
  }

  db.transaction(() => {
    db.prepare(`UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, orderId);
    if (status === 'completed' && existing.table_id) {
      db.prepare(`UPDATE cafe_tables SET status = 'available', current_order_id = NULL WHERE id = ?`).run(
        existing.table_id
      );
    }
  })();

  const updated = db
    .prepare(
      `SELECT o.*, u.name as cashier_name, t.table_number, t.name as table_name
       FROM orders o
       LEFT JOIN users u ON u.id = o.cashier_id
       LEFT JOIN cafe_tables t ON t.id = o.table_id
       WHERE o.id = ?`
    )
    .get(orderId) as Record<string, unknown>;

  const hydrated = hydrateOrders([updated])[0];
  logAudit(req.user!, 'order_status_updated', 'order', orderId, `${existing.order_number} -> ${status}`, req.ip || '');
  broadcastEvent('order:updated', { order: hydrated });
  if (status === 'completed' && existing.table_id) {
    broadcastEvent('table:updated', { tableId: existing.table_id, status: 'available' });
  }

  return res.json({ order: hydrated });
});

router.post('/:id/cancel', requireAuth, requirePermission('pos.cancel_order'), (req, res) => {
  const orderId = Number(req.params.id);
  const { reason } = req.body as { reason?: string };

  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as
    | { id: number; order_number: string; client_tx_id: string; status: string; table_id: number | null }
    | undefined;

  if (!existing) {
    return res.status(404).json({ error: 'Order not found' });
  }
  if (existing.status === 'cancelled') {
    return res.status(400).json({ error: 'Order is already cancelled' });
  }

  db.transaction(() => {
    db.prepare(
      `UPDATE orders
       SET status = 'cancelled', payment_status = 'refunded', cancelled_by = ?, cancel_reason = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(req.user!.id, (reason || 'Cancelled by authorized staff').slice(0, 200), orderId);

    // Restore stock movements tied to this client_tx_id
    const movements = db
      .prepare(
        `SELECT inventory_item_id, product_id, quantity_delta
         FROM stock_movements
         WHERE reference_id = ? AND movement_type = 'sale_deduction'`
      )
      .all(existing.client_tx_id) as Array<{
      inventory_item_id: number | null;
      product_id: number | null;
      quantity_delta: number;
    }>;

    for (const mv of movements) {
      const restoreQty = Math.abs(mv.quantity_delta);
      if (mv.inventory_item_id) {
        const inv = db
          .prepare('SELECT quantity FROM inventory_items WHERE id = ?')
          .get(mv.inventory_item_id) as { quantity: number } | undefined;
        if (inv) {
          const newBal = Number((inv.quantity + restoreQty).toFixed(3));
          db.prepare(`UPDATE inventory_items SET quantity = ?, updated_at = datetime('now') WHERE id = ?`).run(
            newBal,
            mv.inventory_item_id
          );
          db.prepare(
            `INSERT INTO stock_movements (inventory_item_id, product_id, movement_type, quantity_delta, balance_after, reference_id, notes, user_id)
             VALUES (?, ?, 'cancel_restore', ?, ?, ?, ?, ?)`
          ).run(
            mv.inventory_item_id,
            mv.product_id,
            restoreQty,
            newBal,
            existing.client_tx_id,
            `Restored from cancelled order ${existing.order_number}`,
            req.user!.id
          );
        }
      } else if (mv.product_id) {
        const prod = db
          .prepare('SELECT direct_stock_qty FROM products WHERE id = ?')
          .get(mv.product_id) as { direct_stock_qty: number } | undefined;
        if (prod) {
          const newBal = Number((prod.direct_stock_qty + restoreQty).toFixed(3));
          db.prepare('UPDATE products SET direct_stock_qty = ? WHERE id = ?').run(newBal, mv.product_id);
          db.prepare(
            `INSERT INTO stock_movements (product_id, movement_type, quantity_delta, balance_after, reference_id, notes, user_id)
             VALUES (?, 'cancel_restore', ?, ?, ?, ?, ?)`
          ).run(
            mv.product_id,
            restoreQty,
            newBal,
            existing.client_tx_id,
            `Restored from cancelled order ${existing.order_number}`,
            req.user!.id
          );
        }
      }
    }

    if (existing.table_id) {
      db.prepare(`UPDATE cafe_tables SET status = 'available', current_order_id = NULL WHERE id = ?`).run(
        existing.table_id
      );
    }
  })();

  const updated = db
    .prepare(
      `SELECT o.*, u.name as cashier_name, t.table_number, t.name as table_name
       FROM orders o
       LEFT JOIN users u ON u.id = o.cashier_id
       LEFT JOIN cafe_tables t ON t.id = o.table_id
       WHERE o.id = ?`
    )
    .get(orderId) as Record<string, unknown>;

  const hydrated = hydrateOrders([updated])[0];
  logAudit(req.user!, 'order_cancelled', 'order', orderId, `${existing.order_number}: ${reason || ''}`, req.ip || '');
  broadcastEvent('order:updated', { order: hydrated });
  broadcastEvent('inventory:updated', { orderId });
  if (existing.table_id) {
    broadcastEvent('table:updated', { tableId: existing.table_id, status: 'available' });
  }

  return res.json({ order: hydrated });
});

export default router;
