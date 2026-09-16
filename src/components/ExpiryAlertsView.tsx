import React, { useState, useEffect } from 'react';
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  Tabs,
  Tab,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  CalendarClock,
  AlertTriangle,
  ShieldAlert,
  ShoppingCart,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import { api } from '../services/api';
import { PharmacyInfo } from '../types';

interface AlertItem {
  batch_id: string;
  medicine_id: string;
  medicine_name: string;
  batch_number: string;
  quantity: number;
  expiry_date: string;
  days_left: number;
  status: 'expired' | 'critical' | 'warning' | 'notice';
}

interface Props {
  pharmacyInfo: PharmacyInfo | null;
  onNavigateToPurchases?: () => void;
}

export const ExpiryAlertsView: React.FC<Props> = ({
  pharmacyInfo,
  onNavigateToPurchases,
}) => {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'expired' | 'critical' | 'warning' | 'notice'>('all');

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const data = await api.getExpiryAlerts();
      setAlerts(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, []);

  const expiredCount = alerts.filter((a) => a.status === 'expired').length;
  const criticalCount = alerts.filter((a) => a.status === 'critical').length;
  const warningCount = alerts.filter((a) => a.status === 'warning').length;
  const noticeCount = alerts.filter((a) => a.status === 'notice').length;

  const filtered = alerts.filter((a) => {
    if (activeTab === 'all') return true;
    return a.status === activeTab;
  });

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto font-sans space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-rose-700" />
            Expiry Alert & Patient Safety Engine
          </h1>
          <p className="text-xs text-slate-500">
            Multi-stage batch expiry monitoring (90/60/30/7 days). Expired stock is automatically locked out of counter billing.
          </p>
        </div>

        {onNavigateToPurchases && (
          <Button
            variant="contained"
            size="small"
            onClick={onNavigateToPurchases}
            startIcon={<ShoppingCart className="w-4 h-4" />}
            className="w-full sm:w-auto bg-teal-700 hover:bg-teal-800 text-white"
          >
            Create Purchase Order
          </Button>
        )}
      </div>

      {/* Patient Safety Notice */}
      {expiredCount > 0 && (
        <Alert
          severity="error"
          icon={<ShieldAlert className="w-5 h-5 text-rose-600" />}
          className="text-xs font-medium border border-rose-200"
        >
          <strong>Patient Safety Hard Block Active:</strong> {expiredCount} batch(es) have surpassed their expiration date.
          The POS dispensing engine automatically blocks these items from being selected or sold at any terminal counter.
        </Alert>
      )}

      {/* Tab Filter */}
      <div className="bg-white rounded-xl border border-slate-200 p-2 flex flex-col sm:flex-row items-center justify-between gap-2">
        <Tabs
          value={activeTab}
          onChange={(_, val) => setActiveTab(val)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          textColor="primary"
          indicatorColor="primary"
          className="w-full sm:w-auto min-h-[40px]"
        >
          <Tab
            value="all"
            label={`All Alerts (${alerts.length})`}
            className="text-xs font-bold capitalize min-h-[40px]"
          />
          <Tab
            value="expired"
            label={`Expired Hard-Blocked (${expiredCount})`}
            className="text-xs font-bold capitalize text-rose-700 min-h-[40px]"
          />
          <Tab
            value="critical"
            label={`≤ 7 Days (${criticalCount})`}
            className="text-xs font-bold capitalize text-amber-700 min-h-[40px]"
          />
          <Tab
            value="warning"
            label={`≤ 30 Days (${warningCount})`}
            className="text-xs font-bold capitalize min-h-[40px]"
          />
          <Tab
            value="notice"
            label={`≤ 90 Days (${noticeCount})`}
            className="text-xs font-bold capitalize min-h-[40px]"
          />
        </Tabs>

        <Button size="small" variant="outlined" onClick={loadAlerts} className="text-xs shrink-0 self-end sm:self-auto">
          Refresh
        </Button>
      </div>

      {/* Alerts Table */}
      <Paper elevation={0} className="border border-slate-200 rounded-xl overflow-hidden">
        <TableContainer className="max-h-[600px]">
          <Table size="small" stickyHeader className="min-w-[700px]">
            <TableHead>
              <TableRow className="bg-slate-50">
                <TableCell className="font-bold text-xs text-slate-700">Medicine</TableCell>
                <TableCell className="font-bold text-xs text-slate-700">Batch Number</TableCell>
                <TableCell className="font-bold text-xs text-slate-700">Remaining Quantity</TableCell>
                <TableCell className="font-bold text-xs text-slate-700">Expiry Date</TableCell>
                <TableCell className="font-bold text-xs text-slate-700">Countdown</TableCell>
                <TableCell className="font-bold text-xs text-slate-700">Dispensing Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" className="py-12">
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" className="py-12 text-slate-400 text-sm">
                    No batches match the selected expiry alert filter. All clear!
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((item) => (
                  <TableRow
                    key={item.batch_id}
                    className={item.status === 'expired' ? 'bg-rose-50/60' : item.status === 'critical' ? 'bg-amber-50/40' : ''}
                    hover
                  >
                    <TableCell className="font-semibold text-xs text-slate-900">
                      {item.medicine_name}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-bold text-slate-700">
                      {item.batch_number}
                    </TableCell>
                    <TableCell className="font-bold text-xs text-slate-900">
                      {item.quantity} units
                    </TableCell>
                    <TableCell className="font-medium text-xs text-slate-700">
                      {item.expiry_date}
                    </TableCell>
                    <TableCell>
                      {item.days_left <= 0 ? (
                        <span className="text-xs font-bold text-rose-700">
                          Expired {Math.abs(item.days_left)} day(s) ago
                        </span>
                      ) : (
                        <span
                          className={`text-xs font-semibold ${
                            item.days_left <= 7 ? 'text-amber-700' : 'text-slate-600'
                          }`}
                        >
                          {item.days_left} day(s) left
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.status === 'expired' ? (
                        <Chip
                          label="HARD BLOCKED FROM SALE"
                          size="small"
                          className="bg-rose-700 text-white font-bold text-[10px]"
                        />
                      ) : item.status === 'critical' ? (
                        <Chip
                          label="Urgent Replacement (≤ 7d)"
                          size="small"
                          className="bg-amber-100 text-amber-900 font-bold text-[10px]"
                        />
                      ) : item.status === 'warning' ? (
                        <Chip
                          label="Warning (≤ 30d)"
                          size="small"
                          className="bg-amber-50 text-amber-800 text-[10px]"
                        />
                      ) : (
                        <Chip
                          label="Notice (≤ 90d)"
                          size="small"
                          className="bg-slate-100 text-slate-700 text-[10px]"
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </div>
  );
};
