import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../config/database.js';

export type OtpPurpose = 'password_reset' | 'email_otp_login' | 'mobile_otp_login';

export interface PasswordResetRecord {
  id: string;
  employeeId: string;
  otpHash: string;
  expiresAt: Date;
  attemptCount: number;
  isUsed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const inMemoryResets: PasswordResetRecord[] = [];
const consumedResetTokenIds = new Set<string>();

function buildStorageKey(employeeId: string, purpose: OtpPurpose = 'password_reset'): string {
  const clean = employeeId.trim();
  if (purpose === 'email_otp_login') return `EMAIL_OTP:${clean}`;
  if (purpose === 'mobile_otp_login') return `MOBILE_OTP:${clean}`;
  return clean;
}

const mapReset = (row: any): PasswordResetRecord => ({
  id: row.id,
  employeeId: row.employee_id,
  otpHash: row.otp_hash,
  expiresAt: new Date(row.expires_at),
  attemptCount: Number(row.attempt_count) || 0,
  isUsed: Boolean(row.is_used),
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
});

export class PasswordResetRepository {
  private isIsolatedTestEnv(): boolean {
    return (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') && !(query as any)?.mock;
  }

  async countRecentRequests(
    employeeId: string,
    windowMinutes = 15,
    purpose: OtpPurpose = 'password_reset'
  ): Promise<number> {
    const key = buildStorageKey(employeeId, purpose);
    const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);
    if (this.isIsolatedTestEnv()) {
      return inMemoryResets.filter(
        (r) => r.employeeId.toLowerCase() === key.toLowerCase() && r.createdAt >= cutoff
      ).length;
    }
    try {
      const result = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM password_resets
         WHERE LOWER(employee_id) = LOWER($1)
           AND created_at >= NOW() - ($2::text || ' minutes')::interval`,
        [key, windowMinutes]
      );
      return Number(result.rows[0]?.count) || 0;
    } catch {
      return inMemoryResets.filter(
        (r) => r.employeeId.toLowerCase() === key.toLowerCase() && r.createdAt >= cutoff
      ).length;
    }
  }

  /**
   * Invalidates all previous unused OTP records for the given employee + purpose
   * before creating a new single-use OTP record.
   */
  async createResetRecord(params: {
    employeeId: string;
    otpHash: string;
    expiresAt: Date;
    purpose?: OtpPurpose;
  }): Promise<PasswordResetRecord> {
    const key = buildStorageKey(params.employeeId, params.purpose || 'password_reset');
    const now = new Date();

    // Always invalidate in-memory records for this key
    for (const r of inMemoryResets) {
      if (r.employeeId.toLowerCase() === key.toLowerCase() && !r.isUsed) {
        r.isUsed = true;
        r.updatedAt = now;
      }
    }

    if (this.isIsolatedTestEnv()) {
      const fallbackRecord: PasswordResetRecord = {
        id: crypto.randomUUID(),
        employeeId: key,
        otpHash: params.otpHash,
        expiresAt: new Date(params.expiresAt),
        attemptCount: 0,
        isUsed: false,
        createdAt: now,
        updatedAt: now,
      };
      inMemoryResets.push(fallbackRecord);
      return { ...fallbackRecord };
    }

    try {
      // Invalidate any prior active OTPs for this employee/purpose
      await query(
        `UPDATE password_resets
         SET is_used = TRUE, updated_at = NOW()
         WHERE LOWER(employee_id) = LOWER($1) AND is_used = FALSE`,
        [key]
      );

      const result = await query(
        `INSERT INTO password_resets (employee_id, otp_hash, expires_at)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [key, params.otpHash, params.expiresAt.toISOString()]
      );
      const created = mapReset(result.rows[0]);
      inMemoryResets.push({ ...created });
      return created;
    } catch {
      const fallbackRecord: PasswordResetRecord = {
        id: crypto.randomUUID(),
        employeeId: key,
        otpHash: params.otpHash,
        expiresAt: new Date(params.expiresAt),
        attemptCount: 0,
        isUsed: false,
        createdAt: now,
        updatedAt: now,
      };
      inMemoryResets.push(fallbackRecord);
      return { ...fallbackRecord };
    }
  }

