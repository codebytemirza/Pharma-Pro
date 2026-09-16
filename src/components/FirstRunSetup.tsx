import React, { useState } from 'react';
import {
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  MenuItem,
  InputAdornment,
  CircularProgress,
} from '@mui/material';
import { ShieldCheck, Building2, User, KeyRound, Phone, Mail, MapPin } from 'lucide-react';
import { api } from '../services/api';
import { PharmacyInfo, User as UserType } from '../types';

interface Props {
  onSetupComplete: (user: UserType, info: PharmacyInfo) => void;
}

export const FirstRunSetup: React.FC<Props> = ({ onSetupComplete }) => {
  const [businessName, setBusinessName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [currency, setCurrency] = useState('PKR');

  const [adminFullName, setAdminFullName] = useState('');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPhone, setAdminPhone] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getPasswordStrength = () => {
    if (!adminPassword) return { label: 'Empty', color: 'text-slate-400', pct: 0 };
    if (adminPassword.length < 6) return { label: 'Weak (min 6 chars)', color: 'text-rose-500', pct: 30 };
    if (adminPassword.length >= 8 && /[A-Z]/.test(adminPassword) && /[0-9]/.test(adminPassword)) {
      return { label: 'Strong', color: 'text-emerald-600', pct: 100 };
    }
    return { label: 'Moderate', color: 'text-amber-500', pct: 60 };
  };

  const strength = getPasswordStrength();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!businessName.trim() || !address.trim() || !phone.trim() || !adminFullName.trim() || !adminUsername.trim() || !adminPassword) {
      setError('Please fill in all mandatory fields.');
      return;
    }

    if (adminPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    if (adminPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.setupAdmin({
        businessName: businessName.trim(),
        address: address.trim(),
        phone: phone.trim(),
        email: email.trim(),
        currency,
        adminFullName: adminFullName.trim(),
        adminUsername: adminUsername.trim(),
        adminPassword,
        adminEmail: adminEmail.trim() || email.trim(),
        adminPhone: adminPhone.trim() || phone.trim(),
      });
      onSetupComplete(res.user, res.info);
    } catch (err: any) {
      setError(err.message || 'Setup failed. Please check your inputs.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 sm:p-6 font-sans">
      <Card className="w-full max-w-2xl shadow-xl border border-slate-200">
        <div className="bg-teal-800 text-white p-6 sm:p-8 rounded-t-lg">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-teal-700 flex items-center justify-center border border-teal-600">
              <ShieldCheck className="w-6 h-6 text-teal-100" />
            </div>
            <div>
              <Typography variant="h5" className="font-bold tracking-tight text-white">
                Initial Pharmacy Setup
              </Typography>
              <Typography variant="body2" className="text-teal-200">
                First-run installation: configure your pharmacy profile & master Administrator account.
              </Typography>
            </div>
          </div>
        </div>

        <CardContent className="p-6 sm:p-8">
          {error && (
            <Alert severity="error" className="mb-6" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200">
                <Building2 className="w-5 h-5 text-teal-700" />
                <Typography variant="subtitle1" className="font-semibold text-slate-800">
                  Pharmacy Business Information
                </Typography>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextField
                  fullWidth
                  size="small"
                  label="Pharmacy / Business Name *"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Al-Shifa Care Pharmacy"
                  required
                />
                <TextField
                  fullWidth
                  size="small"
                  label="Primary Phone Number *"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 042-35890000"
                  required
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <Phone className="w-4 h-4 text-slate-400" />
                        </InputAdornment>
                      ),
                    },
                  }}
                />
                <TextField
                  fullWidth
                  size="small"
                  label="Physical Address *"
                  className="sm:col-span-2"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Shop 12, Commercial Plaza, Main Boulevard, Lahore"
                  required
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <MapPin className="w-4 h-4 text-slate-400" />
                        </InputAdornment>
                      ),
                    },
                  }}
                />
                <TextField
                  fullWidth
                  size="small"
                  label="Contact Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="pharmacy@example.com"
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <Mail className="w-4 h-4 text-slate-400" />
                        </InputAdornment>
                      ),
                    },
                  }}
                />
                <TextField
                  select
                  fullWidth
                  size="small"
                  label="Operating Currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <MenuItem value="PKR">PKR (₨ - Pakistani Rupee)</MenuItem>
                  <MenuItem value="USD">USD ($ - US Dollar)</MenuItem>
                  <MenuItem value="EUR">EUR (€ - Euro)</MenuItem>
                  <MenuItem value="GBP">GBP (£ - British Pound)</MenuItem>
                  <MenuItem value="AED">AED (د.إ - UAE Dirham)</MenuItem>
                  <MenuItem value="SAR">SAR (﷼ - Saudi Riyal)</MenuItem>
                </TextField>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200">
                <User className="w-5 h-5 text-teal-700" />
                <Typography variant="subtitle1" className="font-semibold text-slate-800">
                  Master Administrator Account (Only Admin)
                </Typography>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextField
                  fullWidth
                  size="small"
                  label="Admin Full Name *"
                  value={adminFullName}
                  onChange={(e) => setAdminFullName(e.target.value)}
                  placeholder="e.g. Dr. Muhammad Zeeshan"
                  required
                />
                <TextField
                  fullWidth
                  size="small"
                  label="Admin Username *"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  placeholder="admin"
                  required
                  helperText="Used for system login"
                />
                <div>
                  <TextField
                    fullWidth
                    size="small"
                    type="password"
                    label="Admin Password *"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
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
                  {adminPassword && (
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Strength:</span>
                      <span className={`font-medium ${strength.color}`}>{strength.label}</span>
                    </div>
                  )}
                </div>
                <TextField
                  fullWidth
                  size="small"
                  type="password"
                  label="Confirm Password *"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <TextField
                  fullWidth
                  size="small"
                  label="Admin Recovery Email"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@example.com"
                />
                <TextField
                  fullWidth
                  size="small"
                  label="Admin Recovery Phone"
                  value={adminPhone}
                  onChange={(e) => setAdminPhone(e.target.value)}
                  placeholder="0300-1234567"
                />
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="contained"
                fullWidth
                size="large"
                disabled={loading}
                className="bg-teal-700 hover:bg-teal-800 text-white font-semibold py-3"
              >
                {loading ? <CircularProgress size={24} color="inherit" /> : 'Complete Setup & Launch System'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
