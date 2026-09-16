import React, { useState, useEffect } from 'react';
import {
  Tabs,
  Tab,
  Paper,
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
} from '@mui/material';
import {
  Truck,
  Plus,
  PackageCheck,
  Building2,
  FileText,
  Calendar,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { api } from '../services/api';
import { Supplier, PurchaseOrder, Medicine, User, Role, PharmacyInfo, LicenseState } from '../types';

interface Props {
  currentUser: User;
  currentRole: Role;
  pharmacyInfo: PharmacyInfo | null;
  licenseState: LicenseState;
}

export const PurchasesView: React.FC<Props> = ({
  currentUser,
  currentRole,
  pharmacyInfo,
  licenseState,
}) => {
  const [activeTab, setActiveTab] = useState<'orders' | 'suppliers'>('orders');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(false);

  // New Supplier Dialog
  const [newSupplierOpen, setNewSupplierOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    payment_terms: 'Net 30 Days',
  });

  // New PO Dialog
  const [newPoOpen, setNewPoOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [poNotes, setPoNotes] = useState('');
  const [poLines, setPoLines] = useState<{ medicine_id: string; ordered_quantity: number; unit_cost: number }[]>([
    { medicine_id: '', ordered_quantity: 50, unit_cost: 100 },
  ]);

  // Receive Stock Dialog
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [activePoToReceive, setActivePoToReceive] = useState<PurchaseOrder | null>(null);
  const [receiptLines, setReceiptLines] = useState<
    {
      medicine_id: string;
      medicine_name: string;
      ordered_quantity: number;
      already_received: number;
      received_quantity: number;
      batch_number: string;
      expiry_date: string;
      unit_cost: number;
    }[]
  >([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canManageSuppliers = currentRole.permissions.includes('manage_suppliers');
  const canManagePurchases = currentRole.permissions.includes('manage_purchases');
  const isLocked = licenseState.status === 'inactive' || licenseState.status === 'expired';

  const loadData = async () => {
    setLoading(true);
    try {
      const [sups, pos, meds] = await Promise.all([
        api.getSuppliers(),
        api.getPurchases(),
        api.getMedicines(),
      ]);
      setSuppliers(sups);
      setPurchaseOrders(pos);
      setMedicines(meds);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Submit Supplier
  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.addSupplier(supplierForm);
      setSuccess(`Supplier "${supplierForm.name}" added successfully.`);
      setNewSupplierOpen(false);
      setSupplierForm({
        name: '',
        contact_person: '',
        phone: '',
        email: '',
        address: '',
        payment_terms: 'Net 30 Days',
      });
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to add supplier.');
    } finally {
      setSaving(false);
    }
  };

  // Add line to PO
  const addPoLine = () => {
    setPoLines([...poLines, { medicine_id: '', ordered_quantity: 30, unit_cost: 100 }]);
  };

  const removePoLine = (index: number) => {
    setPoLines(poLines.filter((_, i) => i !== index));
  };

  const updatePoLine = (index: number, field: string, value: any) => {
    const copy = [...poLines];
    copy[index] = { ...copy[index], [field]: value };
    // if medicine changed, prepopulate unit cost from medicine purchase price
    if (field === 'medicine_id') {
      const match = medicines.find((m) => m.id === value);
      if (match) {
        copy[index].unit_cost = match.purchase_price;
      }
    }
    setPoLines(copy);
  };

  // Submit PO
  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId) {
      setError('Please select a supplier.');
      return;
    }
    const validLines = poLines.filter((l) => l.medicine_id && l.ordered_quantity > 0);
    if (validLines.length === 0) {
      setError('Add at least 1 valid medicine item to the purchase order.');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await api.createPurchaseOrder({
        supplier_id: selectedSupplierId,
        items: validLines,
        notes: poNotes,
      });
      setSuccess('Purchase Order created successfully.');
      setNewPoOpen(false);
      setPoLines([{ medicine_id: '', ordered_quantity: 50, unit_cost: 100 }]);
      setSelectedSupplierId('');
      setPoNotes('');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to create PO.');
    } finally {
      setSaving(false);
    }
  };

  // Open Receive Dialog
  const openReceiveDialog = (po: PurchaseOrder) => {
    setActivePoToReceive(po);
    const dateStr = new Date();
    dateStr.setFullYear(dateStr.getFullYear() + 2);

    setReceiptLines(
      po.items.map((it, idx) => ({
        medicine_id: it.medicine_id,
        medicine_name: it.medicine_name,
        ordered_quantity: it.ordered_quantity,
        already_received: it.received_quantity,
        received_quantity: Math.max(0, it.ordered_quantity - it.received_quantity),
        batch_number: `B${new Date().getFullYear().toString().slice(-2)}-${Math.floor(100 + Math.random() * 900)}`,
        expiry_date: dateStr.toISOString().split('T')[0],
        unit_cost: it.unit_cost,
      }))
    );
    setReceiveOpen(true);
  };

  // Submit Receive Stock
  const handleReceiveStock = async () => {
    if (!activePoToReceive) return;
    setError(null);
    setSaving(true);
    try {
      const itemsToReceive = receiptLines
        .filter((l) => l.received_quantity > 0 && l.batch_number && l.expiry_date)
        .map((l) => ({
          medicine_id: l.medicine_id,
          batch_number: l.batch_number,
          expiry_date: l.expiry_date,
          received_quantity: Number(l.received_quantity),
          unit_cost: Number(l.unit_cost),
        }));

      if (itemsToReceive.length === 0) {
        setError('Please enter at least 1 received item with batch number and expiry date.');
        setSaving(false);
        return;
      }

      await api.receivePurchaseOrder(activePoToReceive.id, { items: itemsToReceive });
      setSuccess(`Physical stock received. Batch records generated and added to FIFO inventory.`);
      setReceiveOpen(false);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to receive purchase stock.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto font-sans space-y-4">
      {/* Notifications */}
      {error && <Alert severity="error" className="text-xs" onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" className="text-xs" onClose={() => setSuccess(null)}>{success}</Alert>}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Truck className="w-5 h-5 text-teal-700" />
            Purchases & Supplier Management
          </h1>
          <p className="text-xs text-slate-500">
            Create supplier orders, receive physical shipments, and generate batch records automatically.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          {canManageSuppliers && (
            <Button
              variant="outlined"
              size="small"
              disabled={isLocked}
              onClick={() => setNewSupplierOpen(true)}
              startIcon={<Building2 className="w-4 h-4" />}
              className="flex-1 sm:flex-none text-xs"
            >
              Add Supplier
            </Button>
          )}

          {canManagePurchases && (
            <Button
              variant="contained"
              size="small"
              disabled={isLocked}
              onClick={() => setNewPoOpen(true)}
              startIcon={<Plus className="w-4 h-4" />}
              className="flex-1 sm:flex-none bg-teal-700 hover:bg-teal-800 text-white"
            >
              New Purchase Order
            </Button>
          )}
        </div>
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
          <Tab value="orders" label={`Purchase Orders (${purchaseOrders.length})`} className="text-xs font-bold capitalize" />
          <Tab value="suppliers" label={`Suppliers Directory (${suppliers.length})`} className="text-xs font-bold capitalize" />
        </Tabs>

        <Button size="small" variant="text" onClick={loadData} className="text-xs self-end sm:self-auto shrink-0">
          Refresh
        </Button>
      </div>

      {/* TAB 1: PURCHASE ORDERS */}
      {activeTab === 'orders' && (
        <Paper elevation={0} className="border border-slate-200 rounded-xl overflow-hidden">
          <TableContainer className="max-h-[600px]">
            <Table size="small" stickyHeader className="min-w-[750px]">
              <TableHead>
                <TableRow className="bg-slate-50">
                  <TableCell className="font-bold text-xs text-slate-700">PO Number</TableCell>
                  <TableCell className="font-bold text-xs text-slate-700">Order Date</TableCell>
                  <TableCell className="font-bold text-xs text-slate-700">Supplier Name</TableCell>
                  <TableCell className="font-bold text-xs text-slate-700">Ordered Items</TableCell>
                  <TableCell className="font-bold text-xs text-slate-700">Total Cost</TableCell>
                  <TableCell className="font-bold text-xs text-slate-700">Fulfillment Status</TableCell>
                  <TableCell align="right" className="font-bold text-xs text-slate-700">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" className="py-12">
                      <CircularProgress size={24} />
                    </TableCell>
                  </TableRow>
                ) : purchaseOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" className="py-12 text-slate-400 text-sm">
                      No purchase orders recorded yet. Click "New Purchase Order" to start procurement.
                    </TableCell>
                  </TableRow>
                ) : (
                  purchaseOrders.map((po) => (
                    <TableRow key={po.id} hover>
                      <TableCell className="font-mono font-bold text-xs text-teal-800">
                        {po.po_number}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">{po.order_date}</TableCell>
                      <TableCell className="text-xs font-semibold text-slate-800">
                        {po.supplier_name}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {po.items.map((i) => `${i.medicine_name} (${i.received_quantity}/${i.ordered_quantity})`).join(', ')}
                      </TableCell>
                      <TableCell className="font-bold text-xs text-slate-900">
                        {pharmacyInfo?.currency || 'PKR'} {po.total_amount.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {po.status === 'received' ? (
                          <Chip label="Fully Received" size="small" className="bg-emerald-100 text-emerald-800 text-[10px] font-bold" />
                        ) : po.status === 'partially_received' ? (
                          <Chip label="Partially Received" size="small" className="bg-amber-100 text-amber-900 text-[10px] font-bold" />
                        ) : (
                          <Chip label="Ordered / Pending" size="small" className="bg-sky-100 text-sky-800 text-[10px] font-bold" />
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {canManagePurchases && po.status !== 'received' && (
                          <Button
                            size="small"
                            variant="contained"
                            disabled={isLocked}
                            onClick={() => openReceiveDialog(po)}
                            startIcon={<PackageCheck className="w-3.5 h-3.5" />}
                            className="bg-teal-700 hover:bg-teal-800 text-[11px] py-0.5 px-2"
                          >
                            Receive Stock
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* TAB 2: SUPPLIERS */}
      {activeTab === 'suppliers' && (
        <Paper elevation={0} className="border border-slate-200 rounded-xl overflow-hidden">
          <TableContainer className="max-h-[600px]">
            <Table size="small" stickyHeader className="min-w-[700px]">
              <TableHead>
                <TableRow className="bg-slate-50">
                  <TableCell className="font-bold text-xs text-slate-700">Company Name</TableCell>
                  <TableCell className="font-bold text-xs text-slate-700">Contact Person</TableCell>
                  <TableCell className="font-bold text-xs text-slate-700">Phone</TableCell>
                  <TableCell className="font-bold text-xs text-slate-700">Email</TableCell>
                  <TableCell className="font-bold text-xs text-slate-700">Address</TableCell>
                  <TableCell className="font-bold text-xs text-slate-700">Payment Terms</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {suppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" className="py-12 text-slate-400 text-sm">
                      No suppliers registered yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  suppliers.map((sup) => (
                    <TableRow key={sup.id} hover>
                      <TableCell className="font-bold text-xs text-slate-900">{sup.name}</TableCell>
                      <TableCell className="text-xs text-slate-700">{sup.contact_person}</TableCell>
                      <TableCell className="text-xs text-slate-700">{sup.phone}</TableCell>
                      <TableCell className="text-xs text-slate-500">{sup.email}</TableCell>
                      <TableCell className="text-xs text-slate-500">{sup.address}</TableCell>
                      <TableCell className="text-xs font-semibold text-slate-700">
                        <span className="bg-slate-100 px-2 py-0.5 rounded">{sup.payment_terms}</span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Add Supplier Dialog */}
      <Dialog
        open={newSupplierOpen}
        onClose={() => setNewSupplierOpen(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{
          paper: {
            className: 'rounded-2xl mx-3 sm:mx-auto max-w-sm w-full',
          },
        }}
      >
        <DialogTitle className="font-bold text-slate-800 pb-2">Add New Supplier</DialogTitle>
        <DialogContent className="pt-2 flex flex-col gap-3.5">
          <TextField
            fullWidth
            size="small"
            label="Supplier / Company Name *"
            value={supplierForm.name}
            onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
            required
          />
          <TextField
            fullWidth
            size="small"
            label="Contact Person Name *"
            value={supplierForm.contact_person}
            onChange={(e) => setSupplierForm({ ...supplierForm, contact_person: e.target.value })}
            required
          />
          <TextField
            fullWidth
            size="small"
            label="Phone Number *"
            value={supplierForm.phone}
            onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
            required
          />
          <TextField
            fullWidth
            size="small"
            label="Email Address"
            type="email"
            value={supplierForm.email}
            onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
          />
          <TextField
            fullWidth
            size="small"
            label="Physical Warehouse Address"
            value={supplierForm.address}
            onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
          />
          <TextField
            fullWidth
            size="small"
            label="Payment Terms"
            placeholder="e.g. Net 30 Days, COD"
            value={supplierForm.payment_terms}
            onChange={(e) => setSupplierForm({ ...supplierForm, payment_terms: e.target.value })}
          />
        </DialogContent>
        <DialogActions className="p-4 pt-0">
          <Button onClick={() => setNewSupplierOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            onClick={handleAddSupplier}
            variant="contained"
            disabled={saving || !supplierForm.name || !supplierForm.phone}
            className="bg-teal-700 hover:bg-teal-800"
          >
            {saving ? <CircularProgress size={20} color="inherit" /> : 'Save Supplier'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* New Purchase Order Dialog */}
      <Dialog open={newPoOpen} onClose={() => setNewPoOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle className="font-bold text-slate-800 pb-2">Create Purchase Order</DialogTitle>
        <DialogContent className="pt-2 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Select Supplier *</label>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="">-- Choose Supplier --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.contact_person})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">PO Notes</label>
              <input
                type="text"
                placeholder="e.g. Urgent delivery needed before weekend"
                value={poNotes}
                onChange={(e) => setPoNotes(e.target.value)}
                className="w-full text-xs p-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700">Order Line Items</span>
              <Button size="small" variant="outlined" onClick={addPoLine} className="text-xs py-0.5">
                + Add Another Medicine
              </Button>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="p-2 text-left">Medicine</th>
                    <th className="p-2 text-left">Quantity</th>
                    <th className="p-2 text-left">Unit Cost</th>
                    <th className="p-2 text-right">Line Total</th>
                    <th className="p-2 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {poLines.map((line, idx) => (
                    <tr key={idx}>
                      <td className="p-2">
                        <select
                          value={line.medicine_id}
                          onChange={(e) => updatePoLine(idx, 'medicine_id', e.target.value)}
                          className="w-full text-xs p-1.5 border border-slate-300 rounded bg-white"
                        >
                          <option value="">-- Select Medicine --</option>
                          {medicines.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.generic_name})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min={1}
                          value={line.ordered_quantity}
                          onChange={(e) => updatePoLine(idx, 'ordered_quantity', parseInt(e.target.value) || 1)}
                          className="w-20 p-1 border border-slate-300 rounded text-xs"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          value={line.unit_cost}
                          onChange={(e) => updatePoLine(idx, 'unit_cost', parseFloat(e.target.value) || 0)}
                          className="w-24 p-1 border border-slate-300 rounded text-xs"
                        />
                      </td>
                      <td className="p-2 text-right font-bold text-slate-800">
                        {pharmacyInfo?.currency || 'PKR'} {(line.ordered_quantity * line.unit_cost).toFixed(2)}
                      </td>
                      <td className="p-2 text-center">
                        {poLines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removePoLine(idx)}
                            className="text-slate-400 hover:text-rose-600 text-sm font-bold"
                          >
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </DialogContent>
        <DialogActions className="p-4 pt-0">
          <Button onClick={() => setNewPoOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            onClick={handleCreatePo}
            variant="contained"
            disabled={saving}
            className="bg-teal-700 hover:bg-teal-800"
          >
            {saving ? <CircularProgress size={20} color="inherit" /> : 'Issue Purchase Order'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Receive Stock Dialog (Matches PO lines & creates batch records!) */}
      <Dialog open={receiveOpen} onClose={() => setReceiveOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle className="font-bold text-slate-800 pb-1 flex items-center gap-2">
          <PackageCheck className="w-5 h-5 text-teal-700" />
          Receive Physical Stock for PO: {activePoToReceive?.po_number}
        </DialogTitle>
        <DialogContent className="pt-2 space-y-3">
          <p className="text-xs text-slate-500">
            Verify shipment package and enter physical batch numbers & expiry dates. Submitting automatically generates active FIFO batch records in inventory.
          </p>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="p-2">Medicine</th>
                  <th className="p-2">Ordered / Rec'd</th>
                  <th className="p-2">Arrived Qty</th>
                  <th className="p-2">Assigned Batch # *</th>
                  <th className="p-2">Expiry Date *</th>
                  <th className="p-2">Unit Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {receiptLines.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="p-2 font-semibold text-slate-800">{row.medicine_name}</td>
                    <td className="p-2 text-slate-500">
                      {row.ordered_quantity} / <span className="text-emerald-700">{row.already_received}</span>
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min={0}
                        value={row.received_quantity}
                        onChange={(e) => {
                          const copy = [...receiptLines];
                          copy[idx].received_quantity = parseInt(e.target.value) || 0;
                          setReceiptLines(copy);
                        }}
                        className="w-16 border border-slate-300 rounded px-1.5 py-1 text-xs"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={row.batch_number}
                        onChange={(e) => {
                          const copy = [...receiptLines];
                          copy[idx].batch_number = e.target.value;
                          setReceiptLines(copy);
                        }}
                        className="w-24 font-mono border border-slate-300 rounded px-1.5 py-1 text-xs"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="date"
                        value={row.expiry_date}
                        onChange={(e) => {
                          const copy = [...receiptLines];
                          copy[idx].expiry_date = e.target.value;
                          setReceiptLines(copy);
                        }}
                        className="border border-slate-300 rounded px-1.5 py-1 text-xs"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={row.unit_cost}
                        onChange={(e) => {
                          const copy = [...receiptLines];
                          copy[idx].unit_cost = parseFloat(e.target.value) || 0;
                          setReceiptLines(copy);
                        }}
                        className="w-20 border border-slate-300 rounded px-1.5 py-1 text-xs"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
        <DialogActions className="p-4 pt-0">
          <Button onClick={() => setReceiveOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            onClick={handleReceiveStock}
            variant="contained"
            disabled={saving}
            className="bg-teal-700 hover:bg-teal-800"
          >
            {saving ? <CircularProgress size={20} color="inherit" /> : 'Confirm Stock Intake & Create Batches'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};
