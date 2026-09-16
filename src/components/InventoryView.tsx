import React, { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Alert,
  CircularProgress,
  IconButton,
} from '@mui/material';
import {
  Boxes,
  Plus,
  Search,
  Layers,
  Wrench,
  AlertTriangle,
  Barcode,
  Calendar,
  DollarSign,
  Pencil,
  Info,
} from 'lucide-react';
import { api } from '../services/api';
import { Medicine, Batch, Role, User, PharmacyInfo, LicenseState } from '../types';

interface Props {
  currentUser: User;
  currentRole: Role;
  pharmacyInfo: PharmacyInfo | null;
  licenseState: LicenseState;
}

export const InventoryView: React.FC<Props> = ({
  currentUser,
  currentRole,
  pharmacyInfo,
  licenseState,
}) => {
  const [medicines, setMedicines] = useState<(Medicine & { total_stock: number; batches: Batch[] })[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Add Medicine Dialog
  const [addMedOpen, setAddMedOpen] = useState(false);
  const [medForm, setMedForm] = useState({
    name: '',
    generic_name: '',
    category: 'Antibiotics',
    manufacturer: '',
    unit_type: 'tablet' as const,
    units_per_pack: 10,
    purchase_price: 100,
    sale_price: 130,
    tax_percent: 0,
    barcode: '',
    reorder_threshold: 15,
    requires_prescription: false,
    controlled_substance: false,
    initial_batch_number: '',
    initial_quantity: 50,
    initial_expiry_date: '',
  });

  // Batch Breakdown Modal
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [activeMedForBatches, setActiveMedForBatches] = useState<(Medicine & { batches: Batch[] }) | null>(null);

  // Add Batch Dialog
  const [newBatchOpen, setNewBatchOpen] = useState(false);
  const [newBatchForm, setNewBatchForm] = useState({
    batch_number: '',
    quantity: 30,
    expiry_date: '',
    purchase_price: 100,
  });

  // Stock Adjustment Dialog
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState({
    medicine_id: '',
    batch_id: '',
    change_qty: 0,
    type: 'damage' as 'damage' | 'theft' | 'correction' | 'expiry',
    reason: '',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canEdit = currentRole.permissions.includes('edit_inventory');
  const canViewCost = currentRole.permissions.includes('view_cost_price');
  const isLocked = licenseState.status === 'inactive' || licenseState.status === 'expired';

  const loadMedicines = async () => {
    setLoading(true);
    try {
      const data = await api.getMedicines();
      setMedicines(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMedicines();
  }, []);

  const categories = ['ALL', ...Array.from(new Set(medicines.map((m) => m.category)))];

  const filteredMedicines = medicines.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(search.toLowerCase().trim()) ||
      m.generic_name.toLowerCase().includes(search.toLowerCase().trim()) ||
      m.barcode?.toLowerCase().includes(search.toLowerCase().trim()) ||
      m.manufacturer.toLowerCase().includes(search.toLowerCase().trim());
    const matchesCategory = selectedCategory === 'ALL' || m.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Auto-generate barcode
  const handleAutoBarcode = () => {
    const code = '890' + Math.floor(100000000 + Math.random() * 900000000).toString().slice(0, 9);
    setMedForm((prev) => ({ ...prev, barcode: code }));
  };

  // Submit Add Medicine
  const handleAddMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const {
        initial_batch_number,
        initial_quantity,
        initial_expiry_date,
        ...medData
      } = medForm;

      let initialBatch = null;
      if (initial_batch_number && initial_quantity > 0 && initial_expiry_date) {
        initialBatch = {
          batch_number: initial_batch_number,
          quantity: initial_quantity,
          expiry_date: initial_expiry_date,
          purchase_price: medData.purchase_price,
        };
      }

      await api.addMedicine(medData, initialBatch);
      setSuccess(`Medicine "${medData.name}" added successfully.`);
      setAddMedOpen(false);
      loadMedicines();
    } catch (err: any) {
      setError(err.message || 'Failed to add medicine.');
    } finally {
      setSaving(false);
    }
  };

  // Submit Add Batch
  const handleAddBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMedForBatches) return;
    setError(null);
    setSaving(true);

    try {
      await api.addBatch(activeMedForBatches.id, newBatchForm);
      setSuccess(`New batch ${newBatchForm.batch_number} added.`);
      setNewBatchOpen(false);
      loadMedicines();
      // update activeMed batches
      const updated = await api.getMedicines();
      const match = updated.find((m) => m.id === activeMedForBatches.id);
      if (match) setActiveMedForBatches(match);
    } catch (err: any) {
      setError(err.message || 'Failed to add batch.');
    } finally {
      setSaving(false);
    }
  };

  // Submit Stock Adjustment
  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustForm.reason.trim()) {
      setError('Adjustment reason is mandatory for audit logging.');
      return;
    }
    setError(null);
    setSaving(true);

    try {
      await api.adjustStock(adjustForm);
      setSuccess(`Stock adjustment completed and audit logged.`);
      setAdjustOpen(false);
      loadMedicines();
    } catch (err: any) {
      setError(err.message || 'Stock adjustment failed.');
    } finally {
      setSaving(false);
    }
  };

  const openAdjustDialogForMed = (med: Medicine & { batches: Batch[] }) => {
    const firstBatch = med.batches?.[0];
    setAdjustForm({
      medicine_id: med.id,
      batch_id: firstBatch ? firstBatch.id : '',
      change_qty: -1,
      type: 'damage',
      reason: '',
    });
    setAdjustOpen(true);
  };

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto font-sans space-y-4">
      {/* Notifications */}
      {error && <Alert severity="error" className="text-xs" onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" className="text-xs" onClose={() => setSuccess(null)}>{success}</Alert>}

      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Boxes className="w-5 h-5 text-teal-700" />
            Medicine Catalog & Batch Stock
          </h1>
          <p className="text-xs text-slate-500">
            Manage drug formulations, pricing, FIFO batch tracking, and audit-logged stock adjustments.
          </p>
        </div>

        {canEdit && (
          <Button
            variant="contained"
            size="small"
            disabled={isLocked}
            onClick={() => {
              handleAutoBarcode();
              setAddMedOpen(true);
            }}
            startIcon={<Plus className="w-4 h-4" />}
            className="w-full sm:w-auto bg-teal-700 hover:bg-teal-800 text-white font-semibold"
          >
            Add New Medicine
          </Button>
        )}
      </div>

      {/* Search & Category Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-white p-3 rounded-xl border border-slate-200">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by Name, Generic, Manufacturer, Barcode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-teal-600"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-slate-500 shrink-0 font-medium">Category:</span>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 flex-1 sm:flex-none"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <Button size="small" variant="outlined" onClick={loadMedicines} className="text-xs shrink-0">
            Refresh
          </Button>
        </div>
      </div>

      {/* Medicines Table */}
      <Paper elevation={0} className="border border-slate-200 rounded-xl overflow-hidden">
        <TableContainer className="max-h-[600px]">
          <Table size="small" stickyHeader className="min-w-[850px]">
            <TableHead>
              <TableRow className="bg-slate-50">
                <TableCell className="font-bold text-xs text-slate-700">Medicine Name</TableCell>
                <TableCell className="font-bold text-xs text-slate-700">Generic & Manufacturer</TableCell>
                <TableCell className="font-bold text-xs text-slate-700">Category</TableCell>
                <TableCell className="font-bold text-xs text-slate-700">Type</TableCell>
                <TableCell className="font-bold text-xs text-slate-700">Sale Price</TableCell>
                {canViewCost && (
                  <TableCell className="font-bold text-xs text-slate-700">Cost Price</TableCell>
                )}
                <TableCell className="font-bold text-xs text-slate-700">Total Stock</TableCell>
                <TableCell className="font-bold text-xs text-slate-700">Compliance</TableCell>
                <TableCell align="right" className="font-bold text-xs text-slate-700">Batches & Adjust</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={canViewCost ? 9 : 8} align="center" className="py-12">
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : filteredMedicines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canViewCost ? 9 : 8} align="center" className="py-12 text-slate-400 text-sm">
                    No medicines match the criteria.
                  </TableCell>
                </TableRow>
              ) : (
                filteredMedicines.map((med) => {
                  const isLow = med.total_stock <= med.reorder_threshold;
                  return (
                    <TableRow key={med.id} hover>
                      <TableCell className="font-semibold text-xs text-slate-900">
                        {med.name}
                        {med.barcode && (
                          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                            <Barcode className="w-3 h-3 text-slate-400" /> {med.barcode}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        <div className="italic">{med.generic_name}</div>
                        <div className="text-[10px] text-slate-400">{med.manufacturer}</div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] text-slate-700 font-medium">
                          {med.category}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 capitalize">
                        {med.unit_type} ({med.units_per_pack}/pk)
                      </TableCell>
                      <TableCell className="font-bold text-xs text-teal-800">
                        {pharmacyInfo?.currency || 'PKR'} {med.sale_price}
                      </TableCell>
                      {canViewCost && (
                        <TableCell className="text-xs text-slate-500">
                          {pharmacyInfo?.currency || 'PKR'} {med.purchase_price}
                        </TableCell>
                      )}
                      <TableCell>
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                            med.total_stock === 0
                              ? 'bg-rose-100 text-rose-800'
                              : isLow
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {Number(med.total_stock.toFixed(2))} in stock
                        </span>
                        {isLow && med.total_stock > 0 && (
                          <div className="text-[9px] text-amber-700 font-semibold mt-0.5">
                            Below Reorder ({med.reorder_threshold})
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          {med.requires_prescription && (
                            <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 rounded w-max">
                              Rx Required
                            </span>
                          )}
                          {med.controlled_substance && (
                            <span className="text-[10px] font-bold text-rose-800 bg-rose-50 border border-rose-200 px-1.5 rounded w-max">
                              Controlled
                            </span>
                          )}
                          {!med.requires_prescription && !med.controlled_substance && (
                            <span className="text-[10px] text-slate-400">OTC</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell align="right" className="space-x-1">
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            setActiveMedForBatches(med);
                            setBatchModalOpen(true);
                          }}
                          startIcon={<Layers className="w-3.5 h-3.5" />}
                          className="text-[11px] py-0.5 px-2 border-slate-300 text-slate-700"
                        >
                          Batches ({med.batches?.length || 0})
                        </Button>
                        {canEdit && (
                          <Button
                            size="small"
                            variant="outlined"
                            disabled={isLocked}
                            onClick={() => openAdjustDialogForMed(med)}
                            startIcon={<Wrench className="w-3.5 h-3.5" />}
                            className="text-[11px] py-0.5 px-2 border-slate-300 text-slate-700"
                          >
                            Adjust
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

      {/* Add Medicine Dialog */}
      <Dialog open={addMedOpen} onClose={() => setAddMedOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle className="font-bold text-slate-800 pb-2">
          Add New Medicine Formulation
        </DialogTitle>
        <DialogContent className="pt-2">
          <form id="add-med-form" onSubmit={handleAddMedicine} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <TextField
                fullWidth
                size="small"
                label="Medicine Name"
                placeholder="e.g. Augmentin 625mg"
                value={medForm.name}
                onChange={(e) => setMedForm({ ...medForm, name: e.target.value })}
                required
              />
              <TextField
                fullWidth
                size="small"
                label="Generic / Formula Name"
                placeholder="e.g. Amoxicillin + Clavulanic"
                value={medForm.generic_name}
                onChange={(e) => setMedForm({ ...medForm, generic_name: e.target.value })}
                required
              />
              <TextField
                fullWidth
                size="small"
                label="Category"
                placeholder="e.g. Antibiotics"
                value={medForm.category}
                onChange={(e) => setMedForm({ ...medForm, category: e.target.value })}
                required
              />
              <TextField
                fullWidth
                size="small"
                label="Manufacturer / Brand"
                placeholder="e.g. GSK Pakistan"
                value={medForm.manufacturer}
                onChange={(e) => setMedForm({ ...medForm, manufacturer: e.target.value })}
                required
              />
              <TextField
                select
                fullWidth
                size="small"
                label="Unit Packaging Type"
                value={medForm.unit_type}
                onChange={(e) => setMedForm({ ...medForm, unit_type: e.target.value as any })}
              >
                <MenuItem value="tablet">Tablet</MenuItem>
                <MenuItem value="strip">Strip</MenuItem>
                <MenuItem value="bottle">Bottle</MenuItem>
                <MenuItem value="box">Box</MenuItem>
                <MenuItem value="syrup">Syrup</MenuItem>
                <MenuItem value="injection">Injection</MenuItem>
                <MenuItem value="ointment">Ointment</MenuItem>
                <MenuItem value="other">Other</MenuItem>
              </TextField>
              <TextField
                fullWidth
                size="small"
                type="number"
                label="Units Per Pack"
                value={medForm.units_per_pack}
                onChange={(e) => setMedForm({ ...medForm, units_per_pack: parseInt(e.target.value) || 1 })}
              />
              <TextField
                fullWidth
                size="small"
                type="number"
                label="Purchase Cost Price"
                value={medForm.purchase_price}
                onChange={(e) => setMedForm({ ...medForm, purchase_price: parseFloat(e.target.value) || 0 })}
                required
              />
              <TextField
                fullWidth
                size="small"
                type="number"
                label="Sale Price"
                value={medForm.sale_price}
                onChange={(e) => setMedForm({ ...medForm, sale_price: parseFloat(e.target.value) || 0 })}
                required
              />
              <div className="flex items-center gap-2">
                <TextField
                  fullWidth
                  size="small"
                  label="Barcode (Scan / Type)"
                  value={medForm.barcode}
                  onChange={(e) => setMedForm({ ...medForm, barcode: e.target.value })}
                />
                <Button size="small" variant="outlined" onClick={handleAutoBarcode} className="shrink-0 text-xs py-2">
                  Auto Gen
                </Button>
              </div>
              <TextField
                fullWidth
                size="small"
                type="number"
                label="Reorder Threshold Alert Qty"
                value={medForm.reorder_threshold}
                onChange={(e) => setMedForm({ ...medForm, reorder_threshold: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div className="flex items-center gap-6 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <FormControlLabel
                control={
                  <Checkbox
                    checked={medForm.requires_prescription}
                    onChange={(e) => setMedForm({ ...medForm, requires_prescription: e.target.checked })}
                    color="primary"
                  />
                }
                label={<span className="text-xs font-semibold text-slate-700">Requires Doctor Prescription (Rx)</span>}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={medForm.controlled_substance}
                    onChange={(e) => setMedForm({ ...medForm, controlled_substance: e.target.checked })}
                    color="error"
                  />
                }
                label={<span className="text-xs font-semibold text-rose-700">Controlled Substance (Schedule)</span>}
              />
            </div>

            {/* Optional Initial Batch */}
            <div className="p-3 bg-teal-50/60 rounded-lg border border-teal-200">
              <h4 className="text-xs font-bold text-teal-900 mb-2">Initial Batch Stock (Optional)</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <TextField
                  fullWidth
                  size="small"
                  label="Batch Number"
                  placeholder="e.g. B26-881"
                  value={medForm.initial_batch_number}
                  onChange={(e) => setMedForm({ ...medForm, initial_batch_number: e.target.value })}
                />
                {medForm.units_per_pack > 1 ? (
                  <div className="flex gap-2">
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      label={`Packs Received (${medForm.units_per_pack}s)`}
                      value={Math.floor(medForm.initial_quantity / medForm.units_per_pack)}
                      onChange={(e) => {
                        const p = parseInt(e.target.value) || 0;
                        const l = medForm.initial_quantity % medForm.units_per_pack;
                        setMedForm({ ...medForm, initial_quantity: p * medForm.units_per_pack + l });
                      }}
                    />
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      label="Loose Units"
                      value={medForm.initial_quantity % medForm.units_per_pack}
                      onChange={(e) => {
                        const p = Math.floor(medForm.initial_quantity / medForm.units_per_pack);
                        const l = parseInt(e.target.value) || 0;
                        setMedForm({ ...medForm, initial_quantity: p * medForm.units_per_pack + l });
                      }}
                    />
                  </div>
                ) : (
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    label="Quantity Received"
                    value={medForm.initial_quantity}
                    onChange={(e) => setMedForm({ ...medForm, initial_quantity: parseInt(e.target.value) || 0 })}
                  />
                )}
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="Expiry Date"
                  slotProps={{ inputLabel: { shrink: true } }}
                  value={medForm.initial_expiry_date}
                  onChange={(e) => setMedForm({ ...medForm, initial_expiry_date: e.target.value })}
                />
              </div>
            </div>
          </form>
        </DialogContent>
        <DialogActions className="p-4 pt-0">
          <Button onClick={() => setAddMedOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-med-form"
            variant="contained"
            disabled={saving}
            className="bg-teal-700 hover:bg-teal-800"
          >
            {saving ? <CircularProgress size={20} color="inherit" /> : 'Save Medicine'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Batch Breakdown Modal */}
      <Dialog open={batchModalOpen} onClose={() => setBatchModalOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle className="font-bold text-slate-800 pb-1 flex justify-between items-center">
          <div>
            <span>Batches: {activeMedForBatches?.name}</span>
            <span className="text-xs font-normal text-slate-500 ml-2">({activeMedForBatches?.generic_name})</span>
          </div>
          {canEdit && (
            <Button
              size="small"
              variant="contained"
              disabled={isLocked}
              onClick={() => {
                setNewBatchForm({
                  batch_number: `B${new Date().getFullYear().toString().slice(-2)}-${Math.floor(100 + Math.random() * 900)}`,
                  quantity: 30,
                  expiry_date: '',
                  purchase_price: activeMedForBatches?.purchase_price || 100,
                });
                setNewBatchOpen(true);
              }}
              startIcon={<Plus className="w-3.5 h-3.5" />}
              className="bg-teal-700 hover:bg-teal-800 text-xs"
            >
              Add Batch
            </Button>
          )}
        </DialogTitle>
        <DialogContent className="pt-2">
          <p className="text-xs text-slate-500 mb-3">
            Dispensing automatically pulls from the oldest unexpired batch first (FIFO). Expired batches are hard-blocked from sales for patient safety.
          </p>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="p-2.5">FIFO Priority</th>
                  <th className="p-2.5">Batch #</th>
                  <th className="p-2.5">Expiry Date</th>
                  <th className="p-2.5">Quantity Remaining</th>
                  {canViewCost && <th className="p-2.5">Batch Cost Price</th>}
                  <th className="p-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeMedForBatches?.batches?.map((batch, index) => {
                  const isExpired = new Date(batch.expiry_date).getTime() < Date.now();
                  return (
                    <tr key={batch.id} className={isExpired ? 'bg-rose-50/50' : ''}>
                      <td className="p-2.5 font-bold text-slate-500">
                        {isExpired ? '—' : `#${index + 1} Dispense Next`}
                      </td>
                      <td className="p-2.5 font-mono font-bold text-slate-800">{batch.batch_number}</td>
                      <td className="p-2.5 font-medium text-slate-700">{batch.expiry_date}</td>
                      <td className="p-2.5 font-bold text-slate-900">{Number(batch.quantity.toFixed(2))} units</td>
                      {canViewCost && (
                        <td className="p-2.5 text-slate-600">
                          {pharmacyInfo?.currency || 'PKR'} {batch.purchase_price}
                        </td>
                      )}
                      <td className="p-2.5">
                        {isExpired ? (
                          <Chip label="Expired (BLOCKED)" size="small" className="bg-rose-100 text-rose-800 text-[10px] font-bold" />
                        ) : batch.quantity === 0 ? (
                          <Chip label="Depleted" size="small" className="bg-slate-200 text-slate-600 text-[10px]" />
                        ) : (
                          <Chip label="Active" size="small" className="bg-emerald-100 text-emerald-800 text-[10px] font-semibold" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DialogContent>
        <DialogActions className="p-4 pt-0">
          <Button onClick={() => setBatchModalOpen(false)} color="inherit">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Batch Dialog */}
      <Dialog
        open={newBatchOpen}
        onClose={() => setNewBatchOpen(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{
          paper: {
            className: 'rounded-2xl mx-3 sm:mx-auto max-w-sm w-full',
          },
        }}
      >
        <DialogTitle className="font-bold text-slate-800 pb-2">Add New Batch</DialogTitle>
        <DialogContent className="pt-2 flex flex-col gap-3.5">
          <TextField
            fullWidth
            size="small"
            label="Batch Number"
            value={newBatchForm.batch_number}
            onChange={(e) => setNewBatchForm({ ...newBatchForm, batch_number: e.target.value })}
            required
          />
          {(activeMedForBatches?.units_per_pack || 1) > 1 ? (
            <div className="flex gap-2">
              <TextField
                fullWidth
                size="small"
                type="number"
                label={`Packs Received (${activeMedForBatches!.units_per_pack}s)`}
                value={Math.floor(newBatchForm.quantity / activeMedForBatches!.units_per_pack)}
                onChange={(e) => {
                  const p = parseInt(e.target.value) || 0;
                  const l = newBatchForm.quantity % activeMedForBatches!.units_per_pack;
                  setNewBatchForm({ ...newBatchForm, quantity: p * activeMedForBatches!.units_per_pack + l });
                }}
                required
              />
              <TextField
                fullWidth
                size="small"
                type="number"
                label="Loose Units Received"
                value={newBatchForm.quantity % activeMedForBatches!.units_per_pack}
                onChange={(e) => {
                  const p = Math.floor(newBatchForm.quantity / activeMedForBatches!.units_per_pack);
                  const l = parseInt(e.target.value) || 0;
                  setNewBatchForm({ ...newBatchForm, quantity: p * activeMedForBatches!.units_per_pack + l });
                }}
                required
              />
            </div>
          ) : (
            <TextField
              fullWidth
              size="small"
              type="number"
              label="Quantity Received"
              value={newBatchForm.quantity}
              onChange={(e) => setNewBatchForm({ ...newBatchForm, quantity: parseInt(e.target.value) || 0 })}
              required
            />
          )}
          <TextField
            fullWidth
            size="small"
            type="date"
            label="Expiry Date"
            slotProps={{ inputLabel: { shrink: true } }}
            value={newBatchForm.expiry_date}
            onChange={(e) => setNewBatchForm({ ...newBatchForm, expiry_date: e.target.value })}
            required
          />
          <TextField
            fullWidth
            size="small"
            type="number"
            label="Purchase Cost Price For This Batch"
            value={newBatchForm.purchase_price}
            onChange={(e) => setNewBatchForm({ ...newBatchForm, purchase_price: parseFloat(e.target.value) || 0 })}
            required
          />
        </DialogContent>
        <DialogActions className="p-4 pt-0">
          <Button onClick={() => setNewBatchOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            onClick={handleAddBatch}
            variant="contained"
            disabled={saving || !newBatchForm.batch_number || !newBatchForm.expiry_date}
            className="bg-teal-700 hover:bg-teal-800"
          >
            {saving ? <CircularProgress size={20} color="inherit" /> : 'Add Batch'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Stock Adjustment Dialog */}
      <Dialog
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{
          paper: {
            className: 'rounded-2xl mx-3 sm:mx-auto max-w-sm w-full',
          },
        }}
      >
        <DialogTitle className="font-bold text-slate-800 pb-2 flex items-center gap-2">
          <Wrench className="w-5 h-5 text-amber-600" />
          Stock Adjustment (Audit Logged)
        </DialogTitle>
        <DialogContent className="pt-2 flex flex-col gap-3.5">
          <p className="text-xs text-slate-600">
            Manual stock adjustments for damage, theft, or physical inventory corrections are recorded in the permanent audit trail.
          </p>

          <TextField
            select
            fullWidth
            size="small"
            label="Adjustment Type"
            value={adjustForm.type}
            onChange={(e) => setAdjustForm({ ...adjustForm, type: e.target.value as any })}
          >
            <MenuItem value="damage">Damage / Broken Packaging</MenuItem>
            <MenuItem value="theft">Theft / Unaccounted Loss</MenuItem>
            <MenuItem value="correction">Audit Count Correction</MenuItem>
            <MenuItem value="expiry">Expired Stock Quarantine</MenuItem>
          </TextField>

          <TextField
            fullWidth
            size="small"
            type="number"
            label="Quantity Change (+ to add, - to subtract)"
            helperText="e.g. -5 to write off 5 damaged units, or +10 for found stock"
            value={adjustForm.change_qty}
            onChange={(e) => setAdjustForm({ ...adjustForm, change_qty: parseInt(e.target.value) || 0 })}
            required
          />

          <TextField
            fullWidth
            size="small"
            multiline
            rows={2}
            label="Mandatory Reason"
            placeholder="e.g. Water leak damaged 3 boxes during monsoon"
            value={adjustForm.reason}
            onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
            required
          />

          <div className="text-[11px] text-slate-500 bg-slate-100 p-2 rounded">
            Logged User: <span className="font-semibold text-slate-700">{currentUser.username}</span>
          </div>
        </DialogContent>
        <DialogActions className="p-4 pt-0">
          <Button onClick={() => setAdjustOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            onClick={handleAdjustStock}
            variant="contained"
            color="warning"
            disabled={saving || !adjustForm.reason.trim()}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {saving ? <CircularProgress size={20} color="inherit" /> : 'Log & Apply Adjustment'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};
