import React, { useState, useEffect, useCallback } from 'react';
import { ThemeProvider, CssBaseline, Snackbar, Alert, CircularProgress } from '@mui/material';
import { pharmacyTheme } from './theme';
import { api } from './services/api';
import { useWsSync, WsMessage } from './services/useWsSync';
import {
  User,
  Role,
  PharmacyInfo,
  LicenseState,
} from './types';
import { FirstRunSetup } from './components/FirstRunSetup';
import { LoginModal } from './components/LoginModal';
import { Navbar } from './components/Navbar';
import { Sidebar, NavTab } from './components/Sidebar';
import { LicenseLockedBanner } from './components/LicenseLockedBanner';

import { DashboardView } from './components/DashboardView';
import { PosView } from './components/PosView';
import { SalesHistoryView } from './components/SalesHistoryView';
import { InventoryView } from './components/InventoryView';
import { ExpiryAlertsView } from './components/ExpiryAlertsView';
import { PurchasesView } from './components/PurchasesView';
import { ReportsView } from './components/ReportsView';
import { UsersView } from './components/UsersView';
import { SettingsView } from './components/SettingsView';

export default function App() {
  const [initLoading, setInitLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentRole, setCurrentRole] = useState<Role | null>(null);
  const [pharmacyInfo, setPharmacyInfo] = useState<PharmacyInfo | null>(null);
  const [licenseState, setLicenseState] = useState<LicenseState>({
    status: 'active',
    licensed_to: 'Pharmacy Main Branch',
    expires: '2027-12-31',
    max_terminals: 5,
    last_checked_at: new Date().toISOString(),
    last_valid_at: new Date().toISOString(),
    last_verified: new Date().toISOString(),
    offline_days_remaining: 14,
    is_grace_period: false,
  });

  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [canCancelLogin, setCanCancelLogin] = useState(false);

  // Terminal Identifier
  const [terminalId, setTerminalId] = useState<string>(() => {
    return localStorage.getItem('pharmacy_terminal_id') || 'Terminal-1 (POS Counter A)';
  });

  // Expiry alerts & low stock indicators for sidebar badges
  const [expiryAlertCount, setExpiryAlertCount] = useState<number>(0);
  const [lowStockCount, setLowStockCount] = useState<number>(0);
  const [mobileNavOpen, setMobileNavOpen] = useState<boolean>(false);

  // Real-time toast notifications
  const [toast, setToast] = useState<{ message: string; severity: 'info' | 'success' | 'warning' } | null>(null);

  // Load badge counters
  const refreshCounters = useCallback(async () => {
    try {
      const [alerts, meds] = await Promise.all([
        api.getExpiryAlerts(),
        api.getMedicines(),
      ]);
      setExpiryAlertCount(alerts.length);
      setLowStockCount(meds.filter((m) => m.total_stock <= m.reorder_threshold).length);
    } catch {
      // non-critical
    }
  }, []);

  // Handle incoming LAN WebSocket messages
  const handleWsEvent = useCallback(
    (msg: WsMessage) => {
      switch (msg.type) {
        case 'SALE_COMPLETED':
          refreshCounters();
          if (msg.payload?.invoice_number) {
            setToast({
              message: `LAN Sync: New sale ${msg.payload.invoice_number} recorded on ${msg.payload.terminal_id || 'Counter'}. Stock decremented.`,
              severity: 'info',
            });
          }
          break;
        case 'STOCK_ADJUSTED':
          refreshCounters();
          setToast({
            message: `LAN Sync: Stock level updated across network terminals.`,
            severity: 'info',
          });
          break;
        case 'NEW_BATCH_ADDED':
          refreshCounters();
          setToast({
            message: `LAN Sync: New medicine batch received and available for dispensing.`,
            severity: 'success',
          });
          break;
        case 'LICENSE_STATUS_CHANGED':
          if (msg.payload?.license) {
            setLicenseState(msg.payload.license);
          }
          break;
        case 'BACKUP_COMPLETED':
          setToast({
            message: `Automated GitHub Cloud backup completed: ${msg.payload?.filename || 'archive'} stored.`,
            severity: 'success',
          });
          break;
      }
    },
    [refreshCounters]
  );

  const { isConnected: isWsConnected, terminalCount: terminalsCount } = useWsSync(handleWsEvent);

  const [initError, setInitError] = useState<string | null>(null);

  // Initial Boot Sequence with auto-retry
  const bootstrapSystem = async (retryCount = 0) => {
    setInitLoading(true);
    setInitError(null);
    try {
      const status = await api.getSystemStatus();
      if (!status.first_run_completed) {
        setNeedsSetup(true);
        setInitLoading(false);
        return;
      }

      setPharmacyInfo(status.pharmacy);
      setLicenseState(status.license);

      // Check current session or default to quick login
      const curUser = await api.getCurrentUser();
      if (curUser) {
        setCurrentUser(curUser.user);
        setCurrentRole(curUser.role);
        setNeedsSetup(false);
        setLoginModalOpen(false);
      } else {
        // Show login modal
        setLoginModalOpen(true);
        setCanCancelLogin(false);
      }

      refreshCounters();
      setInitLoading(false);
    } catch (err: any) {
      if (retryCount < 3) {
        setTimeout(() => {
          bootstrapSystem(retryCount + 1);
        }, 1000 * (retryCount + 1));
      } else {
        setInitError(err?.message || 'Failed to connect to local pharmacy ERP backend.');
        setInitLoading(false);
      }
    }
  };

  useEffect(() => {
    bootstrapSystem();
  }, []);

  const handleTerminalChange = (newId: string) => {
    setTerminalId(newId);
    localStorage.setItem('pharmacy_terminal_id', newId);
  };

  const handleSetupComplete = async (user: User, info: PharmacyInfo) => {
    setNeedsSetup(false);
    setPharmacyInfo(info);
    const roles = await api.getRoles();
    const adminRole = roles.find((r) => r.id === user.role_id) || roles[0];
    setCurrentUser(user);
    setCurrentRole(adminRole);
    setLoginModalOpen(false);
    refreshCounters();
  };

  const handleLoginSuccess = (
    user: User,
    role: Role,
    info: PharmacyInfo,
    license: LicenseState
  ) => {
    setCurrentUser(user);
    setCurrentRole(role);
    setPharmacyInfo(info);
    setLicenseState(license);
    setLoginModalOpen(false);

    // If role is Cashier, automatically focus on POS view for fast cashier workflow
    if (role.id === 'cashier') {
      setCurrentTab('pos');
    }

    refreshCounters();
  };

  const handleSwitchUser = () => {
    setCanCancelLogin(true);
    setLoginModalOpen(true);
  };

  const handleLogout = async () => {
    await api.logout();
    setCurrentUser(null);
    setCurrentRole(null);
    setCanCancelLogin(false);
    setLoginModalOpen(true);
  };

  if (initLoading) {
    return (
      <ThemeProvider theme={pharmacyTheme}>
        <CssBaseline />
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white">
          <CircularProgress size={40} color="primary" />
          <p className="mt-4 text-sm text-slate-300 font-medium">
            Connecting to Pharmacy ERP Local Server...
          </p>
        </div>
      </ThemeProvider>
    );
  }

  if (initError) {
    return (
      <ThemeProvider theme={pharmacyTheme}>
        <CssBaseline />
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white p-6">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md w-full text-center shadow-xl">
            <h2 className="text-lg font-bold text-red-400 mb-2">Connection Notice</h2>
            <p className="text-sm text-slate-300 mb-6">{initError}</p>
            <button
              onClick={() => bootstrapSystem(0)}
              className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg shadow cursor-pointer transition-colors"
            >
              Retry Connection
            </button>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  // 1. FIRST RUN ONBOARDING
  if (needsSetup) {
    return (
      <ThemeProvider theme={pharmacyTheme}>
        <CssBaseline />
        <FirstRunSetup onSetupComplete={handleSetupComplete} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={pharmacyTheme}>
      <CssBaseline />
      <div className="min-h-screen flex flex-col bg-slate-100 text-slate-900 font-sans antialiased">
        {/* Persistent License Lock Screen Banner */}
        <LicenseLockedBanner
          licenseState={licenseState}
          pharmacyId={pharmacyInfo?.unique_pharmacy_id || 'PHARM-DEFAULT'}
          onLicenseRefreshed={setLicenseState}
        />

        {/* Top Operational Navigation */}
        <Navbar
          user={currentUser}
          role={currentRole}
          pharmacyInfo={pharmacyInfo}
          licenseState={licenseState}
          terminalId={terminalId}
          onTerminalChange={handleTerminalChange}
          onSwitchUserClick={handleSwitchUser}
          onLogoutClick={handleLogout}
          isWsConnected={isWsConnected}
          terminalsCount={terminalsCount}
          onToggleMobileMenu={() => setMobileNavOpen((prev) => !prev)}
        />

        {/* Main Work Area */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Role-Aware Navigation Sidebar (Desktop + Mobile Drawer + Bottom Quick Nav) */}
          {currentUser && (
            <Sidebar
              currentTab={currentTab}
              onTabChange={setCurrentTab}
              role={currentRole}
              expiryAlertCount={expiryAlertCount}
              lowStockCount={lowStockCount}
              mobileOpen={mobileNavOpen}
              onMobileClose={() => setMobileNavOpen(false)}
              onMobileOpen={() => setMobileNavOpen(true)}
            />
          )}

          {/* Active Functional Module */}
          <main className="flex-1 overflow-y-auto min-h-[calc(100vh-56px)] pb-16 md:pb-0">
            {currentUser && currentRole && (
              <>
                {currentTab === 'dashboard' && (
                  <DashboardView
                    currentUser={currentUser}
                    currentRole={currentRole}
                    pharmacyInfo={pharmacyInfo}
                    licenseState={licenseState}
                    onNavigate={setCurrentTab}
                  />
                )}

                {currentTab === 'pos' && (
                  <PosView
                    currentUser={currentUser}
                    currentRole={currentRole}
                    pharmacyInfo={pharmacyInfo}
                    licenseState={licenseState}
                    terminalId={terminalId}
                    onSaleCompleted={() => {
                      refreshCounters();
                    }}
                  />
                )}

                {currentTab === 'sales' && (
                  <SalesHistoryView
                    currentUser={currentUser}
                    currentRole={currentRole}
                    pharmacyInfo={pharmacyInfo}
                  />
                )}

                {currentTab === 'inventory' && (
                  <InventoryView
                    currentUser={currentUser}
                    currentRole={currentRole}
                    pharmacyInfo={pharmacyInfo}
                    licenseState={licenseState}
                  />
                )}

                {currentTab === 'expiry' && (
                  <ExpiryAlertsView
                    pharmacyInfo={pharmacyInfo}
                    onNavigateToPurchases={() => setCurrentTab('purchases')}
                  />
                )}

                {currentTab === 'purchases' && (
                  <PurchasesView
                    currentUser={currentUser}
                    currentRole={currentRole}
                    pharmacyInfo={pharmacyInfo}
                    licenseState={licenseState}
                  />
                )}

                {currentTab === 'reports' && (
                  <ReportsView
                    currentRole={currentRole}
                    pharmacyInfo={pharmacyInfo}
                  />
                )}

                {currentTab === 'users' && (
                  <UsersView
                    currentUser={currentUser}
                    currentRole={currentRole}
                    licenseState={licenseState}
                  />
                )}

                {currentTab === 'settings' && (
                  <SettingsView
                    currentUser={currentUser}
                    currentRole={currentRole}
                    pharmacyInfo={pharmacyInfo}
                    licenseState={licenseState}
                    onPharmacyUpdated={setPharmacyInfo}
                    onLicenseRefreshed={setLicenseState}
                  />
                )}
              </>
            )}
          </main>
        </div>

        {/* Staff Login / Switch User Modal */}
        <LoginModal
          open={loginModalOpen}
          canCancel={canCancelLogin}
          onCancel={() => setLoginModalOpen(false)}
          pharmacyInfo={pharmacyInfo}
          onLoginSuccess={handleLoginSuccess}
        />

        {/* Real-time LAN Toast Alert */}
        <Snackbar
          open={!!toast}
          autoHideDuration={4000}
          onClose={() => setToast(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          {toast ? (
            <Alert
              onClose={() => setToast(null)}
              severity={toast.severity}
              variant="filled"
              className="text-xs font-medium shadow-lg"
            >
              {toast.message}
            </Alert>
          ) : undefined}
        </Snackbar>
      </div>
    </ThemeProvider>
  );
}
