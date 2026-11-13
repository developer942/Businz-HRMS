// VRM Enterprise HRMS - Attendance & Overtime Calculation Engine
// Strictly computes worked hours, break deductions, potential/approved OT, late/early flags, salary impact & monthly summaries

import { AttendanceRecord, Employee } from '../types/hrms';
import {
  ShiftModel,
  OvertimePolicy,
  DepartmentOtPolicy,
  EmployeeOtPolicy,
  AttendancePolicyConfig,
  SalaryImpactSummary,
  MonthlyAttendanceSummary,
  OvertimeRequest,
  OvertimeMultiplierType,
  OtRateType,
  OtWageBaseMode,
  OtSalaryDivisorMode
} from '../types/attendanceEnterprise';
import { PayrollSettingsConfig } from '../types/settings';

/**
 * Parses time string (e.g. "09:00 AM", "07:15 PM", "09:30", "18:45") into total minutes from midnight.
 */
export function parseTimeToMinutes(timeStr?: string | null): number | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  let clean = timeStr.trim();
  if (!clean || clean === '--:--' || clean === '-' || clean === 'N/A' || clean === '—') return null;

  // Normalize potential typing mistakes like 10;30 AM or 10.00 AM
  clean = clean.replace(/^(\d{1,2})[;.](\d{2})/, '$1:$2');

  // Handle full ISO datetime string (e.g. 2026-10-06T12:48:30.277+00:00)
  if (clean.includes('T') || clean.includes('Z') || (clean.includes('-') && clean.includes(':'))) {
    let parsed: Date;
    if (clean.endsWith('Z') || clean.includes('+') || /-[0-9]{2}:?[0-9]{2}$/.test(clean)) {
      parsed = new Date(clean);
    } else {
      parsed = new Date(clean.includes('T') ? (clean.endsWith('Z') ? clean : clean + 'Z') : clean.replace(/\s+/, 'T') + 'Z');
    }
    if (!isNaN(parsed.getTime())) {
      const istStr = parsed.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const parts = istStr.split(':').map(Number);
      let h = parts[0];
      if (h === 24) h = 0;
      return h * 60 + parts[1];
    }
  }

  const match = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridian = match[3]?.toUpperCase();

  if (meridian) {
    if (meridian === 'PM' && hours < 12) hours += 12;
    if (meridian === 'AM' && hours === 12) hours = 0;
  }

  return hours * 60 + minutes;
}

/**
 * Formats decimal hours (e.g. 10.08) into standard enterprise display: "10h 05m"
 */
