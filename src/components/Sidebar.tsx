import React from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  ReceiptText,
  Boxes,
  CalendarClock,
  Truck,
  BarChart3,
  Users,
  Settings,
  X,
  Menu,
} from 'lucide-react';
import { Role } from '../types';

export type NavTab =
  | 'dashboard'
  | 'pos'
  | 'sales'
  | 'inventory'
  | 'expiry'
  | 'purchases'
  | 'reports'
  | 'users'
  | 'settings';

interface Props {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  role: Role | null;
  expiryAlertCount?: number;
  lowStockCount?: number;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  onMobileOpen?: () => void;
}

export const Sidebar: React.FC<Props> = ({
  currentTab,
  onTabChange,
  role,
  expiryAlertCount = 0,
  lowStockCount = 0,
  mobileOpen = false,
  onMobileClose,
  onMobileOpen,
}) => {
  const permissions = role?.permissions || [];

  const navItems = [
    {
      id: 'dashboard' as NavTab,
      label: 'Dashboard',
      icon: LayoutDashboard,
      show: true,
    },
    {
      id: 'pos' as NavTab,
      label: 'POS Billing',
      icon: ShoppingCart,
      show: permissions.includes('create_sale'),
      badge: 'Counter',
    },
    {
      id: 'sales' as NavTab,
      label: 'Invoices & Returns',
      icon: ReceiptText,
      show:
        permissions.includes('create_sale') ||
        permissions.includes('process_return') ||
        permissions.includes('view_reports'),
    },
    {
      id: 'inventory' as NavTab,
      label: 'Medicines & Stock',
      icon: Boxes,
      show: permissions.includes('view_inventory'),
      count: lowStockCount > 0 ? lowStockCount : undefined,
      countColor: 'bg-amber-100 text-amber-800',
    },
    {
      id: 'expiry' as NavTab,
      label: 'Expiry & Batches',
      icon: CalendarClock,
      show: permissions.includes('view_inventory'),
      count: expiryAlertCount > 0 ? expiryAlertCount : undefined,
      countColor: 'bg-rose-100 text-rose-800',
    },
    {
      id: 'purchases' as NavTab,
      label: 'Purchases & Suppliers',
      icon: Truck,
      show: permissions.includes('manage_suppliers') || permissions.includes('manage_purchases'),
    },
    {
      id: 'reports' as NavTab,
      label: 'Reports & Analytics',
      icon: BarChart3,
      show: permissions.includes('view_reports'),
    },
    {
      id: 'users' as NavTab,
      label: 'Staff & Roles',
      icon: Users,
      show: permissions.includes('manage_users') || permissions.includes('manage_roles'),
    },
    {
      id: 'settings' as NavTab,
      label: 'Settings & Backups',
      icon: Settings,
      show:
        permissions.includes('manage_settings') ||
        permissions.includes('manage_license') ||
        permissions.includes('manage_backup'),
    },
  ];

  const visibleItems = navItems.filter((i) => i.show);

  const handleSelect = (tab: NavTab) => {
    onTabChange(tab);
    if (onMobileClose) {
      onMobileClose();
    }
  };

  const navContent = (
    <div className="flex flex-col h-full select-none">
      <div className="p-3 space-y-1 flex-1 overflow-y-auto">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleSelect(item.id)}
              className={`w-full flex items-center justify-between px-3 py-3 rounded-lg text-sm font-medium transition cursor-pointer ${
                active
                  ? 'bg-teal-50 text-teal-800 border border-teal-200 shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-5 h-5 shrink-0 ${active ? 'text-teal-700' : 'text-slate-500'}`} />
                <span className="truncate">{item.label}</span>
              </div>

              {item.count !== undefined && (
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${item.countColor}`}>
                  {item.count}
                </span>
              )}

              {item.badge && !active && (
                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium shrink-0">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Role Summary Footer */}
      <div className="p-3.5 border-t border-slate-100 bg-slate-50/80 text-xs text-slate-500 shrink-0">
        <div className="flex items-center justify-between">
          <span>Active Role:</span>
          <span className="font-semibold text-slate-700">{role?.name || 'Staff'}</span>
        </div>
        <div className="mt-1 text-[11px] text-slate-400">
          Max Discount Allowed: {role?.max_discount_percent ?? 0}%
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* 1. Desktop & Large Tablet Sidebar */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-slate-200 flex-col shrink-0 min-h-[calc(100vh-56px)] select-none">
        {navContent}
      </aside>

      {/* 2. Mobile & Tablet Slide-over Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      {/* 3. Mobile Slide-over Drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 sm:w-80 bg-white shadow-2xl flex flex-col lg:hidden transform transition-transform duration-200 ease-in-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 bg-teal-900 text-white flex items-center justify-between border-b border-teal-800">
          <div className="flex items-center gap-2">
            <span className="font-bold text-base tracking-tight">Navigation Menu</span>
          </div>
          <button
            onClick={onMobileClose}
            className="p-1.5 rounded-lg text-teal-200 hover:bg-teal-800 hover:text-white transition"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">{navContent}</div>
      </div>

      {/* 4. Bottom Quick Nav for Mobile Phones (< md) */}
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 flex items-center justify-around py-1.5 px-2 md:hidden shadow-lg select-none">
        <button
          onClick={() => handleSelect('dashboard')}
          className={`flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium transition ${
            currentTab === 'dashboard' ? 'text-teal-700' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <LayoutDashboard className="w-5 h-5 mb-0.5" />
          <span>Home</span>
        </button>

        {permissions.includes('create_sale') && (
          <button
            onClick={() => handleSelect('pos')}
            className={`flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium transition ${
              currentTab === 'pos' ? 'text-teal-700 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShoppingCart className="w-5 h-5 mb-0.5" />
            <span>POS</span>
          </button>
        )}

        {permissions.includes('view_inventory') && (
          <button
            onClick={() => handleSelect('inventory')}
            className={`flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium relative transition ${
              currentTab === 'inventory' ? 'text-teal-700 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Boxes className="w-5 h-5 mb-0.5" />
            <span>Stock</span>
            {lowStockCount > 0 && (
              <span className="absolute top-0.5 right-1/4 w-2 h-2 bg-amber-500 rounded-full" />
            )}
          </button>
        )}

        <button
          onClick={() => handleSelect('sales')}
          className={`flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium transition ${
            currentTab === 'sales' ? 'text-teal-700' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <ReceiptText className="w-5 h-5 mb-0.5" />
          <span>Invoices</span>
        </button>

        <button
          onClick={() => {
            if (mobileOpen) {
              onMobileClose?.();
            } else {
              onMobileOpen?.();
            }
          }}
          className="flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-800"
        >
          <Menu className="w-5 h-5 mb-0.5" />
          <span>More</span>
        </button>
      </nav>
    </>
  );
};

