import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  Coffee,
  RefreshCw,
  Settings,
  ShoppingBag,
  TrendingUp,
  Users,
  Utensils,
  UtensilsCrossed,
} from 'lucide-react';
import type { Language, ShopSettings, User } from '../../types/pos';
import type { NavTab } from '../layout/Sidebar';
import { apiRequest } from '../../lib/api';
import { formatIQD, getLocalizedName, translations } from '../../i18n/translations';
import { posWsClient } from '../../lib/wsClient';

interface DashboardSummary {
  today: { sales: number; orderCount: number; avgOrderValue: number; grossProfit: number };
  yesterday: { sales: number; orderCount: number };
  thisMonth: { sales: number; orderCount: number; grossProfit: number };
  prevMonth: { sales: number; orderCount: number };
  overview: {
    totalRevenue: number;
    totalDiscounts: number;
    netSales: number;
    estimatedProfit: number;
    totalOrders: number;
    totalExpenses: number;
    monthExpenses: number;
    netProfitAfterExpenses: number;
    inventoryValue: number;
    activeOrdersCount: number;
    totalTables: number;
    occupiedTables: number;
    totalStaff: number;
    activeStaff: number;
  };
  dailySeries: Array<{ day: string; sales: number; profit: number; orders: number }>;
  bestSellers: Array<{
    product_id: number;
    product_name: string;
    totalQty: number;
    totalRevenue: number;
  }>;
  recentTransactions: Array<{
    id: number;
    order_number: string;
    order_type: string;
    status: string;
    payment_status: string;
    payment_method: string;
    total_amount: number;
    created_at: string;
    cashier_name: string;
    item_count: number;
  }>;
  lowStockAlerts: Array<{
    id: number;
    sku: string;
    name_ckb: string;
    name_ar: string;
    name_en: string;
    unit: string;
    quantity: number;
    min_threshold: number;
    source_type: 'ingredient' | 'product';
  }>;
}

interface Props {
  lang: Language;
  user: User;
  settings: ShopSettings;
  onNavigateTab: (tab: NavTab) => void;
}

