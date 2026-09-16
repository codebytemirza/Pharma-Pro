import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { db, hashPassword } from './server/db.js';
import { licenseManager } from './server/license.js';
import { backupManager } from './server/backup.js';
import { wsHub } from './server/ws.js';
import { User, Role } from './src/types.js';

dotenv.config();

const app = express();
const PORT = 3000;
const server = http.createServer(app);

// Initialize WebSocket sync hub
wsHub.init(server);

// Wire license status change to real-time broadcast
licenseManager.setOnStatusChange((state) => {
  wsHub.broadcast('LICENSE_CHANGED', state);
});

app.use(express.json());

// Helper auth middleware (session / header based)
function getAuthenticatedUser(req: Request): { user: User; role: Role } | null {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) return null;

  const user = db.getUserById(userId);
  if (!user || user.status === 'disabled') return null;

  const role = db.getRoleById(user.role_id);
  if (!role) return null;

  const { password_hash, ...safeUser } = user;
  return { user: safeUser, role };
}

// License enforcement middleware for write operations
function requireActiveLicense(req: Request, res: Response, next: NextFunction) {
  const license = db.getLicenseState();
  if (license.status !== 'active') {
    const pharmacyId = db.getPharmacyInfo().unique_pharmacy_id;
    return res.status(403).json({
      error: 'License Inactive',
      message:
        'License inactive. To activate, please send payment via JazzCash to 03284119134, then contact [developer] with your payment confirmation.',
      pharmacy_id: pharmacyId,
      status: license.status,
    });
  }
  next();
}

// ==========================================
// API ROUTES
// ==========================================

// 1. Pharmacy Info & Setup Status
app.get('/api/system/status', (req, res) => {
  const info = db.getPharmacyInfo();
  const license = db.getLicenseState();
  res.json({
    first_run_completed: info.setup_completed,
    pharmacy: info,
    license,
    terminals_connected: wsHub.getConnectedCount(),
  });
});

app.get('/api/info', (req, res) => {
  const info = db.getPharmacyInfo();
  const license = db.getLicenseState();
  res.json({
    info,
    license,
    terminals_connected: wsHub.getConnectedCount(),
  });
});

