import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { env } from '../config/env.js';
import { query } from '../config/database.js';
import { BCRYPT_ROUNDS, isBcryptPasswordHash, scrubProfilePasswordFields } from '../repositories/authRepository.js';

const ALLOWED_TABLES = new Set([
  'employees',
  'departments',
  'roles',
  'leave_requests',
  'attendance_records',
  'expenses',
  'payroll_records',
  'enterprise_tasks',
  'employee_documents',
  'shifts',
  'shift_assignments',
  'company_settings',
  'customers',
  'customer_visits',
  'company_assets',
  'announcements',
  'assets',
  'candidates',
  'designations',
  'face_logs',
  'field_duty_assignments',
  'field_trip_sessions',
  'field_location_points',
  'field_tracking_alerts',
  'job_openings',
  'notification_recipients',
  'performance_scores',
  'shift_requests',
  'tasks',
  'task_assignees',
  'task_updates',
  'salary_structures',
  'payroll_runs',
  'payroll_settings',
]);

const PRIVILEGED_ROLES = new Set([
  'Super Admin',
  'CEO',
  'HR Manager',
  'HR Admin',
  'Finance Manager',
  'Department Manager',
  'Department Head',
  'Management',
  'ERP Administrator',
  'Manager',
  'Admin',
]);

const HR_ADMIN_ROLES = new Set([
  'Super Admin',
  'CEO',
  'HR Manager',
  'HR Admin',
  'Management',
  'ERP Administrator',
  'Admin',
]);

const FINANCE_ADMIN_ROLES = new Set([
  'Super Admin',
  'CEO',
  'HR Manager',
  'HR Admin',
  'Finance Manager',
  'Management',
  'ERP Administrator',
]);

function sanitizeEmployeeRowForDirectory(row: Record<string, any>, isSelfOrPrivileged: boolean): Record<string, any> {
  const copy = { ...row };
  delete copy.password;
  delete copy.password_hash;
  delete copy.passwordHash;
  delete copy.plainPassword;

  if (copy.profile_data && typeof copy.profile_data === 'object') {
    copy.profile_data = scrubProfilePasswordFields(copy.profile_data);
  }

  if (isSelfOrPrivileged) {
    return copy;
  }

  // Standard employee viewing colleague directory entry: redact confidential PII, salary, and banking fields
  delete copy.basic_salary;
  delete copy.gross_salary;
  delete copy.allowances_hra;
  delete copy.allowances_transport;
  delete copy.allowances_medical;
  delete copy.allowances_special;
  delete copy.bank_name;
  delete copy.account_number;
  delete copy.ifsc_code;
  delete copy.pan_number;
  delete copy.uan_number;
  delete copy.address;
  delete copy.address_line1;
  delete copy.address_line2;
  delete copy.pincode;
  delete copy.dob;
  delete copy.last_drawn_salary;

  if (copy.profile_data && typeof copy.profile_data === 'object') {
    const safeProfile = { ...copy.profile_data };
    delete safeProfile.basicSalary;
    delete safeProfile.grossSalary;
    delete safeProfile.allowances;
    delete safeProfile.salaryDetails;
    delete safeProfile.bankDetails;
    delete safeProfile.bankName;
    delete safeProfile.accountNumber;
    delete safeProfile.ifscCode;
    delete safeProfile.panNumber;
    delete safeProfile.uanNumber;
    delete safeProfile.currentAddress;
    delete safeProfile.permanentAddress;
    delete safeProfile.emergencyContact;
    delete safeProfile.documents;
    delete safeProfile.dob;
    delete safeProfile.lastDrawnSalary;
    copy.profile_data = safeProfile;
  }

  return copy;
}

function sanitizeCompanySettingsRow(
  row: Record<string, any>,
  isPrivileged: boolean,
  callerEmpCode: string,
  callerUuid: string
): Record<string, any> {
  if (!row || typeof row !== 'object') return row;
  const copy = { ...row };
  if (copy.setting_key === 'employee_profiles_data' && copy.setting_val && typeof copy.setting_val === 'object') {
    const cleanedMap: Record<string, any> = {};
    for (const [key, val] of Object.entries(copy.setting_val)) {
      const cleanedEntry = scrubProfilePasswordFields(val as Record<string, any>);
      const keyLower = key.toLowerCase();
      const entryEmpId = String(cleanedEntry.employeeId || '').toLowerCase();
      const entryUuid = String(cleanedEntry.id || '').toLowerCase();
      const isSelf =
        (callerEmpCode && (keyLower === callerEmpCode || entryEmpId === callerEmpCode)) ||
        (callerUuid && (keyLower === callerUuid || entryUuid === callerUuid));

      if (isPrivileged || isSelf) {
        cleanedMap[key] = cleanedEntry;
      } else {
        // Redact sensitive fields for colleagues in employee_profiles_data
        const dirEntry = { ...cleanedEntry };
        delete dirEntry.basicSalary;
        delete dirEntry.grossSalary;
        delete dirEntry.allowances;
        delete dirEntry.salaryDetails;
        delete dirEntry.bankDetails;
        delete dirEntry.bankName;
        delete dirEntry.accountNumber;
        delete dirEntry.ifscCode;
        delete dirEntry.panNumber;
        delete dirEntry.uanNumber;
        delete dirEntry.currentAddress;
        delete dirEntry.permanentAddress;
        delete dirEntry.emergencyContact;
        delete dirEntry.documents;
        delete dirEntry.dob;
        cleanedMap[key] = dirEntry;
      }
    }
    copy.setting_val = cleanedMap;
  }
  return copy;
}

