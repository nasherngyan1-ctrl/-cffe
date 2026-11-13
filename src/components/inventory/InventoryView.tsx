import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Plus, Truck, Wrench, X } from 'lucide-react';
import type {
  InventoryItem,
  Language,
  PurchaseRecord,
  ShopSettings,
  StockMovement,
  Supplier,
  User,
} from '../../types/pos';
import { apiRequest } from '../../lib/api';
import { formatIQD, formatLocalDate, formatLocalDateTime, getLocalizedName, translations } from '../../i18n/translations';
import { posWsClient } from '../../lib/wsClient';

interface Props {
  lang: Language;
  user: User;
  settings: ShopSettings;
  initialTab?: 'items' | 'suppliers';
}

export const InventoryView: React.FC<Props> = ({
  lang,
  user,
  settings,
  initialTab = 'items',
}) => {
  const t = translations[lang];
  const currency = settings.currency || 'IQD';
  const canManage = user.role === 'owner' || user.permissions.includes('inventory.manage');

  const [tab, setTab] = useState<'items' | 'movements' | 'purchases' | 'suppliers'>(initialTab);
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);
  const [errorMsg, setErrorMsg] = useState('');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);

  // Modals
  const [showNewItem, setShowNewItem] = useState(false);
  const [showPurchase, setShowPurchase] = useState(false);
  const [adjustModal, setAdjustModal] = useState<{
    item: InventoryItem;
    mode: 'adjustment' | 'waste';
  } | null>(null);
  const [showNewSupplier, setShowNewSupplier] = useState(false);

  // Forms
  const [newItemForm, setNewItemForm] = useState({
    sku: '',
    name_ckb: '',
    name_ar: '',
    name_en: '',
    item_type: 'ingredient',
    unit: 'g',
    quantity: 0,
    min_threshold: 500,
    unit_cost: 0,
    supplier_id: '',
  });
  const [purchaseForm, setPurchaseForm] = useState({
    inventory_item_id: '',
    supplier_id: '',
    quantity: 0,
    unit_cost: 0,
    invoice_ref: '',
    notes: '',
  });
  const [adjustDelta, setAdjustDelta] = useState<number>(0);
  const [adjustNotes, setAdjustNotes] = useState('');
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    notes: '',
  });

  const loadInventory = useCallback(async () => {
    try {
      const res = await apiRequest<{
        items: InventoryItem[];
        suppliers: Supplier[];
        movements: StockMovement[];
        purchases: PurchaseRecord[];
      }>('/api/inventory');
      setItems(res.items);
      setSuppliers(res.suppliers);
      setMovements(res.movements);
      setPurchases(res.purchases);
    } catch {
      // handled silently offline
    }
  }, []);

  useEffect(() => {
    loadInventory();
    const unsub = posWsClient.onMessage((msg) => {
      if (msg.type === 'inventory:updated') loadInventory();
    });
    return unsub;
  }, [loadInventory]);

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      await apiRequest('/api/inventory/items', {
        method: 'POST',
        body: JSON.stringify({
          ...newItemForm,
          supplier_id: newItemForm.supplier_id ? Number(newItemForm.supplier_id) : null,
        }),
      });
      setShowNewItem(false);
      setNewItemForm({
        sku: '',
        name_ckb: '',
        name_ar: '',
        name_en: '',
        item_type: 'ingredient',
        unit: 'g',
        quantity: 0,
        min_threshold: 500,
        unit_cost: 0,
        supplier_id: '',
      });
      loadInventory();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleRecordPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      await apiRequest('/api/inventory/purchases', {
        method: 'POST',
        body: JSON.stringify({
          inventory_item_id: Number(purchaseForm.inventory_item_id),
          supplier_id: purchaseForm.supplier_id ? Number(purchaseForm.supplier_id) : null,
          quantity: Number(purchaseForm.quantity),
          unit_cost: Number(purchaseForm.unit_cost),
          invoice_ref: purchaseForm.invoice_ref,
          notes: purchaseForm.notes,
        }),
      });
      setShowPurchase(false);
      loadInventory();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustModal) return;
    setErrorMsg('');
    try {
      await apiRequest('/api/inventory/adjust', {
        method: 'POST',
        body: JSON.stringify({
          inventory_item_id: adjustModal.item.id,
          movement_type: adjustModal.mode,
          quantity_delta: adjustDelta,
          notes: adjustNotes,
        }),
      });
      setAdjustModal(null);
      setAdjustDelta(0);
      setAdjustNotes('');
      loadInventory();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      await apiRequest('/api/inventory/suppliers', {
        method: 'POST',
        body: JSON.stringify(supplierForm),
      });
      setShowNewSupplier(false);
      setSupplierForm({ name: '', contact_person: '', phone: '', email: '', notes: '' });
      loadInventory();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const lowStockCount = items.filter((i) => i.quantity <= i.min_threshold).length;

  return (
    <div className="p-4 sm:p-6 max-w-[1440px] mx-auto space-y-5">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-[#1B2A24] p-1 rounded-lg border border-[#2F443A] overflow-x-auto">
          {[
            { id: 'items' as const, label: t.rawMaterials },
            { id: 'movements' as const, label: t.stockMovements },
            { id: 'purchases' as const, label: t.purchases },
            { id: 'suppliers' as const, label: t.suppliers },
          ].map((tb) => (
            <button
              key={tb.id}
              type="button"
              onClick={() => setTab(tb.id)}
              className={`px-3.5 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                tab === tb.id
                  ? 'bg-[#A7B89A] text-[#101A17] font-semibold'
                  : 'text-[#F3EFE6]/75 hover:text-[#F3EFE6]'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (items[0]) {
                  setPurchaseForm({
                    inventory_item_id: String(items[0].id),
                    supplier_id: items[0].supplier_id ? String(items[0].supplier_id) : '',
                    quantity: 1000,
                    unit_cost: items[0].unit_cost,
                    invoice_ref: '',
                    notes: '',
                  });
                }
                setShowPurchase(true);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-[#384E43] bg-[#293B32] px-3.5 py-2 text-xs font-medium text-[#F3EFE6] hover:border-[#A7B89A] cursor-pointer"
            >
              <Truck className="w-3.5 h-3.5 text-[#D6C7A3]" />
              <span>{t.recordPurchase}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowNewItem(true)}
              className="flex items-center gap-1.5 rounded-lg bg-[#A7B89A] px-3.5 py-2 text-xs font-semibold text-[#101A17] hover:bg-[#b8c8ac] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.addIngredient}</span>
            </button>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-400/40 bg-red-950/50 px-4 py-2.5 text-xs text-red-200 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg('')} className="text-red-300 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {lowStockCount > 0 && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-950/30 px-4 py-3 flex items-center gap-2.5 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-300" />
          <span>
            {t.lowStockAlerts}: {lowStockCount}
          </span>
        </div>
      )}

      {/* Raw Materials & Ingredients Table */}
      {tab === 'items' && (
        <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#384E43] text-xs text-[#A7B89A]">
                <th className="pb-2.5 text-start font-medium">SKU</th>
                <th className="pb-2.5 text-start font-medium">{t.materialName}</th>
                <th className="pb-2.5 text-start font-medium">{t.typeLabel}</th>
                <th className="pb-2.5 text-end font-medium">{t.onHandLabel}</th>
                <th className="pb-2.5 text-end font-medium">{t.thresholdLabel}</th>
                <th className="pb-2.5 text-end font-medium">{t.unitCostLabel}</th>
                {canManage && <th className="pb-2.5 text-end font-medium">{t.actions}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#384E43]/60">
              {items.map((item) => {
                const isLow = item.quantity <= item.min_threshold;
                return (
                  <tr key={item.id} className="hover:bg-[#1B2A24]/40">
                    <td className="py-3 text-xs font-mono text-[#A7B89A]">{item.sku}</td>
                    <td className="py-3">
                      <div className="font-medium text-[#F3EFE6]">{getLocalizedName(item, lang)}</div>
                      {item.supplier_name && (
                        <div className="text-[11px] text-[#A7B89A]">{item.supplier_name}</div>
                      )}
                    </td>
                    <td className="py-3 text-xs text-[#D6C7A3]">{item.item_type.replace('_', ' ')}</td>
                    <td
                      className={`py-3 text-end font-bold tabular-nums ${
                        isLow ? 'text-amber-300' : 'text-[#F3EFE6]'
                      }`}
                    >
                      {item.quantity.toLocaleString()} {item.unit}
                    </td>
                    <td className="py-3 text-end text-xs text-[#A7B89A] tabular-nums">
                      {item.min_threshold.toLocaleString()} {item.unit}
                    </td>
                    <td className="py-3 text-end text-xs text-[#F3EFE6] tabular-nums">
                      {formatIQD(item.unit_cost, currency)}
                    </td>
                    {canManage && (
                      <td className="py-3 text-end space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setAdjustDelta(0);
                            setAdjustNotes('');
                            setAdjustModal({ item, mode: 'adjustment' });
                          }}
                          className="rounded border border-[#384E43] bg-[#1B2A24] px-2.5 py-1 text-xs text-[#F3EFE6] hover:border-[#A7B89A] cursor-pointer"
                        >
                          {t.adjustStock}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAdjustDelta(0);
                            setAdjustNotes('');
                            setAdjustModal({ item, mode: 'waste' });
                          }}
                          className="rounded border border-amber-400/30 bg-amber-950/30 px-2.5 py-1 text-xs text-amber-200 hover:border-amber-300 cursor-pointer"
                        >
                          {t.recordWaste}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Stock Movements */}
      {tab === 'movements' && (
        <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#384E43] text-xs text-[#A7B89A]">
                <th className="pb-2.5 text-start font-medium">Time</th>
                <th className="pb-2.5 text-start font-medium">Item</th>
                <th className="pb-2.5 text-start font-medium">Movement</th>
                <th className="pb-2.5 text-end font-medium">Delta</th>
                <th className="pb-2.5 text-end font-medium">Balance</th>
                <th className="pb-2.5 text-start font-medium ps-4">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#384E43]/60">
              {movements.map((mv) => (
                <tr key={mv.id}>
                  <td className="py-2.5 text-xs text-[#A7B89A] tabular-nums">
                    {formatLocalDateTime(mv.created_at)}
                  </td>
                  <td className="py-2.5 text-[#F3EFE6] font-medium">
                    {mv.ingredient_name || mv.product_name || 'Item'}
                  </td>
                  <td className="py-2.5 text-xs text-[#D6C7A3]">{mv.movement_type}</td>
                  <td
                    className={`py-2.5 text-end font-semibold tabular-nums ${
                      mv.quantity_delta >= 0 ? 'text-[#A7B89A]' : 'text-amber-300'
                    }`}
                  >
                    {mv.quantity_delta >= 0 ? `+${mv.quantity_delta}` : mv.quantity_delta}{' '}
                    {mv.ingredient_unit || ''}
                  </td>
                  <td className="py-2.5 text-end text-xs text-[#F3EFE6] tabular-nums">
                    {mv.balance_after} {mv.ingredient_unit || ''}
                  </td>
                  <td className="py-2.5 text-xs text-[#A7B89A] ps-4">{mv.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Purchases */}
      {tab === 'purchases' && (
        <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#384E43] text-xs text-[#A7B89A]">
                <th className="pb-2.5 text-start font-medium">Date</th>
                <th className="pb-2.5 text-start font-medium">Item</th>
                <th className="pb-2.5 text-start font-medium">Supplier</th>
                <th className="pb-2.5 text-end font-medium">Quantity</th>
                <th className="pb-2.5 text-end font-medium">Total Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#384E43]/60">
              {purchases.map((p) => (
                <tr key={p.id}>
                  <td className="py-2.5 text-xs text-[#A7B89A] tabular-nums">
                    {formatLocalDate(p.created_at)}
                  </td>
                  <td className="py-2.5 font-medium text-[#F3EFE6]">{p.item_name}</td>
                  <td className="py-2.5 text-xs text-[#D6C7A3]">{p.supplier_name || '-'}</td>
                  <td className="py-2.5 text-end tabular-nums text-[#A7B89A]">
                    +{p.quantity} {p.unit}
                  </td>
                  <td className="py-2.5 text-end font-semibold tabular-nums">
                    {formatIQD(p.total_cost, currency)}
                  </td>
                </tr>
              ))}
              {purchases.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-[#A7B89A]">
                    No purchase invoices recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Suppliers */}
      {tab === 'suppliers' && (
        <div className="space-y-4">
          {canManage && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowNewSupplier(true)}
                className="flex items-center gap-1.5 rounded-lg bg-[#A7B89A] px-3.5 py-2 text-xs font-semibold text-[#101A17] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.addSupplier}</span>
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {suppliers.map((sup) => (
              <div key={sup.id} className="rounded-xl border border-[#384E43] bg-[#293B32] p-5 space-y-1.5">
                <div className="text-base font-semibold text-[#F3EFE6]">{sup.name}</div>
                <div className="text-xs text-[#D6C7A3]">{sup.contact_person}</div>
                <div className="text-xs text-[#A7B89A] tabular-nums">
                  {sup.phone} · {sup.email}
                </div>
                {sup.notes && <div className="text-xs text-[#F3EFE6]/70 pt-2">{sup.notes}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New Ingredient Modal */}
      {showNewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <form
            onSubmit={handleCreateItem}
            className="w-full max-w-lg rounded-xl border border-[#384E43] bg-[#1B2A24] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#F3EFE6]">{t.addIngredient}</h3>
              <button type="button" onClick={() => setShowNewItem(false)} className="text-[#A7B89A]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                placeholder="English Name"
                value={newItemForm.name_en}
                onChange={(e) => setNewItemForm({ ...newItemForm, name_en: e.target.value })}
                className="rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
              />
              <input
                placeholder="Kurdish Name (Sorani)"
                value={newItemForm.name_ckb}
                onChange={(e) => setNewItemForm({ ...newItemForm, name_ckb: e.target.value })}
                className="rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
              />
              <input
                placeholder="Arabic Name"
                value={newItemForm.name_ar}
                onChange={(e) => setNewItemForm({ ...newItemForm, name_ar: e.target.value })}
                className="rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
              />
              <input
                placeholder="SKU (auto if empty)"
                value={newItemForm.sku}
                onChange={(e) => setNewItemForm({ ...newItemForm, sku: e.target.value })}
                className="rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
              />
              <select
                value={newItemForm.unit}
                onChange={(e) => setNewItemForm({ ...newItemForm, unit: e.target.value })}
                className="rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
              >
                <option value="g">g (Grams)</option>
                <option value="ml">ml (Milliliters)</option>
                <option value="pcs">pcs (Pieces)</option>
                <option value="kg">kg</option>
                <option value="L">L</option>
              </select>
              <input
                type="number"
                placeholder="Initial Qty"
                value={newItemForm.quantity}
                onChange={(e) => setNewItemForm({ ...newItemForm, quantity: Number(e.target.value) })}
                className="rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
              />
              <input
                type="number"
                placeholder="Low Stock Threshold"
                value={newItemForm.min_threshold}
                onChange={(e) =>
                  setNewItemForm({ ...newItemForm, min_threshold: Number(e.target.value) })
                }
                className="rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
              />
              <input
                type="number"
                placeholder="Unit Cost (IQD)"
                value={newItemForm.unit_cost}
                onChange={(e) => setNewItemForm({ ...newItemForm, unit_cost: Number(e.target.value) })}
                className="rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-[#A7B89A] py-2.5 text-sm font-semibold text-[#101A17]"
            >
              {t.save}
            </button>
          </form>
        </div>
      )}

      {/* Record Purchase Modal */}
      {showPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <form
            onSubmit={handleRecordPurchase}
            className="w-full max-w-md rounded-xl border border-[#384E43] bg-[#1B2A24] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#F3EFE6]">{t.recordPurchase}</h3>
              <button type="button" onClick={() => setShowPurchase(false)} className="text-[#A7B89A]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <select
              required
              value={purchaseForm.inventory_item_id}
              onChange={(e) => setPurchaseForm({ ...purchaseForm, inventory_item_id: e.target.value })}
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
            >
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {getLocalizedName(it, lang)} ({it.unit})
                </option>
              ))}
            </select>
            <select
              value={purchaseForm.supplier_id}
              onChange={(e) => setPurchaseForm({ ...purchaseForm, supplier_id: e.target.value })}
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
            >
              <option value="">Select Supplier (Optional)</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                required
                min={1}
                placeholder="Quantity Added"
                value={purchaseForm.quantity}
                onChange={(e) => setPurchaseForm({ ...purchaseForm, quantity: Number(e.target.value) })}
                className="rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
              />
              <input
                type="number"
                required
                min={0}
                placeholder="Unit Cost (IQD)"
                value={purchaseForm.unit_cost}
                onChange={(e) => setPurchaseForm({ ...purchaseForm, unit_cost: Number(e.target.value) })}
                className="rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
              />
            </div>
            <input
              type="text"
              placeholder="Invoice / Receipt Ref"
              value={purchaseForm.invoice_ref}
              onChange={(e) => setPurchaseForm({ ...purchaseForm, invoice_ref: e.target.value })}
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-[#A7B89A] py-2.5 text-sm font-semibold text-[#101A17]"
            >
              {t.save}
            </button>
          </form>
        </div>
      )}

      {/* Adjust / Waste Modal */}
      {adjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <form
            onSubmit={handleAdjustSubmit}
            className="w-full max-w-sm rounded-xl border border-[#384E43] bg-[#1B2A24] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-[#D6C7A3]" />
                <h3 className="text-sm font-bold text-[#F3EFE6]">
                  {adjustModal.mode === 'waste' ? t.recordWaste : t.adjustStock}
                </h3>
              </div>
              <button type="button" onClick={() => setAdjustModal(null)} className="text-[#A7B89A]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-xs text-[#A7B89A]">
              {getLocalizedName(adjustModal.item, lang)} · Current: {adjustModal.item.quantity}{' '}
              {adjustModal.item.unit}
            </div>
            <input
              type="number"
              required
              step="any"
              placeholder={
                adjustModal.mode === 'waste'
                  ? `Waste amount (${adjustModal.item.unit})`
                  : `Delta (+/- ${adjustModal.item.unit})`
              }
              value={adjustDelta || ''}
              onChange={(e) => setAdjustDelta(Number(e.target.value))}
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
            />
            <input
              type="text"
              placeholder="Reason / Notes"
              value={adjustNotes}
              onChange={(e) => setAdjustNotes(e.target.value)}
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-[#A7B89A] py-2.5 text-sm font-semibold text-[#101A17]"
            >
              {t.save}
            </button>
          </form>
        </div>
      )}

      {/* New Supplier Modal */}
      {showNewSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <form
            onSubmit={handleCreateSupplier}
            className="w-full max-w-md rounded-xl border border-[#384E43] bg-[#1B2A24] p-6 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#F3EFE6]">Add Supplier</h3>
              <button type="button" onClick={() => setShowNewSupplier(false)} className="text-[#A7B89A]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              required
              placeholder="Supplier Name"
              value={supplierForm.name}
              onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
            />
            <input
              placeholder="Contact Person"
              value={supplierForm.contact_person}
              onChange={(e) => setSupplierForm({ ...supplierForm, contact_person: e.target.value })}
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
            />
            <input
              placeholder="Phone"
              value={supplierForm.phone}
              onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-[#A7B89A] py-2.5 text-sm font-semibold text-[#101A17]"
            >
              {t.save}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
