import type { Order, ShopSettings, User } from '../types/pos';

const STORAGE_VERSION = 'baslune_pos_v1_';

interface DBState {
  users: Array<{
    id: number;
    name: string;
    email: string;
    password_hash: string;
    role: string;
    permissions_override_json: string | null;
    is_active: number;
    must_change_password: number;
    created_at: string;
    last_login_at: string | null;
  }>;
  categories: Array<{
    id: number;
    name_ckb: string;
    name_ar: string;
    name_en: string;
    sort_order: number;
    is_active: number;
  }>;
  suppliers: Array<{
    id: number;
    name: string;
    contact_person: string;
    phone: string;
    email: string;
    notes: string;
    created_at: string;
  }>;
  inventory_items: Array<{
    id: number;
    sku: string;
    name_ckb: string;
    name_ar: string;
    name_en: string;
    item_type: string;
    unit: string;
    quantity: number;
    min_threshold: number;
    unit_cost: number;
    supplier_id: number | null;
    updated_at: string;
  }>;
  products: Array<{
    id: number;
    category_id: number;
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
    created_at: string;
  }>;
  product_variations: Array<{
    id: number;
    product_id: number;
    name_ckb: string;
    name_ar: string;
    name_en: string;
    price_delta: number;
    recipe_multiplier: number;
    is_default: number;
  }>;
  addons: Array<{
    id: number;
    name_ckb: string;
    name_ar: string;
    name_en: string;
    price: number;
    is_active: number;
  }>;
  cafe_tables: Array<{
    id: number;
    table_number: string;
    name: string;
    capacity: number;
    zone: string;
    status: string;
  }>;
  orders: Array<any>;
  order_items: Array<any>;
  expenses: Array<{
    id: number;
    category: string;
    title: string;
    amount: number;
    notes: string;
    expense_date: string;
    created_at: string;
  }>;
  audit_logs: Array<{
    id: number;
    user_name: string;
    action: string;
    entity_type: string;
    details: string;
    created_at: string;
  }>;
  shop_settings: Record<string, string>;
  backups: Array<{
    filename: string;
    sizeBytes: number;
    createdAt: string;
    dataJson: string;
  }>;
}

const DEFAULT_SETTINGS: Record<string, string> = {
  shop_name: 'BASLUNE Specialty Coffee',
  shop_tagline: 'Single-Origin Roastery & Espresso Bar',
  address: 'Empire World, Erbil, Kurdistan Region',
  phone: '+964 750 412 8890',
  currency: 'IQD',
  tax_rate: '0',
  service_charge_rate: '0',
  receipt_header: 'BASLUNE SPECIALTY COFFEE\nFreshly Roasted • Hand-Brewed',
  receipt_footer: 'سوپاس بۆ سەردانەکەت • Thank you for visiting BASLUNE',
  printer_type: 'thermal_80mm',
  printer_width: '80mm',
  cash_drawer_enabled: 'true',
  barcode_prefix: 'BSL',
  default_language: 'ckb',
  auto_backup_hours: '6',
  server_port: '3000',
};

