import { getSupabaseAdmin, isRealSupabaseConfigured } from '../config/supabase.js';
import {
  PayrollRunModel,
  PayrollRunStatus,
  FullPayrollCalculationResult,
  PayslipResponseData,
} from '../types/payroll.js';
import { getCalendarDaysInMonth, countWeeklyOffDaysInMonth } from '../services/calculationEngine.js';
import { employeeRepository } from './employeeRepository.js';
import { settingsRepository } from './settingsRepository.js';
import { randomUUID } from 'crypto';
import { query, withTransaction, hasDatabaseColumn } from '../config/database.js';

// In-memory data store for payroll runs & processed records during active session
const inMemoryRuns: PayrollRunModel[] = [];
const inMemoryRecords: Map<string, FullPayrollCalculationResult[]> = new Map();

const mapPayrollRecord = (row: any): FullPayrollCalculationResult => {
  let payrollMonth = Number(row.payroll_month);
  let payrollYear = Number(row.payroll_year);
  if (!Number.isFinite(payrollMonth) || payrollMonth < 1 || payrollMonth > 12) {
    const rawDate = row.payroll_month instanceof Date
      ? row.payroll_month
      : new Date(String(row.payroll_month || ''));
    if (!Number.isNaN(rawDate.getTime())) {
      payrollMonth = rawDate.getUTCMonth() + 1;
      payrollYear = Number.isFinite(payrollYear) && payrollYear > 2000 ? payrollYear : rawDate.getUTCFullYear();
    } else {
      payrollMonth = new Date().getMonth() + 1;
      payrollYear = new Date().getFullYear();
    }
  }
  if (!Number.isFinite(payrollYear) || payrollYear < 2000) {
    payrollYear = new Date().getFullYear();
  }

  const calendarDays = Number(row.calendar_days_in_month) > 0
    ? Number(row.calendar_days_in_month)
    : getCalendarDaysInMonth(payrollMonth, payrollYear);
  const lopDays = Number(row.lop_days ?? row.unpaid_leaves) || 0;
  const defaultWeekOffs = countWeeklyOffDaysInMonth(payrollMonth, payrollYear, 0);
  const scheduledWorkingDays = Number(row.working_days) > 0 && Number(row.working_days) <= calendarDays
    ? Number(row.working_days)
    : Math.max(0, calendarDays - defaultWeekOffs);
  const paidLeaveDays = Number(row.paid_leave_days ?? row.paid_leaves) || 0;
  const paidHolidayDays = Number(row.paid_holiday_days) || 0;
  const paidWeekOffDays = Number(row.paid_week_off_days ?? defaultWeekOffs);
  const paidDays = Math.max(0, calendarDays - lopDays);
  const presentDays = row.present_days !== undefined && row.present_days !== null
    ? Number(row.present_days)
    : Math.max(0, scheduledWorkingDays - paidLeaveDays - lopDays);

  const basicSalary = Number(row.basic_salary) || 0;
  const da = Number(row.da) || 0;
  const conveyance = Number(row.conveyance) || 0;
  const hra = Number(row.hra ?? row.allowances) || 0;
  const bonus = Number(row.bonus) || 0;
  const overtimeAmount = Number(row.overtime_amount ?? row.ot_variable_amount) || 0;
  const fixedGross = basicSalary + da + conveyance + hra;
  const grossSalary = row.gross_salary !== undefined && row.gross_salary !== null
    ? Number(row.gross_salary)
    : fixedGross + bonus + overtimeAmount + (Number(row.attendance_bonus) || 0) + (Number(row.incentive) || 0) + (Number(row.commission) || 0) + (Number(row.other_earnings) || 0);
  const pfAmount = Number(row.pf_amount ?? row.employer_pf_contribution) || 0;
  const esicAmount = Number(row.esic_amount ?? row.employer_esic_contribution) || 0;
  const lopAmount = Number(row.lop_amount ?? row.leave_deduction) || 0;
  const professionalTax = Number(row.professional_tax ?? row.tax_deduction) || 0;
  const totalDeductions = row.total_deductions !== undefined && row.total_deductions !== null
    ? Number(row.total_deductions)
    : pfAmount + esicAmount + professionalTax + lopAmount + (Number(row.advance_recovery) || 0) + (Number(row.loan_recovery) || 0) + (Number(row.other_deductions) || 0);
  const netSalary = Number(row.net_salary) || 0;

  return {
    employeeId: row.employee_code || row.employee_id,
    ...(row.employee_name ? { employeeName: row.employee_name } : {}),
    ...(row.designation ? { designation: row.designation } : {}),
    ...(row.department_name ? { department: row.department_name } : {}),
    status: row.status,
    payrollMonth,
    payrollYear,
    monthlySalary: Number(row.monthly_salary ?? grossSalary),
    basicSalary,
    da,
    conveyance,
    hra,
    fixedGross,
    attendanceBonus: Number(row.attendance_bonus) || 0,
    overtimeHours: Number(row.overtime_hours) || 0,
    overtimeRate: Number(row.overtime_rate) || 0,
    overtimeAmount,
    bonus,
    incentive: Number(row.incentive) || 0,
    commission: Number(row.commission) || 0,
    otherEarnings: Number(row.other_earnings) || 0,
    grossSalary,
    pfBase: Number(row.pf_base) || 0,
    pfRate: Number(row.pf_rate ?? row.employer_pf_rate) || 0,
    pfAmount,
    esicBase: Number(row.esic_base) || 0,
    esicRate: Number(row.esic_rate ?? row.employer_esic_rate) || 0,
    esicAmount,
    professionalTax,
    calendarDays,
    calendarDaysInMonth: calendarDays,
    eligibleDays: calendarDays,
    workingDays: scheduledWorkingDays,
    scheduledWorkingDays,
    presentDays,
    paidWeekOffDays,
    paidHolidayDays,
    paidLeaveDays,
    lopDays,
    paidDays,
    totalPaidDays: paidDays,
    dailySalary: calendarDays > 0 ? Number((Number(row.monthly_salary ?? grossSalary) / calendarDays).toFixed(2)) : 0,
    lopAmount,
    advanceRecovery: Number(row.advance_recovery) || 0,
    loanRecovery: Number(row.loan_recovery) || 0,
    otherDeductions: Number(row.other_deductions) || 0,
    totalDeductions,
    netSalary,
    earningsBreakdown: [],
    deductionsBreakdown: [],
  } as FullPayrollCalculationResult;
};