async function resolveCallerIdentifiers(req: Request): Promise<{ callerEmpCode: string; callerUuid: string }> {
  let callerEmpCode = String(req.user?.employeeId || '').trim().toLowerCase();
  let callerUuid = String(req.user?.id || '').trim().toLowerCase();
  const callerEmail = String(req.user?.email || '').trim().toLowerCase();

  try {
    const res = await query(
      `SELECT id, employee_id FROM public.employees WHERE (LOWER(employee_id) = $1 AND $1 <> '') OR (LOWER(email) = $2 AND $2 <> '') OR id::text = $3 LIMIT 1`,
      [callerEmpCode, callerEmail, callerUuid]
    );
    if (res.rows[0]?.id) {
      callerUuid = String(res.rows[0].id).toLowerCase();
    }
    if (!callerEmpCode && res.rows[0]?.employee_id) {
      callerEmpCode = String(res.rows[0].employee_id).toLowerCase();
    }
  } catch {
    // Ignore lookup fallback errors in mock/test environments
  }
  return { callerEmpCode, callerUuid };
}

function isRowOwnedByCaller(row: Record<string, any>, callerEmpCode: string, callerUuid: string): boolean {
  if (!row || typeof row !== 'object') return false;
  const rowEmpId = String(row.employee_id || row.employeeId || '').trim().toLowerCase();
  const rowEmpCode = String(row.employee_code || '').trim().toLowerCase();
  const rowId = String(row.id || '').trim().toLowerCase();
  const nestedEmpCode = String(row.employee?.employee_id || row.employees?.employee_id || '').trim().toLowerCase();

  return Boolean(
    (callerUuid && (rowEmpId === callerUuid || rowId === callerUuid)) ||
    (callerEmpCode && (rowEmpId === callerEmpCode || rowEmpCode === callerEmpCode || nestedEmpCode === callerEmpCode))
  );
}

/**
 * Authenticated, RBAC-enforced Backend Data Gateway (`CRIT-01`, `CRIT-02`, `CRIT-03`).
 * Replaces direct browser access to PostgREST `/rest/v1/*`.
 */
