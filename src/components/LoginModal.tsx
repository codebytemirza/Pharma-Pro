import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  InputAdornment,
  Chip,
} from '@mui/material';
import { Lock, User, KeyRound, Pill, ShieldAlert } from 'lucide-react';
import { api } from '../services/api';
import { User as UserType, Role, PharmacyInfo, LicenseState } from '../types';

interface Props {
  open: boolean;
  onLoginSuccess: (user: UserType, role: Role, info: PharmacyInfo, license: LicenseState) => void;
  onCancel?: () => void;
  canCancel?: boolean;
  pharmacyInfo?: PharmacyInfo | null;
}

export const LoginModal: React.FC<Props> = ({
  open,
  onLoginSuccess,
  onCancel,
  canCancel = false,
  pharmacyInfo,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;

    setError(null);
    setLoading(true);

    try {
      const res = await api.login(username.trim(), password);
      api.setUserId(res.user.id);
      onLoginSuccess(res.user, res.role, res.pharmacy, res.license);
      setPassword('');
    } catch (err: any) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = (user: string, pass: string) => {
    setUsername(user);
    setPassword(pass);
  };

  return (
    <Dialog
      open={open}
      onClose={canCancel ? onCancel : undefined}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          className: 'rounded-2xl mx-3 sm:mx-auto max-w-sm w-full overflow-hidden shadow-2xl border border-slate-200',
        },
      }}
    >
      <div className="bg-teal-800 text-white p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-teal-700/80 mx-auto flex items-center justify-center mb-3 border border-teal-600">
          <Pill className="w-6 h-6 text-teal-200" />
        </div>
        <Typography variant="h6" className="font-bold text-white">
          {pharmacyInfo?.business_name || 'Pharmacy ERP'}
        </Typography>
        <Typography variant="caption" className="text-teal-200">
          LAN Terminal Authentication & POS Session
        </Typography>
      </div>

      <DialogContent className="p-6">
        {error && (
          <Alert
            severity="error"
            icon={<ShieldAlert className="w-5 h-5 text-rose-600" />}
            className="mb-4"
            onClose={() => setError(null)}
          >
            {error}
          </Alert>
        )}

        <form onSubmit={handleLogin} className="flex flex-col gap-5 pt-1">
          <TextField
            fullWidth
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <User className="w-4 h-4 text-slate-400" />
                  </InputAdornment>
                ),
              },
            }}
          />

          <TextField
            fullWidth
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <KeyRound className="w-4 h-4 text-slate-400" />
                  </InputAdornment>
                ),
              },
            }}
          />

          <div className="pt-1">
            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading}
              className="bg-teal-700 hover:bg-teal-800 text-white font-semibold py-2.5 shadow-sm"
            >
              {loading ? <CircularProgress size={22} color="inherit" /> : 'Log In to Terminal'}
            </Button>
          </div>

          {canCancel && onCancel && (
            <Button variant="text" fullWidth size="small" onClick={onCancel} className="text-slate-500">
              Continue as Current Session
            </Button>
          )}

          <div className="pt-3 border-t border-slate-100">
            <Typography variant="caption" className="block text-slate-500 mb-2 font-medium">
              Quick Role Testing:
            </Typography>
            <div className="flex flex-wrap gap-1.5">
              <Chip
                label="Admin"
                size="small"
                onClick={() => handleQuickDemo('admin', 'admin123')}
                className="cursor-pointer hover:bg-teal-100 text-teal-800 text-xs"
              />
              <Chip
                label="Pharmacist"
                size="small"
                onClick={() => handleQuickDemo('pharmacist', 'pharma123')}
                className="cursor-pointer hover:bg-sky-100 text-sky-800 text-xs"
              />
              <Chip
                label="Cashier"
                size="small"
                onClick={() => handleQuickDemo('cashier', 'cash123')}
                className="cursor-pointer hover:bg-emerald-100 text-emerald-800 text-xs"
              />
              <Chip
                label="Inventory Mgr"
                size="small"
                onClick={() => handleQuickDemo('inventory', 'inv123')}
                className="cursor-pointer hover:bg-amber-100 text-amber-800 text-xs"
              />
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