export const DashboardView: React.FC<Props> = ({ lang, user, settings, onNavigateTab }) => {
  const t = translations[lang];
  const currency = settings.currency || 'IQD';
  const isOwner = user.role === 'owner';

  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const loadSummary = useCallback(async () => {
    try {
      const res = await apiRequest<DashboardSummary>('/api/dashboard/summary');
      setData(res);
    } catch {
      // offline mode handled below
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
    const unsub = posWsClient.onMessage((msg) => {
      if (
        msg.type === 'order:created' ||
        msg.type === 'order:updated' ||
        msg.type === 'inventory:updated' ||
        msg.type === 'table:updated'
      ) {
        loadSummary();
      }
    });
    return unsub;
  }, [loadSummary]);

  if (loading && !data) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-[#293B32]/50 border border-[#384E43] animate-pulse" />
          ))}
        </div>
        <div className="h-72 rounded-xl bg-[#293B32]/50 border border-[#384E43] animate-pulse" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-8 text-center">
          <p className="text-sm text-[#D6C7A3] mb-4">{t.serverOffline}</p>
          <button
            type="button"
            onClick={loadSummary}
            className="inline-flex items-center gap-2 rounded-lg bg-[#A7B89A] px-4 py-2 text-sm font-semibold text-[#101A17] cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            {t.retry}
          </button>
        </div>
      </div>
    );
  }

  const pctChange = (current: number, previous: number) => {
    if (previous <= 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const dailyDelta = pctChange(data.today.sales, data.yesterday.sales);
  const monthlyDelta = pctChange(data.thisMonth.sales, data.prevMonth.sales);
  const series = data.dailySeries;
  const maxSales = Math.max(...series.map((s) => s.sales), 1);

  const translateStatus = (status: string) => {
    if (status === 'pending') return t.pending;
    if (status === 'preparing') return t.preparing;
    if (status === 'ready') return t.ready;
    if (status === 'completed') return t.completed;
    if (status === 'cancelled') return t.cancelled;
    return status;
  };

  const quickActions: Array<{
    tab: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    show: boolean;
  }> = isOwner
    ? [
        { tab: 'employees', label: t.navEmployees, icon: Users, show: true },
        { tab: 'reports', label: t.navReports, icon: BarChart3, show: true },
        { tab: 'settings', label: t.navSettings, icon: Settings, show: true },
        { tab: 'inventory', label: t.navInventory, icon: Boxes, show: true },
        { tab: 'products', label: t.navProducts, icon: Coffee, show: true },
        { tab: 'pos', label: t.navPos, icon: ShoppingBag, show: true },
      ]
    : [
        { tab: 'pos', label: t.navPos, icon: ShoppingBag, show: true },
        { tab: 'orders', label: t.navOrders, icon: UtensilsCrossed, show: true },
        { tab: 'tables', label: t.navTables, icon: Utensils, show: true },
        { tab: 'products', label: t.navProducts, icon: Coffee, show: user.permissions.includes('menu.manage') },
        { tab: 'inventory', label: t.navInventory, icon: Boxes, show: user.permissions.includes('inventory.view') },
        { tab: 'reports', label: t.navReports, icon: BarChart3, show: user.permissions.includes('reports.view') },
      ];

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1440px] mx-auto">
      {/* Role Header + Quick Access */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#F3EFE6]">
            {isOwner ? t.ownerOverviewTitle : t.adminOperationsTitle}
          </h2>
          <p className="text-xs text-[#A7B89A] mt-0.5 tabular-nums">
            {user.name} · {t.todaySales}: {formatIQD(data.today.sales, currency)} · {t.activeOrdersLabel}:{' '}
            {data.overview.activeOrdersCount}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {quickActions
            .filter((a) => a.show)
            .map((act) => {
              const Icon = act.icon;
              return (
                <button
                  key={act.tab}
                  type="button"
                  onClick={() => onNavigateTab(act.tab)}
                  className="flex items-center gap-1.5 rounded-lg border border-[#384E43] bg-[#1B2A24] px-3 py-1.5 text-xs font-medium text-[#F3EFE6] hover:border-[#A7B89A] transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Icon className="w-3.5 h-3.5 text-[#D6C7A3]" />
                  <span>{act.label}</span>
                </button>
              );
            })}
        </div>
      </div>

      {/* Role-Specific KPI Grid */}
      {isOwner ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <div className="rounded-xl border border-[#D6C7A3]/35 bg-[#293B32] p-4">
            <div className="text-xs text-[#A7B89A] mb-1">{t.totalRevenue}</div>
            <div className="text-xl font-bold text-[#F3EFE6] tabular-nums">
              {formatIQD(data.overview.totalRevenue, currency)}
            </div>
            <div className="mt-1.5 text-[11px] text-[#A7B89A] tabular-nums">
              {t.todaySales}: {formatIQD(data.today.sales, currency)}
            </div>
          </div>

          <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-4">
            <div className="text-xs text-[#A7B89A] mb-1">{t.netSales}</div>
            <div className="text-xl font-bold text-[#F3EFE6] tabular-nums">
              {formatIQD(data.overview.netSales, currency)}
            </div>
            <div className="mt-1.5 flex items-center gap-1 text-[11px] tabular-nums">
              {monthlyDelta >= 0 ? (
                <ArrowUpRight className="w-3.5 h-3.5 text-[#A7B89A]" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span className={monthlyDelta >= 0 ? 'text-[#A7B89A]' : 'text-amber-300'}>
                {monthlyDelta >= 0 ? `+${monthlyDelta}%` : `${monthlyDelta}%`}
              </span>
              <span className="text-[#F3EFE6]/60">· {t.vsLastMonth}</span>
            </div>
          </div>

          <div className="rounded-xl border border-[#A7B89A]/40 bg-[#293B32] p-4">
            <div className="text-xs text-[#A7B89A] mb-1">{t.estimatedProfit}</div>
            <div className="text-xl font-bold text-[#D6C7A3] tabular-nums">
              {formatIQD(data.overview.netProfitAfterExpenses, currency)}
            </div>
            <div className="mt-1.5 text-[11px] text-[#F3EFE6]/65 tabular-nums">
              {t.grossProfitEst}: {formatIQD(data.overview.estimatedProfit, currency)}
            </div>
          </div>

          <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-4">
            <div className="text-xs text-[#A7B89A] mb-1">{t.totalExpensesLabel}</div>
            <div className="text-xl font-bold text-amber-300 tabular-nums">
              {formatIQD(data.overview.totalExpenses, currency)}
            </div>
            <div className="mt-1.5 text-[11px] text-[#F3EFE6]/65 tabular-nums">
              {t.thisMonthSales}: {formatIQD(data.overview.monthExpenses, currency)}
            </div>
          </div>

          <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-4">
            <div className="text-xs text-[#A7B89A] mb-1">{t.totalOrders}</div>
            <div className="text-xl font-bold text-[#F3EFE6] tabular-nums">{data.overview.totalOrders}</div>
            <div className="mt-1.5 text-[11px] text-[#A7B89A] tabular-nums">
              {t.todayOrders}: {data.today.orderCount} · {t.activeOrdersLabel}: {data.overview.activeOrdersCount}
            </div>
          </div>

          <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-4">
            <div className="text-xs text-[#A7B89A] mb-1">{t.inventoryValue}</div>
            <div className="text-xl font-bold text-[#F3EFE6] tabular-nums">
              {formatIQD(data.overview.inventoryValue, currency)}
            </div>
            <div className="mt-1.5 text-[11px] text-[#D6C7A3] tabular-nums">
              {t.navEmployees}: {data.overview.activeStaff}/{data.overview.totalStaff}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <div className="rounded-xl border border-[#A7B89A]/40 bg-[#293B32] p-5">
            <div className="text-xs text-[#A7B89A] mb-1.5">{t.todaySales}</div>
            <div className="text-2xl font-bold text-[#F3EFE6] tabular-nums">
              {formatIQD(data.today.sales, currency)}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs tabular-nums">
              {dailyDelta >= 0 ? (
                <ArrowUpRight className="w-3.5 h-3.5 text-[#A7B89A]" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span className={dailyDelta >= 0 ? 'text-[#A7B89A]' : 'text-amber-300'}>
                {dailyDelta >= 0 ? `+${dailyDelta}%` : `${dailyDelta}%`}
              </span>
              <span className="text-[#F3EFE6]/60">· {t.vsYesterday}</span>
            </div>
          </div>

          <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-5">
            <div className="text-xs text-[#A7B89A] mb-1.5">{t.activeOrdersLabel}</div>
            <div className="text-2xl font-bold text-[#D6C7A3] tabular-nums">
              {data.overview.activeOrdersCount}
            </div>
            <div className="mt-2 text-xs text-[#F3EFE6]/65">{t.kitchenDisplay}</div>
          </div>

          <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-5">
            <div className="text-xs text-[#A7B89A] mb-1.5">{t.todayOrders}</div>
            <div className="text-2xl font-bold text-[#F3EFE6] tabular-nums">{data.today.orderCount}</div>
            <div className="mt-2 text-xs text-[#F3EFE6]/65 tabular-nums">
              {t.thisMonthSales}: {data.thisMonth.orderCount}
            </div>
          </div>

          <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-5">
            <div className="text-xs text-[#A7B89A] mb-1.5">{t.avgOrderValue}</div>
            <div className="text-2xl font-bold text-[#F3EFE6] tabular-nums">
              {formatIQD(data.today.avgOrderValue, currency)}
            </div>
            <div className="mt-2 text-xs text-[#A7B89A] tabular-nums">
              {t.thisMonthSales}: {formatIQD(data.thisMonth.sales, currency)}
            </div>
          </div>

          <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-5">
            <div className="text-xs text-[#A7B89A] mb-1.5">{t.occupiedTablesLabel}</div>
            <div className="text-2xl font-bold text-[#F3EFE6] tabular-nums">
              {data.overview.occupiedTables} / {data.overview.totalTables}
            </div>
            <div className="mt-2 text-xs text-[#D6C7A3]">{t.tablesFloor}</div>
          </div>
        </div>
      )}

      {/* Main Analytics Split: 14-day Sales Chart + Best Sellers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-[#384E43] bg-[#293B32] p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-base font-semibold text-[#F3EFE6]">{t.salesTrend}</h2>
              <p className="text-xs text-[#A7B89A] mt-0.5">
                {t.todaySales} · {t.grossProfitEst} ({currency})
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('pos')}
              className="rounded-lg bg-[#A7B89A] px-3.5 py-1.5 text-xs font-semibold text-[#101A17] hover:bg-[#b8c8ac] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t.navPos}
            </button>
          </div>

          {series.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-sm text-[#A7B89A]">{t.noSalesYet}</div>
          ) : (
            <div className="relative">
              <div className="h-60 flex items-end gap-1.5 sm:gap-2.5 pt-6 pb-2 border-b border-[#384E43]">
                {series.map((point, idx) => {
                  const totalH = Math.max(8, Math.round((point.sales / maxSales) * 100));
                  const profitH = Math.max(4, Math.round((point.profit / maxSales) * 100));
                  const isHovered = hoveredIdx === idx;
                  return (
                    <div
                      key={point.day}
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                      className="flex-1 h-full flex flex-col justify-end items-center group relative cursor-pointer"
                    >
                      {isHovered && (
                        <div className="absolute -top-2 z-20 -translate-y-full rounded-lg border border-[#384E43] bg-[#101A17] px-2.5 py-1.5 text-[11px] text-[#F3EFE6] shadow-lg whitespace-nowrap pointer-events-none tabular-nums">
                          <div className="font-semibold text-[#D6C7A3]">{point.day}</div>
                          <div>{formatIQD(point.sales, currency)}</div>
                          <div className="text-[#A7B89A]">
                            {point.orders} {t.totalOrders}
                          </div>
                        </div>
                      )}
                      <div className="w-full max-w-[34px] h-full flex items-end justify-center gap-0.5">
                        <div
                          style={{ height: `${totalH}%` }}
                          className={`w-2/3 rounded-t transition-all ${
                            isHovered ? 'bg-[#D6C7A3]' : 'bg-[#A7B89A]'
                          }`}
                        />
                        <div style={{ height: `${profitH}%` }} className="w-1/3 rounded-t bg-[#D6C7A3]/60" />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[11px] text-[#A7B89A] pt-2 tabular-nums">
                <span>{series[0]?.day}</span>
                <span>{series[Math.floor(series.length / 2)]?.day}</span>
                <span>{series[series.length - 1]?.day}</span>
              </div>
            </div>
          )}
        </div>

        {/* Best Selling Products */}
        <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-[#F3EFE6]">{t.bestSelling}</h2>
            <TrendingUp className="w-4 h-4 text-[#D6C7A3]" />
          </div>
          <div className="divide-y divide-[#384E43]">
            {data.bestSellers.map((prod, idx) => (
              <div key={`${prod.product_id}-${idx}`} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[#F3EFE6] truncate">
                    {idx + 1}. {prod.product_name}
                  </div>
                  <div className="text-xs text-[#A7B89A] tabular-nums">
                    {prod.totalQty} {t.units}
                  </div>
                </div>
                <div className="text-sm font-semibold text-[#D6C7A3] tabular-nums shrink-0">
                  {formatIQD(prod.totalRevenue, currency)}
                </div>
              </div>
            ))}
            {data.bestSellers.length === 0 && (
              <p className="py-6 text-xs text-[#A7B89A]">{t.noSalesYet}</p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Split: Recent Transactions & Low Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-[#384E43] bg-[#293B32] p-5 overflow-hidden">
          <h2 className="text-base font-semibold text-[#F3EFE6] mb-4">{t.recentTransactions}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#384E43] text-xs text-[#A7B89A]">
                  <th className="pb-2.5 text-start font-medium">#</th>
                  <th className="pb-2.5 text-start font-medium">{t.orderType}</th>
                  <th className="pb-2.5 text-start font-medium">{t.paymentMethod}</th>
                  <th className="pb-2.5 text-start font-medium">{t.status}</th>
                  <th className="pb-2.5 text-end font-medium">{t.total}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#384E43]/60">
                {data.recentTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-[#1B2A24]/40 transition-colors">
                    <td className="py-2.5 font-medium text-[#F3EFE6] tabular-nums">
                      <div>{tx.order_number}</div>
                      <div className="text-[11px] text-[#A7B89A]">{tx.cashier_name || 'Staff'}</div>
                    </td>
                    <td className="py-2.5 text-[#F3EFE6]/85">
                      {tx.order_type === 'dine_in'
                        ? t.dineIn
                        : tx.order_type === 'takeaway'
                        ? t.takeaway
                        : t.delivery}
                    </td>
                    <td className="py-2.5 text-[#D6C7A3]">
                      {tx.payment_method === 'cash'
                        ? t.cash
                        : tx.payment_method === 'card'
                        ? t.card
                        : t.split}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`text-xs font-medium ${
                          tx.status === 'cancelled'
                            ? 'text-red-300'
                            : tx.status === 'completed'
                            ? 'text-[#A7B89A]'
                            : 'text-[#D6C7A3]'
                        }`}
                      >
                        {translateStatus(tx.status)}
                      </span>
                    </td>
                    <td className="py-2.5 text-end font-semibold text-[#F3EFE6] tabular-nums">
                      {formatIQD(tx.total_amount, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-[#F3EFE6]">{t.lowStockAlerts}</h2>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="divide-y divide-[#384E43]">
            {data.lowStockAlerts.map((item) => (
              <div key={`${item.source_type}-${item.id}`} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[#F3EFE6] truncate">
                    {getLocalizedName(item, lang)}
                  </div>
                  <div className="text-xs text-[#A7B89A] tabular-nums">
                    {item.sku} · {t.thresholdLabel}: {item.min_threshold} {item.unit}
                  </div>
                </div>
                <div className="text-sm font-bold text-amber-300 tabular-nums shrink-0">
                  {item.quantity} {item.unit}
                </div>
              </div>
            ))}
            {data.lowStockAlerts.length === 0 && (
              <p className="py-6 text-xs text-[#A7B89A]">{t.allStockHealthy}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('inventory')}
            className="mt-4 w-full rounded-lg border border-[#384E43] bg-[#1B2A24] py-2 text-xs font-medium text-[#F3EFE6] hover:border-[#A7B89A] transition-colors cursor-pointer"
          >
            {t.navInventory}
          </button>
        </div>
      </div>
    </div>
  );
};
