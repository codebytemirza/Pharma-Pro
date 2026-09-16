import React, { useState } from 'react';
import { Button, Chip, CircularProgress, Typography } from '@mui/material';
import { ShieldAlert, RefreshCw, Smartphone, Key } from 'lucide-react';
import { api } from '../services/api';
import { LicenseState } from '../types';

interface Props {
  licenseState: LicenseState;
  pharmacyId: string;
  onLicenseRefreshed: (state: LicenseState) => void;
}

export const LicenseLockedBanner: React.FC<Props> = ({
  licenseState,
  pharmacyId,
  onLicenseRefreshed,
}) => {
  const [rechecking, setRechecking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const isLocked = licenseState.status === 'inactive' || licenseState.status === 'expired';

  if (!isLocked) return null;

  const handleRecheck = async () => {
    setRechecking(true);
    setMsg(null);
    try {
      const res = await api.recheckLicense();
      onLicenseRefreshed(res.license);
      if (res.license.status === 'active') {
        setMsg('License re-verified successfully! System unlocked.');
      } else {
        setMsg(`License still ${res.license.status}. Please confirm payment.`);
      }
    } catch (err: any) {
      setMsg(err.message || 'Re-check failed.');
    } finally {
      setRechecking(false);
    }
  };

  const handleSimulateActive = async () => {
    try {
      const updated = await api.simulateLicense('active', '2028-12-31');
      onLicenseRefreshed(updated);
    } catch (err: any) {
      console.error(err);
    }
  };

  return (
    <div className="bg-rose-900 text-white border-b-4 border-rose-600 shadow-xl px-4 py-3 sticky top-0 z-50 animate-in fade-in duration-200">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-rose-800 text-rose-200 shrink-0 mt-0.5">
            <ShieldAlert className="w-6 h-6 animate-pulse text-rose-300" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-base text-rose-100 uppercase tracking-wider">
                System Restricted — {licenseState.status === 'expired' ? 'License Expired' : 'License Inactive'}
              </span>
              <Chip
                label={`Pharmacy ID: ${pharmacyId}`}
                size="small"
                className="bg-rose-950 text-rose-200 font-mono text-xs border border-rose-700"
              />
              <span className="text-xs bg-rose-800 px-2 py-0.5 rounded text-rose-200">
                Read-Only Mode Active (Billing & Edits Blocked)
              </span>
            </div>

            <p className="text-sm text-rose-200 mt-1 font-medium leading-relaxed">
              License inactive. To activate, please send payment via JazzCash to{' '}
              <span className="underline decoration-amber-400 font-mono font-bold text-white bg-rose-950/80 px-1.5 py-0.5 rounded">
                03284119134
              </span>
              , then contact developer with your payment confirmation and Pharmacy ID.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto justify-start md:justify-end shrink-0">
          <Button
            variant="contained"
            size="small"
            onClick={handleRecheck}
            disabled={rechecking}
            startIcon={rechecking ? <CircularProgress size={16} color="inherit" /> : <RefreshCw className="w-4 h-4" />}
            className="flex-1 sm:flex-none bg-white text-rose-900 hover:bg-rose-100 font-bold px-3 py-1.5 text-xs shadow-md"
          >
            Re-check License
          </Button>

          {/* Developer quick unlock for tester convenience */}
          <Button
            variant="outlined"
            size="small"
            onClick={handleSimulateActive}
            startIcon={<Key className="w-3.5 h-3.5" />}
            className="flex-1 sm:flex-none border-rose-400 text-rose-200 hover:bg-rose-800 text-xs px-2 py-1.5"
            title="Dev bypass for immediate evaluation"
          >
            Dev Unlock
          </Button>
        </div>
      </div>
      {msg && (
        <div className="max-w-7xl mx-auto mt-2 text-xs text-amber-200 bg-rose-950/70 py-1 px-3 rounded">
          {msg}
        </div>
      )}
    </div>
  );
};