export const proxyDataGatewayRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    const rawPath = String(req.body?.path || '').trim();
    const method = String(req.body?.method || 'GET').toUpperCase();
    const prefer = req.body?.prefer ? String(req.body.prefer) : undefined;
    let payload = req.body?.body;

    if (!rawPath.startsWith('/')) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_PATH', message: 'Gateway path must start with /' },
      });
      return;
    }

    const [pathname, queryString = ''] = rawPath.split('?');
    const table = pathname.replace(/^\/+/, '').split('/')[0].trim();

    if (!table || !ALLOWED_TABLES.has(table) || pathname.includes('..')) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN_TABLE',
          message: `Access to resource '${table || pathname}' is not permitted through the data gateway.`,
        },
      });
      return;
    }

    const userRole = req.user.role;
    const isPrivileged = PRIVILEGED_ROLES.has(userRole);
    const isHrAdmin = HR_ADMIN_ROLES.has(userRole);
    const isFinanceAdmin = FINANCE_ADMIN_ROLES.has(userRole);
    const { callerEmpCode, callerUuid } = await resolveCallerIdentifiers(req);

    // Enforce table-level write permissions
    if (method !== 'GET') {
      if (table === 'employees') {
        if ((method === 'POST' || method === 'DELETE') && !isHrAdmin) {
          res.status(403).json({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Only HR Manager, CEO, or Super Admin can create or delete employees.' },
          });
          return;
        }
        if (method === 'PATCH' && !isHrAdmin) {
          // Standard employee may only update their own row and cannot alter privileged columns
          const ownsFilter =
            (callerUuid && queryString.toLowerCase().includes(callerUuid)) ||
            (callerEmpCode && queryString.toLowerCase().includes(callerEmpCode));
          if (!ownsFilter) {
            res.status(403).json({
              success: false,
              error: { code: 'FORBIDDEN', message: 'You can only update your own employee profile.' },
            });
            return;
          }
          if (payload && typeof payload === 'object') {
            delete payload.role_id;
            delete payload.basic_salary;
            delete payload.gross_salary;
            delete payload.account_status;
            delete payload.status;
          }
        }
        // Hash any plaintext password before persisting to employees (CRIT-02)
        if (payload && typeof payload === 'object') {
          if (typeof payload.password === 'string' && payload.password.trim() !== '') {
            if (!isBcryptPasswordHash(payload.password)) {
              payload.password = await bcrypt.hash(payload.password, BCRYPT_ROUNDS);
            }
          }
          if (payload.profile_data && typeof payload.profile_data === 'object') {
            payload.profile_data = scrubProfilePasswordFields(payload.profile_data);
          }
        }
      } else if (table === 'payroll_records' || table === 'salary_structures' || table === 'payroll_runs' || table === 'payroll_settings') {
        if (!isFinanceAdmin) {
          res.status(403).json({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Only authorized Finance/HR administrators can modify payroll records.' },
          });
          return;
        }
      } else if (table === 'shifts' || table === 'departments' || table === 'roles') {
        if (!isHrAdmin) {
          res.status(403).json({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Only HR/CEO administrators can modify organization master data.' },
          });
          return;
        }
      } else if (table === 'attendance_records' && method === 'DELETE' && !isHrAdmin) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Only HR/CEO administrators can delete attendance records.' },
        });
        return;
      } else if (table === 'company_settings') {
        // Scrub any plaintext passwords from employee_profiles_data (CRIT-02)
        if (payload && typeof payload === 'object' && payload.setting_key === 'employee_profiles_data') {
          if (payload.setting_val && typeof payload.setting_val === 'object' && !Array.isArray(payload.setting_val)) {
            const scrubbedVal: Record<string, any> = {};
            for (const [k, v] of Object.entries(payload.setting_val)) {
              scrubbedVal[k] = scrubProfilePasswordFields(v as Record<string, any>);
            }
            payload.setting_val = scrubbedVal;
          }
        }
      }
    }

    // Forward validated request to internal PostgREST service
    const baseRestUrl = (env.DB_REST_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
    const targetUrl = `${baseRestUrl}/rest/v1/${table}${queryString ? `?${queryString}` : ''}`;
    const serviceKey = env.DB_REST_SERVICE_KEY || env.DB_REST_KEY || '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    };
    if (prefer) {
      headers.Prefer = prefer;
    }

    const upstreamRes = await fetch(targetUrl, {
      method,
      headers,
      body: payload !== undefined && method !== 'GET' && method !== 'HEAD' ? JSON.stringify(payload) : undefined,
    });

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text().catch(() => '');
      res.status(upstreamRes.status).json({
        success: false,
        error: {
          code: 'DATA_GATEWAY_UPSTREAM_ERROR',
          message: errText || `Upstream status ${upstreamRes.status}`,
        },
      });
      return;
    }

    const text = await upstreamRes.text();
    let data: any = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }

    // Post-query sanitization and row-level ownership filtering
    if (table === 'employees') {
      if (Array.isArray(data)) {
        data = data.map((row) => {
          const isSelf = isRowOwnedByCaller(row, callerEmpCode, callerUuid);
          return sanitizeEmployeeRowForDirectory(row, isPrivileged || isSelf);
        });
      } else if (data && typeof data === 'object') {
        const isSelf = isRowOwnedByCaller(data, callerEmpCode, callerUuid);
        data = sanitizeEmployeeRowForDirectory(data, isPrivileged || isSelf);
      }
    } else if (table === 'company_settings') {
      if (Array.isArray(data)) {
        data = data.map((row) => sanitizeCompanySettingsRow(row, isPrivileged, callerEmpCode, callerUuid));
      } else if (data && typeof data === 'object') {
        data = sanitizeCompanySettingsRow(data, isPrivileged, callerEmpCode, callerUuid);
      }
    } else if (
      !isPrivileged &&
      (table === 'payroll_records' ||
        table === 'salary_structures' ||
        table === 'leave_requests' ||
        table === 'attendance_records' ||
        table === 'expenses' ||
        table === 'employee_documents')
    ) {
      if (Array.isArray(data)) {
        data = data.filter((row) => isRowOwnedByCaller(row, callerEmpCode, callerUuid));
      }
    }

    res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
};
