import React, { useState, useEffect } from 'react';
import {
  Paper,
  Button,
  Chip,
  CircularProgress,
} from '@mui/material';
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Boxes,
  CalendarClock,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Plus,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Cloud,
} from 'lucide-react';
import { api } from '../services/api';
import {
  DailySummary,
  Medicine,
  Sale,
  User,
  Role,
  PharmacyInfo,
  LicenseState,
} from '../types';
import { NavTab } from './Sidebar';

interface Props {
  currentUser: User;
  currentRole: Role;
  pharmacyInfo: PharmacyInfo | null;
  licenseState: LicenseState;
  onNavigate: (tab: NavTab) => void;
}

export const DashboardView: React.FC<Props> = ({
  currentUser,
  currentRole,
  pharmacyInfo,
  licenseState,
  onNavigate,
}) => {
  const [dailyData, setDailyData] = useState<DailySummary | null>(null);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [expiryAlerts, setExpiryAlerts] = useState<any[]>([]);
  const [lowStockMeds, setLowStockMeds] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);

  const canCreateSale = currentRole.permissions.includes('create_sale');
  const canEditInventory = currentRole.permissions.includes('edit_inventory');
  const canManagePurchases = currentRole.permissions.includes('manage_purchases');

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [daily, sales, alerts, meds] = await Promise.all([
        api.getDailyReport(),
        api.getSales(),
        api.getExpiryAlerts(),
        api.getMedicines(),
      ]);

      setDailyData(daily);
      setRecentSales(sales.slice(0, 5));
      setExpiryAlerts(alerts.slice(0, 5));
      setLowStockMeds(meds.filter((m) => m.total_stock <= m.reorder_threshold));
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const expiredCount = expiryAlerts.filter((a) => a.status === 'expired').length;

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto font-sans space-y-4 sm:space-y-5">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">
              Welcome, {currentUser.full_name || currentUser.username}
            </h1>
            <Chip
              label={currentRole.name}
              size="small"
              className="bg-teal-50 text-teal-800 text-[10px] font-bold"
            />
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {pharmacyInfo?.business_name} • Operational Hub & Local LAN Terminal
          </p>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {canCreateSale && (
            <Button
              variant="contained"
              size="small"
              onClick={() => onNavigate('pos')}
              startIcon={<ShoppingCart className="w-4 h-4" />}
              className="bg-teal-700 hover:bg-teal-800 text-white font-semibold text-xs"
            >
              Open POS Billing
            </Button>
          )}

          {canEditInventory && (
            <Button
              variant="outlined"
              size="small"
              onClick={() => onNavigate('inventory')}
              startIcon={<Plus className="w-3.5 h-3.5" />}
              className="text-xs border-slate-300 text-slate-700"
            >
              Add Medicine
            </Button>
          )}

          {canManagePurchases && (
            <Button
              variant="outlined"
              size="small"
              onClick={() => onNavigate('purchases')}
              className="text-xs border-slate-300 text-slate-700"
            >
              Procurement
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Today's Sales */}
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">Today's Revenue</span>
            <div className="p-2 rounded-lg bg-teal-50 text-teal-700">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900 font-sans">
              {pharmacyInfo?.currency || 'PKR'} {dailyData?.total_revenue.toFixed(2) || '0.00'}
            </div>
            <div className="text-[11px] text-teal-700 font-medium mt-1">
              {dailyData?.total_sales_count || 0} counter invoices
            </div>
          </div>
        </div>

        {/* Cash in Drawer */}
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">Cash in Drawer</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-emerald-700 font-sans">
              {pharmacyInfo?.currency || 'PKR'} {dailyData?.cash_total.toFixed(2) || '0.00'}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              + {pharmacyInfo?.currency || 'PKR'} {((dailyData?.card_total || 0) + (dailyData?.wallet_total || 0)).toFixed(2)} card/wallet
            </div>
          </div>
        </div>

        {/* Expiry Alerts */}
        <div
          onClick={() => onNavigate('expiry')}
          className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between cursor-pointer hover:border-rose-300 transition"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">Expiry Alerts</span>
            <div className="p-2 rounded-lg bg-rose-50 text-rose-700">
              <CalendarClock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-rose-700 font-sans">
              {expiryAlerts.length} Batches
            </div>
            <div className="text-[11px] text-rose-600 font-medium mt-1">
              {expiredCount > 0 ? `${expiredCount} hard-blocked expired` : 'Monitored within 90 days'}
            </div>
          </div>
        </div>

        {/* Low Stock Watch */}
        <div
          onClick={() => onNavigate('inventory')}
          className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between cursor-pointer hover:border-amber-300 transition"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">Low Stock Alert</span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-700 font-sans">
              {lowStockMeds.length} Medicines
            </div>
            <div className="text-[11px] text-amber-700 font-medium mt-1">
              Below reorder threshold
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Section: Recent Invoices & Expiry Watchlist */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Invoices */}
        <Paper elevation={0} className="border border-slate-200 rounded-xl p-4 bg-white flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-teal-700" />
                Recent Sales Invoices
              </span>
              <button
                onClick={() => onNavigate('sales')}
                className="text-xs text-teal-700 hover:text-teal-900 font-medium flex items-center gap-1"
              >
                View all <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-xs text-left min-w-[340px]">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-2">Invoice #</th>
                    <th className="p-2">Time</th>
                    <th className="p-2">Cashier</th>
                    <th className="p-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentSales.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-slate-400">
                        No transactions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    recentSales.map((sale) => (
                      <tr key={sale.id} className="hover:bg-slate-50">
                        <td className="p-2 font-mono font-bold text-teal-800">{sale.invoice_number}</td>
                        <td className="p-2 text-slate-500 whitespace-nowrap">
                          {new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="p-2 text-slate-700 whitespace-nowrap">{sale.cashier_name}</td>
                        <td className="p-2 text-right font-bold text-slate-900 whitespace-nowrap">
                          {pharmacyInfo?.currency || 'PKR'} {sale.total.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Paper>

        {/* Expiry Attention Queue */}
        <Paper elevation={0} className="border border-slate-200 rounded-xl p-4 bg-white flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-rose-700" />
                Immediate Expiry Attention
              </span>
              <button
                onClick={() => onNavigate('expiry')}
                className="text-xs text-rose-700 hover:text-rose-900 font-medium flex items-center gap-1"
              >
                View all <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-xs text-left min-w-[340px]">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-2">Medicine</th>
                    <th className="p-2">Batch</th>
                    <th className="p-2">Days Left</th>
                    <th className="p-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expiryAlerts.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-slate-400">
                        All batches in healthy date range.
                      </td>
                    </tr>
                  ) : (
                    expiryAlerts.map((b) => (
                      <tr key={b.batch_id} className="hover:bg-slate-50">
                        <td className="p-2 font-medium text-slate-900">{b.medicine_name}</td>
                        <td className="p-2 font-mono text-slate-600">{b.batch_number}</td>
                        <td className="p-2 font-semibold">
                          {b.days_left <= 0 ? (
                            <span className="text-rose-700">Expired</span>
                          ) : (
                            <span className="text-amber-700">{b.days_left}d left</span>
                          )}
                        </td>
                        <td className="p-2 text-right">
                          {b.status === 'expired' ? (
                            <Chip label="BLOCKED" size="small" className="bg-rose-700 text-white text-[9px] font-bold h-4" />
                          ) : (
                            <Chip label="Attention" size="small" className="bg-amber-100 text-amber-900 text-[9px] font-semibold h-4" />
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Paper>
      </div>
    </div>
  );
};