function getInitialDBState(): DBState {
  const now = new Date().toISOString();
  return {
    users: [
      {
        id: 1,
        name: 'BASLUNE Owner',
        email: 'owner@baslune.local',
        password_hash: '$2a$12$demo_owner_hash',
        role: 'owner',
        permissions_override_json: null,
        is_active: 1,
        must_change_password: 0,
        created_at: now,
        last_login_at: now,
      },
      {
        id: 2,
        name: 'BASLUNE Admin',
        email: 'admin@baslune.local',
        password_hash: '$2a$12$demo_admin_hash',
        role: 'admin',
        permissions_override_json: null,
        is_active: 1,
        must_change_password: 0,
        created_at: now,
        last_login_at: null,
      },
      {
        id: 3,
        name: 'BASLUNE Cashier',
        email: 'cashier@baslune.local',
        password_hash: '$2a$12$demo_cashier_hash',
        role: 'cashier',
        permissions_override_json: null,
        is_active: 1,
        must_change_password: 0,
        created_at: now,
        last_login_at: null,
      },
    ],
    categories: [
      { id: 1, name_ckb: 'ئیسپرێسۆ و قاوەی گەرم', name_ar: 'إسبريسو وقهوة ساخنة', name_en: 'Espresso & Hot', sort_order: 1, is_active: 1 },
      { id: 2, name_ckb: 'قاوەی سارد و تایبەت', name_ar: 'قهوة باردة ومختصة', name_en: 'Iced & Signature', sort_order: 2, is_active: 1 },
      { id: 3, name_ckb: 'دڵۆپاندنی دەستی (V60)', name_ar: 'تقطير يدوي (V60)', name_en: 'Manual Brew', sort_order: 3, is_active: 1 },
      { id: 4, name_ckb: 'ماچا و چا', name_ar: 'ماتشا وشاي', name_en: 'Matcha & Tea', sort_order: 4, is_active: 1 },
      { id: 5, name_ckb: 'شیرینی و نانەوایی', name_ar: 'مخبوزات وحلويات', name_en: 'Bakery & Pastry', sort_order: 5, is_active: 1 },
      { id: 6, name_ckb: 'قوتوو و دەنکی قاوە', name_ar: 'حبوب القهوة ومنتجات', name_en: 'Roastery Bags', sort_order: 6, is_active: 1 },
    ],
    suppliers: [
      { id: 1, name: 'Zagros Green Coffee Roasters', contact_person: 'Hemin Rasul', phone: '+964 750 111 2233', email: 'orders@zagrosroast.krd', notes: 'Ethiopia & Colombia', created_at: now },
      { id: 2, name: 'Erbil Artisanal Dairy & Cream', contact_person: 'Soran Talib', phone: '+964 751 445 6677', email: 'supply@erbildairy.iq', notes: 'Fresh barista milk & oat milk', created_at: now },
      { id: 3, name: 'La Lune French Bakery', contact_person: 'Nadia Yousif', phone: '+964 770 889 1122', email: 'kitchen@lalunebakery.iq', notes: 'Daily croissants & tarts', created_at: now },
    ],
    inventory_items: [
      { id: 1, sku: 'ING-ESP-01', name_ckb: 'دەنکی قاوەی ئیسپرێسۆ', name_ar: 'حبوب إسبريسو مختصة', name_en: 'House Espresso Beans', item_type: 'raw_material', unit: 'g', quantity: 14500, min_threshold: 3000, unit_cost: 42, supplier_id: 1, updated_at: now },
      { id: 2, sku: 'ING-FLT-02', name_ckb: 'دەنکی ئیتیۆپیا گوجی V60', name_ar: 'حبوب إثيوبيا غوجي', name_en: 'Ethiopia Guji Filter Beans', item_type: 'raw_material', unit: 'g', quantity: 6200, min_threshold: 1500, unit_cost: 58, supplier_id: 1, updated_at: now },
      { id: 3, sku: 'ING-MLK-03', name_ckb: 'شیری باریستا', name_ar: 'حليب باريستا طازج', name_en: 'Fresh Barista Milk', item_type: 'ingredient', unit: 'ml', quantity: 28000, min_threshold: 6000, unit_cost: 2.5, supplier_id: 2, updated_at: now },
      { id: 4, sku: 'ING-OAT-04', name_ckb: 'شیری شۆفان', name_ar: 'حليب الشوفان', name_en: 'Barista Oat Milk', item_type: 'ingredient', unit: 'ml', quantity: 4200, min_threshold: 5000, unit_cost: 6, supplier_id: 2, updated_at: now },
      { id: 5, sku: 'ING-CND-05', name_ckb: 'شیری خەست (ئیسپانی)', name_ar: 'حليب مكثف محلى', name_en: 'Sweetened Condensed Milk', item_type: 'ingredient', unit: 'ml', quantity: 5400, min_threshold: 1200, unit_cost: 7, supplier_id: 2, updated_at: now },
      { id: 6, sku: 'ING-MTC-06', name_ckb: 'پاودەری ماچای ژاپۆنی', name_ar: 'مسحوق ماتشا ياباني', name_en: 'Ceremonial Uji Matcha', item_type: 'ingredient', unit: 'g', quantity: 950, min_threshold: 300, unit_cost: 320, supplier_id: 1, updated_at: now },
      { id: 7, sku: 'ING-PST-07', name_ckb: 'کرێمی فستق', name_ar: 'كريمة الفستق الحلبي', name_en: 'Roasted Pistachio Cream', item_type: 'ingredient', unit: 'g', quantity: 2800, min_threshold: 800, unit_cost: 35, supplier_id: 3, updated_at: now },
      { id: 8, sku: 'PKG-CUP-08', name_ckb: 'کوپی کاغەزی دوو چین', name_ar: 'كوب ورقي مزدوج', name_en: 'Double-Wall Cup 8oz/12oz', item_type: 'packaging', unit: 'pcs', quantity: 1100, min_threshold: 250, unit_cost: 140, supplier_id: 3, updated_at: now },
    ],
    products: [
      { id: 1, category_id: 1, sku: 'BSL-101', barcode: '860000101', name_ckb: 'کۆرتادۆ', name_ar: 'كورتادو', name_en: 'Baslune Cortado', description_ckb: 'دەبڵ ڕیسترێتۆ لەگەڵ شیری نەرم', description_ar: 'دبل ريستريتو مع حليب مخملي', description_en: 'Double ristretto balanced with silky microfoam', base_price: 4500, cost_estimate: 1250, image_url: '/src/assets/images/espresso_cortado_1794587393003.jpg', is_available: 1, is_active: 1, track_direct_stock: 0, direct_stock_qty: 0, low_stock_threshold: 5, created_at: now },
      { id: 2, category_id: 1, sku: 'BSL-102', barcode: '860000102', name_ckb: 'فلات وایت', name_ar: 'فلات وايت', name_en: 'Velvet Flat White', description_ckb: 'دەبڵ ئیسپرێسۆ و مایکرۆفۆم', description_ar: 'دبل إسبريسو مع رغوة ناعمة', description_en: 'Double espresso with velvety textured milk', base_price: 5000, cost_estimate: 1350, image_url: '/src/assets/images/espresso_cortado_1794587393003.jpg', is_available: 1, is_active: 1, track_direct_stock: 0, direct_stock_qty: 0, low_stock_threshold: 5, created_at: now },
      { id: 3, category_id: 1, sku: 'BSL-103', barcode: '860000103', name_ckb: 'دەبڵ ئیسپرێسۆ', name_ar: 'دبل إسبريسو', name_en: 'Single Origin Espresso', description_ckb: 'دەبڵ شۆتی ئیتیۆپیا و کۆڵۆمبیا', description_ar: 'دبل شوت إسبريسو مختص', description_en: '18g house blend pulled at 9 bars', base_price: 3500, cost_estimate: 900, image_url: '/src/assets/images/espresso_cortado_1794587393003.jpg', is_available: 1, is_active: 1, track_direct_stock: 0, direct_stock_qty: 0, low_stock_threshold: 5, created_at: now },
      { id: 4, category_id: 2, sku: 'BSL-201', barcode: '860000201', name_ckb: 'سپانیش لاتێی سارد', name_ar: 'سبانيش لاتيه بارد', name_en: 'Iced Spanish Latte', description_ckb: 'ئیسپرێسۆ لەگەڵ شیری خەست و سەهۆڵ', description_ar: 'إسبريسو مع حليب مكثف وثلج', description_en: 'Signature chilled espresso over condensed & fresh milk', base_price: 6000, cost_estimate: 1650, image_url: '/src/assets/images/spanish_latte_iced_1794587393947.jpg', is_available: 1, is_active: 1, track_direct_stock: 0, direct_stock_qty: 0, low_stock_threshold: 5, created_at: now },
      { id: 5, category_id: 2, sku: 'BSL-202', barcode: '860000202', name_ckb: 'ئەمەریکانۆی سارد', name_ar: 'أمريكانو بارد', name_en: 'Iced Forest Americano', description_ckb: 'ئیسپرێسۆی سارد لەسەر سەهۆڵی کریستاڵ', description_ar: 'إسبريسو بارد فوق الثلج', description_en: 'Crisp double espresso over filtered ice water', base_price: 4500, cost_estimate: 950, image_url: '/src/assets/images/spanish_latte_iced_1794587393947.jpg', is_available: 1, is_active: 1, track_direct_stock: 0, direct_stock_qty: 0, low_stock_threshold: 5, created_at: now },
      { id: 6, category_id: 3, sku: 'BSL-301', barcode: '860000301', name_ckb: 'ڤی ٦٠ ئیتیۆپیا گوجی', name_ar: 'تقطير V60 إثيوبيا', name_en: 'Ethiopia Guji V60', description_ckb: 'تامی یاسەمین، هەڵووژە و بێرگامۆت', description_ar: 'نكهات الياسمين والخوخ والبرغموت', description_en: 'Hand-poured washed Ethiopia Guji, jasmine & peach notes', base_price: 6500, cost_estimate: 1600, image_url: '/src/assets/images/v60_pour_over_1794587392996.jpg', is_available: 1, is_active: 1, track_direct_stock: 0, direct_stock_qty: 0, low_stock_threshold: 5, created_at: now },
      { id: 7, category_id: 4, sku: 'BSL-401', barcode: '860000401', name_ckb: 'ماچای ساردی یوجی', name_ar: 'ماتشا يوجي باردة', name_en: 'Iced Ceremonial Matcha', description_ckb: 'ماچای ئۆرگانیکی ژاپۆنی لەگەڵ شیری شۆفان', description_ar: 'ماتشا يابانية فاخرة مع حليب الشوفان', description_en: 'First-harvest Uji matcha whisked over oat milk', base_price: 6500, cost_estimate: 2100, image_url: '/src/assets/images/iced_matcha_latte_1794587393590.jpg', is_available: 1, is_active: 1, track_direct_stock: 0, direct_stock_qty: 0, low_stock_threshold: 5, created_at: now },
      { id: 8, category_id: 5, sku: 'BSL-501', barcode: '860000501', name_ckb: 'کرواسان بە فستق', name_ar: 'كرواسون الفستق', name_en: 'Pistachio Cream Croissant', description_ckb: 'کرواسانی کەرەی فەرەنسی بە کرێمی فستق', description_ar: 'كرواسون فرنسي بالزبدة وكريمة الفستق', description_en: 'Flaky laminated butter croissant filled with pistachio cream', base_price: 5500, cost_estimate: 2200, image_url: '/src/assets/images/pistachio_croissant_1794587393635.jpg', is_available: 1, is_active: 1, track_direct_stock: 1, direct_stock_qty: 24, low_stock_threshold: 6, created_at: now },
      { id: 9, category_id: 6, sku: 'BSL-601', barcode: '860000601', name_ckb: 'کیسی قاوەی باسلون ٢٥٠ گرام', name_ar: 'كيس قهوة باسلون ٢٥٠ غ', name_en: 'Baslune House Blend 250g', description_ckb: 'برژاوی تازەی تایبەت بۆ ئیسپرێسۆ و مۆکا', description_ar: 'تحميص طازج للإسبريسو والموكا', description_en: 'Whole bean medium roast, caramel & dark chocolate', base_price: 18000, cost_estimate: 9500, image_url: '/src/assets/images/v60_pour_over_1794587392996.jpg', is_available: 1, is_active: 1, track_direct_stock: 1, direct_stock_qty: 16, low_stock_threshold: 4, created_at: now },
    ],
    product_variations: [
      { id: 1, product_id: 1, name_ckb: 'ستاندارد (١٥٠ مل)', name_ar: 'قياسي (١٥٠ مل)', name_en: 'Standard 5oz', price_delta: 0, recipe_multiplier: 1.0, is_default: 1 },
      { id: 2, product_id: 1, name_ckb: 'دەبڵ (٢٠٠ مل)', name_ar: 'دبل (٢٠٠ مل)', name_en: 'Double 7oz', price_delta: 1000, recipe_multiplier: 1.3, is_default: 0 },
      { id: 3, product_id: 2, name_ckb: 'مامناوەند (٨ ئۆنز)', name_ar: 'وسط (٨ أونص)', name_en: 'Regular 8oz', price_delta: 0, recipe_multiplier: 1.0, is_default: 1 },
      { id: 4, product_id: 2, name_ckb: 'گەورە (١٢ ئۆنز)', name_ar: 'كبير (١٢ أونص)', name_en: 'Large 12oz', price_delta: 1250, recipe_multiplier: 1.4, is_default: 0 },
      { id: 5, product_id: 3, name_ckb: 'دەبڵ شۆت', name_ar: 'دبل شوت', name_en: 'Double Shot', price_delta: 0, recipe_multiplier: 1.0, is_default: 1 },
      { id: 6, product_id: 4, name_ckb: 'مامناوەند (١٢ ئۆنز)', name_ar: 'وسط (١٢ أونص)', name_en: 'Regular 12oz', price_delta: 0, recipe_multiplier: 1.0, is_default: 1 },
      { id: 7, product_id: 4, name_ckb: 'گەورە (١٦ ئۆنز)', name_ar: 'كبير (١٦ أونص)', name_en: 'Large 16oz', price_delta: 1500, recipe_multiplier: 1.35, is_default: 0 },
      { id: 8, product_id: 5, name_ckb: 'مامناوەند (١٢ ئۆنز)', name_ar: 'وسط (١٢ أونص)', name_en: 'Regular 12oz', price_delta: 0, recipe_multiplier: 1.0, is_default: 1 },
      { id: 9, product_id: 5, name_ckb: 'گەورە (١٦ ئۆنز)', name_ar: 'كبير (١٦ أونص)', name_en: 'Large 16oz', price_delta: 1000, recipe_multiplier: 1.5, is_default: 0 },
      { id: 10, product_id: 6, name_ckb: 'گەرم (٣٠٠ مل)', name_ar: 'ساخن (٣٠٠ مل)', name_en: 'Hot 300ml', price_delta: 0, recipe_multiplier: 1.0, is_default: 1 },
      { id: 11, product_id: 6, name_ckb: 'سارد (٣٠٠ مل)', name_ar: 'بارد (٣٠٠ مل)', name_en: 'Iced Flash Brew', price_delta: 500, recipe_multiplier: 1.0, is_default: 0 },
      { id: 12, product_id: 7, name_ckb: 'مامناوەند (١٢ ئۆنز)', name_ar: 'وسط (١٢ أونص)', name_en: 'Regular 12oz', price_delta: 0, recipe_multiplier: 1.0, is_default: 1 },
      { id: 13, product_id: 7, name_ckb: 'گەورە (١٦ ئۆنز)', name_ar: 'كبير (١٦ أونص)', name_en: 'Large 16oz', price_delta: 1500, recipe_multiplier: 1.35, is_default: 0 },
      { id: 14, product_id: 8, name_ckb: 'یەک دانە', name_ar: 'قطعة واحدة', name_en: 'Single Piece', price_delta: 0, recipe_multiplier: 1.0, is_default: 1 },
      { id: 15, product_id: 9, name_ckb: 'دەنکی تەواو', name_ar: 'حبوب كاملة', name_en: 'Whole Bean', price_delta: 0, recipe_multiplier: 1.0, is_default: 1 },
      { id: 16, product_id: 9, name_ckb: 'هاڕدراو بۆ ئیسپرێسۆ', name_ar: 'مطحون للإسبريسو', name_en: 'Espresso Grind', price_delta: 0, recipe_multiplier: 1.0, is_default: 0 },
    ],
    addons: [
      { id: 1, name_ckb: 'شۆتی زیادەی ئیسپرێسۆ', name_ar: 'شوت إسبريسو إضافي', name_en: 'Extra Espresso Shot', price: 1500, is_active: 1 },
      { id: 2, name_ckb: 'شیری شۆفان', name_ar: 'حليب الشوفان', name_en: 'Oat Milk Swap', price: 1500, is_active: 1 },
      { id: 3, name_ckb: 'سیروپی ڤانیلا', name_ar: 'سيروب الفانيليا', name_en: 'Madagascar Vanilla Syrup', price: 1000, is_active: 1 },
      { id: 4, name_ckb: 'کرێمی کارامێل', name_ar: 'صوص الكراميل', name_en: 'Salted Caramel Drizzle', price: 1000, is_active: 1 },
    ],
    cafe_tables: [
      { id: 1, table_number: 'T1', name: 'Table 01', capacity: 2, zone: 'Window', status: 'available' },
      { id: 2, table_number: 'T2', name: 'Table 02', capacity: 2, zone: 'Window', status: 'available' },
      { id: 3, table_number: 'T3', name: 'Table 03', capacity: 4, zone: 'Main Lounge', status: 'available' },
      { id: 4, table_number: 'T4', name: 'Table 04', capacity: 4, zone: 'Main Lounge', status: 'available' },
      { id: 5, table_number: 'T5', name: 'Table 05', capacity: 6, zone: 'Garden Patio', status: 'available' },
      { id: 6, table_number: 'T6', name: 'Table 06', capacity: 4, zone: 'Garden Patio', status: 'available' },
      { id: 7, table_number: 'B1', name: 'Brew Bar 01', capacity: 1, zone: 'Espresso Bar', status: 'available' },
      { id: 8, table_number: 'B2', name: 'Brew Bar 02', capacity: 1, zone: 'Espresso Bar', status: 'available' },
    ],
    orders: [],
    order_items: [],
    expenses: [
      { id: 1, category: 'Utilities', title: 'Electricity & Espresso Boiler Maintenance', amount: 185000, notes: 'Monthly coffee bar utilities', expense_date: '2026-11-10', created_at: now },
      { id: 2, category: 'Supplies', title: 'Zagros Green Coffee Roastery Invoice #408', amount: 620000, notes: '15kg House Espresso + 6kg Ethiopia Guji', expense_date: '2026-11-05', created_at: now },
      { id: 3, category: 'Rent', title: 'Cafe Premises Monthly Lease Share', amount: 950000, notes: 'Empire World kiosk unit', expense_date: '2026-11-01', created_at: now },
    ],
    audit_logs: [
      { id: 1, user_name: 'BASLUNE Owner', action: 'system_initialized', entity_type: 'system', details: 'Initialized local static client-side store', created_at: now },
    ],
    shop_settings: DEFAULT_SETTINGS,
    backups: [],
  };
}

