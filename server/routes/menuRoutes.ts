import crypto from 'crypto';
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { db, getPaths } from '../db.ts';
import { logAudit, requireAuth, requirePermission } from '../auth.ts';
import { broadcastEvent } from '../ws.ts';

const router = Router();
const { UPLOADS_DIR } = getPaths();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
    cb(null, `product-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.get('/catalog', requireAuth, (req, res) => {
  const includeInactive = req.query.include_inactive === '1' || req.query.include_inactive === 'true';
  const categories = db
    .prepare(
      `SELECT * FROM categories ${includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY sort_order ASC, id ASC`
    )
    .all();

  const products = db
    .prepare(
      `SELECT p.*, c.name_ckb as category_name_ckb, c.name_ar as category_name_ar, c.name_en as category_name_en
       FROM products p
       JOIN categories c ON c.id = p.category_id
       ${includeInactive ? '' : 'WHERE p.is_active = 1'}
       ORDER BY c.sort_order ASC, p.id ASC`
    )
    .all() as Array<Record<string, unknown>>;

  const variations = db.prepare('SELECT * FROM product_variations ORDER BY is_default DESC, id ASC').all() as Array<
    Record<string, unknown>
  >;

  const recipes = db
    .prepare(
      `SELECT pr.*, ii.name_en as ingredient_name_en, ii.name_ckb as ingredient_name_ckb, ii.name_ar as ingredient_name_ar, ii.unit
       FROM product_recipes pr
       JOIN inventory_items ii ON ii.id = pr.inventory_item_id`
    )
    .all() as Array<Record<string, unknown>>;

  const addons = db.prepare('SELECT * FROM addons WHERE is_active = 1 ORDER BY id ASC').all();

  const varByProduct = new Map<number, Array<Record<string, unknown>>>();
  for (const v of variations) {
    const pid = Number(v.product_id);
    if (!varByProduct.has(pid)) varByProduct.set(pid, []);
    varByProduct.get(pid)!.push(v);
  }

  const recByProduct = new Map<number, Array<Record<string, unknown>>>();
  for (const r of recipes) {
    const pid = Number(r.product_id);
    if (!recByProduct.has(pid)) recByProduct.set(pid, []);
    recByProduct.get(pid)!.push(r);
  }

  const hydratedProducts = products.map((p) => ({
    ...p,
    variations: varByProduct.get(Number(p.id)) || [],
    recipes: recByProduct.get(Number(p.id)) || [],
  }));

  return res.json({ categories, products: hydratedProducts, addons });
});

router.post('/upload-image', requireAuth, requirePermission('menu.manage'), upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded' });
  }
  return res.json({ imageUrl: `/uploads/${req.file.filename}` });
});

router.post('/categories', requireAuth, requirePermission('menu.manage'), (req, res) => {
  const { name_ckb, name_ar, name_en, sort_order } = req.body as Record<string, string | number>;
  if (!name_en) {
    return res.status(400).json({ error: 'English category name is required' });
  }
  const result = db
    .prepare(
      `INSERT INTO categories (name_ckb, name_ar, name_en, sort_order, is_active) VALUES (?, ?, ?, ?, 1)`
    )
    .run(String(name_ckb || name_en), String(name_ar || name_en), String(name_en), Number(sort_order || 10));

  const created = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
  logAudit(req.user!, 'category_created', 'category', Number(result.lastInsertRowid), String(name_en), req.ip || '');
  broadcastEvent('menu:updated', { type: 'category' });
  return res.status(201).json({ category: created });
});

router.put('/categories/:id', requireAuth, requirePermission('menu.manage'), (req, res) => {
  const id = Number(req.params.id);
  const { name_ckb, name_ar, name_en, sort_order, is_active } = req.body as Record<string, string | number | boolean>;
  if (!name_en) return res.status(400).json({ error: 'English category name is required' });
  db.prepare(
    `UPDATE categories SET name_ckb = ?, name_ar = ?, name_en = ?, sort_order = ?, is_active = ? WHERE id = ?`
  ).run(
    String(name_ckb || name_en),
    String(name_ar || name_en),
    String(name_en),
    Number(sort_order ?? 10),
    is_active === false || is_active === 0 ? 0 : 1,
    id
  );
  logAudit(req.user!, 'category_updated', 'category', id, String(name_en), req.ip || '');
  broadcastEvent('menu:updated', { type: 'category' });
  return res.json({ ok: true });
});

router.delete('/categories/:id', requireAuth, requirePermission('menu.manage'), (req, res) => {
  const id = Number(req.params.id);
  const inUse = db.prepare('SELECT COUNT(*) as c FROM products WHERE category_id = ? AND is_active = 1').get(id) as {
    c: number;
  };
  if (inUse.c > 0) {
    return res.status(400).json({ error: 'Cannot delete a category with active products' });
  }
  db.prepare('UPDATE categories SET is_active = 0 WHERE id = ?').run(id);
  logAudit(req.user!, 'category_deactivated', 'category', id, '', req.ip || '');
  broadcastEvent('menu:updated', { type: 'category' });
  return res.json({ ok: true });
});

router.post('/products', requireAuth, requirePermission('menu.manage'), (req, res) => {
  const {
    category_id,
    sku,
    barcode,
    name_ckb,
    name_ar,
    name_en,
    description_ckb,
    description_ar,
    description_en,
    base_price,
    cost_estimate,
    image_url,
    is_available,
    track_direct_stock,
    direct_stock_qty,
    low_stock_threshold,
    variations,
    recipes,
  } = req.body as {
    category_id: number;
    sku: string;
    barcode?: string;
    name_ckb: string;
    name_ar: string;
    name_en: string;
    description_ckb?: string;
    description_ar?: string;
    description_en?: string;
    base_price: number;
    cost_estimate?: number;
    image_url?: string;
    is_available?: boolean;
    track_direct_stock?: boolean;
    direct_stock_qty?: number;
    low_stock_threshold?: number;
    variations?: Array<{
      name_ckb: string;
      name_ar: string;
      name_en: string;
      price_delta: number;
      recipe_multiplier: number;
      is_default?: boolean;
    }>;
    recipes?: Array<{ inventory_item_id: number; quantity_required: number }>;
  };

  if (!category_id || !name_en || base_price == null) {
    return res.status(400).json({ error: 'Category, name, and base price are required' });
  }

  const finalSku = (sku || `BSL-${Date.now().toString().slice(-5)}`).trim();

  try {
    const productId = db.transaction(() => {
      const resInsert = db
        .prepare(
          `INSERT INTO products (
             category_id, sku, barcode, name_ckb, name_ar, name_en,
             description_ckb, description_ar, description_en,
             base_price, cost_estimate, image_url, is_available, is_active,
             track_direct_stock, direct_stock_qty, low_stock_threshold
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
        )
        .run(
          Number(category_id),
          finalSku,
          barcode || finalSku,
          name_ckb || name_en,
          name_ar || name_en,
          name_en,
          description_ckb || '',
          description_ar || '',
          description_en || '',
          Number(base_price),
          Number(cost_estimate || 0),
          image_url || '',
          is_available === false ? 0 : 1,
          track_direct_stock ? 1 : 0,
          Number(direct_stock_qty || 0),
          Number(low_stock_threshold || 5)
        );

      const pid = Number(resInsert.lastInsertRowid);

      const insVar = db.prepare(
        `INSERT INTO product_variations (product_id, name_ckb, name_ar, name_en, price_delta, recipe_multiplier, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      if (Array.isArray(variations) && variations.length > 0) {
        variations.forEach((v, idx) => {
          insVar.run(
            pid,
            v.name_ckb || v.name_en,
            v.name_ar || v.name_en,
            v.name_en,
            Number(v.price_delta || 0),
            Number(v.recipe_multiplier || 1),
            v.is_default || idx === 0 ? 1 : 0
          );
        });
      } else {
        insVar.run(pid, 'ستاندارد', 'قياسي', 'Regular', 0, 1.0, 1);
      }

      if (Array.isArray(recipes)) {
        const insRec = db.prepare(
          `INSERT INTO product_recipes (product_id, inventory_item_id, quantity_required) VALUES (?, ?, ?)`
        );
        for (const r of recipes) {
          if (r.inventory_item_id && r.quantity_required > 0) {
            insRec.run(pid, Number(r.inventory_item_id), Number(r.quantity_required));
          }
        }
      }

      return pid;
    })();

    logAudit(req.user!, 'product_created', 'product', productId, name_en, req.ip || '');
    broadcastEvent('menu:updated', { productId });
    return res.status(201).json({ id: productId });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

router.put('/products/:id', requireAuth, requirePermission('menu.manage'), (req, res) => {
  const pid = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(pid);
  if (!existing) return res.status(404).json({ error: 'Product not found' });

  const {
    category_id,
    sku,
    barcode,
    name_ckb,
    name_ar,
    name_en,
    description_ckb,
    description_ar,
    description_en,
    base_price,
    cost_estimate,
    image_url,
    is_available,
    track_direct_stock,
    direct_stock_qty,
    low_stock_threshold,
    variations,
    recipes,
  } = req.body as Record<string, unknown>;

  try {
    db.transaction(() => {
      db.prepare(
        `UPDATE products SET
           category_id = ?, sku = ?, barcode = ?, name_ckb = ?, name_ar = ?, name_en = ?,
           description_ckb = ?, description_ar = ?, description_en = ?,
           base_price = ?, cost_estimate = ?, image_url = ?, is_available = ?,
           track_direct_stock = ?, direct_stock_qty = ?, low_stock_threshold = ?
         WHERE id = ?`
      ).run(
        Number(category_id),
        String(sku),
        String(barcode || sku),
        String(name_ckb || name_en),
        String(name_ar || name_en),
        String(name_en),
        String(description_ckb || ''),
        String(description_ar || ''),
        String(description_en || ''),
        Number(base_price),
        Number(cost_estimate || 0),
        String(image_url || ''),
        is_available ? 1 : 0,
        track_direct_stock ? 1 : 0,
        Number(direct_stock_qty || 0),
        Number(low_stock_threshold || 5),
        pid
      );

      if (Array.isArray(variations)) {
        db.prepare('DELETE FROM product_variations WHERE product_id = ?').run(pid);
        const insVar = db.prepare(
          `INSERT INTO product_variations (product_id, name_ckb, name_ar, name_en, price_delta, recipe_multiplier, is_default)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        );
        variations.forEach((v: Record<string, unknown>, idx: number) => {
          insVar.run(
            pid,
            String(v.name_ckb || v.name_en),
            String(v.name_ar || v.name_en),
            String(v.name_en),
            Number(v.price_delta || 0),
            Number(v.recipe_multiplier || 1),
            v.is_default || idx === 0 ? 1 : 0
          );
        });
      }

      if (Array.isArray(recipes)) {
        db.prepare('DELETE FROM product_recipes WHERE product_id = ?').run(pid);
        const insRec = db.prepare(
          `INSERT INTO product_recipes (product_id, inventory_item_id, quantity_required) VALUES (?, ?, ?)`
        );
        for (const r of recipes as Array<{ inventory_item_id: number; quantity_required: number }>) {
          if (r.inventory_item_id && r.quantity_required > 0) {
            insRec.run(pid, Number(r.inventory_item_id), Number(r.quantity_required));
          }
        }
      }
    })();

    logAudit(req.user!, 'product_updated', 'product', pid, String(name_en), req.ip || '');
    broadcastEvent('menu:updated', { productId: pid });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

