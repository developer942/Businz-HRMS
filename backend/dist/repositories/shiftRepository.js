import { getSupabaseAdmin, isRealSupabaseConfigured } from '../config/supabase.js';
import { query } from '../config/database.js';
import { REQUEST_REASON_ERROR_MESSAGE, validateRequestReason } from '../utils/requestValidation.js';
export const buildShiftAssignmentSummary = (shifts, assignmentRows, companyId, businessDate, scope) => {
    const currentByEmployee = new Map();
    for (const row of assignmentRows) {
        const employee = Array.isArray(row.employee) ? row.employee[0] : row.employee;
        if (!employee || (row.company_id && row.company_id !== companyId) || (employee.company_id && employee.company_id !== companyId))
            continue;
        if (String(employee.status || '').toLowerCase() !== 'active')
            continue;
        if (row.effective_from && row.effective_from > businessDate)
            continue;
        if (row.effective_to && row.effective_to < businessDate)
            continue;
        if (scope?.level === 'own' && scope.employeeId && employee.id !== scope.employeeId && employee.employee_id !== scope.employeeId)
            continue;
        if ((scope?.level === 'department' || scope?.level === 'team') && scope.department) {
            const departmentName = employee.department?.name || employee.department;
            if (String(departmentName || '').toLowerCase() !== scope.department.toLowerCase())
                continue;
        }
        const previous = currentByEmployee.get(employee.id);
        const rowOrder = `${row.effective_from || ''}|${row.created_at || ''}`;
        const previousOrder = previous ? `${previous.effective_from || ''}|${previous.created_at || ''}` : '';
        if (!previous || rowOrder > previousOrder)
            currentByEmployee.set(employee.id, { ...row, employee });
    }
    const byShift = new Map();
    for (const row of currentByEmployee.values()) {
        const employee = row.employee;
        const employees = byShift.get(row.shift_id) || new Map();
        employees.set(employee.id, {
            id: employee.id,
            employeeId: employee.employee_id,
            name: `${employee.first_name || ''} ${employee.last_name || ''}`.trim(),
            department: employee.department?.name || employee.department || undefined,
        });
        byShift.set(row.shift_id, employees);
    }
    return shifts.map((shift) => {
        const employees = Array.from(byShift.get(shift.id)?.values() || []).sort((a, b) => a.employeeId.localeCompare(b.employeeId));
        return { shiftId: shift.id, shiftName: shift.shift_name, count: employees.length, employees };
    });
};
const SHIFT_REQUESTS_KEY = 'shift_requests_vps_data';
export class ShiftRepository {
    async getAssignmentSummary(companyId, businessDate, scope) {
        if (!isRealSupabaseConfigured())
            throw new Error('Database is not configured');
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.rpc('get_shift_assignment_summary', {
            p_company_id: companyId,
            p_business_date: businessDate,
            p_scope_level: scope?.level || 'all',
            p_scope_employee_id: scope?.employeeId || null,
            p_scope_department: scope?.department || null,
        });
        if (error)
            throw new Error(`Shift assignment summary query failed: ${error.message}`);
        return (data || []).map((row) => {
            const employees = Array.isArray(row.employees) ? row.employees : [];
            return {
                shiftId: row.shift_id,
                shiftName: row.shift_name,
                count: employees.length,
                employees,
            };
        });
    }
    async getShiftRequests() {
        if (!isRealSupabaseConfigured())
            return [];
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
            .from('company_settings')
            .select('setting_val')
            .eq('setting_key', SHIFT_REQUESTS_KEY)
            .maybeSingle();
        if (error)
            throw new Error(`Could not load shift requests: ${error.message}`);
        return Array.isArray(data?.setting_val) ? data.setting_val : [];
    }
    async saveShiftRequests(requests) {
        if (!isRealSupabaseConfigured())
            throw new Error('Database is not configured');
        const supabase = getSupabaseAdmin();
        const { data: existing, error: lookupError } = await supabase
            .from('company_settings')
            .select('id')
            .eq('setting_key', SHIFT_REQUESTS_KEY)
            .maybeSingle();
        if (lookupError)
            throw new Error(`Could not locate shift request storage: ${lookupError.message}`);
        const operation = existing?.id
            ? supabase.from('company_settings').update({ setting_val: requests, updated_at: new Date().toISOString() }).eq('id', existing.id)
            : supabase.from('company_settings').insert({ setting_key: SHIFT_REQUESTS_KEY, setting_val: requests });
        const { error } = await operation;
        if (error)
            throw new Error(`Could not persist shift request: ${error.message}`);
    }
    async createShiftRequest(data) {
        const reasonValidation = validateRequestReason(data.reason);
        if (!reasonValidation.valid)
            throw new Error(reasonValidation.error || REQUEST_REASON_ERROR_MESSAGE);
        const now = new Date().toISOString();
        const request = {
            ...data,
            reason: reasonValidation.value,
            id: `SR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            status: 'Pending',
            createdAt: now,
            updatedAt: now,
        };
        const requests = await this.getShiftRequests();
        await this.saveShiftRequests([request, ...requests]);
        return request;
    }
    async updateShiftRequestReason(id, employeeId, reason) {
        const reasonValidation = validateRequestReason(reason);
        if (!reasonValidation.valid)
            throw new Error(reasonValidation.error || REQUEST_REASON_ERROR_MESSAGE);
        const requests = await this.getShiftRequests();
        const index = requests.findIndex((request) => request.id === id && request.employeeId === employeeId && request.status === 'Pending');
        if (index < 0)
            return null;
        requests[index] = { ...requests[index], reason: reasonValidation.value, updatedAt: new Date().toISOString() };
        await this.saveShiftRequests(requests);
        return requests[index];
    }
    shiftsCache = new Map();
    invalidateShiftCache() {
        this.shiftsCache.clear();
    }
    async getShifts(companyId = 'company-a', businessDate = new Date().toISOString().slice(0, 10)) {
        const cacheKey = `${companyId}:${businessDate}`;
        const cached = this.shiftsCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.shifts.map((s) => ({
                ...s,
                assignments: s.assignments ? [...s.assignments] : [],
            }));
        }
        const byId = new Map();
        const assignedEmployeesFromTable = new Set();
        const dbShiftIds = new Set();
        // 1. Load shifts and active shift_assignments from PostgreSQL tables directly
        try {
            const [dbShiftsRes, assignRes] = await Promise.all([
                query(`SELECT id, shift_name, start_time, end_time, break_duration_mins, working_hours, grace_period_mins, color
           FROM public.shifts
           WHERE company_id = $1 OR company_id IS NULL
           ORDER BY created_at ASC`, [companyId]),
                query(`SELECT sa.shift_id, sa.employee_id AS emp_uuid, e.employee_id AS emp_code, sa.effective_from, sa.effective_to
           FROM public.shift_assignments sa
           LEFT JOIN public.employees e ON e.id = sa.employee_id
           WHERE (sa.company_id = $1 OR sa.company_id IS NULL)
             AND sa.effective_from <= $2::date
             AND (sa.effective_to IS NULL OR sa.effective_to >= $2::date)
           ORDER BY sa.effective_from DESC, sa.updated_at DESC NULLS LAST`, [companyId, businessDate]),
            ]);
            for (const s of dbShiftsRes.rows) {
                const sId = String(s.id);
                dbShiftIds.add(sId);
                byId.set(sId, {
                    id: sId,
                    shiftName: String(s.shift_name || s.name || 'Shift'),
                    startTime: String(s.start_time || '09:00').slice(0, 5),
                    endTime: String(s.end_time || '18:00').slice(0, 5),
                    breakDurationMins: Number(s.break_duration_mins) || 45,
                    workingHours: Number(s.working_hours) || 8.0,
                    gracePeriodMins: Number(s.grace_period_mins) || 40,
                    color: String(s.color || '#0E7490'),
                    assignedEmployeeCount: 0,
                    assignments: [],
                });
            }
            // Keep only the latest effective assignment per employee
            const latestShiftByEmp = new Map();
            for (const row of assignRes.rows) {
                const empUuid = String(row.emp_uuid || '');
                if (!empUuid || latestShiftByEmp.has(empUuid))
                    continue;
                latestShiftByEmp.set(empUuid, {
                    shiftId: String(row.shift_id),
                    empCode: row.emp_code ? String(row.emp_code) : undefined,
                    empUuid,
                });
            }
            for (const { shiftId, empCode, empUuid } of latestShiftByEmp.values()) {
                const targetShift = byId.get(shiftId);
                if (targetShift) {
                    const list = new Set(targetShift.assignments || []);
                    if (empCode) {
                        list.add(empCode);
                        assignedEmployeesFromTable.add(empCode.toLowerCase());
                    }
                    if (empUuid) {
                        list.add(empUuid);
                        assignedEmployeesFromTable.add(empUuid.toLowerCase());
                    }
                    targetShift.assignments = Array.from(list);
                    targetShift.assignedEmployeeCount = list.size;
                }
            }
        }
        catch (pgErr) {
            // Fallback to Supabase REST if direct pg pool fails
            if (isRealSupabaseConfigured()) {
                try {
                    const supabase = getSupabaseAdmin();
                    const { data: dbShifts } = await supabase
                        .from('shifts')
                        .select('*')
                        .eq('company_id', companyId)
                        .order('created_at', { ascending: true });
                    for (const s of dbShifts || []) {
                        const sId = String(s.id);
                        dbShiftIds.add(sId);
                        byId.set(sId, {
                            id: sId,
                            shiftName: s.name || s.shift_name || 'Shift',
                            startTime: String(s.start_time || '09:00').slice(0, 5),
                            endTime: String(s.end_time || '18:00').slice(0, 5),
                            breakDurationMins: Number(s.break_duration_mins) || 45,
                            workingHours: Number(s.working_hours) || 8.0,
                            gracePeriodMins: Number(s.grace_period_mins) || 40,
                            color: s.color || '#0E7490',
                            assignedEmployeeCount: 0,
                            assignments: [],
                        });
                    }
                }
                catch (err) {
                    console.warn('Database error in getShifts fallback:', err);
                }
            }
        }
        // 2. Also merge shifts & assignments stored in company_settings ('shifts_vps_data', 'shifts_data')
        try {
            const settingsRes = await query(`SELECT setting_key, setting_val
         FROM public.company_settings
         WHERE setting_key IN ('shifts_vps_data', 'shifts_data')
         ORDER BY CASE WHEN setting_key = 'shifts_vps_data' THEN 0 ELSE 1 END`);
            for (const row of settingsRes.rows) {
                const settingKey = String(row?.setting_key || '');
                const val = row?.setting_val;
                if (!Array.isArray(val))
                    continue;
                for (const rawShift of val) {
                    if (!rawShift || typeof rawShift !== 'object')
                        continue;
                    const sId = String(rawShift.id || '');
                    const sName = String(rawShift.shiftName || rawShift.name || 'Shift');
                    if (!sId && !sName)
                        continue;
                    // Extract assigned employee IDs from rawShift.assignments
                    const extractedEmpIds = [];
                    if (Array.isArray(rawShift.assignments)) {
                        for (const a of rawShift.assignments) {
                            const rawId = typeof a === 'string' ? a.trim() : a && typeof a === 'object' && a.employeeId ? String(a.employeeId).trim() : '';
                            if (!rawId)
                                continue;
                            if (a && typeof a === 'object' && a.upcomingShift && a.upcomingShift.effectiveDate && a.upcomingShift.effectiveDate <= businessDate) {
                                continue; // Transferred to upcomingShift.shiftId
                            }
                            if (a && typeof a === 'object' && a.status && a.status !== 'ACTIVE') {
                                continue;
                            }
                            // Do not let legacy shifts_data / shifts_vps_data override an employee's authoritative public.shift_assignments row
                            if (!assignedEmployeesFromTable.has(rawId.toLowerCase())) {
                                extractedEmpIds.push(rawId);
                            }
                        }
                    }
                    // Match by ID or by shiftName
                    let existing = byId.get(sId);
                    if (!existing) {
                        existing = Array.from(byId.values()).find((item) => item.shiftName.trim().toLowerCase() === sName.trim().toLowerCase());
                    }
                    if (existing) {
                        // Only merge fallback assignments from shifts_vps_data (or if public.shifts had none)
                        if (settingKey === 'shifts_vps_data' || dbShiftIds.size === 0) {
                            const mergedAssign = new Set([...(existing.assignments || []), ...extractedEmpIds]);
                            existing.assignments = Array.from(mergedAssign);
                            existing.assignedEmployeeCount = existing.assignments.length;
                        }
                        // Never allow legacy shifts_data to overwrite authoritative public.shifts start_time / end_time!
                        if (!dbShiftIds.has(existing.id)) {
                            if (rawShift.startTime)
                                existing.startTime = String(rawShift.startTime).slice(0, 5);
                            if (rawShift.endTime)
                                existing.endTime = String(rawShift.endTime).slice(0, 5);
                            if (rawShift.gracePeriodMins !== undefined)
                                existing.gracePeriodMins = Number(rawShift.gracePeriodMins);
                        }
                    }
                    else if (sId && (settingKey === 'shifts_vps_data' || dbShiftIds.size === 0)) {
                        byId.set(sId, {
                            id: sId,
                            shiftName: sName,
                            startTime: String(rawShift.startTime || '09:00').slice(0, 5),
                            endTime: String(rawShift.endTime || '18:00').slice(0, 5),
                            breakDurationMins: Number(rawShift.breakDurationMins) || 45,
                            workingHours: Number(rawShift.workingHours) || 8.0,
                            gracePeriodMins: Number(rawShift.gracePeriodMins) || 40,
                            color: String(rawShift.color || '#0E7490'),
                            assignedEmployeeCount: extractedEmpIds.length,
                            assignments: extractedEmpIds,
                        });
                    }
                }
            }
        }
        catch {
            // Ignore if company_settings query fails
        }
        const result = Array.from(byId.values());
        this.shiftsCache.set(cacheKey, {
            expiresAt: Date.now() + 10_000,
            shifts: result,
        });
        return result;
    }
    async resolveEmployeeShift(employee, businessDate = new Date().toISOString().slice(0, 10), companyId = 'company-a') {
        const shifts = await this.getShifts(companyId, businessDate);
        const empCode = String(employee.employeeId || '').trim();
        const empUuid = String(employee.id || '').trim();
        const empWorkShift = String(employee.workShift || '').trim();
        // 1. Check explicit shift_assignments / assignments list on shifts
        const byAssignment = shifts.find((s) => Array.isArray(s.assignments) &&
            s.assignments.some((id) => id.toLowerCase() === empCode.toLowerCase() ||
                (empUuid && id.toLowerCase() === empUuid.toLowerCase())));
        if (byAssignment)
            return byAssignment;
        // 2. Check employee.workShift by exact ID or Shift Name
        if (empWorkShift) {
            const cleanWS = empWorkShift.toLowerCase();
            const byExactWorkShift = shifts.find((s) => s.id.toLowerCase() === cleanWS ||
                s.shiftName.trim().toLowerCase() === cleanWS);
            if (byExactWorkShift)
                return byExactWorkShift;
            const byPartialWorkShift = shifts.find((s) => s.shiftName.toLowerCase().includes(cleanWS) ||
                cleanWS.includes(s.shiftName.toLowerCase()));
            if (byPartialWorkShift)
                return byPartialWorkShift;
        }
        // 3. Fallback to first configured shift or default Day Shift (09:00 AM - 06:00 PM)
        return (shifts[0] || {
            id: 'SH-DEFAULT',
            shiftName: 'General Shift (09:00 AM - 06:00 PM)',
            startTime: '09:00',
            endTime: '18:00',
            breakDurationMins: 60,
            workingHours: 8,
            gracePeriodMins: 40,
            color: '#0E7490',
        });
    }
    async getShiftById(id, companyId = 'company-a') {
        if (!id)
            return null;
        const all = await this.getShifts(companyId);
        return all.find((s) => s.id === id) || null;
    }
    async createShift(data, companyId = 'company-a') {
        if (!isRealSupabaseConfigured())
            throw new Error('Database is not configured');
        const supabase = getSupabaseAdmin();
        const { data: row, error } = await supabase
            .from('shifts')
            .insert({
            company_id: companyId,
            shift_name: data.shiftName || 'Shift',
            start_time: data.startTime || '09:00',
            end_time: data.endTime || '18:00',
            break_duration_mins: data.breakDurationMins || 45,
            working_hours: data.workingHours || 8,
            grace_period_mins: data.gracePeriodMins || 40,
            color: data.color || '#0E7490',
        })
            .select('*')
            .single();
        if (error || !row)
            throw new Error(`Shift could not be saved: ${error?.message || 'No row returned'}`);
        this.invalidateShiftCache();
        return {
            id: row.id,
            shiftName: data.shiftName || 'Shift',
            startTime: data.startTime || '09:00',
            endTime: data.endTime || '18:00',
            breakDurationMins: data.breakDurationMins || 45,
            workingHours: data.workingHours || 8.0,
            gracePeriodMins: data.gracePeriodMins || 40,
            color: data.color || '#0E7490',
            assignedEmployeeCount: 0,
            assignments: [],
        };
    }
    async assignEmployees(shiftId, employeeIds, companyId = 'company-a', effectiveFrom = new Date().toISOString().slice(0, 10)) {
        const shifts = await this.getShifts(companyId);
        const shift = shifts.find((s) => s.id === shiftId);
        if (!shift)
            return null;
        shift.assignments = Array.from(new Set(employeeIds));
        shift.assignedEmployeeCount = shift.assignments.length;
        if (!isRealSupabaseConfigured())
            throw new Error('Database is not configured');
        const supabase = getSupabaseAdmin();
        const { data: employeeRows, error: employeeError } = await supabase
            .from('employees')
            .select('id, employee_id')
            .eq('company_id', companyId)
            .in('employee_id', employeeIds);
        if (employeeError)
            throw new Error(`Employee assignment lookup failed: ${employeeError.message}`);
        const employeeDbIds = (employeeRows || []).map((employee) => employee.id);
        const previousDate = new Date(`${effectiveFrom}T12:00:00`);
        previousDate.setDate(previousDate.getDate() - 1);
        const effectiveTo = previousDate.toISOString().slice(0, 10);
        for (const employeeId of employeeDbIds) {
            const { error: closeError } = await supabase
                .from('shift_assignments')
                .update({ effective_to: effectiveTo, updated_at: new Date().toISOString() })
                .eq('company_id', companyId)
                .eq('employee_id', employeeId)
                .lt('effective_from', effectiveFrom)
                .or(`effective_to.is.null,effective_to.gte.${effectiveFrom}`);
            if (closeError)
                throw new Error(`Existing shift assignment could not be closed: ${closeError.message}`);
            const { error: saveError } = await supabase
                .from('shift_assignments')
                .upsert({
                company_id: companyId,
                employee_id: employeeId,
                shift_id: shiftId,
                effective_from: effectiveFrom,
                effective_to: null,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'employee_id,effective_from' });
            if (saveError)
                throw new Error(`Shift assignment could not be saved: ${saveError.message}`);
        }
        this.invalidateShiftCache();
        return shift;
    }
}
export const shiftRepository = new ShiftRepository();
//# sourceMappingURL=shiftRepository.js.map