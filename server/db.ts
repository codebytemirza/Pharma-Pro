import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  PharmacyInfo,
  Role,
  User,
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
  Permission
} from '../src/types.js';

export interface DatabaseSchema {
  pharmacy_info: PharmacyInfo;
  roles: Role[];
  users: (User & { password_hash: string })[];
  medicines: Medicine[];
  batches: Batch[];
  suppliers: Supplier[];
  purchase_orders: PurchaseOrder[];
  sales: Sale[];
  sales_returns: SaleReturn[];
  stock_adjustments: StockAdjustment[];
  audit_logs: AuditLog[];
  license_state: LicenseState;
  backup_logs: BackupLog[];
  settings: {
    expiry_alert_days: number[]; // e.g. [90, 60, 30, 7]
    enable_github_backup: boolean;
    backup_retention_days: number;
    receipt_header: string;
    receipt_footer: string;
    tax_number: string;
  };
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'pharmacy.json');

const DEFAULT_PERMISSIONS: Permission[] = [
  'view_inventory',
  'edit_inventory',
  'delete_inventory',
  'view_cost_price',
  'create_sale',
  'apply_discount',
  'process_return',
  'view_reports',
  'export_reports',
  'manage_suppliers',
  'manage_purchases',
  'manage_users',
  'manage_roles',
  'manage_settings',
  'manage_license',
  'manage_backup',
  'verify_prescription',
];

const DEFAULT_ROLES: Role[] = [
  {
    id: 'role-admin',
    name: 'Admin',
    description: 'Full system access, staff, reports, licensing, backups, and settings',
    is_system: true,
    permissions: [...DEFAULT_PERMISSIONS],
    max_discount_percent: 100,
  },
  {
    id: 'role-pharmacist',
    name: 'Pharmacist',
    description: 'Verify prescriptions, dispense controlled medicines, manage inventory & review reports',
    is_system: true,
    permissions: ['view_inventory', 'edit_inventory', 'view_reports', 'verify_prescription', 'create_sale'],
    max_discount_percent: 5,
  },
  {
    id: 'role-cashier',
    name: 'Cashier',
    description: 'Counter POS billing, barcode search, discounts up to limit, receipt generation & returns',
    is_system: true,
    permissions: ['create_sale', 'apply_discount', 'process_return'],
    max_discount_percent: 10,
  },
  {
    id: 'role-inventory-mgr',
    name: 'Inventory Manager',
    description: 'Stock intake, medicine catalog, batch management, supplier orders & adjustments',
    is_system: true,
    permissions: ['view_inventory', 'edit_inventory', 'delete_inventory', 'view_cost_price', 'manage_suppliers', 'manage_purchases'],
    max_discount_percent: 0,
  },
];

function generatePharmacyId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `PHARM-${rand}-${new Date().getFullYear()}`;
}

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + '_pharmacy_salt_2026').digest('hex');
}

export class PharmacyDatabase {
  private data: DatabaseSchema;
  private writeLock: boolean = false;

  constructor() {
    this.ensureDataDir();
    this.data = this.loadDatabase();
  }

  private ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private getDefaultData(): DatabaseSchema {
    const defaultPharmacyId = generatePharmacyId();
    return {
      pharmacy_info: {
        business_name: '',
        address: '',
        phone: '',
        email: '',
        unique_pharmacy_id: defaultPharmacyId,
        currency: 'PKR',
        tax_rate: 5,
        setup_completed: false,
      },
      roles: [...DEFAULT_ROLES],
      users: [],
      medicines: [],
      batches: [],
      suppliers: [],
      purchase_orders: [],
      sales: [],
      sales_returns: [],
      stock_adjustments: [],
      audit_logs: [],
      license_state: {
        status: 'active',
        licensed_to: 'Local Pharmacy Instance',
        expires: '2028-12-31',
        max_terminals: 5,
        last_checked_at: new Date().toISOString(),
        last_valid_at: new Date().toISOString(),
        is_grace_period: false,
      },
      backup_logs: [],
      settings: {
        expiry_alert_days: [90, 60, 30, 7],
        enable_github_backup: true,
        backup_retention_days: 30,
        receipt_header: 'Fast, Trusted Healthcare & Pharmacy Service',
        receipt_footer: 'Thank you for your visit! Goods returned within 3 days with valid invoice.',
        tax_number: 'NTN-849102-PHARM',
      },
    };
  }

