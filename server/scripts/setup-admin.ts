import bcrypt from 'bcryptjs';
import { db, runMigrations } from '../db.ts';
import { ALL_PERMISSIONS } from '../auth.ts';

export function bootstrapLocalDatabase(options?: { logPrefix?: string }) {
  const prefix = options?.logPrefix ?? '[Setup]';
  runMigrations();

  // 1. Ensure canonical roles exist (Owner, Admin, Cashier)
  const roleDefinitions = [
    {
      role_key: 'owner',
      label_en: 'Owner',
      label_ckb: 'خاوەنکار',
      label_ar: 'المالك',
      permissions: ALL_PERMISSIONS,
    },
    {
      role_key: 'admin',
      label_en: 'Admin',
      label_ckb: 'بەڕێوەبەر (ئەدمین)',
      label_ar: 'مدير النظام',
      permissions: [
        'dashboard.view',
        'pos.sell',
        'pos.discount',
        'pos.cancel_order',
        'orders.manage',
        'inventory.view',
        'inventory.manage',
        'menu.manage',
        'reports.view',
        'reports.export',
        'users.manage',
      ],
    },
    {
      role_key: 'cashier',
      label_en: 'Cashier',
      label_ckb: 'کاشێر',
      label_ar: 'أمين الصندوق',
      permissions: ['pos.sell', 'orders.manage'],
    },
  ];

  const insertRole = db.prepare(`
    INSERT INTO roles (role_key, label_en, label_ckb, label_ar, permissions_json)
    VALUES (@role_key, @label_en, @label_ckb, @label_ar, @permissions_json)
    ON CONFLICT(role_key) DO UPDATE SET
      label_en = excluded.label_en,
      label_ckb = excluded.label_ckb,
      label_ar = excluded.label_ar,
      permissions_json = excluded.permissions_json
  `);

  db.transaction(() => {
    for (const r of roleDefinitions) {
      insertRole.run({
        role_key: r.role_key,
        label_en: r.label_en,
        label_ckb: r.label_ckb,
        label_ar: r.label_ar,
        permissions_json: JSON.stringify(r.permissions),
      });
    }

    // Migrate any legacy role assignments safely before pruning old role keys
    db.prepare(`UPDATE users SET role = 'owner' WHERE role = 'super_admin'`).run();
    db.prepare(`UPDATE users SET role = 'admin' WHERE role IN ('manager', 'inventory_staff')`).run();
    db.prepare(`DELETE FROM roles WHERE role_key IN ('super_admin', 'manager', 'inventory_staff')`).run();
  })();

  // 2. Seed Initial Demonstration Accounts (Owner, Admin, Cashier)
  // Credentials are seeded solely on the backend and never exposed in frontend code.
  const demoAccounts = [
    {
      name: 'BASLUNE Owner',
      email: (process.env.INITIAL_OWNER_EMAIL || 'owner@baslune.local').trim().toLowerCase(),
      password: process.env.INITIAL_OWNER_PASSWORD || 'Owner@12345',
      role: 'owner',
    },
    {
      name: 'BASLUNE Admin',
      email: (process.env.INITIAL_ADMIN_EMAIL || 'admin@baslune.local').trim().toLowerCase(),
      password: process.env.INITIAL_ADMIN_PASSWORD || 'Admin@12345',
      role: 'admin',
    },
    {
      name: 'BASLUNE Cashier',
      email: (process.env.INITIAL_CASHIER_EMAIL || 'cashier@baslune.local').trim().toLowerCase(),
      password: process.env.INITIAL_CASHIER_PASSWORD || 'Cashier@12345',
      role: 'cashier',
    },
  ];

  const findUserByEmail = db.prepare('SELECT id FROM users WHERE email = ?');
  const insertDemoUser = db.prepare(
    `INSERT INTO users (name, email, password_hash, role, is_active, must_change_password)
     VALUES (?, ?, ?, ?, 1, 1)`
  );

  for (const acc of demoAccounts) {
    const exists = findUserByEmail.get(acc.email) as { id: number } | undefined;
    if (!exists) {
      const hash = bcrypt.hashSync(acc.password, 12);
      insertDemoUser.run(acc.name, acc.email, hash, acc.role);
      console.log(`${prefix} Seeded ${acc.role.toUpperCase()} account (${acc.email}) with forced password change.`);
    }
  }

  // Clean up prior-version placeholder seed accounts if present while preserving historical order attribution
  const legacyEmails = [
    'baslunestudio@gmail.com',
    'manager@baslune.coffee',
    'cashier@baslune.coffee',
    'inventory@baslune.coffee',
  ];
  const ownerRow = findUserByEmail.get(demoAccounts[0].email) as { id: number } | undefined;
  const cashierRow = findUserByEmail.get(demoAccounts[2].email) as { id: number } | undefined;

  db.transaction(() => {
    for (const legacyEmail of legacyEmails) {
      const legacy = findUserByEmail.get(legacyEmail) as { id: number } | undefined;
      if (legacy) {
        const replacementId = legacyEmail.includes('cashier')
          ? cashierRow?.id ?? ownerRow?.id ?? null
          : ownerRow?.id ?? null;
        if (replacementId) {
          db.prepare('UPDATE orders SET cashier_id = ? WHERE cashier_id = ?').run(replacementId, legacy.id);
          db.prepare('UPDATE expenses SET recorded_by = ? WHERE recorded_by = ?').run(replacementId, legacy.id);
        }
        db.prepare('DELETE FROM users WHERE id = ?').run(legacy.id);
      }
    }
  })();

  // 3. Default Shop Settings
  const defaultSettings: Array<[string, string]> = [
    ['shop_name', 'BASLUNE Specialty Coffee'],
    ['shop_tagline', 'Single-Origin Roastery & Espresso Bar'],
    ['address', 'Empire World, Erbil, Kurdistan Region'],
    ['phone', '+964 750 412 8890'],
    ['currency', 'IQD'],
    ['tax_rate', '0'],
    ['service_charge_rate', '0'],
    ['receipt_header', 'BASLUNE SPECIALTY COFFEE\nFreshly Roasted • Hand-Brewed'],
    ['receipt_footer', 'سوپاس بۆ سەردانەکەت • Thank you for visiting BASLUNE'],
    ['printer_type', 'thermal_80mm'],
    ['printer_width', '80mm'],
    ['cash_drawer_enabled', 'true'],
    ['barcode_prefix', 'BSL'],
    ['default_language', 'ckb'],
    ['auto_backup_hours', '6'],
    ['server_port', '3000'],
  ];

  const insertSetting = db.prepare(
    `INSERT OR IGNORE INTO shop_settings (key, value) VALUES (?, ?)`
  );
  for (const [k, v] of defaultSettings) {
    insertSetting.run(k, v);
  }

  // 4. Seed demo catalog, inventory, tables, and historical orders if catalog is empty
  const catCount = (db.prepare('SELECT COUNT(*) as c FROM categories').get() as { c: number }).c;
  if (catCount > 0) return;

  const seedTransaction = db.transaction(() => {
    // Categories
    const categories = [
      { name_ckb: 'ئیسپرێسۆ و قاوەی گەرم', name_ar: 'إسبريسو وقهوة ساخنة', name_en: 'Espresso & Hot', sort_order: 1 },
      { name_ckb: 'قاوەی سارد و تایبەت', name_ar: 'قهوة باردة ومختصة', name_en: 'Iced & Signature', sort_order: 2 },
      { name_ckb: 'دڵۆپاندنی دەستی (V60)', name_ar: 'تقطير يدوي (V60)', name_en: 'Manual Brew', sort_order: 3 },
      { name_ckb: 'ماچا و چا', name_ar: 'ماتشا وشاي', name_en: 'Matcha & Tea', sort_order: 4 },
      { name_ckb: 'شیرینی و نانەوایی', name_ar: 'مخبوزات وحلويات', name_en: 'Bakery & Pastry', sort_order: 5 },
      { name_ckb: 'قوتوو و دەنکی قاوە', name_ar: 'حبوب القهوة ومنتجات', name_en: 'Roastery Bags', sort_order: 6 },
    ];
    const catIds: number[] = [];
    const insCat = db.prepare(
      `INSERT INTO categories (name_ckb, name_ar, name_en, sort_order, is_active) VALUES (?, ?, ?, ?, 1)`
    );
    for (const c of categories) {
      const res = insCat.run(c.name_ckb, c.name_ar, c.name_en, c.sort_order);
      catIds.push(Number(res.lastInsertRowid));
    }

    // Suppliers
    const insSup = db.prepare(
      `INSERT INTO suppliers (name, contact_person, phone, email, notes) VALUES (?, ?, ?, ?, ?)`
    );
    const sup1 = Number(insSup.run('Zagros Green Coffee Roasters', 'Hemin Rasul', '+964 750 111 2233', 'orders@zagrosroast.krd', 'Single origin Ethiopia & Colombia').lastInsertRowid);
    const sup2 = Number(insSup.run('Erbil Artisanal Dairy & Cream', 'Soran Talib', '+964 751 445 6677', 'supply@erbildairy.iq', 'Fresh barista milk & oat milk').lastInsertRowid);
    const sup3 = Number(insSup.run('La Lune French Bakery', 'Nadia Yousif', '+964 770 889 1122', 'kitchen@lalunebakery.iq', 'Daily morning croissants & tarts').lastInsertRowid);

    // Inventory Items (Raw Materials & Ingredients)
    const insInv = db.prepare(
      `INSERT INTO inventory_items (sku, name_ckb, name_ar, name_en, item_type, unit, quantity, min_threshold, unit_cost, supplier_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const invEspresso = Number(insInv.run('ING-ESP-01', 'دەنکی قاوەی ئیسپرێسۆ', 'حبوب إسبريسو مختصة', 'House Espresso Beans', 'raw_material', 'g', 14500, 3000, 42, sup1).lastInsertRowid);
    const invFilter = Number(insInv.run('ING-FLT-02', 'دەنکی ئیتیۆپیا گوجی V60', 'حبوب إثيوبيا غوجي', 'Ethiopia Guji Filter Beans', 'raw_material', 'g', 6200, 1500, 58, sup1).lastInsertRowid);
    const invMilk = Number(insInv.run('ING-MLK-03', 'شیری باریستا', 'حليب باريستا طازج', 'Fresh Barista Milk', 'ingredient', 'ml', 28000, 6000, 2.5, sup2).lastInsertRowid);
    const invOat = Number(insInv.run('ING-OAT-04', 'شیری شۆفان', 'حليب الشوفان', 'Barista Oat Milk', 'ingredient', 'ml', 4200, 5000, 6, sup2).lastInsertRowid); // Intentionally below threshold for realistic low-stock alert!
    const invCondensed = Number(insInv.run('ING-CND-05', 'شیری خەست (ئیسپانی)', 'حليب مكثف محلى', 'Sweetened Condensed Milk', 'ingredient', 'ml', 5400, 1200, 7, sup2).lastInsertRowid);
    const invMatcha = Number(insInv.run('ING-MTC-06', 'پاودەری ماچای ژاپۆنی', 'مسحوق ماتشا ياباني', 'Ceremonial Uji Matcha', 'ingredient', 'g', 950, 300, 320, sup1).lastInsertRowid);
    const invPistachio = Number(insInv.run('ING-PST-07', 'کرێمی فستق', 'كريمة الفستق الحلبي', 'Roasted Pistachio Cream', 'ingredient', 'g', 2800, 800, 35, sup3).lastInsertRowid);
    const invCup = Number(insInv.run('PKG-CUP-08', 'کوپی کاغەزی دوو چین', 'كوب ورقي مزدوج', 'Double-Wall Cup 8oz/12oz', 'packaging', 'pcs', 1100, 250, 140, sup3).lastInsertRowid);

    // Add-ons
    const insAddon = db.prepare(
      `INSERT INTO addons (name_ckb, name_ar, name_en, price, ingredient_id, ingredient_qty, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)`
    );
    insAddon.run('شۆتی زیادەی ئیسپرێسۆ', 'شوت إسبريسو إضافي', 'Extra Espresso Shot', 1500, invEspresso, 18);
    insAddon.run('شیری شۆفان', 'حليب الشوفان', 'Oat Milk Swap', 1500, invOat, 180);
    insAddon.run('سیروپی ڤانیلا', 'سيروب الفانيليا', 'Madagascar Vanilla Syrup', 1000, null, 0);
    insAddon.run('کرێمی کارامێل', 'صوص الكراميل', 'Salted Caramel Drizzle', 1000, null, 0);

    // Products with local generated studio photography
    const IMG_CORTADO = '/src/assets/images/espresso_cortado_1794587393003.jpg';
    const IMG_V60 = '/src/assets/images/v60_pour_over_1794587392996.jpg';
    const IMG_MATCHA = '/src/assets/images/iced_matcha_latte_1794587393590.jpg';
    const IMG_SPANISH = '/src/assets/images/spanish_latte_iced_1794587393947.jpg';
    const IMG_CROISSANT = '/src/assets/images/pistachio_croissant_1794587393635.jpg';

    const insProd = db.prepare(`
      INSERT INTO products (
        category_id, sku, barcode, name_ckb, name_ar, name_en,
        description_ckb, description_ar, description_en,
        base_price, cost_estimate, image_url, is_available, is_active,
        track_direct_stock, direct_stock_qty, low_stock_threshold
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?)
    `);

    const insVar = db.prepare(`
      INSERT INTO product_variations (product_id, name_ckb, name_ar, name_en, price_delta, recipe_multiplier, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insRec = db.prepare(`
      INSERT INTO product_recipes (product_id, inventory_item_id, quantity_required) VALUES (?, ?, ?)
    `);

    // 1. Cortado
    const p1 = Number(insProd.run(catIds[0], 'BSL-101', '860000101', 'کۆرتادۆ', 'كورتادو', 'Baslune Cortado', 'دەبڵ ڕیسترێتۆ لەگەڵ شیری نەرم', 'دبل ريستريتو مع حليب مخملي', 'Double ristretto balanced with silky microfoam', 4500, 1250, IMG_CORTADO, 0, 0, 5).lastInsertRowid);
    insVar.run(p1, 'ستاندارد (١٥٠ مل)', 'قياسي (١٥٠ مل)', 'Standard 5oz', 0, 1.0, 1);
    insVar.run(p1, 'دەبڵ (٢٠٠ مل)', 'دبل (٢٠٠ مل)', 'Double 7oz', 1000, 1.3, 0);
    insRec.run(p1, invEspresso, 18);
    insRec.run(p1, invMilk, 110);
    insRec.run(p1, invCup, 1);

    // 2. Flat White
    const p2 = Number(insProd.run(catIds[0], 'BSL-102', '860000102', 'فلات وایت', 'فلات وايت', 'Velvet Flat White', 'دەبڵ ئیسپرێسۆ و مایکرۆفۆم', 'دبل إسبريسو مع رغوة ناعمة', 'Double espresso with velvety textured milk', 5000, 1350, IMG_CORTADO, 0, 0, 5).lastInsertRowid);
    insVar.run(p2, 'مامناوەند (٨ ئۆنز)', 'وسط (٨ أونص)', 'Regular 8oz', 0, 1.0, 1);
    insVar.run(p2, 'گەورە (١٢ ئۆنز)', 'كبير (١٢ أونص)', 'Large 12oz', 1250, 1.4, 0);
    insRec.run(p2, invEspresso, 18);
    insRec.run(p2, invMilk, 180);
    insRec.run(p2, invCup, 1);

    // 3. Double Espresso
    const p3 = Number(insProd.run(catIds[0], 'BSL-103', '860000103', 'دەبڵ ئیسپرێسۆ', 'دبل إسبريسو', 'Single Origin Espresso', 'دەبڵ شۆتی ئیتیۆپیا و کۆڵۆمبیا', 'دبل شوت إسبريسو مختص', '18g house blend pulled at 9 bars', 3500, 900, IMG_CORTADO, 0, 0, 5).lastInsertRowid);
    insVar.run(p3, 'دەبڵ شۆت', 'دبل شوت', 'Double Shot', 0, 1.0, 1);
    insRec.run(p3, invEspresso, 18);

    // 4. Iced Spanish Latte
    const p4 = Number(insProd.run(catIds[1], 'BSL-201', '860000201', 'سپانیش لاتێی سارد', 'سبانيش لاتيه بارد', 'Iced Spanish Latte', 'ئیسپرێسۆ لەگەڵ شیری خەست و سەهۆڵ', 'إسبريسو مع حليب مكثف وثلج', 'Signature chilled espresso over condensed & fresh milk', 6000, 1650, IMG_SPANISH, 0, 0, 5).lastInsertRowid);
    insVar.run(p4, 'مامناوەند (١٢ ئۆنز)', 'وسط (١٢ أونص)', 'Regular 12oz', 0, 1.0, 1);
    insVar.run(p4, 'گەورە (١٦ ئۆنز)', 'كبير (١٦ أونص)', 'Large 16oz', 1500, 1.35, 0);
    insRec.run(p4, invEspresso, 18);
    insRec.run(p4, invMilk, 180);
    insRec.run(p4, invCondensed, 35);
    insRec.run(p4, invCup, 1);

    // 5. Cold Brew / Iced Americano
    const p5 = Number(insProd.run(catIds[1], 'BSL-202', '860000202', 'ئەمەریکانۆی سارد', 'أمريكانو بارد', 'Iced Forest Americano', 'ئیسپرێسۆی سارد لەسەر سەهۆڵی کریستاڵ', 'إسبريسو بارد فوق الثلج', 'Crisp double espresso over filtered ice water', 4500, 950, IMG_SPANISH, 0, 0, 5).lastInsertRowid);
    insVar.run(p5, 'مامناوەند (١٢ ئۆنز)', 'وسط (١٢ أونص)', 'Regular 12oz', 0, 1.0, 1);
    insVar.run(p5, 'گەورە (١٦ ئۆنز)', 'كبير (١٦ أونص)', 'Large 16oz', 1000, 1.5, 0);
    insRec.run(p5, invEspresso, 18);
    insRec.run(p5, invCup, 1);

    // 6. V60 Pour Over
    const p6 = Number(insProd.run(catIds[2], 'BSL-301', '860000301', 'ڤی ٦٠ ئیتیۆپیا گوجی', 'تقطير V60 إثيوبيا', 'Ethiopia Guji V60', 'تامی یاسەمین، هەڵووژە و بێرگامۆت', 'نكهات الياسمين والخوخ والبرغموت', 'Hand-poured washed Ethiopia Guji, jasmine & peach notes', 6500, 1600, IMG_V60, 0, 0, 5).lastInsertRowid);
    insVar.run(p6, 'گەرم (٣٠٠ مل)', 'ساخن (٣٠٠ مل)', 'Hot 300ml', 0, 1.0, 1);
    insVar.run(p6, 'سارد (٣٠٠ مل)', 'بارد (٣٠٠ مل)', 'Iced Flash Brew', 500, 1.0, 0);
    insRec.run(p6, invFilter, 20);

    // 7. Iced Ceremonial Matcha
    const p7 = Number(insProd.run(catIds[3], 'BSL-401', '860000401', 'ماچای ساردی یوجی', 'ماتشا يوجي باردة', 'Iced Ceremonial Matcha', 'ماچای ئۆرگانیکی ژاپۆنی لەگەڵ شیری شۆفان', 'ماتشا يابانية فاخرة مع حليب الشوفان', 'First-harvest Uji matcha whisked over oat milk', 6500, 2100, IMG_MATCHA, 0, 0, 5).lastInsertRowid);
    insVar.run(p7, 'مامناوەند (١٢ ئۆنز)', 'وسط (١٢ أونص)', 'Regular 12oz', 0, 1.0, 1);
    insVar.run(p7, 'گەورە (١٦ ئۆنز)', 'كبير (١٦ أونص)', 'Large 16oz', 1500, 1.35, 0);
    insRec.run(p7, invMatcha, 4);
    insRec.run(p7, invOat, 190);
    insRec.run(p7, invCup, 1);

    // 8. Pistachio Croissant
    const p8 = Number(insProd.run(catIds[4], 'BSL-501', '860000501', 'کرواسان بە فستق', 'كرواسون الفستق', 'Pistachio Cream Croissant', 'کرواسانی کەرەی فەرەنسی بە کرێمی فستق', 'كرواسون فرنسي بالزبدة وكريمة الفستق', 'Flaky laminated butter croissant filled with pistachio cream', 5500, 2200, IMG_CROISSANT, 1, 24, 6).lastInsertRowid);
    insVar.run(p8, 'یەک دانە', 'قطعة واحدة', 'Single Piece', 0, 1.0, 1);
    insRec.run(p8, invPistachio, 25);

    // 9. Roastery Bean Bag 250g (Direct stock product!)
    const p9 = Number(insProd.run(catIds[5], 'BSL-601', '860000601', 'کیسی قاوەی باسلون ٢٥٠ گرام', 'كيس قهوة باسلون ٢٥٠ غ', 'Baslune House Blend 250g', 'برژاوی تازەی تایبەت بۆ ئیسپرێسۆ و مۆکا', 'تحميص طازج للإسبريسو والموكا', 'Whole bean medium roast, caramel & dark chocolate', 18000, 9500, IMG_V60, 1, 16, 4).lastInsertRowid);
    insVar.run(p9, 'دەنکی تەواو', 'حبوب كاملة', 'Whole Bean', 0, 1.0, 1);
    insVar.run(p9, 'هاڕدراو بۆ ئیسپرێسۆ', 'مطحون للإسبريسو', 'Espresso Grind', 0, 1.0, 0);

    // Tables
    const insTable = db.prepare(
      `INSERT INTO cafe_tables (table_number, name, capacity, zone, status) VALUES (?, ?, ?, ?, 'available')`
    );
    insTable.run('T1', 'Table 01', 2, 'Window');
    insTable.run('T2', 'Table 02', 2, 'Window');
    insTable.run('T3', 'Table 03', 4, 'Main Lounge');
    insTable.run('T4', 'Table 04', 4, 'Main Lounge');
    insTable.run('T5', 'Table 05', 6, 'Garden Patio');
    insTable.run('T6', 'Table 06', 4, 'Garden Patio');
    insTable.run('B1', 'Brew Bar 01', 1, 'Espresso Bar');
    insTable.run('B2', 'Brew Bar 02', 1, 'Espresso Bar');

    // Seed realistic historical sales across past 14 days + today for charts and KPIs
    const adminRow = db.prepare('SELECT id FROM users LIMIT 1').get() as { id: number };
    const cashierId = adminRow?.id ?? 1;

    const sampleItems = [
      { id: p1, name: 'Baslune Cortado', varName: 'Standard 5oz', price: 4500, cost: 1250 },
      { id: p4, name: 'Iced Spanish Latte', varName: 'Regular 12oz', price: 6000, cost: 1650 },
      { id: p6, name: 'Ethiopia Guji V60', varName: 'Hot 300ml', price: 6500, cost: 1600 },
      { id: p7, name: 'Iced Ceremonial Matcha', varName: 'Regular 12oz', price: 6500, cost: 2100 },
      { id: p8, name: 'Pistachio Cream Croissant', varName: 'Single Piece', price: 5500, cost: 2200 },
      { id: p2, name: 'Velvet Flat White', varName: 'Regular 8oz', price: 5000, cost: 1350 },
    ];

    const insOrder = db.prepare(`
      INSERT INTO orders (
        order_number, client_tx_id, order_type, table_id, status, payment_status,
        payment_method, cash_amount, card_amount, subtotal, discount_amount,
        tax_amount, service_charge_amount, total_amount, estimated_cost,
        cashier_id, device_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, 'terminal-main', ?, ?)
    `);

    const insOrderItem = db.prepare(`
      INSERT INTO order_items (
        order_id, product_id, product_name, variation_name, quantity,
        unit_price, addons_json, addons_total, line_total, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?, '[]', 0, ?, ?)
    `);

    let seq = 1001;
    // Generate 14 days of realistic orders
    for (let dayOffset = 13; dayOffset >= 0; dayOffset--) {
      const ordersForDay = dayOffset === 0 ? 7 : 5 + (dayOffset % 4);
      for (let j = 0; j < ordersForDay; j++) {
        const d = new Date();
        d.setDate(d.getDate() - dayOffset);
        d.setHours(9 + (j * 2) % 12, (j * 17) % 59, 12, 0);
        const iso = d.toISOString().replace('T', ' ').slice(0, 19);

        const itemA = sampleItems[(seq + j) % sampleItems.length];
        const itemB = sampleItems[(seq + j + 2) % sampleItems.length];
        const qtyA = 1 + (j % 2);
        const qtyB = j % 3 === 0 ? 1 : 0;

        const subtotal = itemA.price * qtyA + itemB.price * qtyB;
        const estCost = itemA.cost * qtyA + itemB.cost * qtyB;
        const method = j % 3 === 0 ? 'card' : j % 5 === 0 ? 'split' : 'cash';
        const cashAmt = method === 'cash' ? subtotal : method === 'split' ? Math.round(subtotal / 2) : 0;
        const cardAmt = subtotal - cashAmt;
        const orderType = j % 3 === 0 ? 'takeaway' : j % 4 === 0 ? 'delivery' : 'dine_in';
        const status = dayOffset === 0 && j >= ordersForDay - 2 ? (j === ordersForDay - 1 ? 'preparing' : 'pending') : 'completed';

        const orderRes = insOrder.run(
          `BSL-${seq}`,
          `seed-tx-${seq}`,
          orderType,
          orderType === 'dine_in' ? ((j % 4) + 1) : null,
          status,
          method,
          cashAmt,
          cardAmt,
          subtotal,
          subtotal,
          estCost,
          cashierId,
          iso,
          iso
        );
        const oid = Number(orderRes.lastInsertRowid);
        insOrderItem.run(oid, itemA.id, itemA.name, itemA.varName, qtyA, itemA.price, itemA.price * qtyA, itemA.cost);
        if (qtyB > 0) {
          insOrderItem.run(oid, itemB.id, itemB.name, itemB.varName, qtyB, itemB.price, itemB.price * qtyB, itemB.cost);
        }
        seq++;
      }
    }

    // Seed initial expenses
    const insExp = db.prepare(
      `INSERT INTO expenses (category, title, amount, notes, recorded_by, expense_date) VALUES (?, ?, ?, ?, ?, date('now', ?))`
    );
    insExp.run('Utilities', 'Electricity & Espresso Boiler Maintenance', 185000, 'Monthly coffee bar utilities', cashierId, '-2 days');
    insExp.run('Supplies', 'Zagros Green Coffee Roastery Invoice #408', 620000, '15kg House Espresso + 6kg Ethiopia Guji', cashierId, '-5 days');
    insExp.run('Rent', 'Cafe Premises Monthly Lease Share', 950000, 'Empire World kiosk unit', cashierId, '-10 days');
  });

  seedTransaction();
  console.log(`${prefix} Seeded BASLUNE Specialty Coffee menu, inventory, tables, and local transaction history.`);
}

// Allow running directly via `npm run setup`
const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  process.argv[1].includes('setup-admin');

if (isDirectRun) {
  bootstrapLocalDatabase({ logPrefix: '[Setup Script]' });
  console.log('[Setup Script] Complete.');
  process.exit(0);
}