export function formatHoursAndMinutes(hoursVal: number): string {
  if (!hoursVal || isNaN(hoursVal) || hoursVal <= 0) return '0h 00m';
  const totalMinutes = Math.round(hoursVal * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * Checks whether a department is eligible for Overtime by default when not explicitly configured.
 * Requirement 2 & 3: FLOOR and Dispatch Loading are eligible by default; other departments
 * remain restricted from automatic overtime approval unless enabled by HR/CEO or employee exception.
 */
export function isDefaultOtEligibleDepartment(department?: string | null): boolean {
  if (!department) return false;
  const norm = department.trim().toLowerCase().replace(/\s+/g, ' ');
  return (
    norm === 'floor' ||
    norm === 'dispatch loading' ||
    norm === 'production floor'
  );
}

/**
 * Normalizes month string/number (1..12, 'January', 'Jan', '2026-02') into 1-based month number (1..12).
 */
export function parseMonthAndYear(monthInput?: string | number, fallbackYear?: number): { monthNum: number; resolvedYear?: number } {
  if (typeof monthInput === 'number' && monthInput >= 1 && monthInput <= 12) {
    return { monthNum: Math.floor(monthInput), resolvedYear: fallbackYear };
  }
  const clean = String(monthInput || '').trim();
  if (/^\d{4}-\d{2}/.test(clean)) {
    const [y, m] = clean.slice(0, 7).split('-').map(Number);
    if (m >= 1 && m <= 12) return { monthNum: m, resolvedYear: y || fallbackYear };
  }
  const num = Number(clean);
  if (Number.isFinite(num) && num >= 1 && num <= 12) {
    return { monthNum: Math.floor(num), resolvedYear: fallbackYear };
  }
  const lower = clean.toLowerCase();
  const months = [
    ['january', 'jan'],
    ['february', 'feb'],
    ['march', 'mar'],
    ['april', 'apr'],
    ['may', 'may'],
    ['june', 'jun'],
    ['july', 'jul'],
    ['august', 'aug'],
    ['september', 'sep', 'sept'],
    ['october', 'oct'],
    ['november', 'nov'],
    ['december', 'dec']
  ];
  for (let i = 0; i < months.length; i++) {
    if (months[i].some(alias => lower === alias || lower.startsWith(alias))) {
      return { monthNum: i + 1, resolvedYear: fallbackYear };
    }
  }
  return { monthNum: 8, resolvedYear: fallbackYear };
}

export function resolveMonthNumber(monthInput?: string | number, fallbackYear?: number): number {
  return parseMonthAndYear(monthInput, fallbackYear).monthNum;
}

/**
 * Requirement 4: Automatically determines whether the selected payroll month contains 28, 29, 30 or 31 days.
 * Accurately handles leap years (e.g. February 2024 & 2028 = 29 days; February 2025 & 2026 = 28 days).
 */
export function getCalendarDaysInMonth(month: string | number, year: number): 28 | 29 | 30 | 31 {
  const { monthNum, resolvedYear } = parseMonthAndYear(month, year);
  const targetYear = resolvedYear || year || new Date().getFullYear();
  const days = new Date(targetYear, monthNum, 0).getDate();
  if (days === 28 || days === 29 || days === 30 || days === 31) {
    return days;
  }
  return 30;
}

/**
 * Counts standard weekly off days (Sundays by default) in a given calendar month.
 */
export function countWeeklyOffDaysInMonth(month: string | number, year: number, weeklyOffDayIndex = 0): number {
  const { monthNum, resolvedYear } = parseMonthAndYear(month, year);
  const targetYear = resolvedYear || year || new Date().getFullYear();
  const totalDays = getCalendarDaysInMonth(monthNum, targetYear);
  let offCount = 0;
  for (let d = 1; d <= totalDays; d++) {
    if (new Date(targetYear, monthNum - 1, d).getDay() === weeklyOffDayIndex) {
      offCount++;
    }
  }
  return offCount;
}

/**
 * Requirement 5: Resolves the configured salary divisor for payroll and overtime calculations.
 * Does NOT assume that every company uses actual calendar days.
 */
export function resolvePayrollSalaryDivisor(params: {
  month: string | number;
  year: number;
  payrollConfig?: Pick<PayrollSettingsConfig, 'standardWorkingDaysPerMonth' | 'salaryDivisorMode'> | null;
  overtimePolicy?: OvertimePolicy | null;
  divisorModeOverride?: OtSalaryDivisorMode | 'FIXED_DAYS' | 'CALENDAR_DAYS' | 'WORKING_DAYS';
  divisorMode?: OtSalaryDivisorMode | 'FIXED_DAYS' | 'CALENDAR_DAYS' | 'WORKING_DAYS';
  customDivisorDays?: number;
  fixedDivisorDays?: number;
  weeklyOffDaysCount?: number;
  weeklyOffDayIndex?: number;
}): {
  calendarDaysInMonth: 28 | 29 | 30 | 31;
  calendarDays: 28 | 29 | 30 | 31;
  divisor: number;
  divisorDays: number;
  divisorMode: 'FIXED_DAYS' | 'CALENDAR_DAYS' | 'WORKING_DAYS';
  modeUsed: 'FIXED_DAYS' | 'CALENDAR_DAYS' | 'WORKING_DAYS';
  label: string;
} {
  const {
    month,
    year,
    payrollConfig,
    overtimePolicy,
    divisorModeOverride,
    divisorMode,
    customDivisorDays,
    fixedDivisorDays,
    weeklyOffDaysCount,
    weeklyOffDayIndex
  } = params;

  const calendarDaysInMonth = getCalendarDaysInMonth(month, year);
  const configuredFixedDays = fixedDivisorDays && fixedDivisorDays > 0
    ? fixedDivisorDays
    : (payrollConfig?.standardWorkingDaysPerMonth && payrollConfig.standardWorkingDaysPerMonth > 0
      ? payrollConfig.standardWorkingDaysPerMonth
      : (overtimePolicy?.customDivisorDays && overtimePolicy.customDivisorDays > 0 ? overtimePolicy.customDivisorDays : 26));

  const rawOverride = divisorModeOverride || divisorMode || overtimePolicy?.divisorMode;
  const effectiveMode = rawOverride && rawOverride !== 'COMPANY_DIVISOR'
    ? rawOverride
    : (payrollConfig?.salaryDivisorMode || 'FIXED_DAYS');

  const buildResult = (
    divisorVal: number,
    modeVal: 'FIXED_DAYS' | 'CALENDAR_DAYS' | 'WORKING_DAYS',
    labelVal: string
  ) => ({
    calendarDaysInMonth,
    calendarDays: calendarDaysInMonth,
    divisor: divisorVal,
    divisorDays: divisorVal,
    divisorMode: modeVal,
    modeUsed: modeVal,
    label: labelVal
  });

  if (effectiveMode === 'CALENDAR_DAYS') {
    return buildResult(calendarDaysInMonth, 'CALENDAR_DAYS', `Actual Calendar Days (${calendarDaysInMonth} days)`);
  }

  if (effectiveMode === 'WORKING_DAYS') {
    const offs = weeklyOffDaysCount !== undefined
      ? weeklyOffDaysCount
      : countWeeklyOffDaysInMonth(month, year, weeklyOffDayIndex ?? 0);
    const workingDivisor = Math.max(1, calendarDaysInMonth - offs);
    return buildResult(
      workingDivisor,
      'WORKING_DAYS',
      `Working Days (${workingDivisor} days = ${calendarDaysInMonth} cal - ${offs} week-offs)`
    );
  }

  if (effectiveMode === 'FIXED_26') {
    return buildResult(26, 'FIXED_DAYS', 'Fixed 26 Days');
  }

  if (effectiveMode === 'FIXED_30') {
    return buildResult(30, 'FIXED_DAYS', 'Fixed 30 Days');
  }

  const effectiveCustomDays = customDivisorDays || fixedDivisorDays || overtimePolicy?.customDivisorDays;
  if (effectiveMode === 'CUSTOM_DAYS' && effectiveCustomDays && effectiveCustomDays > 0) {
    return buildResult(effectiveCustomDays, 'FIXED_DAYS', `Custom Divisor (${effectiveCustomDays} days)`);
  }

  return buildResult(configuredFixedDays, 'FIXED_DAYS', `Configured Divisor (${configuredFixedDays} days)`);
}

/**
 * Requirement 13: Resolves an employee's department as of a specific attendance date,
 * supporting mid-month or backdated employee department transfers.
 */
export function resolveEmployeeDepartmentForDate(
  empOrCurrentDepartment: string | { department?: string; departmentHistory?: { department?: string; departmentName?: string; effectiveFrom: string; effectiveTo?: string }[] },
  attendanceDate?: string,
  departmentHistory?: { department?: string; departmentName?: string; effectiveFrom: string; effectiveTo?: string }[]
): string {
  const currentDepartment =
    typeof empOrCurrentDepartment === 'string'
      ? empOrCurrentDepartment
      : (empOrCurrentDepartment?.department || 'General');
  const historyList =
    departmentHistory ||
    (typeof empOrCurrentDepartment === 'object' && empOrCurrentDepartment !== null
      ? empOrCurrentDepartment.departmentHistory
      : undefined);

  if (!attendanceDate || !Array.isArray(historyList) || historyList.length === 0) {
    return currentDepartment;
  }
  const targetIso = String(attendanceDate).slice(0, 10);
  const sorted = [...historyList].sort((a, b) =>
    String(b.effectiveFrom || '').localeCompare(String(a.effectiveFrom || ''))
  );
  const matched = sorted.find(entry => {
    const start = String(entry.effectiveFrom || '').slice(0, 10);
    const end = entry.effectiveTo ? String(entry.effectiveTo).slice(0, 10) : '';
    if (start && targetIso < start) return false;
    if (end && targetIso > end) return false;
    return true;
  });
  return matched?.department || matched?.departmentName || currentDepartment;
}

/**
 * Helper to check if an effective-dated policy applies on a given date (YYYY-MM-DD).
 */
export function isPolicyEffectiveOnDate(
  policy: { effectiveFrom?: string; effectiveTo?: string },
  targetDate?: string
): boolean {
  if (!targetDate) return true;
  const iso = String(targetDate).slice(0, 10);
  if (policy.effectiveFrom && iso < String(policy.effectiveFrom).slice(0, 10)) {
    return false;
  }
  if (policy.effectiveTo && iso > String(policy.effectiveTo).slice(0, 10)) {
    return false;
  }
  return true;
}

/**
 * Resolves an employee's Overtime Eligibility taking into account:
 * 1. Individual Exception ('Follow Department Policy' | 'Allow OT' | 'Block OT')
 * 2. Statutory Entitlement (empPolicy.statutoryEntitlement or options.statutoryEntitlement)
 * 3. Effective-dated Department-level policy (with historical department lookup on attendanceDate)
 * 4. Default company rule: FLOOR and Dispatch Loading eligible; other departments restricted unless enabled.
 */
export interface ResolvedOtEligibilityResult {
  isEligible: boolean;
  allowed: boolean;
  eligible: boolean;
  reason: string;
  maxDailyOt: number;
  maxMonthlyOt: number;
  minOtDurationMinutes: number;
  standardShiftHours: number;
  otHourlyRate: number;
  wageBase: OtWageBaseMode;
  divisorMode: OtSalaryDivisorMode;
  defaultMultiplier: OvertimeMultiplierType;
  resolvedDepartment: string;
  departmentName: string;
  source: 'Individual Exception' | 'Statutory Entitlement' | 'Department Policy' | 'Default' | 'Blocked';
  eligibilitySource: 'Individual Exception' | 'Statutory Entitlement' | 'Department Policy' | 'Default' | 'Blocked';
}

export function resolveEmployeeOtEligibility(
  empOrIdOrParams:
    | string
    | {
        id?: string;
        employeeId?: string;
        department?: string;
        departmentHistory?: { department?: string; departmentName?: string; effectiveFrom: string; effectiveTo?: string }[];
        statutoryOtEntitled?: boolean;
        employee?: {
          id?: string;
          employeeId?: string;
          department?: string;
          departmentHistory?: { department?: string; departmentName?: string; effectiveFrom: string; effectiveTo?: string }[];
          statutoryOtEntitled?: boolean;
        };
        departmentName?: string;
        dateStr?: string;
        departmentOtPolicies?: DepartmentOtPolicy[];
        employeeOtPolicies?: EmployeeOtPolicy[];
        overtimePolicy?: OvertimePolicy;
      },
  departmentOrDeptPolicies?: string | DepartmentOtPolicy[],
  deptPoliciesOrEmpPolicies?: DepartmentOtPolicy[] | EmployeeOtPolicy[],
  empPoliciesOrOtPolicy?: EmployeeOtPolicy[] | OvertimePolicy,
  optionsOrDateStr?:
    | string
    | {
        attendanceDate?: string;
        departmentHistory?: { department?: string; departmentName?: string; effectiveFrom: string; effectiveTo?: string }[];
        statutoryEntitlement?: boolean;
      }
): ResolvedOtEligibilityResult {
  let employeeId = '';
  let department = 'General';
  let deptPolicies: DepartmentOtPolicy[] = [];
  let empPolicies: EmployeeOtPolicy[] = [];
  let attendanceDate: string | undefined;
  let departmentHistory: { department?: string; departmentName?: string; effectiveFrom: string; effectiveTo?: string }[] | undefined;
  let statutoryEntitlement: boolean | undefined;

  if (typeof empOrIdOrParams === 'string') {
    employeeId = empOrIdOrParams;
    department = typeof departmentOrDeptPolicies === 'string' ? departmentOrDeptPolicies : 'General';
    deptPolicies = Array.isArray(deptPoliciesOrEmpPolicies) ? (deptPoliciesOrEmpPolicies as DepartmentOtPolicy[]) : [];
    empPolicies = Array.isArray(empPoliciesOrOtPolicy) ? (empPoliciesOrOtPolicy as EmployeeOtPolicy[]) : [];
    if (typeof optionsOrDateStr === 'string') {
      attendanceDate = optionsOrDateStr;
    } else if (optionsOrDateStr) {
      attendanceDate = optionsOrDateStr.attendanceDate;
      departmentHistory = optionsOrDateStr.departmentHistory;
      statutoryEntitlement = optionsOrDateStr.statutoryEntitlement;
    }
  } else if (empOrIdOrParams && ('departmentOtPolicies' in empOrIdOrParams || 'dateStr' in empOrIdOrParams || 'employee' in empOrIdOrParams)) {
    const innerEmp = empOrIdOrParams.employee || empOrIdOrParams;
    employeeId = innerEmp.employeeId || innerEmp.id || '';
    department = empOrIdOrParams.departmentName || innerEmp.department || 'General';
    deptPolicies = empOrIdOrParams.departmentOtPolicies || [];
    empPolicies = empOrIdOrParams.employeeOtPolicies || [];
    attendanceDate = empOrIdOrParams.dateStr;
    departmentHistory = innerEmp.departmentHistory;
    statutoryEntitlement = innerEmp.statutoryOtEntitled;
  } else if (empOrIdOrParams) {
    employeeId = empOrIdOrParams.employeeId || empOrIdOrParams.id || '';
    department = empOrIdOrParams.department || 'General';
    departmentHistory = empOrIdOrParams.departmentHistory;
    statutoryEntitlement = empOrIdOrParams.statutoryOtEntitled;
    deptPolicies = Array.isArray(departmentOrDeptPolicies) ? departmentOrDeptPolicies : [];
    empPolicies = Array.isArray(deptPoliciesOrEmpPolicies) ? (deptPoliciesOrEmpPolicies as EmployeeOtPolicy[]) : [];
    if (typeof optionsOrDateStr === 'string') {
      attendanceDate = optionsOrDateStr;
    } else if (typeof empPoliciesOrOtPolicy === 'string') {
      attendanceDate = empPoliciesOrOtPolicy;
    } else if (optionsOrDateStr && typeof optionsOrDateStr === 'object') {
      attendanceDate = optionsOrDateStr.attendanceDate;
      if (optionsOrDateStr.departmentHistory) departmentHistory = optionsOrDateStr.departmentHistory;
      if (optionsOrDateStr.statutoryEntitlement !== undefined) statutoryEntitlement = optionsOrDateStr.statutoryEntitlement;
    }
  }

  const resolvedDepartment = resolveEmployeeDepartmentForDate(
    department || 'General',
    attendanceDate,
    departmentHistory
  );

  const matchingEmpPolicies = (empPolicies || [])
    .filter(p => p.employeeId && p.employeeId.trim().toLowerCase() === employeeId.trim().toLowerCase())
    .filter(p => isPolicyEffectiveOnDate(p, attendanceDate))
    .sort((a, b) => String(b.effectiveFrom || '').localeCompare(String(a.effectiveFrom || '')));
  const empPolicy = matchingEmpPolicies[0];

  const matchingDeptPolicies = (deptPolicies || [])
    .filter(p => {
      const dName = p.department || (p as any).departmentName || '';
      return dName.trim().toLowerCase() === resolvedDepartment.trim().toLowerCase();
    })
    .filter(p => isPolicyEffectiveOnDate(p, attendanceDate))
    .sort((a, b) => String(b.effectiveFrom || '').localeCompare(String(a.effectiveFrom || '')));
  const deptPolicy = matchingDeptPolicies[0];

  const normalizeOtAllowed = (value: unknown, fallback = false): boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['no', 'false', '0', 'off', 'disabled'].includes(normalized)) return false;
      if (['yes', 'true', '1', 'on', 'enabled'].includes(normalized)) return true;
    }
    return fallback;
  };

  const baseShiftHours = deptPolicy?.standardShiftHours || 9;
  const baseHourlyRate = empPolicy?.customHourlyRate ?? deptPolicy?.otHourlyRate ?? 100;
  const baseWageBase: OtWageBaseMode = empPolicy?.customWageBase || deptPolicy?.wageBase || 'FIXED_HOURLY';
  const baseDivisorMode: OtSalaryDivisorMode = deptPolicy?.divisorMode || 'COMPANY_DIVISOR';
  const baseMultiplier: OvertimeMultiplierType = empPolicy?.customMultiplier || deptPolicy?.defaultMultiplier || '1x Salary';
  const baseMinMins = empPolicy?.minOtDurationMinutes ?? deptPolicy?.minOtDurationMinutes ?? 30;

  const makeOut = (
    isElig: boolean,
    reasonText: string,
    maxD: number,
    maxM: number,
    src: 'Individual Exception' | 'Statutory Entitlement' | 'Department Policy' | 'Default' | 'Blocked'
  ): ResolvedOtEligibilityResult => ({
    isEligible: isElig,
    allowed: isElig,
    eligible: isElig,
    reason: reasonText,
    maxDailyOt: maxD,
    maxMonthlyOt: maxM,
    minOtDurationMinutes: baseMinMins,
    standardShiftHours: baseShiftHours,
    otHourlyRate: baseHourlyRate,
    wageBase: baseWageBase,
    divisorMode: baseDivisorMode,
    defaultMultiplier: baseMultiplier,
    resolvedDepartment,
    departmentName: resolvedDepartment,
    source: src,
    eligibilitySource: src
  });

  const effectiveException = empPolicy?.individualException || empPolicy?.individualOtException;

  // 1. Check explicit Individual Block first
  if (empPolicy && effectiveException === 'Block OT') {
    return makeOut(false, 'Overtime blocked by Individual Employee Exception', 0, 0, 'Blocked');
  }

  // 2. Check Statutory Entitlement (Requirement 3)
  if (empPolicy?.statutoryEntitlement === true || statutoryEntitlement === true) {
    return makeOut(
      true,
      `Overtime eligible under Statutory Entitlement (${resolvedDepartment})`,
      empPolicy?.maxOtDaily || empPolicy?.customDailyMaxOt || deptPolicy?.maxOtHoursDaily || 4,
      empPolicy?.maxOtMonthly || empPolicy?.customMonthlyMaxOt || deptPolicy?.maxOtHoursMonthly || 60,
      'Statutory Entitlement'
    );
  }

  // 3. Check explicit Individual Allow Exception (Requirement 3)
  if (empPolicy && (effectiveException === 'Allow OT' || empPolicy.allowIndividualException === true)) {
    return makeOut(
      true,
      `Overtime granted by Individual Employee Exception (${resolvedDepartment})`,
      empPolicy.maxOtDaily || empPolicy.customDailyMaxOt || 4,
      empPolicy.maxOtMonthly || empPolicy.customMonthlyMaxOt || 60,
      'Individual Exception'
    );
  }

  // 4. Follow Department Policy
  if (deptPolicy) {
    const defaultForDept = isDefaultOtEligibleDepartment(resolvedDepartment);
    if (!normalizeOtAllowed((deptPolicy as any).otAllowed, defaultForDept)) {
      return makeOut(
        false,
        `Department (${resolvedDepartment}) is restricted from automatic overtime approval`,
        0,
        0,
        'Department Policy'
      );
    }
    return makeOut(
      true,
      `Eligible under ${resolvedDepartment} Department OT Policy`,
      deptPolicy.maxOtHoursDaily || 4,
      deptPolicy.maxOtHoursMonthly || 60,
      'Department Policy'
    );
  }

  // 5. Fallback default: Only FLOOR and Dispatch Loading are eligible by default;
  // other departments are restricted unless configured or overridden by employee policy.
  if (isDefaultOtEligibleDepartment(resolvedDepartment)) {
    return makeOut(
      true,
      `Eligible under ${resolvedDepartment} Department Default OT Policy`,
      4,
      60,
      'Department Policy'
    );
  }

  return makeOut(
    false,
    `Department (${resolvedDepartment}) is restricted from automatic overtime approval unless an employee-specific policy or statutory entitlement applies`,
    0,
    0,
    'Default'
  );
}

