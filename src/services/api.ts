import {
  PharmacyInfo,
  User,
  Role,
  Medicine,
  Batch,
  Supplier,
  PurchaseOrder,
  Sale,
  SaleReturn,
  StockAdjustment,
  AuditLog,
  LicenseState,
  BackupLog,
  DailySummary,
  ProfitLossReport,
  TurnoverItem,
  ExpiryLossReport,
  BackupStatus,
} from '../types';

class ApiService {
  private currentUserId: string | null = null;

  public setUserId(id: string | null) {
    this.currentUserId = id;
  }

  private getHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.currentUserId) {
      headers['x-user-id'] = this.currentUserId;
    }
    return headers;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(endpoint, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...(options.headers || {}),
      },
    });

    const contentType = res.headers.get('content-type') || '';
    let data: any;

    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch (e: any) {
        throw new Error(`Invalid JSON received from server: ${e?.message}`);
      }
    } else {
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch {
        // Response was not JSON (e.g., HTML from proxy or server booting up)
        const isHtml = text.trim().startsWith('<') || text.includes('<!doctype') || text.includes('<!DOCTYPE');
        const summary = isHtml ? `Server is initializing or returned HTML (HTTP ${res.status})` : text.slice(0, 150);
        const err = new Error(summary) as Error & { status?: number; data?: any };
        err.status = res.status;
        err.data = { raw: text };
        throw err;
      }
    }

    if (!res.ok) {
      const errorMsg = data?.error || data?.message || `Request failed with status ${res.status}`;
      const err = new Error(errorMsg) as Error & { status?: number; data?: any };
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // System & Setup
  async getSystemStatus(): Promise<{ first_run_completed: boolean; pharmacy: PharmacyInfo; license: LicenseState }> {
    return this.request('/api/system/status');
  }

  async getInfo(): Promise<{ info: PharmacyInfo; license: LicenseState; terminals_connected: number }> {
    return this.request('/api/info');
  }

  async updatePharmacyInfo(data: Partial<PharmacyInfo>): Promise<PharmacyInfo> {
    return this.request('/api/pharmacy', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async setupAdmin(data: any): Promise<{ user: User; info: PharmacyInfo }> {
    return this.request('/api/setup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Auth
  async login(username: string, password: string): Promise<{
    user: User;
    role: Role;
    pharmacy: PharmacyInfo;
    license: LicenseState;
  }> {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  async getCurrentUser(): Promise<{ user: User; role: Role } | null> {
    try {
      return await this.request('/api/auth/current');
    } catch {
      return null;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.request('/api/auth/logout', { method: 'POST' });
    } finally {
      this.setUserId(null);
    }
  }

  // Roles & Users
  async getRoles(): Promise<Role[]> {
    return this.request('/api/roles');
  }

  async createRole(roleData: Partial<Role>): Promise<Role> {
    return this.request('/api/roles', {
      method: 'POST',
      body: JSON.stringify(roleData),
    });
  }

  async updateRole(id: string, updates: Partial<Role>): Promise<Role> {
    return this.request(`/api/roles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async getUsers(): Promise<User[]> {
    return this.request('/api/users');
  }

  async createUser(userData: any): Promise<User> {
    return this.request('/api/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async addUser(userData: any): Promise<User> {
    return this.createUser(userData);
  }

  async updateUser(id: string, updates: any): Promise<User> {
    return this.request(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteUser(id: string): Promise<any> {
    return this.updateUser(id, { status: 'disabled' });
  }

  // Medicines & Stock
  async getMedicines(): Promise<(Medicine & { total_stock: number; batches: Batch[] })[]> {
    return this.request('/api/medicines');
  }

  async addMedicine(medicine: Partial<Medicine>, initialBatch: any): Promise<Medicine> {
    return this.request('/api/medicines', {
      method: 'POST',
      body: JSON.stringify({ medicine, initial_batch: initialBatch }),
    });
  }

  async updateMedicine(id: string, updates: Partial<Medicine>): Promise<Medicine> {
    return this.request(`/api/medicines/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async addBatch(medicineId: string, batchData: Partial<Batch>): Promise<Batch> {
    return this.request(`/api/medicines/${medicineId}/batches`, {
      method: 'POST',
      body: JSON.stringify(batchData),
    });
  }

  async adjustStock(data: {
    medicine_id: string;
    batch_id: string;
    change_qty: number;
    type: string;
    reason: string;
  }): Promise<StockAdjustment> {
    return this.request('/api/inventory/adjust', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getExpiryAlerts(): Promise<any[]> {
    return this.request('/api/inventory/expiry-alerts');
  }

  // Sales & POS
  async createSale(saleData: any): Promise<Sale> {
    return this.request('/api/sales', {
      method: 'POST',
      body: JSON.stringify(saleData),
    });
  }

  async getSales(): Promise<Sale[]> {
    return this.request('/api/sales');
  }

  async getSaleById(id: string): Promise<Sale> {
    return this.request(`/api/sales/${id}`);
  }

  async processReturn(returnData: any): Promise<SaleReturn> {
    return this.request('/api/sales/returns', {
      method: 'POST',
      body: JSON.stringify(returnData),
    });
  }

  // Suppliers & Purchases
  async getSuppliers(): Promise<Supplier[]> {
    return this.request('/api/suppliers');
  }

  async addSupplier(data: Partial<Supplier>): Promise<Supplier> {
    return this.request('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getPurchases(): Promise<PurchaseOrder[]> {
    return this.request('/api/purchases');
  }

  async createPurchaseOrder(data: any): Promise<PurchaseOrder> {
    return this.request('/api/purchases', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async receivePurchaseOrder(poId: string, receiptData: any): Promise<PurchaseOrder> {
    return this.request(`/api/purchases/${poId}/receive`, {
      method: 'POST',
      body: JSON.stringify(receiptData),
    });
  }

  // Reports
  async getReports(): Promise<any> {
    return this.request('/api/reports');
  }

  async getDailyReport(): Promise<DailySummary> {
    return this.request('/api/reports/daily');
  }

  async getProfitLossReport(): Promise<ProfitLossReport> {
    return this.request('/api/reports/profit-loss');
  }

  async getTurnoverReport(): Promise<TurnoverItem[]> {
    return this.request('/api/reports/turnover');
  }

  async getExpiryLossReport(): Promise<ExpiryLossReport> {
    return this.request('/api/reports/expiry-loss');
  }

  // License
  async getLicense(): Promise<{ license: LicenseState; pharmacy_id: string }> {
    return this.request('/api/license');
  }

  async recheckLicense(): Promise<{ license: LicenseState; pharmacy_id: string }> {
    return this.request('/api/license/recheck', {
      method: 'POST',
    });
  }

  async simulateLicense(status: 'active' | 'inactive' | 'expired', expires?: string): Promise<LicenseState> {
    return this.request('/api/license/simulate', {
      method: 'POST',
      body: JSON.stringify({ status, expires }),
    });
  }

  // Backups & Audit
  async getBackupStatus(): Promise<BackupStatus> {
    return this.request('/api/backup/status');
  }

  async triggerBackup(type: 'github' | 'manual_export' = 'github'): Promise<{ success: boolean; backup: any }> {
    return this.request('/api/backup/trigger', {
      method: 'POST',
      body: JSON.stringify({ type }),
    });
  }

  async getBackupLogs(): Promise<BackupLog[]> {
    return this.request('/api/backup/logs');
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    return this.request('/api/audit');
  }
}

export const api = new ApiService();
