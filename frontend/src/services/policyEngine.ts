// VRM Enterprise HRM - Central Dynamic Policy & Rule Engine
import { 
  AttendancePolicy, 
  MasterLeavePolicy, 
  PayrollSettingsConfig, 
  EmployeeRewardRecord,
  AttendanceRecord,
  LeaveRequest,
  Employee,
  PayrollRecord,
  LoanRecord,
  LoanRepaymentInstallment,
  Shift,
  HolidayItem,
  WeeklyScheduleItem,
  SandwichLeavePolicy
} from '../types/hrms';
import { SalaryComponentConfig, EmployeeSalaryEligibilityContext } from '../types/settings';
import {
  OvertimeRequest,
  DepartmentOtPolicy,
  EmployeeOtPolicy,
  OvertimePolicy,
  PayslipOvertimeVisibilityConfig
} from '../types/attendanceEnterprise';
import { 
  isComponentEligible, 
  filterEligibleComponents, 
  isEsicStatutoryEligible, 
  validateComponentEligibility,
  getEligibilityBadgeLabel
} from './componentEligibilityEngine';
import { toNum, formatCurrency } from '../utils/numbers';
import { isOwnerOrCEO } from '../data/hrmsInitialData';
import {
  parseTimeToMinutes,
  resolveMonthNumber,
  getCalendarDaysInMonth,
  countWeeklyOffDaysInMonth,
  resolvePayrollSalaryDivisor,
  isDefaultOtEligibleDepartment,
  resolveEmployeeDepartmentForDate,
  isPolicyEffectiveOnDate,
  resolveEmployeeOtEligibility,
  calculateEnterpriseOvertimeRateAndAmount,
  identifyEligibleOvertimeFromAttendance,
  buildEmployeeMonthlyAttendanceOtReport,
  normalizeDateToISO,
  isDateEmployeeWeeklyOff,
  isDateCompanyPaidHoliday,
  calculateCalendarDayPayrollAttendance,
  CalendarDayPayrollBreakdown,
  CalendarDayPayrollParams
} from './attendanceCalculationEngine';

export {
  isComponentEligible,
  filterEligibleComponents,
  isEsicStatutoryEligible,
  validateComponentEligibility,
  getEligibilityBadgeLabel,
  resolveMonthNumber,
  getCalendarDaysInMonth,
  countWeeklyOffDaysInMonth,
  resolvePayrollSalaryDivisor,
  isDefaultOtEligibleDepartment,
  resolveEmployeeDepartmentForDate,
  isPolicyEffectiveOnDate,
  resolveEmployeeOtEligibility,
  calculateEnterpriseOvertimeRateAndAmount,
  identifyEligibleOvertimeFromAttendance,
  buildEmployeeMonthlyAttendanceOtReport,
  normalizeDateToISO,
  isDateEmployeeWeeklyOff,
  isDateCompanyPaidHoliday,
  calculateCalendarDayPayrollAttendance
};
export type { EmployeeSalaryEligibilityContext, CalendarDayPayrollBreakdown, CalendarDayPayrollParams };

// ========================================================
// 1. SAFE MATHEMATICAL FORMULA EVALUATOR (No eval)
// ========================================================
export interface FormulaContext {
  BASIC?: number;
  HRA?: number;
  DA?: number;
  CONV?: number;
  CONVEYANCE?: number;
  OT?: number;
  OVERTIME?: number;
  GROSS?: number;
  CTC?: number;
  DAILY_SALARY?: number;
  WORKING_DAYS?: number;
  PAID_DAYS?: number;
  UNPAID_DAYS?: number;
  LATE_COUNT?: number;
  LEAVE_DAYS?: number;
  INCENTIVE?: number;
  BONUS?: number;
  REWARD?: number;
  ATTENDANCE_BONUS?: number;
  [key: string]: number | undefined;
}

export const STANDARD_FORMULA_VARIABLES = [
  'BASIC',
  'HRA',
  'DA',
  'CONV',
  'CONVEYANCE',
  'OT',
  'OVERTIME',
  'GROSS',
  'CTC',
  'DAILY_SALARY',
  'WORKING_DAYS',
  'PAID_DAYS',
  'UNPAID_DAYS',
  'LATE_COUNT',
  'LEAVE_DAYS',
  'INCENTIVE',
  'BONUS',
  'REWARD',
  'ATTENDANCE_BONUS',
] as const;

/**
 * Safely evaluates arithmetic expressions containing numbers, parentheses, operators (+, -, *, /),
 * and standard variables from the formula context.
 */
export const evaluateFormula = (formula: string, context: FormulaContext): number => {
  if (!formula || typeof formula !== 'string') return 0;

  // Substitute variables with numeric values from context
  let expr = formula.toUpperCase();
  const sortedKeys = Object.keys(context).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    const val = context[key];
    if (val !== undefined) {
      // Regex replace word boundaries
      const regex = new RegExp(`\\b${key}\\b`, 'g');
      expr = expr.replace(regex, `(${Number(val) || 0})`);
    }
  }

  // Sanitize: allow only digits, decimal points, parentheses, and arithmetic operators
  const sanitized = expr.replace(/[^0-9.+\-*/() ]/g, '');

  try {
    // Standard recursive-descent parser for arithmetic
    let index = 0;

    const parseNumber = (): number => {
      let numStr = '';
      while (index < sanitized.length && (/[0-9.]/).test(sanitized[index])) {
        numStr += sanitized[index];
        index++;
      }
      return parseFloat(numStr) || 0;
    };

    const parseFactor = (): number => {
      while (index < sanitized.length && sanitized[index] === ' ') index++;
      if (index >= sanitized.length) return 0;

      if (sanitized[index] === '(') {
        index++; // skip '('
        const res = parseExpression();
        while (index < sanitized.length && sanitized[index] === ' ') index++;
        if (sanitized[index] === ')') index++; // skip ')'
        return res;
      }

      if (sanitized[index] === '-') {
        index++;
        return -parseFactor();
      }

      if (sanitized[index] === '+') {
        index++;
        return parseFactor();
      }

      return parseNumber();
    };

    const parseTerm = (): number => {
      let left = parseFactor();
      while (index < sanitized.length) {
        while (index < sanitized.length && sanitized[index] === ' ') index++;
        const op = sanitized[index];
        if (op === '*' || op === '/') {
          index++;
          const right = parseFactor();
          if (op === '*') left = left * right;
          if (op === '/') left = right !== 0 ? left / right : 0;
        } else {
          break;
        }
      }
      return left;
    };

    const parseExpression = (): number => {
      let left = parseTerm();
      while (index < sanitized.length) {
        while (index < sanitized.length && sanitized[index] === ' ') index++;
        const op = sanitized[index];
        if (op === '+' || op === '-') {
          index++;
          const right = parseTerm();
          if (op === '+') left = left + right;
          if (op === '-') left = left - right;
        } else {
          break;
        }
      }
      return left;
    };

    const result = parseExpression();
    return isNaN(result) || !isFinite(result) ? 0 : Math.round(result * 100) / 100;
  } catch {
    return 0;
  }
};

export interface FormulaValidationOptions {
  allowedVariables?: string[];
  currentComponentCode?: string;
  allComponents?: Pick<SalaryComponentConfig, 'code' | 'formula' | 'calculationMethod'>[];
  statutoryKind?: 'PF' | 'ESIC' | 'PT' | null;
  previewContext?: FormulaContext;
}

/**
 * Validates a formula string for syntax, unknown variables, circular dependencies,
 * statutory warnings, and runs a sample calculation with test/preview values.
 */
export const validateFormula = (
  formula: string,
  options?: FormulaValidationOptions
): {
  isValid: boolean;
  error?: string;
  warning?: string;
  sampleResult?: number;
  referencedVariables?: string[];
} => {
  if (!formula || !formula.trim()) {
    return { isValid: false, error: 'Formula cannot be empty' };
  }

  const trimmed = formula.trim();

  // Check for balanced parentheses
  let balance = 0;
  for (const ch of trimmed) {
    if (ch === '(') balance++;
    if (ch === ')') balance--;
    if (balance < 0) return { isValid: false, error: 'Unbalanced parentheses' };
  }
  if (balance !== 0) return { isValid: false, error: 'Unclosed parenthesis' };

  // Check for forbidden characters & code injection attempts
  const allowed = /^[A-Z0-9_.+\-*/() ]+$/i;
  if (!allowed.test(trimmed)) {
    return { isValid: false, error: 'Formula contains unsupported special characters' };
  }

  // Syntax checks: empty parentheses, consecutive binary operators, trailing or leading binary operators
  const compact = trimmed.replace(/\s+/g, '');
  if (/\(\)/.test(compact)) {
    return { isValid: false, error: 'Formula contains empty parentheses ()' };
  }
  if (/^[*/]|[+\-*/]$/.test(compact)) {
    return { isValid: false, error: 'Formula cannot start or end with an incomplete operator' };
  }
  if (/[+\-*/]{2,}/.test(compact) || /\([*/]/.test(compact) || /[+\-*/]\)/.test(compact)) {
    return { isValid: false, error: 'Formula contains invalid consecutive operators' };
  }

  // Extract variable identifiers
  const rawTokens = trimmed.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) || [];
  const referencedVariables = Array.from(new Set(rawTokens.map(t => t.toUpperCase())));

  const allowedSet = new Set<string>(STANDARD_FORMULA_VARIABLES);
  if (options?.allowedVariables) {
    options.allowedVariables.forEach(v => {
      if (v) allowedSet.add(v.trim().toUpperCase());
    });
  }
  if (options?.allComponents) {
    options.allComponents.forEach(c => {
      if (c?.code) allowedSet.add(c.code.trim().toUpperCase());
    });
  }

  const unknownVars = referencedVariables.filter(v => !allowedSet.has(v));
  if (unknownVars.length > 0) {
    return {
      isValid: false,
      error: `Unknown variable${unknownVars.length > 1 ? 's' : ''}: ${unknownVars.join(', ')}`,
      referencedVariables,
    };
  }

  // Circular dependency detection
  const selfCode = options?.currentComponentCode?.trim().toUpperCase();
  if (selfCode) {
    if (referencedVariables.includes(selfCode)) {
      return {
        isValid: false,
        error: `Circular dependency detected: ${selfCode} cannot reference itself`,
        referencedVariables,
      };
    }

    if (options?.allComponents && options.allComponents.length > 0) {
      const compMap = new Map<string, string[]>();
      options.allComponents.forEach(c => {
        const code = (c.code || '').trim().toUpperCase();
        if (!code) return;
        const fStr = code === selfCode ? trimmed : (c.calculationMethod === 'FORMULA' ? (c.formula || '') : '');
        const deps = (fStr.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) || []).map(t => t.toUpperCase());
        compMap.set(code, Array.from(new Set(deps)));
      });
      compMap.set(selfCode, referencedVariables);

      const visited = new Set<string>();
      const visiting = new Set<string>();
      const findCycle = (node: string, path: string[]): string[] | null => {
        if (visiting.has(node)) {
          return [...path, node];
        }
        if (visited.has(node)) return null;
        visiting.add(node);
        const neighbors = compMap.get(node) || [];
        for (const next of neighbors) {
          if (compMap.has(next)) {
            const cycle = findCycle(next, [...path, node]);
            if (cycle) return cycle;
          }
        }
        visiting.delete(node);
        visited.add(node);
        return null;
      };

      const cyclePath = findCycle(selfCode, []);
      if (cyclePath) {
        return {
          isValid: false,
          error: `Circular dependency detected: ${cyclePath.join(' → ')}`,
          referencedVariables,
        };
      }
    }
  }

  let warning: string | undefined;
  if (options?.statutoryKind === 'PF' && (referencedVariables.includes('OT') || referencedVariables.includes('OVERTIME'))) {
    warning = 'Statutory note: Ordinary overtime allowance (OT) is generally excluded from PF wages under the EPF framework.';
  }

  // Test evaluation context
  const testEvaluationContext: FormulaContext = {
    BASIC: 6000,
    DA: 3000,
    CONV: 750,
    CONVEYANCE: 750,
    HRA: 5250,
    OT: 1111.11,
    OVERTIME: 1111.11,
    GROSS: 16111.11,
    CTC: 15000,
    DAILY_SALARY: 500,
    WORKING_DAYS: 30,
    PAID_DAYS: 30,
    UNPAID_DAYS: 0,
    LATE_COUNT: 0,
    LEAVE_DAYS: 0,
    INCENTIVE: 0,
    BONUS: 0,
    REWARD: 0,
    ATTENDANCE_BONUS: 1000,
    ...(options?.previewContext || {}),
  };

  try {
    const res = evaluateFormula(trimmed, testEvaluationContext);
    return { isValid: true, warning, sampleResult: res, referencedVariables };
  } catch (err: any) {
    return { isValid: false, error: err.message || 'Evaluation error', referencedVariables };
  }
};

