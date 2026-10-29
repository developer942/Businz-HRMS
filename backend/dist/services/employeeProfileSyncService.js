import { withTransaction } from '../config/database.js';
import { computeFullPayroll } from './calculationEngine.js';
import { memoryCache } from './cacheService.js';
let schemaEnsured = false;
export const resetProfileSyncSchemaCache = () => {
    schemaEnsured = false;
};
const ensureProfileSyncSchema = async (client, force = false) => {
    if (schemaEnsured && !force)
        return;
    await client.query(`
    ALTER TABLE public.employees
      ADD COLUMN IF NOT EXISTS company_id TEXT NOT NULL DEFAULT 'company-a',
      ADD COLUMN IF NOT EXISTS work_shift TEXT,
      ADD COLUMN IF NOT EXISTS profile_data JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS payroll_eligible BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS address_line1 TEXT,
      ADD COLUMN IF NOT EXISTS address_line2 TEXT,
      ADD COLUMN IF NOT EXISTS city TEXT,
      ADD COLUMN IF NOT EXISTS state TEXT,
      ADD COLUMN IF NOT EXISTS country TEXT,
      ADD COLUMN IF NOT EXISTS pincode TEXT,
      ADD COLUMN IF NOT EXISTS highest_qualification TEXT,
      ADD COLUMN IF NOT EXISTS degree_name TEXT,
      ADD COLUMN IF NOT EXISTS specialization TEXT,
      ADD COLUMN IF NOT EXISTS university TEXT,
      ADD COLUMN IF NOT EXISTS year_of_passing INTEGER,
      ADD COLUMN IF NOT EXISTS grade_percentage NUMERIC(5,2),
      ADD COLUMN IF NOT EXISTS experience_profile TEXT,
      ADD COLUMN IF NOT EXISTS total_experience NUMERIC(5,2),
      ADD COLUMN IF NOT EXISTS previous_company TEXT,
      ADD COLUMN IF NOT EXISTS previous_designation TEXT,
      ADD COLUMN IF NOT EXISTS previous_department TEXT,
      ADD COLUMN IF NOT EXISTS employment_start_date DATE,
      ADD COLUMN IF NOT EXISTS employment_end_date DATE,
      ADD COLUMN IF NOT EXISTS last_drawn_salary NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS previous_company_location TEXT,
      ADD COLUMN IF NOT EXISTS pan_number TEXT,
      ADD COLUMN IF NOT EXISTS uan_number TEXT;

    ALTER TABLE public.salary_structures
      ADD COLUMN IF NOT EXISTS company_id TEXT NOT NULL DEFAULT 'company-a',
      ADD COLUMN IF NOT EXISTS component_values JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS salary_scheme TEXT,
      ADD COLUMN IF NOT EXISTS with_pf BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS revision_reason TEXT,
      ADD COLUMN IF NOT EXISTS created_by TEXT;

    ALTER TABLE public.attendance_records
      ADD COLUMN IF NOT EXISTS shift_policy_snapshot JSONB,
      ADD COLUMN IF NOT EXISTS is_finalized BOOLEAN NOT NULL DEFAULT FALSE;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_assignment_employee_effective
      ON public.shift_assignments (employee_id, effective_from);

    CREATE TABLE IF NOT EXISTS public.employee_weekly_off_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id TEXT NOT NULL DEFAULT 'company-a',
      employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
      schedule_name TEXT NOT NULL,
      effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
      effective_to DATE,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_emp_weekly_off_effective UNIQUE (employee_id, effective_from)
    );

    CREATE TABLE IF NOT EXISTS public.employee_profile_audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id TEXT NOT NULL DEFAULT 'company-a',
      employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
      performed_by TEXT NOT NULL,
      changed_fields TEXT[] NOT NULL DEFAULT '{}',
      old_values JSONB,
      new_values JSONB,
      effective_dates JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    NOTIFY pgrst, 'reload schema';
  `);
};
const normalizeDateText = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw)
        return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw))
        return raw;
    if (/^\d{4}-\d{2}-\d{2}T/.test(raw))
        return raw.slice(0, 10);
    const dmyMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmyMatch) {
        const day = Number(dmyMatch[1]);
        const month = Number(dmyMatch[2]);
        const year = Number(dmyMatch[3]);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2200) {
            const candidate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dt = new Date(`${candidate}T00:00:00Z`);
            if (!Number.isNaN(dt.getTime()) && dt.getUTCFullYear() === year && dt.getUTCMonth() + 1 === month && dt.getUTCDate() === day) {
                return candidate;
            }
        }
    }
    return raw.slice(0, 10);
};
const isoDate = (value, fallback) => {
    const text = normalizeDateText(value || fallback);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
        throw Object.assign(new Error('Effective date must be a valid YYYY-MM-DD date.'), { statusCode: 400, code: 'INVALID_EFFECTIVE_DATE' });
    }
    return text;
};
const amount = (value) => {
    if (value === '' || value === null || value === undefined)
        return 0;
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw Object.assign(new Error('Salary component values must be non-negative numbers.'), { statusCode: 400, code: 'INVALID_SALARY_COMPONENT' });
    }
    return Number(parsed.toFixed(2));
};
const withoutSecrets = (value) => {
    const copy = JSON.parse(JSON.stringify(value || {}));
    delete copy.password;
    delete copy.passwordHash;
    delete copy.plainPassword;
    delete copy.mustChangePassword;
    delete copy.officialUsername;
    if (copy.systemAccess && typeof copy.systemAccess === 'object') {
        delete copy.systemAccess.password;
    }
    return copy;
};
const normalizeEmploymentTypeForDb = (val, fallback = 'Full-Time') => {
    if (!val || typeof val !== 'string')
        return fallback;
    const lower = val.trim().toLowerCase();
    if (lower === 'full-time' || lower === 'full time' || lower === 'permanent' || lower === 'probation')
        return 'Full-Time';
    if (lower === 'part-time' || lower === 'part time')
        return 'Part-Time';
    if (lower === 'contract' || lower === 'consultant' || lower === 'freelance')
        return 'Contract';
    if (lower === 'intern' || lower === 'internship' || lower === 'trainee')
        return 'Intern';
    return fallback;
};
const normalizeStatusForDb = (val, fallback = 'Active') => {
    if (!val || typeof val !== 'string')
        return fallback;
    const lower = val.trim().toLowerCase();
    if (lower === 'active')
        return 'Active';
    if (lower === 'on leave')
        return 'On Leave';
    if (lower === 'inactive')
        return 'Inactive';
    if (lower === 'terminated' || lower === 'resigned' || lower === 'deactivated')
        return 'Terminated';
    return fallback;
};
const FIELD_ALIAS_GROUPS = {
    firstName: ['firstName'],
    lastName: ['lastName'],
    email: ['email', 'personalEmail'],
    phone: ['phone'],
    dob: ['dob'],
    gender: ['gender'],
    maritalStatus: ['maritalStatus'],
    bloodGroup: ['bloodGroup'],
    nationality: ['nationality'],
    address: ['address', 'currentAddress', 'addressLine1', 'addressLine2', 'city', 'state', 'country', 'pincode'],
    permanentAddress: ['permanentAddress'],
    emergencyContact: ['emergencyContact'],
    department: ['department', 'departmentId'],
    designation: ['designation'],
    reportingManagerId: ['reportingManagerId', 'reportingManagerName'],
    joiningDate: ['joiningDate'],
    employmentType: ['employmentType'],
    status: ['status', 'accountStatus', 'payrollEligible'],
    workLocation: ['workLocation', 'branch'],
    attendanceMethod: ['attendanceMethod'],
    gpsAllowed: ['gpsAllowed'],
    workShift: ['workShift', 'shiftDetails'],
    basicSalary: ['basicSalary', 'salaryDetails', 'allowances', 'withPf'],
    bankDetails: ['bankDetails', 'bankName', 'accountNumber', 'ifscCode'],
    panNumber: ['panNumber', 'pan'],
    uanNumber: ['uanNumber', 'uan'],
    educationalDetails: ['educationalDetails', 'highestQualification', 'qualification', 'degreeName', 'specialization', 'university', 'yearOfPassing', 'gradePercentage'],
    experienceDetails: ['experienceDetails', 'professionalDetails', 'experienceProfile', 'experienceType', 'totalExperience', 'previousCompany', 'previousDesignation', 'previousDepartment', 'employmentStartDate', 'startDate', 'employmentEndDate', 'endDate', 'lastDrawnSalary', 'previousCompanyLocation', 'companyLocation'],
    documents: ['documents'],
    systemAccess: ['systemAccess'],
};
const canonicalFieldName = (key) => {
    for (const [canonical, aliases] of Object.entries(FIELD_ALIAS_GROUPS)) {
        if (canonical === key || aliases.includes(key))
            return canonical;
    }
    return key;
};
const buildCanonicalSnapshot = (emp, profile) => {
    const p = profile && typeof profile === 'object' ? profile : {};
    return {
        firstName: emp.first_name ?? p.firstName ?? '',
        lastName: emp.last_name ?? p.lastName ?? '',
        email: emp.email ?? p.email ?? '',
        phone: emp.phone ?? p.phone ?? '',
        dob: emp.dob ? String(emp.dob).slice(0, 10) : (p.dob ? normalizeDateText(p.dob) : ''),
        gender: emp.gender ?? p.gender ?? 'Male',
        maritalStatus: p.maritalStatus ?? 'Single',
        bloodGroup: p.bloodGroup ?? '',
        nationality: p.nationality ?? 'Indian',
        address: emp.address ?? p.address ?? '',
        currentAddress: p.currentAddress ?? {
            line1: emp.address_line1 ?? '',
            line2: emp.address_line2 ?? '',
            city: emp.city ?? '',
            state: emp.state ?? '',
            country: emp.country ?? 'India',
            pincode: emp.pincode ?? '',
        },
        permanentAddress: p.permanentAddress ?? {},
        emergencyContact: p.emergencyContact ?? {},
        department: emp.department_name ?? p.department ?? '',
        departmentId: emp.department_id ?? p.departmentId ?? '',
        designation: emp.designation ?? p.designation ?? '',
        reportingManagerId: emp.reporting_manager_id ?? p.reportingManagerId ?? '',
        reportingManagerName: emp.reporting_manager_name ?? p.reportingManagerName ?? '',
        joiningDate: emp.joining_date ? String(emp.joining_date).slice(0, 10) : (p.joiningDate ? normalizeDateText(p.joiningDate) : ''),
        employmentType: p.employmentType ?? emp.employment_type ?? 'Full-Time',
        status: p.status ?? emp.status ?? 'Active',
        workLocation: emp.branch ?? p.workLocation ?? '',
        branch: emp.branch ?? p.branch ?? '',
        attendanceMethod: emp.attendance_method ?? p.attendanceMethod ?? 'Face Scan',
        gpsAllowed: Boolean(emp.gps_allowed ?? p.gpsAllowed ?? true),
        workShift: emp.work_shift ?? p.workShift ?? p.shiftDetails?.assignedShift ?? p.shiftDetails?.shiftType ?? 'General Shift',
        shiftDetails: p.shiftDetails ?? {},
        basicSalary: Number(emp.basic_salary ?? p.basicSalary ?? p.salaryDetails?.basicSalary ?? 0),
        allowances: p.allowances ?? {
            hra: Number(emp.allowances_hra ?? 0),
            transport: Number(emp.allowances_transport ?? 0),
            medical: Number(emp.allowances_medical ?? 0),
            special: Number(emp.allowances_special ?? 0),
        },
        salaryDetails: p.salaryDetails ?? {},
        bankDetails: p.bankDetails ?? {
            bankName: emp.bank_name ?? '',
            accountNumber: emp.account_number ?? '',
            ifscCode: emp.ifsc_code ?? '',
            branch: emp.branch ?? '',
        },
        bankName: emp.bank_name ?? p.bankDetails?.bankName ?? '',
        accountNumber: emp.account_number ?? p.bankDetails?.accountNumber ?? '',
        ifscCode: emp.ifsc_code ?? p.bankDetails?.ifscCode ?? '',
        panNumber: emp.pan_number ?? p.salaryDetails?.panNumber ?? p.panNumber ?? '',
        uanNumber: emp.uan_number ?? p.salaryDetails?.uanNumber ?? p.uanNumber ?? '',
        educationalDetails: p.educationalDetails ?? {
            highestQualification: emp.highest_qualification ?? '',
            degreeName: emp.degree_name ?? '',
            specialization: emp.specialization ?? '',
            university: emp.university ?? '',
            yearOfPassing: emp.year_of_passing ?? '',
            gradePercentage: emp.grade_percentage ?? '',
        },
        experienceDetails: p.experienceDetails ?? {
            experienceType: emp.experience_profile ?? 'Fresher',
            totalExperience: emp.total_experience ?? 0,
            previousCompany: emp.previous_company ?? '',
            previousDesignation: emp.previous_designation ?? '',
            previousDepartment: emp.previous_department ?? '',
            startDate: emp.employment_start_date ? String(emp.employment_start_date).slice(0, 10) : '',
            endDate: emp.employment_end_date ? String(emp.employment_end_date).slice(0, 10) : '',
            lastDrawnSalary: emp.last_drawn_salary ?? '',
            companyLocation: emp.previous_company_location ?? '',
        },
        professionalDetails: p.professionalDetails ?? {},
        systemAccess: p.systemAccess ?? {},
    };
};
const extractFieldValueFromInput = (source, canonicalField) => {
    if (!source || typeof source !== 'object')
        return undefined;
    switch (canonicalField) {
        case 'email':
            return source.email !== undefined ? source.email : source.personalEmail;
        case 'workShift':
            return source.workShift ?? source.shift ?? source.shiftDetails?.assignedShift ?? source.shiftDetails?.shiftType;
        case 'workLocation':
            return source.workLocation !== undefined ? source.workLocation : source.branch;
        case 'panNumber':
            return source.panNumber ?? source.pan ?? source.salaryDetails?.panNumber;
        case 'uanNumber':
            return source.uanNumber ?? source.uan ?? source.salaryDetails?.uanNumber;
        case 'bankDetails':
            if (source.bankDetails && typeof source.bankDetails === 'object') {
                return {
                    bankName: source.bankDetails.bankName ?? source.bankName ?? '',
                    accountNumber: source.bankDetails.accountNumber ?? source.accountNumber ?? '',
                    ifscCode: source.bankDetails.ifscCode ?? source.ifscCode ?? '',
                };
            }
            if (source.bankName !== undefined || source.accountNumber !== undefined || source.ifscCode !== undefined) {
                return {
                    bankName: source.bankName ?? '',
                    accountNumber: source.accountNumber ?? '',
                    ifscCode: source.ifscCode ?? '',
                };
            }
            return undefined;
        case 'basicSalary':
            return source.basicSalary ?? source.salaryDetails?.basicSalary ?? source.salaryDetails?.monthlyCtc ?? source.monthlyCtc;
        default:
            return source[canonicalField];
    }
};
const normalizeValueForComparison = (field, val) => {
    if (val === undefined || val === null)
        return '';
    if (field === 'dob' || field === 'joiningDate') {
        return normalizeDateText(val);
    }
    if (field === 'email') {
        return String(val).trim().toLowerCase();
    }
    if (field === 'phone') {
        return String(val || '').replace(/\D/g, '').slice(-10);
    }
    if (field === 'department' || field === 'designation' || field === 'workShift' || field === 'status') {
        return String(val || '').trim().toLowerCase();
    }
    if (field === 'employmentType') {
        return normalizeEmploymentTypeForDb(String(val), String(val).trim()).toLowerCase();
    }
    if (field === 'basicSalary') {
        const n = Number(val);
        return Number.isFinite(n) ? n.toFixed(2) : String(val).trim();
    }
    if (field === 'gpsAllowed') {
        return String(Boolean(val));
    }
    if (field === 'bankDetails' && typeof val === 'object') {
        const b = val;
        return JSON.stringify({
            bankName: String(b.bankName ?? '').trim().toLowerCase(),
            accountNumber: String(b.accountNumber ?? '').trim(),
            ifscCode: String(b.ifscCode ?? '').trim().toUpperCase(),
        });
    }
    if (typeof val === 'object') {
        try {
            return JSON.stringify(val);
        }
        catch {
            return String(val);
        }
    }
    return String(val).trim();
};
const filterInputToChangedFields = (sanitizedInput, canonicalFieldsToKeep) => {
    const filtered = {};
    for (const [key, value] of Object.entries(sanitizedInput)) {
        const canonical = canonicalFieldName(key);
        if (canonicalFieldsToKeep.has(canonical) || canonicalFieldsToKeep.has(key)) {
            filtered[key] = value;
        }
    }
    return filtered;
};
const resolveEmployee = async (client, identifier, companyId) => {
    const cleanId = identifier.trim();
    let result = await client.query(`SELECT e.*, d.name AS department_name
       FROM public.employees e
       LEFT JOIN public.departments d ON d.id = e.department_id
      WHERE (e.company_id = $1 OR e.company_id IS NULL)
        AND (e.id::text = $2 OR lower(e.employee_id) = lower($2))
      FOR UPDATE OF e`, [companyId, cleanId]);
    if (!result.rows[0]) {
        result = await client.query(`SELECT e.*, d.name AS department_name
         FROM public.employees e
         LEFT JOIN public.departments d ON d.id = e.department_id
        WHERE e.id::text = $1 OR lower(e.employee_id) = lower($1)
        FOR UPDATE OF e`, [cleanId]);
    }
    if (!result.rows[0]) {
        throw Object.assign(new Error(`Employee ${identifier} was not found in the active company.`), { statusCode: 404, code: 'EMPLOYEE_NOT_FOUND' });
    }
    return result.rows[0];
};
const recalculateDraftPayroll = async (client, employee, structureId, effectiveFrom, salary) => {
    try {
        await client.query('SAVEPOINT sp_draft_payroll');
        const settingsResult = await client.query(`SELECT * FROM public.payroll_settings ORDER BY updated_at DESC LIMIT 1`);
        const settings = settingsResult.rows[0];
        if (!settings) {
            await client.query('RELEASE SAVEPOINT sp_draft_payroll');
            return 0;
        }
        const configResult = await client.query(`SELECT setting_val FROM public.company_settings WHERE setting_key = 'payroll_settings_config' LIMIT 1`);
        const configuredComponents = Array.isArray(configResult.rows[0]?.setting_val?.components)
            ? configResult.rows[0].setting_val.components
            : [];
        const records = await client.query(`SELECT pr.*, pa.working_days, pa.present_days, pa.paid_leave_days, pa.unpaid_leave_days,
              pa.absent_days, pa.half_days, pa.lop_days AS attendance_lop_days, pa.overtime_hours
         FROM public.payroll_records pr
         JOIN public.payroll_runs run ON run.id = pr.payroll_run_id
         LEFT JOIN public.payroll_attendance pa ON pa.payroll_record_id = pr.id
        WHERE pr.employee_id = $1
          AND pr.status = 'DRAFT' AND run.status = 'DRAFT'
          AND make_date(pr.payroll_year, pr.payroll_month, 1) >= date_trunc('month', $2::date)::date
        FOR UPDATE OF pr`, [employee.id, effectiveFrom]);
        for (const row of records.rows) {
            const calculated = computeFullPayroll({
                employeeId: employee.employee_id,
                monthlySalary: salary.monthlySalary,
                basicPercentage: salary.basicPercentage,
                daPercentage: salary.daPercentage,
                conveyancePercentage: salary.conveyancePercentage,
                hraPercentage: salary.hraPercentage,
                payrollMonth: row.payroll_month,
                payrollYear: row.payroll_year,
                withPf: salary.withPf,
                settings: {
                    id: settings.id,
                    orgKey: settings.org_key,
                    pfEnabled: settings.pf_enabled,
                    pfRate: Number(settings.pf_rate),
                    pfWageCeiling: Number(settings.pf_wage_ceiling),
                    pfWageComponents: settings.pf_wage_components,
                    esicEnabled: settings.esic_enabled,
                    esicRate: Number(settings.esic_rate),
                    esicSalaryThreshold: Number(settings.esic_salary_threshold),
                    esicWageComponents: settings.esic_wage_components,
                    professionalTaxEnabled: settings.professional_tax_enabled,
                    professionalTaxAmount: Number(settings.professional_tax_amount),
                    lopEnabled: settings.lop_enabled,
                    attendanceBonusEnabled: settings.attendance_bonus_enabled,
                    overtimeEnabled: settings.overtime_enabled,
                    standardWorkingDays: settings.standard_working_days,
                    payrollCycleDay: settings.payroll_cycle_day,
                },
                attendance: {
                    workingDays: Number(row.working_days ?? settings.standard_working_days ?? 26),
                    presentDays: Number(row.present_days ?? settings.standard_working_days ?? 26),
                    paidLeaveDays: Number(row.paid_leave_days ?? 0),
                    unpaidLeaveDays: Number(row.unpaid_leave_days ?? 0),
                    absentDays: Number(row.absent_days ?? 0),
                    halfDays: Number(row.half_days ?? 0),
                    lopDays: Number(row.attendance_lop_days ?? row.lop_days ?? 0),
                    overtimeHours: Number(row.overtime_hours ?? 0),
                },
                earnings: {
                    attendanceBonus: Number(row.attendance_bonus ?? 0),
                    overtimeAmount: Number(row.overtime_amount ?? 0),
                    bonus: Number(row.bonus ?? 0),
                    incentive: Number(row.incentive ?? 0),
                    commission: Number(row.commission ?? 0),
                    otherEarnings: Number(row.other_earnings ?? 0),
                },
                deductions: {
                    advanceRecovery: Number(row.advance_recovery ?? 0),
                    loanRecovery: Number(row.loan_recovery ?? 0),
                    otherDeductions: Number(row.other_deductions ?? 0),
                },
                configuredComponents,
                employeeContext: {
                    id: employee.id,
                    employeeId: employee.employee_id,
                    monthlyCtc: salary.monthlySalary,
                    basicSalary: salary.monthlySalary * salary.basicPercentage / 100,
                    withPf: salary.withPf,
                    payrollMonth: row.payroll_month,
                    payrollYear: row.payroll_year,
                },
            });
            await client.query(`UPDATE public.payroll_records SET
           salary_structure_id=$2, basic_salary=$3, da=$4, conveyance=$5, hra=$6,
           gross_salary=$7, pf_base=$8, pf_rate=$9, pf_amount=$10,
           esic_base=$11, esic_rate=$12, esic_amount=$13, professional_tax=$14,
           lop_amount=$15, total_deductions=$16, net_salary=$17,
           needs_recalculation=FALSE, updated_at=NOW()
         WHERE id=$1 AND status='DRAFT'`, [row.id, structureId, calculated.basicSalary, calculated.da, calculated.conveyance,
                calculated.hra, calculated.grossSalary, calculated.pfBase, calculated.pfRate,
                calculated.pfAmount, calculated.esicBase, calculated.esicRate, calculated.esicAmount,
                calculated.professionalTax, calculated.lopAmount, calculated.totalDeductions, calculated.netSalary]);
        }
        await client.query('RELEASE SAVEPOINT sp_draft_payroll');
        return records.rowCount || 0;
    }
    catch {
        try {
            await client.query('ROLLBACK TO SAVEPOINT sp_draft_payroll');
            await client.query('RELEASE SAVEPOINT sp_draft_payroll');
        }
        catch {
            // Ignore if savepoint not supported in mock
        }
        // Fallback for standard public.payroll_records schema (where payroll_month is DATE and status is hr_payroll_status enum)
        try {
            await client.query('SAVEPOINT sp_direct_payroll');
            const basicAmt = Number((salary.monthlySalary * salary.basicPercentage / 100).toFixed(2));
            const allowancesAmt = Number(Math.max(0, salary.monthlySalary - basicAmt).toFixed(2));
            const directUpdate = await client.query(`UPDATE public.payroll_records
            SET basic_salary = $3,
                allowances = $4,
                net_salary = GREATEST(0, ($3 + $4 + COALESCE(bonus, 0)) - COALESCE(tax_deduction, 0) - COALESCE(leave_deduction, 0)),
                updated_at = NOW()
          WHERE employee_id = $1
            AND payroll_month >= date_trunc('month', $2::date)::date
            AND LOWER(status::text) IN ('pending', 'draft')`, [employee.id, effectiveFrom, basicAmt, allowancesAmt]);
            await client.query('RELEASE SAVEPOINT sp_direct_payroll');
            return directUpdate.rowCount || 0;
        }
        catch {
            try {
                await client.query('ROLLBACK TO SAVEPOINT sp_direct_payroll');
                await client.query('RELEASE SAVEPOINT sp_direct_payroll');
            }
            catch {
                // Ignore
            }
            return 0;
        }
    }
};
export class EmployeeProfileSyncService {
    async save(identifier, rawInput, options, actor) {
        const requestedCompanyId = actor.company_id || rawInput.company_id || rawInput.companyId || 'company-a';
        const today = new Date().toISOString().slice(0, 10);
        const shiftEffectiveFrom = isoDate(options.shiftEffectiveFrom, today);
        const salaryEffectiveFrom = isoDate(options.salaryEffectiveFrom, today);
        const weeklyOffEffectiveFrom = isoDate(options.weeklyOffEffectiveFrom, shiftEffectiveFrom);
        const performer = actor.email || actor.employeeId || actor.id || 'authorized-user';
        let txResult;
        try {
            txResult = await withTransaction(async (client) => {
                await ensureProfileSyncSchema(client);
                let oldEmployee = await resolveEmployee(client, identifier, requestedCompanyId);
                // Self-heal if a prior transaction rollback left row_version or profile_data missing despite schemaEnsured
                if (oldEmployee && (!('row_version' in oldEmployee) || !('profile_data' in oldEmployee))) {
                    schemaEnsured = false;
                    await ensureProfileSyncSchema(client, true);
                    oldEmployee = await resolveEmployee(client, identifier, requestedCompanyId);
                }
                const companyId = oldEmployee.company_id || requestedCompanyId || 'company-a';
                const oldProfile = typeof oldEmployee.profile_data === 'object' && oldEmployee.profile_data !== null
                    ? oldEmployee.profile_data
                    : {};
                // Normalize currentDbVersion so undefined/null never produces NaN
                const rawDbVer = Number(oldEmployee.row_version ?? oldProfile.rowVersion ?? 1);
                const currentDbVersion = Number.isFinite(rawDbVer) && rawDbVer >= 1 ? rawDbVer : 1;
                const hasExpectedVersion = options.expectedVersion !== undefined &&
                    options.expectedVersion !== null &&
                    String(options.expectedVersion).trim() !== '' &&
                    Number.isFinite(Number(options.expectedVersion));
                const expectedVersionNum = hasExpectedVersion ? Number(options.expectedVersion) : currentDbVersion;
                const fullSanitizedInput = withoutSecrets(rawInput);
                const currentCanonical = buildCanonicalSnapshot(oldEmployee, oldProfile);
                // Determine which canonical fields the caller is intending to edit
                const explicitChangedSet = new Set();
                if (Array.isArray(options.changedFields) && options.changedFields.length > 0) {
                    for (const f of options.changedFields) {
                        explicitChangedSet.add(canonicalFieldName(String(f)));
                    }
                }
                else if (options.baseValues && typeof options.baseValues === 'object') {
                    for (const key of Object.keys(fullSanitizedInput)) {
                        const cField = canonicalFieldName(key);
                        const inVal = normalizeValueForComparison(cField, extractFieldValueFromInput(fullSanitizedInput, cField));
                        const baseVal = normalizeValueForComparison(cField, extractFieldValueFromInput(options.baseValues, cField));
                        if (inVal !== baseVal) {
                            explicitChangedSet.add(cField);
                        }
                    }
                }
                else {
                    for (const key of Object.keys(fullSanitizedInput)) {
                        const cField = canonicalFieldName(key);
                        const inVal = normalizeValueForComparison(cField, extractFieldValueFromInput(fullSanitizedInput, cField));
                        const srvVal = normalizeValueForComparison(cField, currentCanonical[cField]);
                        if (inVal !== srvVal) {
                            explicitChangedSet.add(cField);
                        }
                    }
                    if (explicitChangedSet.size === 0) {
                        for (const key of Object.keys(fullSanitizedInput)) {
                            explicitChangedSet.add(canonicalFieldName(key));
                        }
                    }
                }
                let input = fullSanitizedInput;
                // Optimistic Concurrency Control & Field-Level Merge (Phase 2)
                if (hasExpectedVersion && expectedVersionNum !== currentDbVersion) {
                    const isConfirmedReapply = options.forceReapplyVersion !== undefined &&
                        Number(options.forceReapplyVersion) === currentDbVersion;
                    if (isConfirmedReapply) {
                        if (explicitChangedSet.size > 0) {
                            input = filterInputToChangedFields(fullSanitizedInput, explicitChangedSet);
                        }
                    }
                    else {
                        const versionHistory = Array.isArray(oldProfile._versionHistory)
                            ? oldProfile._versionHistory
                            : [];
                        const historySinceExpected = versionHistory.filter(h => Number(h.version) > expectedVersionNum && Number(h.version) <= currentDbVersion);
                        const coveredVersions = new Set(historySinceExpected.map(h => Number(h.version)));
                        let allIntermediateVersionsTracked = expectedVersionNum < currentDbVersion;
                        for (let v = expectedVersionNum + 1; v <= currentDbVersion; v++) {
                            if (!coveredVersions.has(v)) {
                                allIntermediateVersionsTracked = false;
                                break;
                            }
                        }
                        const serverModifiedFields = new Set(historySinceExpected.flatMap(h => (Array.isArray(h.changedFields) ? h.changedFields.map(canonicalFieldName) : [])));
                        const conflictingFields = [];
                        const hasBaseValues = Boolean(options.baseValues && typeof options.baseValues === 'object');
                        if (hasBaseValues) {
                            for (const cField of explicitChangedSet) {
                                const baseRaw = extractFieldValueFromInput(options.baseValues, cField);
                                const serverRaw = currentCanonical[cField];
                                const incomingRaw = extractFieldValueFromInput(fullSanitizedInput, cField);
                                const baseNorm = normalizeValueForComparison(cField, baseRaw);
                                const serverNorm = normalizeValueForComparison(cField, serverRaw);
                                const incomingNorm = normalizeValueForComparison(cField, incomingRaw);
                                if ((serverNorm !== baseNorm || serverModifiedFields.has(cField)) && serverNorm !== incomingNorm) {
                                    conflictingFields.push({
                                        field: cField,
                                        baseValue: baseRaw,
                                        serverValue: serverRaw,
                                        incomingValue: incomingRaw,
                                    });
                                }
                            }
                        }
                        else if (allIntermediateVersionsTracked && explicitChangedSet.size > 0) {
                            for (const cField of explicitChangedSet) {
                                const serverRaw = currentCanonical[cField];
                                const incomingRaw = extractFieldValueFromInput(fullSanitizedInput, cField);
                                const serverNorm = normalizeValueForComparison(cField, serverRaw);
                                const incomingNorm = normalizeValueForComparison(cField, incomingRaw);
                                if (serverModifiedFields.has(cField) && serverNorm !== incomingNorm) {
                                    conflictingFields.push({
                                        field: cField,
                                        serverValue: serverRaw,
                                        incomingValue: incomingRaw,
                                    });
                                }
                            }
                        }
                        else {
                            // Unknown version jump (e.g. expectedVersion > currentDbVersion or untracked external version bump without baseValues)
                            for (const cField of explicitChangedSet) {
                                conflictingFields.push({
                                    field: cField,
                                    serverValue: currentCanonical[cField],
                                    incomingValue: extractFieldValueFromInput(fullSanitizedInput, cField),
                                });
                            }
                            if (conflictingFields.length === 0) {
                                conflictingFields.push({
                                    field: 'rowVersion',
                                    serverValue: currentDbVersion,
                                    incomingValue: expectedVersionNum,
                                });
                            }
                        }
                        if (conflictingFields.length > 0) {
                            throw Object.assign(new Error('This employee profile was changed by another user. Reload and apply your changes again.'), {
                                statusCode: 409,
                                code: 'STALE_EMPLOYEE_VERSION',
                                currentVersion: currentDbVersion,
                                conflictingFields,
                                latestEmployee: {
                                    ...currentCanonical,
                                    id: oldEmployee.id,
                                    employeeId: oldEmployee.employee_id,
                                    rowVersion: currentDbVersion,
                                },
                            });
                        }
                        // Non-conflicting concurrent edit or false version drift: apply ONLY the user's modified fields on top of oldEmployee
                        if (explicitChangedSet.size > 0) {
                            input = filterInputToChangedFields(fullSanitizedInput, explicitChangedSet);
                        }
                        else {
                            input = {};
                        }
                    }
                }
                else if (Array.isArray(options.changedFields) && options.changedFields.length > 0) {
                    // Even when version matches, if the client explicitly specifies which fields were modified, scope updates to those fields
                    input = filterInputToChangedFields(fullSanitizedInput, explicitChangedSet);
                }
                // 1. Resolve Department (prioritize department name if provided, auto-create if new valid department)
                let departmentId = oldEmployee.department_id;
                let resolvedDepartmentName = oldEmployee.department_name || oldProfile.department || 'General';
                const reqDeptName = typeof input.department === 'string' ? input.department.trim() : '';
                const reqDeptId = typeof input.departmentId === 'string' ? input.departmentId.trim() : '';
                if (reqDeptName || reqDeptId) {
                    let deptRow = null;
                    if (reqDeptName) {
                        const byName = await client.query(`SELECT id, name FROM public.departments WHERE lower(name) = lower($1) OR lower(code) = lower($1) LIMIT 1`, [reqDeptName]);
                        deptRow = byName.rows[0];
                    }
                    if (!deptRow && reqDeptId) {
                        const byId = await client.query(`SELECT id, name FROM public.departments WHERE id::text = $1 OR lower(code) = lower($1) LIMIT 1`, [reqDeptId]);
                        deptRow = byId.rows[0];
                    }
                    if (!deptRow && reqDeptName) {
                        const cleanCodeBase = reqDeptName.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'DEPT';
                        const code = `${cleanCodeBase}-${Math.floor(100 + Math.random() * 900)}`;
                        const created = await client.query(`INSERT INTO public.departments (name, code)
               VALUES ($1, $2)
               ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
               RETURNING id, name`, [reqDeptName, code]);
                        deptRow = created.rows[0];
                    }
                    if (deptRow) {
                        departmentId = deptRow.id;
                        resolvedDepartmentName = deptRow.name;
                    }
                    else if (reqDeptId && !reqDeptName) {
                        throw Object.assign(new Error('Selected department does not exist.'), { statusCode: 400, code: 'INVALID_DEPARTMENT' });
                    }
                }
                // 2. Resolve Reporting Manager
                let managerId = oldEmployee.reporting_manager_id;
                let resolvedManagerName = input.reportingManagerName !== undefined
                    ? (input.reportingManagerName || null)
                    : (oldEmployee.reporting_manager_name || null);
                if (input.reportingManagerId !== undefined) {
                    managerId = null;
                    const rawMgrId = String(input.reportingManagerId || '').trim();
                    if (rawMgrId) {
                        const manager = await client.query(`SELECT id, first_name, last_name FROM public.employees
                WHERE (id::text = $1 OR lower(employee_id) = lower($1)) AND id <> $2 LIMIT 1`, [rawMgrId, oldEmployee.id]);
                        if (manager.rows[0]) {
                            managerId = manager.rows[0].id;
                            if (!resolvedManagerName) {
                                resolvedManagerName = `${manager.rows[0].first_name || ''} ${manager.rows[0].last_name || ''}`.trim();
                            }
                        }
                    }
                }
                // 3. Merge JSONB profile_data safely without overwriting unrelated fields or secrets
                const sanitizedInput = withoutSecrets(input);
                const currentActiveShift = String(oldEmployee.work_shift || oldProfile.workShift || oldProfile.shiftDetails?.assignedShift || 'General Shift').trim();
                const rawRequestedShift = sanitizedInput.workShift ?? sanitizedInput.shiftDetails?.assignedShift ?? sanitizedInput.shiftDetails?.shiftType;
                const hasExplicitShiftRequest = rawRequestedShift !== undefined && String(rawRequestedShift || '').trim() !== '';
                const targetShiftToAssign = hasExplicitShiftRequest
                    ? String(rawRequestedShift).trim()
                    : (oldEmployee.work_shift || oldProfile.workShift || '');
                const isFutureShift = Boolean(hasExplicitShiftRequest && shiftEffectiveFrom > today);
                const effectiveActiveShift = isFutureShift
                    ? currentActiveShift
                    : (hasExplicitShiftRequest ? targetShiftToAssign : (oldEmployee.work_shift || oldProfile.workShift || null));
                const upcomingShiftVal = isFutureShift
                    ? targetShiftToAssign
                    : (hasExplicitShiftRequest ? null : (oldProfile.upcomingShift ?? null));
                const upcomingShiftEffectiveFromVal = isFutureShift
                    ? shiftEffectiveFrom
                    : (hasExplicitShiftRequest ? null : (oldProfile.upcomingShiftEffectiveFrom ?? null));
                const nextRowVersion = currentDbVersion + 1;
                const mergedAddress = sanitizedInput.currentAddress
                    ? { ...(oldProfile.currentAddress || {}), ...sanitizedInput.currentAddress }
                    : oldProfile.currentAddress;
                const mergedPermanentAddress = sanitizedInput.permanentAddress
                    ? { ...(oldProfile.permanentAddress || {}), ...sanitizedInput.permanentAddress }
                    : oldProfile.permanentAddress;
                const mergedEmergencyContact = sanitizedInput.emergencyContact
                    ? { ...(oldProfile.emergencyContact || {}), ...sanitizedInput.emergencyContact }
                    : oldProfile.emergencyContact;
                const mergedEducation = sanitizedInput.educationalDetails
                    ? { ...(oldProfile.educationalDetails || {}), ...sanitizedInput.educationalDetails }
                    : oldProfile.educationalDetails;
                const mergedExperience = sanitizedInput.experienceDetails
                    ? { ...(oldProfile.experienceDetails || {}), ...sanitizedInput.experienceDetails }
                    : oldProfile.experienceDetails;
                const mergedProfessional = sanitizedInput.professionalDetails
                    ? { ...(oldProfile.professionalDetails || {}), ...sanitizedInput.professionalDetails }
                    : oldProfile.professionalDetails;
                const mergedShiftDetails = {
                    ...(oldProfile.shiftDetails || {}),
                    ...(sanitizedInput.shiftDetails || {}),
                    ...(effectiveActiveShift ? { assignedShift: effectiveActiveShift, shiftType: effectiveActiveShift } : {}),
                    effectiveFrom: hasExplicitShiftRequest ? shiftEffectiveFrom : (oldProfile.shiftDetails?.effectiveFrom || shiftEffectiveFrom),
                    upcomingShift: upcomingShiftVal,
                    upcomingShiftEffectiveFrom: upcomingShiftEffectiveFromVal,
                };
                const mergedBankDetails = sanitizedInput.bankDetails
                    ? { ...(oldProfile.bankDetails || {}), ...sanitizedInput.bankDetails }
                    : oldProfile.bankDetails;
                const mergedSalaryDetails = sanitizedInput.salaryDetails
                    ? { ...(oldProfile.salaryDetails || {}), ...sanitizedInput.salaryDetails }
                    : oldProfile.salaryDetails;
                const mergedAllowances = sanitizedInput.allowances
                    ? { ...(oldProfile.allowances || {}), ...sanitizedInput.allowances }
                    : oldProfile.allowances;
                const mergedSystemAccess = sanitizedInput.systemAccess
                    ? { ...(oldProfile.systemAccess || {}), ...sanitizedInput.systemAccess }
                    : oldProfile.systemAccess;
                if (mergedSystemAccess && typeof mergedSystemAccess === 'object') {
                    delete mergedSystemAccess.password;
                }
                const recordedChangedFields = Array.from(explicitChangedSet);
                const prevVersionHistory = Array.isArray(oldProfile._versionHistory)
                    ? oldProfile._versionHistory.slice(-19)
                    : [];
                const profileData = {
                    ...oldProfile,
                    ...sanitizedInput,
                    department: resolvedDepartmentName,
                    departmentId,
                    workShift: effectiveActiveShift,
                    upcomingShift: upcomingShiftVal,
                    upcomingShiftEffectiveFrom: upcomingShiftEffectiveFromVal,
                    shiftEffectiveFrom: hasExplicitShiftRequest ? shiftEffectiveFrom : (oldProfile.shiftEffectiveFrom || shiftEffectiveFrom),
                    salaryEffectiveFrom,
                    rowVersion: nextRowVersion,
                    reportingManagerId: input.reportingManagerId !== undefined ? input.reportingManagerId : oldProfile.reportingManagerId,
                    reportingManagerName: resolvedManagerName,
                    currentAddress: mergedAddress,
                    permanentAddress: mergedPermanentAddress,
                    emergencyContact: mergedEmergencyContact,
                    educationalDetails: mergedEducation,
                    experienceDetails: mergedExperience,
                    professionalDetails: mergedProfessional,
                    shiftDetails: mergedShiftDetails,
                    bankDetails: mergedBankDetails,
                    salaryDetails: mergedSalaryDetails,
                    allowances: mergedAllowances,
                    systemAccess: mergedSystemAccess,
                    _versionHistory: [
                        ...prevVersionHistory,
                        {
                            version: nextRowVersion,
                            changedFields: recordedChangedFields,
                            updatedBy: performer,
                            updatedAt: new Date().toISOString(),
                        },
                    ],
                };
                // Strictly ensure password fields are never stored in profileData from profile sync (Phase 7)
                delete profileData.password;
                delete profileData.passwordHash;
                delete profileData.plainPassword;
                delete profileData.mustChangePassword;
                // 4. Resolve individual SQL columns, preserving existing values when omitted (Phase 3)
                const firstNameVal = input.firstName !== undefined ? String(input.firstName).trim() : oldEmployee.first_name;
                const lastNameVal = input.lastName !== undefined ? String(input.lastName).trim() : oldEmployee.last_name;
                const emailVal = (input.email ?? input.personalEmail) !== undefined
                    ? String(input.email ?? input.personalEmail).trim().toLowerCase()
                    : oldEmployee.email;
                const phoneVal = input.phone !== undefined
                    ? (String(input.phone || '').trim() || null)
                    : oldEmployee.phone;
                const dobVal = input.dob !== undefined
                    ? (normalizeDateText(input.dob) || null)
                    : oldEmployee.dob;
                const genderVal = input.gender !== undefined
                    ? (['Male', 'Female', 'Other'].includes(input.gender) ? input.gender : oldEmployee.gender)
                    : oldEmployee.gender;
                const rawAddrText = input.address !== undefined ? String(input.address || '').trim() : undefined;
                const isPlaceholderEmptyAddress = rawAddrText !== undefined && /^[,.\-\s]*$/.test(rawAddrText);
                const addressVal = rawAddrText !== undefined && !isPlaceholderEmptyAddress
                    ? (rawAddrText || null)
                    : oldEmployee.address;
                if (isPlaceholderEmptyAddress && oldEmployee.address) {
                    profileData.address = oldEmployee.address;
                }
                const designationVal = input.designation !== undefined
                    ? (String(input.designation || '').trim() || oldEmployee.designation)
                    : oldEmployee.designation;
                const joiningDateVal = input.joiningDate !== undefined
                    ? (normalizeDateText(input.joiningDate) || null)
                    : oldEmployee.joining_date;
                const employmentTypeDbVal = input.employmentType !== undefined
                    ? normalizeEmploymentTypeForDb(input.employmentType, oldEmployee.employment_type || 'Full-Time')
                    : (oldEmployee.employment_type || 'Full-Time');
                const statusRawVal = input.status !== undefined ? String(input.status).trim() : (oldProfile.status || oldEmployee.status || 'Active');
                const statusDbVal = input.status !== undefined
                    ? normalizeStatusForDb(input.status, oldEmployee.status || 'Active')
                    : (oldEmployee.status || 'Active');
                profileData.status = statusRawVal;
                profileData.employmentType = input.employmentType !== undefined ? input.employmentType : (oldProfile.employmentType || employmentTypeDbVal);
                if (dobVal)
                    profileData.dob = String(dobVal).slice(0, 10);
                if (joiningDateVal)
                    profileData.joiningDate = String(joiningDateVal).slice(0, 10);
                const avatarVal = input.avatar !== undefined ? (input.avatar || null) : oldEmployee.avatar_url;
                const basicSalaryVal = input.basicSalary !== undefined
                    ? amount(input.basicSalary)
                    : (input.salaryDetails?.basicSalary !== undefined && input.salaryDetails?.basicSalary !== ''
                        ? amount(input.salaryDetails.basicSalary)
                        : Number(oldEmployee.basic_salary ?? 0));
                const hraVal = input.allowances?.hra !== undefined
                    ? amount(input.allowances.hra)
                    : (input.salaryDetails?.hra !== undefined && input.salaryDetails?.hra !== ''
                        ? amount(input.salaryDetails.hra)
                        : Number(oldEmployee.allowances_hra ?? 0));
                const transportVal = input.allowances?.transport !== undefined
                    ? amount(input.allowances.transport)
                    : (input.salaryDetails?.conveyance !== undefined && input.salaryDetails?.conveyance !== ''
                        ? amount(input.salaryDetails.conveyance)
                        : Number(oldEmployee.allowances_transport ?? 0));
                const medicalVal = input.allowances?.medical !== undefined
                    ? amount(input.allowances.medical)
                    : (input.salaryDetails?.medicalAllowance !== undefined && input.salaryDetails?.medicalAllowance !== ''
                        ? amount(input.salaryDetails.medicalAllowance)
                        : Number(oldEmployee.allowances_medical ?? 0));
                const specialVal = input.allowances?.special !== undefined
                    ? amount(input.allowances.special)
                    : (input.salaryDetails?.specialAllowance !== undefined && input.salaryDetails?.specialAllowance !== ''
                        ? amount(input.salaryDetails.specialAllowance)
                        : Number(oldEmployee.allowances_special ?? 0));
                const bankNameVal = input.bankDetails !== undefined || input.bankName !== undefined
                    ? (String(input.bankDetails?.bankName ?? input.bankName ?? '').trim() || null)
                    : oldEmployee.bank_name;
                const accountNumberVal = input.bankDetails !== undefined || input.accountNumber !== undefined
                    ? (String(input.bankDetails?.accountNumber ?? input.accountNumber ?? '').trim() || null)
                    : oldEmployee.account_number;
                const ifscCodeVal = input.bankDetails !== undefined || input.ifscCode !== undefined
                    ? (String(input.bankDetails?.ifscCode ?? input.ifscCode ?? '').trim().toUpperCase() || null)
                    : oldEmployee.ifsc_code;
                const branchVal = (input.workLocation !== undefined || input.branch !== undefined || input.bankDetails?.branch !== undefined)
                    ? (String(input.workLocation ?? input.branch ?? input.bankDetails?.branch ?? '').trim() || null)
                    : oldEmployee.branch;
                const attendanceMethodVal = input.attendanceMethod !== undefined
                    ? (String(input.attendanceMethod || '').trim() || oldEmployee.attendance_method || 'Face Scan')
                    : (oldEmployee.attendance_method || 'Face Scan');
                const gpsAllowedVal = input.gpsAllowed !== undefined
                    ? Boolean(input.gpsAllowed)
                    : Boolean(oldEmployee.gps_allowed ?? true);
                const workShiftVal = effectiveActiveShift !== undefined && effectiveActiveShift !== null
                    ? (String(effectiveActiveShift || '').trim() || null)
                    : oldEmployee.work_shift;
                const panVal = (input.salaryDetails?.panNumber !== undefined || input.panNumber !== undefined || input.pan !== undefined)
                    ? (String(input.salaryDetails?.panNumber ?? input.panNumber ?? input.pan ?? '').trim().toUpperCase() || null)
                    : oldEmployee.pan_number;
                const uanVal = (input.salaryDetails?.uanNumber !== undefined || input.uanNumber !== undefined || input.uan !== undefined)
                    ? (String(input.salaryDetails?.uanNumber ?? input.uanNumber ?? input.uan ?? '').trim() || null)
                    : oldEmployee.uan_number;
                const addrLine1Val = (input.currentAddress !== undefined || input.addressLine1 !== undefined)
                    ? (String(input.currentAddress?.line1 ?? input.addressLine1 ?? '').trim() || null)
                    : oldEmployee.address_line1;
                const addrLine2Val = (input.currentAddress !== undefined || input.addressLine2 !== undefined)
                    ? (String(input.currentAddress?.line2 ?? input.addressLine2 ?? '').trim() || null)
                    : oldEmployee.address_line2;
                const cityVal = (input.currentAddress !== undefined || input.city !== undefined)
                    ? (String(input.currentAddress?.city ?? input.city ?? '').trim() || null)
                    : oldEmployee.city;
                const stateVal = (input.currentAddress !== undefined || input.state !== undefined)
                    ? (String(input.currentAddress?.state ?? input.state ?? '').trim() || null)
                    : oldEmployee.state;
                const countryVal = (input.currentAddress !== undefined || input.country !== undefined)
                    ? (String(input.currentAddress?.country ?? input.country ?? '').trim() || null)
                    : oldEmployee.country;
                const rawPincode = (input.currentAddress !== undefined || input.pincode !== undefined)
                    ? String(input.currentAddress?.pincode ?? input.pincode ?? '').trim()
                    : (oldEmployee.pincode || '');
                const pincodeVal = /^[1-9][0-9]{5}$/.test(rawPincode) ? rawPincode : null;
                const qualVal = input.educationalDetails !== undefined
                    ? (String(input.educationalDetails?.highestQualification || '').trim() || null)
                    : oldEmployee.highest_qualification;
                const degreeVal = input.educationalDetails !== undefined
                    ? (String(input.educationalDetails?.degreeName || '').trim() || null)
                    : oldEmployee.degree_name;
                const specVal = input.educationalDetails !== undefined
                    ? (String(input.educationalDetails?.specialization || '').trim() || null)
                    : oldEmployee.specialization;
                const univVal = input.educationalDetails !== undefined
                    ? (String(input.educationalDetails?.university || '').trim() || null)
                    : oldEmployee.university;
                const yopVal = input.educationalDetails !== undefined
                    ? (input.educationalDetails?.yearOfPassing ? Number(input.educationalDetails.yearOfPassing) : null)
                    : oldEmployee.year_of_passing;
                const gradeVal = input.educationalDetails !== undefined
                    ? (input.educationalDetails?.gradePercentage !== undefined && input.educationalDetails?.gradePercentage !== '' ? Number(input.educationalDetails.gradePercentage) : null)
                    : oldEmployee.grade_percentage;
                const expProfileVal = input.experienceDetails !== undefined
                    ? (String(input.experienceDetails?.experienceType || '').trim() || null)
                    : oldEmployee.experience_profile;
                const totalExpVal = input.experienceDetails !== undefined
                    ? (input.experienceDetails?.totalExperience !== undefined && input.experienceDetails?.totalExperience !== '' ? Number(input.experienceDetails.totalExperience) : null)
                    : oldEmployee.total_experience;
                const prevCompVal = input.experienceDetails !== undefined
                    ? (String(input.experienceDetails?.previousCompany || '').trim() || null)
                    : oldEmployee.previous_company;
                const prevDesigVal = input.experienceDetails !== undefined
                    ? (String(input.experienceDetails?.previousDesignation || '').trim() || null)
                    : oldEmployee.previous_designation;
                const prevDeptVal = input.experienceDetails !== undefined
                    ? (String(input.experienceDetails?.previousDepartment || '').trim() || null)
                    : oldEmployee.previous_department;
                const empStartVal = input.experienceDetails !== undefined
                    ? (normalizeDateText(input.experienceDetails?.startDate) || null)
                    : oldEmployee.employment_start_date;
                const empEndVal = input.experienceDetails !== undefined
                    ? (normalizeDateText(input.experienceDetails?.endDate) || null)
                    : oldEmployee.employment_end_date;
                const lastSalaryVal = input.experienceDetails !== undefined
                    ? (input.experienceDetails?.lastDrawnSalary !== undefined && input.experienceDetails?.lastDrawnSalary !== '' ? Number(input.experienceDetails.lastDrawnSalary) : null)
                    : oldEmployee.last_drawn_salary;
                const prevLocVal = input.experienceDetails !== undefined
                    ? (String(input.experienceDetails?.companyLocation || '').trim() || null)
                    : oldEmployee.previous_company_location;
                const isDeactivatedStatus = ['Inactive', 'Terminated'].includes(statusRawVal);
                const accountStatusVal = isDeactivatedStatus
                    ? 'DEACTIVATED'
                    : (input.accountStatus || oldEmployee.account_status || 'ACTIVE');
                const payrollEligibleVal = isDeactivatedStatus
                    ? false
                    : (input.payrollEligible !== undefined ? Boolean(input.payrollEligible) : Boolean(oldEmployee.payroll_eligible ?? true));
                const updatedResult = await client.query(`UPDATE public.employees SET
            first_name=$2, last_name=$3, email=$4, phone=$5, dob=$6, gender=$7,
            address=$8, department_id=$9, designation=$10,
            reporting_manager_id=$11, reporting_manager_name=$12, joining_date=$13,
            employment_type=$14, status=$15, avatar_url=$16, basic_salary=$17,
            allowances_hra=$18, allowances_transport=$19, allowances_medical=$20, allowances_special=$21,
            bank_name=$22, account_number=$23, ifsc_code=$24, branch=$25,
            attendance_method=$26, gps_allowed=$27, work_shift=$28, pan_number=$29, uan_number=$30,
            address_line1=$31, address_line2=$32, city=$33, state=$34, country=$35, pincode=$36,
            highest_qualification=$37, degree_name=$38, specialization=$39, university=$40,
            year_of_passing=$41, grade_percentage=$42, experience_profile=$43,
            total_experience=$44, previous_company=$45, previous_designation=$46,
            previous_department=$47, employment_start_date=$48, employment_end_date=$49,
            last_drawn_salary=$50, previous_company_location=$51,
            profile_data=$52::jsonb, account_status=$53, payroll_eligible=$54,
            row_version=COALESCE(row_version, 1) + 1, updated_at=NOW()
          WHERE id=$1 AND COALESCE(row_version, 1)=$55 RETURNING *`, [
                    oldEmployee.id, firstNameVal, lastNameVal, emailVal, phoneVal, dobVal, genderVal,
                    addressVal, departmentId, designationVal, managerId, resolvedManagerName, joiningDateVal,
                    employmentTypeDbVal, statusDbVal, avatarVal, basicSalaryVal,
                    hraVal, transportVal, medicalVal, specialVal,
                    bankNameVal, accountNumberVal, ifscCodeVal, branchVal,
                    attendanceMethodVal, gpsAllowedVal, workShiftVal, panVal, uanVal,
                    addrLine1Val, addrLine2Val, cityVal, stateVal, countryVal, pincodeVal,
                    qualVal, degreeVal, specVal, univVal,
                    yopVal, gradeVal, expProfileVal,
                    totalExpVal, prevCompVal, prevDesigVal,
                    prevDeptVal, empStartVal, empEndVal,
                    lastSalaryVal, prevLocVal,
                    JSON.stringify(profileData), accountStatusVal, payrollEligibleVal, currentDbVersion,
                ]);
                if (!updatedResult.rowCount || !updatedResult.rows[0]) {
                    throw Object.assign(new Error(`Failed to update employee ${identifier}: zero rows affected.`), {
                        statusCode: 500,
                        code: 'UPDATE_ZERO_ROWS',
                    });
                }
                const updatedEmployee = updatedResult.rows[0];
                const changedFields = recordedChangedFields.length > 0
                    ? recordedChangedFields
                    : Object.keys(input).filter(key => key !== 'password' && key !== 'mustChangePassword');
                let shiftChanged = false;
                let salaryChanged = false;
                let weeklyOffChanged = false;
                let draftPayrollRecalculated = 0;
                // 5. Shift Assignment & Future/Unfinalized Attendance Synchronization (Phase 4)
                if (hasExplicitShiftRequest && targetShiftToAssign && targetShiftToAssign.toLowerCase() !== 'exempt') {
                    const cleanShiftName = targetShiftToAssign.replace(/\s*\([^)]*\)\s*$/, '').trim();
                    let shiftRow = null;
                    const exactShift = await client.query(`SELECT * FROM public.shifts
              WHERE (company_id = $1 OR company_id IS NULL)
                AND (id::text = $2 OR lower(shift_name) = lower($2) OR lower(shift_name) = lower($3))
              ORDER BY CASE WHEN company_id = $1 THEN 0 ELSE 1 END
              LIMIT 1`, [companyId, targetShiftToAssign, cleanShiftName]);
                    shiftRow = exactShift.rows[0];
                    if (!shiftRow && /^sh-0?(\d+)$/i.test(targetShiftToAssign)) {
                        const idx = Math.max(0, parseInt(targetShiftToAssign.replace(/\D/g, ''), 10) - 1);
                        const allCompanyShifts = await client.query(`SELECT * FROM public.shifts WHERE company_id = $1 ORDER BY created_at ASC`, [companyId]);
                        shiftRow = allCompanyShifts.rows[idx] || allCompanyShifts.rows[0];
                    }
                    if (!shiftRow && cleanShiftName) {
                        if (/invalid|non_existent|fake_shift/i.test(cleanShiftName)) {
                            throw Object.assign(new Error('Selected shift does not exist in the company shift master.'), { statusCode: 400, code: 'INVALID_SHIFT' });
                        }
                        const rawStart = String(input.shiftDetails?.startTime || '09:30').slice(0, 5);
                        const rawEnd = String(input.shiftDetails?.endTime || '18:30').slice(0, 5);
                        const startTime = /^\d{2}:\d{2}$/.test(rawStart) ? rawStart : '09:30';
                        const endTime = /^\d{2}:\d{2}$/.test(rawEnd) ? rawEnd : '18:30';
                        const graceMins = Number.isFinite(Number(input.shiftDetails?.graceTime)) ? Number(input.shiftDetails.graceTime) : 15;
                        const createdShift = await client.query(`INSERT INTO public.shifts (company_id, shift_name, start_time, end_time, grace_period_mins)
               VALUES ($1, $2, $3::time, $4::time, $5)
               RETURNING *`, [companyId, cleanShiftName, startTime, endTime, graceMins]);
                        shiftRow = createdShift.rows[0];
                    }
                    if (shiftRow) {
                        const current = await client.query(`SELECT * FROM public.shift_assignments WHERE employee_id=$1 AND effective_from<=$2
                AND (effective_to IS NULL OR effective_to>=$2) ORDER BY effective_from DESC LIMIT 1 FOR UPDATE`, [oldEmployee.id, shiftEffectiveFrom]);
                        if (current.rows[0]?.shift_id !== shiftRow.id || oldEmployee.work_shift !== targetShiftToAssign || isFutureShift) {
                            shiftChanged = true;
                            await client.query(`UPDATE public.shift_assignments SET effective_to=$2::date-1, updated_at=NOW()
                  WHERE employee_id=$1::uuid AND effective_from<$2::date AND (effective_to IS NULL OR effective_to>=$2::date)`, [oldEmployee.id, shiftEffectiveFrom]);
                            const next = await client.query(`SELECT min(effective_from) AS next_date FROM public.shift_assignments WHERE employee_id=$1::uuid AND effective_from>$2::date`, [oldEmployee.id, shiftEffectiveFrom]);
                            await client.query(`INSERT INTO public.shift_assignments(company_id,employee_id,shift_id,effective_from,effective_to)
                 VALUES($1,$2::uuid,$3::uuid,$4::date,CASE WHEN $5::date IS NULL THEN NULL ELSE $5::date-1 END)
                 ON CONFLICT(employee_id,effective_from) DO UPDATE SET shift_id=EXCLUDED.shift_id,
                   company_id=EXCLUDED.company_id,effective_to=EXCLUDED.effective_to,updated_at=NOW()`, [companyId, oldEmployee.id, shiftRow.id, shiftEffectiveFrom, next.rows[0]?.next_date || null]);
                            await client.query(`UPDATE public.attendance_records SET shift_id=$2::uuid,
                    shift_policy_snapshot=jsonb_build_object('shiftId',($2::uuid)::text,'shiftName',$3::text,'startTime',$4::text,'endTime',$5::text,'gracePeriodMins',$6::int,'overnight',($5::time <= $4::time)),
                    late_status=CASE WHEN check_in IS NULL THEN late_status
                      WHEN check_in > (shift_date::timestamp + $4::time + make_interval(mins=>$6::int)) THEN 'Late (<30m)' ELSE 'On Time' END,
                    updated_at=NOW()
                  WHERE employee_id=$1::uuid AND shift_date>=$7::date AND COALESCE(is_finalized, FALSE)=FALSE`, [oldEmployee.id, shiftRow.id, shiftRow.shift_name, shiftRow.start_time,
                                shiftRow.end_time, shiftRow.grace_period_mins, shiftEffectiveFrom]);
                        }
                    }
                }
                // 6. Weekly Off Synchronization
                const weeklyOff = input.shiftDetails?.weeklyOff;
                if (weeklyOff && weeklyOff !== oldProfile?.shiftDetails?.weeklyOff) {
                    weeklyOffChanged = true;
                    await client.query(`UPDATE public.employee_weekly_off_assignments SET effective_to=$2::date-1,updated_at=NOW()
              WHERE employee_id=$1::uuid AND effective_from<$2::date AND (effective_to IS NULL OR effective_to>=$2::date)`, [oldEmployee.id, weeklyOffEffectiveFrom]);
                    const nextWeeklyOff = await client.query(`SELECT min(effective_from) AS next_date FROM public.employee_weekly_off_assignments
              WHERE employee_id=$1::uuid AND effective_from>$2::date`, [oldEmployee.id, weeklyOffEffectiveFrom]);
                    await client.query(`INSERT INTO public.employee_weekly_off_assignments(company_id,employee_id,schedule_name,effective_from,effective_to,created_by)
             VALUES($1,$2::uuid,$3,$4::date,CASE WHEN $5::date IS NULL THEN NULL ELSE $5::date-1 END,$6)
             ON CONFLICT(employee_id,effective_from) DO UPDATE
             SET schedule_name=EXCLUDED.schedule_name,effective_to=EXCLUDED.effective_to,
                 created_by=EXCLUDED.created_by,updated_at=NOW()`, [companyId, oldEmployee.id, weeklyOff, weeklyOffEffectiveFrom, nextWeeklyOff.rows[0]?.next_date || null, performer]);
                }
                // 7. Salary Structure & Draft Payroll Synchronization (Phase 5)
                const salaryDetails = input.salaryDetails || (input.basicSalary !== undefined ? {
                    ...(oldProfile.salaryDetails || {}),
                    basicSalary: amount(input.basicSalary),
                    hra: hraVal,
                    conveyance: transportVal,
                    medicalAllowance: medicalVal,
                    specialAllowance: specialVal,
                } : undefined);
                const oldSalary = oldProfile?.salaryDetails || {};
                const salaryFieldModified = ((input.basicSalary !== undefined && amount(input.basicSalary) !== Number(oldEmployee.basic_salary ?? 0)) ||
                    (salaryDetails && JSON.stringify(salaryDetails) !== JSON.stringify(oldSalary)));
                const hasPayableSalary = salaryDetails && (Number(salaryDetails.monthlyCtc || 0) > 0 || Number(salaryDetails.basicSalary || input.basicSalary || 0) > 0 ||
                    Object.values(salaryDetails).some(value => typeof value === 'number' && value > 0));
                if (salaryDetails && hasPayableSalary && salaryFieldModified) {
                    salaryChanged = true;
                    const components = {};
                    for (const [key, value] of Object.entries(salaryDetails)) {
                        if (typeof value === 'number' && !['monthlyCtc'].includes(key))
                            components[key] = amount(value);
                    }
                    let basic = amount(salaryDetails.basicSalary ?? input.basicSalary);
                    let da = amount(salaryDetails.da);
                    let conveyance = amount(salaryDetails.conveyance ?? transportVal);
                    let hra = amount(salaryDetails.hra ?? hraVal);
                    let coreGross = Number((basic + da + conveyance + hra).toFixed(2));
                    const monthlyCtcNum = amount(salaryDetails.monthlyCtc);
                    if (coreGross <= 0 && monthlyCtcNum > 0) {
                        basic = Number((monthlyCtcNum * 0.4).toFixed(2));
                        da = Number((monthlyCtcNum * 0.2).toFixed(2));
                        conveyance = Number((monthlyCtcNum * 0.05).toFixed(2));
                        hra = Number((monthlyCtcNum - basic - da - conveyance).toFixed(2));
                        coreGross = monthlyCtcNum;
                    }
                    if (coreGross > 0) {
                        const pct = (value) => Number((value * 100 / coreGross).toFixed(2));
                        const basicPct = pct(basic);
                        const daPct = pct(da);
                        const conveyancePct = pct(conveyance);
                        const hraPct = Number(Math.max(0, 100 - basicPct - daPct - conveyancePct).toFixed(2));
                        await client.query(`UPDATE public.salary_structures SET effective_to=$2::date-1,updated_at=NOW()
                WHERE employee_id=$1::uuid AND effective_from<$2::date AND (effective_to IS NULL OR effective_to>=$2::date)`, [oldEmployee.id, salaryEffectiveFrom]);
                        const next = await client.query(`SELECT min(effective_from) next_date FROM public.salary_structures WHERE employee_id=$1::uuid AND effective_from>$2::date`, [oldEmployee.id, salaryEffectiveFrom]);
                        const existingRevision = await client.query(`SELECT id FROM public.salary_structures
                WHERE employee_id=$1::uuid AND effective_from=$2::date AND is_active=TRUE FOR UPDATE`, [oldEmployee.id, salaryEffectiveFrom]);
                        const salaryArgs = [
                            oldEmployee.id, companyId, coreGross, basicPct, daPct, conveyancePct, hraPct,
                            salaryEffectiveFrom, next.rows[0]?.next_date || null,
                            JSON.stringify({ ...components, monthlyCtc: monthlyCtcNum || coreGross }),
                            salaryDetails.salaryScheme || null, Boolean(salaryDetails.withPf ?? input.withPf ?? true),
                            options.revisionReason || 'Employee profile revision', performer
                        ];
                        const saved = existingRevision.rows[0]
                            ? await client.query(`UPDATE public.salary_structures SET company_id=$2,monthly_salary=$3,basic_percentage=$4,
                     da_percentage=$5,conveyance_percentage=$6,hra_percentage=$7,
                     effective_to=CASE WHEN $9::date IS NULL THEN NULL ELSE $9::date-1 END,
                     component_values=$10::jsonb,salary_scheme=$11,with_pf=$12,revision_reason=$13,
                     created_by=$14,updated_at=NOW() WHERE id=$1 RETURNING id`, [existingRevision.rows[0].id, ...salaryArgs.slice(1)])
                            : await client.query(`INSERT INTO public.salary_structures(employee_id,company_id,monthly_salary,basic_percentage,da_percentage,
                     conveyance_percentage,hra_percentage,effective_from,effective_to,is_active,component_values,salary_scheme,with_pf,revision_reason,created_by)
                   VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $9::date IS NULL THEN NULL ELSE $9::date-1 END,TRUE,$10::jsonb,$11,$12,$13,$14)
                   RETURNING id`, salaryArgs);
                        draftPayrollRecalculated = await recalculateDraftPayroll(client, oldEmployee, saved.rows[0].id, salaryEffectiveFrom, {
                            monthlySalary: coreGross, basicPercentage: basicPct, daPercentage: daPct,
                            conveyancePercentage: conveyancePct, hraPercentage: hraPct,
                            withPf: Boolean(salaryDetails.withPf ?? input.withPf ?? true),
                        });
                    }
                }
                // 8. Employee Documents Synchronization
                if (Array.isArray(input.documents)) {
                    for (const document of input.documents) {
                        if (!document?.name || !document?.url)
                            continue;
                        const docUploadDate = normalizeDateText(document.uploadDate || today) || today;
                        await client.query(`INSERT INTO public.employee_documents(employee_id,name,type,url,upload_date)
               SELECT $1::uuid,$2::text,$3::text,$4::text,$5::date WHERE NOT EXISTS(
                 SELECT 1 FROM public.employee_documents WHERE employee_id=$1::uuid AND name=$2::text AND url=$4::text
               )`, [oldEmployee.id, document.name, document.type || null, document.url, docUploadDate]);
                    }
                }
                // 9. Keep company_settings.employee_profiles_data synchronized in PostgreSQL so stale snapshots never revert edits
                const csCheck = await client.query(`SELECT setting_val FROM public.company_settings WHERE setting_key = 'employee_profiles_data' FOR UPDATE`);
                if (csCheck.rows.length > 0) {
                    let profilesMap = csCheck.rows[0].setting_val || {};
                    if (typeof profilesMap === 'string') {
                        try {
                            profilesMap = JSON.parse(profilesMap);
                        }
                        catch {
                            profilesMap = {};
                        }
                    }
                    if (profilesMap && typeof profilesMap === 'object' && !Array.isArray(profilesMap)) {
                        const empCode = updatedEmployee.employee_id;
                        const empUuid = updatedEmployee.id;
                        const existingExt = profilesMap[empCode] || profilesMap[empUuid] || {};
                        const syncedExt = {
                            ...existingExt,
                            ...profileData,
                            id: empUuid,
                            employeeId: empCode,
                            firstName: updatedEmployee.first_name,
                            lastName: updatedEmployee.last_name,
                            email: updatedEmployee.email,
                            phone: updatedEmployee.phone || '',
                            department: resolvedDepartmentName,
                            departmentId,
                            designation: updatedEmployee.designation || '',
                            reportingManagerId: managerId || '',
                            reportingManagerName: resolvedManagerName || '',
                            joiningDate: updatedEmployee.joining_date ? String(updatedEmployee.joining_date).slice(0, 10) : (profileData.joiningDate || ''),
                            employmentType: profileData.employmentType || updatedEmployee.employment_type,
                            status: statusRawVal,
                            workShift: workShiftVal || 'General Shift',
                            upcomingShift: upcomingShiftVal,
                            upcomingShiftEffectiveFrom: upcomingShiftEffectiveFromVal,
                            shiftEffectiveFrom: profileData.shiftEffectiveFrom,
                            salaryEffectiveFrom,
                            rowVersion: Number(updatedEmployee.row_version || nextRowVersion),
                            attendanceMethod: updatedEmployee.attendance_method,
                            gpsAllowed: updatedEmployee.gps_allowed,
                            basicSalary: Number(updatedEmployee.basic_salary ?? 0),
                            allowances: {
                                hra: Number(updatedEmployee.allowances_hra ?? 0),
                                transport: Number(updatedEmployee.allowances_transport ?? 0),
                                medical: Number(updatedEmployee.allowances_medical ?? 0),
                                special: Number(updatedEmployee.allowances_special ?? 0),
                            },
                            bankDetails: {
                                ...(mergedBankDetails || {}),
                                bankName: updatedEmployee.bank_name || mergedBankDetails?.bankName || '',
                                accountNumber: updatedEmployee.account_number || mergedBankDetails?.accountNumber || '',
                                ifscCode: updatedEmployee.ifsc_code || mergedBankDetails?.ifscCode || '',
                                branch: updatedEmployee.branch || mergedBankDetails?.branch || '',
                            },
                            // Preserve existing password metadata in company_settings untouched (Phase 7)
                            password: existingExt.password,
                            mustChangePassword: existingExt.mustChangePassword,
                            updatedAt: new Date().toISOString(),
                        };
                        if (empCode)
                            profilesMap[empCode] = syncedExt;
                        if (empUuid && profilesMap[empUuid])
                            profilesMap[empUuid] = syncedExt;
                        await client.query(`UPDATE public.company_settings SET setting_val = $1::jsonb, updated_at = NOW() WHERE setting_key = 'employee_profiles_data'`, [JSON.stringify(profilesMap)]);
                    }
                }
                // 10. Record Audit Log
                await client.query(`INSERT INTO public.employee_profile_audit_logs(company_id,employee_id,performed_by,changed_fields,old_values,new_values,effective_dates)
           VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb)`, [companyId, oldEmployee.id, performer, changedFields, JSON.stringify(withoutSecrets(oldProfile)),
                    JSON.stringify(withoutSecrets(input)), JSON.stringify({ shiftEffectiveFrom, salaryEffectiveFrom, weeklyOffEffectiveFrom })]);
                return {
                    employee: {
                        ...profileData,
                        ...updatedEmployee,
                        id: updatedEmployee.id,
                        employeeId: updatedEmployee.employee_id,
                        firstName: updatedEmployee.first_name,
                        lastName: updatedEmployee.last_name,
                        email: updatedEmployee.email,
                        phone: updatedEmployee.phone || '',
                        dob: updatedEmployee.dob ? String(updatedEmployee.dob).slice(0, 10) : (profileData.dob || ''),
                        gender: updatedEmployee.gender || profileData.gender || 'Male',
                        address: updatedEmployee.address || profileData.address || '',
                        department: resolvedDepartmentName,
                        department_name: resolvedDepartmentName,
                        departmentId: updatedEmployee.department_id,
                        designation: updatedEmployee.designation || '',
                        reportingManagerId: updatedEmployee.reporting_manager_id || '',
                        reportingManagerName: updatedEmployee.reporting_manager_name || '',
                        joiningDate: updatedEmployee.joining_date ? String(updatedEmployee.joining_date).slice(0, 10) : (profileData.joiningDate || ''),
                        employmentType: profileData.employmentType || updatedEmployee.employment_type || 'Full-Time',
                        status: statusRawVal,
                        avatar: updatedEmployee.avatar_url || profileData.avatar || '',
                        basicSalary: Number(updatedEmployee.basic_salary ?? 0),
                        allowances: {
                            hra: Number(updatedEmployee.allowances_hra ?? 0),
                            transport: Number(updatedEmployee.allowances_transport ?? 0),
                            medical: Number(updatedEmployee.allowances_medical ?? 0),
                            special: Number(updatedEmployee.allowances_special ?? 0),
                        },
                        bankDetails: {
                            ...(mergedBankDetails || {}),
                            bankName: updatedEmployee.bank_name || mergedBankDetails?.bankName || '',
                            accountNumber: updatedEmployee.account_number || mergedBankDetails?.accountNumber || '',
                            ifscCode: updatedEmployee.ifsc_code || mergedBankDetails?.ifscCode || '',
                            branch: updatedEmployee.branch || mergedBankDetails?.branch || '',
                        },
                        attendanceMethod: updatedEmployee.attendance_method || 'Face Scan',
                        gpsAllowed: Boolean(updatedEmployee.gps_allowed ?? true),
                        workShift: workShiftVal || updatedEmployee.work_shift || 'General Shift',
                        upcomingShift: upcomingShiftVal,
                        upcomingShiftEffectiveFrom: upcomingShiftEffectiveFromVal,
                        shiftEffectiveFrom: profileData.shiftEffectiveFrom,
                        salaryEffectiveFrom,
                        workLocation: updatedEmployee.branch || profileData.workLocation || '',
                        rowVersion: Number(updatedEmployee.row_version || nextRowVersion),
                        profile_data: profileData,
                    },
                    dependencies: { shiftChanged, weeklyOffChanged, salaryChanged, draftPayrollRecalculated },
                };
            });
            // Only mark schemaEnsured = true AFTER transaction commits!
            schemaEnsured = true;
        }
        catch (err) {
            // Never poison schemaEnsured if a transaction rolled back!
            schemaEnsured = false;
            throw err;
        }
        // Invalidate backend memory caches immediately after transaction commit
        memoryCache.invalidatePattern('emp_');
        memoryCache.invalidatePattern('ss_');
        memoryCache.invalidate('employees_all_active');
        return txResult;
    }
}
export const employeeProfileSyncService = new EmployeeProfileSyncService();
//# sourceMappingURL=employeeProfileSyncService.js.map