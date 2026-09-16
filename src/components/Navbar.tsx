import React, { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  RadioGroup,
  FormControlLabel,
  Radio,
  Menu,
  MenuItem,
  Divider,
} from '@mui/material';
import {
  Pill,
  Wifi,
  WifiOff,
  Monitor,
  LogOut,
  Users,
  ShieldAlert,
  ShieldCheck,
  Menu as MenuIcon,
  ChevronDown,
  User as UserIcon,
} from 'lucide-react';
import { User, Role, PharmacyInfo, LicenseState } from '../types';

interface Props {
  user: User | null;
  role: Role | null;
  pharmacyInfo: PharmacyInfo | null;
  licenseState: LicenseState;
  terminalId: string;
  onTerminalChange: (id: string) => void;
  onSwitchUserClick: () => void;
  onLogoutClick: () => void;
  isWsConnected: boolean;
  terminalsCount: number;
  onToggleMobileMenu?: () => void;
}

export const Navbar: React.FC<Props> = ({
  user,
  role,
  pharmacyInfo,
  licenseState,
  terminalId,
  onTerminalChange,
  onSwitchUserClick,
  onLogoutClick,
  isWsConnected,
  terminalsCount,
  onToggleMobileMenu,
}) => {
  const [terminalModalOpen, setTerminalModalOpen] = useState(false);
  const [selectedTerminal, setSelectedTerminal] = useState(terminalId);
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);

  const handleSaveTerminal = () => {
    onTerminalChange(selectedTerminal);
    setTerminalModalOpen(false);
  };

  const isLocked = licenseState.status === 'inactive' || licenseState.status === 'expired';

  return (
    <>
      <AppBar position="sticky" elevation={1} className="bg-teal-900 border-b border-teal-800 text-white z-40">
        <Toolbar className="min-h-[52px] sm:min-h-[56px] px-2 sm:px-4 flex items-center justify-between gap-1.5 sm:gap-2">
          {/* Brand & Mobile Hamburger */}
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            {onToggleMobileMenu && (
              <button
                onClick={onToggleMobileMenu}
                className="p-1.5 rounded-lg text-teal-200 hover:bg-teal-800 hover:text-white lg:hidden transition shrink-0"
                aria-label="Toggle navigation menu"
              >
                <MenuIcon className="w-5 h-5" />
              </button>
            )}

            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-teal-800 flex items-center justify-center border border-teal-700 shadow-inner shrink-0">
              <Pill className="w-4 h-4 sm:w-5 sm:h-5 text-teal-300" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Typography
                  variant="subtitle1"
                  className="font-bold tracking-tight text-white leading-tight truncate text-xs sm:text-sm md:text-base max-w-[190px] sm:max-w-none"
                >
                  {pharmacyInfo?.business_name || 'Pharmacy ERP'}
                </Typography>
                <Chip
                  label="LAN Server"
                  size="small"
                  className="hidden sm:inline-flex bg-teal-800 text-teal-200 text-[10px] h-4.5 font-semibold"
                />
              </div>
              <Typography variant="caption" className="text-teal-300 hidden sm:flex items-center gap-1.5 text-xs truncate">
                <span>{pharmacyInfo?.address?.slice(0, 24) || 'Offline-First'}</span>
                <span>•</span>
                <span className="font-mono text-teal-200">{pharmacyInfo?.unique_pharmacy_id}</span>
              </Typography>
            </div>
          </div>

          {/* Status Indicators & Operational Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* LAN Sync Status */}
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${
                isWsConnected
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60'
                  : 'bg-amber-950/60 text-amber-300 border-amber-700/60'
              }`}
              title={`LAN Sync: ${terminalsCount} active terminals`}
            >
              {isWsConnected ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="hidden md:inline">LAN Sync ({terminalsCount})</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="hidden md:inline">Connecting</span>
                </>
              )}
            </div>

            {/* Terminal Switcher (Desktop/Tablet) */}
            <button
              onClick={() => setTerminalModalOpen(true)}
              className="hidden sm:flex items-center gap-1 px-2 py-1 rounded bg-teal-800 hover:bg-teal-700 text-teal-100 text-xs border border-teal-700 transition"
              title="Configure current physical counter / terminal identifier"
            >
              <Monitor className="w-3.5 h-3.5 text-teal-300 shrink-0" />
              <span className="font-medium truncate max-w-[110px] md:max-w-[150px]">{terminalId}</span>
            </button>

            {/* License Status Chip */}
            {isLocked ? (
              <Chip
                icon={<ShieldAlert className="w-3 h-3 text-rose-300" />}
                label={<span className="hidden xs:inline">Locked</span>}
                size="small"
                className="bg-rose-900 text-rose-200 text-xs font-semibold border border-rose-700"
              />
            ) : licenseState.is_grace_period ? (
              <Chip
                label="Grace"
                size="small"
                className="bg-amber-900 text-amber-200 text-xs font-semibold"
              />
            ) : (
              <Chip
                icon={<ShieldCheck className="w-3 h-3 text-emerald-300" />}
                label={<span className="hidden xs:inline">Licensed</span>}
                size="small"
                className="bg-emerald-950 text-emerald-300 text-xs font-semibold border border-emerald-800"
              />
            )}

            {/* User Controls: Full view on md+, Compact menu on mobile */}
            {user && (
              <>
                {/* Desktop view (md+) */}
                <div className="hidden md:flex items-center gap-1.5 pl-2 border-l border-teal-800">
                  <div className="text-right mr-1">
                    <div className="text-xs font-semibold text-white leading-none truncate max-w-[120px]">
                      {user.full_name || user.username}
                    </div>
                    <div className="text-[10px] text-teal-300 capitalize">{role?.name}</div>
                  </div>

                  <Button
                    size="small"
                    variant="outlined"
                    onClick={onSwitchUserClick}
                    startIcon={<Users className="w-3.5 h-3.5" />}
                    className="border-teal-700 text-teal-200 hover:bg-teal-800 hover:text-white text-xs px-2 py-1 normal-case shrink-0"
                    title="Switch cashier / staff without clearing terminal cart"
                  >
                    Switch
                  </Button>

                  <button
                    onClick={onLogoutClick}
                    className="p-1.5 rounded hover:bg-teal-800 text-teal-300 hover:text-rose-300 transition shrink-0"
                    title="Log out"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>

                {/* Mobile / Tablet Compact User Dropdown Trigger (< md) */}
                <button
                  onClick={(e) => setUserMenuAnchor(e.currentTarget)}
                  className="flex md:hidden items-center gap-1 p-1 rounded-lg bg-teal-800 hover:bg-teal-700 text-white border border-teal-700"
                  aria-label="User actions"
                >
                  <div className="w-6 h-6 rounded-full bg-teal-700 flex items-center justify-center text-teal-200 text-xs font-bold">
                    {(user.full_name || user.username).charAt(0).toUpperCase()}
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-teal-300" />
                </button>

                {/* Mobile User Dropdown Menu */}
                <Menu
                  anchorEl={userMenuAnchor}
                  open={Boolean(userMenuAnchor)}
                  onClose={() => setUserMenuAnchor(null)}
                  className="md:hidden mt-1"
                  slotProps={{
                    paper: {
                      className: 'rounded-xl shadow-xl border border-slate-200 min-w-[200px] p-1',
                    },
                  }}
                >
                  <div className="px-3 py-2 bg-slate-50 rounded-lg mb-1">
                    <div className="text-xs font-bold text-slate-800">{user.full_name || user.username}</div>
                    <div className="text-[11px] text-teal-700 font-medium capitalize">{role?.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">{terminalId}</div>
                  </div>

                  <MenuItem
                    onClick={() => {
                      setUserMenuAnchor(null);
                      setTerminalModalOpen(true);
                    }}
                    className="text-xs py-2 gap-2 text-slate-700"
                  >
                    <Monitor className="w-4 h-4 text-teal-700" />
                    Change Terminal
                  </MenuItem>

                  <MenuItem
                    onClick={() => {
                      setUserMenuAnchor(null);
                      onSwitchUserClick();
                    }}
                    className="text-xs py-2 gap-2 text-slate-700"
                  >
                    <Users className="w-4 h-4 text-teal-700" />
                    Switch User
                  </MenuItem>

                  <Divider className="my-1" />

                  <MenuItem
                    onClick={() => {
                      setUserMenuAnchor(null);
                      onLogoutClick();
                    }}
                    className="text-xs py-2 gap-2 text-rose-600 hover:bg-rose-50"
                  >
                    <LogOut className="w-4 h-4 text-rose-600" />
                    Log Out
                  </MenuItem>
                </Menu>
              </>
            )}
          </div>
        </Toolbar>
      </AppBar>

      {/* Terminal Identifier Selection Dialog */}
      <Dialog open={terminalModalOpen} onClose={() => setTerminalModalOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle className="font-bold text-slate-800 pb-2 text-base sm:text-lg">
          Select Physical Terminal / Counter
        </DialogTitle>
        <DialogContent className="pt-2">
          <Typography variant="body2" className="text-slate-600 mb-4 text-xs sm:text-sm">
            In a multi-terminal pharmacy setup, select which counter this device represents for transaction audit and stock syncing:
          </Typography>

          <RadioGroup value={selectedTerminal} onChange={(e) => setSelectedTerminal(e.target.value)}>
            <FormControlLabel value="Terminal-1 (POS Counter A)" control={<Radio size="small" />} label={<span className="text-xs sm:text-sm">Terminal-1 (POS Counter A - Main)</span>} />
            <FormControlLabel value="Terminal-2 (POS Counter B)" control={<Radio size="small" />} label={<span className="text-xs sm:text-sm">Terminal-2 (POS Counter B - Secondary)</span>} />
            <FormControlLabel value="Terminal-3 (Inventory Desk)" control={<Radio size="small" />} label={<span className="text-xs sm:text-sm">Terminal-3 (Inventory & Purchase Desk)</span>} />
            <FormControlLabel value="Terminal-4 (Pharmacist Verification)" control={<Radio size="small" />} label={<span className="text-xs sm:text-sm">Terminal-4 (Pharmacist Verification Desk)</span>} />
            <FormControlLabel value="Terminal-Admin (Manager Office)" control={<Radio size="small" />} label={<span className="text-xs sm:text-sm">Terminal-Admin (Manager / Back Office)</span>} />
          </RadioGroup>
        </DialogContent>
        <DialogActions className="p-4 pt-0">
          <Button onClick={() => setTerminalModalOpen(false)} color="inherit" size="small">
            Cancel
          </Button>
          <Button onClick={handleSaveTerminal} variant="contained" size="small" className="bg-teal-700 hover:bg-teal-800">
            Set Terminal
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

