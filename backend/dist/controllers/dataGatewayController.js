import bcrypt from 'bcrypt';
import { env } from '../config/env.js';
import { query } from '../config/database.js';
import { authRepository, BCRYPT_ROUNDS, isBcryptPasswordHash, scrubProfilePasswordFields } from '../repositories/authRepository.js';
import { resolveOvernightAttendanceSession } from '../services/shiftAttendanceEngine.js';
import { rbacRepository } from '../repositories/rbacRepository.js';
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
    'HR',
    'HR Manager',
    'HR Admin',
    'Finance Manager',
    'Management',
    'ERP Administrator',
    'Admin',
]);
export const isCompanyWideGatewayRole = (role) => PRIVILEGED_ROLES.has(role);
const HR_ADMIN_ROLES = new Set([
    'Super Admin',
    'CEO',
    'HR',
    'HR Manager',
    'HR Admin',
    'Management',
    'ERP Administrator',
    'Admin',
]);
const FINANCE_ADMIN_ROLES = new Set([
    'Super Admin',
    'CEO',
    'HR',
    'HR Manager',
    'HR Admin',
    'Finance Manager',
    'Accounts',
    'Accountant',
    'Management',
    'ERP Administrator',
]);
function sanitizeEmployeeRowForDirectory(row, isSelfOrPrivileged) {
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
function sanitizeCompanySettingsRow(row, isPrivileged, isFinanceAdmin, callerEmpCode, callerUuid) {
    if (!row || typeof row !== 'object')
        return row;
    const copy = { ...row };
    if (copy.setting_key === 'employee_profiles_data' && copy.setting_val && typeof copy.setting_val === 'object') {
        const cleanedMap = {};
        for (const [key, val] of Object.entries(copy.setting_val)) {
            const cleanedEntry = scrubProfilePasswordFields(val);
            const keyLower = key.toLowerCase();
            const entryEmpId = String(cleanedEntry.employeeId || '').toLowerCase();
            const entryUuid = String(cleanedEntry.id || '').toLowerCase();
            const isSelf = (callerEmpCode && (keyLower === callerEmpCode || entryEmpId === callerEmpCode)) ||
                (callerUuid && (keyLower === callerUuid || entryUuid === callerUuid));
            if (isPrivileged || isSelf) {
                cleanedMap[key] = cleanedEntry;
            }
            else {
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
    else if (copy.setting_key === 'payroll_records_data' && Array.isArray(copy.setting_val)) {
        if (!isPrivileged && !isFinanceAdmin) {
            copy.setting_val = copy.setting_val.filter((entry) => {
                if (!entry || typeof entry !== 'object')
                    return false;
                const empId = String(entry.employeeId || entry.employee_id || '').trim().toLowerCase();
                return Boolean((callerEmpCode && empId === callerEmpCode) ||
                    (callerUuid && empId === callerUuid));
            });
        }
    }
    return copy;
}
async function resolveCallerIdentifiers(req) {
    let callerEmpCode = String(req.user?.employeeId || '').trim().toLowerCase();
    let callerUuid = String(req.user?.id || '').trim().toLowerCase();
    const callerEmail = String(req.user?.email || '').trim().toLowerCase();
    let callerName = String(req.user?.name || '').trim().toLowerCase();
    let callerDepartment = String(req.user?.department || '').trim().toLowerCase();
    let callerDesignation = String(req.user?.designation || '').trim().toLowerCase();
    try {
        const res = await query(`SELECT e.id, e.employee_id, e.first_name, e.last_name, e.designation, d.name AS department_name
       FROM public.employees e
       LEFT JOIN public.departments d ON d.id = e.department_id
       WHERE (LOWER(e.employee_id) = $1 AND $1 <> '') OR (LOWER(e.email) = $2 AND $2 <> '') OR e.id::text = $3
       LIMIT 1`, [callerEmpCode, callerEmail, callerUuid]);
        if (res.rows[0]?.id) {
            callerUuid = String(res.rows[0].id).toLowerCase();
        }
        if (!callerEmpCode && res.rows[0]?.employee_id) {
            callerEmpCode = String(res.rows[0].employee_id).toLowerCase();
        }
        if (res.rows[0]) {
            const dbFullName = `${res.rows[0].first_name || ''} ${res.rows[0].last_name || ''}`.trim().toLowerCase();
            if (dbFullName)
                callerName = dbFullName;
            if (res.rows[0].department_name) {
                callerDepartment = String(res.rows[0].department_name).trim().toLowerCase();
            }
            if (res.rows[0].designation) {
                callerDesignation = String(res.rows[0].designation).trim().toLowerCase();
            }
        }
    }
    catch {
        // Ignore lookup fallback errors in mock/test environments
    }
    return { callerEmpCode, callerUuid, callerName, callerDepartment, callerDesignation };
}
export function resolveEffectiveGatewayRoles(params) {
    const roleTrim = String(params.userRole || '').trim();
    const roleLower = roleTrim.toLowerCase();
    const empUpper = String(params.callerEmpCode || '').trim().toUpperCase();
    const deptLower = String(params.callerDepartment || '').trim().toLowerCase();
    const desigLower = String(params.callerDesignation || '').trim().toLowerCase();
    const isCeoUser = roleLower === 'ceo' ||
        roleLower === 'super admin' ||
        roleLower === 'management' ||
        roleLower === 'erp administrator' ||
        desigLower === 'ceo' ||
        desigLower.includes('chief executive') ||
        desigLower.includes('managing director') ||
        empUpper === 'EMP-000' ||
        empUpper === 'VRM-001';
    const isHrAdmin = isCeoUser ||
        HR_ADMIN_ROLES.has(roleTrim) ||
        deptLower === 'hr' ||
        deptLower.includes('human resource') ||
        desigLower.includes('hr manager') ||
        desigLower.includes('hr admin') ||
        /\bhr\b/.test(desigLower);
    const isFinanceAdmin = isHrAdmin ||
        FINANCE_ADMIN_ROLES.has(roleTrim) ||
        deptLower.includes('account') ||
        deptLower.includes('finance') ||
        desigLower.includes('account') ||
        desigLower.includes('finance');
    const isPrivileged = isCompanyWideGatewayRole(roleTrim) || isCeoUser || isHrAdmin;
    return { isCeoUser, isHrAdmin, isFinanceAdmin, isPrivileged };
}
/**
 * Safely merges incoming `loan_records_data` writes with authoritative existing DB records so:
 * 1. Stale browser/mobile snapshots or empty-sync glitches can NEVER wipe existing advance requests.
 * 2. Standard employees can only append their own new `Pending` requests and cannot alter/delete
 *    other employees' requests or self-approve their own loans.
 * 3. HR/CEO/Accounts can update statuses/approvals/disbursements while preserving concurrent new
 *    submissions from other employees.
 */
export function mergeLoanRecordsSetting(params) {
    const existingList = Array.isArray(params.existing)
        ? params.existing.filter((r) => r && typeof r === 'object' && r.id)
        : [];
    const incomingList = Array.isArray(params.incoming)
        ? params.incoming.filter((r) => r && typeof r === 'object' && r.id)
        : [];
    const existingById = new Map();
    for (const rec of existingList) {
        existingById.set(String(rec.id), rec);
    }
    const identifiers = new Set([params.callerEmpCode, params.callerUuid]
        .map((v) => String(v || '').trim().toLowerCase())
        .filter(Boolean));
    const cleanCallerName = String(params.callerName || '').trim().toLowerCase();
    const belongsToCaller = (rec) => {
        const empId = String(rec.employeeId || rec.employee_id || '').trim().toLowerCase();
        const empName = String(rec.employeeName || rec.employee_name || '').trim().toLowerCase();
        if (empId && identifiers.has(empId))
            return true;
        if (cleanCallerName && empName && empName === cleanCallerName)
            return true;
        return false;
    };
    if (params.canManageLoans) {
        // Merge by ID: apply incoming updates & new items, while preserving any existing record
        // that was submitted concurrently and is missing from a stale incoming client snapshot.
        const mergedById = new Map(existingById);
        const orderedIds = [];
        for (const rec of incomingList) {
            const id = String(rec.id);
            mergedById.set(id, rec);
            if (!orderedIds.includes(id))
                orderedIds.push(id);
        }
        for (const rec of existingList) {
            const id = String(rec.id);
            if (!orderedIds.includes(id))
                orderedIds.push(id);
        }
        return orderedIds.map((id) => mergedById.get(id)).filter(Boolean);
    }
    // Standard employee: preserve ALL existing DB records untouched and only prepend genuinely new
    // `Pending` advance requests belonging to this caller.
    const newlySubmittedByCaller = [];
    for (const rec of incomingList) {
        const id = String(rec.id);
        if (existingById.has(id))
            continue;
        if (!belongsToCaller(rec))
            continue;
        newlySubmittedByCaller.push({
            ...rec,
            status: 'Pending',
        });
    }
    return [...newlySubmittedByCaller, ...existingList];
}
function matchesCallerName(raw, callerName) {
    if (!callerName)
        return false;
    const normalized = String(raw || '').trim().toLowerCase();
    if (!normalized)
        return false;
    if (normalized === callerName)
        return true;
    // Web TaskManagement stores assigned_by as "First Last (Role)"
    if (normalized.startsWith(`${callerName} (`))
        return true;
    const stripped = normalized.replace(/\s*\([^)]*\)\s*$/, '').trim();
    return stripped === callerName;
}
function isRowOwnedByCaller(row, callerEmpCode, callerUuid) {
    if (!row || typeof row !== 'object')
        return false;
    const rowEmpId = String(row.employee_id || row.employeeId || '').trim().toLowerCase();
    const rowEmpCode = String(row.employee_code || '').trim().toLowerCase();
    const rowId = String(row.id || '').trim().toLowerCase();
    const nestedEmpCode = String(row.employee?.employee_id || row.employees?.employee_id || '').trim().toLowerCase();
    return Boolean((callerUuid && (rowEmpId === callerUuid || rowId === callerUuid)) ||
        (callerEmpCode && (rowEmpId === callerEmpCode || rowEmpCode === callerEmpCode || nestedEmpCode === callerEmpCode)));
}
export function isTaskCreatorCaller(row, callerEmpCode, callerUuid, callerName = '') {
    if (!row || typeof row !== 'object')
        return false;
    const identifiers = new Set([callerEmpCode, callerUuid].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean));
    const taskData = row.task_data && typeof row.task_data === 'object' ? row.task_data : {};
    const creatorValues = [
        row.created_by,
        row.assigned_by,
        taskData.assignedBy,
        taskData.assignedById,
        taskData.assignedByName,
        taskData.createdById,
    ];
    return creatorValues.some((value) => {
        const normalized = String(value || '').trim().toLowerCase();
        return (normalized && identifiers.has(normalized)) || matchesCallerName(value, callerName);
    });
}
export function isTaskVisibleToCaller(row, callerEmpCode, callerUuid, callerName = '') {
    if (!row || typeof row !== 'object')
        return false;
    const identifiers = new Set([callerEmpCode, callerUuid].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean));
    const cleanName = String(callerName || '').trim().toLowerCase();
    if (identifiers.size === 0 && !cleanName)
        return false;
    const directValues = [
        row.responsible_person_id,
        row.responsible_person_name,
        row.employee_id,
        row.assigned_to,
        row.assignee_id,
        row.created_by,
        row.assigned_by,
    ];
    if (directValues.some((value) => {
        const normalized = String(value || '').trim().toLowerCase();
        return (normalized && identifiers.has(normalized)) || matchesCallerName(value, cleanName);
    })) {
        return true;
    }
    const taskData = row.task_data && typeof row.task_data === 'object' ? row.task_data : {};
    const nestedValues = [
        taskData.responsiblePersonId,
        taskData.responsiblePersonName,
        taskData.employeeId,
        taskData.assignedTo,
        taskData.assigneeId,
        taskData.assignedBy,
        taskData.assignedById,
        taskData.assignedByName,
        taskData.createdById,
    ];
    if (nestedValues.some((value) => {
        const normalized = String(value || '').trim().toLowerCase();
        return (normalized && identifiers.has(normalized)) || matchesCallerName(value, cleanName);
    })) {
        return true;
    }
    const assignees = [
        ...(Array.isArray(taskData.assignees) ? taskData.assignees : []),
        ...(Array.isArray(taskData.assignedEmployees) ? taskData.assignedEmployees : []),
    ];
    return assignees.some((assignee) => {
        if (typeof assignee === 'string') {
            const normalized = assignee.trim().toLowerCase();
            return identifiers.has(normalized) || matchesCallerName(assignee, cleanName);
        }
        if (!assignee || typeof assignee !== 'object')
            return false;
        const idValues = [assignee.id, assignee.employeeId, assignee.employee_id]
            .map((value) => String(value || '').trim().toLowerCase());
        if (idValues.some((value) => identifiers.has(value)))
            return true;
        return matchesCallerName(assignee.employeeName || assignee.name, cleanName);
    });
}
export function mergeStandardTaskUpdate(currentTask, incomingTaskData, overallStatus, overallProgress, updatedAt) {
    const existingData = currentTask.task_data && typeof currentTask.task_data === 'object'
        ? currentTask.task_data
        : {};
    // Preserve authoritative assignee identities while allowing progress/status
    // updates on existing assignees (prevents identity tampering).
    const existingAssignees = Array.isArray(existingData.assignees) ? existingData.assignees : [];
    const incomingAssignees = Array.isArray(incomingTaskData.assignees) ? incomingTaskData.assignees : [];
    const mergedAssignees = existingAssignees.map((existingItem) => {
        if (!existingItem || typeof existingItem !== 'object')
            return existingItem;
        const existingCode = String(existingItem.employeeId || existingItem.employee_id || existingItem.id || '')
            .trim()
            .toLowerCase();
        if (!existingCode)
            return existingItem;
        const incomingMatch = incomingAssignees.find((inc) => {
            if (!inc || typeof inc !== 'object')
                return false;
            const incCode = String(inc.employeeId || inc.employee_id || inc.id || '').trim().toLowerCase();
            return incCode === existingCode;
        });
        if (!incomingMatch)
            return existingItem;
        return {
            ...existingItem,
            ...(incomingMatch.individualStatus !== undefined ? { individualStatus: incomingMatch.individualStatus } : {}),
            ...(incomingMatch.progressPercentage !== undefined ? { progressPercentage: incomingMatch.progressPercentage } : {}),
            ...(incomingMatch.lastUpdatedAt !== undefined ? { lastUpdatedAt: incomingMatch.lastUpdatedAt } : {}),
        };
    });
    return {
        ...existingData,
        ...(existingAssignees.length > 0 ? { assignees: mergedAssignees } : {}),
        dailyReports: Array.isArray(incomingTaskData.dailyReports)
            ? incomingTaskData.dailyReports
            : (existingData.dailyReports || []),
        comments: Array.isArray(incomingTaskData.comments)
            ? incomingTaskData.comments
            : (existingData.comments || []),
        attachments: Array.isArray(incomingTaskData.attachments)
            ? incomingTaskData.attachments
            : (existingData.attachments || []),
        overallStatus: overallStatus || existingData.overallStatus,
        overallProgress: overallProgress ?? existingData.overallProgress,
        updatedAt: updatedAt || new Date().toISOString(),
    };
}
export function isAssetVisibleToCaller(row, callerEmpCode, callerUuid, callerName = '') {
    if (!row || typeof row !== 'object')
        return false;
    const identifiers = new Set([callerEmpCode, callerUuid]
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean));
    const cleanName = String(callerName || '').trim().toLowerCase();
    if (identifiers.size === 0 && !cleanName)
        return false;
    const embeddedEmp = (row.assigned_employee && typeof row.assigned_employee === 'object' ? row.assigned_employee : null) ||
        (row.employee && typeof row.employee === 'object' ? row.employee : null);
    const embeddedFullName = embeddedEmp
        ? `${embeddedEmp.first_name || ''} ${embeddedEmp.last_name || ''}`.trim()
        : '';
    const idMatches = [
        row.assigned_employee_id,
        row.assignedEmployeeId,
        row.employee_id,
        row.employeeId,
        embeddedEmp?.id,
        embeddedEmp?.employee_id,
    ]
        .map((value) => String(value || '').trim().toLowerCase())
        .some((value) => value && identifiers.has(value));
    if (idMatches)
        return true;
    return (matchesCallerName(row.assigned_employee_name || row.assignedEmployeeName, cleanName) ||
        matchesCallerName(embeddedFullName, cleanName));
}
/**
 * Authenticated, RBAC-enforced Backend Data Gateway (`CRIT-01`, `CRIT-02`, `CRIT-03`).
 * Replaces direct browser access to PostgREST `/rest/v1/*`.
 */