// ========================================================
// 2. ATTENDANCE LATE DEDUCTION EVALUATION
// ========================================================
export interface LateDeductionResult {
  lateCount: number;
  severelyLateCount: number;
  deductionAmount: number;
  ruleApplied: string;
  isConfidential: boolean;
  genericCategoryLabel: string;
  details: string;
  // Dynamic Late Policy Engine fields:
  allowedLateCount?: number;
  exceededLateCount?: number;
  halfDaysLateCount?: number;
  lopDaysLateCount?: number;
  warningIssued?: boolean;
  warningMessage?: string;
  hasConflict?: boolean;
  conflictingPolicyNames?: string[];
}

/**
 * Checks if a policy applies to an employee based on company scope, department, designation, and assigned shift.
 */
const isScopeListRestricted = (scope: unknown): scope is string[] => {
  if (!Array.isArray(scope) || scope.length === 0) return false;
  return !scope.some(item => String(item || '').trim().toUpperCase() === 'ALL');
};

export const isPolicyApplicableToLateEmployee = (
  policy: AttendancePolicy,
  employee: Employee,
  empShiftId?: string,
  empShiftName?: string
): boolean => {
  if (!policy || policy.status !== 'Active') return false;

  // 1. Specific Employee restriction
  if (isScopeListRestricted(policy.applicableEmployees)) {
    const empMatches =
      policy.applicableEmployees.includes(employee.employeeId) ||
      (employee.id && policy.applicableEmployees.includes(employee.id));
    if (!empMatches) return false;
  }

  // 2. Department restriction
  if (isScopeListRestricted(policy.applicableDepartments)) {
    if (!policy.applicableDepartments.includes(employee.department)) return false;
  }

  // 3. Designation restriction
  if (isScopeListRestricted(policy.applicableDesignations)) {
    if (!employee.designation || !policy.applicableDesignations.includes(employee.designation)) return false;
  }

  // 4. Shift restriction (Multi-Shift Support)
  if (isScopeListRestricted(policy.applicableShifts)) {
    const shiftMatches = (empShiftId && policy.applicableShifts.includes(empShiftId)) ||
                         (empShiftName && policy.applicableShifts.includes(empShiftName));
    if (!shiftMatches) return false;
  }

  return true;
};

/**
 * Resolves the single effective late policy for an employee among active policies using strict precedence:
 * Specific Employee (5) > Specific Shift (4) > Specific Designation (3) > Specific Department (2) > Company-wide ALL (1)
 * Detects and flags conflicts if multiple policies match at the exact same precedence level.
 */
export const resolveEffectiveLatePolicy = (
  employee: Employee,
  activePolicies: AttendancePolicy[],
  empShiftId?: string,
  empShiftName?: string
): { policy: AttendancePolicy | null; conflict: boolean; conflictingPolicies: AttendancePolicy[] } => {
  const matching = activePolicies.filter(p => isPolicyApplicableToLateEmployee(p, employee, empShiftId, empShiftName));

  if (matching.length === 0) {
    return { policy: null, conflict: false, conflictingPolicies: [] };
  }

  if (matching.length === 1) {
    return { policy: matching[0], conflict: false, conflictingPolicies: [] };
  }

  // Calculate precedence weight for each matching policy
  const scored = matching.map(p => {
    let score = 1; // Default company-wide 'ALL'
    if (isScopeListRestricted(p.applicableEmployees)) score = 5;
    else if (isScopeListRestricted(p.applicableShifts)) score = 4;
    else if (isScopeListRestricted(p.applicableDesignations)) score = 3;
    else if (isScopeListRestricted(p.applicableDepartments)) score = 2;
    return { policy: p, score };
  });

  const maxScore = Math.max(...scored.map(s => s.score));
  const topMatches = scored.filter(s => s.score === maxScore).map(s => s.policy);

  if (topMatches.length > 1) {
    // Conflict detected at the same precedence level
    return {
      policy: topMatches[0], // Deterministic fallback to prevent crash
      conflict: true,
      conflictingPolicies: topMatches
    };
  }

  return { policy: topMatches[0], conflict: false, conflictingPolicies: [] };
};

/**
 * Checks if a check-in time exceeds shift start time + grace period.
 */
export const isCheckInLate = (
  checkInStr: string | null, 
  shiftStartStr: string = '09:30', 
  graceMins: number = 10
): boolean => {
  if (!checkInStr) return false;

  const inMins = parseTimeToMinutes(checkInStr);
  const startMins = parseTimeToMinutes(shiftStartStr);

  if (inMins === null || startMins === null) return false;

  const allowedMinutes = startMins + (graceMins || 0);
  return inMins > allowedMinutes;
};

/**
 * Evaluates the attendance late policy for an employee over a month to calculate late deductions,
 * warnings, Half-Day rules, and Loss of Pay (LOP) penalties across multiple assigned shifts.
 */
export const evaluateAttendanceLateDeduction = (
  employee: Employee,
  attendanceRecords: AttendanceRecord[],
  policy: AttendancePolicy | undefined,
  dailySalary: number,
  basicSalary: number,
  allShifts: Shift[] = [],
  monthYear?: { month: number; year: number }
): LateDeductionResult => {
  const defaultResult: LateDeductionResult = {
    lateCount: 0,
    severelyLateCount: 0,
    deductionAmount: 0,
    ruleApplied: 'None',
    isConfidential: false,
    genericCategoryLabel: 'OTHERS',
    details: 'No deduction',
    allowedLateCount: 3,
    exceededLateCount: 0,
    halfDaysLateCount: 0,
    lopDaysLateCount: 0,
    warningIssued: false
  };

  if (!policy || policy.status !== 'Active') {
    return defaultResult;
  }

  // Find employee's assigned default shift if any
  const empShift = allShifts.find(s => 
    (Array.isArray(s.assignments) && s.assignments.some(a => a.employeeId === employee.employeeId && a.status === 'ACTIVE')) ||
    s.id === employee.workShift ||
    s.shiftName === employee.workShift
  );

  // Check policy applicability
  if (!isPolicyApplicableToLateEmployee(policy, employee, empShift?.id, empShift?.shiftName)) {
    return defaultResult;
  }

  // Filter attendance records for the target calendar month to ensure monthly counter isolation & history preservation
  const empRecords = attendanceRecords.filter(r => {
    if (r.employeeId !== employee.employeeId) return false;
    if (monthYear && r.date) {
      const d = new Date(r.date);
      if (!isNaN(d.getTime())) {
        const rMonth = d.getMonth() + 1;
        const rYear = d.getFullYear();
        if (rMonth !== monthYear.month || rYear !== monthYear.year) return false;
      }
    }
    return true;
  });

  // Sort chronological for sequential late counting
  empRecords.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const graceMins = policy.graceTimeMinutes ?? 10;
  let lateCount = 0;
  let severelyLateCount = 0;

  empRecords.forEach(rec => {
    // Dynamically resolve the shift start time for THIS specific record
    let shiftStartTime = '09:30';
    if (rec.shiftId) {
      const matched = allShifts.find(s => s.id === rec.shiftId);
      if (matched?.startTime) shiftStartTime = matched.startTime;
    } else if (rec.shiftName) {
      const matched = allShifts.find(s => s.shiftName.toLowerCase() === rec.shiftName?.toLowerCase());
      if (matched?.startTime) shiftStartTime = matched.startTime;
    } else if (empShift?.startTime) {
      shiftStartTime = empShift.startTime;
    } else if (policy.startTime) {
      shiftStartTime = policy.startTime;
    }

    let isLate = false;
    if (rec.status === 'Absent' || rec.status === 'Holiday' || rec.status === 'Week Off' || rec.status === 'On Leave') {
      isLate = false;
    } else if (rec.checkIn && rec.checkIn !== '--:--') {
      isLate = isCheckInLate(rec.checkIn, shiftStartTime, graceMins);
    } else {
      isLate = rec.status === 'Late' || (rec.lateStatus ? rec.lateStatus !== 'On Time' && rec.lateStatus !== 'N/A' : false);
    }
    if (isLate) {
      lateCount++;
      if (rec.lateStatus === 'Severely Late') {
        severelyLateCount++;
      }
    }
  });

  const allowedCount = policy.allowedLateCount ?? 3;
  const exceededCount = Math.max(0, lateCount - allowedCount);

  // Warning System logic
  let warningIssued = false;
  let warningMessage = '';
  if (policy.warningSystemEnabled) {
    if (lateCount > 0 && lateCount <= allowedCount) {
      warningIssued = true;
      warningMessage = `Late Warning: ${lateCount} of ${allowedCount} allowed late arrivals used this month.`;
    } else if (lateCount > allowedCount) {
      warningIssued = true;
      warningMessage = `⚠️ Late Limit Exceeded: ${lateCount} late arrivals recorded this month (Allowed: ${allowedCount}).`;
    }
  }

  if (lateCount === 0) {
    return {
      ...defaultResult,
      allowedLateCount: allowedCount,
      warningIssued,
      warningMessage,
      isConfidential: policy.deductionVisibility === 'GENERIC',
      genericCategoryLabel: policy.genericCategoryLabel || 'OTHERS'
    };
  }

  let deductionAmount = 0;
  let ruleApplied = '';
  let halfDaysLateCount = 0;
  let lopDaysLateCount = 0;

  const halfDayEnabled = Boolean(policy.halfDayRuleEnabled ?? (policy as any).halfDayTriggerEnabled ?? true);
  const lopEnabled = Boolean(policy.lopRuleEnabled ?? (policy as any).lopTriggerEnabled ?? true);
  const isNewPolicyConfigured = policy.allowedLateCount !== undefined || halfDayEnabled || lopEnabled;

  if (isNewPolicyConfigured) {
    // 7-Field Late Policy Engine: Evaluate late occurrences
    // Rules:
    // - 1st to allowedCount: Within allowed count (no deduction)
    // - Occurrence k (k > allowedCount):
    //   - If LOP enabled & k >= lopThresholdCount -> 1 Day LOP
    //   - Else if Half-Day enabled & k >= halfDayThresholdCount -> 0.5 Day Half-Day
    //   - Do not apply both Half-Day and full-day LOP for the same late occurrence
    const halfDayThreshold = policy.halfDayThresholdCount ?? 4;
    const lopThreshold = policy.lopThresholdCount ?? 6;

    for (let k = 1; k <= lateCount; k++) {
      if (k <= allowedCount) {
        // Free late arrival
        continue;
      }

      const triggersLop = Boolean(lopEnabled && k >= lopThreshold);
      const triggersHalfDay = Boolean(halfDayEnabled && k >= halfDayThreshold);

      if (triggersLop) {
        lopDaysLateCount++;
      } else if (triggersHalfDay) {
        halfDaysLateCount++;
      }
    }

    const lopDeduction = lopDaysLateCount * dailySalary;
    const halfDayDeduction = halfDaysLateCount * (dailySalary * 0.5);
    deductionAmount = lopDeduction + halfDayDeduction;

    const parts: string[] = [];
    parts.push(`${allowedCount} Free`);
    if (halfDaysLateCount > 0) parts.push(`${halfDaysLateCount} Half-Day penalty`);
    if (lopDaysLateCount > 0) parts.push(`${lopDaysLateCount} Loss of Pay (LOP) penalty`);
    if (halfDaysLateCount === 0 && lopDaysLateCount === 0 && exceededCount > 0) {
      parts.push(`${exceededCount} exceeded (monitoring only)`);
    }
    ruleApplied = `${parts.join(', ')} (${lateCount} late entries)`;
  } else {
    // Legacy fallback rule engine if configured with legacy lateRuleType
    switch (policy.lateRuleType) {
      case 'FIXED_AMOUNT': {
        const perLate = toNum(policy.fixedAmount || 100);
        deductionAmount = lateCount * perLate;
        ruleApplied = `Fixed ${formatCurrency(perLate)} per late entry (${lateCount} entries)`;
        break;
      }
      case 'PERCENTAGE_DAILY': {
        const pct = toNum(policy.percentageOfDailySalary || 5);
        const perOccurrence = (dailySalary * pct) / 100;
        deductionAmount = Math.round(lateCount * perOccurrence);
        ruleApplied = `${pct}% of Daily Salary (${formatCurrency(perOccurrence)}) × ${lateCount}`;
        break;
      }
      case 'COUNT_BASED': {
        const tiers = policy.countTiers || [
          { id: 't1', minCount: 1, maxCount: 3, deductionPerOccurrence: 0 },
          { id: 't2', minCount: 4, maxCount: 5, deductionPerOccurrence: 100 },
          { id: 't3', minCount: 6, maxCount: null, deductionPerOccurrence: 200 }
        ];
        for (let i = 1; i <= lateCount; i++) {
          const tier = tiers.find(t => i >= t.minCount && (t.maxCount === null || i <= t.maxCount));
          if (tier) deductionAmount += toNum(tier.deductionPerOccurrence);
        }
        ruleApplied = `Count-based tiered late deduction for ${lateCount} entries`;
        break;
      }
      case 'HALF_DAY_CONVERSION': {
        const halfDays = severelyLateCount;
        halfDaysLateCount = halfDays;
        deductionAmount = Math.round(halfDays * (dailySalary * 0.5));
        ruleApplied = `${halfDays} entries converted to half-day deductions`;
        break;
      }
      case 'CUSTOM_FORMULA': {
        if (policy.customFormula) {
          deductionAmount = evaluateFormula(policy.customFormula, {
            LATE_COUNT: lateCount,
            DAILY_SALARY: dailySalary,
            BASIC: basicSalary
          });
          ruleApplied = `Formula: ${policy.customFormula}`;
        }
        break;
      }
      default: {
        ruleApplied = `Monitored (${lateCount} entries)`;
        break;
      }
    }
  }

  return {
    lateCount,
    severelyLateCount,
    allowedLateCount: allowedCount,
    exceededLateCount: exceededCount,
    halfDaysLateCount,
    lopDaysLateCount,
    warningIssued,
    warningMessage,
    deductionAmount: Math.max(0, Math.round(deductionAmount)),
    ruleApplied,
    isConfidential: policy.deductionVisibility === 'GENERIC',
    genericCategoryLabel: policy.genericCategoryLabel || 'OTHERS',
    details: `${policy.policyName}: ${ruleApplied}`
  };
};

