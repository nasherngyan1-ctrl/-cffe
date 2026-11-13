import React, { useCallback, useEffect, useState } from 'react';
import { Download, Plus, Printer, Trash2, X } from 'lucide-react';
import type { Expense, Language, ShopSettings, User } from '../../types/pos';
import { apiRequest } from '../../lib/api';
import { formatIQD, getLocalizedName, translations } from '../../i18n/translations';

interface AnalyticsPayload {
  range: { fromDate: string; toDate: string; period: string };
  summary: {
    totalOrders: number;
    totalRevenue: number;
    totalCogs: number;
    grossProfit: number;
    avgOrderValue: number;
    totalExpenses: number;
    netEstimatedProfit: number;
  };
  salesSeries: Array<{
    bucket: string;
    orderCount: number;
    grossSales: number;
    discounts: number;
    taxTotal: number;
    netSales: number;
    cogs: number;
    grossProfit: number;
  }>;
  productPerformance: Array<{
    product_id: number;
    product_name: string;
    unitsSold: number;
    revenue: number;
    estCost: number;
    estProfit: number;
  }>;
  categoryPerformance: Array<{
    category_en: string;
    category_ckb: string;
    category_ar: string;
    unitsSold: number;
    revenue: number;
  }>;
  paymentMethods: Array<{
    payment_method: string;
    orderCount: number;
    totalAmount: number;
    cashTotal: number;
    cardTotal: number;
  }>;
  inventoryUsage: Array<{
    id: number;
    sku: string;
    name_en: string;
    name_ckb: string;
    name_ar: string;
    unit: string;
    usedInSales: number;
    wastedQty: number;
    purchasedQty: number;
    currentStock: number;
  }>;
  cashierPerformance: Array<{
    id: number;
    name: string;
    role: string;
    ordersHandled: number;
    totalSales: number;
    cancelledCount: number;
  }>;
  expenses: Expense[];
}

interface Props {
  lang: Language;
  user: User;
  settings: ShopSettings;
}

