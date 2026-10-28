import { query } from '../config/database.js';
import { DataAccessLevel } from '../types/rbac.js';

export interface ChatbotAccessScope {
  companyId: string;
  level: DataAccessLevel;
  employeeId?: string;
  department?: string;
}

export interface EmployeeSearchOptions {
  search?: string;
  department?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

const EXCLUDED_EMPLOYEE_SQL = `
  UPPER(COALESCE(e.employee_id, '')) <> 'EMP-000'
  AND LOWER(COALESCE(e.email, '')) NOT IN ('admin@businz.com', 'developer@businz.com')
  AND LOWER(COALESCE(e.designation, '')) <> 'super administrator'`;

const employeeScope = (scope: ChatbotAccessScope, params: unknown[], alias = 'e'): string[] => {
  params.push(scope.companyId);
  const conditions = [`${alias}.company_id = $${params.length}`];
  if (scope.level === 'own') {
    params.push(scope.employeeId || '__none__');
    conditions.push(`LOWER(${alias}.employee_id) = LOWER($${params.length})`);
  } else if (scope.level === 'department' || scope.level === 'team') {
    params.push(scope.department || '__none__');
    conditions.push(`LOWER(COALESCE(d.name, '')) = LOWER($${params.length})`);
  }
  return conditions;
};

const normalizedEmployeesCte = `
  WITH scoped_employees AS (
    SELECT e.*, d.name AS department_name,
      ROW_NUMBER() OVER (
        PARTITION BY LOWER(e.employee_id)
        ORDER BY e.updated_at DESC NULLS LAST, e.created_at DESC NULLS LAST, e.id DESC
      ) AS duplicate_rank
    FROM public.employees e
    LEFT JOIN public.departments d ON d.id = e.department_id
    WHERE %SCOPE% AND ${EXCLUDED_EMPLOYEE_SQL}
  )`;

export class HrmsDataService {
  private employeeCte(scope: ChatbotAccessScope, params: unknown[]): string {
    return normalizedEmployeesCte.replace('%SCOPE%', employeeScope(scope, params).join(' AND '));
  }

  async getEmployeeCounts(scope: ChatbotAccessScope) {
    const params: unknown[] = [];
    const cte = this.employeeCte(scope, params);
    const result = await query(`${cte}
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(status::text, 'active')) = 'active')::int AS active,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(status::text, 'active')) <> 'active')::int AS inactive
      FROM scoped_employees WHERE duplicate_rank = 1`, params);
    const departments = await query(`${cte}
      SELECT COALESCE(department_name, 'General') AS department, COUNT(*)::int AS count
      FROM scoped_employees WHERE duplicate_rank = 1
      GROUP BY COALESCE(department_name, 'General') ORDER BY count DESC, department`, params);
    const duplicateResult = await query(`${cte}
      SELECT COUNT(*)::int AS excluded_duplicates FROM scoped_employees WHERE duplicate_rank > 1`, params);
    return {
      totalRegistered: Number(result.rows[0]?.total || 0),
      activeCount: Number(result.rows[0]?.active || 0),
      inactiveCount: Number(result.rows[0]?.inactive || 0),
      excludedDuplicateCount: Number(duplicateResult.rows[0]?.excluded_duplicates || 0),
      departmentBreakdown: departments.rows.map(row => ({ department: row.department, count: Number(row.count) })),
    };
  }

  async searchEmployees(scope: ChatbotAccessScope, options: EmployeeSearchOptions = {}) {
    const limit = Math.min(Math.max(Number(options.limit) || 10, 1), 100);
    const offset = Math.max(Number(options.offset) || 0, 0);
    const params: unknown[] = [];
    const cte = this.employeeCte(scope, params);
    const filters = ['duplicate_rank = 1'];
    if (options.search?.trim()) {
      params.push(`%${options.search.trim().toLowerCase()}%`);
      filters.push(`(LOWER(CONCAT(first_name, ' ', last_name)) LIKE $${params.length}
        OR LOWER(employee_id) LIKE $${params.length}
        OR LOWER(COALESCE(department_name, '')) LIKE $${params.length})`);
    }
    if (options.department?.trim()) {
      params.push(options.department.trim());
      filters.push(`LOWER(COALESCE(department_name, '')) = LOWER($${params.length})`);
    }
    if (options.status?.trim()) {
      params.push(options.status.trim());
      filters.push(`LOWER(COALESCE(status::text, 'active')) = LOWER($${params.length})`);
    }
    const where = filters.join(' AND ');
    const totalResult = await query(`${cte} SELECT COUNT(*)::int AS total FROM scoped_employees WHERE ${where}`, params);
    const dataParams = [...params, limit, offset];
    const result = await query(`${cte}
      SELECT employee_id, CONCAT_WS(' ', first_name, last_name) AS employee_name,
        COALESCE(department_name, 'General') AS department,
        COALESCE(designation, 'Staff') AS designation, COALESCE(status, 'Active') AS status
      FROM scoped_employees WHERE ${where}
      ORDER BY CASE WHEN LOWER(COALESCE(status::text, 'active')) = 'active' THEN 0 ELSE 1 END,
        employee_name, employee_id
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`, dataParams);
    const total = Number(totalResult.rows[0]?.total || 0);
    return { total, limit, offset, hasMore: offset + result.rows.length < total, employees: result.rows };
  }

