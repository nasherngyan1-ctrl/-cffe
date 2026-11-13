import React, { useCallback, useEffect, useState } from 'react';
import { Globe, Menu, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import type { Language, ShopSettings, User } from './types/pos';
import { isRTL, translations } from './i18n/translations';
import {
  apiRequest,
  getStoredToken,
  setStoredToken,
  syncPendingOfflineOrders,
} from './lib/api';
import { getPendingOrders, loadCachedSettings, saveCachedSettings } from './lib/offlineDb';
import { posWsClient } from './lib/wsClient';
import { useOnlineStatus } from './hooks/useOnlineStatus';

import { LoginView } from './components/auth/LoginView';
import { ForcePasswordModal } from './components/auth/ForcePasswordModal';
import { Sidebar, type NavTab } from './components/layout/Sidebar';
import { PWAInstallButton } from './components/layout/PWAInstallButton';
import { DashboardView } from './components/dashboard/DashboardView';
import { CashierPOSView } from './components/pos/CashierPOSView';
import { OrdersKitchenView } from './components/orders/OrdersKitchenView';
import { TablesView } from './components/tables/TablesView';
import { InventoryView } from './components/inventory/InventoryView';
import { MenuManagementView } from './components/menu/MenuManagementView';
import { ReportsView } from './components/reports/ReportsView';
import { UsersRolesView } from './components/users/UsersRolesView';
import { SettingsView } from './components/settings/SettingsView';

const DEFAULT_SETTINGS: ShopSettings = {
  shop_name: 'BASLUNE Specialty Coffee',
  shop_tagline: 'Single-Origin Roastery & Espresso Bar',
  address: 'Empire World, Erbil',
  phone: '+964 750 412 8890',
  currency: 'IQD',
  tax_rate: '0',
  service_charge_rate: '0',
  receipt_header: 'BASLUNE SPECIALTY COFFEE',
  receipt_footer: 'Thank you for visiting BASLUNE',
  printer_type: 'thermal_80mm',
  printer_width: '80mm',
  cash_drawer_enabled: 'true',
  barcode_prefix: 'BSL',
  default_language: 'ckb',
  auto_backup_hours: '6',
  server_port: '3000',
};

export default function App() {
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem('baslune_lang');
    if (saved === 'ckb' || saved === 'ar' || saved === 'en') return saved;
    return 'ckb';
  });

  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [preselectedTableId, setPreselectedTableId] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settings, setSettings] = useState<ShopSettings>(DEFAULT_SETTINGS);
  const [wsConnected, setWsConnected] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [resettingDemo, setResettingDemo] = useState(false);

  const { serverReachable, isOffline } = useOnlineStatus();
  const t = translations[lang];

  useEffect(() => {
    localStorage.setItem('baslune_lang', lang);
    document.documentElement.dir = isRTL(lang) ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  const refreshPendingCount = useCallback(async () => {
    const list = await getPendingOrders();
    setPendingSyncCount(list.length);
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const res = await apiRequest<{ settings: ShopSettings }>('/api/settings');
      setSettings(res.settings);
      await saveCachedSettings(res.settings);
    } catch {
      const cached = await loadCachedSettings();
      if (cached) setSettings(cached);
    }
  }, []);

  const handleSyncOfflineQueue = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await syncPendingOfflineOrders();
      await refreshPendingCount();
    } finally {
      setSyncing(false);
    }
  }, [syncing, refreshPendingCount]);

  const getDefaultTabForUser = useCallback((u: User): NavTab => {
    if (u.role === 'owner' || u.permissions.includes('dashboard.view')) return 'dashboard';
    if (u.permissions.includes('pos.sell')) return 'pos';
    if (u.permissions.includes('orders.manage')) return 'orders';
    return 'pos';
  }, []);

  useEffect(() => {
    refreshPendingCount();
    const unsubStatus = posWsClient.onStatus(setWsConnected);
    const unsubMsg = posWsClient.onMessage((msg) => {
      if (msg.type === 'settings:updated') {
        loadSettings();
      }
    });

    const restoreSession = async () => {
      try {
        const res = await apiRequest<{ user: User }>('/api/auth/me');
        setUser(res.user);
        setActiveTab(getDefaultTabForUser(res.user));
        const token = getStoredToken();
        if (token) posWsClient.connect(token);
        await loadSettings();
      } catch {
        const fallbackUser: User = {
          id: 1,
          name: 'BASLUNE Owner',
          email: 'owner@baslune.local',
          role: 'owner',
          permissions: [],
          is_active: true,
          must_change_password: false,
          last_login_at: null,
        };
        setUser(fallbackUser);
        setActiveTab('dashboard');
        await loadSettings();
      } finally {
        setAuthChecking(false);
      }
    };

    restoreSession();

    return () => {
      unsubStatus();
      unsubMsg();
      posWsClient.disconnect();
    };
  }, [getDefaultTabForUser, loadSettings, refreshPendingCount]);

  useEffect(() => {
    if (serverReachable && pendingSyncCount > 0 && user) {
      handleSyncOfflineQueue();
    }
  }, [serverReachable, pendingSyncCount, user, handleSyncOfflineQueue]);

  const handleAuthenticated = async (authedUser: User, token: string) => {
    setUser(authedUser);
    posWsClient.connect(token);
    await loadSettings();
    setActiveTab(getDefaultTabForUser(authedUser));
  };

  const handleLogout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore if offline
    }
    setStoredToken(null);
    posWsClient.disconnect();
    setUser(null);
    setPreselectedTableId(null);
  };

  const handleOpenOrderForTable = useCallback((tableId: number) => {
    setPreselectedTableId(tableId);
    setActiveTab('pos');
  }, []);

  const handleConsumePreselectedTable = useCallback(() => {
    setPreselectedTableId(null);
  }, []);

  const handleResetDemo = async () => {
    if (!window.confirm(t.resetDemoConfirm)) return;
    setResettingDemo(true);
    try {
      await apiRequest('/api/settings/reset-demo', { method: 'POST' });
      alert(t.demoResetSuccess);
      window.location.reload();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setResettingDemo(false);
    }
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#101A17] flex items-center justify-center text-[#A7B89A] text-sm">
        Loading BASLUNE POS...
      </div>
    );
  }

  if (!user) {
    return (
      <LoginView lang={lang} onChangeLang={setLang} onAuthenticated={handleAuthenticated} />
    );
  }

  const pageTitleMap: Record<NavTab, string> = {
    dashboard: t.navDashboard,
    pos: t.navPos,
    orders: t.navOrders,
    tables: t.navTables,
    products: t.navProducts,
    categories: t.navCategories,
    inventory: t.navInventory,
    suppliers: t.navSuppliers,
    employees: t.navEmployees,
    reports: t.navReports,
    settings: t.navSettings,
  };

  const hasPerm = (perm: User['permissions'][number]) =>
    user.role === 'owner' || user.permissions.includes(perm);

  return (
    <div className="min-h-screen bg-[#101A17] text-[#F3EFE6] flex">
      {user.must_change_password && (
        <ForcePasswordModal
          lang={lang}
          user={user}
          onPasswordUpdated={(updatedUser) => setUser(updatedUser)}
        />
      )}

      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        user={user}
        lang={lang}
        onLogout={handleLogout}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-[57px] bg-[#1B2A24] border-b border-[#2F443A] px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 rounded-lg text-[#A7B89A] hover:bg-[#293B32] cursor-pointer"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-sm sm:text-base font-bold text-[#F3EFE6] truncate">
              {pageTitleMap[activeTab]}
            </h1>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex items-center gap-1.5 bg-[#A7B89A]/15 border border-[#A7B89A]/40 text-[#A7B89A] px-2.5 py-1 rounded-lg text-xs font-bold tracking-wide">
              <span className="w-2 h-2 rounded-full bg-[#A7B89A] animate-pulse"></span>
              <span>{t.demoModeBadge}</span>
            </div>

            <button
              type="button"
              disabled={resettingDemo}
              onClick={handleResetDemo}
              className="flex items-center gap-1 rounded-lg border border-amber-400/40 bg-amber-950/40 px-2.5 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-900/40 cursor-pointer"
              title={t.resetDemoData}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${resettingDemo ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">{t.resetDemoData}</span>
            </button>
            {pendingSyncCount > 0 && (
              <button
                type="button"
                onClick={handleSyncOfflineQueue}
                disabled={syncing || isOffline}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500/20 border border-amber-400/40 px-2.5 py-1.5 text-xs font-medium text-amber-200 whitespace-nowrap cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                <span className="tabular-nums">
                  {pendingSyncCount} {t.pendingSync}
                </span>
              </button>
            )}

            <div
              className="hidden sm:flex items-center gap-1.5 text-xs whitespace-nowrap"
              title={serverReachable ? t.serverConnected : t.serverOffline}
            >
              {serverReachable ? (
                <>
                  <Wifi className={`w-3.5 h-3.5 ${wsConnected ? 'text-[#A7B89A]' : 'text-[#D6C7A3]'}`} />
                  <span className="text-[#A7B89A]">{t.serverConnected}</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-amber-300">{t.serverOffline}</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-1 bg-[#101A17] p-0.5 rounded-lg border border-[#384E43]">
              <Globe className="w-3.5 h-3.5 text-[#A7B89A] mx-1 hidden sm:block" />
              {(['ckb', 'ar', 'en'] as Language[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  className={`px-2 py-1 rounded text-[11px] font-medium cursor-pointer ${
                    lang === code ? 'bg-[#A7B89A] text-[#101A17] font-semibold' : 'text-[#F3EFE6]/75'
                  }`}
                >
                  {code === 'ckb' ? 'کوردی' : code === 'ar' ? 'عربي' : 'EN'}
                </button>
              ))}
            </div>

            <PWAInstallButton label={t.installApp} />
          </div>
        </header>

        {isOffline && (
          <div className="bg-amber-950/60 border-b border-amber-400/40 px-4 py-2 text-xs text-amber-200 flex items-center justify-between no-print">
            <span>{t.offlineMode}</span>
            <span className="tabular-nums">{pendingSyncCount}</span>
          </div>
        )}

        <main className="flex-1">
          {activeTab === 'dashboard' && hasPerm('dashboard.view') && (
            <DashboardView lang={lang} user={user} settings={settings} onNavigateTab={setActiveTab} />
          )}
          {activeTab === 'pos' && hasPerm('pos.sell') && (
            <CashierPOSView
              lang={lang}
              user={user}
              settings={settings}
              onOfflineQueueChanged={refreshPendingCount}
              preselectedTableId={preselectedTableId}
              onConsumePreselectedTable={handleConsumePreselectedTable}
            />
          )}
          {activeTab === 'orders' && hasPerm('orders.manage') && (
            <OrdersKitchenView lang={lang} user={user} settings={settings} />
          )}
          {activeTab === 'tables' && hasPerm('dashboard.view') && (
            <TablesView
              lang={lang}
              user={user}
              settings={settings}
              onOpenOrderForTable={handleOpenOrderForTable}
            />
          )}
          {(activeTab === 'products' || activeTab === 'categories') && hasPerm('menu.manage') && (
            <MenuManagementView
              lang={lang}
              settings={settings}
              initialSection={activeTab === 'categories' ? 'categories' : 'products'}
            />
          )}
          {(activeTab === 'inventory' || activeTab === 'suppliers') && hasPerm('inventory.view') && (
            <InventoryView
              lang={lang}
              user={user}
              settings={settings}
              initialTab={activeTab === 'suppliers' ? 'suppliers' : 'items'}
            />
          )}
          {activeTab === 'employees' && hasPerm('users.manage') && (
            <UsersRolesView lang={lang} currentUser={user} />
          )}
          {activeTab === 'reports' && hasPerm('reports.view') && (
            <ReportsView lang={lang} user={user} settings={settings} />
          )}
          {activeTab === 'settings' && user.role === 'owner' && (
            <SettingsView
              lang={lang}
              onChangeLang={setLang}
              settings={settings}
              onSettingsSaved={setSettings}
            />
          )}
        </main>
      </div>
    </div>
  );
}