export function getDB(): DBState {
  const raw = localStorage.getItem(STORAGE_VERSION + 'db');
  if (!raw) {
    const initial = getInitialDBState();
    // Generate sample orders
    let orderSeq = 1001;
    const sampleProducts = [
      { id: 1, name: 'Baslune Cortado', varName: 'Standard 5oz', price: 4500, cost: 1250 },
      { id: 4, name: 'Iced Spanish Latte', varName: 'Regular 12oz', price: 6000, cost: 1650 },
      { id: 6, name: 'Ethiopia Guji V60', varName: 'Hot 300ml', price: 6500, cost: 1600 },
      { id: 7, name: 'Iced Ceremonial Matcha', varName: 'Regular 12oz', price: 6500, cost: 2100 },
      { id: 8, name: 'Pistachio Cream Croissant', varName: 'Single Piece', price: 5500, cost: 2200 },
    ];

    for (let dayOffset = 13; dayOffset >= 0; dayOffset--) {
      const count = dayOffset === 0 ? 6 : 4 + (dayOffset % 3);
      for (let j = 0; j < count; j++) {
        const d = new Date();
        d.setDate(d.getDate() - dayOffset);
        d.setHours(9 + (j * 2) % 12, (j * 17) % 59, 12, 0);
        const iso = d.toISOString();

        const item = sampleProducts[(orderSeq + j) % sampleProducts.length];
        const qty = 1 + (j % 2);
        const subtotal = item.price * qty;
        const estCost = item.cost * qty;
        const method = j % 2 === 0 ? 'cash' : 'card';

        const orderId = orderSeq;
        initial.orders.push({
          id: orderId,
          order_number: `BSL-${orderSeq}`,
          client_tx_id: `seed-tx-${orderSeq}`,
          order_type: j % 2 === 0 ? 'dine_in' : 'takeaway',
          table_id: j % 2 === 0 ? ((j % 6) + 1) : null,
          customer_name: j % 3 === 0 ? 'Aram Baker' : 'Zryan Kamal',
          customer_phone: '+964 750 000 1122',
          status: 'completed',
          payment_status: 'paid',
          payment_method: method,
          cash_amount: method === 'cash' ? subtotal : 0,
          card_amount: method === 'card' ? subtotal : 0,
          subtotal,
          discount_amount: 0,
          discount_type: 'fixed',
          tax_amount: 0,
          service_charge_amount: 0,
          total_amount: subtotal,
          estimated_cost: estCost,
          notes: '',
          cashier_id: 1,
          cancelled_by: null,
          cancel_reason: '',
          device_id: 'terminal-main',
          created_at: iso,
          updated_at: iso,
        });

        initial.order_items.push({
          id: orderSeq,
          order_id: orderId,
          product_id: item.id,
          product_name: item.name,
          variation_name: item.varName,
          quantity: qty,
          unit_price: item.price,
          addons_json: '[]',
          addons_total: 0,
          line_total: subtotal,
          unit_cost: item.cost,
          notes: '',
        });

        orderSeq++;
      }
    }

    saveDB(initial);
    return initial;
  }
  try {
    return JSON.parse(raw);
  } catch {
    const fresh = getInitialDBState();
    saveDB(fresh);
    return fresh;
  }
}

