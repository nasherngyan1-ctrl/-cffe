import React from 'react';
import {
  BarChart3,
  Boxes,
  Coffee,
  FolderTree,
  LayoutDashboard,
  LogOut,
  Settings,
  ShoppingBag,
  Truck,
  Users,
  Utensils,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import type { Language, Permission, User } from '../../types/pos';
import { translations } from '../../i18n/translations';

export type NavTab =
  | 'dashboard'
  | 'pos'
  | 'orders'
  | 'tables'
  | 'products'
  | 'categories'
  | 'inventory'
  | 'suppliers'
  | 'employees'
  | 'reports'
  | 'settings';

interface Props {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  user: User;
  lang: Language;
  onLogout: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<Props> = ({
  activeTab,
  onSelectTab,
  user,
  lang,
  onLogout,
  mobileOpen,
  onCloseMobile,
}) => {
  const t = translations[lang];

  const hasAccess = (perm?: Permission, ownerOnly?: boolean) => {
    if (ownerOnly && user.role !== 'owner') return false;
    if (!perm) return true;
    return user.role === 'owner' || user.permissions.includes(perm);
  };

  const navItems: Array<{
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    perm?: Permission;
    ownerOnly?: boolean;
  }> = [
    { id: 'dashboard', label: t.navDashboard, icon: LayoutDashboard, perm: 'dashboard.view' },
    { id: 'pos', label: t.navPos, icon: ShoppingBag, perm: 'pos.sell' },
    { id: 'orders', label: t.navOrders, icon: UtensilsCrossed, perm: 'orders.manage' },
    { id: 'tables', label: t.navTables, icon: Utensils, perm: 'dashboard.view' },
    { id: 'products', label: t.navProducts, icon: Coffee, perm: 'menu.manage' },
    { id: 'categories', label: t.navCategories, icon: FolderTree, perm: 'menu.manage' },
    { id: 'inventory', label: t.navInventory, icon: Boxes, perm: 'inventory.view' },
    { id: 'suppliers', label: t.navSuppliers, icon: Truck, perm: 'inventory.view' },
    { id: 'employees', label: t.navEmployees, icon: Users, perm: 'users.manage' },
    { id: 'reports', label: t.navReports, icon: BarChart3, perm: 'reports.view' },
    { id: 'settings', label: t.navSettings, icon: Settings, perm: 'settings.manage', ownerOnly: true },
  ];

  const visibleItems = navItems.filter((i) => hasAccess(i.perm, i.ownerOnly));

  const sidebarBody = (
    <div className="flex h-full flex-col justify-between bg-[#1B2A24] border-e border-[#2F443A] text-[#F3EFE6]">
      <div className="min-h-0 flex-1 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2F443A] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#101A17] border border-[#384E43]">
              <svg viewBox="0 0 36 36" className="w-5 h-5" fill="none">
                <circle cx="18" cy="18" r="12" stroke="#A7B89A" strokeWidth="2.2" />
                <path
                  d="M21 10C16 11 13 14.5 13 18.5C13 22.5 16 26 21 27C17.5 25 16 22 16 18.5C16 15 17.5 12 21 10Z"
                  fill="#D6C7A3"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold tracking-wide text-[#F3EFE6] truncate">
                {t.brandName}
              </div>
              <div className="text-[11px] text-[#A7B89A] truncate">{t.brandSubtitle}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 text-[#A7B89A] hover:text-[#F3EFE6] cursor-pointer"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="px-3 py-3 space-y-1 overflow-y-auto flex-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#A7B89A] text-[#101A17] font-semibold'
                    : 'text-[#F3EFE6]/80 hover:bg-[#293B32] hover:text-[#F3EFE6]'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#101A17]' : 'text-[#A7B89A]'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-[#2F443A] shrink-0">
        <div className="mb-3 px-2">
          <div className="text-sm font-medium text-[#F3EFE6] truncate">{user.name}</div>
          <div className="text-xs text-[#D6C7A3] truncate">
            {(user.role === 'owner'
              ? t.roleOwner
              : user.role === 'admin'
              ? t.roleAdmin
              : user.role === 'cashier'
              ? t.roleCashier
              : user.role.replace('_', ' '))}{' '}
            · {user.email}
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-[#384E43] bg-[#101A17]/60 px-3 py-2 text-xs font-medium text-[#F3EFE6] hover:bg-[#293B32] transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5 text-[#D6C7A3]" />
          <span>{t.logout}</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0 no-print">
        {sidebarBody}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div className="w-72 max-w-[85vw] h-full">{sidebarBody}</div>
          <div className="flex-1 bg-black/60" onClick={onCloseMobile} />
        </div>
      )}
    </>
  );
};