  async getEmployeeById(scope: ChatbotAccessScope, employeeId: string) {
    const result = await this.searchEmployees(scope, { search: employeeId, limit: 20 });
    return result.employees.find(row => String(row.employee_id).toLowerCase() === employeeId.toLowerCase()) || null;
  }

  async getAttendanceSummary(scope: ChatbotAccessScope, date: string) {
    const counts = await this.getEmployeeCounts(scope);
    const params: unknown[] = [date];
    const scopeConditions = employeeScope(scope, params);
    const result = await query(`
      SELECT COUNT(DISTINCT a.employee_id)::int AS recorded,
        COUNT(DISTINCT a.employee_id) FILTER (WHERE LOWER(COALESCE(a.status::text, '')) = 'present')::int AS present,
        COUNT(DISTINCT a.employee_id) FILTER (WHERE LOWER(COALESCE(a.status::text, '')) = 'late'
          OR LOWER(COALESCE(a.late_status, '')) LIKE '%late%')::int AS late,
        COUNT(DISTINCT a.employee_id) FILTER (WHERE LOWER(COALESCE(a.status::text, '')) IN ('on leave', 'leave'))::int AS on_leave,
        COUNT(DISTINCT a.employee_id) FILTER (WHERE LOWER(COALESCE(a.status::text, '')) = 'absent')::int AS absent
      FROM public.attendance_records a
      JOIN public.employees e ON e.id = a.employee_id
      LEFT JOIN public.departments d ON d.id = e.department_id
      WHERE (a.date = $1 OR a.shift_date = $1) AND LOWER(e.status::text) = 'active'
        AND ${scopeConditions.join(' AND ')} AND ${EXCLUDED_EMPLOYEE_SQL}`, params);
    const row = result.rows[0] || {};
    const recorded = Number(row.recorded || 0);
    const present = Number(row.present || 0);
    const late = Number(row.late || 0);
    return {
      date, totalHeadcount: counts.activeCount, recordedCount: recorded,
      presentCount: present, lateCount: late, onLeaveCount: Number(row.on_leave || 0),
      absentCount: Number(row.absent || 0),
      unrecordedCount: Math.max(0, counts.activeCount - recorded),
      attendanceRate: counts.activeCount ? Math.round(((present + late) / counts.activeCount) * 100) : 0,
    };
  }

  async getAttendanceEmployees(scope: ChatbotAccessScope, date: string, kind: 'absent' | 'late') {
    const params: unknown[] = [date];
    const conditions = employeeScope(scope, params);
    const statusCondition = kind === 'late'
      ? `(LOWER(a.status::text) = 'late' OR LOWER(COALESCE(a.late_status, '')) LIKE '%late%')`
      : `LOWER(a.status::text) = 'absent'`;
    const result = await query(`SELECT e.employee_id, CONCAT_WS(' ', e.first_name, e.last_name) AS employee_name,
      COALESCE(d.name, 'General') AS department, e.designation, a.status::text AS status,
      COALESCE(a.late_status, '') AS late_status
      FROM public.attendance_records a JOIN public.employees e ON e.id = a.employee_id
      LEFT JOIN public.departments d ON d.id = e.department_id
      WHERE (a.date = $1 OR a.shift_date = $1) AND ${statusCondition}
        AND ${conditions.join(' AND ')} AND ${EXCLUDED_EMPLOYEE_SQL}
      ORDER BY employee_name`, params);
    return result.rows;
  }

