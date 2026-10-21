import { getSupabaseAdmin, isRealSupabaseConfigured } from '../config/supabase.js';
import { ShiftRecord } from '../types/hrms.js';
import { REQUEST_REASON_ERROR_MESSAGE, validateRequestReason } from '../utils/requestValidation.js';

export interface ShiftChangeRequestRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  currentShift: string;
  requestedShift: string;
  requestedDate: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  createdAt: string;
  updatedAt: string;
}

export interface ShiftAssignmentSummary {
  shiftId: string;
  shiftName: string;
  count: number;
  employees: Array<{ id: string; employeeId: string; name: string; department?: string }>;
}

interface ShiftSummaryRow {
  shift_id: string;
  company_id?: string;
  effective_from?: string;
  effective_to?: string | null;
  created_at?: string;
  employee: any;
}

export const buildShiftAssignmentSummary = (
  shifts: Array<{ id: string; shift_name: string }>,
  assignmentRows: ShiftSummaryRow[],
  companyId: string,
  businessDate: string,
  scope?: { level: string; employeeId?: string; department?: string },
): ShiftAssignmentSummary[] => {
  const currentByEmployee = new Map<string, ShiftSummaryRow & { employee: any }>();
  for (const row of assignmentRows) {
    const employee = Array.isArray(row.employee) ? row.employee[0] : row.employee;
    if (!employee || row.company_id && row.company_id !== companyId || employee.company_id && employee.company_id !== companyId) continue;
    if (String(employee.status || '').toLowerCase() !== 'active') continue;
    if (row.effective_from && row.effective_from > businessDate) continue;
    if (row.effective_to && row.effective_to < businessDate) continue;
    if (scope?.level === 'own' && scope.employeeId && employee.id !== scope.employeeId && employee.employee_id !== scope.employeeId) continue;
    if ((scope?.level === 'department' || scope?.level === 'team') && scope.department) {
      const departmentName = employee.department?.name || employee.department;
      if (String(departmentName || '').toLowerCase() !== scope.department.toLowerCase()) continue;
    }
    const previous = currentByEmployee.get(employee.id);
    const rowOrder = `${row.effective_from || ''}|${row.created_at || ''}`;
    const previousOrder = previous ? `${previous.effective_from || ''}|${previous.created_at || ''}` : '';
    if (!previous || rowOrder > previousOrder) currentByEmployee.set(employee.id, { ...row, employee });
  }

  const byShift = new Map<string, Map<string, ShiftAssignmentSummary['employees'][number]>>();
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

  return shifts.map(shift => {
    const employees = Array.from(byShift.get(shift.id)?.values() || []).sort((a, b) => a.employeeId.localeCompare(b.employeeId));
    return { shiftId: shift.id, shiftName: shift.shift_name, count: employees.length, employees };
  });
};

const SHIFT_REQUESTS_KEY = 'shift_requests_vps_data';

export class ShiftRepository {
  async getAssignmentSummary(
    companyId: string,
    businessDate: string,
    scope?: { level: string; employeeId?: string; department?: string },
  ): Promise<ShiftAssignmentSummary[]> {
    if (!isRealSupabaseConfigured()) throw new Error('Database is not configured');
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc('get_shift_assignment_summary', {
      p_company_id: companyId,
      p_business_date: businessDate,
      p_scope_level: scope?.level || 'all',
      p_scope_employee_id: scope?.employeeId || null,
      p_scope_department: scope?.department || null,
    });
    if (error) throw new Error(`Shift assignment summary query failed: ${error.message}`);
    return (data || []).map((row: any) => {
      const employees = Array.isArray(row.employees) ? row.employees : [];
      return {
        shiftId: row.shift_id,
        shiftName: row.shift_name,
        count: employees.length,
        employees,
      };
    });
  }

  private async getShiftRequests(): Promise<ShiftChangeRequestRecord[]> {
    if (!isRealSupabaseConfigured()) return [];
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('company_settings')
      .select('setting_val')
      .eq('setting_key', SHIFT_REQUESTS_KEY)
      .maybeSingle();
    if (error) throw new Error(`Could not load shift requests: ${error.message}`);
    return Array.isArray(data?.setting_val) ? data.setting_val as ShiftChangeRequestRecord[] : [];
  }

  private async saveShiftRequests(requests: ShiftChangeRequestRecord[]): Promise<void> {
    if (!isRealSupabaseConfigured()) throw new Error('Database is not configured');
    const supabase = getSupabaseAdmin();
    const { data: existing, error: lookupError } = await supabase
      .from('company_settings')
      .select('id')
      .eq('setting_key', SHIFT_REQUESTS_KEY)
      .maybeSingle();
    if (lookupError) throw new Error(`Could not locate shift request storage: ${lookupError.message}`);

    const operation = existing?.id
      ? supabase.from('company_settings').update({ setting_val: requests, updated_at: new Date().toISOString() }).eq('id', existing.id)
      : supabase.from('company_settings').insert({ setting_key: SHIFT_REQUESTS_KEY, setting_val: requests });
    const { error } = await operation;
    if (error) throw new Error(`Could not persist shift request: ${error.message}`);
  }

