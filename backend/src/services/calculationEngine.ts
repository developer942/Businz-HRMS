import { Decimal } from 'decimal.js';
import {
  PayrollCalculationInput,
  FullPayrollCalculationResult,
  ComputedSalaryStructure,
  SalaryStructureInput,
  CalculationBreakdownItem,
  EmployeeSalaryEligibilityContext,
  OtWageBaseMode,
  OtSalaryDivisorMode,
  OtCalculationMultiplier,
  PayslipOvertimeVisibilityConfig,
} from '../types/payroll.js';
import { isComponentEligible } from './componentEligibilityEngine.js';

// Configure Decimal precision for financial calculations
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

const DEFAULT_OT_ELIGIBLE_DEPARTMENTS = new Set([
  'floor',
  'dispatch loading',
]);

export function isDefaultOtEligibleDepartment(departmentName?: string): boolean {
  if (!departmentName) return false;
  return DEFAULT_OT_ELIGIBLE_DEPARTMENTS.has(departmentName.trim().toLowerCase());
}

/**
 * Automatically determines whether the selected payroll month contains 28, 29, 30 or 31 days.
 */
export function getCalendarDaysInMonth(month: number, year: number): number {
  const m = Math.max(1, Math.min(12, Math.floor(Number(month) || 1)));
  const y = Number(year) || new Date().getFullYear();
  return new Date(y, m, 0).getDate();
}

export function countWeeklyOffDaysInMonth(month: number, year: number, weeklyOffDayIndex = 0): number {
  const calendarDays = getCalendarDaysInMonth(month, year);
  let count = 0;
  for (let d = 1; d <= calendarDays; d++) {
    const dayOfWeek = new Date(year, month - 1, d).getDay();
    if (dayOfWeek === weeklyOffDayIndex) count++;
  }
  return count;
}

/**
 * Resolves the configured salary divisor for a payroll month without assuming every company uses calendar days.
 */
export function resolvePayrollSalaryDivisor(params: {
  month: number;
  year: number;
  divisorMode?: OtSalaryDivisorMode;
  fixedDivisorDays?: number;
  weeklyOffDayIndex?: number;
  holidayCount?: number;
}): { calendarDays: number; divisorDays: number; modeUsed: string } {
  const calendarDays = getCalendarDaysInMonth(params.month, params.year);
  const mode = params.divisorMode || 'FIXED_DAYS';

  if (mode === 'CALENDAR_DAYS') {
    return { calendarDays, divisorDays: calendarDays, modeUsed: 'CALENDAR_DAYS' };
  }
  if (mode === 'FIXED_30') {
    return { calendarDays, divisorDays: 30, modeUsed: 'FIXED_30' };
  }
  if (mode === 'FIXED_26') {
    return { calendarDays, divisorDays: 26, modeUsed: 'FIXED_26' };
  }
  if (mode === 'WORKING_DAYS' || mode === 'ACTUAL_WORKING_DAYS') {
    const weeklyOffs = countWeeklyOffDaysInMonth(params.month, params.year, params.weeklyOffDayIndex ?? 0);
    const holidays = Math.max(0, Number(params.holidayCount) || 0);
    const workingDays = Math.max(1, calendarDays - weeklyOffs - holidays);
    return { calendarDays, divisorDays: workingDays, modeUsed: 'WORKING_DAYS' };
  }
  const fixed = Number(params.fixedDivisorDays);
  const divisorDays = fixed > 0 ? fixed : 26;
  return { calendarDays, divisorDays, modeUsed: mode === 'CUSTOM' ? 'CUSTOM' : 'FIXED_DAYS' };
}

export function parseOtMultiplierValue(multiplier?: OtCalculationMultiplier | number): number {
  if (typeof multiplier === 'number' && multiplier > 0) return multiplier;
  if (multiplier === '2x Salary') return 2;
  if (multiplier === '1.5x Salary') return 1.5;
  return 1;
}