export const ReportsView: React.FC<Props> = ({ lang, user, settings }) => {
  const t = translations[lang];
  const currency = settings.currency || 'IQD';
  const canExport = user.role === 'owner' || user.permissions.includes('reports.export');

  const todayStr = new Date().toISOString().slice(0, 10);
  const thirtyAgo = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);

  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'annual'>('daily');
  const [dateFrom, setDateFrom] = useState(thirtyAgo);
  const [dateTo, setDateTo] = useState(todayStr);
  const [reportTab, setReportTab] = useState<
    'sales' | 'products' | 'inventory' | 'cashiers' | 'expenses'
  >('sales');
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [expForm, setExpForm] = useState({
    category: 'Supplies',
    title: '',
    amount: 0,
    notes: '',
    expense_date: todayStr,
  });

  const loadAnalytics = useCallback(async () => {
    try {
      const res = await apiRequest<AnalyticsPayload>(
        `/api/reports/analytics?period=${period}&date_from=${dateFrom}&date_to=${dateTo}`
      );
      setData(res);
    } catch {
      // offline
    }
  }, [period, dateFrom, dateTo]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const handleExportCsv = () => {
    if (!data) return;
    const rows: string[][] = [
      ['BASLUNE POS Report', `${dateFrom} to ${dateTo}`, `Period: ${period}`],
      [],
      ['Bucket', 'Orders', 'Gross Sales', 'Discounts', 'Net Sales', 'Est. COGS', 'Gross Profit'],
      ...data.salesSeries.map((r) => [
        r.bucket,
        String(r.orderCount),
        String(r.grossSales),
        String(r.discounts),
        String(r.netSales),
        String(r.cogs),
        String(r.grossProfit),
      ]),
      [],
      ['Product', 'Units Sold', 'Revenue', 'Est. Cost', 'Est. Profit'],
      ...data.productPerformance.map((p) => [
        p.product_name,
        String(p.unitsSold),
        String(p.revenue),
        String(p.estCost),
        String(p.estProfit),
      ]),
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `baslune-report-${period}-${dateFrom}-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      await apiRequest('/api/reports/expenses', { method: 'POST', body: JSON.stringify(expForm) });
      setExpForm({ category: 'Supplies', title: '', amount: 0, notes: '', expense_date: todayStr });
      loadAnalytics();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1440px] mx-auto space-y-5">
      {/* Filters & Export Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-[#1B2A24] p-1 rounded-lg border border-[#2F443A]">
            {(['daily', 'weekly', 'monthly', 'annual'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize cursor-pointer ${
                  period === p ? 'bg-[#A7B89A] text-[#101A17] font-semibold' : 'text-[#F3EFE6]/75'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-[#384E43] bg-[#1B2A24] px-3 py-1.5 text-xs text-[#F3EFE6] tabular-nums"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-[#384E43] bg-[#1B2A24] px-3 py-1.5 text-xs text-[#F3EFE6] tabular-nums"
          />
        </div>

        {canExport && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 rounded-lg border border-[#384E43] bg-[#293B32] px-3.5 py-2 text-xs font-medium text-[#F3EFE6] hover:border-[#A7B89A] cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[#A7B89A]" />
              <span>{t.exportCsv}</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg bg-[#A7B89A] px-3.5 py-2 text-xs font-semibold text-[#101A17] hover:bg-[#b8c8ac] cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{t.exportPdf}</span>
            </button>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-400/40 bg-red-950/50 px-4 py-2.5 text-xs text-red-200 flex items-center justify-between no-print">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg('')} className="text-red-300 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {data && (
        <>
          {/* Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
            <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-4">
              <div className="text-[11px] text-[#A7B89A]">{t.totalRevenue}</div>
              <div className="text-lg font-bold text-[#F3EFE6] tabular-nums mt-1">
                {formatIQD(data.summary.totalRevenue, currency)}
              </div>
            </div>
            <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-4">
              <div className="text-[11px] text-[#A7B89A]">Est. COGS</div>
              <div className="text-lg font-bold text-[#F3EFE6] tabular-nums mt-1">
                {formatIQD(data.summary.totalCogs, currency)}
              </div>
            </div>
            <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-4">
              <div className="text-[11px] text-[#A7B89A]">{t.grossProfitEst}</div>
              <div className="text-lg font-bold text-[#A7B89A] tabular-nums mt-1">
                {formatIQD(data.summary.grossProfit, currency)}
              </div>
            </div>
            <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-4">
              <div className="text-[11px] text-[#A7B89A]">{t.expenses}</div>
              <div className="text-lg font-bold text-amber-300 tabular-nums mt-1">
                {formatIQD(data.summary.totalExpenses, currency)}
              </div>
            </div>
            <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-4 col-span-2 lg:col-span-1">
              <div className="text-[11px] text-[#A7B89A]">Net Estimated Profit</div>
              <div className="text-lg font-bold text-[#D6C7A3] tabular-nums mt-1">
                {formatIQD(data.summary.netEstimatedProfit, currency)}
              </div>
            </div>
          </div>

          {/* Sub-report tabs */}
          <div className="flex items-center gap-1 bg-[#1B2A24] p-1 rounded-lg border border-[#2F443A] w-fit overflow-x-auto no-print">
            {[
              { id: 'sales' as const, label: 'Sales & Payments' },
              { id: 'products' as const, label: 'Products & Categories' },
              { id: 'inventory' as const, label: 'Inventory Usage' },
              { id: 'cashiers' as const, label: 'Cashier Performance' },
              { id: 'expenses' as const, label: t.expenses },
            ].map((tb) => (
              <button
                key={tb.id}
                type="button"
                onClick={() => setReportTab(tb.id)}
                className={`px-3.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer ${
                  reportTab === tb.id
                    ? 'bg-[#293B32] text-[#D6C7A3]'
                    : 'text-[#F3EFE6]/70 hover:text-[#F3EFE6]'
                }`}
              >
                {tb.label}
              </button>
            ))}
          </div>

          {reportTab === 'sales' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 rounded-xl border border-[#384E43] bg-[#293B32] p-5 overflow-x-auto">
                <h3 className="text-sm font-bold text-[#F3EFE6] mb-3 capitalize">{period} Sales Breakdown</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#384E43] text-xs text-[#A7B89A]">
                      <th className="pb-2 text-start">Period</th>
                      <th className="pb-2 text-end">Orders</th>
                      <th className="pb-2 text-end">Net Sales</th>
                      <th className="pb-2 text-end">Est. Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#384E43]/60">
                    {data.salesSeries.map((r) => (
                      <tr key={r.bucket}>
                        <td className="py-2.5 font-mono text-xs text-[#F3EFE6]">{r.bucket}</td>
                        <td className="py-2.5 text-end tabular-nums">{r.orderCount}</td>
                        <td className="py-2.5 text-end font-semibold tabular-nums">
                          {formatIQD(r.netSales, currency)}
                        </td>
                        <td className="py-2.5 text-end text-[#A7B89A] tabular-nums">
                          {formatIQD(r.grossProfit, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-5 space-y-3">
                <h3 className="text-sm font-bold text-[#F3EFE6]">Payment Methods</h3>
                <div className="divide-y divide-[#384E43]">
                  {data.paymentMethods.map((pm) => (
                    <div key={pm.payment_method} className="py-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold uppercase text-[#D6C7A3]">
                          {pm.payment_method}
                        </div>
                        <div className="text-xs text-[#A7B89A] tabular-nums">{pm.orderCount} orders</div>
                      </div>
                      <div className="text-sm font-bold text-[#F3EFE6] tabular-nums">
                        {formatIQD(pm.totalAmount, currency)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {reportTab === 'products' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 rounded-xl border border-[#384E43] bg-[#293B32] p-5 overflow-x-auto">
                <h3 className="text-sm font-bold text-[#F3EFE6] mb-3">Product Performance</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#384E43] text-xs text-[#A7B89A]">
                      <th className="pb-2 text-start">Product</th>
                      <th className="pb-2 text-end">Units</th>
                      <th className="pb-2 text-end">Revenue</th>
                      <th className="pb-2 text-end">Est. Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#384E43]/60">
                    {data.productPerformance.map((p, idx) => (
                      <tr key={`${p.product_id}-${idx}`}>
                        <td className="py-2.5 font-medium text-[#F3EFE6]">{p.product_name}</td>
                        <td className="py-2.5 text-end tabular-nums">{p.unitsSold}</td>
                        <td className="py-2.5 text-end font-semibold tabular-nums">
                          {formatIQD(p.revenue, currency)}
                        </td>
                        <td className="py-2.5 text-end text-[#A7B89A] tabular-nums">
                          {formatIQD(p.estProfit, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-5 space-y-3">
                <h3 className="text-sm font-bold text-[#F3EFE6]">Category Performance</h3>
                <div className="divide-y divide-[#384E43]">
                  {data.categoryPerformance.map((c, idx) => (
                    <div key={idx} className="py-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-[#F3EFE6]">
                          {lang === 'ckb'
                            ? c.category_ckb
                            : lang === 'ar'
                            ? c.category_ar
                            : c.category_en}
                        </div>
                        <div className="text-xs text-[#A7B89A] tabular-nums">{c.unitsSold} units</div>
                      </div>
                      <div className="text-sm font-bold text-[#D6C7A3] tabular-nums">
                        {formatIQD(c.revenue, currency)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {reportTab === 'inventory' && (
            <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#384E43] text-xs text-[#A7B89A]">
                    <th className="pb-2 text-start">Ingredient</th>
                    <th className="pb-2 text-end">Used in Sales</th>
                    <th className="pb-2 text-end">Purchased</th>
                    <th className="pb-2 text-end">Waste</th>
                    <th className="pb-2 text-end">Current Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#384E43]/60">
                  {data.inventoryUsage.map((row) => (
                    <tr key={row.id}>
                      <td className="py-2.5 font-medium text-[#F3EFE6]">
                        {getLocalizedName(row, lang)}
                      </td>
                      <td className="py-2.5 text-end tabular-nums text-[#D6C7A3]">
                        {row.usedInSales} {row.unit}
                      </td>
                      <td className="py-2.5 text-end tabular-nums text-[#A7B89A]">
                        +{row.purchasedQty} {row.unit}
                      </td>
                      <td className="py-2.5 text-end tabular-nums text-amber-300">
                        {row.wastedQty} {row.unit}
                      </td>
                      <td className="py-2.5 text-end font-semibold tabular-nums">
                        {row.currentStock} {row.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {reportTab === 'cashiers' && (
            <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#384E43] text-xs text-[#A7B89A]">
                    <th className="pb-2 text-start">Staff Member</th>
                    <th className="pb-2 text-start">Role</th>
                    <th className="pb-2 text-end">Orders</th>
                    <th className="pb-2 text-end">Cancelled</th>
                    <th className="pb-2 text-end">Total Sales</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#384E43]/60">
                  {data.cashierPerformance.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2.5 font-medium text-[#F3EFE6]">{c.name}</td>
                      <td className="py-2.5 text-xs text-[#A7B89A]">{c.role}</td>
                      <td className="py-2.5 text-end tabular-nums">{c.ordersHandled}</td>
                      <td className="py-2.5 text-end tabular-nums text-amber-300">{c.cancelledCount}</td>
                      <td className="py-2.5 text-end font-bold tabular-nums text-[#D6C7A3]">
                        {formatIQD(c.totalSales, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {reportTab === 'expenses' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <form
                onSubmit={handleAddExpense}
                className="rounded-xl border border-[#384E43] bg-[#293B32] p-5 space-y-3 h-fit no-print"
              >
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-[#A7B89A]" />
                  <h3 className="text-sm font-bold text-[#F3EFE6]">{t.addExpense}</h3>
                </div>
                <select
                  value={expForm.category}
                  onChange={(e) => setExpForm({ ...expForm, category: e.target.value })}
                  className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
                >
                  <option value="Supplies">Supplies & Roastery</option>
                  <option value="Utilities">Utilities & Maintenance</option>
                  <option value="Rent">Rent</option>
                  <option value="Salaries">Salaries</option>
                  <option value="General">General</option>
                </select>
                <input
                  required
                  placeholder="Expense Title"
                  value={expForm.title}
                  onChange={(e) => setExpForm({ ...expForm, title: e.target.value })}
                  className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
                />
                <input
                  type="number"
                  required
                  min={1}
                  placeholder="Amount (IQD)"
                  value={expForm.amount || ''}
                  onChange={(e) => setExpForm({ ...expForm, amount: Number(e.target.value) })}
                  className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
                />
                <input
                  type="date"
                  value={expForm.expense_date}
                  onChange={(e) => setExpForm({ ...expForm, expense_date: e.target.value })}
                  className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
                />
                <button
                  type="submit"
                  className="w-full rounded-lg bg-[#A7B89A] py-2 text-xs font-semibold text-[#101A17] cursor-pointer"
                >
                  {t.save}
                </button>
              </form>

              <div className="lg:col-span-2 rounded-xl border border-[#384E43] bg-[#293B32] p-5 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#384E43] text-xs text-[#A7B89A]">
                      <th className="pb-2 text-start">Date</th>
                      <th className="pb-2 text-start">Title</th>
                      <th className="pb-2 text-start">Category</th>
                      <th className="pb-2 text-end">Amount</th>
                      <th className="pb-2 text-end no-print"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#384E43]/60">
                    {data.expenses.map((ex) => (
                      <tr key={ex.id}>
                        <td className="py-2.5 text-xs text-[#A7B89A] tabular-nums">{ex.expense_date}</td>
                        <td className="py-2.5 font-medium text-[#F3EFE6]">{ex.title}</td>
                        <td className="py-2.5 text-xs text-[#D6C7A3]">{ex.category}</td>
                        <td className="py-2.5 text-end font-semibold text-amber-300 tabular-nums">
                          {formatIQD(ex.amount, currency)}
                        </td>
                        <td className="py-2.5 text-end no-print">
                          <button
                            type="button"
                            onClick={async () => {
                              setErrorMsg('');
                              try {
                                await apiRequest(`/api/reports/expenses/${ex.id}`, { method: 'DELETE' });
                                loadAnalytics();
                              } catch (err) {
                                setErrorMsg((err as Error).message);
                              }
                            }}
                            className="text-red-300 hover:text-red-200"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
