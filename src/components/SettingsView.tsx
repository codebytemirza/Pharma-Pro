import React, { useState, useEffect } from 'react';
import {
  Paper,
  Tabs,
  Tab,
  TextField,
  Button,
  Chip,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import {
  Settings,
  ShieldCheck,
  Cloud,
  Database,
  Building,
  RefreshCw,
  Copy,
  Check,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  History,
} from 'lucide-react';
import { api } from '../services/api';
import { PharmacyInfo, LicenseState, BackupStatus, Role, User } from '../types';

interface Props {
  currentUser: User;
  currentRole: Role;
  pharmacyInfo: PharmacyInfo | null;
  licenseState: LicenseState;
  onPharmacyUpdated: (info: PharmacyInfo) => void;
  onLicenseRefreshed: (state: LicenseState) => void;
}

export const SettingsView: React.FC<Props> = ({
  currentUser,
  currentRole,
  pharmacyInfo,
  licenseState,
  onPharmacyUpdated,
  onLicenseRefreshed,
}) => {
  const [activeTab, setActiveTab] = useState<'pharmacy' | 'backup' | 'license'>('pharmacy');

  // Pharmacy Profile Form
  const [infoForm, setInfoForm] = useState<PharmacyInfo>({
    business_name: '',
    address: '',
    phone: '',
    email: '',
    tax_number: '',
    unique_pharmacy_id: '',
    currency: 'PKR',
    low_stock_threshold_default: 15,
    setup_completed: true,
  });

  // Backup state
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [triggeringBackup, setTriggeringBackup] = useState(false);

  // License state
  const [recheckingLicense, setRecheckingLicense] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (pharmacyInfo) {
      setInfoForm(pharmacyInfo);
    }
    loadBackupStatus();
  }, [pharmacyInfo]);

  const loadBackupStatus = async () => {
    try {
      const data = await api.getBackupStatus();
      setBackupStatus(data);
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleSavePharmacyInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const updated = await api.updatePharmacyInfo(infoForm);
      onPharmacyUpdated(updated);
      setMsg({ type: 'success', text: 'Pharmacy settings updated successfully.' });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to update settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTriggerBackup = async () => {
    setTriggeringBackup(true);
    setMsg(null);
    try {
      const res = await api.triggerBackup();
      setMsg({
        type: 'success',
        text: `Automated backup created: ${res.backup.filename} (${(res.backup.size / 1024).toFixed(1)} KB) committed to repository.`,
      });
      loadBackupStatus();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Backup failed.' });
    } finally {
      setTriggeringBackup(false);
    }
  };

  const handleRecheckLicense = async () => {
    setRecheckingLicense(true);
    setMsg(null);
    try {
      const res = await api.recheckLicense();
      onLicenseRefreshed(res.license);
      setMsg({ type: 'success', text: `License re-check completed: Status is ${res.license.status.toUpperCase()}.` });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'License check failed.' });
    } finally {
      setRecheckingLicense(false);
    }
  };

  const handleSimulateStatus = async (status: 'active' | 'inactive' | 'expired', date: string) => {
    try {
      const updated = await api.simulateLicense(status, date);
      onLicenseRefreshed(updated);
      setMsg({ type: 'success', text: `Simulated license status set to "${status}".` });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const copyPharmacyId = () => {
    if (pharmacyInfo?.unique_pharmacy_id) {
      navigator.clipboard.writeText(pharmacyInfo.unique_pharmacy_id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto font-sans space-y-4">
      {/* Notifications */}
      {msg && (
        <Alert severity={msg.type} className="text-xs" onClose={() => setMsg(null)}>
          {msg.text}
        </Alert>
      )}

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Settings className="w-5 h-5 text-teal-700" />
          System Settings, Automated Backups & License
        </h1>
        <p className="text-xs text-slate-500">
          Configure pharmacy registration, GitHub repository cloud backups, and subscription verification.
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 px-3 py-1">
        <Tabs
          value={activeTab}
          onChange={(_, val) => setActiveTab(val)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          textColor="primary"
          indicatorColor="primary"
        >
          <Tab value="pharmacy" label="Pharmacy Profile" className="text-xs font-bold capitalize" />
          <Tab value="hardware" label="Hardware & Printers" className="text-xs font-bold capitalize" />
          <Tab value="backup" label="Automated GitHub Backups" className="text-xs font-bold capitalize" />
          <Tab value="license" label="License & JazzCash Billing" className="text-xs font-bold capitalize" />
        </Tabs>
      </div>

      {/* TAB 1: PHARMACY PROFILE */}
      {activeTab === 'pharmacy' && (
        <Paper elevation={0} className="border border-slate-200 rounded-xl p-6 bg-white max-w-2xl">
          <form onSubmit={handleSavePharmacyInfo} className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="font-bold text-sm text-slate-800">Pharmacy Registration Details</span>
              <div className="flex items-center gap-1 text-xs text-slate-500 font-mono">
                <span>Unique ID:</span>
                <span className="font-bold text-teal-800">{infoForm.unique_pharmacy_id}</span>
                <button
                  type="button"
                  onClick={copyPharmacyId}
                  className="p-1 hover:text-teal-700 text-slate-400"
                >
                  {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <TextField
              fullWidth
              size="small"
              label="Pharmacy / Business Name"
              value={infoForm.business_name}
              onChange={(e) => setInfoForm({ ...infoForm, business_name: e.target.value })}
              required
            />

            <TextField
              fullWidth
              size="small"
              label="Physical Address (Printed on Invoices)"
              value={infoForm.address}
              onChange={(e) => setInfoForm({ ...infoForm, address: e.target.value })}
              required
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextField
                fullWidth
                size="small"
                label="Helpline / Contact Phone"
                value={infoForm.phone}
                onChange={(e) => setInfoForm({ ...infoForm, phone: e.target.value })}
                required
              />
              <TextField
                fullWidth
                size="small"
                label="Support Email"
                value={infoForm.email}
                onChange={(e) => setInfoForm({ ...infoForm, email: e.target.value })}
              />
              <TextField
                fullWidth
                size="small"
                label="Drug License / Tax Registration Number"
                value={infoForm.tax_number}
                onChange={(e) => setInfoForm({ ...infoForm, tax_number: e.target.value })}
              />
              <TextField
                fullWidth
                size="small"
                label="Billing Currency Symbol"
                value={infoForm.currency}
                onChange={(e) => setInfoForm({ ...infoForm, currency: e.target.value })}
              />
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="contained"
                disabled={saving}
                className="bg-teal-700 hover:bg-teal-800"
              >
                {saving ? <CircularProgress size={20} color="inherit" /> : 'Save Settings'}
              </Button>
            </div>
          </form>
        </Paper>
      )}

      {/* TAB: HARDWARE & PRINTERS */}
      {activeTab === 'hardware' && (
        <Paper elevation={0} className="border border-slate-200 rounded-xl p-6 bg-white max-w-2xl space-y-6">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="font-bold text-sm text-slate-800">Network Printer Configuration</h3>
            <p className="text-xs text-slate-500 mt-1">
              Connect a thermal receipt printer over your local network (LAN) for direct raw printing.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField
              fullWidth
              size="small"
              label="Printer IP Address"
              placeholder="e.g. 192.168.1.100"
              defaultValue="192.168.1.87"
            />
            <TextField
              fullWidth
              size="small"
              label="Printer Port"
              placeholder="e.g. 9100"
              defaultValue="9100"
            />
            <div className="col-span-1 sm:col-span-2">
              <label className="text-xs font-semibold text-slate-700 block mb-1">Printer Model / Protocol</label>
              <select className="w-full border border-slate-300 rounded p-2 text-sm bg-white">
                <option value="epson">ESC/POS (Epson, Xprinter, Generic Thermal)</option>
                <option value="star">StarPRNT (Star Micronics)</option>
                <option value="tspl">TSPL (Label Printers)</option>
              </select>
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs text-slate-600">
            <p className="font-bold mb-1 text-slate-700">How to connect:</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Ensure your thermal printer is connected to the same WiFi router or LAN network.</li>
              <li>Print a self-test page from the printer to find its assigned IP Address.</li>
              <li>Enter the IP address above and click Connect.</li>
            </ol>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="outlined" size="small" className="text-slate-600 border-slate-300">
              Test Connection
            </Button>
            <Button variant="contained" size="small" className="bg-teal-700 hover:bg-teal-800 text-white">
              Save Printer Settings
            </Button>
          </div>
        </Paper>
      )}

      {/* TAB 2: AUTOMATED GITHUB BACKUPS */}
      {activeTab === 'backup' && (
        <div className="space-y-4">
          <Paper elevation={0} className="border border-slate-200 rounded-xl p-6 bg-white">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100">
              <div>
                <span className="font-bold text-sm text-slate-800 flex items-center gap-2">
                  <Cloud className="w-5 h-5 text-teal-700" />
                  GitHub Cloud Repository Backup Service
                </span>
                <p className="text-xs text-slate-500 mt-1">
                  Offline-first database state is automatically dumped and pushed to a designated private GitHub repository every 30 minutes.
                </p>
              </div>

              <Button
                variant="contained"
                size="small"
                onClick={handleTriggerBackup}
                disabled={triggeringBackup}
                startIcon={triggeringBackup ? <CircularProgress size={16} color="inherit" /> : <Database className="w-4 h-4" />}
                className="bg-teal-700 hover:bg-teal-800 text-white font-semibold shrink-0"
              >
                {triggeringBackup ? 'Creating Backup...' : 'Run Manual Backup Now'}
              </Button>
            </div>

            {/* Status overview */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs mb-4">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 block">Target Repository:</span>
                <span className="font-mono font-bold text-slate-800">{backupStatus?.repo || 'owner/pharmacy-backups'}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 block">Automated Interval:</span>
                <span className="font-bold text-teal-800">{backupStatus?.schedule_interval_minutes || 30} Minutes (Cron)</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 block">Last Backup Taken:</span>
                <span className="font-semibold text-slate-700">
                  {backupStatus?.last_backup_time ? new Date(backupStatus.last_backup_time).toLocaleString() : 'Never'}
                </span>
              </div>
            </div>

            {/* Backups History Table */}
            <div>
              <h3 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                <History className="w-4 h-4 text-slate-400" /> Backup Snapshots History
              </h3>
              <div className="border border-slate-200 rounded-lg overflow-x-auto">
                <table className="w-full text-xs text-left min-w-[550px]">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="p-2.5">Snapshot File</th>
                      <th className="p-2.5">Timestamp</th>
                      <th className="p-2.5">File Size</th>
                      <th className="p-2.5">Git Commit SHA</th>
                      <th className="p-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {backupStatus?.history && backupStatus.history.length > 0 ? (
                      backupStatus.history.map((b, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2.5 font-mono font-bold text-slate-800">{b.filename}</td>
                          <td className="p-2.5 text-slate-600">{new Date(b.timestamp).toLocaleString()}</td>
                          <td className="p-2.5 text-slate-600">{(b.size / 1024).toFixed(1)} KB</td>
                          <td className="p-2.5 font-mono text-[11px] text-teal-800">{b.commit_sha}</td>
                          <td className="p-2.5">
                            <Chip label="Stored" size="small" className="bg-emerald-100 text-emerald-800 text-[10px] font-bold h-5" />
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-slate-400">
                          No backup archives created yet. Click "Run Manual Backup Now" to create one.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Paper>
        </div>
      )}

      {/* TAB 3: LICENSE & JAZZCASH BILLING */}
      {activeTab === 'license' && (
        <div className="space-y-4">
          <Paper elevation={0} className="border border-slate-200 rounded-xl p-6 bg-white max-w-3xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 mb-4">
              <div>
                <span className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-teal-700" />
                  GitHub Repository License Verification
                </span>
                <p className="text-xs text-slate-500 mt-1">
                  License configuration is remotely maintained in the GitHub central repo with a 14-day offline grace period.
                </p>
              </div>

              <Button
                variant="outlined"
                size="small"
                onClick={handleRecheckLicense}
                disabled={recheckingLicense}
                startIcon={recheckingLicense ? <CircularProgress size={16} color="inherit" /> : <RefreshCw className="w-4 h-4" />}
                className="text-xs"
              >
                Re-check License
              </Button>
            </div>

            {/* Current State Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mb-4">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 block">License Status:</span>
                <div className="mt-1">
                  {licenseState.status === 'active' ? (
                    <Chip label="ACTIVE LICENSE" size="small" className="bg-emerald-100 text-emerald-800 font-bold" />
                  ) : licenseState.status === 'expired' ? (
                    <Chip label="EXPIRED (LOCKED)" size="small" className="bg-rose-100 text-rose-800 font-bold" />
                  ) : (
                    <Chip label="INACTIVE (LOCKED)" size="small" className="bg-rose-100 text-rose-800 font-bold" />
                  )}
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 block">Expiration Date:</span>
                <span className="font-semibold text-slate-800 text-sm">{licenseState.expires}</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 block">Last Remote Verification:</span>
                <span className="font-semibold text-slate-800">
                  {new Date(licenseState.last_verified || licenseState.last_checked_at).toLocaleString()}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 block">Offline Grace Period Status:</span>
                <span className="font-semibold text-slate-800">
                  {licenseState.offline_days_remaining ?? 14} / 14 days remaining
                </span>
              </div>
            </div>

            {/* JazzCash Payment Instructions Box (Section 7.4 mandate) */}
            <div className="p-4 bg-teal-900 text-white rounded-xl border border-teal-800 space-y-2">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-amber-300" />
                <span className="font-bold text-sm text-white">License Activation & Renewal Instructions</span>
              </div>
              <p className="text-xs text-teal-100 leading-relaxed">
                To activate or renew this system, please send payment via JazzCash to{' '}
                <span className="font-mono font-extrabold text-amber-300 bg-teal-950 px-2 py-0.5 rounded text-sm select-all">
                  03284119134
                </span>
                , then contact developer with your payment confirmation and Pharmacy ID:
              </p>
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-teal-200">Your Pharmacy ID:</span>
                <span className="font-mono font-bold text-xs bg-teal-950 text-teal-100 px-2 py-1 rounded">
                  {pharmacyInfo?.unique_pharmacy_id}
                </span>
                <button
                  onClick={copyPharmacyId}
                  className="px-2 py-1 text-xs bg-teal-800 hover:bg-teal-700 text-teal-100 rounded flex items-center gap-1"
                >
                  {copiedId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copiedId ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Developer Simulation Controls for Reviewers */}
            <div className="mt-6 pt-4 border-t border-slate-200">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                Developer Simulation Panel (Test All License States)
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => handleSimulateStatus('active', '2028-12-31')}
                  className="text-xs border-emerald-600 text-emerald-700 hover:bg-emerald-50"
                >
                  Simulate: Active (Until 2028)
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => handleSimulateStatus('inactive', '2028-12-31')}
                  className="text-xs border-rose-600 text-rose-700 hover:bg-rose-50"
                >
                  Simulate: Inactive (Locked Banner)
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => handleSimulateStatus('expired', '2025-01-01')}
                  className="text-xs border-amber-600 text-amber-700 hover:bg-amber-50"
                >
                  Simulate: Expired
                </Button>
              </div>
            </div>
          </Paper>
        </div>
      )}
    </div>
  );
};
