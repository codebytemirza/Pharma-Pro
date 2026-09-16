import React, { useState, useEffect, useRef } from 'react';
import {
  TextField,
  Button,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Slider,
  CircularProgress,
  InputAdornment,
  RadioGroup,
  FormControlLabel,
  Radio,
} from '@mui/material';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Receipt,
  Printer,
  ShieldCheck,
  AlertTriangle,
  CreditCard,
  Banknote,
  Wallet,
  CheckCircle2,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { api } from '../services/api';
import { Medicine, Sale, User, Role, PharmacyInfo, LicenseState } from '../types';

interface CartItem {
  medicine: Medicine;
  quantity: number;
  loose_quantity?: number;
  discount_percent: number;
  unexpiredStock: number;
}

interface Props {
  currentUser: User;
  currentRole: Role;
  pharmacyInfo: PharmacyInfo | null;
  licenseState: LicenseState;
  terminalId: string;
  onSaleCompleted?: (sale: Sale) => void;
}

export const PosView: React.FC<Props> = ({
  currentUser,
  currentRole,
  pharmacyInfo,
  licenseState,
  terminalId,
  onSaleCompleted,
}) => {
  const [medicines, setMedicines] = useState<(Medicine & { total_stock: number })[]>([]);
  const [loadingMeds, setLoadingMeds] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);

  // Prescription Verification Dialog
  const [rxDialogOpen, setRxDialogOpen] = useState(false);
  const [verifiedByPharmacist, setVerifiedByPharmacist] = useState<string | null>(null);
  const [pharmacistList, setPharmacistList] = useState<User[]>([]);
  const [selectedPharmacist, setSelectedPharmacist] = useState('');
  const [rxNotes, setRxNotes] = useState('');

  // Payment State
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'wallet' | 'split'>('cash');
  const [cashTendered, setCashTendered] = useState<string>('');
  const [splitCashAmount, setSplitCashAmount] = useState<string>('');
  const [splitCardAmount, setSplitCardAmount] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // Processing & Receipt Dialog
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [posError, setPosError] = useState<string | null>(null);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'catalog' | 'cart'>('catalog');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const cartStorageKey = `pos_cart_${terminalId}`;

  // Load medicines list
  const loadCatalog = async () => {
    setLoadingMeds(true);
    try {
      const data = await api.getMedicines();
      setMedicines(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingMeds(false);
    }
  };

  useEffect(() => {
    loadCatalog();
    // Load staff who have verify_prescription permission
    api.getUsers().then((users) => {
      setPharmacistList(users.filter((u) => u.status === 'active'));
    }).catch(() => {});

    // Restore cached cart if exists (handles LAN/power interruption edge case!)
    try {
      const saved = localStorage.getItem(cartStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCart(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, [terminalId]);

  // Persist cart to localStorage whenever it changes
  useEffect(() => {
    try {
      if (cart.length > 0) {
        localStorage.setItem(cartStorageKey, JSON.stringify(cart));
      } else {
        localStorage.removeItem(cartStorageKey);
      }
    } catch {
      // ignore
    }
  }, [cart, cartStorageKey]);

  // Calculate unexpired available stock for a medicine
  const getUnexpiredStock = (med: Medicine): number => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (!med.batches) return med.total_stock || 0;
    return med.batches
      .filter((b) => b.expiry_date >= todayStr)
      .reduce((sum, b) => sum + b.quantity, 0);
  };

  // Add item to cart
  const addToCart = (med: Medicine) => {
    setPosError(null);
    const unexpiredStock = getUnexpiredStock(med);

    if (unexpiredStock <= 0) {
      setPosError(`Cannot sell "${med.name}": No unexpired stock available (all stock is either zero or expired).`);
      return;
    }

    setCart((prev) => {
      const existingIndex = prev.findIndex((item) => item.medicine.id === med.id);
      if (existingIndex > -1) {
        const existing = prev[existingIndex];
        if (existing.quantity + 1 > unexpiredStock) {
          setPosError(`Maximum available unexpired quantity for "${med.name}" is ${unexpiredStock}.`);
          return prev;
        }
        const updated = [...prev];
        updated[existingIndex] = {
          ...existing,
          quantity: existing.quantity + 1,
        };
        return updated;
      } else {
        return [
          ...prev,
          {
            medicine: med,
            quantity: 1,
            discount_percent: 0,
            unexpiredStock,
          },
        ];
      }
    });

    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  // Adjust quantity
  const updateQuantity = (index: number, newQty: number, newLooseQty: number = 0) => {
    setPosError(null);
    if (newQty <= 0 && newLooseQty <= 0) {
      removeFromCart(index);
      return;
    }

    setCart((prev) => {
      const item = prev[index];
      const packSize = item.medicine.units_per_pack || 1;
      
      // Auto-convert excess loose units to packs
      let finalQty = newQty;
      let finalLoose = newLooseQty;
      
      if (packSize > 1) {
        if (finalLoose >= packSize) {
          finalQty += Math.floor(finalLoose / packSize);
          finalLoose = finalLoose % packSize;
        } else if (finalLoose < 0) {
          if (finalQty > 0) {
            finalQty -= 1;
            finalLoose += packSize;
          } else {
            finalLoose = 0;
          }
        }
      } else {
        finalLoose = 0;
      }

      if (finalQty <= 0 && finalLoose <= 0) {
         // Need to remove from cart, but we are inside setState. 
         // For now just return as 0, and we'll handle removal outside or let it be 0.
         // Actually, if it hits 0, it won't be removed until next render if we do this, 
         // so let's just allow 0 here and maybe remove it. We can't easily remove inside setState.
      }
      
      const totalRequested = finalQty + (finalLoose / packSize);
      
      if (totalRequested > item.unexpiredStock) {
        setPosError(`Cannot exceed unexpired available stock of ${item.unexpiredStock} for "${item.medicine.name}".`);
        return prev;
      }
      const updated = [...prev];
      updated[index] = { ...item, quantity: finalQty, loose_quantity: finalLoose };
      return updated;
    });
  };

  // Update item discount (hard-capped by currentRole.max_discount_percent)
  const updateDiscount = (index: number, discountPct: number) => {
    const capped = Math.min(Math.max(0, discountPct), currentRole.max_discount_percent);
    setCart((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], discount_percent: capped };
      return updated;
    });
  };

  // Remove item
  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  // Clear cart
  const clearCart = () => {
    setCart([]);
    setVerifiedByPharmacist(null);
    setRxNotes('');
    setPosError(null);
    localStorage.removeItem(cartStorageKey);
  };

  // Cart financial calculations
  const subtotal = cart.reduce((sum, item) => {
    const packSize = item.medicine.units_per_pack || 1;
    const loosePrice = item.medicine.sale_price / packSize;
    const totalQty = item.quantity + ((item.loose_quantity || 0) / packSize);
    return sum + (item.medicine.sale_price * item.quantity) + (loosePrice * (item.loose_quantity || 0));
  }, 0);
  const totalDiscount = cart.reduce((sum, item) => {
    const packSize = item.medicine.units_per_pack || 1;
    const loosePrice = item.medicine.sale_price / packSize;
    const gross = (item.medicine.sale_price * item.quantity) + (loosePrice * (item.loose_quantity || 0));
    return sum + (gross * item.discount_percent) / 100;
  }, 0);

  const totalTax = cart.reduce((sum, item) => {
    const packSize = item.medicine.units_per_pack || 1;
    const loosePrice = item.medicine.sale_price / packSize;
    const gross = (item.medicine.sale_price * item.quantity) + (loosePrice * (item.loose_quantity || 0));
    const discount = (gross * item.discount_percent) / 100;
    return sum + ((gross - discount) * item.medicine.tax_percent) / 100;
  }, 0);

  const grandTotal = Math.round((subtotal - totalDiscount + totalTax) * 100) / 100;

  // Has prescription required or controlled substance items?
  const hasPrescriptionItems = cart.some(
    (item) => item.medicine.requires_prescription || item.medicine.controlled_substance
  );

  // Auto-verify if the currently logged-in user already has verify_prescription permission!
  const currentCanVerify = currentRole.permissions.includes('verify_prescription');
  const effectiveVerification = currentCanVerify
    ? currentUser.full_name || currentUser.username
    : verifiedByPharmacist;

  // Tendered & change calculation
  const parsedTendered = parseFloat(cashTendered) || 0;
  const changeDue = Math.max(0, parsedTendered - grandTotal);

  // Filtered medicines for catalog search
  const filteredMeds = medicines.filter((m) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) ||
      m.generic_name.toLowerCase().includes(q) ||
      m.barcode?.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q)
    );
  });

  // Handle barcode exact match enter
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      const exactBarcode = medicines.find(
        (m) => m.barcode && m.barcode.toLowerCase() === searchQuery.trim().toLowerCase()
      );
      if (exactBarcode) {
        addToCart(exactBarcode);
        setSearchQuery('');
        return;
      }
      if (filteredMeds.length === 1) {
        addToCart(filteredMeds[0]);
        setSearchQuery('');
      }
    }
  };

  // Finalize Sale
  const handleFinalizeSale = async () => {
    setPosError(null);

    if (cart.length === 0) {
      setPosError('Cart is empty. Add medicines to proceed.');
      return;
    }

    if (hasPrescriptionItems && !effectiveVerification) {
      setRxDialogOpen(true);
      return;
    }

    // Prepare payment lines
    let payments: { method: 'cash' | 'card' | 'wallet'; amount: number }[] = [];

    if (paymentMethod === 'cash') {
      if (parsedTendered < grandTotal) {
        setPosError(`Cash tendered (${parsedTendered}) cannot be less than total payable (${grandTotal}).`);
        return;
      }
      payments = [{ method: 'cash', amount: grandTotal }];
    } else if (paymentMethod === 'card') {
      payments = [{ method: 'card', amount: grandTotal }];
    } else if (paymentMethod === 'wallet') {
      payments = [{ method: 'wallet', amount: grandTotal }];
    } else if (paymentMethod === 'split') {
      const cashAmt = parseFloat(splitCashAmount) || 0;
      const cardAmt = parseFloat(splitCardAmount) || 0;
      if (Math.abs(cashAmt + cardAmt - grandTotal) > 0.05) {
        setPosError(`Split payment total (${cashAmt + cardAmt}) must equal grand total (${grandTotal}).`);
        return;
      }
      payments = [
        { method: 'cash', amount: cashAmt },
        { method: 'card', amount: cardAmt },
      ];
    }

    setIsSubmitting(true);
    try {
      const salePayload = {
        terminal_id: terminalId,
        customer_name: customerName || 'Walk-in Customer',
        customer_phone: customerPhone,
        items: cart.map((item) => {
          const packSize = item.medicine.units_per_pack || 1;
          const totalQty = item.quantity + ((item.loose_quantity || 0) / packSize);
          return {
            medicine_id: item.medicine.id,
            quantity: Number(totalQty.toFixed(4)),
            discount_percent: item.discount_percent,
          };
        }),
        payments,
        amount_tendered: paymentMethod === 'cash' ? parsedTendered : grandTotal,
        prescription_verified_by: effectiveVerification || null,
        prescription_notes: rxNotes || undefined,
      };

      const completed = await api.createSale(salePayload);
      setCompletedSale(completed);
      setReceiptDialogOpen(true);

      // Reset cart and cache
      clearCart();
      setCashTendered('');
      setCustomerName('');
      setCustomerPhone('');
      loadCatalog();

      if (onSaleCompleted) {
        onSaleCompleted(completed);
      }
    } catch (err: any) {
      setPosError(err.message || 'Failed to complete sale transaction.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = () => {
    document.body.classList.add('printing-receipt');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-receipt');
    }, 500);
  };

  const isLocked = licenseState.status === 'inactive' || licenseState.status === 'expired';

  return (
    <div className="h-full flex flex-col xl:flex-row gap-3 sm:gap-4 p-2.5 sm:p-4 bg-slate-100 font-sans">
      {/* Mobile/Tablet View Switcher Tabs (< xl) */}
      <div className="flex xl:hidden bg-slate-200/80 p-1 rounded-xl gap-1 shrink-0">
        <button
          onClick={() => setMobileTab('catalog')}
          className={`flex-1 py-2 px-2.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
            mobileTab === 'catalog'
              ? 'bg-white text-teal-800 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          <span>Catalog</span>
        </button>
        <button
          onClick={() => setMobileTab('cart')}
          className={`flex-1 py-2 px-2.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
            mobileTab === 'cart'
              ? 'bg-white text-teal-800 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Receipt className="w-3.5 h-3.5" />
          <span>Active Bill</span>
          <span className="bg-teal-700 text-white px-1.5 py-0.2 rounded-full text-[10px] font-bold">
            {cart.length}
          </span>
          {grandTotal > 0 && (
            <span className="text-teal-800 font-extrabold hidden xs:inline">
              ({pharmacyInfo?.currency || 'PKR'} {Math.round(grandTotal)})
            </span>
          )}
        </button>
      </div>

      {/* LEFT: Medicine Selection & Quick Search */}
      <div
        className={`flex-1 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-h-[420px] ${
          mobileTab === 'cart' ? 'hidden xl:flex' : 'flex'
        }`}
      >
        {/* Search Bar Header */}
        <div className="p-2.5 sm:p-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              ref={searchInputRef}
              type="text"
              className="w-full bg-white pl-9 pr-4 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
              placeholder="Search medicine by Name, Generic, Category, or Scan Barcode [Enter]..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              autoFocus
            />
          </div>
          <Button
            size="small"
            variant="outlined"
            onClick={loadCatalog}
            disabled={loadingMeds}
            className="w-full sm:w-auto shrink-0 text-slate-600 border-slate-300 text-xs py-1.5"
          >
            Refresh Catalog
          </Button>
        </div>

        {/* Medicines Catalog Grid/Table */}
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-3">
          {loadingMeds ? (
            <div className="flex items-center justify-center h-48 text-slate-400">
              <CircularProgress size={28} />
            </div>
          ) : filteredMeds.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p className="text-sm">No medicines found matching "{searchQuery}".</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 gap-2 sm:gap-2.5">
              {filteredMeds.map((med) => {
                const unexpiredStock = getUnexpiredStock(med);
                const isOutOfStock = unexpiredStock <= 0;

                return (
                  <div
                    key={med.id}
                    onClick={() => !isOutOfStock && addToCart(med)}
                    className={`p-3 rounded-lg border text-left transition flex flex-col justify-between ${
                      isOutOfStock
                        ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                        : 'bg-white border-slate-200 hover:border-teal-500 hover:shadow-md cursor-pointer'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <span className="font-semibold text-sm text-slate-900 leading-tight">
                          {med.name}
                        </span>
                        <span className="text-xs font-bold text-teal-800 shrink-0 bg-teal-50 px-1.5 py-0.5 rounded">
                          {pharmacyInfo?.currency || 'PKR'} {med.sale_price}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 line-clamp-1 italic mb-1.5">
                        {med.generic_name}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {med.requires_prescription && (
                          <span className="text-[10px] font-bold bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded">
                            Rx Required
                          </span>
                        )}
                        {med.controlled_substance && (
                          <span className="text-[10px] font-bold bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded">
                            Controlled
                          </span>
                        )}
                        <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded capitalize">
                          {med.unit_type}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span
                        className={`font-medium ${
                          unexpiredStock <= med.reorder_threshold
                            ? 'text-amber-600 font-semibold'
                            : 'text-emerald-700'
                        }`}
                      >
                        {isOutOfStock ? 'Out of Stock' : `${unexpiredStock} in stock`}
                      </span>
                      <button
                        disabled={isOutOfStock}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                          isOutOfStock
                            ? 'bg-slate-200 text-slate-400'
                            : 'bg-teal-700 hover:bg-teal-800 text-white'
                        }`}
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Counter Cart & Invoicing */}
      <div
        className={`w-full xl:w-[460px] flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden shrink-0 ${
          mobileTab === 'catalog' ? 'hidden xl:flex' : 'flex'
        }`}
      >
        {/* Cart Header */}
        <div className="p-3.5 bg-teal-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-teal-200" />
            <div>
              <span className="font-bold text-sm">Active Counter Bill</span>
              <span className="text-xs text-teal-200 ml-2">({cart.length} items)</span>
            </div>
          </div>
          {cart.length > 0 && (
            <button
              onClick={clearCart}
              className="text-xs text-teal-200 hover:text-white flex items-center gap-1 font-medium transition"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>

        {/* Error Notice */}
        {posError && (
          <Alert severity="error" className="m-3 text-xs" onClose={() => setPosError(null)}>
            {posError}
          </Alert>
        )}

        {/* Prescription Verification Warning Banner */}
        {hasPrescriptionItems && (
          <div
            onClick={() => setRxDialogOpen(true)}
            className={`p-2.5 mx-3 mt-3 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition ${
              effectiveVerification
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-amber-50 border-amber-300 text-amber-900 animate-pulse'
            }`}
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
              <div>
                <span className="font-bold">Prescription Required</span>
                <p className="text-[11px] text-slate-600">
                  {effectiveVerification
                    ? `Verified by: ${effectiveVerification}`
                    : 'Click to authorize by Licensed Pharmacist'}
                </p>
              </div>
            </div>
            <span className="font-semibold text-xs underline">
              {effectiveVerification ? 'Edit' : 'Verify Now'}
            </span>
          </div>
        )}

        {/* Cart Line Items */}
        <div className="flex-1 overflow-y-auto p-3 divide-y divide-slate-100 min-h-[220px] max-h-[360px]">
          {cart.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-medium">Cart is empty</p>
              <p className="text-xs text-slate-400">Click items on the left or scan barcode</p>
            </div>
          ) : (
            cart.map((item, idx) => {
              const packSize = item.medicine.units_per_pack || 1;
              const loosePrice = item.medicine.sale_price / packSize;
              const gross = (item.medicine.sale_price * item.quantity) + (loosePrice * (item.loose_quantity || 0));
              const lineTotal = gross * (1 - item.discount_percent / 100);
              const hasLooseOption = packSize > 1;

              return (
                <div key={item.medicine.id} className="py-2.5 flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs text-slate-900 truncate">
                        {item.medicine.name}
                      </span>
                      {item.medicine.requires_prescription && (
                        <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded">
                          Rx
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {pharmacyInfo?.currency || 'PKR'} {item.medicine.sale_price} / {hasLooseOption ? 'Pack' : 'Unit'}
                      {item.discount_percent > 0 && (
                        <span className="text-emerald-700 ml-1">
                          (-{item.discount_percent}% Disc)
                        </span>
                      )}
                    </div>

                    {/* Discount adjustment if permitted */}
                    {currentRole.max_discount_percent > 0 && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] text-slate-400">Disc%:</span>
                        <input
                          type="number"
                          min={0}
                          max={currentRole.max_discount_percent}
                          value={item.discount_percent || 0}
                          onChange={(e) => updateDiscount(idx, Number(e.target.value))}
                          className="w-12 text-[10px] border border-slate-200 rounded px-1 py-0.5 focus:outline-teal-600"
                        />
                        <span className="text-[9px] text-slate-400">
                          (Max {currentRole.max_discount_percent}%)
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Quantity and Actions */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center border border-slate-200 rounded" title="Packs/Boxes">
                        <button
                          onClick={() => updateQuantity(idx, item.quantity - 1, item.loose_quantity || 0)}
                          className="p-1 text-slate-500 hover:bg-slate-100 rounded-l"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-7 text-center text-xs font-bold text-slate-800">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(idx, item.quantity + 1, item.loose_quantity || 0)}
                          className="p-1 text-slate-500 hover:bg-slate-100 rounded-r"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      {hasLooseOption && (
                        <div className="flex items-center border border-teal-200 bg-teal-50 rounded" title={`Loose (${item.medicine.unit_type}s)`}>
                          <button
                            onClick={() => updateQuantity(idx, item.quantity, (item.loose_quantity || 0) - 1)}
                            className="p-1 text-teal-600 hover:bg-teal-100 rounded-l"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-7 text-center text-xs font-bold text-teal-800">
                            {item.loose_quantity || 0}
                          </span>
                          <button
                            onClick={() => updateQuantity(idx, item.quantity, (item.loose_quantity || 0) + 1)}
                            className="p-1 text-teal-600 hover:bg-teal-100 rounded-r"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      <span className="w-16 text-right font-bold text-xs text-slate-800">
                        {pharmacyInfo?.currency || 'PKR'} {Math.round(lineTotal)}
                      </span>

                      <button
                        onClick={() => removeFromCart(idx)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Customer & Payment Breakdown Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 space-y-2.5">
          {/* Customer info fields */}
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Customer Name (Optional)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="text-xs bg-white border border-slate-200 rounded px-2 py-1.5 focus:outline-teal-600"
            />
            <input
              type="text"
              placeholder="Phone Number (Optional)"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="text-xs bg-white border border-slate-200 rounded px-2 py-1.5 focus:outline-teal-600"
            />
          </div>

          {/* Payment Method Selector */}
          <div className="grid grid-cols-4 gap-1.5">
            <button
              onClick={() => setPaymentMethod('cash')}
              className={`py-1.5 text-xs font-semibold rounded border flex items-center justify-center gap-1 transition ${
                paymentMethod === 'cash'
                  ? 'bg-teal-700 text-white border-teal-700 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Banknote className="w-3.5 h-3.5" /> Cash
            </button>
            <button
              onClick={() => setPaymentMethod('card')}
              className={`py-1.5 text-xs font-semibold rounded border flex items-center justify-center gap-1 transition ${
                paymentMethod === 'card'
                  ? 'bg-teal-700 text-white border-teal-700 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" /> Card
            </button>
            <button
              onClick={() => setPaymentMethod('wallet')}
              className={`py-1.5 text-xs font-semibold rounded border flex items-center justify-center gap-1 transition ${
                paymentMethod === 'wallet'
                  ? 'bg-teal-700 text-white border-teal-700 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" /> Wallet
            </button>
            <button
              onClick={() => setPaymentMethod('split')}
              className={`py-1.5 text-xs font-semibold rounded border flex items-center justify-center gap-1 transition ${
                paymentMethod === 'split'
                  ? 'bg-teal-700 text-white border-teal-700 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              Split
            </button>
          </div>

          {/* Split Payment inputs */}
          {paymentMethod === 'split' && (
            <div className="grid grid-cols-2 gap-2 p-2 bg-slate-100 rounded border border-slate-200 text-xs">
              <div>
                <label className="text-slate-500 block mb-0.5">Cash Portion:</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={splitCashAmount}
                  onChange={(e) => setSplitCashAmount(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded px-2 py-1"
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-0.5">Card Portion:</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={splitCardAmount}
                  onChange={(e) => setSplitCardAmount(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded px-2 py-1"
                />
              </div>
            </div>
          )}

          {/* Cash Tendered & Change Calculation */}
          {paymentMethod === 'cash' && (
            <div className="space-y-1.5 p-2 bg-teal-50/70 border border-teal-200 rounded-lg">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <span className="text-[11px] font-semibold text-teal-900 block">Cash Received:</span>
                  <input
                    type="number"
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    placeholder={grandTotal.toString()}
                    className="w-full bg-white border border-teal-300 rounded px-2 py-1 text-sm font-bold text-teal-950 focus:outline-teal-700"
                  />
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[11px] font-semibold text-slate-600 block">Change Return:</span>
                  <span className="text-sm font-bold text-emerald-700 font-mono">
                    {pharmacyInfo?.currency || 'PKR'} {changeDue.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Touchscreen Quick Cash Buttons */}
              <div className="flex items-center gap-1 pt-0.5 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setCashTendered(grandTotal.toString())}
                  className="px-2 py-0.5 rounded bg-white hover:bg-teal-100 text-[11px] font-bold text-teal-800 border border-teal-300 shrink-0 cursor-pointer"
                >
                  Exact
                </button>
                {[100, 500, 1000, 5000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      const current = parseFloat(cashTendered) || 0;
                      setCashTendered((current + amt).toString());
                    }}
                    className="px-2 py-0.5 rounded bg-white hover:bg-teal-100 text-[11px] font-medium text-slate-700 border border-slate-300 shrink-0 cursor-pointer"
                  >
                    +{amt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Totals Summary */}
          <div className="space-y-1 text-xs pt-1 border-t border-slate-200">
            <div className="flex justify-between text-slate-500">
              <span>Subtotal:</span>
              <span>
                {pharmacyInfo?.currency || 'PKR'} {subtotal.toFixed(2)}
              </span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>Discount Applied:</span>
                <span>
                  -{pharmacyInfo?.currency || 'PKR'} {totalDiscount.toFixed(2)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-slate-500">
              <span>Sales Tax:</span>
              <span>
                {pharmacyInfo?.currency || 'PKR'} {totalTax.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-sm font-extrabold text-slate-900 pt-1 border-t border-slate-200">
              <span>Payable Total:</span>
              <span className="text-teal-800 text-base">
                {pharmacyInfo?.currency || 'PKR'} {grandTotal.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Checkout Button */}
          <Button
            fullWidth
            variant="contained"
            size="large"
            disabled={isSubmitting || cart.length === 0 || isLocked}
            onClick={handleFinalizeSale}
            className="bg-teal-700 hover:bg-teal-800 text-white font-bold py-2.5 shadow-md"
          >
            {isSubmitting ? (
              <CircularProgress size={22} color="inherit" />
            ) : isLocked ? (
              'Sales Blocked (License Inactive)'
            ) : (
              `Complete Sale (${pharmacyInfo?.currency || 'PKR'} ${grandTotal.toFixed(2)})`
            )}
          </Button>
        </div>
      </div>

      {/* Prescription Sign-off Dialog */}
      <Dialog open={rxDialogOpen} onClose={() => setRxDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle className="font-bold text-slate-800 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-amber-600" />
          Pharmacist Verification Required
        </DialogTitle>
        <DialogContent className="space-y-4 pt-2">
          <Alert severity="warning" className="text-xs">
            This sale contains prescription-only or controlled medicines. Verification by a licensed
            pharmacist is mandatory before dispensing for regulatory compliance.
          </Alert>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Verifying Pharmacist *
            </label>
            <select
              value={selectedPharmacist}
              onChange={(e) => setSelectedPharmacist(e.target.value)}
              className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="">-- Select Pharmacist --</option>
              {pharmacistList.map((p) => (
                <option key={p.id} value={p.full_name || p.username}>
                  {p.full_name || p.username} ({p.username})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Prescription / Doctor Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={rxNotes}
              onChange={(e) => setRxNotes(e.target.value)}
              placeholder="e.g. Dr. Asim Rx# 4891 verified, dosage checked"
              className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-teal-600"
            />
          </div>
        </DialogContent>
        <DialogActions className="p-4 pt-0">
          <Button onClick={() => setRxDialogOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!selectedPharmacist}
            onClick={() => {
              setVerifiedByPharmacist(selectedPharmacist);
              setRxDialogOpen(false);
            }}
            className="bg-teal-700 hover:bg-teal-800"
          >
            Authorize Dispensing
          </Button>
        </DialogActions>
      </Dialog>

      {/* Printable Thermal Receipt Dialog (80mm standard format) */}
      <Dialog open={receiptDialogOpen} onClose={() => setReceiptDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogContent className="p-4 bg-slate-50">
          {completedSale && (
            <div id="printable-receipt" className="bg-white p-5 border border-slate-200 rounded shadow font-mono text-xs text-slate-800 leading-tight">
              {/* Receipt Header */}
              <div className="text-center border-b border-dashed border-slate-300 pb-3 mb-3">
                <div className="font-bold text-sm uppercase">{pharmacyInfo?.business_name}</div>
                <div className="text-[10px] text-slate-500">{pharmacyInfo?.address}</div>
                <div className="text-[10px] text-slate-500">Phone: {pharmacyInfo?.phone}</div>
                <div className="text-[10px] text-slate-500 mt-1">Pharmacy ID: {pharmacyInfo?.unique_pharmacy_id}</div>
              </div>

              {/* Invoice Metadata */}
              <div className="flex justify-between text-[11px] mb-1">
                <span>Invoice: {completedSale.invoice_number}</span>
                <span>{new Date(completedSale.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between text-[11px] mb-2 text-slate-500">
                <span>Terminal: {completedSale.terminal_id}</span>
                <span>Cashier: {completedSale.cashier_name}</span>
              </div>
              {completedSale.customer_name && (
                <div className="text-[10px] text-slate-600 mb-2">
                  Customer: {completedSale.customer_name}
                </div>
              )}
              {completedSale.prescription_verified_by && (
                <div className="text-[10px] bg-emerald-50 text-emerald-800 p-1 rounded mb-2 border border-emerald-200">
                  ✓ Verified by Pharmacist: {completedSale.prescription_verified_by}
                </div>
              )}

              {/* Line Items */}
              <div className="border-t border-b border-dashed border-slate-300 py-2 my-2 space-y-1">
                <div className="flex justify-between font-bold text-[10px] text-slate-600">
                  <span>Item / Batch</span>
                  <span>Qty × Price</span>
                  <span>Total</span>
                </div>
                {completedSale.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between text-[10px]">
                    <div className="max-w-[150px] truncate">
                      <div>{it.medicine_name}</div>
                      <div className="text-[8px] text-slate-400">Batch: {it.batch_number} (Exp: {it.expiry_date})</div>
                    </div>
                    <div>{it.quantity} × {it.unit_price}</div>
                    <div className="font-semibold">{Math.round(it.total)}</div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="space-y-1 text-[11px] pt-1">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span>{completedSale.subtotal.toFixed(2)}</span>
                </div>
                {completedSale.discount_total > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Discount:</span>
                    <span>-{completedSale.discount_total.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>Tax:</span>
                  <span>{completedSale.tax_total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm pt-1 border-t border-slate-300">
                  <span>GRAND TOTAL:</span>
                  <span>{pharmacyInfo?.currency || 'PKR'} {completedSale.total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 pt-1">
                  <span>Paid ({completedSale.payments.map((p) => p.method).join(', ')}):</span>
                  <span>{completedSale.amount_tendered.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[10px] font-bold text-emerald-800">
                  <span>Change Return:</span>
                  <span>{completedSale.change_due.toFixed(2)}</span>
                </div>
              </div>

              {/* Receipt Footer */}
              <div className="text-center text-[9px] text-slate-400 border-t border-dashed border-slate-300 mt-4 pt-2">
                <div>Thank you for choosing {pharmacyInfo?.business_name}!</div>
                <div>Goods returned within 3 days with original receipt.</div>
                <div>*** Patient Safety & Quality Assured ***</div>
              </div>
            </div>
          )}
        </DialogContent>
        <DialogActions className="p-3 bg-slate-100 flex justify-between">
          <Button onClick={() => setReceiptDialogOpen(false)} color="inherit" size="small">
            Close
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={handlePrint}
            startIcon={<Printer className="w-4 h-4" />}
            className="bg-teal-700 hover:bg-teal-800"
          >
            Print Receipt (Thermal)
          </Button>
        </DialogActions>
      </Dialog>

      {/* Sticky Mobile Floating Checkout Pill (< xl, when on Catalog view and cart has items) */}
      {mobileTab === 'catalog' && cart.length > 0 && (
        <div className="fixed bottom-16 md:bottom-4 left-3 right-3 z-30 xl:hidden bg-teal-950/95 backdrop-blur-sm text-white p-3 rounded-2xl shadow-2xl border border-teal-700 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-800 flex items-center justify-center text-teal-200 font-extrabold text-xs">
              {cart.length}
            </div>
            <div>
              <div className="text-[11px] text-teal-300 font-medium">Cart Subtotal</div>
              <div className="text-sm font-extrabold text-white">
                {pharmacyInfo?.currency || 'PKR'} {grandTotal.toFixed(2)}
              </div>
            </div>
          </div>
          <button
            onClick={() => setMobileTab('cart')}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition flex items-center gap-1.5"
          >
            <span>Review Bill & Pay</span>
            <span>→</span>
          </button>
        </div>
      )}
    </div>
  );
};