export const proxyDataGatewayRequest = async (req, res, next) => {
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
        const { callerEmpCode, callerUuid, callerName, callerDepartment, callerDesignation, } = await resolveCallerIdentifiers(req);
        const { isCeoUser, isHrAdmin, isFinanceAdmin, isPrivileged } = resolveEffectiveGatewayRoles({
            userRole,
            callerEmpCode,
            callerDepartment,
            callerDesignation,
        });
        const rolePermissions = rbacRepository.getRolePermissions(userRole);
        // Every authenticated user is permitted to GET /assets (company-wide for CEO/HR,
        // row-scoped to assigned assets for standard staff below). Only write operations
        // require HR/CEO authority or explicit RBAC write permissions.
        if (table === 'assets' && method !== 'GET' && !isHrAdmin && !isCeoUser) {
            const assetActions = rolePermissions?.modulePermissions.assets || [];
            const requiredAction = method === 'POST'
                ? 'create'
                : method === 'DELETE'
                    ? 'delete'
                    : 'edit';
            if (!assetActions.includes(requiredAction)) {
                res.status(403).json({
                    success: false,
                    error: {
                        code: 'FORBIDDEN',
                        message: `Your role cannot ${requiredAction} asset records.`,
                    },
                });
                return;
            }
        }
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
                    const ownsFilter = (callerUuid && queryString.toLowerCase().includes(callerUuid)) ||
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
            }
            else if (table === 'payroll_records' || table === 'salary_structures' || table === 'payroll_runs' || table === 'payroll_settings') {
                if (!isFinanceAdmin) {
                    res.status(403).json({
                        success: false,
                        error: { code: 'FORBIDDEN', message: 'Only authorized Finance/HR administrators can modify payroll records.' },
                    });
                    return;
                }
            }
            else if (table === 'shifts' || table === 'departments' || table === 'roles') {
                if (!isHrAdmin) {
                    res.status(403).json({
                        success: false,
                        error: { code: 'FORBIDDEN', message: 'Only HR/CEO administrators can modify organization master data.' },
                    });
                    return;
                }
            }
            else if (table === 'attendance_records' && method === 'DELETE' && !isHrAdmin) {
                res.status(403).json({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'Only HR/CEO administrators can delete attendance records.' },
                });
                return;
            }
            else if (table === 'attendance_records' && (method === 'POST' || method === 'PATCH') && payload && typeof payload === 'object' && !Array.isArray(payload)) {
                // Normalize overnight check-in/check-out timestamps and prevent negative working_hours from ever entering PostgreSQL
                if (payload.check_in && payload.check_out) {
                    const baseDate = String(payload.shift_date || payload.date || payload.check_in).slice(0, 10);
                    const session = resolveOvernightAttendanceSession({
                        attendanceDate: baseDate,
                        checkIn: payload.check_in,
                        checkOut: payload.check_out,
                        allowAutoRollSameDateIsoCheckOut: true,
                    });
                    if (session.isValid) {
                        payload.check_in = session.checkInIso;
                        payload.check_out = session.checkOutIso;
                        if (payload.working_hours === undefined || Number(payload.working_hours) <= 0) {
                            payload.working_hours = session.workingHours;
                        }
                        if (payload.calculated_ot_hours === undefined && session.otHours > 0) {
                            payload.calculated_ot_hours = session.otHours;
                        }
                    }
                    else if (payload.working_hours !== undefined && Number(payload.working_hours) < 0) {
                        payload.working_hours = 0;
                    }
                }
                else if (payload.working_hours !== undefined && Number(payload.working_hours) < 0) {
                    payload.working_hours = 0;
                }
            }
            else if (table === 'enterprise_tasks' && !isPrivileged) {
                const taskPermissions = rbacRepository.getRolePermissions(userRole);
                const moduleActions = taskPermissions?.modulePermissions.tasks || [];
                const specialPermissions = taskPermissions?.specialPermissions || [];
                const canCreateTask = moduleActions.includes('create') ||
                    specialPermissions.includes('create_tasks') ||
                    specialPermissions.includes('assign_tasks');
                if (method === 'POST' && canCreateTask) {
                    // Authorized task creators may insert through the compatibility gateway.
                }
                else if (method === 'DELETE') {
                    const taskIdFilter = new URLSearchParams(queryString).get('id') || '';
                    const taskId = taskIdFilter.startsWith('eq.') ? taskIdFilter.slice(3) : '';
                    if (!taskId) {
                        res.status(400).json({
                            success: false,
                            error: { code: 'TASK_ID_REQUIRED', message: 'A single task ID is required for task deletion.' },
                        });
                        return;
                    }
                    const currentTaskResult = await query(`SELECT * FROM public.enterprise_tasks WHERE id::text = $1 LIMIT 1`, [taskId]);
                    const currentTask = currentTaskResult.rows[0];
                    if (!currentTask || !isTaskCreatorCaller(currentTask, callerEmpCode, callerUuid, callerName)) {
                        res.status(403).json({
                            success: false,
                            error: { code: 'FORBIDDEN', message: 'You can only delete tasks you created.' },
                        });
                        return;
                    }
                }
                else if (method !== 'PATCH') {
                    res.status(403).json({
                        success: false,
                        error: { code: 'FORBIDDEN', message: 'Your role cannot create or modify enterprise tasks.' },
                    });
                    return;
                }
                else {
                    const taskIdFilter = new URLSearchParams(queryString).get('id') || '';
                    const taskId = taskIdFilter.startsWith('eq.') ? taskIdFilter.slice(3) : '';
                    if (!taskId) {
                        res.status(400).json({
                            success: false,
                            error: { code: 'TASK_ID_REQUIRED', message: 'A single task ID is required for task updates.' },
                        });
                        return;
                    }
                    const currentTaskResult = await query(`SELECT * FROM public.enterprise_tasks WHERE id::text = $1 LIMIT 1`, [taskId]);
                    const currentTask = currentTaskResult.rows[0];
                    const isCreator = currentTask ? isTaskCreatorCaller(currentTask, callerEmpCode, callerUuid, callerName) : false;
                    if (!currentTask || (!isCreator && !isTaskVisibleToCaller(currentTask, callerEmpCode, callerUuid, callerName))) {
                        res.status(403).json({
                            success: false,
                            error: { code: 'FORBIDDEN', message: 'You can only update a task assigned or visible to you.' },
                        });
                        return;
                    }
                    if (!isCreator && payload && typeof payload === 'object' && !Array.isArray(payload)) {
                        const allowed = new Set(['overall_status', 'overall_progress', 'task_data', 'updated_at']);
                        for (const key of Object.keys(payload)) {
                            if (!allowed.has(key))
                                delete payload[key];
                        }
                        // Standard users may append work evidence and update their process
                        // state, but cannot rewrite task ownership, title, due dates, or
                        // assignee identities through the compatibility gateway.
                        if (payload.task_data && typeof payload.task_data === 'object' && !Array.isArray(payload.task_data)) {
                            payload.task_data = mergeStandardTaskUpdate(currentTask, payload.task_data, payload.overall_status, payload.overall_progress, payload.updated_at);
                        }
                    }
                }
            }
            else if (table === 'company_settings') {
                // Protect employee_profiles_data from redacted/partial overwrites and scrub plaintext passwords (CRIT-02)
                const isProfilesSetting = (payload && typeof payload === 'object' && payload.setting_key === 'employee_profiles_data') ||
                    queryString.includes('employee_profiles_data');
                if (isProfilesSetting && payload && typeof payload === 'object') {
                    const incomingVal = payload.setting_val;
                    if (incomingVal && typeof incomingVal === 'object' && !Array.isArray(incomingVal)) {
                        let existingMap = {};
                        try {
                            const existingRes = await query(`SELECT setting_val FROM public.company_settings WHERE setting_key = 'employee_profiles_data' LIMIT 1`);
                            const rawExisting = existingRes.rows[0]?.setting_val;
                            if (rawExisting && typeof rawExisting === 'object' && !Array.isArray(rawExisting)) {
                                existingMap = { ...rawExisting };
                            }
                        }
                        catch {
                            // Fallback if DB query unavailable in mock environment
                        }
                        const deepMergeNonBlank = (baseObj, nextObj) => {
                            if (!nextObj || typeof nextObj !== 'object' || Array.isArray(nextObj))
                                return nextObj;
                            const base = baseObj && typeof baseObj === 'object' && !Array.isArray(baseObj) ? baseObj : {};
                            const merged = { ...base };
                            for (const [k, v] of Object.entries(nextObj)) {
                                if (v === undefined || v === null)
                                    continue;
                                if (typeof v === 'string' && v.trim() === '') {
                                    if (merged[k] === undefined)
                                        merged[k] = '';
                                    continue;
                                }
                                if (typeof v === 'object' && !Array.isArray(v)) {
                                    merged[k] = deepMergeNonBlank(base[k], v);
                                }
                                else {
                                    merged[k] = v;
                                }
                            }
                            return merged;
                        };
                        const safeMergedMap = { ...existingMap };
                        for (const [k, v] of Object.entries(incomingVal)) {
                            if (!v || typeof v !== 'object')
                                continue;
                            const scrubbedEntry = scrubProfilePasswordFields(v);
                            const keyLower = k.toLowerCase();
                            const entryEmpId = String(scrubbedEntry.employeeId || '').toLowerCase();
                            const entryUuid = String(scrubbedEntry.id || '').toLowerCase();
                            const isSelfEntry = (callerEmpCode && (keyLower === callerEmpCode || entryEmpId === callerEmpCode)) ||
                                (callerUuid && (keyLower === callerUuid || entryUuid === callerUuid));
                            // Non-HR callers can only merge their own profile entry, never overwriting colleagues with redacted directory data
                            if (!isHrAdmin && !isSelfEntry) {
                                continue;
                            }
                            safeMergedMap[k] = deepMergeNonBlank(existingMap[k], scrubbedEntry);
                        }
                        payload.setting_val = safeMergedMap;
                    }
                }
                // Protect loan_records_data (Advance Salary) from stale snapshot overwrites or
                // accidental deletion during concurrent Web/Mobile writes.
                const isLoanRecordsSetting = (payload && typeof payload === 'object' && payload.setting_key === 'loan_records_data') ||
                    queryString.includes('loan_records_data');
                if (isLoanRecordsSetting && payload && typeof payload === 'object' && Array.isArray(payload.setting_val)) {
                    let existingLoans = [];
                    try {
                        const existingRes = await query(`SELECT setting_val FROM public.company_settings WHERE setting_key = 'loan_records_data' LIMIT 1`);
                        const rawExisting = existingRes.rows[0]?.setting_val;
                        if (Array.isArray(rawExisting)) {
                            existingLoans = rawExisting;
                        }
                    }
                    catch {
                        // Fallback if DB query unavailable in mock environment
                    }
                    payload.setting_val = mergeLoanRecordsSetting({
                        existing: existingLoans,
                        incoming: payload.setting_val,
                        canManageLoans: isHrAdmin || isFinanceAdmin || isCeoUser,
                        callerEmpCode,
                        callerUuid,
                        callerName,
                    });
                }
            }
        }
        // Forward validated request to internal PostgREST service
        const baseRestUrl = (env.DB_REST_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
        const targetUrl = `${baseRestUrl}/rest/v1/${table}${queryString ? `?${queryString}` : ''}`;
        const serviceKey = env.DB_REST_SERVICE_KEY || env.DB_REST_KEY || '';
        const headers = {
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
        let data = null;
        if (text) {
            try {
                data = JSON.parse(text);
            }
            catch {
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
            }
            else if (data && typeof data === 'object') {
                const isSelf = isRowOwnedByCaller(data, callerEmpCode, callerUuid);
                data = sanitizeEmployeeRowForDirectory(data, isPrivileged || isSelf);
            }
        }
        else if (table === 'company_settings') {
            if (Array.isArray(data)) {
                data = data.map((row) => sanitizeCompanySettingsRow(row, isPrivileged, isFinanceAdmin, callerEmpCode, callerUuid));
            }
            else if (data && typeof data === 'object') {
                data = sanitizeCompanySettingsRow(data, isPrivileged, isFinanceAdmin, callerEmpCode, callerUuid);
            }
        }
        else if (!isPrivileged &&
            (table === 'payroll_records' ||
                table === 'salary_structures' ||
                table === 'leave_requests' ||
                table === 'attendance_records' ||
                table === 'expenses' ||
                table === 'employee_documents')) {
            if (Array.isArray(data)) {
                data = data.filter((row) => isRowOwnedByCaller(row, callerEmpCode, callerUuid));
            }
        }
        else if (!isPrivileged && table === 'enterprise_tasks') {
            if (Array.isArray(data)) {
                data = data.filter((row) => isTaskVisibleToCaller(row, callerEmpCode, callerUuid, callerName));
            }
            else if (data && !isTaskVisibleToCaller(data, callerEmpCode, callerUuid, callerName)) {
                data = null;
            }
        }
        else if (table === 'assets' && !isHrAdmin && rolePermissions?.dataAccess !== 'all') {
            if (Array.isArray(data)) {
                data = data.filter((row) => isAssetVisibleToCaller(row, callerEmpCode, callerUuid, callerName));
            }
            else if (data && !isAssetVisibleToCaller(data, callerEmpCode, callerUuid, callerName)) {
                data = null;
            }
        }
        else if (!isHrAdmin && table === 'shift_requests') {
            if (Array.isArray(data)) {
                data = data.filter((row) => isRowOwnedByCaller(row, callerEmpCode, callerUuid));
            }
            else if (data && !isRowOwnedByCaller(data, callerEmpCode, callerUuid)) {
                data = null;
            }
        }
        else if (!isPrivileged && (table === 'task_assignees' || table === 'task_updates' || table === 'notification_recipients')) {
            if (Array.isArray(data)) {
                data = data.filter((row) => isRowOwnedByCaller(row, callerEmpCode, callerUuid));
            }
            else if (data && !isRowOwnedByCaller(data, callerEmpCode, callerUuid)) {
                data = null;
            }
        }
        if (method !== 'GET' && table === 'employees') {
            authRepository.invalidateUserCache();
        }
        res.status(200).json({
            success: true,
            data,
        });
    }
    catch (err) {
        next(err);
    }
};
//# sourceMappingURL=dataGatewayController.js.map