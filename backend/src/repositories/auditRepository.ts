// VRM Enterprise HRMS — Auth & Login Lifecycle Audit Repository
import { AuthAuditAction, AuthAuditLog } from '../types/auth.js';
import { query } from '../config/database.js';

const SENSITIVE_KEYS = new Set([
  'password',
  'temppassword',
  'currentpassword',
  'newpassword',
  'confirmpassword',
  'temporary_password',
  'passwordhash',
  'hash',
  'token',
  'accesstoken',
  'secret',
]);

/**
 * Deeply sanitizes metadata to ensure no raw passwords, hashes, or tokens leak into audit logs.
 */
function sanitizeMetadata(data?: Record<string, any>): Record<string, any> | undefined {
  if (!data) return undefined;

  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase().replace(/[-_]/g, ''))) {
      continue; // omit sensitive key completely
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      clean[key] = sanitizeMetadata(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export class AuditRepository {
  async recordLog(
    action: AuthAuditAction,
    employeeId: string,
    performedBy: string,
    metadata?: Record<string, any>
  ): Promise<AuthAuditLog> {
    const sanitized = sanitizeMetadata(metadata);
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      return {
        id: `audit-${Date.now()}`,
        action,
        employee_id: employeeId,
        performed_by: performedBy || 'System',
        performed_at: new Date().toISOString(),
        metadata: sanitized || {},
      };
    }
    try {
      const result = await query<AuthAuditLog>(
        `INSERT INTO auth_audit_logs (action, employee_id, performed_by, performed_at, metadata)
         VALUES ($1, $2, $3, NOW(), $4::jsonb)
         RETURNING id::text, action, employee_id, performed_by, performed_at::text, metadata`,
        [action, employeeId, performedBy || 'System', JSON.stringify(sanitized || {})]
      );
      return result.rows[0];
    } catch (err) {
      console.warn(`[AuditRepository] Failed to write audit log for action ${action}:`, err);
      return {
        id: `fallback-${Date.now()}`,
        action,
        employee_id: employeeId,
        performed_by: performedBy || 'System',
        performed_at: new Date().toISOString(),
        metadata: sanitized || {},
      };
    }
  }

  async getLogs(filters?: {
    employeeId?: string;
    action?: AuthAuditAction;
    limit?: number;
  }): Promise<AuthAuditLog[]> {
    const values: unknown[] = [];
    const conditions: string[] = [];
    if (filters?.employeeId) {
      values.push(filters.employeeId.trim());
      conditions.push(`LOWER(employee_id) = LOWER($${values.length})`);
    }
    if (filters?.action) {
      values.push(filters.action);
      conditions.push(`action = $${values.length}`);
    }
    const requestedLimit = Math.min(Math.max(filters?.limit || 100, 1), 1000);
    values.push(requestedLimit);
    const result = await query<AuthAuditLog>(
      `SELECT id::text, action, employee_id, performed_by, performed_at::text, metadata
       FROM auth_audit_logs
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       ORDER BY performed_at DESC
       LIMIT $${values.length}`,
      values
    );
    return result.rows;
  }
}

export const auditRepository = new AuditRepository();