// ========================================================
// 3. LEAVE DEDUCTION EVALUATION
// ========================================================
export interface LeaveDeductionResult {
  totalUnpaidDays: number;
  allowedFreeDays: number;
  excessUnpaidDays: number;
  deductionAmount: number;
  ruleApplied: string;
  isConfidential: boolean;
  genericCategoryLabel: string;
  details: string;
  sandwichUnpaidDays?: number;
  sandwichDeduction?: number;
}

/**
 * Evaluates the master leave policy for an employee over a month to calculate unpaid leave deductions.
 */
export const evaluateLeaveDeductions = (
  employee: Employee,
  leaveRequests: LeaveRequest[],
  policy: MasterLeavePolicy | undefined,
  dailySalary: number,
  basicSalary: number,
  monthYear?: { month: number; year: number }
): LeaveDeductionResult => {
  const defaultResult: LeaveDeductionResult = {
    totalUnpaidDays: 0,
    allowedFreeDays: 0,
    excessUnpaidDays: 0,
    deductionAmount: 0,
    ruleApplied: 'None',
    isConfidential: false,
    genericCategoryLabel: 'OTHERS',
    details: 'No unpaid leave deduction',
    sandwichUnpaidDays: 0,
    sandwichDeduction: 0
  };

  // Find all approved leaves for this employee (filtered to target month/year when provided)
  const approvedLeaves = leaveRequests.filter(l => {
    if (l.employeeId !== employee.employeeId || l.status !== 'Approved') return false;
    if (!monthYear) return true;
    const startIso = normalizeDateToISO(l.startDate);
    const endIso = normalizeDateToISO(l.endDate) || startIso;
    if (!startIso) return false;
    const monthStart = `${monthYear.year}-${String(monthYear.month).padStart(2, '0')}-01`;
    const totalDays = getCalendarDaysInMonth(monthYear.month, monthYear.year);
    const monthEnd = `${monthYear.year}-${String(monthYear.month).padStart(2, '0')}-${String(totalDays).padStart(2, '0')}`;
    return startIso <= monthEnd && (endIso || startIso) >= monthStart;
  });

  const isProv = policy?.applicableEmploymentType === 'Provisional' || 
    policy?.id === 'LP-MASTER-PROVISIONAL' || 
    (policy?.policyName || '').toLowerCase().includes('provisional') || 
    (policy?.policyName || '').toLowerCase().includes('probation');

  let paidLeavesTaken = 0;
  let regularUnpaidDays = 0;
  let sandwichUnpaidDays = 0;

  approvedLeaves.forEach(l => {
    const leaveName = (l.leaveType || '').toLowerCase();
    const isExplicitUnpaid = leaveName.includes('unpaid') || 
      leaveName.includes('lop') || 
      leaveName.includes('loss of pay') || 
      leaveName.includes('lwp') || 
      leaveName.includes('without pay');
    const explicitUnpaidCount = toNum((l as any).unpaidDaysCount);
    if (isExplicitUnpaid) {
      regularUnpaidDays += toNum(l.daysCount);
    } else if (explicitUnpaidCount > 0) {
      regularUnpaidDays += explicitUnpaidCount;
      paidLeavesTaken += Math.max(0, toNum(l.daysCount) - explicitUnpaidCount);
    } else {
      paidLeavesTaken += toNum(l.daysCount);
    }

    // Also include unpaid sandwich days
    if (l.unpaidSandwichDays && l.unpaidSandwichDays > 0) {
      sandwichUnpaidDays += toNum(l.unpaidSandwichDays);
    } else if (l.sandwichDetails?.unpaidDays && l.sandwichDetails.unpaidDays > 0 && !isExplicitUnpaid) {
      sandwichUnpaidDays += toNum(l.sandwichDetails.unpaidDays);
    }
  });

  // Approved paid leaves remain paid; only explicit unpaid leaves and unpaid sandwich days count as LOP
  const freeDays = isProv ? 0 : (policy ? toNum(policy.monthlyFreeUnpaidLeaves ?? 0) : 0);
  const totalUnpaidDays = regularUnpaidDays + sandwichUnpaidDays;
  const excessUnpaidDays = Math.max(0, totalUnpaidDays - freeDays);

  const sandwichDeduction = Math.round(sandwichUnpaidDays * dailySalary);

  if (totalUnpaidDays === 0 || excessUnpaidDays === 0) {
    return {
      ...defaultResult,
      totalUnpaidDays,
      allowedFreeDays: freeDays,
      excessUnpaidDays: 0,
      deductionAmount: 0,
      ruleApplied: 'No Unpaid Leave / LOP',
      isConfidential: policy?.deductionVisibility === 'GENERIC',
      genericCategoryLabel: policy?.genericCategoryLabel || 'OTHERS',
      details: paidLeavesTaken > 0
        ? `${paidLeavesTaken} approved paid leave day(s) included in paid days.`
        : 'No unpaid leave deduction'
    };
  }

  let deductionAmount = 0;
  let ruleApplied = '';

  const ruleType = policy?.deductionRuleType || 'DAILY_SALARY';

  switch (ruleType) {
    case 'DAILY_SALARY': {
      const multiplier = toNum(policy?.dailySalaryMultiplier || 1);
      deductionAmount = excessUnpaidDays * (dailySalary * multiplier);
      ruleApplied = `${excessUnpaidDays} LOP day(s) × Daily Salary (${formatCurrency(dailySalary * multiplier)})`;
      break;
    }

    case 'FIXED_AMOUNT': {
      const perDay = toNum(policy?.fixedDeductionAmount || 1000);
      deductionAmount = excessUnpaidDays * perDay;
      ruleApplied = `Fixed ${formatCurrency(perDay)} per LOP day (${excessUnpaidDays} days)`;
      break;
    }

    case 'PERCENTAGE': {
      const pct = toNum(policy?.percentageOfDailySalary || 100);
      deductionAmount = excessUnpaidDays * ((dailySalary * pct) / 100);
      ruleApplied = `${pct}% of Daily Salary for ${excessUnpaidDays} LOP day(s)`;
      break;
    }

    case 'CUSTOM_FORMULA': {
      if (policy?.customFormula) {
        deductionAmount = evaluateFormula(policy.customFormula, {
          UNPAID_DAYS: excessUnpaidDays,
          DAILY_SALARY: dailySalary,
          BASIC: basicSalary
        });
        ruleApplied = `Formula: ${policy.customFormula}`;
      } else {
        deductionAmount = excessUnpaidDays * dailySalary;
      }
      break;
    }
  }

  return {
    totalUnpaidDays,
    allowedFreeDays: freeDays,
    excessUnpaidDays,
    deductionAmount: Math.max(0, Math.round(deductionAmount)),
    ruleApplied,
    isConfidential: policy?.deductionVisibility === 'GENERIC',
    genericCategoryLabel: policy?.genericCategoryLabel || 'OTHERS',
    details: `${policy?.policyName || 'Unpaid Leave Policy'}: ${ruleApplied}${sandwichUnpaidDays > 0 ? ` (includes ${sandwichUnpaidDays} unpaid sandwich day(s))` : ''}`,
    sandwichUnpaidDays,
    sandwichDeduction
  };
};

// ========================================================
// 4. STATUTORY CONTRIBUTIONS (PF, ESIC, PT)
// ========================================================
export interface StatutoryDeductionsResult {
  epfDeduction: number;
  esiDeduction: number;
  employerEpfContribution?: number;
  employerEsiContribution?: number;
  professionalTax: number;
  totalStatutory: number;
  epfRule: string;
  esiRule: string;
  pfBaseAmount?: number;
  pfBaseLabel?: string;
  pfFormulaLabel?: string;
  esicFormulaLabel?: string;
  isEsicExempt?: boolean;
  esicCovered?: boolean;
  esicContributionBase?: number;
  pfStatutoryWarning?: string;
  pfActive?: boolean;
  esicActive?: boolean;
  ptActive?: boolean;
}

export const resolveEmployeeWithPf = (employee?: Pick<Employee, 'withPf' | 'salaryDetails'> | null): boolean => {
  const scheme = employee?.salaryDetails?.salaryScheme;
  if (scheme === 'WITH_PF') return true;
  if (scheme === 'WITHOUT_PF') return false;
  if (employee?.salaryDetails?.withPf !== undefined) return Boolean(employee.salaryDetails.withPf);
  if (employee?.withPf !== undefined) return Boolean(employee.withPf);
  return true;
};

export type StatutoryDeductionKind = 'PF' | 'ESIC' | 'PT';

export const getStatutoryDeductionKind = (component: Pick<SalaryComponentConfig, 'code' | 'name'>): StatutoryDeductionKind | null => {
  const code = (component.code || '').trim().toUpperCase();
  const name = (component.name || '').trim().toLowerCase();
  const combined = `${code} ${name}`;

  if (
    ['PF', 'EPF', 'ERF', 'PF_EMPLOYEE', 'EMPLOYEE_PF'].includes(code) ||
    combined.includes('provident fund') ||
    combined.includes('employee pf') ||
    combined.includes(' epf ')
  ) {
    return 'PF';
  }

  if (
    ['ESIC', 'ESI'].includes(code) ||
    combined.includes('state insurance') ||
    combined.includes('esic') ||
    combined.includes('esi contribution')
  ) {
    return 'ESIC';
  }

  if (['PT', 'PROFESSIONAL_TAX'].includes(code) || combined.includes('professional tax')) {
    return 'PT';
  }

  return null;
};

export interface PayrollFormulaContextInput {
  basic: number;
  da?: number;
  conveyance?: number;
  hra?: number;
  gross: number;
  ctc: number;
  attendanceBonus?: number;
  overtime?: number;
  overtimeAmount?: number;
  customContext?: Record<string, number>;
}

export const buildPayrollFormulaContext = ({
  basic,
  da = 0,
  conveyance = 0,
  hra = 0,
  gross,
  ctc,
  attendanceBonus = 0,
  overtime,
  overtimeAmount,
  customContext = {}
}: PayrollFormulaContextInput): FormulaContext => {
  const otVal = toNum(overtime ?? overtimeAmount ?? 0);
  const context: FormulaContext = {
    BASIC: toNum(basic),
    DA: toNum(da),
    CONV: toNum(conveyance),
    CONVEYANCE: toNum(conveyance),
    HRA: toNum(hra),
    GROSS: toNum(gross),
    CTC: toNum(ctc),
    ATTENDANCE_BONUS: toNum(attendanceBonus),
    OT: otVal,
    OVERTIME: otVal
  };

  Object.entries(customContext || {}).forEach(([key, value]) => {
    const amount = toNum(value);
    context[key] = amount;
    context[key.toUpperCase()] = amount;
  });

  return context;
};