app.put('/api/pharmacy', (req, res) => {
  try {
    const auth = getAuthenticatedUser(req);
    if (!auth || !auth.role.permissions.includes('manage_settings')) {
      return res.status(403).json({ error: 'Permission denied: manage_settings required.' });
    }
    const current = db.getPharmacyInfo();
    const updated = {
      ...current,
      ...req.body,
      unique_pharmacy_id: current.unique_pharmacy_id, // keep immutable
    };
    db.getRawData().pharmacy_info = updated;
    db.save();
    db.logAudit(auth.user.id, auth.user.username, 'UPDATE_SETTINGS', 'pharmacy', 'Updated pharmacy profile details');
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 2. First-Run Admin Setup
app.post('/api/setup', (req, res) => {
  try {
    const {
      adminFullName,
      adminUsername,
      adminPassword,
      adminEmail,
      adminPhone,
      businessName,
      address,
      phone,
      email,
      currency,
    } = req.body;

    if (!adminFullName || !adminUsername || !adminPassword || !businessName || !address || !phone) {
      return res.status(400).json({ error: 'Please fill in all mandatory fields.' });
    }

    if (adminPassword.length < 6) {
      return res.status(400).json({ error: 'Admin password must be at least 6 characters long.' });
    }

    const result = db.completeSetup({
      adminFullName,
      adminUsername,
      adminPassword,
      adminEmail,
      adminPhone,
      businessName,
      address,
      phone,
      email,
      currency,
    });

    wsHub.broadcast('USER_UPDATED');
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 3. Authentication: Login
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required.' });
    }

    const user = db.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Check account lockout (5 failed attempts for 15 minutes)
    if (user.locked_until) {
      const lockedUntil = new Date(user.locked_until);
      if (lockedUntil > new Date()) {
        const remainingMinutes = Math.ceil((lockedUntil.getTime() - Date.now()) / (1000 * 60));
        return res.status(429).json({
          error: `Account is locked due to 5 failed login attempts. Try again in ${remainingMinutes} minute(s).`,
        });
      } else {
        // Unlock
        user.locked_until = null;
        user.failed_attempts = 0;
      }
    }

    if (user.status === 'disabled') {
      return res.status(403).json({ error: 'This user account has been disabled by the Administrator.' });
    }

    const inputHash = hashPassword(password);
    if (user.password_hash !== inputHash) {
      user.failed_attempts = (user.failed_attempts || 0) + 1;
      if (user.failed_attempts >= 5) {
        const lockTime = new Date(Date.now() + 15 * 60 * 1000);
        user.locked_until = lockTime.toISOString();
        db.save();
        return res.status(429).json({
          error: 'Maximum failed attempts reached. Account locked for 15 minutes for LAN security.',
        });
      }
      db.save();
      return res.status(401).json({
        error: `Invalid credentials. Attempts remaining before 15m lockout: ${5 - user.failed_attempts}`,
      });
    }

    // Reset failed attempts on success
    user.failed_attempts = 0;
    user.locked_until = null;
    user.last_login = new Date().toISOString();
    db.save();

    const role = db.getRoleById(user.role_id);
    const { password_hash, ...safeUser } = user;

    db.logAudit(user.id, user.username, 'LOGIN', 'auth', `User ${user.username} logged in successfully`);

    res.json({
      user: safeUser,
      role,
      pharmacy: db.getPharmacyInfo(),
      license: db.getLicenseState(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/current', (req, res) => {
  const auth = getAuthenticatedUser(req);
  if (!auth) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json(auth);
});

app.post('/api/auth/logout', (req, res) => {
  const auth = getAuthenticatedUser(req);
  if (auth) {
    db.logAudit(auth.user.id, auth.user.username, 'LOGOUT', 'auth', `User ${auth.user.username} logged out`);
  }
  res.json({ success: true });
});

// 4. Roles & Users Management
app.get('/api/roles', (req, res) => {
  res.json(db.getRoles());
});

app.post('/api/roles', (req, res) => {
  try {
    const auth = getAuthenticatedUser(req);
    if (!auth || !auth.role.permissions.includes('manage_roles')) {
      return res.status(403).json({ error: 'Permission denied: manage_roles required.' });
    }
    const role = db.createRole(req.body, auth.user);
    wsHub.broadcast('ROLE_UPDATED', role);
    res.json(role);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/roles/:id', (req, res) => {
  try {
    const auth = getAuthenticatedUser(req);
    if (!auth || !auth.role.permissions.includes('manage_roles')) {
      return res.status(403).json({ error: 'Permission denied: manage_roles required.' });
    }
    const role = db.updateRole(req.params.id, req.body, auth.user);
    wsHub.broadcast('ROLE_UPDATED', role);
    res.json(role);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/users', (req, res) => {
  const auth = getAuthenticatedUser(req);
  if (!auth || !auth.role.permissions.includes('manage_users')) {
    return res.status(403).json({ error: 'Permission denied: manage_users required.' });
  }
  res.json(db.getUsers());
});

app.post('/api/users', (req, res) => {
  try {
    const auth = getAuthenticatedUser(req);
    if (!auth || !auth.role.permissions.includes('manage_users')) {
      return res.status(403).json({ error: 'Permission denied: manage_users required.' });
    }
    const user = db.createUser(req.body, auth.user);
    wsHub.broadcast('USER_UPDATED', user);
    res.json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/users/:id', (req, res) => {
  try {
    const auth = getAuthenticatedUser(req);
    if (!auth || !auth.role.permissions.includes('manage_users')) {
      return res.status(403).json({ error: 'Permission denied: manage_users required.' });
    }
    const user = db.updateUser(req.params.id, req.body, auth.user);
    wsHub.broadcast('USER_UPDATED', user);
    res.json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 5. Medicines & Inventory
app.get('/api/medicines', (req, res) => {
  const auth = getAuthenticatedUser(req);
  const canSeeCost = auth?.role.permissions.includes('view_cost_price') ?? false;

  let list = db.getMedicinesWithStock();
  if (!canSeeCost) {
    // Hide cost prices from cashiers / unauthorized staff per specification!
    list = list.map((m) => ({
      ...m,
      purchase_price: 0,
      batches: m.batches?.map((b) => ({ ...b, purchase_price: 0 })),
    }));
  }
  res.json(list);
});

app.post('/api/medicines', requireActiveLicense, (req, res) => {
  try {
    const auth = getAuthenticatedUser(req);
    if (!auth || !auth.role.permissions.includes('edit_inventory')) {
      return res.status(403).json({ error: 'Permission denied: edit_inventory required.' });
    }
    const { medicine, initial_batch } = req.body;
    const med = db.addMedicine(medicine, initial_batch || null, auth.user);
    wsHub.broadcast('STOCK_UPDATED', { medicine_id: med.id });
    res.json(med);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/medicines/:id', requireActiveLicense, (req, res) => {
  try {
    const auth = getAuthenticatedUser(req);
    if (!auth || !auth.role.permissions.includes('edit_inventory')) {
      return res.status(403).json({ error: 'Permission denied: edit_inventory required.' });
    }
    const med = db.updateMedicine(req.params.id, req.body, auth.user);
    wsHub.broadcast('STOCK_UPDATED', { medicine_id: med.id });
    res.json(med);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/medicines/:id/batches', requireActiveLicense, (req, res) => {
  try {
    const auth = getAuthenticatedUser(req);
    if (!auth || !auth.role.permissions.includes('edit_inventory')) {
      return res.status(403).json({ error: 'Permission denied: edit_inventory required.' });
    }
    const batch = db.addBatch({ ...req.body, medicine_id: req.params.id }, auth.user);
    wsHub.broadcast('STOCK_UPDATED', { medicine_id: req.params.id, batch_id: batch.id });
    res.json(batch);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/inventory/adjust', requireActiveLicense, (req, res) => {
  try {
    const auth = getAuthenticatedUser(req);
    if (!auth || !auth.role.permissions.includes('edit_inventory')) {
      return res.status(403).json({ error: 'Permission denied: edit_inventory required.' });
    }
    const adjustment = db.adjustStock(req.body, auth.user);
    wsHub.broadcast('STOCK_UPDATED', { medicine_id: req.body.medicine_id });
    res.json(adjustment);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/inventory/expiry-alerts', (req, res) => {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const medicines = db.getMedicinesWithStock();

  const alerts: {
    batch_id: string;
    medicine_id: string;
    medicine_name: string;
    batch_number: string;
    quantity: number;
    expiry_date: string;
    days_left: number;
    status: 'expired' | 'critical' | 'warning' | 'notice';
  }[] = [];

  medicines.forEach((m) => {
    m.batches?.forEach((b) => {
      if (b.quantity <= 0) return;
      const exp = new Date(b.expiry_date);
      const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        alerts.push({
          batch_id: b.id,
          medicine_id: m.id,
          medicine_name: m.name,
          batch_number: b.batch_number,
          quantity: b.quantity,
          expiry_date: b.expiry_date,
          days_left: diffDays,
          status: 'expired',
        });
      } else if (diffDays <= 7) {
        alerts.push({
          batch_id: b.id,
          medicine_id: m.id,
          medicine_name: m.name,
          batch_number: b.batch_number,
          quantity: b.quantity,
          expiry_date: b.expiry_date,
          days_left: diffDays,
          status: 'critical',
        });
      } else if (diffDays <= 30) {
        alerts.push({
          batch_id: b.id,
          medicine_id: m.id,
          medicine_name: m.name,
          batch_number: b.batch_number,
          quantity: b.quantity,
          expiry_date: b.expiry_date,
          days_left: diffDays,
          status: 'warning',
        });
      } else if (diffDays <= 90) {
        alerts.push({
          batch_id: b.id,
          medicine_id: m.id,
          medicine_name: m.name,
          batch_number: b.batch_number,
          quantity: b.quantity,
          expiry_date: b.expiry_date,
          days_left: diffDays,
          status: 'notice',
        });
      }
    });
  });

  alerts.sort((a, b) => a.days_left - b.days_left);
  res.json(alerts);
});

// 6. POS Sales & Invoicing
app.post('/api/sales', requireActiveLicense, (req, res) => {
  try {
    const auth = getAuthenticatedUser(req);
    if (!auth || !auth.role.permissions.includes('create_sale')) {
      return res.status(403).json({ error: 'Permission denied: create_sale required.' });
    }

    const sale = db.executeSale(req.body, auth.user, auth.role);
    wsHub.broadcast('STOCK_UPDATED');
    wsHub.broadcast('SALE_CREATED', sale);
    res.json(sale);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/sales', (req, res) => {
  const sales = db.getRawData().sales;
  res.json(sales);
});

app.get('/api/sales/:id', (req, res) => {
  const sale = db.getRawData().sales.find((s) => s.id === req.params.id || s.invoice_number === req.params.id);
  if (!sale) return res.status(404).json({ error: 'Invoice not found.' });
  res.json(sale);
});

app.post('/api/sales/returns', requireActiveLicense, (req, res) => {
  try {
    const auth = getAuthenticatedUser(req);
    if (!auth || !auth.role.permissions.includes('process_return')) {
      return res.status(403).json({ error: 'Permission denied: process_return required.' });
    }
    const saleReturn = db.processSaleReturn(req.body, auth.user);
    wsHub.broadcast('STOCK_UPDATED');
    wsHub.broadcast('RETURN_PROCESSED', saleReturn);
    res.json(saleReturn);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 7. Suppliers & Purchase Orders
app.get('/api/suppliers', (req, res) => {
  res.json(db.getSuppliers());
});

app.post('/api/suppliers', requireActiveLicense, (req, res) => {
  try {
    const auth = getAuthenticatedUser(req);
    if (!auth || !auth.role.permissions.includes('manage_suppliers')) {
      return res.status(403).json({ error: 'Permission denied: manage_suppliers required.' });
    }
    const sup = db.addSupplier(req.body, auth.user);
    res.json(sup);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/purchases', (req, res) => {
  res.json(db.getPurchaseOrders());
});

app.post('/api/purchases', requireActiveLicense, (req, res) => {
  try {
    const auth = getAuthenticatedUser(req);
    if (!auth || !auth.role.permissions.includes('manage_purchases')) {
      return res.status(403).json({ error: 'Permission denied: manage_purchases required.' });
    }
    const po = db.createPurchaseOrder(req.body, auth.user);
    wsHub.broadcast('PURCHASE_UPDATED', po);
    res.json(po);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/purchases/:id/receive', requireActiveLicense, (req, res) => {
  try {
    const auth = getAuthenticatedUser(req);
    if (!auth || !auth.role.permissions.includes('manage_purchases')) {
      return res.status(403).json({ error: 'Permission denied: manage_purchases required.' });
    }
    const po = db.receivePurchaseOrder(req.params.id, req.body, auth.user);
    wsHub.broadcast('STOCK_UPDATED');
    wsHub.broadcast('PURCHASE_UPDATED', po);
    res.json(po);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 8. Reports & Analytics
app.get('/api/reports', (req, res) => {
  const auth = getAuthenticatedUser(req);
  if (!auth || !auth.role.permissions.includes('view_reports')) {
    return res.status(403).json({ error: 'Permission denied: view_reports required.' });
  }

  const raw = db.getRawData();
  const sales = raw.sales;

  // Compute total sales, profit, top items
  let totalRevenue = 0;
  let totalCost = 0;
  let totalSalesCount = sales.length;

  const itemSalesMap: {
    [medId: string]: { name: string; quantity: number; revenue: number; profit: number };
  } = {};

  sales.forEach((s) => {
    totalRevenue += s.total;
    s.items.forEach((it) => {
      const cost = it.cost_price * it.quantity;
      totalCost += cost;

      if (!itemSalesMap[it.medicine_id]) {
        itemSalesMap[it.medicine_id] = {
          name: it.medicine_name,
          quantity: 0,
          revenue: 0,
          profit: 0,
        };
      }
      itemSalesMap[it.medicine_id].quantity += it.quantity;
      itemSalesMap[it.medicine_id].revenue += it.total;
      itemSalesMap[it.medicine_id].profit += it.total - cost;
    });
  });

  const totalProfit = Math.round((totalRevenue - totalCost) * 100) / 100;
  const topMedicines = Object.values(itemSalesMap).sort((a, b) => b.quantity - a.quantity);

  // Stock valuation
  let totalStockCost = 0;
  let totalStockRetail = 0;
  raw.medicines.forEach((m) => {
    const medBatches = raw.batches.filter((b) => b.medicine_id === m.id);
    medBatches.forEach((b) => {
      totalStockCost += b.purchase_price * b.quantity;
      totalStockRetail += m.sale_price * b.quantity;
    });
  });

  res.json({
    total_revenue: Math.round(totalRevenue * 100) / 100,
    total_cost: Math.round(totalCost * 100) / 100,
    total_profit: totalProfit,
    total_sales_count: totalSalesCount,
    stock_valuation_cost: Math.round(totalStockCost * 100) / 100,
    stock_valuation_retail: Math.round(totalStockRetail * 100) / 100,
    top_selling: topMedicines.slice(0, 10),
    slow_moving: topMedicines.slice(-5).reverse(),
  });
});

app.get('/api/reports/daily', (req, res) => {
  const sales = db.getRawData().sales;
  const todayStr = new Date().toISOString().split('T')[0];
  const todaySales = sales.filter((s) => s.created_at.startsWith(todayStr));

  let total_revenue = 0;
  let total_cost = 0;
  let cash_total = 0;
  let card_total = 0;
  let wallet_total = 0;
  let total_discounts = 0;
  let total_tax = 0;
  const sales_by_cashier: Record<string, number> = {};

  todaySales.forEach((s) => {
    total_revenue += s.total;
    total_discounts += s.discount_total || 0;
    total_tax += s.tax_total || 0;
    const cashier = s.cashier_name || 'Staff';
    sales_by_cashier[cashier] = (sales_by_cashier[cashier] || 0) + s.total;

    s.items.forEach((it) => {
      total_cost += it.cost_price * it.quantity;
    });
    s.payments.forEach((p) => {
      if (p.method === 'cash') cash_total += p.amount;
      else if (p.method === 'card') card_total += p.amount;
      else if (p.method === 'wallet') wallet_total += p.amount;
    });
  });

  res.json({
    date: todayStr,
    total_revenue: Math.round(total_revenue * 100) / 100,
    total_cost: Math.round(total_cost * 100) / 100,
    gross_profit: Math.round((total_revenue - total_cost) * 100) / 100,
    total_sales_count: todaySales.length,
    cash_total: Math.round(cash_total * 100) / 100,
    card_total: Math.round(card_total * 100) / 100,
    wallet_total: Math.round(wallet_total * 100) / 100,
    total_discounts: Math.round(total_discounts * 100) / 100,
    total_tax: Math.round(total_tax * 100) / 100,
    sales_by_cashier,
  });
});

app.get('/api/reports/profit-loss', (req, res) => {
  const sales = db.getRawData().sales;
  let total_revenue = 0;
  let total_cost = 0;

  const itemMap: Record<string, {
    medicine_id: string;
    medicine_name: string;
    units_sold: number;
    gross_revenue: number;
    cogs: number;
    gross_profit: number;
    margin_pct: number;
  }> = {};

  sales.forEach((s) => {
    total_revenue += s.total;
    s.items.forEach((it) => {
      const itCost = it.cost_price * it.quantity;
      total_cost += itCost;

      if (!itemMap[it.medicine_id]) {
        itemMap[it.medicine_id] = {
          medicine_id: it.medicine_id,
          medicine_name: it.medicine_name,
          units_sold: 0,
          gross_revenue: 0,
          cogs: 0,
          gross_profit: 0,
          margin_pct: 0,
        };
      }
      itemMap[it.medicine_id].units_sold += it.quantity;
      itemMap[it.medicine_id].gross_revenue += it.total;
      itemMap[it.medicine_id].cogs += itCost;
    });
  });

  const items = Object.values(itemMap).map((it) => {
    const itProfit = Math.round((it.gross_revenue - it.cogs) * 100) / 100;
    const itMargin = it.gross_revenue > 0 ? Math.round((itProfit / it.gross_revenue) * 1000) / 10 : 0;
    return {
      ...it,
      gross_revenue: Math.round(it.gross_revenue * 100) / 100,
      revenue: Math.round(it.gross_revenue * 100) / 100,
      cogs: Math.round(it.cogs * 100) / 100,
      cost: Math.round(it.cogs * 100) / 100,
      gross_profit: itProfit,
      profit: itProfit,
      margin_pct: itMargin,
      margin_percent: itMargin,
    };
  });

  const gross_profit = Math.round((total_revenue - total_cost) * 100) / 100;
  const margin_pct = total_revenue > 0 ? Math.round((gross_profit / total_revenue) * 1000) / 10 : 0;

  res.json({
    total_revenue: Math.round(total_revenue * 100) / 100,
    revenue: Math.round(total_revenue * 100) / 100,
    cogs: Math.round(total_cost * 100) / 100,
    gross_profit,
    profit_margin_percent: margin_pct,
    margin_pct,
    sales_count: sales.length,
    items,
  });
});

app.get('/api/reports/turnover', (req, res) => {
  const raw = db.getRawData();
  const sales = raw.sales;
  const itemMap: Record<string, {
    medicine_id: string;
    medicine_name: string;
    category: string;
    current_stock: number;
    total_quantity_sold: number;
    total_revenue: number;
    velocity: 'fast' | 'moderate' | 'slow';
  }> = {};

  sales.forEach((s) => {
    s.items.forEach((it) => {
      if (!itemMap[it.medicine_id]) {
        const med = raw.medicines.find((m) => m.id === it.medicine_id);
        const stock = raw.batches
          .filter((b) => b.medicine_id === it.medicine_id)
          .reduce((sum, b) => sum + b.quantity, 0);

        itemMap[it.medicine_id] = {
          medicine_id: it.medicine_id,
          medicine_name: it.medicine_name,
          category: med?.category || 'General',
          current_stock: stock,
          total_quantity_sold: 0,
          total_revenue: 0,
          velocity: 'slow',
        };
      }
      itemMap[it.medicine_id].total_quantity_sold += it.quantity;
      itemMap[it.medicine_id].total_revenue += it.total;
    });
  });

  const items = Object.values(itemMap)
    .sort((a, b) => b.total_quantity_sold - a.total_quantity_sold)
    .map((it) => ({
      ...it,
      total_revenue: Math.round(it.total_revenue * 100) / 100,
      velocity: (it.total_quantity_sold >= 20 ? 'fast' : it.total_quantity_sold >= 8 ? 'moderate' : 'slow') as 'fast' | 'moderate' | 'slow',
      turnover_rate: it.total_quantity_sold >= 20 ? 'High' : it.total_quantity_sold >= 8 ? 'Medium' : 'Low',
    }));

  res.json(items);
});

app.get('/api/reports/expiry-loss', (req, res) => {
  const raw = db.getRawData();
  const today = new Date();
  let totalLoss = 0;
  const expiredBatches: any[] = [];

  raw.batches.forEach((b) => {
    if (b.quantity <= 0) return;
    const exp = new Date(b.expiry_date);
    if (exp < today) {
      const med = raw.medicines.find((m) => m.id === b.medicine_id);
      const loss = b.purchase_price * b.quantity;
      totalLoss += loss;
      expiredBatches.push({
        batch_id: b.id,
        medicine_name: med?.name || 'Unknown',
        batch_number: b.batch_number,
        expired_date: b.expiry_date,
        quantity: b.quantity,
        loss_value: Math.round(loss * 100) / 100,
      });
    }
  });

  res.json({
    total_loss: Math.round(totalLoss * 100) / 100,
    total_loss_value: Math.round(totalLoss * 100) / 100,
    count: expiredBatches.length,
    batches: expiredBatches,
    expired_batches: expiredBatches,
  });
});

// 9. License System
app.get('/api/license', (req, res) => {
  res.json({
    license: db.getLicenseState(),
    pharmacy_id: db.getPharmacyInfo().unique_pharmacy_id,
  });
});

app.post('/api/license/recheck', async (req, res) => {
  try {
    const updated = await licenseManager.checkLicense(true);
    res.json({
      license: updated,
      pharmacy_id: db.getPharmacyInfo().unique_pharmacy_id,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Developer simulation toggle
app.post('/api/license/simulate', (req, res) => {
  const { status, expires } = req.body;
  const state = licenseManager.simulateState(status, expires);
  res.json(state);
});

// 10. Backup System
app.get('/api/backup/status', (req, res) => {
  const raw = db.getRawData();
  const history = raw.backup_logs.map((b) => ({
    filename: b.file_name || `${b.id}.sql`,
    timestamp: b.timestamp,
    size: (b.size_kb || 45) * 1024,
    commit_sha: b.id.slice(0, 7),
    status: b.status,
  }));
  const last = history[0];
  res.json({
    repo: process.env.GITHUB_REPO || 'owner/pharmacy-backups',
    schedule_interval_minutes: 30,
    last_backup_time: last?.timestamp || null,
    history,
  });
});

app.post('/api/backup/trigger', async (req, res) => {
  try {
    const auth = getAuthenticatedUser(req);
    if (!auth || !auth.role.permissions.includes('manage_backup')) {
      return res.status(403).json({ error: 'Permission denied: manage_backup required.' });
    }
    const log = await backupManager.runBackup('github');
    res.json({
      success: true,
      backup: {
        filename: log.file_name || `pharmacy_backup_${log.id}.sql`,
        timestamp: log.timestamp,
        size: (log.size_kb || 45) * 1024,
        commit_sha: log.id.slice(0, 7),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backup', async (req, res) => {
  try {
    const auth = getAuthenticatedUser(req);
    if (!auth || !auth.role.permissions.includes('manage_backup')) {
      return res.status(403).json({ error: 'Permission denied: manage_backup required.' });
    }
    const log = await backupManager.runBackup(req.body.type || 'manual_export');
    res.json(log);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/backup/logs', (req, res) => {
  res.json(db.getRawData().backup_logs);
});

app.get('/api/backup/download', (req, res) => {
  const sql = backupManager.generateSqlDump();
  const pharmacyId = db.getPharmacyInfo().unique_pharmacy_id;
  const fileName = `${pharmacyId}_backup_${new Date().toISOString().slice(0, 10)}.sql`;
  res.setHeader('Content-Type', 'application/sql');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(sql);
});

// 11. Audit Logs
app.get('/api/audit', (req, res) => {
  res.json(db.getRawData().audit_logs);
});

// Explicit JSON 404 for any unmatched /api routes so they NEVER fall through to HTML/Vite
app.all('/api/*', (req, res) => {
  res.status(404).json({
    error: `API route not found: ${req.method} ${req.path}`,
    status: 404,
  });
});

// Global API error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api/')) {
    console.error('API Error handler:', err);
    return res.status(500).json({
      error: err?.message || 'Internal Server Error',
      status: 500,
    });
  }
  next(err);
});

// ==========================================
// VITE MIDDLEWARE & STATIC SERVING
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Pharmacy ERP Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