const MONTH_NAME_MAP: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

export function parsePayrollMonthYear(raw: any): { payrollMonth: number; payrollYear: number } {
  let payrollMonth = Number(raw?.payrollMonth ?? raw?.payroll_month);
  let payrollYear = Number(raw?.payrollYear ?? raw?.payroll_year ?? raw?.year);

  if ((!Number.isFinite(payrollMonth) || payrollMonth < 1 || payrollMonth > 12) && typeof raw?.month === 'string') {
    const tokens = raw.month.trim().toLowerCase().split(/\s+/);
    const m = MONTH_NAME_MAP[tokens[0]];
    if (m) payrollMonth = m;
    const y = Number(tokens[1]);
    if (Number.isFinite(y) && y > 2000 && (!Number.isFinite(payrollYear) || payrollYear < 2000)) {
      payrollYear = y;
    }
  }
  if (!Number.isFinite(payrollMonth) || payrollMonth < 1 || payrollMonth > 12) {
    const rawDate = new Date(String(raw?.payroll_month || raw?.month || ''));
    if (!Number.isNaN(rawDate.getTime())) {
      payrollMonth = rawDate.getUTCMonth() + 1;
      if (!Number.isFinite(payrollYear) || payrollYear < 2000) payrollYear = rawDate.getUTCFullYear();
    } else {
      payrollMonth = new Date().getMonth() + 1;
    }
  }
  if (!Number.isFinite(payrollYear) || payrollYear < 2000) {
    payrollYear = new Date().getFullYear();
  }
  return { payrollMonth, payrollYear };
}

