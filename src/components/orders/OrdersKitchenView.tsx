import React, { useCallback, useEffect, useState } from 'react';
import { Ban, CheckCircle2, Clock, Flame, Printer, X } from 'lucide-react';
import type { Language, Order, ShopSettings, User } from '../../types/pos';
import { apiRequest } from '../../lib/api';
import { formatIQD, formatLocalDateTime, formatLocalTime, translations } from '../../i18n/translations';
import { printEscPosReceipt } from '../../lib/hardware';
import { posWsClient } from '../../lib/wsClient';

interface Props {
  lang: Language;
  user: User;
  settings: ShopSettings;
}

export const OrdersKitchenView: React.FC<Props> = ({ lang, user, settings }) => {
  const t = translations[lang];
  const currency = settings.currency || 'IQD';
  const canCancel = user.role === 'owner' || user.permissions.includes('pos.cancel_order');

  const [subView, setSubView] = useState<'kds' | 'history'>('kds');
  const [typeFilter, setTypeFilter] = useState<'all' | 'dine_in' | 'takeaway' | 'delivery'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [orders, setOrders] = useState<Order[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const loadOrders = useCallback(async () => {
    try {
      const ordRes = await apiRequest<{ orders: Order[] }>('/api/orders?limit=120');
      setOrders(ordRes.orders);
    } catch (err) {
      setErrorMsg((err as Error).message || 'Failed to load orders');
    }
  }, []);

  useEffect(() => {
    loadOrders();
    const unsub = posWsClient.onMessage((msg) => {
      if (msg.type === 'order:created' || msg.type === 'order:updated') {
        loadOrders();
      }
    });
    return unsub;
  }, [loadOrders]);

  const updateOrderStatus = async (orderId: number, status: 'preparing' | 'ready' | 'completed') => {
    setErrorMsg('');
    try {
      await apiRequest(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      loadOrders();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    setErrorMsg('');
    try {
      await apiRequest(`/api/orders/${cancelTarget.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason || 'Cancelled from Orders screen' }),
      });
      setCancelTarget(null);
      setCancelReason('');
      loadOrders();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const translateOrderType = (type: Order['order_type']) =>
    type === 'dine_in' ? t.dineIn : type === 'takeaway' ? t.takeaway : t.delivery;

  const translateStatus = (status: Order['status']) => {
    if (status === 'pending') return t.pending;
    if (status === 'preparing') return t.preparing;
    if (status === 'ready') return t.ready;
    if (status === 'completed') return t.completed;
    return t.cancelled;
  };

  const translatePaymentStatus = (ps: Order['payment_status']) => {
    if (ps === 'paid') return t.paid;
    if (ps === 'refunded') return t.refunded;
    return t.unpaid;
  };

  const filteredByType = orders.filter((o) => (typeFilter === 'all' ? true : o.order_type === typeFilter));
  const activeKdsOrders = filteredByType.filter((o) =>
    ['pending', 'preparing', 'ready'].includes(o.status)
  );
  const historyOrders = filteredByType.filter((o) =>
    statusFilter === 'all' ? true : o.status === statusFilter
  );

  return (
    <div className="p-4 sm:p-6 max-w-[1440px] mx-auto space-y-5">
      {/* Top Controls: KDS vs History + Order Type Separation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-[#1B2A24] p-1 rounded-lg border border-[#2F443A]">
          {[
            { id: 'kds' as const, label: `${t.kitchenDisplay} (${activeKdsOrders.length})` },
            { id: 'history' as const, label: t.orderHistory },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubView(tab.id)}
              className={`px-3.5 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                subView === tab.id
                  ? 'bg-[#A7B89A] text-[#101A17] font-semibold'
                  : 'text-[#F3EFE6]/75 hover:text-[#F3EFE6]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-[#1B2A24] p-1 rounded-lg border border-[#2F443A]">
            {[
              { id: 'all' as const, label: t.allOrders },
              { id: 'dine_in' as const, label: t.dineIn },
              { id: 'takeaway' as const, label: t.takeaway },
              { id: 'delivery' as const, label: t.delivery },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setTypeFilter(f.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  typeFilter === f.id
                    ? 'bg-[#293B32] text-[#D6C7A3] font-semibold'
                    : 'text-[#F3EFE6]/70 hover:text-[#F3EFE6]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {subView === 'history' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-[#384E43] bg-[#1B2A24] px-3 py-2 text-xs text-[#F3EFE6]"
            >
              <option value="all">{t.allStatuses}</option>
              <option value="pending">{t.pending}</option>
              <option value="preparing">{t.preparing}</option>
              <option value="ready">{t.ready}</option>
              <option value="completed">{t.completed}</option>
              <option value="cancelled">{t.cancelled}</option>
            </select>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-400/40 bg-red-950/50 px-4 py-2.5 text-xs text-red-200 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg('')} className="text-red-300 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Live KDS Orders */}
      {subView === 'kds' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {activeKdsOrders.map((order) => (
            <div
              key={order.id}
              className="rounded-xl border border-[#384E43] bg-[#293B32] p-5 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-start justify-between gap-2 pb-3 border-b border-[#384E43]">
                  <div>
                    <div className="text-base font-bold text-[#F3EFE6] tabular-nums">
                      {order.order_number}
                    </div>
                    <div className="text-xs text-[#A7B89A] tabular-nums mt-0.5">
                      {translateOrderType(order.order_type)}
                      {order.table_number ? ` · ${order.table_number}` : ''}
                      {' · '}
                      {formatLocalTime(order.created_at)}
                    </div>
                  </div>
                  <div className="text-end">
                    <span
                      className={`text-xs font-semibold inline-flex items-center gap-1 ${
                        order.status === 'ready'
                          ? 'text-[#A7B89A]'
                          : order.status === 'preparing'
                          ? 'text-[#D6C7A3]'
                          : 'text-amber-300'
                      }`}
                    >
                      {order.status === 'pending' && <Clock className="w-3.5 h-3.5" />}
                      {order.status === 'preparing' && <Flame className="w-3.5 h-3.5" />}
                      {order.status === 'ready' && <CheckCircle2 className="w-3.5 h-3.5" />}
                      {translateStatus(order.status)}
                    </span>
                    <div className="text-xs font-bold text-[#D6C7A3] tabular-nums mt-0.5">
                      {formatIQD(order.total_amount, currency)} · {translatePaymentStatus(order.payment_status)}
                    </div>
                  </div>
                </div>

                <div className="py-3 space-y-2">
                  {order.items.map((item) => (
                    <div key={item.id} className="text-sm">
                      <div className="font-medium text-[#F3EFE6]">
                        <span className="text-[#D6C7A3] font-bold tabular-nums">{item.quantity}x</span>{' '}
                        {item.product_name}
                      </div>
                      {(item.variation_name || item.addons.length > 0 || item.notes) && (
                        <div className="text-xs text-[#A7B89A] ps-5">
                          {item.variation_name}
                          {item.addons.length > 0 ? ` · +${item.addons.map((a) => a.name).join(', ')}` : ''}
                          {item.notes ? ` · "${item.notes}"` : ''}
                        </div>
                      )}
                    </div>
                  ))}
                  {order.notes && (
                    <div className="mt-2 rounded-lg bg-[#101A17] px-3 py-2 text-xs text-[#D6C7A3]">
                      {order.notes}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-[#384E43]">
                {order.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => updateOrderStatus(order.id, 'preparing')}
                    className="flex-1 rounded-lg bg-[#D6C7A3] py-2 text-xs font-semibold text-[#101A17] hover:opacity-90 cursor-pointer"
                  >
                    {t.startPreparing}
                  </button>
                )}
                {order.status === 'preparing' && (
                  <button
                    type="button"
                    onClick={() => updateOrderStatus(order.id, 'ready')}
                    className="flex-1 rounded-lg bg-[#A7B89A] py-2 text-xs font-semibold text-[#101A17] hover:opacity-90 cursor-pointer"
                  >
                    {t.markReady}
                  </button>
                )}
                {order.status === 'ready' && (
                  <button
                    type="button"
                    onClick={() => updateOrderStatus(order.id, 'completed')}
                    className="flex-1 rounded-lg bg-[#A7B89A] py-2 text-xs font-semibold text-[#101A17] hover:opacity-90 cursor-pointer"
                  >
                    {t.completeAndServe}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => printEscPosReceipt(order, settings)}
                  title={t.printReceipt}
                  className="p-2 rounded-lg border border-[#384E43] bg-[#1B2A24] text-[#F3EFE6] hover:border-[#A7B89A] cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          {activeKdsOrders.length === 0 && (
            <div className="col-span-full rounded-xl border border-[#384E43] bg-[#293B32] p-12 text-center text-sm text-[#A7B89A]">
              {t.noActiveOrders}
            </div>
          )}
        </div>
      )}

      {/* Structured Order History */}
      {subView === 'history' && (
        <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#384E43] text-xs text-[#A7B89A]">
                <th className="pb-2.5 text-start font-medium">#</th>
                <th className="pb-2.5 text-start font-medium">{t.orderType}</th>
                <th className="pb-2.5 text-start font-medium">{t.orderItemsLabel}</th>
                <th className="pb-2.5 text-start font-medium">{t.paymentStatus}</th>
                <th className="pb-2.5 text-start font-medium">{t.status}</th>
                <th className="pb-2.5 text-end font-medium">{t.total}</th>
                <th className="pb-2.5 text-end font-medium">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#384E43]/60">
              {historyOrders.map((ord) => (
                <tr key={ord.id} className="hover:bg-[#1B2A24]/40">
                  <td className="py-3 font-semibold text-[#F3EFE6] tabular-nums">
                    <div>{ord.order_number}</div>
                    <div className="text-[11px] text-[#A7B89A]">{formatLocalDateTime(ord.created_at)}</div>
                  </td>
                  <td className="py-3 text-xs text-[#F3EFE6]/85">
                    {translateOrderType(ord.order_type)}
                    {ord.table_number ? ` · ${ord.table_number}` : ''}
                  </td>
                  <td className="py-3 text-xs text-[#A7B89A] max-w-xs truncate">
                    {ord.items.map((i) => `${i.quantity}x ${i.product_name}`).join(', ')}
                  </td>
                  <td className="py-3 text-xs">
                    <span
                      className={
                        ord.payment_status === 'paid'
                          ? 'text-emerald-300'
                          : ord.payment_status === 'refunded'
                          ? 'text-red-300'
                          : 'text-amber-300'
                      }
                    >
                      {translatePaymentStatus(ord.payment_status)}
                    </span>
                    <span className="text-[#A7B89A]"> · {ord.payment_method.toUpperCase()}</span>
                  </td>
                  <td className="py-3 text-xs font-medium text-[#D6C7A3]">
                    {translateStatus(ord.status)}
                  </td>
                  <td className="py-3 text-end font-bold text-[#F3EFE6] tabular-nums">
                    {formatIQD(ord.total_amount, currency)}
                  </td>
                  <td className="py-3 text-end whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => printEscPosReceipt(ord, settings)}
                        title={t.printReceipt}
                        className="p-1.5 rounded border border-[#384E43] bg-[#1B2A24] text-[#F3EFE6] hover:border-[#A7B89A] cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                      {canCancel && ord.status !== 'cancelled' && (
                        <button
                          type="button"
                          onClick={() => setCancelTarget(ord)}
                          title={t.cancelOrder}
                          className="p-1.5 rounded border border-red-400/35 bg-red-950/35 text-red-200 hover:bg-red-900/50 cursor-pointer"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {historyOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-[#A7B89A]">
                    {t.noOrdersFound}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Cancel Order Modal */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[#384E43] bg-[#1B2A24] p-5 space-y-4">
            <h3 className="text-base font-bold text-[#F3EFE6]">
              {t.cancelOrder}: {cancelTarget.order_number}
            </h3>
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Cancellation reason"
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="flex-1 rounded-lg border border-[#384E43] py-2 text-xs text-[#F3EFE6] cursor-pointer"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                className="flex-1 rounded-lg bg-red-600 py-2 text-xs font-semibold text-white hover:bg-red-500 cursor-pointer"
              >
                {t.cancelOrder}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