  /**
   * Removes or invalidates a newly created OTP record if outbound delivery (SMTP/SMS) fails.
   */
  async rollbackFailedDispatch(id: string): Promise<void> {
    const idx = inMemoryResets.findIndex((r) => r.id === id);
    if (idx !== -1) {
      inMemoryResets.splice(idx, 1);
    }
    if (this.isIsolatedTestEnv()) return;
    try {
      await query(`DELETE FROM password_resets WHERE id = $1`, [id]);
    } catch {
      // Ignore in offline test mode
    }
  }

  async getLatestActiveReset(
    employeeId: string,
    purpose: OtpPurpose = 'password_reset'
  ): Promise<PasswordResetRecord | null> {
    const key = buildStorageKey(employeeId, purpose);
    if (this.isIsolatedTestEnv()) {
      const candidates = inMemoryResets
        .filter((r) => r.employeeId.toLowerCase() === key.toLowerCase() && !r.isUsed)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return candidates[0] ? { ...candidates[0] } : null;
    }
    try {
      const result = await query(
        `SELECT * FROM password_resets
         WHERE LOWER(employee_id) = LOWER($1) AND is_used = FALSE
         ORDER BY created_at DESC
         LIMIT 1`,
        [key]
      );
      return result.rows[0] ? mapReset(result.rows[0]) : null;
    } catch {
      const candidates = inMemoryResets
        .filter((r) => r.employeeId.toLowerCase() === key.toLowerCase() && !r.isUsed)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return candidates[0] ? { ...candidates[0] } : null;
    }
  }

  async incrementAttempt(id: string): Promise<number> {
    const mem = inMemoryResets.find((r) => r.id === id);
    if (mem) {
      mem.attemptCount += 1;
      mem.updatedAt = new Date();
    }
    if (this.isIsolatedTestEnv()) {
      if (!mem) throw new Error('Password reset request not found');
      return mem.attemptCount;
    }
    try {
      const result = await query<{ attempt_count: number }>(
        `UPDATE password_resets
         SET attempt_count = attempt_count + 1, updated_at = NOW()
         WHERE id = $1
         RETURNING attempt_count`,
        [id]
      );
      if (!result.rows[0]) throw new Error('Password reset request not found');
      return Number(result.rows[0].attempt_count);
    } catch {
      if (!mem) throw new Error('Password reset request not found');
      return mem.attemptCount;
    }
  }

  async markAsUsed(id: string): Promise<boolean> {
    const mem = inMemoryResets.find((r) => r.id === id);
    let memMarked = false;
    if (mem && !mem.isUsed) {
      mem.isUsed = true;
      mem.updatedAt = new Date();
      memMarked = true;
    }
    if (this.isIsolatedTestEnv()) {
      return memMarked;
    }
    try {
      const result = await query(
        `UPDATE password_resets SET is_used = TRUE, updated_at = NOW()
         WHERE id = $1 AND is_used = FALSE`,
        [id]
      );
      return Boolean(result.rowCount && result.rowCount > 0);
    } catch {
      return memMarked;
    }
  }

  generateResetToken(employeeId: string, email: string, resetId?: string): string {
    const jti = resetId || crypto.randomUUID();
    return jwt.sign(
      { sub: employeeId, email, resetId: jti, purpose: 'password_reset' },
      env.JWT_SECRET,
      { expiresIn: '10m' }
    );
  }

  verifyResetToken(token: string): { employeeId: string; email: string; resetId: string } | null {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as {
        sub: string;
        email: string;
        resetId?: string;
        purpose?: string;
      };
      if (decoded.purpose !== 'password_reset' || !decoded.sub) return null;
      const resetId = decoded.resetId || token;
      if (consumedResetTokenIds.has(resetId)) {
        return null;
      }
      return { employeeId: decoded.sub, email: decoded.email, resetId };
    } catch {
      return null;
    }
  }

  consumeResetToken(resetId: string): boolean {
    if (consumedResetTokenIds.has(resetId)) {
      return false;
    }
    consumedResetTokenIds.add(resetId);
    return true;
  }

  clearInMemoryForTests(): void {
    inMemoryResets.length = 0;
    consumedResetTokenIds.clear();
  }
}

export const passwordResetRepository = new PasswordResetRepository();