export function mapSettingsPayrollRecord(raw: any): FullPayrollCalculationResult {
  const { payrollMonth, payrollYear } = parsePayrollMonthYear(raw);
  const calendarDays = Number(raw.calendarDays ?? raw.calendarDaysInMonth) > 0
    ? Number(raw.calendarDays ?? raw.calendarDaysInMonth)
    : getCalendarDaysInMonth(payrollMonth, payrollYear);
  const lopDays = Number(raw.lopDays ?? raw.unpaidLeaves ?? 0) || 0;
  const paidWeekOffDays = Number(raw.paidWeekOffDays ?? countWeeklyOffDaysInMonth(payrollMonth, payrollYear, 0)) || 0;
  const paidHolidayDays = Number(raw.paidHolidayDays ?? 0) || 0;
  const paidLeaveDays = Number(raw.paidLeaveDays ?? raw.paidLeaves ?? 0) || 0;
  const workingDays = Number(raw.workingDays ?? raw.scheduledWorkingDays ?? Math.max(0, calendarDays - paidWeekOffDays)) || 0;
  const presentDays = Number(raw.presentDays ?? 0) || 0;
  const totalPaidDays = Number(raw.totalPaidDays ?? raw.paidDays ?? Math.max(0, calendarDays - lopDays)) || 0;

  const basicSalary = Number(raw.basicSalary ?? raw.basic_salary ?? 0) || 0;
  const hra = Number(raw.hra ?? 0) || 0;
  const da = Number(raw.da ?? 0) || 0;
  const conveyance = Number(raw.conveyance ?? 0) || 0;
  const bonus = Number(raw.bonus ?? 0) || 0;
  const overtimeAmount = Number(raw.overtimeAmount ?? raw.otVariableAmount ?? 0) || 0;
  const attendanceBonus = Number(raw.attendanceBonus ?? 0) || 0;
  const incentive = Number(raw.incentive ?? 0) || 0;
  const commission = Number(raw.commission ?? 0) || 0;
  const otherEarnings = Number(raw.otherEarnings ?? 0) || 0;
  const fixedGross = basicSalary + hra + da + conveyance;
  const grossSalary = Number(raw.grossSalary ?? (fixedGross + bonus + overtimeAmount + attendanceBonus + incentive + commission + otherEarnings)) || 0;
  const monthlySalary = Number(raw.monthlySalary ?? raw.monthlyCtc ?? raw.ctc ?? grossSalary) || 0;

  const pfAmount = Number(raw.pfAmount ?? raw.epfDeduction ?? 0) || 0;
  const esicAmount = Number(raw.esicAmount ?? raw.esiDeduction ?? 0) || 0;
  const professionalTax = Number(raw.professionalTax ?? raw.taxDeduction ?? 0) || 0;
  const lopAmount = Number(raw.lopAmount ?? raw.leaveDeduction ?? 0) || 0;
  const lateAttendanceDeduction = Number(raw.lateAttendanceDeduction ?? 0) || 0;
  const advanceRecovery = Number(raw.advanceRecovery ?? raw.advanceDeduction ?? 0) || 0;
  const loanRecovery = Number(raw.loanRecovery ?? raw.loanDeduction ?? 0) || 0;
  const otherDeductions = Number(raw.otherDeductions ?? 0) || 0;
  const netSalary = Number(raw.netSalary ?? raw.net_salary ?? 0) || 0;
  const totalDeductions = raw.totalDeductions !== undefined && raw.totalDeductions !== null
    ? Number(raw.totalDeductions)
    : Math.max(0, Number((grossSalary - netSalary).toFixed(2)));

  return {
    employeeId: String(raw.employeeId || raw.employee_id || '').trim(),
    ...(raw.employeeName ? { employeeName: raw.employeeName } : {}),
    ...(raw.designation ? { designation: raw.designation } : {}),
    ...(raw.department ? { department: raw.department } : {}),
    ...(raw.id ? { id: raw.id } : {}),
    status: raw.status || 'Processed',
    payrollMonth,
    payrollYear,
    monthlySalary,
    basicSalary,
    da,
    conveyance,
    hra,
    fixedGross,
    attendanceBonus,
    overtimeHours: Number(raw.overtimeHours ?? raw.otHours ?? 0) || 0,
    overtimeRate: Number(raw.overtimeRate ?? 0) || 0,
    overtimeAmount,
    bonus,
    incentive,
    commission,
    otherEarnings,
    grossSalary,
    pfBase: Number(raw.pfBase ?? 0) || 0,
    pfRate: Number(raw.pfRate ?? 0) || 0,
    pfAmount,
    esicBase: Number(raw.esicBase ?? 0) || 0,
    esicRate: Number(raw.esicRate ?? 0) || 0,
    esicAmount,
    professionalTax,
    calendarDays,
    calendarDaysInMonth: calendarDays,
    eligibleDays: Number(raw.eligibleDays ?? calendarDays) || calendarDays,
    workingDays,
    scheduledWorkingDays: workingDays,
    presentDays,
    paidWeekOffDays,
    paidHolidayDays,
    paidLeaveDays,
    lopDays,
    paidDays: totalPaidDays,
    totalPaidDays,
    dailySalary: calendarDays > 0 ? Number((monthlySalary / calendarDays).toFixed(2)) : 0,
    lopAmount,
    lateAttendanceDeduction,
    advanceRecovery,
    loanRecovery,
    otherDeductions: otherDeductions + (lateAttendanceDeduction > 0 ? 0 : 0),
    totalDeductions,
    netSalary,
    earningsBreakdown: Array.isArray(raw.earningsBreakdown) ? raw.earningsBreakdown : [],
    deductionsBreakdown: Array.isArray(raw.deductionsBreakdown) ? raw.deductionsBreakdown : [],
  } as FullPayrollCalculationResult & { lateAttendanceDeduction?: number };
}

