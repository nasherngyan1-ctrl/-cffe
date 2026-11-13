import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  Edit2,
  Plus,
  ShoppingBag,
  Sparkles,
  Trash2,
  Users,
  Utensils,
  X,
} from 'lucide-react';
import type { CafeTable, Language, ShopSettings, User } from '../../types/pos';
import { apiRequest } from '../../lib/api';
import { formatIQD, translations } from '../../i18n/translations';
import { posWsClient } from '../../lib/wsClient';

interface Props {
  lang: Language;
  user: User;
  settings: ShopSettings;
  onOpenOrderForTable: (tableId: number) => void;
}

export const TablesView: React.FC<Props> = ({ lang, user, settings, onOpenOrderForTable }) => {
  const t = translations[lang];
  const currency = settings.currency || 'IQD';
  const canDelete = user.role === 'owner' || user.permissions.includes('menu.manage');

  const [tables, setTables] = useState<CafeTable[]>([]);
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [errorMsg, setErrorMsg] = useState('');

  // Create / Edit modal
  const [tableModal, setTableModal] = useState<{
    id?: number;
    table_number: string;
    name: string;
    capacity: number;
    zone: string;
  } | null>(null);

  // Transfer modal
  const [transferSource, setTransferSource] = useState<CafeTable | null>(null);
  const [transferDestId, setTransferDestId] = useState<string>('');

  const loadTables = useCallback(async () => {
    try {
      const res = await apiRequest<{ tables: CafeTable[] }>('/api/tables');
      setTables(res.tables);
    } catch (err) {
      setErrorMsg((err as Error).message || 'Failed to load tables');
    }
  }, []);

  useEffect(() => {
    loadTables();
    const unsub = posWsClient.onMessage((msg) => {
      if (msg.type === 'table:updated' || msg.type === 'order:created' || msg.type === 'order:updated') {
        loadTables();
      }
    });
    return unsub;
  }, [loadTables]);

  const zones = Array.from(new Set(tables.map((tb) => tb.zone).filter(Boolean)));
  const visibleTables = zoneFilter === 'all' ? tables : tables.filter((tb) => tb.zone === zoneFilter);

  const handleSaveTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableModal) return;
    setErrorMsg('');
    try {
      if (tableModal.id) {
        await apiRequest(`/api/tables/${tableModal.id}`, {
          method: 'PUT',
          body: JSON.stringify(tableModal),
        });
      } else {
        await apiRequest('/api/tables', {
          method: 'POST',
          body: JSON.stringify(tableModal),
        });
      }
      setTableModal(null);
      loadTables();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleDeleteTable = async (table: CafeTable) => {
    setErrorMsg('');
    try {
      await apiRequest(`/api/tables/${table.id}`, { method: 'DELETE' });
      loadTables();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleStatusChange = async (
    tableId: number,
    status: 'available' | 'occupied' | 'reserved' | 'cleaning'
  ) => {
    setErrorMsg('');
    try {
      await apiRequest(`/api/tables/${tableId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      loadTables();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferSource || !transferDestId) return;
    setErrorMsg('');
    try {
      await apiRequest('/api/tables/transfer', {
        method: 'POST',
        body: JSON.stringify({
          from_table_id: transferSource.id,
          to_table_id: Number(transferDestId),
        }),
      });
      setTransferSource(null);
      setTransferDestId('');
      loadTables();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleCloseTable = async (table: CafeTable, nextStatus: 'available' | 'cleaning') => {
    setErrorMsg('');
    try {
      await apiRequest(`/api/tables/${table.id}/close`, {
        method: 'POST',
        body: JSON.stringify({ next_status: nextStatus }),
      });
      loadTables();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const statusMeta = (status: CafeTable['status']) => {
    switch (status) {
      case 'available':
        return {
          label: t.available,
          cardBorder: 'border-emerald-500/40 bg-[#23372E]',
          textColor: 'text-emerald-300',
          icon: CheckCircle2,
        };
      case 'occupied':
        return {
          label: t.occupied,
          cardBorder: 'border-red-400/45 bg-[#362628]',
          textColor: 'text-red-300',
          icon: Utensils,
        };
      case 'reserved':
        return {
          label: t.reserved,
          cardBorder: 'border-[#D6C7A3]/55 bg-[#2F3527]',
          textColor: 'text-[#D6C7A3]',
          icon: Clock,
        };
      case 'cleaning':
        return {
          label: t.cleaning,
          cardBorder: 'border-sky-400/45 bg-[#20323C]',
          textColor: 'text-sky-300',
          icon: Sparkles,
        };
    }
  };

  const counts = {
    available: tables.filter((x) => x.status === 'available').length,
    occupied: tables.filter((x) => x.status === 'occupied').length,
    reserved: tables.filter((x) => x.status === 'reserved').length,
    cleaning: tables.filter((x) => x.status === 'cleaning').length,
  };

  const destinationCandidates = tables.filter(
    (x) => transferSource && x.id !== transferSource.id && x.status !== 'occupied' && !x.current_order_id
  );

  return (
    <div className="p-4 sm:p-6 max-w-[1440px] mx-auto space-y-5">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-[#1B2A24] p-1 rounded-lg border border-[#2F443A]">
            <button
              type="button"
              onClick={() => setZoneFilter('all')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer ${
                zoneFilter === 'all' ? 'bg-[#A7B89A] text-[#101A17] font-semibold' : 'text-[#F3EFE6]/75'
              }`}
            >
              {t.allOrders} ({tables.length})
            </button>
            {zones.map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => setZoneFilter(z)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer ${
                  zoneFilter === z ? 'bg-[#A7B89A] text-[#101A17] font-semibold' : 'text-[#F3EFE6]/75'
                }`}
              >
                {z}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4 text-xs px-2 tabular-nums">
            <span className="text-emerald-300 font-medium">
              {t.available}: {counts.available}
            </span>
            <span className="text-red-300 font-medium">
              {t.occupied}: {counts.occupied}
            </span>
            <span className="text-[#D6C7A3] font-medium">
              {t.reserved}: {counts.reserved}
            </span>
            <span className="text-sky-300 font-medium">
              {t.cleaning}: {counts.cleaning}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            setTableModal({
              table_number: `T${tables.length + 1}`,
              name: `Table ${tables.length + 1}`,
              capacity: 4,
              zone: zones[0] || 'Main Lounge',
            })
          }
          className="flex items-center gap-1.5 rounded-lg bg-[#A7B89A] px-3.5 py-2 text-xs font-semibold text-[#101A17] hover:bg-[#b8c8ac] whitespace-nowrap cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t.createTable}</span>
        </button>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-400/40 bg-red-950/50 px-4 py-2.5 text-xs text-red-200 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg('')} className="text-red-300 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Visual Table Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {visibleTables.map((table) => {
          const meta = statusMeta(table.status);
          const StatusIcon = meta.icon;
          const isOccupied = table.status === 'occupied' || Boolean(table.current_order_id);

          return (
            <div
              key={table.id}
              className={`rounded-xl border p-5 flex flex-col justify-between gap-4 transition-colors ${meta.cardBorder}`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-lg font-bold text-[#F3EFE6] tabular-nums">
                      {table.table_number}
                    </div>
                    <div className="text-xs text-[#F3EFE6]/75">{table.name}</div>
                  </div>
                  <div className={`flex items-center gap-1.5 text-xs font-semibold ${meta.textColor}`}>
                    <StatusIcon className="w-3.5 h-3.5" />
                    <span>{meta.label}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-[#A7B89A]">
                  <span className="flex items-center gap-1 tabular-nums">
                    <Users className="w-3.5 h-3.5" />
                    {table.capacity} {t.seatsLabel}
                  </span>
                  <span>{table.zone}</span>
                </div>

                {table.active_order_number && (
                  <div className="rounded-lg bg-[#101A17]/80 border border-[#384E43] p-3 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#A7B89A]">{t.activeOrderOnTable}</span>
                      <span className="font-bold text-[#F3EFE6] tabular-nums">
                        {table.active_order_number}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#A7B89A]">{t.total}</span>
                      <span className="font-bold text-[#D6C7A3] tabular-nums">
                        {formatIQD(table.active_order_total || 0, currency)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2 pt-2 border-t border-white/10">
                {/* Primary Table Actions */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => onOpenOrderForTable(table.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-[#A7B89A] px-2.5 py-2 text-xs font-semibold text-[#101A17] hover:bg-[#b8c8ac] whitespace-nowrap cursor-pointer"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>{t.openNewOrder}</span>
                  </button>

                  {table.current_order_id && (
                    <button
                      type="button"
                      onClick={() => {
                        setTransferSource(table);
                        setTransferDestId(destinationCandidates[0] ? String(destinationCandidates[0].id) : '');
                      }}
                      title={t.transferOrder}
                      className="flex items-center justify-center gap-1 rounded-lg border border-[#384E43] bg-[#101A17]/80 px-2.5 py-2 text-xs text-[#D6C7A3] hover:border-[#D6C7A3] whitespace-nowrap cursor-pointer"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      <span>{t.transferOrder}</span>
                    </button>
                  )}

                  {isOccupied && (
                    <button
                      type="button"
                      onClick={() => handleCloseTable(table, 'cleaning')}
                      className="w-full rounded-lg border border-sky-400/40 bg-sky-950/40 px-2.5 py-1.5 text-xs font-medium text-sky-200 hover:bg-sky-900/50 whitespace-nowrap cursor-pointer"
                    >
                      {t.closeTable}
                    </button>
                  )}
                </div>

                {/* Status Quick Selector + Edit/Delete */}
                <div className="flex items-center gap-1.5">
                  <select
                    value={table.status}
                    onChange={(e) =>
                      handleStatusChange(table.id, e.target.value as CafeTable['status'])
                    }
                    className="flex-1 rounded-md border border-[#384E43] bg-[#101A17]/80 px-2 py-1.5 text-[11px] text-[#F3EFE6]"
                  >
                    <option value="available">{t.available}</option>
                    <option value="occupied">{t.occupied}</option>
                    <option value="reserved">{t.reserved}</option>
                    <option value="cleaning">{t.cleaning}</option>
                  </select>

                  <button
                    type="button"
                    onClick={() =>
                      setTableModal({
                        id: table.id,
                        table_number: table.table_number,
                        name: table.name,
                        capacity: table.capacity,
                        zone: table.zone,
                      })
                    }
                    title={t.editTable}
                    className="p-1.5 rounded-md border border-[#384E43] bg-[#101A17]/80 text-[#F3EFE6] hover:border-[#A7B89A] cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  {canDelete && !isOccupied && (
                    <button
                      type="button"
                      onClick={() => handleDeleteTable(table)}
                      title={t.delete}
                      className="p-1.5 rounded-md border border-red-400/30 bg-red-950/40 text-red-300 hover:bg-red-900/50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create / Edit Table Modal */}
      {tableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <form
            onSubmit={handleSaveTable}
            className="w-full max-w-md rounded-xl border border-[#384E43] bg-[#1B2A24] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#F3EFE6]">
                {tableModal.id ? t.editTable : t.createTable}
              </h3>
              <button type="button" onClick={() => setTableModal(null)} className="text-[#A7B89A] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[#D6C7A3] mb-1">{t.tableNumber}</label>
                <input
                  required
                  value={tableModal.table_number}
                  onChange={(e) => setTableModal({ ...tableModal, table_number: e.target.value })}
                  className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#D6C7A3] mb-1">{t.seatsLabel}</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={tableModal.capacity}
                  onChange={(e) => setTableModal({ ...tableModal, capacity: Number(e.target.value) })}
                  className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-[#D6C7A3] mb-1">{t.tableName}</label>
              <input
                required
                value={tableModal.name}
                onChange={(e) => setTableModal({ ...tableModal, name: e.target.value })}
                className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#D6C7A3] mb-1">{t.zoneLabel}</label>
              <input
                required
                value={tableModal.zone}
                onChange={(e) => setTableModal({ ...tableModal, zone: e.target.value })}
                className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-[#A7B89A] py-2.5 text-sm font-semibold text-[#101A17] cursor-pointer"
            >
              {t.save}
            </button>
          </form>
        </div>
      )}

      {/* Transfer Order Modal */}
      {transferSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <form
            onSubmit={handleTransferSubmit}
            className="w-full max-w-sm rounded-xl border border-[#384E43] bg-[#1B2A24] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#F3EFE6]">{t.transferOrder}</h3>
              <button
                type="button"
                onClick={() => setTransferSource(null)}
                className="text-[#A7B89A] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="rounded-lg bg-[#101A17] border border-[#384E43] p-3 text-xs text-[#F3EFE6] tabular-nums">
              {transferSource.table_number} · {transferSource.active_order_number}
            </div>
            <div>
              <label className="block text-[11px] text-[#D6C7A3] mb-1">{t.transferToTable}</label>
              <select
                required
                value={transferDestId}
                onChange={(e) => setTransferDestId(e.target.value)}
                className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
              >
                {destinationCandidates.map((dest) => (
                  <option key={dest.id} value={dest.id}>
                    {dest.table_number} — {dest.name} ({dest.zone})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={!transferDestId}
              className="w-full rounded-lg bg-[#D6C7A3] py-2.5 text-sm font-semibold text-[#101A17] disabled:opacity-50 cursor-pointer"
            >
              {t.transferOrder}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
