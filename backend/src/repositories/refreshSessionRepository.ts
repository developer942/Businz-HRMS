import crypto from 'crypto';
import { query } from '../config/database.js';
import { env } from '../config/env.js';

export const REFRESH_COOKIE_NAME = 'businz_hrms_rt';
const SLIDING_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days sliding window
const ABSOLUTE_MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days hard ceiling
const ROTATION_GRACE_MS = 20 * 1000; // 20s grace window for concurrent multi-tab / multi-request refresh

export interface RefreshSessionRecord {
  id: string;
  userId: string;
  employeeCode: string;
  tokenHash: string;
  tokenFamily: string;
  replacedByHash: string | null;
  graceUntil: Date | null;
  authMethod: 'password' | 'email_otp' | 'mobile_otp';
  userAgent?: string | null;
  ipAddress?: string | null;
  absoluteExpiresAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date;
  createdAt: Date;
}

export interface RotateResult {
  status: 'ROTATED' | 'GRACE_REUSED' | 'INVALID' | 'EXPIRED' | 'REVOKED' | 'REPLAY_DETECTED';
  session?: RefreshSessionRecord;
  newRefreshToken?: string;
  newExpiresAt?: Date;
}

const isIsolatedTestEnv = (): boolean =>
  (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true' || (env.NODE_ENV as string) === 'test') &&
  !(query as any)?.mock;

const hashRefreshToken = (rawToken: string): string =>
  crypto.createHash('sha256').update(rawToken).digest('hex');

const generateRawRefreshToken = (): string =>
  crypto.randomBytes(48).toString('base64url');

// In-memory store strictly for isolated unit tests (and DB-unavailable fallback safety)
const memorySessionsByHash = new Map<string, RefreshSessionRecord>();

let schemaEnsured = false;
let schemaEnsurePromise: Promise<void> | null = null;

async function ensureRefreshTable(): Promise<boolean> {
  if (isIsolatedTestEnv()) return false;
  if (schemaEnsured) return true;
  if (!schemaEnsurePromise) {
    schemaEnsurePromise = (async () => {
      try {
        await query(`
          CREATE TABLE IF NOT EXISTS public.auth_refresh_tokens (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id TEXT NOT NULL,
            employee_code TEXT NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            token_family UUID NOT NULL,
            replaced_by_hash TEXT NULL,
            grace_until TIMESTAMPTZ NULL,
            auth_method TEXT NOT NULL DEFAULT 'password',
            user_agent TEXT NULL,
            ip_address TEXT NULL,
            absolute_expires_at TIMESTAMPTZ NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            revoked_at TIMESTAMPTZ NULL,
            last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_employee_active
            ON public.auth_refresh_tokens (LOWER(employee_code))
            WHERE revoked_at IS NULL;
          CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_family
            ON public.auth_refresh_tokens (token_family);
        `);
        schemaEnsured = true;
      } catch (err) {
        schemaEnsurePromise = null;
        throw err;
      }
    })();
  }
  try {
    await schemaEnsurePromise;
    return true;
  } catch {
    return false;
  }
}

const mapRow = (row: any): RefreshSessionRecord => ({
  id: String(row.id),
  userId: String(row.user_id),
  employeeCode: String(row.employee_code),
  tokenHash: String(row.token_hash),
  tokenFamily: String(row.token_family),
  replacedByHash: row.replaced_by_hash ? String(row.replaced_by_hash) : null,
  graceUntil: row.grace_until ? new Date(row.grace_until) : null,
  authMethod: (row.auth_method || 'password') as 'password' | 'email_otp' | 'mobile_otp',
  userAgent: row.user_agent || null,
  ipAddress: row.ip_address || null,
  absoluteExpiresAt: new Date(row.absolute_expires_at),
  expiresAt: new Date(row.expires_at),
  revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
  lastUsedAt: new Date(row.last_used_at),
  createdAt: new Date(row.created_at),
});

export class RefreshSessionRepository {
  resetMemoryStoreForTests(): void {
    memorySessionsByHash.clear();
  }

  hashToken(token: string): string {
    return hashRefreshToken(token);
  }

  async createSession(params: {
    userId: string;
    employeeCode: string;
    authMethod?: 'password' | 'email_otp' | 'mobile_otp';
    userAgent?: string;
    ipAddress?: string;
  }): Promise<{ refreshToken: string; expiresAt: Date; tokenFamily: string }> {
    const rawToken = generateRawRefreshToken();
    const tokenHash = hashRefreshToken(rawToken);
    const tokenFamily = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = new Date(now + SLIDING_TTL_MS);
    const absoluteExpiresAt = new Date(now + ABSOLUTE_MAX_TTL_MS);
    const authMethod = params.authMethod || 'password';

    const useDb = await ensureRefreshTable();
    if (!useDb) {
      const rec: RefreshSessionRecord = {
        id: crypto.randomUUID(),
        userId: params.userId,
        employeeCode: params.employeeCode,
        tokenHash,
        tokenFamily,
        replacedByHash: null,
        graceUntil: null,
        authMethod,
        userAgent: params.userAgent || null,
        ipAddress: params.ipAddress || null,
        absoluteExpiresAt,
        expiresAt,
        revokedAt: null,
        lastUsedAt: new Date(now),
        createdAt: new Date(now),
      };
      memorySessionsByHash.set(tokenHash, rec);
      return { refreshToken: rawToken, expiresAt, tokenFamily };
    }

    await query(
      `INSERT INTO public.auth_refresh_tokens
         (user_id, employee_code, token_hash, token_family, auth_method, user_agent, ip_address, absolute_expires_at, expires_at)
       VALUES ($1, $2, $3, $4::uuid, $5, $6, $7, $8, $9)`,
      [
        params.userId,
        params.employeeCode,
        tokenHash,
        tokenFamily,
        authMethod,
        params.userAgent ? params.userAgent.slice(0, 250) : null,
        params.ipAddress ? params.ipAddress.slice(0, 64) : null,
        absoluteExpiresAt.toISOString(),
        expiresAt.toISOString(),
      ]
    );

    // Opportunistic expired token pruning (~2% of logins)
    if (Math.random() < 0.02) {
      void query(
        `DELETE FROM public.auth_refresh_tokens WHERE expires_at < NOW() - INTERVAL '7 days' OR revoked_at < NOW() - INTERVAL '7 days'`
      ).catch(() => {});
    }

    return { refreshToken: rawToken, expiresAt, tokenFamily };
  }

  /**
   * Rotates a refresh token safely with a 20-second concurrent grace window so
   * simultaneous API calls or multiple browser tabs refreshing at the same instant
   * never invalidate an employee's valid session.
   */
  async rotateSession(rawToken: string, meta?: { userAgent?: string; ipAddress?: string }): Promise<RotateResult> {
    if (!rawToken || rawToken.length < 24) {
      return { status: 'INVALID' };
    }
    const tokenHash = hashRefreshToken(rawToken);
    const now = new Date();
    const useDb = await ensureRefreshTable();

    if (!useDb) {
      const existing = memorySessionsByHash.get(tokenHash);
      if (!existing) return { status: 'INVALID' };
      if (existing.revokedAt) return { status: 'REVOKED' };
      if (existing.expiresAt <= now || existing.absoluteExpiresAt <= now) return { status: 'EXPIRED' };

      if (existing.replacedByHash) {
        if (existing.graceUntil && existing.graceUntil > now) {
          // Concurrent refresh within grace window: allow without revoking family
          return { status: 'GRACE_REUSED', session: existing };
        }
        // Replay outside grace window: revoke entire token family
        for (const rec of memorySessionsByHash.values()) {
          if (rec.tokenFamily === existing.tokenFamily && !rec.revokedAt) {
            rec.revokedAt = now;
          }
        }
        return { status: 'REPLAY_DETECTED' };
      }

      const newRawToken = generateRawRefreshToken();
      const newHash = hashRefreshToken(newRawToken);
      const nextExpiry = new Date(Math.min(existing.absoluteExpiresAt.getTime(), now.getTime() + SLIDING_TTL_MS));
      existing.replacedByHash = newHash;
      existing.graceUntil = new Date(now.getTime() + ROTATION_GRACE_MS);
      existing.lastUsedAt = now;

      const rotated: RefreshSessionRecord = {
        ...existing,
        id: crypto.randomUUID(),
        tokenHash: newHash,
        replacedByHash: null,
        graceUntil: null,
        expiresAt: nextExpiry,
        lastUsedAt: now,
        createdAt: now,
      };
      memorySessionsByHash.set(newHash, rotated);
      return { status: 'ROTATED', session: rotated, newRefreshToken: newRawToken, newExpiresAt: nextExpiry };
    }

    const foundRes = await query(
      `SELECT * FROM public.auth_refresh_tokens WHERE token_hash = $1 LIMIT 1`,
      [tokenHash]
    );
    if (!foundRes.rows.length) {
      return { status: 'INVALID' };
    }

    const existing = mapRow(foundRes.rows[0]);
    if (existing.revokedAt) {
      return { status: 'REVOKED' };
    }
    if (existing.expiresAt <= now || existing.absoluteExpiresAt <= now) {
      return { status: 'EXPIRED' };
    }

    // Check if another concurrent tab/request already rotated this token within the grace window
    if (existing.replacedByHash) {
      if (existing.graceUntil && existing.graceUntil > now) {
        return { status: 'GRACE_REUSED', session: existing };
      }
      // Replay after grace window: revoke the entire family to protect against token theft
      await query(
        `UPDATE public.auth_refresh_tokens SET revoked_at = NOW() WHERE token_family = $1::uuid AND revoked_at IS NULL`,
        [existing.tokenFamily]
      );
      return { status: 'REPLAY_DETECTED' };
    }

    const newRawToken = generateRawRefreshToken();
    const newHash = hashRefreshToken(newRawToken);
    const nextExpiry = new Date(Math.min(existing.absoluteExpiresAt.getTime(), now.getTime() + SLIDING_TTL_MS));
    const graceUntil = new Date(now.getTime() + ROTATION_GRACE_MS);

    // Atomic conditional update prevents race where two concurrent requests both try to rotate the same row
    const claimRes = await query(
      `UPDATE public.auth_refresh_tokens
       SET replaced_by_hash = $2, grace_until = $3, last_used_at = NOW()
       WHERE id = $1::uuid AND replaced_by_hash IS NULL AND revoked_at IS NULL
       RETURNING id`,
      [existing.id, newHash, graceUntil.toISOString()]
    );

    if (!claimRes.rowCount) {
      // Another concurrent request won the rotation race right before us — treat as grace reuse!
      const refetch = await query(`SELECT * FROM public.auth_refresh_tokens WHERE id = $1::uuid LIMIT 1`, [existing.id]);
      const latest = refetch.rows[0] ? mapRow(refetch.rows[0]) : null;
      if (latest && !latest.revokedAt && latest.graceUntil && latest.graceUntil > now) {
        return { status: 'GRACE_REUSED', session: latest };
      }
      return { status: 'REVOKED' };
    }

    const insertRes = await query(
      `INSERT INTO public.auth_refresh_tokens
         (user_id, employee_code, token_hash, token_family, auth_method, user_agent, ip_address, absolute_expires_at, expires_at)
       VALUES ($1, $2, $3, $4::uuid, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        existing.userId,
        existing.employeeCode,
        newHash,
        existing.tokenFamily,
        existing.authMethod,
        (meta?.userAgent || existing.userAgent || '').slice(0, 250) || null,
        (meta?.ipAddress || existing.ipAddress || '').slice(0, 64) || null,
        existing.absoluteExpiresAt.toISOString(),
        nextExpiry.toISOString(),
      ]
    );

    return {
      status: 'ROTATED',
      session: insertRes.rows[0] ? mapRow(insertRes.rows[0]) : existing,
      newRefreshToken: newRawToken,
      newExpiresAt: nextExpiry,
    };
  }

  async revokeByRawToken(rawToken?: string | null): Promise<void> {
    if (!rawToken) return;
    const tokenHash = hashRefreshToken(rawToken);
    const useDb = await ensureRefreshTable();
    if (!useDb) {
      const existing = memorySessionsByHash.get(tokenHash);
      if (existing) {
        const now = new Date();
        for (const rec of memorySessionsByHash.values()) {
          if (rec.tokenFamily === existing.tokenFamily && !rec.revokedAt) {
            rec.revokedAt = now;
          }
        }
      }
      return;
    }

    await query(
      `UPDATE public.auth_refresh_tokens
       SET revoked_at = NOW()
       WHERE token_family IN (
         SELECT token_family FROM public.auth_refresh_tokens WHERE token_hash = $1
       ) AND revoked_at IS NULL`,
      [tokenHash]
    ).catch(() => {});
  }

  async revokeAllForUser(employeeCodeOrUserId?: string | null): Promise<void> {
    const clean = String(employeeCodeOrUserId || '').trim().toLowerCase();
    if (!clean) return;
    const useDb = await ensureRefreshTable();
    if (!useDb) {
      const now = new Date();
      for (const rec of memorySessionsByHash.values()) {
        if (
          rec.employeeCode.toLowerCase() === clean ||
          rec.userId.toLowerCase() === clean
        ) {
          rec.revokedAt = now;
        }
      }
      return;
    }

    await query(
      `UPDATE public.auth_refresh_tokens
       SET revoked_at = NOW()
       WHERE (LOWER(employee_code) = $1 OR LOWER(user_id) = $1)
         AND revoked_at IS NULL`,
      [clean]
    ).catch(() => {});
  }
}

export const refreshSessionRepository = new RefreshSessionRepository();