export const getComponentCalculationDescription = (
  component: Pick<SalaryComponentConfig, 'calculationMethod' | 'defaultValue' | 'percentageBase' | 'formula'>
): string => {
  if (component.calculationMethod === 'FIXED_AMOUNT') {
    return `Fixed ${formatCurrency(component.defaultValue || 0)}`;
  }
  if (component.calculationMethod === 'PERCENTAGE') {
    return `${component.defaultValue || 0}% of ${component.percentageBase || 'GROSS'}`;
  }
  if (component.calculationMethod === 'ATTENDANCE_OT') {
    return 'Attendance-Based Approved Overtime (OT)';
  }
  if (component.calculationMethod === 'FORMULA') {
    return component.formula ? `Formula: ${component.formula}` : 'Formula not configured';
  }
  return '';
};

export const calculateConfiguredComponentAmount = (
  component: SalaryComponentConfig,
  context: FormulaContext
): number => {
  if (!component.active) return 0;

  if (component.calculationMethod === 'ATTENDANCE_OT') {
    return Math.max(0, Math.round((toNum(context.OT ?? context.OVERTIME) + Number.EPSILON) * 100) / 100);
  }

  if (component.calculationMethod === 'FIXED_AMOUNT') {
    return Math.max(0, Math.round(toNum(component.defaultValue) * 100) / 100);
  }

  if (component.calculationMethod === 'PERCENTAGE') {
    const baseKey = component.percentageBase || 'GROSS';
    const base = toNum(context[baseKey], baseKey === 'CTC' ? context.CTC : context.GROSS);
    return Math.max(0, Math.round(((base * toNum(component.defaultValue)) / 100 + Number.EPSILON) * 100) / 100);
  }

  if (component.calculationMethod === 'FORMULA' && component.formula) {
    return Math.max(0, Math.round((evaluateFormula(component.formula, context) + Number.EPSILON) * 100) / 100);
  }

  return 0;
};

export interface ConfiguredDeductionLine {
  id: string;
  name: string;
  code: string;
  amount: number;
  description: string;
  statutoryKind: StatutoryDeductionKind | null;
  isConfidential: boolean;
}

export const calculateConfiguredDeductionLines = (
  components: SalaryComponentConfig[] | undefined,
  context: FormulaContext,
  options: { withPf?: boolean; esicSalaryLimit?: number; employeeContext?: EmployeeSalaryEligibilityContext } = {}
): ConfiguredDeductionLine[] => {
  const withPf = options.withPf !== false;
  const gross = toNum(context.GROSS);
  const esicLimit = toNum(options.esicSalaryLimit);

  return (components || [])
    .filter(component => {
      if (!component.active || component.type !== 'DEDUCTION') return false;
      if (options.employeeContext) {
        const evalCtx: EmployeeSalaryEligibilityContext = {
          ...options.employeeContext,
          monthlyCtc: options.employeeContext.monthlyCtc ?? toNum(context.CTC),
          basicSalary: options.employeeContext.basicSalary ?? toNum(context.BASIC),
          grossSalary: gross,
          withPf,
        };
        if (!isComponentEligible(component, evalCtx)) return false;
      }
      return true;
    })
    .map(component => {
      const statutoryKind = getStatutoryDeductionKind(component);
      let amount = calculateConfiguredComponentAmount(component, context);
      let description = getComponentCalculationDescription(component);

      const isCoveredUnderEsic =
        gross <= esicLimit || options.employeeContext?.isContributionPeriodContinuation === true;
      if ((statutoryKind === 'PF' || statutoryKind === 'ESIC') && !withPf) {
        amount = 0;
        description = 'Exempt Scheme';
      } else if (statutoryKind === 'ESIC' && component.calculationMethod !== 'FORMULA' && esicLimit > 0 && !isCoveredUnderEsic) {
        amount = 0;
        description = `Exempt: Gross ${formatCurrency(gross)} exceeds ${formatCurrency(esicLimit)}`;
      }

      return {
        id: component.id,
        name: component.name,
        code: component.code,
        amount,
        description,
        statutoryKind,
        isConfidential: component.isConfidential
      };
    });
};

export const evaluateStatutoryContributions = (
  basicSalary: number,
  grossSalary: number,
  payrollConfig: PayrollSettingsConfig | undefined,
  withPf: boolean = true,
  da: number = 0,
  conveyance: number = 0,
  hra: number = 0,
  attendanceBonus: number = 0,
  overtime: number = 0,
  customContext?: Record<string, number>
): StatutoryDeductionsResult => {
  const ptActive = !payrollConfig
    ? true
    : (payrollConfig.enableProfessionalTax !== false && (payrollConfig as any)?.ptPolicy?.enabled !== false);
  let professionalTax = 0;
  if (ptActive) {
    professionalTax = payrollConfig?.standardPtAmount || 200;
  }
  const pfActive = payrollConfig?.pfPolicy?.active !== false;
  const esicActive = payrollConfig?.esicPolicy?.active !== false;

  // Scheme 1: Without PF & ESIC (New Employee / Under 6 Months probation)
  // PF and ESIC are strictly 0!
  if (!withPf) {
    return {
      epfDeduction: 0,
      esiDeduction: 0,
      professionalTax,
      totalStatutory: professionalTax,
      epfRule: 'Exempt (New Employee / < 6 Months)',
      esiRule: 'Exempt (New Employee / < 6 Months)',
      pfBaseAmount: 0,
      pfBaseLabel: 'Exempt Scheme',
      pfFormulaLabel: 'Exempt (0%)',
      esicFormulaLabel: 'Exempt (0%)',
      isEsicExempt: true,
      pfActive,
      esicActive,
      ptActive
    };
  }

  // Scheme 2: With PF & ESIC (Eligible / > 6 Months)
  let epfDeduction = 0;
  let epfRule = '';
  let pfBaseAmount = 0;
  let pfBaseLabel = 'PF Base (Basic + DA + Conv)';
  let pfFormulaLabel = '';

  if (!pfActive) {
    epfDeduction = 0;
    epfRule = 'Inactive in Settings';
    pfFormulaLabel = 'Disabled';
  } else {
    const pfRate = payrollConfig?.pfPolicy?.percentage ?? 12;
    const calcType = payrollConfig?.pfPolicy?.calculationType || 'PERCENTAGE';
    const calcBase = payrollConfig?.pfPolicy?.calculationBase || 'CUSTOM';

    // Build context for formula evaluation
    const formulaContext: FormulaContext = {
      BASIC: basicSalary,
      DA: da,
      CONV: conveyance,
      CONVEYANCE: conveyance,
      HRA: hra,
      GROSS: grossSalary,
      CTC: grossSalary,
      ATTENDANCE_BONUS: attendanceBonus,
      OT: overtime,
      OVERTIME: overtime,
      ...(customContext || {})
    };

    if (calcType === 'FORMULA' && payrollConfig?.pfPolicy?.formula) {
      epfDeduction = Math.round(evaluateFormula(payrollConfig.pfPolicy.formula, formulaContext));
      epfRule = `Formula: ${payrollConfig.pfPolicy.formula}`;
      pfFormulaLabel = payrollConfig.pfPolicy.formula;

      const upperForm = payrollConfig.pfPolicy.formula.toUpperCase();
      if (upperForm.includes('BASIC') && (upperForm.includes('DA') || upperForm.includes('CONV'))) {
        pfBaseAmount = basicSalary + da + conveyance;
        pfBaseLabel = 'Basic + DA + Conv';
      } else if (upperForm.includes('BASIC')) {
        pfBaseAmount = basicSalary;
        pfBaseLabel = 'Basic';
      } else if (upperForm.includes('GROSS')) {
        pfBaseAmount = grossSalary;
        pfBaseLabel = 'Gross';
      } else {
        pfBaseAmount = basicSalary;
        pfBaseLabel = 'Base';
      }
    } else if (calcType === 'FIXED_AMOUNT') {
      epfDeduction = Math.round(payrollConfig?.pfPolicy?.fixedAmount || 0);
      pfBaseAmount = epfDeduction;
      pfBaseLabel = 'Fixed Base';
      epfRule = `Fixed Amount ${formatCurrency(epfDeduction)}`;
      pfFormulaLabel = `Fixed ${formatCurrency(epfDeduction)}`;
    } else {
      // PERCENTAGE mode (Statutory PF base = Basic + DA + Conveyance; ordinary OT is excluded from PF base)
      if (calcBase === 'BASIC') {
        pfBaseAmount = basicSalary;
        pfBaseLabel = 'Basic';
      } else if (calcBase === 'GROSS') {
        pfBaseAmount = Math.max(0, grossSalary - overtime);
        pfBaseLabel = 'Gross (Excl. OT)';
      } else {
        pfBaseAmount = basicSalary + da + conveyance;
        pfBaseLabel = 'Basic + DA + Conv';
      }
      epfDeduction = Math.round((pfBaseAmount * pfRate) / 100);
      epfRule = `${pfRate}% of Base ${formatCurrency(pfBaseAmount)}`;
      pfFormulaLabel = `${pfRate}%`;
    }
  }

  const employerPfRate = payrollConfig?.pfPolicy?.employerPercentage ?? 12;
  const employerEpfContribution = pfActive ? Math.round(((pfBaseAmount * employerPfRate) / 100 + Number.EPSILON) * 100) / 100 : 0;

  // ESIC Calculation:
  // Eligibility under standard ceiling (₹21,000) excludes overtime remuneration;
  // Once covered, overtime wages ARE included in the ESIC contribution wage base.
  const esicLimit = payrollConfig?.esicPolicy?.grossSalaryLimit || 21000;
  const regularGrossExcludingOt = Math.max(0, grossSalary - overtime);
  const esicBase = basicSalary + da + conveyance + hra + attendanceBonus + overtime;
  let esiDeduction = 0;
  let employerEsiContribution = 0;
  let esiRule = '';
  let esicFormulaLabel = '';
  let isEsicExempt = false;

  if (!esicActive) {
    esiDeduction = 0;
    esiRule = 'Inactive in Settings';
    esicFormulaLabel = 'Disabled';
  } else if (regularGrossExcludingOt <= esicLimit || grossSalary <= esicLimit || esicBase <= esicLimit) {
    const esicRate = payrollConfig?.esicPolicy?.percentage ?? 0.75;
    const employerEsicRate = payrollConfig?.esicPolicy?.employerPercentage ?? 3.25;
    if (payrollConfig?.esicPolicy?.formula) {
      esiDeduction = Math.round(evaluateFormula(payrollConfig.esicPolicy.formula, {
        GROSS: grossSalary,
        BASIC: basicSalary,
        HRA: hra,
        DA: da,
        CONV: conveyance,
        CONVEYANCE: conveyance,
        OT: overtime,
        OVERTIME: overtime,
        ATTENDANCE_BONUS: attendanceBonus,
        ...(customContext || {})
      }));
      esiRule = `Formula: ${payrollConfig.esicPolicy.formula}`;
      esicFormulaLabel = payrollConfig.esicPolicy.formula;
    } else {
      esiDeduction = Math.round((grossSalary * esicRate) / 100);
      esiRule = `${esicRate}% of Gross ${formatCurrency(grossSalary)}`;
      esicFormulaLabel = `${esicRate}%`;
    }
    employerEsiContribution = Math.round(((grossSalary * employerEsicRate) / 100 + Number.EPSILON) * 100) / 100;
  } else {
    isEsicExempt = true;
    esiDeduction = 0;
    esiRule = `Regular Gross ${formatCurrency(regularGrossExcludingOt)} exceeds wage ceiling ${formatCurrency(esicLimit)}`;
    esicFormulaLabel = `Exempt (> ${formatCurrency(esicLimit)})`;
  }

  return {
    epfDeduction,
    esiDeduction,
    employerEpfContribution,
    employerEsiContribution,
    professionalTax,
    totalStatutory: epfDeduction + esiDeduction + professionalTax,
    epfRule,
    esiRule,
    pfBaseAmount,
    pfBaseLabel,
    pfFormulaLabel,
    esicFormulaLabel,
    isEsicExempt,
    esicCovered: !isEsicExempt && esicActive,
    esicContributionBase: !isEsicExempt && esicActive ? grossSalary : 0,
    pfActive,
    esicActive,
    ptActive
  };
};

export interface SalaryBreakdownResult {
  monthlyCtc: number;
  basicSalary: number;
  da: number;
  conveyance: number;
  hra: number;
  customComponents: Record<string, number>;
  grossSalary: number;
}

/**
 * Centrally and dynamically calculates the complete salary component breakdown
 * based strictly on the active earnings configured in Settings → Payroll Settings.
 * If zero components are configured, returns a clean slate without mock values.
 */