export function calculateEnterpriseOvertimeRateAndAmount(params: {
  approvedHours: number;
  wageBaseMode?: OtWageBaseMode;
  basicSalary?: number;
  grossSalary?: number;
  monthlyCtc?: number;
  fixedHourlyRate?: number;
  divisorDays: number;
  dailyPaidHours: number;
  multiplier?: OtCalculationMultiplier | number;
}): {
  hourlyRate: number;
  multiplierValue: number;
  calculatedAmount: number;
  wageBaseUsed: OtWageBaseMode;
  baseSalaryAmount: number;
  divisorUsed: number;
  dailyPaidHoursUsed: number;
} {
  const hours = new Decimal(Math.max(0, Number(params.approvedHours) || 0));
  const divisor = new Decimal(Math.max(1, Number(params.divisorDays) || 26));
  const shiftHours = new Decimal(Math.max(1, Number(params.dailyPaidHours) || 9));
  const wageBase: OtWageBaseMode = params.wageBaseMode || 'FIXED_HOURLY';
  const multVal = new Decimal(parseOtMultiplierValue(params.multiplier));

  if (wageBase === 'FIXED_HOURLY' || params.multiplier === 'Fixed Amount Per Hour') {
    const fixedRate = new Decimal(Math.max(0, Number(params.fixedHourlyRate) || 100));
    const effectiveMult =
      params.multiplier && params.multiplier !== 'Fixed Amount Per Hour' ? multVal : new Decimal(1);
    const hourlyRate = fixedRate.times(effectiveMult).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const calculatedAmount = hours.times(hourlyRate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    return {
      hourlyRate: hourlyRate.toNumber(),
      multiplierValue: effectiveMult.toNumber(),
      calculatedAmount: calculatedAmount.toNumber(),
      wageBaseUsed: 'FIXED_HOURLY',
      baseSalaryAmount: fixedRate.toNumber(),
      divisorUsed: divisor.toNumber(),
      dailyPaidHoursUsed: shiftHours.toNumber(),
    };
  }

  let baseSalary = new Decimal(0);
  if (wageBase === 'BASIC') {
    baseSalary = new Decimal(Number(params.basicSalary) || 0);
  } else if (wageBase === 'GROSS') {
    baseSalary = new Decimal(Number(params.grossSalary) || Number(params.monthlyCtc) || 0);
  } else {
    baseSalary = new Decimal(Number(params.monthlyCtc) || Number(params.grossSalary) || 0);
  }

  if (baseSalary.lessThanOrEqualTo(0) && Number(params.fixedHourlyRate) > 0) {
    const fallbackRate = new Decimal(Number(params.fixedHourlyRate)).times(multVal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    return {
      hourlyRate: fallbackRate.toNumber(),
      multiplierValue: multVal.toNumber(),
      calculatedAmount: hours.times(fallbackRate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
      wageBaseUsed: wageBase,
      baseSalaryAmount: 0,
      divisorUsed: divisor.toNumber(),
      dailyPaidHoursUsed: shiftHours.toNumber(),
    };
  }

  const baseHourly = baseSalary.dividedBy(divisor.times(shiftHours));
  const effectiveHourlyRate = baseHourly.times(multVal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const calculatedAmount = hours.times(effectiveHourlyRate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

  return {
    hourlyRate: effectiveHourlyRate.toNumber(),
    multiplierValue: multVal.toNumber(),
    calculatedAmount: calculatedAmount.toNumber(),
    wageBaseUsed: wageBase,
    baseSalaryAmount: baseSalary.toNumber(),
    divisorUsed: divisor.toNumber(),
    dailyPaidHoursUsed: shiftHours.toNumber(),
  };
}

export function resolveEmployeeOtEligibility(params: {
  departmentName: string;
  dateStr?: string;
  departmentOtAllowed?: boolean;
  departmentEffectiveFrom?: string;
  departmentEffectiveTo?: string;
  employeeExceptionRule?: 'Follow Department' | 'Allow OT' | 'Block OT';
  statutoryEntitlement?: boolean;
  employeePolicyEffectiveFrom?: string;
  employeePolicyEffectiveTo?: string;
}): {
  eligible: boolean;
  source: 'DEPARTMENT_POLICY' | 'EMPLOYEE_EXCEPTION' | 'STATUTORY_ENTITLEMENT' | 'RESTRICTED';
  reason: string;
} {
  const dateStr = (params.dateStr || '').slice(0, 10);
  const isDateInRange = (from?: string, to?: string) => {
    if (!dateStr) return true;
    if (from && dateStr < from.slice(0, 10)) return false;
    if (to && dateStr > to.slice(0, 10)) return false;
    return true;
  };

  if (isDateInRange(params.employeePolicyEffectiveFrom, params.employeePolicyEffectiveTo)) {
    if (params.employeeExceptionRule === 'Block OT') {
      return {
        eligible: false,
        source: 'RESTRICTED',
        reason: 'Blocked by employee-specific overtime policy exception',
      };
    }
    if (params.statutoryEntitlement) {
      return {
        eligible: true,
        source: 'STATUTORY_ENTITLEMENT',
        reason: 'Eligible via statutory overtime entitlement',
      };
    }
    if (params.employeeExceptionRule === 'Allow OT') {
      return {
        eligible: true,
        source: 'EMPLOYEE_EXCEPTION',
        reason: 'Eligible via employee-specific overtime policy exception',
      };
    }
  }

  const deptAllowed =
    params.departmentOtAllowed !== undefined
      ? params.departmentOtAllowed && isDateInRange(params.departmentEffectiveFrom, params.departmentEffectiveTo)
      : isDefaultOtEligibleDepartment(params.departmentName);

  if (deptAllowed) {
    return {
      eligible: true,
      source: 'DEPARTMENT_POLICY',
      reason: `Eligible under ${params.departmentName} department overtime policy`,
    };
  }

  return {
    eligible: false,
    source: 'RESTRICTED',
    reason: `Department "${params.departmentName}" is restricted from automatic overtime approval`,
  };
}

export function formatPayslipOvertimeForViewer(params: {
  overtimeHours: number;
  overtimeAmount: number;
  overtimeRate: number;
  divisorUsed?: number;
  shiftHours?: number;
  multiplierLabel?: string;
  visibility?: PayslipOvertimeVisibilityConfig;
}): {
  visible: boolean;
  showHours: boolean;
  showAmount: boolean;
  showCalculationDetails: boolean;
  label: string;
  amount: number;
  description?: string;
} {
  const vis = params.visibility || {
    showOtHoursOnPayslip: true,
    showOtAmountOnPayslip: true,
    showOtCalculationDetailsOnPayslip: false,
  };
  const hrs = Number(params.overtimeHours) || 0;
  const amt = Number(params.overtimeAmount) || 0;
  const rate = Number(params.overtimeRate) || 0;

  if (amt <= 0 && hrs <= 0) {
    return {
      visible: false,
      showHours: vis.showOtHoursOnPayslip,
      showAmount: vis.showOtAmountOnPayslip,
      showCalculationDetails: vis.showOtCalculationDetailsOnPayslip,
      label: 'Overtime Earnings',
      amount: 0,
    };
  }

  const label =
    vis.showOtHoursOnPayslip && hrs > 0
      ? `Overtime Earnings (${hrs} hrs)`
      : 'Overtime Earnings';

  let description: string | undefined;
  if (vis.showOtCalculationDetailsOnPayslip) {
    const parts: string[] = [];
    if (hrs > 0 && rate > 0) parts.push(`${hrs} hrs × ₹${rate}/hr`);
    if (params.divisorUsed) parts.push(`Divisor: ${params.divisorUsed}d`);
    if (params.shiftHours) parts.push(`Shift: ${params.shiftHours}h`);
    if (params.multiplierLabel) parts.push(params.multiplierLabel);
    description = parts.join(' | ') || 'Approved Overtime';
  }

  return {
    visible: vis.showOtAmountOnPayslip || vis.showOtHoursOnPayslip,
    showHours: vis.showOtHoursOnPayslip,
    showAmount: vis.showOtAmountOnPayslip,
    showCalculationDetails: vis.showOtCalculationDetailsOnPayslip,
    label,
    amount: amt,
    description,
  };
}

export class PayrollConfigurationError extends Error {
  public code: string;
  public details: unknown[];

  constructor(message: string, code = 'PF_CONFIGURATION_ERROR', details: unknown[] = []) {
    super(message);
    this.name = 'PayrollConfigurationError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Validates and computes fixed salary components from percentages.
 * Percentages must sum to exactly 100.
 */
export const computeSalaryStructure = (input: SalaryStructureInput): ComputedSalaryStructure => {
  const monthly = new Decimal(input.monthlySalary);
  const basicPct = new Decimal(input.basicPercentage);
  const daPct = new Decimal(input.daPercentage);
  const convPct = new Decimal(input.conveyancePercentage);
  const hraPct = new Decimal(input.hraPercentage);

  const pctSum = basicPct.plus(daPct).plus(convPct).plus(hraPct);

  if (monthly.isNegative()) {
    throw new Error('Monthly salary cannot be negative');
  }

  if (basicPct.isNegative() || daPct.isNegative() || convPct.isNegative() || hraPct.isNegative()) {
    throw new Error('Salary component percentages cannot be negative');
  }

  // Tolerant to small floating point precision in input (0.01)
  if (!pctSum.minus(100).abs().lessThanOrEqualTo(0.01)) {
    throw new Error(`Salary structure percentages must sum to 100% (current sum: ${pctSum.toString()}%)`);
  }

  const basicSalary = monthly.times(basicPct).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const da = monthly.times(daPct).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const conveyance = monthly.times(convPct).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const hra = monthly.times(hraPct).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const fixedGross = basicSalary.plus(da).plus(conveyance).plus(hra).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    monthlySalary: monthly.toDecimalPlaces(2).toNumber(),
    basicSalary: basicSalary.toNumber(),
    da: da.toNumber(),
    conveyance: conveyance.toNumber(),
    hra: hra.toNumber(),
    fixedGross: fixedGross.toNumber(),
    percentagesSum: pctSum.toNumber(),
    isValid: true,
  };
};

/**
 * Calculates Provident Fund (PF) contribution according to business policy.
 * Default PF Base = Basic + DA + Conveyance
 * Default PF Rate = 12%
 */
export const calculatePF = (
  basic: Decimal,
  da: Decimal,
  conveyance: Decimal,
  hra: Decimal,
  attendanceBonus: Decimal,
  overtime: Decimal,
  otherEarnings: Decimal,
  pfEnabled: boolean,
  pfRate: number | null | undefined,
  wageComponents?: Record<string, boolean>
): { pfBase: Decimal; pfRateApplied: Decimal; pfAmount: Decimal } => {
  if (!pfEnabled) {
    return {
      pfBase: new Decimal(0),
      pfRateApplied: new Decimal(0),
      pfAmount: new Decimal(0),
    };
  }

  // Strict rule: If PF is enabled, configuration must be valid. Never silently set PF = 0!
  if (pfRate === null || pfRate === undefined || isNaN(pfRate) || pfRate <= 0) {
    throw new PayrollConfigurationError(
      'PF configuration is required to calculate payroll',
      'PF_CONFIGURATION_ERROR',
      ['pf_rate is missing, disabled or invalid while pf_enabled is TRUE']
    );
  }

  const rate = new Decimal(pfRate);
  let base = new Decimal(0);

  if (wageComponents) {
    if (wageComponents.basic !== false) base = base.plus(basic);
    if (wageComponents.da !== false) base = base.plus(da);
    if (wageComponents.conveyance !== false) base = base.plus(conveyance);
    if (wageComponents.hra === true) base = base.plus(hra);
    if (wageComponents.attendance_bonus === true) base = base.plus(attendanceBonus);
    if (wageComponents.overtime === true) base = base.plus(overtime);
    if (wageComponents.other_earnings === true) base = base.plus(otherEarnings);
  } else {
    // Default standard project formula: Basic + DA + Conveyance
    base = basic.plus(da).plus(conveyance);
  }

  const pfAmount = base.times(rate).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    pfBase: base.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    pfRateApplied: rate,
    pfAmount,
  };
};

/**
 * Calculates ESIC contribution according to project business policy.
 * ESIC Base = Basic + DA + Conveyance + HRA + Attendance Bonus + Overtime + Other Earnings
 * Default ESIC Rate = 0.75%
 * Wage ceiling threshold: default ₹21,000
 */
export const calculateESIC = (
  basic: Decimal,
  da: Decimal,
  conveyance: Decimal,
  hra: Decimal,
  attendanceBonus: Decimal,
  overtime: Decimal,
  otherEarnings: Decimal,
  grossSalary: Decimal,
  esicEnabled: boolean,
  esicRate: number | null | undefined,
  threshold: number | null | undefined,
  wageComponents?: Record<string, boolean>,
  isContributionPeriodContinuation?: boolean
): { esicBase: Decimal; esicRateApplied: Decimal; esicAmount: Decimal } => {
  if (!esicEnabled) {
    return {
      esicBase: new Decimal(0),
      esicRateApplied: new Decimal(0),
      esicAmount: new Decimal(0),
    };
  }

  const wageCeiling = new Decimal(threshold ?? 21000);

  // If gross salary exceeds statutory ceiling and employee is NOT in an active 6-month contribution continuation period, exempt
  if (grossSalary.greaterThan(wageCeiling) && !isContributionPeriodContinuation) {
    return {
      esicBase: new Decimal(0),
      esicRateApplied: new Decimal(0),
      esicAmount: new Decimal(0),
    };
  }

  const rate = new Decimal(esicRate ?? 0.75);
  let base = new Decimal(0);

  if (wageComponents) {
    if (wageComponents.basic !== false) base = base.plus(basic);
    if (wageComponents.da !== false) base = base.plus(da);
    if (wageComponents.conveyance !== false) base = base.plus(conveyance);
    if (wageComponents.hra !== false) base = base.plus(hra);
    if (wageComponents.attendance_bonus !== false) base = base.plus(attendanceBonus);
    if (wageComponents.overtime !== false) base = base.plus(overtime);
    if (wageComponents.other_earnings !== false) base = base.plus(otherEarnings);
  } else {
    // Default project formula: Basic + DA + Conveyance + HRA + Attendance Bonus + Overtime + Other Earnings
    base = basic
      .plus(da)
      .plus(conveyance)
      .plus(hra)
      .plus(attendanceBonus)
      .plus(overtime)
      .plus(otherEarnings);
  }

  const esicAmount = base.times(rate).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    esicBase: base.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    esicRateApplied: rate,
    esicAmount,
  };
};

/**
 * Calculates Loss of Pay (LOP) based on attendance and working days.
 * Daily Salary = Monthly Salary / Working Days
 * LOP = Daily Salary * LOP Days
 */
export const calculateLOP = (
  monthlySalary: Decimal,
  workingDays: number,
  lopDays: number
): { dailySalary: Decimal; lopAmount: Decimal } => {
  if (workingDays <= 0 || lopDays <= 0) {
    return {
      dailySalary: workingDays > 0 ? monthlySalary.dividedBy(workingDays).toDecimalPlaces(2) : new Decimal(0),
      lopAmount: new Decimal(0),
    };
  }

  const daysCount = new Decimal(workingDays);
  const unpaidDays = new Decimal(lopDays);
  const dailySalary = monthlySalary.dividedBy(daysCount).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  const lopAmount = dailySalary.times(unpaidDays).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    dailySalary: dailySalary.toDecimalPlaces(2),
    lopAmount,
  };
};

/**
 * Main calculation engine: orchestrates authoritative payroll calculation.
 * All computations use Decimal for full financial accuracy.
 */
export const computeFullPayroll = (input: PayrollCalculationInput): FullPayrollCalculationResult => {
  // 1. Fixed Salary Structure
  const structure = computeSalaryStructure({
    monthlySalary: input.monthlySalary,
    basicPercentage: input.basicPercentage,
    daPercentage: input.daPercentage,
    conveyancePercentage: input.conveyancePercentage,
    hraPercentage: input.hraPercentage,
  });

  const basic = new Decimal(structure.basicSalary);
  const da = new Decimal(structure.da);
  const conveyance = new Decimal(structure.conveyance);
  const hra = new Decimal(structure.hra);
  const fixedGross = new Decimal(structure.fixedGross);

  // Resolve Calendar Days (28/29/30/31) and Configured Salary Divisor
  const resolvedDivisor = resolvePayrollSalaryDivisor({
    month: input.payrollMonth,
    year: input.payrollYear,
    divisorMode: input.salaryDivisorMode || 'FIXED_DAYS',
    fixedDivisorDays: input.customSalaryDivisor || input.attendance.workingDays || input.settings.standardWorkingDays || 26,
  });

  // 2. Additional Earnings & Enterprise Overtime Calculation
  const attBonus = new Decimal(input.earnings?.attendanceBonus ?? 0);

  const otHours = new Decimal(input.earnings?.overtimeHours ?? 0);
  let otRate = new Decimal(input.earnings?.overtimeRate ?? 0);
  let otAmount = new Decimal(input.earnings?.overtimeAmount ?? 0);

  if (otAmount.isZero() && otHours.greaterThan(0)) {
    if (input.earnings?.overtimeWageBase || input.earnings?.overtimeMultiplier) {
      const enterpriseOt = calculateEnterpriseOvertimeRateAndAmount({
        approvedHours: otHours.toNumber(),
        wageBaseMode: input.earnings?.overtimeWageBase || (otRate.greaterThan(0) ? 'FIXED_HOURLY' : 'GROSS'),
        basicSalary: basic.toNumber(),
        grossSalary: fixedGross.toNumber(),
        monthlyCtc: input.monthlySalary,
        fixedHourlyRate: otRate.toNumber() || 100,
        divisorDays: resolvedDivisor.divisorDays,
        dailyPaidHours: input.earnings?.standardShiftHours || 9,
        multiplier: input.earnings?.overtimeMultiplier || '1x Salary',
      });
      otRate = new Decimal(enterpriseOt.hourlyRate);
      otAmount = new Decimal(enterpriseOt.calculatedAmount);
    } else if (otRate.greaterThan(0)) {
      otAmount = otHours.times(otRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    }
  }

  const bonus = new Decimal(input.earnings?.bonus ?? 0);
  const incentive = new Decimal(input.earnings?.incentive ?? 0);
  const commission = new Decimal(input.earnings?.commission ?? 0);
  const otherEarnings = new Decimal(input.earnings?.otherEarnings ?? 0);

  // Dynamic component eligibility evaluation
  const eligibilityCtx: EmployeeSalaryEligibilityContext = {
    id: input.employeeContext?.id || input.employeeId,
    employeeId: input.employeeId,
    monthlyCtc: input.monthlySalary,
    basicSalary: basic.toNumber(),
    grossSalary: fixedGross.toNumber(),
    withPf: input.withPf !== undefined ? input.withPf : true,
    payrollMonth: input.payrollMonth,
    payrollYear: input.payrollYear,
    isContributionPeriodContinuation: input.employeeContext?.isContributionPeriodContinuation,
    ...(input.employeeContext || {}),
  };

  let customEarningsSum = new Decimal(0);
  const customEarningsBreakdown: CalculationBreakdownItem[] = [];

  const configured = input.configuredComponents || [];
  const baseCodes = new Set(['BASIC', 'DA', 'HRA', 'CONV', 'CONVEYANCE']);

  // Evaluate custom earnings
  for (const comp of configured) {
    if (comp.type !== 'EARNING' || !comp.active) continue;
    const code = (comp.code || '').toUpperCase().trim();
    if (baseCodes.has(code)) continue;

    if (isComponentEligible(comp, eligibilityCtx)) {
      let amount = new Decimal(0);
      if (comp.calculationMethod === 'FIXED_AMOUNT') {
        amount = new Decimal(comp.defaultValue || 0);
      } else if (comp.calculationMethod === 'PERCENTAGE') {
        const baseVal = comp.percentageBase === 'BASIC'
          ? basic
          : (comp.percentageBase === 'GROSS' ? fixedGross : new Decimal(input.monthlySalary));
        amount = baseVal.times(comp.defaultValue || 0).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      }
      if (amount.greaterThan(0)) {
        customEarningsSum = customEarningsSum.plus(amount);
        customEarningsBreakdown.push({
          name: comp.name,
          category: 'EARNING',
          amount: amount.toNumber(),
          description: comp.calculationMethod === 'PERCENTAGE'
            ? `${comp.defaultValue}% of ${comp.percentageBase || 'CTC'}`
            : `Fixed ₹${comp.defaultValue}`
        });
      }
    }
  }

  // Gross Earnings = Fixed Gross + Attendance Bonus + OT + Bonus + Incentive + Commission + Other + Custom Earnings
  const grossSalary = fixedGross
    .plus(attBonus)
    .plus(otAmount)
    .plus(bonus)
    .plus(incentive)
    .plus(commission)
    .plus(otherEarnings)
    .plus(customEarningsSum)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  eligibilityCtx.grossSalary = grossSalary.toNumber();

  // 3. Statutory Deductions (PF & ESIC)
  // New employees under 6 months have no PF/ESIC deductions (withPf: false).
  // Confirmed employees (withPf: true) have active PF (12%) and ESIC (0.75%).
  const isPfEligible = input.withPf !== undefined ? input.withPf : true;
  const pfEnabled = isPfEligible && input.settings.pfEnabled;
  const esicEnabled = isPfEligible && input.settings.esicEnabled;

  const pfResult = calculatePF(
    basic,
    da,
    conveyance,
    hra,
    attBonus,
    otAmount,
    otherEarnings,
    pfEnabled,
    input.settings.pfRate,
    input.settings.pfWageComponents
  );

  // 4. Statutory Deductions (ESIC)
  const esicResult = calculateESIC(
    basic,
    da,
    conveyance,
    hra,
    attBonus,
    otAmount,
    otherEarnings,
    grossSalary,
    esicEnabled,
    input.settings.esicRate,
    input.settings.esicSalaryThreshold,
    input.settings.esicWageComponents,
    input.employeeContext?.isContributionPeriodContinuation
  );

  // 5. Professional Tax (PT)
  let ptAmount = new Decimal(0);
  if (input.settings.professionalTaxEnabled) {
    ptAmount = new Decimal(input.settings.professionalTaxAmount ?? 200).toDecimalPlaces(2);
  }

  // 6. LOP / Attendance Deductions (using configured salary divisor when specified)
  const workingDays = input.salaryDivisorMode
    ? resolvedDivisor.divisorDays
    : (input.attendance.workingDays || input.settings.standardWorkingDays || 26);
  const lopDays = input.attendance.lopDays || (input.attendance.unpaidLeaveDays + input.attendance.absentDays) || 0;

  const lopResult = calculateLOP(new Decimal(input.monthlySalary), workingDays, lopDays);

  // 7. Advance Loan Recovery & Other Deductions
  const advanceRecovery = new Decimal(input.deductions?.advanceRecovery ?? 0);
  const loanRecovery = new Decimal(input.deductions?.loanRecovery ?? 0);
  const otherDeductions = new Decimal(input.deductions?.otherDeductions ?? 0);

  // Evaluate custom eligible deductions
  let customDeductionsSum = new Decimal(0);
  const customDeductionsBreakdown: CalculationBreakdownItem[] = [];

  const statutoryCodes = new Set(['PF', 'EPF', 'ERF', 'ESIC', 'ESI', 'PT', 'PROFESSIONAL_TAX']);

  for (const comp of configured) {
    if (comp.type !== 'DEDUCTION' || !comp.active) continue;
    const code = (comp.code || '').toUpperCase().trim();
    if (statutoryCodes.has(code) && comp.isStatutory) continue;

    if (isComponentEligible(comp, eligibilityCtx)) {
      let amount = new Decimal(0);
      if (comp.calculationMethod === 'FIXED_AMOUNT') {
        amount = new Decimal(comp.defaultValue || 0);
      } else if (comp.calculationMethod === 'PERCENTAGE') {
        const baseVal = comp.percentageBase === 'BASIC'
          ? basic
          : (comp.percentageBase === 'CTC' ? new Decimal(input.monthlySalary) : grossSalary);
        amount = baseVal.times(comp.defaultValue || 0).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      }
      if (amount.greaterThan(0)) {
        customDeductionsSum = customDeductionsSum.plus(amount);
        customDeductionsBreakdown.push({
          name: comp.name,
          category: 'DEDUCTION',
          amount: amount.toNumber(),
          description: comp.calculationMethod === 'PERCENTAGE'
            ? `${comp.defaultValue}% of ${comp.percentageBase || 'GROSS'}`
            : `Fixed ₹${comp.defaultValue}`
        });
      }
    }
  }

  // Total Deductions = PF + ESIC + PT + LOP + Advance + Loan + Other + Custom Deductions
  const totalDeductions = pfResult.pfAmount
    .plus(esicResult.esicAmount)
    .plus(ptAmount)
    .plus(lopResult.lopAmount)
    .plus(advanceRecovery)
    .plus(loanRecovery)
    .plus(otherDeductions)
    .plus(customDeductionsSum)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // Final Net Salary = Gross Earnings - Total Deductions
  const netSalary = grossSalary.minus(totalDeductions).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // Breakdown items for transparency & UI
  const earningsBreakdown: CalculationBreakdownItem[] = [
    { name: 'Basic Salary', category: 'EARNING', amount: basic.toNumber(), description: `${input.basicPercentage}% of Monthly Salary` },
    { name: 'Dearness Allowance (DA)', category: 'EARNING', amount: da.toNumber(), description: `${input.daPercentage}% of Monthly Salary` },
    { name: 'Conveyance Allowance', category: 'EARNING', amount: conveyance.toNumber(), description: `${input.conveyancePercentage}% of Monthly Salary` },
    { name: 'House Rent Allowance (HRA)', category: 'EARNING', amount: hra.toNumber(), description: `${input.hraPercentage}% of Monthly Salary` },
  ];

  if (attBonus.greaterThan(0)) {
    earningsBreakdown.push({ name: 'Attendance Bonus', category: 'EARNING', amount: attBonus.toNumber() });
  }
  if (otAmount.greaterThan(0)) {
    earningsBreakdown.push({ name: 'Approved Overtime', category: 'EARNING', amount: otAmount.toNumber(), description: `${otHours.toString()} hrs @ ₹${otRate.toString()}/hr` });
  }
  if (bonus.greaterThan(0)) {
    earningsBreakdown.push({ name: 'Bonus', category: 'EARNING', amount: bonus.toNumber() });
  }
  if (incentive.greaterThan(0)) {
    earningsBreakdown.push({ name: 'Performance Incentive', category: 'EARNING', amount: incentive.toNumber() });
  }
  if (commission.greaterThan(0)) {
    earningsBreakdown.push({ name: 'Sales Commission', category: 'EARNING', amount: commission.toNumber() });
  }
  if (otherEarnings.greaterThan(0)) {
    earningsBreakdown.push({ name: 'Other Earnings', category: 'EARNING', amount: otherEarnings.toNumber() });
  }

  // Append custom eligible earnings to breakdown
  earningsBreakdown.push(...customEarningsBreakdown);

  const deductionsBreakdown: CalculationBreakdownItem[] = [];

  if (pfResult.pfAmount.greaterThan(0)) {
    deductionsBreakdown.push({
      name: 'Provident Fund (EPF)',
      category: 'DEDUCTION',
      amount: pfResult.pfAmount.toNumber(),
      description: `${pfResult.pfRateApplied.toString()}% on Base ₹${pfResult.pfBase.toString()}`,
    });
  }

  if (esicResult.esicAmount.greaterThan(0)) {
    deductionsBreakdown.push({
      name: 'ESIC Employee Contribution',
      category: 'DEDUCTION',
      amount: esicResult.esicAmount.toNumber(),
      description: `${esicResult.esicRateApplied.toString()}% on Base ₹${esicResult.esicBase.toString()}`,
    });
  }

  if (ptAmount.greaterThan(0)) {
    deductionsBreakdown.push({ name: 'Professional Tax (PT)', category: 'DEDUCTION', amount: ptAmount.toNumber() });
  }

  if (lopResult.lopAmount.greaterThan(0)) {
    deductionsBreakdown.push({
      name: 'Loss of Pay (LOP)',
      category: 'DEDUCTION',
      amount: lopResult.lopAmount.toNumber(),
      description: `${lopDays} days @ ₹${lopResult.dailySalary.toString()}/day`,
    });
  }

  if (advanceRecovery.greaterThan(0)) {
    deductionsBreakdown.push({ name: 'Advance Salary Recovery', category: 'DEDUCTION', amount: advanceRecovery.toNumber() });
  }

  if (loanRecovery.greaterThan(0)) {
    deductionsBreakdown.push({ name: 'Loan Recovery (EMI)', category: 'DEDUCTION', amount: loanRecovery.toNumber() });
  }

  if (otherDeductions.greaterThan(0)) {
    deductionsBreakdown.push({ name: 'Other Deductions', category: 'DEDUCTION', amount: otherDeductions.toNumber() });
  }

  // Append custom eligible deductions to breakdown
  deductionsBreakdown.push(...customDeductionsBreakdown);

  return {
    employeeId: input.employeeId,
    payrollMonth: input.payrollMonth,
    payrollYear: input.payrollYear,
    withPf: isPfEligible,

    monthlySalary: structure.monthlySalary,
    basicSalary: basic.toNumber(),
    da: da.toNumber(),
    conveyance: conveyance.toNumber(),
    hra: hra.toNumber(),
    fixedGross: fixedGross.toNumber(),

    attendanceBonus: attBonus.toNumber(),
    overtimeHours: otHours.toNumber(),
    overtimeRate: otRate.toNumber(),
    overtimeAmount: otAmount.toNumber(),
    bonus: bonus.toNumber(),
    incentive: incentive.toNumber(),
    commission: commission.toNumber(),
    otherEarnings: otherEarnings.toNumber(),
    grossSalary: grossSalary.toNumber(),

    pfBase: pfResult.pfBase.toNumber(),
    pfRate: pfResult.pfRateApplied.toNumber(),
    pfAmount: pfResult.pfAmount.toNumber(),

    esicBase: esicResult.esicBase.toNumber(),
    esicRate: esicResult.esicRateApplied.toNumber(),
    esicAmount: esicResult.esicAmount.toNumber(),

    professionalTax: ptAmount.toNumber(),

    workingDays,
    calendarDaysInMonth: resolvedDivisor.calendarDays,
    salaryDivisorUsed: resolvedDivisor.divisorDays,
    salaryDivisorMode: resolvedDivisor.modeUsed,
    presentDays: input.attendance.presentDays,
    lopDays,
    dailySalary: lopResult.dailySalary.toNumber(),
    lopAmount: lopResult.lopAmount.toNumber(),

    advanceRecovery: advanceRecovery.toNumber(),
    loanRecovery: loanRecovery.toNumber(),
    otherDeductions: otherDeductions.toNumber(),

    totalDeductions: totalDeductions.toNumber(),
    netSalary: netSalary.toNumber(),

    earningsBreakdown,
    deductionsBreakdown,
  };
};
