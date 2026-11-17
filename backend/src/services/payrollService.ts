import {
  FullPayrollCalculationResult,
  PayrollRunModel,
  PayrollSettingsModel,
  PayrollSettingsConfig,
  SalaryComponentConfig,
  PayslipResponseData,
} from '../types/payroll.js';
import { validateComponentEligibility } from './componentEligibilityEngine.js';
import { computeFullPayroll, computeSalaryStructure, isCeoOrOwnerEmployee, getCalendarDaysInMonth } from './calculationEngine.js';
import { employeeRepository } from '../repositories/employeeRepository.js';
import { settingsRepository } from '../repositories/settingsRepository.js';
import { payrollRepository } from '../repositories/payrollRepository.js';
import { overtimeRepository } from '../repositories/overtimeRepository.js';
import { attendanceRepository } from '../repositories/attendanceRepository.js';
import { leaveRepository } from '../repositories/leaveRepository.js';
import { query } from '../config/database.js';

export interface PayrollPreviewInput {
  employee_id: string;
  payroll_month: number;
  payroll_year: number;
  attendance_bonus?: number;
  overtime_hours?: number;
  overtime_rate?: number;
  bonus?: number;
  incentive?: number;
  commission?: number;
  other_earnings?: number;
  lop_days?: number;
  paid_leave_days?: number;
  advance_recovery?: number;
  loan_recovery?: number;
  other_deductions?: number;
  joining_date?: string | null;
  exit_date?: string | null;
  weekly_off?: string | string[] | null;
  holidays?: any[];
  weekly_schedules?: any[];
  attendance_records?: any[];
  leave_requests?: any[];
  sandwich_policies?: any[];
}

export class PayrollService {
  private async loadCalendarSettingsFromDb(): Promise<{
    holidays: any[];
    weeklySchedules: any[];
    sandwichPolicies: any[];
  }> {
    let holidays: any[] = [];
    let weeklySchedules: any[] = [];
    let sandwichPolicies: any[] = [];
    try {
      const res = await query<{ setting_key: string; setting_val: any }>(
        `SELECT setting_key, setting_val
           FROM public.company_settings
          WHERE setting_key IN ('holidays_data', 'holidays', 'weekly_schedules_data', 'weekly_schedules', 'sandwich_policies_data', 'sandwich_policies')`
      );
      for (const row of res.rows || []) {
        if ((row.setting_key === 'holidays_data' || row.setting_key === 'holidays') && Array.isArray(row.setting_val) && holidays.length === 0) {
          holidays = row.setting_val;
        }
        if ((row.setting_key === 'weekly_schedules_data' || row.setting_key === 'weekly_schedules') && Array.isArray(row.setting_val) && weeklySchedules.length === 0) {
          weeklySchedules = row.setting_val;
        }
        if ((row.setting_key === 'sandwich_policies_data' || row.setting_key === 'sandwich_policies') && Array.isArray(row.setting_val) && sandwichPolicies.length === 0) {
          sandwichPolicies = row.setting_val;
        }
      }
    } catch {
      // Ignore if DB not connected during unit tests
    }
    return { holidays, weeklySchedules, sandwichPolicies };
  }

  async getSettings(): Promise<PayrollSettingsModel> {
    return settingsRepository.getSettings();
  }

  async updateSettings(updates: Partial<PayrollSettingsModel>): Promise<PayrollSettingsModel> {
    return settingsRepository.updateSettings(updates);
  }

  async getPayrollSettingsConfig(): Promise<PayrollSettingsConfig> {
    return settingsRepository.getPayrollSettingsConfig();
  }

  async updatePayrollSettingsConfig(updates: Partial<PayrollSettingsConfig>): Promise<PayrollSettingsConfig> {
    return settingsRepository.updatePayrollSettingsConfig(updates);
  }

  async getSalaryComponents(): Promise<SalaryComponentConfig[]> {
    const config = await this.getPayrollSettingsConfig();
    return config.components || [];
  }