export const calculateSalaryBreakdown = (
  ctcVal: number,
  components: SalaryComponentConfig[],
  employeeContext?: EmployeeSalaryEligibilityContext
): SalaryBreakdownResult => {
  const ctc = Math.max(0, ctcVal);
  const eligibleComponents = employeeContext
    ? filterEligibleComponents(components, { ...employeeContext, monthlyCtc: ctc })
    : filterEligibleComponents(components, { monthlyCtc: ctc });
  const activeEarnings = (eligibleComponents || []).filter(c => c.active && c.type === 'EARNING');

  if (activeEarnings.length === 0) {
    return {
      monthlyCtc: ctc,
      basicSalary: ctc,
      da: 0,
      conveyance: 0,
      hra: 0,
      customComponents: {},
      grossSalary: ctc
    };
  }

  const customVals: Record<string, number> = {};
  let basic = 0;
  let da = 0;
  let conveyance = 0;
  let hra = 0;

  // 1. Identify primary base component (e.g. BASIC or first earning)
  const basicComp = activeEarnings.find(c => c.code === 'BASIC' || c.name.toLowerCase().includes('basic'));
  if (basicComp) {
    if (basicComp.calculationMethod === 'PERCENTAGE') {
      const pct = basicComp.defaultValue || 0;
      basic = Math.round((ctc * pct) / 100);
    } else if (basicComp.calculationMethod === 'FIXED_AMOUNT') {
      basic = Math.round(basicComp.defaultValue || 0);
    }
    customVals[basicComp.code] = basic;
  }

  // 2. Evaluate CTC-percentage components & fixed amounts
  activeEarnings.forEach(comp => {
    if (comp === basicComp) return;
    if (comp.calculationMethod === 'FIXED_AMOUNT') {
      customVals[comp.code] = Math.round(comp.defaultValue || 0);
    } else if (comp.calculationMethod === 'PERCENTAGE' && (comp.percentageBase === 'CTC' || !comp.percentageBase)) {
      customVals[comp.code] = Math.round((ctc * (comp.defaultValue || 0)) / 100);
    }
  });

  // If no basic component was found, derive basic from first component or 40%
  if (!basicComp) {
    const firstCode = activeEarnings[0]?.code;
    basic = customVals[firstCode] || Math.round(ctc * 0.40);
  }

  // 3. Evaluate BASIC-percentage components
  activeEarnings.forEach(comp => {
    if (comp.calculationMethod === 'PERCENTAGE' && comp.percentageBase === 'BASIC') {
      customVals[comp.code] = Math.round((basic * (comp.defaultValue || 0)) / 100);
    }
  });

  // 4. Evaluate GROSS-percentage & FORMULA components
  const interimGross = Object.values(customVals).reduce((a, b) => a + b, 0);
  activeEarnings.forEach(comp => {
    if (comp.calculationMethod === 'PERCENTAGE' && comp.percentageBase === 'GROSS') {
      customVals[comp.code] = Math.round((interimGross * (comp.defaultValue || 0)) / 100);
    } else if (comp.calculationMethod === 'FORMULA' && comp.formula) {
      customVals[comp.code] = Math.round(evaluateFormula(comp.formula, {
        BASIC: basic,
        CTC: ctc,
        GROSS: interimGross || ctc,
        ...customVals
      }));
    }
  });

  // Map known fields if configured
  if (customVals['BASIC'] !== undefined) basic = customVals['BASIC'];
  if (customVals['DA'] !== undefined) da = customVals['DA'];
  if (customVals['HRA'] !== undefined) hra = customVals['HRA'];
  if (customVals['CONV'] !== undefined) conveyance = customVals['CONV'];
  else if (customVals['CONVEYANCE'] !== undefined) conveyance = customVals['CONVEYANCE'];

  const grossSalary = activeEarnings.reduce((sum, c) => sum + (customVals[c.code] ?? 0), 0);

  return {
    monthlyCtc: ctc,
    basicSalary: basic,
    da,
    conveyance,
    hra,
    customComponents: customVals,
    grossSalary
  };
};

// ========================================================
// 5. EMPLOYEE REWARDS INTEGRATION
// ========================================================
export interface RewardEarningsResult {
  totalRewardEarnings: number;
  rewardItems: EmployeeRewardRecord[];
  rewardBreakdown: { title: string; amount: number }[];
}

export const evaluateEmployeeRewards = (
  employeeId: string,
  rewardRecords: EmployeeRewardRecord[]
): RewardEarningsResult => {
  const eligible = rewardRecords.filter(
    r => r.employeeId === employeeId && r.addToPayroll && r.payrollStatus === 'Pending'
  );

  const total = eligible.reduce((sum, r) => sum + toNum(r.amount), 0);
  const breakdown = eligible.map(r => ({
    title: r.rewardName,
    amount: toNum(r.amount)
  }));

  return {
    totalRewardEarnings: total,
    rewardItems: eligible,
    rewardBreakdown: breakdown
  };
};

// ========================================================
// 6. CENTRAL CALCULATION ENGINE
// ========================================================
export interface PayrollOvertimeOptions {
  overtimeRequests?: OvertimeRequest[];
  departmentOtPolicies?: DepartmentOtPolicy[];
  employeeOtPolicies?: EmployeeOtPolicy[];
  overtimePolicy?: OvertimePolicy;
  directOvertimeHours?: number;
  directOvertimeRate?: number;
  directOvertimeAmount?: number;
  includePaidRequests?: boolean;
  salaryDivisorMode?: string;
  holidays?: HolidayItem[];
  weeklySchedules?: WeeklyScheduleItem[];
  sandwichPolicies?: SandwichLeavePolicy[];
  weekOffEligibilityPolicy?: {
    requireAdjacentPresenceForWeekOff?: boolean;
    requireAdjacentPresenceForHoliday?: boolean;
  };
  autoConvertPendingToLop?: boolean;
  explicitLopDays?: number;
  explicitPaidLeaveDays?: number;
  attendanceBonusEnabled?: boolean;
}

export interface PayrollOvertimeBreakdown {
  approvedOtHours: number;
  overtimeAmount: number;
  hourlyRate: number;
  multiplierApplied: number;
  wageBaseMode: string;
  wageBaseAmount: number;
  divisorUsed: number;
  dailyPaidHours: number;
  calendarDaysInMonth: number;
  formulaDescription: string;
  matchedRequestIds: string[];
  isEligible: boolean;
  eligibilitySource: string;
}

export interface FullPayrollCalculationResult {
  employeeId: string;
  employeeName: string;
  department: string;
  designation: string;
  month: string;
  year: number;
  basicSalary: number;
  allowances: number;
  da?: number;
  conveyance?: number;
  hra?: number;
  withPf?: boolean;
  bonus: number;
  attendanceBonus?: number;
  rewardEarnings: number;
  overtimeHours: number;
  overtimeAmount: number;
  overtimeRate: number;
  otVariableAmount?: number;
  calendarDaysInMonth: number;
  salaryDivisorUsed: number;
  salaryDivisorMode: string;
  grossSalary: number;

  // Deductions
  epfDeduction: number;
  esiDeduction: number;
  employerPfContribution?: number;
  employerEsiContribution?: number;
  professionalTax: number;
  statutoryDeductions: number;
  advanceDeduction: number;
  lateAttendanceDeduction: number;
  unpaidLeaveDeduction: number;
  sandwichUnpaidDays?: number;
  sandwichDeduction?: number;
  totalDeductions: number;

  netSalary: number;

  // Days (Calendar Day Based Payroll Breakdown)
  calendarDays: number;
  eligibleDays: number;
  workingDays: number;
  scheduledWorkingDays: number;
  presentDays: number;
  paidWeekOffDays: number;
  paidHolidayDays: number;
  overlappingHolidayDays: number;
  paidLeaveDays: number;
  lopDays: number;
  paidDays: number;
  totalPaidDays: number;
  pendingAttendanceDays: number;
  paidLeaves: number;
  unpaidLeaves: number;

  // Policy references & details
  lateDetails: LateDeductionResult;
  leaveDetails: LeaveDeductionResult;
  statutoryDetails: StatutoryDeductionsResult;
  rewardDetails: RewardEarningsResult;
  overtimeDetails: PayrollOvertimeBreakdown;
  earningsBreakdown: { name: string; category: 'EARNING'; amount: number; description?: string }[];
  deductionsBreakdown: { name: string; category: 'DEDUCTION'; amount: number; description?: string }[];
}

const isDateMatchingPayrollPeriod = (
  dateStr: string | undefined,
  targetMonthNum: number,
  targetYearNum: number
): boolean => {
  if (!dateStr) return false;
  const clean = String(dateStr).trim();
  // YYYY-MM-DD
  const isoMatch = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return Number(isoMatch[1]) === targetYearNum && Number(isoMatch[2]) === targetMonthNum;
  }
  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmyMatch) {
    return Number(dmyMatch[3]) === targetYearNum && Number(dmyMatch[2]) === targetMonthNum;
  }
  return false;
};

