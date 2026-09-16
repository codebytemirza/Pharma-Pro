export type Permission =
  | 'view_inventory'
  | 'edit_inventory'
  | 'delete_inventory'
  | 'view_cost_price'
  | 'create_sale'
  | 'apply_discount'
  | 'process_return'
  | 'view_reports'
  | 'export_reports'
  | 'manage_suppliers'
  | 'manage_purchases'
  | 'manage_users'
  | 'manage_roles'
  | 'manage_settings'
  | 'manage_license'
  | 'manage_backup'
  | 'verify_prescription';

export type PermissionKey = Permission;

export interface Role {
  id: string;
  name: string;
  description: string;
  is_system: boolean;
  permissions: Permission[];
  max_discount_percent: number;
}

export interface User {
  id: string;
  full_name: string;
  username: string;
  email?: string;
  phone?: string;
  role_id: string;
  status: 'active' | 'disabled';
  failed_attempts: number;
  locked_until?: string | null;
  last_login?: string | null;
  created_at: string;
}

export interface PharmacyInfo {
  business_name: string;
  address: string;
  phone: string;
  email: string;
  unique_pharmacy_id: string;
  currency: string;
  tax_rate?: number;
  tax_number?: string;
  low_stock_threshold_default?: number;
  setup_completed: boolean;
}

export interface Medicine {
  id: string;
  name: string;
  generic_name: string;
  category: string;
  manufacturer: string;
  unit_type: 'tablet' | 'strip' | 'bottle' | 'box' | 'syrup' | 'injection' | 'ointment' | 'other';
  units_per_pack: number;
  purchase_price: number;
  sale_price: number;
  tax_percent: number;
  barcode: string;
  reorder_threshold: number;
  requires_prescription: boolean;
  controlled_substance: boolean;
  created_at: string;
  updated_at: string;
  total_stock?: number;
  batches?: Batch[];
}

export interface Batch {
  id: string;
  medicine_id: string;
  batch_number: string;
  quantity: number;
  initial_quantity: number;
  expiry_date: string; // YYYY-MM-DD
  purchase_price: number;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  payment_terms: string;
  created_at: string;
}

export interface PurchaseOrderItem {
  medicine_id: string;
  medicine_name: string;
  ordered_quantity: number;
  received_quantity: number;
  unit_cost: number;
  total: number;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string;
  supplier_name: string;
  order_date: string;
  status: 'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled';
  items: PurchaseOrderItem[];
  total_amount: number;
  notes?: string;
  created_by: string;
  created_at: string;
}

export interface SaleItem {
  medicine_id: string;
  medicine_name: string;
  batch_id: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  tax_percent: number;
  discount_amount: number;
  total: number;
}

export interface PaymentLine {
  method: 'cash' | 'card' | 'wallet';
  amount: number;
}

export interface Sale {
  id: string;
  invoice_number: string;
  terminal_id: string;
  cashier_id: string;
  cashier_name: string;
  customer_name?: string;
  customer_phone?: string;
  items: SaleItem[];
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  payments: PaymentLine[];
  amount_tendered: number;
  change_due: number;
  requires_prescription: boolean;
  prescription_verified_by?: string | null;
  prescription_notes?: string;
  status: 'completed' | 'returned' | 'partial_return';
  created_at: string;
}

export interface SaleReturn {
  id: string;
  return_number: string;
  sale_id: string;
  invoice_number: string;
  items: {
    medicine_id: string;
    medicine_name: string;
    batch_id: string;
    quantity: number;
    refund_amount: number;
  }[];
  total_refund: number;
  reason: string;
  authorized_by: string;
  created_at: string;
}

export interface StockAdjustment {
  id: string;
  medicine_id: string;
  medicine_name: string;
  batch_id: string;
  batch_number: string;
  change_qty: number; // positive or negative
  type: 'damage' | 'theft' | 'correction' | 'expiry';
  reason: string;
  adjusted_by: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  username: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  details: string;
  ip_address?: string;
  timestamp: string;
}

export interface LicenseState {
  status: 'active' | 'inactive' | 'expired';
  licensed_to: string;
  expires: string; // YYYY-MM-DD
  max_terminals: number;
  last_checked_at: string;
  last_valid_at: string;
  last_verified?: string;
  offline_days_remaining?: number;
  is_grace_period: boolean;
  message?: string;
  simulated?: boolean;
}

export interface BackupLog {
  id: string;
  timestamp: string;
  status: 'success' | 'failed';
  backup_type: 'github' | 'manual_export';
  details: string;
  file_name?: string;
  size_kb?: number;
}

export interface BackupStatus {
  repo: string;
  schedule_interval_minutes: number;
  last_backup_time: string | null;
  history: {
    filename: string;
    timestamp: string;
    size: number;
    commit_sha: string;
    status: string;
  }[];
}

export interface DailySummary {
  date: string;
  total_revenue: number;
  total_cost: number;
  gross_profit: number;
  total_sales_count: number;
  cash_total: number;
  card_total: number;
  wallet_total: number;
  total_discounts: number;
  total_tax: number;
  sales_by_cashier: Record<string, number>;
}

export interface ProfitLossReport {
  total_revenue: number;
  revenue: number;
  cogs: number;
  gross_profit: number;
  profit_margin_percent: number;
  margin_pct: number;
  sales_count: number;
  items: {
    medicine_id: string;
    medicine_name: string;
    units_sold: number;
    gross_revenue: number;
    revenue: number;
    cogs: number;
    cost: number;
    gross_profit: number;
    profit: number;
    margin_pct: number;
    margin_percent: number;
  }[];
}

export interface TurnoverItem {
  medicine_id: string;
  medicine_name: string;
  category: string;
  current_stock: number;
  total_quantity_sold: number;
  total_revenue: number;
  velocity: 'fast' | 'moderate' | 'slow';
  turnover_rate?: string;
}

export interface ExpiryLossReport {
  total_loss: number;
  total_loss_value: number;
  count: number;
  batches: {
    batch_id: string;
    medicine_name: string;
    batch_number: string;
    expired_date: string;
    quantity: number;
    loss_value: number;
  }[];
  expired_batches: {
    batch_id: string;
    medicine_name: string;
    batch_number: string;
    expired_date: string;
    quantity: number;
    loss_value: number;
  }[];
}