export interface AttendanceCalculationResult {
  grossMinutes: number;
  breakMinutes: number;
  netWorkedMinutes: number;
  workedHours: number;
  regularHours: number;
  potentialOtHours: number;
  lateMinutes: number;
  earlyCheckoutMinutes: number;
  status: AttendanceRecord['status'];
  lateStatus: 'On Time' | 'Late (<30m)' | 'Severely Late' | 'N/A';
}

/**
 * Computes exact working hours, shift comparisons, and potential OT.
 */
export function calculateAttendanceHoursAndStatus(params: {
  checkIn?: string | null;
  checkOut?: string | null;
  shift: ShiftModel;
  otPolicy?: OvertimePolicy;
  attendancePolicy?: AttendancePolicyConfig;
  isOtEligible: boolean;
  manualStatusOverride?: AttendanceRecord['status'];
}): AttendanceCalculationResult {
  const {
    checkIn,
    checkOut,
    shift,
    otPolicy,
    attendancePolicy,
    isOtEligible,
    manualStatusOverride
  } = params;

  const inMins = parseTimeToMinutes(checkIn);
  const outMins = parseTimeToMinutes(checkOut);
  const shiftStartMins = parseTimeToMinutes(shift.startTime) ?? 9 * 60; // 09:00 AM
  const shiftEndMins = parseTimeToMinutes(shift.endTime) ?? 18 * 60;    // 06:00 PM

  const graceMins = shift.gracePeriodMinutes ?? attendancePolicy?.gracePeriodMinutes ?? 10;
  const breakMins = shift.breakDurationMinutes ?? 60;
  const reqHours = shift.requiredWorkingHours ?? 9.0;
  const halfDayThreshold = attendancePolicy?.minWorkingHoursHalfDay ?? 4.5;

  // Case 1: Missing both punches
  if (inMins === null && outMins === null) {
    return {
      grossMinutes: 0,
      breakMinutes: 0,
      netWorkedMinutes: 0,
      workedHours: 0,
      regularHours: 0,
      potentialOtHours: 0,
      lateMinutes: 0,
      earlyCheckoutMinutes: 0,
      status: manualStatusOverride || 'Absent',
      lateStatus: 'N/A'
    };
  }

  // Case 2: Only Check-In present
  if (inMins !== null && outMins === null) {
    const lateMins = Math.max(0, inMins - (shiftStartMins + graceMins));
    const lateStatus = lateMins === 0 ? 'On Time' : lateMins <= 30 ? 'Late (<30m)' : 'Severely Late';
    return {
      grossMinutes: 0,
      breakMinutes: 0,
      netWorkedMinutes: 0,
      workedHours: 0,
      regularHours: 0,
      potentialOtHours: 0,
      lateMinutes: inMins > shiftStartMins ? inMins - shiftStartMins : 0,
      earlyCheckoutMinutes: 0,
      status: manualStatusOverride || 'Missing Punch',
      lateStatus
    };
  }

  // Case 3: Only Check-Out present
  if (inMins === null && outMins !== null) {
    return {
      grossMinutes: 0,
      breakMinutes: 0,
      netWorkedMinutes: 0,
      workedHours: 0,
      regularHours: 0,
      potentialOtHours: 0,
      lateMinutes: 0,
      earlyCheckoutMinutes: 0,
      status: manualStatusOverride || 'Missing Punch',
      lateStatus: 'N/A'
    };
  }

  // Case 4: Both Check-In and Check-Out present
  const checkoutTimelineMins = outMins! >= inMins! ? outMins! : outMins! + 24 * 60;
  const shiftEndTimelineMins = shiftEndMins >= shiftStartMins
    ? shiftEndMins
    : shiftEndMins + 24 * 60;
  const grossMins = checkoutTimelineMins - inMins!;
  
  // Deduct break only if worked duration exceeds standard half-shift
  const applicableBreakMins = grossMins > (breakMins + 120) ? breakMins : 0;
  const netMins = Math.max(0, grossMins - applicableBreakMins);
  const workedHours = Math.round((netMins / 60) * 100) / 100;

  // Late calculation
  const lateMinutes = inMins! > (shiftStartMins + graceMins) ? (inMins! - shiftStartMins) : 0;
  let lateStatus: AttendanceCalculationResult['lateStatus'] = 'On Time';
  if (lateMinutes > 0) {
    lateStatus = (inMins! - shiftStartMins) <= 30 ? 'Late (<30m)' : 'Severely Late';
  }

  // Early checkout calculation
  const earlyThreshold = shift.earlyCheckoutThresholdMinutes ?? 10;
  const earlyCheckoutMinutes = (checkoutTimelineMins < (shiftEndTimelineMins - earlyThreshold))
    ? (shiftEndTimelineMins - checkoutTimelineMins)
    : 0;

  // Potential OT calculation
  let potentialOtHours = 0;
  if (isOtEligible && otPolicy?.enabled !== false) {
    // OT Hours = Actual Eligible Working Hours - Required Working Hours
    const rawOtHours = Math.max(0, workedHours - reqHours);
    const minOtDurationMins = otPolicy?.minimumOtDurationMinutes ?? 30;
    const minOtHours = minOtDurationMins / 60;

    if (rawOtHours >= minOtHours) {
      const maxDaily = otPolicy?.maximumDailyOtHours ?? 4;
      potentialOtHours = Math.min(rawOtHours, maxDaily);
      potentialOtHours = Math.round(potentialOtHours * 100) / 100;
    }
  }

  const regularHours = Math.min(workedHours, reqHours);

  // Status determination
  let status: AttendanceRecord['status'] = manualStatusOverride || 'Present';
  if (!manualStatusOverride || manualStatusOverride === 'Present' || manualStatusOverride === 'Late') {
    if (workedHours < halfDayThreshold && workedHours > 0) {
      status = 'Half Day';
    } else if (lateMinutes > 0) {
      status = 'Late';
    } else {
      status = 'Present';
    }
  }

  return {
    grossMinutes: grossMins,
    breakMinutes: applicableBreakMins,
    netWorkedMinutes: netMins,
    workedHours,
    regularHours,
    potentialOtHours,
    lateMinutes,
    earlyCheckoutMinutes,
    status,
    lateStatus
  };
}