export const calculateEmployeePayroll = (
  employee: Employee,
  attendanceRecords: AttendanceRecord[],
  leaveRequests: LeaveRequest[],
  advanceSalaryRecords: LoanRecord[],
  rewardRecords: EmployeeRewardRecord[],
  attendancePolicy: AttendancePolicy | undefined,
  leavePolicy: MasterLeavePolicy | undefined,
  payrollConfig: PayrollSettingsConfig | undefined,
  month: string = 'August',
  year: number = 2026,
  allShifts: Shift[] = [],
  overtimeOptions?: PayrollOvertimeOptions
): FullPayrollCalculationResult => {
  const configuredComponents = payrollConfig?.components || [];
  const rawEarnings = configuredComponents.filter(c => c.active && c.type === 'EARNING');
  const savedComponentValues: Record<string, number> = {
    ...((employee.allowances as any) || {}),
    ...((employee.salaryDetails as any) || {})
  };

  let basic = toNum(employee.salaryDetails?.basicSalary ?? employee.basicSalary);
  const employeeWithPf = resolveEmployeeWithPf(employee);

  // Dynamic CTC resolution based on configured Basic percentage.
  const basicComp = rawEarnings.find(c => c.code === 'BASIC' || c.name.toLowerCase().includes('basic'));
  const basicPercentage = (basicComp && basicComp.calculationMethod === 'PERCENTAGE' && basicComp.percentageBase === 'CTC' && basicComp.defaultValue > 0)
    ? basicComp.defaultValue
    : 40;
  const totalCtc = employee.salaryDetails?.monthlyCtc || (basic > 0 ? Math.round(basic / (basicPercentage / 100)) : 15000);

  const employeeEligibilityContext: EmployeeSalaryEligibilityContext = {
    id: employee.id,
    employeeId: employee.employeeId,
    monthlyCtc: totalCtc,
    basicSalary: basic,
    withPf: employeeWithPf,
    payrollYear: year,
  };

  const configuredEarnings = filterEligibleComponents(rawEarnings, employeeEligibilityContext);
  const rawDeductions = configuredComponents.filter(c => c.active && c.type === 'DEDUCTION');
  const configuredDeductions = filterEligibleComponents(rawDeductions, employeeEligibilityContext);
  const configuredBreakdown = calculateSalaryBreakdown(totalCtc, configuredEarnings, employeeEligibilityContext);
  const getSavedComponentAmount = (code: string): number | undefined => {
    const lower = code.toLowerCase();
    const raw = savedComponentValues[code] ?? savedComponentValues[lower];
    return raw !== undefined && raw !== null && toNum(raw) > 0 ? toNum(raw) : undefined;
  };

  const earningsBreakdown: { name: string; category: 'EARNING'; amount: number; description?: string }[] = [];

  let calculatedAllowances = 0;
  let dynamicDa = 0;
  let dynamicConveyance = 0;
  let dynamicHra = 0;

  if (configuredEarnings.length > 0) {
    configuredEarnings.forEach(comp => {
      const configuredAmount = configuredBreakdown.customComponents[comp.code] || 0;
      const savedAmount = getSavedComponentAmount(comp.code);
      const actualVal = (savedAmount !== undefined && savedAmount > 0)
        ? savedAmount
        : (configuredAmount > 0 ? configuredAmount : (savedAmount ?? 0));

      if (actualVal > 0) {
        earningsBreakdown.push({
          name: comp.name.trim(),
          category: 'EARNING',
          amount: actualVal,
          description: getComponentCalculationDescription(comp)
        });
      }

      const code = comp.code.toUpperCase();
      if (code === 'BASIC' || comp.name.toLowerCase().includes('basic')) {
        basic = actualVal;
      } else if (code === 'DA') {
        dynamicDa = actualVal;
        calculatedAllowances += actualVal;
      } else if (code === 'CONV' || code === 'CONVEYANCE') {
        dynamicConveyance = actualVal;
        calculatedAllowances += actualVal;
      } else if (code === 'HRA') {
        dynamicHra = actualVal;
        calculatedAllowances += actualVal;
      } else {
        calculatedAllowances += actualVal;
      }
    });
  } else {
    dynamicDa = toNum(employee.allowances?.da ?? employee.salaryDetails?.da);
    dynamicConveyance = toNum(employee.allowances?.conveyance ?? employee.salaryDetails?.conveyance);
    dynamicHra = toNum(employee.allowances?.hra ?? employee.salaryDetails?.hra);
    calculatedAllowances = dynamicDa + dynamicConveyance + dynamicHra;
    if (basic > 0) earningsBreakdown.push({ name: 'Basic Salary', category: 'EARNING', amount: basic });
    if (dynamicDa > 0) earningsBreakdown.push({ name: 'Dearness Allowance (DA)', category: 'EARNING', amount: dynamicDa });
    if (dynamicConveyance > 0) earningsBreakdown.push({ name: 'Conveyance Allowance', category: 'EARNING', amount: dynamicConveyance });
    if (dynamicHra > 0) earningsBreakdown.push({ name: 'House Rent Allowance (HRA)', category: 'EARNING', amount: dynamicHra });
  }

  const da = dynamicDa;
  const conveyance = dynamicConveyance;
  const hra = dynamicHra;
  const allowances = calculatedAllowances;
  const configuredFixedGross = basic + allowances;

  const targetMonthNum = resolveMonthNumber(month);
  const targetYearNum = Number(year) || 2026;

  // Resolve dynamic calendar days (28/29/30/31) and configured payroll salary divisor
  const divisorInfo = resolvePayrollSalaryDivisor({
    month,
    year: targetYearNum,
    payrollConfig,
    overtimePolicy: overtimeOptions?.overtimePolicy,
  });
  const standardDays = divisorInfo.divisor > 0 ? divisorInfo.divisor : (payrollConfig?.standardWorkingDaysPerMonth || 26);
  const calendarDaysInMonth = divisorInfo.calendarDaysInMonth;
  const salaryDivisorMode = divisorInfo.modeUsed;

  const isCeoEmployee = isOwnerOrCEO(employee);

  // 1. Calendar Day Based Attendance & Leave Evaluation
  const calendarBreakdown = calculateCalendarDayPayrollAttendance({
    month: targetMonthNum,
    year: targetYearNum,
    joiningDate: employee.joiningDate || employee.dateOfJoining,
    exitDate: employee.exitDate || employee.relievingDate || employee.lastWorkingDate || employee.terminationDate,
    weeklyOff: employee.shiftDetails?.weeklyOff,
    weeklySchedules: overtimeOptions?.weeklySchedules || [],
    employeeId: employee.employeeId,
    department: employee.department,
    holidays: overtimeOptions?.holidays || [],
    attendanceRecords: isCeoEmployee ? [] : attendanceRecords,
    leaveRequests: isCeoEmployee ? [] : leaveRequests,
    sandwichPolicies: overtimeOptions?.sandwichPolicies || [],
    weekOffEligibilityPolicy: overtimeOptions?.weekOffEligibilityPolicy,
    autoConvertPendingToLop: overtimeOptions?.autoConvertPendingToLop ?? false,
    explicitLopDays: isCeoEmployee ? 0 : overtimeOptions?.explicitLopDays,
    explicitPaidLeaveDays: isCeoEmployee ? 0 : overtimeOptions?.explicitPaidLeaveDays,
  });

  const calendarDays = calendarBreakdown.calendarDays;
  const eligibleDays = isCeoEmployee ? calendarDays : calendarBreakdown.eligibleDays;
  const scheduledWorkingDays = calendarBreakdown.scheduledWorkingDays;
  const workingDays = isCeoEmployee ? scheduledWorkingDays : calendarBreakdown.workingDays;
  const paidWeekOffDays = calendarBreakdown.paidWeekOffDays;
  const paidHolidayDays = calendarBreakdown.paidHolidayDays;
  const overlappingHolidayDays = calendarBreakdown.overlappingHolidayDays;
  const presentDays = isCeoEmployee
    ? Math.max(0, scheduledWorkingDays - paidHolidayDays)
    : calendarBreakdown.presentDays;
  const paidLeaveDays = isCeoEmployee ? 0 : calendarBreakdown.paidLeaveDays;
  const lopDays = isCeoEmployee ? 0 : calendarBreakdown.lopDays;
  const paidDays = isCeoEmployee ? calendarDays : calendarBreakdown.paidDays;
  const totalPaidDays = isCeoEmployee ? calendarDays : calendarBreakdown.totalPaidDays;
  const pendingAttendanceDays = isCeoEmployee ? 0 : calendarBreakdown.pendingAttendanceDays;

  const dailySalary = calendarDays > 0 ? basic / calendarDays : basic / 30;
  const empAtt = isCeoEmployee
    ? []
    : attendanceRecords.filter(
        a => a.employeeId === employee.employeeId && isDateMatchingPayrollPeriod(a.date, targetMonthNum, targetYearNum)
      );

  // 2. Late Attendance Policy Evaluation (with multi-shift support and month/year filtering)
  const lateDetails = evaluateAttendanceLateDeduction(
    employee,
    isCeoEmployee ? [] : attendanceRecords,
    attendancePolicy,
    dailySalary,
    basic,
    allShifts,
    { month: targetMonthNum, year: targetYearNum }
  );
  if (isCeoEmployee) {
    lateDetails.deductionAmount = 0;
  }

  // 3. Leave Policy Evaluation (informational details & policy rules, filtered to month/year)
  const leaveDetails = evaluateLeaveDeductions(
    employee,
    isCeoEmployee ? [] : leaveRequests,
    leavePolicy,
    dailySalary,
    basic,
    { month: targetMonthNum, year: targetYearNum }
  );
  if (isCeoEmployee) {
    leaveDetails.deductionAmount = 0;
    leaveDetails.totalUnpaidDays = 0;
    leaveDetails.excessUnpaidDays = 0;
    leaveDetails.sandwichUnpaidDays = 0;
    leaveDetails.sandwichDeduction = 0;
  } else {
    leaveDetails.totalUnpaidDays = lopDays;
    leaveDetails.excessUnpaidDays = lopDays;
    leaveDetails.deductionAmount = Math.round(((configuredFixedGross * lopDays) / (calendarDays || 30)));
  }

  // 4. Rewards Evaluation
  const rewardDetails = evaluateEmployeeRewards(employee.employeeId, rewardRecords);

  // 5. Calendar Day Proration: Gross Pay = Monthly Gross Salary × Paid Days / Total Calendar Days
  // Full-month eligible employee with 0 LOP receives 100% of configured monthly gross salary.
  const isFullCalendarPay = isCeoEmployee || (paidDays >= calendarDays && calendarDays > 0);
  const prorateSalary = (value: number): number => {
    const numVal = toNum(value);
    if (isFullCalendarPay) return Math.round(numVal);
    if (calendarDays <= 0 || paidDays <= 0) return 0;
    return Math.round((numVal * paidDays) / calendarDays);
  };

  const targetProratedFixedGross = isFullCalendarPay
    ? Math.round(configuredFixedGross)
    : (calendarDays > 0 && paidDays > 0 ? Math.round((configuredFixedGross * paidDays) / calendarDays) : 0);

  let payableBasic = prorateSalary(basic);
  const payableDa = prorateSalary(da);
  const payableConveyance = prorateSalary(conveyance);
  let payableHra = prorateSalary(hra);
  const otherAllowancesRaw = Math.max(0, allowances - (da + conveyance + hra));
  const payableOtherAllowances = prorateSalary(otherAllowancesRaw);

  // Reconcile 1-rupee rounding differences across components so sum equals Monthly Gross × Paid Days / Calendar Days
  const componentSum = payableBasic + payableDa + payableConveyance + payableHra + payableOtherAllowances;
  const componentResidual = targetProratedFixedGross - componentSum;
  if (componentResidual !== 0 && targetProratedFixedGross > 0) {
    if (payableHra > 0 && payableHra + componentResidual >= 0) {
      payableHra += componentResidual;
    } else if (payableBasic > 0 && payableBasic + componentResidual >= 0) {
      payableBasic += componentResidual;
    }
  }
  const payableAllowances = payableDa + payableConveyance + payableHra + payableOtherAllowances;

  earningsBreakdown.forEach(item => {
    item.amount = prorateSalary(item.amount);
    item.description = [item.description, `Paid ${paidDays}/${calendarDays} days`].filter(Boolean).join(' | ');
  });
  if (earningsBreakdown.length > 0 && targetProratedFixedGross > 0) {
    const breakdownSum = earningsBreakdown.reduce((sum, item) => sum + item.amount, 0);
    const breakdownDiff = targetProratedFixedGross - breakdownSum;
    if (breakdownDiff !== 0) {
      const targetIdx = earningsBreakdown.findIndex(i => i.name.toLowerCase().includes('house rent') || i.name.toUpperCase() === 'HRA');
      const idx = targetIdx >= 0 ? targetIdx : earningsBreakdown.length - 1;
      if (earningsBreakdown[idx].amount + breakdownDiff >= 0) {
        earningsBreakdown[idx].amount += breakdownDiff;
      }
    }
  }

  // Attendance bonus: granted only when explicitly enabled in payrollConfig/options and employee achieves full paid eligibility with 0 LOP
  const attendanceBonusEnabled = Boolean(
    (payrollConfig as any)?.attendanceBonusEnabled || overtimeOptions?.attendanceBonusEnabled
  );
  const isFullAttendance =
    !isCeoEmployee &&
    attendanceBonusEnabled &&
    eligibleDays >= calendarDays &&
    lopDays === 0 &&
    paidLeaveDays === 0;
  const attendanceBonus = isFullAttendance ? 1000 : 0;

  const bonus = 0;
  if (attendanceBonus > 0) {
    earningsBreakdown.push({ name: 'Attendance Bonus', category: 'EARNING', amount: attendanceBonus });
  }
  rewardDetails.rewardBreakdown.forEach(item => {
    if (toNum(item.amount) > 0) {
      earningsBreakdown.push({ name: item.title, category: 'EARNING', amount: toNum(item.amount), description: 'Reward configured for payroll' });
    }
  });

  // 6. Enterprise Overtime Calculation & Aggregation (Attendance → Identify → Dept Policy → Approval → Payroll)
  const periodRefDate = `${targetYearNum}-${String(targetMonthNum).padStart(2, '0')}-15`;
  const baseEligibility = resolveEmployeeOtEligibility(
    employee,
    overtimeOptions?.departmentOtPolicies,
    overtimeOptions?.employeeOtPolicies,
    overtimeOptions?.overtimePolicy,
    periodRefDate
  );

  let approvedOtHours = 0;
  let overtimeAmount = 0;
  const matchedRequestIds: string[] = [];
  const seenOtDates = new Set<string>();

  if (!isCeoEmployee && overtimeOptions?.directOvertimeHours !== undefined && overtimeOptions.directOvertimeHours > 0) {
    approvedOtHours = toNum(overtimeOptions.directOvertimeHours);
    if (overtimeOptions.directOvertimeAmount !== undefined && overtimeOptions.directOvertimeAmount >= 0) {
      overtimeAmount = Math.round(toNum(overtimeOptions.directOvertimeAmount));
    } else {
      const directCalc = calculateEnterpriseOvertimeRateAndAmount({
        employee,
        approvedOtHours,
        month,
        year: targetYearNum,
        payrollConfig,
        overtimePolicy: overtimeOptions.overtimePolicy,
        departmentOtPolicies: overtimeOptions.departmentOtPolicies,
        employeeOtPolicies: overtimeOptions.employeeOtPolicies,
        fixedHourlyRate: overtimeOptions.directOvertimeRate,
        dateStr: periodRefDate,
      });
      overtimeAmount = directCalc.overtimeAmount;
    }
  } else if (!isCeoEmployee) {
    const empOtRequests = (overtimeOptions?.overtimeRequests || []).filter(req => {
      if (req.employeeId !== employee.employeeId && req.employeeId !== employee.id) return false;
      const isStatusApproved =
        req.status === 'Approved' ||
        req.status === 'Partially Approved' ||
        (overtimeOptions?.includePaidRequests && req.status === 'Paid');
      if (!isStatusApproved) return false;

      if (!overtimeOptions?.includePaidRequests && (req.status === 'Paid' || req.payrollStatus === 'Paid' || req.payrollStatus === 'Included')) {
        return false;
      }

      // Backdated arrear targeting this payroll month/year
      if (req.isBackdatedArrear && req.targetPayrollMonth && req.targetPayrollYear) {
        return (
          resolveMonthNumber(req.targetPayrollMonth) === targetMonthNum &&
          Number(req.targetPayrollYear) === targetYearNum
        );
      }

      return isDateMatchingPayrollPeriod(req.date, targetMonthNum, targetYearNum);
    });

    empOtRequests.forEach(req => {
      const dateKey = `${employee.employeeId}::${String(req.date).trim()}`;
      if (seenOtDates.has(dateKey)) return; // Prevent duplicate overtime payment for same date

      const dateEligibility = resolveEmployeeOtEligibility(
        employee,
        overtimeOptions?.departmentOtPolicies,
        overtimeOptions?.employeeOtPolicies,
        overtimeOptions?.overtimePolicy,
        req.date
      );
      // Respect department/employee OT eligibility on requests
      if (!dateEligibility.allowed) {
        return;
      }

      const hrs = toNum(req.approvedOtHours > 0 ? req.approvedOtHours : req.otHours);
      if (hrs <= 0) return;

      seenOtDates.add(dateKey);
      matchedRequestIds.push(req.id);
      approvedOtHours += hrs;

      const itemCalc = calculateEnterpriseOvertimeRateAndAmount({
        employee,
        approvedOtHours: hrs,
        month,
        year: targetYearNum,
        payrollConfig,
        overtimePolicy: overtimeOptions?.overtimePolicy,
        departmentOtPolicies: overtimeOptions?.departmentOtPolicies,
        employeeOtPolicies: overtimeOptions?.employeeOtPolicies,
        rateType: req.rateType,
        fixedHourlyRate: req.hourlyRate > 0 ? req.hourlyRate : undefined,
        dateStr: req.date,
      });

      // If policy uses salary-based wageBase (BASIC/GROSS/CTC), use calculated amount; otherwise use itemCalc or explicit otAmount
      const effectiveAmount =
        itemCalc.wageBaseMode !== 'FIXED_HOURLY'
          ? itemCalc.overtimeAmount
          : (toNum(req.otAmount) > 0 ? Math.round((toNum(req.otAmount) + Number.EPSILON) * 100) / 100 : itemCalc.overtimeAmount);
      overtimeAmount += effectiveAmount;
    });

    // Also include approved overtime directly from attendance records for this month if not already in overtimeRequests
    empAtt.forEach(att => {
      if (!isDateMatchingPayrollPeriod(att.date, targetMonthNum, targetYearNum)) return;
      const dateKey = `${employee.employeeId}::${String(att.date).trim()}`;
      if (seenOtDates.has(dateKey)) return;

      const hrs = toNum(att.overtimeHours);
      if (hrs <= 0 || att.otApprovalStatus !== 'Approved') return;

      const dateEligibility = resolveEmployeeOtEligibility(
        employee,
        overtimeOptions?.departmentOtPolicies,
        overtimeOptions?.employeeOtPolicies,
        overtimeOptions?.overtimePolicy,
        att.date
      );
      if (!dateEligibility.allowed) return;

      seenOtDates.add(dateKey);
      approvedOtHours += hrs;
      const attCalc = calculateEnterpriseOvertimeRateAndAmount({
        employee,
        approvedOtHours: hrs,
        month,
        year: targetYearNum,
        payrollConfig,
        overtimePolicy: overtimeOptions?.overtimePolicy,
        departmentOtPolicies: overtimeOptions?.departmentOtPolicies,
        employeeOtPolicies: overtimeOptions?.employeeOtPolicies,
        dateStr: att.date,
      });
      overtimeAmount += attCalc.overtimeAmount;
    });
  }

  approvedOtHours = Math.round((approvedOtHours + Number.EPSILON) * 100) / 100;
  overtimeAmount = Math.round((overtimeAmount + Number.EPSILON) * 100) / 100;

  const summaryOtCalc = calculateEnterpriseOvertimeRateAndAmount({
    employee,
    approvedOtHours,
    month,
    year: targetYearNum,
    payrollConfig,
    overtimePolicy: overtimeOptions?.overtimePolicy,
    departmentOtPolicies: overtimeOptions?.departmentOtPolicies,
    employeeOtPolicies: overtimeOptions?.employeeOtPolicies,
    fixedHourlyRate: overtimeOptions?.directOvertimeRate,
    dateStr: periodRefDate,
  });
  const overtimeRate =
    approvedOtHours > 0
      ? Math.round((overtimeAmount / approvedOtHours) * 100) / 100
      : summaryOtCalc.hourlyRate;

  if (overtimeAmount > 0) {
    earningsBreakdown.push({
      name: `Overtime Pay (${approvedOtHours} hrs)`,
      category: 'EARNING',
      amount: overtimeAmount,
      description: summaryOtCalc.formulaDescription,
    });
  }

  const overtimeDetails: PayrollOvertimeBreakdown = {
    approvedOtHours,
    overtimeAmount,
    hourlyRate: overtimeRate,
    multiplierApplied: summaryOtCalc.multiplierApplied,
    wageBaseMode: summaryOtCalc.wageBaseMode,
    wageBaseAmount: summaryOtCalc.wageBaseAmount,
    divisorUsed: summaryOtCalc.divisorUsed,
    dailyPaidHours: summaryOtCalc.dailyPaidHours,
    calendarDaysInMonth: summaryOtCalc.calendarDaysInMonth,
    formulaDescription: summaryOtCalc.formulaDescription,
    matchedRequestIds,
    isEligible: baseEligibility.allowed,
    eligibilitySource: baseEligibility.eligibilitySource,
  };

  const grossSalaryBeforeOt = payableBasic + payableAllowances + attendanceBonus + bonus + rewardDetails.totalRewardEarnings;
  const grossSalary = Math.round((grossSalaryBeforeOt + overtimeAmount + Number.EPSILON) * 100) / 100;

  const withPf = resolveEmployeeWithPf(employee);
  const esicSalaryLimit = payrollConfig?.esicPolicy?.grossSalaryLimit || 21000;
  // Under ESIC Act, if employee's regular monthly gross (excluding overtime) is within the ceiling,
  // ESIC coverage continues and overtime wages are included in the ESIC contribution base.
  const esicEmployeeContext: EmployeeSalaryEligibilityContext = {
    ...employeeEligibilityContext,
    grossSalary,
    isContributionPeriodContinuation:
      employeeEligibilityContext.isContributionPeriodContinuation ?? (grossSalaryBeforeOt > 0 && grossSalaryBeforeOt <= esicSalaryLimit),
  };

  const payableComponentContext: Record<string, number> = {};
  configuredEarnings.forEach(comp => {
    const configuredAmount = configuredBreakdown.customComponents[comp.code] || 0;
    const savedAmount = getSavedComponentAmount(comp.code);
    const actualVal = (savedAmount !== undefined && savedAmount > 0)
      ? savedAmount
      : (configuredAmount > 0 ? configuredAmount : (savedAmount ?? 0));
    payableComponentContext[comp.code] = prorateSalary(actualVal);
  });

  const deductionContext = buildPayrollFormulaContext({
    basic: payableBasic,
    da: payableDa,
    conveyance: payableConveyance,
    hra: payableHra,
    gross: grossSalary,
    ctc: totalCtc,
    attendanceBonus,
    overtime: overtimeAmount,
    customContext: payableComponentContext
  });
  const configuredDeductionLines = calculateConfiguredDeductionLines(configuredDeductions, deductionContext, {
    withPf,
    esicSalaryLimit,
    employeeContext: esicEmployeeContext
  });

  // Fallback to policy-level statutory evaluation when no explicit deduction components are configured
  const hasConfiguredStatutory = configuredDeductionLines.some(d => d.statutoryKind !== null);
  const fallbackStatutory = !hasConfiguredStatutory
    ? evaluateStatutoryContributions(
        payableBasic,
        grossSalary,
        payrollConfig,
        withPf,
        payableDa,
        payableConveyance,
        payableHra,
        attendanceBonus,
        overtimeAmount,
        payableComponentContext
      )
    : null;

  const epfDeduction = hasConfiguredStatutory
    ? (configuredDeductionLines.find(d => d.statutoryKind === 'PF')?.amount || 0)
    : (fallbackStatutory?.epfDeduction || 0);
  const esiDeduction = hasConfiguredStatutory
    ? (configuredDeductionLines.find(d => d.statutoryKind === 'ESIC')?.amount || 0)
    : (fallbackStatutory?.esiDeduction || 0);
  const professionalTax = hasConfiguredStatutory
    ? (configuredDeductionLines.find(d => d.statutoryKind === 'PT')?.amount || 0)
    : (fallbackStatutory?.professionalTax || 0);
  const configuredDeductionTotal = hasConfiguredStatutory
    ? configuredDeductionLines.reduce((sum, d) => sum + d.amount, 0)
    : (fallbackStatutory?.totalStatutory || 0);

  const statutoryDetails: StatutoryDeductionsResult = {
    epfDeduction,
    esiDeduction,
    employerEpfContribution: fallbackStatutory?.employerEpfContribution ?? Math.round((((payableBasic + payableDa + payableConveyance) * (payrollConfig?.pfPolicy?.employerPercentage ?? 12)) / 100 + Number.EPSILON) * 100) / 100,
    employerEsiContribution: fallbackStatutory?.employerEsiContribution ?? (esiDeduction > 0 ? Math.round(((grossSalary * (payrollConfig?.esicPolicy?.employerPercentage ?? 3.25)) / 100 + Number.EPSILON) * 100) / 100 : 0),
    professionalTax,
    totalStatutory: epfDeduction + esiDeduction + professionalTax,
    epfRule: configuredDeductionLines.find(d => d.statutoryKind === 'PF')?.description || fallbackStatutory?.epfRule || '',
    esiRule: configuredDeductionLines.find(d => d.statutoryKind === 'ESIC')?.description || fallbackStatutory?.esiRule || '',
    pfActive: configuredDeductionLines.some(d => d.statutoryKind === 'PF') || Boolean(fallbackStatutory?.pfActive),
    esicActive: configuredDeductionLines.some(d => d.statutoryKind === 'ESIC') || Boolean(fallbackStatutory?.esicActive),
    ptActive: configuredDeductionLines.some(d => d.statutoryKind === 'PT') || Boolean(fallbackStatutory?.ptActive),
    isEsicExempt: hasConfiguredStatutory
      ? configuredDeductionLines.some(d => d.statutoryKind === 'ESIC' && d.amount === 0)
      : Boolean(fallbackStatutory?.isEsicExempt)
  };

  // 7. Advance Salary / Loan EMI deduction ("Others" deduction)
  let scheduledLoanDeduction = 0;
  if (Array.isArray(advanceSalaryRecords)) {
    advanceSalaryRecords.forEach(adv => {
      if (
        adv.employeeId === employee.employeeId && 
        (adv.status === 'Active' || adv.status === 'Disbursed') &&
        toNum(adv.outstandingBalance) > 0
      ) {
        const nextInst = adv.repaymentSchedule?.find((s: LoanRepaymentInstallment) => s.status === 'Pending');
        let emi = nextInst 
          ? toNum(nextInst.scheduledAmount || nextInst.actualDeducted) 
          : toNum(adv.monthlyDeduction);
        
        // Automatically handle final month: deduct only up to remaining outstanding balance
        const balance = toNum(adv.outstandingBalance);
        emi = Math.min(emi, balance);
        scheduledLoanDeduction += emi;
      }
    });
  }

  // Note: LOP is already deducted via Calendar Day proration of Gross Salary (Paid Days / Calendar Days).
  // Therefore we do NOT subtract LOP a second time from Gross Salary in totalDeductions.
  const preLoanDeductions = configuredDeductionTotal + lateDetails.deductionAmount;
  const availableSalary = Math.max(0, grossSalary - preLoanDeductions);
  const advanceDeduction = Math.min(scheduledLoanDeduction, availableSalary);

  const totalDeductions = Math.round((preLoanDeductions + advanceDeduction + Number.EPSILON) * 100) / 100;
  const netSalary = Math.max(0, Math.round((grossSalary - totalDeductions + Number.EPSILON) * 100) / 100);
  const deductionsBreakdown: { name: string; category: 'DEDUCTION'; amount: number; description?: string }[] = configuredDeductionLines
    .filter(line => line.amount > 0)
    .map(line => ({
      name: line.name,
      category: 'DEDUCTION',
      amount: line.amount,
      description: line.description
    }));
  if (!hasConfiguredStatutory && fallbackStatutory) {
    if (fallbackStatutory.epfDeduction > 0) {
      deductionsBreakdown.push({
        name: 'Provident Fund (EPF)',
        category: 'DEDUCTION',
        amount: fallbackStatutory.epfDeduction,
        description: fallbackStatutory.epfRule,
      });
    }
    if (fallbackStatutory.esiDeduction > 0) {
      deductionsBreakdown.push({
        name: 'ESI Contribution',
        category: 'DEDUCTION',
        amount: fallbackStatutory.esiDeduction,
        description: fallbackStatutory.esiRule,
      });
    }
    if (fallbackStatutory.professionalTax > 0) {
      deductionsBreakdown.push({
        name: 'Professional Tax (PT)',
        category: 'DEDUCTION',
        amount: fallbackStatutory.professionalTax,
      });
    }
  }
  if (lateDetails.deductionAmount > 0) {
    deductionsBreakdown.push({ name: 'Late Attendance Deduction', category: 'DEDUCTION', amount: lateDetails.deductionAmount, description: lateDetails.ruleApplied });
  }
  if (advanceDeduction > 0) {
    deductionsBreakdown.push({ name: 'Advance Salary / Loan Recovery', category: 'DEDUCTION', amount: advanceDeduction });
  }

  return {
    employeeId: employee.employeeId,
    employeeName: `${employee.firstName} ${employee.lastName}`,
    department: employee.department,
    designation: employee.designation,
    month,
    year: targetYearNum,
    basicSalary: payableBasic,
    allowances: payableAllowances,
    da: payableDa,
    conveyance: payableConveyance,
    hra: payableHra,
    withPf,
    bonus,
    attendanceBonus,
    rewardEarnings: rewardDetails.totalRewardEarnings,
    overtimeHours: approvedOtHours,
    overtimeAmount,
    overtimeRate,
    otVariableAmount: overtimeAmount,
    calendarDaysInMonth: calendarDays,
    salaryDivisorUsed: standardDays,
    salaryDivisorMode,
    grossSalary,

    epfDeduction,
    esiDeduction,
    employerPfContribution: statutoryDetails.employerEpfContribution,
    employerEsiContribution: statutoryDetails.employerEsiContribution,
    professionalTax,
    statutoryDeductions: configuredDeductionTotal,
    advanceDeduction,
    lateAttendanceDeduction: lateDetails.deductionAmount,
    unpaidLeaveDeduction: isCeoEmployee ? 0 : Math.round((configuredFixedGross * lopDays) / (calendarDays || 30)),
    sandwichUnpaidDays: calendarBreakdown.sandwichLopDays || calendarBreakdown.sandwichUnpaidDays || 0,
    sandwichDeduction: leaveDetails.sandwichDeduction || 0,
    totalDeductions,

    netSalary,

    calendarDays,
    eligibleDays,
    workingDays,
    scheduledWorkingDays,
    presentDays,
    paidWeekOffDays,
    paidHolidayDays,
    overlappingHolidayDays,
    paidLeaveDays,
    lopDays,
    paidDays,
    totalPaidDays,
    pendingAttendanceDays,
    paidLeaves: paidLeaveDays,
    unpaidLeaves: lopDays,

    lateDetails,
    leaveDetails,
    statutoryDetails,
    rewardDetails,
    overtimeDetails,
    earningsBreakdown,
    deductionsBreakdown
  };
};

