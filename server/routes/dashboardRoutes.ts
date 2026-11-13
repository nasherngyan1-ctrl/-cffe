import { Router } from 'express';
import { db } from '../db.ts';
import { requireAuth, requirePermission } from '../auth.ts';

const router = Router();

router.get('/summary', requireAuth, requirePermission('dashboard.view'), (_req, res) => {
  // Today KPIs
  const todayStats = db
    .prepare(
      `SELECT
         COALESCE(SUM(total_amount), 0) as sales,
         COUNT(*) as orderCount,
         COALESCE(AVG(total_amount), 0) as avgOrderValue,
         COALESCE(SUM(total_amount - estimated_cost), 0) as grossProfit
       FROM orders
       WHERE status != 'cancelled'
         AND date(created_at) = date('now', 'localtime')`
    )
    .get() as { sales: number; orderCount: number; avgOrderValue: number; grossProfit: number };

  // Yesterday KPIs for daily comparison
  const yesterdayStats = db
    .prepare(
      `SELECT
         COALESCE(SUM(total_amount), 0) as sales,
         COUNT(*) as orderCount
       FROM orders
       WHERE status != 'cancelled'
         AND date(created_at) = date('now', 'localtime', '-1 day')`
    )
    .get() as { sales: number; orderCount: number };

  // This month vs last month
  const thisMonthStats = db
    .prepare(
      `SELECT
         COALESCE(SUM(total_amount), 0) as sales,
         COUNT(*) as orderCount,
         COALESCE(SUM(total_amount - estimated_cost), 0) as grossProfit
       FROM orders
       WHERE status != 'cancelled'
         AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')`
    )
    .get() as { sales: number; orderCount: number; grossProfit: number };

  const prevMonthStats = db
    .prepare(
      `SELECT
         COALESCE(SUM(total_amount), 0) as sales,
         COUNT(*) as orderCount
       FROM orders
       WHERE status != 'cancelled'
         AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime', '-1 month')`
    )
    .get() as { sales: number; orderCount: number };

  // Overall business totals for Owner Executive Overview
  const overallOrders = db
    .prepare(
      `SELECT
         COALESCE(SUM(subtotal), 0) as totalRevenue,
         COALESCE(SUM(discount_amount), 0) as totalDiscounts,
         COALESCE(SUM(total_amount), 0) as netSales,
         COALESCE(SUM(total_amount - estimated_cost), 0) as estimatedProfit,
         COUNT(*) as totalOrders
       FROM orders
       WHERE status != 'cancelled'`
    )
    .get() as {
    totalRevenue: number;
    totalDiscounts: number;
    netSales: number;
    estimatedProfit: number;
    totalOrders: number;
  };

  const expenseStats = db
    .prepare(
      `SELECT
         COALESCE(SUM(amount), 0) as totalExpenses,
         COALESCE(SUM(CASE WHEN strftime('%Y-%m', expense_date) = strftime('%Y-%m', 'now', 'localtime') THEN amount ELSE 0 END), 0) as monthExpenses
       FROM expenses`
    )
    .get() as { totalExpenses: number; monthExpenses: number };

  const rawInvVal = db
    .prepare(`SELECT COALESCE(SUM(quantity * unit_cost), 0) as val FROM inventory_items`)
    .get() as { val: number };

  const directProdVal = db
    .prepare(
      `SELECT COALESCE(SUM(direct_stock_qty * cost_estimate), 0) as val
       FROM products
       WHERE is_active = 1 AND track_direct_stock = 1`
    )
    .get() as { val: number };

  const activeOrdersRow = db
    .prepare(`SELECT COUNT(*) as c FROM orders WHERE status IN ('pending', 'preparing', 'ready')`)
    .get() as { c: number };

  const tableOccupancy = db
    .prepare(
      `SELECT
         COUNT(*) as totalTables,
         COALESCE(SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END), 0) as occupiedTables
       FROM cafe_tables`
    )
    .get() as { totalTables: number; occupiedTables: number };

  const staffCountRow = db
    .prepare(`SELECT COUNT(*) as totalStaff, COALESCE(SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END), 0) as activeStaff FROM users`)
    .get() as { totalStaff: number; activeStaff: number };

  // 14-day daily sales series for chart
  const dailySeries = db
    .prepare(
      `SELECT
         date(created_at) as day,
         COALESCE(SUM(total_amount), 0) as sales,
         COALESCE(SUM(total_amount - estimated_cost), 0) as profit,
         COUNT(*) as orders
       FROM orders
       WHERE status != 'cancelled'
         AND date(created_at) >= date('now', 'localtime', '-13 days')
       GROUP BY date(created_at)
       ORDER BY day ASC`
    )
    .all() as Array<{ day: string; sales: number; profit: number; orders: number }>;

  // Best-selling products (last 30 days)
  const bestSellers = db
    .prepare(
      `SELECT
         oi.product_id,
         oi.product_name,
         SUM(oi.quantity) as totalQty,
         COALESCE(SUM(oi.line_total), 0) as totalRevenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status != 'cancelled'
         AND date(o.created_at) >= date('now', 'localtime', '-30 days')
       GROUP BY oi.product_id, oi.product_name
       ORDER BY totalQty DESC
       LIMIT 6`
    )
    .all();

  // Recent transactions
  const recentTransactions = db
    .prepare(
      `SELECT
         o.id, o.order_number, o.order_type, o.status, o.payment_status, o.payment_method,
         o.total_amount, o.created_at, u.name as cashier_name,
         (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count
       FROM orders o
       LEFT JOIN users u ON u.id = o.cashier_id
       ORDER BY o.created_at DESC, o.id DESC
       LIMIT 10`
    )
    .all();

  // Low stock alerts (raw materials / ingredients + direct stock retail products)
  const lowStockIngredients = db
    .prepare(
      `SELECT id, sku, name_ckb, name_ar, name_en, unit, quantity, min_threshold, 'ingredient' as source_type
       FROM inventory_items
       WHERE quantity <= min_threshold
       ORDER BY (quantity / MAX(min_threshold, 1)) ASC`
    )
    .all();

  const lowStockProducts = db
    .prepare(
      `SELECT id, sku, name_ckb, name_ar, name_en, 'pcs' as unit, direct_stock_qty as quantity, low_stock_threshold as min_threshold, 'product' as source_type
       FROM products
       WHERE is_active = 1 AND track_direct_stock = 1 AND direct_stock_qty <= low_stock_threshold`
    )
    .all();

  return res.json({
    today: todayStats,
    yesterday: yesterdayStats,
    thisMonth: thisMonthStats,
    prevMonth: prevMonthStats,
    overview: {
      totalRevenue: overallOrders.totalRevenue,
      totalDiscounts: overallOrders.totalDiscounts,
      netSales: overallOrders.netSales,
      estimatedProfit: overallOrders.estimatedProfit,
      totalOrders: overallOrders.totalOrders,
      totalExpenses: expenseStats.totalExpenses,
      monthExpenses: expenseStats.monthExpenses,
      netProfitAfterExpenses: overallOrders.estimatedProfit - expenseStats.totalExpenses,
      inventoryValue: Math.round(rawInvVal.val + directProdVal.val),
      activeOrdersCount: activeOrdersRow.c,
      totalTables: tableOccupancy.totalTables,
      occupiedTables: tableOccupancy.occupiedTables,
      totalStaff: staffCountRow.totalStaff,
      activeStaff: staffCountRow.activeStaff,
    },
    dailySeries,
    bestSellers,
    recentTransactions,
    lowStockAlerts: [...lowStockIngredients, ...lowStockProducts],
  });
});

export default router;