  async updateSalaryComponents(components: SalaryComponentConfig[]): Promise<SalaryComponentConfig[]> {
    for (const comp of components) {
      const validation = validateComponentEligibility(comp);
      if (!validation.isValid) {
        throw new Error(`Validation error for component "${comp.name}": ${validation.error}`);
      }
    }
    const updated = await this.updatePayrollSettingsConfig({ components });
    return updated.components || [];
  }

  /**
   * Preview calculation for an employee without persisting records.
   * Authoritative backend Calendar Day Based Payroll calculation using decimal.js and dynamic DB settings.
   */
  async previewPayroll(input: PayrollPreviewInput): Promise<FullPayrollCalculationResult> {
    const employee = await employeeRepository.getEmployeeById(input.employee_id);
    if (!employee) {
      throw new Error(`Employee with ID ${input.employee_id} not found`);
    }

    const structure = await employeeRepository.getSalaryStructure(
      input.employee_id,
      `${input.payroll_year}-${String(input.payroll_month).padStart(2, '0')}-01`
    );
    if (!structure) {
      throw new Error(`No active salary structure found for employee ${input.employee_id}`);
    }

    const settings = await settingsRepository.getSettings();
    const payrollConfig = await settingsRepository.getPayrollSettingsConfig();
    const isCeo = isCeoOrOwnerEmployee(employee as any);

    // Check approved overtime records if not explicitly passed (exempt for CEO)
    let otHours = isCeo ? 0 : (input.overtime_hours ?? 0);
    let otRate = isCeo ? 0 : (input.overtime_rate ?? 0);
    let otAmount = 0;

    if (!isCeo && otHours === 0) {
      const approvedOt = await overtimeRepository.getApprovedOvertimeForMonth(
        employee.employeeId,
        input.payroll_month,
        input.payroll_year
      );
      if (approvedOt.length > 0) {
        otHours = approvedOt.reduce((sum, r) => sum + r.hours, 0);
        otAmount = approvedOt.reduce((sum, r) => sum + r.amount, 0);
      }
    }

    const calendarCtx = await this.loadCalendarSettingsFromDb();
    const empAtt = input.attendance_records ?? (isCeo ? [] : await attendanceRepository.getAll({ employeeId: employee.employeeId }).catch(() => []));
    const empLeaves = input.leave_requests ?? (isCeo ? [] : await leaveRepository.getLeaves({ employeeId: employee.employeeId, status: 'Approved' }).catch(() => []));

    const profileData = (employee as any).profile_data || {};
    const joiningDate = input.joining_date !== undefined
      ? input.joining_date
      : (employee.joiningDate || profileData.joiningDate || profileData.dateOfJoining);
    const exitDate = input.exit_date !== undefined
      ? input.exit_date
      : (profileData.exitDate || profileData.relievingDate || profileData.lastWorkingDate || profileData.terminationDate);
    const weeklyOff = input.weekly_off !== undefined
      ? input.weekly_off
      : (employee.shiftDetails?.weeklyOff || profileData.shiftDetails?.weeklyOff || profileData.weeklyOff);

    const calendarDays = getCalendarDaysInMonth(input.payroll_month, input.payroll_year);
    const lopDays = isCeo ? 0 : (input.lop_days ?? 0);
    const paidLeaveDays = isCeo ? 0 : (input.paid_leave_days ?? 0);

    return computeFullPayroll({
      employeeId: employee.employeeId,
      monthlySalary: structure.monthlySalary,
      basicPercentage: structure.basicPercentage,
      daPercentage: structure.daPercentage,
      conveyancePercentage: structure.conveyancePercentage,
      hraPercentage: structure.hraPercentage,
      payrollMonth: input.payroll_month,
      payrollYear: input.payroll_year,
      withPf: structure.withPf !== undefined ? structure.withPf : (employee.withPf !== undefined ? employee.withPf : true),
      settings,
      joiningDate: joiningDate || undefined,
      exitDate: exitDate || undefined,
      weeklyOff: weeklyOff || undefined,
      weeklySchedules: input.weekly_schedules ?? calendarCtx.weeklySchedules,
      holidays: input.holidays ?? calendarCtx.holidays,
      attendanceRecords: empAtt,
      leaveRequests: empLeaves,
      sandwichPolicies: input.sandwich_policies ?? calendarCtx.sandwichPolicies,
      attendance: {
        workingDays: calendarDays,
        presentDays: Math.max(0, calendarDays - lopDays),
        paidLeaveDays,
        unpaidLeaveDays: lopDays,
        absentDays: 0,
        halfDays: 0,
        lopDays,
        overtimeHours: otHours,
      },
      earnings: {
        attendanceBonus: isCeo ? 0 : (input.attendance_bonus ?? 0),
        overtimeHours: otHours,
        overtimeRate: otRate,
        overtimeAmount: otAmount,
        bonus: input.bonus ?? 0,
        incentive: input.incentive ?? 0,
        commission: input.commission ?? 0,
        otherEarnings: input.other_earnings ?? 0,
      },
      deductions: {
        advanceRecovery: input.advance_recovery ?? 0,
        loanRecovery: input.loan_recovery ?? 0,
        otherDeductions: input.other_deductions ?? 0,
      },
      configuredComponents: payrollConfig?.components || [],
      employeeContext: {
        id: employee.id,
        employeeId: employee.employeeId,
        role: (employee as any).role,
        department: employee.department,
        designation: employee.designation,
        branchId: employee.workLocation || employee.branch,
        joiningDate: joiningDate || undefined,
        monthlyCtc: structure.monthlySalary,
        basicSalary: structure.monthlySalary * (structure.basicPercentage / 100),
        withPf: structure.withPf !== undefined ? structure.withPf : (employee.withPf !== undefined ? employee.withPf : true),
        payrollMonth: input.payroll_month,
        payrollYear: input.payroll_year,
      },
    });
  }

