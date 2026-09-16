import React, { useState, useEffect } from 'react';
import {
  Paper,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Alert,
  CircularProgress,
  Switch,
} from '@mui/material';
import {
  Users,
  Shield,
  Plus,
  KeyRound,
  UserCheck,
  UserX,
  Lock,
} from 'lucide-react';
import { api } from '../services/api';
import { User, Role, PermissionKey, LicenseState } from '../types';

interface Props {
  currentUser: User;
  currentRole: Role;
  licenseState: LicenseState;
}

export const UsersView: React.FC<Props> = ({
  currentUser,
  currentRole,
  licenseState,
}) => {
  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);

  // Add User Dialog
  const [newUserOpen, setNewUserOpen] = useState(false);
  const [userForm, setUserForm] = useState({
    username: '',
    password: '',
    full_name: '',
    role_id: '',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canManageUsers = currentRole.permissions.includes('manage_users');
  const canManageRoles = currentRole.permissions.includes('manage_roles');
  const isLocked = licenseState.status === 'inactive' || licenseState.status === 'expired';

  const loadData = async () => {
    setLoading(true);
    try {
      const [u, r] = await Promise.all([api.getUsers(), api.getRoles()]);
      setUsers(u);
      setRoles(r);
      if (r.length > 0 && !userForm.role_id) {
        setUserForm((prev) => ({ ...prev, role_id: r[0].id }));
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.addUser(userForm);
      setSuccess(`User "${userForm.username}" created successfully.`);
      setNewUserOpen(false);
      setUserForm({ username: '', password: '', full_name: '', role_id: roles[0]?.id || '' });
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to create user.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleUserStatus = async (user: User) => {
    if (user.id === currentUser.id) {
      setError('You cannot deactivate your own currently active account.');
      return;
    }
    setError(null);
    try {
      const nextStatus = user.status === 'active' ? 'inactive' : 'active';
      await api.updateUser(user.id, { status: nextStatus });
      setSuccess(`User status updated to ${nextStatus}.`);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update user status.');
    }
  };

  const allAvailablePermissions: { key: PermissionKey; label: string; desc: string }[] = [
    { key: 'create_sale', label: 'Create Sale / POS', desc: 'Can operate counter POS and scan items' },
    { key: 'process_return', label: 'Process Return', desc: 'Can authorize customer returns and refunds' },
    { key: 'view_inventory', label: 'View Inventory', desc: 'Can see medicine formulations and stock levels' },
    { key: 'edit_inventory', label: 'Edit Inventory / Batches', desc: 'Can add medicines, batches, and adjustments' },
    { key: 'view_cost_price', label: 'View Cost Price & P&L', desc: 'Can see purchase costs and profit margins' },
    { key: 'manage_suppliers', label: 'Manage Suppliers', desc: 'Can add and modify vendor profiles' },
    { key: 'manage_purchases', label: 'Manage Purchases & Receive', desc: 'Can issue POs and receive shipments' },
    { key: 'view_reports', label: 'View Financial Reports', desc: 'Can view analytics, daily summaries, and turnover' },
    { key: 'manage_users', label: 'Manage Staff', desc: 'Can create and toggle employee accounts' },
    { key: 'manage_roles', label: 'Manage Role Permissions', desc: 'Can configure access control rights' },
    { key: 'verify_prescription', label: 'Verify Prescription (Rx)', desc: 'Can authorize dispensing of controlled medicines' },
    { key: 'manage_license', label: 'Manage License', desc: 'Can view and verify GitHub license credentials' },
    { key: 'manage_backup', label: 'Manage Automated Backups', desc: 'Can trigger GitHub cloud repo backups' },
    { key: 'manage_settings', label: 'Manage System Settings', desc: 'Can edit pharmacy business info' },
  ];

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto font-sans space-y-4">
      {/* Notifications */}
      {error && <Alert severity="error" className="text-xs" onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" className="text-xs" onClose={() => setSuccess(null)}>{success}</Alert>}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-teal-700" />
            Staff Accounts & Role-Based Access Control (RBAC)
          </h1>
          <p className="text-xs text-slate-500">
            Granular permissions matrix for Cashier, Pharmacist, Inventory Manager, and Admin roles.
          </p>
        </div>

        {canManageUsers && (
          <Button
            variant="contained"
            size="small"
            disabled={isLocked}
            onClick={() => setNewUserOpen(true)}
            startIcon={<Plus className="w-4 h-4" />}
            className="w-full sm:w-auto bg-teal-700 hover:bg-teal-800 text-white"
          >
            Add New Staff Member
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 px-3 py-1 flex flex-col sm:flex-row items-center justify-between gap-2">
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
          <Tab value="users" label={`Staff Accounts (${users.length})`} className="text-xs font-bold capitalize" />
          <Tab value="roles" label={`Roles & Permission Matrix (${roles.length})`} className="text-xs font-bold capitalize" />
        </Tabs>

        <Button size="small" variant="text" onClick={loadData} className="text-xs self-end sm:self-auto shrink-0">
          Refresh
        </Button>
      </div>

      {/* TAB 1: USERS */}
      {activeTab === 'users' && (
        <Paper elevation={0} className="border border-slate-200 rounded-xl overflow-hidden">
          <TableContainer className="max-h-[600px]">
            <Table size="small" stickyHeader className="min-w-[650px]">
              <TableHead>
                <TableRow className="bg-slate-50">
                  <TableCell className="font-bold text-xs text-slate-700">Full Name & Username</TableCell>
                  <TableCell className="font-bold text-xs text-slate-700">Assigned Role</TableCell>
                  <TableCell className="font-bold text-xs text-slate-700">Max Discount Allowed</TableCell>
                  <TableCell className="font-bold text-xs text-slate-700">Account Status</TableCell>
                  <TableCell className="font-bold text-xs text-slate-700">Created Date</TableCell>
                  <TableCell align="right" className="font-bold text-xs text-slate-700">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" className="py-12">
                      <CircularProgress size={24} />
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((u) => {
                    const uRole = roles.find((r) => r.id === u.role_id);
                    return (
                      <TableRow key={u.id} hover>
                        <TableCell className="text-xs">
                          <div className="font-bold text-slate-900">{u.full_name || u.username}</div>
                          <div className="text-slate-400 font-mono text-[11px]">@{u.username}</div>
                        </TableCell>
                        <TableCell className="text-xs font-semibold text-teal-800">
                          <Chip label={uRole?.name || u.role_id} size="small" className="bg-teal-50 text-teal-800 text-[10px] font-bold" />
                        </TableCell>
                        <TableCell className="text-xs text-slate-700 font-medium">
                          {uRole?.max_discount_percent ?? 0}%
                        </TableCell>
                        <TableCell>
                          {u.status === 'active' ? (
                            <Chip label="Active" size="small" className="bg-emerald-100 text-emerald-800 text-[10px] font-bold" />
                          ) : (
                            <Chip label="Inactive / Locked" size="small" className="bg-rose-100 text-rose-800 text-[10px] font-bold" />
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {new Date(u.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell align="right">
                          {canManageUsers && u.id !== currentUser.id && (
                            <Button
                              size="small"
                              variant="outlined"
                              disabled={isLocked}
                              onClick={() => handleToggleUserStatus(u)}
                              color={u.status === 'active' ? 'error' : 'success'}
                              className="text-[10px] py-0.5 px-2"
                            >
                              {u.status === 'active' ? 'Deactivate' : 'Activate'}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* TAB 2: ROLES & PERMISSION MATRIX */}
      {activeTab === 'roles' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {roles.map((role) => (
              <div key={role.id} className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm text-slate-900">{role.name}</span>
                  <span className="text-[10px] bg-teal-50 text-teal-800 font-bold px-2 py-0.5 rounded">
                    Max {role.max_discount_percent}% Disc
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-3">{role.description}</p>
                <div className="text-[11px] font-semibold text-slate-600 mb-1">
                  Active Rights: {role.permissions.length} of {allAvailablePermissions.length}
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-600 rounded-full"
                    style={{ width: `${(role.permissions.length / allAvailablePermissions.length) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Detailed Matrix Table */}
          <Paper elevation={0} className="border border-slate-200 rounded-xl overflow-hidden p-4">
            <h3 className="text-sm font-bold text-slate-800 mb-3">RBAC Access Control Matrix</h3>
            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-xs text-left min-w-[550px]">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="p-2.5">Permission Capability</th>
                    {roles.map((r) => (
                      <th key={r.id} className="p-2.5 text-center font-bold">
                        {r.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allAvailablePermissions.map((perm) => (
                    <tr key={perm.key} className="hover:bg-slate-50">
                      <td className="p-2.5">
                        <div className="font-semibold text-slate-900">{perm.label}</div>
                        <div className="text-[10px] text-slate-400">{perm.desc}</div>
                      </td>
                      {roles.map((r) => {
                        const has = r.permissions.includes(perm.key);
                        return (
                          <td key={r.id} className="p-2.5 text-center">
                            {has ? (
                              <span className="inline-block w-4 h-4 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] leading-4">
                                ✓
                              </span>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Paper>
        </div>
      )}

      {/* Add Staff Dialog */}
      <Dialog
        open={newUserOpen}
        onClose={() => setNewUserOpen(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{
          paper: {
            className: 'rounded-2xl mx-3 sm:mx-auto max-w-sm w-full',
          },
        }}
      >
        <DialogTitle className="font-bold text-slate-800 pb-2">Add New Staff Member</DialogTitle>
        <DialogContent className="pt-2 flex flex-col gap-3.5">
          <TextField
            fullWidth
            size="small"
            label="Full Name *"
            placeholder="e.g. Dr. Salman Khan"
            value={userForm.full_name}
            onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
            required
          />
          <TextField
            fullWidth
            size="small"
            label="Username (Login Handle) *"
            placeholder="e.g. salman_ph"
            value={userForm.username}
            onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
            required
          />
          <TextField
            fullWidth
            size="small"
            type="password"
            label="Temporary Password *"
            value={userForm.password}
            onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
            required
          />
          <TextField
            select
            fullWidth
            size="small"
            label="Assigned System Role *"
            value={userForm.role_id}
            onChange={(e) => setUserForm({ ...userForm, role_id: e.target.value })}
          >
            {roles.map((r) => (
              <MenuItem key={r.id} value={r.id}>
                {r.name} — {r.description}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions className="p-4 pt-0">
          <Button onClick={() => setNewUserOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            onClick={handleAddUser}
            variant="contained"
            disabled={saving || !userForm.username || !userForm.password}
            className="bg-teal-700 hover:bg-teal-800"
          >
            {saving ? <CircularProgress size={20} color="inherit" /> : 'Create Staff Member'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};
