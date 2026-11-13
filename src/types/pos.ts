export type Language = 'ckb' | 'ar' | 'en';

export type Permission =
  | 'dashboard.view'
  | 'pos.sell'
  | 'pos.discount'
  | 'pos.cancel_order'
  | 'orders.manage'
  | 'inventory.view'
  | 'inventory.manage'
  | 'menu.manage'
  | 'reports.view'
  | 'reports.export'
  | 'users.manage'
  | 'settings.manage'
  | 'backups.manage';

export interface User {
  id: number;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'cashier' | string;
  permissions: Permission[];
  is_active: boolean;
  must_change_password: boolean;
  last_login_at?: string | null;
  created_at?: string;
  has_custom_permissions?: boolean;
}

export interface Category {
  id: number;
  name_ckb: string;
  name_ar: string;
  name_en: string;
  sort_order: number;
  is_active: number;
}

export interface ProductVariation {
  id: number;
  product_id: number;
  name_ckb: string;
  name_ar: string;
  name_en: string;
  price_delta: number;
  recipe_multiplier: number;
  is_default: number;
}

export interface ProductRecipe {
  id: number;
  product_id: number;
  inventory_item_id: number;
  quantity_required: number;
  ingredient_name_en?: string;
  ingredient_name_ckb?: string;
  ingredient_name_ar?: string;
  unit?: string;
}

export interface Product {
  id: number;
  category_id: number;
  category_name_ckb?: string;
  category_name_ar?: string;
  category_name_en?: string;
  sku: string;
  barcode: string;
  name_ckb: string;
  name_ar: string;
  name_en: string;
  description_ckb: string;
  description_ar: string;
  description_en: string;
  base_price: number;
  cost_estimate: number;
  image_url: string;
  is_available: number;
  is_active: number;
  track_direct_stock: number;
  direct_stock_qty: number;
  low_stock_threshold: number;
  variations: ProductVariation[];
  recipes: ProductRecipe[];
}

export interface Addon {
  id: number;
  name_ckb: string;
  name_ar: string;
  name_en: string;
  price: number;
  ingredient_id: number | null;
  ingredient_qty: number;
  is_active: number;
}

export interface CafeTable {
  id: number;
  table_number: string;
  name: string;
  capacity: number;
  zone: string;
  status: 'available' | 'occupied' | 'reserved' | 'cleaning';
  current_order_id: number | null;
  active_order_number?: string | null;
  active_order_total?: number | null;
  active_order_status?: string | null;
  active_order_payment_status?: string | null;
  active_order_created_at?: string | null;
}

export interface CartItem {
  key: string;
  product: Product;
  variation: ProductVariation | null;
  addons: Addon[];
  quantity: number;
  notes: string;
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  product_name: string;
  variation_id: number | null;
  variation_name: string;
  quantity: number;
  unit_price: number;
  addons: Array<{ id: number; name: string; price: number }>;
  addons_total: number;
  line_total: number;
  unit_cost: number;
  notes: string;
}

export interface Order {
  id: number;
  order_number: string;
  client_tx_id: string;
  order_type: 'dine_in' | 'takeaway' | 'delivery';
  table_id: number | null;
  table_number?: string | null;
  table_name?: string | null;
  customer_name: string;
  customer_phone: string;
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  payment_status: 'paid' | 'unpaid' | 'refunded';
  payment_method: 'cash' | 'card' | 'split';
  cash_amount: number;
  card_amount: number;
  subtotal: number;
  discount_amount: number;
  discount_type: 'fixed' | 'percent';
  tax_amount: number;
  service_charge_amount: number;
  total_amount: number;
  estimated_cost: number;
  notes: string;
  cashier_id: number;
  cashier_name?: string;
  cancel_reason?: string | null;
  device_id: string;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
}

export interface InventoryItem {
  id: number;
  sku: string;
  name_ckb: string;
  name_ar: string;
  name_en: string;
  item_type: 'raw_material' | 'ingredient' | 'packaging' | 'retail';
  unit: string;
  quantity: number;
  min_threshold: number;
  unit_cost: number;
  supplier_id: number | null;
  supplier_name?: string | null;
  updated_at: string;
}

export interface Supplier {
  id: number;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  notes: string;
}

export interface StockMovement {
  id: number;
  inventory_item_id: number | null;
  product_id: number | null;
  movement_type: 'sale_deduction' | 'purchase' | 'adjustment' | 'waste' | 'cancel_restore';
  quantity_delta: number;
  balance_after: number;
  reference_id: string;
  notes: string;
  user_name?: string;
  ingredient_name?: string;
  ingredient_unit?: string;
  product_name?: string;
  created_at: string;
}

export interface PurchaseRecord {
  id: number;
  supplier_id: number | null;
  supplier_name?: string;
  inventory_item_id: number;
  item_name?: string;
  unit?: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  invoice_ref: string;
  notes: string;
  recorded_by_name?: string;
  created_at: string;
}

export interface Expense {
  id: number;
  category: string;
  title: string;
  amount: number;
  notes: string;
  recorded_by_name?: string;
  expense_date: string;
  created_at: string;
}

export interface ShopSettings {
  shop_name: string;
  shop_tagline: string;
  address: string;
  phone: string;
  currency: string;
  tax_rate: string;
  service_charge_rate: string;
  receipt_header: string;
  receipt_footer: string;
  printer_type: string;
  printer_width: string;
  cash_drawer_enabled: string;
  barcode_prefix: string;
  default_language: string;
  auto_backup_hours: string;
  server_port: string;
  [key: string]: string;
}