/**
 * Computes OT Salary Rate & Payout according to configured OT Salary Policy
 */
export function calculateOtSalaryAmount(params: {
  otHours: number;
  dailySalary: number;
  standardWorkingHours: number;
  otPolicy: OvertimePolicy;
  dayType?: 'Regular' | 'Weekend' | 'Holiday';
}): { hourlyRate: number; multiplier: number; otAmount: number } {
  const {
    otHours,
    dailySalary,
    standardWorkingHours,
    otPolicy,
    dayType = 'Regular'
  } = params;

  if (otHours <= 0) {
    return { hourlyRate: 0, multiplier: 1, otAmount: 0 };
  }

  const reqHours = standardWorkingHours > 0 ? standardWorkingHours : 9.0;
  let baseHourlyRate = 0;

  switch (otPolicy.rateMethod) {
    case 'Fixed Amount Per Hour':
      baseHourlyRate = otPolicy.fixedRatePerHour || 100;
      break;

    case 'Daily Salary Based':
      // Daily Salary ÷ Standard Working Hours = Hourly Rate
      baseHourlyRate = Math.round((dailySalary / reqHours) * 100) / 100;
      break;

    case 'Hourly Salary Based':
      baseHourlyRate = Math.round((dailySalary / reqHours) * 100) / 100;
      break;

    case 'Basic Salary Based':
      // Basic / 26 / Standard Working Hours
      baseHourlyRate = Math.round(((dailySalary * 26) / 26 / reqHours) * 100) / 100;
      break;

    case 'Percentage Based':
      const standardRate = dailySalary / reqHours;
      baseHourlyRate = Math.round((standardRate * ((otPolicy.fixedRatePerHour || 100) / 100)) * 100) / 100;
      break;

    default:
      baseHourlyRate = Math.round((dailySalary / reqHours) * 100) / 100;
  }

  // Multipliers from Policy
  let multiplier = otPolicy.regularMultiplier || 1.0;
  if (dayType === 'Weekend') multiplier = otPolicy.weekendMultiplier || 1.5;
  if (dayType === 'Holiday') multiplier = otPolicy.holidayMultiplier || 2.0;

  const otAmount = Math.round(baseHourlyRate * otHours * multiplier * 100) / 100;

  return {
    hourlyRate: baseHourlyRate,
    multiplier,
    otAmount
  };
}

