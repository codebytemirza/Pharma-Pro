import React, { useState, useEffect } from 'react';
import {
  Paper,
  Tabs,
  Tab,
  Button,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
} from '@mui/material';
import {
  BarChart3,
  TrendingUp,
  Download,
  Printer,
  Calendar,
  DollarSign,
  AlertTriangle,
  Receipt,
  Layers,
} from 'lucide-react';
import { api } from '../services/api';
import { DailySummary, ProfitLossReport, TurnoverItem, Role, PharmacyInfo } from '../types';

interface Props {
  currentRole: Role;
  pharmacyInfo: PharmacyInfo | null;
}

export const ReportsView: React.FC<Props> = ({ currentRole, pharmacyInfo }) => {
  const [activeTab, setActiveTab] = useState<'daily' | 'profit' | 'turnover' | 'expiry_loss'>('daily');
  const [loading, setLoading] = useState(false);

  const [dailyData, setDailyData] = useState<DailySummary | null>(null);
  const [profitData, setProfitData] = useState<ProfitLossReport | null>(null);
  const [turnoverData, setTurnoverData] = useState<TurnoverItem[]>([]);
  const [expiryLossData, setExpiryLossData] = useState<{ total_loss_value: number; expired_batches: any[] }>({
    total_loss_value: 0,
    expired_batches: [],
  });

  const canViewCost = currentRole.permissions.includes('view_cost_price');

  const loadAllReports = async () => {
    setLoading(true);
    try {
      const [daily, profit, turnover, expiryLoss] = await Promise.all([
        api.getDailyReport(),
        api.getProfitLossReport(),
        api.getTurnoverReport(),
        api.getExpiryLossReport(),
      ]);
      setDailyData(daily);
      setProfitData(profit);
      setTurnoverData(turnover);
      setExpiryLossData(expiryLoss);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllReports();
  }, []);

  // Export active report as CSV
  const handleExportCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    if (activeTab === 'daily' && dailyData) {
      csvContent += 'Metric,Value\r\n';
      csvContent += `Date,${dailyData.date}\r\n`;
      csvContent += `Gross Revenue,${dailyData.total_revenue}\r\n`;
      csvContent += `Total Invoices,${dailyData.total_sales_count}\r\n`;
      csvContent += `Cash Collected,${dailyData.cash_total}\r\n`;
      csvContent += `Card Collected,${dailyData.card_total}\r\n`;
      csvContent += `Wallet Collected,${dailyData.wallet_total}\r\n`;
      csvContent += `Total Discounts,${dailyData.total_discounts}\r\n`;
      csvContent += `Total Tax,${dailyData.total_tax}\r\n`;
    } else if (activeTab === 'turnover') {
      csvContent += 'Medicine,Units Sold,Gross Revenue,Turnover Velocity\r\n';
      turnoverData.forEach((row) => {
        csvContent += `"${row.medicine_name}",${row.total_quantity_sold},${row.total_revenue},${row.velocity}\r\n`;
      });
    } else if (activeTab === 'profit' && profitData) {
      csvContent += 'P&L Metric,Value\r\n';
      csvContent += `Total Revenue,${profitData.total_revenue}\r\n`;
      csvContent += `Cost of Goods Sold (COGS),${profitData.cogs}\r\n`;
      csvContent += `Gross Profit,${profitData.gross_profit}\r\n`;
      csvContent += `Profit Margin %,${profitData.profit_margin_percent}%\r\n`;
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `pharmacy_report_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    document.body.classList.add('printing-report');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-report');
    }, 500);
  };

  return (
    <div id="printable-report" className="p-3 sm:p-6 max-w-7xl mx-auto font-sans space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 no-print-report">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-teal-700" />
            Financial Reports & Operational Analytics
          </h1>
          <p className="text-xs text-slate-500">
            Real-time daily reconciliation, true FIFO Cost of Goods Sold (COGS), and inventory turnover.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          <Button
            variant="outlined"
            size="small"
            onClick={handleExportCSV}
            startIcon={<Download className="w-4 h-4" />}
            className="flex-1 sm:flex-none text-xs border-slate-300 text-slate-700"
          >
            Export CSV
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={handlePrint}
            startIcon={<Printer className="w-4 h-4" />}
            className="flex-1 sm:flex-none bg-teal-700 hover:bg-teal-800 text-white text-xs"
          >
            Print Report
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 px-3 py-1 flex flex-col sm:flex-row items-center justify-between gap-2 no-print-report">
        <Tabs
          value={activeTab}
          onChange={(_, val) => setActiveTab(val)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          textColor="primary"
          indicatorColor="primary"
          className="w-full sm:w-auto"
        >
          <Tab value="daily" label="Daily Shift Summary" className="text-xs font-bold capitalize" />
          {canViewCost && (
            <Tab value="profit" label="Profit & Loss (P&L)" className="text-xs font-bold capitalize text-emerald-800" />
          )}
          <Tab value="turnover" label="Stock Turnover Velocity" className="text-xs font-bold capitalize" />
          <Tab value="expiry_loss" label="Expiry Loss Valuation" className="text-xs font-bold capitalize text-rose-800" />
        </Tabs>

        <Button size="small" variant="text" onClick={loadAllReports} className="text-xs self-end sm:self-auto shrink-0">
          Refresh Data
        </Button>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <CircularProgress size={32} />
        </div>
      ) : (
        <>
          {/* TAB 1: DAILY SUMMARY */}
          {activeTab === 'daily' && dailyData && (
            <div className="space-y-4">
              {/* Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                  <span className="text-xs font-semibold text-slate-500">Gross Sales Revenue</span>
                  <div className="text-xl font-bold text-slate-900 mt-1">
                    {pharmacyInfo?.currency || 'PKR'} {dailyData.total_revenue.toFixed(2)}
                  </div>
                  <span className="text-[11px] text-teal-700 font-medium">
                    {dailyData.total_sales_count} counter transactions
                  </span>
                </div>

                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                  <span className="text-xs font-semibold text-slate-500">Net Cash In Drawer</span>
                  <div className="text-xl font-bold text-emerald-700 mt-1">
                    {pharmacyInfo?.currency || 'PKR'} {dailyData.cash_total.toFixed(2)}
                  </div>
                  <span className="text-[11px] text-slate-400">Physical drawer reconciliation</span>
                </div>

                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                  <span className="text-xs font-semibold text-slate-500">Digital (Card & Wallet)</span>
                  <div className="text-xl font-bold text-sky-800 mt-1">
                    {pharmacyInfo?.currency || 'PKR'} {(dailyData.card_total + dailyData.wallet_total).toFixed(2)}
                  </div>
                  <span className="text-[11px] text-slate-400">Bank POS & Mobile Wallets</span>
                </div>

                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                  <span className="text-xs font-semibold text-slate-500">Total Discounts Given</span>
                  <div className="text-xl font-bold text-amber-700 mt-1">
                    {pharmacyInfo?.currency || 'PKR'} {dailyData.total_discounts.toFixed(2)}
                  </div>
                  <span className="text-[11px] text-slate-400">Controlled cashier margin</span>
                </div>
              </div>

              {/* Cashier Shift Breakdown */}
              <Paper elevation={0} className="border border-slate-200 rounded-xl overflow-hidden p-4">
                <h3 className="text-sm font-bold text-slate-800 mb-3">Shift Reconciliation by Cashier / Terminal</h3>
                <div className="border border-slate-200 rounded-lg overflow-x-auto">
                  <table className="w-full text-xs text-left min-w-[500px]">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="p-2.5">Staff / Cashier</th>
                        <th className="p-2.5">Transactions</th>
                        <th className="p-2.5 text-right">Total Amount Collected</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dailyData.sales_by_cashier && Object.keys(dailyData.sales_by_cashier).length > 0 ? (
                        Object.entries(dailyData.sales_by_cashier).map(([cashier, total]) => (
                          <tr key={cashier} className="hover:bg-slate-50">
                            <td className="p-2.5 font-bold text-slate-800">{cashier}</td>
                            <td className="p-2.5 text-slate-600">Active Shift</td>
                            <td className="p-2.5 text-right font-bold text-teal-800">
                              {pharmacyInfo?.currency || 'PKR'} {Number(total).toFixed(2)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="p-4 text-center text-slate-400">
                            No shift sales completed yet today.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Paper>
            </div>
          )}

          {/* TAB 2: PROFIT & LOSS */}
          {activeTab === 'profit' && profitData && canViewCost && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                  <span className="text-xs font-semibold text-slate-500">Gross Sales Revenue</span>
                  <div className="text-2xl font-bold text-slate-900 mt-1">
                    {pharmacyInfo?.currency || 'PKR'} {profitData.total_revenue.toFixed(2)}
                  </div>
                </div>

                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                  <span className="text-xs font-semibold text-slate-500">Cost of Goods Sold (FIFO Batch COGS)</span>
                  <div className="text-2xl font-bold text-rose-700 mt-1">
                    {pharmacyInfo?.currency || 'PKR'} {profitData.cogs.toFixed(2)}
                  </div>
                </div>

                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 shadow-sm">
                  <span className="text-xs font-semibold text-emerald-800">Gross Profit (Margin: {profitData.profit_margin_percent.toFixed(1)}%)</span>
                  <div className="text-2xl font-extrabold text-emerald-900 mt-1">
                    {pharmacyInfo?.currency || 'PKR'} {profitData.gross_profit.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Item-level Margin Table */}
              <Paper elevation={0} className="border border-slate-200 rounded-xl overflow-hidden">
                <TableContainer className="max-h-[500px]">
                  <Table size="small" stickyHeader className="min-w-[650px]">
                    <TableHead>
                      <TableRow className="bg-slate-50">
                        <TableCell className="font-bold text-xs text-slate-700">Medicine</TableCell>
                        <TableCell className="font-bold text-xs text-slate-700">Units Sold</TableCell>
                        <TableCell className="font-bold text-xs text-slate-700">Gross Revenue</TableCell>
                        <TableCell className="font-bold text-xs text-slate-700">COGS (Purchase Cost)</TableCell>
                        <TableCell className="font-bold text-xs text-slate-700">Gross Profit</TableCell>
                        <TableCell className="font-bold text-xs text-slate-700">Margin %</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {profitData.items.map((it) => (
                        <TableRow key={it.medicine_id} hover>
                          <TableCell className="font-semibold text-xs text-slate-900">
                            {it.medicine_name}
                          </TableCell>
                          <TableCell className="text-xs text-slate-700">{it.units_sold}</TableCell>
                          <TableCell className="text-xs font-semibold text-slate-800">
                            {pharmacyInfo?.currency || 'PKR'} {it.revenue.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-xs text-slate-500">
                            {pharmacyInfo?.currency || 'PKR'} {it.cost.toFixed(2)}
                          </TableCell>
                          <TableCell className="font-bold text-xs text-emerald-800">
                            {pharmacyInfo?.currency || 'PKR'} {it.profit.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <span className="text-xs font-bold text-emerald-700">
                              {it.margin_percent.toFixed(1)}%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </div>
          )}

          {/* TAB 3: INVENTORY TURNOVER */}
          {activeTab === 'turnover' && (
            <Paper elevation={0} className="border border-slate-200 rounded-xl overflow-hidden">
              <TableContainer className="max-h-[550px]">
                <Table size="small" stickyHeader className="min-w-[700px]">
                  <TableHead>
                    <TableRow className="bg-slate-50">
                      <TableCell className="font-bold text-xs text-slate-700">Medicine</TableCell>
                      <TableCell className="font-bold text-xs text-slate-700">Category</TableCell>
                      <TableCell className="font-bold text-xs text-slate-700">Current Stock</TableCell>
                      <TableCell className="font-bold text-xs text-slate-700">Units Sold</TableCell>
                      <TableCell className="font-bold text-xs text-slate-700">Sales Volume</TableCell>
                      <TableCell className="font-bold text-xs text-slate-700">Velocity Category</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {turnoverData.map((item) => (
                      <TableRow key={item.medicine_id} hover>
                        <TableCell className="font-semibold text-xs text-slate-900">
                          {item.medicine_name}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">{item.category}</TableCell>
                        <TableCell className="text-xs font-bold text-slate-800">
                          {item.current_stock}
                        </TableCell>
                        <TableCell className="text-xs text-slate-700">{item.total_quantity_sold}</TableCell>
                        <TableCell className="text-xs font-bold text-teal-800">
                          {pharmacyInfo?.currency || 'PKR'} {item.total_revenue.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {item.velocity === 'fast' ? (
                            <Chip label="Fast-Moving (High Demand)" size="small" className="bg-emerald-100 text-emerald-800 text-[10px] font-bold" />
                          ) : item.velocity === 'moderate' ? (
                            <Chip label="Moderate" size="small" className="bg-sky-100 text-sky-800 text-[10px] font-semibold" />
                          ) : (
                            <Chip label="Slow-Moving / Dead Stock" size="small" className="bg-amber-100 text-amber-900 text-[10px] font-bold" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}

          {/* TAB 4: EXPIRY LOSS */}
          {activeTab === 'expiry_loss' && (
            <div className="space-y-4">
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-rose-900 uppercase tracking-wider">
                    Total Estimated Financial Loss (Expired Inventory)
                  </span>
                  <div className="text-2xl font-extrabold text-rose-800 mt-1">
                    {pharmacyInfo?.currency || 'PKR'} {expiryLossData.total_loss_value.toFixed(2)}
                  </div>
                  <p className="text-xs text-rose-700 mt-0.5">
                    Calculated from purchase cost value of quarantined expired batches.
                  </p>
                </div>
              </div>

              <Paper elevation={0} className="border border-slate-200 rounded-xl overflow-hidden">
                <TableContainer className="max-h-[500px]">
                  <Table size="small" stickyHeader className="min-w-[700px]">
                    <TableHead>
                      <TableRow className="bg-slate-50">
                        <TableCell className="font-bold text-xs text-slate-700">Medicine</TableCell>
                        <TableCell className="font-bold text-xs text-slate-700">Batch #</TableCell>
                        <TableCell className="font-bold text-xs text-slate-700">Expiry Date</TableCell>
                        <TableCell className="font-bold text-xs text-slate-700">Expired Quantity</TableCell>
                        <TableCell className="font-bold text-xs text-slate-700">Unit Cost</TableCell>
                        <TableCell className="font-bold text-xs text-slate-700">Write-off Loss Value</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {expiryLossData.expired_batches.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} align="center" className="py-12 text-slate-400 text-sm">
                            Zero expired stock detected. Outstanding inventory hygiene!
                          </TableCell>
                        </TableRow>
                      ) : (
                        expiryLossData.expired_batches.map((b) => (
                          <TableRow key={b.batch_id} hover className="bg-rose-50/40">
                            <TableCell className="font-semibold text-xs text-slate-900">
                              {b.medicine_name}
                            </TableCell>
                            <TableCell className="font-mono text-xs font-bold text-slate-700">
                              {b.batch_number}
                            </TableCell>
                            <TableCell className="text-xs text-rose-700 font-medium">
                              {b.expiry_date}
                            </TableCell>
                            <TableCell className="text-xs font-bold text-slate-800">
                              {b.quantity}
                            </TableCell>
                            <TableCell className="text-xs text-slate-600">
                              {pharmacyInfo?.currency || 'PKR'} {b.purchase_price}
                            </TableCell>
                            <TableCell className="font-bold text-xs text-rose-800">
                              {pharmacyInfo?.currency || 'PKR'} {b.loss_value.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </div>
          )}
        </>
      )}
    </div>
  );
};