// ========================================================
// 6B. PAYSLIP OVERTIME VISIBILITY FORMATTER
// ========================================================
export interface PayslipOvertimeDisplayResult {
  visibleAsSeparateLine: boolean;
  visible: boolean;
  showHours: boolean;
  showAmount: boolean;
  showCalculationDetails: boolean;
  label: string;
  amount: number;
  hoursText?: string;
  calculationDetailsText?: string;
  description?: string;
  foldedIntoAllowances: boolean;
}

/**
 * Formats overtime display on payslips according to HR/CEO visibility settings
 * WITHOUT altering actual gross earnings, net salary, or statutory disclosures.
 */
export const formatPayslipOvertimeForViewer = (
  hoursOrParams:
    | number
    | {
        overtimeHours: number;
        overtimeAmount: number;
        overtimeRate?: number;
        divisorUsed?: number;
        shiftHours?: number;
        dailyPaidHours?: number;
        multiplierLabel?: string;
        multiplierApplied?: number;
        wageBaseMode?: string;
        visibility?: PayslipOvertimeVisibilityConfig;
      },
  overtimeAmountArg?: number,
  overtimeRateArg?: number,
  visibilityConfigArg?: PayslipOvertimeVisibilityConfig,
  extraDetailsArg?: {
    divisorUsed?: number;
    dailyPaidHours?: number;
    shiftHours?: number;
    multiplierApplied?: number;
    multiplierLabel?: string;
    wageBaseMode?: string;
  }
): PayslipOvertimeDisplayResult => {
  const isObj = typeof hoursOrParams === 'object' && hoursOrParams !== null;
  const overtimeHours = isObj ? hoursOrParams.overtimeHours : hoursOrParams;
  const overtimeAmount = isObj ? hoursOrParams.overtimeAmount : (overtimeAmountArg ?? 0);
  const overtimeRate = isObj ? hoursOrParams.overtimeRate : overtimeRateArg;
  const visibilityConfig = isObj ? hoursOrParams.visibility : visibilityConfigArg;
  const extraDetails = isObj
    ? {
        divisorUsed: hoursOrParams.divisorUsed,
        dailyPaidHours: hoursOrParams.dailyPaidHours ?? hoursOrParams.shiftHours,
        multiplierApplied: hoursOrParams.multiplierApplied,
        wageBaseMode: hoursOrParams.wageBaseMode,
      }
    : extraDetailsArg;
  const hrs = toNum(overtimeHours);
  const amt = toNum(overtimeAmount);
  if (amt <= 0 && hrs <= 0) {
    return {
      visibleAsSeparateLine: false,
      visible: false,
      showHours: visibilityConfig?.showOtHoursOnPayslip !== false,
      showAmount: visibilityConfig?.showOtAmountOnPayslip !== false,
      showCalculationDetails: Boolean(visibilityConfig?.showOtCalculationDetailsOnPayslip),
      label: 'Overtime Earnings',
      amount: 0,
      foldedIntoAllowances: false,
    };
  }

  const showHours = visibilityConfig?.showOtHoursOnPayslip !== false;
  const showAmount = visibilityConfig?.showOtAmountOnPayslip !== false;
  const showDetails = Boolean(visibilityConfig?.showOtCalculationDetailsOnPayslip);

  const effectiveRate = toNum(overtimeRate) > 0
    ? toNum(overtimeRate)
    : (hrs > 0 ? Math.round((amt / hrs) * 100) / 100 : 0);

  const hoursText = showHours && hrs > 0 ? `${hrs} hrs` : undefined;
  const calculationDetailsText = showDetails && hrs > 0
    ? [
        `${hrs} hrs × ₹${effectiveRate}/hr`,
        extraDetails?.divisorUsed ? `Divisor: ${extraDetails.divisorUsed}d` : '',
        extraDetails?.dailyPaidHours ? `Shift: ${extraDetails.dailyPaidHours}h` : '',
        extraDetails?.multiplierApplied && extraDetails.multiplierApplied !== 1 ? `${extraDetails.multiplierApplied}x` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;

  if (!showAmount) {
    // Do NOT alter actual gross/net earnings; fold the amount into allowances display line
    return {
      visibleAsSeparateLine: false,
      visible: showHours,
      showHours,
      showAmount: false,
      showCalculationDetails: showDetails,
      label: 'Variable Shift / Production Allowance',
      amount: amt,
      hoursText,
      calculationDetailsText,
      description: calculationDetailsText,
      foldedIntoAllowances: true,
    };
  }

  const label = hoursText ? `Overtime Earnings (${hoursText})` : 'Overtime Earnings';

  return {
    visibleAsSeparateLine: true,
    visible: true,
    showHours,
    showAmount: true,
    showCalculationDetails: showDetails,
    label,
    amount: amt,
    hoursText,
    calculationDetailsText,
    description: calculationDetailsText,
    foldedIntoAllowances: false,
  };
};

// ========================================================
// 7. PAYSLIP PRIVACY & DEDUCTIONS FORMATTER
// ========================================================
export interface PayslipDeductionLineItem {
  label: string;
  amount: number;
  category: 'STATUTORY' | 'LOAN' | 'INTERNAL_PENALTY' | 'GENERIC_OTHER';
  isConfidential: boolean;
  internalReason?: string;
}

/**
 * Formats deductions for payslips strictly respecting the role & confidentiality settings.
 * - For Employee role: confidential policies are collapsed into generic 'OTHERS' (or custom generic label).
 * - For HR / CEO role: complete internal deduction reasons and policy names are clearly presented.
 */
export const formatPayslipDeductionsForViewer = (
  calc: FullPayrollCalculationResult,
  viewerRole: 'CEO' | 'HR' | 'HR Admin' | 'Super Admin' | 'Employee' | string,
  loanPolicy?: { payslipVisibility?: 'DETAILED' | 'GENERIC' }
): PayslipDeductionLineItem[] => {
  const isPrivileged = viewerRole === 'CEO' || viewerRole === 'HR' || viewerRole === 'HR Admin' || viewerRole === 'Super Admin';
  const items: PayslipDeductionLineItem[] = [];

  // Statutory lines (always visible)
  if (calc.epfDeduction > 0) {
    items.push({
      label: 'EPF Employee Contribution (12%)',
      amount: calc.epfDeduction,
      category: 'STATUTORY',
      isConfidential: false
    });
  }

  if (calc.esiDeduction > 0) {
    items.push({
      label: 'ESI Contribution',
      amount: calc.esiDeduction,
      category: 'STATUTORY',
      isConfidential: false
    });
  }

  if (calc.professionalTax > 0) {
    items.push({
      label: 'Professional Tax (PT)',
      amount: calc.professionalTax,
      category: 'STATUTORY',
      isConfidential: false
    });
  }

  if (calc.advanceDeduction > 0) {
    const isGeneric = loanPolicy?.payslipVisibility === 'GENERIC' && !isPrivileged;
    items.push({
      label: isGeneric ? 'OTHERS' : 'Employee Loan Recovery',
      amount: calc.advanceDeduction,
      category: 'LOAN',
      isConfidential: isGeneric
    });
  }

  // Internal attendance & leave deductions
  let genericOtherTotal = 0;

  // 1. Late Attendance Deduction
  if (calc.lateAttendanceDeduction > 0) {
    if (isPrivileged) {
      items.push({
        label: `Late Attendance Deduction (${calc.lateDetails.lateCount} Late Entries)`,
        amount: calc.lateAttendanceDeduction,
        category: 'INTERNAL_PENALTY',
        isConfidential: true,
        internalReason: calc.lateDetails.ruleApplied
      });
    } else {
      if (calc.lateDetails.isConfidential) {
        genericOtherTotal += calc.lateAttendanceDeduction;
      } else {
        items.push({
          label: 'Attendance Deduction',
          amount: calc.lateAttendanceDeduction,
          category: 'INTERNAL_PENALTY',
          isConfidential: false
        });
      }
    }
  }

  // 2. Unpaid Leave & Sandwich Leave Deductions
  const sandwichDeduct = toNum(calc.sandwichDeduction || calc.leaveDetails?.sandwichDeduction || 0);
  const remainingUnpaidDeduct = Math.max(0, calc.unpaidLeaveDeduction - sandwichDeduct);

  // Sandwich Leave Deduction item
  if (sandwichDeduct > 0) {
    if (isPrivileged) {
      items.push({
        label: `Sandwich Leave Deduction`,
        amount: sandwichDeduct,
        category: 'INTERNAL_PENALTY',
        isConfidential: true,
        internalReason: 'Sandwich Leave'
      });
    } else {
      if (calc.leaveDetails.isConfidential) {
        genericOtherTotal += sandwichDeduct;
      } else {
        items.push({
          label: 'Sandwich Leave Deduction',
          amount: sandwichDeduct,
          category: 'INTERNAL_PENALTY',
          isConfidential: false
        });
      }
    }
  }

  // Other Unpaid Leave Days (if any beyond sandwich)
  if (remainingUnpaidDeduct > 0) {
    if (isPrivileged) {
      items.push({
        label: `Unpaid Leave Penalty (${calc.leaveDetails.excessUnpaidDays} Days Beyond Quota)`,
        amount: remainingUnpaidDeduct,
        category: 'INTERNAL_PENALTY',
        isConfidential: true,
        internalReason: calc.leaveDetails.ruleApplied
      });
    } else {
      if (calc.leaveDetails.isConfidential) {
        genericOtherTotal += remainingUnpaidDeduct;
      } else {
        items.push({
          label: 'Leave Deduction',
          amount: remainingUnpaidDeduct,
          category: 'INTERNAL_PENALTY',
          isConfidential: false
        });
      }
    }
  }

  // If there are confidential deductions collapsed for employees, add the generic line
  if (!isPrivileged && genericOtherTotal > 0) {
    const label = calc.lateDetails.genericCategoryLabel || calc.leaveDetails.genericCategoryLabel || 'OTHERS';
    items.push({
      label,
      amount: genericOtherTotal,
      category: 'GENERIC_OTHER',
      isConfidential: false
    });
  }

  return items;
};