  private loadDatabase(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        // Ensure all top-level keys exist
        const defaults = this.getDefaultData();
        return {
          ...defaults,
          ...parsed,
          pharmacy_info: { ...defaults.pharmacy_info, ...parsed.pharmacy_info },
          settings: { ...defaults.settings, ...parsed.settings },
        };
      }
    } catch (err) {
      console.error('Error reading database file, using defaults:', err);
    }
    const initial = this.getDefaultData();
    this.saveImmediate(initial);
    return initial;
  }

  private saveImmediate(data: DatabaseSchema) {
    try {
      const tempPath = `${DB_FILE}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error('Failed to write database file:', err);
    }
  }

  public save() {
    this.saveImmediate(this.data);
  }

  public getRawData(): DatabaseSchema {
    return this.data;
  }

  // --- Audit Log ---
  public logAudit(
    userId: string,
    username: string,
    action: string,
    entityType: string,
    details: string,
    entityId?: string,
    ipAddress?: string
  ) {
    const log: AuditLog = {
      id: 'log-' + crypto.randomUUID(),
      user_id: userId,
      username: username,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
      ip_address: ipAddress || '127.0.0.1',
      timestamp: new Date().toISOString(),
    };
    this.data.audit_logs.unshift(log);
    // Keep last 1000 logs
    if (this.data.audit_logs.length > 1000) {
      this.data.audit_logs = this.data.audit_logs.slice(0, 1000);
    }
    this.save();
    return log;
  }

  // --- Setup & Pharmacy Info ---
  public getPharmacyInfo(): PharmacyInfo {
    return this.data.pharmacy_info;
  }

  public completeSetup(info: {
    adminFullName: string;
    adminUsername: string;
    adminPassword: string;
    adminEmail?: string;
    adminPhone?: string;
    businessName: string;
    address: string;
    phone: string;
    email?: string;
    currency?: string;
  }): { user: User; info: PharmacyInfo } {
    if (this.data.pharmacy_info.setup_completed && this.data.users.length > 0) {
      throw new Error('Initial setup has already been completed.');
    }

    this.data.pharmacy_info.business_name = info.businessName;
    this.data.pharmacy_info.address = info.address;
    this.data.pharmacy_info.phone = info.phone;
    this.data.pharmacy_info.email = info.email || '';
    if (info.currency) this.data.pharmacy_info.currency = info.currency;
    this.data.pharmacy_info.setup_completed = true;

    // Create the only initial Admin user
    const adminUser: User & { password_hash: string } = {
      id: 'user-admin-' + crypto.randomUUID().slice(0, 8),
      full_name: info.adminFullName,
      username: info.adminUsername.toLowerCase().trim(),
      email: info.adminEmail,
      phone: info.adminPhone,
      role_id: 'role-admin',
      status: 'active',
      failed_attempts: 0,
      locked_until: null,
      last_login: new Date().toISOString(),
      created_at: new Date().toISOString(),
      password_hash: hashPassword(info.adminPassword),
    };

    this.data.users = [adminUser];

    // Seed sample initial pharmacy medicines if catalog is empty
    if (this.data.medicines.length === 0) {
      this.seedStarterCatalog();
    }

    this.logAudit(
      adminUser.id,
      adminUser.username,
      'INITIAL_SETUP',
      'system',
      `First-time pharmacy setup completed for ${info.businessName}`
    );

    this.save();

    const { password_hash, ...safeUser } = adminUser;
    return { user: safeUser, info: this.data.pharmacy_info };
  }

  public seedStarterCatalog() {
    const sampleSuppliers: Supplier[] = [
      {
        id: 'sup-1',
        name: 'MediHealth Pharmaceuticals Ltd.',
        contact_person: 'Tariq Mehmood',
        phone: '+92 300 4567890',
        email: 'orders@medihealth.pk',
        address: 'Plot 42, Industrial Area, Lahore',
        payment_terms: 'Net 30 Days',
        created_at: new Date().toISOString(),
      },
      {
        id: 'sup-2',
        name: 'Novartis National Distributors',
        contact_person: 'Farhan Zaidi',
        phone: '+92 321 9876543',
        email: 'supply@novartis-dist.pk',
        address: 'Korangi Healthcare Park, Karachi',
        payment_terms: 'Net 15 Days',
        created_at: new Date().toISOString(),
      },
      {
        id: 'sup-3',
        name: 'Apex Bio Pharma & Vaccines',
        contact_person: 'Dr. Sarah Alvi',
        phone: '+92 333 1122334',
        email: 'sales@apexbio.pk',
        address: 'Sector I-9, Islamabad',
        payment_terms: 'Cash on Delivery',
        created_at: new Date().toISOString(),
      },
    ];
    this.data.suppliers = sampleSuppliers;

    const sampleMedicines: Omit<Medicine, 'id' | 'created_at' | 'updated_at'>[] = [
      {
        name: 'Augmentin 625mg',
        generic_name: 'Amoxicillin + Clavulanic Acid',
        category: 'Antibiotics',
        manufacturer: 'GSK Pakistan',
        unit_type: 'tablet',
        units_per_pack: 14,
        purchase_price: 380,
        sale_price: 460,
        tax_percent: 0,
        barcode: '890123450001',
        reorder_threshold: 20,
        requires_prescription: true,
        controlled_substance: false,
      },
      {
        name: 'Panadol 500mg',
        generic_name: 'Paracetamol',
        category: 'Analgesics / Antipyretics',
        manufacturer: 'Haleon Pakistan',
        unit_type: 'tablet',
        units_per_pack: 200,
        purchase_price: 450,
        sale_price: 520,
        tax_percent: 0,
        barcode: '890123450002',
        reorder_threshold: 50,
        requires_prescription: false,
        controlled_substance: false,
      },
      {
        name: 'Brufen 400mg',
        generic_name: 'Ibuprofen',
        category: 'NSAIDs',
        manufacturer: 'Abbott Laboratories',
        unit_type: 'tablet',
        units_per_pack: 30,
        purchase_price: 180,
        sale_price: 230,
        tax_percent: 0,
        barcode: '890123450003',
        reorder_threshold: 15,
        requires_prescription: false,
        controlled_substance: false,
      },
      {
        name: 'Risek 20mg Capsule',
        generic_name: 'Omeprazole',
        category: 'Gastrointestinal',
        manufacturer: 'Getz Pharma',
        unit_type: 'box',
        units_per_pack: 14,
        purchase_price: 260,
        sale_price: 320,
        tax_percent: 0,
        barcode: '890123450004',
        reorder_threshold: 25,
        requires_prescription: false,
        controlled_substance: false,
      },
      {
        name: 'Xanax 0.5mg',
        generic_name: 'Alprazolam',
        category: 'Sedatives / Anxiolytics',
        manufacturer: 'Pfizer',
        unit_type: 'strip',
        units_per_pack: 30,
        purchase_price: 310,
        sale_price: 400,
        tax_percent: 0,
        barcode: '890123450005',
        reorder_threshold: 10,
        requires_prescription: true,
        controlled_substance: true, // Controlled substance
      },
      {
        name: 'Cipralex 10mg',
        generic_name: 'Escitalopram',
        category: 'Antidepressants',
        manufacturer: 'Lundbeck',
        unit_type: 'tablet',
        units_per_pack: 28,
        purchase_price: 750,
        sale_price: 920,
        tax_percent: 0,
        barcode: '890123450006',
        reorder_threshold: 12,
        requires_prescription: true,
        controlled_substance: false,
      },
      {
        name: 'Ventolin Inhaler 100mcg',
        generic_name: 'Salbutamol',
        category: 'Respiratory',
        manufacturer: 'GSK',
        unit_type: 'bottle',
        units_per_pack: 1,
        purchase_price: 340,
        sale_price: 410,
        tax_percent: 0,
        barcode: '890123450007',
        reorder_threshold: 10,
        requires_prescription: true,
        controlled_substance: false,
      },
      {
        name: 'Glucophage 500mg',
        generic_name: 'Metformin HCl',
        category: 'Anti-Diabetic',
        manufacturer: 'Merck Serono',
        unit_type: 'tablet',
        units_per_pack: 50,
        purchase_price: 210,
        sale_price: 270,
        tax_percent: 0,
        barcode: '890123450008',
        reorder_threshold: 30,
        requires_prescription: true,
        controlled_substance: false,
      },
      {
        name: 'Azomax 250mg Suspension',
        generic_name: 'Azithromycin',
        category: 'Antibiotics',
        manufacturer: 'Highnoon Laboratories',
        unit_type: 'syrup',
        units_per_pack: 1,
        purchase_price: 220,
        sale_price: 280,
        tax_percent: 0,
        barcode: '890123450009',
        reorder_threshold: 8,
        requires_prescription: true,
        controlled_substance: false,
      },
      {
        name: 'Polyfax Skin Ointment 20g',
        generic_name: 'Polymyxin B + Bacitracin',
        category: 'Dermatological',
        manufacturer: 'GSK',
        unit_type: 'ointment',
        units_per_pack: 1,
        purchase_price: 110,
        sale_price: 145,
        tax_percent: 0,
        barcode: '890123450010',
        reorder_threshold: 15,
        requires_prescription: false,
        controlled_substance: false,
      }
    ];

    const today = new Date();
    const createdMedicines: Medicine[] = [];
    const createdBatches: Batch[] = [];

    sampleMedicines.forEach((sm, index) => {
      const medId = 'med-' + (index + 1);
      const med: Medicine = {
        ...sm,
        id: medId,
        created_at: today.toISOString(),
        updated_at: today.toISOString(),
      };
      createdMedicines.push(med);

      // Create 2 batches for each medicine: Batch 1 (older expiry - FIFO first), Batch 2 (newer expiry)
      // For med-1 (Augmentin): Batch 1 expires in 45 days, Batch 2 in 18 months
      // For med-5 (Xanax): Batch 1 expires in 20 days (near expiry alert!)
      // For one batch, create an expired batch to demonstrate the hard block!
      const isNearExpiry = index === 4;
      const isUrgentExpiry = index === 2; // Brufen near 10 days
      const isExpired = index === 8; // Azomax has an expired batch

      const exp1 = new Date(today);
      if (isExpired) {
        exp1.setDate(exp1.getDate() - 15); // expired 15 days ago
      } else if (isUrgentExpiry) {
        exp1.setDate(exp1.getDate() + 8); // 8 days
      } else if (isNearExpiry) {
        exp1.setDate(exp1.getDate() + 25); // 25 days
      } else {
        exp1.setMonth(exp1.getMonth() + 4 + index); // 4-14 months
      }

      const batch1: Batch = {
        id: 'batch-' + medId + '-1',
        medicine_id: medId,
        batch_number: `B24-${100 + index}A`,
        quantity: isExpired ? 5 : 25 + index * 5,
        initial_quantity: 30 + index * 5,
        expiry_date: exp1.toISOString().split('T')[0],
        purchase_price: sm.purchase_price,
        created_at: today.toISOString(),
      };
      createdBatches.push(batch1);

      // Second batch (fresh, 2 years out)
      const exp2 = new Date(today);
      exp2.setFullYear(exp2.getFullYear() + 2);
      const batch2: Batch = {
        id: 'batch-' + medId + '-2',
        medicine_id: medId,
        batch_number: `B25-${200 + index}B`,
        quantity: 40 + index * 10,
        initial_quantity: 40 + index * 10,
        expiry_date: exp2.toISOString().split('T')[0],
        purchase_price: sm.purchase_price,
        created_at: today.toISOString(),
      };
      createdBatches.push(batch2);
    });

    this.data.medicines = createdMedicines;
    this.data.batches = createdBatches;
  }

  // --- Users & Roles ---
  public getUsers(): Omit<User, 'password_hash'>[] {
    return this.data.users.map(({ password_hash, ...u }) => u);
  }

  public getUserById(id: string): (User & { password_hash: string }) | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  public getUserByUsername(username: string): (User & { password_hash: string }) | undefined {
    return this.data.users.find((u) => u.username.toLowerCase() === username.toLowerCase().trim());
  }

  public getRoles(): Role[] {
    return this.data.roles;
  }

  public getRoleById(roleId: string): Role | undefined {
    return this.data.roles.find((r) => r.id === roleId);
  }

  public createRole(role: Omit<Role, 'id' | 'is_system'>, creatorUser: User): Role {
    const newRole: Role = {
      id: 'role-custom-' + crypto.randomUUID().slice(0, 8),
      name: role.name.trim(),
      description: role.description || '',
      is_system: false,
      permissions: role.permissions,
      max_discount_percent: Math.min(Math.max(0, role.max_discount_percent || 0), 100),
    };
    this.data.roles.push(newRole);
    this.logAudit(
      creatorUser.id,
      creatorUser.username,
      'CREATE_ROLE',
      'roles',
      `Created custom role "${newRole.name}" with ${newRole.permissions.length} permissions`,
      newRole.id
    );
    this.save();
    return newRole;
  }

  public updateRole(roleId: string, updates: Partial<Role>, user: User): Role {
    const role = this.data.roles.find((r) => r.id === roleId);
    if (!role) throw new Error('Role not found');
    
    // System roles can have permissions and discount modified, but cannot be renamed or deleted
    if (updates.permissions) role.permissions = updates.permissions;
    if (updates.max_discount_percent !== undefined) {
      role.max_discount_percent = Math.min(Math.max(0, updates.max_discount_percent), 100);
    }
    if (!role.is_system && updates.name) role.name = updates.name.trim();
    if (updates.description !== undefined) role.description = updates.description;

    this.logAudit(
      user.id,
      user.username,
      'UPDATE_ROLE',
      'roles',
      `Updated role "${role.name}" permissions and settings`,
      role.id
    );
    this.save();
    return role;
  }

  public createUser(
    userData: {
      full_name: string;
      username: string;
      password: string;
      email?: string;
      phone?: string;
      role_id: string;
    },
    creatorUser: User
  ): User {
    const normalizedUsername = userData.username.toLowerCase().trim();
    if (this.getUserByUsername(normalizedUsername)) {
      throw new Error(`Username "${normalizedUsername}" is already taken.`);
    }
    const role = this.getRoleById(userData.role_id);
    if (!role) {
      throw new Error('Selected role does not exist.');
    }

    const newUser: User & { password_hash: string } = {
      id: 'user-' + crypto.randomUUID().slice(0, 8),
      full_name: userData.full_name.trim(),
      username: normalizedUsername,
      email: userData.email?.trim(),
      phone: userData.phone?.trim(),
      role_id: userData.role_id,
      status: 'active',
      failed_attempts: 0,
      locked_until: null,
      last_login: null,
      created_at: new Date().toISOString(),
      password_hash: hashPassword(userData.password),
    };

    this.data.users.push(newUser);
    this.logAudit(
      creatorUser.id,
      creatorUser.username,
      'CREATE_USER',
      'users',
      `Created user ${newUser.username} with role ${role.name}`,
      newUser.id
    );
    this.save();

    const { password_hash, ...safeUser } = newUser;
    return safeUser;
  }

  public updateUser(
    userId: string,
    updates: {
      full_name?: string;
      role_id?: string;
      email?: string;
      phone?: string;
      status?: 'active' | 'disabled';
      password?: string;
    },
    adminUser: User
  ): User {
    const user = this.data.users.find((u) => u.id === userId);
    if (!user) throw new Error('User not found.');

    // Edge case check: Prevent disabling or removing Admin role from the last active Admin
    if (updates.status === 'disabled' || (updates.role_id && updates.role_id !== 'role-admin')) {
      const activeAdmins = this.data.users.filter(
        (u) => u.role_id === 'role-admin' && u.status === 'active' && u.id !== userId
      );
      if (user.role_id === 'role-admin' && user.status === 'active' && activeAdmins.length === 0) {
        throw new Error('Action blocked: System must always have at least one active Admin account.');
      }
    }

    if (updates.full_name) user.full_name = updates.full_name.trim();
    if (updates.email !== undefined) user.email = updates.email.trim();
    if (updates.phone !== undefined) user.phone = updates.phone.trim();
    if (updates.role_id) {
      const role = this.getRoleById(updates.role_id);
      if (!role) throw new Error('Invalid role.');
      user.role_id = updates.role_id;
    }
    if (updates.status) user.status = updates.status;
    if (updates.password) {
      user.password_hash = hashPassword(updates.password);
      user.failed_attempts = 0;
      user.locked_until = null;
    }

    this.logAudit(
      adminUser.id,
      adminUser.username,
      'UPDATE_USER',
      'users',
      `Updated user profile for ${user.username} (status: ${user.status})`,
      user.id
    );
    this.save();

    const { password_hash, ...safeUser } = user;
    return safeUser;
  }

  // --- Medicines & Batches ---
  public getMedicinesWithStock(): (Medicine & { total_stock: number; batches: Batch[] })[] {
    return this.data.medicines.map((med) => {
      const batches = this.data.batches
        .filter((b) => b.medicine_id === med.id)
        .sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime());
      
      const total_stock = batches.reduce((sum, b) => sum + b.quantity, 0);
      return {
        ...med,
        total_stock,
        batches,
      };
    });
  }

  public getMedicineById(id: string): (Medicine & { total_stock: number; batches: Batch[] }) | null {
    const med = this.data.medicines.find((m) => m.id === id);
    if (!med) return null;
    const batches = this.data.batches
      .filter((b) => b.medicine_id === med.id)
      .sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime());
    const total_stock = batches.reduce((sum, b) => sum + b.quantity, 0);
    return { ...med, total_stock, batches };
  }

  public addMedicine(
    data: Omit<Medicine, 'id' | 'created_at' | 'updated_at'>,
    initialBatch: {
      batch_number: string;
      quantity: number;
      expiry_date: string;
      purchase_price: number;
    } | null,
    user: User
  ): Medicine {
    const now = new Date().toISOString();
    const newMed: Medicine = {
      ...data,
      id: 'med-' + crypto.randomUUID().slice(0, 8),
      created_at: now,
      updated_at: now,
    };
    this.data.medicines.push(newMed);

    if (initialBatch && initialBatch.quantity > 0) {
      const batch: Batch = {
        id: 'batch-' + crypto.randomUUID().slice(0, 8),
        medicine_id: newMed.id,
        batch_number: initialBatch.batch_number.trim(),
        quantity: Number(initialBatch.quantity),
        initial_quantity: Number(initialBatch.quantity),
        expiry_date: initialBatch.expiry_date,
        purchase_price: Number(initialBatch.purchase_price),
        created_at: now,
      };
      this.data.batches.push(batch);
    }

    this.logAudit(
      user.id,
      user.username,
      'ADD_MEDICINE',
      'medicines',
      `Added medicine "${newMed.name}" (${newMed.generic_name}) - Category: ${newMed.category}`,
      newMed.id
    );
    this.save();
    return newMed;
  }

  public updateMedicine(id: string, updates: Partial<Medicine>, user: User): Medicine {
    const med = this.data.medicines.find((m) => m.id === id);
    if (!med) throw new Error('Medicine not found.');

    const oldPrice = med.sale_price;
    Object.assign(med, updates, { updated_at: new Date().toISOString() });

    this.logAudit(
      user.id,
      user.username,
      'UPDATE_MEDICINE',
      'medicines',
      `Updated medicine ${med.name}. Sale price: ${oldPrice} -> ${med.sale_price}`,
      med.id
    );
    this.save();
    return med;
  }

  public addBatch(batchData: Omit<Batch, 'id' | 'created_at'>, user: User): Batch {
    const med = this.data.medicines.find((m) => m.id === batchData.medicine_id);
    if (!med) throw new Error('Medicine does not exist.');

    const newBatch: Batch = {
      ...batchData,
      id: 'batch-' + crypto.randomUUID().slice(0, 8),
      quantity: Number(batchData.quantity),
      initial_quantity: Number(batchData.initial_quantity || batchData.quantity),
      purchase_price: Number(batchData.purchase_price),
      created_at: new Date().toISOString(),
    };
    this.data.batches.push(newBatch);

    this.logAudit(
      user.id,
      user.username,
      'ADD_BATCH',
      'batches',
      `Added batch ${newBatch.batch_number} for ${med.name}: Qty ${newBatch.quantity}, Expiry ${newBatch.expiry_date}`,
      newBatch.id
    );
    this.save();
    return newBatch;
  }

  // --- Manual Stock Adjustment (Damages, Thefts, Corrections) ---
  public adjustStock(
    data: {
      medicine_id: string;
      batch_id: string;
      change_qty: number;
      type: 'damage' | 'theft' | 'correction' | 'expiry';
      reason: string;
    },
    user: User
  ): StockAdjustment {
    const med = this.data.medicines.find((m) => m.id === data.medicine_id);
    if (!med) throw new Error('Medicine not found.');
    const batch = this.data.batches.find((b) => b.id === data.batch_id);
    if (!batch) throw new Error('Batch not found.');

    const beforeQty = batch.quantity;
    const newQty = beforeQty + data.change_qty;
    if (newQty < 0) {
      throw new Error(`Cannot reduce quantity below 0. Current batch quantity is ${beforeQty}.`);
    }
    batch.quantity = newQty;

    const adjustment: StockAdjustment = {
      id: 'adj-' + crypto.randomUUID().slice(0, 8),
      medicine_id: med.id,
      medicine_name: med.name,
      batch_id: batch.id,
      batch_number: batch.batch_number,
      change_qty: data.change_qty,
      type: data.type,
      reason: data.reason.trim(),
      adjusted_by: user.username,
      created_at: new Date().toISOString(),
    };
    this.data.stock_adjustments.unshift(adjustment);

    this.logAudit(
      user.id,
      user.username,
      'STOCK_ADJUSTMENT',
      'stock_adjustments',
      `Stock adjustment (${data.type}) for ${med.name} [Batch: ${batch.batch_number}]: ${beforeQty} -> ${newQty} (${data.change_qty > 0 ? '+' : ''}${data.change_qty}). Reason: ${data.reason}`,
      adjustment.id
    );
    this.save();
    return adjustment;
  }

  // --- POS / Sales (Atomic FIFO dispensing, Hard Expiry Block, Concurrency lock) ---
  public executeSale(
    saleData: {
      terminal_id: string;
      customer_name?: string;
      customer_phone?: string;
      items: {
        medicine_id: string;
        quantity: number;
        discount_percent?: number;
      }[];
      payments: { method: 'cash' | 'card' | 'wallet'; amount: number }[];
      amount_tendered: number;
      prescription_verified_by?: string | null;
      prescription_notes?: string;
    },
    cashierUser: User,
    role: Role
  ): Sale {
    // Atomic critical section lock
    if (this.writeLock) {
      throw new Error('Server is currently processing another stock transaction. Please retry in a moment.');
    }
    this.writeLock = true;

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const finalizedSaleItems: Sale['items'] = [];
      let subtotal = 0;
      let totalDiscount = 0;
      let totalTax = 0;
      let requiresPrescriptionOverall = false;

      // 1. Verify stock availability and collect FIFO batches
      for (const item of saleData.items) {
        const med = this.data.medicines.find((m) => m.id === item.medicine_id);
        if (!med) {
          throw new Error(`Medicine with ID ${item.medicine_id} not found.`);
        }

        if (med.requires_prescription || med.controlled_substance) {
          requiresPrescriptionOverall = true;
        }

        // Get all unexpired batches ordered by expiry date ASC (FIFO)
        const batches = this.data.batches
          .filter((b) => b.medicine_id === med.id)
          .sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime());

        // Hard patient safety check: filter out expired batches
        const validBatches = batches.filter((b) => b.expiry_date >= todayStr && b.quantity > 0);
        const totalAvailable = validBatches.reduce((acc, b) => acc + b.quantity, 0);

        if (item.quantity > totalAvailable) {
          // Check if there are expired batches that were blocked
          const expiredBatches = batches.filter((b) => b.expiry_date < todayStr && b.quantity > 0);
          const expiredStock = expiredBatches.reduce((acc, b) => acc + b.quantity, 0);

          let errorMsg = `Insufficient unexpired stock for "${med.name}". Requested: ${item.quantity}, Available: ${totalAvailable}.`;
          if (expiredStock > 0) {
            errorMsg += ` (${expiredStock} units are expired and blocked from dispensing for patient safety).`;
          }
          throw new Error(errorMsg);
        }

        // Validate cashier discount limit (hard cap server-side)
        const discountPct = Math.min(Math.max(0, item.discount_percent || 0), role.max_discount_percent);

        // Deduct from batches FIFO
        let remainingToDeduct = item.quantity;

        for (const batch of validBatches) {
          if (remainingToDeduct <= 0) break;

          const deductFromThisBatch = Math.min(batch.quantity, remainingToDeduct);
          batch.quantity -= deductFromThisBatch;
          remainingToDeduct -= deductFromThisBatch;

          const lineUnitPrice = med.sale_price;
          const lineGross = lineUnitPrice * deductFromThisBatch;
          const lineDiscount = (lineGross * discountPct) / 100;
          const lineTax = ((lineGross - lineDiscount) * med.tax_percent) / 100;
          const lineTotal = lineGross - lineDiscount + lineTax;

          subtotal += lineGross;
          totalDiscount += lineDiscount;
          totalTax += lineTax;

          finalizedSaleItems.push({
            medicine_id: med.id,
            medicine_name: med.name,
            batch_id: batch.id,
            batch_number: batch.batch_number,
            expiry_date: batch.expiry_date,
            quantity: deductFromThisBatch,
            unit_price: lineUnitPrice,
            cost_price: batch.purchase_price, // Exact batch cost for profit reports!
            tax_percent: med.tax_percent,
            discount_amount: lineDiscount,
            total: lineTotal,
          });
        }
      }

      // Check prescription verification if required
      if (requiresPrescriptionOverall && !saleData.prescription_verified_by) {
        throw new Error(
          'Sale contains prescription-required or controlled medicine. Pharmacist verification is mandatory before finalizing.'
        );
      }

      const grandTotal = Math.round((subtotal - totalDiscount + totalTax) * 100) / 100;

      // Validate payments
      const totalPaid = saleData.payments.reduce((acc, p) => acc + Number(p.amount || 0), 0);
      if (totalPaid < grandTotal - 0.01) {
        throw new Error(`Total payments (${totalPaid.toFixed(2)}) cannot be less than grand total (${grandTotal.toFixed(2)}).`);
      }

      const changeDue = Math.max(0, (saleData.amount_tendered || totalPaid) - grandTotal);

      // Generate invoice number: INV-YYYYMMDD-XXXX
      const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const countToday = this.data.sales.filter((s) => s.created_at.startsWith(new Date().toISOString().slice(0, 10))).length + 1;
      const invoiceNumber = `INV-${datePrefix}-${String(countToday).padStart(4, '0')}`;

      const sale: Sale = {
        id: 'sale-' + crypto.randomUUID(),
        invoice_number: invoiceNumber,
        terminal_id: saleData.terminal_id || 'Terminal-1',
        cashier_id: cashierUser.id,
        cashier_name: cashierUser.full_name || cashierUser.username,
        customer_name: saleData.customer_name?.trim() || 'Walk-in Customer',
        customer_phone: saleData.customer_phone?.trim(),
        items: finalizedSaleItems,
        subtotal: Math.round(subtotal * 100) / 100,
        discount_total: Math.round(totalDiscount * 100) / 100,
        tax_total: Math.round(totalTax * 100) / 100,
        total: grandTotal,
        payments: saleData.payments,
        amount_tendered: saleData.amount_tendered || totalPaid,
        change_due: Math.round(changeDue * 100) / 100,
        requires_prescription: requiresPrescriptionOverall,
        prescription_verified_by: saleData.prescription_verified_by,
        prescription_notes: saleData.prescription_notes,
        status: 'completed',
        created_at: new Date().toISOString(),
      };

      this.data.sales.unshift(sale);

      this.logAudit(
        cashierUser.id,
        cashierUser.username,
        'CREATE_SALE',
        'sales',
        `Completed sale ${sale.invoice_number} on ${sale.terminal_id} - Total: ${sale.total} ${this.data.pharmacy_info.currency}`,
        sale.id
      );

      this.save();
      return sale;
    } finally {
      this.writeLock = false;
    }
  }

  // --- Sales Return ---
  public processSaleReturn(
    data: {
      sale_id: string;
      items: {
        medicine_id: string;
        batch_id: string;
        quantity: number;
        refund_amount: number;
      }[];
      reason: string;
    },
    authorizedUser: User
  ): SaleReturn {
    const sale = this.data.sales.find((s) => s.id === data.sale_id);
    if (!sale) throw new Error('Original sale invoice not found.');

    let totalRefund = 0;
    const returnLines: SaleReturn['items'] = [];

    // Re-add stock to the respective batches
    for (const item of data.items) {
      const saleItem = sale.items.find(
        (si) => si.medicine_id === item.medicine_id && si.batch_id === item.batch_id
      );
      if (!saleItem) {
        throw new Error(`Item ${item.medicine_id} not part of original invoice.`);
      }
      if (item.quantity > saleItem.quantity) {
        throw new Error(`Return quantity (${item.quantity}) exceeds sold quantity (${saleItem.quantity}).`);
      }

      const batch = this.data.batches.find((b) => b.id === item.batch_id);
      if (batch) {
        batch.quantity += item.quantity;
      }

      totalRefund += item.refund_amount;
      returnLines.push({
        medicine_id: item.medicine_id,
        medicine_name: saleItem.medicine_name,
        batch_id: item.batch_id,
        quantity: item.quantity,
        refund_amount: item.refund_amount,
      });
    }

    const returnNumber = `RET-${Date.now().toString().slice(-6)}`;
    const saleReturn: SaleReturn = {
      id: 'ret-' + crypto.randomUUID(),
      return_number: returnNumber,
      sale_id: sale.id,
      invoice_number: sale.invoice_number,
      items: returnLines,
      total_refund: totalRefund,
      reason: data.reason.trim(),
      authorized_by: authorizedUser.username,
      created_at: new Date().toISOString(),
    };

    sale.status = 'returned';
    this.data.sales_returns.unshift(saleReturn);

    this.logAudit(
      authorizedUser.id,
      authorizedUser.username,
      'PROCESS_RETURN',
      'sales_returns',
      `Processed return ${returnNumber} for Invoice ${sale.invoice_number}. Refund: ${totalRefund}. Reason: ${data.reason}`,
      saleReturn.id
    );

    this.save();
    return saleReturn;
  }

  // --- Suppliers & Purchases ---
  public getSuppliers(): Supplier[] {
    return this.data.suppliers;
  }

  public addSupplier(supplier: Omit<Supplier, 'id' | 'created_at'>, user: User): Supplier {
    const newSup: Supplier = {
      ...supplier,
      id: 'sup-' + crypto.randomUUID().slice(0, 8),
      created_at: new Date().toISOString(),
    };
    this.data.suppliers.push(newSup);
    this.logAudit(user.id, user.username, 'ADD_SUPPLIER', 'suppliers', `Added supplier ${newSup.name}`, newSup.id);
    this.save();
    return newSup;
  }

  public getPurchaseOrders(): PurchaseOrder[] {
    return this.data.purchase_orders;
  }

  public createPurchaseOrder(
    poData: {
      supplier_id: string;
      items: { medicine_id: string; ordered_quantity: number; unit_cost: number }[];
      notes?: string;
    },
    user: User
  ): PurchaseOrder {
    const sup = this.data.suppliers.find((s) => s.id === poData.supplier_id);
    if (!sup) throw new Error('Supplier not found.');

    const poNumber = `PO-${Date.now().toString().slice(-6)}`;
    let total = 0;

    const poItems = poData.items.map((it) => {
      const med = this.data.medicines.find((m) => m.id === it.medicine_id);
      const lineTotal = it.ordered_quantity * it.unit_cost;
      total += lineTotal;
      return {
        medicine_id: it.medicine_id,
        medicine_name: med ? med.name : 'Unknown Medicine',
        ordered_quantity: it.ordered_quantity,
        received_quantity: 0,
        unit_cost: it.unit_cost,
        total: lineTotal,
      };
    });

    const po: PurchaseOrder = {
      id: 'po-' + crypto.randomUUID(),
      po_number: poNumber,
      supplier_id: sup.id,
      supplier_name: sup.name,
      order_date: new Date().toISOString().split('T')[0],
      status: 'ordered',
      items: poItems,
      total_amount: total,
      notes: poData.notes,
      created_by: user.username,
      created_at: new Date().toISOString(),
    };

    this.data.purchase_orders.unshift(po);
    this.logAudit(
      user.id,
      user.username,
      'CREATE_PURCHASE_ORDER',
      'purchase_orders',
      `Created ${po.po_number} with ${sup.name} for amount ${total}`,
      po.id
    );
    this.save();
    return po;
  }

  public receivePurchaseOrder(
    poId: string,
    receiptData: {
      items: {
        medicine_id: string;
        batch_number: string;
        expiry_date: string;
        received_quantity: number;
        unit_cost: number;
      }[];
    },
    user: User
  ): PurchaseOrder {
    const po = this.data.purchase_orders.find((p) => p.id === poId);
    if (!po) throw new Error('Purchase order not found.');

    for (const item of receiptData.items) {
      const poItem = po.items.find((i) => i.medicine_id === item.medicine_id);
      if (poItem) {
        poItem.received_quantity += item.received_quantity;
      }

      // Automatically create a new batch record as required by Section 3.2 & 5!
      const newBatch: Batch = {
        id: 'batch-' + crypto.randomUUID().slice(0, 8),
        medicine_id: item.medicine_id,
        batch_number: item.batch_number.trim(),
        quantity: item.received_quantity,
        initial_quantity: item.received_quantity,
        expiry_date: item.expiry_date,
        purchase_price: item.unit_cost,
        created_at: new Date().toISOString(),
      };
      this.data.batches.push(newBatch);
    }

    const allReceived = po.items.every((i) => i.received_quantity >= i.ordered_quantity);
    po.status = allReceived ? 'received' : 'partially_received';

    this.logAudit(
      user.id,
      user.username,
      'RECEIVE_PURCHASE_STOCK',
      'purchase_orders',
      `Received stock for PO ${po.po_number}. Status updated to: ${po.status}`,
      po.id
    );
    this.save();
    return po;
  }

  // --- License State ---
  public getLicenseState(): LicenseState {
    return this.data.license_state;
  }

  public setLicenseState(state: Partial<LicenseState>) {
    this.data.license_state = {
      ...this.data.license_state,
      ...state,
    };
    this.save();
  }

  // --- Backup Logs ---
  public addBackupLog(log: Omit<BackupLog, 'id' | 'timestamp'>): BackupLog {
    const newLog: BackupLog = {
      ...log,
      id: 'backup-' + crypto.randomUUID().slice(0, 8),
      timestamp: new Date().toISOString(),
    };
    this.data.backup_logs.unshift(newLog);
    if (this.data.backup_logs.length > 50) {
      this.data.backup_logs = this.data.backup_logs.slice(0, 50);
    }
    this.save();
    return newLog;
  }
}

export const db = new PharmacyDatabase();