export class PayrollRepository {
  async getRunByMonth(month: number, year: number): Promise<PayrollRunModel | null> {
    const found = inMemoryRuns.find(r => r.payrollMonth === month && r.payrollYear === year);
    if (found) return found;

    if (isRealSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
          .from('payroll_runs')
          .select('*')
          .eq('payroll_month', month)
          .eq('payroll_year', year)
          .maybeSingle();

        if (data && !error) {
          return {
            id: data.id,
            payrollMonth: data.payroll_month,
            payrollYear: data.payroll_year,
            status: data.status,
            totalEmployees: data.total_employees,
            totalGross: Number(data.total_gross),
            totalDeductions: Number(data.total_deductions),
            totalNet: Number(data.total_net),
            processedBy: data.processed_by_name || data.processed_by,
            approvedBy: data.approved_by_name || data.approved_by,
            processedAt: data.processed_at,
            approvedAt: data.approved_at,
            paidAt: data.paid_at,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          };
        }
      } catch (err) {
        console.warn('Database error in getRunByMonth:', err);
      }
    }

    return null;
  }

  async getRunById(id: string): Promise<PayrollRunModel | null> {
    const memory = inMemoryRuns.find(r => r.id === id);
    if (memory) return memory;
    if (isRealSupabaseConfigured()) {
      const { data, error } = await getSupabaseAdmin().from('payroll_runs').select('*').eq('id', id).maybeSingle();
      if (error) throw new Error(`Payroll run lookup failed: ${error.message}`);
      if (data) return {
        id: data.id, payrollMonth: data.payroll_month, payrollYear: data.payroll_year, status: data.status,
        totalEmployees: data.total_employees, totalGross: Number(data.total_gross),
        totalDeductions: Number(data.total_deductions), totalNet: Number(data.total_net),
        processedBy: data.processed_by_name || data.processed_by, approvedBy: data.approved_by_name || data.approved_by,
        processedAt: data.processed_at, approvedAt: data.approved_at, paidAt: data.paid_at,
        createdAt: data.created_at, updatedAt: data.updated_at,
      };
    }
    return null;
  }

  async getAllRuns(): Promise<PayrollRunModel[]> {
    if (isRealSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
          .from('payroll_runs')
          .select('*')
          .order('payroll_year', { ascending: false })
          .order('payroll_month', { ascending: false });

        if (data && !error && data.length > 0) {
          return data.map(d => ({
            id: d.id,
            payrollMonth: d.payroll_month,
            payrollYear: d.payroll_year,
            status: d.status,
            totalEmployees: d.total_employees,
            totalGross: Number(d.total_gross),
            totalDeductions: Number(d.total_deductions),
            totalNet: Number(d.total_net),
            processedBy: d.processed_by_name || d.processed_by,
            approvedBy: d.approved_by_name || d.approved_by,
            processedAt: d.processed_at,
            approvedAt: d.approved_at,
            paidAt: d.paid_at,
            createdAt: d.created_at,
            updatedAt: d.updated_at,
          }));
        }
      } catch (err) {
        console.warn('Database error in getAllRuns:', err);
      }
    }

    return inMemoryRuns;
  }

  async createRun(month: number, year: number): Promise<PayrollRunModel> {
    const existing = await this.getRunByMonth(month, year);
    if (existing) {
      throw new Error(`Payroll run for ${month}/${year} already exists with status ${existing.status}`);
    }

    const id = randomUUID();
    const newRun: PayrollRunModel = {
      id,
      payrollMonth: month,
      payrollYear: year,
      status: 'DRAFT',
      totalEmployees: 0,
      totalGross: 0,
      totalDeductions: 0,
      totalNet: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    inMemoryRuns.unshift(newRun);

    if (isRealSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin();
        const { error } = await supabase.from('payroll_runs').insert({
          id: newRun.id,
          payroll_month: newRun.payrollMonth,
          payroll_year: newRun.payrollYear,
          status: newRun.status,
          total_employees: newRun.totalEmployees,
          total_gross: newRun.totalGross,
          total_deductions: newRun.totalDeductions,
          total_net: newRun.totalNet,
        });
        if (error) throw new Error(`Payroll run was not saved: ${error.message}`);
      } catch (err) {
        inMemoryRuns.splice(inMemoryRuns.findIndex(item => item.id === newRun.id), 1);
        throw err;
      }
    }

    return newRun;
  }

  async saveProcessedRun(
    runId: string,
    records: FullPayrollCalculationResult[],
    processorName: string,
    options?: { allowRecalculateProcessed?: boolean; forceApproved?: boolean }
  ): Promise<PayrollRunModel> {
    let run: PayrollRunModel | null = inMemoryRuns.find(r => r.id === runId) || null;
    if (!run) {
      run = await this.getRunById(runId);
    }
    if (!run) {
      throw new Error(`Payroll run ${runId} not found`);
    }

    if (run.status === 'PAID') {
      throw new Error('Cannot re-process an already PAID payroll run');
    }
    if (run.status === 'APPROVED' && !options?.forceApproved) {
      throw new Error('Approved payroll run is locked and cannot be reprocessed without explicit authorization');
    }
    const previousRun = { ...run };

    const totalGross = records.reduce((acc, r) => acc + r.grossSalary, 0);
    const totalDeductions = records.reduce((acc, r) => acc + r.totalDeductions, 0);
    const totalNet = records.reduce((acc, r) => acc + r.netSalary, 0);

    run.status = 'PROCESSED';
    run.totalEmployees = records.length;
    run.totalGross = Number(totalGross.toFixed(2));
    run.totalDeductions = Number(totalDeductions.toFixed(2));
    run.totalNet = Number(totalNet.toFixed(2));
    run.processedBy = processorName;
    run.processedAt = new Date().toISOString();
    run.updatedAt = new Date().toISOString();

    inMemoryRecords.set(runId, records);

    if (isRealSupabaseConfigured()) {
      try {
        await withTransaction(async client => {
          const locked = await client.query(`SELECT status FROM public.payroll_runs WHERE id=$1 FOR UPDATE`, [runId]);
          if (!locked.rows[0]) throw new Error(`Payroll run ${runId} not found in PostgreSQL`);
          const dbStatus = locked.rows[0].status;
          if (dbStatus === 'PAID' || (dbStatus === 'APPROVED' && !options?.forceApproved)) {
            throw new Error(`Finalized payroll run ${runId} (${dbStatus}) cannot be reprocessed`);
          }
          const allowedUpdateStatuses = options?.forceApproved
            ? `('DRAFT', 'PROCESSED', 'APPROVED')`
            : options?.allowRecalculateProcessed !== false
              ? `('DRAFT', 'PROCESSED')`
              : `('DRAFT')`;
          for (const record of records) {
            const employee = await client.query(`SELECT id FROM public.employees WHERE employee_id=$1 LIMIT 1`, [record.employeeId]);
            if (!employee.rows[0]) throw new Error(`Employee ${record.employeeId} not found while saving payroll`);
            const structure = await client.query(
              `SELECT id FROM public.salary_structures WHERE employee_id=$1 AND is_active=TRUE
                AND effective_from<=make_date($2,$3,1) AND (effective_to IS NULL OR effective_to>=make_date($2,$3,1))
                ORDER BY effective_from DESC LIMIT 1`,
              [employee.rows[0].id, record.payrollYear, record.payrollMonth]
            );
            await client.query(
              `INSERT INTO public.payroll_records(payroll_run_id,employee_id,salary_structure_id,payroll_month,payroll_year,
                 basic_salary,da,conveyance,hra,attendance_bonus,overtime_amount,bonus,incentive,commission,other_earnings,
                 gross_salary,pf_base,pf_rate,pf_amount,esic_base,esic_rate,esic_amount,professional_tax,lop_days,lop_amount,
                 advance_recovery,loan_recovery,other_deductions,total_deductions,net_salary,status,needs_recalculation)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,'PROCESSED',FALSE)
               ON CONFLICT(employee_id,payroll_month,payroll_year) DO UPDATE SET
                 payroll_run_id=EXCLUDED.payroll_run_id,salary_structure_id=EXCLUDED.salary_structure_id,
                 basic_salary=EXCLUDED.basic_salary,da=EXCLUDED.da,conveyance=EXCLUDED.conveyance,hra=EXCLUDED.hra,
                 attendance_bonus=EXCLUDED.attendance_bonus,overtime_amount=EXCLUDED.overtime_amount,bonus=EXCLUDED.bonus,
                 incentive=EXCLUDED.incentive,commission=EXCLUDED.commission,other_earnings=EXCLUDED.other_earnings,
                 gross_salary=EXCLUDED.gross_salary,pf_base=EXCLUDED.pf_base,pf_rate=EXCLUDED.pf_rate,pf_amount=EXCLUDED.pf_amount,
                 esic_base=EXCLUDED.esic_base,esic_rate=EXCLUDED.esic_rate,esic_amount=EXCLUDED.esic_amount,
                 professional_tax=EXCLUDED.professional_tax,lop_days=EXCLUDED.lop_days,lop_amount=EXCLUDED.lop_amount,
                 advance_recovery=EXCLUDED.advance_recovery,loan_recovery=EXCLUDED.loan_recovery,
                 other_deductions=EXCLUDED.other_deductions,total_deductions=EXCLUDED.total_deductions,
                 net_salary=EXCLUDED.net_salary,status='PROCESSED',needs_recalculation=FALSE,updated_at=NOW()
               WHERE public.payroll_records.status IN ${allowedUpdateStatuses}`,
              [runId, employee.rows[0].id, structure.rows[0]?.id || null, record.payrollMonth, record.payrollYear,
               record.basicSalary, record.da, record.conveyance, record.hra, record.attendanceBonus, record.overtimeAmount,
               record.bonus, record.incentive, record.commission, record.otherEarnings, record.grossSalary,
               record.pfBase, record.pfRate, record.pfAmount, record.esicBase, record.esicRate, record.esicAmount,
               record.professionalTax, record.lopDays, record.lopAmount, record.advanceRecovery, record.loanRecovery,
               record.otherDeductions, record.totalDeductions, record.netSalary]
            );
          }
          await client.query(
            `UPDATE public.payroll_runs SET status='PROCESSED',total_employees=$2,total_gross=$3,
               total_deductions=$4,total_net=$5,processed_by_name=$6,processed_at=$7,updated_at=NOW() WHERE id=$1`,
            [runId, run.totalEmployees, run.totalGross, run.totalDeductions, run.totalNet, processorName, run.processedAt]
          );
        });

        const supabase = getSupabaseAdmin();

        // Also save to company_settings payroll_records_data for frontend synchronization (preserving Paid/Locked records)
        const { data: csData } = await supabase
          .from('company_settings')
          .select('id, setting_val')
          .eq('setting_key', 'payroll_records_data')
          .maybeSingle();

        const currentRecords: any[] = Array.isArray(csData?.setting_val) ? csData!.setting_val : [];
        const lockedCurrent = currentRecords.filter(
          cr => cr && (cr.status === 'Paid' || cr.status === 'PAID' || cr.status === 'APPROVED' || cr.isLocked) && !options?.forceApproved
        );
        const nonLockedUpdated = records.filter(
          r => !lockedCurrent.some(lc => lc.employeeId === r.employeeId && (lc.payrollMonth === r.payrollMonth || lc.month) && Number(lc.payrollYear ?? lc.year) === r.payrollYear)
        );
        const mergedRecords = [
          ...lockedCurrent,
          ...nonLockedUpdated,
          ...currentRecords.filter(
            cr =>
              !lockedCurrent.includes(cr) &&
              !nonLockedUpdated.some(r => r.employeeId === cr.employeeId && r.payrollMonth === Number(cr.payrollMonth) && r.payrollYear === Number(cr.payrollYear ?? cr.year))
          ),
        ];

        if (csData?.id) {
          await supabase
            .from('company_settings')
            .update({ setting_val: mergedRecords, updated_at: new Date().toISOString() })
            .eq('id', csData.id);
        } else {
          await supabase
            .from('company_settings')
            .insert({ setting_key: 'payroll_records_data', setting_val: mergedRecords });
        }
      } catch (err) {
        Object.assign(run, previousRun);
        inMemoryRecords.delete(runId);
        throw err;
      }
    }

    return run;
  }

  async updateRunStatus(runId: string, status: PayrollRunStatus, approverName?: string): Promise<PayrollRunModel> {
    let run: PayrollRunModel | null = inMemoryRuns.find(r => r.id === runId) || null;
    if (!run) {
      run = await this.getRunById(runId);
    }
    if (!run) {
      throw new Error(`Payroll run ${runId} not found`);
    }

    if (run.status === 'PAID' && status !== 'PAID') {
      throw new Error('Cannot change status of an already PAID payroll run');
    }

    if (status === 'PAID' && run.status !== 'APPROVED') {
      throw new Error('Payroll run must be APPROVED before it can be marked as PAID');
    }
    const previousRun = { ...run };

    run.status = status;
    run.updatedAt = new Date().toISOString();

    if (status === 'APPROVED') {
      run.approvedBy = approverName || 'Authorized Signatory';
      run.approvedAt = new Date().toISOString();
    } else if (status === 'PAID') {
      run.paidAt = new Date().toISOString();
    }

    if (isRealSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin();
        const payload: any = {
          status: run.status,
          updated_at: run.updatedAt,
        };
        if (run.approvedBy) payload.approved_by_name = run.approvedBy;
        if (run.approvedAt) payload.approved_at = run.approvedAt;
        if (run.paidAt) payload.paid_at = run.paidAt;

        const { error } = await supabase
          .from('payroll_runs')
          .update(payload)
          .eq('id', runId);
        if (error) throw new Error(`Payroll status update failed: ${error.message}`);
        if (status === 'APPROVED' || status === 'PAID') {
          const { error: recordError } = await supabase.from('payroll_records').update({ status, updated_at: run.updatedAt }).eq('payroll_run_id', runId);
          if (recordError) throw new Error(`Payroll record finalization failed: ${recordError.message}`);
        }
      } catch (err) {
        Object.assign(run, previousRun);
        throw err;
      }
    }

    return run;
  }

  async getRecordsForRun(runId: string): Promise<FullPayrollCalculationResult[]> {
    if (isRealSupabaseConfigured()) {
      try {
        const result = await query(
          `SELECT pr.*,e.employee_id AS employee_code,ss.monthly_salary,pa.working_days,pa.present_days,pa.overtime_hours
             FROM public.payroll_records pr JOIN public.employees e ON e.id=pr.employee_id
             LEFT JOIN public.salary_structures ss ON ss.id=pr.salary_structure_id
             LEFT JOIN public.payroll_attendance pa ON pa.payroll_record_id=pr.id
            WHERE pr.payroll_run_id=$1 ORDER BY e.employee_id`, [runId]
        );
        return result.rows.map(mapPayrollRecord).filter(r => r.employeeId !== 'VRM-001' && r.employeeId !== 'EMP-000');
      } catch (err) {
        throw err;
      }
    }
    return inMemoryRecords.get(runId) || [];
  }

  async getAllProcessedRecords(): Promise<FullPayrollCalculationResult[]> {
    if (isRealSupabaseConfigured()) {
      const merged = new Map<string, FullPayrollCalculationResult>();

      // 1. Read Web HRMS authoritative payroll_records_data from company_settings FIRST
      try {
        const settingsRes = await query(
          `SELECT setting_val FROM public.company_settings WHERE setting_key = 'payroll_records_data' LIMIT 1`
        );
        const val = settingsRes.rows[0]?.setting_val;
        if (Array.isArray(val)) {
          for (const raw of val) {
            if (!raw || typeof raw !== 'object') continue;
            const mapped = mapSettingsPayrollRecord(raw);
            const code = (mapped.employeeId || '').toUpperCase();
            if (!code || code === 'VRM-001' || code === 'EMP-000') continue;
            const key = `${code}_${mapped.payrollYear}_${mapped.payrollMonth}`;
            merged.set(key, mapped);
          }
        }
      } catch (err) {
        console.warn('[PayrollRepository] company_settings payroll_records_data read warning:', err);
      }

      // 2. Supplement from relational public.payroll_records when a record is absent in settings
      try {
        const [hasPayrollYear, hasSalaryStructureId, hasPayrollAttendance] = await Promise.all([
          hasDatabaseColumn('payroll_records', 'payroll_year'),
          hasDatabaseColumn('payroll_records', 'salary_structure_id'),
          hasDatabaseColumn('payroll_attendance', 'payroll_record_id'),
        ]);
        const sql = hasPayrollYear && hasSalaryStructureId && hasPayrollAttendance
          ? `SELECT pr.*, e.employee_id AS employee_code,
                    TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '')) AS employee_name,
                    e.designation, d.name AS department_name,
                    ss.monthly_salary, pa.working_days, pa.present_days, pa.overtime_hours
               FROM public.payroll_records pr
               JOIN public.employees e ON e.id = pr.employee_id
               LEFT JOIN public.departments d ON d.id = e.department_id
               LEFT JOIN public.salary_structures ss ON ss.id = pr.salary_structure_id
               LEFT JOIN public.payroll_attendance pa ON pa.payroll_record_id = pr.id
              WHERE pr.status::text IN ('PROCESSED','APPROVED','PAID','Processed','Paid','Verified')
              ORDER BY pr.payroll_year DESC, pr.payroll_month DESC, e.employee_id`
          : `SELECT pr.*, e.employee_id AS employee_code,
                    TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '')) AS employee_name,
                    e.designation, d.name AS department_name
               FROM public.payroll_records pr
               JOIN public.employees e ON e.id = pr.employee_id
               LEFT JOIN public.departments d ON d.id = e.department_id
              WHERE pr.status::text IN ('PROCESSED','APPROVED','PAID','Processed','Paid','Verified','Pending')
              ORDER BY pr.payroll_month DESC, e.employee_id`;
        const result = await query(sql);
        for (const row of result.rows) {
          const mapped = mapPayrollRecord(row);
          const code = (mapped.employeeId || '').toUpperCase();
          if (!code || code === 'VRM-001' || code === 'EMP-000') continue;
          const key = `${code}_${mapped.payrollYear}_${mapped.payrollMonth}`;
          if (!merged.has(key)) {
            merged.set(key, mapped);
          }
        }
      } catch (err) {
        if (merged.size === 0) throw err;
        console.warn('[PayrollRepository] relational payroll_records fallback warning:', err);
      }

      return Array.from(merged.values()).sort((a, b) =>
        b.payrollYear - a.payrollYear ||
        b.payrollMonth - a.payrollMonth ||
        String(a.employeeId).localeCompare(String(b.employeeId))
      );
    }
    const all: FullPayrollCalculationResult[] = [];
    for (const recs of inMemoryRecords.values()) all.push(...recs);
    return all;
  }

  async getRecordForEmployee(employeeId: string, month?: number, year?: number): Promise<FullPayrollCalculationResult | null> {
    const all = await this.getAllProcessedRecords();
    return (
      all.find(r => {
        const matchesEmp = r.employeeId?.toLowerCase().trim() === employeeId.toLowerCase().trim();
        if (!month || !year) return matchesEmp;
        return matchesEmp && r.payrollMonth === month && r.payrollYear === year;
      }) || null
    );
  }

  async generatePayslip(employeeId: string, month?: number, year?: number, companyId?: string): Promise<PayslipResponseData | null> {
    const record = await this.getRecordForEmployee(employeeId, month, year);
    if (!record) return null;

    const emp = await employeeRepository.getEmployeeById(employeeId);
    if (!emp) return null;

    const targetCompanyId = companyId || emp.branch || 'company-a';
    const compSettings = await settingsRepository.getCompanySettings(targetCompanyId);

    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    return {
      company: {
        company_id: compSettings.company_id || targetCompanyId,
        companyName: compSettings.companyName || 'Corporate Organization',
        legalName: compSettings.legalCompanyName || compSettings.legalEntity || compSettings.companyName || 'Corporate Organization',
        logoUrl: compSettings.logoUrl || '',
        address: compSettings.address || '',
        registeredAddress: compSettings.registeredAddress || compSettings.address || '',
        branchAddress: compSettings.branchAddress || '',
        email: compSettings.officialEmail || compSettings.contactEmail || '',
        phone: compSettings.officialPhone || compSettings.contactPhone || '',
        website: compSettings.website || '',
        pan: compSettings.panNumber || '',
        gst: compSettings.gstNumber || compSettings.taxIdGst || '',
        cin: compSettings.cinNumber || '',
        registrationNumber: compSettings.registrationNumber || '',
        ownerName: compSettings.ownerName || '',
        authorizedSignatoryName: compSettings.authorizedSignatoryName || '',
        authorizedSignatoryDesignation: compSettings.authorizedSignatoryDesignation || 'Authorized Signatory',
        signatureImageUrl: compSettings.signatureImageUrl || '',
        stampImageUrl: compSettings.stampImageUrl || '',
      },
      employee: {
        id: emp.id,
        employeeId: emp.employeeId,
        firstName: emp.firstName,
        lastName: emp.lastName,
        email: emp.email,
        department: emp.department,
        designation: emp.designation,
        joiningDate: emp.joiningDate,
        monthlyCtc: record.monthlySalary,
        panNumber: emp.panNumber || emp.salaryDetails?.panNumber,
        uanNumber: emp.uanNumber || emp.salaryDetails?.uanNumber,
        bankName: emp.bankName,
        accountNumber: emp.accountNumber,
        ifscCode: emp.ifscCode,
      },
      payroll: {
        month: record.payrollMonth,
        year: record.payrollYear,
        monthName: months[record.payrollMonth - 1] || 'August',
        calendarDays: record.calendarDays ?? record.calendarDaysInMonth,
        eligibleDays: record.eligibleDays,
        workingDays: record.workingDays,
        presentDays: record.presentDays,
        paidWeekOffDays: record.paidWeekOffDays ?? 0,
        paidHolidayDays: record.paidHolidayDays ?? 0,
        paidLeaveDays: record.paidLeaveDays ?? 0,
        lopDays: record.lopDays,
        paidDays: record.paidDays ?? record.totalPaidDays,
        totalPaidDays: record.totalPaidDays ?? record.paidDays,
        status: record.status || 'PROCESSED',
      },
      earnings: {
        basicSalary: record.basicSalary,
        da: record.da,
        conveyance: record.conveyance,
        hra: record.hra,
        attendanceBonus: record.attendanceBonus,
        overtimeAmount: record.overtimeAmount,
        bonus: record.bonus,
        incentive: record.incentive,
        commission: record.commission,
        otherEarnings: record.otherEarnings,
        grossSalary: record.grossSalary,
      },
      deductions: {
        pf: record.pfAmount,
        pfRate: record.pfRate,
        esic: record.esicAmount,
        esicRate: record.esicRate,
        professionalTax: record.professionalTax,
        lopAmount: record.lopAmount,
        lateAttendanceDeduction: Number((record as any).lateAttendanceDeduction ?? 0) || 0,
        advanceRecovery: record.advanceRecovery,
        loanRecovery: record.loanRecovery,
        otherDeductions: record.otherDeductions,
        totalDeductions: record.totalDeductions,
      },
      earningsBreakdown: record.earningsBreakdown || [],
      deductionsBreakdown: record.deductionsBreakdown || [],
      netSalary: record.netSalary,
    };
  }
}

export const payrollRepository = new PayrollRepository();