  async createPayrollRun(month: number, year: number): Promise<PayrollRunModel> {
    return payrollRepository.createRun(month, year);
  }

  async getAllRuns(): Promise<PayrollRunModel[]> {
    return payrollRepository.getAllRuns();
  }

  async getRunById(id: string): Promise<PayrollRunModel | null> {
    return payrollRepository.getRunById(id);
  }

  /**
   * Processes a monthly payroll batch for all active employees using Calendar Day Based Payroll.
   */
  async processPayrollRun(
    runId: string,
    processorName = 'Finance Admin',
    options?: { allowRecalculateProcessed?: boolean; forceApproved?: boolean }
  ): Promise<PayrollRunModel> {
    const run = await payrollRepository.getRunById(runId);
    if (!run) {
      throw new Error(`Payroll run ${runId} not found`);
    }

    if (run.status === 'PAID') {
      throw new Error('Cannot re-process an already PAID payroll run');
    }
    if (run.status === 'APPROVED' && !options?.forceApproved) {
      throw new Error('Approved payroll run is locked. Controlled recalculation requires explicit authorization.');
    }

    const employees = await employeeRepository.getAllEmployees();
    const settings = await settingsRepository.getSettings();
    const payrollConfig = await settingsRepository.getPayrollSettingsConfig();
    const calendarCtx = await this.loadCalendarSettingsFromDb();
    const allAttendance = await attendanceRepository.getAll().catch(() => []);
    const allApprovedLeaves = await leaveRepository.getLeaves({ status: 'Approved' }).catch(() => []);
    const calendarDays = getCalendarDaysInMonth(run.payrollMonth, run.payrollYear);
    const processedRecords: FullPayrollCalculationResult[] = [];

    for (const emp of employees) {
      if (isCeoOrOwnerEmployee(emp as any)) {
        continue;
      }
      const structure = await employeeRepository.getSalaryStructure(
        emp.employeeId,
        `${run.payrollYear}-${String(run.payrollMonth).padStart(2, '0')}-01`
      );
      if (!structure) continue;

      // Check approved overtime
      const approvedOt = await overtimeRepository.getApprovedOvertimeForMonth(
        emp.employeeId,
        run.payrollMonth,
        run.payrollYear
      );
      const otHours = approvedOt.reduce((sum, r) => sum + r.hours, 0);
      const otAmount = approvedOt.reduce((sum, r) => sum + r.amount, 0);

      const profileData = (emp as any).profile_data || {};
      const joiningDate = emp.joiningDate || profileData.joiningDate || profileData.dateOfJoining;
      const exitDate = profileData.exitDate || profileData.relievingDate || profileData.lastWorkingDate || profileData.terminationDate;
      const weeklyOff = emp.shiftDetails?.weeklyOff || profileData.shiftDetails?.weeklyOff || profileData.weeklyOff;

      const empLeaves = allApprovedLeaves.filter(l => {
        const lEmp = String(l.employeeId || (l as any).employee_id || '').toLowerCase();
        return lEmp === String(emp.employeeId || '').toLowerCase() || (emp.id && lEmp === String(emp.id).toLowerCase());
      });

      const calculated = computeFullPayroll({
        employeeId: emp.employeeId,
        monthlySalary: structure.monthlySalary,
        basicPercentage: structure.basicPercentage,
        daPercentage: structure.daPercentage,
        conveyancePercentage: structure.conveyancePercentage,
        hraPercentage: structure.hraPercentage,
        payrollMonth: run.payrollMonth,
        payrollYear: run.payrollYear,
        withPf: structure.withPf !== undefined ? structure.withPf : (emp.withPf !== undefined ? emp.withPf : true),
        settings,
        joiningDate: joiningDate || undefined,
        exitDate: exitDate || undefined,
        weeklyOff: weeklyOff || undefined,
        weeklySchedules: calendarCtx.weeklySchedules,
        holidays: calendarCtx.holidays,
        attendanceRecords: allAttendance,
        leaveRequests: empLeaves,
        sandwichPolicies: calendarCtx.sandwichPolicies,
        attendance: {
          workingDays: calendarDays,
          presentDays: calendarDays,
          paidLeaveDays: 0,
          unpaidLeaveDays: 0,
          absentDays: 0,
          halfDays: 0,
          lopDays: 0,
          overtimeHours: otHours,
        },
        earnings: {
          overtimeHours: otHours,
          overtimeAmount: otAmount,
        },
        configuredComponents: payrollConfig?.components || [],
        employeeContext: {
          id: emp.id,
          employeeId: emp.employeeId,
          branchId: emp.workLocation || emp.branch,
          joiningDate: joiningDate || undefined,
          monthlyCtc: structure.monthlySalary,
          basicSalary: structure.monthlySalary * (structure.basicPercentage / 100),
          withPf: structure.withPf !== undefined ? structure.withPf : (emp.withPf !== undefined ? emp.withPf : true),
          payrollMonth: run.payrollMonth,
          payrollYear: run.payrollYear,
        },
      });

      processedRecords.push(calculated);
    }

    return payrollRepository.saveProcessedRun(runId, processedRecords, processorName, options);
  }

