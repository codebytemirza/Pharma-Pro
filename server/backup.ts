import fs from 'fs';
import path from 'path';
import { db } from './db.js';
import { BackupLog } from '../src/types.js';
import { resolveGitHubRepo } from './github.js';

const BACKUP_DIR = path.join(process.cwd(), 'backups');

export class BackupManager {
  constructor() {
    this.ensureBackupDir();
    // Run nightly backup check
    setInterval(() => {
      this.runScheduledBackup();
    }, 24 * 60 * 60 * 1000);
  }

  private ensureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
  }

  public generateSqlDump(): string {
    const raw = db.getRawData();
    const dateStr = new Date().toISOString();
    let sql = `-- Pharmacy Management System Local Database Dump\n`;
    sql += `-- Pharmacy ID: ${raw.pharmacy_info.unique_pharmacy_id}\n`;
    sql += `-- Generated At: ${dateStr}\n\n`;

    sql += `CREATE TABLE IF NOT EXISTS pharmacy_info (unique_id TEXT PRIMARY KEY, business_name TEXT, address TEXT, phone TEXT, currency TEXT);\n`;
    sql += `INSERT OR REPLACE INTO pharmacy_info VALUES ('${raw.pharmacy_info.unique_pharmacy_id}', '${raw.pharmacy_info.business_name.replace(/'/g, "''")}', '${raw.pharmacy_info.address.replace(/'/g, "''")}', '${raw.pharmacy_info.phone}', '${raw.pharmacy_info.currency}');\n\n`;

    sql += `CREATE TABLE IF NOT EXISTS medicines (id TEXT PRIMARY KEY, name TEXT, generic_name TEXT, category TEXT, sale_price REAL, purchase_price REAL, barcode TEXT);\n`;
    for (const m of raw.medicines) {
      sql += `INSERT OR REPLACE INTO medicines VALUES ('${m.id}', '${m.name.replace(/'/g, "''")}', '${m.generic_name.replace(/'/g, "''")}', '${m.category.replace(/'/g, "''")}', ${m.sale_price}, ${m.purchase_price}, '${m.barcode}');\n`;
    }

    sql += `\nCREATE TABLE IF NOT EXISTS batches (id TEXT PRIMARY KEY, medicine_id TEXT, batch_number TEXT, quantity INTEGER, expiry_date TEXT, purchase_price REAL);\n`;
    for (const b of raw.batches) {
      sql += `INSERT OR REPLACE INTO batches VALUES ('${b.id}', '${b.medicine_id}', '${b.batch_number}', ${b.quantity}, '${b.expiry_date}', ${b.purchase_price});\n`;
    }

    sql += `\nCREATE TABLE IF NOT EXISTS sales (id TEXT PRIMARY KEY, invoice_number TEXT, cashier_name TEXT, total REAL, created_at TEXT);\n`;
    for (const s of raw.sales) {
      sql += `INSERT OR REPLACE INTO sales VALUES ('${s.id}', '${s.invoice_number}', '${s.cashier_name.replace(/'/g, "''")}', ${s.total}, '${s.created_at}');\n`;
    }

    return sql;
  }

  public async runBackup(type: 'github' | 'manual_export' = 'github'): Promise<BackupLog> {
    this.ensureBackupDir();
    const dateStr = new Date().toISOString().slice(0, 10);
    const pharmacyId = db.getPharmacyInfo().unique_pharmacy_id || 'PHARM-UNKNOWN';
    const fileName = `${dateStr}.sql`;
    const localFilePath = path.join(BACKUP_DIR, `${pharmacyId}_${fileName}`);

    const sqlContent = this.generateSqlDump();
    const sizeKb = Math.round((Buffer.byteLength(sqlContent, 'utf8') / 1024) * 10) / 10;

    // Save locally
    try {
      fs.writeFileSync(localFilePath, sqlContent, 'utf-8');
    } catch (err: any) {
      console.error('Failed to write local backup file:', err);
    }

    const githubToken = process.env.GITHUB_TOKEN || '';
    const rawRepo = process.env.GITHUB_REPO || '';
    const githubRepo = await resolveGitHubRepo(githubToken, rawRepo);

    // If GitHub backup requested and configured
    if (type === 'github' && githubToken && githubRepo && !githubRepo.includes('owner/')) {
      try {
        const repoPath = `backups/${pharmacyId}/${fileName}`;
        const url = `https://api.github.com/repos/${githubRepo}/contents/${repoPath}`;

        // Check if file already exists to get SHA
        let sha: string | undefined = undefined;
        try {
          const checkRes = await fetch(url, {
            headers: {
              Authorization: `token ${githubToken}`,
              'User-Agent': 'Pharmacy-Management-Backup-Agent',
            },
          });
          if (checkRes.ok) {
            const fileData = await checkRes.json();
            sha = fileData.sha;
          }
        } catch {
          // New file
        }

        const commitRes = await fetch(url, {
          method: 'PUT',
          headers: {
            Authorization: `token ${githubToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Pharmacy-Management-Backup-Agent',
          },
          body: JSON.stringify({
            message: `Automated database backup for ${pharmacyId} on ${dateStr}`,
            content: Buffer.from(sqlContent).toString('base64'),
            sha,
          }),
        });

        if (!commitRes.ok) {
          const errData = await commitRes.text();
          throw new Error(`GitHub upload failed with HTTP ${commitRes.status}: ${errData}`);
        }

        return db.addBackupLog({
          status: 'success',
          backup_type: 'github',
          details: `Pushed backup to ${githubRepo}/${repoPath} (${sizeKb} KB)`,
          file_name: fileName,
          size_kb: sizeKb,
        });
      } catch (err: any) {
        console.warn('GitHub backup push failed:', err.message);
        return db.addBackupLog({
          status: 'failed',
          backup_type: 'github',
          details: `Local backup saved (${sizeKb} KB), but GitHub push failed: ${err.message}`,
          file_name: fileName,
          size_kb: sizeKb,
        });
      }
    }

    // Manual or offline local backup
    return db.addBackupLog({
      status: 'success',
      backup_type: 'manual_export',
      details: `Local database snapshot created successfully (${sizeKb} KB).`,
      file_name: fileName,
      size_kb: sizeKb,
    });
  }

  private async runScheduledBackup() {
    const raw = db.getRawData();
    if (!raw.settings.enable_github_backup) return;
    await this.runBackup('github');
  }
}

export const backupManager = new BackupManager();