/**
 * Requirement 6 & 14: Shared Enterprise Overtime Calculation Engine.
 * Computes overtime hourly rate and amount from:
 * - applicable wage base ('FIXED_HOURLY' | 'BASIC' | 'GROSS' | 'CTC')
 * - configured salary divisor (e.g. 26, 30, or calendar days 28/29/30/31)
 * - daily paid hours (standardShiftHours, e.g. 9 or 8 hrs)
 * - approved overtime hours
 * - applicable multiplier ('1x Salary', '1.5x Salary', '2x Salary', 'Fixed Amount Per Hour', or numeric)
 */
export function calculateEnterpriseOvertimeRateAndAmount(params: {
  employee?: Employee | { id?: string; employeeId?: string; department?: string; basicSalary?: number; grossSalary?: number; monthlyCtc?: number; salaryDetails?: any; departmentHistory?: any[]; statutoryOtEntitled?: boolean } | null;
  approvedOtHours?: number;
  approvedHours?: number;
  wageBaseMode?: OtWageBaseMode;
  basicSalary?: number;
  grossSalary?: number;
  monthlyCtc?: number;
  fixedHourlyRate?: number;
  divisor?: number;
  divisorDays?: number;
  dailyPaidHours?: number;
  multiplier?: OvertimeMultiplierType | number | string;
  rateType?: OtRateType | OvertimeMultiplierType | string;
  month?: string | number;
  year?: number;
  dateStr?: string;
  payrollConfig?: PayrollSettingsConfig | null;
  overtimePolicy?: OvertimePolicy | null;
  departmentOtPolicies?: DepartmentOtPolicy[];
  employeeOtPolicies?: EmployeeOtPolicy[];
}): {
  wageBaseMode: OtWageBaseMode;
  wageBaseUsed: OtWageBaseMode;
  wageBaseAmount: number;
  baseSalaryAmount: number;
  divisor: number;
  divisorUsed: number;
  dailyPaidHours: number;
  dailyPaidHoursUsed: number;
  calendarDaysInMonth: number;
  baseHourlyRate: number;
  hourlyRate: number;
  effectiveHourlyRate: number;
  multiplierFactor: number;
  multiplierApplied: number;
  multiplierValue: number;
  overtimeAmount: number;
  calculatedAmount: number;
  formulaDescription: string;
} {
  const emp = params.employee;
  const elig = emp
    ? resolveEmployeeOtEligibility(
        emp,
        params.departmentOtPolicies || [],
        params.employeeOtPolicies || [],
        params.overtimePolicy || undefined,
        params.dateStr
      )
    : undefined;

  const refDate = params.dateStr || '';
  const refYear = params.year || (refDate.length >= 4 ? Number(refDate.slice(0, 4)) : 2026) || 2026;
  const refMonth = params.month || (refDate.length >= 7 ? Number(refDate.slice(5, 7)) : 8) || 8;

  const divInfo = resolvePayrollSalaryDivisor({
    month: refMonth,
    year: refYear,
    payrollConfig: params.payrollConfig,
    overtimePolicy: params.overtimePolicy,
    divisorModeOverride: elig?.divisorMode !== 'COMPANY_DIVISOR' ? elig?.divisorMode : params.overtimePolicy?.divisorMode
  });

  const safeDivisor =
    (params.divisor && params.divisor > 0)
      ? params.divisor
      : ((params.divisorDays && params.divisorDays > 0) ? params.divisorDays : divInfo.divisor);

  const safeDailyHours =
    (params.dailyPaidHours && params.dailyPaidHours > 0)
      ? params.dailyPaidHours
      : (elig?.standardShiftHours || params.overtimePolicy?.defaultDailyPaidHours || 9);

  const safeOtHours = Math.max(
    0,
    Number(params.approvedOtHours ?? params.approvedHours ?? 0) || 0
  );

  const wageBaseMode: OtWageBaseMode =
    params.wageBaseMode ||
    elig?.wageBase ||
    params.overtimePolicy?.wageBase ||
    'FIXED_HOURLY';

  const rawMultiplier =
    params.multiplier ??
    params.rateType ??
    elig?.defaultMultiplier ??
    params.overtimePolicy?.defaultMultiplier ??
    params.overtimePolicy?.rateMethod ??
    '1x Salary';

  let multiplierFactor = 1.0;
  if (typeof rawMultiplier === 'number' && rawMultiplier > 0) {
    multiplierFactor = rawMultiplier;
  } else if (typeof rawMultiplier === 'string') {
    if (rawMultiplier === '2x Salary') multiplierFactor = 2.0;
    else if (rawMultiplier === '1.5x Salary') multiplierFactor = 1.5;
    else multiplierFactor = 1.0;
  }

  const empBasic = Number(params.basicSalary ?? emp?.salaryDetails?.basicSalary ?? emp?.basicSalary ?? 0);
  const empCtc = Number(params.monthlyCtc ?? emp?.salaryDetails?.monthlyCtc ?? emp?.monthlyCtc ?? emp?.grossSalary ?? (empBasic > 0 ? Math.round(empBasic / 0.4) : 0));
  const empGross = Number(params.grossSalary ?? emp?.grossSalary ?? empCtc);
  const fixedHourlyRate = Number(params.fixedHourlyRate ?? elig?.otHourlyRate ?? params.overtimePolicy?.fixedRatePerHour ?? 100);

  let wageBaseAmount = 0;
  let baseHourlyRate = 0;

  if (wageBaseMode === 'BASIC' && empBasic > 0) {
    wageBaseAmount = empBasic;
    baseHourlyRate = Math.round(((empBasic / safeDivisor) / safeDailyHours) * 100) / 100;
  } else if (wageBaseMode === 'GROSS' && empGross > 0) {
    wageBaseAmount = empGross;
    baseHourlyRate = Math.round(((empGross / safeDivisor) / safeDailyHours) * 100) / 100;
  } else if (wageBaseMode === 'CTC' && empCtc > 0) {
    wageBaseAmount = empCtc;
    baseHourlyRate = Math.round(((empCtc / safeDivisor) / safeDailyHours) * 100) / 100;
  } else {
    wageBaseAmount = fixedHourlyRate > 0 ? fixedHourlyRate : 100;
    baseHourlyRate = Math.round(wageBaseAmount * 100) / 100;
  }

  const effectiveHourlyRate = Math.round(baseHourlyRate * multiplierFactor * 100) / 100;
  const overtimeAmount = Math.round(safeOtHours * baseHourlyRate * multiplierFactor * 100) / 100;

  const formulaDescription = wageBaseMode === 'FIXED_HOURLY'
    ? `${safeOtHours} hrs × ₹${baseHourlyRate}/hr × ${multiplierFactor}x = ₹${overtimeAmount}`
    : `${wageBaseMode} ₹${wageBaseAmount} ÷ ${safeDivisor} days ÷ ${safeDailyHours} hrs = ₹${baseHourlyRate}/hr × ${safeOtHours} hrs × ${multiplierFactor}x = ₹${overtimeAmount}`;

  return {
    wageBaseMode,
    wageBaseUsed: wageBaseMode,
    wageBaseAmount,
    baseSalaryAmount: wageBaseAmount,
    divisor: safeDivisor,
    divisorUsed: safeDivisor,
    dailyPaidHours: safeDailyHours,
    dailyPaidHoursUsed: safeDailyHours,
    calendarDaysInMonth: divInfo.calendarDaysInMonth,
    baseHourlyRate,
    hourlyRate: effectiveHourlyRate,
    effectiveHourlyRate,
    multiplierFactor,
    multiplierApplied: multiplierFactor,
    multiplierValue: multiplierFactor,
    overtimeAmount,
    calculatedAmount: overtimeAmount,
    formulaDescription
  };
}

