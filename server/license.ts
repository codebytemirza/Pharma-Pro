import { db } from './db.js';
import { LicenseState } from '../src/types.js';
import { resolveGitHubRepo } from './github.js';

const GRACE_PERIOD_DAYS = 14;

export class LicenseManager {
  private timer: NodeJS.Timeout | null = null;
  private onStatusChangeCallback: ((state: LicenseState) => void) | null = null;

  constructor() {
    // Initial check after short delay
    setTimeout(() => {
      this.checkLicense();
    }, 1500);

    // Periodic check every 6 hours
    this.timer = setInterval(() => {
      this.checkLicense();
    }, 6 * 60 * 60 * 1000);
  }

  public setOnStatusChange(cb: (state: LicenseState) => void) {
    this.onStatusChangeCallback = cb;
  }

  public async checkLicense(forceRemote: boolean = false): Promise<LicenseState> {
    const currentState = db.getLicenseState();

    // If developer simulation is active and not forced from remote check
    if (currentState.simulated && !forceRemote) {
      return currentState;
    }

    const githubToken = process.env.GITHUB_TOKEN || '';
    const rawRepo = process.env.GITHUB_REPO || '';
    const githubRepo = await resolveGitHubRepo(githubToken, rawRepo);

    // If GitHub token and repo are not configured, use local license state
    if (!githubToken || !githubRepo || githubRepo.includes('owner/')) {
      const isExpired = new Date(currentState.expires).getTime() < Date.now();
      const updated: LicenseState = {
        ...currentState,
        status: isExpired ? 'expired' : currentState.status,
        last_checked_at: new Date().toISOString(),
        message: 'Running in local/offline license verification mode.',
      };
      db.setLicenseState(updated);
      if (this.onStatusChangeCallback) this.onStatusChangeCallback(updated);
      return updated;
    }

    try {
      // Call GitHub API to fetch /license/license.json
      const url = `https://api.github.com/repos/${githubRepo}/contents/license/license.json`;
      let response = await fetch(url, {
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: 'application/vnd.github.v3.raw',
          'User-Agent': 'Pharmacy-Management-System-Local-Server',
        },
      });

      let licenseData: any;

      if (response.status === 404) {
        // If license file doesn't exist yet on the configured repository, auto-initialize it
        const defaultLicense = {
          status: 'active',
          licensed_to: currentState.licensed_to || 'Pharmacy Store',
          expires: currentState.expires || '2028-12-31',
          max_terminals: currentState.max_terminals || 5,
          last_verified: new Date().toISOString(),
        };

        const putRes = await fetch(url, {
          method: 'PUT',
          headers: {
            Authorization: `token ${githubToken}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'Pharmacy-Management-System-Local-Server',
          },
          body: JSON.stringify({
            message: 'Initialize pharmacy license file',
            content: Buffer.from(JSON.stringify(defaultLicense, null, 2)).toString('base64'),
          }),
        });

        if (putRes.ok) {
          licenseData = defaultLicense;
        } else {
          throw new Error(`license/license.json not found in repository ${githubRepo}`);
        }
      } else if (!response.ok) {
        throw new Error(`GitHub API returned status ${response.status}: ${response.statusText}`);
      } else {
        licenseData = await response.json();
      }

      const now = new Date();
      const expiryDate = new Date(licenseData.expires);
      const isPastExpiry = expiryDate.getTime() < now.getTime();

      let effectiveStatus: 'active' | 'inactive' | 'expired' = 'active';
      if (licenseData.status === 'inactive') {
        effectiveStatus = 'inactive';
      } else if (isPastExpiry) {
        effectiveStatus = 'expired';
      }

      const newState: LicenseState = {
        status: effectiveStatus,
        licensed_to: licenseData.licensed_to || currentState.licensed_to,
        expires: licenseData.expires,
        max_terminals: licenseData.max_terminals || 5,
        last_checked_at: now.toISOString(),
        last_valid_at: effectiveStatus === 'active' ? now.toISOString() : currentState.last_valid_at,
        last_verified: now.toISOString(),
        offline_days_remaining: GRACE_PERIOD_DAYS,
        is_grace_period: false,
        simulated: false,
        message: effectiveStatus === 'active' ? 'License remotely verified via GitHub.' : undefined,
      };

      db.setLicenseState(newState);
      if (this.onStatusChangeCallback) this.onStatusChangeCallback(newState);
      return newState;
    } catch (err: any) {
      // Offline or network error -> use offline grace period
      const lastValid = new Date(currentState.last_valid_at || Date.now());
      const daysSinceValid = (Date.now() - lastValid.getTime()) / (1000 * 60 * 60 * 24);

      let status = currentState.status;
      let isGrace = false;

      if (daysSinceValid <= GRACE_PERIOD_DAYS) {
        // Within 14-day grace period
        isGrace = true;
      } else {
        // Grace period expired, lock mode
        status = 'inactive';
      }

      const daysRemaining = Math.max(0, Math.ceil(GRACE_PERIOD_DAYS - daysSinceValid));

      const fallbackState: LicenseState = {
        ...currentState,
        status,
        last_checked_at: new Date().toISOString(),
        last_verified: currentState.last_verified || currentState.last_valid_at,
        offline_days_remaining: daysRemaining,
        is_grace_period: isGrace,
        message: isGrace
          ? `Operating in offline grace period (${daysRemaining} days remaining).`
          : 'Grace period expired without online re-verification.',
      };

      db.setLicenseState(fallbackState);
      if (this.onStatusChangeCallback) this.onStatusChangeCallback(fallbackState);
      return fallbackState;
    }
  }

  // Developer simulation helper for testing lock state
  public simulateState(status: 'active' | 'inactive' | 'expired', expiresDate?: string): LicenseState {
    const currentState = db.getLicenseState();
    const updated: LicenseState = {
      ...currentState,
      status,
      expires: expiresDate || currentState.expires,
      simulated: true,
      last_checked_at: new Date().toISOString(),
    };
    db.setLicenseState(updated);
    if (this.onStatusChangeCallback) this.onStatusChangeCallback(updated);
    return updated;
  }
}

export const licenseManager = new LicenseManager();
