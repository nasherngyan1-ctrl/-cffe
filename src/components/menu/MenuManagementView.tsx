import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Coffee,
  Edit2,
  LayoutGrid,
  List,
  Plus,
  Power,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  Addon,
  Category,
  InventoryItem,
  Language,
  Product,
  ShopSettings,
} from '../../types/pos';
import { apiRequest } from '../../lib/api';
import { PRESET_GALLERY, resolveProductImage } from '../../lib/productImages';
import { formatIQD, getLocalizedName, translations } from '../../i18n/translations';

interface Props {
  lang: Language;
  settings: ShopSettings;
  initialSection?: 'products' | 'categories';
}

export const MenuManagementView: React.FC<Props> = ({
  lang,
  settings,
  initialSection = 'products',
}) => {
  const t = translations[lang];
  const currency = settings.currency || 'IQD';

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [activeSub, setActiveSub] = useState<'products' | 'categories' | 'sizes' | 'addons'>(
    initialSection
  );

  // Sync with Sidebar click (Products vs Categories)
  useEffect(() => {
    setActiveSub(initialSection);
  }, [initialSection]);

  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all');
  const [errorMsg, setErrorMsg] = useState('');

  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [uploadingImg, setUploadingImg] = useState(false);

  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);
  const [catForm, setCatForm] = useState({ name_ckb: '', name_ar: '', name_en: '', sort_order: 10 });

  const [addonForm, setAddonForm] = useState({
    name_ckb: '',
    name_ar: '',
    name_en: '',
    price: 1000,
    ingredient_id: '',
    ingredient_qty: 0,
  });

  const loadAll = useCallback(async () => {
    try {
      const [catRes, invRes] = await Promise.all([
        apiRequest<{ categories: Category[]; products: Product[]; addons: Addon[] }>(
          '/api/menu/catalog?include_inactive=1'
        ),
        apiRequest<{ items: InventoryItem[] }>('/api/inventory'),
      ]);
      setCategories(catRes.categories);
      setProducts(catRes.products);
      setAddons(catRes.addons);
      setInventoryItems(invRes.items);
    } catch (err) {
      setErrorMsg((err as Error).message || 'Failed to load catalog');
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter !== 'all' && p.category_id !== categoryFilter) return false;
      if (!q) return true;
      return (
        p.name_en.toLowerCase().includes(q) ||
        p.name_ckb.toLowerCase().includes(q) ||
        p.name_ar.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q)
      );
    });
  }, [products, searchQuery, categoryFilter]);

  const activeCategories = categories.filter((c) => c.is_active !== 0);

  const openNewProduct = () => {
    setErrorMsg('');
    setEditingProduct({
      category_id: activeCategories[0]?.id || categories[0]?.id || 1,
      sku: `BSL-${Math.floor(Math.random() * 900 + 100)}`,
      barcode: '',
      name_ckb: '',
      name_ar: '',
      name_en: '',
      base_price: 5000,
      cost_estimate: 1500,
      image_url: PRESET_GALLERY[0].path,
      is_available: 1,
      is_active: 1,
      track_direct_stock: 0,
      direct_stock_qty: 0,
      low_stock_threshold: 5,
      variations: [
        {
          id: 0,
          product_id: 0,
          name_ckb: 'مامناوەند',
          name_ar: 'وسط',
          name_en: 'Regular',
          price_delta: 0,
          recipe_multiplier: 1,
          is_default: 1,
        },
      ],
      recipes: [],
    });
  };

  const handleImageUpload = async (file: File) => {
    setUploadingImg(true);
    setErrorMsg('');
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await apiRequest<{ imageUrl: string }>('/api/menu/upload-image', {
        method: 'POST',
        body: fd,
      });
      setEditingProduct((prev) => (prev ? { ...prev, image_url: res.imageUrl } : prev));
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setUploadingImg(false);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setErrorMsg('');
    try {
      if (editingProduct.id) {
        await apiRequest(`/api/menu/products/${editingProduct.id}`, {
          method: 'PUT',
          body: JSON.stringify(editingProduct),
        });
      } else {
        await apiRequest('/api/menu/products', {
          method: 'POST',
          body: JSON.stringify(editingProduct),
        });
      }
      setEditingProduct(null);
      loadAll();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const toggleAvailability = async (product: Product) => {
    setErrorMsg('');
    try {
      await apiRequest(`/api/menu/products/${product.id}/availability`, {
        method: 'PATCH',
        body: JSON.stringify({ is_available: !product.is_available }),
      });
      loadAll();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const toggleActive = async (product: Product) => {
    setErrorMsg('');
    try {
      await apiRequest(`/api/menu/products/${product.id}/active`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !product.is_active }),
      });
      loadAll();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const deleteProductPermanent = async (product: Product) => {
    setErrorMsg('');
    try {
      await apiRequest(`/api/menu/products/${product.id}?permanent=1`, { method: 'DELETE' });
      loadAll();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      await apiRequest('/api/menu/categories', { method: 'POST', body: JSON.stringify(catForm) });
      setCatForm({ name_ckb: '', name_ar: '', name_en: '', sort_order: 10 });
      loadAll();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleSaveEditCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory?.id) return;
    setErrorMsg('');
    try {
      await apiRequest(`/api/menu/categories/${editingCategory.id}`, {
        method: 'PUT',
        body: JSON.stringify(editingCategory),
      });
      setEditingCategory(null);
      loadAll();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleDeleteCategory = async (catId: number) => {
    setErrorMsg('');
    try {
      await apiRequest(`/api/menu/categories/${catId}`, { method: 'DELETE' });
      loadAll();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleAddAddon = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      await apiRequest('/api/menu/addons', {
        method: 'POST',
        body: JSON.stringify({
          ...addonForm,
          ingredient_id: addonForm.ingredient_id ? Number(addonForm.ingredient_id) : null,
        }),
      });
      setAddonForm({
        name_ckb: '',
        name_ar: '',
        name_en: '',
        price: 1000,
        ingredient_id: '',
        ingredient_qty: 0,
      });
      loadAll();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleDeleteAddon = async (addonId: number) => {
    setErrorMsg('');
    try {
      await apiRequest(`/api/menu/addons/${addonId}`, { method: 'DELETE' });
      loadAll();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const getProductCategoryName = (prod: Product) => {
    if (lang === 'ckb') return prod.category_name_ckb || prod.category_name_en || '';
    if (lang === 'ar') return prod.category_name_ar || prod.category_name_en || '';
    return prod.category_name_en || '';
  };

  const renderStockDisplay = (prod: Product) => {
    if (prod.track_direct_stock) {
      const low = prod.direct_stock_qty <= prod.low_stock_threshold;
      return (
        <span className={`tabular-nums font-medium ${low ? 'text-amber-300' : 'text-[#A7B89A]'}`}>
          {prod.direct_stock_qty} {t.units}
        </span>
      );
    }
    return (
      <span className="text-[#D6C7A3] tabular-nums">
        {prod.recipes.length} {t.recipeLinked}
      </span>
    );
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1440px] mx-auto space-y-5">
      {/* Top Sub-Navigation + Add Product */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-[#1B2A24] p-1 rounded-lg border border-[#2F443A] overflow-x-auto">
          {[
            { id: 'products' as const, label: t.navProducts },
            { id: 'categories' as const, label: t.navCategories },
            { id: 'sizes' as const, label: t.manageSizes },
            { id: 'addons' as const, label: t.manageExtras },
          ].map((tb) => (
            <button
              key={tb.id}
              type="button"
              onClick={() => setActiveSub(tb.id)}
              className={`px-3.5 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                activeSub === tb.id
                  ? 'bg-[#A7B89A] text-[#101A17] font-semibold'
                  : 'text-[#F3EFE6]/75 hover:text-[#F3EFE6]'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {activeSub === 'products' && (
          <button
            type="button"
            onClick={openNewProduct}
            className="flex items-center gap-1.5 rounded-lg bg-[#A7B89A] px-4 py-2 text-xs font-semibold text-[#101A17] hover:bg-[#b8c8ac] whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.addProduct}</span>
          </button>
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

      {/* PRODUCTS SECTION */}
      {activeSub === 'products' && (
        <div className="space-y-4">
          {/* Search + Category Filter + Table/Card Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
              <div className="relative flex-1 max-w-sm min-w-[200px]">
                <Search className="w-4 h-4 text-[#A7B89A] absolute top-1/2 -translate-y-1/2 start-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.searchByNameSku}
                  className="w-full rounded-lg border border-[#384E43] bg-[#1B2A24] ps-9 pe-3 py-2 text-xs text-[#F3EFE6] placeholder:text-[#A7B89A]/50 focus:border-[#A7B89A] focus:outline-none"
                />
              </div>

              <select
                value={categoryFilter}
                onChange={(e) =>
                  setCategoryFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                className="rounded-lg border border-[#384E43] bg-[#1B2A24] px-3 py-2 text-xs text-[#F3EFE6] focus:border-[#A7B89A] focus:outline-none"
              >
                <option value="all">{t.allCategories}</option>
                {activeCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {getLocalizedName(c, lang)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1 bg-[#1B2A24] p-1 rounded-lg border border-[#2F443A]">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-[#293B32] text-[#D6C7A3] font-semibold'
                    : 'text-[#F3EFE6]/70'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>{t.tableView}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-[#293B32] text-[#D6C7A3] font-semibold'
                    : 'text-[#F3EFE6]/70'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>{t.cardView}</span>
              </button>
            </div>
          </div>

          {/* Table View */}
          {viewMode === 'table' ? (
            <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#384E43] text-xs text-[#A7B89A]">
                    <th className="pb-2.5 text-start font-medium">{t.productLabel}</th>
                    <th className="pb-2.5 text-start font-medium">{t.categoryLabel}</th>
                    <th className="pb-2.5 text-end font-medium">{t.priceLabel}</th>
                    <th className="pb-2.5 text-start font-medium ps-4">{t.stockLabel}</th>
                    <th className="pb-2.5 text-center font-medium">{t.availabilityLabel}</th>
                    <th className="pb-2.5 text-center font-medium">{t.activeLabel}</th>
                    <th className="pb-2.5 text-end font-medium">{t.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#384E43]/60">
                  {filteredProducts.map((prod) => {
                    const imgSrc = resolveProductImage(prod.image_url);
                    return (
                      <tr key={prod.id} className={`hover:bg-[#1B2A24]/40 ${!prod.is_active ? 'opacity-55' : ''}`}>
                        <td className="py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-9 rounded-lg overflow-hidden bg-[#1B2A24] border border-[#384E43] shrink-0 flex items-center justify-center">
                              {imgSrc ? (
                                <img
                                  src={imgSrc}
                                  alt={prod.name_en}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Coffee className="w-4 h-4 text-[#A7B89A]" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-[#F3EFE6] truncate">
                                {getLocalizedName(prod, lang)}
                              </div>
                              <div className="text-[11px] text-[#A7B89A] tabular-nums">
                                {prod.sku} · {prod.variations.length} {t.variationsAndSize}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-xs text-[#D6C7A3]">{getProductCategoryName(prod)}</td>
                        <td className="py-3 text-end font-semibold tabular-nums">
                          {formatIQD(prod.base_price, currency)}
                        </td>
                        <td className="py-3 ps-4 text-xs">{renderStockDisplay(prod)}</td>
                        <td className="py-3 text-center">
                          <button
                            type="button"
                            onClick={() => toggleAvailability(prod)}
                            className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                              prod.is_available
                                ? 'bg-[#A7B89A]/20 text-[#A7B89A]'
                                : 'bg-amber-950/50 text-amber-300'
                            }`}
                          >
                            {prod.is_available ? t.available : t.pausedLabel}
                          </button>
                        </td>
                        <td className="py-3 text-center">
                          <button
                            type="button"
                            onClick={() => toggleActive(prod)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                              prod.is_active
                                ? 'bg-emerald-950/50 text-emerald-300 border border-emerald-500/30'
                                : 'bg-red-950/50 text-red-300 border border-red-400/30'
                            }`}
                          >
                            <Power className="w-3 h-3" />
                            <span>{prod.is_active ? t.activeStatus : t.disabledStatus}</span>
                          </button>
                        </td>
                        <td className="py-3 text-end whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingProduct(prod)}
                              title={t.editProduct}
                              className="p-1.5 rounded border border-[#384E43] bg-[#1B2A24] text-[#F3EFE6] hover:border-[#A7B89A] cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteProductPermanent(prod)}
                              title={t.permanentDelete}
                              className="p-1.5 rounded border border-red-400/30 bg-red-950/30 text-red-200 hover:bg-red-900/50 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Card View */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProducts.map((prod) => {
                const imgSrc = resolveProductImage(prod.image_url);
                return (
                  <div
                    key={prod.id}
                    className={`rounded-xl border border-[#384E43] bg-[#293B32] overflow-hidden flex flex-col justify-between ${
                      !prod.is_active ? 'opacity-60' : ''
                    }`}
                  >
                    <div>
                      <div className="aspect-[16/10] bg-[#1B2A24] relative overflow-hidden">
                        {imgSrc ? (
                          <img
                            src={imgSrc}
                            alt={prod.name_en}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#A7B89A]">
                            <Coffee className="w-8 h-8 opacity-60" />
                          </div>
                        )}
                      </div>
                      <div className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-[#F3EFE6] truncate">
                              {getLocalizedName(prod, lang)}
                            </div>
                            <div className="text-xs text-[#A7B89A]">{getProductCategoryName(prod)}</div>
                          </div>
                          <div className="text-sm font-bold text-[#D6C7A3] tabular-nums shrink-0">
                            {formatIQD(prod.base_price, currency)}
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs pt-1">
                          <span className="text-[#A7B89A] font-mono">{prod.sku}</span>
                          {renderStockDisplay(prod)}
                        </div>
                      </div>
                    </div>

                    <div className="px-4 pb-4 pt-2 border-t border-[#384E43] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => toggleAvailability(prod)}
                          className={`px-2 py-1 rounded text-[11px] font-medium cursor-pointer ${
                            prod.is_available
                              ? 'bg-[#A7B89A]/20 text-[#A7B89A]'
                              : 'bg-amber-950/50 text-amber-300'
                          }`}
                        >
                          {prod.is_available ? t.available : t.pausedLabel}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActive(prod)}
                          className={`px-2 py-1 rounded text-[11px] font-medium cursor-pointer ${
                            prod.is_active
                              ? 'bg-emerald-950/50 text-emerald-300'
                              : 'bg-red-950/50 text-red-300'
                          }`}
                        >
                          {prod.is_active ? t.activeStatus : t.disabledStatus}
                        </button>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingProduct(prod)}
                          className="p-1.5 rounded border border-[#384E43] bg-[#1B2A24] text-[#F3EFE6] cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteProductPermanent(prod)}
                          className="p-1.5 rounded border border-red-400/30 bg-red-950/30 text-red-200 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CATEGORIES SECTION */}
      {activeSub === 'categories' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form
            onSubmit={handleAddCategory}
            className="rounded-xl border border-[#384E43] bg-[#293B32] p-5 space-y-3 h-fit"
          >
            <h3 className="text-sm font-bold text-[#F3EFE6]">{t.addCategory}</h3>
            <input
              required
              placeholder="English Name"
              value={catForm.name_en}
              onChange={(e) => setCatForm({ ...catForm, name_en: e.target.value })}
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
            />
            <input
              placeholder="Kurdish Name (Sorani)"
              value={catForm.name_ckb}
              onChange={(e) => setCatForm({ ...catForm, name_ckb: e.target.value })}
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
            />
            <input
              placeholder="Arabic Name"
              value={catForm.name_ar}
              onChange={(e) => setCatForm({ ...catForm, name_ar: e.target.value })}
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
            />
            <input
              type="number"
              placeholder="Sort Order"
              value={catForm.sort_order}
              onChange={(e) => setCatForm({ ...catForm, sort_order: Number(e.target.value) })}
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-[#A7B89A] py-2 text-xs font-semibold text-[#101A17] cursor-pointer"
            >
              {t.addCategory}
            </button>
          </form>

          <div className="lg:col-span-2 rounded-xl border border-[#384E43] bg-[#293B32] p-5 divide-y divide-[#384E43]">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className={`py-3 flex items-center justify-between gap-3 ${cat.is_active ? '' : 'opacity-50'}`}
              >
                <div>
                  <div className="text-sm font-semibold text-[#F3EFE6]">{getLocalizedName(cat, lang)}</div>
                  <div className="text-xs text-[#A7B89A]">
                    {cat.name_en} · {cat.name_ckb} · {cat.name_ar}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-[#D6C7A3] tabular-nums">#{cat.sort_order}</span>
                  <button
                    type="button"
                    onClick={() => setEditingCategory(cat)}
                    className="p-1.5 rounded border border-[#384E43] bg-[#1B2A24] text-[#F3EFE6] hover:border-[#A7B89A] cursor-pointer"
                    title={t.editCategory}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCategory(cat.id)}
                    className="p-1.5 rounded border border-red-400/30 bg-red-950/30 text-red-200 hover:bg-red-900/50 cursor-pointer"
                    title={t.delete}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MANAGE SIZES SECTION */}
      {activeSub === 'sizes' && (
        <div className="rounded-xl border border-[#384E43] bg-[#293B32] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#F3EFE6]">{t.manageSizes}</h3>
          </div>
          <div className="divide-y divide-[#384E43]">
            {products.map((prod) => (
              <div key={prod.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[#F3EFE6]">{getLocalizedName(prod, lang)}</div>
                  <div className="flex flex-wrap gap-2 mt-1.5 text-xs">
                    {prod.variations.map((v) => (
                      <span
                        key={v.id}
                        className="rounded-md bg-[#1B2A24] border border-[#384E43] px-2.5 py-1 text-[#D6C7A3] tabular-nums"
                      >
                        {getLocalizedName(v, lang)} ·{' '}
                        {v.price_delta >= 0 ? `+${formatIQD(v.price_delta, currency)}` : formatIQD(v.price_delta, currency)}{' '}
                        ({v.recipe_multiplier}x)
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingProduct(prod)}
                  className="shrink-0 rounded-lg border border-[#384E43] bg-[#1B2A24] px-3 py-1.5 text-xs font-medium text-[#F3EFE6] hover:border-[#A7B89A] cursor-pointer"
                >
                  {t.edit}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ADD-ONS / EXTRAS SECTION */}
      {activeSub === 'addons' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form
            onSubmit={handleAddAddon}
            className="rounded-xl border border-[#384E43] bg-[#293B32] p-5 space-y-3 h-fit"
          >
            <h3 className="text-sm font-bold text-[#F3EFE6]">{t.addonsAndExtras}</h3>
            <input
              required
              placeholder="English Name"
              value={addonForm.name_en}
              onChange={(e) => setAddonForm({ ...addonForm, name_en: e.target.value })}
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
            />
            <input
              placeholder="Kurdish Name"
              value={addonForm.name_ckb}
              onChange={(e) => setAddonForm({ ...addonForm, name_ckb: e.target.value })}
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
            />
            <input
              placeholder="Arabic Name"
              value={addonForm.name_ar}
              onChange={(e) => setAddonForm({ ...addonForm, name_ar: e.target.value })}
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
            />
            <input
              type="number"
              placeholder={t.priceLabel}
              value={addonForm.price}
              onChange={(e) => setAddonForm({ ...addonForm, price: Number(e.target.value) })}
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
            />
            <select
              value={addonForm.ingredient_id}
              onChange={(e) => setAddonForm({ ...addonForm, ingredient_id: e.target.value })}
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
            >
              <option value="">{t.recipeIngredientsLabel} (-)</option>
              {inventoryItems.map((it) => (
                <option key={it.id} value={it.id}>
                  {getLocalizedName(it, lang)} ({it.unit})
                </option>
              ))}
            </select>
            {addonForm.ingredient_id && (
              <input
                type="number"
                step="any"
                placeholder="Qty Deducted"
                value={addonForm.ingredient_qty}
                onChange={(e) => setAddonForm({ ...addonForm, ingredient_qty: Number(e.target.value) })}
                className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
              />
            )}
            <button
              type="submit"
              className="w-full rounded-lg bg-[#A7B89A] py-2 text-xs font-semibold text-[#101A17] cursor-pointer"
            >
              {t.save}
            </button>
          </form>

          <div className="lg:col-span-2 rounded-xl border border-[#384E43] bg-[#293B32] p-5 divide-y divide-[#384E43]">
            {addons.map((ad) => (
              <div key={ad.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-[#F3EFE6]">{getLocalizedName(ad, lang)}</div>
                  <div className="text-xs text-[#A7B89A] tabular-nums">
                    +{formatIQD(ad.price, currency)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteAddon(ad.id)}
                  className="text-xs text-red-300 hover:text-red-200 cursor-pointer"
                >
                  {t.delete}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* EDIT CATEGORY MODAL */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <form
            onSubmit={handleSaveEditCategory}
            className="w-full max-w-md rounded-xl border border-[#384E43] bg-[#1B2A24] p-6 space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#F3EFE6]">{t.editCategory}</h3>
              <button type="button" onClick={() => setEditingCategory(null)} className="text-[#A7B89A] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              required
              placeholder="English Name"
              value={editingCategory.name_en || ''}
              onChange={(e) => setEditingCategory({ ...editingCategory, name_en: e.target.value })}
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
            />
            <input
              placeholder="Kurdish Sorani Name"
              value={editingCategory.name_ckb || ''}
              onChange={(e) => setEditingCategory({ ...editingCategory, name_ckb: e.target.value })}
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
            />
            <input
              placeholder="Arabic Name"
              value={editingCategory.name_ar || ''}
              onChange={(e) => setEditingCategory({ ...editingCategory, name_ar: e.target.value })}
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
            />
            <input
              type="number"
              value={editingCategory.sort_order ?? 10}
              onChange={(e) => setEditingCategory({ ...editingCategory, sort_order: Number(e.target.value) })}
              className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-[#A7B89A] py-2.5 text-sm font-semibold text-[#101A17] cursor-pointer"
            >
              {t.save}
            </button>
          </form>
        </div>
      )}

      {/* CREATE / EDIT PRODUCT MODAL */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveProduct}
            className="w-full max-w-3xl rounded-xl border border-[#384E43] bg-[#1B2A24] p-6 space-y-4 my-8"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#F3EFE6]">
                {editingProduct.id ? t.editProduct : t.addProduct}
              </h3>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="text-[#A7B89A] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[#D6C7A3] mb-1">{t.categoryLabel}</label>
                <select
                  value={editingProduct.category_id}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, category_id: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {getLocalizedName(c, lang)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-[#D6C7A3] mb-1">SKU</label>
                <input
                  required
                  value={editingProduct.sku || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })}
                  className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
                />
              </div>
              <input
                required
                placeholder="English Name"
                value={editingProduct.name_en || ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, name_en: e.target.value })}
                className="rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
              />
              <input
                placeholder="Kurdish Sorani Name"
                value={editingProduct.name_ckb || ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, name_ckb: e.target.value })}
                className="rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
              />
              <input
                placeholder="Arabic Name"
                value={editingProduct.name_ar || ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, name_ar: e.target.value })}
                className="rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-[#D6C7A3] mb-1">{t.priceLabel}</label>
                  <input
                    type="number"
                    required
                    value={editingProduct.base_price ?? 0}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, base_price: Number(e.target.value) })
                    }
                    className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#D6C7A3] mb-1">{t.costEstLabel}</label>
                  <input
                    type="number"
                    value={editingProduct.cost_estimate ?? 0}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, cost_estimate: Number(e.target.value) })
                    }
                    className="w-full rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6]"
                  />
                </div>
              </div>
            </div>

            {/* Direct Stock Tracking Option */}
            <div className="rounded-lg border border-[#384E43] bg-[#101A17]/60 p-3 space-y-2.5">
              <label className="flex items-center gap-2 text-xs text-[#F3EFE6] cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(editingProduct.track_direct_stock)}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      track_direct_stock: e.target.checked ? 1 : 0,
                    })
                  }
                />
                <span>{t.trackDirectStockLabel}</span>
              </label>

              {Boolean(editingProduct.track_direct_stock) && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-[#D6C7A3] mb-1">{t.directStockQtyLabel}</label>
                    <input
                      type="number"
                      min={0}
                      value={editingProduct.direct_stock_qty ?? 0}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          direct_stock_qty: Number(e.target.value),
                        })
                      }
                      className="w-full rounded border border-[#384E43] bg-[#101A17] px-2.5 py-1.5 text-xs text-[#F3EFE6]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#D6C7A3] mb-1">{t.lowStockThresholdLabel}</label>
                    <input
                      type="number"
                      min={0}
                      value={editingProduct.low_stock_threshold ?? 5}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          low_stock_threshold: Number(e.target.value),
                        })
                      }
                      className="w-full rounded border border-[#384E43] bg-[#101A17] px-2.5 py-1.5 text-xs text-[#F3EFE6]"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Local Image Upload + Presets */}
            <div className="space-y-2">
              <label className="block text-[11px] text-[#D6C7A3]">Product Image</label>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 rounded-lg border border-[#384E43] bg-[#101A17] px-3 py-2 text-xs text-[#F3EFE6] cursor-pointer hover:border-[#A7B89A]">
                  <Upload className="w-3.5 h-3.5 text-[#A7B89A]" />
                  <span>{uploadingImg ? '...' : 'Upload Image'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImageUpload(f);
                    }}
                  />
                </label>
                {PRESET_GALLERY.map((preset) => (
                  <button
                    key={preset.path}
                    type="button"
                    onClick={() => setEditingProduct({ ...editingProduct, image_url: preset.path })}
                    className={`w-10 h-8 rounded overflow-hidden border cursor-pointer ${
                      editingProduct.image_url === preset.path
                        ? 'border-[#A7B89A] ring-2 ring-[#A7B89A]/40'
                        : 'border-[#384E43]'
                    }`}
                  >
                    <img src={preset.preview} alt={preset.label} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            {/* Sizes / Variations (Preserves EN / CKB / AR independently) */}
            <div className="space-y-2 border-t border-[#2F443A] pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#D6C7A3]">{t.variationsAndSize}</span>
                <button
                  type="button"
                  onClick={() =>
                    setEditingProduct({
                      ...editingProduct,
                      variations: [
                        ...(editingProduct.variations || []),
                        {
                          id: 0,
                          product_id: editingProduct.id || 0,
                          name_ckb: 'گەورە',
                          name_ar: 'كبير',
                          name_en: 'Large',
                          price_delta: 1000,
                          recipe_multiplier: 1.35,
                          is_default: 0,
                        },
                      ],
                    })
                  }
                  className="text-xs text-[#A7B89A] hover:underline cursor-pointer"
                >
                  + {t.addSize}
                </button>
              </div>
              {(editingProduct.variations || []).map((v, idx) => (
                <div key={idx} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-center">
                  <input
                    placeholder={t.sizeNameEn}
                    value={v.name_en}
                    onChange={(e) => {
                      const next = [...(editingProduct.variations || [])];
                      next[idx] = { ...next[idx], name_en: e.target.value };
                      setEditingProduct({ ...editingProduct, variations: next });
                    }}
                    className="rounded border border-[#384E43] bg-[#101A17] px-2 py-1.5 text-xs text-[#F3EFE6]"
                  />
                  <input
                    placeholder={t.sizeNameCkb}
                    value={v.name_ckb}
                    onChange={(e) => {
                      const next = [...(editingProduct.variations || [])];
                      next[idx] = { ...next[idx], name_ckb: e.target.value };
                      setEditingProduct({ ...editingProduct, variations: next });
                    }}
                    className="rounded border border-[#384E43] bg-[#101A17] px-2 py-1.5 text-xs text-[#F3EFE6]"
                  />
                  <input
                    placeholder={t.sizeNameAr}
                    value={v.name_ar}
                    onChange={(e) => {
                      const next = [...(editingProduct.variations || [])];
                      next[idx] = { ...next[idx], name_ar: e.target.value };
                      setEditingProduct({ ...editingProduct, variations: next });
                    }}
                    className="rounded border border-[#384E43] bg-[#101A17] px-2 py-1.5 text-xs text-[#F3EFE6]"
                  />
                  <input
                    type="number"
                    placeholder={t.priceDelta}
                    value={v.price_delta}
                    onChange={(e) => {
                      const next = [...(editingProduct.variations || [])];
                      next[idx] = { ...next[idx], price_delta: Number(e.target.value) };
                      setEditingProduct({ ...editingProduct, variations: next });
                    }}
                    className="rounded border border-[#384E43] bg-[#101A17] px-2 py-1.5 text-xs text-[#F3EFE6]"
                  />
                  <input
                    type="number"
                    step="0.05"
                    placeholder={t.multiplier}
                    value={v.recipe_multiplier}
                    onChange={(e) => {
                      const next = [...(editingProduct.variations || [])];
                      next[idx] = { ...next[idx], recipe_multiplier: Number(e.target.value) };
                      setEditingProduct({ ...editingProduct, variations: next });
                    }}
                    className="rounded border border-[#384E43] bg-[#101A17] px-2 py-1.5 text-xs text-[#F3EFE6]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = (editingProduct.variations || []).filter((_, i) => i !== idx);
                      setEditingProduct({ ...editingProduct, variations: next });
                    }}
                    className="text-xs text-red-300 hover:text-red-200 cursor-pointer"
                  >
                    {t.delete}
                  </button>
                </div>
              ))}
            </div>

            {/* Recipe Ingredient Links */}
            <div className="space-y-2 border-t border-[#2F443A] pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#D6C7A3]">{t.recipeIngredientsLabel}</span>
                <button
                  type="button"
                  onClick={() => {
                    if (inventoryItems.length === 0) return;
                    setEditingProduct({
                      ...editingProduct,
                      recipes: [
                        ...(editingProduct.recipes || []),
                        {
                          id: 0,
                          product_id: editingProduct.id || 0,
                          inventory_item_id: inventoryItems[0].id,
                          quantity_required: 18,
                        },
                      ],
                    });
                  }}
                  className="text-xs text-[#A7B89A] hover:underline cursor-pointer"
                >
                  + {t.addIngredientLink}
                </button>
              </div>
              {(editingProduct.recipes || []).map((rec, idx) => (
                <div key={idx} className="grid grid-cols-5 gap-2 items-center">
                  <select
                    value={rec.inventory_item_id}
                    onChange={(e) => {
                      const next = [...(editingProduct.recipes || [])];
                      next[idx] = { ...next[idx], inventory_item_id: Number(e.target.value) };
                      setEditingProduct({ ...editingProduct, recipes: next });
                    }}
                    className="col-span-3 rounded border border-[#384E43] bg-[#101A17] px-2.5 py-1.5 text-xs text-[#F3EFE6]"
                  >
                    {inventoryItems.map((it) => (
                      <option key={it.id} value={it.id}>
                        {getLocalizedName(it, lang)} ({it.unit})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="any"
                    min={0.01}
                    value={rec.quantity_required}
                    onChange={(e) => {
                      const next = [...(editingProduct.recipes || [])];
                      next[idx] = { ...next[idx], quantity_required: Number(e.target.value) };
                      setEditingProduct({ ...editingProduct, recipes: next });
                    }}
                    className="rounded border border-[#384E43] bg-[#101A17] px-2.5 py-1.5 text-xs text-[#F3EFE6]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = (editingProduct.recipes || []).filter((_, i) => i !== idx);
                      setEditingProduct({ ...editingProduct, recipes: next });
                    }}
                    className="text-xs text-red-300 cursor-pointer"
                  >
                    {t.delete}
                  </button>
                </div>
              ))}
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
    </div>
  );
};