/**
 * Requirement 7, 12, 13: Overtime Approval Workflow Pipeline
 * Attendance -> Identify Eligible Hours -> Department Policy -> Approval -> Payroll
 * Scans attendance records, identifies extra hours beyond standard shift hours,
 * evaluates department policy + employee-specific exception + effective dates + historical department,
 * prevents duplicates and locked-payroll modifications, and returns eligible vs restricted items.
 */
export function identifyEligibleOvertimeFromAttendance(params: {
  attendanceRecords: AttendanceRecord[];
  employees: Employee[];
  shifts?: any[];
  departmentOtPolicies: DepartmentOtPolicy[];
  employeeOtPolicies: EmployeeOtPolicy[];
  overtimePolicy?: OvertimePolicy;
  existingOvertimeRequests?: OvertimeRequest[];
  existingOtRequests?: OvertimeRequest[];
  payrollConfig?: PayrollSettingsConfig;
  lockedPayrollMonths?: Set<string> | { month: string | number; year: number }[];
  currentOpenPayrollMonth?: string | { month: string; year: number };
  currentOpenPayrollYear?: number;
  month?: string | number;
  year?: number;
}): {
  eligibleNewRequests: OvertimeRequest[];
  newRequests: OvertimeRequest[];
  restrictedItems: {
    attendanceRecordId: string;
    employeeId: string;
    employeeName: string;
    department: string;
    date: string;
    extraHours: number;
    reason: string;
  }[];
  skippedRestricted: number;
  skippedDuplicates: number;
  skippedDuplicatesCount: number;
} {
  const {
    attendanceRecords = [],
    employees = [],
    departmentOtPolicies = [],
    employeeOtPolicies = [],
    overtimePolicy,
    payrollConfig,
  } = params;

  const existingOvertimeRequests = params.existingOvertimeRequests || params.existingOtRequests || [];
  const openMonthStr =
    typeof params.currentOpenPayrollMonth === 'object' && params.currentOpenPayrollMonth !== null
      ? params.currentOpenPayrollMonth.month
      : (params.currentOpenPayrollMonth || (typeof params.month === 'string' ? params.month : 'August'));
  const openYearNum =
    typeof params.currentOpenPayrollMonth === 'object' && params.currentOpenPayrollMonth !== null
      ? params.currentOpenPayrollMonth.year
      : (params.currentOpenPayrollYear || params.year || 2026);

  const lockedSet = new Set<string>();
  if (params.lockedPayrollMonths instanceof Set) {
    params.lockedPayrollMonths.forEach(v => lockedSet.add(v));
  } else if (Array.isArray(params.lockedPayrollMonths)) {
    params.lockedPayrollMonths.forEach(item => {
      const mNum = resolveMonthNumber(item.month, item.year);
      lockedSet.add(`${item.year}-${String(mNum).padStart(2, '0')}`);
    });
  }

  const eligibleNewRequests: OvertimeRequest[] = [];
  const restrictedItems: {
    attendanceRecordId: string;
    employeeId: string;
    employeeName: string;
    department: string;
    date: string;
    extraHours: number;
    reason: string;
  }[] = [];
  let skippedDuplicatesCount = 0;

  for (const att of attendanceRecords) {
    if (!att || !att.date || !att.employeeId) continue;
    if (att.status === 'Absent' || att.status === 'On Leave' || att.status === 'Holiday' || att.status === 'Week Off') {
      continue;
    }

    const emp = employees.find(
      e => e.employeeId?.toLowerCase() === att.employeeId.toLowerCase() || e.id?.toLowerCase() === att.employeeId.toLowerCase()
    );

    const elig = resolveEmployeeOtEligibility(
      att.employeeId,
      att.department || emp?.department || 'General',
      departmentOtPolicies,
      employeeOtPolicies,
      {
        attendanceDate: att.date,
        departmentHistory: emp?.departmentHistory,
        statutoryEntitlement: emp?.statutoryOtEntitled
      }
    );

    const shiftHours = elig.standardShiftHours || overtimePolicy?.defaultDailyPaidHours || 9;
    const workedHours = Number(att.workingHours ?? att.workHours) || 0;
    const rawExtraHours = Math.max(
      0,
      Math.round((workedHours - shiftHours) * 100) / 100,
      Number(att.calculatedOtHours) || 0,
      Number(att.otHours) || 0
    );

    const minOtHours = (elig.minOtDurationMinutes || overtimePolicy?.minimumOtDurationMinutes || 30) / 60;
    if (rawExtraHours < minOtHours) {
      continue;
    }

    // Check duplicate in existingOvertimeRequests
    const normDate = String(att.date).slice(0, 10);
    const hasExisting = existingOvertimeRequests.some(
      req =>
        req.employeeId.trim().toLowerCase() === att.employeeId.trim().toLowerCase() &&
        String(req.date).slice(0, 10) === normDate &&
        req.status !== 'Rejected'
    );
    if (hasExisting) {
      skippedDuplicatesCount++;
      continue;
    }

    if (!elig.isEligible) {
      restrictedItems.push({
        attendanceRecordId: att.id,
        employeeId: att.employeeId,
        employeeName: att.employeeName || (emp ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim() : att.employeeId),
        department: elig.resolvedDepartment,
        date: normDate,
        extraHours: rawExtraHours,
        reason: elig.reason
      });
      continue;
    }

    const cappedExtraHours = Math.min(rawExtraHours, elig.maxDailyOt || overtimePolicy?.maximumDailyOtHours || 4);
    const [attYearStr, attMonthStr] = normDate.split('-');
    const attYear = Number(attYearStr) || openYearNum;
    const attMonthNum = Number(attMonthStr) || 8;

    const divisorInfo = resolvePayrollSalaryDivisor({
      month: attMonthNum,
      year: attYear,
      payrollConfig,
      divisorModeOverride: elig.divisorMode !== 'COMPANY_DIVISOR' ? elig.divisorMode : overtimePolicy?.divisorMode
    });

    const basicSalary = Number(emp?.salaryDetails?.basicSalary ?? emp?.basicSalary ?? 0);
    const monthlyCtc = Number(emp?.salaryDetails?.monthlyCtc ?? emp?.grossSalary ?? (basicSalary > 0 ? Math.round(basicSalary / 0.4) : 15000));
    const grossSalary = Number(emp?.grossSalary ?? monthlyCtc);

    const rateCalc = calculateEnterpriseOvertimeRateAndAmount({
      approvedOtHours: cappedExtraHours,
      wageBaseMode: elig.wageBase,
      basicSalary,
      grossSalary,
      monthlyCtc,
      fixedHourlyRate: elig.otHourlyRate,
      divisor: divisorInfo.divisor,
      dailyPaidHours: shiftHours,
      multiplier: elig.defaultMultiplier
    });

    const monthKey = `${attYear}-${String(attMonthNum).padStart(2, '0')}`;
    const isAttendanceMonthLocked = lockedSet.has(monthKey);

    eligibleNewRequests.push({
      id: `OTR-AUTO-${att.employeeId}-${normDate}`,
      attendanceRecordId: att.id,
      employeeId: att.employeeId,
      employeeName: att.employeeName || (emp ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim() : att.employeeId),
      department: elig.resolvedDepartment,
      date: normDate,
      shiftName: att.shiftName || 'Standard Shift',
      shiftEnd: '06:00 PM',
      actualCheckOut: att.checkOut || '08:00 PM',
      potentialOtHours: rawExtraHours,
      requestedOtHours: cappedExtraHours,
      requestedHours: cappedExtraHours,
      approvedOtHours: 0,
      approvedHours: 0,
      otHours: cappedExtraHours,
      otAmount: rateCalc.overtimeAmount,
      reason: `Eligible overtime identified from attendance (${workedHours}h worked vs ${shiftHours}h standard shift)`,
      workDescription: rateCalc.formulaDescription,
      status: 'Pending Approval',
      source: 'Attendance Auto-Identified',
      multiplier: elig.defaultMultiplier,
      hourlyRate: rateCalc.baseHourlyRate,
      appliedRatePerHour: rateCalc.effectiveHourlyRate,
      calculatedAmount: rateCalc.overtimeAmount,
      submittedAt: normDate,
      wageBaseUsed: rateCalc.wageBaseMode,
      divisorUsed: rateCalc.divisor,
      dailyPaidHoursUsed: rateCalc.dailyPaidHours,
      calendarDaysInMonth: divisorInfo.calendarDaysInMonth,
      eligibilitySource: elig.source === 'Default' ? 'Department Policy' : elig.source,
      payrollStatus: 'Unprocessed',
      isLocked: false,
      isBackdatedArrear: isAttendanceMonthLocked,
      targetPayrollMonth: isAttendanceMonthLocked ? openMonthStr : undefined,
      targetPayrollYear: isAttendanceMonthLocked ? openYearNum : undefined
    });
  }

  return {
    eligibleNewRequests,
    newRequests: eligibleNewRequests,
    restrictedItems,
    skippedRestricted: restrictedItems.length,
    skippedDuplicates: skippedDuplicatesCount,
    skippedDuplicatesCount
  };
}