  async createShiftRequest(data: Omit<ShiftChangeRequestRecord, 'id' | 'status' | 'createdAt' | 'updatedAt'>): Promise<ShiftChangeRequestRecord> {
    const reasonValidation = validateRequestReason(data.reason);
    if (!reasonValidation.valid) throw new Error(reasonValidation.error || REQUEST_REASON_ERROR_MESSAGE);

    const now = new Date().toISOString();
    const request: ShiftChangeRequestRecord = {
      ...data,
      reason: reasonValidation.value!,
      id: `SR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: 'Pending',
      createdAt: now,
      updatedAt: now,
    };
    const requests = await this.getShiftRequests();
    await this.saveShiftRequests([request, ...requests]);
    return request;
  }

  async updateShiftRequestReason(id: string, employeeId: string, reason: string): Promise<ShiftChangeRequestRecord | null> {
    const reasonValidation = validateRequestReason(reason);
    if (!reasonValidation.valid) throw new Error(reasonValidation.error || REQUEST_REASON_ERROR_MESSAGE);

    const requests = await this.getShiftRequests();
    const index = requests.findIndex(request => request.id === id && request.employeeId === employeeId && request.status === 'Pending');
    if (index < 0) return null;
    requests[index] = { ...requests[index], reason: reasonValidation.value!, updatedAt: new Date().toISOString() };
    await this.saveShiftRequests(requests);
    return requests[index];
  }

  async getShifts(companyId = 'company-a'): Promise<ShiftRecord[]> {
    if (!isRealSupabaseConfigured()) {
      return [];
    }

    try {
      const supabase = getSupabaseAdmin();

      const { data: dbShifts, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true });
      if (error) throw new Error(`Could not load shifts: ${error.message}`);

      if (dbShifts && dbShifts.length > 0) {
        return dbShifts.map((s: any) => ({
          id: s.id,
          shiftName: s.name || s.shift_name || 'Shift',
          startTime: s.start_time || '09:00',
          endTime: s.end_time || '18:00',
          breakDurationMins: Number(s.break_duration_mins) || 45,
          workingHours: Number(s.working_hours) || 8.0,
          gracePeriodMins: Number(s.grace_period_mins) || 15,
          color: s.color || '#0E7490',
          assignedEmployeeCount: 0,
          assignments: [],
        }));
      }
    } catch (err) {
      console.warn('Database error in getShifts:', err);
    }

    return [];
  }

  async getShiftById(id: string, companyId = 'company-a'): Promise<ShiftRecord | null> {
    if (!id) return null;
    const all = await this.getShifts(companyId);
    return all.find((s) => s.id === id) || null;
  }

  async createShift(data: Partial<ShiftRecord>, companyId = 'company-a'): Promise<ShiftRecord> {
    if (!isRealSupabaseConfigured()) throw new Error('Database is not configured');
    const supabase = getSupabaseAdmin();
    const { data: row, error } = await supabase.from('shifts').insert({
      company_id: companyId,
      shift_name: data.shiftName || 'Shift',
      start_time: data.startTime || '09:00',
      end_time: data.endTime || '18:00',
      break_duration_mins: data.breakDurationMins || 45,
      working_hours: data.workingHours || 8,
      grace_period_mins: data.gracePeriodMins || 15,
      color: data.color || '#0E7490',
    }).select('*').single();
    if (error || !row) throw new Error(`Shift could not be saved: ${error?.message || 'No row returned'}`);
    return {
      id: row.id,
      shiftName: data.shiftName || 'Shift',
      startTime: data.startTime || '09:00',
      endTime: data.endTime || '18:00',
      breakDurationMins: data.breakDurationMins || 45,
      workingHours: data.workingHours || 8.0,
      gracePeriodMins: data.gracePeriodMins || 15,
      color: data.color || '#0E7490',
      assignedEmployeeCount: 0,
      assignments: [],
    };
  }

  async assignEmployees(shiftId: string, employeeIds: string[], companyId = 'company-a', effectiveFrom = new Date().toISOString().slice(0, 10)): Promise<ShiftRecord | null> {
    const shifts = await this.getShifts(companyId);
    const shift = shifts.find((s) => s.id === shiftId);
    if (!shift) return null;

    shift.assignments = Array.from(new Set(employeeIds));
    shift.assignedEmployeeCount = shift.assignments.length;

    if (!isRealSupabaseConfigured()) throw new Error('Database is not configured');
    const supabase = getSupabaseAdmin();
    const { data: employeeRows, error: employeeError } = await supabase
      .from('employees')
      .select('id, employee_id')
      .eq('company_id', companyId)
      .in('employee_id', employeeIds);
    if (employeeError) throw new Error(`Employee assignment lookup failed: ${employeeError.message}`);
    const employeeDbIds = (employeeRows || []).map(employee => employee.id);

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
      if (closeError) throw new Error(`Existing shift assignment could not be closed: ${closeError.message}`);

      const { error: saveError } = await supabase.from('shift_assignments').upsert({
        company_id: companyId,
        employee_id: employeeId,
        shift_id: shiftId,
        effective_from: effectiveFrom,
        effective_to: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'employee_id,effective_from' });
      if (saveError) throw new Error(`Shift assignment could not be saved: ${saveError.message}`);
    }

    return shift;
  }
}

export const shiftRepository = new ShiftRepository();