  async getCurrentShift(scope: ChatbotAccessScope, employeeId: string, effectiveDate: string) {
    const authorizedEmployee = await this.getEmployeeById(scope, employeeId);
    if (!authorizedEmployee) return null;
    const result = await query(`SELECT e.employee_id, s.shift_name, s.start_time, s.end_time,
      s.grace_period_mins, sa.effective_from, sa.effective_to
      FROM public.employees e
      JOIN public.shift_assignments sa ON sa.employee_id = e.id AND sa.company_id = e.company_id
      JOIN public.shifts s ON s.id = sa.shift_id AND s.company_id = e.company_id
      WHERE e.company_id = $1 AND LOWER(e.employee_id) = LOWER($2)
        AND sa.effective_from <= $3::date AND (sa.effective_to IS NULL OR sa.effective_to >= $3::date)
      ORDER BY sa.effective_from DESC LIMIT 1`, [scope.companyId, employeeId, effectiveDate]);
    return result.rows[0] || null;
  }

  async getPayrollSummary(scope: ChatbotAccessScope, month?: number, year?: number) {
    const params: unknown[] = [];
    const conditions = employeeScope(scope, params);
    if (month) { params.push(month); conditions.push(`pr.payroll_month = $${params.length}`); }
    if (year) { params.push(year); conditions.push(`pr.payroll_year = $${params.length}`); }
    const result = await query(`SELECT pr.payroll_month, pr.payroll_year, pr.status,
      COUNT(*)::int AS employee_count, SUM(pr.gross_salary)::numeric AS gross_total,
      SUM(pr.total_deductions)::numeric AS deduction_total, SUM(pr.net_salary)::numeric AS net_total
      FROM public.payroll_records pr JOIN public.employees e ON e.id = pr.employee_id
      LEFT JOIN public.departments d ON d.id = e.department_id
      WHERE ${conditions.join(' AND ')} AND ${EXCLUDED_EMPLOYEE_SQL}
      GROUP BY pr.payroll_month, pr.payroll_year, pr.status
      ORDER BY pr.payroll_year DESC, pr.payroll_month DESC, pr.status LIMIT 24`, params);
    return result.rows;
  }

  async getPendingLeaveRequests(scope: ChatbotAccessScope, limit = 10) {
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
    const params: unknown[] = [];
    const conditions = employeeScope(scope, params);
    params.push(safeLimit);
    const result = await query(`
      SELECT l.id, e.employee_id, CONCAT_WS(' ', e.first_name, e.last_name) AS employee_name,
        COALESCE(d.name, 'General') AS department, l.leave_type::text AS leave_type,
        TO_CHAR(l.start_date, 'YYYY-MM-DD') AS start_date, TO_CHAR(l.end_date, 'YYYY-MM-DD') AS end_date,
        COALESCE(l.days_count, 1) AS days_count, l.status::text AS status
      FROM public.leave_requests l JOIN public.employees e ON e.id = l.employee_id
      LEFT JOIN public.departments d ON d.id = e.department_id
      WHERE LOWER(l.status::text) = 'pending' AND ${conditions.join(' AND ')} AND ${EXCLUDED_EMPLOYEE_SQL}
      ORDER BY l.created_at DESC LIMIT $${params.length}`, params);
    return result.rows;
  }

  async getLeaveBalance(scope: ChatbotAccessScope, employeeId: string, year: number) {
    const employee = await this.getEmployeeById(scope, employeeId);
    if (!employee) return null;
    const result = await query(`
      SELECT l.leave_type::text AS leave_type, l.status::text AS status,
        SUM(COALESCE(l.days_count, 1))::numeric AS days
      FROM public.leave_requests l JOIN public.employees e ON e.id = l.employee_id
      WHERE LOWER(e.employee_id) = LOWER($1) AND e.company_id = $2
        AND l.start_date >= $3::date AND l.start_date < $4::date
      GROUP BY l.leave_type::text, l.status::text`, [employeeId, scope.companyId, `${year}-01-01`, `${year + 1}-01-01`]);
    return { employee, year, balances: result.rows, quotaVerified: false,
      note: 'Usage is verified from leave requests. No approved quota source was found, so remaining balance was not guessed.' };
  }

  async getApprovedHrPolicy(scope: ChatbotAccessScope, policyType: string) {
    const baseKeys = policyType === 'attendance'
      ? ['master_attendance_policies_data', 'attendance_policies']
      : ['master_leave_policies_data', 'leave_policies'];
    const keys = baseKeys.map(key => `${key}:${scope.companyId}`);
    const result = await query(`SELECT setting_key, setting_val FROM public.company_settings
      WHERE setting_key = ANY($1::text[]) ORDER BY updated_at DESC`, [keys]);
    return { policyType, policies: result.rows, verified: result.rows.length > 0, companyId: scope.companyId };
  }
}

export const hrmsDataService = new HrmsDataService();