/**
 * Computes Attendance + Salary Impact Summary for single attendance record
 */
export function calculateAttendanceSalaryImpact(params: {
  employee?: Employee;
  record: AttendanceRecord;
  shift: ShiftModel;
  attendancePolicy: AttendancePolicyConfig;
  otPolicy: OvertimePolicy;
  dayType?: 'Regular' | 'Weekend' | 'Holiday';
}): SalaryImpactSummary {
  const {
    employee,
    record,
    shift,
    attendancePolicy,
    otPolicy,
    dayType = 'Regular'
  } = params;

  const basicSalary = employee?.basicSalary || 26000;
  const workingDaysPerMonth = 26;
  const dailySalary = Math.round((basicSalary / workingDaysPerMonth) * 100) / 100;
  const standardHours = shift.requiredWorkingHours || 9.0;
  const hourlyRate = Math.round((dailySalary / standardHours) * 100) / 100;

  const regularWorkHours = record.workingHours || 0;
  const approvedOt = record.approvedOtHours || 0;

  // 1. OT Earnings
  const { otAmount } = calculateOtSalaryAmount({
    otHours: approvedOt,
    dailySalary,
    standardWorkingHours: standardHours,
    otPolicy,
    dayType
  });

  // 2. Half-Day Deduction
  let halfDayDeduction = 0;
  if (record.status === 'Half Day') {
    if (attendancePolicy.halfDayDeductionType === 'Half Day Salary Deduction') {
      halfDayDeduction = Math.round(dailySalary * 0.5 * 100) / 100;
    } else if (attendancePolicy.halfDayDeductionType === 'Percentage Deduction') {
      const pct = (attendancePolicy.halfDayDeductionValue || 50) / 100;
      halfDayDeduction = Math.round(dailySalary * pct * 100) / 100;
    } else if (attendancePolicy.halfDayDeductionType === 'Fixed Deduction') {
      halfDayDeduction = attendancePolicy.halfDayDeductionValue || 450;
    }
  }

  // 3. Absent Deduction
  let absentDeduction = 0;
  if (record.status === 'Absent') {
    if (attendancePolicy.absentDeductionType === 'Full Day Salary') {
      absentDeduction = dailySalary;
    } else if (attendancePolicy.absentDeductionType === 'Percentage') {
      absentDeduction = Math.round(dailySalary * ((attendancePolicy.absentDeductionValue || 100) / 100) * 100) / 100;
    } else if (attendancePolicy.absentDeductionType === 'Fixed Amount') {
      absentDeduction = attendancePolicy.absentDeductionValue || dailySalary;
    }
  }

  // 4. Late Deduction
  let lateDeduction = 0;
  if (record.lateDurationMinutes && record.lateDurationMinutes > 0) {
    if (attendancePolicy.lateAction === 'Salary Deduction') {
      if (attendancePolicy.lateDeductionType === 'Per Minute') {
        lateDeduction = record.lateDurationMinutes * (attendancePolicy.lateDeductionValue || 5);
      } else if (attendancePolicy.lateDeductionType === 'Fixed Amount') {
        lateDeduction = attendancePolicy.lateDeductionValue || 100;
      } else if (attendancePolicy.lateDeductionType === 'Percentage') {
        lateDeduction = Math.round(dailySalary * ((attendancePolicy.lateDeductionValue || 5) / 100) * 100) / 100;
      }
    }
  }

  // 5. Early Checkout Deduction
  let earlyCheckoutDeduction = 0;
  if (record.earlyCheckoutMinutes && record.earlyCheckoutMinutes > 0) {
    if (attendancePolicy.earlyCheckoutAction === 'Deduct Salary') {
      if (attendancePolicy.earlyCheckoutDeductionType === 'Per Minute') {
        earlyCheckoutDeduction = record.earlyCheckoutMinutes * (attendancePolicy.earlyCheckoutDeductionValue || 5);
      } else if (attendancePolicy.earlyCheckoutDeductionType === 'Fixed Amount') {
        earlyCheckoutDeduction = attendancePolicy.earlyCheckoutDeductionValue || 100;
      }
    }
  }

  const netAdjustment = Math.round((otAmount - halfDayDeduction - absentDeduction - lateDeduction - earlyCheckoutDeduction) * 100) / 100;

  return {
    dailySalary,
    standardWorkingHours: standardHours,
    hourlyRate,
    regularWorkHours,
    otHours: approvedOt,
    otAmount,
    halfDayDeduction,
    lateDeduction,
    absentDeduction,
    earlyCheckoutDeduction,
    netAdjustment
  };
}

