import { Router } from 'express';
import { db } from '../db.ts';
import { logAudit, requireAuth, requirePermission } from '../auth.ts';

const router = Router();

router.get('/analytics', requireAuth, requirePermission('reports.view'), (req, res) => {
  const {
    period = 'daily',
    date_from,
    date_to,
  } = req.query as { period?: string; date_from?: string; date_to?: string };

  const fromDate = date_from || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const toDate = date_to || new Date().toISOString().slice(0, 10);

  let groupExpr = `date(o.created_at)`;
  if (period === 'weekly') groupExpr = `strftime('%Y-W%W', o.created_at)`;
  else if (period === 'monthly') groupExpr = `strftime('%Y-%m', o.created_at)`;
  else if (period === 'annual') groupExpr = `strftime('%Y', o.created_at)`;

  const salesSeries = db
    .prepare(
      `SELECT
         ${groupExpr} as bucket,
         COUNT(*) as orderCount,
         COALESCE(SUM(o.subtotal), 0) as grossSales,
         COALESCE(SUM(o.discount_amount), 0) as discounts,
         COALESCE(SUM(o.tax_amount), 0) as taxTotal,
         COALESCE(SUM(o.total_amount), 0) as netSales,
         COALESCE(SUM(o.estimated_cost), 0) as cogs,
         COALESCE(SUM(o.total_amount - o.estimated_cost), 0) as grossProfit
       FROM orders o
       WHERE o.status != 'cancelled'
         AND date(o.created_at) >= date(?)
         AND date(o.created_at) <= date(?)
       GROUP BY bucket
       ORDER BY bucket ASC`
    )
    .all(fromDate, toDate);

  const productPerformance = db
    .prepare(
      `SELECT
         oi.product_id,
         oi.product_name,
         SUM(oi.quantity) as unitsSold,
         COALESCE(SUM(oi.line_total), 0) as revenue,
         COALESCE(SUM(oi.unit_cost * oi.quantity), 0) as estCost,
         COALESCE(SUM(oi.line_total - (oi.unit_cost * oi.quantity)), 0) as estProfit
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status != 'cancelled'
         AND date(o.created_at) >= date(?)
         AND date(o.created_at) <= date(?)
       GROUP BY oi.product_id, oi.product_name
       ORDER BY revenue DESC`
    )
    .all(fromDate, toDate);

  const categoryPerformance = db
    .prepare(
      `SELECT
         COALESCE(c.name_en, 'Uncategorized') as category_en,
         COALESCE(c.name_ckb, 'جۆرەکان') as category_ckb,
         COALESCE(c.name_ar, 'الأصناف') as category_ar,
         SUM(oi.quantity) as unitsSold,
         COALESCE(SUM(oi.line_total), 0) as revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE o.status != 'cancelled'
         AND date(o.created_at) >= date(?)
         AND date(o.created_at) <= date(?)
       GROUP BY c.id
       ORDER BY revenue DESC`
    )
    .all(fromDate, toDate);

  const paymentMethods = db
    .prepare(
      `SELECT
         payment_method,
         COUNT(*) as orderCount,
         COALESCE(SUM(total_amount), 0) as totalAmount,
         COALESCE(SUM(cash_amount), 0) as cashTotal,
         COALESCE(SUM(card_amount), 0) as cardTotal
       FROM orders
       WHERE status != 'cancelled'
         AND date(created_at) >= date(?)
         AND date(created_at) <= date(?)
       GROUP BY payment_method`
    )
    .all(fromDate, toDate);

  const inventoryUsage = db
    .prepare(
      `SELECT
         ii.id, ii.sku, ii.name_en, ii.name_ckb, ii.name_ar, ii.unit,
         COALESCE(SUM(CASE WHEN sm.movement_type = 'sale_deduction' THEN ABS(sm.quantity_delta) ELSE 0 END), 0) as usedInSales,
         COALESCE(SUM(CASE WHEN sm.movement_type = 'waste' THEN ABS(sm.quantity_delta) ELSE 0 END), 0) as wastedQty,
         COALESCE(SUM(CASE WHEN sm.movement_type = 'purchase' THEN sm.quantity_delta ELSE 0 END), 0) as purchasedQty,
         ii.quantity as currentStock
       FROM inventory_items ii
       LEFT JOIN stock_movements sm ON sm.inventory_item_id = ii.id
         AND date(sm.created_at) >= date(?) AND date(sm.created_at) <= date(?)
       GROUP BY ii.id
       ORDER BY usedInSales DESC`
    )
    .all(fromDate, toDate);

  const cashierPerformance = db
    .prepare(
      `SELECT
         u.id, u.name, u.role,
         COUNT(o.id) as ordersHandled,
         COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total_amount ELSE 0 END), 0) as totalSales,
         COALESCE(SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END), 0) as cancelledCount
       FROM users u
       LEFT JOIN orders o ON o.cashier_id = u.id
         AND date(o.created_at) >= date(?) AND date(o.created_at) <= date(?)
       GROUP BY u.id
       ORDER BY totalSales DESC`
    )
    .all(fromDate, toDate);

  const expenses = db
    .prepare(
      `SELECT e.*, u.name as recorded_by_name
       FROM expenses e
       LEFT JOIN users u ON u.id = e.recorded_by
       WHERE date(e.expense_date) >= date(?) AND date(e.expense_date) <= date(?)
       ORDER BY e.expense_date DESC, e.id DESC`
    )
    .all(fromDate, toDate);

  const summary = db
    .prepare(
      `SELECT
         COUNT(*) as totalOrders,
         COALESCE(SUM(total_amount), 0) as totalRevenue,
         COALESCE(SUM(estimated_cost), 0) as totalCogs,
         COALESCE(SUM(total_amount - estimated_cost), 0) as grossProfit,
         COALESCE(AVG(total_amount), 0) as avgOrderValue
       FROM orders
       WHERE status != 'cancelled'
         AND date(created_at) >= date(?) AND date(created_at) <= date(?)`
    )
    .get(fromDate, toDate) as {
    totalOrders: number;
    totalRevenue: number;
    totalCogs: number;
    grossProfit: number;
    avgOrderValue: number;
  };

  const expenseSumRow = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) as totalExpenses
       FROM expenses
       WHERE date(expense_date) >= date(?) AND date(expense_date) <= date(?)`
    )
    .get(fromDate, toDate) as { totalExpenses: number };

  return res.json({
    range: { fromDate, toDate, period },
    summary: {
      ...summary,
      totalExpenses: expenseSumRow.totalExpenses,
      netEstimatedProfit: summary.grossProfit - expenseSumRow.totalExpenses,
    },
    salesSeries,
    productPerformance,
    categoryPerformance,
    paymentMethods,
    inventoryUsage,
    cashierPerformance,
    expenses,
  });
});

router.post('/expenses', requireAuth, requirePermission('reports.view'), (req, res) => {
  const { category, title, amount, notes, expense_date } = req.body as {
    category: string;
    title: string;
    amount: number;
    notes?: string;
    expense_date?: string;
  };
  if (!title || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Expense title and positive amount are required' });
  }
  const result = db
    .prepare(
      `INSERT INTO expenses (category, title, amount, notes, recorded_by, expense_date)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      category || 'General',
      title,
      Number(amount),
      notes || '',
      req.user!.id,
      expense_date || new Date().toISOString().slice(0, 10)
    );
  logAudit(req.user!, 'expense_recorded', 'expense', Number(result.lastInsertRowid), `${title}: ${amount} IQD`, req.ip || '');
  return res.status(201).json({ id: Number(result.lastInsertRowid) });
});

router.delete('/expenses/:id', requireAuth, requirePermission('reports.export'), (req, res) => {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(Number(req.params.id));
  return res.json({ ok: true });
});

export default router;