router.patch('/products/:id/availability', requireAuth, requirePermission('menu.manage'), (req, res) => {
  const pid = Number(req.params.id);
  const { is_available } = req.body as { is_available: boolean };
  db.prepare('UPDATE products SET is_available = ? WHERE id = ?').run(is_available ? 1 : 0, pid);
  broadcastEvent('menu:updated', { productId: pid });
  return res.json({ ok: true });
});

router.patch('/products/:id/active', requireAuth, requirePermission('menu.manage'), (req, res) => {
  const pid = Number(req.params.id);
  const { is_active } = req.body as { is_active: boolean };
  db.prepare('UPDATE products SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, pid);
  logAudit(req.user!, is_active ? 'product_activated' : 'product_deactivated', 'product', pid, '', req.ip || '');
  broadcastEvent('menu:updated', { productId: pid });
  return res.json({ ok: true });
});

router.delete('/products/:id', requireAuth, requirePermission('menu.manage'), (req, res) => {
  const pid = Number(req.params.id);
  const permanent = req.query.permanent === '1' || req.query.permanent === 'true';
  if (permanent) {
    db.prepare('DELETE FROM products WHERE id = ?').run(pid);
    logAudit(req.user!, 'product_deleted', 'product', pid, 'Permanent removal', req.ip || '');
  } else {
    db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(pid);
    logAudit(req.user!, 'product_deactivated', 'product', pid, '', req.ip || '');
  }
  broadcastEvent('menu:updated', { productId: pid });
  return res.json({ ok: true });
});

router.post('/addons', requireAuth, requirePermission('menu.manage'), (req, res) => {
  const { name_ckb, name_ar, name_en, price, ingredient_id, ingredient_qty } = req.body as Record<
    string,
    string | number | null
  >;
  if (!name_en) return res.status(400).json({ error: 'Add-on name is required' });
  const result = db
    .prepare(
      `INSERT INTO addons (name_ckb, name_ar, name_en, price, ingredient_id, ingredient_qty, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`
    )
    .run(
      String(name_ckb || name_en),
      String(name_ar || name_en),
      String(name_en),
      Number(price || 0),
      ingredient_id ? Number(ingredient_id) : null,
      Number(ingredient_qty || 0)
    );
  broadcastEvent('menu:updated', { addonId: Number(result.lastInsertRowid) });
  return res.status(201).json({ id: Number(result.lastInsertRowid) });
});

router.delete('/addons/:id', requireAuth, requirePermission('menu.manage'), (req, res) => {
  db.prepare('UPDATE addons SET is_active = 0 WHERE id = ?').run(Number(req.params.id));
  broadcastEvent('menu:updated', { type: 'addon' });
  return res.json({ ok: true });
});

export default router;