/**
 * Computes Monthly Attendance Summary for an Employee
 */
export function aggregateMonthlyAttendanceSummary(
  employeeId: string,
  records: AttendanceRecord[],
  shift: ShiftModel,
  attendancePolicy: AttendancePolicyConfig,
  otPolicy: OvertimePolicy,
  employee?: Employee
): MonthlyAttendanceSummary {
  const empRecords = records.filter(r => r.employeeId === employeeId);

  let presentDays = 0;
  let absentDays = 0;
  let halfDays = 0;
  let leaveDays = 0;
  let weeklyOffDays = 0;
  let holidayDays = 0;
  let lateDays = 0;
  let earlyCheckoutDays = 0;
  let missingAttendanceDays = 0;
  let approvedOtHours = 0;
  let pendingOtHours = 0;
  let rejectedOtHours = 0;
  let totalOtAmount = 0;
  let totalDeductionAmount = 0;

  const basicSalary = employee?.basicSalary || 26000;
  const dailySalary = Math.round((basicSalary / 26) * 100) / 100;
  const standardHours = shift.requiredWorkingHours || 9.0;

  empRecords.forEach(rec => {
    switch (rec.status) {
      case 'Present':
        presentDays++;
        break;
      case 'Absent':
        absentDays++;
        break;
      case 'Half Day':
        halfDays++;
        break;
      case 'On Leave':
        leaveDays++;
        break;
      case 'Week Off':
        weeklyOffDays++;
        break;
      case 'Holiday':
        holidayDays++;
        break;
      case 'Missing Punch':
        missingAttendanceDays++;
        break;
      default:
        if (rec.checkIn && rec.checkOut) presentDays++;
    }

    if (rec.lateStatus && rec.lateStatus !== 'On Time' && rec.lateStatus !== 'N/A') {
      lateDays++;
    }

    if (rec.earlyCheckoutMinutes && rec.earlyCheckoutMinutes > 0) {
      earlyCheckoutDays++;
    }

    if (rec.approvedOtHours && rec.approvedOtHours > 0) {
      approvedOtHours += rec.approvedOtHours;
      const { otAmount } = calculateOtSalaryAmount({
        otHours: rec.approvedOtHours,
        dailySalary,
        standardWorkingHours: standardHours,
        otPolicy
      });
      totalOtAmount += otAmount;
    }

    if (rec.otStatus === 'Pending' && rec.calculatedOtHours) {
      pendingOtHours += rec.calculatedOtHours;
    }

    if (rec.otStatus === 'Rejected' && rec.calculatedOtHours) {
      rejectedOtHours += rec.calculatedOtHours;
    }

    // Accumulate deductions
    const impact = calculateAttendanceSalaryImpact({
      employee,
      record: rec,
      shift,
      attendancePolicy,
      otPolicy
    });
    totalDeductionAmount += (impact.halfDayDeduction + impact.absentDeduction + impact.lateDeduction + impact.earlyCheckoutDeduction);
  });

  const totalWorkingDays = empRecords.length || 26;
  const netImpact = Math.round((totalOtAmount - totalDeductionAmount) * 100) / 100;

  return {
    totalWorkingDays,
    presentDays,
    absentDays,
    halfDays,
    leaveDays,
    weeklyOffDays,
    holidayDays,
    lateDays,
    earlyCheckoutDays,
    missingAttendanceDays,
    approvedOtHours: Math.round(approvedOtHours * 100) / 100,
    pendingOtHours: Math.round(pendingOtHours * 100) / 100,
    rejectedOtHours: Math.round(rejectedOtHours * 100) / 100,
    totalOtAmount: Math.round(totalOtAmount * 100) / 100,
    totalDeductionAmount: Math.round(totalDeductionAmount * 100) / 100,
    netImpact
  };
}