  /**
   * Controlled recalculation for previously processed payroll (Requirement 15).
   * Preserves PAID records and requires explicit authorization if run is APPROVED.
   */
  async recalculatePayrollRun(
    runId: string,
    processorName = 'HR / Payroll Admin',
    forceApproved = false
  ): Promise<PayrollRunModel> {
    return this.processPayrollRun(runId, processorName, {
      allowRecalculateProcessed: true,
      forceApproved,
    });
  }

  async approvePayrollRun(runId: string, approverName = 'Authorized Signatory'): Promise<PayrollRunModel> {
    return payrollRepository.updateRunStatus(runId, 'APPROVED', approverName);
  }

  async payPayrollRun(runId: string): Promise<PayrollRunModel> {
    return payrollRepository.updateRunStatus(runId, 'PAID');
  }

  async getRecords(params?: { month?: number; year?: number; employeeId?: string }): Promise<FullPayrollCalculationResult[]> {
    const all = await payrollRepository.getAllProcessedRecords();
    return all.filter(r => {
      if (params?.employeeId && r.employeeId !== params.employeeId) return false;
      if (params?.month && r.payrollMonth !== params.month) return false;
      if (params?.year && r.payrollYear !== params.year) return false;
      return true;
    });
  }

  async getPayslip(employeeId: string, month?: number, year?: number, companyId?: string): Promise<PayslipResponseData> {
    let payslip = await payrollRepository.generatePayslip(employeeId, month, year, companyId);
    if (!payslip) {
      // If no past processed run exists for this month, calculate a preview payslip on the fly!
      const preview = await this.previewPayroll({
        employee_id: employeeId,
        payroll_month: month || 8,
        payroll_year: year || 2026,
      });

      const emp = await employeeRepository.getEmployeeById(employeeId);
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const targetCompanyId = companyId || emp?.branch || 'company-a';
      const compSettings = await settingsRepository.getCompanySettings(targetCompanyId);

      payslip = {
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
          id: emp?.id || employeeId,
          employeeId: emp?.employeeId || employeeId,
          firstName: emp?.firstName || 'Staff',
          lastName: emp?.lastName || 'Member',
          email: emp?.email || 'staff@businz.com',
          department: emp?.department || 'Operations',
          designation: emp?.designation || 'Engineer',
          joiningDate: emp?.joiningDate,
          monthlyCtc: preview.monthlySalary,
          panNumber: emp?.panNumber || emp?.salaryDetails?.panNumber,
          uanNumber: emp?.uanNumber || emp?.salaryDetails?.uanNumber,
          bankName: emp?.bankName,
          accountNumber: emp?.accountNumber,
          ifscCode: emp?.ifscCode,
        },
        payroll: {
          month: preview.payrollMonth,
          year: preview.payrollYear,
          monthName: months[preview.payrollMonth - 1] || 'August',
          calendarDays: preview.calendarDays ?? preview.calendarDaysInMonth,
          eligibleDays: preview.eligibleDays,
          workingDays: preview.workingDays,
          presentDays: preview.presentDays,
          paidWeekOffDays: preview.paidWeekOffDays ?? 0,
          paidHolidayDays: preview.paidHolidayDays ?? 0,
          paidLeaveDays: preview.paidLeaveDays ?? 0,
          lopDays: preview.lopDays,
          paidDays: preview.paidDays ?? preview.totalPaidDays,
          totalPaidDays: preview.totalPaidDays ?? preview.paidDays,
          status: 'Processed',
        },
        earnings: {
          basicSalary: preview.basicSalary,
          da: preview.da,
          conveyance: preview.conveyance,
          hra: preview.hra,
          attendanceBonus: preview.attendanceBonus,
          overtimeAmount: preview.overtimeAmount,
          bonus: preview.bonus,
          incentive: preview.incentive,
          commission: preview.commission,
          otherEarnings: preview.otherEarnings,
          grossSalary: preview.grossSalary,
        },
        deductions: {
          pf: preview.pfAmount,
          pfRate: preview.pfRate,
          esic: preview.esicAmount,
          esicRate: preview.esicRate,
          professionalTax: preview.professionalTax,
          lopAmount: preview.lopAmount,
          advanceRecovery: preview.advanceRecovery,
          loanRecovery: preview.loanRecovery,
          otherDeductions: preview.otherDeductions,
          totalDeductions: preview.totalDeductions,
        },
        netSalary: preview.netSalary,
      };
    }
    return payslip;
  }
}

export const payrollService = new PayrollService();