export function saveDB(db: DBState) {
  localStorage.setItem(STORAGE_VERSION + 'db', JSON.stringify(db));
}

// Router for client-side API requests
export async function handleLocalStorageApi(path: string, options: RequestInit = {}): Promise<any> {
  const db = getDB();
  const method = options.method || 'GET';
  let body: any = null;
  if (options.body) {
    try {
      body = JSON.parse(String(options.body));
    } catch {
      body = options.body;
    }
  }

  // Normalize path (remove query params)
  const urlPath = path.split('?')[0];

  // 1. Auth routes
  if (urlPath === '/api/auth/me') {
    const owner = db.users.find((u) => u.role === 'owner') || db.users[0];
    return {
      user: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: owner.role,
        permissions: [
          'dashboard.view', 'pos.sell', 'pos.discount', 'pos.cancel_order',
          'orders.manage', 'inventory.view', 'inventory.manage', 'menu.manage',
          'reports.view', 'reports.export', 'users.manage', 'settings.manage', 'backups.manage',
        ],
        is_active: true,
        must_change_password: false,
        last_login_at: owner.last_login_at,
      },
    };
  }

  if (urlPath === '/api/auth/login') {
    const user = db.users.find((u) => u.email === (body?.email || '').trim().toLowerCase()) || db.users[0];
    return {
      token: 'local-token-' + user.id,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: ['dashboard.view', 'pos.sell', 'orders.manage', 'inventory.view', 'menu.manage', 'reports.view', 'users.manage', 'settings.manage', 'backups.manage'],
        is_active: true,
        must_change_password: false,
        last_login_at: user.last_login_at,
      },
    };
  }

  if (urlPath === '/api/auth/logout') {
    return { ok: true };
  }

  if (urlPath === '/api/auth/change-password') {
    return { ok: true };
  }

  // 2. Dashboard
  if (urlPath === '/api/dashboard') {
    const totalRev = db.orders.reduce((acc, o) => acc + (o.status !== 'cancelled' ? o.total_amount : 0), 0);
    const netSales = totalRev;
    const estCost = db.orders.reduce((acc, o) => acc + (o.status !== 'cancelled' ? o.estimated_cost : 0), 0);
    const totalExp = db.expenses.reduce((acc, e) => acc + e.amount, 0);
    const estProfit = netSales - estCost - totalExp;

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayOrders = db.orders.filter((o) => o.created_at.startsWith(todayStr));
    const todaySales = todayOrders.reduce((acc, o) => acc + (o.status !== 'cancelled' ? o.total_amount : 0), 0);
    const activeOrders = db.orders.filter((o) => ['pending', 'preparing', 'ready'].includes(o.status)).length;
    const occupiedTables = db.cafe_tables.filter((t) => t.status === 'occupied').length;

    // Sales trend (14 days)
    const salesTrend: Array<{ date: string; sales: number; profit: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const dayOrds = db.orders.filter((o) => o.created_at.startsWith(ds) && o.status !== 'cancelled');
      const sales = dayOrds.reduce((sum, o) => sum + o.total_amount, 0);
      const profit = sales - dayOrds.reduce((sum, o) => sum + o.estimated_cost, 0);
      salesTrend.push({ date: ds.slice(5), sales, profit });
    }

    // Low stock alerts
    const lowStockAlerts = db.inventory_items.filter((i) => i.quantity <= i.min_threshold);

    return {
      kpis: {
        totalRevenue: totalRev,
        netSales,
        estimatedProfit: estProfit,
        totalExpenses: totalExp,
        inventoryValue: db.inventory_items.reduce((s, i) => s + i.quantity * i.unit_cost, 0),
        activeOrdersCount: activeOrders,
        occupiedTablesCount: occupiedTables,
        todaySales,
        todayOrdersCount: todayOrders.length,
        avgOrderValue: db.orders.length ? Math.round(totalRev / db.orders.length) : 0,
      },
      salesTrend,
      bestSelling: db.products.slice(0, 5).map((p) => ({ name: p.name_en, quantity: 42, revenue: p.base_price * 42 })),
      recentTransactions: db.orders.slice(0, 10),
      lowStockAlerts,
    };
  }

  // 3. Orders / POS
  if (urlPath === '/api/orders' && method === 'GET') {
    const status = new URL(path, 'http://localhost').searchParams.get('status');
    let list = db.orders;
    if (status && status !== 'all') {
      list = list.filter((o) => o.status === status);
    }
    return { orders: list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) };
  }

  if (urlPath === '/api/orders' && method === 'POST') {
    const now = new Date().toISOString();
    const newId = db.orders.length ? Math.max(...db.orders.map((o) => o.id)) + 1 : 1001;
    const orderNumber = `BSL-${newId}`;
    const items = body.items || [];
    const subtotal = items.reduce((s: number, i: any) => s + (i.unit_price * i.quantity) + (i.addons_total || 0), 0);
    const totalAmount = subtotal - (body.discount_amount || 0);
    const estCost = items.reduce((s: number, i: any) => s + ((i.unit_cost || 500) * i.quantity), 0);

    const newOrder = {
      id: newId,
      order_number: orderNumber,
      client_tx_id: body.client_tx_id || `tx-${Date.now()}`,
      order_type: body.order_type || 'dine_in',
      table_id: body.table_id || null,
      customer_name: body.customer_name || '',
      customer_phone: body.customer_phone || '',
      status: 'pending',
      payment_status: body.payment_status || 'paid',
      payment_method: body.payment_method || 'cash',
      cash_amount: body.cash_amount || totalAmount,
      card_amount: body.card_amount || 0,
      subtotal,
      discount_amount: body.discount_amount || 0,
      discount_type: body.discount_type || 'fixed',
      tax_amount: 0,
      service_charge_amount: 0,
      total_amount: totalAmount,
      estimated_cost: estCost,
      notes: body.notes || '',
      cashier_id: 1,
      cancelled_by: null,
      cancel_reason: '',
      device_id: body.device_id || 'terminal-1',
      created_at: now,
      updated_at: now,
    };

    db.orders.unshift(newOrder);

    for (const item of items) {
      db.order_items.push({
        id: db.order_items.length + 1,
        order_id: newId,
        product_id: item.product_id,
        product_name: item.product_name,
        variation_name: item.variation_name || '',
        quantity: item.quantity,
        unit_price: item.unit_price,
        addons_json: JSON.stringify(item.addons || []),
        addons_total: item.addons_total || 0,
        line_total: item.line_total,
        unit_cost: item.unit_cost || 500,
        notes: item.notes || '',
      });
    }

    if (body.table_id) {
      const tbl = db.cafe_tables.find((t) => t.id === Number(body.table_id));
      if (tbl) {
        tbl.status = 'occupied';
      }
    }

    saveDB(db);
    return { order: newOrder };
  }

  // Order status update
  if (urlPath.match(/^\/api\/orders\/\d+\/status$/)) {
    const id = Number(urlPath.split('/')[3]);
    const order = db.orders.find((o) => o.id === id);
    if (order) {
      order.status = body.status;
      order.updated_at = new Date().toISOString();
      if (body.status === 'completed' && order.table_id) {
        const tbl = db.cafe_tables.find((t) => t.id === order.table_id);
        if (tbl) tbl.status = 'available';
      }
      saveDB(db);
    }
    return { ok: true, order };
  }

  if (urlPath.match(/^\/api\/orders\/\d+\/cancel$/)) {
    const id = Number(urlPath.split('/')[3]);
    const order = db.orders.find((o) => o.id === id);
    if (order) {
      order.status = 'cancelled';
      order.cancel_reason = body.reason || 'Cancelled';
      if (order.table_id) {
        const tbl = db.cafe_tables.find((t) => t.id === order.table_id);
        if (tbl) tbl.status = 'available';
      }
      saveDB(db);
    }
    return { ok: true };
  }

  // 4. Menu / Products / Categories / Addons
  if (urlPath === '/api/menu/categories') {
    if (method === 'GET') return { categories: db.categories };
    if (method === 'POST') {
      const nc = { id: db.categories.length + 1, ...body, sort_order: db.categories.length + 1, is_active: 1 };
      db.categories.push(nc);
      saveDB(db);
      return { category: nc };
    }
  }

  if (urlPath === '/api/menu/products') {
    if (method === 'GET') {
      const list = db.products.map((p) => ({
        ...p,
        category: db.categories.find((c) => c.id === p.category_id),
        variations: db.product_variations.filter((v) => v.product_id === p.id),
      }));
      return { products: list };
    }
    if (method === 'POST') {
      const np = { id: db.products.length + 1, ...body, created_at: new Date().toISOString() };
      db.products.push(np);
      saveDB(db);
      return { product: np };
    }
  }

  if (urlPath === '/api/menu/addons') {
    if (method === 'GET') return { addons: db.addons };
    if (method === 'POST') {
      const na = { id: db.addons.length + 1, ...body, is_active: 1 };
      db.addons.push(na);
      saveDB(db);
      return { addon: na };
    }
  }

  // 5. Inventory & Suppliers
  if (urlPath === '/api/inventory/items') {
    if (method === 'GET') {
      const items = db.inventory_items.map((i) => ({
        ...i,
        supplier: db.suppliers.find((s) => s.id === i.supplier_id),
      }));
      return { items };
    }
    if (method === 'POST') {
      const ni = { id: db.inventory_items.length + 1, ...body, updated_at: new Date().toISOString() };
      db.inventory_items.push(ni);
      saveDB(db);
      return { item: ni };
    }
  }

  if (urlPath === '/api/inventory/suppliers') {
    if (method === 'GET') return { suppliers: db.suppliers };
    if (method === 'POST') {
      const ns = { id: db.suppliers.length + 1, ...body, created_at: new Date().toISOString() };
      db.suppliers.push(ns);
      saveDB(db);
      return { supplier: ns };
    }
  }

  if (urlPath === '/api/inventory/movements') {
    return { movements: [] };
  }

  if (urlPath === '/api/inventory/adjust') {
    const item = db.inventory_items.find((i) => i.id === Number(body.inventory_item_id));
    if (item) {
      item.quantity = Number(body.new_quantity ?? item.quantity);
      item.updated_at = new Date().toISOString();
      saveDB(db);
    }
    return { ok: true };
  }

  // 6. Tables
  if (urlPath === '/api/tables') {
    if (method === 'GET') return { tables: db.cafe_tables };
    if (method === 'POST') {
      const nt = { id: db.cafe_tables.length + 1, ...body, status: 'available' };
      db.cafe_tables.push(nt);
      saveDB(db);
      return { table: nt };
    }
  }

  if (urlPath.match(/^\/api\/tables\/\d+$/) && method === 'DELETE') {
    const id = Number(urlPath.split('/')[3]);
    db.cafe_tables = db.cafe_tables.filter((t) => t.id !== id);
    saveDB(db);
    return { ok: true };
  }

  // 7. Reports & Expenses
  if (urlPath === '/api/reports') {
    return {
      summary: {
        totalRevenue: db.orders.reduce((s, o) => s + o.total_amount, 0),
        totalOrders: db.orders.length,
        totalExpenses: db.expenses.reduce((s, e) => s + e.amount, 0),
      },
      expenses: db.expenses,
    };
  }

  if (urlPath === '/api/reports/expenses') {
    if (method === 'GET') return { expenses: db.expenses };
    if (method === 'POST') {
      const ne = {
        id: db.expenses.length + 1,
        category: body.category || 'General',
        title: body.title || 'Expense',
        amount: Number(body.amount || 0),
        notes: body.notes || '',
        expense_date: body.expense_date || new Date().toISOString().slice(0, 10),
        created_at: new Date().toISOString(),
      };
      db.expenses.unshift(ne);
      saveDB(db);
      return { expense: ne };
    }
  }

  // 8. Users & Staff
  if (urlPath === '/api/users') {
    if (method === 'GET') return { users: db.users };
    if (method === 'POST') {
      const nu = {
        id: db.users.length + 1,
        name: body.name,
        email: body.email,
        password_hash: '$2a$12$hash',
        role: body.role || 'cashier',
        permissions_override_json: null,
        is_active: 1,
        must_change_password: 1,
        created_at: new Date().toISOString(),
        last_login_at: null,
      };
      db.users.push(nu);
      saveDB(db);
      return { user: nu };
    }
  }

  // 9. Settings
  if (urlPath === '/api/settings') {
    if (method === 'GET') return { settings: db.shop_settings };
    if (method === 'PUT') {
      db.shop_settings = { ...db.shop_settings, ...body };
      saveDB(db);
      return { ok: true };
    }
  }

  if (urlPath === '/api/settings/lan-info') {
    return {
      hostname: 'localhost',
      port: 3000,
      lanAddresses: [{ interface: 'wifi', address: '127.0.0.1' }],
      connectedDevices: [{ deviceId: 'terminal-main', userName: 'BASLUNE Owner', role: 'owner', connectedAt: new Date().toISOString(), ip: '127.0.0.1' }],
    };
  }

  if (urlPath === '/api/settings/backups') {
    if (method === 'GET') return { backups: db.backups };
    if (method === 'POST') {
      const backup = {
        filename: `baslune-pos-manual-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`,
        sizeBytes: JSON.stringify(db).length,
        createdAt: new Date().toISOString(),
        dataJson: JSON.stringify(db),
      };
      db.backups.unshift(backup);
      saveDB(db);
      return { backup };
    }
  }

  if (urlPath === '/api/settings/audit-logs') {
    return { logs: db.audit_logs };
  }

  if (urlPath === '/api/settings/reset-demo') {
    localStorage.removeItem(STORAGE_VERSION + 'db');
    const fresh = getDB();
    return { ok: true, message: 'Demo data successfully reset', db: fresh };
  }

  // Health check
  if (urlPath === '/api/health') {
    return { status: 'ok', service: 'baslune-pos-local-static', timestamp: new Date().toISOString() };
  }

  throw new Error(`API endpoint not found: ${urlPath}`);
}
