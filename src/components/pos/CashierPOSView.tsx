import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Barcode,
  Coffee,
  CreditCard,
  History,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingBag,
  Trash2,
  X,
  Banknote,
  Split,
  Ban,
} from 'lucide-react';
import type {
  Addon,
  CafeTable,
  CartItem,
  Category,
  Language,
  Order,
  Product,
  ProductVariation,
  ShopSettings,
  User,
} from '../../types/pos';
import { apiRequest, submitOrderWithOfflineSupport } from '../../lib/api';
import {
  loadCachedCatalog,
  loadCachedTables,
  saveCachedCatalog,
  saveCachedTables,
} from '../../lib/offlineDb';
import { resolveProductImage } from '../../lib/productImages';
import { formatIQD, formatLocalDateTime, getLocalizedName, translations } from '../../i18n/translations';
import { printEscPosReceipt, triggerCashDrawer, useBarcodeScanner } from '../../lib/hardware';
import { posWsClient } from '../../lib/wsClient';

interface Props {
  lang: Language;
  user: User;
  settings: ShopSettings;
  onOfflineQueueChanged: () => void;
  preselectedTableId?: number | null;
  onConsumePreselectedTable?: () => void;
}

export const CashierPOSView: React.FC<Props> = ({
  lang,
  user,
  settings,
  onOfflineQueueChanged,
  preselectedTableId,
  onConsumePreselectedTable,
}) => {
  const t = translations[lang];
  const currency = settings.currency || 'IQD';
  const taxRate = Number(settings.tax_rate || 0);
  const serviceRate = Number(settings.service_charge_rate || 0);
  const canDiscount = user.role === 'owner' || user.permissions.includes('pos.discount');
  const canCancel = user.role === 'owner' || user.permissions.includes('pos.cancel_order');

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [tables, setTables] = useState<CafeTable[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Cart & order options
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway' | 'delivery'>('dine_in');
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed');
  const [discountValue, setDiscountValue] = useState<number>(0);

  // Modals
  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);
  const [selectedVariationId, setSelectedVariationId] = useState<number | null>(null);
  const [selectedAddonIds, setSelectedAddonIds] = useState<number[]>([]);
  const [itemNote, setItemNote] = useState('');

  const [showCheckout, setShowCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'split'>('cash');
  const [cashTendered, setCashTendered] = useState<number>(0);
  const [splitCash, setSplitCash] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [catRes, tabRes] = await Promise.all([
        apiRequest<{ categories: Category[]; products: Product[]; addons: Addon[] }>('/api/menu/catalog'),
        apiRequest<{ tables: CafeTable[] }>('/api/tables'),
      ]);
      setCategories(catRes.categories);
      setProducts(catRes.products);
      setAddons(catRes.addons);
      setTables(tabRes.tables);
      await saveCachedCatalog(catRes);
      await saveCachedTables(tabRes.tables);
    } catch {
      const cached = await loadCachedCatalog();
      const cachedTabs = await loadCachedTables();
      if (cached) {
        setCategories(cached.categories);
        setProducts(cached.products);
        setAddons(cached.addons);
      }
      if (cachedTabs) setTables(cachedTabs);
    }
  }, []);

  useEffect(() => {
    loadData();
    const unsub = posWsClient.onMessage((msg) => {
      if (msg.type === 'menu:updated' || msg.type === 'table:updated' || msg.type === 'inventory:updated') {
        loadData();
      }
    });
    return unsub;
  }, [loadData]);

  useEffect(() => {
    if (preselectedTableId) {
      setOrderType('dine_in');
      setSelectedTableId(preselectedTableId);
      onConsumePreselectedTable?.();
    }
  }, [preselectedTableId, onConsumePreselectedTable]);

  const addConfiguredToCart = useCallback(
    (product: Product, variation: ProductVariation | null, chosenAddons: Addon[], note: string) => {
      const addonKey = chosenAddons
        .map((a) => a.id)
        .sort()
        .join(',');
      const key = `${product.id}-${variation?.id || 0}-${addonKey}-${note.trim()}`;
      setCart((prev) => {
        const idx = prev.findIndex((c) => c.key === key);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
          return next;
        }
        return [...prev, { key, product, variation, addons: chosenAddons, quantity: 1, notes: note.trim() }];
      });
    },
    []
  );

  // HID Barcode scanner integration
  useBarcodeScanner(!showCheckout && !customizingProduct, (code) => {
    const match = products.find(
      (p) => p.is_available && (p.barcode === code || p.sku.toLowerCase() === code.toLowerCase())
    );
    if (match) {
      const defaultVar = match.variations.find((v) => v.is_default) || match.variations[0] || null;
      addConfiguredToCart(match, defaultVar, [], '');
      setStatusMessage(`Scanned: ${getLocalizedName(match, lang)}`);
      window.setTimeout(() => setStatusMessage(''), 2500);
    }
  });

  const openProductSelector = (product: Product) => {
    if (!product.is_available) return;
    if (product.variations.length <= 1 && addons.length === 0) {
      addConfiguredToCart(product, product.variations[0] || null, [], '');
      return;
    }
    const defaultVar = product.variations.find((v) => v.is_default) || product.variations[0] || null;
    setCustomizingProduct(product);
    setSelectedVariationId(defaultVar?.id ?? null);
    setSelectedAddonIds([]);
    setItemNote('');
  };

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (selectedCategory !== 'all' && p.category_id !== selectedCategory) return false;
      if (!q) return true;
      return (
        p.name_en.toLowerCase().includes(q) ||
        p.name_ckb.toLowerCase().includes(q) ||
        p.name_ar.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q)
      );
    });
  }, [products, selectedCategory, searchQuery]);

  const totals = useMemo(() => {
    const subtotal = cart.reduce((sum, item) => {
      const unit = item.product.base_price + (item.variation?.price_delta || 0);
      const addonSum = item.addons.reduce((a, x) => a + x.price, 0);
      return sum + (unit + addonSum) * item.quantity;
    }, 0);

    const discountAmount =
      discountType === 'percent'
        ? Math.min(subtotal, Math.round((subtotal * Math.min(discountValue, 100)) / 100))
        : Math.min(subtotal, Math.max(0, discountValue));

    const netSub = Math.max(0, subtotal - discountAmount);
    const taxAmount = Math.round((netSub * taxRate) / 100);
    const serviceAmount = orderType === 'dine_in' ? Math.round((netSub * serviceRate) / 100) : 0;
    const total = netSub + taxAmount + serviceAmount;

    return { subtotal, discountAmount, taxAmount, serviceAmount, total };
  }, [cart, discountType, discountValue, taxRate, serviceRate, orderType]);

  const handleOpenCheckout = () => {
    if (cart.length === 0) return;
    setCashTendered(totals.total);
    setSplitCash(Math.round(totals.total / 2));
    setShowCheckout(true);
  };

  const handleCompleteSale = async () => {
    if (cart.length === 0 || submitting) return;
    setSubmitting(true);
    setStatusMessage('');
    try {
      const payload = {
        order_type: orderType,
        table_id: orderType === 'dine_in' ? selectedTableId : null,
        customer_name: customerName,
        customer_phone: customerPhone,
        discount_amount: canDiscount ? discountValue : 0,
        discount_type: discountType,
        payment_method: paymentMethod,
        cash_amount: paymentMethod === 'split' ? splitCash : paymentMethod === 'cash' ? totals.total : 0,
        card_amount:
          paymentMethod === 'split'
            ? Math.max(0, totals.total - splitCash)
            : paymentMethod === 'card'
            ? totals.total
            : 0,
        notes: orderNotes,
        items: cart.map((c) => ({
          product_id: c.product.id,
          variation_id: c.variation?.id ?? null,
          quantity: c.quantity,
          addon_ids: c.addons.map((a) => a.id),
          notes: c.notes,
        })),
      };

      const res = await submitOrderWithOfflineSupport(payload, {
        total_amount: totals.total,
        item_count: cart.reduce((s, c) => s + c.quantity, 0),
        payment_method: paymentMethod,
        order_type: orderType,
      });

      if (res.queued) {
        onOfflineQueueChanged();
        setStatusMessage(t.offlineMode);
      } else if (res.order) {
        setReceiptOrder(res.order);
        if (paymentMethod === 'cash' || paymentMethod === 'split') {
          triggerCashDrawer().catch(() => {});
        }
      }

      setCart([]);
      setDiscountValue(0);
      setOrderNotes('');
      setCustomerName('');
      setCustomerPhone('');
      setSelectedTableId(null);
      setShowCheckout(false);
      loadData();
    } catch (err) {
      setStatusMessage((err as Error).message || 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  };

  const loadHistory = async () => {
    try {
      const res = await apiRequest<{ orders: Order[] }>('/api/orders?limit=40');
      setRecentOrders(res.orders);
    } catch {
      // offline
    }
  };

  const handleOpenHistory = () => {
    setShowHistory(true);
    loadHistory();
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    try {
      await apiRequest(`/api/orders/${cancelTarget.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason || 'Cancelled from POS terminal' }),
      });
      setCancelTarget(null);
      setCancelReason('');
      loadHistory();
      loadData();
    } catch (err) {
      setStatusMessage((err as Error).message);
    }
  };

  const changeDue = paymentMethod === 'cash' ? Math.max(0, cashTendered - totals.total) : 0;

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-57px)] lg:h-[calc(100vh-57px)] lg:overflow-hidden">
      {/* Left: Catalog & Controls */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden p-4 sm:p-5 gap-4">
        {/* Search, Barcode & History Bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-[#A7B89A] absolute top-1/2 -translate-y-1/2 start-3.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchQuery.trim()) {
                  const exact = products.find(
                    (p) => p.barcode === searchQuery.trim() || p.sku.toLowerCase() === searchQuery.trim().toLowerCase()
                  );
                  if (exact && exact.is_available) {
                    openProductSelector(exact);
                    setSearchQuery('');
                  }
                }
              }}
              placeholder={t.searchProducts}
              className="w-full rounded-lg border border-[#384E43] bg-[#1B2A24] ps-10 pe-10 py-2.5 text-sm text-[#F3EFE6] placeholder:text-[#A7B89A]/50 focus:border-[#A7B89A] focus:outline-none"
            />
            <Barcode className="w-4 h-4 text-[#D6C7A3]/60 absolute top-1/2 -translate-y-1/2 end-3.5" />
          </div>

          <button
            type="button"
            onClick={handleOpenHistory}
            className="flex items-center gap-2 rounded-lg border border-[#384E43] bg-[#1B2A24] px-3.5 py-2.5 text-xs font-medium text-[#F3EFE6] hover:border-[#A7B89A] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <History className="w-4 h-4 text-[#D6C7A3]" />
            <span>{t.transactionHistory}</span>
          </button>
        </div>

        {statusMessage && (
          <div className="rounded-lg border border-[#A7B89A]/40 bg-[#293B32] px-4 py-2 text-xs text-[#D6C7A3]">
            {statusMessage}
          </div>
        )}

        {/* Categories Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-[#A7B89A] text-[#101A17] font-semibold'
                : 'bg-[#1B2A24] text-[#F3EFE6]/80 border border-[#2F443A] hover:border-[#A7B89A]'
            }`}
          >
            {t.allProducts}
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-[#A7B89A] text-[#101A17] font-semibold'
                  : 'bg-[#1B2A24] text-[#F3EFE6]/80 border border-[#2F443A] hover:border-[#A7B89A]'
              }`}
            >
              {getLocalizedName(cat, lang)}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto pe-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5">
            {filteredProducts.map((product) => {
              const imgSrc = resolveProductImage(product.image_url);
              const outOfStock =
                !product.is_available ||
                (product.track_direct_stock === 1 && product.direct_stock_qty <= 0);
              return (
                <button
                  key={product.id}
                  type="button"
                  disabled={outOfStock}
                  onClick={() => openProductSelector(product)}
                  className={`group text-start rounded-xl border border-[#384E43] bg-[#293B32] overflow-hidden flex flex-col transition-colors cursor-pointer ${
                    outOfStock ? 'opacity-45 cursor-not-allowed' : 'hover:border-[#A7B89A]'
                  }`}
                >
                  <div className="aspect-[4/3] w-full bg-[#1B2A24] relative overflow-hidden">
                    {imgSrc ? (
                      <img
                        src={imgSrc}
                        alt={getLocalizedName(product, lang)}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                      />
                    ) : (
                      <div className="h-full w-full flex flex-col items-center justify-center bg-gradient-to-br from-[#1B2A24] to-[#101A17] text-[#A7B89A]">
                        <Coffee className="w-7 h-7 mb-1 opacity-70" />
                        <span className="text-[11px]">{product.sku}</span>
                      </div>
                    )}
                    {outOfStock && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-xs font-semibold text-amber-200">
                        {t.unavailableLabel}
                      </div>
                    )}
                  </div>
                  <div className="p-3 flex-1 flex flex-col justify-between w-full">
                    <div>
                      <div className="text-sm font-semibold text-[#F3EFE6] line-clamp-1">
                        {getLocalizedName(product, lang)}
                      </div>
                      <div className="text-[11px] text-[#A7B89A] mt-0.5 tabular-nums">
                        {product.sku}
                        {product.variations.length > 1
                          ? ` · ${product.variations.length} ${t.variationsAndSize}`
                          : ''}
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between">
                      <span className="text-sm font-bold text-[#D6C7A3] tabular-nums">
                        {formatIQD(product.base_price, currency)}
                      </span>
                      {product.track_direct_stock === 1 && (
                        <span className="text-[11px] text-[#F3EFE6]/65 tabular-nums">
                          {product.direct_stock_qty} {t.leftInStock}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right: Cart & Order Terminal */}
      <div className="w-full lg:w-[390px] xl:w-[420px] shrink-0 bg-[#1B2A24] border-t lg:border-t-0 lg:border-s border-[#2F443A] flex flex-col h-[50vh] lg:h-full">
        <div className="p-4 border-b border-[#2F443A] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-[#A7B89A]" />
            <h2 className="text-sm font-bold text-[#F3EFE6]">{t.cart}</h2>
          </div>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={() => setCart([])}
              className="text-xs text-[#D6C7A3] hover:text-[#F3EFE6] cursor-pointer"
            >
              {t.clearCart}
            </button>
          )}
        </div>

        {/* Order Type & Table */}
        <div className="p-3 border-b border-[#2F443A] space-y-2.5">
          <div className="grid grid-cols-3 gap-1.5 bg-[#101A17] p-1 rounded-lg">
            {(['dine_in', 'takeaway', 'delivery'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setOrderType(mode)}
                className={`py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  orderType === mode
                    ? 'bg-[#A7B89A] text-[#101A17] font-semibold'
                    : 'text-[#F3EFE6]/75 hover:text-[#F3EFE6]'
                }`}
              >
                {mode === 'dine_in' ? t.dineIn : mode === 'takeaway' ? t.takeaway : t.delivery}
              </button>
            ))}
          </div>

          {orderType === 'dine_in' ? (
            <select
              value={selectedTableId ?? ''}
              onChange={(e) => setSelectedTableId(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6] focus:border-[#A7B89A] focus:outline-none"
            >
              <option value="">{t.selectTable}</option>
              {tables.map((tb) => (
                <option key={tb.id} value={tb.id}>
                  {tb.table_number} — {tb.name} ({tb.zone}) [{tb.status}]
                </option>
              ))}
            </select>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={t.customerName}
                className="rounded-lg border border-[#384E43] bg-[#101A17] px-2.5 py-1.5 text-xs text-[#F3EFE6] focus:border-[#A7B89A] focus:outline-none"
              />
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder={t.customerPhone}
                className="rounded-lg border border-[#384E43] bg-[#101A17] px-2.5 py-1.5 text-xs text-[#F3EFE6] focus:border-[#A7B89A] focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-[#A7B89A]/70 px-4">
              <Coffee className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-xs">{t.emptyCart}</p>
            </div>
          ) : (
            cart.map((item) => {
              const unitPrice =
                item.product.base_price +
                (item.variation?.price_delta || 0) +
                item.addons.reduce((s, a) => s + a.price, 0);
              return (
                <div
                  key={item.key}
                  className="rounded-lg border border-[#384E43] bg-[#293B32]/80 p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#F3EFE6] truncate">
                        {getLocalizedName(item.product, lang)}
                      </div>
                      <div className="text-[11px] text-[#A7B89A]">
                        {item.variation ? getLocalizedName(item.variation, lang) : ''}
                        {item.addons.length > 0
                          ? ` · +${item.addons.map((a) => getLocalizedName(a, lang)).join(', ')}`
                          : ''}
                      </div>
                      {item.notes && <div className="text-[11px] text-[#D6C7A3] mt-0.5">{item.notes}</div>}
                    </div>
                    <button
                      type="button"
                      onClick={() => setCart((prev) => prev.filter((c) => c.key !== item.key))}
                      className="p-1 text-[#A7B89A] hover:text-red-300 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setCart((prev) =>
                            prev
                              .map((c) => (c.key === item.key ? { ...c, quantity: c.quantity - 1 } : c))
                              .filter((c) => c.quantity > 0)
                          )
                        }
                        className="w-7 h-7 rounded-md bg-[#101A17] border border-[#384E43] flex items-center justify-center text-[#F3EFE6] hover:border-[#A7B89A] cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-7 text-center text-xs font-bold tabular-nums">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setCart((prev) =>
                            prev.map((c) => (c.key === item.key ? { ...c, quantity: c.quantity + 1 } : c))
                          )
                        }
                        className="w-7 h-7 rounded-md bg-[#101A17] border border-[#384E43] flex items-center justify-center text-[#F3EFE6] hover:border-[#A7B89A] cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="text-sm font-bold text-[#D6C7A3] tabular-nums">
                      {formatIQD(unitPrice * item.quantity, currency)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Totals & Checkout Footer */}
        <div className="p-4 border-t border-[#2F443A] bg-[#16231E] space-y-3">
          {canDiscount && cart.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as 'fixed' | 'percent')}
                className="rounded-lg border border-[#384E43] bg-[#101A17] px-2 py-1.5 text-xs text-[#F3EFE6]"
              >
                <option value="fixed">{currency}</option>
                <option value="percent">%</option>
              </select>
              <input
                type="number"
                min={0}
                value={discountValue || ''}
                onChange={(e) => setDiscountValue(Math.max(0, Number(e.target.value)))}
                placeholder={t.discount}
                className="w-28 rounded-lg border border-[#384E43] bg-[#101A17] px-2.5 py-1.5 text-xs text-[#F3EFE6] tabular-nums"
              />
              <input
                type="text"
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder={t.orderNotes}
                className="flex-1 min-w-0 rounded-lg border border-[#384E43] bg-[#101A17] px-2.5 py-1.5 text-xs text-[#F3EFE6]"
              />
            </div>
          )}

          <div className="space-y-1 text-xs tabular-nums">
            <div className="flex justify-between text-[#A7B89A]">
              <span>{t.subtotal}</span>
              <span>{formatIQD(totals.subtotal, currency)}</span>
            </div>
            {totals.discountAmount > 0 && (
              <div className="flex justify-between text-amber-300">
                <span>{t.discount}</span>
                <span>-{formatIQD(totals.discountAmount, currency)}</span>
              </div>
            )}
            {totals.taxAmount > 0 && (
              <div className="flex justify-between text-[#A7B89A]">
                <span>
                  {t.tax} ({taxRate}%)
                </span>
                <span>{formatIQD(totals.taxAmount, currency)}</span>
              </div>
            )}
            {totals.serviceAmount > 0 && (
              <div className="flex justify-between text-[#A7B89A]">
                <span>
                  {t.serviceCharge} ({serviceRate}%)
                </span>
                <span>{formatIQD(totals.serviceAmount, currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-[#F3EFE6] pt-1 border-t border-[#2F443A]">
              <span>{t.total}</span>
              <span className="text-[#D6C7A3]">{formatIQD(totals.total, currency)}</span>
            </div>
          </div>

          <button
            type="button"
            disabled={cart.length === 0}
            onClick={handleOpenCheckout}
            className="w-full rounded-lg bg-[#A7B89A] py-3 text-sm font-bold text-[#101A17] hover:bg-[#b8c8ac] disabled:opacity-40 transition-colors cursor-pointer"
          >
            {t.checkout}
          </button>
        </div>
      </div>

      {/* Product Variation & Add-on Modal */}
      {customizingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#384E43] bg-[#1B2A24] p-6 text-[#F3EFE6] space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">{getLocalizedName(customizingProduct, lang)}</h3>
                <p className="text-xs text-[#A7B89A] mt-0.5 tabular-nums">
                  {formatIQD(customizingProduct.base_price, currency)} · {customizingProduct.sku}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCustomizingProduct(null)}
                className="p-1 text-[#A7B89A] hover:text-[#F3EFE6]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {customizingProduct.variations.length > 0 && (
              <div>
                <div className="text-xs font-medium text-[#D6C7A3] mb-2">{t.variationsAndSize}</div>
                <div className="grid grid-cols-2 gap-2">
                  {customizingProduct.variations.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVariationId(v.id)}
                      className={`p-2.5 rounded-lg border text-start text-xs transition-colors cursor-pointer ${
                        selectedVariationId === v.id
                          ? 'border-[#A7B89A] bg-[#293B32] text-[#F3EFE6] font-semibold'
                          : 'border-[#384E43] bg-[#101A17] text-[#F3EFE6]/75'
                      }`}
                    >
                      <div>{getLocalizedName(v, lang)}</div>
                      <div className="text-[#D6C7A3] tabular-nums mt-0.5">
                        {v.price_delta > 0 ? `+${formatIQD(v.price_delta, currency)}` : 'Base'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {addons.length > 0 && (
              <div>
                <div className="text-xs font-medium text-[#D6C7A3] mb-2">{t.addonsAndExtras}</div>
                <div className="grid grid-cols-2 gap-2">
                  {addons.map((a) => {
                    const checked = selectedAddonIds.includes(a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() =>
                          setSelectedAddonIds((prev) =>
                            checked ? prev.filter((id) => id !== a.id) : [...prev, a.id]
                          )
                        }
                        className={`p-2.5 rounded-lg border text-start text-xs transition-colors cursor-pointer ${
                          checked
                            ? 'border-[#A7B89A] bg-[#293B32] text-[#F3EFE6] font-semibold'
                            : 'border-[#384E43] bg-[#101A17] text-[#F3EFE6]/75'
                        }`}
                      >
                        <div>{getLocalizedName(a, lang)}</div>
                        <div className="text-[#D6C7A3] tabular-nums mt-0.5">
                          +{formatIQD(a.price, currency)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <input
              type="text"
              value={itemNote}
              onChange={(e) => setItemNote(e.target.value)}
              placeholder="Item note (e.g. extra hot, less ice)"
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
            />

            <button
              type="button"
              onClick={() => {
                const variation =
                  customizingProduct.variations.find((v) => v.id === selectedVariationId) || null;
                const chosenAddons = addons.filter((a) => selectedAddonIds.includes(a.id));
                addConfiguredToCart(customizingProduct, variation, chosenAddons, itemNote);
                setCustomizingProduct(null);
              }}
              className="w-full rounded-lg bg-[#A7B89A] py-2.5 text-sm font-bold text-[#101A17] hover:bg-[#b8c8ac] cursor-pointer"
            >
              {t.addToCart}
            </button>
          </div>
        </div>
      )}

      {/* Checkout Payment Modal */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#384E43] bg-[#1B2A24] p-6 text-[#F3EFE6] space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">{t.paymentMethod}</h3>
              <button type="button" onClick={() => setShowCheckout(false)} className="text-[#A7B89A]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-lg bg-[#101A17] border border-[#384E43] p-4 flex items-center justify-between">
              <span className="text-sm text-[#A7B89A]">{t.total}</span>
              <span className="text-2xl font-bold text-[#D6C7A3] tabular-nums">
                {formatIQD(totals.total, currency)}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'cash' as const, label: t.cash, icon: Banknote },
                { id: 'card' as const, label: t.card, icon: CreditCard },
                { id: 'split' as const, label: t.split, icon: Split },
              ].map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id)}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                      paymentMethod === m.id
                        ? 'border-[#A7B89A] bg-[#293B32] text-[#F3EFE6]'
                        : 'border-[#384E43] bg-[#101A17] text-[#A7B89A]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>

            {paymentMethod === 'cash' && (
              <div className="space-y-2.5">
                <label className="block text-xs text-[#D6C7A3]">{t.cashAmount}</label>
                <input
                  type="number"
                  value={cashTendered}
                  onChange={(e) => setCashTendered(Number(e.target.value))}
                  className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3.5 py-2.5 text-sm text-[#F3EFE6] tabular-nums"
                />
                <div className="flex flex-wrap gap-2">
                  {[totals.total, 5000, 10000, 25000, 50000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setCashTendered(amt)}
                      className="rounded-md border border-[#384E43] bg-[#293B32] px-2.5 py-1 text-xs text-[#F3EFE6] tabular-nums cursor-pointer"
                    >
                      {amt.toLocaleString()}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-xs pt-1 tabular-nums">
                  <span className="text-[#A7B89A]">{t.changeDue}</span>
                  <span className="font-bold text-[#A7B89A]">{formatIQD(changeDue, currency)}</span>
                </div>
              </div>
            )}

            {paymentMethod === 'split' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#D6C7A3] mb-1">{t.cashAmount}</label>
                  <input
                    type="number"
                    min={0}
                    max={totals.total}
                    value={splitCash}
                    onChange={(e) => setSplitCash(Math.min(totals.total, Math.max(0, Number(e.target.value))))}
                    className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-sm text-[#F3EFE6] tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#D6C7A3] mb-1">{t.cardAmount}</label>
                  <input
                    type="number"
                    readOnly
                    value={Math.max(0, totals.total - splitCash)}
                    className="w-full rounded-lg border border-[#384E43] bg-[#101A17]/60 px-3 py-2 text-sm text-[#A7B89A] tabular-nums"
                  />
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={submitting}
              onClick={handleCompleteSale}
              className="w-full rounded-lg bg-[#A7B89A] py-3 text-sm font-bold text-[#101A17] hover:bg-[#b8c8ac] disabled:opacity-50 cursor-pointer"
            >
              {submitting ? '...' : t.completeSale}
            </button>
          </div>
        </div>
      )}

      {/* Thermal Receipt Modal */}
      {receiptOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[#384E43] bg-[#1B2A24] p-5 space-y-4">
            <div className="flex items-center justify-between no-print">
              <h3 className="text-sm font-bold text-[#F3EFE6]">{receiptOrder.order_number}</h3>
              <button type="button" onClick={() => setReceiptOrder(null)} className="text-[#A7B89A]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="thermal-receipt rounded-lg bg-white text-black p-4 text-xs font-mono space-y-2">
              <div className="text-center border-b border-dashed border-neutral-400 pb-2">
                <div className="font-bold text-sm">{settings.shop_name}</div>
                <div className="text-[10px] whitespace-pre-line">{settings.receipt_header}</div>
                <div className="text-[10px]">{settings.address}</div>
                <div className="text-[10px]">{settings.phone}</div>
              </div>

              <div className="flex justify-between text-[11px]">
                <span>#{receiptOrder.order_number}</span>
                <span>{new Date(receiptOrder.created_at).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-[11px] border-b border-dashed border-neutral-400 pb-2">
                <span>{receiptOrder.order_type.toUpperCase()}</span>
                <span>{receiptOrder.payment_method.toUpperCase()}</span>
              </div>

              <div className="space-y-1.5 border-b border-dashed border-neutral-400 pb-2">
                {receiptOrder.items.map((item) => (
                  <div key={item.id}>
                    <div className="flex justify-between">
                      <span>
                        {item.quantity}x {item.product_name}
                      </span>
                      <span>{formatIQD(item.line_total, currency)}</span>
                    </div>
                    {item.variation_name && (
                      <div className="text-[10px] text-neutral-600 ps-3">{item.variation_name}</div>
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-0.5 text-[11px]">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatIQD(receiptOrder.subtotal, currency)}</span>
                </div>
                {receiptOrder.discount_amount > 0 && (
                  <div className="flex justify-between">
                    <span>Discount</span>
                    <span>-{formatIQD(receiptOrder.discount_amount, currency)}</span>
                  </div>
                )}
                {receiptOrder.tax_amount > 0 && (
                  <div className="flex justify-between">
                    <span>Tax</span>
                    <span>{formatIQD(receiptOrder.tax_amount, currency)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm pt-1">
                  <span>TOTAL</span>
                  <span>{formatIQD(receiptOrder.total_amount, currency)}</span>
                </div>
              </div>

              <div className="text-center text-[10px] pt-2 border-t border-dashed border-neutral-400">
                {settings.receipt_footer}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 no-print">
              <button
                type="button"
                onClick={() => printEscPosReceipt(receiptOrder, settings)}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-[#A7B89A] py-2 text-xs font-semibold text-[#101A17] cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{t.printReceipt}</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  const res = await triggerCashDrawer();
                  setStatusMessage(res.message);
                }}
                className="rounded-lg border border-[#384E43] bg-[#293B32] py-2 text-xs font-medium text-[#F3EFE6] cursor-pointer"
              >
                {t.openCashDrawer}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction History Drawer */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70">
          <div className="w-full max-w-lg bg-[#1B2A24] border-s border-[#384E43] h-full flex flex-col p-5">
            <div className="flex items-center justify-between pb-4 border-b border-[#2F443A]">
              <h3 className="text-base font-bold text-[#F3EFE6]">{t.transactionHistory}</h3>
              <button type="button" onClick={() => setShowHistory(false)} className="text-[#A7B89A]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#2F443A] mt-2">
              {recentOrders.map((ord) => (
                <div key={ord.id} className="py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#F3EFE6] tabular-nums">
                      {ord.order_number} · {formatIQD(ord.total_amount, currency)}
                    </div>
                    <div className="text-xs text-[#A7B89A] tabular-nums">
                      {formatLocalDateTime(ord.created_at)} · {ord.payment_method.toUpperCase()} · {ord.status}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setReceiptOrder(ord)}
                      className="p-2 rounded-lg border border-[#384E43] bg-[#293B32] text-[#F3EFE6] hover:border-[#A7B89A] cursor-pointer"
                      title={t.printReceipt}
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                    {canCancel && ord.status !== 'cancelled' && (
                      <button
                        type="button"
                        onClick={() => setCancelTarget(ord)}
                        className="p-2 rounded-lg border border-red-400/40 bg-red-950/40 text-red-200 hover:bg-red-900/50 cursor-pointer"
                        title={t.cancelOrder}
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Cancel Order Confirmation */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[#384E43] bg-[#1B2A24] p-5 space-y-4">
            <h3 className="text-base font-bold text-[#F3EFE6]">
              {t.cancelOrder}: {cancelTarget.order_number}
            </h3>
            <p className="text-xs text-[#A7B89A]">
              Stock and ingredients deducted for this order will be restored automatically in SQLite.
            </p>
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
                className="flex-1 rounded-lg border border-[#384E43] py-2 text-xs text-[#F3EFE6]"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                className="flex-1 rounded-lg bg-red-600 py-2 text-xs font-semibold text-white hover:bg-red-500"
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
