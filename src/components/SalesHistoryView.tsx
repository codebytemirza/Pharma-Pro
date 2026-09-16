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
  TextField,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Search,
  Receipt,
  RotateCcw,
  Printer,
  Calendar,
  User,
  DollarSign,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { api } from '../services/api';
import { Sale, SaleReturn, User as UserType, Role, PharmacyInfo } from '../types';

interface Props {
  currentUser: UserType;
  currentRole: Role;
  pharmacyInfo: PharmacyInfo | null;
}

export const SalesHistoryView: React.FC<Props> = ({
  currentUser,
  currentRole,
  pharmacyInfo,
}) => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Details Modal
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Return Modal
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnItems, setReturnItems] = useState<
    { medicine_id: string; batch_id: string; medicine_name: string; returnQty: number; maxQty: number; unit_price: number }[]
  >([]);
  const [returnReason, setReturnReason] = useState('');
  const [submittingReturn, setSubmittingReturn] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);
  const [returnSuccess, setReturnSuccess] = useState<string | null>(null);

  const canReturn = currentRole.permissions.includes('process_return');

  const loadSales = async () => {
    setLoading(true);
    try {
      const data = await api.getSales();
      setSales(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSales();
  }, []);

  const filteredSales = sales.filter((s) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      s.invoice_number.toLowerCase().includes(q) ||
      s.cashier_name.toLowerCase().includes(q) ||
      (s.customer_name && s.customer_name.toLowerCase().includes(q))
    );
  });

  const handleOpenDetails = (sale: Sale) => {
    setSelectedSale(sale);
    setDetailsOpen(true);
  };

  const handleOpenReturnModal = (sale: Sale) => {
    setSelectedSale(sale);
    setReturnReason('');
    setReturnError(null);
    setReturnSuccess(null);
    setReturnItems(
      sale.items.map((it) => ({
        medicine_id: it.medicine_id,
        batch_id: it.batch_id,
        medicine_name: it.medicine_name,
        returnQty: 0,
        maxQty: it.quantity,
        unit_price: it.unit_price,
      }))
    );
    setReturnModalOpen(true);
  };

  const handleQuantityChange = (idx: number, qty: number) => {
    setReturnItems((prev) => {
      const copy = [...prev];
      copy[idx] = {
        ...copy[idx],
        returnQty: Math.min(Math.max(0, qty), copy[idx].maxQty),
      };
      return copy;
    });
  };

  const calculateTotalRefund = () => {
    return returnItems.reduce((sum, it) => sum + it.returnQty * it.unit_price, 0);
  };

  const handleProcessReturn = async () => {
    if (!selectedSale) return;
    setReturnError(null);

    const itemsToReturn = returnItems
      .filter((it) => it.returnQty > 0)
      .map((it) => ({
        medicine_id: it.medicine_id,
        batch_id: it.batch_id,
        quantity: it.returnQty,
        refund_amount: it.returnQty * it.unit_price,
      }));

    if (itemsToReturn.length === 0) {
      setReturnError('Please select at least 1 item and quantity to return.');
      return;
    }

    if (!returnReason.trim()) {
      setReturnError('Return reason is mandatory for audit trail compliance.');
      return;
    }

    setSubmittingReturn(true);
    try {
      const res = await api.processReturn({
        sale_id: selectedSale.id,
        items: itemsToReturn,
        reason: returnReason.trim(),
      });
      setReturnSuccess(`Return ${res.return_number} processed. Refund: ${pharmacyInfo?.currency || 'PKR'} ${res.total_refund}. Stock restored.`);
      loadSales();
      setTimeout(() => {
        setReturnModalOpen(false);
      }, 1500);
    } catch (err: any) {
      setReturnError(err.message || 'Failed to process return.');
    } finally {
      setSubmittingReturn(false);
    }
  };

  const handlePrint = () => {
    document.body.classList.add('printing-receipt');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-receipt');
    }, 500);
  };

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto font-sans space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Receipt className="w-5 h-5 text-teal-700" />
            Invoices & Sales History
          </h1>
          <p className="text-xs text-slate-500">
            View completed counter transactions, reprint receipts, and process authorized returns.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search Invoice #, Cashier, Customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-teal-600"
            />
          </div>
          <Button size="small" variant="outlined" onClick={loadSales} className="text-xs shrink-0">
            Refresh
          </Button>
        </div>
      </div>

      {/* Invoices Table */}
      <Paper elevation={0} className="border border-slate-200 rounded-xl overflow-hidden">
        <TableContainer className="max-h-[600px]">
          <Table size="small" stickyHeader className="min-w-[750px]">
            <TableHead>
              <TableRow className="bg-slate-50">
                <TableCell className="font-bold text-xs text-slate-700">Invoice Number</TableCell>
                <TableCell className="font-bold text-xs text-slate-700">Date & Time</TableCell>
                <TableCell className="font-bold text-xs text-slate-700">Terminal & Cashier</TableCell>
                <TableCell className="font-bold text-xs text-slate-700">Customer</TableCell>
                <TableCell className="font-bold text-xs text-slate-700">Items</TableCell>
                <TableCell className="font-bold text-xs text-slate-700">Total Paid</TableCell>
                <TableCell className="font-bold text-xs text-slate-700">Status</TableCell>
                <TableCell align="right" className="font-bold text-xs text-slate-700">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" className="py-12 text-slate-400">
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : filteredSales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" className="py-12 text-slate-400 text-sm">
                    No sales invoices found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredSales.map((sale) => (
                  <TableRow key={sale.id} hover>
                    <TableCell className="font-mono font-bold text-xs text-teal-800">
                      {sale.invoice_number}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {new Date(sale.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      <div>{sale.cashier_name}</div>
                      <div className="text-[10px] text-slate-400">{sale.terminal_id}</div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">
                      {sale.customer_name || 'Walk-in'}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {sale.items.length} {sale.items.length === 1 ? 'item' : 'items'}
                    </TableCell>
                    <TableCell className="font-bold text-xs text-slate-900">
                      {pharmacyInfo?.currency || 'PKR'} {sale.total.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {sale.status === 'completed' ? (
                        <Chip label="Completed" size="small" className="bg-emerald-50 text-emerald-700 text-[10px] font-semibold h-5" />
                      ) : (
                        <Chip label="Returned" size="small" className="bg-rose-50 text-rose-700 text-[10px] font-semibold h-5" />
                      )}
                    </TableCell>
                    <TableCell align="right" className="space-x-1">
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleOpenDetails(sale)}
                        startIcon={<Eye className="w-3.5 h-3.5" />}
                        className="text-[11px] py-0.5 px-2 border-slate-300 text-slate-700"
                      >
                        View
                      </Button>
                      {canReturn && sale.status !== 'returned' && (
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          onClick={() => handleOpenReturnModal(sale)}
                          startIcon={<RotateCcw className="w-3.5 h-3.5" />}
                          className="text-[11px] py-0.5 px-2"
                        >
                          Return
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

      {/* Invoice Details Dialog */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle className="font-bold text-slate-800 pb-1 flex justify-between items-center">
          <span>Invoice Details: {selectedSale?.invoice_number}</span>
          <Button
            size="small"
            variant="contained"
            onClick={handlePrint}
            startIcon={<Printer className="w-4 h-4" />}
            className="bg-teal-700 hover:bg-teal-800 text-xs"
          >
            Reprint
          </Button>
        </DialogTitle>
        <DialogContent className="pt-2 space-y-4">
          {selectedSale && (
            <div id="printable-receipt">
              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-500 block">Date & Time:</span>
                  <span className="font-semibold text-slate-800">
                    {new Date(selectedSale.created_at).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Terminal / Counter:</span>
                  <span className="font-semibold text-slate-800">{selectedSale.terminal_id}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Cashier:</span>
                  <span className="font-semibold text-slate-800">{selectedSale.cashier_name}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Customer:</span>
                  <span className="font-semibold text-slate-800">
                    {selectedSale.customer_name || 'Walk-in'} {selectedSale.customer_phone ? `(${selectedSale.customer_phone})` : ''}
                  </span>
                </div>
                {selectedSale.prescription_verified_by && (
                  <div className="col-span-2 text-emerald-800 bg-emerald-50 p-1.5 rounded border border-emerald-200">
                    ✓ Verified by Pharmacist: <span className="font-bold">{selectedSale.prescription_verified_by}</span>
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-700 mb-2">Dispensed Line Items</h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className="p-2">Item</th>
                        <th className="p-2">Batch (Expiry)</th>
                        <th className="p-2">Qty</th>
                        <th className="p-2">Price</th>
                        <th className="p-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedSale.items.map((it, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2 font-medium text-slate-800">{it.medicine_name}</td>
                          <td className="p-2 text-slate-500">
                            {it.batch_number} <span className="text-[10px]">({it.expiry_date})</span>
                          </td>
                          <td className="p-2">{Number(it.quantity.toFixed(2))}</td>
                          <td className="p-2">{it.unit_price}</td>
                          <td className="p-2 text-right font-bold text-slate-900">
                            {pharmacyInfo?.currency || 'PKR'} {it.total.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal:</span>
                  <span>{pharmacyInfo?.currency || 'PKR'} {selectedSale.subtotal.toFixed(2)}</span>
                </div>
                {selectedSale.discount_total > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Discount:</span>
                    <span>-{pharmacyInfo?.currency || 'PKR'} {selectedSale.discount_total.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-500">
                  <span>Tax:</span>
                  <span>{pharmacyInfo?.currency || 'PKR'} {selectedSale.tax_total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm pt-1 border-t border-slate-200 text-slate-900">
                  <span>Total Paid:</span>
                  <span>{pharmacyInfo?.currency || 'PKR'} {selectedSale.total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-500 pt-1 text-[11px]">
                  <span>Payment Mode:</span>
                  <span className="capitalize">{selectedSale.payments.map((p) => `${p.method} (${p.amount})`).join(', ')}</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
        <DialogActions className="p-4 pt-0">
          <Button onClick={() => setDetailsOpen(false)} color="inherit">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Return Authorization Dialog */}
      <Dialog open={returnModalOpen} onClose={() => setReturnModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle className="font-bold text-slate-800 pb-1 flex items-center gap-2">
          <RotateCcw className="w-5 h-5 text-rose-600" />
          Process Return: {selectedSale?.invoice_number}
        </DialogTitle>
        <DialogContent className="pt-2 space-y-4">
          {returnError && <Alert severity="error" className="text-xs">{returnError}</Alert>}
          {returnSuccess && <Alert severity="success" className="text-xs">{returnSuccess}</Alert>}

          <p className="text-xs text-slate-600">
            Select items to return. Restocked items will be automatically re-credited to their original batch records in FIFO inventory.
          </p>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="p-2">Medicine</th>
                  <th className="p-2">Sold Qty</th>
                  <th className="p-2">Return Qty</th>
                  <th className="p-2 text-right">Refund Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {returnItems.map((item, idx) => (
                  <tr key={idx}>
                    <td className="p-2 font-medium text-slate-800">{item.medicine_name}</td>
                    <td className="p-2 text-slate-500">{item.maxQty}</td>
                    <td className="p-2">
                      <input
                        type="number"
                        min={0}
                        max={item.maxQty}
                        value={item.returnQty}
                        onChange={(e) => handleQuantityChange(idx, parseInt(e.target.value) || 0)}
                        className="w-16 border border-slate-300 rounded px-1.5 py-1 text-xs"
                      />
                    </td>
                    <td className="p-2 text-right font-bold text-slate-800">
                      {pharmacyInfo?.currency || 'PKR'} {(item.returnQty * item.unit_price).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-center p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs">
            <span className="font-semibold text-rose-900">Total Refund Due:</span>
            <span className="font-bold text-sm text-rose-900 font-mono">
              {pharmacyInfo?.currency || 'PKR'} {calculateTotalRefund().toFixed(2)}
            </span>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Reason for Return * (Mandatory for audit)
            </label>
            <textarea
              rows={2}
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder="e.g. Customer changed prescription, wrong dosage purchased, package sealed"
              className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-teal-600"
              required
            />
          </div>

          <div className="text-[11px] text-slate-500 bg-slate-100 p-2 rounded">
            Authorized by: <span className="font-semibold text-slate-700">{currentUser.full_name || currentUser.username}</span> ({currentRole.name})
          </div>
        </DialogContent>
        <DialogActions className="p-4 pt-0">
          <Button onClick={() => setReturnModalOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={submittingReturn}
            onClick={handleProcessReturn}
            className="bg-rose-700 hover:bg-rose-800"
          >
            {submittingReturn ? <CircularProgress size={20} color="inherit" /> : 'Confirm & Issue Refund'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};
